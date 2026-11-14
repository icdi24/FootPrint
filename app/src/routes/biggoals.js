// 大目标与计划链（P1-#6）：CRUD、小目标绑定、手改、整体顺延/提前、调序、解绑。
// 规则（待办计划 1.2）：
//  - 未启动（plan_status='planned'）不进统计、不进「我们」页、不在首页
//  - 手改与 AI 重排走同一套链路：写库 → plan_versions 快照（source 标 user/ai）
//  - 重排/调序只碰 planned 的；released/achieved 锁死
//  - 首页只露当前该做的 1–2 个：惰性释放保持至多 2 个 released 未完成
const express = require('express');
const { nowIso, todayStr } = require('../tz');
const { makeMiddleware } = require('../middleware');
const { IMPLEMENTATIONS, snapshotPlan } = require('../agent/tools');
const ai = require('../ai');
const log = require('../log');

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00Z').getTime());
}

// 惰性释放：planned 且到日期的 → released，保持「released 且未完成」至多 2 个（首页露 1–2 个）
async function releaseChain(db, bigGoalId, ownerId) {
  const cur = await db.get(
    "SELECT COUNT(*) AS c FROM goals WHERE big_goal_id = ? AND owner_id = ? AND plan_status = 'released' AND status NOT IN ('achieved','abandoned')",
    [bigGoalId, ownerId]
  );
  let slots = Math.max(0, 2 - Number(cur.c));
  if (!slots) return;
  const due = await db.all(
    `SELECT id FROM goals WHERE big_goal_id = ? AND owner_id = ? AND plan_status = 'planned'
       AND planned_date IS NOT NULL AND planned_date <= ?
     ORDER BY COALESCE(plan_order, 999999), planned_date, id`,
    [bigGoalId, ownerId, todayStr()]
  );
  for (const g of due) {
    if (slots <= 0) break;
    await db.run("UPDATE goals SET plan_status = 'released', updated_at = ? WHERE id = ?", [nowIso(), g.id]);
    slots -= 1;
  }
}

// 链的展示形态（含未启动的全部）
async function chainOf(db, bigGoalId, ownerId) {
  return db.all(
    `SELECT id, title, emoji, description, status, accept_criteria, est_total_min, difficulty,
            planned_date, plan_order, plan_status, start_date, end_date, streak_count, updated_at
     FROM goals WHERE big_goal_id = ? AND owner_id = ? AND status != 'archived'
     ORDER BY COALESCE(plan_order, 999999), COALESCE(planned_date, '9999-12-31'), id`,
    [bigGoalId, ownerId]
  );
}

