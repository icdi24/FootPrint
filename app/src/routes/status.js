// 状态（微信式）：本人可写，同组搭档可读。
// 存 users.status 单列 JSON，不新增表；NULL = 没设状态。
const express = require('express');
const { nowIso } = require('../tz');

const GROUPS = new Set(['mood', 'work', 'activity', 'rest']);
const LIM = { key: 32, emoji: 12, label: 12, text: 40, at: 40 };

function clean(v, max) {
  if (v === undefined || v === null) return '';
  // 去掉控制字符，前端一律 UI.esc 输出，这里再兜一层长度
  return String(v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function parse(raw) {
  if (!raw) return null;
  let s;
  try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
  if (!s || typeof s !== 'object') return null;
  const label = clean(s.label, LIM.label);
  if (!label) return null;
  return {
    key: clean(s.key, LIM.key),
    emoji: clean(s.emoji, LIM.emoji) || '🐾',
    label,
    text: clean(s.text, LIM.text),
    group: GROUPS.has(s.group) ? s.group : 'mood',
    at: clean(s.at, LIM.at) || null,
  };
}

module.exports = function statusRoutes(db) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);
  const { requireUser } = mw;

  // 一次拿「我的」和「搭档的」，两页共用
  r.get('/status', requireUser, async (req, res, next) => {
    try {
      const mineRow = await db.get('SELECT status FROM users WHERE id = ?', [req.user.id]);
      const partner = await mw.partnerOf(req.user.id);
      let partnerOut = null;
      if (partner) {
        const row = await db.get('SELECT status FROM users WHERE id = ?', [partner.id]);
        partnerOut = {
          username: partner.login_name || partner.nickname,
          avatar: partner.avatar,
          status: parse(row && row.status),
        };
      }
      res.json({ mine: parse(mineRow && mineRow.status), partner: partnerOut });
    } catch (e) { next(e); }
  });

  r.put('/status', requireUser, async (req, res, next) => {
    try {
      const b = req.body || {};
      const label = clean(b.label, LIM.label);
      if (!label) return res.status(400).json({ error: '先选一个状态' });
      const status = {
        key: clean(b.key, LIM.key),
        emoji: clean(b.emoji, LIM.emoji) || '🐾',
        label,
        text: clean(b.text, LIM.text),
        group: GROUPS.has(b.group) ? b.group : 'mood',
        at: nowIso(),
      };
      await db.run('UPDATE users SET status = ? WHERE id = ?', [JSON.stringify(status), req.user.id]);
      res.json({ status });
    } catch (e) { next(e); }
  });

  r.delete('/status', requireUser, async (req, res, next) => {
    try {
      await db.run('UPDATE users SET status = NULL WHERE id = ?', [req.user.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
};
