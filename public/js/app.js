// 应用壳：启动、认证门、Tab 路由、滑动指示条。
const App = (() => {
  const state = { me: null, partner: null, tab: 'home', refresh: {}, pointsCfg: null };

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
        <span class="tab-ico">${window.pixelIcon ? window.pixelIcon(t.icon, 'tab-art') : window.icon(t.icon)}</span>
        <span class="tab-label">${t.label}</span>
      </button>`).join('');
    bar.className = `tabbar sel-${TABS.findIndex((t) => t.key === state.tab)}`;
    bar.querySelectorAll('.tab-item').forEach((btn) => {
      btn.addEventListener('click', () => showTab(btn.dataset.key));
    });
  }

  // 切页漂浮动效：参数集中在这里，改风格只改这一处
  const ANIM = { dur: 0.46, ease: 'power3.out', drift: 18, lift: 16, stagger: 0.035 };
  let activeKey = null;
  let stopDeco = null; // 上一次切页的分区图标观察器

  function playTransition(holder, key, dir) {
    const gsap = window.gsap;
    // 库没加载 / 系统开启「减弱动态效果」时，降级为原来的直接切换
    if (!gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const run = () => {
      if (!holder.isConnected || activeKey !== key) return; // 快速连点：丢弃过期动画
      gsap.fromTo(holder,
        { autoAlpha: 0, x: (dir >= 0 ? 1 : -1) * ANIM.drift, y: ANIM.lift, scale: 0.985 },
        { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: ANIM.dur, ease: ANIM.ease,
          overwrite: 'auto', clearProps: 'transform,opacity,visibility' });
      // 顶层块错落上浮，制造轻盈的错层漂浮感；跳过已有 CSS stagger 动画的元素
      const kids = Array.from(holder.children)
        .filter((el) => !el.classList.contains('stagger-in')).slice(0, 12);
      if (kids.length > 1) {
        gsap.fromTo(kids,
          { autoAlpha: 0, y: 9 },
          { autoAlpha: 1, y: 0, duration: 0.38, stagger: ANIM.stagger, ease: 'sine.out',
            delay: 0.05, overwrite: 'auto', clearProps: 'transform,opacity,visibility' });
      }
    };

    // 多数页面是异步渲染（先塞 .page-loading 再换内容），等真实内容落定再播，避免动效空转
    if (!holder.querySelector('.page-loading')) { run(); return; }
    holder.style.visibility = 'hidden';
    let done = false;
    const obs = new MutationObserver(() => {
      if (!holder.querySelector('.page-loading')) finish();
    });
    obs.observe(holder, { childList: true });
    const timer = setTimeout(finish, 1500); // 接口卡住时兜底，绝不让页面一直隐身
    function finish() {
      if (done) return;
      done = true;
      obs.disconnect();
      clearTimeout(timer);
      holder.style.visibility = '';
      run();
    }
  }

  function showTab(key) {
    if (!pages[key]) return;
    const prev = TABS.findIndex((t) => t.key === state.tab);
    const next = TABS.findIndex((t) => t.key === key);
    if (stopDeco) { stopDeco(); stopDeco = null; }
    state.tab = key;
    activeKey = key;
    renderTabbar();
    const view = document.getElementById('view');
    if (window.gsap) window.gsap.killTweensOf(view.querySelectorAll('.page'));
    view.innerHTML = '';
    const holder = document.createElement('div');
    holder.className = 'page';
    view.appendChild(holder);
    pages[key].render(holder);
    // 各页多为异步渲染，等真实内容落定后给分区标题补上语义图标
    stopDeco = window.SecIcons ? window.SecIcons.watch(holder) : null;
    window.scrollTo(0, 0);
    playTransition(holder, key, next - prev);
  }

  function showShell() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    renderTabbar();
    showTab('home');
  }

  function showAuth() {
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    if (typeof AuthPage !== 'undefined') AuthPage.render(document.getElementById('auth-screen'));
  }

  async function boot() {
    try {
      const me = await api.get('/api/me');
      state.me = me.user;
      try {
        const cfg = await api.get('/api/settings');
        state.pointsCfg = cfg.points;
      } catch (e) { /* 系数拉不到就用默认 */ }
      showShell();
    } catch (e) {
      showAuth();
    }
  }

  return { state, pages, register, showTab, showShell, showAuth, boot };
})();

document.addEventListener('DOMContentLoaded', () => App.boot());
