// AI 日报接口（P2-#12/#14 后端部分）：
//  - 今日日报（Android WorkManager 15 分钟轮询的就是它，P2-#15）
//  - 最近列表、用户修改（user_edited，次日生成新日报不回改昨日）、分享给对方
// 可见性（1.9）：日报全文默认仅自己可见；shared=1 后对方在「我们」页看摘要
const express = require('express');
const { nowIso, todayStr } = require('../tz');
const { makeMiddleware } = require('../middleware');

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00Z').getTime());
}

// 展示版：用户改过用改后版
function view(row) {
  return {
    id: row.id,
    diary_date: row.diary_date,
    content: row.user_edited || row.ai_original,
    edited: Boolean(row.user_edited),
    ai_original: row.ai_original,
    shared: Boolean(row.shared),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = function diariesRoutes(db) {
  const r = express.Router();
  const mw = makeMiddleware(db);

  // 今日日报（没有就是 null；Android 轮询拿这个判断要不要发通知）
  r.get('/diaries/today', mw.requireUser, async (req, res, next) => {
    try {
      const row = await db.get(
        'SELECT * FROM diaries WHERE user_id = ? AND diary_date = ?',
        [req.user.id, todayStr()]
      );
      res.json({ today: todayStr(), diary: row ? view(row) : null });
    } catch (e) { next(e); }
  });

  // 最近列表（自己的）
  r.get('/diaries', mw.requireUser, async (req, res, next) => {
    try {
      const days = Math.max(1, Math.min(31, Number(req.query.days) || 7));
      const rows = await db.all(
        'SELECT * FROM diaries WHERE user_id = ? ORDER BY diary_date DESC LIMIT ?',
        [req.user.id, days]
      );
      res.json({ diaries: rows.map(view) });
    } catch (e) { next(e); }
  });

  // 用户改自己的某天日报（只写 user_edited，ai_original 原样保留）
  r.patch('/diaries/:date', mw.requireUser, async (req, res, next) => {
    try {
      const date = req.params.date;
      if (!isValidDate(date)) return res.status(400).json({ error: '日期格式不对' });
      const text = String((req.body && req.body.user_edited) || '').trim();
      if (!text || text.length > 5000) return res.status(400).json({ error: '日报内容需为 1–5000 字' });
      const row = await db.get('SELECT * FROM diaries WHERE user_id = ? AND diary_date = ?', [req.user.id, date]);
      if (!row) return res.status(404).json({ error: '这天还没有日报' });
      await db.run('UPDATE diaries SET user_edited = ?, updated_at = ? WHERE id = ?', [text, nowIso(), row.id]);
      const fresh = await db.get('SELECT * FROM diaries WHERE id = ?', [row.id]);
      res.json({ diary: view(fresh) });
    } catch (e) { next(e); }
  });

  // 分享 / 取消分享某天日报给对方
  r.post('/diaries/:date/share', mw.requireUser, async (req, res, next) => {
    try {
      const date = req.params.date;
      if (!isValidDate(date)) return res.status(400).json({ error: '日期格式不对' });
      const shared = Boolean(req.body && req.body.shared);
      const row = await db.get('SELECT * FROM diaries WHERE user_id = ? AND diary_date = ?', [req.user.id, date]);
      if (!row) return res.status(404).json({ error: '这天还没有日报' });
      await db.run('UPDATE diaries SET shared = ? WHERE id = ?', [shared ? 1 : 0, row.id]);
      res.json({ ok: true, shared });
    } catch (e) { next(e); }
  });

  return r;
};
