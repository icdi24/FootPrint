const { isDeepStrictEqual } = require('node:util');
const { tx } = require('../db');
const { beginTurn, abortTurn, endTurn } = require('./turn-cancel');

const validRequestId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(id);
const turnError = (status, message, code) => Object.assign(new Error(message), { status, code });
const cancelledError = () => turnError(409, '本轮已停止', 'turn_cancelled');

async function claimTurn(db, { userId, requestId, input, onClaim }) {
  if (!validRequestId(requestId)) throw turnError(400, '缺少有效的请求编号');
  return tx(db, async (c) => {
    await c.get('SELECT pg_advisory_xact_lock(7394, ?)', [userId]);
    await c.run("UPDATE zoowy_turns SET state='failed' WHERE user_id=? AND state='running' AND started_at < NOW() - INTERVAL '2 minutes'", [userId]);
    const prior = await c.get('SELECT state,input,result FROM zoowy_turns WHERE user_id=? AND request_id=?', [userId, requestId]);
    if (prior) {
      if (!isDeepStrictEqual(prior.input, input)) throw turnError(409, '请求编号与内容不匹配');
      if (prior.state === 'done') return { replay: true, result: prior.result };
      if (prior.state === 'cancelled') throw cancelledError();
      throw turnError(409, prior.state === 'failed' ? '上一请求未完成，请重新发送' : '上一请求正在处理');
    }
    const usage = await c.get("SELECT COUNT(*) AS count FROM zoowy_turns WHERE user_id=? AND started_at > NOW() - INTERVAL '1 day'", [userId]);
    if (Number(usage.count) >= 60) throw turnError(429, '近 24 小时的模型任务已达到试用上限');
    const row = await c.get(`INSERT INTO zoowy_turns (user_id,request_id,input,state) VALUES (?,?,?,'running')
      ON CONFLICT DO NOTHING RETURNING request_id`, [userId, requestId, input]);
    if (!row) throw turnError(409, '上一请求正在处理');
    return { data: onClaim ? await onClaim(c) : undefined };
  });
}

async function cancelTurn(db, userId, requestId) {
  if (!validRequestId(requestId)) throw turnError(400, '请求编号无效');
  const stopped = await db.get(`UPDATE zoowy_turns SET state='cancelled'
    WHERE user_id=? AND request_id=? AND state='running' RETURNING request_id`, [userId, requestId]);
  if (stopped) abortTurn(userId, requestId);
  if (stopped) return true;
  const row = await db.get('SELECT state FROM zoowy_turns WHERE user_id=? AND request_id=?', [userId, requestId]);
  return row?.state === 'cancelled';
}

async function runTurn(db, options, run) {
  const { userId, requestId } = options;
  const claim = await claimTurn(db, options);
  if (claim.replay) return claim.result;
  const controller = beginTurn(userId, requestId);
  const { signal } = controller;
  try {
    const active = await db.get("SELECT request_id FROM zoowy_turns WHERE user_id=? AND request_id=? AND state='running'", [userId, requestId]);
    if (!active || signal.aborted) throw cancelledError();
    const commit = (apply) => tx(db, async (c) => {
      const turn = await c.get('SELECT state FROM zoowy_turns WHERE user_id=? AND request_id=? FOR UPDATE', [userId, requestId]);
      if (signal.aborted || turn?.state === 'cancelled') throw cancelledError();
      if (turn?.state !== 'running') throw turnError(409, '本轮已过期，请重新发送');
      const out = await apply(c);
      await c.run("UPDATE zoowy_turns SET state='done',result=? WHERE user_id=? AND request_id=?", [out, userId, requestId]);
      return out;
    });
    return await run({ signal, data: claim.data, commit });
  } catch (error) {
    const failed = await db.run("UPDATE zoowy_turns SET state='failed' WHERE user_id=? AND request_id=? AND state='running'", [userId, requestId]);
    if (signal.aborted || error.kind === 'cancelled' || error.code === 'turn_cancelled') throw cancelledError();
    if (!failed.changes) {
      const turn = await db.get('SELECT state FROM zoowy_turns WHERE user_id=? AND request_id=?', [userId, requestId]);
      if (turn?.state === 'cancelled') throw cancelledError();
    }
    throw error;
  } finally {
    endTurn(userId, requestId, controller);
  }
}

module.exports = { runTurn, cancelTurn, validRequestId, turnError };
