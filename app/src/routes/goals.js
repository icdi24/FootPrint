// 目标 CRUD、周网格、打卡、撤销、驳回。
const express = require('express');
const { todayStr, nowIso, addDaysStr, isoWeekday, mondayOf, hhmm } = require('../tz');
const { getPoints, calcPoints, effectivePoints, hasCustomPoints, valueRatio } = require('../points');
const { computeStreak } = require('../streak');
const { ledgerAdd, balanceOf, tx } = require('../db');
const log = require('../log');

const FREQ_MODES = ['daily', 'weekly', 'weekdays'];

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00Z').getTime());
}

function isValidTime(s) {
  if (s === null || s === undefined || s === '') return true;
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// 该目标在 date 这天是否应打卡（daily/weekdays）
function dueOn(goal, date) {
  if (date < goal.start_date) return false;
  if (goal.end_date && date > goal.end_date) return false;
  if (goal.freq_mode === 'daily') return true;
  if (goal.freq_mode === 'weekdays') {
    const wd = new Set(String(goal.weekdays || '').split(',').map(Number).filter(Boolean));
    return wd.has(isoWeekday(date));
  }
  return false; // weekly 按周判定
}

function goalRow(goal, cfg) {
  const inWin = inWindowNow(goal);
  return {
    ...goal,
    perCheckinPoints: effectivePoints(goal, goal.duration_min, inWin, cfg),
    customPoints: hasCustomPoints(goal) ? Number(goal.custom_points) : null,
    ratio: hasCustomPoints(goal) ? null : Math.round(valueRatio(goal, cfg) * 100) / 100,
    nextMilestone: nextMilestoneFor(goal.streak_count, cfg),
  };
}

function nextMilestoneFor(streak, cfg) {
  for (const m of cfg.milestones) {
    if (Number(m.n) > streak) return { n: Number(m.n), p: Number(m.p), remaining: Number(m.n) - streak };
  }
  return null;
}

function inWindowNow(goal) {
  if (!goal.window_start || !goal.window_end) return false; // 无窗口
  const now = hhmm();
  return now >= goal.window_start && now < goal.window_end;
}

async function creditedDatesFor(db, goalId) {
  const rows = await db.all(
    `SELECT check_date FROM check_ins WHERE goal_id = ? AND status = 'credited'`,
    [goalId]
  );
  return new Set(rows.map((r) => r.check_date));
}

// 打卡后更新连续链与里程碑（在事务内调用）
async function updateStreakAndMilestones(db, goal, cfg, creditedDates) {
  const before = Number(goal.streak_count) || 0;
  const after = computeStreak(goal, creditedDates);
  const bonuses = [];
  if (after > before) {
    for (const m of cfg.milestones) {
      const n = Number(m.n);
      if (before < n && n <= after) {
        const dup = await db.get('SELECT 1 FROM goal_milestones WHERE goal_id = ? AND threshold = ?', [goal.id, n]);
        if (!dup) {
          await db.run('INSERT INTO goal_milestones (goal_id, threshold, awarded_at) VALUES (?, ?, ?)', [goal.id, n, nowIso()]);
          const led = await ledgerAdd(db, {
            userId: goal.owner_id,
            delta: Number(m.p),
            type: 'streak_bonus',
            refType: 'goal',
            refId: goal.id,
            note: `连续 ${n} 达成`,
          });
          bonuses.push({ n, points: Number(m.p), balanceAfter: led.balanceAfter });
        }
      }
    }
  }
  await db.run('UPDATE goals SET streak_count = ?, streak_best = GREATEST(streak_best, ?), updated_at = ? WHERE id = ?',
    [after, after, nowIso(), goal.id]);
  return { before, after, bonuses };
}

// 撤销/驳回后重算连续链；归零即清里程碑（重新排队）
async function recomputeStreakAfterRemoval(db, goalId) {
  const goal = await db.get('SELECT * FROM goals WHERE id = ?', [goalId]);
  if (!goal) return;
  const dates = await creditedDatesFor(db, goalId);
  const after = computeStreak(goal, dates);
  if (after === 0) {
    await db.run('DELETE FROM goal_milestones WHERE goal_id = ?', [goalId]);
  }
  await db.run('UPDATE goals SET streak_count = ?, streak_best = GREATEST(streak_best, ?), updated_at = ? WHERE id = ?',
    [after, after, nowIso(), goalId]);
}

function validateGoalBody(body, partial = false) {
  const errors = [];
  const b = body || {};
  if (!partial || b.title !== undefined) {
    if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 30) {
      errors.push('名称需为 1–30 字');
    }
  }
  if (b.description !== undefined && String(b.description).length > 200) errors.push('描述不能超过 200 字');
  if (b.freq_mode !== undefined && !FREQ_MODES.includes(b.freq_mode)) errors.push('频率类型不对');
  if (b.freq_mode === 'weekly' && b.freq_n !== undefined) {
    const n = Number(b.freq_n);
    if (!Number.isInteger(n) || n < 1 || n > 4) errors.push('每周次数需为 1–4');
  }
  if (b.freq_mode === 'weekdays' && (b.weekdays !== undefined || !partial)) {
    const arr = String(b.weekdays || '').split(',').map(Number).filter(Boolean);
    if (!arr.length || arr.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
      errors.push('需选择至少一个星期几');
    }
  }
  if (b.duration_min !== undefined) {
    const d = Number(b.duration_min);
    if (!Number.isInteger(d) || d < 1 || d > 1440) errors.push('单次时长需为 1–1440 分钟');
  }
  if (b.difficulty !== undefined) {
    const d = Number(b.difficulty);
    if (!Number.isInteger(d) || d < 1 || d > 5) errors.push('难度需为 1–5');
  }
  if (b.start_date !== undefined && !isValidDate(b.start_date)) errors.push('开始日期格式不对');
  if (b.end_date !== undefined && b.end_date !== null && b.end_date !== '') {
    if (!isValidDate(b.end_date)) errors.push('结束日期格式不对');
    else if (b.start_date && b.end_date < b.start_date) errors.push('结束日期不能早于开始日期');
  }
  if (!isValidTime(b.window_start)) errors.push('窗口开始时间格式不对（HH:MM）');
  if (!isValidTime(b.window_end)) errors.push('窗口结束时间格式不对（HH:MM）');
  if ((b.window_start && !b.window_end) || (!b.window_start && b.window_end)) {
    errors.push('打卡窗口需同时填开始与结束');
  }
  if (b.emoji !== undefined && String(b.emoji).length > 8) errors.push('图标太长了');
  // 自定义固定积分（null/'' = 用公式自动算）
  if (b.custom_points !== undefined && b.custom_points !== null && b.custom_points !== '') {
    const cp = Number(b.custom_points);
    if (!Number.isInteger(cp) || cp < 1 || cp > 9999) errors.push('自定义积分需为 1–9999 的整数');
  }
  // 小目标（stage）专属字段
  if (b.type === 'stage') {
    if (b.accept_criteria !== undefined && String(b.accept_criteria).length > 500) errors.push('验收标准不能超过 500 字');
    if (!partial && !(b.accept_criteria && String(b.accept_criteria).trim())) {
      errors.push('小目标必须写清验收标准');
    }
    if (b.est_total_min !== undefined) {
      const m = Number(b.est_total_min);
      if (!Number.isInteger(m) || m < 1 || m > 100000) errors.push('预估总时长需为 1–100000 分钟');
    }
  }
  return errors;
}

