// 我们页：对方可见的一切 —— 状态对比、对方目标、今日打卡与驳回。
const PartnerPage = {
  async render(root) {
    root.innerHTML = '<div class="page-loading">加载中…</div>';
    try {
      await this.draw(root);
    } catch (e) {
      root.innerHTML = `<div class="empty big"><div class="empty-emoji">😿</div><div>${UI.esc(e.message)}</div><button class="btn primary" id="retry">重试</button></div>`;
      root.querySelector('#retry').addEventListener('click', () => PartnerPage.render(root));
    }
  },

  async draw(root) {
    const data = await api.get('/api/partner');
    const { partner, partnerStats, myStats, partnerGoals, partnerToday, today } = data;

    root.innerHTML = `
      <header class="page-head">
        <div>
          <div class="hello">我们</div>
          <div class="date-line">互相看得见，才坚持得住</div>
        </div>
      </header>

      <section class="partner-card">
        <span class="ps-avatar big">${UI.esc(partner.avatar)}</span>
        <div class="pc-main">
          <div class="pc-name">${UI.esc(partner.nickname)}</div>
          <div class="pc-meta">${window.icon('flame')} 连续 ${partnerStats.currentStreak} 天 · 本月 +${UI.fmtNum(partnerStats.monthPoints)} 分</div>
        </div>
        <div class="pc-today">
          <div class="pc-today-num">${today.checked}<span>/${today.expected}</span></div>
          <div class="pc-today-label">今日打卡</div>
        </div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>并排看看</h2><span class="sec-count">不比输赢</span></div>
        <div class="compare-card">
          ${compareCol('我', App.state.me, myStats, false)}
          <div class="cmp-divider"></div>
          ${compareCol(UI.esc(partner.nickname), partner, partnerStats, true)}
        </div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>${UI.esc(partner.nickname)} 今天的打卡</h2></div>
        ${partnerToday.length ? `
        <div class="pcheck-list">
          ${partnerToday.map((c) => pcheckRow(c)).join('')}
        </div>` : `
        <div class="empty small">
          <div class="empty-emoji">☕</div>
          <div class="empty-sub">ta 今天还没打卡，别催，系统会提醒</div>
        </div>`}
      </section>

      <section class="sec">
        <div class="sec-head"><h2>ta 的目标</h2></div>
        ${partnerGoals.filter((g) => g.status === 'active').length ? `
        <div class="pgoal-list">
          ${partnerGoals.filter((g) => g.status === 'active').map((g) => `
            <div class="pgoal-row">
              <span class="g-emoji">${g.emoji}</span>
              <div class="pgoal-main">
                <div class="pgoal-title">${UI.esc(g.title)}</div>
                <div class="pgoal-meta">${freqText(g)} · 每次 +${UI.fmtNum(g.perCheckinPoints)} 分</div>
              </div>
              <div class="pgoal-streak">${window.icon('flame')} ${g.streak}</div>
            </div>`).join('')}
        </div>` : `<div class="empty small"><div class="empty-emoji">🌱</div><div class="empty-sub">ta 还没建目标</div></div>`}
      </section>

      <section class="sec">
        <div class="sec-head"><h2>ta 最近的兑换</h2></div>
        ${data.partnerRecentRedemptions.length ? `
        <div class="pgoal-list">
          ${data.partnerRecentRedemptions.slice(0, 5).map((r) => `
            <div class="pgoal-row">
              <span class="g-emoji">${r.item_emoji}</span>
              <div class="pgoal-main">
                <div class="pgoal-title">${UI.esc(r.item_title)}</div>
                <div class="pgoal-meta">${UI.fmtTimeIso(r.applied_at)} · ${UI.fmtNum(r.points_locked)} 分</div>
              </div>
            </div>`).join('')}
        </div>` : `<div class="empty small"><div class="empty-emoji">🛍️</div><div class="empty-sub">还没有</div></div>`}
      </section>
    `;

    root.querySelectorAll('.btn-reject').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = partnerToday.find((x) => x.id === Number(btn.dataset.id));
        if (c) this.rejectSheet(c, root);
      });
    });
  },

  async rejectSheet(c, root) {
    const body = document.createElement('div');
    body.className = 'reject-body';
    body.innerHTML = `
      <div class="rb-item">
        <span class="rb-emoji">${c.goalEmoji}</span>
        <div>
          <div class="rb-title">${UI.esc(c.goalTitle)}</div>
          <div class="rb-price">+${UI.fmtNum(c.points)} 分 · ${c.durationMin} 分钟</div>
        </div>
      </div>
      <label class="gf-label">为什么驳回？（会退回这几分，对方看得见理由）</label>
      <textarea id="rj-reason" rows="3" maxlength="200" placeholder="比如：时长和实际对不上"></textarea>
    `;
    UI.sheet({
      title: '驳回这次打卡',
      body,
      actions: [
        { label: '再想想', onClick: (cl) => cl() },
        {
          label: '驳回',
          kind: 'danger',
          async onClick(close) {
            const reason = body.querySelector('#rj-reason').value.trim();
            if (!reason) { UI.toast('写一句理由，对方才知道问题在哪', 'warn'); return; }
            try {
              await api.post(`/api/checkins/${c.id}/reject`, { reason });
              close();
              UI.toast('已驳回，分数已退回', 'warn');
              PartnerPage.draw(root);
            } catch (e) {
              UI.toast(e.message, 'err');
            }
          },
        },
      ],
    });
  },
};

function compareCol(name, user, stats, isPartner) {
  const rows = [
    ['本月得分', `+${UI.fmtNum(stats.monthPoints)}`],
    ['连续天数', `${stats.currentStreak} 天`],
    ['本月完成率', stats.completion === null ? '—' : `${stats.completion}%`],
    ['时间投入', `${(stats.timeInvestMin / 60).toFixed(1)} 小时`],
    ['当前余额', UI.fmtNum(stats.balance)],
  ];
  return `
    <div class="cmp-col">
      <div class="cmp-name">${user.avatar || ''} ${name}</div>
      ${rows.map(([k, v]) => `<div class="cmp-row"><span>${k}</span><b>${v}</b></div>`).join('')}
    </div>`;
}

function pcheckRow(c) {
  return `
    <div class="pcheck-row">
      <span class="pc-emoji">${c.goalEmoji}</span>
      <div class="pc-main">
        <div class="pc-title">${UI.esc(c.goalTitle)} <b class="ok-txt">+${UI.fmtNum(c.points)}</b></div>
        <div class="pc-meta">${c.durationMin} 分钟 · ${UI.fmtTimeIso(c.createdAt)}</div>
        ${c.evidenceText ? `<div class="pc-evidence">“${UI.esc(c.evidenceText)}”</div>` : ''}
        ${c.evidenceUrl ? `<img class="pc-evidence-img" src="${c.evidenceUrl}" alt="证据图" loading="lazy"/>` : ''}
      </div>
      ${c.status === 'credited' ? `<button class="btn-reject" data-id="${c.id}">驳回</button>` : `<span class="st gray">${c.status === 'rejected' ? '已驳回' : '已撤销'}</span>`}
    </div>`;
}

function freqText(g) {
  if (g.freq_mode === 'daily') return '每日';
  if (g.freq_mode === 'weekly') return `每周 ${g.freq_n} 次`;
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  return '周' + (g.weekdays || '').split(',').map((d) => names[Number(d) - 1]).join('·');
}
