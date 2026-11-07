// 认证与会话：bcrypt 口令、30 天 Token Cookie、登录失败 5 次锁 15 分钟（落库，重启不清空）
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SESSION_DAYS = 30;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

async function lockRemainingMs(db, loginName, ip) {
  const r = await db.get('SELECT locked_until FROM login_attempts WHERE login_name = ? AND ip = ?', [loginName, ip]);
  if (!r || !r.locked_until) return 0;
  const ms = new Date(r.locked_until).getTime() - Date.now();
  return ms > 0 ? ms : 0;
}

async function checkLoginLocked(db, loginName, ip) {
  return (await lockRemainingMs(db, loginName, ip)) > 0;
}

async function recordLoginFail(db, loginName, ip) {
  const now = new Date().toISOString();
  const r = await db.get('SELECT fails FROM login_attempts WHERE login_name = ? AND ip = ?', [loginName, ip]);
  let fails = r ? Number(r.fails) + 1 : 1;
  let lockedUntil = null;
  if (fails >= MAX_FAILS) {
    lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
    fails = 0;
  }
  await db.run(
    `INSERT INTO login_attempts (login_name, ip, fails, locked_until, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (login_name, ip) DO UPDATE SET fails = EXCLUDED.fails, locked_until = EXCLUDED.locked_until, updated_at = EXCLUDED.updated_at`,
    [loginName, ip, fails, lockedUntil, now]
  );
}

async function recordLoginOk(db, loginName, ip) {
  await db.run('DELETE FROM login_attempts WHERE login_name = ? AND ip = ?', [loginName, ip]);
}

async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [now.toISOString()]);
  await db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [token, userId, now.toISOString(), expires.toISOString()]);
  return { token, expiresAt: expires.toISOString() };
}

async function destroySession(db, token) {
  if (!token) return;
  await db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

async function destroyAllSessions(db, userId) {
  await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

async function userByToken(db, token) {
  if (!token) return null;
  const row = await db.get(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    [token, new Date().toISOString()]
  );
  return row || null;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch (e) { /* 忽略坏 cookie */ }
    }
  }
  return out;
}

const COOKIE_NAME = 'fp_token';

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  checkLoginLocked,
  recordLoginFail,
  recordLoginOk,
  lockRemainingMs,
  createSession,
  destroySession,
  destroyAllSessions,
  userByToken,
  parseCookies,
};
