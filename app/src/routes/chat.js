// 搭子私聊路由：消息历史、发送、标记已读。实时送达走 WebSocket（见 ../ws.js）。
const express = require('express');
const { makeMiddleware } = require('../middleware');
const { nowIso } = require('../tz');

const MAX_LEN = 2000;

module.exports = function chatRoutes(db) {
  const r = express.Router();
  const mw = makeMiddleware(db);
  const { notifyUser } = require('../ws'); // 延迟 require，避免加载顺序耦合

  const toMsg = (m) => ({
    id: m.id,
    senderId: m.sender_id,
    content: m.content,
    createdAt: m.created_at,
    readAt: m.read_at || null,
  });

  // GET /chat → { partner|null, unread, messages:[升序最近40条] }
  r.get('/chat', mw.requireUser, async (req, res, next) => {
    try {
      const pid = await mw.currentPairId(req.user.id);
      const partner = await mw.partnerOf(req.user.id);
      let unread = 0;
      if (partner) {
        unread = Number((await db.get(
          'SELECT COUNT(*)::int AS c FROM pair_messages WHERE pair_id = ? AND sender_id = ? AND read_at IS NULL',
          [pid, partner.id]
        )).c);
      }
      let messages = [];
      if (pid) {
        const rows = await db.all('SELECT * FROM pair_messages WHERE pair_id = ? ORDER BY id DESC LIMIT ?', [pid, 40]);
        messages = rows.reverse().map(toMsg);
      }
      res.json({
        partner: partner ? { id: partner.id, nickname: partner.nickname, avatar: partner.avatar } : null,
        unread,
        messages,
      });
    } catch (e) { next(e); }
  });

  // GET /chat/messages?before=<id>&limit=40 → 更早的历史（升序）
  r.get('/chat/messages', mw.requireUser, async (req, res, next) => {
    try {
      const pid = await mw.currentPairId(req.user.id);
      if (!pid) return res.json({ messages: [] });
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 40));
      const before = Number(req.query.before) || 0;
      const rows = await db.all(
        'SELECT * FROM pair_messages WHERE pair_id = ? AND id < ? ORDER BY id DESC LIMIT ?',
        [pid, before, limit]
      );
      res.json({ messages: rows.reverse().map(toMsg) });
    } catch (e) { next(e); }
  });

  // POST /chat/messages { content } → 写入 + 推送搭档 + 同步自己其它标签页
  r.post('/chat/messages', mw.requireUser, async (req, res, next) => {
    try {
      const pid = await mw.currentPairId(req.user.id);
      if (!pid) return res.status(400).json({ error: '还没有搭档' });
      const partner = await mw.partnerOf(req.user.id);
      if (!partner) return res.status(400).json({ error: '对方已离开，无法发消息' });
      const content = String((req.body && req.body.content) || '').trim();
      if (!content) return res.status(400).json({ error: '消息不能为空' });
      if (content.length > MAX_LEN) return res.status(400).json({ error: `消息最多 ${MAX_LEN} 字` });

      const info = await db.run(
        'INSERT INTO pair_messages (pair_id, sender_id, content, created_at) VALUES (?, ?, ?, ?) RETURNING id',
        [pid, req.user.id, content, nowIso()]
      );
      const row = await db.get('SELECT * FROM pair_messages WHERE id = ?', [Number(info.id)]);
      const msg = toMsg(row);

      // 推给搭档：带搭档视角的未读数（= 我发给搭档、搭档还没读的消息数）
      const unread = Number((await db.get(
        'SELECT COUNT(*)::int AS c FROM pair_messages WHERE pair_id = ? AND sender_id = ? AND read_at IS NULL',
        [pid, req.user.id]
      )).c);
      notifyUser(partner.id, { type: 'message', message: msg, unread });
      // 同步发送者其它标签页（不带 unread，避免误改发送者红点）
      notifyUser(req.user.id, { type: 'message', message: msg });

      res.json({ message: msg });
    } catch (e) { next(e); }
  });

  // POST /chat/read { upToId? } → 标记搭档发来的消息已读
  r.post('/chat/read', mw.requireUser, async (req, res, next) => {
    try {
      const pid = await mw.currentPairId(req.user.id);
      const partner = await mw.partnerOf(req.user.id);
      if (!pid || !partner) return res.json({ ok: true });
      const now = nowIso();
      const upTo = Number((req.body && req.body.upToId)) || 0;
      if (upTo > 0) {
        await db.run(
          'UPDATE pair_messages SET read_at = ? WHERE pair_id = ? AND sender_id = ? AND read_at IS NULL AND id <= ?',
          [now, pid, partner.id, upTo]
        );
      } else {
        await db.run(
          'UPDATE pair_messages SET read_at = ? WHERE pair_id = ? AND sender_id = ? AND read_at IS NULL',
          [now, pid, partner.id]
        );
      }
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
};
