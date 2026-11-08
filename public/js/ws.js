// 私聊 WebSocket 客户端：登录后常驻连接，接收新消息推送并更新未读红点。
const Chat = (() => {
  let ws = null;
  let shouldReconnect = false;
  let retry = 0;

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    shouldReconnect = true;
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host + '/ws');

    ws.onopen = () => { retry = 0; };
    ws.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      onWsMessage(data);
    };
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      ws = null;
      if (!shouldReconnect) return;
      if (ev.code === 4401) { App.showAuth(); return; }
      retry = Math.min(retry + 1, 5);
      const delay = Math.min(1000 * Math.pow(2, retry), 30000);
      setTimeout(connect, delay);
    };
  }

  function disconnect() {
    shouldReconnect = false;
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  }

  function onWsMessage(data) {
    if (!data || data.type !== 'message' || !data.message) return;
    const meId = App.state.me && App.state.me.id;
    const isMine = data.message.senderId === meId;
    const sheetOpen = typeof ChatSheet !== 'undefined' && ChatSheet.isOpen;

    if (isMine) {
      // 自己其它标签页发的：只同步到弹层，不动红点
      if (sheetOpen) ChatSheet.onWsMessage(data.message);
      return;
    }
    // 搭档发的
    if (sheetOpen) {
      ChatSheet.onWsMessage(data.message); // 弹层开着：append 并标记已读
    } else {
      const n = data.unread !== undefined ? data.unread : App.state.chatUnread + 1;
      App.setChatUnread(n);
    }
  }

  return { connect, disconnect, onWsMessage };
})();
