const fs = require('node:fs');
const path = require('node:path');
const { tx } = require('../db');
const { ensureSession } = require('./session');
const { abortTurn } = require('./turn-cancel');

function readDeletionJournal(dataDir) {
  const file = path.join(dataDir, 'privacy-deletions.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    const entry = JSON.parse(line);
    if (!Number.isInteger(entry.userId) || !Number.isInteger(entry.sessionId) || !Number.isInteger(entry.generation)
      || !Number.isInteger(entry.throughMessageId) || typeof entry.userCreatedAt !== 'string' || !Number.isFinite(Date.parse(entry.clearedAt))) {
      throw new Error('隐私删除清单损坏，需要修复后再恢复或启动服务');
    }
    return entry;
  });
}

async function applyHistoryDeletion(c, entry) {
  const user = await c.get('SELECT created_at FROM users WHERE id=?', [entry.userId]);
  if (!user || user.created_at !== entry.userCreatedAt) return;
  await c.get('SELECT pg_advisory_xact_lock(7392, ?)', [entry.userId]);
  await c.get('SELECT pg_advisory_xact_lock(7394, ?)', [entry.userId]);
  const session = await c.get('SELECT generation FROM zoowy_sessions WHERE id=? AND user_id=? FOR UPDATE', [entry.sessionId, entry.userId]);
  if (!session || session.generation >= entry.generation) return;
  await c.run('DELETE FROM zoowy_messages WHERE user_id=? AND session_id=? AND id<=?', [entry.userId, entry.sessionId, entry.throughMessageId]);
  await c.run('DELETE FROM zoowy_compactions WHERE user_id=? AND session_id=?', [entry.userId, entry.sessionId]);
  await c.run("UPDATE zoowy_offers SET payload='{}',result=NULL WHERE user_id=? AND session_id=? AND created_at<=?", [entry.userId, entry.sessionId, entry.clearedAt]);
  await c.run(`UPDATE zoowy_turns SET input='{}',result=NULL,report='{}',cleared=TRUE,
    state=CASE WHEN state IN ('running','cancelling') THEN 'cancelled' ELSE state END,finished_at=COALESCE(finished_at,NOW())
    WHERE user_id=? AND started_at<=?`, [entry.userId, entry.clearedAt]);
  await c.run("DELETE FROM planning_drafts WHERE owner_id=? AND status!='applied'", [entry.userId]);
  await c.run('UPDATE zoowy_sessions SET generation=?,updated_at=? WHERE id=? AND user_id=?',
    [entry.generation, entry.clearedAt, entry.sessionId, entry.userId]);
}

async function reapplyHistoryDeletions(db, dataDir) {
  const entries = readDeletionJournal(dataDir);
  for (const entry of entries) await tx(db, (c) => applyHistoryDeletion(c, entry), { timeoutMs: 30000 });
}

async function clearHistory(db, userId, dataDir) {
  const session = await ensureSession(db, userId);
  const result = await tx(db, async (c) => {
    await c.get('SELECT pg_advisory_xact_lock(7392, ?)', [userId]);
    await c.get('SELECT pg_advisory_xact_lock(7394, ?)', [userId]);
    const current = await c.get('SELECT generation FROM zoowy_sessions WHERE id=? AND user_id=? FOR UPDATE', [session.id, userId]);
    const user = await c.get('SELECT created_at FROM users WHERE id=?', [userId]);
    const edge = await c.get('SELECT COALESCE(MAX(id),0) AS id FROM zoowy_messages WHERE user_id=? AND session_id=?', [userId, session.id]);
    const active = await c.all("SELECT request_id FROM zoowy_turns WHERE user_id=? AND state IN ('running','cancelling')", [userId]);
    const entry = { userId, sessionId: session.id, generation: current.generation + 1,
      throughMessageId: Number(edge.id), userCreatedAt: user.created_at, clearedAt: new Date().toISOString() };
    fs.mkdirSync(dataDir, { recursive: true });
    // Durable intent survives restoring an older DB. It contains no chat text.
    fs.appendFileSync(path.join(dataDir, 'privacy-deletions.jsonl'), JSON.stringify(entry) + '\n', { encoding: 'utf8', flush: true });
    await applyHistoryDeletion(c, entry);
    return { cleared: true, generation: entry.generation, active };
  }, { timeoutMs: 30000 });
  for (const item of result.active) abortTurn(userId, item.request_id);
  return { cleared: true, generation: result.generation };
}

module.exports = { readDeletionJournal, applyHistoryDeletion, reapplyHistoryDeletions, clearHistory };
