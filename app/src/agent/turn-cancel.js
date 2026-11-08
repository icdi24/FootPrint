const activeTurns = new Map();

function turnKey(userId, requestId) {
  return JSON.stringify([String(userId), requestId]);
}

function beginTurn(userId, requestId) {
  const key = turnKey(userId, requestId);
  if (activeTurns.has(key)) throw new Error('该请求已在运行');
  const controller = new AbortController();
  activeTurns.set(key, controller);
  return controller;
}

function abortTurn(userId, requestId) {
  const controller = activeTurns.get(turnKey(userId, requestId));
  if (!controller) return false;
  controller.abort();
  return true;
}

function endTurn(userId, requestId, controller) {
  const key = turnKey(userId, requestId);
  if (activeTurns.get(key) === controller) activeTurns.delete(key);
}

function isTurnRunning(userId, requestId) {
  const controller = activeTurns.get(turnKey(userId, requestId));
  return Boolean(controller && !controller.signal.aborted);
}

// Returns promptly even for operations such as DNS lookup that cannot take a signal.
async function runWithSignal(signal, action) {
  if (!signal) return action();
  signal.throwIfAborted();
  let onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const pending = Promise.resolve().then(() => {
      signal.throwIfAborted();
      return action();
    });
    return await Promise.race([pending, stopped]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

module.exports = { beginTurn, abortTurn, endTurn, isTurnRunning, runWithSignal };
