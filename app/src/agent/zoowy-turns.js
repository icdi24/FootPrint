const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { tx } = require('../db');
const { beginTurn, abortTurn, endTurn } = require('./turn-cancel');
const { withRun, withoutRun, checkRun } = require('./runtime-context');

const validRequestId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(id);
const turnError = (status, message, code) => Object.assign(new Error(message), { status, code });
const cancelledError = () => turnError(409, '本轮已停止', 'turn_cancelled');
const inputHash = (input) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

async function claimTurn(db, { userId, requestId, input, onClaim, kind = 'foreground', sessionId, sessionGeneration }) {
  if (!validRequestId(requestId)) throw turnError(400, '缺少有效的请求编号');
  return tx(db, async (c) => {
    await c.get('SELECT pg_advisory_xact_lock(7392, ?)', [userId]);
    await c.get('SELECT pg_advisory_xact_lock(7394, ?)', [userId]);
    await c.run("UPDATE zoowy_turns SET state=CASE WHEN state='cancelling' THEN 'cancelled' ELSE 'failed' END,finished_at=NOW() WHERE user_id=? AND state IN ('running','cancelling') AND deadline_at <= NOW()", [userId]);
    const prior = await c.get('SELECT state,input,input_hash,result,cleared FROM zoowy_turns WHERE user_id=? AND request_id=?', [userId, requestId]);
    if (prior) {
      if (prior.cleared) throw turnError(409, '该请求内容已清除，请发送新消息', 'history_cleared');
      if (prior.input_hash ? prior.input_hash !== inputHash(input) : !isDeepStrictEqual(prior.input, input)) throw turnError(409, '请求编号与内容不匹配');
      if (prior.state === 'done') return { replay: true, result: prior.result };
      if (prior.state === 'cancelled') throw cancelledError();
      throw turnError(409, prior.state === 'failed' ? '上一请求未完成，请使用新编号重试' : '上一请求正在处理');
    }
    if (kind === 'foreground') {
      const busy = await c.get("SELECT request_id FROM zoowy_turns WHERE user_id=? AND kind='foreground' AND state IN ('running','cancelling')", [userId]);
      if (busy) throw turnError(409, '另一端正在处理，请稍后再试', 'turn_running');
      const usage = await c.get("SELECT COUNT(*) AS count FROM zoowy_turns WHERE user_id=? AND kind='foreground' AND started_at > NOW() - INTERVAL '1 day' AND (input_hash IS NOT NULL OR input!='{}'::jsonb)", [userId]);
      if (Number(usage.count) >= 60) throw turnError(429, '近 24 小时的模型任务已达到试用上限');
    }
    const session = kind === 'foreground' ? await c.get('SELECT id,generation FROM zoowy_sessions WHERE user_id=? ORDER BY id DESC LIMIT 1', [userId]) : null;
    if (sessionId && (session?.id !== sessionId || sessionGeneration !== session.generation)) throw turnError(409, '对话已清空，请刷新后重试', 'history_cleared');
    const row = await c.get("INSERT INTO zoowy_turns (user_id,request_id,input,input_hash,state,kind,session_id,session_generation,deadline_at) VALUES (?,?,?,?,'running',?,?,?,NOW()+INTERVAL '60 seconds') RETURNING deadline_at,started_at",
      [userId, requestId, input, inputHash(input), kind, session?.id ?? null, session?.generation ?? null]);
    return { ...row, sessionId: session?.id, generation: session?.generation, data: onClaim ? await onClaim(c) : undefined };
  }, { timeoutMs: 5000 });
}

async function getTurn(db, userId, requestId) {
  if (!validRequestId(requestId)) throw turnError(400, '请求编号无效');
  const row = await db.get('SELECT request_id,state,report,result,cleared FROM zoowy_turns WHERE user_id=? AND request_id=?', [userId, requestId]);
  if (!row) throw turnError(404, '找不到本人的任务');
  return { requestId: row.request_id, state: row.state, report: row.report,
    ...(row.state === 'done' && !row.cleared && row.result ? { result: row.result } : {}) };
}

