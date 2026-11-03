// 认证路由：初始化 2 账号、登录、登出、我、改口令。
const express = require('express');
const {
  hashPassword,
  verifyPassword,
  checkLoginLocked,
  recordLoginFail,
  recordLoginOk,
  lockRemainingMs,
  createSession,
  destroySession,
  destroyAllSessions,
  COOKIE_NAME,
} = require('../auth');
const { ensureSettings } = require('../points');
const { nowIso } = require('../tz');
const log = require('../log');

const PW_MIN = 6;
const NICK_MAX = 30;

module.exports = function authRoutes(db) {
  const r = express.Router();
  const { requireUser } = require('../middleware').makeMiddleware(db);

  function setCookie(res, token, expiresAt) {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      expires: new Date(expiresAt),
      path: '/',
    });
  }

  r.get('/bootstrap', async (req, res, next) => {
    try {
      const row = await db.get('SELECT COUNT(*) AS c FROM users');
      res.json({ initialized: Number(row.c) > 0 });
    } catch (e) { next(e); }
  });

  r.post('/setup', async (req, res, next) => {
    try {
      const row = await db.get('SELECT COUNT(*) AS c FROM users');
      if (Number(row.c) > 0) return res.status(403).json({ error: '已初始化，不能重复创建账号' });
      const me = req.body && req.body.me;
      const partner = req.body && req.body.partner;
      if (!me || !partner) return res.status(400).json({ error: '需要填写两个人的信息' });
      for (const [name, u] of [['我的', me], ['对方', partner]]) {
        if (!u || typeof u.nickname !== 'string' || !u.nickname.trim()) {
          return res.status(400).json({ error: `${name}昵称不能为空` });
        }
        if (u.nickname.trim().length > NICK_MAX) {
          return res.status(400).json({ error: `${name}昵称不能超过 ${NICK_MAX} 字` });
        }
        if (typeof u.password !== 'string' || u.password.length < PW_MIN) {
          return res.status(400).json({ error: `${name}口令至少 ${PW_MIN} 位` });
        }
      }
      if (me.nickname.trim() === partner.nickname.trim()) {
        return res.status(400).json({ error: '两个人的昵称不能一样' });
      }
      await db.run('INSERT INTO users (nickname, password_hash, avatar, created_at) VALUES (?, ?, ?, ?)',
        [me.nickname.trim(), hashPassword(me.password), me.avatar || '🐱', nowIso()]);
      await db.run('INSERT INTO users (nickname, password_hash, avatar, created_at) VALUES (?, ?, ?, ?)',
        [partner.nickname.trim(), hashPassword(partner.password), partner.avatar || '🐻', nowIso()]);
      await ensureSettings(db);
      log.log('setup', `初始化完成：${me.nickname.trim()} / ${partner.nickname.trim()}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.post('/login', async (req, res, next) => {
    try {
      const { nickname, password } = req.body || {};
      if (typeof nickname !== 'string' || !nickname.trim() || typeof password !== 'string') {
        return res.status(400).json({ error: '请填写昵称和口令' });
      }
      const name = nickname.trim();
      if (checkLoginLocked(name)) {
        const secs = Math.ceil(lockRemainingMs(name) / 1000);
        return res.status(429).json({ error: `失败次数过多，请 ${secs} 秒后再试` });
      }
      const user = await db.get('SELECT * FROM users WHERE nickname = ?', [name]);
      if (!user || !verifyPassword(password, user.password_hash)) {
        recordLoginFail(name);
        log.log('login_fail', name);
        return res.status(401).json({ error: '昵称或口令不对' });
      }
      recordLoginOk(name);
      const s = await createSession(db, user.id);
      setCookie(res, s.token, s.expiresAt);
      log.log('login', `${user.nickname} (${user.id})`);
      res.json({ user: { id: user.id, nickname: user.nickname, avatar: user.avatar } });
    } catch (e) { next(e); }
  });

  r.post('/logout', async (req, res, next) => {
    try {
      await destroySession(db, req.token);
      res.clearCookie(COOKIE_NAME, { path: '/' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.post('/me/logout-all', requireUser, async (req, res, next) => {
    try {
      await destroyAllSessions(db, req.user.id);
      res.clearCookie(COOKIE_NAME, { path: '/' });
      log.log('logout_all', req.user.nickname);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.get('/me', requireUser, (req, res) => {
    res.json({ user: { id: req.user.id, nickname: req.user.nickname, avatar: req.user.avatar } });
  });

  r.post('/me/password', requireUser, async (req, res, next) => {
    try {
      const { oldPassword, newPassword } = req.body || {};
      if (!verifyPassword(String(oldPassword || ''), req.user.password_hash)) {
        return res.status(401).json({ error: '原口令不对' });
      }
      if (typeof newPassword !== 'string' || newPassword.length < PW_MIN) {
        return res.status(400).json({ error: `新口令至少 ${PW_MIN} 位` });
      }
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), req.user.id]);
      await destroyAllSessions(db, req.user.id);
      log.log('password_change', req.user.nickname);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
};
