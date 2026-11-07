// 最小管理员后台 API：总览、用户/组、重置口令、种子邀请码、审计
const express = require('express');
const crypto = require('crypto');
const { hashPassword, destroyAllSessions } = require('../auth');
const { nowIso } = require('../tz');
const log = require('../log');

module.exports = function adminRoutes(db) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);

  function requireAdmin(req, res, next) {
    if (!req.user || !Number(req.user.is_admin)) return res.status(403).json({ error: '需要管理员权限' });
    next();
  }

  r.get('/admin/overview', mw.requireUser, requireAdmin, async (req, res, next) => {
    try {
      const users = await db.get('SELECT COUNT(*) AS c FROM users');
      const pairs = await db.get("SELECT COUNT(*) AS c FROM pairs WHERE status = 'active'");
      const invites = await db.get(
        'SELECT COUNT(*) AS c FROM pair_invites WHERE used_by IS NULL AND revoked_at IS NULL AND expires_at > ?',
        [nowIso()]
      );
      const solo = await db.get(
        'SELECT COUNT(*) AS c FROM users u LEFT JOIN pair_members pm ON pm.user_id = u.id WHERE pm.user_id IS NULL AND u.is_admin = 0'
      );
      const aiToday = await db.get('SELECT COUNT(*) AS c FROM ai_calls WHERE created_at >= ?', [nowIso().slice(0, 10)]);
      res.json({
        users: Number(users.c), activePairs: Number(pairs.c), liveInvites: Number(invites.c),
        soloUsers: Number(solo.c), aiCallsToday: Number(aiToday.c),
        dailyLimit: Number(process.env.AI_DAILY_LIMIT || 50),
      });
    } catch (e) { next(e); }
  });

  r.get('/admin/users', mw.requireUser, requireAdmin, async (req, res, next) => {
    try {
      const rows = await db.all(
        `SELECT u.id, u.login_name, u.nickname, u.is_admin, u.created_at, pm.pair_id
         FROM users u LEFT JOIN pair_members pm ON pm.user_id = u.id ORDER BY u.id`
      );
      res.json({ users: rows });
    } catch (e) { next(e); }
  });

  r.get('/admin/events', mw.requireUser, requireAdmin, async (req, res, next) => {
    try {
      const rows = await db.all(
        'SELECT e.*, u.nickname FROM pair_events e JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 50'
      );
      res.json({ events: rows });
    } catch (e) { next(e); }
  });

  // 重置口令：用户没有自助找回通道，这条是唯一入口
  r.post('/admin/reset-password', mw.requireUser, requireAdmin, async (req, res, next) => {
    try {
      const b = req.body || {};
      const loginName = String(b.loginName || '').trim();
      const newPassword = typeof b.newPassword === 'string' ? b.newPassword : '';
      if (!loginName || newPassword.length < 8) return res.status(400).json({ error: '需要登录名和至少 8 位新口令' });
      const u = await db.get('SELECT id, nickname FROM users WHERE login_name = ?', [loginName]);
      if (!u) return res.status(404).json({ error: '账号不存在' });
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), u.id]);
      await destroyAllSessions(db, u.id);
      log.log('admin_reset_password', `${req.user.nickname} 重置 ${u.nickname} 的口令`);
      res.json({ ok: true, nickname: u.nickname });
    } catch (e) { next(e); }
  });

  // 给指定用户发种子邀请码（无组时自动建组）
  r.post('/admin/seed-invite', mw.requireUser, requireAdmin, async (req, res, next) => {
    try {
      const loginName = String((req.body && req.body.loginName) || '').trim();
      const u = await db.get('SELECT id, nickname FROM users WHERE login_name = ?', [loginName]);
      if (!u) return res.status(404).json({ error: '账号不存在' });
      let row = await db.get('SELECT pair_id FROM pair_members WHERE user_id = ?', [u.id]);
      if (!row) {
        const p = await db.run("INSERT INTO pairs (status, created_at) VALUES ('active', ?) RETURNING id", [nowIso()]);
        const pid = Number(p.id);
        await db.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)', [pid, u.id, nowIso()]);
        row = { pair_id: pid };
      }
      const pid = Number(row.pair_id);
      const n = await db.get('SELECT COUNT(*) AS c FROM pair_members WHERE pair_id = ?', [pid]);
      if (Number(n.c) >= 2) return res.status(400).json({ error: '该组已满 2 人' });
      const code = crypto.randomBytes(6).toString('hex').toUpperCase();
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      await db.run(
        'INSERT INTO pair_invites (code, pair_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        [code, pid, u.id, nowIso(), expiresAt]
      );
      log.log('admin_seed_invite', `${req.user.nickname} 给 ${u.nickname} 发种子码`);
      res.json({ code, expiresAt, pairId: pid });
    } catch (e) { next(e); }
  });

  return r;
};
