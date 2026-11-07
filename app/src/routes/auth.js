// 认证路由：注册（凭邀请码）、登录、登出、我、改口令、AI 设置、画像。
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
const { tx } = require('../db');
const { currentPairId } = require('../pair');
const { nowIso } = require('../tz');
const log = require('../log');

const PW_MIN = 8;
const NICK_MAX = 30;
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
      secure: false,
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
  function validPassword(pw, loginName, nickname) {
    if (typeof pw !== 'string' || pw.length < PW_MIN) return false;
    const low = pw.toLowerCase();
    if (WEAK.has(low)) return false;
    if (low === String(loginName || '').toLowerCase() || low === String(nickname || '').toLowerCase()) return false;
    if (/^(\d)\1+$/.test(pw)) return false;
    return true;
  }

  r.get('/bootstrap', async (req, res, next) => {
    try {
      const row = await db.get('SELECT COUNT(*) AS c FROM users');
      res.json({ initialized: Number(row.c) > 0, signup: 'invite' });
    } catch (e) { next(e); }
  });

  // 初始化向导已停用：首个组由部署者用 create-seed-invite.js 发种子码
  r.post('/setup', (req, res) => {
    res.status(410).json({ error: '初始化向导已停用，请联系管理员获取邀请码' });
  });

  // 凭一次性邀请码注册，注册即入组
  r.post('/register', async (req, res, next) => {
    try {
      const b = req.body || {};
      const code = String(b.code || '').trim();
      const loginName = String(b.loginName || '').trim();
      const nickname = String(b.nickname || '').trim();
      const password = typeof b.password === 'string' ? b.password : '';
      const avatar = b.avatar || '🐱';

      if (!code) return res.status(400).json({ error: '请填邀请码' });
      if (loginName.length < 2 || loginName.length > 30) return res.status(400).json({ error: '登录名 2–30 字' });
      if (!nickname || nickname.length > NICK_MAX) return res.status(400).json({ error: `昵称 1–${NICK_MAX} 字` });
      if (!validPassword(password, loginName, nickname)) {
        return res.status(400).json({ error: `口令至少 ${PW_MIN} 位，且不能是常见弱口令` });
      }

      const invite = await db.get('SELECT * FROM pair_invites WHERE code = ?', [code]);
      if (!invite) return res.status(400).json({ error: '邀请码不对' });
      if (invite.revoked_at) return res.status(400).json({ error: '邀请码已撤销' });
      if (invite.used_by) return res.status(400).json({ error: '邀请码已被使用' });
      if (new Date(invite.expires_at).getTime() < Date.now()) return res.status(400).json({ error: '邀请码已过期' });
      const pair = await db.get('SELECT * FROM pairs WHERE id = ?', [invite.pair_id]);
      if (!pair || pair.status !== 'active') return res.status(400).json({ error: '邀请码对应的组已失效' });
      const members = await db.all('SELECT user_id FROM pair_members WHERE pair_id = ?', [invite.pair_id]);
      if (members.length >= 2) return res.status(400).json({ error: '这个组已经满员了' });
      if (!members.some((m) => Number(m.user_id) === Number(invite.created_by))) {
        return res.status(400).json({ error: '发码人已不在该组，邀请码无效' });
      }
      if (await db.get('SELECT id FROM users WHERE login_name = ?', [loginName])) {
        return res.status(400).json({ error: '这个登录名已经有人用了' });
      }
      const nickClash = await db.get(
        'SELECT u.id FROM users u JOIN pair_members pm ON pm.user_id = u.id WHERE pm.pair_id = ? AND u.nickname = ?',
        [invite.pair_id, nickname]
      );
      if (nickClash) return res.status(400).json({ error: '组里已经有人用这个昵称了' });

      let newUser;
      await tx(db, async (c) => {
        const info = await c.run(
          'INSERT INTO users (login_name, nickname, password_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
          [loginName, nickname, hashPassword(password), avatar, nowIso()]
        );
        const uid = Number(info.id);
        await c.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)',
          [invite.pair_id, uid, nowIso()]);
        await c.run('UPDATE pair_invites SET used_by = ?, used_at = ? WHERE code = ?', [uid, nowIso(), code]);
        newUser = { id: uid, loginName, nickname, avatar };
      });
      const s = await createSession(db, newUser.id);
      setCookie(res, s.token, s.expiresAt);
      log.log('register', `${loginName} 加入组 ${invite.pair_id}`);
      res.json({ user: newUser });
    } catch (e) { next(e); }
  });

  r.post('/login', async (req, res, next) => {
    try {
      const b = req.body || {};
      // 兼容旧 APK：仍接受 nickname 字段当登录名
      const loginName = String(b.loginName || b.nickname || '').trim();
      const password = typeof b.password === 'string' ? b.password : '';
      if (!loginName || !password) return res.status(400).json({ error: '请填登录名和口令' });
      const ip = clientIp(req);
      if (await checkLoginLocked(db, loginName, ip)) {
        const secs = Math.ceil((await lockRemainingMs(db, loginName, ip)) / 1000);
        return res.status(429).json({ error: `失败次数过多，请 ${secs} 秒后再试` });
      }
      const user = await db.get('SELECT * FROM users WHERE login_name = ?', [loginName]);
      if (!user || !verifyPassword(password, user.password_hash)) {
        await recordLoginFail(db, loginName, ip);
        log.log('login_fail', loginName);
        return res.status(401).json({ error: '登录名或口令不对' });
      }
      await recordLoginOk(db, loginName, ip);
      const s = await createSession(db, user.id);
      setCookie(res, s.token, s.expiresAt);
      log.log('login', `${user.nickname} (${user.id})`);
      res.json({ user: { id: user.id, loginName: user.login_name, nickname: user.nickname, avatar: user.avatar } });
    } catch (e) { next(e); }
  });

  r.post('/logout', async (req, res, next) => {
    try {
      const uid = req.user && req.user.id;
      await destroySession(db, req.token);
      if (uid) require('../ws').kickUser(uid);
      res.clearCookie(COOKIE_NAME, { path: '/' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.post('/me/logout-all', requireUser, async (req, res, next) => {
    try {
      await destroyAllSessions(db, req.user.id);
      require('../ws').kickUser(req.user.id);
      res.clearCookie(COOKIE_NAME, { path: '/' });
      log.log('logout_all', req.user.nickname);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.get('/me', requireUser, (req, res) => {
    res.json({ user: { id: req.user.id, loginName: req.user.login_name, nickname: req.user.nickname, avatar: req.user.avatar } });
  });

  // 改昵称：只要求组内不重名（nickname 已无全局唯一约束），会话保持有效
  r.patch('/me', requireUser, async (req, res, next) => {
    try {
      const nickname = req.body && req.body.nickname;
      if (typeof nickname !== 'string' || !nickname.trim()) {
        return res.status(400).json({ error: '昵称不能为空' });
      }
      const name = nickname.trim();
      if (name.length > NICK_MAX) {
        return res.status(400).json({ error: `昵称不能超过 ${NICK_MAX} 字` });
      }
      const pid = await currentPairId(db, req.user.id);
      const clash = pid
        ? await db.get(
          'SELECT u.id FROM users u JOIN pair_members pm ON pm.user_id = u.id WHERE pm.pair_id = ? AND u.nickname = ? AND u.id <> ?',
          [pid, name, req.user.id]
        )
        : null;
      if (clash) return res.status(400).json({ error: '组里已经有人用这个昵称了' });
      const oldName = req.user.nickname;
      await db.run('UPDATE users SET nickname = ? WHERE id = ?', [name, req.user.id]);
      log.log('nickname_change', `${oldName} -> ${name}`);
      res.json({ user: { id: req.user.id, loginName: req.user.login_name, nickname: name, avatar: req.user.avatar } });
    } catch (e) { next(e); }
  });

  r.post('/me/password', requireUser, async (req, res, next) => {
    try {
      const { oldPassword, newPassword } = req.body || {};
      if (!verifyPassword(String(oldPassword || ''), req.user.password_hash)) {
        return res.status(401).json({ error: '原口令不对' });
      }
      if (!validPassword(newPassword, req.user.login_name, req.user.nickname)) {
        return res.status(400).json({ error: `新口令至少 ${PW_MIN} 位，且不能是常见弱口令` });
      }
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), req.user.id]);
      await destroyAllSessions(db, req.user.id);
      require('../ws').kickUser(req.user.id);
      log.log('password_change', req.user.nickname);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---- AI 设置（P0-5）：每用户一份，与全局 settings 表（积分系数）无关 ----
  // skipConfirm 默认关、reportChanges 默认开；两开关只调确认与汇报，不调工具白名单
  async function getUserSettings(userId) {
    const row = await db.get('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
    return {
      skipConfirm: row ? Boolean(row.skip_confirm) : false,
      reportChanges: row ? Boolean(row.report_changes) : true,
      dailyEnabled: row ? Boolean(row.daily_enabled) : false,
    };
  }

  r.get('/me/settings', requireUser, async (req, res, next) => {
    try {
      res.json(await getUserSettings(req.user.id));
    } catch (e) { next(e); }
  });

  r.put('/me/settings', requireUser, async (req, res, next) => {
    try {
      const b = req.body || {};
      const cur = await getUserSettings(req.user.id);
      const skipConfirm = b.skipConfirm !== undefined ? Boolean(b.skipConfirm) : cur.skipConfirm;
      const reportChanges = b.reportChanges !== undefined ? Boolean(b.reportChanges) : cur.reportChanges;
      const dailyEnabled = b.dailyEnabled !== undefined ? Boolean(b.dailyEnabled) : cur.dailyEnabled;
      await db.run(
        `INSERT INTO user_settings (user_id, skip_confirm, report_changes, daily_enabled, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET skip_confirm = EXCLUDED.skip_confirm, report_changes = EXCLUDED.report_changes, daily_enabled = EXCLUDED.daily_enabled, updated_at = EXCLUDED.updated_at`,
        [req.user.id, skipConfirm ? 1 : 0, reportChanges ? 1 : 0, dailyEnabled ? 1 : 0, new Date().toISOString()]
      );
      log.log('user_settings', `${req.user.nickname} skipConfirm=${skipConfirm} reportChanges=${reportChanges} dailyEnabled=${dailyEnabled}`);
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

  return r;
};
