// agent/session.js —— zoowy 会话（存服务端，Web 和 Android 拉同一份，按 user_id 隔离）
const { nowIso } = require('../tz');
const { tx } = require('../db');

// 每人一个主会话：两处入口（「我」页常驻 + 大目标页按钮）进同一个会话
async function ensureSession(db, userId) {
  return tx(db, async (c) => {
    await c.get('SELECT pg_advisory_xact_lock(7392, ?)', [userId]);
    const existing = await c.get('SELECT * FROM zoowy_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
    return existing || c.get("INSERT INTO zoowy_sessions (user_id, title, created_at, updated_at) VALUES (?, 'zoowy', ?, ?) RETURNING *",
      [userId, nowIso(), nowIso()]);
  });
}

async function touchSession(db, sessionId) {
  await db.run('UPDATE zoowy_sessions SET updated_at = ? WHERE id = ?', [nowIso(), sessionId]);
}

// 只拉自己的消息（user_id 双重过滤，AI 与对方都读不到）
async function recentMessages(db, userId, limit = 40) {
  const s = await ensureSession(db, userId);
  const rows = await db.all(
    "SELECT id, role, content, meta, created_at FROM zoowy_messages WHERE session_id = ? AND user_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT ?",
    [s.id, userId, limit]
  );
  return { session: s, messages: rows.reverse() };
}

async function appendMessage(db, userId, sessionId, role, content, meta) {
  const row = await db.get(
    'INSERT INTO zoowy_messages (session_id, user_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    [sessionId, userId, role, content || '', meta ? JSON.stringify(meta) : '', nowIso()]
  );
  await touchSession(db, sessionId);
  return row.id;
}

module.exports = { ensureSession, recentMessages, appendMessage, touchSession };
