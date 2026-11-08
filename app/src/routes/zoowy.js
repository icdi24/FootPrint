// zoowy 常驻问答接口（P2-#13 后端部分）：
//  - POST /zoowy/chat：带用户信息的知识库问答（直接拼结构化数据进上下文，不引向量库），
//    保留工具调用能力（chat 白名单），会话落服务端
//  - GET /zoowy/messages：拉自己账号的会话记录（按 user_id 隔离，Web/Android 同一份）
const express = require('express');
const { makeMiddleware } = require('../middleware');
const { runChat } = require('../agent/workflows/chat');
const { ensureSession, recentMessages } = require('../agent/session');

module.exports = function zoowyRoutes(db) {
  const r = express.Router();
  const mw = makeMiddleware(db);

  r.post('/zoowy/chat', mw.requireUser, async (req, res, next) => {
    try {
      if (!process.env.AI_API_KEY) return res.status(503).json({ error: 'AI 未配置，zoowy 不可用' });
      const b = req.body || {};
      const message = String(b.message || '').trim();
      if (!message || message.length > 2000) return res.status(400).json({ error: '消息需为 1–2000 字' });
      const out = await runChat({
        db, userId: req.user.id, message,
        bigGoalId: b.big_goal_id ? Number(b.big_goal_id) : null,
      });
      res.json(out);
    } catch (e) { next(e); }
  });

  r.get('/zoowy/messages', mw.requireUser, async (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 40));
      const { session, messages } = await recentMessages(db, req.user.id, limit);
      res.json({
        sessionId: session.id,
        messages: messages.map((m) => {
          const meta = m.meta ? safeParse(m.meta) : {};
          return {
            role: m.role,
            content: m.content,
            tools: meta.tools || null,
            profileChanges: meta.profileChanges || null,
            createdAt: m.created_at,
          };
        }),
      });
    } catch (e) { next(e); }
  });

  return r;
};

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
