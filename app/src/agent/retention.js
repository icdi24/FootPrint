const { tx } = require('../db');

async function pruneAgentData(db) {
  return tx(db, async (c) => {
    const lock = await c.get('SELECT pg_try_advisory_xact_lock(7399, 1) AS acquired');
    if (!lock.acquired) return;
    await c.run("UPDATE zoowy_turns SET state=CASE WHEN state='cancelling' THEN 'cancelled' ELSE 'failed' END, finished_at=NOW() WHERE state IN ('running','cancelling') AND deadline_at < NOW()");
    // Retain operation identity/state as a receipt, remove payload/report copies.
    const turns = await c.run(`UPDATE zoowy_turns SET input='{}',result=NULL,report='{}',cleared=TRUE
      WHERE (user_id,request_id) IN (SELECT user_id,request_id FROM zoowy_turns
      WHERE finished_at < NOW()-INTERVAL '30 days' AND (input!='{}'::jsonb OR result IS NOT NULL OR report!='{}'::jsonb) LIMIT 200)`);
    const calls = await c.run("DELETE FROM ai_calls WHERE id IN (SELECT id FROM ai_calls WHERE created_at::timestamptz < NOW()-INTERVAL '30 days' LIMIT 200)");
    const offers = await c.run("DELETE FROM zoowy_offers WHERE id IN (SELECT id FROM zoowy_offers WHERE result IS NULL AND created_at < NOW()-INTERVAL '30 days' LIMIT 200)");
    const messages = await c.all("SELECT id,meta FROM zoowy_messages WHERE created_at::timestamptz < NOW()-INTERVAL '30 days' AND meta LIKE ? ORDER BY id LIMIT 200", ['%"report"%']);
    let reports = 0;
    for (const message of messages) {
      let meta;
      try { meta = JSON.parse(message.meta); } catch (_) { continue; }
      delete meta.report;
      await c.run('UPDATE zoowy_messages SET meta=? WHERE id=?', [JSON.stringify(meta), message.id]);
      reports++;
    }
    return { turns: turns.changes, calls: calls.changes, offers: offers.changes, reports };
  }, { timeoutMs: 5000 });
}

function scheduleRetention(db, log) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const counts = await pruneAgentData(db);
      log.prune();
      if (counts) log.log('agent_cleanup', JSON.stringify(counts));
    } catch (_) { log.log('agent_cleanup_failed', 'Agent 保留期清理失败，将重试'); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  tick();
}

module.exports = { pruneAgentData, scheduleRetention };
