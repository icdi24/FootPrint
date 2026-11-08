// 应用壳：启动、认证门、Tab 路由、滑动指示条。
const App = (() => {
  const state = { me: null, partner: null, tab: 'home', refresh: {}, pointsCfg: null, localNoLogin: false };

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
        <span class="tab-ico">${window.icon(t.icon)}</span>
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
    view.style.transition = 'opacity 0.2s';
    
    // 1. 设置加载中状态
    view.style.opacity = '0';
    setTimeout(() => {
        view.innerHTML = `<div class="page-cloud-loader">${UI.cloudLoading(
            key === 'home' ? '正在整理今天的待办... 🐾' :
            key === 'goals' ? '正在翻看这周的目标打卡... 🎯' :
            key === 'wish' ? '正在查看心愿清单... 🎁' :
            key === 'partner' ? '正在联络搭档的数据... 👫' :
            '正在载入个人脚印... 🌿'
        )}</div>`;
        view.style.opacity = '1';
    }, 50);

    // 2. 异步执行页面渲染
    const holder = document.createElement('div');
    holder.className = 'page';
    
    // 确保 render 完成后再替换视图
    pages[key].render(holder).then(() => {
        view.style.opacity = '0';
        setTimeout(() => {
            view.innerHTML = '';
            view.appendChild(holder);
            view.style.opacity = '1';
        }, 200);
    });

    window.scrollTo(0, 0);
  }

  function showShell() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    renderTabbar();
    showTab('home');
  }

  function showAuth() {
    // 本地免登录模式不允许回到登录页
    if (state.localNoLogin) {
      showShell();
      return;
    }
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    if (typeof AuthPage !== 'undefined') AuthPage.render(document.getElementById('auth-screen'));
  }

  async function boot() {
    try {
      const me = await api.get('/api/me');
      state.me = me.user;
      state.localNoLogin = !!me.localNoLogin;
      try {
        const cfg = await api.get('/api/settings');
        state.pointsCfg = cfg.points;
      } catch (e) { /* 系数拉不到就用默认 */ }
      showShell();
      document.getElementById('loader').style.display = 'none';
    } catch (e) {
      document.getElementById('loader').style.display = 'none';
      showAuth();
    }
  }

  return { state, pages, register, showTab, showShell, showAuth, boot };
})();

document.addEventListener('DOMContentLoaded', () => App.boot());
