// 微信式「状态」：分组图标选择 + 一句话；「我的」可设，「我们」可看对方。
// 后端不可用时自动降级到 localStorage（本机演示），界面不崩。
const STATUS_GROUPS = [
  { key: 'mood', name: '心情想法', items: [
    ['美滋滋', '😊'], ['裂开', '😵'], ['求安慰', '🥺'], ['等天晴', '🌤️'], ['疲惫', '😮‍💨'],
    ['发呆', '🫥'], ['冲', '💪'], ['emo', '😢'], ['胡思乱想', '💭'], ['元气满满', '✨'], ['bot', '🤖'],
  ] },
  { key: 'work', name: '工作学习', items: [
    ['搬砖', '🧱'], ['沉迷学习', '📚'], ['忙', '🏃'], ['摸鱼', '🐟'], ['出差', '✈️'],
    ['飞奔回家', '🏠'], ['勿扰模式', '🌙'],
  ] },
  { key: 'activity', name: '活动', items: [
    ['浪', '🌊'], ['打卡', '✅'], ['运动', '🏃‍♀️'], ['喝咖啡', '☕'], ['喝奶茶', '🧋'],
    ['干饭', '🍚'], ['带娃', '🧸'], ['拯救世界', '🦸'], ['自拍', '🤳'],
  ] },
  { key: 'rest', name: '休息', items: [
    ['闭关', '🚪'], ['宅', '🛋️'], ['睡觉', '😴'], ['吸猫', '🐱'], ['遛狗', '🐶'],
    ['玩游戏', '🎮'], ['听歌', '🎧'], ['未知', '❓'],
  ] },
];
const ST_STORE = 'footprint.status.mine';

