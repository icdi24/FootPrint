// zoowy 聊天弹层（P2-#14）：常驻知识库问答，Web/Android 同一份服务端会话。
// 打开拉历史 → 发送 → 显示回复与工具调用痕迹。
const ZoowyChat = {
  async open({ bigGoalId = null, title = 'zoowy' } = {}) {
    const body = document.createElement('div');
    body.className = 'zc-body';
    body.innerHTML = `
      <div class="zc-list" id="zc-list"><div class="zp-loading">加载中…</div></div>
      <div class="zc-input-row">
        <textarea id="zc-input" rows="1" maxlength="2000" placeholder="问 zoowy：我这周怎么样？接下来做什么？"></textarea>
        <button class="btn primary" id="zc-send">发</button>
      </div>
    `;
    const list = body.querySelector('#zc-list');
    const input = body.querySelector('#zc-input');
    const sendBtn = body.querySelector('#zc-send');

    function bubble(m) {
      if (m.role === 'user') {
        return `<div class="zc-msg me"><div class="zc-text">${UI.esc(m.content)}</div></div>`;
      }
      const tools = m.tools && m.tools.length ? `<div class="zc-tools">🔧 用了：${m.tools.map(UI.esc).join('、')}</div>` : '';
      const pcs = m.profileChanges && m.profileChanges.length ? `<div class="zc-profile">📝 更新了画像：${m.profileChanges.map(UI.esc).join('；')}</div>` : '';
      return `<div class="zc-msg ai"><div class="zc-avatar">🐾</div><div class="zc-text">${UI.esc(m.content || '')}${tools}${pcs}</div></div>`;
    }

    async function loadHistory() {
      try {
        const d = await api.get('/api/zoowy/messages?limit=40');
        list.innerHTML = d.messages.length
          ? d.messages.map(bubble).join('')
          : '<div class="zc-empty">还没聊过。zoowy 知道你的目标、打卡、日报和使用时长，随便问。</div>';
        list.scrollTop = list.scrollHeight;
      } catch (e) {
        list.innerHTML = `<div class="zp-err">🐾 ${UI.esc(e.message)}</div>`;
      }
    }
    await loadHistory();

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendBtn.disabled = true;
      list.insertAdjacentHTML('beforeend', bubble({ role: 'user', content: text }));
      list.scrollTop = list.scrollHeight;
      list.insertAdjacentHTML('beforeend', '<div class="zc-msg ai" id="zc-pending"><div class="zc-avatar">🐾</div><div class="zc-text">zoowy 正在想…</div></div>');
      list.scrollTop = list.scrollHeight;
      try {
        const r = await api.post('/api/zoowy/chat', { message: text, big_goal_id: bigGoalId });
        document.getElementById('zc-pending')?.remove();
        list.insertAdjacentHTML('beforeend', bubble({ role: 'assistant', content: r.reply, tools: r.toolCalls, profileChanges: (r.profileChanges || []).map((p) => p.summary) }));
        list.scrollTop = list.scrollHeight;
      } catch (e) {
        document.getElementById('zc-pending')?.remove();
        list.insertAdjacentHTML('beforeend', `<div class="zp-err">🐾 ${UI.esc(e.message)}</div>`);
        list.scrollTop = list.scrollHeight;
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    }
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    UI.sheet({ title, body, actions: [] });
  },
};
