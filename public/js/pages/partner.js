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
    const { partner, partnerStats, myStats, partnerGoals, partnerToday, today, pendingVerifications } = data;

    // 手机时长单独拉：失败只让卡片降级，不拖垮整页
    const [mineRes, partnerUsageRes, rangeRes] = await Promise.allSettled([
      api.get('/api/usage/today'),
      api.get('/api/usage/partner'),
      api.get('/api/usage/range?days=7'),
    ]);
    const usageHtml = PartnerPage.usageSection(mineRes, partnerUsageRes, partner)
      + this.weekChart(rangeRes.status === 'fulfilled' ? rangeRes.value : null, partner);
    const { partnerBigGoals = [], sharedDiaries = [], sharedProfile = [] } = data;

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

      ${usageHtml}

      ${partnerBigGoals.length ? `
      <section class="sec">
        <div class="sec-head"><h2>${UI.esc(partner.nickname)} 的大目标</h2><span class="sec-count">路线看得见</span></div>
        <div class="pbig-list">
          ${partnerBigGoals.map((b) => `
            <div class="pbig-card">
              <div class="pbig-head">
                <span class="sc-emoji">${UI.esc(b.emoji || '🏔️')}</span>
                <div class="pbig-title">${UI.esc(b.title)}</div>
                <span class="bgc-pct">${Math.max(0, Math.min(100, Number(b.progress) || 0))}%</span>
              </div>
              <div class="bgd-bar"><i style="width:${Math.max(0, Math.min(100, Number(b.progress) || 0))}%"></i></div>
              <div class="pbig-meta">已达成 ${b.done}/${b.total} 个小目标${b.progress_note ? ` · ${UI.esc(b.progress_note)}` : ''}</div>
            </div>`).join('')}
        </div>
      </section>` : ''}

      ${sharedDiaries.length || sharedProfile.length ? `
      <section class="sec">
        <div class="sec-head"><h2>${UI.esc(partner.nickname)} 分享的</h2><span class="sec-count">ta 主动给你看的</span></div>
        ${sharedProfile.length ? `
        <div class="pshare-profile">
          ${sharedProfile.map((p) => `
            <div class="pshare-row"><b>${UI.esc(p.block)}</b>${UI.esc(p.content).slice(0, 120)}</div>`).join('')}
        </div>` : ''}
        ${sharedDiaries.length ? `
        <div class="pshare-diaries">
          ${sharedDiaries.map((d) => `
            <div class="diary-card pshare-diary" data-date="${d.diary_date}">
              <div class="dc-date">${UI.fmtDate(d.diary_date)} 的日报</div>
              <div class="dc-preview">${UI.esc(String(d.content).slice(0, 80))}${String(d.content).length > 80 ? '…' : ''}</div>
            </div>`).join('')}
        </div>` : ''}
      </section>` : ''}

      ${pendingVerifications && pendingVerifications.length ? `
      <section class="sec">
        <div class="sec-head"><h2>待我验收</h2><span class="sec-count warn">${pendingVerifications.length} 条</span></div>
        <div class="vfy-list">
          ${pendingVerifications.map((v) => verifyCard(v)).join('')}
        </div>
      </section>` : ''}

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

    root.querySelectorAll('.vfy-approve').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const v = pendingVerifications.find((x) => x.id === Number(btn.dataset.id));
        if (!v) return;
        const yes = await UI.confirm(`通过「${UI.esc(v.goal_title)}」的验收吗？<br/>对方将入账 +${UI.fmtNum(Number(v.total_points) || 0)} 分。`, { okLabel: '通过' });
        if (!yes) return;
        try {
          const r = await api.post(`/api/verifications/${v.id}/approve`);
          UI.toast(r.overdue ? `已通过（逾期，入账 90%），+${UI.fmtNum(r.points)} 分` : `已通过，+${UI.fmtNum(r.points)} 分入账`, 'ok');
          PartnerPage.draw(root);
        } catch (e) {
          UI.toast(e.message, 'err');
        }
      });
    });
    root.querySelectorAll('.vfy-reject').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = pendingVerifications.find((x) => x.id === Number(btn.dataset.id));
        if (v) this.rejectVerifySheet(v, root);
      });
    });
    root.querySelectorAll('.vfy-detail').forEach((btn) => {
      btn.addEventListener('click', () => this.detailSheet(Number(btn.dataset.id), root));
    });
    root.querySelectorAll('.pshare-diary').forEach((card) => {
      card.addEventListener('click', () => {
        const d = sharedDiaries.find((x) => x.diary_date === card.dataset.date);
        if (!d) return;
        const body = document.createElement('div');
        body.className = 'diary-full';
        body.innerHTML = `<div class="df-text">${UI.esc(d.content).replace(/\n/g, '<br/>')}</div>`;
        UI.sheet({ title: `${UI.esc(partner.nickname)} 分享的日报 · ${UI.fmtDate(d.diary_date)}`, body, actions: [{ label: '关闭', onClick: (close) => close() }] });
      });
    });
  },

  // 待审核详情（P5-#21）：描述、验收标准、自述、证据、第几次提交、历史驳回理由
  async detailSheet(id, root) {
    let d;
    try {
      d = await api.get(`/api/verifications/${id}/detail`);
    } catch (e) { return UI.toast(e.message, 'err'); }
    const v = d.verification;
    const body = document.createElement('div');
    body.className = 'vfd-body';
    body.innerHTML = `
      <div class="vfd-goal">
        <span class="vfy-emoji">${UI.esc(d.goal.emoji || '🎯')}</span>
        <div>
          <div class="vfy-title">${UI.esc(d.goal.title)}</div>
          <div class="vfy-meta">${UI.esc(d.submitter.nickname)} · 第 ${v.submitCount} 次提交 · ${UI.fmtTimeIso(v.createdAt)}</div>
        </div>
      </div>
      ${d.goal.description ? `<div class="vfy-block"><span class="vfy-label">描述</span><div class="vfy-text">${UI.esc(d.goal.description)}</div></div>` : ''}
      <div class="vfy-block"><span class="vfy-label">验收标准</span><div class="vfy-text">${UI.esc(d.goal.acceptCriteria || '（没写）')}</div></div>
      ${v.selfStatement ? `<div class="vfy-block"><span class="vfy-label">自述</span><div class="vfy-text">${UI.esc(v.selfStatement)}</div></div>` : ''}
      ${v.evidenceText ? `<div class="vfy-block"><span class="vfy-label">证据文字</span><div class="vfy-text">${UI.esc(v.evidenceText)}</div></div>` : ''}
      ${v.evidenceUrls.length ? `<div class="vfy-block"><span class="vfy-label">证据图片</span><div class="vfd-imgs">${v.evidenceUrls.map((u) => `<img src="${u}" loading="lazy" alt="证据"/>`).join('')}</div></div>` : ''}
      ${d.goal.endDate ? `<div class="vfy-meta">截止 ${UI.fmtDate(d.goal.endDate)} · 达成 +${UI.fmtNum(d.goal.totalPoints)} 分</div>` : ''}
      ${d.history.filter((h) => h.status === 'rejected').length ? `
      <div class="vfy-block"><span class="vfy-label">历史驳回（${d.history.filter((h) => h.status === 'rejected').length} 次）</span>
        ${d.history.filter((h) => h.status === 'rejected').map((h) => `<div class="vfy-text warn-txt">第 ${h.submit_count} 次：${UI.esc(h.reason)}</div>`).join('')}
      </div>` : ''}
    `;
    UI.sheet({ title: '验收详情', body, actions: [{ label: '关闭', onClick: (close) => close() }] });
  },

  // 7 天手机时长折线（P4-#20）：手写 SVG，无数据日断点标「未上报」，不补 0
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
      if (yy == null) return `<circle cx="${x(i)}" cy="${H - PAD_B}" r="2.5" class="wc-gap" fill-opacity="0.9"/>`;
      return `<circle cx="${x(i)}" cy="${yy.toFixed(1)}" r="3" class="${cls}"/>`;
    }).join('');
    const labels = seriesMe.map((pt, i) => (i % 2 === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="wc-label">${Number(pt.date.slice(8))}</text>` : '')).join('');
    const grid = [0.5, 1].map((f) => {
      const yy = (PAD_T + (1 - f) * (H - PAD_T - PAD_B)).toFixed(1);
      const hhmm = `${Math.round((maxSec * f) / 3600)}h`;
      return `<line x1="${PAD_L}" y1="${yy}" x2="${W - 12}" y2="${yy}" class="wc-grid"/><text x="${PAD_L - 4}" y="${Number(yy) + 3}" text-anchor="end" class="wc-label sm">${hhmm}</text>`;
    }).join('');
    const gapsTa = seriesTa.map((pt, i) => pt.totalSeconds == null ? `<text x="${x(i)}" y="${H - PAD_B + 12}" text-anchor="middle" class="wc-label gap">未上报</text>` : '').join('');
    return `
      <section class="sec">
        <div class="sec-head"><h2>7 天手机时长</h2><span class="sec-count">断点 = 没上报</span></div>
        <div class="wc-card">
          <svg viewBox="0 0 ${W} ${H}" class="wc-svg" role="img" aria-label="7 天手机时长折线">
            ${grid}
            <path d="${path(seriesMe)}" class="wc-line me"/>
            <path d="${path(seriesTa)}" class="wc-line ta"/>
            ${dots(seriesMe, 'wc-dot me')}${dots(seriesTa, 'wc-dot ta')}
            ${labels}${gapsTa}
          </svg>
          <div class="wc-legend">
            <span><i class="wc-sw me"></i>我</span>
            <span><i class="wc-sw ta"></i>${UI.esc(partner.nickname)}</span>
            <span><i class="wc-sw gap"></i>未上报（不补 0）</span>
          </div>
        </div>
      </section>`;
  },

  // 手机使用时长：两人今日总时长对比 + ta 的前 5 个 App + 最近同步
  usageSection(mineRes, partnerRes, partner) {
    if (mineRes.status !== 'fulfilled' && partnerRes.status !== 'fulfilled') {
      return `
      <section class="sec">
        <div class="sec-head"><h2>手机在谁手里</h2></div>
        <div class="usage-fail">${window.icon('alert')} 时长数据暂时读不到</div>
      </section>`;
    }
    const mine = mineRes.status === 'fulfilled' ? mineRes.value : null;
    const pu = partnerRes.status === 'fulfilled' ? partnerRes.value : null;
    const nick = UI.esc((pu && pu.partner && pu.partner.nickname) || partner.nickname);

    // 对比条：我 / ta 并排，按较大值归一，短的也留一截好认
    const mySec = mine ? mine.totalSeconds : 0;
    const taSec = pu ? pu.totalSeconds : 0;
    const maxSec = Math.max(mySec, taSec, 1);
    const barPct = (sec) => (sec <= 0 ? 0 : Math.max(8, Math.round((sec / maxSec) * 100)));
    // 拆成「时 / 分」两段：大数字给数值，小字给单位，单列放得下
    const hm = (sec) => {
      const m = Math.round(Number(sec || 0) / 60);
      return { h: Math.floor(m / 60), mm: m % 60 };
    };

    const col = (name, sec, ok, cls) => {
      if (!ok) {
        return `
          <div class="usage-col ${cls}">
            <div class="usage-who">${name}</div>
            <div class="usage-num muted">—</div>
            <div class="usage-bar"><span class="usage-bar-fill" style="width:0"></span></div>
            <div class="usage-note">暂时读不到</div>
          </div>`;
      }
      if (!sec) {
        return `
          <div class="usage-col ${cls}">
            <div class="usage-who">${name}</div>
            <div class="usage-empty-inline">还没数据</div>
            <div class="usage-bar"><span class="usage-bar-fill" style="width:0"></span></div>
            <div class="usage-note">没有上报</div>
          </div>`;
      }
      const { h, mm } = hm(sec);
      return `
        <div class="usage-col ${cls}">
          <div class="usage-who">${name}</div>
          <div class="usage-num"><b>${h}</b><i>时</i><b>${mm}</b><i>分</i></div>
          <div class="usage-bar"><span class="usage-bar-fill" style="width:${barPct(sec)}%"></span></div>
          <div class="usage-note">${Math.round(sec / 60)} 分钟</div>
        </div>`;
    };

    let syncLine = '';
    if (pu && pu.totalSeconds > 0) {
      const hm = fmtHHmm(pu.lastReportAt);
      const stale = pu.staleMinutes;
      const staleTxt = stale === null || stale === undefined ? ''
        : stale <= 10 ? ' · 刚刚'
        : stale >= 60 ? ` · ${Math.floor(stale / 60)} 小时前`
        : ` · ${stale} 分钟前`;
      syncLine = `${window.icon('clock')} ta 最近一次同步于 ${hm || '—'}${staleTxt}`;
    }

    // 两边各取前 5：我（绿）/ ta（橙），各自按自己最大项归一
    const appList = (src, side) => {
      const list = src && Array.isArray(src.apps) ? src.apps.slice().sort((a, b) => b.seconds - a.seconds).slice(0, 5) : [];
      if (!list.length) {
        return `<div class="usage-apps ${side}">
          <div class="usage-apps-empty">${side === 'mine' ? '我还没有数据' : '还没有数据'}</div>
        </div>`;
      }
      const top = Math.max(list[0].seconds, 1);
      return `<div class="usage-apps ${side}">
        ${list.map((a) => `
          <div class="usage-app">
            <div class="usage-app-head">
              <span class="usage-app-name">${UI.esc(a.appName || a.packageName)}</span>
              <span class="usage-app-time">${fmtMinutes(a.seconds)}</span>
            </div>
            <div class="usage-app-bar"><span style="width:${Math.max(6, Math.round((a.seconds / top) * 100))}%"></span></div>
          </div>`).join('')}
      </div>`;
    };

    const appsHtml = `
        <div class="usage-apps-wrap">
          <div class="usage-apps-head"><span>我</span><span class="usage-apps-head-name">${UI.esc(nick)}</span></div>
          <div class="usage-apps-cols">
            ${appList(mine, 'mine')}
            <div class="usage-apps-divider"></div>
            ${appList(pu, 'ta')}
          </div>
        </div>
        <div class="usage-sync">${syncLine || 'ta 今天还没有上报'}</div>`;

    // ta 完全没数据：不显示 0 小时
    const taEmpty = pu && pu.totalSeconds === 0 && (!pu.apps || pu.apps.length === 0);
    // 我完全没数据
    const meEmpty = mine && mine.totalSeconds === 0 && (!mine.apps || mine.apps.length === 0);

    return `
      <section class="sec">
        <div class="sec-head"><h2>手机在谁手里</h2><span class="sec-count">今日</span></div>
        <div class="usage-card">
          <div class="usage-cols">
            ${col('我', mySec, !!mine, 'mine')}
            <div class="usage-divider"></div>
            ${col(nick, taSec, !!pu, 'ta')}
          </div>
          ${meEmpty ? `
          <div class="usage-empty">
            <span class="usage-empty-emoji">📵</span>
            <div class="usage-empty-main">
              <div class="usage-empty-title">我还看不见自己的时长</div>
              <div class="usage-empty-sub">装上手机版，自己也能看见时间花在哪</div>
            </div>
          </div>` : ''}
          ${taEmpty ? `
          <div class="usage-empty">
            <span class="usage-empty-emoji">📱</span>
            <div class="usage-empty-main">
              <div class="usage-empty-title">ta 还没装脚印手机版，看不到时长</div>
              <div class="usage-empty-sub">等 ta 装上、手机自己上报，这里就会亮起来</div>
            </div>
          </div>` : ''}
          ${(mine || pu) ? appsHtml : ''}
        </div>
      </section>`;
  },

  async rejectVerifySheet(v, root) {
    const body = document.createElement('div');
    body.className = 'reject-body';
    body.innerHTML = `
      <div class="rb-item">
        <span class="rb-emoji">${UI.esc(v.goal_emoji || '🎯')}</span>
        <div>
          <div class="rb-title">${UI.esc(v.goal_title)}</div>
          <div class="rb-price">达成 +${UI.fmtNum(Number(v.total_points) || 0)} 分</div>
        </div>
      </div>
      <label class="gf-label">为什么驳回？（对方会看到理由，目标会退回进行中）</label>
      <textarea id="vfy-reason" rows="3" maxlength="200" placeholder="比如：还差关键一步，验收标准没完全满足"></textarea>
    `;
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
            } catch (e) {
              UI.toast(e.message, 'err');
            }
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

// 秒 → 列表里的短格式「1 时 12 分」
function fmtMinutes(sec) {
  const m = Math.round(Number(sec || 0) / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return `${h} 时 ${mm} 分`;
  if (h) return `${h} 时`;
  return `${mm} 分`;
}

// ISO → 上海时间 HH:mm（不依赖浏览器本机时区）
function fmtHHmm(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  const d = new Date(t.getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function freqText(g) {
  if (g.freq_mode === 'daily') return '每日';
  if (g.freq_mode === 'weekly') return `每周 ${g.freq_n} 次`;
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  return '周' + (g.weekdays || '').split(',').map((d) => names[Number(d) - 1]).join('·');
}

function verifyCard(v) {
  return `
    <div class="vfy-card">
      <div class="vfy-head">
        <span class="vfy-emoji">${UI.esc(v.goal_emoji || '🎯')}</span>
        <div class="vfy-title-box">
          <div class="vfy-title">${UI.esc(v.goal_title)}</div>
          <div class="vfy-meta">${v.submitter_nickname ? `${UI.esc(v.submitter_nickname)} · ` : ''}${UI.fmtTimeIso(v.created_at)} · 达成 +${UI.fmtNum(Number(v.total_points) || 0)} 分</div>
        </div>
      </div>
      ${v.accept_criteria ? `<div class="vfy-block"><span class="vfy-label">验收标准</span><div class="vfy-text">${UI.esc(v.accept_criteria)}</div></div>` : ''}
      ${v.self_statement ? `<div class="vfy-block"><span class="vfy-label">自述</span><div class="vfy-text">${UI.esc(v.self_statement)}</div></div>` : ''}
      ${v.evidence_text ? `<div class="vfy-block"><span class="vfy-label">证据</span><div class="vfy-text">${UI.esc(v.evidence_text)}</div></div>` : ''}
      <div class="vfy-actions">
        <button class="btn ghost vfy-detail" data-id="${v.id}">看详情</button>
        <button class="btn vfy-approve" data-id="${v.id}">${window.icon('check')} 通过</button>
        <button class="btn outline danger vfy-reject" data-id="${v.id}">驳回</button>
      </div>
    </div>`;
}