const StatusUI = {
  cache: null,

  // ---- 数据 ----
  localMine() {
    try {
      const v = JSON.parse(localStorage.getItem(ST_STORE) || 'null');
      return v && v.label ? v : null;
    } catch (e) { return null; }
  },
  saveLocal(s) {
    try {
      if (s) localStorage.setItem(ST_STORE, JSON.stringify(s));
      else localStorage.removeItem(ST_STORE);
    } catch (e) { /* 隐私模式忽略 */ }
  },
  async fetch() {
    try {
      const d = await api.get('/api/status');
      this.cache = d;
      if (d.mine) this.saveLocal(d.mine);
      return d;
    } catch (e) {
      return { offline: true, mine: this.localMine(), partner: null };
    }
  },
  timeAgo(at) {
    if (!at) return '';
    const t = Date.parse(at);
    if (!Number.isFinite(t)) return '';
    const m = Math.floor(Math.max(0, Date.now() - t) / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    const d = new Date(t);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },

  // ---- 卡片片段 ----
  mineChip(s) {
    if (!s) return `
      <button class="st-chip empty" id="my-status-chip" type="button">
        <span class="st-chip-ico">💭</span>
        <span class="st-chip-txt"><b>＋ 设个状态</b><small>对方在「我们」页能看到</small></span>
        <span class="st-chip-go">${window.icon('right')}</span>
      </button>`;
    return `
      <button class="st-chip" id="my-status-chip" type="button">
        <span class="st-chip-ico">${UI.esc(s.emoji)}</span>
        <span class="st-chip-txt"><b>${UI.esc(s.label)}</b><small>${UI.esc(s.text || '点一下换个状态')}</small></span>
        <span class="st-chip-time">${UI.esc(this.timeAgo(s.at))}</span>
        <span class="st-chip-go">${window.icon('right')}</span>
      </button>`;
  },
  partnerRow(p) {
    if (!p) return `
      <button class="st-prow empty" id="partner-status-row" type="button">
        <span class="st-pr-emoji">💤</span>
        <span class="st-pr-txt"><b>状态暂时读不到</b><small>检查服务是否在运行</small></span>
      </button>`;
    if (!p.status) return `
      <button class="st-prow empty" id="partner-status-row" type="button">
        <span class="st-pr-emoji">💭</span>
        <span class="st-pr-txt"><b>${UI.esc(p.username)} 还没设状态</b><small>等 ta 冒个泡 · 点这里给自己也设一个</small></span>
        <span class="st-pr-go">›</span>
      </button>`;
    const s = p.status;
    return `
      <button class="st-prow" id="partner-status-row" type="button">
        <span class="st-pr-emoji">${UI.esc(s.emoji)}</span>
        <span class="st-pr-txt">
          <b><i>${UI.esc(p.username)}</i> 现在 ${UI.esc(s.label)}</b>
          <small>${UI.esc(s.text || '没有留言')} · ${UI.esc(this.timeAgo(s.at))}</small>
        </span>
        <span class="st-pr-go">›</span>
      </button>`;
  },
  syncAvatarBadge(s) {
    const av = document.querySelector('.profile-card .ps-avatar.big');
    if (!av) return;
    let b = av.querySelector('.st-avatar-badge');
    if (!s) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('span');
      b.className = 'st-avatar-badge';
      av.appendChild(b);
    }
    b.textContent = s.emoji;
  },

  // ---- 挂载（事件委托，重绘 chip 不需要重新绑定）----
  mountMine(root) {
    if (root.dataset.stMineBound) return;
    root.dataset.stMineBound = '1';
    root.addEventListener('click', (e) => {
      if (!e.target.closest('#my-status-chip')) return;
      this.open({ onSaved: (s) => {
        const box = document.getElementById('my-status-box');
        if (box) box.innerHTML = this.mineChip(s);
        this.syncAvatarBadge(s);
      } });
    });
  },
  mountPartner(root) {
    if (root.dataset.stPartnerBound) return;
    root.dataset.stPartnerBound = '1';
    root.addEventListener('click', (e) => {
      if (!e.target.closest('#partner-status-row')) return;
      const p = this.cache && this.cache.partner;
      this.partnerSheet(p);
    });
  },

  // ---- 设个状态（仿微信分组面板）----
  open(opts = {}) {
    const start = opts.current || (this.cache && this.cache.mine) || this.localMine() || null;
    let sel = start ? { key: start.key, emoji: start.emoji, label: start.label, group: start.group } : null;
    const body = document.createElement('div');
    body.className = 'st-picker';
    body.innerHTML = `
      <div class="st-preview">
        <span class="st-prev-emoji" id="st-prev-emoji">${sel ? UI.esc(sel.emoji) : '💭'}</span>
        <div class="st-prev-txt">
          <b id="st-prev-label">${sel ? UI.esc(sel.label) : '还没选状态'}</b>
          <span id="st-prev-note">从下面挑一个，或写点什么</span>
        </div>
      </div>
      <label class="st-input">
        <span>说点什么（可不填，最多 40 字）</span>
        <input id="st-text" type="text" maxlength="40" autocomplete="off"
               placeholder="比如：今天也在努力搬砖" value="${UI.esc(start && start.text || '')}"/>
      </label>
      <div class="st-groups">
        ${STATUS_GROUPS.map((g, gi) => `
          <div class="st-group">
            <div class="st-group-title">${g.name}</div>
            <div class="st-grid">
              ${g.items.map(([label, emoji], ii) => `
                <button class="st-item${sel && sel.label === label && sel.group === g.key ? ' on' : ''}"
                        type="button" data-gi="${gi}" data-ii="${ii}"
                        aria-pressed="${!!(sel && sel.label === label && sel.group === g.key)}">
                  <span class="st-ico">${emoji}</span>
                  <span class="st-lbl">${label}</span>
                </button>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <p class="st-hint">状态只给搭档看，随时能改或清掉；不写留言也行。</p>
    `;
    const paint = () => {
      const t = body.querySelector('#st-text').value.trim();
      body.querySelector('#st-prev-emoji').textContent = sel ? sel.emoji : '💭';
      body.querySelector('#st-prev-label').textContent = sel ? sel.label : '还没选状态';
      body.querySelector('#st-prev-note').textContent = t || (sel ? '点下面的图标换一个，或写句话' : '从下面挑一个，或写点什么');
    };
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('.st-item');
      if (!btn) return;
      const g = STATUS_GROUPS[Number(btn.dataset.gi)];
      const [label, emoji] = g.items[Number(btn.dataset.ii)];
      sel = { key: `${g.key}:${label}`, emoji, label, group: g.key };
      body.querySelectorAll('.st-item.on').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('on');
      btn.setAttribute('aria-pressed', 'true');
      paint();
    });
    body.querySelector('#st-text').addEventListener('input', paint);
    if (start && start.text) paint();

    UI.sheet({
      title: '设个状态',
      body,
      actions: [
        {
          label: '清除状态',
          async onClick(close) {
            const yes = await UI.confirm('清掉当前状态？对方就看不到了。', { okLabel: '清除' });
            if (!yes) return;
            try { await api.delete('/api/status'); } catch (e) { /* 离线时只清本地 */ }
            StatusUI.saveLocal(null);
            StatusUI.cache = Object.assign({}, StatusUI.cache, { mine: null });
            UI.toast('状态已清除', 'ok');
            close();
            if (opts.onSaved) opts.onSaved(null);
          },
        },
        {
          label: '就这样', kind: 'primary',
          async onClick(close) {
            if (!sel) { UI.toast('先挑一个状态', 'warn'); return; }
            const payload = {
              key: sel.key, emoji: sel.emoji, label: sel.label, group: sel.group,
              text: body.querySelector('#st-text').value.trim(),
            };
            let saved;
            try {
              saved = (await api.put('/api/status', payload)).status;
            } catch (e) {
              saved = Object.assign({}, payload, { at: new Date().toISOString() });
            }
            StatusUI.saveLocal(saved);
            StatusUI.cache = Object.assign({}, StatusUI.cache, { mine: saved });
            UI.toast('状态已更新', 'ok');
            close();
            if (opts.onSaved) opts.onSaved(saved);
          },
        },
      ],
    });
  },

  // ---- 对方状态详情 ----
  partnerSheet(p) {
    const s = p && p.status;
    const body = document.createElement('div');
    body.className = 'st-detail';
    body.innerHTML = s ? `
      <div class="st-detail-hero">
        <span class="st-detail-emoji">${UI.esc(s.emoji)}</span>
        <div class="st-detail-name">${UI.esc(s.label)}</div>
        <div class="st-detail-who">${UI.esc(p.username)} · ${UI.esc(this.timeAgo(s.at))}</div>
      </div>
      ${s.text ? `<div class="st-detail-quote">「${UI.esc(s.text)}」</div>` : '<div class="st-detail-quote dim">ta 没写留言</div>'}
      <p class="st-hint">状态随时会变，切回来就能看到最新的。</p>
    ` : `
      <div class="st-detail-hero">
        <span class="st-detail-emoji">💭</span>
        <div class="st-detail-name">还没设状态</div>
        <div class="st-detail-who">${p ? UI.esc(p.username) : '还没有搭档'}</div>
      </div>
      <p class="st-hint">等对方设一个，或者你也先冒个泡。</p>
    `;
    UI.sheet({
      title: p ? `${p.username} 的状态` : '状态',
      body,
      actions: [
        { label: '关闭', onClick: (close) => close() },
        { label: '我也设一个', kind: 'primary', onClick: (close) => { close(); this.open(); } },
      ],
    });
  },
};
