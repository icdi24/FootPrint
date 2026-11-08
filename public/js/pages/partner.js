// 我们页：双 Tab（互动默认 / 数据对比），对齐 UI 优化方案 3.8–3.10
const PartnerPage = {
  async render(root) {
    root.innerHTML = UI.cloudLoading ? UI.cloudLoading('正在联络搭档的打卡数据... 👫') : '<div class="page-loading">加载中…</div>';
    try {
      await this.draw(root);
    } catch (e) {
      root.innerHTML = `<div class="empty big"><div class="empty-emoji">😿</div><div>${UI.esc(e.message)}</div><button class="btn primary" id="retry">重试</button></div>`;
      root.querySelector('#retry').addEventListener('click', () => PartnerPage.render(root));
    }
  },

  tab: 'live',

  async draw(root) {
    const data = await api.get('/api/partner');
    if (!data.partner) {
      root.innerHTML = `
        <div class="pf-screen">
          <header class="pf-head"><div><h1 class="pf-title">我们</h1><div class="pf-sub">还没有搭档</div></div></header>
          <div class="pf-empty">
            <div class="pf-empty-emoji">🤝</div>
            <div class="pf-empty-title">先和一个人绑在一起</div>
            <div class="pf-empty-sub">生成邀请码，发给对方，两个人就能互相看见。</div>
            <button class="pf-btn-primary" id="partner-invite">生成邀请码</button>
          </div>
        </div>`;
      root.querySelector('#partner-invite').addEventListener('click', () => this.inviteSheet());
      return;
    }

    const { partner, partnerStats, myStats, today, pendingVerifications = [], partnerToday } = data;
    const tab = this.tab;
    const pendingCount = pendingVerifications.length;

    let usageHtml = '';
    if (tab === 'data') {
      const [mineRes, partnerUsageRes, rangeRes] = await Promise.allSettled([
        api.get('/api/usage/today'),
        api.get('/api/usage/partner'),
        api.get('/api/usage/range?days=7'),
      ]);
      usageHtml = this.usageSection(mineRes, partnerUsageRes, partner)
        + this.weekChart(rangeRes.status === 'fulfilled' ? rangeRes.value : null, partner);
    }

    root.innerHTML = `
      <div class="pf-screen">
        <header class="pf-head">
          <div><h1 class="pf-title">我们</h1><div class="pf-sub">和 ${UI.esc(partner.nickname)} · 今日 ${today.checked}/${today.expected}</div></div>
        </header>

        <div class="pf-tabs" role="tablist">
          <button class="pf-tab ${tab === 'live' ? 'on' : ''}" data-tab="live" role="tab" aria-selected="${tab === 'live'}">${window.icon('us')} 互动${pendingCount ? `<span class="pf-tab-badge">${pendingCount}</span>` : ''}</button>
          <button class="pf-tab ${tab === 'data' ? 'on' : ''}" data-tab="data" role="tab" aria-selected="${tab === 'data'}">${window.icon('target')} 数据对比</button>
        </div>

        ${tab === 'live' ? this.liveTab(data) : this.dataTab(data, myStats, partnerStats, usageHtml)}
      </div>
    `;

    root.querySelectorAll('.pf-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab;
        this.draw(root);
      });
    });

    if (tab === 'live') {
      root.querySelectorAll('.pf-vfy-approve').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const v = pendingVerifications.find((x) => x.id === Number(btn.dataset.id));
          if (!v) return;
          const yes = await UI.confirm(`通过「${UI.esc(v.goal_title)}」的验收吗？<br/>对方将入账 +${UI.fmtNum(Number(v.total_points) || 0)} 分。`, { okLabel: '通过' });
          if (!yes) return;
          try {
            const r = await api.post(`/api/verifications/${v.id}/approve`);
            UI.toast(r.overdue ? `已通过（逾期，入账 90%），+${UI.fmtNum(r.points)} 分` : `已通过，+${UI.fmtNum(r.points)} 分入账`, 'ok');
            PartnerPage.draw(root);
          } catch (e) { UI.toast(e.message, 'err'); }
        });
      });
      root.querySelectorAll('.pf-vfy-reject').forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = pendingVerifications.find((x) => x.id === Number(btn.dataset.id));
          if (v) this.rejectVerifySheet(v, root);
        });
      });
      root.querySelectorAll('.pf-reject').forEach((btn) => {
        btn.addEventListener('click', () => {
          const c = (partnerToday || []).find((x) => x.id === Number(btn.dataset.id));
          if (c) this.rejectSheet(c, root);
        });
      });
      root.querySelectorAll('.pf-nudge').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.nudge(btn);
        });
      });
    }
  },

  liveTab(data) {
    const { partner, partnerToday = [], today, pendingVerifications = [] } = data;
    const nudges = [
      ['flame', '加油'], ['us', '拍一拍'], ['clock', '早点睡'],
      ['check', '今天很棒'], ['me', '别太累'], ['gift', '辛苦了'],
    ];
    return `
      <section class="pf-nudge-card">
        <div class="pf-nudge-head"><span>给 ${UI.esc(partner.nickname)} 发一句</span><span class="pf-nudge-quota">不催，只递一句</span></div>
        <div class="pf-nudge-grid">
          ${nudges.map(([ic, label]) => `<button class="pf-nudge" data-label="${label}">${window.icon(ic)} ${label}</button>`).join('')}
        </div>
      </section>

      ${pendingVerifications.length ? `
      <section class="pf-pending">
        <div class="pf-pending-top"><span class="pf-pending-kicker">待你验收</span><span class="pf-pending-count">${pendingVerifications.length} 条</span></div>
        ${pendingVerifications.map((v) => `
          <div class="pf-pending-item">
            <div class="pf-pending-title">${UI.esc(v.goal_title)}</div>
            <div class="pf-pending-meta">${UI.esc(v.submitter_nickname || partner.nickname)} · +${UI.fmtNum(Number(v.total_points) || 0)} 分</div>
            ${v.self_statement ? `<div class="pf-pending-quote">“${UI.esc(v.self_statement)}”</div>` : ''}
            <div class="pf-pending-actions">
              <button class="pf-btn-primary sm pf-vfy-approve" data-id="${v.id}">${window.icon('check')} 去验收</button>
              <button class="pf-btn-ghost pf-vfy-reject" data-id="${v.id}">驳回</button>
            </div>
          </div>`).join('')}
      </section>` : ''}

      <section class="pf-section">
        <div class="pf-section-head"><h2 class="pf-section-title">${UI.esc(partner.nickname)} 今天</h2><span class="pf-section-note">${today.checked}/${today.expected}</span></div>
        ${partnerToday.length ? `
        <div class="pf-list">
          ${partnerToday.map((c) => `
            <div class="pf-row">
              <span class="pf-tile sm">${UI.esc(c.goalEmoji || '🎯')}</span>
              <div class="pf-row-main">
                <div class="pf-row-title">${UI.esc(c.goalTitle)} <span class="pf-row-points">+${UI.fmtNum(c.points)}</span></div>
                <div class="pf-row-meta">${c.durationMin} 分钟 · ${UI.fmtTimeIso(c.createdAt)}</div>
                ${c.evidenceText ? `<div class="pf-row-quote">“${UI.esc(c.evidenceText)}”</div>` : ''}
              </div>
              ${c.status === 'credited' ? `<button class="pf-btn-ghost small pf-reject" data-id="${c.id}">驳回</button>` : `<span class="pf-tag">${c.status === 'rejected' ? '已驳回' : '已撤销'}</span>`}
            </div>`).join('')}
        </div>` : `<div class="pf-empty-row">${UI.esc(partner.nickname)} 今天还没打卡，别催，系统会提醒</div>`}
      </section>

      <section class="pf-section">
        <div class="pf-section-head"><h2 class="pf-section-title">我的搭档</h2></div>
        <div class="pf-partner-card">
          <span class="pf-avatar big">${UI.esc(partner.avatar)}</span>
          <div class="pf-row-main">
            <div class="pf-row-title">${UI.esc(partner.nickname)}</div>
            <div class="pf-row-meta">已绑定 · 今日 ${today.checked}/${today.expected}</div>
          </div>
        </div>
      </section>`;
  },

  dataTab(data, myStats, partnerStats, usageHtml) {
    const { partner } = data;
    const rows = [
      ['本月得分', `+${UI.fmtNum(myStats.monthPoints)}`, `+${UI.fmtNum(partnerStats.monthPoints)}`],
      ['连续天数', `${myStats.currentStreak} 天`, `${partnerStats.currentStreak} 天`],
      ['本月完成率', myStats.completion === null ? '—' : `${myStats.completion}%`, partnerStats.completion === null ? '—' : `${partnerStats.completion}%`],
      ['时间投入', `${(myStats.timeInvestMin / 60).toFixed(1)} 小时`, `${(partnerStats.timeInvestMin / 60).toFixed(1)} 小时`],
      ['当前余额', UI.fmtNum(myStats.balance), UI.fmtNum(partnerStats.balance)],
    ];
    return `
      <section class="pf-section">
        <div class="pf-section-head"><h2 class="pf-section-title">并排看看</h2><span class="pf-section-note">不比输赢</span></div>
        <div class="pf-compare">
          <div class="pf-cmp-head"><span>指标</span><span>我</span><span>${UI.esc(partner.nickname)}</span></div>
          ${rows.map(([k, a, b]) => `<div class="pf-cmp-row"><span>${k}</span><b>${a}</b><b>${b}</b></div>`).join('')}
        </div>
      </section>
      ${usageHtml}
    `;
  },

  async nudge(btn) {
    if (btn.classList.contains('sent')) return;
    const label = btn.dataset.label;
    btn.classList.add('sent');
    setTimeout(() => btn.classList.remove('sent'), 1600);
    UI.toast(`给搭子递了一句「${label}」`, 'ok');
  },

  async inviteSheet() {
    try {
      const d = await api.post('/api/pair/invite', {});
      const body = document.createElement('div');
      body.className = 'pf-invite-card';
      body.innerHTML = `
        <div class="pf-invite-top">${window.icon('us')}</div>
        <div class="pf-invite-title">邀请一个人一起坚持</div>
        <div class="pf-invite-code">${UI.esc(d.code)}</div>
        <div class="pf-invite-hint">24 小时内有效，只能用一次</div>
        <button class="pf-btn-primary" id="pf-copy">复制邀请码</button>`;
      body.querySelector('#pf-copy').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(d.code);
          UI.toast('邀请码已复制', 'ok');
        } catch (e) { UI.toast('复制失败，手动记一下吧', 'warn'); }
      });
      UI.sheet({ title: '邀请码', body, actions: [{ label: '知道了', onClick: (close) => close() }] });
    } catch (e) { UI.toast(e.message, 'err'); }
  },

  usageSection(mineRes, partnerRes, partner) {
    const mine = mineRes.status === 'fulfilled' ? mineRes.value : null;
    const pu = partnerRes.status === 'fulfilled' ? partnerRes.value : null;
    if (!mine && !pu) return '';
    const nick = UI.esc((pu && pu.partner && pu.partner.nickname) || partner.nickname);
    const mySec = mine ? mine.totalSeconds : 0;
    const taSec = pu ? pu.totalSeconds : 0;
    const maxSec = Math.max(mySec, taSec, 1);
    const barPct = (sec) => (sec <= 0 ? 0 : Math.max(8, Math.round((sec / maxSec) * 100)));
    const hm = (sec) => {
      const m = Math.round(Number(sec || 0) / 60);
      return { h: Math.floor(m / 60), mm: m % 60 };
    };
    const col = (name, sec, ok) => {
      if (!ok) return `<div class="pf-usage-col"><div class="pf-usage-who">${name}</div><div class="pf-usage-empty">—</div><div class="pf-usage-bar"><i style="width:0"></i></div><div class="pf-usage-note">暂时读不到</div></div>`;
      if (!sec) return `<div class="pf-usage-col"><div class="pf-usage-who">${name}</div><div class="pf-usage-empty">还没数据</div><div class="pf-usage-bar"><i style="width:0"></i></div><div class="pf-usage-note">没有上报</div></div>`;
      const { h, mm } = hm(sec);
      return `<div class="pf-usage-col"><div class="pf-usage-who">${name}</div><div class="pf-usage-num"><b>${h}</b><i>时</i><b>${mm}</b><i>分</i></div><div class="pf-usage-bar"><i style="width:${barPct(sec)}%"></i></div><div class="pf-usage-note">${Math.round(sec / 60)} 分钟</div></div>`;
    };
    return `
      <section class="pf-section">
        <div class="pf-section-head"><h2 class="pf-section-title">手机在谁手里</h2><span class="pf-section-note">今日</span></div>
        <div class="pf-usage-card">
          ${col('我', mySec, !!mine)}
          ${col(nick, taSec, !!pu)}
        </div>
      </section>`;
  },

  weekChart(range, partner) {
    if (!range || !range.partner || !range.me) return '';
    const W = 640, H = 180, PAD_L = 34, PAD_B = 22, PAD_T = 14;
    const days = range.days || 7;
    const seriesMe = range.me.series, seriesTa = range.partner.series;
    const maxSec = Math.max(60 * 60, ...seriesMe.concat(seriesTa).map((d) => d.totalSeconds || 0));
    const x = (i) => PAD_L + (i * (W - PAD_L - 12)) / (days - 1);
    const y = (sec) => sec == null ? null : PAD_T + (1 - sec / maxSec) * (H - PAD_T - PAD_B);
    function path(series) {
      let d = '', moving = false;
      series.forEach((pt, i) => {
        const yy = y(pt.totalSeconds);
        if (yy == null) { moving = false; return; }
        d += (moving ? ' L' : ' M') + `${x(i).toFixed(1)},${yy.toFixed(1)}`;
        moving = true;
      });
      return d;
    }
    const dots = (series, cls) => series.map((pt, i) => {
      const yy = y(pt.totalSeconds);
      if (yy == null) return `<circle cx="${x(i)}" cy="${H - PAD_B}" r="2.5" fill-opacity="0.9" class="pf-wc-gap"/>`;
      return `<circle cx="${x(i)}" cy="${yy.toFixed(1)}" r="3" class="${cls}"/>`;
    }).join('');
    const labels = seriesMe.map((pt, i) => (i % 2 === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="pf-wc-label">${Number(pt.date.slice(8))}</text>` : '')).join('');
    return `
      <section class="pf-section">
        <div class="pf-section-head"><h2 class="pf-section-title">7 天手机时长</h2><span class="pf-section-note">断点 = 没上报</span></div>
        <div class="pf-wc-card">
          <svg viewBox="0 0 ${W} ${H}" class="pf-wc-svg" role="img" aria-label="7 天手机时长折线">
            <path d="${path(seriesMe)}" class="pf-wc-line me"/>
            <path d="${path(seriesTa)}" class="pf-wc-line ta"/>
            ${dots(seriesMe, 'pf-wc-dot me')}${dots(seriesTa, 'pf-wc-dot ta')}
            ${labels}
          </svg>
          <div class="pf-wc-legend"><span><i class="me"></i>我</span><span><i class="ta"></i>${UI.esc(partner.nickname)}</span></div>
        </div>
      </section>`;
  },

  async rejectVerifySheet(v, root) {
    const body = document.createElement('div');
    body.className = 'reject-body';
    body.innerHTML = `
      <div class="rb-item">
        <span class="rb-emoji">${UI.esc(v.goal_emoji || '🎯')}</span>
        <div><div class="rb-title">${UI.esc(v.goal_title)}</div><div class="rb-price">达成 +${UI.fmtNum(Number(v.total_points) || 0)} 分</div></div>
      </div>
      <label class="gf-label">为什么驳回？</label>
      <textarea id="vfy-reason" rows="3" maxlength="200" placeholder="比如：验收标准没完全满足"></textarea>`;
    UI.sheet({
      title: '驳回这次验收',
      body,
      actions: [
        { label: '再想想', onClick: (cl) => cl() },
        {
          label: '驳回',
          kind: 'danger',
          async onClick(close) {
            const reason = body.querySelector('#vfy-reason').value.trim();
            if (!reason) { UI.toast('写一句理由，对方才知道差在哪', 'warn'); return; }
            try {
              await api.post(`/api/verifications/${v.id}/reject`, { reason });
              close();
              UI.toast('已驳回，目标退回进行中', 'warn');
              PartnerPage.draw(root);
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
      ],
    });
  },

  async rejectSheet(c, root) {
    const body = document.createElement('div');
    body.className = 'reject-body';
    body.innerHTML = `
      <div class="rb-item">
        <span class="rb-emoji">${c.goalEmoji}</span>
        <div><div class="rb-title">${UI.esc(c.goalTitle)}</div><div class="rb-price">+${UI.fmtNum(c.points)} 分 · ${c.durationMin} 分钟</div></div>
      </div>
      <label class="gf-label">为什么驳回？</label>
      <textarea id="rj-reason" rows="3" maxlength="200" placeholder="比如：时长和实际对不上"></textarea>`;
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
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
      ],
    });
  },
};
