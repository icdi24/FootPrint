// 绑定系统：邀请码绑人、双方确认配对、组状态、单方解绑、在途事项收口、审计。
const express = require('express');
const crypto = require('crypto');
const { tx } = require('../db');
const { currentPairId, pairOf } = require('../pair');
const { nowIso } = require('../tz');
const log = require('../log');

const INVITE_HOURS = 24;

module.exports = function pairRoutes(db) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);

  function publicUser(u) {
    return { id: u.id, username: u.login_name, avatar: u.avatar };
  }

  function newCode() {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
  }

  // 本人当前有效码：未使用、未撤销、未过期（不管是否已有人申请）
  async function currentInvite(userId) {
    return db.get(
      `SELECT * FROM pair_invites
       WHERE created_by = ? AND used_by IS NULL AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      [userId, nowIso()]
    );
  }

  // 取码：没有 / 过期就自动生成一枚（一人一码）。码绑人，pair_id 为 NULL。
  async function ensureInvite(userId) {
    const cur = await currentInvite(userId);
    if (cur) return cur;
    const code = newCode();
    const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600 * 1000).toISOString();
    await db.run(
      'INSERT INTO pair_invites (code, pair_id, created_by, created_at, expires_at) VALUES (?, NULL, ?, ?, ?)',
      [code, userId, nowIso(), expiresAt]
    );
    return { code, expires_at: expiresAt };
  }

  async function revokeMyInvites(userId) {
    await db.run(
      'UPDATE pair_invites SET revoked_at = ? WHERE created_by = ? AND used_by IS NULL AND revoked_at IS NULL',
      [nowIso(), userId]
    );
  }

  async function isPaired(userId) {
    return !!(await currentPairId(db, userId));
  }

  // 待确认请求是否仍有效（与码同寿命，24h）
  function reqAlive(inv) {
    if (!inv || !inv.requested_by) return false;
    if (inv.revoked_at || inv.used_by) return false;
    return new Date(inv.expires_at).getTime() >= Date.now();
  }

  async function statusFor(userId) {
    let pid = await currentPairId(db, userId);
    // 僵尸关系：解绑后另一方仍留在 pair_members 里（组里只剩自己）。
    // 视为未配对并顺手清理，让双方都能重新生成邀请码配对；历史业务数据不动。
    if (pid && !(await pairOf(db, userId))) {
      await db.run('DELETE FROM pair_members WHERE user_id = ?', [userId]);
      const left = await db.get('SELECT COUNT(*) AS c FROM pair_members WHERE pair_id = ?', [pid]);
      if (Number(left.c) === 0) {
        await db.run("UPDATE pairs SET status = 'dissolved', dissolved_at = ? WHERE id = ? AND status = 'active'",
          [nowIso(), pid]);
      }
      pid = null;
    }
    if (!pid) {
      const inv = await ensureInvite(userId);
      // 别人申请了我的码
      const pendingRows = await db.all(
        `SELECT i.*, u.id AS uid, u.login_name, u.avatar FROM pair_invites i
         JOIN users u ON u.id = i.requested_by
         WHERE i.created_by = ? AND i.requested_by IS NOT NULL AND i.used_by IS NULL AND i.revoked_at IS NULL`,
        [userId]
      );
      const pendingList = pendingRows.filter(reqAlive).map((x) => ({
        id: x.code,
        requester: { id: x.uid, username: x.login_name, avatar: x.avatar },
        requestedAt: x.requested_at,
      }));
      // 我申请了别人的码
      const myRows = await db.all(
        `SELECT i.*, u.id AS uid, u.login_name, u.avatar FROM pair_invites i
         JOIN users u ON u.id = i.created_by
         WHERE i.requested_by = ? AND i.used_by IS NULL AND i.revoked_at IS NULL`,
        [userId]
      );
      const myList = myRows.filter(reqAlive).map((x) => ({
        id: x.code,
        owner: { id: x.uid, username: x.login_name, avatar: x.avatar },
        requestedAt: x.requested_at,
      }));
      return {
        paired: false, pairId: null, partner: null, memberCount: 0, canInvite: true,
        myCode: { code: inv.code, expiresAt: inv.expires_at },
        pendingRequest: pendingList[0] || null,
        myRequest: myList[0] || null,
        events: [],
      };
    }
    const pair = await db.get('SELECT * FROM pairs WHERE id = ?', [pid]);
    const members = await db.all('SELECT user_id FROM pair_members WHERE pair_id = ?', [pid]);
    const partner = await pairOf(db, userId);
    const events = await db.all(
      'SELECT e.*, u.login_name AS username FROM pair_events e JOIN users u ON u.id = e.user_id WHERE e.pair_id = ? ORDER BY e.id DESC LIMIT 5',
      [pid]
    );
    return {
      paired: true,
      pairId: pid,
      status: pair ? pair.status : 'active',
      partner: partner ? publicUser(partner) : null,
      memberCount: members.length,
      canInvite: false,
      myCode: null,
      pendingRequest: null,
      myRequest: null,
      events: events.map((e) => ({ id: e.id, action: e.action, detail: e.detail, username: e.username, createdAt: e.created_at })),
    };
  }

  r.get('/pair/status', mw.requireUser, async (req, res, next) => {
    try { res.json(await statusFor(req.user.id)); } catch (e) { next(e); }
  });

  // 取当前有效码（没有 / 过期则自动补一枚）；不再自动建组
  r.post('/pair/invite', mw.requireUser, async (req, res, next) => {
    try {
      if (await isPaired(req.user.id)) return res.status(400).json({ error: '已经配对了，不需要邀请码' });
      const inv = await ensureInvite(req.user.id);
      res.json({ code: inv.code, expiresAt: inv.expires_at });
    } catch (e) { next(e); }
  });

  r.get('/pair/invites', mw.requireUser, async (req, res, next) => {
    try {
      const inv = await currentInvite(req.user.id);
      res.json({ invite: inv ? { code: inv.code, createdAt: inv.created_at, expiresAt: inv.expires_at } : null });
    } catch (e) { next(e); }
  });

  // 换一个码：撤销本人所有未使用码，并立即补一枚新的
  r.post('/pair/invite/:code/revoke', mw.requireUser, async (req, res, next) => {
    try {
      const code = String(req.params.code || '').trim().toUpperCase();
      const inv = await db.get('SELECT * FROM pair_invites WHERE code = ?', [code]);
      if (!inv) return res.status(404).json({ error: '邀请码不存在' });
      if (Number(inv.created_by) !== Number(req.user.id)) return res.status(403).json({ error: '只能换自己的邀请码' });
      if (inv.used_by) return res.status(400).json({ error: '邀请码已被使用' });
      await revokeMyInvites(req.user.id);
      const nextInv = await ensureInvite(req.user.id);
      await db.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
        [0, req.user.id, 'revoke', `换掉邀请码 ${code}`, nowIso()]);
      log.log('pair_revoke', `${req.user.login_name} 换掉邀请码 ${code}`);
      res.json({ ok: true, code: nextInv.code, expiresAt: nextInv.expires_at });
    } catch (e) { next(e); }
  });

  // 输入对方的码：只生成待确认请求，不建组
  r.post('/pair/join', mw.requireUser, async (req, res, next) => {
    try {
      const code = String((req.body && req.body.code) || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: '请填邀请码' });
      const inv = await db.get('SELECT * FROM pair_invites WHERE code = ?', [code]);
      if (!inv) return res.status(400).json({ error: '邀请码不对' });
      if (inv.revoked_at) return res.status(400).json({ error: '邀请码已撤销' });
      if (inv.used_by) return res.status(400).json({ error: '邀请码已被使用' });
      if (new Date(inv.expires_at).getTime() < Date.now()) return res.status(400).json({ error: '邀请码已过期' });
      if (Number(inv.created_by) === Number(req.user.id)) return res.status(400).json({ error: '不能输入自己的邀请码' });
      if (inv.requested_by) return res.status(400).json({ error: '这个码已有人申请，请等对方处理' });
      if (await isPaired(req.user.id)) return res.status(400).json({ error: '你已经配对了' });
      if (await isPaired(inv.created_by)) return res.status(400).json({ error: '对方已经配对了' });
      const mine = await db.get(
        'SELECT code FROM pair_invites WHERE requested_by = ? AND used_by IS NULL AND revoked_at IS NULL LIMIT 1',
        [req.user.id]
      );
      if (mine) return res.status(400).json({ error: '你已有待确认的申请，先撤回再试' });
      await db.run('UPDATE pair_invites SET requested_by = ?, requested_at = ? WHERE code = ?',
        [req.user.id, nowIso(), code]);
      await db.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
        [0, req.user.id, 'pair_request', `申请用码 ${code} 配对`, nowIso()]);
      log.log('pair_request', `${req.user.login_name} 申请用码 ${code} 配对`);
      res.json({ ok: true, code });
    } catch (e) { next(e); }
  });

  // 发码人同意：此刻才建组，两人一起入组；双方未使用码全部作废
  r.post('/pair/request/:id/approve', mw.requireUser, async (req, res, next) => {
    try {
      const code = String(req.params.id || '').trim().toUpperCase();
      const inv = await db.get('SELECT * FROM pair_invites WHERE code = ?', [code]);
      if (!inv) return res.status(404).json({ error: '申请不存在' });
      if (Number(inv.created_by) !== Number(req.user.id)) return res.status(403).json({ error: '只能确认发给自己的申请' });
      if (!reqAlive(inv)) return res.status(400).json({ error: '申请已失效' });
      if (await isPaired(req.user.id)) return res.status(400).json({ error: '你已经配对了' });
      if (await isPaired(inv.requested_by)) return res.status(400).json({ error: '对方已经配对了' });
      const now = nowIso();
      let pairId;
      await tx(db, async (c) => {
        const info = await c.run("INSERT INTO pairs (status, created_at) VALUES ('active', ?) RETURNING id", [now]);
        pairId = Number(info.id);
        await c.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)', [pairId, req.user.id, now]);
        await c.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)', [pairId, inv.requested_by, now]);
        await c.run('UPDATE pair_invites SET used_by = ?, used_at = ? WHERE code = ?', [inv.requested_by, now, code]);
        await c.run('UPDATE pair_invites SET revoked_at = ? WHERE created_by IN (?, ?) AND used_by IS NULL AND revoked_at IS NULL',
          [now, req.user.id, inv.requested_by]);
        await c.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
          [pairId, req.user.id, 'pair_approve', `同意配对，建组 ${pairId}`, now]);
        await c.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
          [pairId, inv.requested_by, 'pair_join', `加入组 ${pairId}`, now]);
      });
      log.log('pair_approve', `${req.user.login_name} 同意配对，建组 ${pairId}`);
      res.json({ ok: true, pairId });
    } catch (e) { next(e); }
  });

  // 发码人拒绝
  r.post('/pair/request/:id/reject', mw.requireUser, async (req, res, next) => {
    try {
      const code = String(req.params.id || '').trim().toUpperCase();
      const inv = await db.get('SELECT * FROM pair_invites WHERE code = ?', [code]);
      if (!inv) return res.status(404).json({ error: '申请不存在' });
      if (Number(inv.created_by) !== Number(req.user.id)) return res.status(403).json({ error: '只能拒绝发给自己的申请' });
      await db.run('UPDATE pair_invites SET requested_by = NULL, requested_at = NULL WHERE code = ?', [code]);
      log.log('pair_reject', `${req.user.login_name} 拒绝配对申请 ${code}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 申请人撤回
  r.delete('/pair/request/:id', mw.requireUser, async (req, res, next) => {
    try {
      const code = String(req.params.id || '').trim().toUpperCase();
      const inv = await db.get('SELECT * FROM pair_invites WHERE code = ?', [code]);
      if (!inv) return res.status(404).json({ error: '申请不存在' });
      if (Number(inv.requested_by) !== Number(req.user.id)) return res.status(403).json({ error: '只能撤回自己的申请' });
      await db.run('UPDATE pair_invites SET requested_by = NULL, requested_at = NULL WHERE code = ?', [code]);
      log.log('pair_request_cancel', `${req.user.login_name} 撤回配对申请 ${code}`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 单方发起即生效、无冷却；数据不删，只断关系 + 作废在途事项。
  // 收口改按 user_id（配对前产生的数据 pair_id 为 NULL，不能靠组号扫）
  r.post('/pair/unbind', mw.requireUser, async (req, res, next) => {
    try {
      const pid = await currentPairId(db, req.user.id);
      if (!pid) return res.status(400).json({ error: '还没有加入任何组' });
      const partner = await pairOf(db, req.user.id);
      const now = nowIso();
      const memberIds = [req.user.id, partner ? partner.id : -1];
      let cancelledVerifications = 0;
      let refunded = 0;

      await tx(db, async (c) => {
        // 1) 双方未使用的邀请码全部作废
        await c.run('UPDATE pair_invites SET revoked_at = ? WHERE created_by IN (?, ?) AND used_by IS NULL AND revoked_at IS NULL',
          [now, ...memberIds]);
        // 2) 在途验收作废，目标回 active（verifications 没有 user_id，按 submitter/reviewer 收口）
        const vs = await c.all(
          "SELECT id, goal_id FROM verifications WHERE (submitter_id IN (?, ?) OR reviewer_id IN (?, ?)) AND status = 'pending'",
          [...memberIds, ...memberIds]
        );
        for (const v of vs) {
          await c.run("UPDATE verifications SET status = 'cancelled', reason = '解绑作废', decided_at = ? WHERE id = ?",
            [now, v.id]);
          await c.run("UPDATE goals SET status = 'active' WHERE id = ? AND status = 'reviewing'", [v.goal_id]);
          cancelledVerifications += 1;
        }
        // 3) 已锁分未确认的兑换：写冲销流水（只增不改）+ 标记取消
        const reds = await c.all("SELECT * FROM redemptions WHERE user_id IN (?, ?) AND status = 'applied'", memberIds);
        for (const red of reds) {
          const bal = await c.get('SELECT COALESCE(SUM(delta),0) AS b FROM point_ledger WHERE user_id = ?', [red.user_id]);
          const after = Number(bal.b) + Number(red.points_locked);
          await c.run(
            `INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, pair_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [red.user_id, red.points_locked, after, 'redeem_refund', 'redemption', red.id, '解绑作废退分', pid, now]
          );
          await c.run("UPDATE redemptions SET status = 'cancelled' WHERE id = ?", [red.id]);
          refunded += 1;
        }
        // 4) 断开关系：组是两人的，一方解绑即整组解散，双方一起退出。
        //    只删自己会让另一方留在单人组里，出现「有组无搭档」的僵尸状态，无法重新配对。
        await c.run('DELETE FROM pair_members WHERE user_id IN (?, ?)', memberIds);
        await c.run("UPDATE pairs SET status = 'dissolved', dissolved_at = ? WHERE id = ?", [now, pid]);
        // 5) 审计
        await c.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
          [pid, req.user.id, 'unbind',
            `与 ${partner ? partner.login_name : '搭档'} 解绑；作废验收 ${cancelledVerifications} 条、退分兑换 ${refunded} 笔`, now]);
      });
      log.log('pair_unbind', `${req.user.login_name} 退出组 ${pid}`);
      res.json({ ok: true, pairId: pid, formerPartner: partner ? partner.login_name : null, cancelledVerifications, refunded });
    } catch (e) { next(e); }
  });

  return r;
};
