// zoowy 贴边浮标：所有页面常驻的小老鼠，可拖动 / 可隐藏 / 可召回，点开是悬浮聊天窗。
// 对话逻辑（历史 / 提议 / 草案 / 停止本轮）完全复用 ZoowyChat.open()，
// 这里只管容器、显隐、位置、访客门；调用方传 surface:'floating' 换壳。
const ZoowyFloat = (() => {
  const HIDE_KEY = 'footprint.zoowy.dock.hidden';
  const POS_KEY = 'footprint.zoowy.dock.pos';
  const DRAG_MIN = 5;   // 位移超过 5px 才算拖动，避免误伤点击
  const EDGE_SNAP = 40; // 松手时离右边缘 < 40px 就吸附回默认贴边
  let dock = null;
  let fab = null;
  let panel = null;
  let host = null;
  let drag = null;
  let lastDragEnd = 0;

  function mouseIcon() {
    return window.pixelIcon ? window.pixelIcon('mouse', 'zf-mouse') : '🐭';
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function readHidden() {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch (e) { return false; }
  }
  function writeHidden(v) {
    try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch (e) { /* 隐私模式忽略 */ }
  }

  // 位置按视口比例存，窗口缩放后仍在屏幕内
  function readPos() {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY));
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
    } catch (e) { return null; }
  }
  function writePos(x, y) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: x / innerWidth, y: y / innerHeight })); }
    catch (e) { /* 隐私模式忽略 */ }
  }
  function clearPos() {
    try { localStorage.removeItem(POS_KEY); } catch (e) { /* 忽略 */ }
  }

  function applyPos() {
    const p = readPos();
    if (!p) return;
    const w = dock.offsetWidth || 58, h = dock.offsetHeight || 90;
    dock.style.left = clamp(p.x * innerWidth, 0, Math.max(0, innerWidth - w)) + 'px';
    dock.style.top = clamp(p.y * innerHeight, 0, Math.max(0, innerHeight - h)) + 'px';
    dock.style.right = 'auto';
    dock.classList.add('is-dragged');
  }
  function resetPos() {
    clearPos();
    dock.classList.remove('is-dragged');
    dock.style.left = '';
    dock.style.top = '';
    dock.style.right = '';
    if (panel) panel.classList.remove('is-left');
  }
  function syncPanelSide() {
    if (!panel) return;
    const r = dock.getBoundingClientRect();
    panel.classList.toggle('is-left', r.left + r.width / 2 < innerWidth / 2);
  }

  // 鼠标 / 触屏统一用 pointer 事件；拖过之后抑制紧随的 click，避免「拖完弹出对话窗」
  function bindDrag() {
    fab.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      const r = dock.getBoundingClientRect();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
      try { fab.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    });
    fab.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_MIN) return;
      if (!drag.moved) {
        drag.moved = true;
        // 从 right 贴边锚点切到 left/top，先固化当前实际位置，避免起手瞬间跳一下
        dock.style.left = drag.ox + 'px';
        dock.style.top = drag.oy + 'px';
        dock.style.right = 'auto';
        dock.classList.add('is-dragged', 'is-dragging');
      }
      const w = dock.offsetWidth || 58, h = dock.offsetHeight || 90;
      drag.x = clamp(drag.ox + dx, 0, Math.max(0, innerWidth - w));
      drag.y = clamp(drag.oy + dy, 0, Math.max(0, innerHeight - h));
      dock.style.left = drag.x + 'px';
      dock.style.top = drag.y + 'px';
      e.preventDefault();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      dock.classList.remove('is-dragging');
      try { fab.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (!d.moved) return;
      lastDragEnd = Date.now();
      if (d.x + (dock.offsetWidth || 58) >= innerWidth - EDGE_SNAP) resetPos(); // 拖回右边 = 复位贴边
      else { writePos(d.x, d.y); syncPanelSide(); }
    };
    fab.addEventListener('pointerup', end);
    fab.addEventListener('pointercancel', end);
  }

  function build() {
    dock = document.createElement('div');
    dock.className = 'zf-dock';
    dock.innerHTML = `
      <button class="zf-fab" type="button" aria-label="和 zoowy 聊聊（可拖动）" aria-expanded="false" title="点一下聊天，按住可拖动">
        ${mouseIcon()}<span class="zf-fab-label">zoowy</span>
      </button>
      <button class="zf-hide" type="button" aria-label="隐藏 zoowy 浮标" title="隐藏浮标">−</button>
      <button class="zf-peek" type="button" aria-label="把小老鼠叫回来" title="把小老鼠叫回来"></button>`;
    fab = dock.querySelector('.zf-fab');
    fab.addEventListener('click', openChat);
    bindDrag();
    dock.querySelector('.zf-hide').addEventListener('click', () => {
      dock.classList.add('is-hidden');
      writeHidden(true);
      if (panel && !panel.hidden) close();
    });
    dock.querySelector('.zf-peek').addEventListener('click', () => {
      dock.classList.remove('is-hidden');
      writeHidden(false);
    });
    if (readHidden()) dock.classList.add('is-hidden');
    document.body.appendChild(dock);

    panel = document.createElement('section');
    panel.className = 'zf-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'zoowy 对话');
    panel.innerHTML = `
      <header class="zf-head">
        <span class="zf-head-ico">${mouseIcon()}</span>
        <span class="zf-head-title">zoowy · 随时聊聊</span>
        <button type="button" class="zf-close" aria-label="收起对话">✕</button>
      </header>
      <div class="zf-host"></div>
      <div class="zf-foot">目标 / 进展 / 计划都能聊 · Enter 发送，Shift+Enter 换行</div>`;
    host = panel.querySelector('.zf-host');
    panel.querySelector('.zf-close').addEventListener('click', close);
    document.body.appendChild(panel);

    applyPos();
    syncPanelSide();
  }

  async function openChat() {
    if (Date.now() - lastDragEnd < 350) return; // 刚拖完，别把 pointerup 的 click 当打开
    if (panel && !panel.hidden) { close(); return; }
    // App.boot() 异步：刚开页 state.me 可能还没回来，先探测一次，别把已登录用户误判成访客
    let logged = !!(window.App && App.state && App.state.me);
    if (!logged && window.api) {
      try { const r = await api.get('/api/me'); logged = !!(r && r.user); } catch (e) { logged = false; }
    }
    if (!logged) { UI.requireAuth(); return; }
    ZoowyChat.open({ title: 'zoowy', surface: 'floating' });
  }

  // 由 ZoowyChat.open({ surface: 'floating' }) 在构建完 body 后调用
  function mount(body, title) {
    if (!panel) build();
    // 重复打开时先清掉旧会话，避免两套事件监听 / 轮询叠在一起
    host.replaceChildren(body);
    const label = title && title !== 'zoowy' ? `zoowy · ${title}` : 'zoowy · 随时聊聊';
    panel.querySelector('.zf-head-title').textContent = label;
    panel.hidden = false;
    syncPanelSide();
    dock.classList.add('is-open');
    fab.setAttribute('aria-expanded', 'true');
    // 桌面才自动聚焦，移动端别突然弹键盘
    if (window.matchMedia('(min-width: 760px)').matches) {
      setTimeout(() => { const t = body.querySelector('textarea'); if (t) t.focus(); }, 60);
    }
  }

  function close() {
    if (!panel) return;
    panel.hidden = true;
    host.replaceChildren();
    if (dock) dock.classList.remove('is-open');
    if (fab) fab.setAttribute('aria-expanded', 'false');
  }

  function init() {
    if (dock) return;
    // 浮标挂在 body 上、position:fixed，切页重写 #view 不会影响它，所有页面常驻
    build();
    window.addEventListener('resize', () => {
      if (!dock) return;
      if (dock.classList.contains('is-dragged')) applyPos();
      syncPanelSide();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { mount, close, open: () => fab && fab.click() };
})();
window.ZoowyFloat = ZoowyFloat;
