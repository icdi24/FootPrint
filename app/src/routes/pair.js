// 绑定系统：组状态、邀请码、单方解绑、在途事项收口、审计。
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

  async function statusFor(userId) {
    const pid = await currentPairId(db, userId);
    if (!pid) {
      return { paired: false, pairId: null, partner: null, memberCount: 0, canInvite: true, events: [] };
    }
    const pair = await db.get('SELECT * FROM pairs WHERE id = ?', [pid]);
    const members = await db.all('SELECT user_id FROM pair_members WHERE pair_id = ?', [pid]);
    const partner = await pairOf(db, userId);
    const events = await db.all(
      'SELECT e.*, u.nickname FROM pair_events e JOIN users u ON u.id = e.user_id WHERE e.pair_id = ? ORDER BY e.id DESC LIMIT 5',
      [pid]
    );
    return {
      paired: true,
      pairId: pid,
      status: pair ? pair.status : 'active',
      partner: partner ? { id: partner.id, nickname: partner.nickname, avatar: partner.avatar } : null,
      memberCount: members.length,
      canInvite: !partner && members.length < 2 && (!pair || pair.status === 'active'),
      events: events.map((e) => ({ id: e.id, action: e.action, detail: e.detail, nickname: e.nickname, createdAt: e.created_at })),
    };
  }

  r.get('/pair/status', mw.requireUser, async (req, res, next) => {
    try { res.json(await statusFor(req.user.id)); } catch (e) { next(e); }
  });

  // 无组时自动建新组（解绑后可立刻重组，无冷却）
  r.post('/pair/invite', mw.requireUser, async (req, res, next) => {
    try {
      let pid = await currentPairId(db, req.user.id);
      if (!pid) {
        const info = await db.run("INSERT INTO pairs (status, created_at) VALUES ('active', ?) RETURNING id", [nowIso()]);
        pid = Number(info.id);
        await db.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)', [pid, req.user.id, nowIso()]);
        await db.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
          [pid, req.user.id, 'create_pair', '新建组', nowIso()]);
      }
      const members = await db.all('SELECT user_id FROM pair_members WHERE pair_id = ?', [pid]);
      if (members.length >= 2) return res.status(400).json({ error: '组里已经有 2 个人了，先解绑才能邀请新人' });
      const pair = await db.get('SELECT status FROM pairs WHERE id = ?', [pid]);
      if (!pair || pair.status !== 'active') return res.status(400).json({ error: '组已失效' });
      const code = crypto.randomBytes(6).toString('hex').toUpperCase();
      const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600 * 1000).toISOString();
      await db.run(
        'INSERT INTO pair_invites (code, pair_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        [code, pid, req.user.id, nowIso(), expiresAt]
      );
      await db.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
        [pid, req.user.id, 'invite', `生成邀请码 ${code}`, nowIso()]);
      res.json({ code, expiresAt, pairId: pid });
    } catch (e) { next(e); }
  });

  r.get('/pair/invites', mw.requireUser, async (req, res, next) => {
    try {
      const pid = await currentPairId(db, req.user.id);
      if (!pid) return res.json({ invites: [] });
      const rows = await db.all(
        `SELECT code, created_at, expires_at FROM pair_invites
         WHERE pair_id = ? AND created_by = ? AND used_by IS NULL AND revoked_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC`,
        [pid, req.user.id, nowIso()]
      );
      res.json({ invites: rows });
    } catch (e) { next(e); }
  });

  r.post('/pair/invite/:code/revoke', mw.requireUser, async (req, res, next) => {
    try {
      const code = String(req.params.code || '').trim().toUpperCase();
      const inv = await db.get('SELECT * FROM pair_invites WHERE code = ?', [code]);
      if (!inv) return res.status(404).json({ error: '邀请码不存在' });
      if (Number(inv.created_by) !== Number(req.user.id)) return res.status(403).json({ error: '只能撤销自己生成的邀请码' });
      if (inv.used_by) return res.status(400).json({ error: '邀请码已被使用' });
      if (inv.revoked_at) return res.json({ ok: true });
      await db.run('UPDATE pair_invites SET revoked_at = ? WHERE code = ?', [nowIso(), code]);
      await db.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
        [inv.pair_id, req.user.id, 'revoke', `撤销邀请码 ${code}`, nowIso()]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // 单方发起即生效、无冷却；数据不删，只断关系 + 作废在途事项
  r.post('/pair/unbind', mw.requireUser, async (req, res, next) => {
    try {
      const pid = await currentPairId(db, req.user.id);
      if (!pid) return res.status(400).json({ error: '还没有加入任何组' });
      const partner = await pairOf(db, req.user.id);
      const now = nowIso();
      let cancelledVerifications = 0;
      let refunded = 0;

      await tx(db, async (c) => {
        // 1) 该组未使用的邀请码全部作废
        await c.run('UPDATE pair_invites SET revoked_at = ? WHERE pair_id = ? AND used_by IS NULL AND revoked_at IS NULL',
          [now, pid]);
        // 2) 在途验收作废，目标回 active
        const vs = await c.all("SELECT id, goal_id FROM verifications WHERE pair_id = ? AND status = 'pending'", [pid]);
        for (const v of vs) {
          await c.run("UPDATE verifications SET status = 'cancelled', reason = '解绑作废', decided_at = ? WHERE id = ?",
            [now, v.id]);
          await c.run("UPDATE goals SET status = 'active' WHERE id = ? AND status = 'reviewing'", [v.goal_id]);
          cancelledVerifications += 1;
        }
        // 3) 已确认未完成的兑换：写冲销流水（只增不改）+ 标记取消
        //    注意：兑换入口 wish.js 提交即写 'confirmed'，项目里不存在 'applied' 状态，
        //    这里必须查 'confirmed'（在途）而非 'applied'，否则永远退不到分
        const reds = await c.all("SELECT * FROM redemptions WHERE pair_id = ? AND status = 'confirmed'", [pid]);
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
        // 4) 断开关系：这是严格 2 人组，单方解绑即解散整组，
        //    必须把双方都从 pair_members 移除并把组置 dissolved。
        //    否则另一方会留在「有组但没搭档」的幽灵状态：
        //    currentPairId 仍非空 → 系统当成「已绑定」，既看不到搭档、又发不了大厅。
        await c.run('DELETE FROM pair_members WHERE pair_id = ?', [pid]);
        await c.run("UPDATE pairs SET status = 'dissolved', dissolved_at = ? WHERE id = ?", [now, pid]);
        // 5) 审计
        await c.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
          [pid, req.user.id, 'unbind',
            `与 ${partner ? partner.nickname : '搭档'} 解绑；作废验收 ${cancelledVerifications} 条、退分兑换 ${refunded} 笔`, now]);
      });
      log.log('pair_unbind', `${req.user.nickname} 退出组 ${pid}`);
      res.json({ ok: true, pairId: pid, formerPartner: partner ? partner.nickname : null, cancelledVerifications, refunded });
    } catch (e) { next(e); }
  });

  return r;
};
