const { Pool } = require('pg');
const { currentRun, checkRun, remainingMs } = require('./runtime-context');
const controls = new WeakMap();

function controlPool(pool) {
  let control = controls.get(pool);
  if (!control) {
    control = new Pool({ connectionString: pool.options.connectionString, max: 1,
      connectionTimeoutMillis: 1000, statement_timeout: 1000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
    control.on('error', () => {});
    controls.set(pool, control);
  }
  return control;
}

async function scopedQuery(client, sql, params, rootPool, signal = currentRun()?.signal) {
  checkRun();
  let cancel;
  let cancelling;
  let finished = false;
  const onAbort = () => {
    if (finished || cancelling) return;
    // The checked-out client is retained until cancellation AND rollback finish.
    cancelling = controlPool(rootPool).query('SELECT pg_cancel_backend($1)', [client.processID])
      .catch(() => { client._securityBroken = true; client.connection.stream.destroy(); });
  };
  if (signal?.aborted) signal.throwIfAborted();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    cancel = client.query(sql, params);
    const result = await cancel;
    checkRun();
    return result;
  } finally {
    finished = true;
    signal?.removeEventListener('abort', onAbort);
    if (cancelling) await cancelling;
  }
}

async function configureTransaction(client, timeoutMs) {
  const budget = Math.max(1, Math.floor(Math.min(timeoutMs, remainingMs())));
  await client.query("SELECT set_config('lock_timeout',$1,true), set_config('statement_timeout',$2,true), set_config('idle_in_transaction_session_timeout',$3,true)",
    [String(Math.min(1000, budget)), String(Math.min(5000, budget)), String(Math.min(5000, budget))]);
  // PostgreSQL 17+ is the supported deployment target.
  await client.query("SELECT set_config('transaction_timeout',$1,true)", [String(budget)]);
}

module.exports = { scopedQuery, configureTransaction };