async function cancelTurn(db, userId, requestId) {
  if (!validRequestId(requestId)) throw turnError(400, '请求编号无效');
  const stopped = await tx(db, (c) => c.get("UPDATE zoowy_turns SET state='cancelling' WHERE user_id=? AND request_id=? AND kind='foreground' AND state='running' RETURNING request_id", [userId, requestId]), { timeoutMs: 3000 });
  if (stopped) abortTurn(userId, requestId);
  const turn = await getTurn(db, userId, requestId);
  return { accepted: Boolean(stopped) || turn.state === 'cancelling', state: turn.state, cancelled: turn.state === 'cancelled', report: turn.report };
}

async function runTurn(db, options, run) {
  const { userId, requestId } = options;
  const claim = await claimTurn(db, options);
  if (claim.replay) return claim.result;
  const controller = beginTurn(userId, requestId);
  const deadlineAt = new Date(claim.deadline_at).getTime();
  const report = { requestId, state: 'running', startedAt: new Date(claim.started_at).toISOString(),
    durationMs: 0, modelCalls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0,
    usageReported: false, tools: [], committedChanges: [] };
  const context = { userId, requestId, signal: controller.signal, deadlineAt, sessionId: claim.sessionId,
    sessionGeneration: claim.generation, report };
  const timeout = setTimeout(() => controller.abort(Object.assign(new Error('本轮运行超时'), { kind: 'timeout', status: 504 })), Math.max(1, deadlineAt - Date.now()));
  let polling = false;
  const poll = setInterval(async () => {
    if (polling || controller.signal.aborted) return;
    polling = true;
    try {
      const row = await withoutRun(() => db.get('SELECT state,cleared FROM zoowy_turns WHERE user_id=? AND request_id=?', [userId, requestId]));
      if (!row || row.state !== 'running' || row.cleared) controller.abort();
    } catch (_) { controller.abort(); }
    finally { polling = false; }
  }, 500);
  try {
    return await withRun(context, async () => {
      const commit = (apply) => tx(db, async (c) => {
        await c.get('SELECT pg_advisory_xact_lock(7392, ?)', [userId]);
        await c.get('SELECT pg_advisory_xact_lock(7394, ?)', [userId]);
        const turn = await c.get('SELECT state,cleared,deadline_at FROM zoowy_turns WHERE user_id=? AND request_id=? FOR UPDATE', [userId, requestId]);
        checkRun();
        if (turn?.cleared || turn?.state !== 'running' || new Date(turn.deadline_at).getTime() <= Date.now()) throw cancelledError();
        const session = claim.sessionId ? await c.get('SELECT generation FROM zoowy_sessions WHERE id=? AND user_id=?', [claim.sessionId, userId]) : null;
        if (session && session.generation !== claim.generation) throw turnError(409, '对话已清空', 'history_cleared');
        report.state = 'done'; report.finishedAt = new Date().toISOString(); report.durationMs = Date.now() - new Date(claim.started_at).getTime();
        const out = { ...await apply(c), report: { ...report } };
        await c.run("UPDATE zoowy_turns SET state='done',finished_at=NOW(),result=?,report=? WHERE user_id=? AND request_id=?", [out, report, userId, requestId]);
        return out;
      }, { timeoutMs: 5000 });
      checkRun();
      return run({ signal: context.signal, data: claim.data, commit });
    });
  } catch (error) {
    error.turnClaimed = true;
    report.state = (context.signal.aborted && context.signal.reason?.kind !== 'timeout') || error.code === 'turn_cancelled' ? 'cancelled' : 'failed';
    report.reason = error.kind || error.code || 'error';
    report.finishedAt = new Date().toISOString(); report.durationMs = Date.now() - new Date(claim.started_at).getTime();
    if (error.code !== 'commit_unknown') await withoutRun(() => db.run("UPDATE zoowy_turns SET state=?,finished_at=NOW(),report=? WHERE user_id=? AND request_id=? AND state IN ('running','cancelling') AND cleared=FALSE", [report.state, report, userId, requestId]));
    if (error.code === 'commit_unknown') throw error;
    if (report.state === 'cancelled') throw Object.assign(cancelledError(), { turnClaimed: true, report });
    error.report = report;
    throw error;
  } finally {
    clearTimeout(timeout); clearInterval(poll); endTurn(userId, requestId, controller);
  }
}

module.exports = { runTurn, cancelTurn, getTurn, validRequestId, turnError };
