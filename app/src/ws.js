// WebSocket 实时推送（搭子私聊用）：只做服务端 → 客户端单向推送，业务写入仍走 HTTP。
const { WebSocketServer, WebSocket } = require('ws');
const { parseCookies, userByToken, COOKIE_NAME } = require('./auth');

// 模块级引用：initWs 被调用后指向真实实现，供 routes/chat.js 与 routes/auth.js 复用。
let _notify = () => {};
let _kick = () => {};

function initWs(server, db) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map(); // userId -> Set<ws>

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    (async () => {
      const cookies = parseCookies(req.headers.cookie);
      const user = await userByToken(db, cookies[COOKIE_NAME]);
      if (!user) return ws.close(4401, 'Unauthorized');
      ws.userId = Number(user.id);
      if (!clients.has(ws.userId)) clients.set(ws.userId, new Set());
      clients.get(ws.userId).add(ws);
      ws.on('close', () => {
        const s = clients.get(ws.userId);
        if (s) { s.delete(ws); if (!s.size) clients.delete(ws.userId); }
      });
    })().catch(() => ws.close(4401, 'Unauthorized'));
  });

  // 30s 心跳，清理断网/关标签残留的死连接
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  wss.on('close', () => clearInterval(interval));

  function notifyUser(userId, payload) {
    const set = clients.get(Number(userId));
    if (!set) return;
    const msg = JSON.stringify(payload);
    for (const ws of set) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }

  function kickUser(userId) {
    const set = clients.get(Number(userId));
    if (!set) return;
    for (const ws of set) ws.close(1000, 'session ended');
    clients.delete(Number(userId));
  }

  _notify = notifyUser;
  _kick = kickUser;
  return { notifyUser, kickUser, wss };
}

module.exports = {
  initWs,
  notifyUser: (userId, payload) => _notify(userId, payload),
  kickUser: (userId) => _kick(userId),
};
