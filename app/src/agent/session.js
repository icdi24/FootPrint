// agent/session.js —— zoowy 会话（存服务端，Web 和 Android 拉同一份，按 user_id 隔离）
const { nowIso } = require('../tz');

// 每人一个主会话：两处入口（「我」页常驻 + 大目标页按钮）进同一个会话
async function ensureSession(db, userId) {
  let s = await db.get('SELECT * FROM zoowy_sessions WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1', [userId]);
  if (!s) {
    await db.run("INSERT INTO zoowy_sessions (user_id, title, created_at, updated_at) VALUES (?, 'zoowy', ?, ?) RETURNING id",
      [userId, nowIso(), nowIso()]);
    s = await db.get('SELECT * FROM zoowy_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
  }
  return s;
}

async function touchSession(db, sessionId) {
  await db.run('UPDATE zoowy_sessions SET updated_at = ? WHERE id = ?', [nowIso(), sessionId]);
}

// 只拉自己的消息（user_id 双重过滤，AI 与对方都读不到）
async function recentMessages(db, userId, limit = 40) {
  const s = await ensureSession(db, userId);
  const rows = await db.all(
    "SELECT role, content, meta, created_at FROM zoowy_messages WHERE session_id = ? AND user_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT ?",
    [s.id, userId, limit]
  );
  return { session: s, messages: rows.reverse() };
}

async function appendMessage(db, userId, sessionId, role, content, meta) {
  await db.run(
    'INSERT INTO zoowy_messages (session_id, user_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId, userId, role, content || '', meta ? JSON.stringify(meta) : '', nowIso()]
  );
  await touchSession(db, sessionId);
}

module.exports = { ensureSession, recentMessages, appendMessage, touchSession };
