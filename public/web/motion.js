/* ═══════════════════════════════════════════════════════════════
   motion.js · 手写像素动效，无依赖
   通过原生 MutationObserver / IntersectionObserver 自动挂载，
   不侵入 app.js。也可手动调用 FP_MOTION.burst() / .refresh()。
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LS_KEY = 'footprint.web.motion';
  let MOTION_ON = !REDUCED;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'off') MOTION_ON = false;
    else if (saved === 'on') MOTION_ON = !REDUCED;
  } catch (e) { /* 隐私模式下 localStorage 不可用 */ }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ── 像素迸裂 ──────────────────────────────────────────────
     在给定坐标迸出 N 个硬边小方块，steps() 飞散后自动移除。
     灵感来自 confetti / particle burst，改成 2~4px 方块 + 直角。 */
  const PALETTE = ['#F5C451', '#7CBF55', '#E8C89A', '#FFF8E7', '#E2605A', '#63A9DC'];

  function burst(target, opts = {}) {
    if (!MOTION_ON) return;
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
    if (!MOTION_ON || !el) return;
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
    if (!MOTION_ON) return;
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
    if (!MOTION_ON || !('IntersectionObserver' in window)) {
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
    if (!MOTION_ON) return;
    $$('.wk-cell.is-today, .wk-head.is-today, .cal-cell.is-today', root || document).forEach((el) => {
      if (!el.dataset.fpPulse) { el.dataset.fpPulse = '1'; el.classList.add('fp-today-pulse'); }
    });
  }
  function applyBadgePop(root) {
    if (!MOTION_ON) return;
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
      injectMotionPanel();
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
    if (!MOTION_ON) return;
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
    if (!MOTION_ON) return;
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
    if (!MOTION_ON || skyBuilt || window.innerWidth < 1100) return;
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
    if (!MOTION_ON) return;
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
    if (!MOTION_ON) return;
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
    if (!MOTION_ON) return;
    $$('.pending-tag', root || document).forEach((el) => {
      if (el.dataset.fpMorph) return;
      el.dataset.fpMorph = '1';
      el.classList.add('fp-morph');
      el.addEventListener('animationend', () => el.classList.remove('fp-morph'), { once: true });
    });
  }


  /* ═══════════════════════════════════════════════════════
     两个可见组件 + 运行时开关
     ═══════════════════════════════════════════════════════ */

  const WD = ['一', '二', '三', '四', '五', '六', '日'];
  function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function mondayOf() {
    const d = new Date();
    const wd = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - (wd - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /* A. 本周坚持条：注入到今日页 .board-foot 之后 */
  let weekData = null;
  function renderWeekStrip() {
    const host = $('.board-foot');
    if (!host) return;
    let strip = $('.fp-week-strip');
    if (!strip) {
      host.insertAdjacentHTML('afterend', '<div class="fp-week-strip" id="fpWeekStrip"></div>');
      strip = $('#fpWeekStrip');
    }
    const mon = mondayOf();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cells = [];
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(d.getDate() + i);
      const key = ymd(d);
      const has = weekData && weekData[key] > 0;
      const isToday = key === ymd(today);
      const future = d > today;
      let cls = future ? 'is-future' : has ? 'is-done' : 'is-miss';
      if (isToday) cls += ' is-today';
      if (has) done++;
      cells.push(`<span class="fws-cell ${cls}" style="--i:${i}" title="${key}"><i></i><small>周${WD[i]}</small></span>`);
    }
    const elapsed = Math.min(7, new Date().getDay() === 0 ? 7 : new Date().getDay());
    const note = weekData
      ? `本周已过 <b>${elapsed}</b> 天 · <b>${done}</b> 天有打卡${elapsed > 0 && done === elapsed ? ' · 一天没落 ✓' : ''}`
      : '登录后这里会显示这一周的坚持情况';
    strip.innerHTML = `<div class="fws-head"><span class="fws-title">这一周</span><span class="fws-note">${note}</span></div>
      <div class="fws-cells">${cells.join('')}</div>`;
  }

  let weekLoaded = false;
  function loadWeekStrip() {
    if (weekLoaded) return;
    weekLoaded = true;
    fetch('/api/checkins', { credentials: 'same-origin' })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!j) return;
        const list = j.checkins || j.checks || [];
        const byDate = {};
        list.forEach((c) => {
          const d = c.check_date || c.date;
          if (d && c.status === 'credited') byDate[d] = (byDate[d] || 0) + 1;
        });
        weekData = byDate;
        renderWeekStrip();
      })
      .catch(() => {});
    renderWeekStrip();                 // 先渲染占位
  }

  /* B. 界面动效设置卡：注入到「我的 → 设置」pane */
  const DEMOS = [
    ['burst', '像素迸裂'], ['ripple', '像素涟漪'], ['dialog', '对话框展开'],
    ['toast', 'Toast 引信'], ['typing', '打字机'], ['cloud', '像素云'],
    ['count', '数字抖动'], ['stagger', '交错入场'], ['reveal', '滚动显现'],
    ['press', '按下反馈'], ['hover', '边框跳变'], ['morph', '状态 morph'],
  ];

  function injectMotionPanel() {
    const tabBtn = $('[data-me-tab="setting"]');
    const pane = $('.me-pane');
    if (!tabBtn || !pane || !tabBtn.classList.contains('is-on')) return;
    if ($('.fp-motion-panel', pane)) return;
    const grid = DEMOS.map(([k, label]) =>
      `<button class="fp-demo-btn" type="button" data-fp-demo="${k}">${label}</button>`).join('');
    pane.insertAdjacentHTML('beforeend', `
      <section class="wood-panel sub-panel fp-motion-panel">
        <div class="panel-head"><h2><span class="wood-tag wood-tag-gold">界面动效</span></h2></div>
        <div class="cfg-row"><span>启用像素动效</span>
          <button class="chip-btn${MOTION_ON ? ' is-on' : ''}" type="button" data-fp-toggle>${MOTION_ON ? '开' : '关'}</button></div>
        <p class="fg-note">关掉后所有动效停止；系统开启「减弱动态效果」时默认关闭。</p>
        <div class="fp-demo-grid">${grid}</div>
        <p class="fp-demo-tip" id="fpDemoTip">点任意一个格子单独试，或点下面「逐个试一下」。</p>
        <div class="ng-actions"><button class="wood-btn wood-btn-sm" type="button" data-fp-demo-all>逐个试一下</button></div>
      </section>`);
  }

  function setEnabled(v) {
    MOTION_ON = !!v;
    try { localStorage.setItem(LS_KEY, MOTION_ON ? 'on' : 'off'); } catch (e) {}
    document.body.classList.toggle('fp-motion-off', !MOTION_ON);
    if (!MOTION_ON) $$('.fp-burst').forEach((el) => el.remove());
    const btn = $('[data-fp-toggle]');
    if (btn) { btn.textContent = MOTION_ON ? '开' : '关'; btn.classList.toggle('is-on', MOTION_ON); }
    if (MOTION_ON) refresh();
  }

  /* 单个演示 */
  function demoOne(key) {
    const tip = $('#fpDemoTip');
    const label = (DEMOS.find((d) => d[0] === key) || [key, key])[1];
    $$('.fp-demo-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.fpDemo === key));
    if (tip) tip.textContent = `正在演示：${label}`;
    const panel = $('.fp-motion-panel') || document.body;

    if (!MOTION_ON) setEnabled(true);

    switch (key) {
      case 'burst':
        burst(panel, { count: 14 });
        break;
      case 'ripple': {
        let g = panel.querySelector(':scope > .fp-ripple');
        if (!g) {
          g = document.createElement('span'); g.className = 'fp-ripple';
          for (let i = 0; i < 36; i++) g.appendChild(document.createElement('i'));
          panel.style.position = 'relative'; panel.appendChild(g);
        }
        Array.from(g.children).forEach((c, i) =>
          c.style.setProperty('--d', Math.abs((i % 6) - 3) + Math.abs(Math.floor(i / 6) - 2)));
        g.classList.remove('is-on'); void g.offsetWidth; g.classList.add('is-on');
        break;
      }
      case 'dialog':
        panel.classList.remove('fp-dialog'); void panel.offsetWidth;
        panel.classList.add('fp-dialog');
        setTimeout(() => panel.classList.remove('fp-dialog'), 500);
        break;
      case 'toast': {
        const t = $('#toast');
        if (t) {
          t.textContent = '这是一条演示提示 ✦';
          t.classList.remove('is-on'); void t.offsetWidth; t.classList.add('is-on');
          setTimeout(() => t.classList.remove('is-on'), 2600);
        }
        break;
      }
      case 'typing': {
        let box = $('#fpDemoType');
        if (!box) {
          box = document.createElement('div'); box.id = 'fpDemoType';
          box.className = 'zoowy-bubble'; box.style.marginTop = '10px';
          panel.appendChild(box);
        }
        delete box.dataset.fpTyped;
        box.textContent = '像素对话框正在一个字一个字地把这句话打出来。';
        applyTyping(panel);
        break;
      }
      case 'cloud':
        $$('.fp-cloud').forEach((c) => { c.style.opacity = '.3'; });
        setTimeout(() => $$('.fp-cloud').forEach((c) => { c.style.opacity = ''; }), 1600);
        break;
      case 'count': {
        const n = $('.wallet-num') || panel.querySelector('.fp-demo-grid');
        bump(n);
        break;
      }
      case 'stagger':
        $$('.wood-panel', panel).forEach((el, i) => {
          el.style.setProperty('--stagger-i', i);
          el.classList.remove('fp-stagger'); void el.offsetWidth; el.classList.add('fp-stagger');
        });
        break;
      case 'reveal':
        if (tip) tip.textContent = '滚动显现：向下滚动页面即可看到列表行逐个出现';
        window.scrollBy({ top: 260, behavior: 'smooth' });
        break;
      case 'press': {
        const b = $('[data-fp-demo-all]');
        if (b) { b.classList.remove('fp-press'); void b.offsetWidth; b.classList.add('fp-press'); }
        break;
      }
      case 'hover':
        $$('.fp-demo-btn').forEach((b, i) => setTimeout(() => {
          b.style.borderColor = 'var(--wood-deep)';
          setTimeout(() => { b.style.borderColor = ''; }, 220);
        }, i * 40));
        break;
      case 'morph': {
        const chip = $('.pending-tag') || panel;
        chip.classList.remove('fp-morph'); void chip.offsetWidth; chip.classList.add('fp-morph');
        break;
      }
    }
  }

  let demoTimers = [];
  function demoAll() {
    demoTimers.forEach(clearTimeout); demoTimers = [];
    DEMOS.forEach(([k], i) => {
      demoTimers.push(setTimeout(() => demoOne(k), i * 900));
    });
    demoTimers.push(setTimeout(() => {
      $$('.fp-demo-btn').forEach((b) => b.classList.remove('is-active'));
      const tip = $('#fpDemoTip');
      if (tip) tip.textContent = '演示完毕 ✓ 再点一次可以重播。';
    }, DEMOS.length * 900 + 300));
  }

  /* 事件委托：设置卡里的按钮 */
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-fp-toggle]')) { setEnabled(!MOTION_ON); return; }
    if (t.closest('[data-fp-demo-all]')) { demoAll(); return; }
    const d = t.closest('[data-fp-demo]');
    if (d) { demoOne(d.dataset.fpDemo); return; }
  });

  /* ── 启动 ────────────────────────────────────────────────── */
  function init() {
    motionBootAt = performance.now();
    document.body.classList.toggle('fp-motion-off', !MOTION_ON);
    buildSky();
    loadWeekStrip();
    startObservers();
    refresh();
    watchToast();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.FP_MOTION = { burst, refresh, checkNumbers, buildSky, setEnabled, demoOne, demoAll, reduced: REDUCED, get enabled() { return MOTION_ON; } };
})();
