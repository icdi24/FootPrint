/* ═══════════════════════════════════════════════════════════════
   motion.js · 手写像素动效，无依赖
   通过原生 MutationObserver / IntersectionObserver 自动挂载，
   不侵入 app.js。也可手动调用 FP_MOTION.burst() / .refresh()。
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ── 像素迸裂 ──────────────────────────────────────────────
     在给定坐标迸出 N 个硬边小方块，steps() 飞散后自动移除。
     灵感来自 confetti / particle burst，改成 2~4px 方块 + 直角。 */
  const PALETTE = ['#F5C451', '#7CBF55', '#E8C89A', '#FFF8E7', '#E2605A', '#63A9DC'];

  function burst(target, opts = {}) {
    if (REDUCED) return;
    let x, y;
    if (target && typeof target.getBoundingClientRect === 'function') {
      const r = target.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    } else if (target && typeof target.x === 'number') {
      x = target.x; y = target.y;
    } else {
      x = window.innerWidth / 2; y = window.innerHeight / 2;
    }

    const n = opts.count || 10;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'fp-burst';
      const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.7;
      const dist = 28 + Math.random() * 46;
      const size = 2 + Math.floor(Math.random() * 3);
      p.style.left = (x - size / 2) + 'px';
      p.style.top = (y - size / 2) + 'px';
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.background = PALETTE[i % PALETTE.length];
      p.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
      p.style.setProperty('--dy', Math.round(Math.sin(ang) * dist + 18) + 'px');
      p.style.setProperty('--dur', (480 + Math.random() * 260) + 'ms');
      frag.appendChild(p);
      p.addEventListener('animationend', () => p.remove(), { once: true });
      // 兜底：动画被系统跳过时也要清掉节点
      setTimeout(() => p.remove(), 1200);
    }
    document.body.appendChild(frag);
  }

  /* ── 数字变化：像素抖动 ─────────────────────────────────── */
  const NUM_SELECTORS = [
    '.wallet-num', '.wb-num', '.sc-val', '.gs-badge', '.us-sub-badge',
    '.wk-stat b', '.chat-unread', '#navBadge', '.big-count b',
  ];
  const numCache = new WeakMap();

  function bump(el) {
    if (REDUCED || !el) return;
    el.classList.remove('fp-count-bump');
    void el.offsetWidth;               // 强制重排，让动画能重播
    el.classList.add('fp-count-bump');
  }

  function checkNumbers() {
    NUM_SELECTORS.forEach((sel) => {
      $$(sel).forEach((el) => {
        const v = el.textContent;
        const prev = numCache.get(el);
        if (prev !== undefined && prev !== v) bump(el);
        numCache.set(el, v);
      });
    });
  }

  /* ── 交错入场 ────────────────────────────────────────────── */
  const STAGGER_SELECTORS = [
    '.wood-panel', '.stat-cell', '.us-drawer', '.goals-week', '.wish-banner',
  ];

  function applyStagger(root) {
    if (REDUCED) return;
    const els = [];
    STAGGER_SELECTORS.forEach((sel) => els.push(...$$(sel, root || document)));
    // 只处理本轮新出现的节点
    const fresh = els.filter((el) => !el.dataset.fpStagger);
    if (!fresh.length) return;
    // 按屏幕上的先后顺序排序，视觉更自然
    fresh.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
    fresh.forEach((el, i) => {
      el.dataset.fpStagger = '1';
      el.style.setProperty('--stagger-i', Math.min(i, 8));
      el.classList.add('fp-stagger');
      el.addEventListener('animationend', () => el.classList.remove('fp-stagger'), { once: true });
    });
  }

  /* ── 滚动显现 ────────────────────────────────────────────── */
  const REVEAL_SELECTORS = [
    '.red-row', '.diary-row', '.plan-row', '.goal-mini',
    '.timeline-list li', '.ledger tbody tr', '.ledger-row',
  ];

  let revealObserver = null;
  function applyReveal(root) {
    if (REDUCED || !('IntersectionObserver' in window)) {
      // 不支持或减弱动效：直接显示
      REVEAL_SELECTORS.forEach((s) => $$(s, root || document).forEach((el) => el.classList.add('is-revealed')));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-revealed');
            revealObserver.unobserve(e.target);
          }
        });
      }, { rootMargin: '0px 0px 40px 0px', threshold: 0.05 });
    }
    REVEAL_SELECTORS.forEach((sel) => {
      $$(sel, root || document).forEach((el) => {
        if (el.dataset.fpReveal) return;
        el.dataset.fpReveal = '1';
        el.classList.add('fp-reveal');
        revealObserver.observe(el);
      });
    });
  }

  /* ── 今天脉冲 & 徽章出现 ─────────────────────────────────── */
  function applyTodayPulse(root) {
    if (REDUCED) return;
    $$('.wk-cell.is-today, .wk-head.is-today, .cal-cell.is-today', root || document).forEach((el) => {
      if (!el.dataset.fpPulse) { el.dataset.fpPulse = '1'; el.classList.add('fp-today-pulse'); }
    });
  }
  function applyBadgePop(root) {
    if (REDUCED) return;
    $$('.tab-badge, .nav-badge, #navBadge', root || document).forEach((el) => {
      if (el.dataset.fpBadge || el.hidden) return;
      el.dataset.fpBadge = '1';
      el.classList.add('fp-badge-pop');
      el.addEventListener('animationend', () => el.classList.remove('fp-badge-pop'), { once: true });
    });
  }

  /* ── hover 微交互（只加 class，效果全在 CSS） ────────────── */
  function applyHover(root) {
    $$('.wish-card, .wk-cell, .stat-cell, .goal-mini, .plan-row, .task-emoji', root || document).forEach((el) => {
      if (!el.dataset.fpHover) { el.dataset.fpHover = '1'; el.classList.add('fp-hover'); }
    });
  }

  /* ── 一次性刷新：DOM 变化后重新绑定 ──────────────────────── */
  let refreshScheduled = false;
  function refresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      applyStagger();
      applyReveal();
      applyTodayPulse();
      applyBadgePop();
      applyHover();
      applyDialog();
      applyRipple();
      applyTyping();
      applyMorph();
      checkNumbers();
    });
  }

  /* ── Toast：成功时迸裂 ───────────────────────────────────── */
  const HAPPY = /已保存|打卡|通过|成功|已兑换|记下来|已收到|已记录|完成|已打卡/;
  let toastWasOn = false;
  function watchToast() {
    const t = $('#toast');
    if (!t) return;
    const now = t.classList.contains('is-on');
    if (now && !toastWasOn) {
      const txt = (t.textContent || '').trim();
      if (HAPPY.test(txt)) {
        const r = t.getBoundingClientRect();
        burst({ x: r.left + r.width / 2, y: r.top - 6 }, { count: 9 });
      }
    }
    toastWasOn = now;
  }

  /* ── 观察 DOM 变化（只监听节点增删，不监听属性，避免自激循环） ── */
  function startObservers() {
    const domObserver = new MutationObserver((muts) => {
      refresh();
      watchToast();
      // 数字文本可能在子节点里替换
      checkNumbers();
    });
    ['#viewMount', '#myTasks', '#partnerTasks', '#zoowyHost', '#sheetLayer', '#chatList'].forEach((sel) => {
      const el = $(sel);
      if (el) domObserver.observe(el, { childList: true, subtree: true, characterData: true });
    });
    // 弹层是 is-on 的 class 变化，childList 观察不到，单独补一个属性观察
    const layer = $('#sheetLayer');
    if (layer) {
      new MutationObserver(refresh).observe(layer, { attributes: true, attributeFilter: ['class'], subtree: true });
    }

    const toast = $('#toast');
    if (toast) {
      new MutationObserver(watchToast).observe(toast, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
    }
    // 数字轮询兜底（rollNumber 逐帧改文本，MutationObserver 可能合并）
    setInterval(checkNumbers, 500);
  }

  /* ── 按下反馈 ────────────────────────────────────────────── */
  const PRESS_SELECTORS = '.wood-btn,.check-btn,.chip-btn,.hold-btn,.cal-arrow,.range-btn,.goals-subtab,.me-subtab,.us-drawer-head,.us-subtab';
  document.addEventListener('pointerdown', (e) => {
    if (REDUCED) return;
    const btn = e.target.closest && e.target.closest(PRESS_SELECTORS);
    if (!btn) return;
    btn.classList.remove('fp-press');
    void btn.offsetWidth;
    btn.classList.add('fp-press');
    btn.addEventListener('animationend', () => btn.classList.remove('fp-press'), { once: true });
  }, true);


  /* ═══════════════════════════════════════════════════════
     以下 4 组改写自 React Bits / Motion（见 REPORT-motion.md）
     全部原生实现，不引库
     ═══════════════════════════════════════════════════════ */

  /* ── 9. 游戏对话框展开（Motion·Cabinet） ─────────────────
     先横向拉开、再纵向拉开，steps() 硬跳变。只加 class，不改
     原有 transition，关闭时仍走原逻辑。 */
  function applyDialog(root) {
    if (REDUCED) return;
    $$('.sheet-backdrop.is-on .sheet', root || document).forEach((el) => {
      if (!el.dataset.fpDialog) {
        el.dataset.fpDialog = '1';
        el.classList.add('fp-dialog');
        el.addEventListener('animationend', () => el.classList.remove('fp-dialog'), { once: true });
      }
    });
  }

  /* ── 10. 像素云漂移（Motion·Cabinet） ───────────────────
     3 朵硬边像素云，steps(30) 整格横移，极淡，仅宽屏显示。 */
  let skyBuilt = false;
  function buildSky() {
    if (REDUCED || skyBuilt || window.innerWidth < 1100) return;
    skyBuilt = true;
    const sky = document.createElement('div');
    sky.className = 'fp-sky';
    sky.setAttribute('aria-hidden', 'true');
    [[14, 52, 0], [26, 74, -18], [9, 63, -37]].forEach(([top, dur, delay]) => {
      const cloud = document.createElement('i');
      cloud.className = 'fp-cloud';
      cloud.style.top = top + '%';
      cloud.style.setProperty('--dur', dur + 's');
      cloud.style.setProperty('--delay', delay + 's');
      sky.appendChild(cloud);
    });
    document.body.appendChild(sky);
  }

  /* ── 11. 像素涟漪 hover（Motion·Pixels / React Bits·Pixel Card）
     6×6 点阵，按到光标所在格的曼哈顿距离依次闪一下。 */
  const RIPPLE_SELECTORS = '.task-emoji, .stat-cell, .wish-card, .wk-cell';
  function applyRipple(root) {
    if (REDUCED) return;
    $$(RIPPLE_SELECTORS, root || document).forEach((el) => {
      if (el.dataset.fpRippleBound) return;
      el.dataset.fpRippleBound = '1';
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.addEventListener('pointerenter', (e) => {
        let grid = el.querySelector(':scope > .fp-ripple');
        if (!grid) {
          grid = document.createElement('span');
          grid.className = 'fp-ripple';
          grid.setAttribute('aria-hidden', 'true');
          for (let i = 0; i < 36; i++) grid.appendChild(document.createElement('i'));
          el.appendChild(grid);
        }
        const r = el.getBoundingClientRect();
        const gx = Math.min(5, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 6)));
        const gy = Math.min(5, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * 6)));
        Array.from(grid.children).forEach((cell, i) => {
          const x = i % 6, y = Math.floor(i / 6);
          cell.style.setProperty('--d', Math.abs(x - gx) + Math.abs(y - gy));
        });
        grid.classList.remove('is-on');
        void grid.offsetWidth;
        grid.classList.add('is-on');
      });
    });
  }

  /* ── 12. 打字机（React Bits·Text Type / Motion·Cabinet 对话文本）
     只处理新增的、纯文本的气泡；改动前先打标记，防止 observer 自激。 */
  let motionBootAt = 0;                         // init 时赋值
  function applyTyping(root) {
    if (REDUCED) return;
    const all = $$('.zoowy-bubble, .chat-row .msg-text', root || document);
    // 宽限期：首屏历史消息一次性插入，全部标记跳过，避免十几条同时打字
    if (performance.now() - motionBootAt < 1200) {
      all.forEach((el) => { el.dataset.fpTyped = '1'; });
      return;
    }
    // 只处理最后一条（新回复），且只处理纯文本气泡，避免破坏 <br/> 等结构
    const el = all[all.length - 1];
    if (!el || el.dataset.fpTyped || el.children.length) return;
    const full = el.textContent;
    if (!full || full.length < 4 || full.length > 220) return;
    el.dataset.fpTyped = '1';                    // 先打标记，防止 observer 自激
    const t0 = performance.now();
    const speed = 16;                           // 每字毫秒
    el.textContent = '';
    el.classList.add('fp-typing');
    (function step(now) {
      const n = Math.min(full.length, Math.floor((now - t0) / speed));
      el.textContent = full.slice(0, n);
      if (n < full.length) requestAnimationFrame(step);
      else el.classList.remove('fp-typing');
    })(t0);
  }

  /* ── 状态 chip morph（React Bits·Status Mark） ─────────── */
  function applyMorph(root) {
    if (REDUCED) return;
    $$('.pending-tag', root || document).forEach((el) => {
      if (el.dataset.fpMorph) return;
      el.dataset.fpMorph = '1';
      el.classList.add('fp-morph');
      el.addEventListener('animationend', () => el.classList.remove('fp-morph'), { once: true });
    });
  }

  /* ── 启动 ────────────────────────────────────────────────── */
  function init() {
    motionBootAt = performance.now();
    buildSky();
    startObservers();
    refresh();
    watchToast();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.FP_MOTION = { burst, refresh, checkNumbers, buildSky, reduced: REDUCED };
})();
