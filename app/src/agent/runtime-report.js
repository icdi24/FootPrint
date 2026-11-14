const { currentRun } = require('./runtime-context');
function addToolReport(event) {
  const run = currentRun();
  if (run && run.report.tools.length < 12) run.report.tools.push(event);
}
async function recordConfirmed(db, { userId, requestId, operation, summary, recordIds = [] }) {
  const report = { requestId, state: 'done', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    durationMs: 0, modelCalls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, usageReported: false,
    tools: [{ name: operation, status: 'ok', authorization: 'user_confirmation', recordIds: recordIds.slice(0, 30) }],
    committedChanges: [{ operation, summary: String(summary || '').slice(0, 500), recordIds: recordIds.slice(0, 30) }] };
  await db.run(`INSERT INTO zoowy_turns (user_id,request_id,input,state,finished_at,report)
    VALUES (?,?,'{}','done',NOW(),?) ON CONFLICT (user_id,request_id) DO NOTHING`, [userId, requestId, report]);
  return report;
}
module.exports = { addToolReport, recordConfirmed };
