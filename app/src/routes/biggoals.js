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
const { tx } = require('../db');
const log = require('../log');

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00Z').getTime());
}

// 惰性释放：planned 且到日期的 → released，保持「released 且未完成」至多 2 个（首页露 1–2 个）
async function releaseChain(db, bigGoalId, ownerId) {
  const cur = await db.get(
    "SELECT COUNT(*) AS c FROM goals WHERE big_goal_id = ? AND owner_id = ? AND plan_status = 'released' AND status IN ('draft','active','reviewing')",
    [bigGoalId, ownerId]
  );
  let slots = Math.max(0, 2 - Number(cur.c));
  if (!slots) return;
  const due = await db.all(
    `SELECT g.id FROM goals AS g WHERE g.big_goal_id = ? AND g.owner_id = ? AND g.plan_status = 'planned'
       AND g.status IN ('draft','active')
       AND EXISTS (SELECT 1 FROM big_goals AS bg WHERE bg.id=g.big_goal_id AND bg.status='active')
       AND g.planned_date IS NOT NULL AND g.planned_date <= ?
       AND (g.prerequisite_goal_id IS NULL OR EXISTS (
         SELECT 1 FROM goals AS prior
         WHERE prior.id=g.prerequisite_goal_id AND prior.owner_id=g.owner_id AND prior.status='achieved'
       ))
     ORDER BY COALESCE(g.plan_order, 999999), g.planned_date, g.id`,
    [bigGoalId, ownerId, todayStr()]
  );
  for (const g of due) {
    if (slots <= 0) break;
    await db.run("UPDATE goals SET plan_status='released', updated_at=? WHERE id=? AND status IN ('draft','active') AND plan_status='planned'", [nowIso(), g.id]);
    slots -= 1;
  }
}

