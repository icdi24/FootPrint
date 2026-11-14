const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();
const currentRun = () => storage.getStore();
const withRun = (context, action) => storage.run(context, action);
const withoutRun = (action) => storage.run(undefined, action);

function checkRun(context = currentRun()) {
  if (!context) return;
  if (context.signal?.aborted) {
    if (context.signal.reason?.kind === 'timeout') throw context.signal.reason;
    throw Object.assign(new Error('本轮已停止'), { kind: 'cancelled', code: 'turn_cancelled', status: 409 });
  }
  if (Date.now() >= context.deadlineAt) throw Object.assign(new Error('本轮运行超时'), { kind: 'timeout', status: 504 });
}

function remainingMs(reserve = 0) {
  checkRun();
  const context = currentRun();
  return context ? Math.max(1, context.deadlineAt - Date.now() - reserve) : Infinity;
}

module.exports = { currentRun, withRun, withoutRun, checkRun, remainingMs };
