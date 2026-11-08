// 应用壳：启动、认证门、Tab 路由、滑动指示条。
const App = (() => {
  const state = { me: null, partner: null, tab: 'home', refresh: {}, pointsCfg: null, chatUnread: 0 };

  // 客户端积分预览（与服务端同公式，用于弹层即时反馈）
  window.__DEFAULT_CFG = {
    unit: 0.5, cap: 60, maxPer: 300,
    difficulty: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.2 },
    freq: { daily: 1.0, weekly34: 1.2, weekly12: 1.5, weekdays: 1.0 },
    window: { in: 1.1, none: 1.0, out: 0.8 },
    milestones: [],
  };
  window.__calcClient = (goal, duration, inWin) => {
    const cp = Number(goal.custom_points);
    if (Number.isInteger(cp) && cp > 0) return cp;
    const cfg = state.pointsCfg || window.__DEFAULT_CFG;
    const B = Math.min(duration * cfg.unit, cfg.cap);
    const D = cfg.difficulty[goal.difficulty] || 1.5;
    const F = goal.freq_mode === 'daily' ? cfg.freq.daily
      : goal.freq_mode === 'weekly' ? (Number(goal.freq_n) >= 3 ? cfg.freq.weekly34 : cfg.freq.weekly12)
      : cfg.freq.weekdays;
    const T = inWin ? cfg.window.in : goal.window_start ? cfg.window.out : cfg.window.none;
    return Math.min(Math.round(B * D * F * T), cfg.maxPer);
  };
  window.__inWindowCheck = (goal) => {
    if (!goal.window_start || !goal.window_end) return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [h1, m1] = goal.window_start.split(':').map(Number);
    const [h2, m2] = goal.window_end.split(':').map(Number);
    return cur >= h1 * 60 + m1 && cur < h2 * 60 + m2;
  };

  const TABS = [
    { key: 'home', label: '今天', icon: 'home' },
    { key: 'goals', label: '目标', icon: 'target' },
    { key: 'wish', label: '愿望单', icon: 'gift' },
    { key: 'partner', label: '我们', icon: 'us' },
    { key: 'me', label: '我的', icon: 'me' },
  ];
  const pages = {}; // key -> {render(el)}

  function register(key, page) { pages[key] = page; }

  function renderTabbar() {
    const bar = document.getElementById('tabbar');
    if (!bar) return;
    bar.innerHTML = `<div class="tab-slider"></div>` + TABS.map((t) => `
      <button class="tab-item ${state.tab === t.key ? 'active' : ''}" data-key="${t.key}">
        <span class="tab-ico">${window.icon(t.icon)}${t.key === 'partner' && state.chatUnread ? `<i class="tab-badge">${Math.min(state.chatUnread, 99)}</i>` : ''}</span>
        <span class="tab-label">${t.label}</span>
      </button>`).join('');
    bar.className = `tabbar sel-${TABS.findIndex((t) => t.key === state.tab)}`;
    bar.querySelectorAll('.tab-item').forEach((btn) => {
      btn.addEventListener('click', () => showTab(btn.dataset.key));
    });
  }

  function showTab(key) {
    if (!pages[key]) return;
    state.tab = key;
    renderTabbar();
    const view = document.getElementById('view');
    view.classList.remove('anim');
    void view.offsetWidth; // 重启动画
    view.classList.add('anim');
    view.innerHTML = '';
    const holder = document.createElement('div');
    holder.className = 'page';
    view.appendChild(holder);
    pages[key].render(holder);
    window.scrollTo(0, 0);
  }

  function showShell() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    renderTabbar();
    showTab(state.tab);
    if (state.me && typeof Chat !== 'undefined') Chat.connect();
  }

  // mode: 'login' | 'register'
  function showAuth(mode = 'login') {
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    if (typeof Chat !== 'undefined') Chat.disconnect();
    if (typeof AuthPage !== 'undefined') AuthPage.render(document.getElementById('auth-screen'), { register: mode === 'register' });
  }

  // 访客：未登录（仍能逛界面，只是不能使用功能）
  function isGuest() { return !state.me; }

  // 登录/注册成功后：拉积分系数 + 回到当前 Tab 重渲染
  async function onAuthed() {
    try {
      const cfg = await api.get('/api/settings');
      state.pointsCfg = cfg.points;
    } catch (e) { /* 系数拉不到就用默认 */ }
    showShell();
  }

  async function boot() {
    // 先探测登录态，但无论是否登录都进壳：未登录即「访客可逛」模式
    try {
      const me = await api.get('/api/me');
      state.me = me.user;
      try {
        const cfg = await api.get('/api/settings');
        state.pointsCfg = cfg.points;
      } catch (e) { /* 系数拉不到就用默认 */ }
    } catch (e) {
      state.me = null;
    }
    showShell();
  }

  return { state, pages, register, showTab, showShell, showAuth, isGuest, onAuthed, boot, setChatUnread(n) { state.chatUnread = n; renderTabbar(); } };
})();

document.addEventListener('DOMContentLoaded', () => App.boot());