// 链的展示形态（含未启动的全部）
async function chainOf(db, bigGoalId, ownerId) {
  return db.all(
    `SELECT g.id, g.title, g.emoji, g.description, g.status, g.accept_criteria, g.est_total_min, g.difficulty,
            g.planned_date, g.plan_order, g.plan_status, g.start_date, g.end_date, g.streak_count, g.updated_at,
            (g.prerequisite_goal_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM goals AS prior
              WHERE prior.id=g.prerequisite_goal_id AND prior.owner_id=g.owner_id AND prior.status='achieved'
            )) AS prerequisite_pending
     FROM goals AS g WHERE g.big_goal_id = ? AND g.owner_id = ? AND g.status != 'archived'
     ORDER BY COALESCE(g.plan_order, 999999), COALESCE(g.planned_date, '9999-12-31'), g.id`,
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
  const EDITABLE = (req, res, next) => {
    if (req.bigGoal.status === 'abandoned' || req.bigGoal.status === 'archived') {
      return res.status(409).json({ error: '已放弃或删除的大目标不能修改' });
    }
    next();
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
      if (req.bigGoal.status === 'archived') return res.status(404).json({ error: '大目标不存在' });
      await releaseChain(db, req.bigGoal.id, req.user.id);
      const bg = await db.get('SELECT * FROM big_goals WHERE id = ?', [req.bigGoal.id]);
      const chain = await chainOf(db, req.bigGoal.id, req.user.id);
      const done = chain.filter((g) => g.status === 'achieved').length;
      res.json({ bigGoal: bg, chain, done, total: chain.length });
    } catch (e) { next(e); }
  });

  r.post('/biggoals/:id/abandon', mw.requireUser, OWN, async (req, res, next) => {
    try {
      const result = await tx(db, async (c) => {
        const goal = await c.get('SELECT status FROM big_goals WHERE id=? AND owner_id=? FOR UPDATE', [req.bigGoal.id, req.user.id]);
        if (goal.status === 'abandoned') return 'ok';
        if (goal.status !== 'active') return 'invalid';
        const children = await c.all(
          "SELECT id,status FROM goals WHERE big_goal_id=? AND owner_id=? AND status IN ('draft','active','reviewing') ORDER BY id FOR UPDATE",
          [req.bigGoal.id, req.user.id]
        );
        if (children.some((g) => g.status === 'reviewing')) return 'reviewing';
        const now = nowIso();
        await c.run("UPDATE goals SET status='abandoned', updated_at=? WHERE big_goal_id=? AND owner_id=? AND status IN ('draft','active')",
          [now, req.bigGoal.id, req.user.id]);
        await c.run("UPDATE big_goals SET status='abandoned', updated_at=? WHERE id=?", [now, req.bigGoal.id]);
        await snapshotPlan(c, req.bigGoal.id, 'user', 'abandon');
        return 'ok';
      });
      if (result === 'reviewing') return res.status(409).json({ error: '请先撤回或完成待验收的小目标' });
      if (result !== 'ok') return res.status(409).json({ error: '当前状态不能放弃' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.delete('/biggoals/:id', mw.requireUser, OWN, async (req, res, next) => {
    try {
      if (req.bigGoal.status === 'archived') return res.json({ ok: true });
      const update = await db.run("UPDATE big_goals SET status='archived', updated_at=? WHERE id=? AND owner_id=? AND status='abandoned'",
        [nowIso(), req.bigGoal.id, req.user.id]);
      if (!update.changes) return res.status(409).json({ error: '请先放弃大目标再删除' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 改大目标（标题/图标/描述/状态）
  r.patch('/biggoals/:id', mw.requireUser, OWN, EDITABLE, async (req, res, next) => {
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
        if (!['active', 'done'].includes(b.status)) return res.status(400).json({ error: '请通过放弃或删除操作更改状态' });
        const update = await db.run("UPDATE big_goals SET status=?, updated_at=? WHERE id=? AND status IN ('active','done')", [b.status, nowIso(), req.bigGoal.id]);
        if (!update.changes) return res.status(409).json({ error: '大目标状态已变化' });
      }
      const bg = await db.get('SELECT * FROM big_goals WHERE id = ?', [req.bigGoal.id]);
      res.json({ bigGoal: bg });
    } catch (e) { next(e); }
  });

  // 绑已有小目标到链上（goal 必须是自己的 stage 目标）
  r.post('/biggoals/:id/goals', mw.requireUser, OWN, EDITABLE, async (req, res, next) => {
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
      const updated = await tx(db, async (c) => {
        const parent = await c.get("SELECT id FROM big_goals WHERE id=? AND status IN ('active','done') FOR UPDATE", [req.bigGoal.id]);
        if (!parent) return null;
        const bound = await c.run(
          "UPDATE goals SET big_goal_id=?, planned_date=?, plan_order=?, plan_status='planned', updated_at=? WHERE id=? AND status NOT IN ('abandoned','archived') AND (big_goal_id IS NULL OR big_goal_id=?)",
          [req.bigGoal.id, planned, order, nowIso(), goal.id, req.bigGoal.id]
        );
        if (!bound.changes) return null;
        await snapshotPlan(c, req.bigGoal.id, 'user', `bind:${goal.title}`);
        return c.get('SELECT * FROM goals WHERE id = ?', [goal.id]);
      });
      if (!updated) return res.status(409).json({ error: '目标状态已变化，请刷新后再试' });
      res.json({ goal: updated });
    } catch (e) { next(e); }
  });

  // 手改链上小目标（日期/内容/顺序）。手改优先：AI 重排默认不动手改过的（重排只处理 planned）
  r.patch('/biggoals/:id/goals/:goalId', mw.requireUser, OWN, EDITABLE, async (req, res, next) => {
    try {
      const goal = await db.get(
        'SELECT * FROM goals WHERE id = ? AND owner_id = ? AND big_goal_id = ?',
        [Number(req.params.goalId) || 0, req.user.id, req.bigGoal.id]
      );
      if (!goal) return res.status(404).json({ error: '链上没有这个目标' });
      if (['achieved','abandoned','archived'].includes(goal.status)) {
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
  r.post('/biggoals/:id/shift', mw.requireUser, OWN, EDITABLE, async (req, res, next) => {
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
  r.post('/biggoals/:id/reorder', mw.requireUser, OWN, EDITABLE, async (req, res, next) => {
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
        if (goal.plan_status !== 'planned' || ['achieved','abandoned','archived'].includes(goal.status)) continue;
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
  r.delete('/biggoals/:id/goals/:goalId', mw.requireUser, OWN, EDITABLE, async (req, res, next) => {
    try {
      const goal = await db.get(
        'SELECT * FROM goals WHERE id = ? AND owner_id = ? AND big_goal_id = ?',
        [Number(req.params.goalId) || 0, req.user.id, req.bigGoal.id]
      );
      if (!goal) return res.status(404).json({ error: '链上没有这个目标' });
      if (goal.plan_status !== 'planned') return res.status(400).json({ error: '已释放/已达成的小目标不能解绑' });
      const update = await db.run(
        `UPDATE goals AS g SET big_goal_id=NULL, planned_date=NULL, plan_order=NULL, plan_status=NULL,
           prerequisite_goal_id=NULL, updated_at=? WHERE g.id=? AND g.plan_status='planned'
         AND NOT EXISTS (SELECT 1 FROM goals AS next WHERE next.prerequisite_goal_id=g.id
           AND next.owner_id=g.owner_id AND next.status IN ('draft', 'active', 'reviewing'))`,
        [nowIso(), goal.id]
      );
      if (!update.changes) return res.status(409).json({ error: '目标状态已变化，或仍有后续步骤依赖它。请刷新或先移出后续步骤' });
      await snapshotPlan(db, req.bigGoal.id, 'user', `unbind:${goal.title}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
}

module.exports = bigGoalsRoutes;
// 供验收通过路由联动释放下一个（goals.js approve）
bigGoalsRoutes.releaseChain = releaseChain;
