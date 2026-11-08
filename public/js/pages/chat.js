// 搭子私聊弹层：打开拉历史 → 发送 → WebSocket 实时收到新消息。样式复用 .zc-* 聊天 UI。
function chatBubble(m) {
  const mine = App.state.me && m.senderId === App.state.me.id;
  if (mine) {
    return `<div class="zc-msg me"><div class="zc-text">${UI.esc(m.content)}</div></div>`;
  }
  const avatar = ChatSheet.partner ? ChatSheet.partner.avatar : '🐾';
  return `<div class="zc-msg"><div class="zc-avatar">${UI.esc(avatar)}</div><div class="zc-text">${UI.esc(m.content)}</div></div>`;
}

const ChatSheet = {
  isOpen: false,
  partner: null,
  messages: [],
  list: null,
  input: null,

  async open() {
    if (this.isOpen) return;
    this.isOpen = true;

    const body = document.createElement('div');
    body.className = 'zc-body';
    body.innerHTML = `
      <div class="zc-list" id="chat-list"><div class="zp-loading">加载中…</div></div>
      <div class="zc-input-row">
        <textarea id="chat-input" rows="1" maxlength="2000" placeholder="给 ta 发条消息…"></textarea>
        <button class="btn primary" id="chat-send">发</button>
      </div>
    `;
    this.list = body.querySelector('#chat-list');
    this.input = body.querySelector('#chat-input');
    const sendBtn = body.querySelector('#chat-send');

    const render = () => {
      this.list.innerHTML = this.messages.length
        ? this.messages.map(chatBubble).join('')
        : '<div class="zc-empty">还没聊过，跟 ta 说点什么吧。</div>';
      this.list.scrollTop = this.list.scrollHeight;
    };

    // 拉历史
    try {
      const d = await api.get('/api/chat');
      this.partner = d.partner;
      this.messages = d.messages || [];
    } catch (e) {
      this.list.innerHTML = `<div class="zp-err">🐾 ${UI.esc(e.message)}</div>`;
    }
    render();

    // 打开即把已加载到的消息标记已读，并清红点
    const maxId = this.messages.length ? this.messages[this.messages.length - 1].id : 0;
    if (maxId) await api.post('/api/chat/read', { upToId: maxId }).catch(() => {});
    App.setChatUnread(0);

    async function send() {
      const text = ChatSheet.input.value.trim();
      if (!text) return;
      ChatSheet.input.value = '';
      sendBtn.disabled = true;
      try {
        const r = await api.post('/api/chat/messages', { content: text });
        ChatSheet.append(r.message);
      } catch (e) {
        UI.toast(e.message, 'err');
      } finally {
        sendBtn.disabled = false;
        ChatSheet.input.focus();
      }
    }
    sendBtn.addEventListener('click', send);
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    // 滚动到顶加载更早历史
    this.list.addEventListener('scroll', async () => {
      if (this.list.scrollTop !== 0 || !this.messages.length) return;
      const earliest = this.messages[0].id;
      try {
        const d = await api.get(`/api/chat/messages?before=${earliest}&limit=40`);
        if (d.messages && d.messages.length) {
          const prevHeight = this.list.scrollHeight;
          this.messages = [...d.messages, ...this.messages];
          this.list.innerHTML = this.messages.map(chatBubble).join('');
          this.list.scrollTop = this.list.scrollHeight - prevHeight;
        }
      } catch (e) { /* 忽略分页失败 */ }
    });

    UI.sheet({
      title: this.partner ? `和 ${this.partner.nickname} 私聊` : '私聊',
      body,
      actions: [],
      onClose: () => {
        this.isOpen = false;
        this.list = null;
        this.input = null;
      },
    });
  },

  append(m) {
    if (!m || this.messages.some((x) => x.id === m.id)) return;
    this.messages.push(m);
    if (this.list) {
      this.list.insertAdjacentHTML('beforeend', chatBubble(m));
      this.list.scrollTop = this.list.scrollHeight;
    }
  },

  // 由 Chat.onWsMessage 在弹层开着时调用：append 并标记已读
  onWsMessage(m) {
    if (!this.isOpen) return;
    this.append(m);
    api.post('/api/chat/read', { upToId: m.id }).catch(() => {});
  },
};