async function createGoal(db, ownerId, b, cfg) {
  const status = b.active === false ? 'draft' : 'active';
  const type = b.type === 'stage' ? 'stage' : 'daily';
  const difficulty = Number(b.difficulty) || 3;
  const estTotalMin = type === 'stage' ? (Number(b.est_total_min) || 600) : null;
  const customPoints = (b.custom_points !== undefined && b.custom_points !== null && b.custom_points !== '')
    ? Number(b.custom_points) : null;
  const autoTotal = type === 'stage'
    ? Math.min(Math.round(estTotalMin * cfg.unit * (cfg.difficulty[difficulty] || 1.5)), 1200)
    : null;
  const totalPoints = type === 'stage' ? (customPoints != null ? customPoints : autoTotal) : null;
  const info = await db.run(
    `INSERT INTO goals (owner_id, type, title, emoji, description, freq_mode, freq_n, weekdays,
      window_start, window_end, duration_min, difficulty, start_date, end_date, status,
      est_total_min, accept_criteria, total_points, custom_points, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [ownerId, type, b.title.trim(), b.emoji || '🎯', String(b.description || '').trim(),
      type === 'stage' ? 'daily' : (b.freq_mode || 'daily'), Number(b.freq_n) || 1,
      b.freq_mode === 'weekdays' ? String(b.weekdays) : '',
      type === 'stage' ? null : (b.window_start || null), type === 'stage' ? null : (b.window_end || null),
      Number(b.duration_min) || 30, difficulty, b.start_date || todayStr(), b.end_date || null, status,
      estTotalMin, type === 'stage' ? String(b.accept_criteria || '').trim() : null,
      totalPoints, customPoints, nowIso(), nowIso()]
  );
  return Number(info.id);
}

module.exports = function goalsRoutes(db) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);

  // 分数预览
  r.post('/points/preview', mw.requireUser, async (req, res, next) => {
    try {
      const cfg = await getPoints(db);
      const b = req.body || {};
      const goal = {
        freq_mode: FREQ_MODES.includes(b.freq_mode) ? b.freq_mode : 'daily',
        freq_n: Number(b.freq_n) || 1,
        weekdays: b.weekdays || '',
        duration_min: Math.max(1, Math.min(1440, Number(b.duration_min) || 30)),
        difficulty: Math.max(1, Math.min(5, Number(b.difficulty) || 3)),
        window_start: b.window_start || null,
        window_end: b.window_end || null,
        custom_points: Number(b.custom_points) > 0 ? Number(b.custom_points) : null,
      };
      const inWin = inWindowNow(goal);
      res.json({
        points: effectivePoints(goal, goal.duration_min, inWin, cfg),
        ratio: hasCustomPoints(goal) ? null : Math.round(valueRatio(goal, cfg) * 100) / 100,
        inWindow: inWin,
      });
    } catch (e) { next(e); }
  });

  // 我的目标列表
  r.get('/goals', mw.requireUser, async (req, res, next) => {
    try {
      const cfg = await getPoints(db);
      const type = req.query.type;
      const typeFilter = type === 'daily' || type === 'stage' ? `AND g.type = '${type}'` : '';
      const rows = await db.all(
        `SELECT g.*, (g.prerequisite_goal_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM goals AS prior
           WHERE prior.id=g.prerequisite_goal_id AND prior.owner_id=g.owner_id AND prior.status='achieved'
         )) AS prerequisite_pending
         FROM goals AS g WHERE g.owner_id = ? AND g.status != 'archived' ${typeFilter}
         ORDER BY CASE g.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, g.id DESC`,
        [req.user.id]
      );
      const monthStart = todayStr().slice(0, 8) + '01';
      const monthCount = await db.all(
        `SELECT goal_id, COUNT(*) AS c FROM check_ins
         WHERE user_id = ? AND status = 'credited' AND check_date >= ? GROUP BY goal_id`,
        [req.user.id, monthStart]
      );
      const countMap = new Map(monthCount.map((x) => [x.goal_id, Number(x.c)]));
      res.json({
        goals: rows.map((g) => ({ ...goalRow(g, cfg), monthCount: countMap.get(g.id) || 0 })),
      });
    } catch (e) { next(e); }
  });

  // 周网格（参考 UI 示例的核心视图）
  r.get('/goals/week', mw.requireUser, async (req, res, next) => {
    try {
      const cfg = await getPoints(db);
      let start = req.query.start;
      if (!isValidDate(start)) start = mondayOf(todayStr());
      start = mondayOf(start);
      const today = todayStr();
      const rows = await db.all(
        `SELECT * FROM goals WHERE owner_id = ? AND type = 'daily' AND status IN ('active','achieved','abandoned')
         ORDER BY id DESC`,
        [req.user.id]
      );
      let weekPoints = 0;
      let weekDone = 0;
      let weekExpected = 0;
      const goals = [];
      for (const g of rows) {
        const cells = [];
        let gDone = 0;
        for (let i = 0; i < 7; i++) {
          const date = addDaysStr(start, i);
          const ci = await db.get(
            `SELECT * FROM check_ins WHERE goal_id = ? AND check_date = ? AND status = 'credited'`,
            [g.id, date]
          );
          let state;
          if (ci) {
            state = 'done';
            gDone += 1;
          } else if (date > today) {
            state = 'future';
          } else if (!dueOn(g, date)) {
            state = g.freq_mode === 'weekly' ? 'blank' : 'off';
          } else if (date < today) {
            state = 'missed';
          } else {
            state = 'todo';
          }
          cells.push({ date, wd: isoWeekday(date), state, points: ci ? Number(ci.points) : 0, makeup: ci ? !!ci.is_makeup : false });
        }
        const doneCount = cells.filter((c) => c.state === 'done').length;
        const expected = g.freq_mode === 'weekly' ? Number(g.freq_n) || 1 : cells.filter((c) => c.state !== 'off' && c.state !== 'blank' && c.state !== 'future').length;
        weekPoints += cells.reduce((s, c) => s + (c.points || 0), 0);
        weekDone += doneCount;
        weekExpected += expected;
        const weeklyProgress = g.freq_mode === 'weekly'
          ? { done: cells.filter((c) => c.state === 'done').length, need: Number(g.freq_n) || 1 }
          : null;
        goals.push({
          id: g.id,
          title: g.title,
          emoji: g.emoji,
          status: g.status,
          type: g.type,
          freq_mode: g.freq_mode,
          freq_n: g.freq_n,
          weekdays: g.weekdays,
          perCheckinPoints: effectivePoints(g, g.duration_min, inWindowNow(g), cfg),
          custom_points: g.custom_points,
          streak: g.streak_count,
          weeklyProgress,
          cells,
        });
      }
      res.json({ weekStart: start, weekEnd: addDaysStr(start, 6), today, weekPoints, weekDone, weekExpected, goals });
    } catch (e) { next(e); }
  });

  // 月视图：整月逐日格子
  r.get('/goals/month', mw.requireUser, async (req, res, next) => {
    try {
      const cfg = await getPoints(db);
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : todayStr().slice(0, 7);
      const today = todayStr();
      const rows = await db.all(
        `SELECT * FROM goals WHERE owner_id = ? AND type = 'daily' AND status IN ('active','achieved','abandoned')
         ORDER BY id DESC`,
        [req.user.id]
      );
      let monthPoints = 0;
      let monthDone = 0;
      let monthExpected = 0;
      const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
      const goals = [];
      for (const g of rows) {
        const cells = [];
        let gDone = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const date = `${month}-${String(d).padStart(2, '0')}`;
          const ci = await db.get(
            `SELECT * FROM check_ins WHERE goal_id = ? AND check_date = ? AND status = 'credited'`,
            [g.id, date]
          );
          let state;
          if (ci) {
            state = 'done';
            gDone += 1;
          } else if (date > today) {
            state = 'future';
          } else if (!dueOn(g, date)) {
            state = g.freq_mode === 'weekly' ? 'blank' : 'off';
          } else if (date < today) {
            state = 'missed';
          } else {
            state = 'todo';
          }
          cells.push({ date, state, points: ci ? Number(ci.points) : 0 });
        }
        const expected = g.freq_mode === 'weekly'
          ? Number(g.freq_n) || 1
          : cells.filter((c) => c.state !== 'off' && c.state !== 'blank' && c.state !== 'future').length;
        monthPoints += cells.reduce((s, c) => s + (c.points || 0), 0);
        monthDone += gDone;
        monthExpected += expected;
        goals.push({
          id: g.id,
          title: g.title,
          emoji: g.emoji,
          status: g.status,
          type: g.type,
          perCheckinPoints: effectivePoints(g, g.duration_min, inWindowNow(g), cfg),
          custom_points: g.custom_points,
          streak: g.streak_count,
          monthCount: gDone,
          monthPoints: cells.reduce((s, c) => s + (c.points || 0), 0),
          cells,
        });
      }
      res.json({ month, today, monthPoints, monthDone, monthExpected, goals });
    } catch (e) { next(e); }
  });

  // 创建目标
  r.post('/goals', mw.requireUser, async (req, res, next) => {
    try {
      const errors = validateGoalBody(req.body);
      if (errors.length) return res.status(400).json({ error: errors[0] });
      const cfg = await getPoints(db);
      const goalId = await createGoal(db, req.user.id, req.body, cfg);
      const goal = await db.get('SELECT * FROM goals WHERE id = ?', [goalId]);
      log.log('goal_create', `${req.user.nickname} 建目标「${goal.title}」(${goal.type})`);
      res.json({ goal: goalRow(goal, cfg) });
    } catch (e) { next(e); }
  });

  // 目标详情
  r.get('/goals/:id', mw.requireUser, mw.loadGoal, async (req, res, next) => {
    try {
      const cfg = await getPoints(db);
      const monthStart = todayStr().slice(0, 8) + '01';
      const month = await db.all(
        `SELECT * FROM check_ins WHERE goal_id = ? AND check_date >= ?
         ORDER BY check_date DESC, id DESC`,
        [req.goal.id, monthStart]
      );
      const prerequisite = req.goal.prerequisite_goal_id && await db.get(
        "SELECT id FROM goals WHERE id = ? AND owner_id = ? AND status = 'achieved'",
        [req.goal.prerequisite_goal_id, req.goal.owner_id]
      );
      const goal = { ...req.goal, prerequisite_pending: Boolean(req.goal.prerequisite_goal_id && !prerequisite) };
      res.json({ goal: goalRow(goal, cfg), monthCheckins: month });
    } catch (e) { next(e); }
  });

  // 编辑目标
  r.put('/goals/:id', mw.requireUser, mw.requireGoalOwner, async (req, res, next) => {
    try {
      const g = req.goal;
      if (['achieved', 'abandoned', 'archived'].includes(g.status)) {
        return res.status(400).json({ error: '该状态的目标不能编辑' });
      }
      const errors = validateGoalBody(req.body, true);
      if (errors.length) return res.status(400).json({ error: errors[0] });
      const b = req.body;
      const difficulty = b.difficulty !== undefined ? Number(b.difficulty) : g.difficulty;
      const duration = b.duration_min !== undefined ? Number(b.duration_min) : g.duration_min;
      // 自定义积分：显式传 null/'' = 清除（回到自动）
      let customPoints = g.custom_points;
      if (b.custom_points !== undefined) {
        customPoints = (b.custom_points === null || b.custom_points === '') ? null : Number(b.custom_points);
      }
      // 小目标：重算 total_points（自定义优先，否则按预估时长+难度）
      let totalPoints = g.total_points;
      if (g.type === 'stage') {
        const est = b.est_total_min !== undefined ? Number(b.est_total_min) : Number(g.est_total_min) || 600;
        const cfgNow = await getPoints(db);
        if (customPoints != null) {
          totalPoints = customPoints;
        } else if (b.est_total_min !== undefined || b.difficulty !== undefined) {
          totalPoints = Math.min(Math.round(est * cfgNow.unit * (cfgNow.difficulty[difficulty] || 1.5)), 1200);
        }
      }
      if ((difficulty !== g.difficulty || duration !== g.duration_min || customPoints !== g.custom_points) && g.status === 'active') {
        log.log('goal_change', `${req.user.nickname} 修改目标「${g.title}」积分相关字段`);
      }
      await db.run(
        `UPDATE goals SET title=?, emoji=?, description=?, freq_mode=?, freq_n=?, weekdays=?,
         window_start=?, window_end=?, duration_min=?, difficulty=?, start_date=?, end_date=?,
         custom_points=?, total_points=?, updated_at=? WHERE id=?`,
        [
          (b.title !== undefined ? String(b.title).trim() : g.title),
          (b.emoji !== undefined ? b.emoji : g.emoji),
          (b.description !== undefined ? String(b.description).trim() : g.description),
          (b.freq_mode !== undefined ? b.freq_mode : g.freq_mode),
          (b.freq_n !== undefined ? Number(b.freq_n) : g.freq_n),
          (b.freq_mode === 'weekdays' ? String(b.weekdays || g.weekdays || '') : b.freq_mode !== undefined ? '' : g.weekdays),
          (b.window_start !== undefined ? (b.window_start || null) : g.window_start),
          (b.window_end !== undefined ? (b.window_end || null) : g.window_end),
          duration,
          difficulty,
          (b.start_date !== undefined ? b.start_date : g.start_date),
          (b.end_date !== undefined ? (b.end_date || null) : g.end_date),
          customPoints,
          totalPoints,
          nowIso(),
          g.id,
        ]
      );
      const goal = await db.get('SELECT * FROM goals WHERE id = ?', [g.id]);
      res.json({ goal: goalRow(goal, await getPoints(db)) });
    } catch (e) { next(e); }
  });

  // 开始（草稿→进行中）
  r.post('/goals/:id/start', mw.requireUser, mw.requireGoalOwner, async (req, res, next) => {
    try {
      const update = await db.run(
        `UPDATE goals AS g SET status='active', updated_at=? WHERE g.id=? AND g.status='draft'
         AND (g.prerequisite_goal_id IS NULL OR EXISTS (
           SELECT 1 FROM goals AS prior
           WHERE prior.id=g.prerequisite_goal_id AND prior.owner_id=g.owner_id AND prior.status='achieved'
         ))`, [nowIso(), req.goal.id]
      );
      if (!update.changes) {
        if (req.goal.status === 'draft' && req.goal.prerequisite_goal_id) {
          return res.status(409).json({ error: '请先完成并通过前置小目标的验收' });
        }
        return res.status(400).json({ error: '只有草稿可以开始' });
      }
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 放弃（保留记录，不物理删除）
  r.post('/goals/:id/abandon', mw.requireUser, mw.requireGoalOwner, async (req, res, next) => {
    try {
      if (!['active', 'draft'].includes(req.goal.status)) return res.status(400).json({ error: '当前状态不能放弃' });
      const update = await db.run(
        `UPDATE goals AS g SET status='abandoned', updated_at=? WHERE g.id=? AND g.status IN ('active', 'draft')
         AND NOT EXISTS (SELECT 1 FROM goals AS next WHERE next.prerequisite_goal_id=g.id
           AND next.owner_id=g.owner_id AND next.status IN ('draft', 'active', 'reviewing'))`,
        [nowIso(), req.goal.id]
      );
      if (!update.changes) return res.status(409).json({ error: '目标状态已变化，或仍有后续步骤依赖它。请刷新或先处理后续步骤' });
      log.log('goal_abandon', `${req.user.nickname} 放弃目标「${req.goal.title}」`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.delete('/goals/:id', mw.requireUser, mw.requireGoalOwner, async (req, res, next) => {
    try {
      if (req.goal.status === 'archived') return res.json({ ok: true });
      const update = await db.run(
        "UPDATE goals SET status='archived', updated_at=? WHERE id=? AND owner_id=? AND status='abandoned'",
        [nowIso(), req.goal.id, req.user.id]
      );
      if (!update.changes) return res.status(409).json({ error: '请先放弃目标再删除' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 打卡（自评即入账）
  r.post('/goals/:id/checkin', mw.requireUser, mw.requireGoalOwner, async (req, res, next) => {
    try {
      const g = req.goal;
      if (g.status !== 'active') return res.status(400).json({ error: '只有进行中的目标能打卡' });
      if (g.type === 'stage') return res.status(400).json({ error: '小目标不能打卡，请提交验收' });
      const today = todayStr();
      const dup = await db.get(
        `SELECT * FROM check_ins WHERE goal_id = ? AND check_date = ? AND status = 'credited'`,
        [g.id, today]
      );
      if (dup) return res.status(409).json({ error: '今天已经打过卡了' });

      const b = req.body || {};
      let duration = Number(b.duration_min);
      if (!Number.isFinite(duration)) duration = Number(g.duration_min);
      duration = Math.max(1, Math.min(1440, Math.round(duration)));
      const evidenceText = String(b.evidence_text || '').trim().slice(0, 500);
      let evidenceId = null;
      if (b.evidence_id) {
        const up = await db.get('SELECT * FROM uploads WHERE id = ? AND user_id = ?', [Number(b.evidence_id), req.user.id]);
        if (!up) return res.status(400).json({ error: '证据图片无效' });
        evidenceId = Number(b.evidence_id);
      }

      const cfg = await getPoints(db);
      const inWin = inWindowNow(g);
      const points = effectivePoints(g, duration, inWin, cfg);

      const result = await tx(db, async (c) => {
        const active = await c.get("SELECT id FROM goals WHERE id=? AND status='active' FOR UPDATE", [g.id]);
        if (!active) return null;
        const duplicate = await c.get("SELECT id FROM check_ins WHERE goal_id=? AND check_date=? AND status='credited'", [g.id, today]);
        if (duplicate) return { duplicate: true };
        const info = await c.run(
          `INSERT INTO check_ins (goal_id, user_id, check_date, duration_min, in_window, points, is_makeup, evidence_text, evidence_id, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'credited', ?) RETURNING id`,
          [g.id, req.user.id, today, duration, inWin ? 1 : 0, points, evidenceText, evidenceId, nowIso()]
        );
        const ciId = Number(info.id);
        const led = await ledgerAdd(c, {
          userId: req.user.id,
          delta: points,
          type: 'checkin',
          refType: 'check_in',
          refId: ciId,
          note: `「${g.title}」${duration} 分钟`,
        });
        const freshGoal = await c.get('SELECT * FROM goals WHERE id = ?', [g.id]);
        const streak = await updateStreakAndMilestones(c, freshGoal, cfg, await creditedDatesFor(c, g.id));
        return { ciId, led, streak };
      });
      if (!result) return res.status(409).json({ error: '目标状态已变化，请刷新后再试' });
      if (result.duplicate) return res.status(409).json({ error: '今天已经打过卡了' });
      log.log('checkin', `${req.user.nickname} 打卡「${g.title}」+${points} 分`);
      res.json({
        checkin: await db.get('SELECT * FROM check_ins WHERE id = ?', [result.ciId]),
        points,
        bonuses: result.streak.bonuses,
        streak: result.streak.after,
        balance: result.led.balanceAfter,
      });
    } catch (e) { next(e); }
  });

  // 撤销（24h 内本人）
  r.post('/checkins/:id/revoke', mw.requireUser, async (req, res, next) => {
    try {
      const ci = await db.get('SELECT * FROM check_ins WHERE id = ?', [Number(req.params.id) || 0]);
      if (!ci) return res.status(404).json({ error: '打卡记录不存在' });
      if (ci.user_id !== req.user.id) return res.status(403).json({ error: '只能撤销自己的打卡' });
      if (ci.status !== 'credited') return res.status(400).json({ error: '这条打卡已失效' });
      const hours = (Date.now() - new Date(ci.created_at).getTime()) / 3600000;
      if (hours > 24) return res.status(400).json({ error: '超过 24 小时不能撤销，只能由对方驳回或双方手动修正' });
      const revoked = await tx(db, async (c) => {
        const changed = await c.run(`UPDATE check_ins SET status='revoked' WHERE id=? AND status='credited'`, [ci.id]);
        if (!changed.changes) return false;
        await ledgerAdd(c, {
          userId: ci.user_id,
          delta: -Number(ci.points),
          type: 'checkin_revoke',
          refType: 'check_in',
          refId: ci.id,
          note: '撤销打卡',
        });
        await recomputeStreakAfterRemoval(c, ci.goal_id);
        return true;
      });
      if (!revoked) return res.status(409).json({ error: '这条打卡已失效，请刷新后再试' });
      log.log('checkin_revoke', `${req.user.nickname} 撤销打卡 #${ci.id}`);
      res.json({ ok: true, balance: await balanceOf(db, req.user.id) });
    } catch (e) { next(e); }
  });

  // 驳回（对方）
  r.post('/checkins/:id/reject', mw.requireUser, async (req, res, next) => {
    try {
      const ci = await db.get('SELECT * FROM check_ins WHERE id = ?', [Number(req.params.id) || 0]);
      if (!ci) return res.status(404).json({ error: '打卡记录不存在' });
      const partner = await mw.partnerOf(req.user.id);
      if (!partner || ci.user_id !== partner.id) return res.status(403).json({ error: '只能驳回对方的打卡' });
      if (ci.status !== 'credited') return res.status(400).json({ error: '这条打卡已失效' });
      const reason = String((req.body && req.body.reason) || '').trim();
      if (!reason || reason.length > 200) return res.status(400).json({ error: '请填写 1–200 字的驳回理由' });
      const rejected = await tx(db, async (c) => {
        const changed = await c.run(`UPDATE check_ins SET status='rejected', reason=? WHERE id=? AND status='credited'`, [reason, ci.id]);
        if (!changed.changes) return false;
        await ledgerAdd(c, {
          userId: ci.user_id,
          delta: -Number(ci.points),
          type: 'checkin_revoke',
          refType: 'check_in',
          refId: ci.id,
          note: `对方驳回：${reason}`,
        });
        await recomputeStreakAfterRemoval(c, ci.goal_id);
        return true;
      });
      if (!rejected) return res.status(409).json({ error: '这条打卡已失效，请刷新后再试' });
      log.log('checkin_reject', `${req.user.nickname} 驳回 ${partner.nickname} 的打卡 #${ci.id}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 打卡流水查询（本人或搭档，双方数据互见）
  r.get('/checkins', mw.requireUser, async (req, res, next) => {
    try {
      const goalId = Number(req.query.goal) || 0;
      const partner = await mw.partnerOf(req.user.id);
      const rows = await db.all(
        `SELECT ci.*, g.title AS goal_title, g.emoji AS goal_emoji, g.owner_id AS goal_owner FROM check_ins ci
         JOIN goals g ON g.id = ci.goal_id
         WHERE (ci.user_id = ? OR ci.user_id = ?) ${goalId ? 'AND ci.goal_id = ?' : ''}
         ORDER BY ci.id DESC LIMIT 100`,
        [req.user.id, partner ? partner.id : -1, ...(goalId ? [goalId] : [])]
      );
      res.json({ checkins: rows });
    } catch (e) { next(e); }
  });

  // ===== 小目标（阶段目标）验收流程 =====

  // 提交验收（本人，仅 stage 目标）
  r.post('/goals/:id/submit', mw.requireUser, mw.requireGoalOwner, async (req, res, next) => {
    try {
      const g = req.goal;
      if (g.type !== 'stage') return res.status(400).json({ error: '只有小目标需要验收' });
      if (g.status !== 'active') return res.status(400).json({ error: '只有进行中的小目标能提交验收' });
      const b = req.body || {};
      const selfStatement = String(b.self_statement || '').trim();
      if (selfStatement.length > 1000) return res.status(400).json({ error: '自述不能超过 1000 字' });
      const evidenceText = String(b.evidence_text || '').trim().slice(0, 1000);
      const evidenceIds = Array.isArray(b.evidence_ids) ? b.evidence_ids.slice(0, 3).map(Number) : [];
      const partner = await mw.partnerOf(req.user.id);
      if (!partner) return res.status(400).json({ error: '还没有搭档，无法验收' });

      const submitted = await tx(db, async (c) => {
        const active = await c.run("UPDATE goals SET status='reviewing', updated_at=? WHERE id=? AND status='active'", [nowIso(), g.id]);
        if (!active.changes) return false;
        const prev = await c.get(`SELECT * FROM verifications WHERE goal_id = ? ORDER BY id DESC LIMIT 1`, [g.id]);
        const submitCount = prev ? Number(prev.submit_count) + 1 : 1;
        await c.run(
          `INSERT INTO verifications (goal_id, submitter_id, reviewer_id, submit_count, evidence_text, evidence_ids, self_statement, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
          [g.id, req.user.id, partner.id, submitCount, evidenceText, evidenceIds.join(','), selfStatement, nowIso()]
        );
        return true;
      });
      if (!submitted) return res.status(409).json({ error: '目标状态已变化，请刷新后再试' });
      log.log('verify_submit', `${req.user.nickname} 提交验收「${g.title}」`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.post('/goals/:id/withdraw', mw.requireUser, mw.requireGoalOwner, async (req, res, next) => {
    try {
      const g = req.goal;
      if (g.type !== 'stage' || g.status !== 'reviewing') return res.status(409).json({ error: '只有待验收的小目标可以撤回' });
      const withdrawn = await tx(db, async (c) => {
        const pending = await c.get(
          "SELECT id FROM verifications WHERE goal_id=? AND submitter_id=? AND status='pending' ORDER BY id DESC LIMIT 1",
          [g.id, req.user.id]
        );
        if (!pending) return false;
        const update = await c.run(
          "UPDATE verifications SET status='cancelled', reason='本人撤回', decided_at=? WHERE id=? AND status='pending'",
          [nowIso(), pending.id]
        );
        if (!update.changes) return false;
        await c.run("UPDATE goals SET status='active', updated_at=? WHERE id=? AND status='reviewing'", [nowIso(), g.id]);
        return true;
      });
      if (!withdrawn) return res.status(409).json({ error: '这条验收已处理，请刷新后再试' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 待我验收列表（我是验收人的 pending）
  r.get('/verifications/pending', mw.requireUser, async (req, res, next) => {
    try {
      const rows = await db.all(
        `SELECT v.*, g.title AS goal_title, g.emoji AS goal_emoji, g.total_points, u.nickname AS submitter_nickname, u.avatar AS submitter_avatar
         FROM verifications v
         JOIN goals g ON g.id = v.goal_id
         JOIN users u ON u.id = v.submitter_id
         WHERE v.reviewer_id = ? AND v.status = 'pending'
         ORDER BY v.id DESC`,
        [req.user.id]
      );
      res.json({ verifications: rows });
    } catch (e) { next(e); }
  });

  // 验收详情（P5-#21）：reviewer 或提交人可看；含证据图片、第几次提交、历史驳回理由
  r.get('/verifications/:id/detail', mw.requireUser, async (req, res, next) => {
    try {
      const v = await db.get(
        `SELECT v.*, g.title AS goal_title, g.emoji AS goal_emoji, g.description AS goal_desc,
                g.accept_criteria, g.total_points, g.end_date,
                u.nickname AS submitter_nickname, u.avatar AS submitter_avatar
         FROM verifications v JOIN goals g ON g.id = v.goal_id JOIN users u ON u.id = v.submitter_id
         WHERE v.id = ?`,
        [Number(req.params.id) || 0]
      );
      if (!v) return res.status(404).json({ error: '验收记录不存在' });
      if (v.reviewer_id !== req.user.id && v.submitter_id !== req.user.id) {
        return res.status(403).json({ error: '无权查看这条验收' });
      }
      const history = await db.all(
        `SELECT status, reason, submit_count, created_at, decided_at FROM verifications
         WHERE goal_id = ? ORDER BY id`,
        [v.goal_id]
      );
      res.json({
        verification: {
          id: v.id,
          status: v.status,
          submitCount: v.submit_count,
          selfStatement: v.self_statement,
          evidenceText: v.evidence_text,
          evidenceUrls: v.evidence_ids ? v.evidence_ids.split(',').filter(Boolean).map((id) => `/api/file/${id}`) : [],
          createdAt: v.created_at,
          decidedAt: v.decided_at,
          reason: v.reason,
        },
        goal: {
          title: v.goal_title, emoji: v.goal_emoji, description: v.goal_desc,
          acceptCriteria: v.accept_criteria, totalPoints: Number(v.total_points) || 0, endDate: v.end_date,
        },
        submitter: { nickname: v.submitter_nickname, avatar: v.submitter_avatar },
        history,
      });
    } catch (e) { next(e); }
  });

  // 通过（对方 → 入账 stage_credit，逾期只发 90%）
  r.post('/verifications/:id/approve', mw.requireUser, async (req, res, next) => {
    try {
      const v = await db.get('SELECT * FROM verifications WHERE id = ?', [Number(req.params.id) || 0]);
      if (!v) return res.status(404).json({ error: '验收记录不存在' });
      if (v.reviewer_id !== req.user.id) return res.status(403).json({ error: '只能验收自己的待办' });
      if (v.status !== 'pending') return res.status(400).json({ error: '这条验收已处理' });
      const g = await db.get('SELECT * FROM goals WHERE id = ?', [v.goal_id]);
      if (!g) return res.status(404).json({ error: '目标不存在' });

      const cfg = await getPoints(db);
      let points = Number(g.total_points) || 0;
      // 逾期完成只发 90%（需求 8.2）
      const overdue = g.end_date && todayStr() > g.end_date;
      if (overdue) points = Math.round(points * 0.9);

      const approved = await tx(db, async (c) => {
        const update = await c.run(`UPDATE verifications SET status='approved', decided_at=? WHERE id=? AND status='pending'`, [nowIso(), v.id]);
        if (!update.changes) return false;
        await c.run(`UPDATE goals SET status='achieved', updated_at=? WHERE id=?`, [nowIso(), g.id]);
        // 计划链联动：链上小目标达成 → plan_status='done'；并释放下一个（提前完成 → 提前露面）
        if (g.big_goal_id) {
          await c.run(`UPDATE goals SET plan_status='done' WHERE id=? AND plan_status IS NOT NULL`, [g.id]);
          const { releaseChain } = require('./biggoals');
          await releaseChain(c, g.big_goal_id, g.owner_id);
        }
        if (points > 0) {
          await ledgerAdd(c, {
            userId: g.owner_id,
            delta: points,
            type: 'stage_credit',
            refType: 'verification',
            refId: v.id,
            note: `小目标「${g.title}」${overdue ? '逾期完成（90%）' : '达成'}`,
          });
        }
        return true;
      });
      if (!approved) return res.status(409).json({ error: '这条验收已处理，请刷新后再试' });
      log.log('verify_approve', `${req.user.nickname} 通过 ${g.title} 的验收 +${points} 分`);

      // AI 进度分析（P2-#11）：异步触发，不阻塞验收响应；失败只记 ai_calls，不影响验收结果
      if (g.big_goal_id) {
        setImmediate(() => {
          const { runProgress } = require('../agent/workflows/progress');
          const ai = require('../ai');
          runProgress({ db, userId: g.owner_id, goalId: g.id }).catch(async (e) => {
            await ai.recordCall(db, {
              userId: g.owner_id, workflow: 'progress', action: 'progress_trigger', status: 'fail',
              detail: JSON.stringify({ error: String(e.message), goal_id: g.id }),
            });
          });
        });
      }

      res.json({ ok: true, points, overdue });
    } catch (e) { next(e); }
  });

  // 驳回（对方 → 目标回 active）
  r.post('/verifications/:id/reject', mw.requireUser, async (req, res, next) => {
    try {
      const v = await db.get('SELECT * FROM verifications WHERE id = ?', [Number(req.params.id) || 0]);
      if (!v) return res.status(404).json({ error: '验收记录不存在' });
      if (v.reviewer_id !== req.user.id) return res.status(403).json({ error: '只能处理自己的待办' });
      if (v.status !== 'pending') return res.status(400).json({ error: '这条验收已处理' });
      const reason = String((req.body && req.body.reason) || '').trim();
      if (!reason || reason.length > 200) return res.status(400).json({ error: '请填写 1–200 字的驳回理由' });
      const g = await db.get('SELECT * FROM goals WHERE id = ?', [v.goal_id]);
      const rejected = await tx(db, async (c) => {
        const update = await c.run(`UPDATE verifications SET status='rejected', reason=?, decided_at=? WHERE id=? AND status='pending'`, [reason, nowIso(), v.id]);
        if (!update.changes) return false;
        await c.run(`UPDATE goals SET status='active', updated_at=? WHERE id=?`, [nowIso(), v.goal_id]);
        return true;
      });
      if (!rejected) return res.status(409).json({ error: '这条验收已处理，请刷新后再试' });
      log.log('verify_reject', `${req.user.nickname} 驳回「${g.title}」的验收：${reason}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
};

module.exports.createGoal = createGoal;
module.exports.validateGoalBody = validateGoalBody;
