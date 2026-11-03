// 认证与会话：bcrypt 口令、30 天 Token Cookie、登录失败 5 次锁 10 分钟。
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SESSION_DAYS = 30;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;

// 登录限流（单进程内存即可；重启清空锁）
const failMap = new Map(); // nickname -> { fails, lockedUntil }

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

function checkLoginLocked(nickname) {
  const rec = failMap.get(nickname);
  if (!rec) return false;
  if (rec.lockedUntil && rec.lockedUntil > Date.now()) return true;
  if (rec.lockedUntil && rec.lockedUntil <= Date.now()) {
    failMap.delete(nickname);
    return false;
  }
  return false;
}

function recordLoginFail(nickname) {
  const rec = failMap.get(nickname) || { fails: 0, lockedUntil: 0 };
  rec.fails += 1;
  if (rec.fails >= MAX_FAILS) {
    rec.lockedUntil = Date.now() + LOCK_MS;
    rec.fails = 0;
  }
  failMap.set(nickname, rec);
}

function recordLoginOk(nickname) {
  failMap.delete(nickname);
}

function lockRemainingMs(nickname) {
  const rec = failMap.get(nickname);
  if (rec && rec.lockedUntil > Date.now()) return rec.lockedUntil - Date.now();
  return 0;
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
