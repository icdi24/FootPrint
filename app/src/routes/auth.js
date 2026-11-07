// 认证路由：注册（开放）、登录、登出、我、改用户名、改密码、AI 设置、画像。
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
const { nowIso } = require('../tz');
const log = require('../log');
const { getUserSettings } = require('../settings');
const { listChanges, markRead, listVersions, rollback } = require('../profileChanges');

const PW_MIN = 8;
const USERNAME_MAX = 30;
const SIGNUP_MAX_PER_HOUR = 5;
const SIGNUP_MAX_PER_DAY = 20;
const WEAK = new Set([
  '12345678', '123456789', '1234567890', '11111111', '00000000', '87654321',
  'password', 'password1', 'qwertyui', 'abc12345', 'iloveyou', 'admin123',
  'footprint', 'footprint123', 'letmein', 'welcome1',
]);

module.exports = function authRoutes(db) {
  const r = express.Router();
  const { requireUser } = require('../middleware').makeMiddleware(db);

  function setCookie(res, token, expiresAt) {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      // 纯 HTTP 直连下必须为 false（改 true 浏览器不发 cookie、直接登不上）；上 HTTPS 后用 COOKIE_SECURE=1 打开
      secure: process.env.COOKIE_SECURE === '1',
      expires: new Date(expiresAt),
      path: '/',
    });
  }

  function clientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
    return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  }

  // 只对新注册 / 主动改密生效，老账号不强制
  function validPassword(pw, username) {
    if (typeof pw !== 'string' || pw.length < PW_MIN) return false;
    const low = pw.toLowerCase();
    if (WEAK.has(low)) return false;
    if (low === String(username || '').toLowerCase()) return false;
    if (/^(\d)\1+$/.test(pw)) return false;
    return true;
  }

  // 对外只暴露 username，不再带 loginName / nickname（一次性切干净）
  function publicUser(u) {
    return { id: u.id, username: u.login_name, avatar: u.avatar };
  }

  // 注册限流：复用 login_attempts，按小时桶 / 日桶各计一次，键与登录限流隔离
  function signupBuckets(ip) {
    const iso = new Date().toISOString();
    return {
      iso,
      hour: `__signup__${ip}__h${iso.slice(0, 13)}`,
      day: `__signup__${ip}__d${iso.slice(0, 10)}`,
    };
  }

  async function signupAllowed(ip) {
    const b = signupBuckets(ip);
    const rows = await db.all(
      'SELECT login_name, fails FROM login_attempts WHERE login_name IN (?, ?) AND ip = ?',
      [b.hour, b.day, 'signup']
    );
    const byKey = new Map(rows.map((x) => [x.login_name, Number(x.fails) || 0]));
    if ((byKey.get(b.hour) || 0) >= SIGNUP_MAX_PER_HOUR) return false;
    if ((byKey.get(b.day) || 0) >= SIGNUP_MAX_PER_DAY) return false;
    return true;
  }

  async function recordSignup(ip) {
    const b = signupBuckets(ip);
    for (const key of [b.hour, b.day]) {
      await db.run(
        `INSERT INTO login_attempts (login_name, ip, fails, locked_until, updated_at) VALUES (?, 'signup', 1, NULL, ?)
         ON CONFLICT (login_name, ip) DO UPDATE SET fails = login_attempts.fails + 1, updated_at = EXCLUDED.updated_at`,
        [key, b.iso]
      );
    }
    // 顺手清掉两天前的桶，别让表无限长
    const cutoff = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    await db.run("DELETE FROM login_attempts WHERE ip = 'signup' AND updated_at < ?", [cutoff]);
  }

  r.get('/bootstrap', async (req, res, next) => {
    try {
      const row = await db.get('SELECT COUNT(*) AS c FROM users');
      res.json({ initialized: Number(row.c) > 0, signup: 'open' });
    } catch (e) { next(e); }
  });

  r.post('/setup', (req, res) => {
    res.status(410).json({ error: '初始化向导已停用，请直接注册账号' });
  });

  // 注册：不需要邀请码，只建账号；不建组、不写 pair_members（未配对状态）
  r.post('/register', async (req, res, next) => {
    try {
      if (process.env.SIGNUP_OPEN === '0') return res.status(403).json({ error: '注册已关闭' });
      const b = req.body || {};
      const username = String(b.username || '').trim();
      const password = typeof b.password === 'string' ? b.password : '';
      const avatar = b.avatar || '🐱';
      const ip = clientIp(req);

      if (username.length < 2 || username.length > USERNAME_MAX) {
        return res.status(400).json({ error: `用户名 2–${USERNAME_MAX} 字` });
      }
      if (!validPassword(password, username)) {
        return res.status(400).json({ error: `密码至少 ${PW_MIN} 位，且不能是常见弱密码或用户名` });
      }
      if (!(await signupAllowed(ip))) return res.status(429).json({ error: '注册太频繁了，稍后再试' });
      if (await db.get('SELECT id FROM users WHERE login_name = ?', [username])) {
        return res.status(400).json({ error: '这个用户名已经有人用了' });
      }
      // 不变量：login_name 与 nickname 恒等
      const info = await db.run(
        'INSERT INTO users (login_name, nickname, password_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [username, username, hashPassword(password), avatar, nowIso()]
      );
      await recordSignup(ip);
      const newUser = { id: Number(info.id), username, avatar };
      const s = await createSession(db, newUser.id);
      setCookie(res, s.token, s.expiresAt);
      log.log('register', `${username} 注册（未配对）`);
      res.json({ user: newUser });
    } catch (e) { next(e); }
  });

  r.post('/login', async (req, res, next) => {
    try {
      const b = req.body || {};
      const username = String(b.username || '').trim();
      const password = typeof b.password === 'string' ? b.password : '';
      if (!username || !password) return res.status(400).json({ error: '请填用户名和密码' });
      const ip = clientIp(req);
      if (await checkLoginLocked(db, username, ip)) {
        const secs = Math.ceil((await lockRemainingMs(db, username, ip)) / 1000);
        return res.status(429).json({ error: `失败次数过多，请 ${secs} 秒后再试` });
      }
      const user = await db.get('SELECT * FROM users WHERE login_name = ?', [username]);
      if (!user || !verifyPassword(password, user.password_hash)) {
        await recordLoginFail(db, username, ip);
        log.log('login_fail', username);
        return res.status(401).json({ error: '用户名或密码不对' });
      }
      await recordLoginOk(db, username, ip);
      const s = await createSession(db, user.id);
      setCookie(res, s.token, s.expiresAt);
      log.log('login', `${user.login_name} (${user.id})`);
      res.json({ user: publicUser(user) });
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
      log.log('logout_all', req.user.login_name);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.get('/me', requireUser, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  // 改用户名：全局唯一；两列一起更新，会话保持有效
  r.patch('/me', requireUser, async (req, res, next) => {
    try {
      const raw = req.body && req.body.username;
      if (typeof raw !== 'string' || !raw.trim()) return res.status(400).json({ error: '用户名不能为空' });
      const name = raw.trim();
      if (name.length > USERNAME_MAX) return res.status(400).json({ error: `用户名不能超过 ${USERNAME_MAX} 字` });
      const clash = await db.get('SELECT id FROM users WHERE login_name = ? AND id <> ?', [name, req.user.id]);
      if (clash) return res.status(400).json({ error: '这个用户名已经有人用了' });
      const oldName = req.user.login_name;
      await db.run('UPDATE users SET login_name = ?, nickname = ? WHERE id = ?', [name, name, req.user.id]);
      log.log('username_change', `${oldName} -> ${name}`);
      res.json({ user: { id: req.user.id, username: name, avatar: req.user.avatar } });
    } catch (e) { next(e); }
  });

  r.post('/me/password', requireUser, async (req, res, next) => {
    try {
      const { oldPassword, newPassword } = req.body || {};
      if (!verifyPassword(String(oldPassword || ''), req.user.password_hash)) {
        return res.status(401).json({ error: '原密码不对' });
      }
      if (!validPassword(newPassword, req.user.login_name)) {
        return res.status(400).json({ error: `新密码至少 ${PW_MIN} 位，且不能是常见弱密码或用户名` });
      }
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), req.user.id]);
      await destroyAllSessions(db, req.user.id);
      log.log('password_change', req.user.login_name);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---- AI 设置（P0-5）：每用户一份，与全局 settings 表（积分系数）无关 ----
  // skipConfirm 默认关、reportChanges 默认开；两开关只调确认与汇报，不调工具白名单
  r.get('/me/settings', requireUser, async (req, res, next) => {
    try {
      res.json(await getUserSettings(db, req.user.id));
    } catch (e) { next(e); }
  });

  r.put('/me/settings', requireUser, async (req, res, next) => {
    try {
      const b = req.body || {};
      const cur = await getUserSettings(db, req.user.id);
      const skipConfirm = b.skipConfirm !== undefined ? Boolean(b.skipConfirm) : cur.skipConfirm;
      const reportChanges = b.reportChanges !== undefined ? Boolean(b.reportChanges) : cur.reportChanges;
      const dailyEnabled = b.dailyEnabled !== undefined ? Boolean(b.dailyEnabled) : cur.dailyEnabled;
      await db.run(
        `INSERT INTO user_settings (user_id, skip_confirm, report_changes, daily_enabled, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET skip_confirm = EXCLUDED.skip_confirm, report_changes = EXCLUDED.report_changes, daily_enabled = EXCLUDED.daily_enabled, updated_at = EXCLUDED.updated_at`,
        [req.user.id, skipConfirm ? 1 : 0, reportChanges ? 1 : 0, dailyEnabled ? 1 : 0, new Date().toISOString()]
      );
      log.log('user_settings', `${req.user.login_name} skipConfirm=${skipConfirm} reportChanges=${reportChanges} dailyEnabled=${dailyEnabled}`);
      res.json({ skipConfirm, reportChanges, dailyEnabled });
    } catch (e) { next(e); }
  });

  // ---- 个人画像（P2-#14）：默认仅自己可见；支持查看/手改/删除 ----
  // 手改存 profile_versions（changed_by='user'）可回滚；删除标 void 不物理删（与 AI 补丁同规则）
  r.get('/me/profile', requireUser, async (req, res, next) => {
    try {
      const rows = await db.all(
        "SELECT block, content, source, status, updated_at FROM user_profiles WHERE user_id = ? ORDER BY block",
        [req.user.id]
      );
      res.json({ blocks: rows });
    } catch (e) { next(e); }
  });

  r.put('/me/profile/:block', requireUser, async (req, res, next) => {
    try {
      const block = String(req.params.block || '').trim();
      if (!/^[a-z][a-z0-9_]{0,31}$/.test(block)) return res.status(400).json({ error: '块名不合法' });
      const content = String((req.body && req.body.content) || '').trim();
      if (content.length > 4000) return res.status(400).json({ error: '单块最多 4000 字' });
      const current = await db.all(
        'SELECT block, content, source, status FROM user_profiles WHERE user_id = ? ORDER BY block', [req.user.id]
      );
      await db.run(
        'INSERT INTO profile_versions (user_id, snapshot, changed_by, reason, created_at) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, JSON.stringify(current), 'user', `手改 ${block}`, new Date().toISOString()]
      );
      if (!content) {
        await db.run("UPDATE user_profiles SET status = 'void', updated_at = ? WHERE user_id = ? AND block = ?",
          [new Date().toISOString(), req.user.id, block]);
        return res.json({ ok: true, deleted: true });
      }
      await db.run(
        `INSERT INTO user_profiles (user_id, block, content, source, status, updated_at) VALUES (?, ?, ?, 'user', 'active', ?)
         ON CONFLICT (user_id, block) DO UPDATE SET content = EXCLUDED.content, source = 'user', status = 'active', updated_at = EXCLUDED.updated_at`,
        [req.user.id, block, content, new Date().toISOString()]
      );
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 分享画像块给对方（P3-#17）：传要分享的块名列表 = 全量设置（列表外的一律取消分享）
  r.post('/me/profile/share', requireUser, async (req, res, next) => {
    try {
      const blocks = Array.isArray(req.body && req.body.blocks) ? req.body.blocks.map(String) : [];
      if (blocks.length > 20) return res.status(400).json({ error: '最多分享 20 块' });
      for (const b of blocks) {
        if (!/^[a-z][a-z0-9_]{0,31}$/.test(b)) return res.status(400).json({ error: `块名不合法：${b}` });
      }
      await db.run('UPDATE user_profiles SET shared = 0 WHERE user_id = ?', [req.user.id]);
      if (blocks.length) {
        await db.run(
          `UPDATE user_profiles SET shared = 1 WHERE user_id = ? AND block IN (${blocks.map(() => '?').join(',')})`,
          [req.user.id, ...blocks]
        );
      }
      res.json({ ok: true, shared: blocks });
    } catch (e) { next(e); }
  });

  // ---- 画像变更：改了什么（可查）、标记已读、版本历史与回滚 ----
  // 留痕无条件写；reportChanges 只控制推送 / 未读，关掉也能在这里翻到全部。
  r.get('/me/profile/changes', requireUser, async (req, res, next) => {
    try {
      res.json(await listChanges(db, req.user.id, req.query.limit));
    } catch (e) { next(e); }
  });

  r.post('/me/profile/changes/read', requireUser, async (req, res, next) => {
    try {
      await markRead(db, req.user.id);
      res.json({ ok: true, unread: 0 });
    } catch (e) { next(e); }
  });

  r.get('/me/profile/versions', requireUser, async (req, res, next) => {
    try {
      res.json({ versions: await listVersions(db, req.user.id, req.query.limit) });
    } catch (e) { next(e); }
  });

  r.post('/me/profile/versions/:id/rollback', requireUser, async (req, res, next) => {
    try {
      res.json(await rollback(db, req.user.id, Number(req.params.id) || 0));
    } catch (e) { next(e); }
  });

  return r;
};
