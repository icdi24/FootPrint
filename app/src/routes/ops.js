// 运营路由：首页数据、流水、统计、设置、上传、文件、备份、导出、健康检查。
const express = require('express');
const fs = require('fs');
const path = require('path');
const { todayStr, nowIso, addDaysStr, isoWeekday, mondayOf, hhmm } = require('../tz');
const { getPoints, setPoints, effectivePoints } = require('../points');
const { balanceOf } = require('../db');
const { statsFor } = require('../stats');
const backup = require('../backup');
const { buildExportZip } = require('../export');
const { personalDownload } = require('../personal-export');
const log = require('../log');

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const LEDGER_TYPES = {
  checkin: '打卡',
  streak_bonus: '连续奖励',
  stage_credit: '阶段目标',
  redeem_lock: '兑换锁分',
  redeem_charge: '兑换实扣',
  redeem_refund: '兑换退分',
  checkin_revoke: '打卡冲销',
  penalty: '惩罚',
  adjust: '手动修正',
};

function dueOn(goal, date) {
  if (date < goal.start_date) return false;
  if (goal.end_date && date > goal.end_date) return false;
  if (goal.freq_mode === 'daily') return true;
  if (goal.freq_mode === 'weekdays') {
    const wd = new Set(String(goal.weekdays || '').split(',').map(Number).filter(Boolean));
    return wd.has(isoWeekday(date));
  }
  return false;
}

function inWindowNow(goal) {
  if (!goal.window_start || !goal.window_end) return false;
  const now = hhmm();
  return now >= goal.window_start && now < goal.window_end;
}

