const { Pool } = require('pg');
const { checkRun } = require('./runtime-context');

// Four shared PostgreSQL session locks cover each actual provider HTTP attempt.
// Separate connections leave the business pool available to commit and cancel.
const pools = new WeakMap();
async function acquireModelPermit(db, signal) {
  checkRun();
  if (!db?.pool?.options?.connectionString) throw new Error('模型调用需要受管数据库连接');
  let pool = pools.get(db.pool);
  if (!pool) {
    pool = new Pool({ connectionString: db.pool.options.connectionString, max: 4,
      connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
    pool.on('error', () => {});
    pools.set(db.pool, pool);
  }
  const client = await pool.connect();
  let slot = null;
  let released = false;
  try {
    for (let i = 0; i < 4; i++) {
      checkRun();
      if (signal?.aborted) throw Object.assign(new Error('本轮已停止'), { kind: 'cancelled' });
      const result = await client.query('SELECT pg_try_advisory_lock(7398, $1) AS acquired', [i]);
      if (result.rows[0].acquired) { slot = i; break; }
    }
    if (slot === null) throw Object.assign(new Error('模型服务繁忙，请稍后重试'), { kind: 'busy', status: 429 });
    const controller = new AbortController();
    const failed = () => controller.abort();
    client.on('error', failed);
    client.on('end', failed);
    return { signal: controller.signal, async release() {
      if (released) return;
      released = true;
      client.removeListener('error', failed);
      client.removeListener('end', failed);
      try { await client.query('SELECT pg_advisory_unlock(7398, $1)', [slot]); client.release(); }
      catch (_) { client.release(true); }
    } };
  } catch (error) { client.release(true); throw error; }
}

module.exports = { acquireModelPermit };
