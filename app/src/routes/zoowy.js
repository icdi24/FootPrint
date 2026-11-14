// zoowy 常驻问答接口（zoowy v2）。
// 第一批 5 个接口；账号级 Key 录入、图片/搜索/压缩摘要/偏好接口均不提供。
const express = require('express');
const { makeMiddleware } = require('../middleware');
const ai = require('../ai');
const { runChat, acceptOffer, confirmChatDraft } = require('../agent/workflows/chat');
const { recentMessages } = require('../agent/session');
const { getDraft } = require('../agent/workflows/planning');
const { cancelTurn, getTurn, validRequestId } = require('../agent/zoowy-turns');
const { clearHistory } = require('../agent/history-privacy');
const path = require('node:path');
const { AiError } = require('../ai');

module.exports = function zoowyRoutes(db) {
  const r = express.Router();
  const mw = makeMiddleware(db);
  const handle = (fn) => async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await fn(req, req.user.id)); }
    catch (error) {
      if (error.kind === 'cancelled' || error.code === 'turn_cancelled') {
        return res.status(409).json({ error: '本轮已停止', code: 'turn_cancelled' });
      }
      if (error instanceof AiError) {
        const status = error.kind === 'timeout' ? 504 : 502;
        return res.status(status).json({ error: error.message });
      }
      if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 503) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  };
  const requireJson = (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ error: '请发送 JSON 请求' });
    next();
  };

  r.post('/zoowy/chat', mw.requireUser, requireJson, handle(async (req, userId) => {
    const b = req.body || {};
    const message = typeof b.message === 'string' ? b.message.trim() : '';
    const requestId = typeof b.requestId === 'string' ? b.requestId : '';
    if (!validRequestId(requestId)) throw Object.assign(new Error('缺少有效的消息编号'), { status: 400 });
    if (!message || message.length > 2000 || !message.isWellFormed() || message.includes('\0')) {
      throw Object.assign(new Error('请输入 1–2000 字消息'), { status: 400 });
    }
    if (!ai.aiAvailable()) throw Object.assign(new Error('AI 未配置，zoowy 不可用'), { status: 503 });
    const bigGoalId = b.big_goal_id ?? null;
    if (bigGoalId !== null && (!Number.isInteger(bigGoalId) || bigGoalId < 1 || bigGoalId > 2147483647)) {
      throw Object.assign(new Error('大目标编号无效'), { status: 400 });
    }
    return runChat({ db, userId, message, requestId, bigGoalId });
  }));

  r.get('/zoowy/messages', mw.requireUser, handle(async (req, userId) => {
    const limit = Math.trunc(Math.max(1, Math.min(100, Number(req.query.limit) || 40)));
    const { session, messages } = await recentMessages(db, userId, limit);
    const drafts = new Map();
    return {
      sessionId: session.id,
      generation: session.generation,
      messages: await Promise.all(messages.map(async (m) => {
        let meta;
        try { meta = JSON.parse(m.meta); } catch (_) { meta = {}; }
        const cards = Array.isArray(meta?.cards) ? meta.cards : [];
        return {
          role: m.role,
          content: m.content,
          tools: meta?.tools || null,
          profileChanges: meta?.profileChanges || null,
          failed: meta?.failed || null,
          report: meta?.report || null,
          degraded: meta?.degraded || false,
          reason: meta?.reason || null,
          createdAt: m.created_at,
          cards: await Promise.all(cards.map(async (card) => {
            if (card?.type !== 'plan_draft' || !card.draft?.id) return card;
            const id = card.draft.id;
            if (!drafts.has(id)) drafts.set(id, getDraft(db, userId, id));
            const live = await drafts.get(id);
            return live?.revision === card.draft.revision ? { ...card, draft: live } : card;
          })),
        };
      })),
    };
  }));

  r.get('/zoowy/turns/:requestId', mw.requireUser, handle((req, userId) => getTurn(db, userId, req.params.requestId)));
  r.post('/zoowy/turns/:requestId/cancel', mw.requireUser, requireJson, handle((req, userId) => cancelTurn(db, userId, req.params.requestId)));
  r.delete('/zoowy/history', mw.requireUser, requireJson, handle((req, userId) => clearHistory(db, userId,
    process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', '..', 'data'))));

  r.post('/zoowy/offers/:id/accept', mw.requireUser, requireJson, handle(async (req, userId) => ({
    card: await acceptOffer(db, userId, Number(req.params.id), req.body?.requestId, req.body?.revision),
  })));

  r.post('/zoowy/drafts/:id/confirm', mw.requireUser, requireJson, handle(async (req, userId) => ({
    card: await confirmChatDraft(db, userId, Number(req.params.id), req.body?.revision),
  })));

  return r;
};