module.exports = function opsRoutes(db, dataDir) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);
  const uploadsDir = path.join(dataDir, 'uploads');

  // 首页聚合
  r.get('/home', mw.requireUser, async (req, res, next) => {
    try {
      const partner = await mw.partnerOf(req.user.id);
      const cfg = await getPoints(db);
      const today = todayStr();
      const stats = await statsFor(db, req.user.id);

      const goals = await db.all(
        `SELECT * FROM goals WHERE owner_id = ? AND status = 'active' AND type = 'daily' ORDER BY id`,
        [req.user.id]
      );

      const weekMonday = mondayOf(today);
      const todos = [];
      for (const g of goals) {
        const checked = await db.get(
          `SELECT * FROM check_ins WHERE goal_id = ? AND check_date = ? AND status = 'credited'`,
          [g.id, today]
        );
        const dueToday = dueOn(g, today);
        let weekDone = 0;
        if (g.freq_mode === 'weekly') {
          const cnt = await db.get(
            `SELECT COUNT(*) AS c FROM check_ins WHERE goal_id = ? AND check_date >= ? AND check_date <= ? AND status = 'credited'`,
            [g.id, weekMonday, addDaysStr(weekMonday, 6)]
          );
          weekDone = Number(cnt.c);
        }
        todos.push({
          goal: {
            id: g.id,
            title: g.title,
            emoji: g.emoji,
            duration_min: g.duration_min,
            difficulty: g.difficulty,
            freq_mode: g.freq_mode,
            freq_n: g.freq_n,
            weekdays: g.weekdays,
            window_start: g.window_start,
            window_end: g.window_end,
            custom_points: g.custom_points,
          },
          dueToday,
          checked: checked ? { id: checked.id, points: Number(checked.points), durationMin: Number(checked.duration_min), evidenceText: checked.evidence_text } : null,
          pointsNow: effectivePoints(g, g.duration_min, inWindowNow(g), cfg),
          weekly: g.freq_mode === 'weekly' ? { done: weekDone, need: Number(g.freq_n) || 1 } : null,
          streak: g.streak_count,
        });
      }

      const pending = todos.filter((t) => t.dueToday && !t.checked);
      const weeklyPending = todos.filter((t) => !t.dueToday && t.weekly && t.weekly.done < t.weekly.need && !t.checked);

      let partnerToday = { checked: 0, expected: 0, list: [] };
      if (partner) {
        const pg = await db.all(`SELECT * FROM goals WHERE owner_id = ? AND status = 'active' AND type = 'daily'`, [partner.id]);
        partnerToday.expected = pg.filter((g) => dueOn(g, today)).length;
        const rows = await db.all(
          `SELECT ci.*, g.title AS goal_title, g.emoji AS goal_emoji FROM check_ins ci
           JOIN goals g ON g.id = ci.goal_id
           WHERE ci.user_id = ? AND ci.check_date = ? AND ci.status = 'credited' ORDER BY ci.id DESC`,
          [partner.id, today]
        );
        partnerToday.checked = rows.length;
        partnerToday.list = rows.map((ci) => ({
          id: ci.id,
          goalTitle: ci.goal_title,
          goalEmoji: ci.goal_emoji,
          points: Number(ci.points),
          evidenceText: ci.evidence_text,
          evidenceUrl: ci.evidence_id ? `/api/file/${ci.evidence_id}` : null,
          createdAt: ci.created_at,
        }));
      }

      // 小目标（stage）：进行中/待验收，单独返回（挂在大目标计划链上的不在这展示，走 currentPlanGoals）
      const stageGoals = await db.all(
        `SELECT * FROM goals WHERE owner_id = ? AND type = 'stage' AND status IN ('active','reviewing') AND big_goal_id IS NULL
         ORDER BY CASE status WHEN 'reviewing' THEN 0 ELSE 1 END, id DESC`,
        [req.user.id]
      );

      // 当前小目标（计划链已释放的，首页露 1–2 个；未启动 planned 的不出现）
      // 先对每个进行中的大目标跑一次惰性释放：到了日期就露面，不必先打开详情页
      const activeBgs = await db.all(
        "SELECT id FROM big_goals WHERE owner_id = ? AND status = 'active'",
        [req.user.id]
      );
      const { releaseChain } = require('./biggoals');
      for (const bg of activeBgs) {
        await releaseChain(db, bg.id, req.user.id);
      }
      const currentPlanGoals = await db.all(
        `SELECT g.id, g.title, g.emoji, g.planned_date, g.status, g.big_goal_id, b.title AS big_goal_title
         FROM goals g JOIN big_goals b ON b.id = g.big_goal_id
         WHERE g.owner_id = ? AND g.plan_status = 'released' AND g.status NOT IN ('achieved','abandoned','archived')
         ORDER BY g.planned_date, g.id LIMIT 2`,
        [req.user.id]
      );

      res.json({
        me: { id: req.user.id, username: req.user.nickname, avatar: req.user.avatar },
        partner: partner ? { id: partner.id, username: partner.nickname, avatar: partner.avatar } : null,
        balance: stats.balance,
        monthPoints: stats.monthPoints,
        currentStreak: stats.currentStreak,
        bestStreak: stats.bestStreak,
        todos,
        stageGoals,
        currentPlanGoals,
        pendingCount: pending.length + weeklyPending.length,
        partnerToday,
        today,
      });
    } catch (e) { next(e); }
  });

  // 流水：支持按类型 / 收支方向过滤与分页（供「查看全部」与收支筛选）
  r.get('/ledger', mw.requireUser, async (req, res, next) => {
    try {
      const type = String(req.query.type || '').trim();
      const dir = String(req.query.dir || '').trim();
      const limit = Math.max(1, Math.min(300, Number(req.query.limit) || 300));
      const before = Number(req.query.before) || 0;
      const where = ['user_id = ?'];
      const args = [req.user.id];
      if (type) { where.push('type = ?'); args.push(type); }
      if (dir === 'in') where.push('delta > 0');
      else if (dir === 'out') where.push('delta < 0');
      if (before > 0) { where.push('id < ?'); args.push(before); }
      args.push(limit);
      const rows = await db.all(
        `SELECT * FROM point_ledger WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`,
        args
      );
      res.json({ ledger: rows.map((x) => ({ ...x, typeLabel: LEDGER_TYPES[x.type] || x.type })) });
    } catch (e) { next(e); }
  });

  // 统计（本人或搭档）
  r.get('/stats', mw.requireUser, async (req, res, next) => {
    try {
      const userId = req.query.user ? Number(req.query.user) : req.user.id;
      const partner = await mw.partnerOf(req.user.id);
      if (userId !== req.user.id && (!partner || userId !== partner.id)) {
        return res.status(403).json({ error: '无权查看' });
      }
      const u = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
      // ⚠ 只返回公开字段：绝不能把 password_hash 发给前端
      res.json({
        user: u ? { id: u.id, username: u.nickname, avatar: u.avatar } : null,
        stats: await statsFor(db, userId),
      });
    } catch (e) { next(e); }
  });

  // 系数设置
  r.get('/settings', mw.requireUser, async (req, res, next) => {
    try {
      res.json({ points: await getPoints(db) });
    } catch (e) { next(e); }
  });

  r.put('/settings', mw.requireUser, async (req, res, next) => {
    try {
      const result = await setPoints(db, (req.body && req.body.points) || {});
      if (!result.ok) return res.status(400).json({ error: result.errors[0] });
      log.log('settings_change', `${req.user.nickname} 调整了积分系数`);
      res.json({ points: result.cfg });
    } catch (e) { next(e); }
  });

  // 图片上传（原始字节，鉴权后私有访问）
  r.put('/uploads', express.raw({ type: '*/*', limit: '12mb' }), mw.requireUser, async (req, res, next) => {
    try {
      const ext = String(req.query.ext || '').toLowerCase().replace(/^\./, '');
      if (!ALLOWED_EXT.includes(ext)) return res.status(400).json({ error: '仅支持 jpg/png/webp/gif' });
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: '没有收到图片数据' });
      fs.mkdirSync(uploadsDir, { recursive: true });
      const info = await db.run(
        'INSERT INTO uploads (user_id, kind, ext, created_at) VALUES (?, ?, ?, ?) RETURNING id',
        [req.user.id, req.query.kind || 'evidence', ext, nowIso()]
      );
      const id = Number(info.id);
      fs.writeFileSync(path.join(uploadsDir, `${id}.${ext}`), buf);
      res.json({ id, url: `/api/file/${id}` });
    } catch (e) { next(e); }
  });

  // 私有文件访问（本人或搭档）
  r.get('/file/:id', mw.requireUser, async (req, res, next) => {
    try {
      const up = await db.get('SELECT * FROM uploads WHERE id = ?', [Number(req.params.id) || 0]);
      if (!up) return res.status(404).json({ error: '文件不存在' });
      const partner = await mw.partnerOf(req.user.id);
      if (up.user_id !== req.user.id && (!partner || up.user_id !== partner.id)) {
        return res.status(403).json({ error: '无权查看' });
      }
      const p = path.join(uploadsDir, `${up.id}.${up.ext}`);
      if (!fs.existsSync(p)) return res.status(404).json({ error: '文件已丢失' });
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('Content-Type', up.ext === 'gif' ? 'image/gif' : up.ext === 'webp' ? 'image/webp' : up.ext === 'png' ? 'image/png' : 'image/jpeg');
      res.sendFile(p);
    } catch (e) { next(e); }
  });

  // 备份
  r.use(['/backups', '/export', '/admin/export'], (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  r.get('/backups', mw.requireUser, mw.requireAdmin, (req, res) => {
    res.json({ backups: backup.listBackups(dataDir) });
  });

  r.post('/backups', mw.requireUser, mw.requireAdmin, async (req, res, next) => {
    try {
      const info = await backup.backupNow(db, dataDir);
      log.log('backup_manual', `${req.user.nickname} 手动快照 ${info.name}`);
      res.json(info);
    } catch (e) { next(e); }
  });

  r.get('/backups/:name', mw.requireUser, mw.requireAdmin, (req, res) => {
    const name = String(req.params.name);
    if (!/^app-\d{4}-\d{2}-\d{2}\.json$/.test(name)) return res.status(400).json({ error: '文件名不对' });
    backup.listBackups(dataDir); // Prune expired files before direct-name downloads as well.
    const p = path.join(backup.backupsDir(dataDir), name);
    if (!fs.existsSync(p)) return res.status(404).json({ error: '快照不存在' });
    res.download(p, name);
  });

  // Every account, including administrators, gets only its own data from this URL.
  r.get('/export', mw.requireUser, async (req, res, next) => {
    try {
      await personalDownload(db, req.user.id, res);
    } catch (e) {
      if (e.status && !res.headersSent) return res.status(e.status).json({ error: e.message, code: e.code });
      next(e);
    }
  });

  // Full recovery backups are explicitly separated from personal downloads.
  r.get('/admin/export', mw.requireUser, mw.requireAdmin, async (req, res, next) => {
    try {
      const zip = await buildExportZip(db);
      const date = todayStr();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="footprint-backup-${date}.zip"`);
      res.send(zip.toBuffer());
    } catch (e) { next(e); }
  });

  return r;
};
