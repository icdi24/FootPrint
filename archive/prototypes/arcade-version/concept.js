/* 脚印 UI 效果稿 · static screen compositions */
(() => {
  const app = document.getElementById('app');
  const screen = new URLSearchParams(location.search).get('screen') || 'home';

  const C = {
    ink: '#3B2E22', cream: '#FFFDF6', paper: '#FFF9EA', green: '#3F7C37',
    greenDeep: '#2E6228', greenSoft: '#E4EFD9', gold: '#F2B84B', orange: '#D9792D',
    orangeSoft: '#FBEBD6', red: '#B44A40', blue: '#4E6F99', blueSoft: '#E4ECF6',
    pink: '#C46A62', brown: '#A66A3F', brownSoft: '#D5A06B'
  };

  const r = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  const svg = (content) => `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${content}</svg>`;

  function cat() {
    return svg([
      r(3, 1, 3, 4, C.ink), r(10, 1, 3, 4, C.ink),
      r(2, 3, 12, 10, C.ink),
      r(3, 4, 10, 8, '#D9904E'),
      r(3, 2, 2, 3, '#D9904E'), r(11, 2, 2, 3, '#D9904E'),
      r(3, 2, 1, 1, C.pink), r(12, 2, 1, 1, C.pink),
      r(5, 6, 1, 2, C.ink), r(10, 6, 1, 2, C.ink),
      r(6, 9, 4, 3, C.cream), r(7, 9, 2, 1, C.pink),
      r(7, 11, 2, 1, C.ink), r(5, 12, 2, 1, C.cream), r(9, 12, 2, 1, C.cream),
      r(1, 8, 2, 1, C.ink), r(13, 8, 2, 1, C.ink),
      r(1, 10, 2, 1, C.ink), r(13, 10, 2, 1, C.ink)
    ].join(''));
  }

  function bear() {
    return svg([
      r(2, 1, 4, 4, C.ink), r(10, 1, 4, 4, C.ink),
      r(2, 3, 12, 11, C.ink),
      r(3, 4, 10, 9, C.brown),
      r(3, 2, 2, 2, C.brownSoft), r(11, 2, 2, 2, C.brownSoft),
      r(5, 7, 1, 2, C.ink), r(10, 7, 1, 2, C.ink),
      r(5, 9, 6, 4, '#F0D3A4'), r(7, 9, 2, 1, C.ink),
      r(7, 11, 2, 1, C.ink), r(5, 12, 2, 1, C.ink), r(9, 12, 2, 1, C.ink),
      r(4, 5, 2, 1, '#8E5A35'), r(10, 5, 2, 1, '#8E5A35')
    ].join(''));
  }

  function book() {
    return svg([
      r(2, 2, 12, 12, C.ink),
      r(3, 3, 10, 10, C.green),
      r(5, 3, 6, 10, C.cream),
      r(6, 5, 4, 1, '#D8C9A6'), r(6, 7, 4, 1, '#D8C9A6'), r(6, 9, 3, 1, '#D8C9A6'),
      r(6, 3, 2, 4, C.orange),
      r(7, 4, 1, 2, C.gold)
    ].join(''));
  }

  function piano() {
    return svg([
      r(1, 4, 14, 8, C.ink),
      r(2, 5, 12, 6, C.cream),
      r(3, 5, 1, 6, C.ink), r(5, 5, 1, 6, C.ink), r(7, 5, 1, 6, C.ink),
      r(9, 5, 1, 6, C.ink), r(11, 5, 1, 6, C.ink), r(13, 5, 1, 6, C.ink),
      r(4, 5, 1, 3, C.ink), r(6, 5, 1, 3, C.ink), r(8, 5, 1, 3, C.ink),
      r(10, 5, 1, 3, C.ink), r(12, 5, 1, 3, C.ink)
    ].join(''));
  }

  function dumbbell() {
    return svg([
      r(1, 5, 3, 6, C.ink), r(2, 4, 2, 8, C.ink),
      r(12, 5, 3, 6, C.ink), r(12, 4, 2, 8, C.ink),
      r(4, 7, 8, 2, C.ink), r(4, 7, 8, 1, C.green),
      r(2, 6, 2, 4, C.greenSoft), r(12, 6, 2, 4, C.greenSoft)
    ].join(''));
  }

  function moon() {
    return svg([
      r(9, 2, 3, 1, C.gold), r(7, 3, 3, 1, C.gold), r(6, 4, 2, 1, C.gold),
      r(5, 5, 2, 1, C.gold), r(5, 6, 2, 4, C.gold), r(6, 10, 2, 1, C.gold),
      r(7, 11, 3, 1, C.gold), r(9, 12, 3, 1, C.gold),
      r(3, 3, 1, 1, C.orange), r(2, 6, 1, 1, C.orange), r(4, 9, 1, 1, C.orange)
    ].join(''));
  }

  function drop() {
    return svg([
      r(7, 2, 2, 1, C.ink), r(6, 3, 4, 1, C.ink), r(5, 4, 1, 3, C.ink),
      r(10, 4, 1, 3, C.ink), r(4, 7, 1, 4, C.ink), r(11, 7, 1, 4, C.ink),
      r(5, 11, 6, 1, C.ink), r(6, 12, 4, 1, C.ink),
      r(7, 3, 2, 1, '#5D9CDA'), r(6, 4, 3, 2, '#5D9CDA'),
      r(5, 6, 5, 3, '#5D9CDA'), r(5, 9, 6, 2, '#5D9CDA'),
      r(6, 5, 1, 1, '#B7D9F5')
    ].join(''));
  }

  function openBook() {
    return svg([
      r(2, 3, 5, 9, C.ink), r(9, 3, 5, 9, C.ink),
      r(3, 4, 3, 7, C.cream), r(10, 4, 3, 7, C.cream),
      r(3, 4, 3, 1, C.orange), r(10, 4, 3, 1, C.orange),
      r(7, 4, 2, 8, C.ink), r(6, 12, 1, 1, C.ink), r(9, 12, 1, 1, C.ink),
      r(4, 6, 1, 1, '#D8C9A6'), r(4, 8, 1, 1, '#D8C9A6'),
      r(11, 6, 1, 1, '#D8C9A6'), r(11, 8, 1, 1, '#D8C9A6')
    ].join(''));
  }

  function medal() {
    return svg([
      r(3, 1, 4, 5, C.blue), r(9, 1, 4, 5, C.red),
      r(5, 4, 6, 8, C.ink), r(6, 5, 4, 6, C.gold),
      r(7, 7, 2, 2, C.orangeDeep || C.orange),
      r(6, 10, 1, 1, C.orange), r(9, 9, 1, 1, C.orange)
    ].join(''));
  }

  function pawIcon() {
    return svg([
      r(3, 2, 2, 2, C.cream), r(6, 1, 2, 2, C.cream), r(9, 1, 2, 2, C.cream), r(12, 2, 2, 2, C.cream),
      r(3, 7, 10, 4, C.cream), r(4, 11, 8, 2, C.cream), r(5, 13, 6, 1, C.cream)
    ].join(''));
  }

  const GOAL_ART = {
    book, piano, dumbbell, moon, reading: openBook, water: drop, medal
  };

  // 难度标注：5 格像素条，填充格数 = 难度等级
  function diffBadge(level, cls = '') {
    const n = Math.max(1, Math.min(5, Number(level) || 1));
    const bars = Array.from({ length: 5 }, (_, i) =>
      `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    return `<span class="diff ${cls}" data-level="${n}" title="难度 ${n}"><span class="diff-bars" aria-hidden="true">${bars}</span><span class="diff-num">${n}</span></span>`;
  }

  function tile(name, cls = '') {
    return `<span class="goal-tile ${cls}" aria-hidden="true">${GOAL_ART[name] ? GOAL_ART[name]() : book()}</span>`;
  }

  const ui = (name, cls = '') => window.icon(name, cls);

  function nav(active) {
    const items = [
      ['home', '今天', 'home'], ['goals', '目标', 'target'], ['wish', '愿望单', 'gift'],
      ['partner', '我们', 'us'], ['me', '我的', 'me']
    ];
    return `<nav class="tabbar" aria-label="主导航">
      ${items.map(([key, label, icon]) => `<a class="tab ${active === key ? 'active' : ''}" href="?screen=${key}" aria-current="${active === key ? 'page' : 'false'}">
        <span class="tab-inner">${ui(icon)}<span>${label}</span></span>
      </a>`).join('')}
    </nav>`;
  }

  function homeScreen(opts = {}) {
    const inbox = !!opts.inbox;
    return `<div class="screen home-screen">
      <header class="topbar">
        <div>
          <div class="date-line">11月7日 · 周六</div>
          <h1 class="greeting">下午好，栗子 <span class="avatar sm" aria-label="栗子的头像">${cat()}</span></h1>
        </div>
      </header>

      <section class="home-points-banner" aria-label="积分概览">
        <div class="pb-left">
          <div class="pb-label">${ui('coin')} 可用积分</div>
          <div class="pb-balance">824</div>
          <div class="pb-yuan">≈ ¥82.4</div>
        </div>
        <div class="pb-right">
          <div class="pb-chip">${ui('flame')} 12 天连续</div>
          <div class="pb-chip">本月 +486</div>
        </div>
      </section>

      ${inbox ? `<div class="nudge-inbox">
        ${ui('us')}<span><b>阿白</b> 给你拍一拍</span><span class="nudge-time">刚刚</span>
      </div>` : ''}

      <section aria-labelledby="today-title">
        <div class="section-head">
          <h2 class="section-title" id="today-title">今天</h2>
          <span class="section-note">剩 3</span>
        </div>
        <div class="hero-card" aria-labelledby="hero-title" style="margin-top: 10px;">
          <div class="hero-top">
            ${tile('book')}
            <div class="hero-main">
              <h2 class="hero-title" id="hero-title">背单词</h2>
              <div class="hero-meta">06:00–08:00 · 30 分钟 ${diffBadge(2)}</div>
            </div>
            <div class="hero-points">+18</div>
          </div>
          <div class="hero-bottom">
            <span class="streak-chip">${ui('flame')} 14 天</span>
            <button class="btn-primary" type="button">${ui('check')} 打卡</button>
          </div>
        </div>
        <div class="task-list" style="margin-top: 10px;">
          <div class="task-row">
            ${tile('piano', 'sm')}
            <div class="task-main">
              <div class="task-title">练琴</div>
              <div class="task-meta">45 分钟 ${diffBadge(3)}</div>
            </div>
            <div class="task-side"><span class="task-points">+34</span><button class="btn-small" type="button">完成</button></div>
          </div>
          <div class="task-row">
            ${tile('dumbbell', 'sm')}
            <div class="task-main">
              <div class="task-title">健身</div>
              <div class="task-meta">本周 2/3 ${diffBadge(4)}</div>
              <div class="task-progress" aria-label="本周完成 2 次，共 3 次"><i class="on"></i><i class="on"></i><i></i></div>
            </div>
            <div class="task-side"><span class="task-points">+65</span><button class="btn-small" type="button">完成</button></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="done-title">
        <div class="section-head">
          <h2 class="section-title" id="done-title">已完成</h2>
          <span class="section-note">2 项</span>
        </div>
        <div class="done-list" style="margin-top: 10px;">
          <div class="done-row">
            ${tile('water', 'sm')}
            <div class="task-main">
              <div class="task-title">喝水</div>
              <div class="task-meta">5 分钟 ${diffBadge(1)}</div>
            </div>
            <div class="task-side"><span class="task-points ok">+3</span><span class="done-mark">${ui('check')}</span></div>
          </div>
          <div class="done-row">
            ${tile('reading', 'sm')}
            <div class="task-main">
              <div class="task-title">阅读</div>
              <div class="task-meta">30 分钟 ${diffBadge(2)}</div>
            </div>
            <div class="task-side"><span class="task-points ok">+18</span><span class="done-mark">${ui('check')}</span></div>
          </div>
        </div>
      </section>

      <section class="partner-strip" aria-label="搭档动态">
        <span class="avatar sm">${bear()}</span>
        <div class="partner-copy">
          <div class="partner-name">阿白 <b>2/4</b></div>
          <div class="partner-note">还有 2 张没打</div>
        </div>
        <button class="btn-ghost" type="button">看看 ${ui('right')}</button>
      </section>
    </div>${nav('home')}`;
  }

  function sheet(title, body, actions) {
    return `<div class="sheet-layer">
      <div class="sheet-scrim" aria-hidden="true"></div>
      <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${title}">
        <span class="sheet-handle" aria-hidden="true"></span>
        <h2 class="sheet-title">${title}</h2>
        <div class="sheet-body">${body}</div>
        <div class="sheet-actions">${actions.map(([label, kind]) => `<button class="sheet-btn ${kind || ''}" type="button">${label}</button>`).join('')}</div>
      </div>
    </div>`;
  }

  function cellDetailSheet() {
    const body = `<div class="cid-goal">
        ${tile('piano', 'sm')}
        <div>
          <div class="cid-goal-title">练琴</div>
          <div class="cid-goal-meta">每天 45 分钟 · 难度 3</div>
        </div>
      </div>
      <div class="cid-rows">
        <div class="cid-row"><span>日期</span><b>11月5日 · 周四</b></div>
        <div class="cid-row"><span>时长</span><b>45 分钟</b></div>
        <div class="cid-row"><span>得分</span><b class="cid-ok">+34</b></div>
        <div class="cid-row"><span>记录</span><b>音阶 20 分钟，肖邦夜曲 25 分钟</b></div>
      </div>
      <p class="cid-hint">24 小时内可以撤销，撤销会把这 34 分扣回。</p>`;
    return sheet('练琴 · 11月5日', body, [['再想想', ''], ['撤销这次打卡', 'danger']]);
  }

  function newGoalSheet() {
    const emojis = ['📚', '🏃', '💤', '💧', '🎹', '📖', '🧘', '🌅', '🏋️', '🍎', '✍️', '🎯'];
    const body = `
      <div class="gf-field">
        <label class="gf-label" for="gf-title">目标名称</label>
        <input class="gf-input" id="gf-title" type="text" value="早睡" />
      </div>
      <div class="gf-field">
        <span class="gf-label">图标</span>
        <div class="gf-emojis">${emojis.map((e, i) => `<span class="gf-emoji ${i === 2 ? 'on' : ''}">${e}</span>`).join('')}</div>
      </div>
      <div class="gf-field">
        <span class="gf-label">频率</span>
        <div class="gf-seg"><button class="on" type="button">每天</button><button type="button">每周</button><button type="button">工作日</button></div>
      </div>
      <div class="gf-grid">
        <div class="gf-field"><span class="gf-label">时长</span><div class="gf-step"><button type="button">−</button><b>30</b><button type="button">+</button><span>分钟</span></div></div>
        <div class="gf-field"><span class="gf-label">难度</span><div class="gf-step"><button type="button">−</button><b>2</b><button type="button">+</button><span>/ 5</span></div></div>
      </div>
      <div class="gf-preview">
        <span class="gf-preview-label">每次打卡可得</span>
        <b class="gf-preview-val">+14 分</b>
      </div>`;
    return sheet('新目标', body, [['取消', 'ghost'], ['建好了', 'primary']]);
  }

  function goalsScreen(opts = {}) {
    const mode = opts.mode || 'week';
    const type = opts.type || 'daily';
    const empty = !!opts.empty;
    const days = ['一', '二', '三', '四', '五', '六', '日'];
    const rows = [
      { name: '背单词', art: 'book', sub: '+18', diff: 2, states: ['done', 'done', 'done', 'done', 'done', 'todo', 'future'] },
      { name: '练琴', art: 'piano', sub: '+34', diff: 3, states: ['done', 'done', 'off', 'done', 'missed', 'todo', 'future'] },
      { name: '健身', art: 'dumbbell', sub: '2/3', diff: 4, states: ['done', 'blank', 'done', 'blank', 'done', 'blank', 'future'] },
      { name: '早睡', art: 'moon', sub: '+14', diff: 2, states: ['done', 'done', 'done', 'done', 'done', 'todo', 'future'] },
      { name: '阅读', art: 'reading', sub: '+18', diff: 2, states: ['done', 'off', 'done', 'off', 'missed', 'off', 'off'] },
      { name: '喝水', art: 'water', sub: '+3', diff: 1, states: ['done', 'done', 'done', 'done', 'done', 'todo', 'future'] }
    ];
    const cell = (state, day) => {
      const cls = ['cell', state, day === 5 ? 'is-today' : ''].filter(Boolean).join(' ');
      const inner = state === 'done' ? ui('check') : '';
      return `<div class="${cls}" aria-label="周${days[day]} ${state === 'done' ? '已完成' : state === 'todo' ? '今天待打卡' : state === 'missed' ? '漏打' : '不适用'}">${inner}</div>`;
    };

    const calendar = () => {
      const statuses = [
        'done', 'done', 'done', 'done', 'done', 'off', 'today',
        'done', 'done', 'missed', 'done', 'done', 'off', 'off',
        'done', 'missed', 'done', 'done', 'done', 'off', 'off',
        'done', 'done', 'done', 'done', 'done', 'off', 'off',
        'done', 'future'
      ];
      // 2026-11-01 is Sunday: the calendar starts on Monday, so six leading blanks.
      const cells = [...Array(6).fill('blank'), ...statuses];
      while (cells.length % 7) cells.push('blank');
      return `<div class="month-grid" aria-label="十一月打卡日历">
        ${['一','二','三','四','五','六','日'].map((d) => `<div class="month-head">${d}</div>`).join('')}
        ${cells.map((state, i) => {
          if (state === 'blank') return '<div class="month-cell blank" aria-hidden="true"></div>';
          const n = i - 5;
          const cls = ['month-cell', state].filter(Boolean).join(' ');
          return `<div class="${cls}" aria-label="11月${n}日 ${state === 'done' ? '已完成' : state === 'missed' ? '漏打' : '未来'}"><span class="month-day">${n}</span><span class="month-mark"></span></div>`;
        }).join('')}
      </div>`;
    };

    const pageSub = type === 'stage' ? '做完请对方验收' : '这周打了几天';

    const weekSkeleton = `<div class="empty-skeleton" aria-hidden="true">
      <div class="es-head"><span></span>${days.map((d) => `<span>${d}</span>`).join('')}</div>
      ${[0, 1, 2].map(() => `<div class="es-row"><span class="es-name"><i></i><b></b></span>${days.map(() => '<span class="es-cell"></span>').join('')}</div>`).join('')}
    </div>`;

    const cardSkeleton = `<div class="empty-skeleton cards" aria-hidden="true">
      ${[0, 1].map(() => `<div class="es-card"><span class="es-icon"></span><span class="es-lines"><b></b><i></i></span></div>`).join('')}
    </div>`;

    const emptyBoard = () => `<div class="board-empty">
      ${weekSkeleton}
      <div class="empty-title">这一周还没有格子</div>
      <div class="empty-sub">先建一个每天都做得到的小事。</div>
      <button class="btn-primary" type="button">${ui('plus')} 建第一个目标</button>
    </div>`;

    const weekGrid = () => `<div class="week-grid">
      <div class="wg-head name">目标</div>
      ${days.map((d, i) => `<div class="wg-head ${i === 5 ? 'today' : ''}">${d}</div>`).join('')}
      ${rows.map((row) => `<div class="wg-name">${tile(row.art, 'sm')}<div class="wg-name-text"><div class="wg-title">${row.name}</div><div class="wg-sub">${row.sub} ${diffBadge(row.diff)}</div></div></div>${row.states.map((s, i) => cell(s, i)).join('')}`).join('')}
    </div>
    <div class="legend"><span><i class="lg done"></i>已打</span><span><i class="lg miss"></i>漏了</span><span><i class="lg today"></i>今天</span></div>`;

    const stageCards = [
      {
        art: 'medal', title: '考过雅思 6.5', status: 'active', statusText: '进行中',
        diff: 4, meta: '还剩 43 天',
        crit: '总分 6.5，四项不低于 6.0',
        points: '+300'
      },
      {
        art: 'dumbbell', title: '连续 8 周力量训练', status: 'reviewing', statusText: '待验收',
        diff: 3, meta: '昨天提交',
        crit: '连续 8 周每周 3 练',
        points: '+450'
      },
      {
        art: 'book', title: '读完《深度学习入门》', status: 'achieved', statusText: '已达成',
        diff: 3, meta: '10/28 阿白验收',
        crit: '',
        points: '+180'
      }
    ];

    const stageCard = (g) => `<article class="stage-card ${g.status}">
      <div class="sc-head">
        ${tile(g.art, 'sm')}
        <div class="sc-title-box">
          <h2 class="sc-title">${g.title}</h2>
          <div class="sc-meta">${g.meta} ${diffBadge(g.diff)}</div>
        </div>
        <span class="sc-badge ${g.status}">${g.statusText}</span>
      </div>
      ${g.crit ? `<div class="sc-crit"><span class="sc-crit-label">验收标准</span>${g.crit}</div>` : ''}
      ${g.status === 'active' ? `<div class="sc-actions">
        <button class="btn-primary" type="button">提交验收</button>
        <button class="btn-ghost" type="button">编辑</button>
      </div>
      <div class="sc-foot"><span class="sc-points">${g.points}</span><span class="sc-note">验收通过后入账</span></div>`
      : g.status === 'reviewing' ? `<div class="sc-foot"><span class="sc-points">${g.points}</span><span class="sc-wait">${ui('clock')} 等阿白确认</span></div>`
      : `<div class="sc-foot"><span class="sc-points done">${g.points}</span><span class="sc-done">${ui('check')} 已入账</span></div>`}
    </article>`;

    const stageSummary = `<div class="stage-summary">
      <span><b>1</b> 进行中</span>
      <span><b>1</b> 待验收</span>
      <span><b>1</b> 已达成</span>
    </div>`;

    const stageEmpty = () => `<div class="board-empty stage">
      ${cardSkeleton}
      <div class="empty-title">还没有小目标</div>
      <div class="empty-sub">定一个阶段要够到的事，做完请对方验收。</div>
      <button class="btn-primary" type="button">${ui('plus')} 建一个小目标</button>
    </div>`;

    const stageBody = empty ? stageEmpty() : `${stageSummary}<div class="stage-list">${stageCards.map(stageCard).join('')}</div>`;

    const dailyBody = empty
      ? `<section class="board-card">${emptyBoard()}</section>`
      : `<section class="board-card" aria-labelledby="board-range">
        <div class="board-top">
          <div>
            <div class="range" id="board-range">${mode === 'week' ? '11/2–11/8' : '2026 年 11 月'}</div>
            <div class="range-sub">${mode === 'week' ? '21/33 完成 · 412 分' : '64/102 完成 · 1,468 分'}</div>
          </div>
          <div class="view-switch" role="tablist" aria-label="视图">
            <button class="${mode === 'week' ? 'on' : ''}" type="button">周</button>
            <button class="${mode === 'month' ? 'on' : ''}" type="button">月</button>
          </div>
        </div>
        ${mode === 'week' ? weekGrid() : `${calendar()}
        <div class="legend"><span><i class="lg done"></i>已打</span><span><i class="lg miss"></i>漏了</span><span><i class="lg today"></i>今天</span></div>`}
      </section>

      <div class="goal-foot">
        <span>最长连续 <b>21</b> 天</span>
        <span>本月完成率 <b>86</b>%</span>
        <span>投入 <b>21.3</b> 小时</span>
      </div>`;

    return `<div class="screen">
      <header class="page-head">
        <div>
          <h1 class="page-title">目标</h1>
          <div class="page-sub">${pageSub}</div>
        </div>
        <button class="btn-ghost" type="button">${ui('plus')} 新建</button>
      </header>

      <div class="goals-toolbar">
        <div class="type-switch" role="tablist" aria-label="目标类型">
          <button class="${type === 'daily' ? 'on' : ''}" type="button">日常</button>
          <button class="${type === 'stage' ? 'on' : ''}" type="button">小目标</button>
        </div>
      </div>

      ${type === 'stage' ? stageBody : dailyBody}
    </div>${nav('goals')}`;
  }

  // 固定短语：只发情绪，不制造对话压力
  const NUDGES = [
    { key: 'cheer', icon: 'flame', label: '加油' },
    { key: 'tap', icon: 'us', label: '拍一拍' },
    { key: 'rest', icon: 'clock', label: '早点睡' },
    { key: 'good', icon: 'check', label: '今天很棒' },
    { key: 'care', icon: 'me', label: '别太累' },
    { key: 'thanks', icon: 'gift', label: '辛苦了' }
  ];

  function partnerScreen(opts = {}) {
    const tab = opts.tab || 'live';
    const rows = [
      ['本月得分', '+666', '+338'], ['连续天数', '5 天', '4 天'],
      ['完成率', '76%', '75%'], ['时间投入', '14.8 小时', '8.2 小时'],
      ['当前余额', '1,318', '564']
    ];

    // 手机时长：还没有任何上报数据的状态
    const phoneCard = `<div class="phone-card">
      <div class="phone-head">
        <div class="phone-col">
          <div class="phone-who"><span class="avatar sm">${cat()}</span> 我</div>
          <div class="phone-value empty">还没数据</div>
          <div class="phone-bar"><i style="width:0"></i></div>
          <div class="phone-sub">没有上报</div>
        </div>
        <div class="phone-col">
          <div class="phone-who"><span class="avatar sm">${bear()}</span> 阿白</div>
          <div class="phone-value empty">还没数据</div>
          <div class="phone-bar"><i style="width:0"></i></div>
          <div class="phone-sub">没有上报</div>
        </div>
      </div>
      <div class="phone-hint">${ui('close')}<span>我还看不见自己的时长<br/>装上手机版，自己也能看见时间花在哪</span></div>
      <div class="phone-hint">${ui('doc')}<span>阿白还没装脚印手机版，看不到时长<br/>等 ta 装上、手机自己上报，这里就会亮起来</span></div>
    </div>`;

    const trendCard = `<div class="trend-card">
      <div class="trend-chart" aria-label="7 天手机时长，均未上报">
        ${['1日', '2日', '3日', '4日', '5日', '6日', '7日'].map((d, i) => `<div class="trend-day">
          <div class="trend-bars"><i class="none" style="height:2px"></i><i class="none" style="height:2px"></i></div>
          <span class="trend-label ${i === 6 ? 'today' : ''}">${d}</span>
        </div>`).join('')}
      </div>
      <div class="trend-legend">
        <span><i class="me"></i>我</span><span><i class="other"></i>阿白</span><span><i class="none"></i>未上报（不补 0）</span>
      </div>
    </div>`;

    const dataBody = `
      <section aria-labelledby="compare-title">
        <div class="section-head"><h2 class="section-title" id="compare-title">并排看看</h2><span class="section-note">不比输赢</span></div>
        <div class="compare-card" style="margin-top: 10px;">
          <div class="compare-head"><span>指标</span><span class="me">我 <span class="avatar sm">${cat()}</span></span><span class="partner">阿白 <span class="avatar sm">${bear()}</span></span></div>
          ${rows.map(([label, mine, theirs], i) => `<div class="compare-row ${i === 0 ? 'mine' : ''}"><span class="compare-label">${label}</span><span class="compare-val">${mine}</span><span class="compare-val">${theirs}</span></div>`).join('')}
        </div>
      </section>

      <section aria-labelledby="phone-title">
        <div class="section-head"><h2 class="section-title" id="phone-title">手机在谁手里</h2><span class="section-note">今日</span></div>
        <div style="margin-top: 10px;">${phoneCard}</div>
      </section>

      <section aria-labelledby="trend-title">
        <div class="section-head"><h2 class="section-title" id="trend-title">7 天手机时长</h2><span class="section-note">断点 = 没上报</span></div>
        <div style="margin-top: 10px;">${trendCard}</div>
      </section>`;

    const dynamicBody = `
      <section class="nudge-card" aria-labelledby="nudge-title">
        <div class="nudge-head">
          <span class="nudge-label" id="nudge-title">发一句</span>
          <span class="nudge-quota">今天还剩 2 次</span>
        </div>
        <div class="nudge-grid">
          ${NUDGES.map((n) => `<button class="nudge-btn" type="button">${ui(n.icon)} ${n.label}</button>`).join('')}
        </div>
      </section>

      <section class="pending-card" aria-labelledby="pending-title">
        <div class="pending-top"><span class="pending-kicker">待你验收</span><span class="pending-count">1 条</span></div>
        <h2 class="pending-title" id="pending-title">完成 8 周力量训练</h2>
        <div class="pending-meta">阿白 · +450 分</div>
        <div class="pending-actions">
          <button class="btn-primary" type="button">${ui('check')} 去验收</button>
          <button class="btn-ghost" type="button">稍后</button>
        </div>
      </section>

      <section aria-labelledby="today-title">
        <div class="section-head"><h2 class="section-title" id="today-title">阿白今天</h2><span class="section-note">2/3</span></div>
        <div class="partner-today" style="margin-top: 10px;">
          <div class="pcheck-row">${tile('book', 'sm')}<div class="pcheck-main"><div class="pcheck-title">背单词 <span class="pcheck-points">+18</span></div><div class="pcheck-meta">30 分钟 · 09:18</div></div></div>
          <div class="pcheck-row">${tile('dumbbell', 'sm')}<div class="pcheck-main"><div class="pcheck-title">健身 <span class="pcheck-points">+65</span></div><div class="pcheck-meta">60 分钟 · 07:42</div></div></div>
        </div>
      </section>`;

    return `<div class="screen">
      <header class="page-head">
        <div>
          <h1 class="page-title">我们</h1>
          <div class="page-sub">和阿白 · 一起第 18 天</div>
        </div>
      </header>

      <div class="ptabs" role="tablist" aria-label="我们页视图">
        <button class="ptab ${tab === 'live' ? 'on' : ''}" role="tab" aria-selected="${tab === 'live'}" type="button">${ui('us')} 互动 <span class="ptab-badge">1</span></button>
        <button class="ptab ${tab === 'data' ? 'on' : ''}" role="tab" aria-selected="${tab === 'data'}" type="button">${ui('target')} 数据对比</button>
      </div>

      ${tab === 'data' ? dataBody : dynamicBody}
    </div>${nav('partner')}`;
  }

  function wishScreen(opts = {}) {
    const empty = !!opts.empty;
    const items = [
      { emoji: '🍲', title: '一顿火锅', cost: 1500, pct: 55, gap: '差 676' },
      { emoji: '🎧', title: '蓝牙耳机', cost: 1990, pct: 41, gap: '差 1,166' },
      { emoji: '🌷', title: '乐高花束', cost: 3490, pct: 24, gap: '差 2,666' }
    ];

    const emptyBody = `<div class="board-empty">
      <div class="empty-skeleton cards" aria-hidden="true">
        <div class="es-card"><span class="es-icon"></span><span class="es-lines"><b></b><i></i></span></div>
        <div class="es-card"><span class="es-icon"></span><span class="es-lines"><b></b><i></i></span></div>
      </div>
      <div class="empty-title">还没有想要的</div>
      <div class="empty-sub">把想买的东西放进来，填上真实价格。</div>
      <button class="btn-primary" type="button">${ui('plus')} 加第一个愿望</button>
    </div>`;

    return `<div class="screen">
      <header class="page-head">
        <div>
          <h1 class="page-title">愿望单</h1>
          <div class="page-sub">攒够就换</div>
        </div>
        <button class="btn-ghost" type="button">${ui('plus')} 新建</button>
      </header>

      <section class="balance-banner" aria-label="可用积分">
        <div>
          <div class="balance-label">可用积分</div>
          <div class="balance-value">824</div>
        </div>
        <div class="balance-side">≈ ¥<b>82.4</b><br/>1 元 = 10 分</div>
      </section>

      ${empty ? `<section class="board-card">${emptyBody}</section>` : `
      <section aria-labelledby="redeem-title">
        <div class="section-head"><h2 class="section-title" id="redeem-title">可以兑换</h2><span class="section-note">1 件</span></div>
        <div class="wish-feature" style="margin-top: 10px;">
          <div class="wish-feature-top">
            <span class="wish-tile" aria-hidden="true">🧋</span>
            <div class="wish-feature-main">
              <div class="wish-feature-title">奶茶</div>
              <div class="wish-feature-meta">周末的快乐水</div>
            </div>
            <div class="wish-feature-points">250<small>积分</small></div>
          </div>
          <div class="progress"><i style="width:100%"></i></div>
          <div class="progress-label"><span>已攒够</span><b>250 / 250</b></div>
          <button class="btn-primary" type="button">兑换 · −250 分</button>
        </div>
      </section>

      <section aria-labelledby="saving-title">
        <div class="section-head"><h2 class="section-title" id="saving-title">慢慢攒</h2><span class="section-note">3 件</span></div>
        <div class="wish-list" style="margin-top: 10px;">
          ${items.map((i) => `<div class="wish-row">
            <span class="wish-tile sm" aria-hidden="true">${i.emoji}</span>
            <div class="wish-main">
              <div class="wish-title-line"><span class="wish-title">${i.title}</span><span class="wish-cost">${i.cost.toLocaleString('zh-CN')}</span></div>
              <div class="progress"><i style="width:${i.pct}%"></i></div>
              <div class="wish-gap">${i.gap}</div>
            </div>
          </div>`).join('')}
        </div>
      </section>

      <section aria-labelledby="red-title">
        <div class="section-head"><h2 class="section-title" id="red-title">兑换记录</h2><span class="section-note">2 条</span></div>
        <div class="wish-list" style="margin-top: 10px;">
          <div class="red-row">
            <span class="wish-tile sm" aria-hidden="true">🧋</span>
            <div class="red-main"><div class="red-title">奶茶</div><div class="red-time">11月1日 · −250</div></div>
            <span class="st done">已完成</span>
          </div>
          <div class="red-row">
            <span class="wish-tile sm" aria-hidden="true">🍲</span>
            <div class="red-main"><div class="red-title">一顿火锅</div><div class="red-time">10月26日 · −1,500</div></div>
            <span class="st">待确认</span>
          </div>
        </div>
      </section>`}
    </div>${nav('wish')}`;
  }

  function meScreen() {
    return `<div class="screen">
      <header class="page-head">
        <div><h1 class="page-title">我的</h1><div class="page-sub">栗子的脚印</div></div>
      </header>

      <section class="profile-card">
        <span class="avatar lg">${cat()}</span>
        <div class="profile-main"><div class="profile-name">栗子</div><div class="profile-meta">和阿白互相监督中</div></div>
        <button class="btn-ghost" type="button">${ui('lock')} 改口令</button>
      </section>

      <section class="me-summary">
        <div><div class="summary-label">可用积分</div><div class="summary-value">824</div></div>
        <div class="summary-side"><b>+486</b><span>本月得分</span><b>12 天</b><span>当前连续</span></div>
      </section>

      <section class="metric-table" aria-label="本月统计">
        <div class="metric"><div class="metric-label">本月完成率</div><div class="metric-value">86<small>%</small></div></div>
        <div class="metric"><div class="metric-label">时间投入</div><div class="metric-value">21.3<small> 小时</small></div></div>
        <div class="metric"><div class="metric-label">最长连续</div><div class="metric-value">21<small> 天</small></div></div>
        <div class="metric"><div class="metric-label">被驳回次数</div><div class="metric-value">1<small> 次</small></div></div>
      </section>

      <section aria-labelledby="ledger-title">
        <div class="section-head"><h2 class="section-title" id="ledger-title">积分流水</h2><span class="section-note">最近 2 条</span></div>
        <div class="ledger-card" style="margin-top: 10px;">
          <div class="ledger-row"><div class="ledger-main"><div class="ledger-title">打卡 · 「背单词」30 分钟</div><div class="ledger-time">11月7日 09:12</div></div><div class="ledger-delta pos">+18</div></div>
          <div class="ledger-row"><div class="ledger-main"><div class="ledger-title">连续奖励 · 连续 7 达成</div><div class="ledger-time">11月6日 21:30</div></div><div class="ledger-delta pos">+65</div></div>
          <div class="ledger-more">查看全部流水</div>
        </div>
      </section>

      <section aria-labelledby="settings-title">
        <div class="section-head"><h2 class="section-title" id="settings-title">设置</h2></div>
        <div class="menu-card" style="margin-top: 10px;">
          <button class="menu-row" type="button">${ui('gear')}<span>积分规则</span><span class="menu-note">可调整</span><span class="right">${ui('right')}</span></button>
          <button class="menu-row" type="button">${ui('doc')}<span>数据与备份</span><span class="menu-note">导出 · 快照</span><span class="right">${ui('right')}</span></button>
        </div>
      </section>
    </div>${nav('me')}`;
  }

  function loginScreen() {
    return `<div class="login-screen">
      <div class="brand-block">
        <div class="logo-tile">${pawIcon()}</div>
        <h1 class="wordmark">脚印</h1>
        <p class="brand-sub">两个人互相看得见的打卡与目标</p>
      </div>
      <section class="auth-card" aria-labelledby="login-title">
        <h2 class="auth-title" id="login-title">欢迎回来</h2>
        <label class="field"><span class="field-label">昵称</span><input type="text" placeholder="你的昵称" autocomplete="username"/></label>
        <label class="field"><span class="field-label">口令</span><input type="password" placeholder="至少 6 位" autocomplete="current-password"/></label>
        <button class="btn-primary" type="button">进入脚印</button>
        <p class="auth-foot">登录后，今天的脚印会从上次停下的地方继续。</p>
      </section>
      <div class="login-scene" aria-label="像素风格的两个人一起走路">
        <div class="scene-path">
          <span class="scene-dots"></span>
          <span class="scene-character left">${cat()}</span>
          <span class="scene-paw p1"></span><span class="scene-paw p2"></span><span class="scene-paw p3"></span>
          <span class="scene-character right">${bear()}</span>
        </div>
        <div class="scene-caption">一个人容易停，两个人就走得远。</div>
      </div>
    </div>`;
  }

  /* ============ AI 拆目标：向导，不是聊天窗口 ============ */

  // 入口条：放在目标页顶部
  function aiEntry() {
    return `<button class="ai-entry" type="button">
      <span class="ai-entry-mark" aria-hidden="true">✨</span>
      <span class="ai-entry-main">
        <span class="ai-entry-title">有个大方向？让 AI 帮你拆</span>
        <span class="ai-entry-sub">说清目标，它帮你排出每周做什么</span>
      </span>
      ${ui('right')}
    </button>`;
  }

  // 新建弹层里的两选一
  function modePick() {
    return `<div class="mode-pick">
      <button class="mode-card" type="button">
        <span class="mc-title">${ui('edit')} 自己填</span>
        <span class="mc-sub">已知参数，直接建</span>
      </button>
      <button class="mode-card on" type="button">
        <span class="mc-title">✨ AI 帮我拆</span>
        <span class="mc-sub">说方向，排成小目标</span>
      </button>
    </div>`;
  }

  // 向导第 1 步：说清方向
  function wizardAsk() {
    return `<div class="wizard">
      <div class="wizard-top">
        <button class="wizard-back" type="button" aria-label="返回">${ui('left')}</button>
        <div class="wizard-steps" aria-label="第 1 步，共 3 步">
          <i class="on"></i><i></i><i></i>
        </div>
        <span class="wizard-skip">跳过</span>
      </div>
      <div class="wizard-body">
        <div class="ask-index">第 1 个问题</div>
        <h1 class="ask-q">你想做成一件什么事？</h1>
        <div class="ask-why">说得越具体，拆出来的小目标越贴近你。</div>

        <div class="ask-suggests">
          <button class="ask-chip on" type="button">${ui('check')} 找到一份 Agent 开发的工作</button>
          <button class="ask-chip" type="button">${ui('check')} 三个月内考过雅思 6.5</button>
          <button class="ask-chip" type="button">${ui('check')} 把体脂降到 18%</button>
        </div>

        <div class="ask-or">或者自己说</div>
        <textarea class="ask-input" rows="3" placeholder="比如：半年内转岗做 AI 应用开发，现在只会写 Python"></textarea>
      </div>
      <div class="wizard-foot">
        <button class="btn-primary" type="button" style="width:100%">下一步</button>
      </div>
    </div>`;
  }

  // 向导第 2 步：问关键参数（一次只问一个）
  function wizardProbe() {
    return `<div class="wizard">
      <div class="wizard-top">
        <button class="wizard-back" type="button" aria-label="返回">${ui('left')}</button>
        <div class="wizard-steps" aria-label="第 2 步，共 3 步">
          <i class="done"></i><i class="on"></i><i></i>
        </div>
        <span class="wizard-skip">跳过</span>
      </div>
      <div class="wizard-body">
        <div class="ask-index">第 2 个问题</div>
        <h1 class="ask-q">每周能拿出多少时间？</h1>
        <div class="ask-why">这决定每个小目标排多大。估不准就选个大概，之后能改。</div>

        <div class="ask-suggests">
          <button class="ask-chip" type="button">${ui('check')} 5 小时以内 <span class="chip-note">每周 2–3 次</span></button>
          <button class="ask-chip on" type="button">${ui('check')} 5–10 小时 <span class="chip-note">每周 4–5 次</span></button>
          <button class="ask-chip" type="button">${ui('check')} 10 小时以上 <span class="chip-note">基本每天</span></button>
        </div>

        <div class="ask-or">补充一句</div>
        <textarea class="ask-input" rows="2" placeholder="比如：周末整天有空，工作日只有晚上"></textarea>

        <div class="ask-typing" aria-live="polite">
          <i></i><i></i><i></i><span>正在理解你的情况…</span>
        </div>
      </div>
      <div class="wizard-foot">
        <button class="btn-primary" type="button" style="width:100%">看看它排的</button>
      </div>
    </div>`;
  }

  // 向导第 3 步：候选方案，勾选后写入
  function wizardPlan() {
    const items = [
      { name: '学完 Python 异步与类型标注', when: '第 1–2 周', diff: 2, pts: '+120', on: true },
      { name: '跟做一个能调工具的最小 Agent', when: '第 3–4 周', diff: 3, pts: '+180', on: true },
      { name: '写一份 Agent 项目 README 与演示', when: '第 5 周', diff: 3, pts: '+150', on: true },
      { name: '投 20 份简历并记录反馈', when: '第 6–7 周', diff: 4, pts: '+200', on: false },
      { name: '复盘面试，补齐短板', when: '第 8 周', diff: 4, pts: '+160', on: false }
    ];
    return `<div class="wizard">
      <div class="wizard-top">
        <button class="wizard-back" type="button" aria-label="返回">${ui('left')}</button>
        <div class="wizard-steps" aria-label="第 3 步，共 3 步">
          <i class="done"></i><i class="done"></i><i class="on"></i>
        </div>
        <span class="wizard-skip">重新说</span>
      </div>
      <div class="wizard-body">
        <div class="plan-head">
          <h1 class="plan-title">这样排，你看行吗</h1>
          <div class="plan-sub">按每周 5–10 小时估的。取消勾选的不会建，之后也能自己加。</div>
        </div>

        <div class="plan-summary">
          <span><b>8</b> 周</span>
          <span><b>5</b> 个小目标</span>
          <span>合计 <b>+810</b> 分</span>
        </div>

        <div class="plan-list">
          ${items.map((i) => `<div class="plan-item ${i.on ? 'on' : ''}">
            <span class="plan-check" aria-hidden="true">${ui('check')}</span>
            <div class="plan-main">
              <div class="plan-name">${i.name}</div>
              <div class="plan-meta"><span>${i.when}</span><span class="sep">·</span>${diffBadge(i.diff)}</div>
            </div>
            <span class="plan-pts">${i.pts}</span>
          </div>`).join('')}
        </div>

        <button class="plan-more" type="button">${ui('plus')} 自己再加一个</button>

        <div class="plan-note">
          <b>写入后</b>：这些会变成小目标，按周依次出现。前面的延期，后面的整体往后挪；你也可以随时手改日期和内容。
        </div>
      </div>
      <div class="wizard-foot">
        <button class="btn-primary" type="button" style="width:100%">建这 3 个</button>
      </div>
    </div>`;
  }

  // 目标页顶部带入口条的版本
  function goalsWithEntry(opts = {}) {
    const base = goalsScreen(opts);
    return base.replace('<div class="goals-toolbar">', `${aiEntry()}<div class="goals-toolbar">`);
  }

  /* ============ 目标页下方：内嵌对话 Agent ============ */

  function agentHead(state) {
    return `<div class="agent-box-head">
      <span class="agent-mark" aria-hidden="true">✨</span>
      <span class="agent-name">zoowy</span>
      <span class="agent-state">${state}</span>
    </div>`;
  }

  function agentInput(placeholder, on) {
    return `<div class="agent-input">
      <input type="text" placeholder="${placeholder}" aria-label="给 zoowy 发消息"/>
      <button class="agent-send ${on ? '' : 'off'}" type="button" aria-label="发送">${ui('right')}</button>
    </div>`;
  }

  // 收起态不再用：Agent 常驻在页面里，直接对话
  function agentCollapsed() {
    return agentOpened();
  }

  // 阶段 1：刚打开，一句开场白
  function agentOpened() {
    return `<div class="agent-box">
      ${agentHead('刚打开')}
      <div class="agent-thread">
        <div class="msg">
          <span class="msg-avatar" aria-hidden="true">✨</span>
          <div class="msg-bubble">想做成什么事？说个大概就行，我帮你排成每周做的小目标。</div>
        </div>
      </div>
      <div class="agent-quick">
        <button class="quick-chip" type="button">找 Agent 开发的工作</button>
        <button class="quick-chip" type="button">三个月考过雅思 6.5</button>
        <button class="quick-chip" type="button">体脂降到 18%</button>
      </div>
      ${agentInput('说说你想做成什么…', false)}
    </div>`;
  }

  // 阶段 2：用户说完，AI 追问一个关键条件
  function agentAsking() {
    return `<div class="agent-box">
      ${agentHead('正在问你')}
      <div class="agent-thread">
        <div class="msg">
          <span class="msg-avatar" aria-hidden="true">✨</span>
          <div class="msg-bubble">想做成什么事？说个大概就行，我帮你排成每周做的小目标。</div>
        </div>
        <div class="msg me">
          <span class="msg-avatar" aria-hidden="true">${cat()}</span>
          <div class="msg-bubble">半年内转岗做 AI 应用开发，现在只会写 Python</div>
        </div>
        <div class="msg">
          <span class="msg-avatar" aria-hidden="true">✨</span>
          <div class="msg-bubble">明白。每周大概能拿出多少时间？这决定每个小目标排多大。</div>
        </div>
      </div>
      <div class="agent-quick">
        <button class="quick-chip" type="button">5 小时以内</button>
        <button class="quick-chip" type="button">5–10 小时</button>
        <button class="quick-chip" type="button">10 小时以上</button>
      </div>
      ${agentInput('或者直接说你的情况…', true)}
    </div>`;
  }

  // 阶段 3：出候选，对话里直接给卡片
  function agentProposing() {
    const items = [
      { name: '学完 Python 异步与类型标注', when: '第 1–2 周', diff: 2, pts: '+120' },
      { name: '跟做一个能调工具的最小 Agent', when: '第 3–4 周', diff: 3, pts: '+180' },
      { name: '写一份 Agent 项目 README 与演示', when: '第 5 周', diff: 3, pts: '+150' }
    ];
    return `<div class="agent-box">
      ${agentHead('出了方案')}
      <div class="agent-thread">
        <div class="msg me">
          <span class="msg-avatar" aria-hidden="true">${cat()}</span>
          <div class="msg-bubble">5–10 小时</div>
        </div>
        <div class="msg">
          <span class="msg-avatar" aria-hidden="true">✨</span>
          <div class="msg-bubble">
            按 8 周排了 5 个，先给你看前 3 个：
            <div class="msg-plan">
              ${items.map((i) => `<div class="msg-plan-item">
                <div class="msg-plan-main">
                  <div class="msg-plan-name">${i.name}</div>
                  <div class="msg-plan-meta"><span>${i.when}</span>${diffBadge(i.diff)}</div>
                </div>
                <span class="msg-plan-pts">${i.pts}</span>
              </div>`).join('')}
            </div>
          </div>
        </div>
        <div class="msg">
          <span class="msg-avatar" aria-hidden="true">✨</span>
          <div class="msg-bubble">这样排行吗？确认后我就建成小目标，之后你也能改。</div>
        </div>
      </div>
      <div class="agent-confirm">
        <button class="btn-primary" type="button">${ui('check')} 就按这个建</button>
        <button class="btn-ghost" type="button">再改改</button>
      </div>
    </div>`;
  }

  // 阶段 4：建完，会话收尾
  function agentDone() {
    return `<div class="agent-box">
      ${agentHead('已完成')}
      <div class="agent-thread">
        <div class="msg me">
          <span class="msg-avatar" aria-hidden="true">${cat()}</span>
          <div class="msg-bubble">就按这个建</div>
        </div>
        <div class="msg">
          <span class="msg-avatar" aria-hidden="true">✨</span>
          <div class="msg-bubble">建好了，5 个小目标已排进 8 周。第一周的「学完 Python 异步与类型标注」现在就能开始。</div>
        </div>
        <div class="msg">
          <span class="msg-avatar" aria-hidden="true">✨</span>
          <div class="msg-bubble">想调整顺序或时间，随时跟我说。</div>
        </div>
      </div>
      ${agentInput('还想改点什么…', false)}
    </div>`;
  }

  const AGENT_STAGES = {
    collapsed: agentCollapsed,
    opened: agentOpened,
    asking: agentAsking,
    proposing: agentProposing,
    done: agentDone
  };

  // 目标页 + 下方 Agent 框
  function goalsWithAgent(stage = 'collapsed') {
    const base = goalsScreen({ mode: 'week' });
    const box = (AGENT_STAGES[stage] || agentCollapsed)();
    const tall = ['proposing', 'done'].includes(stage);
    const cls = stage === 'collapsed' ? 'has-agent' : (tall ? 'has-agent has-agent-tall' : 'has-agent');
    return base
      .replace('<div class="screen">', `<div class="screen ${cls}">`)
      .replace('</div>' + nav('goals'), `${box}</div>` + nav('goals'));
  }

  const screens = {
    home: homeScreen,
    'home-inbox': () => homeScreen({ inbox: true }),
    goals: () => goalsScreen({ mode: 'week' }),
    'goals-month': () => goalsScreen({ mode: 'month' }),
    'goals-stage': () => goalsScreen({ type: 'stage' }),
    'goals-empty': () => goalsScreen({ empty: true }),
    'goals-stage-empty': () => goalsScreen({ type: 'stage', empty: true }),
    'goals-cell': () => `${goalsScreen({ mode: 'week' })}${cellDetailSheet()}`,
    'goals-new': () => `${goalsScreen({ mode: 'week' })}${newGoalSheet()}`,
    'agent-collapsed': () => goalsWithAgent('collapsed'),
    'agent-opened': () => goalsWithAgent('opened'),
    'agent-asking': () => goalsWithAgent('asking'),
    'agent-proposing': () => goalsWithAgent('proposing'),
    'agent-done': () => goalsWithAgent('done'),
    partner: () => partnerScreen({ tab: 'live' }),
    'partner-data': () => partnerScreen({ tab: 'data' }),
    wish: wishScreen,
    'wish-empty': () => wishScreen({ empty: true }),
    me: meScreen,
    login: loginScreen
  };
  app.innerHTML = (screens[screen] || homeScreen)();
})();
