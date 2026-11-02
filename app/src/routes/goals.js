// 目标 CRUD、周网格、打卡、撤销、驳回。
const express = require('express');
const { todayStr, nowIso, addDaysStr, isoWeekday, mondayOf, hhmm, dateDiffDays } = require('../tz');
const { getPoints, calcPoints, valueRatio } = require('../points');
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
    perCheckinPoints: calcPoints(goal, goal.duration_min, inWin, cfg),
    ratio: Math.round(valueRatio(goal, cfg) * 100) / 100,
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

function creditedDatesFor(db, goalId) {
  const rows = db
    .prepare(`SELECT check_date FROM check_ins WHERE goal_id = ? AND status = 'credited'`)
    .all(goalId);
  return new Set(rows.map((r) => r.check_date));
}

// 打卡后更新连续链与里程碑（在事务内调用）
function updateStreakAndMilestones(db, goal, cfg, creditedDates) {
  const before = Number(goal.streak_count) || 0;
  const after = computeStreak(goal, creditedDates);
  const bonuses = [];
  if (after > before) {
    for (const m of cfg.milestones) {
      const n = Number(m.n);
      if (before < n && n <= after) {
        const dup = db.prepare('SELECT 1 FROM goal_milestones WHERE goal_id = ? AND threshold = ?').get(goal.id, n);
        if (!dup) {
          db.prepare('INSERT INTO goal_milestones (goal_id, threshold, awarded_at) VALUES (?, ?, ?)')
            .run(goal.id, n, nowIso());
          const led = ledgerAdd(db, {
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
  db.prepare('UPDATE goals SET streak_count = ?, streak_best = MAX(streak_best, ?), updated_at = ? WHERE id = ?')
    .run(after, after, nowIso(), goal.id);
  return { before, after, bonuses };
}

// 撤销/驳回后重算连续链；归零即清里程碑（重新排队）
function recomputeStreakAfterRemoval(db, goalId) {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
  if (!goal) return;
  const dates = creditedDatesFor(db, goalId);
  const after = computeStreak(goal, dates);
  if (after === 0) {
    db.prepare('DELETE FROM goal_milestones WHERE goal_id = ?').run(goalId);
  }
  db.prepare('UPDATE goals SET streak_count = ?, streak_best = MAX(streak_best, ?), updated_at = ? WHERE id = ?')
    .run(after, after, nowIso(), goalId);
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
  return errors;
}

module.exports = function goalsRoutes(db) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);

  // 分数预览
  r.post('/points/preview', mw.requireUser, (req, res) => {
    const cfg = getPoints(db);
    const b = req.body || {};
    const goal = {
      freq_mode: FREQ_MODES.includes(b.freq_mode) ? b.freq_mode : 'daily',
      freq_n: Number(b.freq_n) || 1,
      weekdays: b.weekdays || '',
      duration_min: Math.max(1, Math.min(1440, Number(b.duration_min) || 30)),
      difficulty: Math.max(1, Math.min(5, Number(b.difficulty) || 3)),
      window_start: b.window_start || null,
      window_end: b.window_end || null,
    };
    const inWin = inWindowNow(goal);
    res.json({
      points: calcPoints(goal, goal.duration_min, inWin, cfg),
      ratio: Math.round(valueRatio(goal, cfg) * 100) / 100,
      inWindow: inWin,
    });
  });

  // 我的目标列表
  r.get('/goals', mw.requireUser, (req, res) => {
    const cfg = getPoints(db);
    const rows = db
      .prepare(`SELECT * FROM goals WHERE owner_id = ? AND status != 'archived'
                ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, id DESC`)
      .all(req.user.id);
    const monthStart = todayStr().slice(0, 8) + '01';
    const monthCount = db
      .prepare(`SELECT goal_id, COUNT(*) AS c FROM check_ins
                WHERE user_id = ? AND status = 'credited' AND check_date >= ? GROUP BY goal_id`)
      .all(req.user.id, monthStart);
    const countMap = new Map(monthCount.map((x) => [x.goal_id, Number(x.c)]));
    res.json({
      goals: rows.map((g) => ({ ...goalRow(g, cfg), monthCount: countMap.get(g.id) || 0 })),
    });
  });

  // 周网格（参考 UI 示例的核心视图）
  r.get('/goals/week', mw.requireUser, (req, res) => {
    const cfg = getPoints(db);
    let start = req.query.start;
    if (!isValidDate(start)) start = mondayOf(todayStr());
    start = mondayOf(start);
    const today = todayStr();
    const rows = db
      .prepare(`SELECT * FROM goals WHERE owner_id = ? AND status IN ('active','achieved','abandoned')
                ORDER BY id DESC`)
      .all(req.user.id);
    let weekPoints = 0;
    let weekDone = 0;
    let weekExpected = 0;
    const goals = rows.map((g) => {
      const dates = creditedDatesFor(db, g.id);
      const cells = [];
      let gDone = 0;
      for (let i = 0; i < 7; i++) {
        const date = addDaysStr(start, i);
        const ci = db
          .prepare(`SELECT * FROM check_ins WHERE goal_id = ? AND check_date = ? AND status = 'credited'`)
          .get(g.id, date);
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
      return {
        id: g.id,
        title: g.title,
        emoji: g.emoji,
        status: g.status,
        freq_mode: g.freq_mode,
        freq_n: g.freq_n,
        weekdays: g.weekdays,
        perCheckinPoints: calcPoints(g, g.duration_min, inWindowNow(g), cfg),
        streak: g.streak_count,
        weeklyProgress,
        cells,
      };
    });
    res.json({ weekStart: start, weekEnd: addDaysStr(start, 6), today, weekPoints, weekDone, weekExpected, goals });
  });

  // 创建目标
  r.post('/goals', mw.requireUser, (req, res) => {
    const errors = validateGoalBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0] });
    const b = req.body;
    const cfg = getPoints(db);
    const status = b.active === false ? 'draft' : 'active';
    const info = db
      .prepare(`INSERT INTO goals (owner_id, title, emoji, description, freq_mode, freq_n, weekdays,
                  window_start, window_end, duration_min, difficulty, start_date, end_date, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        req.user.id,
        b.title.trim(),
        b.emoji || '🎯',
        String(b.description || '').trim(),
        b.freq_mode || 'daily',
        Number(b.freq_n) || 1,
        b.freq_mode === 'weekdays' ? String(b.weekdays) : '',
        b.window_start || null,
        b.window_end || null,
        Number(b.duration_min) || 30,
        Number(b.difficulty) || 3,
        b.start_date || todayStr(),
        b.end_date || null,
        status,
        nowIso(),
        nowIso()
      );
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(Number(info.lastInsertRowid));
    log.log('goal_create', `${req.user.nickname} 建目标「${goal.title}」`);
    res.json({ goal: goalRow(goal, cfg) });
  });

  // 目标详情
  r.get('/goals/:id', mw.requireUser, mw.loadGoal, (req, res) => {
    const cfg = getPoints(db);
    const monthStart = todayStr().slice(0, 8) + '01';
    const month = db
      .prepare(`SELECT * FROM check_ins WHERE goal_id = ? AND check_date >= ?
                ORDER BY check_date DESC, id DESC`)
      .all(req.goal.id, monthStart);
    res.json({ goal: goalRow(req.goal, cfg), monthCheckins: month });
  });

  // 编辑目标
  r.put('/goals/:id', mw.requireUser, mw.requireGoalOwner, (req, res) => {
    const g = req.goal;
    if (['achieved', 'abandoned', 'archived'].includes(g.status)) {
      return res.status(400).json({ error: '该状态的目标不能编辑' });
    }
    const errors = validateGoalBody(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors[0] });
    const b = req.body;
    const difficulty = b.difficulty !== undefined ? Number(b.difficulty) : g.difficulty;
    const duration = b.duration_min !== undefined ? Number(b.duration_min) : g.duration_min;
    if ((difficulty !== g.difficulty || duration !== g.duration_min) && g.status === 'active') {
      log.log('goal_change', `${req.user.nickname} 修改目标「${g.title}」时长/难度 ${g.duration_min}→${duration} / ${g.difficulty}→${difficulty}`);
    }
    db.prepare(`UPDATE goals SET title=?, emoji=?, description=?, freq_mode=?, freq_n=?, weekdays=?,
                window_start=?, window_end=?, duration_min=?, difficulty=?, start_date=?, end_date=?, updated_at=? WHERE id=?`)
      .run(
        (b.title !== undefined ? String(b.title).trim() : g.title),
        (b.emoji !== undefined ? b.emoji : g.emoji),
        (b.description !== undefined ? String(b.description).trim() : g.description),
        (b.freq_mode !== undefined ? b.freq_mode : g.freq_mode),
        (b.freq_n !== undefined ? Number(b.freq_n) : g.freq_n),
        (b.freq_mode === 'weekdays'
          ? String(b.weekdays || g.weekdays || '')
          : b.freq_mode !== undefined ? '' : g.weekdays),
        (b.window_start !== undefined ? (b.window_start || null) : g.window_start),
        (b.window_end !== undefined ? (b.window_end || null) : g.window_end),
        duration,
        difficulty,
        (b.start_date !== undefined ? b.start_date : g.start_date),
        (b.end_date !== undefined ? (b.end_date || null) : g.end_date),
        nowIso(),
        g.id
      );
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(g.id);
    res.json({ goal: goalRow(goal, getPoints(db)) });
  });

  // 开始（草稿→进行中）
  r.post('/goals/:id/start', mw.requireUser, mw.requireGoalOwner, (req, res) => {
    if (req.goal.status !== 'draft') return res.status(400).json({ error: '只有草稿可以开始' });
    db.prepare(`UPDATE goals SET status='active', updated_at=? WHERE id=?`).run(nowIso(), req.goal.id);
    res.json({ ok: true });
  });

  // 放弃（保留记录，不物理删除）
  r.post('/goals/:id/abandon', mw.requireUser, mw.requireGoalOwner, (req, res) => {
    if (!['active', 'draft'].includes(req.goal.status)) return res.status(400).json({ error: '当前状态不能放弃' });
    db.prepare(`UPDATE goals SET status='abandoned', updated_at=? WHERE id=?`).run(nowIso(), req.goal.id);
    log.log('goal_abandon', `${req.user.nickname} 放弃目标「${req.goal.title}」`);
    res.json({ ok: true });
  });

  // 打卡（自评即入账）
  r.post('/goals/:id/checkin', mw.requireUser, mw.requireGoalOwner, (req, res) => {
    const g = req.goal;
    if (g.status !== 'active') return res.status(400).json({ error: '只有进行中的目标能打卡' });
    const today = todayStr();
    const dup = db
      .prepare(`SELECT * FROM check_ins WHERE goal_id = ? AND check_date = ? AND status = 'credited'`)
      .get(g.id, today);
    if (dup) return res.status(409).json({ error: '今天已经打过卡了' });

    const b = req.body || {};
    let duration = Number(b.duration_min);
    if (!Number.isFinite(duration)) duration = Number(g.duration_min);
    duration = Math.max(1, Math.min(1440, Math.round(duration)));
    const evidenceText = String(b.evidence_text || '').trim().slice(0, 500);
    let evidenceId = null;
    if (b.evidence_id) {
      const up = db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(Number(b.evidence_id), req.user.id);
      if (!up) return res.status(400).json({ error: '证据图片无效' });
      evidenceId = Number(b.evidence_id);
    }

    const cfg = getPoints(db);
    const inWin = inWindowNow(g);
    const points = calcPoints(g, duration, inWin, cfg);

    const result = tx(db, () => {
      const info = db
        .prepare(`INSERT INTO check_ins (goal_id, user_id, check_date, duration_min, in_window, points, is_makeup, evidence_text, evidence_id, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'credited', ?)`)
        .run(g.id, req.user.id, today, duration, inWin ? 1 : 0, points, evidenceText, evidenceId, nowIso());
      const ciId = Number(info.lastInsertRowid);
      const led = ledgerAdd(db, {
        userId: req.user.id,
        delta: points,
        type: 'checkin',
        refType: 'check_in',
        refId: ciId,
        note: `「${g.title}」${duration} 分钟`,
      });
      const freshGoal = db.prepare('SELECT * FROM goals WHERE id = ?').get(g.id);
      const streak = updateStreakAndMilestones(db, freshGoal, cfg, creditedDatesFor(db, g.id));
      return { ciId, led, streak };
    });
    log.log('checkin', `${req.user.nickname} 打卡「${g.title}」+${points} 分`);
    res.json({
      checkin: db.prepare('SELECT * FROM check_ins WHERE id = ?').get(result.ciId),
      points,
      bonuses: result.streak.bonuses,
      streak: result.streak.after,
      balance: result.led.balanceAfter,
    });
  });

  // 撤销（24h 内本人）
  r.post('/checkins/:id/revoke', mw.requireUser, (req, res) => {
    const ci = db.prepare('SELECT * FROM check_ins WHERE id = ?').get(Number(req.params.id) || 0);
    if (!ci) return res.status(404).json({ error: '打卡记录不存在' });
    if (ci.user_id !== req.user.id) return res.status(403).json({ error: '只能撤销自己的打卡' });
    if (ci.status !== 'credited') return res.status(400).json({ error: '这条打卡已失效' });
    const hours = (Date.now() - new Date(ci.created_at).getTime()) / 3600000;
    if (hours > 24) return res.status(400).json({ error: '超过 24 小时不能撤销，只能由对方驳回或双方手动修正' });
    tx(db, () => {
      db.prepare(`UPDATE check_ins SET status='revoked' WHERE id=?`).run(ci.id);
      ledgerAdd(db, {
        userId: ci.user_id,
        delta: -Number(ci.points),
        type: 'checkin_revoke',
        refType: 'check_in',
        refId: ci.id,
        note: '撤销打卡',
      });
      recomputeStreakAfterRemoval(db, ci.goal_id);
    });
    log.log('checkin_revoke', `${req.user.nickname} 撤销打卡 #${ci.id}`);
    res.json({ ok: true, balance: balanceOf(db, req.user.id) });
  });

  // 驳回（对方）
  r.post('/checkins/:id/reject', mw.requireUser, (req, res) => {
    const ci = db.prepare('SELECT * FROM check_ins WHERE id = ?').get(Number(req.params.id) || 0);
    if (!ci) return res.status(404).json({ error: '打卡记录不存在' });
    const partner = mw.partnerOf(req.user.id);
    if (!partner || ci.user_id !== partner.id) return res.status(403).json({ error: '只能驳回对方的打卡' });
    if (ci.status !== 'credited') return res.status(400).json({ error: '这条打卡已失效' });
    const reason = String((req.body && req.body.reason) || '').trim();
    if (!reason || reason.length > 200) return res.status(400).json({ error: '请填写 1–200 字的驳回理由' });
    tx(db, () => {
      db.prepare(`UPDATE check_ins SET status='rejected', reason=? WHERE id=?`).run(reason, ci.id);
      ledgerAdd(db, {
        userId: ci.user_id,
        delta: -Number(ci.points),
        type: 'checkin_revoke',
        refType: 'check_in',
        refId: ci.id,
        note: `对方驳回：${reason}`,
      });
      recomputeStreakAfterRemoval(db, ci.goal_id);
    });
    log.log('checkin_reject', `${req.user.nickname} 驳回 ${partner.nickname} 的打卡 #${ci.id}`);
    res.json({ ok: true });
  });

  // 打卡流水查询（本人或搭档，双方数据互见）
  r.get('/checkins', mw.requireUser, (req, res) => {
    const goalId = Number(req.query.goal) || 0;
    const partner = mw.partnerOf(req.user.id);
    const rows = db
      .prepare(`SELECT ci.*, g.title AS goal_title, g.emoji AS goal_emoji, g.owner_id AS goal_owner FROM check_ins ci
                JOIN goals g ON g.id = ci.goal_id
                WHERE (ci.user_id = ? OR ci.user_id = ?) ${goalId ? 'AND ci.goal_id = ?' : ''}
                ORDER BY ci.id DESC LIMIT 100`)
      .all(req.user.id, partner ? partner.id : -1, ...(goalId ? [goalId] : []));
    res.json({ checkins: rows });
  });

  return r;
};
