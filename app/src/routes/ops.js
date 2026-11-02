// 运营路由：首页数据、流水、统计、设置、上传、文件、备份、导出、健康检查。
const express = require('express');
const fs = require('fs');
const path = require('path');
const { todayStr, nowIso, addDaysStr, isoWeekday, mondayOf, hhmm } = require('../tz');
const { getPoints, setPoints, calcPoints } = require('../points');
const { balanceOf } = require('../db');
const { statsFor } = require('../stats');
const backup = require('../backup');
const { buildExportZip } = require('../export');
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

module.exports = function opsRoutes(db, dataDir) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);
  const uploadsDir = path.join(dataDir, 'uploads');

  // 首页聚合
  r.get('/home', mw.requireUser, (req, res) => {
    const partner = mw.partnerOf(req.user.id);
    const cfg = getPoints(db);
    const today = todayStr();
    const stats = statsFor(db, req.user.id);

    const goals = db
      .prepare(`SELECT * FROM goals WHERE owner_id = ? AND status = 'active' ORDER BY id`)
      .all(req.user.id);

    const weekMonday = mondayOf(today);
    const todos = goals.map((g) => {
      const checked = db
        .prepare(`SELECT * FROM check_ins WHERE goal_id = ? AND check_date = ? AND status = 'credited'`)
        .get(g.id, today);
      const dueToday = dueOn(g, today);
      let weekDone = 0;
      if (g.freq_mode === 'weekly') {
        const cnt = db
          .prepare(`SELECT COUNT(*) AS c FROM check_ins WHERE goal_id = ? AND check_date >= ? AND check_date <= ? AND status = 'credited'`)
          .get(g.id, weekMonday, addDaysStr(weekMonday, 6));
        weekDone = Number(cnt.c);
      }
      return {
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
        },
        dueToday,
        checked: checked ? { id: checked.id, points: Number(checked.points), durationMin: Number(checked.duration_min), evidenceText: checked.evidence_text } : null,
        pointsNow: calcPoints(g, g.duration_min, inWindowNow(g), cfg),
        weekly: g.freq_mode === 'weekly' ? { done: weekDone, need: Number(g.freq_n) || 1 } : null,
        streak: g.streak_count,
      };
    });

    const pending = todos.filter((t) => t.dueToday && !t.checked);
    const weeklyPending = todos.filter((t) => !t.dueToday && t.weekly && t.weekly.done < t.weekly.need && !t.checked);

    let partnerToday = { checked: 0, expected: 0, list: [] };
    if (partner) {
      const pg = db
        .prepare(`SELECT * FROM goals WHERE owner_id = ? AND status = 'active'`)
        .all(partner.id);
      partnerToday.expected = pg.filter((g) => dueOn(g, today)).length;
      const rows = db
        .prepare(`SELECT ci.*, g.title AS goal_title, g.emoji AS goal_emoji FROM check_ins ci
                  JOIN goals g ON g.id = ci.goal_id
                  WHERE ci.user_id = ? AND ci.check_date = ? AND ci.status = 'credited' ORDER BY ci.id DESC`)
        .all(partner.id, today);
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

    res.json({
      me: { id: req.user.id, nickname: req.user.nickname, avatar: req.user.avatar },
      partner: partner ? { id: partner.id, nickname: partner.nickname, avatar: partner.avatar } : null,
      balance: stats.balance,
      monthPoints: stats.monthPoints,
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
      todos,
      pendingCount: pending.length + weeklyPending.length,
      partnerToday,
      today,
    });
  });

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

  // 流水
  r.get('/ledger', mw.requireUser, (req, res) => {
    const rows = db
      .prepare(`SELECT * FROM point_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 300`)
      .all(req.user.id);
    res.json({ ledger: rows.map((x) => ({ ...x, typeLabel: LEDGER_TYPES[x.type] || x.type })) });
  });

  // 统计（本人或搭档）
  r.get('/stats', mw.requireUser, (req, res) => {
    const userId = req.query.user ? Number(req.query.user) : req.user.id;
    const partner = mw.partnerOf(req.user.id);
    if (userId !== req.user.id && (!partner || userId !== partner.id)) {
      return res.status(403).json({ error: '无权查看' });
    }
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.json({ user: u, stats: statsFor(db, userId) });
  });

  // 系数设置
  r.get('/settings', mw.requireUser, (req, res) => {
    res.json({ points: getPoints(db) });
  });

  r.put('/settings', mw.requireUser, (req, res) => {
    const result = setPoints(db, (req.body && req.body.points) || {});
    if (!result.ok) return res.status(400).json({ error: result.errors[0] });
    log.log('settings_change', `${req.user.nickname} 调整了积分系数`);
    res.json({ points: result.cfg });
  });

  // 图片上传（原始字节，鉴权后私有访问）
  r.put('/uploads', express.raw({ type: '*/*', limit: '12mb' }), mw.requireUser, (req, res) => {
    const ext = String(req.query.ext || '').toLowerCase().replace(/^\./, '');
    if (!ALLOWED_EXT.includes(ext)) return res.status(400).json({ error: '仅支持 jpg/png/webp/gif' });
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: '没有收到图片数据' });
    fs.mkdirSync(uploadsDir, { recursive: true });
    const info = db
      .prepare('INSERT INTO uploads (user_id, kind, ext, created_at) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.query.kind || 'evidence', ext, nowIso());
    const id = Number(info.lastInsertRowid);
    fs.writeFileSync(path.join(uploadsDir, `${id}.${ext}`), buf);
    res.json({ id, url: `/api/file/${id}` });
  });

  // 私有文件访问（本人或搭档）
  r.get('/file/:id', mw.requireUser, (req, res) => {
    const up = db.prepare('SELECT * FROM uploads WHERE id = ?').get(Number(req.params.id) || 0);
    if (!up) return res.status(404).json({ error: '文件不存在' });
    const partner = mw.partnerOf(req.user.id);
    if (up.user_id !== req.user.id && (!partner || up.user_id !== partner.id)) {
      return res.status(403).json({ error: '无权查看' });
    }
    const p = path.join(uploadsDir, `${up.id}.${up.ext}`);
    if (!fs.existsSync(p)) return res.status(404).json({ error: '文件已丢失' });
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Type', up.ext === 'gif' ? 'image/gif' : up.ext === 'webp' ? 'image/webp' : up.ext === 'png' ? 'image/png' : 'image/jpeg');
    res.sendFile(p);
  });

  // 备份
  r.get('/backups', mw.requireUser, (req, res) => {
    res.json({ backups: backup.listBackups(dataDir) });
  });

  r.post('/backups', mw.requireUser, (req, res) => {
    const info = backup.backupNow(db, dataDir);
    log.log('backup_manual', `${req.user.nickname} 手动快照 ${info.name}`);
    res.json(info);
  });

  r.get('/backups/:name', mw.requireUser, (req, res) => {
    const name = String(req.params.name);
    if (!/^app-\d{4}-\d{2}-\d{2}\.db$/.test(name)) return res.status(400).json({ error: '文件名不对' });
    const p = path.join(backup.backupsDir(dataDir), name);
    if (!fs.existsSync(p)) return res.status(404).json({ error: '快照不存在' });
    res.download(p, name);
  });

  // 全量导出（JSON + CSV 打包 zip）
  r.get('/export', mw.requireUser, (req, res) => {
    const zip = buildExportZip(db);
    const date = todayStr();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="footprint-export-${date}.zip"`);
    res.send(zip.toBuffer());
  });

  return r;
};
