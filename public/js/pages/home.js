// 首页：问候 + 积分横幅 + 今日待办 + 对方动态。
const HomePage = {
  async render(root) {
    root.innerHTML = '<div class="page-loading">加载中…</div>';
    let data;
    try {
      data = await api.get('/api/home');
    } catch (e) {
      root.innerHTML = `<div class="empty big"><div class="empty-emoji">😿</div><div>${UI.esc(e.message)}</div><button class="btn primary" id="retry">重试</button></div>`;
      root.querySelector('#retry').addEventListener('click', () => HomePage.render(root));
      return;
    }
    App.state.partner = data.partner;
    const { me, partner, balance, monthPoints, currentStreak, todos, stageGoals } = data;

    const pending = todos.filter((t) => (t.dueToday || (t.weekly && t.weekly.done < t.weekly.need)) && !t.checked);
    const done = todos.filter((t) => t.checked);

    const dateNow = new Date();
    const dateStr = `${dateNow.getMonth() + 1}月${dateNow.getDate()}日 周${'日一二三四五六'[dateNow.getDay()]}`;

    root.innerHTML = `
      <header class="page-head home-head">
        <div>
          <div class="hello">${UI.greeting()}，${UI.esc(me.nickname)} <span class="hello-avatar">${UI.esc(me.avatar)}</span></div>
          <div class="date-line">${dateStr}</div>
        </div>
      </header>

      <section class="balance-banner">
        <div class="bb-left">
          <div class="bb-label">${window.icon('coin')} 可用积分</div>
          <div class="bb-balance" id="bb-balance">${UI.fmtNum(balance)}</div>
          <div class="bb-yuan">≈ ¥${UI.fmtYuan(balance)}</div>
        </div>
        <div class="bb-right">
          <div class="bb-chip" title="当前最长连续">${window.icon('flame')}<b id="bb-streak">${currentStreak}</b> 天连续</div>
          <div class="bb-chip">本月 +${UI.fmtNum(monthPoints)}</div>
        </div>
      </section>

      <section class="sec">
        <div class="sec-head">
          <h2>今日待办</h2>
          ${pending.length ? `<span class="sec-count">剩 ${pending.length} 项</span>` : ''}
        </div>
        <div class="todo-list" id="todo-list">
          ${pending.map((t, i) => todoCard(t, i)).join('')}
        </div>
      </section>

      ${done.length ? `
      <section class="sec">
        <div class="sec-head"><h2>已完成</h2><span class="sec-count ok">${done.length} 项 ✓</span></div>
        <div class="todo-list done-list">
          ${done.map((t, i) => doneCard(t, i)).join('')}
        </div>
      </section>` : ''}

      ${stageGoals && stageGoals.length ? `
      <section class="sec">
        <div class="sec-head"><h2>进行中的小目标</h2><span class="sec-count">${stageGoals.length} 个</span></div>
        <div class="stage-list home-stage-list">
          ${stageGoals.map((g) => stageMiniCard(g)).join('')}
        </div>
      </section>` : ''}

      ${!pending.length && !done.length ? `
      <section class="sec">
        <div class="empty">
          <div class="empty-emoji">🌱</div>
          <div class="empty-title">今天还没有目标</div>
          <div class="empty-sub">去「目标」页建第一个打卡目标，两个人就都看得见了</div>
          <button class="btn primary" id="go-goals">去建目标</button>
        </div>
      </section>` : ''}

      ${partner ? `
      <section class="sec partner-strip" id="partner-strip">
        <span class="ps-avatar">${UI.esc(partner.avatar)}</span>
        <div class="ps-text">
          <b>${UI.esc(partner.nickname)}</b>
          ${partnerTodayText(data.partnerToday)}
        </div>
        <button class="ghost-btn" id="to-partner">去看看</button>
      </section>` : ''}
    `;

    root.querySelectorAll('#todo-list .btn-done').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = todos.find((x) => x.goal.id === Number(btn.dataset.id));
        if (!t) return;
        CheckinSheet.open(t.goal, { onSuccess: () => HomePage.render(root) });
      });
      // 长按 = 直接用预填时长提交
      let timer;
      btn.addEventListener('pointerdown', () => {
        timer = setTimeout(() => {
          const t = todos.find((x) => x.goal.id === Number(btn.dataset.id));
          if (!t) return;
          btn.classList.add('longpressing');
          CheckinSheet.instant(t.goal, { onSuccess: () => HomePage.render(root) });
        }, 550);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
        btn.addEventListener(ev, () => { clearTimeout(timer); btn.classList.remove('longpressing'); })
      );
    });

    const goGoals = root.querySelector('#go-goals');
    if (goGoals) goGoals.addEventListener('click', () => App.showTab('goals'));
    const toPartner = root.querySelector('#to-partner');
    if (toPartner) toPartner.addEventListener('click', () => App.showTab('partner'));

    root.querySelectorAll('.home-stage-list .stage-card').forEach((card) => {
      card.addEventListener('click', () => {
        GoalsPage.goalType = 'stage';
        App.showTab('goals');
      });
    });

    // 第一次进入出场：卡片依次浮入
    root.querySelectorAll('.todo-card, .done-card').forEach((el, i) => {
      el.style.animationDelay = `${Math.min(i * 60, 360)}ms`;
      el.classList.add('stagger-in');
    });
  },
};

