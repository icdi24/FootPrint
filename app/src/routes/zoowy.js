const express = require('express');
const { makeMiddleware } = require('../middleware');
const { runChat, acceptOffer, confirmChatDraft, listPreferences, removePreference } = require('../agent/workflows/chat');
const { getDraft } = require('../agent/workflows/planning');
const { recentMessages } = require('../agent/session');
const { loadDeepSeekSettings } = require('../agent/deepseek-settings');
const { AiError } = require('../ai');
const { compactChat } = require('../agent/chat-context');
const { cancelTurn, validRequestId, turnError } = require('../agent/zoowy-turns');

module.exports = function zoowyRoutes(db) {
  const r = express.Router();
  const { requireUser } = makeMiddleware(db);
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
        return res.status(error.status).json({ error: error.message, ...(error.code === 'context_budget' ? { code: error.code } : {}) });
      }
      next(error);
    }
  };
  const requireJson = (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ error: '请发送 JSON 请求' });
    next();
  };

  r.post('/zoowy/chat', requireUser, requireJson, handle(async (req, userId) => {
    const b = req.body || {};
    const message = typeof b.message === 'string' ? b.message.trim() : '';
    const requestId = typeof b.requestId === 'string' ? b.requestId : '';
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) throw Object.assign(new Error('缺少有效的消息编号'), { status: 400 });
    if (['deepThinking', 'smartSearch'].some((key) => b[key] !== undefined && typeof b[key] !== 'boolean')) {
      throw Object.assign(new Error('聊天开关需要布尔值'), { status: 400 });
    }
    if ((!message && !b.attachmentId) || message.length > 2000 || !message.isWellFormed() || message.includes('\0')) {
      throw Object.assign(new Error('请输入消息或附上图片，文字最多 2000 字'), { status: 400 });
    }
    const attachmentId = b.attachmentId ?? null;
    if (attachmentId !== null && (!Number.isInteger(attachmentId) || attachmentId < 1 || attachmentId > 2147483647)) {
      throw Object.assign(new Error('图片编号无效'), { status: 400 });
    }
    const providerConfig = await loadDeepSeekSettings(db, userId);
    if (!providerConfig) throw Object.assign(new Error('请先在 zoowy 设置中填写你的 DeepSeek API Key'), { status: 503 });
    if (attachmentId && providerConfig.model !== 'deepseek-flash') {
      throw Object.assign(new Error('请切换到 DeepSeek Flash 后发送图片'), { status: 400 });
    }
    const bigGoalId = b.big_goal_id ?? null;
    if (bigGoalId !== null && (!Number.isInteger(bigGoalId) || bigGoalId < 1 || bigGoalId > 2147483647)) {
      throw Object.assign(new Error('大目标编号无效'), { status: 400 });
    }
    return runChat({ db, userId, message, requestId, attachmentId, providerConfig, bigGoalId,
      deepThinking: b.deepThinking, smartSearch: b.smartSearch });
  }));

  r.post('/zoowy/compact', requireUser, requireJson, handle(async (req, userId) => {
    const requestId = req.body?.requestId;
    if (!validRequestId(requestId)) throw turnError(400, '缺少有效的请求编号');
    const providerConfig = await loadDeepSeekSettings(db, userId);
    if (!providerConfig) throw turnError(503, '请先在 zoowy 设置中填写你的 DeepSeek API Key');
    return compactChat({ db, userId, requestId, providerConfig });
  }));

  r.post('/zoowy/turns/:requestId/cancel', requireUser, requireJson, handle(async (req, userId) => ({
    cancelled: await cancelTurn(db, userId, req.params.requestId),
  })));

  r.get('/zoowy/messages', requireUser, handle(async (req, userId) => {
    const limit = Math.trunc(Math.max(1, Math.min(100, Number(req.query.limit) || 40)));
    const { session, messages } = await recentMessages(db, userId, limit);
    const drafts = new Map();
    return { sessionId: session.id, messages: await Promise.all(messages.map(async (m) => {
      let meta;
      try { meta = JSON.parse(m.meta); } catch { meta = {}; }
      const cards = Array.isArray(meta?.cards) ? meta.cards : [];
      return { role: m.role, content: m.content, createdAt: m.created_at, attachmentId: meta?.attachmentId,
        sources: Array.isArray(meta?.sources) ? meta.sources : [],
        cards: await Promise.all(cards.map(async (card) => {
          if (card?.type !== 'plan_draft' || !card.draft?.id) return card;
          const id = card.draft.id;
          if (!drafts.has(id)) drafts.set(id, getDraft(db, userId, id));
          const live = await drafts.get(id);
          return live?.revision === card.draft.revision ? { ...card, draft: live } : card;
        })) };
    })) };
  }));

  r.post('/zoowy/offers/:id/accept', requireUser, requireJson, handle(async (req, userId) => ({
    card: await acceptOffer(db, userId, Number(req.params.id), req.body?.requestId),
  })));
  r.post('/zoowy/drafts/:id/confirm', requireUser, requireJson, handle(async (req, userId) => ({
    card: await confirmChatDraft(db, userId, Number(req.params.id), req.body?.revision),
  })));
  r.get('/zoowy/preferences', requireUser, handle(async (_req, userId) => ({ preferences: await listPreferences(db, userId) })));
  r.delete('/zoowy/preferences/:key', requireUser, handle(async (req, userId) => ({
    preferences: await removePreference(db, userId, req.params.key),
  })));
  return r;
};