function bigGoalsRoutes(db) {
  const r = express.Router();
  const mw = makeMiddleware(db);

  const OWN = async (req, res, next) => {
    try {
      const bg = await db.get('SELECT * FROM big_goals WHERE id = ?', [Number(req.params.id) || 0]);
      if (!bg || bg.owner_id !== req.user.id) return res.status(404).json({ error: '大目标不存在' });
      req.bigGoal = bg;
      next();
    } catch (e) { next(e); }
  };

  // 创建大目标
  r.post('/biggoals', mw.requireUser, async (req, res, next) => {
    try {
      const b = req.body || {};
      const title = String(b.title || '').trim();
      if (!title || title.length > 40) return res.status(400).json({ error: '名称需为 1–40 字' });
      const info = await db.run(
        "INSERT INTO big_goals (owner_id, title, emoji, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        [req.user.id, title, String(b.emoji || '🏔️').slice(0, 8), String(b.description || '').trim().slice(0, 500), nowIso(), nowIso()]
      );
      const bg = await db.get('SELECT * FROM big_goals WHERE id = ?', [Number(info.id)]);
      log.log('biggoal_create', `${req.user.nickname} 建大目标「${title}」`);
      res.json({ bigGoal: bg });
    } catch (e) { next(e); }
  });

  // 大目标列表（自己的）
  r.get('/biggoals', mw.requireUser, async (req, res, next) => {
    try {
      const rows = await db.all(
        "SELECT * FROM big_goals WHERE owner_id = ? AND status != 'archived' ORDER BY id DESC",
        [req.user.id]
      );
      const out = [];
      for (const bg of rows) {
        const cnt = await db.get(
          "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'achieved') AS done FROM goals WHERE big_goal_id = ? AND owner_id = ? AND status != 'archived'",
          [bg.id, req.user.id]
        );
        out.push({ ...bg, done: Number(cnt.done), total: Number(cnt.total) });
      }
      res.json({ bigGoals: out });
    } catch (e) { next(e); }
  });

  // 大目标详情：整条路线（含未启动）+ 客观计数；顺带惰性释放
  r.get('/biggoals/:id', mw.requireUser, OWN, async (req, res, next) => {
    try {
      await releaseChain(db, req.bigGoal.id, req.user.id);
      const bg = await db.get('SELECT * FROM big_goals WHERE id = ?', [req.bigGoal.id]);
      const chain = await chainOf(db, req.bigGoal.id, req.user.id);
      const done = chain.filter((g) => g.status === 'achieved').length;
      res.json({ bigGoal: bg, chain, done, total: chain.length });
    } catch (e) { next(e); }
  });

  // 改大目标（标题/图标/描述/状态）
  r.patch('/biggoals/:id', mw.requireUser, OWN, async (req, res, next) => {
    try {
      const b = req.body || {};
      if (b.title !== undefined) {
        const title = String(b.title).trim();
        if (!title || title.length > 40) return res.status(400).json({ error: '名称需为 1–40 字' });
        await db.run('UPDATE big_goals SET title = ?, updated_at = ? WHERE id = ?', [title, nowIso(), req.bigGoal.id]);
      }
      if (b.emoji !== undefined) {
        await db.run('UPDATE big_goals SET emoji = ?, updated_at = ? WHERE id = ?', [String(b.emoji).slice(0, 8), nowIso(), req.bigGoal.id]);
      }
      if (b.description !== undefined) {
        if (String(b.description).length > 500) return res.status(400).json({ error: '描述不能超过 500 字' });
        await db.run('UPDATE big_goals SET description = ?, updated_at = ? WHERE id = ?', [String(b.description).trim(), nowIso(), req.bigGoal.id]);
      }
      if (b.status !== undefined) {
        if (!['active', 'done', 'archived'].includes(b.status)) return res.status(400).json({ error: 'status 不对' });
        await db.run('UPDATE big_goals SET status = ?, updated_at = ? WHERE id = ?', [b.status, nowIso(), req.bigGoal.id]);
      }
      const bg = await db.get('SELECT * FROM big_goals WHERE id = ?', [req.bigGoal.id]);
      res.json({ bigGoal: bg });
    } catch (e) { next(e); }
  });

  // 删除大目标（软删除：状态置 archived，保留记录；链上小目标一并归档）
  r.delete('/biggoals/:id', mw.requireUser, OWN, async (req, res, next) => {
    try {
      const now = nowIso();
      await db.run('UPDATE big_goals SET status = ?, updated_at = ? WHERE id = ?', ['archived', now, req.bigGoal.id]);
      // 链上还没达成的小目标一起归档，避免它们留在列表里没有归属
      await db.run(
        `UPDATE goals SET status = 'archived', updated_at = ?
         WHERE big_goal_id = ? AND owner_id = ? AND status != 'achieved'`,
        [now, req.bigGoal.id, req.user.id]
      );
      log.log('biggoal_delete', `${req.user.nickname} 删除大目标「${req.bigGoal.title}」`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 绑已有小目标到链上（goal 必须是自己的 stage 目标）
  r.post('/biggoals/:id/goals', mw.requireUser, OWN, async (req, res, next) => {
    try {
      const b = req.body || {};
      const goal = await db.get("SELECT * FROM goals WHERE id = ? AND owner_id = ?", [Number(b.goal_id) || 0, req.user.id]);
      if (!goal) return res.status(404).json({ error: '目标不存在' });
      if (goal.type !== 'stage') return res.status(400).json({ error: '只能把小目标挂到大目标上' });
      if (goal.big_goal_id && goal.big_goal_id !== req.bigGoal.id) {
        return res.status(400).json({ error: '这个小目标已挂在别的大目标上，先解绑' });
      }
      const planned = b.planned_date || goal.planned_date || todayStr();
      if (!isValidDate(planned)) return res.status(400).json({ error: '日期格式不对' });
      let order = Number(b.plan_order);
      if (!Number.isInteger(order)) {
        const m = await db.get('SELECT COALESCE(MAX(plan_order), 0) AS m FROM goals WHERE big_goal_id = ?', [req.bigGoal.id]);
        order = Number(m.m) + 1;
      }
      await db.run(
        "UPDATE goals SET big_goal_id = ?, planned_date = ?, plan_order = ?, plan_status = 'planned', updated_at = ? WHERE id = ?",
        [req.bigGoal.id, planned, order, nowIso(), goal.id]
      );
      await snapshotPlan(db, req.bigGoal.id, 'user', `bind:${goal.title}`);
      const updated = await db.get('SELECT * FROM goals WHERE id = ?', [goal.id]);
      res.json({ goal: updated });
    } catch (e) { next(e); }
  });

  // 手改链上小目标（日期/内容/顺序）。手改优先：AI 重排默认不动手改过的（重排只处理 planned）
  r.patch('/biggoals/:id/goals/:goalId', mw.requireUser, OWN, async (req, res, next) => {
    try {
      const goal = await db.get(
        'SELECT * FROM goals WHERE id = ? AND owner_id = ? AND big_goal_id = ?',
        [Number(req.params.goalId) || 0, req.user.id, req.bigGoal.id]
      );
      if (!goal) return res.status(404).json({ error: '链上没有这个目标' });
      if (goal.status === 'achieved' || goal.status === 'abandoned') {
        return res.status(400).json({ error: '已达成/已放弃的小目标锁死，不能改' });
      }
      const b = req.body || {};
      if (b.planned_date !== undefined) {
        if (!isValidDate(b.planned_date)) return res.status(400).json({ error: '日期格式不对' });
        await db.run('UPDATE goals SET planned_date = ?, updated_at = ? WHERE id = ?', [b.planned_date, nowIso(), goal.id]);
      }
      if (b.title !== undefined) {
        const title = String(b.title).trim();
        if (!title || title.length > 30) return res.status(400).json({ error: '名称需为 1–30 字' });
        await db.run('UPDATE goals SET title = ?, updated_at = ? WHERE id = ?', [title, nowIso(), goal.id]);
      }
      if (b.description !== undefined) {
        if (String(b.description).length > 200) return res.status(400).json({ error: '描述不能超过 200 字' });
        await db.run('UPDATE goals SET description = ?, updated_at = ? WHERE id = ?', [String(b.description).trim(), nowIso(), goal.id]);
      }
      if (b.accept_criteria !== undefined) {
        if (String(b.accept_criteria).length > 500) return res.status(400).json({ error: '验收标准不能超过 500 字' });
        await db.run('UPDATE goals SET accept_criteria = ?, updated_at = ? WHERE id = ?', [String(b.accept_criteria).trim(), nowIso(), goal.id]);
      }
      if (b.plan_order !== undefined) {
        const o = Number(b.plan_order);
        if (!Number.isInteger(o) || o < 1) return res.status(400).json({ error: '顺序需为正整数' });
        await db.run('UPDATE goals SET plan_order = ?, updated_at = ? WHERE id = ?', [o, nowIso(), goal.id]);
      }
      await snapshotPlan(db, req.bigGoal.id, 'user', `edit_goal:${goal.id}`);
      const updated = await db.get('SELECT * FROM goals WHERE id = ?', [goal.id]);
      res.json({ goal: updated });
    } catch (e) { next(e); }
  });

  // 整体顺延/提前：复用 agent 工具里的同一实现（手改与 AI 重排同一套链路）
  r.post('/biggoals/:id/shift', mw.requireUser, OWN, async (req, res, next) => {
    try {
      const b = req.body || {};
      const impl = IMPLEMENTATIONS.shift_plan_dates;
      const result = await impl.run({ db, userId: req.user.id }, {
        big_goal_id: req.bigGoal.id, from_date: b.from_date, days: b.days,
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      log.log('plan_shift', `${req.user.nickname} 挪动大目标 ${req.bigGoal.id} 的计划：${result.moved} 项 ${result.days} 天`);
      res.json(result);
    } catch (e) { next(e); }
  });

  // 调序：只动 planned 的
  r.post('/biggoals/:id/reorder', mw.requireUser, OWN, async (req, res, next) => {
    try {
      const orders = Array.isArray(req.body && req.body.orders) ? req.body.orders : [];
      if (!orders.length || orders.length > 50) return res.status(400).json({ error: 'orders 需为 1–50 项' });
      let moved = 0;
      for (const o of orders) {
        const goal = await db.get(
          "SELECT id, plan_status, status FROM goals WHERE id = ? AND owner_id = ? AND big_goal_id = ?",
          [Number(o.goal_id) || 0, req.user.id, req.bigGoal.id]
        );
        if (!goal) continue;
        if (goal.plan_status !== 'planned' || goal.status === 'achieved' || goal.status === 'abandoned') continue; // 锁死
        const ord = Number(o.plan_order);
        if (!Number.isInteger(ord) || ord < 1) continue;
        await db.run('UPDATE goals SET plan_order = ?, updated_at = ? WHERE id = ?', [ord, nowIso(), goal.id]);
        moved += 1;
      }
      if (moved) await snapshotPlan(db, req.bigGoal.id, 'user', `reorder:${moved}`);
      res.json({ ok: true, moved });
    } catch (e) { next(e); }
  });

  // 解绑（只允许未启动的；目标本身不删）
  r.delete('/biggoals/:id/goals/:goalId', mw.requireUser, OWN, async (req, res, next) => {
    try {
      const goal = await db.get(
        'SELECT * FROM goals WHERE id = ? AND owner_id = ? AND big_goal_id = ?',
        [Number(req.params.goalId) || 0, req.user.id, req.bigGoal.id]
      );
      if (!goal) return res.status(404).json({ error: '链上没有这个目标' });
      if (goal.plan_status !== 'planned') return res.status(400).json({ error: '已释放/已达成的小目标不能解绑' });
      await db.run(
        'UPDATE goals SET big_goal_id = NULL, planned_date = NULL, plan_order = NULL, plan_status = NULL, updated_at = ? WHERE id = ?',
        [nowIso(), goal.id]
      );
      await snapshotPlan(db, req.bigGoal.id, 'user', `unbind:${goal.title}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
}

module.exports = bigGoalsRoutes;
// 供验收通过路由联动释放下一个（goals.js approve）
bigGoalsRoutes.releaseChain = releaseChain;

function aiAvailable() {
  return ai.aiAvailable();
}
