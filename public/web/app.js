/* 脚印 · 双人桌面工作台 / oil-ui 方向 A · 打卡台
   纯前端原型：数据为模拟值，交互在本地演示，不写回服务端。
   像素图标复用项目 hzh 分支资产：_hzh-ui/public/js/icons.js（单色剪影）
   与 pixel-art.js（多色徽章），核心数据与绘制函数内联于此，保持一套画法。 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = (n) => n.toLocaleString('en-US');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── 像素图标：16×16 单色剪影 ───────────────────────── */
  const PIX = {
    home: '6-9/5-10/4-11/3-12/2-13/1-14/1-14/3-12/3-12/3-12/3-6,9-12/3-6,9-12/3-6,9-12/3-6,9-12/3-6,9-12/2-13',
    target: '5-10/4-11/3-12/2-13/2-5,10-13/2-5,10-13/2-5,10-13/2-5,10-13/2-13/3-12/4-11/5-10',
    gift: '5-10/4-6,9-11/4-7,8-11/3-12/3-12/3-12/3-6,9-12/3-6,9-12/3-6,9-12/3-12',
    us: '3-4,11-12/3-4,11-12/3-4,11-12/2-5,10-13/2-5,10-13/2-5,10-13/3-4,11-12/3-4,11-12/2-3,12-13/2-3,12-13',
    doc: '6-13/6-13/6-13/6-13/6-13/3-13/3-13/3-4,6-8/3-4,6-8/3-4,6-11/3-4,6-11/3-4,6-9/3-13',
    check: '14-15/13-14/12-13/11-12/0-1,10-11/1-2,9-10/2-3,8-9/3-4,7-8/4-7/5-6',
    plus: '7-8/7-8/2-13/2-13/7-8/7-8/7-8/7-8',
    alert: '7-8/6-9/6-9/5-10/5-6,9-10/4-6,9-11/4-6,9-11/3-6,9-12/3-6,9-12/2-6,9-13/2-6,9-13/2-13/2-13',
    close: '2-3,12-13/3-4,11-12/4-5,10-11/5-6,9-10/6-7,8-9/7-8/6-7,8-9/5-6,9-10/4-5,10-11/3-4,11-12/2-3,12-13',
    coin: '5-10/4-11/3-12/3-12/3-5,8-12/3-5,8-12/3-12/3-12/3-12/3-12/4-11/5-10',
    flame: '7-8/6-9/6-10/5-11/5-11/6-12/6-12/7-12/8-11/9-10',
    clock: '5-10/4-11/3-4,11-12/2-3,7-8,12-13/2-3,7-8,12-13/2-3,7-8,12-13/2-3,7-11,12-13/2-3,7-11,12-13/2-3,12-13/2-3,12-13/3-4,11-12/4-11/5-10',
    calendar: '3-4,11-12/3-4,11-12/3-12/3-12/2-3,12-13/2-3,12-13/2-3,12-13/2-3,5-6,9-10,12-13/2-3,12-13/2-3,12-13/2-3,5-6,9-10,12-13/2-3,12-13/2-3,12-13/2-3,12-13',
  };

  function monoIcon(name) {
    const rows = PIX[name];
    if (!rows) return '';
    const rects = [];
    rows.split('/').forEach((row, y) => {
      row.split(',').forEach((run) => {
        const [x1, x2] = run.split('-').map(Number);
        rects.push([x1, y, x2 - x1 + 1]);
      });
    });
    let minX = 16, maxX = 0, minY = 16, maxY = 0;
    for (const [x, y, w] of rects) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + w - 1);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const dx = Math.floor((16 - (maxX - minX + 1)) / 2) - minX;
    const dy = Math.floor((16 - (maxY - minY + 1)) / 2) - minY;
    const d = rects.map(([x, y, w]) => `M${x + dx} ${y + dy}h${w}v1h-${w}Z`).join('');
    return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  }

  /* ── 像素图标：12×12 多色徽章 ───────────────────────── */
  const PX_PAL = {
    o: '#4E3220', w: '#A2703F', W: '#E8C89A', y: '#F6D365', Y: '#D19A2E',
    r: '#E2605A', R: '#A83531', g: '#7CBF55', G: '#3F7A34', b: '#63A9DC',
    B: '#2F6E9E', c: '#7FD3C0', k: '#FFF6DC', K: '#E7D3A9', p: '#B98BD6', P: '#6E4491',
  };
  const PX_ART = {
    paw: [
      '............', '..oo....oo..', '.oPpo..oPpo.', '.oPpo..oPpo.', '..oo....oo..',
      '...oPPPPo...', '..oPppppPo..', '..oPppppPo..', '...oPPPPo...', '....oooo....',
      '............', '............',
    ],
    avatar: [
      '....oooo....', '..ooWWWWoo..', '.oWkkkkkkWo.', '.oWkKkkKkWo.', '.oWkKkkKkWo.',
      '.oWkkkkkkWo.', '.oWkkKKkKWo.', '..oWkkkkWo..', '...oGGGGo...', '..oGGGGGGo..',
      '.oGGGGGGGGo.', '....oooo....',
    ],
    flame: [
      '.....rr.....', '....rRRr....', '...rRyyRr...', '...rRyyRr...', '..rRRyyRRr..',
      '..rRyyyyRr..', '.rRRyyyyRRr.', '.rRyyKKyyRr.', '.rRyyKKyyRr.', '..rRyyyyRr..',
      '...rRRRRr...', '....oooo....',
    ],
    purse: [
      '....oooo....', '...oWWWWo...', '..oWwwwwWo..', '..owKKKKwo..', '.oWwwwwwwWo.',
      '.oWwYYYYwWo.', '.oWwYyyYwWo.', '.oWwYyyYwWo.', '.oWwYYYYwWo.', '.oWwwwwwwWo.',
      '..oWwwwwWo..', '...oooooo...',
    ],
    giftbox: [
      '...oooooo...', '..oRrrrrRo..', '..oRrRRrRo..', '.oooooooooo.', '.oyyyyyyyyo.',
      '.oyyYRRyyyo.', '.oyyYRRyyyo.', '.oyyyyyyyyo.', '.oyyYRRyyyo.', '.oyyYRRyyyo.',
      '.oyyyyyyyyo.', '.oooooooooo.',
    ],
    scroll: [
      '............', '.oooooooooo.', '.oWWWWWWWWo.', '.okkkkkkkko.', '.okKKKKKKko.',
      '.okkkkkkkko.', '.okKKKKKKko.', '.okkkkkkkko.', '.okKKKKKKko.', '.okkkkkkkko.',
      '.oWWWWWWWWo.', '.oooooooooo.',
    ],
    calendar: [
      '..o......o..', '.oooooooooo.', '.oWWWWWWWWo.', '.oooooooooo.', '.okkkkkkkko.',
      '.okKKkkKKko.', '.okkkkkkkko.', '.okKKkkKKko.', '.okkkkkkkko.', '.okKKkkKKko.',
      '.okkkkkkkko.', '.oooooooooo.',
    ],
    hearts: [
      '............', '..rr....rr..', '.rkRr..rRRr.', 'rRkRRrrRRRRr', 'rRRRRRRRRRRr',
      '.rRRRRRRRRr.', '..rRRRRRRr..', '...rRRRRr...', '....rRRr....', '.....rr.....',
      '............', '............',
    ],
    sun: [
      '.....YY.....', '..Y..yy..Y..', '...YyyyyY...', '..YyyyyyyY..', '.YyyyyyyyyY.',
      '.YyykRRkyyY.', '.YyykRRkyyY.', '.YyyyyyyyyY.', '..YyyyyyyY..', '...YyyyyY...',
      '..Y..yy..Y..', '.....YY.....',
    ],
    bullseye: [
      '....oooo....', '..ooKKKKoo..', '.oKkkkkkKKo.', '.oKkRRRRkKo.', '.oKkRkkRkKo.',
      '.oKkRyyRkKo.', '.oKkRyyRkKo.', '.oKkRkkRkKo.', '.oKkRRRRkKo.', '.oKkkkkkKKo.',
      '..ooKKKKoo..', '....oooo....',
    ],
    hourglass: [
      '..oooooooo..', '..oWWWWWWo..', '..oWbbbbWo..', '...oWbWbo...', '....obbo....',
      '....obbo....', '...oWbWbo...', '..oWbbbbWo..', '..oWbbbbWo..', '..oWWWWWWo..',
      '..oooooooo..', '............',
    ],
    lens: [
      '....oooo....', '..ooBBBBoo..', '.oBBbbbbBBo.', '.oBbbkkbbBo.', '.oBbbkkbbBo.',
      '.oBBbbbbBBo.', '..ooBBBBoo..', '....oWWo....', '.....oWo....', '.....oWo....',
      '.....ooo....', '............',
    ],
    score: [
      '....oooo....', '..ooYYYYoo..', '.oYYyyyyYYo.', '.oYyYkkYyYo.', '.oYyyKKyyYo.',
      '.oYyKyyKyYo.', '.oYyKKKKyYo.', '.oYyKyyKyYo.', '.oYyyKKyyYo.', '.oYYyyyyYYo.',
      '..ooYYYYoo..', '....oooo....',
    ],
    bars: [
      '............', '........gg..', '........gg..', '..rr....gg..', '..rr..bbgg..',
      '..rr..bbgg..', '..rr..bbgg..', '.oooooooooo.', '..oooooooo..', '............',
      '............', '............',
    ],
    chest: [
      '............', '..oooooooo..', '.oWWWWWWWWo.', '.oWYYYYYYWo.', '.oooooooooo.',
      '.oWwKKKKwWo.', '.oWwKYYKwWo.', '.oWwKYYKwWo.', '.oWwKKKKwWo.', '.oWwwwwwwWo.',
      '.oooooooooo.', '............',
    ],
    house: [
      '.....oo.....', '....oRRo....', '...oRRRRo...', '..oRRRRRRo..', '.oRRRRRRRRo.',
      'oooooooooooo', 'oWkkkkkkkkWo', 'oWkkKKKKkkWo', 'oWkkKkkKkkWo', 'oWkkKkkKkkWo',
      'oWkkKKKKkkWo', 'oooooooooooo',
    ],
  };

  function badgeIcon(name) {
    const rows = PX_ART[name];
    if (!rows) return monoIcon(name);
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const W = Math.max(12, w + 2), H = Math.max(12, h + 2);
    const dx = Math.floor((W - w) / 2), dy = Math.floor((H - h) / 2);
    const byColor = {};
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        if (!PX_PAL[ch]) { x += 1; continue; }
        let x2 = x;
        while (x2 + 1 < row.length && row[x2 + 1] === ch) x2 += 1;
        const color = PX_PAL[ch];
        (byColor[color] || (byColor[color] = [])).push(`M${x + dx} ${y + dy}h${x2 - x + 1}v1h-${x2 - x + 1}Z`);
        x = x2 + 1;
      }
    });
    const paths = Object.keys(byColor).map((c) => `<path fill="${c}" d="${byColor[c].join('')}"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true">${paths}</svg>`;
  }

  function paintIcons(root = document) {
    root.querySelectorAll('[data-icon]:not([data-painted])').forEach((el) => {
      el.innerHTML = el.dataset.iconKind === 'mono' ? monoIcon(el.dataset.icon) : badgeIcon(el.dataset.icon);
      el.dataset.painted = '1';
    });
  }
  /* ── 反馈 ───────────────────────────────────────────── */
  let toastTimer;
  function toast(msg, opts) {
    const o = typeof opts === 'function' ? { undo: opts } : (opts || {});
    const el = $('#toast');
    const action = o.undo ? '<button class="toast-undo" type="button">撤销</button>'
      : o.action ? `<button class="toast-undo" type="button">${esc(o.action.label)}</button>` : '';
    el.innerHTML = `${esc(msg)}${action}`;
    el.classList.add('is-on');
    const handler = o.undo || (o.action && o.action.run);
    if (handler) {
      $('.toast-undo', el).addEventListener('click', () => {
        clearTimeout(toastTimer);
        el.classList.remove('is-on');
        handler();
      });
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), handler ? 5200 : 2600);
  }
  function rollNumber(el, from, to, ms = 420) {
    const start = performance.now();
    const frame = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      el.textContent = fmt(v);
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = fmt(to);
    };
    requestAnimationFrame(frame);
  }

  /* ═══════════════════════════════════════════════════════
     底部弹层：统一抽屉，支持返回栈
     ═══════════════════════════════════════════════════════ */
  const layer = $('#sheetLayer');
  const sheetStack = [];
  let sheetSeq = 0;

  function openSheet({ title, body, actions = '', width, onMount, closeOnBackdrop = true }) {
    const id = `sheet${++sheetSeq}`;
    const el = document.createElement('div');
    el.className = 'sheet-backdrop';
    el.dataset.sheet = id;
    el.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${width ? `style="--sheet-w:${width}px"` : ''}>
        <div class="sheet-head">
          <h2>${esc(title)}</h2>
        </div>
        <div class="sheet-body">${body}</div>
        ${actions ? `<div class="sheet-actions">${actions}</div>` : ''}
      </div>`;
    layer.appendChild(el);
    paintIcons(el);
    requestAnimationFrame(() => el.classList.add('is-on'));
    const api = {
      id, el,
      close: () => closeSheet(el),
      body: () => $('.sheet-body', el),
      root: el,
    };
    sheetStack.push(api);
    el.addEventListener('click', (e) => {
      // 点遮罩空白处关闭
      if (e.target === el && closeOnBackdrop) closeSheet(el);
    });
    if (onMount) onMount(api);
    const focusable = $('.sheet input, .sheet select, .sheet textarea, .sheet button.wood-btn', el);
    if (focusable) setTimeout(() => focusable.focus(), 60);
    return api;
  }

  function closeSheet(el) {
    if (!el) { const top = sheetStack[sheetStack.length - 1]; if (top) el = top.el; else return; }
    el.classList.remove('is-on');
    const i = sheetStack.findIndex((s) => s.el === el);
    if (i >= 0) sheetStack.splice(i, 1);
    setTimeout(() => el.remove(), 220);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetStack.length) {
      e.stopPropagation();
      closeSheet(sheetStack[sheetStack.length - 1].el);
    }
  });

  function confirmSheet({ title, text, confirmText = '确定', danger = false }) {
    return new Promise((resolve) => {
      const s = openSheet({
        title,
        body: `<p class="sheet-text">${text}</p>`,
        actions: `<button class="text-btn" type="button" data-cancel>取消</button>
          <button class="wood-btn${danger ? ' wood-btn-danger' : ''}" type="button" data-ok>${esc(confirmText)}</button>`,
      });
      $('[data-cancel]', s.el).addEventListener('click', () => { s.close(); resolve(false); });
      $('[data-ok]', s.el).addEventListener('click', () => { s.close(); resolve(true); });
    });
  }

  /* ═══════════════════════════════════════════════════════
     内存 store：账号 / 目标 / 打卡 / 流水 / 验收 / 兑换
     ═══════════════════════════════════════════════════════ */
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const shiftDay = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const weekdayIdx = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  const CFG = {
    unit: 0.5, cap: 60, maxPer: 300,
    difficulty: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.2 },
    freq: { daily: 1.0, weekly34: 1.2, weekly12: 1.5, weekdays: 1.0 },
    window: { in: 1.1, none: 1.0, out: 0.8 },
    milestones: [{ n: 3, p: 10 }, { n: 7, p: 25 }, { n: 14, p: 50 }, { n: 30, p: 120 }],
  };

  /* 积分公式：与手机端 window.__calcClient 保持一致 */
  function calcPoints(goal, minutes, inWindow) {
    if (Number.isInteger(goal.customPoints) && goal.customPoints > 0) return goal.customPoints;
    const B = Math.min(minutes * CFG.unit, CFG.cap);
    const D = CFG.difficulty[goal.difficulty] || 1.5;
    const F = goal.freqMode === 'daily' ? CFG.freq.daily
      : goal.freqMode === 'weekly' ? (Number(goal.freqN) >= 3 ? CFG.freq.weekly34 : CFG.freq.weekly12)
        : CFG.freq.weekdays;
    const T = inWindow ? CFG.window.in : (goal.windowStart ? CFG.window.out : CFG.window.none);
    return Math.min(Math.round(B * D * F * T), CFG.maxPer);
  }
  const stagePoints = (goal) => (Number.isInteger(goal.customPoints) && goal.customPoints > 0
    ? goal.customPoints : Math.min(Math.round(goal.estTotalMin * 0.5 * (CFG.difficulty[goal.difficulty] || 1.5)), 1200));

  /* 性价比 = 单次积分 ÷ (时长 × 难度系数) */
  function ratioOf(goal, points) {
    const denom = goal.durationMin * (CFG.difficulty[goal.difficulty] || 1.5);
    return denom ? points / denom : 0;
  }

  const store = {
    /* ── 后端模式下的账号与状态 ── */
    me: null,          // { id, username, avatar }
    partnerUser: null, // 搭档
    pair: null,        // 配对状态
    stats: null,
    balance: 0,
    monthPoints: 0,
    currentStreak: 0,
    bestStreak: 0,
    wishBalance: 0,
    loaded: false,

    accounts: [
      { id: 'u1', name: '栗子', pwd: '123456', avatar: 'me', invite: 'FOOT-6C2A' },
      { id: 'u2', name: '阿白', pwd: '123456', avatar: 'partner', invite: 'FOOT-3B7D' },
    ],
    pairs: [{ id: 'p1', a: 'u1', b: 'u2', since: shiftDay(-127), code: 'FOOT-6C2A' }],
    pairRequests: [],   // { id, from, to, at } 待对方确认的配对申请
    status: {},   // uid -> { emoji, label, group, text, at }
    chat: [],     // { id, from, text, at } 搭子之间的短消息
    chatReadAt: 0, // 我上次看到的时间点（用于红点）
    usTab: 'more', // 「我们」页子 tab：more 待处理（默认）/ compare 数据对比
    usage: {
      // 手机端每天上报的 App 使用时长；这里给一份演示快照
      u1: {
        today: { total: 7380, apps: [{ name: '微信', sec: 2460 }, { name: '抖音', sec: 1800 }, { name: 'B 站', sec: 1260 }, { name: '小红书', sec: 960 }, { name: '其他', sec: 900 }] },
        week: [5120, 6480, 7380, 4260, 8100, 6600, 5220],
      },
      u2: {
        today: { total: 5460, apps: [{ name: '微信', sec: 1980 }, { name: 'B 站', sec: 1500 }, { name: '抖音', sec: 1080 }, { name: '其他', sec: 900 }] },
        week: [4300, 5600, 7200, 3900, 5460, 4800, 4020],
      },
    },
    hall: {
      myNote: '',        // 我的自我介绍
      invites: [],       // { id, from, to, status } 邀请
      // 大厅里其他人（演示数据，非当前两个账号）
      listings: [
        { id: 'h1', name: '小舟', avatar: '🐳', note: '早起型，想找个人一起背单词。每天 7 点起床，晚上 10 点睡。', goal: '考研英语 · 每天 60 分钟' },
        { id: 'h2', name: '阿青', avatar: '🦉', note: '夜猫子，晚上效率最高。想找人一起读完一套书。', goal: '每月读两本书' },
        { id: 'h3', name: '老周', avatar: '🐢', note: '慢但稳。跑了两年，想找个搭子一起坚持跑步。', goal: '每周跑三次 · 每次 5 公里' },
      ],
    },
    currentUser: '',          // 登录后才有值
    loggedIn: false,
    guest: true,              // 访客：能逛，不能写
    goals: [],
    checks: [],       // {id, goalId, userId, date, minutes, points, inWindow, note, evidence, status}
    ledger: [],       // {id, userId, delta, type, note, ref, at, date, balanceAfter}
    verifications: [],// {id, goalId, userId, selfStatement, evidence, submitCount, status, reason, at, decidedAt}
    wishes: [],
    redemptions: [],
    diary: [],
    dailyReports: [],   // { date, userId, text, shared, edited }
    profiles: {},       // uid -> { blocks: {basic,resume,skills,goal,important}, history: [] }
    settings: {},       // uid -> { aiReport, dailyDigest }
    backups: [],        // { at, size }
    calCursor: '',      // 当前月 YYYY-MM
    selDay: '',         // 选中日期 YYYY-MM-DD
    seq: 1000,
  };


  /* ═══════════════════════════════════════════════════════
     访客模式：先逛，写入时才提示登录
     ═══════════════════════════════════════════════════════ */
  const isGuest = () => store.guest || !store.loggedIn;

  /* 就地弹一个不打断浏览的提示：可以关掉继续看 */
  function needAccount(actionText) {
    const s = openSheet({
      title: '这个要登录才能记下来',
      width: 430,
      body: `
        <p class="sheet-text">${esc(actionText || '现在的数据只在你眼前，登录后才会真的存下来。')}</p>
        <p class="guest-tip">先随便逛逛也完全没问题，不登录也能看全部页面。</p>`,
      actions: `<button class="text-btn" type="button" data-keep>先逛逛</button>
        <button class="wood-btn" type="button" data-register>建个账号</button>`,
    });
    $('[data-keep]', s.el).addEventListener('click', () => s.close());
    $('[data-register]', s.el).addEventListener('click', () => { s.close(); openAuth('register'); });
    return s;
  }

  /* 写操作统一守卫：访客直接拦下并提示 */
  function guard(actionText) {
    if (!isGuest()) return true;
    needAccount(actionText);
    return false;
  }

  const nid = (p) => `${p}${++store.seq}`;

  /* 邀请码：每个账号固定一个，注册时生成，之后不变 */
  function makeInvite() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混的 I O 0 1
    let code = '';
    do {
      code = 'FOOT-';
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    } while (store.accounts.some((a) => a.invite === code));
    return code;
  }
  const inviteOf = (uid) => { const a = userById(uid); return a ? (a.invite || '') : ''; };

  /* 统一用户查询：后端模式读 store.me / partnerUser，演示模式读 store.accounts */
  const userById = (id) => {
    if (id === null || id === undefined || id === '') return undefined;
    // 后端模式
    if (store.backendUp) {
      if (store.me && String(store.me.id) === String(id)) {
        return { id: store.me.id, name: store.me.username || store.me.name || '我', avatar: store.me.avatar || '🐾', invite: store.me.invite || '' };
      }
      if (store.partnerUser && String(store.partnerUser.id) === String(id)) {
        return { id: store.partnerUser.id, name: store.partnerUser.username || store.partnerUser.name || '搭档', avatar: store.partnerUser.avatar || '🐾', invite: '' };
      }
      // 后端模式但没匹配上：给个占位，避免渲染崩
      return { id, name: '对方', avatar: '🐾', invite: '' };
    }
    // 演示模式
    return store.accounts.find((a) => String(a.id) === String(id));
  };
  const pairOf = (uid) => {
    if (store.backendUp) {
      if (!store.partnerUser) return null;
      // 用后端返回的配对信息拼一个和演示模式同构的对象
      const since = (store.pair && (store.pair.since || store.pair.pairedAt)) || todayKey();
      return {
        id: 'pair', a: uid, b: store.partnerUser.id,
        since: String(since).slice(0, 10),
        code: (store.pair && store.pair.code) || '',
      };
    }
    return store.pairs.find((p) => p.a === uid || p.b === uid);
  };
  const partnerId = () => {
    if (store.backendUp) {
      return store.partnerUser ? store.partnerUser.id : null;
    }
    const p = pairOf(store.currentUser);
    return p ? (p.a === store.currentUser ? p.b : p.a) : null;
  };
  const me = () => userById(store.currentUser);
  const partner = () => userById(partnerId());

  /* 余额 = 流水求和（与需求文档一致：不存余额字段） */
  function balanceOf(uid) {
    return store.ledger.filter((l) => l.userId === uid).reduce((s, l) => s + l.delta, 0);
  }
  function ledgerAdd(uid, delta, type, note, ref) {
    const row = {
      id: nid('L'), userId: uid, delta, type, note, ref,
      at: Date.now(), date: todayKey(), balanceAfter: balanceOf(uid) + delta,
    };
    store.ledger.push(row);
    return row;
  }
  const isWindowNow = (goal) => {
    if (!goal.windowStart || !goal.windowEnd) return false;
    const d = new Date(); const cur = d.getHours() * 60 + d.getMinutes();
    const [h1, m1] = goal.windowStart.split(':').map(Number);
    const [h2, m2] = goal.windowEnd.split(':').map(Number);
    return cur >= h1 * 60 + m1 && cur < h2 * 60 + m2;
  };
  /* 已入账的打卡（只有对方审核通过才算完成） */
  const checkOf = (goalId, userId, date) =>
    store.checks.find((c) => c.goalId === goalId && c.userId === userId && c.date === date && c.status === 'credited');

  /* 待审核的打卡（本人已提交，等对方处理） */
  const pendingCheckOf = (goalId, userId, date) =>
    store.checks.find((c) => c.goalId === goalId && c.userId === userId && c.date === date && c.status === 'pending');
  function dueToday(goal, date) {
    if (!goal || goal.status !== 'active') return false;
    if (goal.startDate && date < goal.startDate) return false;
    if (goal.endDate && date > goal.endDate) return false;
    if (goal.type === 'stage') return false;
    if (goal.freqMode === 'daily') return true;
    if (goal.freqMode === 'weekdays') return (goal.weekdays || []).includes(weekdayIdx(date));
    return true; // weekly：当天都可打，按周统计
  }
  function streakOf(goalId, userId) {
    let n = 0;
    for (let d = 0; d < 400; d++) {
      const key = shiftDay(-d);
      const c = checkOf(goalId, userId, key);
      if (c) n += 1;
      else if (d > 0 && dueToday(store.goals.find((g) => g.id === goalId), key)) break;
    }
    return n;
  }
  function weekProgress(goal, userId) {
    let done = 0;
    for (let d = 0; d < 7; d++) {
      const key = shiftDay(-d);
      if (weekdayIdx(key) !== 0 || d === 0) { if (checkOf(goal.id, userId, key)) done += 1; }
    }
    const need = goal.freqMode === 'weekly' ? goal.freqN : 7;
    return { done, need };
  }

  /* 首次启动的演示数据（相对今天生成，保证「今天」总有待办） */

  /* ═══════════════════════════════════════════════════════
     数据层：全部从后端 /api 拉取（替换原 seed 演示数据）
     ═══════════════════════════════════════════════════════ */
  const API = window.FP_API;
  const AD = window.FP_ADAPT;

  /* 一次性拉齐首屏需要的所有数据 */
  async function loadAll() {
    if (isGuest() || !store.loggedIn) return;
    const uid = store.currentUser;

    try {
      const [home, goalsRes, bigRes, wishRes, statusRes, pairRes, statsRes, ledgerRes] = await Promise.all([
        API.home().catch(() => null),
        API.goals().catch(() => ({ goals: [] })),
        API.bigGoals().catch(() => ({ bigGoals: [] })),
        API.wishes().catch(() => ({ items: [], redemptions: [], balance: 0 })),
        API.status().catch(() => ({ mine: null, partner: null })),
        API.pairStatus().catch(() => null),
        API.stats().catch(() => null),
        API.ledger().catch(() => ({ ledger: [] })),
      ]);

      // 账号与搭档
      if (home) {
        store.me = home.me || store.me;
        store.partnerUser = home.partner || null;
        store.balance = AD.num(home.balance, 0);
        store.monthPoints = AD.num(home.monthPoints, 0);
        store.currentStreak = AD.num(home.currentStreak, 0);
        store.bestStreak = AD.num(home.bestStreak, 0);
      }
      if (pairRes) store.pair = pairRes;

      // 目标（日常 + 小目标）
      const allGoals = (goalsRes && goalsRes.goals) || [];
      store.goals = allGoals.map(AD.adaptGoal);

      // 大目标
      const bgs = (bigRes && (bigRes.bigGoals || bigRes.goals)) || [];
      store.biggoals = bgs.map(AD.adaptBigGoal);

      // 愿望单
      if (wishRes) {
        store.wishes = (wishRes.items || []).map(AD.adaptWish);
        store.redemptions = (wishRes.redemptions || []).map(AD.adaptRedemption);
        store.wishBalance = AD.num(wishRes.balance, store.balance);
      }

      // 状态
      if (statusRes) {
        store.status = {};
        if (statusRes.mine) store.status[uid] = statusRes.mine;
        const pid = partnerId();
        if (pid && statusRes.partner) store.status[pid] = statusRes.partner;
      }

      // 打卡记录（用于今日清单的状态判断）
      const myChecks = (home && home.todos) || [];
      store.checks = [];
      myChecks.forEach((t) => {
        if (t.checked) {
          store.checks.push({
            id: t.checked.id, goalId: t.goal.id, userId: uid,
            date: home.today || todayKey(),
            minutes: AD.num(t.checked.durationMin, 0),
            points: AD.num(t.checked.points, 0),
            status: t.checked.status || 'credited',
            note: t.checked.evidenceText || '',
            at: Date.now(),
          });
        }
      });

      // 统计与流水
      if (statsRes && statsRes.stats) store.stats = statsRes.stats;
      store.ledger = ((ledgerRes && ledgerRes.ledger) || []).map((l) => ({
        id: l.id, userId: uid, delta: AD.num(l.delta, 0),
        type: l.type || 'checkin', note: l.note || '',
        date: l.created_at ? String(l.created_at).slice(0, 10) : todayKey(),
        balanceAfter: AD.num(l.balance_after, 0),
        at: l.created_at ? new Date(l.created_at).getTime() : Date.now(),
      }));

      store.loaded = true;
      renderAll();
    } catch (e) {
      console.error('loadAll failed', e);
      toast(e.message || '数据加载失败，检查后端是否运行');
    }
  }

  function seed() {
    const g = (o) => {
      const goal = {
        id: nid('G'), type: 'daily', ownerId: 'u1', emoji: '🌱', title: '',
        desc: '', freqMode: 'daily', freqN: 3, weekdays: [1, 3, 5],
        durationMin: 30, difficulty: 3, windowStart: '', windowEnd: '',
        startDate: shiftDay(-60), endDate: '', customPoints: 0,
        status: 'active', createdAt: Date.now() - 86400000 * 60, ...o,
      };
      store.goals.push(goal);
      return goal;
    };
    const spoken = g({ ownerId: 'u1', title: '背单词', emoji: '📖', durationMin: 30, difficulty: 2, windowStart: '07:00', windowEnd: '09:00', customPoints: 14, desc: '30 分钟 · 每天早读' });
    const water = g({ ownerId: 'u1', title: '喝水', emoji: '💧', durationMin: 10, difficulty: 1, customPoints: 3, desc: '每天 8 杯' });
    const read = g({ ownerId: 'u1', title: '阅读', emoji: '📚', durationMin: 45, difficulty: 3, freqMode: 'weekdays', weekdays: [1, 3, 5], customPoints: 14, desc: '读 20 页 · 周一 / 三 / 五' });
    const sleep = g({ ownerId: 'u1', title: '早睡', emoji: '🌙', durationMin: 20, difficulty: 4, windowStart: '22:30', windowEnd: '23:59', customPoints: 20, desc: '23:30 前熄灯' });
    const pSleep = g({ ownerId: 'u2', title: '早睡', emoji: '🌙', durationMin: 20, difficulty: 4, customPoints: 20, desc: '23:30 前熄灯' });
    const pWater = g({ ownerId: 'u2', title: '喝水', emoji: '💧', durationMin: 10, difficulty: 1, customPoints: 3, desc: '每天 8 杯' });
    const pRead = g({ ownerId: 'u2', title: '阅读', emoji: '📚', durationMin: 45, difficulty: 3, freqMode: 'weekdays', weekdays: [1, 3, 5], customPoints: 14, desc: '读 20 页' });

    const mk = (goal, uid, date, minutes, points, note) => {
      const c = { id: nid('C'), goalId: goal.id, userId: uid, date, minutes, points, inWindow: false, note: note || '', evidence: '', status: 'credited', at: Date.now() };
      store.checks.push(c);
      return c;
    };
    // 过去几天：制造连续与积分底数
    for (let d = 1; d <= 6; d++) {
      const key = shiftDay(-d);
      if (d <= 6) mk(spoken, 'u1', key, 30, 14, '');
      if (d <= 5) mk(water, 'u1', key, 10, 3, '');
      if ([1, 3, 5].includes(d)) mk(read, 'u1', key, 45, 14, '');
      if (d <= 4) mk(pSleep, 'u2', key, 20, 20, '');
      if (d <= 5) mk(pWater, 'u2', key, 10, 3, '');
      if ([2, 4].includes(d)) mk(pRead, 'u2', key, 45, 14, '');
    }
    // 造一天全勤：选一个阅读也要做的日子，且在那天只有初始 4 个目标
    let fullDay = shiftDay(-2);
    for (let i = 2; i <= 8; i++) {
      if ([1, 3, 5].includes(weekdayIdx(shiftDay(-i)))) { fullDay = shiftDay(-i); break; }
    }
    mk(spoken, 'u1', fullDay, 30, 14, '');
    mk(water, 'u1', fullDay, 10, 3, '');
    if ([1, 3, 5].includes(weekdayIdx(fullDay))) mk(read, 'u1', fullDay, 45, 14, '');
    mk(sleep, 'u1', fullDay, 20, 20, '');

    mk(spoken, 'u1', todayKey(), 30, 14, '');
    mk(pSleep, 'u2', todayKey(), 20, 20, '');
    mk(pWater, 'u2', todayKey(), 10, 3, '');

    // 历史流水：让余额有底数
    const base1 = 1180;
    const base2 = 480;
    store.ledger.push({ id: nid('L'), userId: 'u1', delta: base1, type: 'opening', note: '本月累计打卡所得', ref: '', at: Date.now() - 86400000 * 6, date: shiftDay(-6), balanceAfter: base1 });
    store.ledger.push({ id: nid('L'), userId: 'u2', delta: base2, type: 'opening', note: '本月累计打卡所得', ref: '', at: Date.now() - 86400000 * 6, date: shiftDay(-6), balanceAfter: base2 });
    store.checks.forEach((c) => {
      store.ledger.push({ id: nid('L'), userId: c.userId, delta: c.points, type: 'checkin', note: `打卡${c.note ? ' · ' + c.note : ''}`, ref: c.goalId, at: c.at, date: c.date, balanceAfter: 0 });
    });
    // 按时间重排并回填每条的结余快照（余额 = 流水求和）
    const running = { u1: 0, u2: 0 };
    store.ledger
      .sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)))
      .forEach((l) => { running[l.userId] = (running[l.userId] || 0) + l.delta; l.balanceAfter = running[l.userId]; });

    // 小目标 + 待审核
    const stage = g({ ownerId: 'u1', type: 'stage', title: '整理房间', emoji: '🧹', desc: '本周内把房间和衣柜整理一遍', status: 'active', estTotalMin: 120, difficulty: 2, customPoints: 120, startDate: shiftDay(-3), endDate: shiftDay(4) });
    const stage2 = g({ ownerId: 'u2', type: 'stage', title: '练会一首曲子', emoji: '🎸', desc: '月底前完整弹下来一首', status: 'active', estTotalMin: 240, difficulty: 3, customPoints: 200, startDate: shiftDay(-5), endDate: shiftDay(10) });
    store.verifications.push({
      id: nid('V'), goalId: stage.id, userId: 'u1', submitCount: 1,
      selfStatement: '房间和衣柜都整理完了，旧衣服装了两袋准备捐掉，书桌抽屉也清空重排。',
      evidence: '照片 2 张', status: 'pending', at: Date.now() - 3600_000 * 5, decidedAt: 0, reason: '',
    });
    stage.status = 'reviewing';

    // 愿望单：商品 + 事件
    store.wishes.push(
      { id: nid('W'), ownerId: 'u1', kind: 'goods', title: '周末双人温泉券', emoji: '♨️', priceCny: 320, pointsCost: 3200, cooldown: 30, status: 'active', desc: '两个人都能去的那种' },
      { id: nid('W'), ownerId: 'u1', kind: 'goods', title: '一台拍立得', emoji: '📷', priceCny: 560, pointsCost: 5600, cooldown: 60, status: 'active', desc: '拍完当场取片。' },
      { id: nid('W'), ownerId: 'u1', kind: 'event', title: '阿白陪我跑一次夜跑', emoji: '🏃', priceCny: 0, pointsCost: 300, cooldown: 7, validDays: 30, needConfirm: true, status: 'active', desc: '代劳 · 约 1 小时' },
      { id: nid('W'), ownerId: 'u1', kind: 'event', title: '一起看一部电影', emoji: '🎬', priceCny: 0, pointsCost: 400, cooldown: 7, validDays: 60, needConfirm: true, status: 'active', desc: '共同活动 · 一个晚上' },
      { id: nid('W'), ownerId: 'u1', kind: 'event', title: '豁免卡', emoji: '🛟', priceCny: 0, pointsCost: 100, cooldown: 0, validDays: 30, needConfirm: false, status: 'active', desc: '今天不算断' },
    );
    store.redemptions.push(
      { id: nid('R'), wishId: store.wishes[0].id, userId: 'u1', title: '周末电影票 ×2', points: 900, status: 'done', appliedAt: Date.now() - 86400000 * 13, note: '' },
    );
    // 大目标（共同）
    store.biggoals = [{
      id: 'B1', title: '今年一起读完 24 本书', emoji: '📚', done: 9, total: 24,
      note: '当前在读《人类简史》第 3 章',
      // 链上的小目标：planned 未启动 / released 进行中 / done 已完成
      chain: [
        { title: '读完《人类简史》', emoji: '📕', plannedDate: shiftDay(3), status: 'released' },
        { title: '读完《枪炮、病菌与钢铁》', emoji: '📗', plannedDate: shiftDay(14), status: 'planned' },
        { title: '读完《思考，快与慢》', emoji: '📘', plannedDate: shiftDay(28), status: 'planned' },
      ],
    }];
    store.diary = [
      { date: shiftDay(-1), from: 'u2', text: '今天早上 7 点就起来了，背单词没断。晚上想早点睡，你记得提醒我。' },
      { date: shiftDay(-1), from: 'u1', text: '我今天被打扰比较多，阅读只看了 10 页，明天补上。' },
    ];
    store.dailyReports = [{
      date: shiftDay(-1), userId: 'u1', shared: true, edited: '',
      text: '昨天完成了背单词、喝水、早睡三件事，阅读只看了 10 页。连续打卡 6 天，积分比上周多 32 分。今天想把阅读补回来。',
    }];
    store.profiles = {
      u1: {
        blocks: {
          basic: '栗子，26 岁，产品经理。喜欢早起和跑步。',
          resume: '做过两个 0-1 的产品，擅长需求梳理和原型设计。',
          skills: '原型设计、需求分析、数据分析；正在学英语。',
          goal: '今年读完 24 本书，把英语捡起来。',
          important: '不喜欢被催，但希望对方记得提醒我早睡。',
        },
        history: [
          { at: Date.now() - 86400000 * 3, summary: '把「目标」从「学好英语」改成「雅思 6.5」', seen: false },
          { at: Date.now() - 86400000 * 6, summary: '新增技能「数据分析」', seen: true },
        ],
      },
    };
    store.settings = { u1: { aiReport: true, dailyDigest: true }, u2: { aiReport: true, dailyDigest: false } };
    store.chat = [
      { id: 'M1', from: 'u2', text: '今天背单词了没', at: Date.now() - 3600_000 * 6 },
      { id: 'M2', from: 'u1', text: '背了，还多背了一组', at: Date.now() - 3600_000 * 5.5 },
      { id: 'M3', from: 'u2', text: '厉害，我今天还没动', at: Date.now() - 3600_000 * 5 },
      { id: 'M4', from: 'u1', text: '晚上一起补上？', at: Date.now() - 3600_000 * 4 },
    ];
    store.status = {
      u1: { emoji: '📚', label: '沉迷学习', group: 'work', text: '今晚把报告写完了', at: Date.now() - 3600_000 * 2 },
      u2: { emoji: '😮‍💨', label: '疲惫', group: 'mood', text: '加班到现在，先睡了', at: Date.now() - 3600_000 * 5 },
    };

    /* ─────────────────────────────────────────────────────
       栗子账号的「全状态」演示数据：每种情况各一条
       ───────────────────────────────────────────────────── */
    const today = todayKey();
    const now = Date.now();

    // ① 还没打卡（喝水 water：今日无记录）
    // ② 已打卡并通过（背单词 spoken：已在上面 mk 过）
    // ③ 已提交、等对方审核
    const pendingGoal = g({
      ownerId: 'u1', title: '冥想 10 分钟', emoji: '🧘', durationMin: 10, difficulty: 2,
      customPoints: 8, desc: '每天睡前静一静', createdAt: now,
    });
    store.checks.push({
      id: nid('C'), goalId: pendingGoal.id, userId: 'u1', date: today, minutes: 10, points: 8,
      inWindow: false, note: '睡前做的，感觉不错', evidence: '', status: 'pending', at: now - 3600_000 * 2,
    });

    // ④ 被对方驳回的打卡（昨天）
    const rejectedGoal = g({
      ownerId: 'u1', title: '跑步 3 公里', emoji: '🏃', durationMin: 30, difficulty: 4,
      customPoints: 25, desc: '隔天跑一次', createdAt: now,
    });
    store.checks.push({
      id: nid('C'), goalId: rejectedGoal.id, userId: 'u1', date: shiftDay(-1), minutes: 30, points: 25,
      inWindow: false, note: '', evidence: '', status: 'rejected', at: now - 86400000,
      rejectedAt: now - 86400000 + 3600000, rejectReason: '那天没看到你出门',
    });

    // ⑤ 小目标：待审核（已提交，等对方处理）
    // ⑥ 小目标：已达成（对方通过了）
    const stageDone = g({
      ownerId: 'u1', type: 'stage', title: '交完课程报告', emoji: '📄', desc: '写完整份报告并提交',
      status: 'achieved', estTotalMin: 300, difficulty: 3, customPoints: 450,
      startDate: shiftDay(-14), endDate: shiftDay(-2), achievedAt: now - 86400000 * 2,
    });
    store.verifications.push({
      id: nid('V'), goalId: stageDone.id, userId: 'u1', submitCount: 1,
      selfStatement: '报告全文 9000 字，已导出 PDF 提交，附件是截图。',
      evidence: 'PDF + 截图 3 张', status: 'approved',
      at: now - 86400000 * 3, decidedAt: now - 86400000 * 2, reason: '',
    });

    // ⑦ 小目标：被驳回（对方要求补材料）
    const stageRejected = g({
      ownerId: 'u1', type: 'stage', title: '整理相册', emoji: '🖼️', desc: '把两年的照片分类归档',
      status: 'active', estTotalMin: 180, difficulty: 2, customPoints: 180,
      startDate: shiftDay(-6), endDate: shiftDay(6),
    });
    store.verifications.push({
      id: nid('V'), goalId: stageRejected.id, userId: 'u1', submitCount: 1,
      selfStatement: '照片分好文件夹了，按年份和事件归档。',
      evidence: '截图 1 张', status: 'rejected',
      at: now - 86400000, decidedAt: now - 3600_000 * 6, reason: '截图看不清目录结构，补一张展开的',
    });

    // ⑧ 对方提交了验收，等我处理（栗子视角的「待我审核」）
    const partnerStage = g({
      ownerId: 'u2', type: 'stage', title: '练会一首曲子', emoji: '🎸', desc: '月底前完整弹下来一首',
      status: 'reviewing', estTotalMin: 240, difficulty: 3, customPoints: 200,
      startDate: shiftDay(-5), endDate: shiftDay(10),
    });
    store.verifications.push({
      id: nid('V'), goalId: partnerStage.id, userId: 'u2', submitCount: 1,
      selfStatement: '《天空之城》完整弹下来了，录了一段视频。',
      evidence: '视频 1 段', status: 'pending', at: now - 3600_000 * 8,
    });

    // ⑨ 对方提交了打卡，等我审核
    const pPending = g({
      ownerId: 'u2', title: '拉伸 15 分钟', emoji: '🤸', durationMin: 15, difficulty: 2,
      customPoints: 10, desc: '每天起床后',
    });
    store.checks.push({
      id: nid('C'), goalId: pPending.id, userId: 'u2', date: today, minutes: 15, points: 10,
      inWindow: false, note: '起床做的', evidence: '', status: 'pending', at: now - 3600_000 * 3,
    });

    // ⑩ 愿望：可兑换 / 冷却中 / 分不够，各一条
    store.wishes.push(
      { id: nid('W'), ownerId: 'u1', kind: 'goods', title: '一起喝杯奶茶', emoji: '🧋', priceCny: 30, pointsCost: 300, cooldown: 3, status: 'active', desc: '楼下的那家' },
      { id: nid('W'), ownerId: 'u1', kind: 'event', title: '阿白做一顿晚饭', emoji: '🍳', priceCny: 0, pointsCost: 500, cooldown: 7, validDays: 30, needConfirm: true, status: 'active', desc: '代劳 · 一个晚上' },
    );

    // ⑪ 兑换记录：待对方确认 / 已扣分待兑现
    store.redemptions.push(
      { id: nid('R'), wishId: store.wishes[3].id, userId: 'u1', title: '阿白陪我跑一次夜跑', points: 300, status: 'applied', appliedAt: now - 3600_000 * 4, note: '', kind: 'event' },
    );
  }

  /* 通知：由状态推导，不落库 */
  /* 提醒只放「今天要做什么」，不放展示性信息（连续天数之类） */
  function notices() {
    if (isGuest()) return [{ tone: 'ok', text: '还没有账号，先随便逛逛' }];
    const list = [];
    const uid = store.currentUser;
    const pid = partnerId();
    const today = todayKey();

    // 我自己今天还没打的
    const mine = store.goals.filter((g) => g.ownerId === uid && g.type === 'daily' && g.status === 'active' && dueToday(g, today));
    const left = mine.filter((g) => !checkOf(g.id, uid, today) && !pendingCheckOf(g.id, uid, today));
    if (left.length) list.push({ tone: 'warn', text: `还有 ${left.length} 个目标没打卡` });

    // 我提交的、等对方审核
    const myPending = mine.filter((g) => pendingCheckOf(g.id, uid, today)).length;
    if (myPending) list.push({ tone: 'warn', text: `${myPending} 条打卡等对方审核` });

    if (pid) {
      // 对方提交的、等我审核（打卡 + 小目标合成一件事）
      const toReview = store.checks.filter((c) => c.userId === pid && c.status === 'pending').length;
      const toVerify = store.verifications.filter((v) => v.userId === pid && v.status === 'pending').length;
      const total = toReview + toVerify;
      if (total) list.push({ tone: 'alert', text: `${total} 件等你审核` });

      // 我今天被驳回的打卡，需要重做
      const rej = store.checks.filter((c) => c.userId === uid && c.status === 'rejected' && c.date === today);
      if (rej.length) list.push({ tone: 'alert', text: `${rej.length} 次打卡被驳回，要重做` });
    }

    if (!list.length) list.push({ tone: 'ok', text: '今天没有要做的事' });
    return list.slice(0, 4);
  }
  /* ═══════════════════════════════════════════════════════
     渲染：今日双列清单
     ═══════════════════════════════════════════════════════ */
  const goalOf = (id) => store.goals.find((g) => String(g.id) === String(id));

  function taskRow(goal, uid, isMe) {
    const today = todayKey();
    const c = checkOf(goal.id, uid, today);
    const pend = pendingCheckOf(goal.id, uid, today);
    const due = dueToday(goal, today);
    const pts = calcPoints(goal, goal.durationMin, false);
    const streak = streakOf(goal.id, uid);
    // 最近一次被驳回（用于提示重做）
    const lastRejected = store.checks
      .filter((x) => x.goalId === goal.id && x.userId === uid && x.status === 'rejected')
      .sort((a, b) => b.at - a.at)[0];
    const rejectedRecently = lastRejected && isMe && !c && !pend && lastRejected.date >= shiftDay(-1);
    let action;
    if (c) action = '<span class="done-stamp" title="对方已通过审核">✓ 已打卡</span>';
    else if (pend) action = isMe
      ? `<span class="pending-tag" title="等对方审核；${reviewLeftText(pend)}；点一下可以撤回">等审核</span>`
      : `<button class="chip-btn review-btn" type="button" data-review="${pend.id}">去审核</button>`;
    else if (!isMe) action = '<span class="wait-tag" title="由对方自己打卡">等对方</span>';
    else if (!due) action = '<span class="wait-tag" title="今天不需要打卡">今天不用</span>';
    else action = `<button class="check-btn" type="button" data-check="${goal.id}"><span data-icon="check" data-icon-kind="mono"></span>打卡</button>`;

    const win = goal.windowStart ? `${goal.windowStart}–${goal.windowEnd}` : '';
    const freq = goal.freqMode === 'daily' ? '每日' : goal.freqMode === 'weekly' ? `每周 ${goal.freqN} 次`
      : (goal.weekdays || []).map((d) => '周' + WEEK[d]).join(' / ');
    const sub = [goal.durationMin + ' 分钟', freq, win].filter(Boolean).join(' · ');

    return `<li class="task-row${c ? ' is-done' : ''}${pend && !c ? ' is-pending' : ''}${rejectedRecently ? ' is-rejected' : ''}" data-goal="${goal.id}">
      <span class="tick-box" aria-hidden="true"><span data-icon="check" data-icon-kind="mono"></span></span>
      <span class="task-main"><b>${esc(goal.title)}</b><small>${esc(sub)}</small>${
        rejectedRecently ? `<small class="reject-hint">上次被驳回：${esc(lastRejected.rejectReason || '没写理由')}</small>` : ''
      }</span>
      <span class="task-streak" title="连续打卡"><span data-icon="flame" aria-hidden="true"></span>${streak}</span>
      <span class="task-points">+${pts}</span>
      <span class="task-act">${action}</span>
    </li>`;
  }

  function tasksFor(uid) {
    if (isGuest()) return [];   // 访客看到的是干净的空壳，不是演示数据
    const today = todayKey();
    const list = store.goals.filter((g) => g.ownerId === uid && g.type === 'daily' && g.status === 'active' && dueToday(g, today));
    // 已完成的排后面，保持原有顺序
    return list.sort((a, b) => {
      const ca = checkOf(a.id, uid, today) ? 1 : 0;
      const cb = checkOf(b.id, uid, today) ? 1 : 0;
      return ca - cb;
    });
  }

  function completionRate(uid) {
    const today = todayKey();
    const due = store.goals.filter((g) => g.ownerId === uid && g.type === 'daily' && g.status === 'active' && dueToday(g, today));
    if (!due.length) return 0;
    const done = due.filter((g) => checkOf(g.id, uid, today)).length;
    return Math.round((done / due.length) * 100);
  }

  function renderToday() {
    if (isGuest()) return renderGuestToday();

    // 已登录：隐藏访客引导卡
    const guide = $('#guestGuide');
    if (guide) guide.hidden = true;

    const uid = store.currentUser;
    const pid = partnerId();
    const today = todayKey();
    const mineList = tasksFor(uid);
    const theirList = pid ? tasksFor(pid) : [];

    const myUl = $('#myTasks'), theirUl = $('#partnerTasks');
    myUl.innerHTML = mineList.length ? mineList.map((g) => taskRow(g, uid, true)).join('')
      : '<li class="task-empty">今天还没有目标，点右上角「新目标」加一个。</li>';
    theirUl.innerHTML = pid
      ? (theirList.length ? theirList.map((g) => taskRow(g, pid, false)).join('') : '<li class="task-empty">对方今天没有目标。</li>')
      : '<li class="task-empty">还没有搭档，去「我的」里配对。</li>';
    paintIcons(myUl); paintIcons(theirUl);

    const myDone = mineList.filter((g) => checkOf(g.id, uid, today)).length;
    const theirDone = theirList.filter((g) => checkOf(g.id, pid, today)).length;
    // 三者互斥：还没打 / 打了等审核 / 已通过
    const myPending = mineList.filter((g) => !checkOf(g.id, uid, today) && pendingCheckOf(g.id, uid, today)).length;
    const theirPending = pid ? theirList.filter((g) => !checkOf(g.id, pid, today) && pendingCheckOf(g.id, pid, today)).length : 0;
    const todo = mineList.length - myDone - myPending;   // 真正还没打的
    const theirTodo = theirList.length - theirDone - theirPending;

    $('#doneCount').textContent = myDone;
    $('#totalCount').textContent = mineList.length;
    const footEl = document.querySelector('.foot-count');
    if (footEl) {
      footEl.innerHTML = myPending > 0
        ? `已通过 <b id="doneCount">${myDone}</b> / <span id="totalCount">${mineList.length}</span> 件 · 待审核 ${myPending} 条`
        : `我今天已完成 <b id="doneCount">${myDone}</b> / <span id="totalCount">${mineList.length}</span> 件`;
    }
    $('#doneBar').style.width = `${mineList.length ? Math.round((myDone / mineList.length) * 100) : 0}%`;
    const badge = $('#navBadge');
    badge.textContent = todo;
    badge.style.display = todo === 0 ? 'none' : '';

    const myRate = completionRate(uid);
    const theirRate = pid ? completionRate(pid) : 0;
    $('#meRate').textContent = myRate;
    $('#meBar').style.width = `${myRate}%`;
    $('#partnerRate').textContent = theirRate;
    $('#partnerBar').style.width = `${theirRate}%`;

    const meU = userById(uid), pU = pid ? userById(pid) : null;
    $('#meName').textContent = meU.name;
    $('#partnerName').textContent = pU ? pU.name : '—';
    const monthChecks = (id) => store.checks.filter((c) => c.userId === id && c.status === 'credited' && c.date.slice(0, 7) === today.slice(0, 7)).length;
    const bestStreak = (id) => Math.max(0, ...store.goals.filter((g) => g.ownerId === id).map((g) => streakOf(g.id, id)));
    $('#meDetail').textContent = `${monthChecks(uid)} 次 · 连续 ${bestStreak(uid)} 天`;
    $('#partnerDetail').textContent = pid ? `${monthChecks(pid)} 次 · 连续 ${bestStreak(pid)} 天` : '未配对';

    // 区分三种情况：还没建目标 / 还有事没做 / 全做完了
    const hintEl = $('#partnerHint');
    if (hintEl) {
      hintEl.textContent = !pid
        ? '还没有搭档，去「我的」里配对。'
        : (theirTodo === 0 ? `${pU ? pU.name : '对方'}今天的事全划掉了。` : `${pU ? pU.name : '对方'}今天还差 ${theirTodo} 件事。`);
    }

    const noGoals = mineList.length === 0;
    // 页头只保留一句引导，不再重复统计（统计已在提醒列表与底部进度里）
    $('#todoLine').textContent = noGoals ? '还没有目标。先去「目标」加一个每天想坚持的事。' : '';
    $('#goalsHint').textContent = noGoals
      ? '从一件小事开始，比如「背 20 个单词」。'
      : (todo > 0 ? '' : (theirTodo > 0 ? '去看看对方还差哪件。' : ''));


    $('#duoSummary').innerHTML = `<b>${meU.name}</b> ${todo} 件 · <b>${pU ? pU.name : '—'}</b> ${theirTodo} 件`;

    const days = pairOf(uid) ? Math.max(1, Math.round((Date.now() - new Date(pairOf(uid).since.replace(/-/g, '/')).getTime()) / 86400000) + 1) : 0;
    $('#duoTitle').textContent = pU ? `${meU.name} & ${pU.name}` : '还没有搭档';
    $('#duoSub').textContent = pU ? `一起坚持的第 ${days} 天` : '配对后才能互相看见';

    const hour = new Date().getHours();
    const greet = hour < 6 ? '凌晨好' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    $('#greeting').textContent = `${greet}，${meU.name}`;
  }

  /* 右栏：积分 + 待审核 + 提醒 */

  /* 访客版今日页：干净空壳 + 一张说明下一步的引导卡 */
  function renderGuestToday() {
    const myUl = $('#myTasks'), theirUl = $('#partnerTasks');
    myUl.innerHTML = '<li class="task-empty guest-empty">登录后这里会出现你今天要做的事。</li>';
    theirUl.innerHTML = '<li class="task-empty guest-empty">搭档的待办也会出现在这里。</li>';

    $('#doneCount').textContent = '0';
    $('#totalCount').textContent = '0';
    $('#doneBar').style.width = '0%';
    $('#navBadge').style.display = 'none';
    $('#meRate').textContent = '0';
    $('#meBar').style.width = '0%';
    $('#partnerRate').textContent = '0';
    $('#partnerBar').style.width = '0%';
    $('#meName').textContent = '你';
    $('#partnerName').textContent = '搭档';
    $('#meDetail').textContent = '还没登录';
    $('#partnerDetail').textContent = '还没配对';

    const hour = new Date().getHours();
    const greet = hour < 6 ? '凌晨好' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    $('#greeting').textContent = `${greet}，先随便看看`;
    $('#todoLine').innerHTML = '登录后这里会出现今天要做的事。去「我的」可以建账号或配对。';
    $('#duoSummary').textContent = '';
    $('#goalsHint').textContent = '';
    $('#duoTitle').textContent = '还没有搭档';
    $('#duoSub').textContent = '注册后互相配对就能一起用';


    // 引导入口统一放在「我的」页
  }

  function renderRail() {
    if (isGuest()) return renderGuestRail();

    const uid = store.currentUser;
    const pid = partnerId();
    const bal = balanceOf(uid);
    const firstWish = store.wishes.find((w) => w.ownerId === uid && w.kind === 'goods' && w.status === 'active');
    const cost = firstWish ? firstWish.pointsCost : 3200;
    const gap = Math.max(0, cost - bal);
    const pct = Math.min(100, Math.round((bal / cost) * 100));

    const numEl = $('#walletNum');
    if (numEl) {
      const prev = Number(numEl.textContent.replace(/,/g, '')) || 0;
      if (prev !== bal) rollNumber(numEl, prev, bal);
      else numEl.textContent = fmt(bal);
    }
    const subEl = $('#walletSub');
    if (subEl) subEl.textContent = `≈ ¥${(bal / 10).toFixed(1)}`;

    const pend = pid ? store.verifications.filter((v) => v.userId === pid && v.status === 'pending') : [];
    const card = $('#verifyCard');
    if (card) {
      card.hidden = !pend.length;
      if (pend.length) {
        const cnt = $('#verifyCount');
        if (cnt) cnt.textContent = pend.length;
        const v = pend[0];
        const g = goalOf(v.goalId);
        const line = $('#verifyLine');
        if (line) line.textContent = g ? `${userById(v.userId).name}提交了「${g.title}」验收` : '';
      }
    }

    const list = $('#noticeList');
    if (list) {
      list.innerHTML = notices().map((n) =>
        `<li class="notice-${n.tone}"><i></i>${esc(n.text)}</li>`).join('');
    }
  }


  /* 访客右栏：不显示任何演示数据 */
  function renderGuestRail() {
    const set = (sel, fn) => { const el = $(sel); if (el) fn(el); };
    set('#walletNum', (el) => { el.textContent = '0'; });
    set('#walletSub', (el) => { el.textContent = '≈ ¥0.0'; });
    set('#verifyCard', (el) => { el.hidden = true; });
    set('#noticeList', (el) => {
      el.innerHTML =
        '<li class="notice-ok"><i></i>还没有账号，先随便逛逛</li>' +
        '<li><i></i>注册后这里会提醒你今天还差几件事</li>';
    });
  }

  function renderAll() {
    renderToday();
    renderRail();
    if (document.body.dataset.view !== 'today') renderView(document.body.dataset.view);
  }
  /* ═══════════════════════════════════════════════════════
     打卡弹层
     ═══════════════════════════════════════════════════════ */
  const DURATIONS = [15, 30, 45, 60];

  function openCheckin(goalId, instant) {
    if (!guard('打卡需要先登录，记下来才会真的存住。')) return;
    const uid = store.currentUser;
    const goal = goalOf(goalId);
    if (!goal) return;
    const inWin = isWindowNow(goal);
    let minutes = goal.durationMin;
    let note = '';

    const body = `
      <div class="ck-goal">
        <span class="ck-emoji">${goal.emoji || '🌱'}</span>
        <div><b>${esc(goal.title)}</b><small>${esc(goal.desc || '')}</small></div>
      </div>
      <p class="ck-label">这次花了多久</p>
      <div class="ck-chips">
        ${DURATIONS.map((d) => `<button class="chip-btn${d === minutes ? ' is-on' : ''}" type="button" data-min="${d}">${d} 分钟</button>`).join('')}
        <span class="ck-stepper">
          <button type="button" data-step="-5" aria-label="减 5 分钟">−</button>
          <b id="ckMin">${minutes}</b>
          <button type="button" data-step="5" aria-label="加 5 分钟">+</button>
        </span>
      </div>
      <p class="ck-warn" id="ckWarn" hidden></p>
      <label class="ck-field">一句备注（可选）
        <input id="ckNote" type="text" maxlength="80" placeholder="比如：比平时多背了一组"/>
      </label>
      <div class="ck-evidence">
        <span class="ck-label" style="margin:0">附个证据（可选）</span>
        <div class="ev-row">
          <button class="chip-btn ev-btn" type="button" data-ev="photo">📷 拍张照</button>
          <button class="chip-btn ev-btn" type="button" data-ev="file">📄 传个文件</button>
          <span class="ev-picked" id="evPicked"></span>
        </div>
        <p class="fg-note">证据只是给对方的参考，不影响积分。</p>
      </div>
      <div class="ck-preview">
        <span>这次可得</span>
        <b id="ckPts">+${calcPoints(goal, minutes, inWin)}</b>
        <small id="ckHint">${inWin ? '在打卡窗口内，+10%' : (goal.windowStart ? `窗口 ${goal.windowStart}–${goal.windowEnd}，现在不在窗口内` : '')}</small>
      </div>`;

    const s = openSheet({
      title: '打卡',
      body,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok><span class="btn-ico" data-icon="check" data-icon-kind="mono"></span>提交打卡</button>`,
    });

    const refresh = () => {
      $('#ckMin', s.el).textContent = minutes;
      $('#ckPts', s.el).textContent = `+${calcPoints(goal, minutes, inWin)}`;
      const dev = minutes / goal.durationMin;
      const warn = $('#ckWarn', s.el);
      if (dev > 1.5) { warn.hidden = false; warn.textContent = `比平时多了一倍多，对方可能会问一句。`; }
      else if (dev < 0.5) { warn.hidden = false; warn.textContent = '比设定时长少了一半，积分会按实际时长算。'; }
      else warn.hidden = true;
      $$('.chip-btn', s.el).forEach((b) => b.classList.toggle('is-on', Number(b.dataset.min) === minutes));
    };

    let evidence = '';
    s.el.addEventListener('click', (e) => {
      const ev = e.target.closest('[data-ev]');
      if (ev) {
        evidence = ev.dataset.ev === 'photo' ? '照片 1 张' : '文件 1 个';
        $$('.ev-btn', s.el).forEach((b) => b.classList.toggle('is-on', b === ev));
        const picked = $('#evPicked', s.el);
        if (picked) picked.textContent = `已附：${evidence}`;
        return;
      }
      const chip = e.target.closest('.chip-btn');
      if (chip) { minutes = Number(chip.dataset.min); refresh(); return; }
      const step = e.target.closest('[data-step]');
      if (step) { minutes = Math.max(1, Math.min(1440, minutes + Number(step.dataset.step))); refresh(); }
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      note = $('#ckNote', s.el).value.trim();
      const res = doCheckin(goal, minutes, note, inWin, evidence);
      if (!res.ok) { toast(res.msg); return; }
      s.close();
      toast(`「${goal.title}」已提交，等对方审核后 +${res.points} 分`, res.undo);
    });

    if (instant) {
      // 长按秒打卡：用预填时长直接提交
      const res = doCheckin(goal, goal.durationMin, '', inWin);
      s.close();
      if (res.ok) toast(`「${goal.title}」已提交，等对方审核后 +${res.points} 分`, res.undo);
    }
  }

  /* 打卡：进入待审核，积分不入账，等对方通过 */
  /* 打卡：调接口提交，成功后重新拉取数据 */
  async function doCheckin(goal, minutes, note, inWin, evidence) {
    const uid = store.currentUser;
    const today = todayKey();
    if (!dueToday(goal, today)) return { ok: false, msg: '今天不需要打卡' };
    if (checkOf(goal.id, uid, today)) return { ok: false, msg: '今天已经通过审核了' };
    if (pendingCheckOf(goal.id, uid, today)) return { ok: false, msg: '今天已经提交过，等对方审核' };

    const points = calcPoints(goal, minutes, inWin);
    try {
      await API.checkin(goal.id, {
        duration_min: minutes,
        evidence_text: note || '',
      });
      await loadAll();
      return { ok: true, points, pending: true };
    } catch (e) {
      return { ok: false, msg: e.message || '打卡失败' };
    }
  }

  /* 对方审核：通过才入账 */
  /* 审核时限：超过这个时间未处理，自动通过 */
  const REVIEW_WINDOW_MS = 24 * 3600 * 1000;

  /* 真正入账（手动通过 / 自动通过共用） */
  function creditCheck(c, auto) {
    if (!c || c.status !== 'pending') return false;
    c.status = 'credited';
    c.approvedAt = Date.now();
    c.autoApproved = !!auto;
    ledgerAdd(c.userId, c.points, 'checkin', `打卡${c.note ? ' · ' + c.note : ''}`, c.goalId);

    // 入账后结算连续里程碑
    const streak = streakOf(c.goalId, c.userId);
    const bonus = CFG.milestones.find((m) => m.n === streak);
    if (bonus) ledgerAdd(c.userId, bonus.p, 'streak_bonus', `连续 ${bonus.n} 天奖励`, c.goalId);
    return true;
  }

  async function approveCheck(checkId) {
    const c = store.checks.find((x) => x.id === checkId);
    if (!c || c.status !== 'pending') return;
    // 后端通过打卡审核走 reject 的反向接口；当前用本地入账 + 刷新
    if (!creditCheck(c, false)) return;
    renderAll();
    toast('已通过');
  }

  /* 扫描所有待审核打卡，超时的自动通过；返回自动通过的条数 */
  function sweepAutoApprove(quiet) {
    const now = Date.now();
    const expired = store.checks.filter(
      (c) => c.status === 'pending' && now - c.at >= REVIEW_WINDOW_MS
    );
    if (!expired.length) return 0;
    expired.forEach((c) => creditCheck(c, true));
    renderAll();
    if (!quiet) {
      const names = [...new Set(expired.map((c) => userById(c.userId).name))].join('、');
      toast(`${expired.length} 条打卡超过 24 小时未审核，已自动通过（${names}）`);
    }
    return expired.length;
  }

  /* 剩余审核时间，用于界面提示 */
  function reviewLeftMs(c) {
    return Math.max(0, REVIEW_WINDOW_MS - (Date.now() - c.at));
  }
  function reviewLeftText(c) {
    const ms = reviewLeftMs(c);
    if (ms <= 0) return '即将自动通过';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h >= 1 ? `${h} 小时后自动通过` : `${m} 分钟后自动通过`;
  }

  /* 对方驳回：不入账，记录理由 */
  async function rejectCheck(checkId, reason) {
    try {
      await API.rejectCheckin(checkId, reason);
      await loadAll();
      toast('已驳回，这次不计分');
    } catch (e) {
      toast(e.message || '驳回失败');
    }
  }

  async function revokeCheck(checkId, silent) {
    try {
      await API.revokeCheckin(checkId);
      await loadAll();
      if (!silent) toast('已撤回');
    } catch (e) {
      toast(e.message || '撤回失败');
    }
  }


  /* ═══════════════════════════════════════════════════════
     打卡审核（对方视角）
     ═══════════════════════════════════════════════════════ */
  function openCheckReview(checkId) {
    const c = store.checks.find((x) => x.id === checkId);
    if (!c || c.status !== 'pending') return;
    const g = goalOf(c.goalId);
    const who = userById(c.userId);
    const s = openSheet({
      title: '审核这次打卡',
      width: 460,
      body: `
        <div class="ck-goal">
          <span class="ck-emoji">${g ? (g.emoji || '🌱') : '🌱'}</span>
          <div><b>${esc(g ? g.title : '打卡')}</b>
            <small>${esc(who.name)} · ${c.date.slice(5)} · ${c.minutes} 分钟 · 通过后 +${c.points} 分</small></div>
        </div>
        ${c.note ? `<div class="vf-block"><p class="fg-label">备注</p><p class="vf-text">${esc(c.note)}</p></div>` : ''}
        ${c.evidence ? `<div class="vf-block"><p class="fg-label">证据</p><p class="vf-text">${esc(c.evidence)}</p></div>` : ''}
        <p class="guest-tip">${reviewLeftText(c)}。不处理的话会自动通过，不会卡住对方的连续记录。</p>
        <label class="fg-field">驳回理由（只在驳回时填）
          <input id="ckReason" type="text" maxlength="80" placeholder="比如：今天没看到你打卡"/>
        </label>`,
      actions: `<button class="text-btn" type="button" data-cancel>稍后</button>
        <button class="text-btn" type="button" data-reject>驳回</button>
        <button class="wood-btn" type="button" data-approve>通过，入账</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-approve]', s.el).addEventListener('click', () => {
      s.close();
      approveCheck(checkId);
    });
    $('[data-reject]', s.el).addEventListener('click', () => {
      const reason = ($('#ckReason', s.el).value || '').trim();
      if (!reason) { toast('驳回要写一句理由'); return; }
      s.close();
      rejectCheck(checkId, reason);
    });
  }

  /* ═══════════════════════════════════════════════════════
     目标表单
     ═══════════════════════════════════════════════════════ */
  const EMOJIS = ['🌱', '📖', '💧', '🏃', '🌙', '🎸', '🧘', '🥗', '✍️', '🎨', '🧹', '💊', '📷', '🎧', '🪴', '☀️'];

  function openGoalForm(goalId, type) {
    if (!guard('建目标要先登录，建好后两个人都能看见。')) return;
    const editing = goalId ? goalOf(goalId) : null;
    const g = editing || {
      type: type || 'daily', ownerId: store.currentUser, emoji: '🌱', title: '', desc: '',
      freqMode: 'daily', freqN: 3, weekdays: [1, 3, 5], durationMin: 30, difficulty: 3,
      windowStart: '', windowEnd: '', startDate: todayKey(), endDate: '',
      customPoints: 0, estTotalMin: 120, status: 'draft',
    };

    const freqLabel = { daily: '每日', weekly: '每周 N 次', weekdays: '指定星期' };
    const body = `
      <div class="fg-tabs">
        <button class="fg-tab${g.type === 'daily' ? ' is-on' : ''}" type="button" data-type="daily">日常习惯</button>
        <button class="fg-tab${g.type === 'stage' ? ' is-on' : ''}" type="button" data-type="stage">小目标</button>
      </div>
      <label class="fg-field">名字
        <input id="fgTitle" type="text" maxlength="30" placeholder="比如：每天散步 20 分钟" value="${esc(g.title)}"/>
      </label>
      <div class="fg-emojis">
        ${EMOJIS.map((e) => `<button class="fg-emoji${e === g.emoji ? ' is-on' : ''}" type="button" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <label class="fg-field">做到什么算数
        <input id="fgDesc" type="text" maxlength="120" placeholder="写清楚一点，对方才好验收" value="${esc(g.desc || '')}"/>
      </label>

      <div id="fgDaily" ${g.type === 'stage' ? 'hidden' : ''}>
        <p class="fg-label">频率</p>
        <div class="fg-chips">
          ${Object.keys(freqLabel).map((k) => `<button class="chip-btn${g.freqMode === k ? ' is-on' : ''}" type="button" data-freq="${k}">${freqLabel[k]}</button>`).join('')}
        </div>
        <div class="fg-weekly" id="fgWeekly" ${g.freqMode !== 'weekly' ? 'hidden' : ''}>
          每周 <span class="ck-stepper"><button type="button" data-fn="-1">−</button><b id="fgN">${g.freqN}</b><button type="button" data-fn="1">+</button></span> 次
        </div>
        <div class="fg-weekdays" id="fgWeekdays" ${g.freqMode !== 'weekdays' ? 'hidden' : ''}>
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="wd-btn${(g.weekdays || []).includes(d) ? ' is-on' : ''}" type="button" data-wd="${d}">${WEEK[d]}</button>`).join('')}
        </div>
        <p class="fg-label">每次时长</p>
        <div class="fg-chips">
          ${DURATIONS.map((d) => `<button class="chip-btn" type="button" data-dur="${d}">${d} 分钟</button>`).join('')}
          <span class="ck-stepper"><button type="button" data-dur-step="-5">−</button><b id="fgDur">${g.durationMin}</b><button type="button" data-dur-step="5">+</button></span>
        </div>
        <p class="fg-label">难度</p>
        <div class="fg-diff">
          <input id="fgDiff" type="range" min="1" max="5" step="1" value="${g.difficulty}"/>
          <b id="fgDiffText">${['', '很简单', '有点难度', '要专门腾时间', '比较硬', '长期专业投入'][g.difficulty]}</b>
        </div>
        <div class="fg-row2">
          <label class="fg-field">打卡窗口（可选）
            <span class="fg-time"><input id="fgWinS" type="time" value="${g.windowStart || ''}"/><input id="fgWinE" type="time" value="${g.windowEnd || ''}"/></span>
          </label>
        </div>
      </div>

      <div id="fgStage" ${g.type !== 'stage' ? 'hidden' : ''}>
        <p class="fg-label">完成标准（要能答「是 / 否」）</p>
        <input id="fgCriteria" class="fg-input" type="text" maxlength="100" placeholder="比如：初稿全文 ≥ 8000 字，导出 PDF" value=""/>
        <p class="fg-label">预估总时长（分钟）</p>
        <div class="fg-chips">
          ${[60, 120, 240, 600, 1200].map((m) => `<button class="chip-btn" type="button" data-est="${m}">${m < 60 ? m + ' 分' : (m / 60) + ' 小时'}</button>`).join('')}
          <span class="ck-stepper"><button type="button" data-est-step="-30">−</button><b id="fgEst">${g.estTotalMin}</b><button type="button" data-est-step="30">+</button></span>
        </div>
        <p class="fg-label">难度</p>
        <div class="fg-diff">
          <input id="fgDiff2" type="range" min="1" max="5" step="1" value="${g.difficulty}"/>
          <b id="fgDiffText2">${['', '很简单', '有点难度', '要专门腾时间', '比较硬', '长期专业投入'][g.difficulty]}</b>
        </div>
      </div>

      <div class="fg-row2">
        <label class="fg-field">开始
          <input id="fgStart" type="date" value="${g.startDate || todayKey()}"/>
        </label>
        <label class="fg-field"><span id="fgEndLabel">${g.type === 'stage' ? '截止' : '结束（可留空）'}</span>
          <input id="fgEnd" type="date" value="${g.endDate || ''}"/>
        </label>
      </div>

      <div class="fg-preview" id="fgPreview"></div>`;

    const s = openSheet({
      title: editing ? '编辑目标' : '新建目标',
      body,
      width: 560,
      actions: `${editing ? '<button class="text-btn" type="button" data-abandon>放弃这个目标</button>' : ''}
        <button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>${editing ? '保存' : '建目标'}</button>`,
    });

    const st = {
      type: g.type, freqMode: g.freqMode, freqN: g.freqN, weekdays: [...(g.weekdays || [])],
      durationMin: g.durationMin, difficulty: g.difficulty, estTotalMin: g.estTotalMin,
    };

    const preview = () => {
      const box = $('#fgPreview', s.el);
      if (st.type === 'stage') {
        const pts = Math.min(Math.round(st.estTotalMin * 0.5 * CFG.difficulty[st.difficulty]), 1200);
        box.innerHTML = `<span>完成后可得</span><b>+${pts}</b><small>小目标由对方验收后才入账</small>`;
        return;
      }
      const draft = { ...g, ...st };
      const pts = calcPoints(draft, st.durationMin, !!draft.windowStart);
      const r = ratioOf(draft, pts);
      let warn = '';
      if (r > 0.85) warn = '<em class="is-high">性价比偏高，对方可能会问一句</em>';
      else if (r < 0.35) warn = '<em class="is-low">累活给低价，要不要核一下时长或难度</em>';
      box.innerHTML = `<span>每次可得</span><b>+${pts}</b><small>${warn || '按当前配置计算，可在「我的」里调系数'}</small>`;
    };

    const sync = () => {
      $('#fgDaily', s.el).hidden = st.type !== 'daily';
      $('#fgStage', s.el).hidden = st.type !== 'stage';
      $$('.fg-tab', s.el).forEach((b) => b.classList.toggle('is-on', b.dataset.type === st.type));
      $('#fgEndLabel', s.el).textContent = st.type === 'stage' ? '截止' : '结束（可留空）';
      $('#fgWeekly', s.el).hidden = st.freqMode !== 'weekly';
      $('#fgWeekdays', s.el).hidden = st.freqMode !== 'weekdays';
      $('#fgN', s.el).textContent = st.freqN;
      $('#fgDur', s.el).textContent = st.durationMin;
      $('#fgEst', s.el).textContent = st.estTotalMin;
      $$('.chip-btn', s.el).forEach((b) => {
        if (b.dataset.freq) b.classList.toggle('is-on', b.dataset.freq === st.freqMode);
        if (b.dataset.dur) b.classList.toggle('is-on', Number(b.dataset.dur) === st.durationMin);
        if (b.dataset.est) b.classList.toggle('is-on', Number(b.dataset.est) === st.estTotalMin);
      });
      $$('.wd-btn', s.el).forEach((b) => b.classList.toggle('is-on', st.weekdays.includes(Number(b.dataset.wd))));
      $('#fgDiff', s.el).value = st.difficulty;
      $('#fgDiff2', s.el).value = st.difficulty;
      const txt = ['', '很简单', '有点难度', '要专门腾时间', '比较硬', '长期专业投入'][st.difficulty];
      $('#fgDiffText', s.el).textContent = txt;
      $('#fgDiffText2', s.el).textContent = txt;
      preview();
    };

    s.el.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-type]')) { st.type = t.closest('[data-type]').dataset.type; sync(); return; }
      if (t.closest('[data-freq]')) { st.freqMode = t.closest('[data-freq]').dataset.freq; sync(); return; }
      if (t.closest('[data-wd]')) {
        const d = Number(t.closest('[data-wd]').dataset.wd);
        st.weekdays = st.weekdays.includes(d) ? st.weekdays.filter((x) => x !== d) : [...st.weekdays, d].sort();
        sync(); return;
      }
      if (t.closest('[data-dur]')) { st.durationMin = Number(t.closest('[data-dur]').dataset.dur); sync(); return; }
      if (t.closest('[data-est]')) { st.estTotalMin = Number(t.closest('[data-est]').dataset.est); sync(); return; }
      const fn = t.closest('[data-fn]'); if (fn) { st.freqN = Math.max(1, Math.min(7, st.freqN + Number(fn.dataset.fn))); sync(); return; }
      const durStepBtn = t.closest('[data-dur-step]');
      if (durStepBtn) {
        st.durationMin = Math.max(5, Math.min(240, st.durationMin + Number(durStepBtn.dataset.durStep)));
        sync(); return;
      }
      const es = t.closest('[data-est-step]'); if (es) { st.estTotalMin = Math.max(30, Math.min(6000, st.estTotalMin + Number(es.dataset.estStep))); sync(); return; }
      const em = t.closest('[data-emoji]');
      if (em) { $$('.fg-emoji', s.el).forEach((b) => b.classList.toggle('is-on', b === em)); return; }
    });
    $('#fgDiff', s.el).addEventListener('input', (e) => { st.difficulty = Number(e.target.value); sync(); });
    $('#fgDiff2', s.el).addEventListener('input', (e) => { st.difficulty = Number(e.target.value); sync(); });
    $('#fgWinS', s.el).addEventListener('input', preview);
    $('#fgWinE', s.el).addEventListener('input', preview);

    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    const ab = $('[data-abandon]', s.el);
    if (ab) ab.addEventListener('click', async () => {
      const yes = await confirmSheet({
        title: '放弃这个目标', danger: true, confirmText: '放弃',
        text: '已得的积分会保留，但连续记录会断，之后不再出现在今日待办里。',
      });
      if (!yes) return;
      goalOf(goalId).status = 'abandoned';
      s.close(); renderAll(); toast('目标已放弃，记录保留');
    });

    $('[data-ok]', s.el).addEventListener('click', () => {
      const title = $('#fgTitle', s.el).value.trim();
      if (!title) { $('#fgTitle', s.el).focus(); toast('先给目标起个名字'); return; }
      if (st.type === 'weekdays' && !st.weekdays.length) { toast('至少选一天'); return; }
      const emojiEl = $('.fg-emoji.is-on', s.el);
      const payload = {
        type: st.type, title, emoji: emojiEl ? emojiEl.dataset.emoji : '🌱',
        desc: $('#fgDesc', s.el).value.trim(),
        freqMode: st.freqMode, freqN: st.freqN, weekdays: st.weekdays,
        durationMin: st.durationMin, difficulty: st.difficulty,
        windowStart: $('#fgWinS', s.el).value, windowEnd: $('#fgWinE', s.el).value,
        startDate: $('#fgStart', s.el).value || todayKey(),
        endDate: $('#fgEnd', s.el).value,
        estTotalMin: st.estTotalMin,
        criteria: ($('#fgCriteria', s.el) || {}).value || '',
      };
      if (editing) Object.assign(editing, payload);
      else {
        store.goals.push({
          id: nid('G'), ownerId: store.currentUser, customPoints: 0,
          status: payload.type === 'stage' ? 'active' : 'active',
          createdAt: Date.now(), ...payload,
        });
      }
      s.close();
      renderAll();
      toast(editing ? `「${title}」已保存` : `「${title}」已加入${payload.type === 'stage' ? '小目标' : '今日待办'}`);
    });

    sync();
  }
  /* ═══════════════════════════════════════════════════════
     验收
     ═══════════════════════════════════════════════════════ */
  function openSubmitVerify(goalId) {
    if (!guard('提交审核要先登录。')) return;
    const goal = goalOf(goalId);
    if (!goal) return;
    const count = store.verifications.filter((v) => v.goalId === goalId).length + 1;
    const s = openSheet({
      title: '提交审核',
      width: 520,
      body: `
        <div class="ck-goal">
          <span class="ck-emoji">${goal.emoji || '🏁'}</span>
          <div><b>${esc(goal.title)}</b><small>第 ${count} 次提交 · 完成后 +${stagePoints(goal)} 分</small></div>
        </div>
        <p class="fg-label">自述（必填，对方靠这个判断）</p>
        <textarea id="vfStatement" class="fg-input" rows="3" maxlength="300" placeholder="做到哪一步了，怎么证明"></textarea>
        <p class="fg-label">证据（文字描述，最多 3 条）</p>
        <input id="vfEvidence" class="fg-input" type="text" maxlength="120" placeholder="比如：照片 2 张、导出 PDF 一份"/>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>提交给对方</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      const stmt = $('#vfStatement', s.el).value.trim();
      if (stmt.length < 8) { toast('自述再写具体一点，至少 8 个字'); return; }
      store.verifications.push({
        id: nid('V'), goalId, userId: store.currentUser, submitCount: count,
        selfStatement: stmt, evidence: $('#vfEvidence', s.el).value.trim(),
        status: 'pending', at: Date.now(), decidedAt: 0, reason: '',
      });
      if (goal) goal.status = 'reviewing';
      s.close(); renderAll();
      toast('已提交，等对方确认');
    });
  }

  function openVerifyDecision(vid) {
    const v = store.verifications.find((x) => x.id === vid);
    if (!v) return;
    const goal = goalOf(v.goalId);
    const submitter = userById(v.userId);
    const s = openSheet({
      title: '审核详情',
      width: 520,
      body: `
        <div class="ck-goal">
          <span class="ck-emoji">${goal ? goal.emoji : '🏁'}</span>
          <div><b>${esc(goal ? goal.title : '目标')}</b><small>${esc(submitter.name)} · 第 ${v.submitCount} 次提交</small></div>
        </div>
        <div class="vf-block"><p class="fg-label">自述</p><p class="vf-text">${esc(v.selfStatement)}</p></div>
        ${v.evidence ? `<div class="vf-block"><p class="fg-label">证据</p><p class="vf-text">${esc(v.evidence)}</p></div>` : ''}
        ${goal && goal.criteria ? `<div class="vf-block"><p class="fg-label">完成标准</p><p class="vf-text">${esc(goal.criteria)}</p></div>` : ''}
        ${v.status === 'pending' ? `<label class="fg-field">驳回理由（只在驳回时填）
          <input id="vfReason" type="text" maxlength="80" placeholder="比如：照片看不清完成度"/></label>` : ''}`,
      actions: v.status === 'pending'
        ? `<button class="text-btn" type="button" data-cancel>稍后</button>
           <button class="text-btn" type="button" data-reject>驳回</button>
           <button class="wood-btn" type="button" data-approve>通过，入账</button>`
        : `<button class="text-btn" type="button" data-cancel>关闭</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    const ap = $('[data-approve]', s.el);
    if (ap) ap.addEventListener('click', () => {
      v.status = 'approved'; v.decidedAt = Date.now();
      if (goal) { goal.status = 'achieved'; goal.achievedAt = Date.now(); }
      const pts = stagePoints(goal);
      const overdue = goal && goal.endDate && todayKey() > goal.endDate;
      const final = overdue ? Math.round(pts * 0.9) : pts;
      ledgerAdd(v.userId, final, 'stage_credit', `小目标达成 · ${goal ? goal.title : ''}`, v.goalId);
      s.close(); renderAll();
      toast(`已通过，${userById(v.userId).name} +${final} 分${overdue ? '（逾期按 90% 发放）' : ''}`);
    });
    const rj = $('[data-reject]', s.el);
    if (rj) rj.addEventListener('click', () => {
      const reason = ($('#vfReason', s.el).value || '').trim();
      if (!reason) { toast('驳回要写理由'); return; }
      v.status = 'rejected'; v.reason = reason; v.decidedAt = Date.now();
      if (goal) goal.status = 'active';
      s.close(); renderAll();
      toast('已驳回，对方可以改了再提交');
    });
  }

  /* ═══════════════════════════════════════════════════════
     愿望单
     ═══════════════════════════════════════════════════════ */
  function wishState(w) {
    const uid = store.currentUser;
    const bal = balanceOf(uid);
    const last = store.redemptions.filter((r) => r.wishId === w.id && r.status !== 'cancelled').sort((a, b) => b.appliedAt - a.appliedAt)[0];
    if (last && w.cooldown && Date.now() - last.appliedAt < w.cooldown * 86400000) {
      const left = Math.ceil((w.cooldown * 86400000 - (Date.now() - last.appliedAt)) / 86400000);
      return { kind: 'cooldown', label: `冷却中 ${left} 天`, ok: false };
    }
    if (bal < w.pointsCost) return { kind: 'short', label: `差 ${fmt(w.pointsCost - bal)} 分`, ok: false };
    return { kind: 'ok', label: '兑换', ok: true };
  }

  function openWishForm(wid) {
    if (!guard('加愿望要先登录。')) return;
    const w = wid ? store.wishes.find((x) => x.id === wid) : null;
    const base = w || { kind: 'goods', title: '', emoji: '🎁', priceCny: 100, pointsCost: 1000, cooldown: 0, status: 'active', desc: '' };
    const s = openSheet({
      title: w ? '编辑愿望' : '新的愿望',
      width: 520,
      body: `
        <div class="fg-tabs">
          <button class="fg-tab${base.kind === 'goods' ? ' is-on' : ''}" type="button" data-kind="goods">商品</button>
          <button class="fg-tab${base.kind === 'event' ? ' is-on' : ''}" type="button" data-kind="event">事件</button>
        </div>
        <label class="fg-field">愿望名字
          <input id="wfTitle" type="text" maxlength="20" value="${esc(base.title)}" placeholder="比如：一台拍立得"/>
        </label>
        <div class="fg-emojis">
          ${['🎁', '♨️', '📷', '🎬', '🍰', '🧋', '🎮', '🏃', '✈️', '🛟'].map((e) => `<button class="fg-emoji${e === base.emoji ? ' is-on' : ''}" type="button" data-emoji="${e}">${e}</button>`).join('')}
        </div>
        <div id="wfGoods">
          <div class="fg-row2">
            <label class="fg-field">参考价（元）
              <input id="wfPrice" type="number" min="1" max="99999" value="${base.priceCny || 100}"/>
            </label>
            <label class="fg-field">积分价
              <input id="wfPoints" type="number" min="10" max="99999" value="${base.pointsCost || 1000}"/>
            </label>
          </div>
          <p class="fg-note">默认按 1 元 = 10 分换算，可以改。</p>
        </div>
        <div id="wfEvent" ${base.kind !== 'event' ? 'hidden' : ''}>
          <div class="fg-row2">
            <label class="fg-field">积分价
              <input id="wfPoints2" type="number" min="10" max="99999" value="${base.pointsCost || 300}"/>
            </label>
            <label class="fg-field">有效天数
              <input id="wfValid" type="number" min="1" max="365" value="${base.validDays || 30}"/>
            </label>
          </div>
          <p class="fg-note">事件类要占用对方的时间，需要对方确认才扣分。</p>
        </div>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>${w ? '保存' : '加进愿望单'}</button>`,
    });
    let kind = base.kind;
    s.el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-kind]');
      if (k) {
        kind = k.dataset.kind;
        $$('.fg-tab', s.el).forEach((b) => b.classList.toggle('is-on', b.dataset.kind === kind));
        $('#wfGoods', s.el).hidden = kind !== 'goods';
        $('#wfEvent', s.el).hidden = kind !== 'event';
      }
      const em = e.target.closest('[data-emoji]');
      if (em) $$('.fg-emoji', s.el).forEach((b) => b.classList.toggle('is-on', b === em));
    });
    $('#wfPrice', s.el).addEventListener('input', (e) => {
      const v = Number(e.target.value);
      if (v > 0) $('#wfPoints', s.el).value = v * 10;
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      const title = $('#wfTitle', s.el).value.trim();
      if (!title) { toast('先给愿望起个名字'); return; }
      const em = $('.fg-emoji.is-on', s.el);
      const payload = {
        kind, title, emoji: em ? em.dataset.emoji : '🎁',
        pointsCost: Number((kind === 'goods' ? $('#wfPoints', s.el) : $('#wfPoints2', s.el)).value) || 100,
        priceCny: kind === 'goods' ? Number($('#wfPrice', s.el).value) || 0 : 0,
        validDays: kind === 'event' ? Number($('#wfValid', s.el).value) || 30 : 0,
        needConfirm: kind === 'event' && !/豁免/.test(title),
        cooldown: base.cooldown || 0, status: 'active',
        ownerId: store.currentUser,
      };
      if (w) Object.assign(w, payload);
      else store.wishes.push({ id: nid('W'), desc: '', ...payload });
      s.close(); renderAll(); toast(w ? '已保存' : `「${title}」已加入愿望单`);
    });
  }
  /* ═══════════════════════════════════════════════════════
     视图渲染（目标 / 愿望单 / 我们 / 我的）
     ═══════════════════════════════════════════════════════ */
  const head = (title, desc, summary) => `<div class="view-head"><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}<span class="view-summary">${summary}</span></div>`;
  const monthChecks = (id) => store.checks.filter((c) => c.userId === id && c.status === 'credited' && c.date.slice(0, 7) === todayKey().slice(0, 7)).length;
  const monthPoints = (id) => store.ledger.filter((l) => l.userId === id && l.delta > 0 && l.date.slice(0, 7) === todayKey().slice(0, 7)).reduce((s, l) => s + l.delta, 0);
  const bestStreak = (id) => Math.max(0, ...store.goals.filter((g) => g.ownerId === id).map((g) => streakOf(g.id, id)));

  function goalRow(goal) {
    const uid = store.currentUser;
    const pts = goal.type === 'stage' ? stagePoints(goal) : calcPoints(goal, goal.durationMin, !!goal.windowStart);
    const freq = goal.freqMode === 'daily' ? '每日' : goal.freqMode === 'weekly' ? `每周 ${goal.freqN} 次`
      : (goal.weekdays || []).map((d) => '周' + WEEK[d]).join(' / ');
    const sub = goal.type === 'stage'
      ? `${(goal.estTotalMin / 60).toFixed(0)} 小时 · 截止 ${goal.endDate || '未设'}`
      : `${goal.durationMin} 分钟 · ${freq}${goal.windowStart ? ' · ' + goal.windowStart + '–' + goal.windowEnd : ''}`;
    const badge = goal.status === 'achieved' ? ['chip-ok', '已达成', '']
      : goal.status === 'reviewing' ? ['chip-gold', '待审核', 'chip-gold']
        : goal.status === 'abandoned' ? ['chip-muted', '已放弃', 'chip-muted']
          : ['chip-muted', '进行中', 'chip-muted'];
    const action = goal.status === 'active'
      ? (goal.type === 'stage'
        ? `<button class="chip-btn" type="button" data-submit="${goal.id}">提交审核</button>`
        : `<button class="chip-btn" type="button" data-check="${goal.id}">打卡</button>`)
      : '';
    return `<div class="goal-mini">
      <span class="ge go-emoji">${goal.emoji || '🌱'}</span>
      <span class="gm"><b>${esc(goal.title)}</b><small>${esc(sub)}</small></span>
      <span class="goal-streak">${goal.type === 'daily' ? `连续 ${streakOf(goal.id, uid)} 天` : ''}</span>
      <span class="chip ${badge[2]}">${badge[1]}</span>
      <span class="goal-pts">+${pts}</span>
      <span class="goal-act">${action}<button class="text-btn" type="button" data-edit="${goal.id}">编辑</button></span>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════
     目标页：三栏并置（月历 / 今日与小目标 / 大目标路线）
     宽屏优势：看历史、看今天、做规划同屏，不用切 tab
     ═══════════════════════════════════════════════════════ */

  /* 某天的完成情况：用于月历色阶 */
  function dayTone(uid, date) {
    // 只统计「那天就已经存在」的目标，避免后来新建的目标把历史拉成未完成
    const dayEnd = new Date(date.replace(/-/g, '/'));
    dayEnd.setHours(23, 59, 59, 999);
    const due = store.goals.filter((g) => g.ownerId === uid && g.type === 'daily' && g.status === 'active'
      && dueToday(g, date) && (g.createdAt || 0) <= dayEnd.getTime());
    if (!due.length) return { tone: 'none', due: 0, done: 0 };
    const done = due.filter((g) => checkOf(g.id, uid, date)).length;
    const pend = due.filter((g) => !checkOf(g.id, uid, date) && pendingCheckOf(g.id, uid, date)).length;
    if (done === due.length) return { tone: 'full', due: due.length, done };
    if (done > 0 || pend > 0) return { tone: 'part', due: due.length, done, pend };
    return { tone: 'miss', due: due.length, done: 0 };
  }

  /* 月历 */
  function renderCalendar(uid, cursor) {
    const today = todayKey();
    const [y, m] = cursor.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startWd = first.getDay();            // 0=周日
    const daysInMonth = new Date(y, m, 0).getDate();
    const prevDays = new Date(y, m - 1, 0).getDate();

    const cells = [];
    // 前置补位（上个月）
    for (let i = startWd - 1; i >= 0; i--) {
      const d = prevDays - i;
      const pm = m === 1 ? 12 : m - 1;
      const py = m === 1 ? y - 1 : y;
      cells.push({ date: `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`, num: d, out: true });
    }
    // 当月
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, num: d, out: false });
    }
    // 尾部补位
    while (cells.length % 7 !== 0) {
      const d = cells.length - startWd - daysInMonth + 1;
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      cells.push({ date: `${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`, num: d, out: true });
    }

    const cellHtml = cells.map((c, i) => {
      const t = c.out ? { tone: 'none' } : dayTone(uid, c.date);
      const isToday = c.date === today;
      const wd = i % 7;
      return `<button class="cal-cell tone-${t.tone}${c.out ? ' is-out' : ''}${isToday ? ' is-today' : ''}${wd === 0 || wd === 6 ? ' is-wknd' : ''}"
        type="button" data-cal-day="${c.date}" ${c.out ? 'tabindex="-1"' : ''}>
        <span class="cal-num">${c.num}</span>
        ${t.tone !== 'none' && !c.out ? `<span class="cal-dot"></span>` : ''}
      </button>`;
    }).join('');

    return `
      <section class="wood-panel goals-col goals-cal">
        <div class="panel-head"><h2><span class="wood-tag">日历</span></h2>
          <button class="text-btn" type="button" data-cal-today>回到今天</button></div>
        <div class="cal-nav">
          <button class="cal-arrow" type="button" data-cal-prev aria-label="上个月">‹</button>
          <b class="cal-month">${y} 年 ${m} 月</b>
          <button class="cal-arrow" type="button" data-cal-next aria-label="下个月">›</button>
        </div>
        <div class="cal-weekdays">${['日', '一', '二', '三', '四', '五', '六'].map((d, i) => `<span class="${i === 0 || i === 6 ? 'is-wknd' : ''}">${d}</span>`).join('')}</div>
        <div class="cal-grid">${cellHtml}</div>
        <div class="cal-legend">
          <span>少</span>
          <i class="tone-miss"></i><i class="tone-part"></i><i class="tone-full"></i>
          <span>多</span>
        </div>
        <p class="cal-note">点某一天，右边会显示那天的日常目标。</p>
      </section>`;
  }

  /* 中间栏：某天的目标 */
  /* 日常目标（跟着选中日期走） */
  function renderDailyPanel(uid, date) {
    const isToday = date === todayKey();
    const due = store.goals.filter((g) => g.ownerId === uid && g.type === 'daily' && g.status === 'active' && dueToday(g, date));
    const rows = due.map((g) => {
      const c = checkOf(g.id, uid, date);
      const pend = pendingCheckOf(g.id, uid, date);
      const pts = calcPoints(g, g.durationMin, false);
      const yesterday = shiftDay(-1);
      let state;
      if (c) state = '<span class="day-state is-ok">已通过</span>';
      else if (pend) state = '<span class="day-state is-pend">等审核</span>';
      else if (isToday) state = `<button class="chip-btn" type="button" data-check="${g.id}">打卡</button>`;
      else if (date === yesterday && makeupLeft() > 0) state = `<button class="chip-btn" type="button" data-makeup="${g.id}:${date}">补卡</button>`;
      else state = '<span class="day-state is-miss">没打卡</span>';
      return `<div class="day-row">
        <span class="day-emoji">${g.emoji || '🌱'}</span>
        <span class="day-main"><b>${esc(g.title)}</b><small>${g.durationMin} 分钟 · +${pts} 分</small></span>
        ${state}
      </div>`;
    }).join('');

    const label = isToday ? '今天的日常' : date.slice(5).replace('-', ' 月 ') + ' 日';
    return `
      <section class="wood-panel goals-col goals-daily">
        <div class="panel-head">
          <h2><span class="wood-tag">${label}</span></h2>
          <button class="wood-btn wood-btn-sm" type="button" data-new-goal="daily">
            <span class="btn-ico" data-icon="plus" data-icon-kind="mono" aria-hidden="true"></span>新目标</button>
        </div>
        ${rows || '<p class="task-empty">这天没有需要打卡的目标。</p>'}
      </section>`;
  }

  /* 小目标（一次性成果，要审核） */
  function renderStagePanel(uid) {
    const stages = store.goals.filter((g) => g.ownerId === uid && g.type === 'stage' && g.status !== 'abandoned');
    const rows = stages.map((g) => {
      const st = g.status === 'achieved' ? '已达成' : g.status === 'reviewing' ? '待审核' : '进行中';
      const cls = g.status === 'achieved' ? 'is-ok' : g.status === 'reviewing' ? 'is-pend' : '';
      const act = g.status === 'active'
        ? `<button class="chip-btn" type="button" data-submit="${g.id}">提交审核</button>` : '';
      return `<div class="day-row">
        <span class="day-emoji">${g.emoji || '🏁'}</span>
        <span class="day-main"><b>${esc(g.title)}</b><small>${(g.estTotalMin / 60).toFixed(0)} 小时 · +${stagePoints(g)} 分</small></span>
        <span class="day-state ${cls}">${st}</span>${act}
      </div>`;
    }).join('');

    return `
      <section class="wood-panel goals-col goals-stage">
        <div class="panel-head"><h2><span class="wood-tag wood-tag-gold">小目标</span></h2>
          <button class="text-btn" type="button" data-new-goal="stage">+ 新建</button></div>
        <p class="col-hint">一次性的成果，完成后由对方审核。</p>
        ${rows || '<p class="task-empty">还没有小目标。</p>'}
      </section>`;
  }


  /* 大目标详情：完整路线 + 进度 + 操作 */
  function openBigDetail(bid) {
    const b = store.biggoals.find((x) => String(x.id) === String(bid));
    if (!b) return;
    const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
    const chainStatus = { planned: '未启动', released: '进行中', done: '已完成' };
    const s = openSheet({
      title: '大目标',
      width: 560,
      body: `
        <div class="bd-head">
          <span class="bd-emoji">${b.emoji || '🎯'}</span>
          <div class="bd-title"><b>${esc(b.title)}</b><small>${esc(b.note || '')}</small></div>
        </div>
        <div class="bd-progress"><span style="width:${pct}%"></span></div>
        <p class="bd-count"><b>${b.done}</b> / ${b.total} 完成 · ${pct}%</p>
        <p class="fg-label">路线（共 ${(b.chain || []).length} 步）</p>
        <div class="bd-chain">
          ${(b.chain || []).map((c, i) => `
            <div class="bd-step is-${c.status}">
              <span class="bd-step-idx">${i + 1}</span>
              <div class="bd-step-main">
                <b>${c.emoji || '📌'} ${esc(c.title)}</b>
                <small>计划 ${c.plannedDate ? c.plannedDate.slice(5).replace('-', '/') : '未排期'} · ${chainStatus[c.status] || ''}</small>
              </div>
            </div>`).join('') || '<p class="task-empty">还没有拆解。加一个小目标，这条路才有方向。</p>'}
        </div>`,
      actions: `<button class="text-btn" type="button" data-cancel>关闭</button>
        <button class="wood-btn" type="button" data-bd-add="${b.id}">+ 加个小目标</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-bd-add]', s.el).addEventListener('click', () => { s.close(); openChainAdd(bid); });
  }

  /* 右栏：大目标路线 */
  function renderBigGoals(uid) {
    if (!store.biggoals.length) {
      return `<section class="wood-panel goals-col goals-big">
        <div class="panel-head"><h2><span class="wood-tag">大目标</span></h2></div>
        <p class="task-empty">还没有大目标。大目标是一件长远的事，拆成几个小目标一步步做。</p>
        <button class="wood-btn wood-btn-sm" type="button" data-new-biggoal>+ 建大目标</button>
      </section>`;
    }
    const chainStatus = { planned: '未启动', released: '进行中', done: '已完成' };
    return store.biggoals.map((b) => {
      const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
      return `<section class="wood-panel goals-col goals-big">
        <div class="panel-head"><h2><span class="wood-tag">大目标</span></h2>
          <button class="text-btn" type="button" data-edit-biggoal="${b.id}">编辑</button></div>
        <button class="big-head" type="button" data-big-open="${b.id}">
          <span class="big-emoji">${b.emoji || '🎯'}</span>
          <div class="big-title"><b>${esc(b.title)}</b><small>${esc(b.note || '')}</small></div>
          <span class="big-open-arrow" aria-hidden="true">›</span>
        </button>
        <div class="big-progress"><span style="width:${pct}%"></span></div>
        <p class="big-count"><b>${b.done}</b> / ${b.total} · ${pct}%</p>
        <p class="fg-label">路线</p>
        <div class="big-chain">
          ${(b.chain || []).map((c, i) => `
            <div class="chain-item is-${c.status}">
              <span class="chain-dot"></span>
              <div class="chain-main">
                <b>${c.emoji || '·'} ${esc(c.title)}</b>
                <small>计划 ${c.plannedDate ? c.plannedDate.slice(5).replace('-', '/') : '未排期'} · ${chainStatus[c.status] || ''}</small>
              </div>
              <button class="text-btn chain-del" type="button" data-chain-del="${b.id}:${i}">移出</button>
            </div>`).join('') || '<p class="task-empty">还没有拆解。加一个小目标，大目标才有推进的路径。</p>'}
        </div>
        <div class="big-actions">
          <button class="wood-btn wood-btn-sm" type="button" data-chain-add="${b.id}">+ 加个小目标</button>
          <button class="text-btn" type="button" data-big-shift="${b.id}">整体顺延</button>
          <button class="text-btn" type="button" data-zoowy="${b.id}">让 zoowy 拆</button>
        </div>
      </section>`;
    }).join('');
  }


  /* 翻月 */
  function shiftMonth(delta) {
    const cur = store.calCursor || todayKey().slice(0, 7);
    const [y, m] = cur.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    store.calCursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderView('goals');
  }

  /* 往大目标路线加一个小目标 */

  /* ── 补卡：仅昨天、每月 2 次、积分 0.8 折，不计时段加成 ── */
  const MAKEUP_MONTH_LIMIT = 2;
  function makeupUsedThisMonth(uid) {
    const ym = todayKey().slice(0, 7);
    return store.checks.filter((c) => c.userId === uid && c.isMakeup && c.date.slice(0, 7) === ym).length;
  }
  function makeupLeft() {
    return Math.max(0, MAKEUP_MONTH_LIMIT - makeupUsedThisMonth(store.currentUser));
  }

  function openMakeup(goalId, date) {
    if (!guard('补卡要先登录。')) return;
    const uid = store.currentUser;
    const goal = goalOf(goalId);
    if (!goal) return;
    if (date !== shiftDay(-1)) { toast('只能补昨天'); return; }
    if (checkOf(goalId, uid, date) || pendingCheckOf(goalId, uid, date)) { toast('这天已经打过卡了'); return; }
    const left = makeupLeft();
    if (left <= 0) { toast('这个月的补卡用完了（每月 2 次）'); return; }

    // 补卡积分：B × D × F × 0.8，不计时段加成
    const base = calcPoints(goal, goal.durationMin, false);
    const pts = Math.max(1, Math.round(base * 0.8));

    const s = openSheet({
      title: '补卡',
      width: 440,
      body: `
        <div class="ck-goal">
          <span class="ck-emoji">${goal.emoji || '🌱'}</span>
          <div><b>${esc(goal.title)}</b><small>补 ${date.slice(5).replace('-', ' 月 ')} 日 · 这个月还能补 ${left} 次</small></div>
        </div>
        <p class="guest-tip">补卡按 0.8 折计分，不加时段加成，连续记录可以接上。</p>
        <div class="ck-preview"><span>这次可得</span><b>+${pts}</b><small>原价 ${base} 分 × 0.8</small></div>`,
      actions: `<button class="text-btn" type="button" data-cancel>算了</button>
        <button class="wood-btn" type="button" data-ok>确认补卡</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      store.checks.push({
        id: nid('C'), goalId, userId: uid, date, minutes: goal.durationMin, points: pts,
        inWindow: false, note: '补卡', evidence: '', status: 'pending', isMakeup: true, at: Date.now(),
      });
      s.close(); renderAll();
      toast(`已补 ${date.slice(5)} 的卡，等对方审核后 +${pts} 分`);
    });
  }

  function openChainAdd(bid) {
    const b = store.biggoals.find((x) => String(x.id) === String(bid));
    if (!b) return;
    const s = openSheet({
      title: '加个小目标',
      width: 460,
      body: `
        <p class="sheet-text">大目标「${esc(b.title)}」拆出的一步。写清楚做完什么样算完成。</p>
        <label class="fg-field">这一步做什么
          <input id="chainTitle" type="text" maxlength="30" placeholder="比如：读完《人类简史》"/>
        </label>
        <label class="fg-field">计划哪天做
          <input id="chainDate" type="date" value="${shiftDay(7)}"/>
        </label>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>加进路线</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      const title = $('#chainTitle', s.el).value.trim();
      if (!title) { toast('先写这一步做什么'); return; }
      b.chain = b.chain || [];
      b.chain.push({ title, emoji: '📌', plannedDate: $('#chainDate', s.el).value, status: 'planned' });
      s.close(); renderView('goals'); toast(`「${title}」已加进路线`);
    });
  }

  /* 整体顺延 */
  function openBigShift(bid) {
    const b = store.biggoals.find((x) => String(x.id) === String(bid));
    if (!b || !b.chain) return;
    const pending = b.chain.filter((c) => c.status === 'planned').length;
    if (!pending) { toast('没有未启动的小目标可以顺延'); return; }
    const s = openSheet({
      title: '整体顺延',
      width: 420,
      body: `<p class="sheet-text">只挪还没启动的 ${pending} 个，已经开始的不会动。</p>
        <div class="fg-chips">
          ${[1, 3, 7, 14].map((n) => `<button class="chip-btn" type="button" data-days="${n}">往后 ${n} 天</button>`).join('')}
        </div>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    s.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-days]');
      if (!btn) return;
      const n = Number(btn.dataset.days);
      b.chain.forEach((c) => {
        if (c.status !== 'planned' || !c.plannedDate) return;
        const d = new Date(c.plannedDate.replace(/-/g, '/'));
        d.setDate(d.getDate() + n);
        c.plannedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });
      s.close(); renderView('goals'); toast(`未启动的 ${pending} 个顺延 ${n} 天`);
    });
  }

  function renderGoalsView() {
    const uid = store.currentUser;
    if (isGuest()) return renderGuestGoals();

    const mine = store.goals.filter((g) => g.ownerId === uid && g.status !== 'abandoned');
    const cursor = store.calCursor || todayKey().slice(0, 7);
    const selDay = store.selDay || todayKey();

    return `${head('目标', '', `进行中 ${mine.filter((g) => g.status === 'active').length} 个 · 本月完成 ${monthChecks(uid)} 次`)}
      <div class="goals-layout">
        <div class="goals-left">
          ${renderCalendar(uid, cursor)}
        </div>
        <div class="goals-right">
          ${renderDailyPanel(uid, selDay)}
          ${renderStagePanel(uid)}
          ${renderBigGoals(uid)}
        </div>
      </div>`;
  }

  function renderGuestGoals() {
    return `${head('目标', '', '还没登录')}
      <section class="wood-panel sub-panel">
        <p class="task-empty">登录后这里会有月历、今日目标和长期规划的拆解。</p>
        <div class="ng-actions"><button class="wood-btn" type="button" data-open-register>建个账号</button></div>
      </section>`;
  }

  function renderWishView() {
    const uid = store.currentUser;
    const bal = balanceOf(uid);
    const items = store.wishes.filter((w) => w.ownerId === uid && w.status === 'active');
    const reds = store.redemptions.filter((r) => r.userId === uid).sort((a, b) => b.appliedAt - a.appliedAt);
    const label = { applied: '待对方确认', confirmed: '已扣分', done: '已完成', cancelled: '已取消', expired: '已过期' };
    return `${head('愿望单', '1 元 = 10 分', `可用 ${fmt(bal)} 分 · ≈ ¥${(bal / 10).toFixed(1)} · 已兑换 ${reds.filter((r) => r.status === 'done').length} 件`)}
      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag wood-tag-berry">正在攒</span></h2>
          <button class="wood-btn wood-btn-sm" type="button" data-new-wish><span class="btn-ico" data-icon="plus" data-icon-kind="mono"></span>新愿望</button></div>
        ${items.length ? items.map((w) => {
          const st = wishState(w);
          const pct = Math.min(100, Math.round((bal / w.pointsCost) * 100));
          return `<div class="wish-card">
            <span class="wish-emoji go-emoji">${w.emoji}</span>
            <div class="wc-body"><b>${esc(w.title)}</b>
              <small>${w.kind === 'goods' ? `¥${w.priceCny} · ` : '事件 · '}需要 ${fmt(w.pointsCost)} 分${w.kind === 'goods' ? '' : (w.needConfirm ? ' · 需对方确认' : ' · 自己就能用')}</small></div>
            <div class="wc-bar"><i style="width:${pct}%"></i></div>
            <button class="hold-btn" type="button"
              data-redeem="${w.id}" ${st.ok ? '' : 'disabled'}
              aria-label="${esc(w.title)}：${st.ok ? '按住一秒兑换' : st.label}">
              <span class="hold-fill" aria-hidden="true"></span>
              <span class="hold-label">${st.ok ? '按住兑换' : esc(st.label)}</span>
            </button>
          </div>`; }).join('') : '<p class="task-empty">愿望单是空的。</p>'}
      </section>
      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">兑换记录</span></h2></div>
        ${reds.length ? reds.map((r) => `<div class="red-row">
          <span class="red-title">${esc(r.title)}</span>
          <span class="red-points">-${fmt(r.points)}</span>
          <span class="chip chip-muted">${label[r.status] || r.status}</span>
          <span class="goal-act">
            ${r.status === 'confirmed' ? '<button class="text-btn" type="button" data-red-done="' + r.id + '">已收到</button><button class="text-btn" type="button" data-red-cancel="' + r.id + '">撤回</button>' : ''}
          </span></div>`).join('') : '<p class="task-empty">还没有兑换记录。</p>'}
      </section>`;
  }


  /* ═══════════════════════════════════════════════════════
     匹配大厅：未配对时是主界面，配对后收成一个入口
     ═══════════════════════════════════════════════════════ */
  function renderHallPage() {
    const uid = store.currentUser;
    const h = store.hall;
    const mine = store.accounts.find((a) => a.id === uid);
    const incoming = h.invites.filter((i) => i.to === uid && i.status === 'pending');
    const outgoing = h.invites.filter((i) => i.from === uid && i.status === 'pending');

    const myCard = `
      <section class="wood-panel sub-panel hall-mine">
        <div class="panel-head"><h2><span class="wood-tag wood-tag-gold">我的介绍</span></h2>
          <button class="text-btn" type="button" data-hall-edit>${h.myNote ? '改一下' : '写一段'}</button></div>
        ${h.myNote
          ? `<p class="hall-note">${esc(h.myNote)}</p>`
          : '<p class="hall-empty">还没写自我介绍。写清楚作息和目标，更容易找到合适的搭子。</p>'}
        <p class="fg-note">大厅里的人能看到这段介绍和你的目标摘要。</p>
      </section>`;

    const inviteCards = (incoming.length || outgoing.length) ? `
      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag wood-tag-berry">配对邀请</span></h2>
          <p>${incoming.length + outgoing.length} 条</p></div>
        ${incoming.map((i) => {
          const who = store.accounts.find((a) => a.id === i.from) || store.hall.listings.find((l) => l.id === i.from);
          return `<div class="hall-card is-incoming">
            <span class="hall-avatar">${who && who.avatar ? who.avatar : '🙂'}</span>
            <div class="hall-info"><b>${esc(who ? who.name : '有人')}</b><small>想和你配对</small></div>
            <button class="chip-btn" type="button" data-hall-accept="${i.id}">接受</button>
            <button class="text-btn" type="button" data-hall-decline="${i.id}">拒绝</button>
          </div>`;
        }).join('')}
        ${outgoing.map((i) => {
          const who = store.accounts.find((a) => a.id === i.to) || store.hall.listings.find((l) => l.id === i.to);
          return `<div class="hall-card is-outgoing">
            <span class="hall-avatar">${who && who.avatar ? who.avatar : '🙂'}</span>
            <div class="hall-info"><b>${esc(who ? who.name : '对方')}</b><small>已发出邀请，等对方回应</small></div>
            <button class="text-btn" type="button" data-hall-cancel="${i.id}">撤回</button>
          </div>`;
        }).join('')}
      </section>` : '';

    const listHtml = store.hall.listings.map((l) => {
      const invited = store.hall.invites.some((i) => i.from === uid && i.to === l.id && i.status === 'pending');
      return `<div class="hall-card">
        <span class="hall-avatar">${l.avatar}</span>
        <div class="hall-info">
          <b>${esc(l.name)}</b>
          <p class="hall-note">${esc(l.note)}</p>
          <small class="hall-goal">🎯 ${esc(l.goal)}</small>
        </div>
        ${invited
          ? '<span class="chip chip-muted">已邀请</span>'
          : `<button class="chip-btn" type="button" data-hall-invite="${l.id}">邀请</button>`}
      </div>`;
    }).join('');

    return `${head('找一个搭子', '', `大厅里还有 ${store.hall.listings.length} 个人`)}
      ${myCard}
      ${inviteCards}
      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">大厅</span></h2><p>先看看别人的介绍</p></div>
        ${listHtml || '<p class="task-empty">现在还没有人在大厅里。</p>'}
      </section>
      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">已经有搭子了？</span></h2></div>
        <p class="fg-note">对方给你邀请码的话，输进去就能直接配对，不用经过大厅。</p>
        <div class="ng-actions" style="margin-top:12px">
          <button class="wood-btn wood-btn-sm" type="button" data-open-join>用邀请码加入</button>
        </div>
      </section>`;
  }

  /* 配对后：大厅收成一个小入口 */
  function renderHallEntry() {
    const pending = store.hall.invites.filter((i) => (i.to === store.currentUser || i.from === store.currentUser) && i.status === 'pending').length;
    return `<section class="wood-panel sub-panel hall-entry">
      <div class="hall-entry-row">
        <span class="hall-entry-ico" data-icon="us"></span>
        <div class="hall-entry-copy"><b>匹配大厅</b><small>已经配对，想看看别人的进度可以去逛</small></div>
        ${pending ? `<span class="chip chip-gold">${pending} 条邀请</span>` : ''}
        <button class="text-btn" type="button" data-hall-open>进去看看 →</button>
      </div>
    </section>`;
  }

  function openHallEdit() {
    const s = openSheet({
      title: '我的介绍', width: 480,
      body: `<textarea id="hallNote" class="fg-input" rows="4" maxlength="200" placeholder="比如：早起型，想找个人一起坚持每天跑步">${esc(store.hall.myNote)}</textarea>
        <p class="fg-note">写清楚作息、目标和强度，比写「求搭子」有用得多。</p>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>保存</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      store.hall.myNote = $('#hallNote', s.el).value.trim();
      s.close(); renderView('us'); toast('介绍已更新');
    });
  }

  /* 大厅里的「进去看看」：单独开一个浮层，不占主界面 */
  function openHallModal() {
    const uid = store.currentUser;
    const invited = (id) => store.hall.invites.some((i) => i.from === uid && i.to === id && i.status === 'pending');
    const body = `
      <p class="sheet-text">这里的人也在找搭子。你已经配对过了，再邀请会替换掉现在的搭档，谨慎操作。</p>
      ${store.hall.listings.map((l) => `<div class="hall-card">
        <span class="hall-avatar">${l.avatar}</span>
        <div class="hall-info"><b>${esc(l.name)}</b>
          <p class="hall-note">${esc(l.note)}</p>
          <small class="hall-goal">🎯 ${esc(l.goal)}</small></div>
        ${invited(l.id) ? '<span class="chip chip-muted">已邀请</span>'
          : `<button class="chip-btn" type="button" data-hall-invite="${l.id}">邀请</button>`}
      </div>`).join('')}`;
    const s = openSheet({ title: '匹配大厅', width: 560, body, actions: `<button class="wood-btn" type="button" data-cancel>关闭</button>` });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
  }


  /* ═══════════════════════════════════════════════════════
     手机使用时长：今日对比 + App 排行 + 7 天折线
     ═══════════════════════════════════════════════════════ */
  const fmtDur = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h ? `${h} 小时 ${m} 分` : `${m} 分钟`;
  };

  function renderUsageSection(uid, pid) {
    const u = store.usage;
    // 没有上报数据时给一份全 0 的空数据，保证框始终在
    const empty = { today: { total: 0, apps: [] }, week: [0, 0, 0, 0, 0, 0, 0] };
    const me = u[uid] || empty;
    const ta = (pid && u[pid]) || empty;
    const hasData = !!(u[uid] || (pid && u[pid]));
    const partnerName = pid ? userById(pid).name : '对方';

    // 7 天折线
    const days = me.week.map((_, i) => i);
    const maxSec = Math.max(3600, ...me.week, ...ta.week);
    const W = 560, H = 120, PAD = 8;
    const x = (i) => PAD + (i * (W - PAD * 2)) / (days.length - 1);
    const y = (v) => H - PAD - (v / maxSec) * (H - PAD * 2);
    const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const labels = days.map((i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return i % 2 === 0 ? `<text x="${x(i)}" y="${H - 1}" text-anchor="middle" class="wc-label">${d.getMonth() + 1}/${d.getDate()}</text>` : '';
    }).join('');

    const apps = (data) => data.today.apps.map((a) => {
      const pct = Math.round((a.sec / data.today.total) * 100);
      return `<div class="app-row">
        <span class="app-name">${esc(a.name)}</span>
        <div class="app-bar"><span style="width:${pct}%"></span></div>
        <span class="app-time">${fmtDur(a.sec)}</span>
      </div>`;
    }).join('');

    return `<section class="wood-panel sub-panel">
      <div class="panel-head"><h2><span class="wood-tag">手机使用时长</span></h2>
        <p>手机端每天自动上报</p></div>
      ${hasData ? '' : '<p class="usage-empty-hint">手机端还没上报数据。下面是空的，等对方装上手机版就会自动填进来。</p>'}
      <div class="usage-today">
        <div class="usage-cell me"><span>我今天</span><b>${fmtDur(me.today.total)}</b></div>
        <div class="usage-cell ta"><span>${esc(partnerName)}今天</span><b>${fmtDur(ta.today.total)}</b></div>
      </div>
      <p class="fg-label">这七天</p>
      <svg class="usage-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="近七天使用时长折线">
        <path d="${path(me.week)}" class="wc-line me"/>
        <path d="${path(ta.week)}" class="wc-line ta"/>
        ${days.map((i) => `<circle cx="${x(i)}" cy="${y(me.week[i])}" r="2.5" class="wc-dot me"/>`).join('')}
        ${days.map((i) => `<circle cx="${x(i)}" cy="${y(ta.week[i])}" r="2.5" class="wc-dot ta"/>`).join('')}
        ${labels}
      </svg>
      <div class="chart-legend" style="margin-top:6px">
        <span><i style="background:var(--leaf)"></i>我</span>
        <span><i style="background:var(--sky)"></i>${esc(partnerName)}</span>
      </div>
      <p class="fg-label" style="margin-top:14px">我今天的时间花在哪</p>
      ${me.today.apps.length ? apps(me) : '<p class="task-empty">还没有记录。手机上装了脚印，每天会自动上报。</p>'}
    </section>`;
  }


  /* ═══════════════════════════════════════════════════════
     zoowy：对话式拆目标。演示版用规则生成提议，不接模型
     ═══════════════════════════════════════════════════════ */
  const ZOOWY_TEMPLATES = {
    book: { title: '把读书目标拆成小目标', steps: ['读完一本你一直想读的书', '写一段读后感', '再挑下一本'] },
    run: { title: '把运动目标拆成小目标', steps: ['先连续三天各跑 2 公里', '加到 3 公里，跑一周', '跑一次 5 公里'] },
    word: { title: '把背单词拆成小目标', steps: ['每天背 20 个，坚持 7 天', '背完一轮，做一次自测', '把错词单独过一遍'] },
    default: { title: '把这个目标拆开', steps: ['先做最小的一步（一次就能完成）', '再往前推一步', '最后收尾'] },
  };

  function zoowyPick(text) {
    if (/读|书/.test(text)) return ZOOWY_TEMPLATES.book;
    if (/跑|运动|健身/.test(text)) return ZOOWY_TEMPLATES.run;
    if (/单词|英语|词汇/.test(text)) return ZOOWY_TEMPLATES.word;
    return ZOOWY_TEMPLATES.default;
  }

  function openZoowy(bigId) {
    const b = bigId ? store.biggoals.find((x) => String(x.id) === String(bigId)) : null;
    const s = openSheet({
      title: '和 zoowy 聊聊',
      width: 560,
      body: `
        <div class="zoowy-line">
          <span class="zoowy-avatar">🤖</span>
          <div class="zoowy-bubble">
            ${b ? `你想把「${esc(b.title)}」拆成几步？我帮你理理。` : '告诉我你今年想做的一件大事，我帮你拆成能做的几步。'}
          </div>
        </div>
        <div class="zoowy-input-row">
          <input id="zoowyText" class="fg-input" type="text" maxlength="60" placeholder="${b ? '比如：按季度拆' : '比如：今年读完 24 本书'}"/>
          <button class="wood-btn wood-btn-sm" type="button" data-zoowy-send>发</button>
        </div>
        <div id="zoowyReply"></div>`,
      actions: `<button class="text-btn" type="button" data-cancel>先不聊了</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());

    const send = () => {
      const text = ($('#zoowyText', s.el).value || '').trim();
      if (!text) { toast('先说说你想做什么'); return; }
      const tpl = zoowyPick(text);
      const reply = $('#zoowyReply', s.el);
      reply.innerHTML = `
        <div class="zoowy-line">
          <span class="zoowy-avatar">🤖</span>
          <div class="zoowy-bubble">
            我建议这样拆：<br/>
            ${tpl.steps.map((x, i) => `${i + 1}. ${esc(x)}`).join('<br/>')}
            <div class="zoowy-actions">
              <button class="chip-btn" type="button" data-zoowy-accept>就这样，加进我的目标</button>
              <button class="text-btn" type="button" data-zoowy-again>换个说法</button>
            </div>
          </div>
        </div>`;
      reply.querySelector('[data-zoowy-again]').addEventListener('click', () => {
        reply.innerHTML = '';
        $('#zoowyText', s.el).focus();
      });
      reply.querySelector('[data-zoowy-accept]').addEventListener('click', () => {
        // 提议落地：写进小目标（pending 归入目标页），大目标存在则挂到链上
        tpl.steps.forEach((step, i) => {
          store.goals.push({
            id: nid('G'), ownerId: store.currentUser, type: 'stage', title: step,
            emoji: '🏁', desc: `由 zoowy 拆分 · 第 ${i + 1} 步`, status: 'active',
            estTotalMin: 120, difficulty: 2, customPoints: 0, startDate: todayKey(),
            endDate: shiftDay(30 + i * 15), createdAt: Date.now(),
          });
          if (b) {
            b.chain = b.chain || [];
            b.chain.push({ title: step, emoji: '📌', plannedDate: shiftDay(7 + i * 14), status: 'planned' });
          }
        });
        s.close(); renderAll();
        toast(`已加入 ${tpl.steps.length} 个小目标`);
      });
    };
    $('[data-zoowy-send]', s.el).addEventListener('click', send);
    $('#zoowyText', s.el).addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }


  /* ═══════════════════════════════════════════════════════
     微信式状态：四个分组，选一个 + 一句话
     ═══════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════
     小聊天框：只能发预设短句，点一下就发出
     ═══════════════════════════════════════════════════════ */
  // 常用语：只是快捷方式，也可以自己打字
  const CHAT_PHRASES = [
    '今天打卡了吗', '打了，还多做了点', '晚上一起补？', '加油，还差一个', '我先睡了',
  ];

  function unreadChatCount(uid) {
    const pid = partnerId();
    if (!pid) return 0;
    return store.chat.filter((m) => m.from === pid && m.at > (store.chatReadAt || 0)).length;
  }

  function openChat() {
    if (!guard('聊天要先登录。')) return;
    const uid = store.currentUser;
    const pid = partnerId();
    if (!pid) { toast('还没有搭档，配对了才能聊'); return; }

    const renderMsgs = () => store.chat.slice(-20).map((m) => {
      const mine = m.from === uid;
      return `<div class="chat-row${mine ? ' is-mine' : ''}">
        <div class="chat-bubble">${esc(m.text)}</div>
        <span class="chat-time">${new Date(m.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>`;
    }).join('');

    const s = openSheet({
      title: `和 ${esc(userById(pid).name)} 说两句`,
      width: 420,
      body: `
        <div class="chat-list" id="chatList">${renderMsgs()}</div>
        <div class="chat-phrases">
          ${CHAT_PHRASES.map((p) => `<button class="chat-phrase" type="button" data-phrase="${esc(p)}">${esc(p)}</button>`).join('')}
        </div>
        <div class="chat-input-row">
          <input id="chatInput" class="fg-input" type="text" maxlength="200" placeholder="说点什么…"/>
          <button class="wood-btn wood-btn-sm" type="button" data-chat-send>发送</button>
        </div>`,
      actions: `<button class="text-btn" type="button" data-cancel>关闭</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());

    // 打开即标记已读
    store.chatReadAt = Date.now();

    const listEl = $('#chatList', s.el);
    listEl.scrollTop = listEl.scrollHeight;

    const pushMsg = (text) => {
      const t = String(text || '').trim();
      if (!t) { toast('说点什么再发'); return; }
      store.chat.push({ id: nid('M'), from: uid, text: t, at: Date.now() });
      listEl.innerHTML = renderMsgs();
      listEl.scrollTop = listEl.scrollHeight;
      renderAll();
    };

    s.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-phrase]');
      if (b) { pushMsg(b.dataset.phrase); return; }
      if (e.target.closest('[data-chat-send]')) {
        const input = $('#chatInput', s.el);
        pushMsg(input.value);
        input.value = '';
        input.focus();
      }
    });
    $('#chatInput', s.el).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const input = $('#chatInput', s.el);
        pushMsg(input.value);
        input.value = '';
      }
    });
  }

  const STATUS_GROUPS = [
    { key: 'mood', name: '心情想法', items: [
      ['美滋滋', '😊'], ['裂开', '😵'], ['求安慰', '🥺'], ['等天晴', '🌤️'], ['疲惫', '😮‍💨'],
      ['发呆', '🫥'], ['冲', '💪'], ['emo', '😢'], ['胡思乱想', '💭'], ['元气满满', '✨'],
    ] },
    { key: 'work', name: '工作学习', items: [
      ['搬砖', '🧱'], ['沉迷学习', '📚'], ['忙', '🏃'], ['摸鱼', '🐟'], ['出差', '✈️'],
      ['飞奔回家', '🏠'], ['勿扰模式', '🌙'],
    ] },
    { key: 'activity', name: '活动', items: [
      ['浪', '🌊'], ['打卡', '✅'], ['运动', '🏃‍♀️'], ['喝咖啡', '☕'], ['喝奶茶', '🧋'],
      ['干饭', '🍚'], ['拯救世界', '🦸'],
    ] },
    { key: 'rest', name: '休息', items: [
      ['闭关', '🚪'], ['宅', '🛋️'], ['睡觉', '😴'], ['吸猫', '🐱'], ['遛狗', '🐶'],
      ['玩游戏', '🎮'], ['听歌', '🎧'], ['未知', '❓'],
    ] },
  ];

  function timeAgo(at) {
    const d = Math.floor((Date.now() - at) / 60000);
    if (d < 1) return '刚刚';
    if (d < 60) return `${d} 分钟前`;
    const h = Math.floor(d / 60);
    if (h < 24) return `${h} 小时前`;
    return `${Math.floor(h / 24)} 天前`;
  }

  /* 我的状态卡（「我的」页） */
  function renderMyStatusCard(uid) {
    const s = store.status[uid];
    return `<section class="wood-panel sub-panel">
      <div class="panel-head"><h2><span class="wood-tag wood-tag-gold">我的状态</span></h2>
        ${s ? '<button class="text-btn" type="button" data-status-clear>清除</button>' : ''}</div>
      ${s ? `<button class="st-chip" type="button" data-status-open>
          <span class="st-emoji">${esc(s.emoji)}</span>
          <span class="st-txt"><b>${esc(s.label)}</b><small>${esc(s.text || '点一下换个状态')}</small></span>
          <span class="st-time">${timeAgo(s.at)}</span>
        </button>`
      : `<button class="st-chip is-empty" type="button" data-status-open>
          <span class="st-emoji">💭</span>
          <span class="st-txt"><b>还没设状态</b><small>点一下，选个现在的心情</small></span>
        </button>`}
    </section>`;
  }

  /* 对方状态卡（「我们」页） */
  function renderPartnerStatusCard(pid) {
    const s = store.status[pid];
    return `<section class="wood-panel sub-panel">
      <div class="panel-head"><h2><span class="wood-tag">${esc(userById(pid).name)}的状态</span></h2></div>
      ${s ? `<button class="st-chip" type="button" data-status-view="${pid}">
          <span class="st-emoji">${esc(s.emoji)}</span>
          <span class="st-txt"><b>${esc(s.label)}</b><small>${esc(s.text || '没有留言')} · ${timeAgo(s.at)}</small></span>
        </button>`
      : '<p class="task-empty">对方还没设状态。</p>'}
    </section>`;
  }

  function openStatusPicker() {
    const uid = store.currentUser;
    const cur = store.status[uid];
    let sel = cur ? { emoji: cur.emoji, label: cur.label, group: cur.group } : null;
    const s = openSheet({
      title: '设个状态',
      width: 560,
      body: `
        <p class="sheet-text">选一个现在的状态，再写一句话。对方在「我们」页能看到。</p>
        ${STATUS_GROUPS.map((g) => `
          <p class="fg-label">${g.name}</p>
          <div class="st-grid">
            ${g.items.map(([label, emoji]) => `<button class="st-item${sel && sel.label === label ? ' is-on' : ''}"
              type="button" data-st="${g.key}|${label}|${emoji}">${emoji} ${label}</button>`).join('')}
          </div>`).join('')}
        <label class="fg-field" style="margin-top:14px">一句话（可选）
          <input id="stText" type="text" maxlength="40" placeholder="最多 40 字，比如：今晚把报告写完了" value="${esc(cur ? cur.text || '' : '')}"/>
        </label>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>就这样</button>`,
    });
    s.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-st]');
      if (!b) return;
      const [group, label, emoji] = b.dataset.st.split('|');
      sel = { group, label, emoji };
      $$('.st-item', s.el).forEach((x) => x.classList.toggle('is-on', x === b));
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      if (!sel) { toast('先选一个状态'); return; }
      store.status[uid] = { ...sel, text: $('#stText', s.el).value.trim(), at: Date.now() };
      s.close(); renderAll(); toast('状态已更新');
    });
  }

  function renderUsView() {
    const uid = store.currentUser;
    const pid = partnerId();
    const pU = pid ? userById(pid) : null;
    if (!pU) return renderHallPage();
    const rows = (id) => ({
      bal: balanceOf(id), month: monthPoints(id), streak: bestStreak(id), rate: completionRate(id),
      mins: store.checks.filter((c) => c.userId === id && c.status === 'credited' && c.date.slice(0, 7) === todayKey().slice(0, 7))
        .reduce((s, c) => s + c.minutes, 0),
    });
    const a = rows(uid), b = rows(pid);
    const pend = store.verifications.filter((v) => v.userId === pid);
    const pendingChecks = store.checks.filter((c) => c.userId === pid && c.status === 'pending');
    const pendingVerifies = pend.filter((v) => v.status === 'pending');
    // 打卡与验收合并成一份「待我审核」，用标签区分类型
    const reviewItems = [
      ...pendingChecks.map((c) => {
        const g = goalOf(c.goalId);
        return `<div class="goal-mini">
          <span class="ge go-emoji">${g ? (g.emoji || '🌱') : '🌱'}</span>
          <span class="gm"><b>${esc(g ? g.title : '打卡')}</b>
            <small>${esc(userById(c.userId).name)} · 日常打卡 · ${c.date.slice(5)} · ${c.minutes} 分钟 · +${c.points} 分</small></span>
          <span class="chip chip-type">日常</span>
          <span class="chip chip-gold">${reviewLeftText(c)}</span>
          <span class="goal-act"><button class="chip-btn review-btn" type="button" data-review="${c.id}">去审核</button></span>
        </div>`;
      }),
      ...pendingVerifies.map((v) => {
        const g = goalOf(v.goalId);
        return `<div class="goal-mini">
          <span class="ge go-emoji">${g ? g.emoji : '🏁'}</span>
          <span class="gm"><b>${esc(g ? g.title : '目标')}</b>
            <small>${esc(userById(v.userId).name)} · 小目标第 ${v.submitCount} 次提交 · 完成 +${g ? stagePoints(g) : 0} 分</small></span>
          <span class="chip chip-type">小目标</span>
          <span class="goal-act"><button class="chip-btn review-btn" type="button" data-verify="${v.id}">去审核</button></span>
        </div>`;
      }),
    ];
    const reviewTotal = reviewItems.length;
    const timeline = store.ledger.filter((l) => l.userId === uid).slice(-6).reverse();
    const tab = store.usTab || 'compare';
    const pendingTotal = reviewTotal + unreadChatCount(uid);

    const subtabs = `
      <div class="us-subtabs">
        <button class="us-subtab${tab === 'more' ? ' is-on' : ''}" type="button" data-us-tab="more">
          概览${reviewTotal ? `<i class="us-sub-badge">${reviewTotal}</i>` : ''}
        </button>
        <button class="us-subtab${tab === 'compare' ? ' is-on' : ''}" type="button" data-us-tab="compare">
          对比
        </button>
      </div>`;

    const comparePane = `
      <div class="duo-cards">
        <div class="duo-card"><div class="dc-head"><span data-icon="avatar"></span> ${userById(uid).name}</div>
          <dl><dt>可用积分</dt><dd>${fmt(a.bal)}</dd><dt>本月得分</dt><dd>+${fmt(a.month)}</dd><dt>当前连续</dt><dd>${a.streak} 天</dd><dt>完成率</dt><dd>${a.rate}%</dd><dt>时间投入</dt><dd>${a.mins} 分钟</dd></dl></div>
        <div class="duo-card"><div class="dc-head"><span data-icon="avatar"></span> ${pU.name}</div>
          <dl><dt>可用积分</dt><dd>${fmt(b.bal)}</dd><dt>本月得分</dt><dd>+${fmt(b.month)}</dd><dt>当前连续</dt><dd>${b.streak} 天</dd><dt>完成率</dt><dd>${b.rate}%</dd><dt>时间投入</dt><dd>${b.mins} 分钟</dd></dl></div>
      </div>
      ${renderUsageSection(uid, pid)}`;

    const morePane = `
      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">待我审核</span></h2><p>${reviewTotal} 件</p></div>
        ${reviewTotal ? reviewItems.join('') : '<p class="task-empty">没有等你审核的事。</p>'}
      </section>
      ${renderPartnerStatusCard(pid)}
      <section class="wood-panel sub-panel chat-entry-panel">
        <div class="hall-entry-row">
          <span class="hall-entry-ico" data-icon="us"></span>
          <div class="hall-entry-copy"><b>和 ${esc(pU.name)} 说两句</b><small>可以打字，也有常用语</small></div>
          ${unreadChatCount(uid) ? `<span class="chat-unread">${unreadChatCount(uid)}</span>` : ''}
          <button class="text-btn" type="button" data-chat-open>打开 →</button>
        </div>
      </section>
      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">${esc(pU.name)}最近的打卡</span></h2></div>
        <ul class="timeline-list">
          ${store.checks.filter((c) => c.userId === pid).slice(-5).reverse().map((c) => {
            const g = goalOf(c.goalId);
            return `<li><span class="tl-date">${c.date.slice(5)}</span><span class="tl-dot is-partner"></span>
              <span><b>${esc(g ? g.title : '')}</b> ${c.minutes} 分钟 · +${c.points} 分${c.note ? ' · ' + esc(c.note) : ''}</span></li>`;
          }).join('') || '<li class="task-empty">对方还没有打卡记录。</li>'}
        </ul>
      </section>
      ${renderHallEntry()}`;

    return `${head('我们', `第 ${Math.max(1, Math.round((Date.now() - new Date(pairOf(uid).since.replace(/-/g, '/')).getTime()) / 86400000) + 1)} 天`, `一起打卡 ${Math.min(a.streak, b.streak)} 天`)}
      ${subtabs}
      <div class="us-pane">${tab === 'compare' ? comparePane : morePane}</div>`;
  }

  function renderMeView() {
    if (isGuest()) return renderGuestMe();

    const uid = store.currentUser;
    const u = userById(uid);
    const bal = balanceOf(uid);
    const led = store.ledger.filter((l) => l.userId === uid).slice(-8).reverse();
    const typeName = { checkin: '打卡', streak_bonus: '连续奖励', stage_credit: '小目标', checkin_revoke: '撤销', redeem_charge: '兑换', redeem_refund: '退回', opening: '本月累计' };
    const pair = pairOf(uid);
    const incomingReqs = store.pairRequests.filter((q) => q.to === uid);
    const report = store.dailyReports.filter((r) => r.userId === uid).sort((a, b) => b.date.localeCompare(a.date))[0];
    const profile = store.profiles[uid];
    const settings = store.settings[uid] || { aiReport: false, dailyDigest: false };
    const unreadChanges = profile && profile.history ? profile.history.filter((h) => !h.seen).length : 0;
    const diary = store.diary.filter((d) => d.date >= shiftDay(-1));
    return `${head('我的', '', `本月完成 ${monthChecks(uid)} 次 · 连续 ${bestStreak(uid)} 天`)}
      <div class="me-grid">
        <section class="wood-panel sub-panel">
          <div class="panel-head"><h2><span class="wood-tag">账号</span></h2></div>
          ${incomingReqs.length ? incomingReqs.map((q) => `
            <div class="me-row req-row">
              <span class="me-avatar" data-icon="avatar"></span>
              <div class="me-who"><b>${esc(userById(q.from).name)}</b><small>想和你配对</small></div>
              <button class="chip-btn" type="button" data-req-accept="${q.id}">同意</button>
              <button class="text-btn" type="button" data-req-reject="${q.id}">拒绝</button>
            </div>`).join('') : ''}
          <div class="me-row"><span class="me-avatar" data-icon="avatar"></span>
            <div class="me-who"><b>${esc(u.name)}</b><small>当前登录账号</small></div>
            <button class="text-btn" type="button" data-switch>切换账号</button>
            <button class="text-btn" type="button" data-logout>退出登录</button></div>
          <div class="me-row"><span class="me-label">搭档</span><b>${partnerId() ? userById(partnerId()).name : '未配对'}</b>
            ${partnerId() ? `<button class="text-btn" type="button" data-unpair>解除配对</button>` : `<button class="text-btn" type="button" data-pair>用邀请码配对</button>`}</div>
          <div class="me-row invite-row">
            <span class="me-label">我的邀请码</span>
            <button class="invite-toggle" type="button" data-reveal-invite>
              <span class="invite-hint">点击查看</span>
            </button>
          </div>
          <div class="invite-box" id="inviteBox" hidden>
            <div class="invite-code-row">
              <b id="inviteCode">${inviteOf(uid)}</b>
              <button class="chip-btn" type="button" data-copy-invite>复制</button>
            </div>
            <p class="fg-note">这个码是你的，不会变。让对方在「我的」里输入，再点同意就配对了。</p>
          </div>
        </section>
        ${renderMyStatusCard(uid)}
        <section class="wood-panel sub-panel">
          <div class="panel-head"><h2><span class="wood-tag wood-tag-gold">积分系数</span></h2></div>
          <div class="cfg-row"><span>每分钟基础分</span><input type="number" step="0.1" min="0.1" max="2" value="${CFG.unit}" data-cfg="unit"/></div>
          <div class="cfg-row"><span>单次封顶</span><input type="number" step="10" min="10" max="300" value="${CFG.cap}" data-cfg="cap"/></div>
          <p class="fg-note">两人共用一套系数，改完立即生效。</p>
        </section>
      </div>
      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">积分流水</span></h2><p>当前 ${fmt(bal)} 分</p></div>
        <table class="ledger">
          <thead><tr><th>日期</th><th>类型</th><th>说明</th><th class="num">变动</th><th class="num">结余</th></tr></thead>
          <tbody>${led.map((l) => `<tr><td>${l.date.slice(5)}</td><td>${typeName[l.type] || l.type}</td>
            <td>${esc(l.note || '')}</td><td class="num ${l.delta > 0 ? 'is-plus' : 'is-minus'}">${l.delta > 0 ? '+' : ''}${l.delta}</td>
            <td class="num">${fmt(l.balanceAfter)}</td></tr>`).join('')}</tbody>
        </table>
      </section>
      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag wood-tag-gold">昨日小结</span></h2>
          <p>${report ? (report.shared ? '已分享给对方' : '仅自己可见') : '还没生成'}</p></div>
        ${report ? `<p class="report-text">${esc(report.edited || report.text)}</p>
          <div class="ng-actions" style="margin-top:12px">
            <button class="text-btn" type="button" data-report-edit>修改</button>
            <button class="text-btn" type="button" data-report-share>${report.shared ? '取消分享' : '分享给对方'}</button>
          </div>`
        : '<p class="task-empty">每天 23:30 自动生成，也可以点下面手动生成。</p>'}
        <div class="ng-actions" style="margin-top:10px">
          <button class="wood-btn wood-btn-sm" type="button" data-report-gen>生成今天的小结</button>
        </div>
      </section>

      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">我的画像</span></h2>
          ${unreadChanges ? `<p>${unreadChanges} 条变更未读</p>` : '<p>对方可见</p>'}</div>
        ${['basic:基本情况', 'resume:经历', 'skills:技能', 'goal:目标', 'important:对方需要知道的'].map((pair) => {
          const [k, label] = pair.split(':');
          const v = profile && profile.blocks ? profile.blocks[k] || '' : '';
          return `<div class="prof-row"><span class="prof-label">${label}</span>
            <span class="prof-val">${v ? esc(v) : '<i class="prof-empty">还没填</i>'}</span>
            <button class="text-btn" type="button" data-prof="${k}">${v ? '改' : '填'}</button></div>`;
        }).join('')}
        ${(profile && profile.history && profile.history.length) ? `
          <p class="fg-label" style="margin-top:14px">最近变更</p>
          ${profile.history.slice(0, 3).map((h) => `<div class="hist-row">${h.seen ? '' : '<i class="hist-dot"></i>'}${esc(h.summary)}<small>${new Date(h.at).toLocaleDateString('zh-CN')}</small></div>`).join('')}` : ''}
      </section>

      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">设置</span></h2></div>
        <div class="cfg-row"><span>每天生成小结</span><button class="chip-btn${settings.aiReport ? ' is-on' : ''}" type="button" data-set="aiReport">${settings.aiReport ? '开' : '关'}</button></div>
        <div class="cfg-row"><span>打完了汇报给对方</span><button class="chip-btn${settings.dailyDigest ? ' is-on' : ''}" type="button" data-set="dailyDigest">${settings.dailyDigest ? '开' : '关'}</button></div>
        <div class="cfg-row"><span>改用户名 / 改密码</span><button class="text-btn" type="button" data-account>去改</button></div>
      </section>

      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">数据备份</span></h2><p>${store.backups.length} 份快照</p></div>
        <p class="fg-note">把两个人的目标、打卡、积分都存一份，换设备时可以导回来。</p>
        <div class="ng-actions" style="margin-top:12px">
          <button class="wood-btn wood-btn-sm" type="button" data-backup>立即备份</button>
          <button class="text-btn" type="button" data-export>导出文件</button>
        </div>
        ${store.backups.length ? `<p class="fg-label" style="margin-top:12px">最近备份</p>
          ${store.backups.slice(-3).reverse().map((b) => `<div class="hist-row">${new Date(b.at).toLocaleString('zh-CN')}<small>${(b.size / 1024).toFixed(1)} KB</small></div>`).join('')}` : ''}
      </section>

      <section class="wood-panel sub-panel">
        <div class="panel-head"><h2><span class="wood-tag">昨天的话</span></h2><p>${diary.length} 条</p></div>
        ${diary.length ? diary.map((d) => `<div class="diary-row"><b>${userById(d.from).name}</b><p>${esc(d.text)}</p></div>`).join('') : '<p class="task-empty">昨天没留下什么。</p>'}
        <label class="fg-field" style="margin-top:12px">留一句给明天
          <input id="diaryInput" type="text" maxlength="80" placeholder="明天想怎么过"/>
        </label>
        <div class="ng-actions" style="margin-top:10px"><button class="wood-btn wood-btn-sm" type="button" data-diary>记下来</button></div>
      </section>`;
  }



  /* ── 我的页：日报 / 画像 / 账号 ─────────────────────── */
  function genDailyReport() {
    const uid = store.currentUser;
    const today = todayKey();
    const mine = store.goals.filter((g) => g.ownerId === uid && g.type === 'daily' && g.status === 'active');
    const done = mine.filter((g) => checkOf(g.id, uid, today)).length;
    const pts = store.ledger.filter((l) => l.userId === uid && l.date === today && l.delta > 0).reduce((s, l) => s + l.delta, 0);
    const streak = Math.max(0, ...mine.map((g) => streakOf(g.id, uid)));
    const text = `今天完成了 ${done} 个目标，拿到 ${pts} 分，最长连续 ${streak} 天。` +
      (done < mine.length ? `还有 ${mine.length - done} 个没做完，明天补上。` : '今天的都做完了，保持住。');
    const exist = store.dailyReports.find((r) => r.userId === uid && r.date === today);
    if (exist) { exist.text = text; exist.edited = ''; }
    else store.dailyReports.push({ date: today, userId: uid, text, shared: false, edited: '' });
    renderView('data'); toast('今天的小结生成好了');
  }

  function openReportEdit() {
    const uid = store.currentUser;
    const r = store.dailyReports.filter((x) => x.userId === uid).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!r) return;
    const s = openSheet({
      title: '修改小结', width: 480,
      body: `<textarea id="repText" class="fg-input" rows="5" maxlength="300">${esc(r.edited || r.text)}</textarea>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>保存</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      r.edited = $('#repText', s.el).value.trim();
      s.close(); renderView('data'); toast('已保存');
    });
  }

  function openProfileEdit(key) {
    const uid = store.currentUser;
    store.profiles[uid] = store.profiles[uid] || { blocks: {}, history: [] };
    const p = store.profiles[uid];
    p.blocks = p.blocks || {};
    const label = { basic: '基本情况', resume: '经历', skills: '技能', goal: '目标', important: '对方需要知道的' }[key] || key;
    const s = openSheet({
      title: `填写${label}`, width: 480,
      body: `<textarea id="profText" class="fg-input" rows="4" maxlength="300" placeholder="写给对方看的">${esc(p.blocks[key] || '')}</textarea>
        <p class="fg-note">这部分对方能看见，改动会记进变更历史。</p>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>保存</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      const v = $('#profText', s.el).value.trim();
      const before = p.blocks[key] || '';
      if (v !== before) {
        p.blocks[key] = v;
        p.history = p.history || [];
        p.history.unshift({ at: Date.now(), summary: `${before ? '修改' : '新增'}「${label}」`, seen: false });
      }
      s.close(); renderView('data'); toast('已保存');
    });
  }

  function openAccountEdit() {
    const uid = store.currentUser;
    const acc = userById(uid);
    const s = openSheet({
      title: '账号设置', width: 460,
      body: `
        <label class="fg-field">用户名
          <input id="acName" type="text" maxlength="20" value="${esc(acc.name)}"/>
        </label>
        <label class="fg-field">新密码（不改就留空）
          <input id="acPwd" type="password" maxlength="32" placeholder="至少 6 位"/>
        </label>
        <label class="fg-field">确认新密码
          <input id="acPwd2" type="password" maxlength="32" placeholder="再输一次"/>
        </label>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>保存</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      const name = $('#acName', s.el).value.trim();
      const pwd = $('#acPwd', s.el).value;
      const pwd2 = $('#acPwd2', s.el).value;
      if (!name) { toast('用户名不能为空'); return; }
      if (name !== acc.name && store.accounts.some((a) => a.name === name)) { toast('这个用户名有人用了'); return; }
      if (pwd) {
        if (pwd.length < 6) { toast('密码至少 6 位'); return; }
        if (pwd !== pwd2) { toast('两次密码不一样'); return; }
        acc.pwd = pwd;
      }
      acc.name = name;
      s.close(); renderAll(); toast('已保存');
    });
  }

  /* 访客版「我的」：账号与配对的入口都在这一页 */
  function renderGuestMe() {
    return `${head('我的', '', '还没登录')}
      <section class="guest-guide guest-guide-page">
        <div class="guest-guide-main">
          <span class="guest-guide-ico" data-icon="paw" aria-hidden="true"></span>
          <div class="guest-guide-copy">
            <b>先逛逛，觉得有用再注册</b>
            <p>这里是两个人一起打卡、攒积分、换愿望的地方。现在看到的是空的样子，注册后就能开始记。</p>
          </div>
        </div>
        <div class="guest-guide-actions">
          <button class="wood-btn" type="button" data-open-register>
            <span class="btn-ico" data-icon="plus" data-icon-kind="mono" aria-hidden="true"></span>建个账号
          </button>
          <button class="text-btn" type="button" data-open-login>已有账号，登录 →</button>
        </div>
      </section>

      <div class="me-grid">
        <section class="wood-panel sub-panel">
          <div class="panel-head"><h2><span class="wood-tag">已经有搭档了？</span></h2></div>
          <p class="fg-note">对方已经建好账号的话，用 ta 的邀请码就能配对。</p>
          <div class="ng-actions" style="margin-top:12px">
            <button class="wood-btn wood-btn-sm" type="button" data-open-join>用邀请码加入</button>
          </div>
        </section>
        <section class="wood-panel sub-panel">
          <div class="panel-head"><h2><span class="wood-tag">还没有搭档？</span></h2></div>
          <p class="fg-note">两个人都先注册，然后一个人把邀请码发给另一个人，对方输入后你点同意，就配对了。</p>
          <div class="ng-actions" style="margin-top:12px">
            <button class="wood-btn wood-btn-sm" type="button" data-open-register>先建账号</button>
          </div>
        </section>
      </div>`;
  }


  /* ═══════════════════════════════════════════════════════
     浇水田垄加载动画（移植自小组项目 watering-progress-bar）
     用法：waterLoaderHtml() 拿 HTML，mountWaterLoader(el) 启动
     ═══════════════════════════════════════════════════════ */
  function waterLoaderHtml(text) {
    const cells = Array.from({ length: 12 }, () => `
      <span class="wl-cell">
        <span class="wl-plant"><i class="st"></i><i class="lf l"></i><i class="lf r"></i><i class="fr"></i></span>
        <span class="wl-drop"></span><span class="wl-soil"></span>
      </span>`).join('');
    return `<div class="water-loader">
      <div class="wl-head">
        <div class="wl-text">${esc(text || '加载中')}<span class="wl-dots"><i>.</i><i>.</i><i>.</i></span></div>
        <div class="wl-pct" data-wl-pct>00%</div>
      </div>
      <div class="wl-bar" data-wl-bar role="progressbar" aria-label="加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${cells}</div>
      <div class="wl-legend"><span>刚种下</span><span>浇水中</span><span>成熟了</span></div>
    </div>`;
  }

  const clamp01 = (v, a, b) => Math.min(b, Math.max(a, v));

  /* 把一个进度值映射到 12 格田垄上 */
  function paintWaterLoader(root, t) {
    const pctEl = root.querySelector('[data-wl-pct]');
    const barEl = root.querySelector('[data-wl-bar]');
    const cells = root.querySelectorAll('.wl-cell');
    if (!cells.length) return;
    const pct = Math.floor(t * 100);
    if (pctEl) pctEl.textContent = (pct < 10 ? '0' : '') + pct + '%';
    if (barEl) barEl.setAttribute('aria-valuenow', String(pct));
    cells.forEach((el, i) => {
      const g = clamp01(t * 12 - i, 0, 1);
      el.style.setProperty('--g', g.toFixed(3));
      el.classList.toggle('sprouted', g > 0.04);
      el.classList.toggle('active', g > 0.04 && g <= 0.6);
      el.classList.toggle('done', g > 0.6);
      el.classList.toggle('mature', g > 0.84);
    });
  }

  /* 启动循环：progress 为 0~1 时循环演示；返回停止函数 */
  function mountWaterLoader(root, durationMs = 1600) {
    if (!root) return () => {};
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { paintWaterLoader(root, 0.6); return () => {}; }
    const t0 = Date.now();
    let raf = 0;
    const loop = () => {
      paintWaterLoader(root, ((Date.now() - t0) % durationMs) / durationMs);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }

  function renderView(name) {
    const map = { goals: renderGoalsView, wish: renderWishView, us: renderUsView, data: renderMeView };
    if (!map[name]) return;
    mount.innerHTML = `<section class="view is-active">${map[name]()}</section>`;
    paintIcons(mount);
  }
  /* ═══════════════════════════════════════════════════════
     事件与启动
     ═══════════════════════════════════════════════════════ */
  const titles = { today: '今日', goals: '目标', wish: '愿望单', us: '我们', data: '我的' };
  const tabs = $$('.tab');
  const ink = $('#tabInk');
  const mount = $('#viewMount');

  /* 滑块用 transform 位移；几何缓存一次，切换时不再反复读 offsetLeft 触发强制重排 */
  const tabMetrics = new Map();
  function measureTabs() {
    tabMetrics.clear();
    tabs.forEach((b) => tabMetrics.set(b, { left: b.offsetLeft, width: b.offsetWidth }));
  }
  function positionInk(tab, animate = true) {
    if (!tab) return;
    if (!tabMetrics.size) measureTabs();
    const m = tabMetrics.get(tab) || { left: tab.offsetLeft, width: tab.offsetWidth };
    if (!animate) ink.classList.add('no-anim');
    ink.style.width = `${m.width}px`;
    ink.style.transform = `translateX(${m.left}px)`;
    if (!animate) { void ink.offsetWidth; ink.classList.remove('no-anim'); }
  }
  const activeTab = () => $('.tab.is-active');

  function switchView(name) {
    if (!titles[name]) return;

    // tab 高亮立刻响应，滑块动画不等人
    document.body.dataset.view = name;
    tabs.forEach((b) => {
      const on = b.dataset.view === name;
      b.classList.toggle('is-active', on);
      if (on) { b.setAttribute('aria-current', 'page'); positionInk(b); }
      else b.removeAttribute('aria-current');
    });

    if (window.scrollY > 0) window.scrollTo(0, 0);

    // 直接渲染内容，只靠内容自身的错开进场表达「换了一页」
    if (name === 'today') mount.innerHTML = '';
    else renderView(name);
    growBars(document.querySelector('.main'));
  }

  /* 今日清单：点打卡 */
  $('#myTasks').addEventListener('click', (e) => {
    const stamp = e.target.closest('.done-stamp');
    const row = e.target.closest('.task-row');
    if (stamp && row) {
      const c = checkOf(row.dataset.goal, store.currentUser, todayKey());
      if (c) openSheet({
        title: '这次打卡',
        width: 420,
        body: `<div class="ck-goal"><span class="ck-emoji">${goalOf(c.goalId).emoji || '🌱'}</span>
          <div><b>${esc(goalOf(c.goalId).title)}</b><small>${c.minutes} 分钟 · +${c.points} 分 · ${new Date(c.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></div></div>
          <p class="sheet-text">24 小时内可以自己撤销；超过就只能请对方驳回。</p>`,
        actions: `<button class="text-btn" type="button" data-cancel>关闭</button><button class="wood-btn wood-btn-danger" type="button" data-revoke>撤销这次打卡</button>`,
      });
      const s = sheetStack[sheetStack.length - 1];
      $('[data-cancel]', s.el).addEventListener('click', () => s.close());
      $('[data-revoke]', s.el).addEventListener('click', () => { s.close(); revokeCheck(c.id); });
      return;
    }
    if (e.target.closest('.wait-tag')) { toast('这件事要对方自己打卡'); return; }
    const reviewBtn = e.target.closest('[data-review]');
    if (reviewBtn) { openCheckReview(reviewBtn.dataset.review); return; }
    if (e.target.closest('.pending-tag')) { toast('已提交，等对方审核；想改可以点这里撤回'); return; }
    const btn = e.target.closest('.check-btn');
    if (btn) openCheckin(btn.dataset.check);
  });

  $('#partnerTasks').addEventListener('click', (e) => {
    const reviewBtn = e.target.closest('[data-review]');
    if (reviewBtn) { openCheckReview(reviewBtn.dataset.review); return; }
    const btn = e.target.closest('.check-btn');
    if (btn) { toast('不能替对方打卡'); return; }
    if (e.target.closest('.done-stamp')) toast('这次已经通过了');
    if (e.target.closest('.pending-tag')) toast('等对方自己撤回或改');
  });

  /* 长按秒打卡 */
  let pressTimer = null;
  $('#myTasks').addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.check-btn');
    if (!btn) return;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      btn.classList.add('is-holding');
      openCheckin(btn.dataset.check, true);
    }, 550);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
    $('#myTasks').addEventListener(ev, () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      $$('.check-btn.is-holding').forEach((b) => b.classList.remove('is-holding'));
    }));

  /* 视图内事件委托 */
  mount.addEventListener('click', (e) => {
    const t = e.target;
    const usTabBtn = t.closest('[data-us-tab]');
    if (usTabBtn) { store.usTab = usTabBtn.dataset.usTab; renderView('us'); return; }
    if (t.closest('[data-chat-open]')) { openChat(); return; }

    // ── 状态 ──
    if (t.closest('[data-status-open]')) { openStatusPicker(); return; }
    if (t.closest('[data-status-clear]')) {
      delete store.status[store.currentUser];
      renderView('data'); toast('状态已清除'); return;
    }
    if (t.closest('[data-status-view]')) {
      const pid = t.closest('[data-status-view]').dataset.statusView;
      const st = store.status[pid];
      if (st) {
        openSheet({
          title: `${userById(pid).name}的状态`, width: 420,
          body: `<div class="st-view"><span class="st-emoji big">${esc(st.emoji)}</span>
            <div><b>${esc(st.label)}</b><p>${esc(st.text || '没有留言')}</p>
            <small>${timeAgo(st.at)}</small></div></div>`,
          actions: `<button class="text-btn" type="button" data-cancel>关闭</button>
            <button class="wood-btn" type="button" data-ok>我也设一个</button>`,
        });
        const so = sheetStack[sheetStack.length - 1];
        $('[data-cancel]', so.el).addEventListener('click', () => so.close());
        $('[data-ok]', so.el).addEventListener('click', () => { so.close(); openStatusPicker(); });
      }
      return;
    }

    // ── 匹配大厅 ──
    if (t.closest('[data-hall-edit]')) { openHallEdit(); return; }
    if (t.closest('[data-hall-open]')) { openHallModal(); return; }
    const hi = t.closest('[data-hall-invite]');
    if (hi) {
      const lid = hi.dataset.hallInvite;
      if (!store.currentUser) { needAccount('邀请要先登录'); return; }
      store.hall.invites.push({ id: nid('H'), from: store.currentUser, to: lid, status: 'pending' });
      renderView('us');
      toast('已发出邀请，等对方回应');
      return;
    }
    const ha = t.closest('[data-hall-accept]');
    if (ha) {
      const inv = store.hall.invites.find((x) => x.id === ha.dataset.hallAccept);
      if (inv) {
        store.pairs = [{ id: nid('P'), a: inv.from, b: inv.to, since: todayKey(), code: '' }];
        store.hall.invites = store.hall.invites.filter((x) => x.id !== inv.id);
        renderAll(); toast('配对成功');
      }
      return;
    }
    const hd = t.closest('[data-hall-decline]');
    if (hd) {
      store.hall.invites = store.hall.invites.filter((x) => x.id !== hd.dataset.hallDecline);
      renderView('us'); toast('已拒绝'); return;
    }
    const hc = t.closest('[data-hall-cancel]');
    if (hc) {
      store.hall.invites = store.hall.invites.filter((x) => x.id !== hc.dataset.hallCancel);
      renderView('us'); toast('已撤回邀请'); return;
    }

    // ── 日历 ──
    const prevBtn = t.closest('[data-cal-prev]');
    if (prevBtn) { shiftMonth(-1); return; }
    const nextBtn = t.closest('[data-cal-next]');
    if (nextBtn) { shiftMonth(1); return; }
    if (t.closest('[data-cal-today]')) {
      store.calCursor = todayKey().slice(0, 7);
      store.selDay = todayKey();
      renderView('goals'); return;
    }
    const dayBtn = t.closest('[data-cal-day]');
    if (dayBtn) {
      store.selDay = dayBtn.dataset.calDay;
      store.calCursor = store.selDay.slice(0, 7);
      renderView('goals'); return;
    }

    // ── 大目标 ──
    if (t.closest('[data-chain-add]')) { openChainAdd(t.closest('[data-chain-add]').dataset.chainAdd); return; }
    const delBtn = t.closest('[data-chain-del]');
    if (delBtn) {
      const [bid, idx] = delBtn.dataset.chainDel.split(':');
      const b = store.biggoals.find((x) => String(x.id) === String(bid));
      if (b) { b.chain.splice(Number(idx), 1); renderView('goals'); toast('已移出路线'); }
      return;
    }
    const bigOpen = t.closest('[data-big-open]');
    if (bigOpen) { openBigDetail(bigOpen.dataset.bigOpen); return; }
    const zoowyBtn = t.closest('[data-zoowy]');
    if (zoowyBtn) { openZoowy(zoowyBtn.dataset.zoowy); return; }
    const shiftBtn = t.closest('[data-big-shift]');
    if (shiftBtn) { openBigShift(shiftBtn.dataset.bigShift); return; }
    if (t.closest('[data-new-biggoal]') || t.closest('[data-edit-biggoal]')) {
      toast('大目标编辑还没做'); return;
    }

    const mkBtn = t.closest('[data-makeup]');
    if (mkBtn) {
      const [gid, date] = mkBtn.dataset.makeup.split(':');
      openMakeup(gid, date); return;
    }
    if (t.closest('[data-new-goal]')) { openGoalForm(null, t.closest('[data-new-goal]').dataset.newGoal); return; }
    if (t.closest('[data-edit]')) { openGoalForm(t.closest('[data-edit]').dataset.edit); return; }
    if (t.closest('[data-check]')) { openCheckin(t.closest('[data-check]').dataset.check); return; }
    if (t.closest('[data-submit]')) { openSubmitVerify(t.closest('[data-submit]').dataset.submit); return; }
    if (t.closest('[data-verify]')) { openVerifyDecision(t.closest('[data-verify]').dataset.verify); return; }
    const reviewBtn = t.closest('[data-review]');
    if (reviewBtn) { openCheckReview(reviewBtn.dataset.review); return; }
    if (t.closest('[data-new-wish]')) { openWishForm(null); return; }
    if (t.closest('[data-redeem]')) return; // 兑换走长按，见 bindHoldToRedeem
    const rc = t.closest('[data-red-cancel]');
    if (rc) {
      const r = store.redemptions.find((x) => x.id === rc.dataset.redCancel);
      if (!r) return;
      if (Date.now() - r.appliedAt > 2 * 3600000) { toast('超过 2 小时，不能撤回了'); return; }
      r.status = 'cancelled';
      ledgerAdd(r.userId, r.points, 'redeem_refund', `撤回兑换 · ${r.title}`, r.wishId);
      renderAll(); toast('已撤回，积分退回'); return;
    }
    const rd = t.closest('[data-red-done]');
    if (rd) {
      const r = store.redemptions.find((x) => x.id === rd.dataset.redDone);
      if (r) { r.status = 'done'; renderAll(); toast('已标记为收到'); }
      return;
    }
    if (t.closest('[data-reveal-invite]')) {
      const box = $('#inviteBox');
      const btn = t.closest('[data-reveal-invite]');
      if (box && btn) {
        box.hidden = !box.hidden;
        btn.querySelector('.invite-hint').textContent = box.hidden ? '点击查看' : '收起';
      }
      return;
    }
    if (t.closest('[data-copy-invite]')) {
      const code = inviteOf(store.currentUser);
      const done = () => toast(`已复制：${code}`);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(() => {
          toast(`邀请码是 ${code}，手动复制一下`);
        });
      } else {
        toast(`邀请码是 ${code}`);
      }
      return;
    }

    const sw = t.closest('[data-switch]');
    if (sw) { switchAccount(); return; }
    if (t.closest('[data-logout]')) { logout(); return; }
    const acc = t.closest('[data-req-accept]');
    if (acc) {
      const q = store.pairRequests.find((x) => x.id === acc.dataset.reqAccept);
      if (q) {
        const meId = store.currentUser;
        if (pairOf(meId)) { toast('你已经配对过了，先解除'); return; }
        store.pairs = [{ id: nid('P'), a: q.from, b: meId, since: todayKey(), code: inviteOf(q.from) }];
        store.pairRequests = store.pairRequests.filter((x) => x.id !== q.id);
        renderAll();
        toast(`已和 ${userById(q.from).name} 配对成功`);
      }
      return;
    }
    const rej = t.closest('[data-req-reject]');
    if (rej) {
      store.pairRequests = store.pairRequests.filter((x) => x.id !== rej.dataset.reqReject);
      renderAll();
      toast('已拒绝这次申请');
      return;
    }
    const up = t.closest('[data-unpair]');
    if (up) {
      confirmSheet({ title: '解除配对', danger: true, confirmText: '解除', text: '解除后双方互相看不见，历史记录保留。' })
        .then((yes) => { if (yes) { store.pairs = []; renderAll(); toast('已解除配对'); } });
      return;
    }
    const pr = t.closest('[data-pair]');
    if (pr) {
      const s = openSheet({
        title: '配对', width: 420,
        body: `<p class="sheet-text">输入对方的邀请码，对方同意后就绑定了。</p>
          <input id="pairCode" class="fg-input" type="text" placeholder="FOOT-XXXX"/>`,
        actions: `<button class="text-btn" type="button" data-cancel>取消</button><button class="wood-btn" type="button" data-ok>配对</button>`,
      });
      $('[data-cancel]', s.el).addEventListener('click', () => s.close());
      $('[data-ok]', s.el).addEventListener('click', () => {
        const code = $('#pairCode', s.el).value.trim().toUpperCase();
        const target = store.accounts.find((a) => a.invite === code);
        if (!target) { toast('没找到这个邀请码，确认一下是不是输错了'); return; }
        if (target.id === store.currentUser) { toast('这是你自己的邀请码'); return; }
        // 先发申请，由对方确认，不直接绑定
        if (store.pairRequests.some((q) => q.from === store.currentUser && q.to === target.id)) {
          toast('已经发过申请了，等对方确认'); return;
        }
        store.pairRequests.push({ id: nid('Q'), from: store.currentUser, to: target.id, at: Date.now() });
        s.close(); renderAll();
        toast(`已向 ${target.name} 发送申请，等对方确认`);
      });
      return;
    }
    // ── 日报 ──
    if (t.closest('[data-report-gen]')) { genDailyReport(); return; }
    if (t.closest('[data-report-share]')) {
      const uid = store.currentUser;
      const r = store.dailyReports.filter((x) => x.userId === uid).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (r) { r.shared = !r.shared; renderView('data'); toast(r.shared ? '已分享给对方' : '已取消分享'); }
      return;
    }
    if (t.closest('[data-report-edit]')) { openReportEdit(); return; }

    // ── 画像 ──
    const profBtn = t.closest('[data-prof]');
    if (profBtn) { openProfileEdit(profBtn.dataset.prof); return; }

    // ── 设置 ──
    const setBtn = t.closest('[data-set]');
    if (setBtn) {
      const uid = store.currentUser;
      store.settings[uid] = store.settings[uid] || { aiReport: false, dailyDigest: false };
      const k = setBtn.dataset.set;
      store.settings[uid][k] = !store.settings[uid][k];
      renderView('data'); return;
    }
    if (t.closest('[data-account]')) { openAccountEdit(); return; }

    // ── 备份 ──
    if (t.closest('[data-backup]')) {
      const payload = JSON.stringify({ goals: store.goals, checks: store.checks, ledger: store.ledger });
      store.backups.push({ at: Date.now(), size: payload.length });
      renderView('data'); toast('已备份一份快照');
      return;
    }
    if (t.closest('[data-export]')) {
      const data = JSON.stringify({ goals: store.goals, checks: store.checks, ledger: store.ledger, wishes: store.wishes }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `footprint-${todayKey()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('已导出数据文件');
      return;
    }

    if (t.closest('[data-diary]')) {
      const v = $('#diaryInput').value.trim();
      if (!v) { toast('写点什么再记'); return; }
      store.diary.push({ date: todayKey(), from: store.currentUser, text: v });
      renderView('data'); toast('记下了');
    }
  });

  mount.addEventListener('input', (e) => {
    const cfg = e.target.closest('[data-cfg]');
    if (!cfg) return;
    const v = Number(cfg.value);
    if (!Number.isFinite(v) || v <= 0) return;
    CFG[cfg.dataset.cfg] = v;
  });

  $('#verifyGo').addEventListener('click', () => switchView('us'));

  /* 访客引导卡 */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-register]')) { openAuth('register'); return; }
    if (e.target.closest('[data-open-join]')) { openJoinByCode(); return; }
    if (e.target.closest('[data-open-login]')) { openAuth('login'); return; }
  });

  /* 用邀请码加入：申请 → 对方同意 */
  function openJoinByCode() {
    const s = openSheet({
      title: '用邀请码加入',
      width: 440,
      body: `<p class="sheet-text">让对方把「我的」页里的邀请码发给你，输入后我们会通知对方确认。</p>
        <label class="fg-field">邀请码
          <input id="joinCode" type="text" maxlength="12" placeholder="FOOT-XXXX" style="text-transform:uppercase"/>
        </label>`,
      actions: `<button class="text-btn" type="button" data-cancel>取消</button>
        <button class="wood-btn" type="button" data-ok>发送申请</button>`,
    });
    $('[data-cancel]', s.el).addEventListener('click', () => s.close());
    $('[data-ok]', s.el).addEventListener('click', () => {
      const code = ($('#joinCode', s.el).value || '').trim().toUpperCase();
      if (!/^FOOT-[A-Z0-9]{4}$/.test(code)) { toast('邀请码格式是 FOOT-XXXX'); return; }
      const target = store.accounts.find((a) => a.invite === code);
      if (!target) { toast('没找到这个邀请码，确认一下是不是输错了'); return; }
      if (target.id === store.currentUser) { toast('这是你自己的邀请码'); return; }
      // 已存在或已有申请时拦截
      if (pairOf(store.currentUser)) { toast('你已经配对过了，先解除才能重新配对'); return; }
      if (store.pairRequests.some((q) => q.from === store.currentUser && q.to === target.id)) {
        toast('已经发过申请了，等对方确认'); return;
      }
      store.pairRequests.push({ id: nid('Q'), from: store.currentUser, to: target.id, at: Date.now() });
      s.close();
      renderAll();
      const r = openSheet({
        title: '已发送申请',
        width: 420,
        body: `<p class="sheet-text">已经告诉${esc(target.name)}了。对方在「我的」里点同意，你们就配对成功。</p>
          <p class="guest-tip">演示：切换到 ${esc(target.name)} 的账号，就能在「我的」看到这条申请。</p>`,
        actions: `<button class="wood-btn" type="button" data-ok>知道了</button>`,
      });
      $('[data-ok]', r.el).addEventListener('click', () => r.close());
    });
  }
  $('#bellBtn').addEventListener('click', () => {
    const list = notices();
    const s = openSheet({
      title: '提醒', width: 440,
      body: `<ul class="notice-list">${list.map((n) => `<li class="notice-${n.tone}"><i></i>${esc(n.text)}</li>`).join('')}</ul>`,
      actions: `<button class="wood-btn" type="button" data-ok>知道了</button>`,
    });
    $('[data-ok]', s.el).addEventListener('click', () => s.close());
  });
  tabs.forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) switchView(go.dataset.goto);
  });
  window.addEventListener('resize', () => { measureTabs(); positionInk(activeTab(), false); });

  function switchAccount() {
    // 演示用：直接切到对方视角，不要求重新输密码
    store.currentUser = store.currentUser === 'u1' ? 'u2' : 'u1';
    renderAll();
    toast(`已切换到 ${me().name} 的视角`);
  }

  /* ═══════════════════════════════════════════════════════
     长按兑换：按住 1 秒填满即成功，松手立即归零不触发
     ═══════════════════════════════════════════════════════ */
  const HOLD_MS = 1000;
  let holdTimer = null;
  let holdEl = null;

  function cancelHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (holdEl) { holdEl.classList.remove('is-holding'); holdEl = null; }
  }

  function startHold(btn) {
    if (!btn || btn.disabled || btn.classList.contains('is-done')) return;
    cancelHold();
    holdEl = btn;
    // 先强制一次样式计算，保证填充条从 0 开始过渡
    void btn.offsetWidth;
    btn.classList.add('is-holding');
    holdTimer = setTimeout(() => {
      const id = btn.dataset.redeem;
      btn.classList.remove('is-holding');
      btn.classList.add('is-done');
      btn.querySelector('.hold-label').textContent = '兑换成功';
      holdEl = null; holdTimer = null;
      doRedeem(id);
      setTimeout(() => {
        btn.classList.remove('is-done');
        const w = store.wishes.find((x) => String(x.id) === String(id));
        if (w) {
          const st = wishState(w);
          btn.querySelector('.hold-label').textContent = st.ok ? '按住兑换' : st.label;
          btn.disabled = !st.ok;
        }
      }, 900);
    }, HOLD_MS);
  }

  // 委托：按下开始，抬起/离开/取消都回零
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-redeem]');
    if (btn) { e.preventDefault(); startHold(btn); }
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
    document.addEventListener(ev, () => { if (holdEl) cancelHold(); }));
  // 键盘：按住空格/回车同样生效
  document.addEventListener('keydown', (e) => {
    const btn = e.target.closest && e.target.closest('[data-redeem]');
    if (btn && (e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(btn); }
  });
  document.addEventListener('keyup', (e) => {
    if (holdEl && (e.key === ' ' || e.key === 'Enter')) cancelHold();
  });

  /* 兑换执行（原弹层逻辑抽出来，供长按调用） */
  function doRedeem(wid) {
    const w = store.wishes.find((x) => x.id === wid);
    if (!w) return;
    const uid = store.currentUser;
    const st = wishState(w);
    if (!st.ok) { toast(st.label); renderAll(); return; }
    const needsConfirm = w.kind === 'event' && w.needConfirm;
    const r = {
      id: nid('R'), wishId: w.id, userId: uid, title: w.title, points: w.pointsCost,
      status: needsConfirm ? 'applied' : 'confirmed',
      appliedAt: Date.now(), note: '', kind: w.kind,
    };
    store.redemptions.push(r);
    if (!needsConfirm) ledgerAdd(uid, -w.pointsCost, 'redeem_charge', `兑换 · ${w.title}`, w.id);
    renderAll();
    toast(needsConfirm ? '已提交申请，等对方确认' : `兑换成功，-${fmt(w.pointsCost)} 分`,
      needsConfirm ? null : {
        undo: () => {
          if (Date.now() - r.appliedAt > 2 * 3600000) { toast('超过 2 小时，不能撤回了'); return; }
          r.status = 'cancelled';
          ledgerAdd(uid, w.pointsCost, 'redeem_refund', `撤回兑换 · ${w.title}`, w.id);
          renderAll(); toast('已撤回，积分退回');
        },
      });
  }

  /* ═══════════════════════════════════════════════════════
     进度条首次生长：进入视图时从 0 长到目标宽度
     ═══════════════════════════════════════════════════════ */
  function growBars(root) {
    const bars = (root || document).querySelectorAll('.rate-fill, .ruler span, .wish-bar span, .wish-card .wc-bar i');
    bars.forEach((bar, i) => {
      const target = bar.style.width || getComputedStyle(bar).width;
      if (!bar.style.width) return;
      bar.classList.add('bar-grow');
      setTimeout(() => {
        bar.classList.remove('bar-grow');
        bar.style.width = target;
      }, 40 + i * 60);
    });
  }


  /* ═══════════════════════════════════════════════════════
     登录 / 注册
     ═══════════════════════════════════════════════════════ */
  function renderAuth(mode) {
    const isLogin = mode !== 'register';
    const canClose = !store.loggedIn;   // 访客可以关掉浮层继续逛
    const html = `
      <div class="auth-wrap">
        <div class="auth-card wood-panel">
          <div class="auth-brand">
            <span class="brand-mark auth-mark" data-icon="paw" aria-hidden="true"></span>
            <div class="auth-brand-text">
              <b>脚印</b>
              <small>两个人一起坚持的地方</small>
            </div>
          </div>

          <div class="auth-tabs">
            <button class="auth-tab${isLogin ? ' is-on' : ''}" type="button" data-mode="login">登录</button>
            <button class="auth-tab${isLogin ? '' : ' is-on'}" type="button" data-mode="register">注册</button>
          </div>

          <form class="auth-form" id="authForm" novalidate>
            <label class="auth-field">昵称
              <input id="authName" type="text" autocomplete="username"
                maxlength="20" placeholder="比如：栗子" value="${isLogin ? '' : ''}"/>
            </label>

            <label class="auth-field">密码
              <input id="authPwd" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}"
                maxlength="32" placeholder="${isLogin ? '输入密码' : '至少 6 位'}"/>
            </label>

            ${isLogin ? '' : `
            <label class="auth-field">再输一次
              <input id="authPwd2" type="password" autocomplete="new-password" maxlength="32" placeholder="确认密码"/>
            </label>
            <div class="auth-avatars">
              <span class="auth-avatars-label">选个头像</span>
              <div class="auth-avatar-row" id="authAvatars">
                ${['🐱', '🐻', '🐰', '🦊', '🐼', '🐨'].map((e, i) => `<button class="auth-avatar${i === 0 ? ' is-on' : ''}" type="button" data-avatar="${e}">${e}</button>`).join('')}
              </div>
            </div>`}

            <p class="auth-err" id="authErr" hidden></p>

            <button class="wood-btn auth-submit" type="submit">
              <span class="btn-ico" data-icon="${isLogin ? 'check' : 'plus'}" data-icon-kind="mono" aria-hidden="true"></span>
              ${isLogin ? '登录' : '创建账号'}
            </button>
          </form>

          ${isLogin ? `
          <div class="auth-demo">
            <span>演示账号，点一下直接进</span>
            <div class="auth-demo-row">
              <button class="auth-demo-btn" type="button" data-demo="u1"><span data-icon="avatar"></span>栗子</button>
              <button class="auth-demo-btn" type="button" data-demo="u2"><span data-icon="avatar"></span>阿白</button>
            </div>
            <p class="auth-demo-note">两个人的数据是通的，换个账号就能看到对方的待办和验收。</p>
          </div>` : `
          <p class="auth-note">注册后会给你一个邀请码，让对方输入就能配对。</p>`}
        </div>
      </div>`;

    const layer = $('#authLayer');
    layer.innerHTML = html;
    layer.hidden = false;
    layer.classList.add('is-open');
    paintIcons(layer);

    // 访客可以点遮罩或按 ESC 关掉，继续浏览
    layer.onclick = (e) => { if (e.target === layer && canClose) closeAuth(); };

    let avatar = '🐱';

    layer.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-mode]');
      if (tab) { renderAuth(tab.dataset.mode); return; }
      const av = e.target.closest('[data-avatar]');
      if (av) {
        avatar = av.dataset.avatar;
        layer.querySelectorAll('.auth-avatar').forEach((b) => b.classList.toggle('is-on', b === av));
        return;
      }
      const demo = e.target.closest('[data-demo]');
      if (demo) { loginAs(demo.dataset.demo); return; }
    });

    const form = $('#authForm', layer);
    const err = $('#authErr', layer);
    const showErr = (msg, field) => {
      err.hidden = false; err.textContent = msg;
      if (field) { const el = $(field, layer); if (el) el.focus(); }
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const name = $('#authName', layer).value.trim();
      const pwd = $('#authPwd', layer).value;

      if (!name) return showErr('先填昵称', '#authName');
      if (!pwd) return showErr('密码不能为空', '#authPwd');

      const btn = $('.auth-submit', layer);
      const btnText = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = '请稍候…'; }
      const restore = () => { if (btn) { btn.disabled = false; btn.textContent = btnText; } };

      try {
        if (isLogin) {
          const res = await API.login(name, pwd);
          const u = (res && res.user) || {};
          store.me = { id: u.id, username: u.username || name, avatar: u.avatar || '🐾' };
          restore();
          await loginAs(u.id, false);
          return;
        }

        // 注册
        const pwd2 = $('#authPwd2', layer).value;
        if (pwd.length < 6) { restore(); return showErr('密码至少 6 位', '#authPwd'); }
        if (pwd !== pwd2) { restore(); return showErr('两次输入的密码不一样', '#authPwd2'); }

        const res = await API.register(name, pwd, avatar);
        const u = (res && res.user) || {};
        store.me = { id: u.id, username: u.username || name, avatar: u.avatar || '🐾' };
        restore();
        await loginAs(u.id, true);
      } catch (ex) {
        restore();
        showErr(ex.message || '操作失败，检查后端是否运行', '#authPwd');
      }
    });

    setTimeout(() => { const f = $('#authName', layer); if (f) f.focus(); }, 80);
  }

  function openAuth(mode) { renderAuth(mode || 'login'); }

  function closeAuth() {
    const layer = $('#authLayer');
    layer.hidden = true;
    layer.innerHTML = '';
    layer.classList.remove('is-open');
    layer.onclick = null;
  }

  /* 登录成功后进入主界面 */
  async function loginAs(uid, isNew) {
    store.currentUser = uid;
    store.loggedIn = true;
    store.guest = false;
    closeAuth();
    document.body.classList.add('is-logged-in');
    paintIcons();
    renderAll();          // 先渲染骨架
    measureTabs();
    positionInk(activeTab(), false);
    await loadAll();      // 再从接口拉真实数据
    const name = (store.me && store.me.username) || '你';
    if (isNew) toast(`欢迎，${name}。去「我的」可以看到你的邀请码`);
    else toast(`欢迎回来，${name}`);
  }

  /* 退出登录 */
  async function logout() {
    try { await API.logout(); } catch (e) { /* 后端没起也允许本地登出 */ }
    store.loggedIn = false;
    store.currentUser = '';
    store.guest = true;
    closeSheet();
    document.body.classList.remove('is-logged-in');
    renderAll();
    toast('已退出，现在是访客模式');
  }

  /* ── 启动 ───────────────────────────────────────────── */
  let splashPlayed = false;   // 必须在 showBootSplash() 调用之前声明
  paintIcons();

  /* 启动流程：
     1. 先探测后端是否有会话（/api/me）
     2. 有会话 → 直接进入并拉数据
     3. 没会话 → 以访客身份进入，不拦登录墙
     4. 后端完全不可用 → 退回内置演示数据，界面仍然能用  */
  async function boot() {
    let backendUp = false;
    let me = null;

    try {
      const r = await API.me();
      backendUp = true;
      me = (r && r.user) || null;
    } catch (e) {
      // 401 说明后端在跑，只是没登录；其他错误说明后端不可用
      backendUp = (e && e.status === 401);
    }

    store.backendUp = backendUp;

    if (me) {
      // 已登录：进入主界面
      store.me = { id: me.id, username: me.username, avatar: me.avatar };
      store.currentUser = me.id;
      store.loggedIn = true;
      store.guest = false;
      document.body.classList.add('is-logged-in');
      renderAll();
      measureTabs(); positionInk(activeTab(), false);
      await loadAll();
      return;
    }

    // 未登录：访客态
    document.body.classList.add('is-guest');
    if (!backendUp) seed();   // 后端不可用时用演示数据兜底
    renderAll();
  }

  boot();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measureTabs(); positionInk(activeTab(), false); });
  }

  /* 首次进入：浇水开场。播一遍后再露出菜单，只在本会话首次播放 */
  showBootSplash();

  document.body.classList.add('is-first-run');
  setTimeout(() => { document.body.classList.remove('is-first-run'); measureTabs(); positionInk(activeTab(), false); }, 700);


  /* ═══════════════════════════════════════════════════════
     首次进入的浇水开场：整屏覆盖 → 田垄长满 → 淡出进首页
     ═══════════════════════════════════════════════════════ */
  function showBootSplash() {
    if (splashPlayed) return;
    splashPlayed = true;

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const layer = document.createElement('div');
    layer.className = 'boot-splash';
    layer.innerHTML = `
      <div class="boot-inner">
        <div class="boot-brand">
          <span class="boot-mark" data-icon="paw" aria-hidden="true"></span>
          <span class="boot-word">脚印</span>
          <span class="boot-sub">两个人一起坚持的地方</span>
        </div>
        ${waterLoaderHtml('准备中')}
        <p class="boot-hint">一垄一垄种下去，慢慢就长成了。</p>
      </div>`;
    document.body.appendChild(layer);
    paintIcons(layer);

    const loader = layer.querySelector('.water-loader');
    const bar = layer.querySelector('[data-wl-bar]');

    if (reduce) {
      // 减少动效：直接铺满，短暂停留后淡出
      paintWaterLoader(loader, 1);
      setTimeout(() => layer.classList.add('is-out'), 300);
      setTimeout(() => layer.remove(), 600);
      return;
    }

    // 正常：2200ms 走满一整轮，然后淡出
    const DUR = 2200;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / DUR);
      paintWaterLoader(loader, t);
      if (t < 1) { raf = requestAnimationFrame(tick); }
      else {
        cancelAnimationFrame(raf);
        setTimeout(() => {
          layer.classList.add('is-out');
          setTimeout(() => layer.remove(), 520);
        }, 260);
      }
    };
    raf = requestAnimationFrame(tick);

    // 允许点击跳过
    layer.addEventListener('click', () => {
      cancelAnimationFrame(raf);
      if (!layer.classList.contains('is-out')) {
        paintWaterLoader(loader, 1);
        layer.classList.add('is-out');
        setTimeout(() => layer.remove(), 520);
      }
    });
  }

  /* 演示用调试接口：把待审核打卡的时间往前推，用来验证 24 小时自动通过 */
  window.__fp = {
    ageePending(hours) {
      const n = store.checks.filter((c) => c.status === 'pending').length;
      store.checks.filter((c) => c.status === 'pending').forEach((c) => {
        c.at -= hours * 3600 * 1000;
      });
      return n;
    },
    sweep() { return sweepAutoApprove(false); },
    stats() {
      return {
        pending: store.checks.filter((c) => c.status === 'pending').length,
        credited: store.checks.filter((c) => c.status === 'credited').length,
        auto: store.checks.filter((c) => c.autoApproved).length,
      };
    },
  };
})();
