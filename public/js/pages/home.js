// 首页：功能完善版（主卡 + 已完成 + 搭子条）
const HomePage = {
  async render(root) {
    let data;
    try {
      data = await api.get('/api/home');
      root.innerHTML = ''; // 只在数据准备好后才清空 loading
    } catch (e) {
      root.innerHTML = `<div class="empty big"><div class="empty-emoji">😿</div><div>${UI.esc(e.message)}</div><button class="btn primary" id="retry">重试</button></div>`;
      root.querySelector('#retry').addEventListener('click', () => HomePage.render(root));
      return;
    }
    App.state.partner = data.partner;
    const { me, partner, balance, monthPoints, currentStreak, todos, stageGoals, currentPlanGoals } = data;
    const pending = todos.filter((t) => (t.dueToday || (t.weekly && t.weekly.done < t.weekly.need)) && !t.checked);
    const done = todos.filter((t) => t.checked);

    const dateNow = new Date();
    const dateStr = `${dateNow.getMonth() + 1}月${dateNow.getDate()}日 · 周${'日一二三四五六'[dateNow.getDay()]}`;

    root.innerHTML = `
      <div class="hf-screen">
        <header class="hf-top">
          <div>
            <div class="hf-date">${dateStr}</div>
            <h1 class="hf-greeting">${UI.greeting()}，${UI.esc(me.nickname)} <span class="hf-avatar">${window.PixelAvatars ? PixelAvatars.render(me.avatar) : UI.esc(me.avatar)}</span></h1>
          </div>
        </header>

        <section class="hf-points">
          <div class="hf-points-left">
            <div class="hf-points-label">${window.icon('coin')} 可用积分</div>
            <div class="hf-points-balance">${UI.fmtNum(balance)}</div>
            <div class="hf-points-yuan">≈ ¥${UI.fmtYuan(balance)}</div>
          </div>
          <div class="hf-points-right">
            <div class="hf-chip">${window.icon('flame')} ${currentStreak} 天连续</div>
            <div class="hf-chip">本月 +${UI.fmtNum(monthPoints)}</div>
          </div>
        </section>

        <section class="hf-section">
          <div class="hf-section-head"><h2 class="hf-section-title">今天</h2><span class="hf-section-note">${pending.length ? `剩 ${pending.length} 项` : '全部完成'}</span></div>
          ${pending.length ? `
            ${hfHeroTask(pending[0])}
            ${pending.length > 1 ? `<div class="hf-task-list">${pending.slice(1).map(hfTaskRow).join('')}</div>` : ''}
          ` : `
            <div class="hf-empty"><div class="hf-empty-emoji">🌱</div><div>今天没有待办，去建一个目标吧</div><button class="hf-btn-primary" id="go-goals">去建目标</button></div>
          `}
        </section>

        ${done.length ? `
        <section class="hf-section">
          <div class="hf-section-head"><h2 class="hf-section-title">已完成</h2><span class="hf-section-note">${done.length} 项</span></div>
          <div class="hf-done-list">${done.map(hfDoneRow).join('')}</div>
        </section>` : ''}

        ${stageGoals && stageGoals.length ? `
        <section class="hf-section">
          <div class="hf-section-head"><h2 class="hf-section-title">进行中的小目标</h2><span class="hf-section-note">${stageGoals.length} 个</span></div>
          <div class="hf-mini-list">
            ${stageGoals.map((g) => `<div class="hf-mini-row"><span class="hf-mini-emoji">${UI.esc(g.emoji || '🎯')}</span><div><div class="hf-mini-title">${UI.esc(g.title)}</div><div class="hf-mini-meta">${g.status === 'reviewing' ? '待验收' : '进行中'}${g.end_date ? ` · 截止 ${UI.fmtDate(g.end_date)}` : ''}</div></div><span class="hf-mini-points">+${UI.fmtNum(Number(g.total_points) || 0)}</span></div>`).join('')}
          </div>
        </section>` : ''}

        ${partner ? `
        <section class="hf-partner" id="partner-strip">
          <span class="hf-avatar sm">${window.PixelAvatars ? PixelAvatars.render(partner.avatar) : UI.esc(partner.avatar)}</span>
          <div class="hf-partner-copy">
            <div class="hf-partner-name">${UI.esc(partner.nickname)} <b>${data.partnerToday.checked}/${data.partnerToday.expected}</b></div>
            <div class="hf-partner-note">${hfPartnerNote(data.partnerToday)}</div>
          </div>
          <button class="hf-btn-ghost" id="to-partner">看看 ${window.icon('right')}</button>
        </section>` : ''}
      </div>
    `;

    root.querySelectorAll('[data-checkin-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = todos.find((x) => x.goal.id === Number(btn.dataset.checkinId));
        if (t) CheckinSheet.open(t.goal, { onSuccess: () => HomePage.render(root) });
      });
      let timer;
      btn.addEventListener('pointerdown', () => {
        timer = setTimeout(() => {
          const t = todos.find((x) => x.goal.id === Number(btn.dataset.checkinId));
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
  },
};

function hfDiff(level) {
  const n = Math.max(1, Math.min(5, Number(level) || 1));
  return `<span class="hf-diff" title="难度 ${n}">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}<b>${n}</b></span>`;
}

function hfTile(emoji, sm) {
  return `<span class="hf-tile ${sm ? 'sm' : ''}">${UI.esc(emoji || '🎯')}</span>`;
}

function hfMeta(t) {
  const g = t.goal;
  const parts = [];
  if (g.window_start) parts.push(`${g.window_start}–${g.window_end}`);
  else parts.push('全天');
  parts.push(`${g.duration_min} 分钟`);
  if (t.weekly) parts.push(`本周 ${t.weekly.done}/${t.weekly.need}`);
  return parts.join(' · ');
}

function hfHeroTask(t) {
  const g = t.goal;
  return `
    <article class="hf-hero-card">
      <div class="hf-hero-top">
        ${hfTile(g.emoji)}
        <div class="hf-hero-main">
          <h2 class="hf-hero-title">${UI.esc(g.title)}</h2>
          <div class="hf-hero-meta">${hfMeta(t)} ${hfDiff(g.difficulty)}</div>
        </div>
        <div class="hf-hero-points">+${UI.fmtNum(t.pointsNow)}</div>
      </div>
      <div class="hf-hero-bottom">
        <span class="hf-streak">${window.icon('flame')} ${t.streak} 天</span>
        <button class="hf-btn-primary" data-checkin-id="${g.id}">${window.icon('check')} 打卡</button>
      </div>
    </article>`;
}

function hfTaskRow(t) {
  const g = t.goal;
  return `
    <div class="hf-task-row">
      ${hfTile(g.emoji, true)}
      <div class="hf-task-main">
        <div class="hf-task-title">${UI.esc(g.title)}</div>
        <div class="hf-task-meta">${hfMeta(t)} ${hfDiff(g.difficulty)}</div>
        ${t.weekly ? `<div class="hf-progress">${Array.from({ length: t.weekly.need }, (_, i) => `<i class="${i < t.weekly.done ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      </div>
      <div class="hf-task-side"><span class="hf-task-points">+${UI.fmtNum(t.pointsNow)}</span><button class="hf-btn-small" data-checkin-id="${g.id}">完成</button></div>
    </div>`;
}

function hfDoneRow(t) {
  const g = t.goal;
  return `
    <div class="hf-done-row">
      ${hfTile(g.emoji, true)}
      <div class="hf-task-main">
        <div class="hf-task-title">${UI.esc(g.title)}</div>
        <div class="hf-task-meta">${t.checked.durationMin} 分钟${t.checked.evidenceText ? ' · 有记录' : ''} ${hfDiff(g.difficulty)}</div>
      </div>
      <div class="hf-task-side"><span class="hf-task-points ok">+${UI.fmtNum(t.checked.points)}</span><span class="hf-done-mark">${window.icon('check')}</span></div>
    </div>`;
}

function hfPartnerNote(pt) {
  if (!pt) return '';
  if (!pt.checked) return pt.expected ? `还有 ${pt.expected} 张没打` : '今天还没打卡';
  return pt.expected > pt.checked ? `今天打了 ${pt.checked}/${pt.expected} 张` : '今天全打完啦 🎉';
}
