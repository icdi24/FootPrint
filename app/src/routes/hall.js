// 匹配大厅：无搭子用户发布找搭子信息、浏览、互相邀请组队。
// 组队复用 pairs/pair_members（严格 2 人），但走「已登录账号互邀」而非邀请码注册。
const express = require('express');
const { makeMiddleware } = require('../middleware');
const { currentPairId } = require('../pair');
const { nowIso } = require('../tz');
const { tx } = require('../db');

const MAX_NOTE = 200;

const httpError = (status, message) => Object.assign(new Error(message), { status });

const userBrief = (u) => ({ id: u.id, nickname: u.nickname, avatar: u.avatar });

// 该用户当前 active 的日常/小目标摘要（最多 5 条），发布时快照。
async function goalSummaryOf(db, uid) {
  const rows = await db.all(
    "SELECT emoji, title FROM goals WHERE owner_id = ? AND status = 'active' AND type IN ('daily','stage') ORDER BY id LIMIT 5",
    [uid]
  );
  return rows.map((g) => `${g.emoji || '🎯'} ${g.title}`).join(' · ');
}

module.exports = function hallRoutes(db) {
  const r = express.Router();
  const mw = makeMiddleware(db);

  const isPaired = async (uid) => (await currentPairId(db, uid)) != null;

  const toListing = (row, relation) => ({
    userId: row.user_id,
    nickname: row.nickname,
    avatar: row.avatar,
    note: row.note,
    goalSummary: row.goal_summary,
    createdAt: row.created_at,
    relation,
  });

  // GET /hall → 我的发布 + 收/发邀请 + 大厅列表（一次性返回，前端一把刷）
  r.get('/hall', mw.requireUser, async (req, res, next) => {
    try {
      const me = req.user.id;
      const mine = await db.get(
        "SELECT note, goal_summary, created_at, status FROM hall_listings WHERE user_id = ? AND status = 'active'",
        [me]
      );

      const [incomingRows, outgoingRows] = await Promise.all([
        db.all("SELECT id, from_user_id, created_at FROM hall_invites WHERE to_user_id = ? AND status = 'pending' ORDER BY id DESC", [me]),
        db.all("SELECT id, to_user_id, created_at FROM hall_invites WHERE from_user_id = ? AND status = 'pending' ORDER BY id DESC", [me]),
      ]);

      // 收/发邀请补全对方昵称头像
      const incoming = [];
      for (const inv of incomingRows) {
        const u = await db.get('SELECT id, nickname, avatar FROM users WHERE id = ?', [inv.from_user_id]);
        if (u) incoming.push({ id: inv.id, fromUser: userBrief(u), createdAt: inv.created_at });
      }
      const outgoing = [];
      for (const inv of outgoingRows) {
        const u = await db.get('SELECT id, nickname, avatar FROM users WHERE id = ?', [inv.to_user_id]);
        if (u) outgoing.push({ id: inv.id, toUser: userBrief(u), createdAt: inv.created_at });
      }

      const rows = await db.all(
        `SELECT l.user_id, l.note, l.goal_summary, l.created_at, u.nickname, u.avatar
         FROM hall_listings l
         JOIN users u ON u.id = l.user_id
         WHERE l.status = 'active' AND l.user_id != ?
           AND NOT EXISTS (SELECT 1 FROM pair_members pm WHERE pm.user_id = l.user_id)
         ORDER BY l.updated_at DESC`,
        [me]
      );

      const outIds = new Set(outgoingRows.map((x) => x.to_user_id));
      const inIds = new Set(incomingRows.map((x) => x.from_user_id));
      const listings = rows.map((row) =>
        toListing(row, outIds.has(row.user_id) ? 'invitedByMe' : inIds.has(row.user_id) ? 'invitedMe' : 'none')
      );

      res.json({
        myListing: mine
          ? { note: mine.note, goalSummary: mine.goal_summary, createdAt: mine.created_at }
          : null,
        incoming,
        outgoing,
        listings,
      });
    } catch (e) { next(e); }
  });

  // POST /hall { note } → 发布/更新我的找搭子信息（无搭子才可）
  r.post('/hall', mw.requireUser, async (req, res, next) => {
    try {
      const me = req.user.id;
      if (await isPaired(me)) return res.status(409).json({ error: '你已经绑定搭子，无需发布' });
      const note = String((req.body && req.body.note) || '').trim().slice(0, MAX_NOTE);
      const summary = await goalSummaryOf(db, me);
      const now = nowIso();
      await db.run(
        `INSERT INTO hall_listings (user_id, note, goal_summary, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET note = EXCLUDED.note, goal_summary = EXCLUDED.goal_summary,
           status = 'active', updated_at = EXCLUDED.updated_at`,
        [me, note, summary, now, now]
      );
      res.json({ myListing: { note, goalSummary: summary, createdAt: now } });
    } catch (e) { next(e); }
  });

  // DELETE /hall → 撤回我的发布
  r.delete('/hall', mw.requireUser, async (req, res, next) => {
    try {
      const me = req.user.id;
      await db.run(
        "UPDATE hall_listings SET status = 'withdrawn', updated_at = ? WHERE user_id = ? AND status = 'active'",
        [nowIso(), me]
      );
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // POST /hall/invite { toUserId } → 邀请对方
  r.post('/hall/invite', mw.requireUser, async (req, res, next) => {
    try {
      const me = req.user.id;
      const to = Number((req.body && req.body.toUserId) || 0);
      if (!to || to === me) return res.status(400).json({ error: '目标无效' });
      if (await isPaired(me)) return res.status(409).json({ error: '你已经绑定搭子' });
      const target = await db.get('SELECT id FROM users WHERE id = ?', [to]);
      if (!target) return res.status(404).json({ error: '用户不存在' });
      if (await isPaired(to)) return res.status(400).json({ error: '对方已有搭子' });
      const listing = await db.get("SELECT id FROM hall_listings WHERE user_id = ? AND status = 'active'", [to]);
      if (!listing) return res.status(400).json({ error: '对方不在大厅' });
      const dup = await db.get(
        "SELECT id FROM hall_invites WHERE status = 'pending' AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))",
        [me, to, to, me]
      );
      if (dup) return res.status(409).json({ error: '已有待处理的邀请' });

      const info = await db.run(
        "INSERT INTO hall_invites (from_user_id, to_user_id, status, created_at) VALUES (?, ?, 'pending', ?) RETURNING id",
        [me, to, nowIso()]
      );
      res.json({ id: Number(info.id), toUserId: to });
    } catch (e) { next(e); }
  });

  // POST /hall/invite/:id/accept → 接受，事务化成组
  r.post('/hall/invite/:id/accept', mw.requireUser, async (req, res, next) => {
    try {
      const me = req.user.id;
      const inviteId = Number(req.params.id) || 0;
      const inv = await db.get(
        "SELECT * FROM hall_invites WHERE id = ? AND to_user_id = ? AND status = 'pending'",
        [inviteId, me]
      );
      if (!inv) return res.status(404).json({ error: '邀请不存在或已处理' });
      const from = inv.from_user_id;
      const now = nowIso();

      await tx(db, async (c) => {
        const a = await c.get('SELECT 1 FROM pair_members WHERE user_id = ?', [from]);
        const b = await c.get('SELECT 1 FROM pair_members WHERE user_id = ?', [me]);
        if (a || b) throw httpError(409, '你或对方已经组队');

        const p = await c.run("INSERT INTO pairs (status, created_at) VALUES ('active', ?) RETURNING id", [now]);
        const pid = Number(p.id);
        await c.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)', [pid, from, now]);
        await c.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)', [pid, me, now]);
        await c.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
          [pid, from, 'create_pair', '匹配大厅组队', now]);
        await c.run('INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
          [pid, me, 'accept', '接受匹配大厅邀请', now]);

        await c.run("UPDATE hall_invites SET status = 'accepted', responded_at = ? WHERE id = ?", [now, inviteId]);
        await c.run(
          "UPDATE hall_listings SET status = 'withdrawn', updated_at = ? WHERE user_id IN (?, ?) AND status = 'active'",
          [now, from, me]
        );
        await c.run(
          "UPDATE hall_invites SET status = 'cancelled', responded_at = ? WHERE status = 'pending' AND (from_user_id IN (?, ?) OR to_user_id IN (?, ?))",
          [now, from, me, from, me]
        );
      });

      res.json({ ok: true });
    } catch (e) {
      if (e && e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  });

  // POST /hall/invite/:id/decline → 拒绝收到的邀请
  r.post('/hall/invite/:id/decline', mw.requireUser, async (req, res, next) => {
    try {
      const me = req.user.id;
      const inviteId = Number(req.params.id) || 0;
      const r = await db.run(
        "UPDATE hall_invites SET status = 'declined', responded_at = ? WHERE id = ? AND to_user_id = ? AND status = 'pending'",
        [nowIso(), inviteId, me]
      );
      if (!r.changes) return res.status(404).json({ error: '邀请不存在或已处理' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // POST /hall/invite/:id/cancel → 取消我发出的邀请
  r.post('/hall/invite/:id/cancel', mw.requireUser, async (req, res, next) => {
    try {
      const me = req.user.id;
      const inviteId = Number(req.params.id) || 0;
      const r = await db.run(
        "UPDATE hall_invites SET status = 'cancelled', responded_at = ? WHERE id = ? AND from_user_id = ? AND status = 'pending'",
        [nowIso(), inviteId, me]
      );
      if (!r.changes) return res.status(404).json({ error: '邀请不存在或已处理' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
};