function partnerTodayText(pt) {
  if (!pt) return '';
  if (!pt.checked) return pt.expected ? `今天还有 ${pt.expected} 张卡没打` : '今天还没打卡';
  return pt.expected > pt.checked ? `今天打了 ${pt.checked}/${pt.expected} 张卡` : `今天 ${pt.expected} 张卡全打完啦 🎉`;
}

function todoCard(t, i) {
  const g = t.goal;
  const meta = [];
  if (g.window_start) meta.push(`${g.window_start}–${g.window_end}`);
  else meta.push('全天');
  meta.push(`难度 ${g.difficulty}`);
  if (t.weekly) meta.push(`本周 ${t.weekly.done}/${t.weekly.need}`);
  return `
    <div class="todo-card" data-i="${i}">
      <div class="tc-emoji">${UI.esc(g.emoji)}</div>
      <div class="tc-main">
        <div class="tc-title">${UI.esc(g.title)}</div>
        <div class="tc-meta">${meta.join(' · ')}</div>
        <div class="tc-streak">${window.icon('flame')} 连续 ${t.streak} 天</div>
      </div>
      <div class="tc-side">
        <div class="tc-points">+${UI.fmtNum(t.pointsNow)}</div>
        <button class="btn-done" data-id="${g.id}">${window.icon('check')} 完成</button>
      </div>
    </div>`;
}

function doneCard(t) {
  const g = t.goal;
  return `
    <div class="todo-card done-card">
      <div class="tc-emoji">${UI.esc(g.emoji)}</div>
      <div class="tc-main">
        <div class="tc-title">${UI.esc(g.title)}</div>
        <div class="tc-meta">${t.checked.durationMin} 分钟${t.checked.evidenceText ? ' · 有记录' : ''}</div>
      </div>
      <div class="tc-side done-side">
        <div class="tc-points ok">+${UI.fmtNum(t.checked.points)}</div>
        <span class="done-check">${window.icon('check')}</span>
      </div>
    </div>`;
}

function stageMiniCard(g) {
  const badge = (g.status === 'reviewing') ? '<span class="sc-badge reviewing">待验收</span>' : '<span class="sc-badge active">进行中</span>';
  return `
    <div class="stage-card home-stage-card" data-id="${g.id}">
      <div class="sc-head">
        <span class="sc-emoji">${UI.esc(g.emoji || '🎯')}</span>
        <div class="sc-title-box">
          <div class="sc-title">${UI.esc(g.title)}</div>
          ${g.end_date ? `<div class="sc-meta">截止 ${UI.fmtDate(g.end_date)}</div>` : ''}
        </div>
        ${badge}
      </div>
      <div class="sc-points">${window.icon('coin')} 达成 +${UI.fmtNum(Number(g.total_points) || 0)} 分</div>
    </div>`;
}
