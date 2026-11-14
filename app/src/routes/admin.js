// 最小管理员后台 API：总览、用户/组、重置密码、审计
const express = require('express');
const { hashPassword, destroyAllSessions } = require('../auth');
const { nowIso } = require('../tz');
const log = require('../log');

module.exports = function adminRoutes(db) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);

  const { requireAdmin } = mw;

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
        `SELECT u.id, u.login_name AS username, u.is_admin, u.created_at, pm.pair_id
         FROM users u LEFT JOIN pair_members pm ON pm.user_id = u.id ORDER BY u.id`
      );
      res.json({ users: rows });
    } catch (e) { next(e); }
  });

  r.get('/admin/events', mw.requireUser, requireAdmin, async (req, res, next) => {
    try {
      const rows = await db.all(
        'SELECT e.*, u.login_name AS username FROM pair_events e JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 50'
      );
      res.json({ events: rows });
    } catch (e) { next(e); }
  });

  // 重置密码：用户没有自助找回通道，这条是唯一入口
  r.post('/admin/reset-password', mw.requireUser, requireAdmin, async (req, res, next) => {
    try {
      const b = req.body || {};
      const username = String(b.username || '').trim();
      const newPassword = typeof b.newPassword === 'string' ? b.newPassword : '';
      if (!username || newPassword.length < 8) return res.status(400).json({ error: '需要用户名和至少 8 位新密码' });
      const u = await db.get('SELECT id, login_name FROM users WHERE login_name = ?', [username]);
      if (!u) return res.status(404).json({ error: '账号不存在' });
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), u.id]);
      await destroyAllSessions(db, u.id);
      log.log('admin_reset_password', `${req.user.login_name} 重置 ${u.login_name} 的密码`);
      res.json({ ok: true, username: u.login_name });
    } catch (e) { next(e); }
  });

  return r;
};
