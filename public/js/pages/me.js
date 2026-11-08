// 我的页：资料、统计、流水、系数设置、数据与备份。
const MePage = {
  async render(root) {
    if (App.isGuest()) {
      this.renderGuest(root);
      return;
    }
    root.innerHTML = '<div class="page-loading">加载中…</div>';
    let stats;
    try {
      const d = await api.get('/api/stats');
      stats = d.stats;
    } catch (e) {
      root.innerHTML = `<div class="empty big"><div class="empty-emoji">😿</div><div>${UI.esc(e.message)}</div><button class="btn primary" id="retry">重试</button></div>`;
      root.querySelector('#retry').addEventListener('click', () => MePage.render(root));
      return;
    }

    const me = App.state.me;
    const statItems = [
      ['本月得分', `+${UI.fmtNum(stats.monthPoints)}`, 'coin'],
      ['当前余额', UI.fmtNum(stats.balance), 'coin'],
      ['最长连续', `${stats.bestStreak} 天`, 'flame'],
      ['本月完成率', stats.completion === null ? '—' : `${stats.completion}%`, 'target'],
      ['时间投入', `${(stats.timeInvestMin / 60).toFixed(1)} 小时`, 'clock'],
      ['被质疑次数', `${stats.rejectedCount}`, 'alert'],
    ];

    root.innerHTML = `
      <header class="page-head">
        <div>
          <div class="hello">我的</div>
          <div class="date-line">${UI.esc(me.username)} 的脚印</div>
        </div>
      </header>

      <section class="profile-card">
        <span class="ps-avatar big">${UI.esc(me.avatar)}</span>
        <div class="pc-main">
          <div class="pc-name">${UI.esc(me.username)}</div>
          <div class="pc-meta">和 ${App.state.partner ? UI.esc(App.state.partner.username) : '对方'} 互相监督中</div>
        </div>
        <button class="ghost-btn" id="change-username">${window.icon('edit')} 改用户名</button>
        <button class="ghost-btn" id="change-pw">${window.icon('lock')} 改密码</button>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>这个月</h2></div>
        <div class="stats-grid">
          ${statItems.map(([k, v, ic]) => `
            <div class="stat-cell">
              <span class="sc-ico">${window.icon(ic)}</span>
              <div class="sc-val">${v}</div>
              <div class="sc-label">${k}</div>
            </div>`).join('')}
        </div>
      </section>

      <section class="sec" id="diary-sec">
        <div class="sec-head"><h2>AI 日报</h2><span class="sec-count" id="diary-dot" style="display:none">● 有新的</span></div>
        <div id="diary-box"><div class="ld-loading">加载中…</div></div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>积分流水</h2></div>
        <div class="ledger-list" id="ledger-list"><div class="ld-loading">加载中…</div></div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>zoowy</h2></div>
        <div class="menu-list">
          <button class="menu-row" id="m-zoowy">🐾<span>和 zoowy 聊聊</span><span class="menu-note">知道你的目标与打卡</span>${window.icon('right')}</button>
          <button class="menu-row" id="m-profile">${window.icon('me')}<span>我的画像</span><span class="menu-note">仅自己可见</span>${window.icon('right')}</button>
        </div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>画像变更</h2><span class="sec-count" id="pc-dot" style="display:none">● 有新的</span></div>
        <div id="pc-box"><div class="ld-loading">加载中…</div></div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>设置</h2></div>
        <div class="menu-list">
          <button class="menu-row" id="m-ai-settings">🐾<span>AI 设置</span><span class="menu-note">确认与汇报</span>${window.icon('right')}</button>
          <button class="menu-row" id="m-points">${window.icon('gear')}<span>积分系数</span><span class="menu-note">规则可调</span>${window.icon('right')}</button>
          <button class="menu-row" id="m-data">${window.icon('doc')}<span>数据与备份</span><span class="menu-note">导出 · 快照</span>${window.icon('right')}</button>
        </div>
      </section>

      <section class="sec">
        <button class="logout-btn" id="logout">${window.icon('exit')} 退出登录</button>
        <button class="logout-all-btn" id="logout-all">登出全部设备</button>
      </section>

      <section class="sec" id="pair-sec">
        <div class="sec-head"><h2>我的搭档</h2><span class="sec-count">邀请 · 绑定 · 解绑</span></div>
        <div id="pair-card"><div class="ld-loading">加载中…</div></div>
      </section>

      <p class="about-line">脚印 · 两个人互相看得见</p>
    `;

    root.querySelector('#change-username').addEventListener('click', () => this.changeUsername(root));
    root.querySelector('#change-pw').addEventListener('click', () => this.changePassword());
    root.querySelector('#m-points').addEventListener('click', () => this.pointsSettings());
    root.querySelector('#m-ai-settings').addEventListener('click', () => this.aiSettingsSheet());
    root.querySelector('#m-data').addEventListener('click', () => this.dataSheet(root));
    root.querySelector('#m-zoowy').addEventListener('click', () => ZoowyChat.open({ title: 'zoowy' }));
    root.querySelector('#m-profile').addEventListener('click', () => this.profileSheet());
    this.loadDiary(root);
    this.loadProfileChanges(root);
    root.querySelector('#logout').addEventListener('click', async () => {
      const yes = await UI.confirm('退出登录？下次要用密码再进来。', { okLabel: '退出' });
      if (!yes) return;
      try { await api.post('/api/logout'); } catch (e) { /* 忽略 */ }
      App.showAuth();
    });
    const logoutAll = root.querySelector('#logout-all');
    if (logoutAll) logoutAll.addEventListener('click', async () => {
      const yes = await UI.confirm('把其他设备也一起登出？', { okLabel: '全部登出' });
      if (!yes) return;
      try { await api.post('/api/me/logout-all'); } catch (e) { /* 忽略 */ }
      App.showAuth();
    });
    this.loadPairCard(root);
    this.loadLedger(root);
  },

  // 游客视图：完整「我的」界面结构（资料卡、统计、菜单入口），数据为空，点任何入口跳登录。
  renderGuest(root) {
    const statItems = [
      ['本月得分', '—', 'coin'],
      ['当前余额', '—', 'coin'],
      ['最长连续', '—', 'flame'],
      ['本月完成率', '—', 'target'],
      ['时间投入', '—', 'clock'],
      ['被质疑次数', '—', 'alert'],
    ];
    root.innerHTML = `
      <header class="page-head">
        <div>
          <div class="hello">我的</div>
          <div class="date-line">登录后查看你的脚印</div>
        </div>
      </header>
      <section class="profile-card">
        <span class="ps-avatar big">🐾</span>
        <div class="pc-main">
          <div class="pc-name">游客</div>
          <div class="pc-meta">登录后和对方互相监督</div>
        </div>
        <button class="ghost-btn">${window.icon('edit')} 改用户名</button>
        <button class="ghost-btn">${window.icon('lock')} 改密码</button>
      </section>
      <section class="sec">
        <div class="sec-head"><h2>这个月</h2></div>
        <div class="stats-grid">
          ${statItems.map(([k, v, ic]) => `
            <div class="stat-cell">
              <span class="sc-ico">${window.icon(ic)}</span>
              <div class="sc-val">${v}</div>
              <div class="sc-label">${k}</div>
            </div>`).join('')}
        </div>
      </section>
      <section class="sec">
        <div class="sec-head"><h2>zoowy</h2></div>
        <div class="menu-list">
          <button class="menu-row">🐾<span>和 zoowy 聊聊</span><span class="menu-note">知道你的目标与打卡</span>${window.icon('right')}</button>
          <button class="menu-row">${window.icon('me')}<span>我的画像</span><span class="menu-note">仅自己可见</span>${window.icon('right')}</button>
        </div>
      </section>
      <section class="sec">
        <div class="sec-head"><h2>设置</h2></div>
        <div class="menu-list">
          <button class="menu-row">🐾<span>AI 设置</span><span class="menu-note">确认与汇报</span>${window.icon('right')}</button>
          <button class="menu-row">${window.icon('gear')}<span>积分系数</span><span class="menu-note">规则可调</span>${window.icon('right')}</button>
          <button class="menu-row">${window.icon('doc')}<span>数据与备份</span><span class="menu-note">导出 · 快照</span>${window.icon('right')}</button>
        </div>
      </section>
      <section class="sec">
        <div class="sec-head"><h2>我的搭档</h2><span class="sec-count">邀请 · 绑定 · 解绑</span></div>
        <div class="menu-list">
          <button class="menu-row">🤝<span>配对 / 邀请码</span><span class="menu-note">登录后可见</span>${window.icon('right')}</button>
        </div>
      </section>
      <p class="about-line">脚印 · 两个人互相看得见</p>
    `;
    UI.guestGate(root);
  },

  // ---- 我的搭档：邀请码 / 配对请求 / 解绑 / 组内动态 ----
  async loadPairCard(root) {
    const box = root.querySelector('#pair-card');
    if (!box) return;
    let st;
    try {
      st = await api.get('/api/pair/status');
    } catch (e) {
      box.innerHTML = `<div class="ld-loading">${UI.esc(e.message)}</div>`;
      return;
    }

    // 已配对：搭档卡 + 解除绑定 + 组内动态
    // 必须同时有 partner：解绑后可能出现「有组无搭档」的过渡态，直接读 avatar 会炸
    if (st.paired && st.partner) {
      const eventsHtml = st.events && st.events.length ? `
        <div class="menu-list">${st.events.map((e) => `
          <div class="menu-row"><span>${UI.esc(e.username)} · ${UI.esc(e.detail)}</span>
            <span class="menu-note">${UI.esc(String(e.createdAt).slice(0, 16).replace('T', ' '))}</span></div>`).join('')}</div>` : '';
      box.innerHTML = `
        <div class="pair-card">
          <div class="pair-row">
            <span class="ps-avatar">${UI.esc(st.partner.avatar)}</span>
            <span class="pair-name">${UI.esc(st.partner.username)}</span>
            <span class="pair-tag">已绑定 · 互相监督中</span>
          </div>
          <button class="logout-btn" id="pair-unbind">解除绑定</button>
          ${eventsHtml}
        </div>`;
      const unbind = box.querySelector('#pair-unbind');
      if (unbind) unbind.addEventListener('click', async () => {
        const yes = await UI.confirm('解除绑定后整组解散，双方立刻看不到对方的数据；未完成的验收和未确认的兑换会作废。确定吗？', { okLabel: '解除绑定' });
        if (!yes) return;
        try {
          const d = await api.post('/api/pair/unbind', {});
          UI.toast(`已解除绑定（作废验收 ${d.cancelledVerifications} 条、退分 ${d.refunded} 笔）`, 'ok');
          MePage.render(root);
        } catch (e) { UI.toast(e.message); }
      });
      return;
    }

    // 未配对：我的邀请码 + 换一个 + 申请配对 + 待确认 / 已发出的请求
    const myCode = st.myCode || {};
    const expires = String(myCode.expiresAt || '').slice(0, 16).replace('T', ' ');
    const pendingHtml = st.pendingRequest ? `
      <div class="pair-row">
        <span class="pair-name">${UI.esc(st.pendingRequest.requester.username)} 想和你配对</span>
        <button class="btn primary" id="pair-approve">同意</button>
        <button class="ghost-btn" id="pair-reject">拒绝</button>
      </div>` : '';
    const myRequestHtml = st.myRequest ? `
      <div class="pair-row">
        <span class="pair-name">已向 ${UI.esc(st.myRequest.owner.username)} 发出申请，等对方确认</span>
        <button class="ghost-btn" id="pair-withdraw">撤回</button>
      </div>` : '';
    box.innerHTML = `
      <div class="pair-card">
        <div class="pair-row">
          <span class="pair-name">我的邀请码</span>
          <code class="invite-code">${UI.esc(myCode.code)}</code>
          <span class="menu-note">${UI.esc(expires)} 前有效</span>
          <button class="ghost-btn" id="pair-revoke">换一个</button>
        </div>
        <label class="field">
          <span class="field-label">输入对方的邀请码</span>
          <input id="pair-join-code" type="text" placeholder="对方的邀请码" autocomplete="off"/>
        </label>
        <button class="btn primary" id="pair-join">申请配对</button>
        ${pendingHtml}
        ${myRequestHtml}
        <p class="auth-hint">还没有搭档，把邀请码发给对方，或输入对方的码</p>
      </div>`;

    // 换一个新邀请码
    const revoke = box.querySelector('#pair-revoke');
    if (revoke) revoke.addEventListener('click', async () => {
      try {
        await api.post(`/api/pair/invite/${encodeURIComponent(myCode.code)}/revoke`, {});
        UI.toast('已换一个新邀请码', 'ok');
        this.loadPairCard(root);
      } catch (e) { UI.toast(e.message); }
    });

    // 输入对方的码 → 只生成待确认请求，不建组
    const join = box.querySelector('#pair-join');
    if (join) join.addEventListener('click', async () => {
      const code = box.querySelector('#pair-join-code').value.trim();
      if (!code) { UI.toast('填一下对方的邀请码', 'warn'); return; }
      try {
        await api.post('/api/pair/join', { code });
        UI.toast('申请已发出，等对方确认', 'ok');
        this.loadPairCard(root);
      } catch (e) { UI.toast(e.message); }
    });

    // 有人申请和我配对：同意（此刻才建组）/ 拒绝
    const approve = box.querySelector('#pair-approve');
    if (approve) approve.addEventListener('click', async () => {
      try {
        await api.post(`/api/pair/request/${encodeURIComponent(st.pendingRequest.id)}/approve`, {});
        UI.toast('配对成功 🐾', 'ok');
        MePage.render(root);
      } catch (e) { UI.toast(e.message); }
    });
    const reject = box.querySelector('#pair-reject');
    if (reject) reject.addEventListener('click', async () => {
      try {
        await api.post(`/api/pair/request/${encodeURIComponent(st.pendingRequest.id)}/reject`, {});
        this.loadPairCard(root);
      } catch (e) { UI.toast(e.message); }
    });

    // 我已发出的申请：撤回
    const withdraw = box.querySelector('#pair-withdraw');
    if (withdraw) withdraw.addEventListener('click', async () => {
      try {
        await api.delete(`/api/pair/request/${encodeURIComponent(st.myRequest.id)}`);
        this.loadPairCard(root);
      } catch (e) { UI.toast(e.message); }
    });
  },

  // ---- AI 日报（P2-#14）：今日日报卡 + 未读红点（localStorage 记已读日）----
  async loadDiary(root) {
    const box = root.querySelector('#diary-box');
    const dot = root.querySelector('#diary-dot');
    if (!box) return;
    let d;
    try {
      d = await api.get('/api/diaries/today');
    } catch (e) {
      box.innerHTML = `<div class="ld-empty">${UI.esc(e.message)}</div>`;
      return;
    }
    if (!d.diary) {
      box.innerHTML = '<div class="ld-empty">今天的日报 23:30 由 zoowy 生成，到时候来看。</div>';
      return;
    }
    const diary = d.diary;
    // 未读红点：当天的日报比上次已读的新
    try {
      const lastRead = localStorage.getItem('fp_diary_read');
      if (lastRead !== diary.diary_date) dot.style.display = '';
    } catch (e) { /* localStorage 不可用就无红点 */ }
    const preview = String(diary.content).slice(0, 80);
    box.innerHTML = `
      <div class="diary-card" id="diary-card">
        <div class="dc-date">${UI.fmtDate(diary.diary_date)}${diary.edited ? ' · 已改过' : ''}</div>
        <div class="dc-preview">${UI.esc(preview)}${diary.content.length > 80 ? '…' : ''}</div>
        <div class="dc-acts">
          <button class="sc-btn primary" data-act="read">看全文</button>
          ${diary.shared ? '<span class="sc-badge active">已分享给对方</span>' : ''}
        </div>
      </div>
    `;
    box.querySelector('#diary-card').addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      this.diarySheet(diary, root);
    });
    box.querySelector('[data-act="read"]').addEventListener('click', () => this.diarySheet(diary, root));
  },

  // 日报全文：查看 / 修改（user_edited）/ 分享给对方
  diarySheet(diary, root) {
    try { localStorage.setItem('fp_diary_read', diary.diary_date); } catch (e) { /* 忽略 */ }
    const dot = document.getElementById('diary-dot');
    if (dot) dot.style.display = 'none';
    const body = document.createElement('div');
    body.className = 'diary-full';
    body.innerHTML = `
      <div class="df-text">${UI.esc(diary.content).replace(/\n/g, '<br/>')}</div>
      <textarea id="df-edit" rows="8" class="hidden">${UI.esc(diary.content)}</textarea>
      <div class="gf-hint">改过的版本会盖在 AI 原文上（原文保留）；明天生成新日报不会回改这篇。想写「每日反思」就直接补在后面。</div>
    `;
    UI.sheet({
      title: `${UI.fmtDate(diary.diary_date)} 的日报`,
      body,
      actions: [
        {
          label: diary.edited ? '再改改' : '修改',
          onClick: () => {
            body.querySelector('.df-text').classList.add('hidden');
            body.querySelector('#df-edit').classList.remove('hidden');
          },
        },
        {
          label: diary.shared ? '取消分享' : '分享给对方',
          async onClick(close) {
            try {
              const r = await api.post(`/api/diaries/${diary.diary_date}/share`, { shared: !diary.shared });
              UI.toast(r.shared ? '已分享，对方在「我们」页能看到摘要' : '已取消分享', 'ok');
              close();
              MePage.loadDiary(root);
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
        {
          label: '保存',
          kind: 'primary',
          async onClick(close) {
            const text = body.querySelector('#df-edit').value.trim();
            const editing = !body.querySelector('#df-edit').classList.contains('hidden');
            if (!editing) return close();
            if (!text) return UI.toast('内容不能为空', 'err');
            try {
              await api.patch(`/api/diaries/${diary.diary_date}`, { user_edited: text });
              UI.toast('已保存', 'ok');
              close();
              MePage.loadDiary(root);
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
      ],
    });
  },

  // ---- 画像变更：zoowy 改了什么（红点）+ 明细 + 版本历史与回滚 ----
  async loadProfileChanges(root) {
    const box = root.querySelector('#pc-box');
    const dot = root.querySelector('#pc-dot');
    if (!box) return;
    let d;
    try {
      d = await api.get('/api/me/profile/changes?limit=5');
    } catch (e) {
      box.innerHTML = `<div class="ld-empty">${UI.esc(e.message)}</div>`;
      return;
    }
    if (d.unread) dot.style.display = '';
    if (!d.items.length) {
      box.innerHTML = '<div class="ld-empty">还没有变更。zoowy 记住新信息时会在这里告诉你改了什么。</div>';
      return;
    }
    const last = d.items[0];
    box.innerHTML = `
      <div class="pc-card">
        <div class="pc-sum">${UI.esc(last.summary || '（无摘要）')}</div>
        <div class="pc-meta">${UI.fmtDate(last.createdAt)} · ${UI.esc(last.workflow)}${last.reported ? '' : ' · 静默留痕'}</div>
      </div>
      <button class="ghost-btn" id="pc-open">查看全部 · 版本历史与回滚 →</button>
    `;
    box.querySelector('#pc-open').addEventListener('click', () => this.profileChangesSheet());
  },

  async profileChangesSheet() {
    let d, v;
    try {
      d = await api.get('/api/me/profile/changes?limit=50');
      v = await api.get('/api/me/profile/versions?limit=20');
    } catch (e) { return UI.toast(e.message, 'err'); }
    const WF = { chat: '聊天', plan: '拆计划', progress: '进度分析', daily: '日报', user: '你手动', ai: 'zoowy' };
    const body = document.createElement('div');
    body.className = 'pc-body';
    body.innerHTML = `
      <div class="gf-hint">每次改动都留痕。关掉「改完汇报」只是不推红点，这里照样能翻到全部，也能一键回到任一历史版本。</div>
      <div class="pc-list">
        ${d.items.length ? d.items.map((it) => `
          <div class="pc-item" data-id="${it.id}">
            <div class="pc-head"><b>${UI.esc(it.summary || '（无摘要）')}</b><span class="pc-wf">${UI.esc(WF[it.workflow] || it.workflow)}</span></div>
            <div class="pc-meta">${UI.fmtDate(it.createdAt)}${it.reported ? '' : ' · 静默留痕'}${it.read ? ' · 已读' : ' · 未读'}</div>
            <div class="pc-detail hidden">
              ${(it.detail || []).map((c) => `
                <div class="pc-chg">
                  <div class="pc-chg-h">${UI.esc(c.op)} · ${UI.esc(c.block)}</div>
                  <div class="pc-chg-r">理由：${UI.esc(c.reason || '—')}</div>
                  <div class="pc-chg-e">依据：${UI.esc(c.evidence || '—')}</div>
                  ${c.before ? `<div class="pc-chg-b">原：${UI.esc(String(c.before).slice(0, 120))}</div>` : ''}
                  ${c.after ? `<div class="pc-chg-b">新：${UI.esc(String(c.after).slice(0, 120))}</div>` : ''}
                </div>`).join('')}
            </div>
          </div>`).join('') : '<div class="ld-empty">还没有变更。</div>'}
      </div>
      <div class="pc-vers">
        <div class="pc-vers-h">版本历史（可回滚）</div>
        ${v.versions.length ? v.versions.map((x) => `
          <div class="pc-ver">
            <span>#${x.id} ${UI.fmtDate(x.createdAt)} · ${x.blockCount} 块 · ${UI.esc(x.changedBy)}</span>
            <button class="sc-btn ghost" data-rollback="${x.id}">回滚</button>
          </div>`).join('') : '<div class="ld-empty">还没有版本快照。</div>'}
      </div>
    `;
    body.querySelector('.pc-list').addEventListener('click', (e) => {
      const item = e.target.closest('.pc-item');
      if (!item) return;
      const det = item.querySelector('.pc-detail');
      if (det) det.classList.toggle('hidden');
    });
    body.querySelector('.pc-vers').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-rollback]');
      if (!btn) return;
      const id = btn.dataset.rollback;
      const yes = await UI.confirm(`回到版本 #${id}？当前画像会先存一份快照，随时能再回来。`, { okLabel: '回滚' });
      if (!yes) return;
      try {
        await api.post(`/api/me/profile/versions/${id}/rollback`);
        UI.toast('已回滚', 'ok');
        this.profileChangesSheet();
      } catch (err) { UI.toast(err.message, 'err'); }
    });
    UI.sheet({
      title: '画像变更记录',
      body,
      actions: [
        {
          label: '全部标为已读', kind: 'primary',
          async onClick(close) {
            try {
              await api.post('/api/me/profile/changes/read');
              UI.toast('已标为已读', 'ok');
              const dot = document.getElementById('pc-dot');
              if (dot) dot.style.display = 'none';
              close();
            } catch (err) { UI.toast(err.message, 'err'); }
          },
        },
      ],
    });
  },

  // ---- 个人画像：查看 / 手改每块 / 删除（标失效）----
  async profileSheet() {
    let d;
    try {
      d = await api.get('/api/me/profile');
    } catch (e) { return UI.toast(e.message, 'err'); }
    const BLOCK_NAMES = { basic: '基本情况', resume: '简历', skills: '能力', goal_progress: '目标进展', important: '重要信息' };
    const body = document.createElement('div');
    body.className = 'profile-body';
    const active = d.blocks.filter((b) => b.status === 'active');
    body.innerHTML = `
      ${active.length ? active.map((b) => `
        <div class="pf-block" data-block="${UI.esc(b.block)}">
          <div class="pf-head">
            <b>${UI.esc(BLOCK_NAMES[b.block] || b.block)}</b>
            <span class="pf-src">${b.source === 'user' ? '你改的' : 'zoowy 记的'}</span>
          </div>
          <div class="pf-content">${UI.esc(b.content).replace(/\n/g, '<br/>')}</div>
          <div class="pf-acts">
            <button class="sc-btn ghost" data-act="edit">改</button>
            <button class="sc-btn ghost danger" data-act="del">删</button>
          </div>
        </div>`).join('') : '<div class="ld-empty">画像还是空的。聊几天天、打几天卡，zoowy 会慢慢记住你。</div>'}
      <button class="ghost-btn" id="pf-add">＋ 补一块</button>
      <div class="gf-hint">画像默认只有你自己看得到；AI 每次分析都会带着它，也会更新它。你手改过的，zoowy 会更尊重。</div>
    `;
    const editBlock = (block, content) => {
      const b2 = document.createElement('div');
      b2.className = 'goal-form';
      b2.innerHTML = `
        <div class="gf-row">
          <label class="gf-label">块名（basic 基本情况 / resume 简历 / skills 能力 / goal_progress 目标进展 / important 重要信息）</label>
          <input id="pf-name" value="${UI.esc(block || '')}" ${block ? 'readonly' : 'maxlength="32"'}/>
        </div>
        <div class="gf-row">
          <label class="gf-label">内容</label>
          <textarea id="pf-content" rows="6" maxlength="4000">${UI.esc(content || '')}</textarea>
        </div>
      `;
      UI.sheet({
        title: block ? '改画像块' : '补一块画像',
        body: b2,
        actions: [
          {
            label: '保存', kind: 'primary',
            async onClick(close) {
              const name = b2.querySelector('#pf-name').value.trim();
              const text = b2.querySelector('#pf-content').value.trim();
              if (!name) return UI.toast('块名不能为空', 'err');
              try {
                await api.put(`/api/me/profile/${encodeURIComponent(name)}`, { content: text });
                UI.toast(text ? '已保存' : '已删除', 'ok');
                close();
                MePage.profileSheet();
              } catch (e) { UI.toast(e.message, 'err'); }
            },
          },
        ],
      });
    };
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const blk = btn.closest('.pf-block');
      const block = blk ? blk.dataset.block : null;
      if (btn.id === 'pf-add') return editBlock('', '');
      if (btn.dataset.act === 'edit') {
        const b = d.blocks.find((x) => x.block === block);
        return editBlock(block, b ? b.content : '');
      }
      if (btn.dataset.act === 'del') {
        UI.confirm(`删掉「${UI.esc(block)}」这块？只标失效，历史还能找回。`, { danger: true, okLabel: '删' })
          .then(async (yes) => {
            if (!yes) return;
            try {
              await api.put(`/api/me/profile/${encodeURIComponent(block)}`, { content: '' });
              UI.toast('已删除', 'ok');
              MePage.profileSheet();
            } catch (e) { UI.toast(e.message, 'err'); }
          });
      }
    });
    UI.sheet({ title: '我的画像（仅自己可见）', body, actions: [{ label: '关闭', onClick: (close) => close() }] });
  },

  // ---- AI 设置（P0-#5 消费端）：两个开关只调确认与汇报，不调工具白名单 ----
  async aiSettingsSheet() {
    let cur;
    try {
      cur = await api.get('/api/me/settings');
    } catch (e) { return UI.toast(e.message, 'err'); }
    const body = document.createElement('div');
    body.className = 'goal-form';
    const toggle = (key, label, hint, on) => `
      <div class="gf-row ai-toggle-row">
        <div class="at-main">
          <div class="at-label">${label}</div>
          <div class="at-hint">${hint}</div>
        </div>
        <button class="at-switch ${on ? 'on' : ''}" data-key="${key}" role="switch" aria-checked="${on}"><i></i></button>
      </div>`;
    body.innerHTML = `
      ${toggle('skipConfirm', '免确认', '开 = AI 改画像 / 改计划不再弹确认直接改（候选计划仍要你勾选，免的是弹窗不是决策）', cur.skipConfirm)}
      ${toggle('reportChanges', '改完汇报', '开 = AI 每次改完告诉你改了什么；关 = 静默改。不管开不开，改动都留痕，随时能翻', cur.reportChanges)}
      ${toggle('dailyEnabled', 'AI 日报', '开 = 每晚 23:30 给你生成一份日报（会调用 AI）；默认关，不开就不烧额度', cur.dailyEnabled)}
      <div class="gf-hint">每人一份，两边互不影响。白名单不受开关影响：AI 永远碰不到验收、积分和对方的数据。</div>
    `;
    body.querySelectorAll('.at-switch').forEach((btn) => {
      btn.addEventListener('click', () => {
        const on = !btn.classList.contains('on');
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-checked', String(on));
      });
    });
    UI.sheet({
      title: 'AI 设置',
      body,
      actions: [
        {
          label: '保存', kind: 'primary',
          async onClick(close) {
            const skipConfirm = body.querySelector('[data-key="skipConfirm"]').classList.contains('on');
            const reportChanges = body.querySelector('[data-key="reportChanges"]').classList.contains('on');
            const dailyEnabled = body.querySelector('[data-key="dailyEnabled"]').classList.contains('on');
            try {
              await api.put('/api/me/settings', { skipConfirm, reportChanges, dailyEnabled });
              UI.toast('已保存', 'ok');
              close();
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
      ],
    });
  },

  async loadLedger(root) {
    try {
      const d = await api.get('/api/ledger');
      const list = root.querySelector('#ledger-list');
      if (!list) return;
      if (!d.ledger.length) {
        list.innerHTML = '<div class="ld-empty">还没有流水，去打第一张卡吧</div>';
        return;
      }
      list.innerHTML = d.ledger.map((x) => {
        const pos = Number(x.delta) >= 0;
        const sign = Number(x.delta) === 0 ? '—' : pos ? '+' : '−';
        return `
        <div class="ld-row">
          <div class="ld-main">
            <div class="ld-type">${x.typeLabel}${x.note ? ` · ${UI.esc(x.note)}` : ''}</div>
            <div class="ld-time">${UI.fmtTimeIso(x.created_at)}</div>
          </div>
          <div class="ld-delta ${pos ? 'pos' : 'neg'}">${sign}${UI.fmtNum(Math.abs(x.delta))}</div>
        </div>`;
      }).join('');
    } catch (e) {
      const list = root.querySelector('#ledger-list');
      if (list) list.innerHTML = '<div class="ld-empty">流水加载失败</div>';
    }
  },

  async changeUsername(root) {
    const body = document.createElement('div');
    body.className = 'pw-form';
    body.innerHTML = `
      ${pwField('username', '新用户名（最多 30 字）', 'text')}
      <p class="auth-hint">改完对方看到的名字和登录用的名字都会变。</p>`;
    UI.sheet({
      title: '修改用户名',
      body,
      actions: [
        {
          label: '改用户名',
          kind: 'primary',
          async onClick(close) {
            const name = body.querySelector('#username').value.trim();
            if (!name) { UI.toast('用户名不能为空', 'warn'); return; }
            try {
              const d = await api.patch('/api/me', { username: name });
              App.state.me = d.user;
              close();
              UI.toast('用户名已改', 'ok');
              MePage.render(root);
            } catch (e) {
              UI.toast(e.message, 'err');
            }
          },
        },
      ],
    });
  },

  async changePassword() {
    const body = document.createElement('div');
    body.className = 'pw-form';
    body.innerHTML = `
      ${pwField('old', '现在的密码', 'password')}
      ${pwField('new', '新密码（至少 8 位）', 'password')}
      ${pwField('new2', '再输一遍新密码', 'password')}
      <p class="auth-hint">改完所有设备会登出，用新密码重新登录。忘了密码就用部署者的 reset-password 命令。</p>`;
    UI.sheet({
      title: '修改密码',
      body,
      actions: [
        {
          label: '改密码',
          kind: 'primary',
          async onClick(close) {
            const oldPw = body.querySelector('#old').value;
            const npw = body.querySelector('#new').value;
            const npw2 = body.querySelector('#new2').value;
            if (npw.length < 8) { UI.toast('新密码至少 8 位', 'warn'); return; }
            if (npw !== npw2) { UI.toast('两次新密码不一样', 'warn'); return; }
            try {
              await api.post('/api/me/password', { oldPassword: oldPw, newPassword: npw });
              close();
              UI.toast('密码已改，重新登录一次', 'ok');
              App.showAuth();
            } catch (e) {
              UI.toast(e.message, 'err');
            }
          },
        },
      ],
    });
  },

  async pointsSettings() {
    let cfg;
    try {
      const d = await api.get('/api/settings');
      cfg = d.points;
    } catch (e) {
      UI.toast(e.message, 'err');
      return;
    }
    const body = document.createElement('div');
    body.className = 'cfg-form';
    const rows = (label, key, val, min, max, step) => `
      <div class="cfg-row">
        <label>${label}</label>
        <input type="number" data-k="${key}" value="${val}" min="${min}" max="${max}" step="${step || 1}"/>
      </div>`;
    const diffNames = ['', '几乎无门槛', '稍微用点力', '需要腾时间', '比较难', '长期投入'];
    body.innerHTML = `
      <p class="cfg-hint">这些系数两个人共用，改完立即生效。拿不准就点「恢复默认」。</p>
      ${rows('基础分单价（分/分钟）', 'unit', cfg.unit, 0.1, 2, 0.1)}
      ${rows('单次基础分封顶', 'cap', cfg.cap, 10, 200, 1)}
      ${rows('单次积分硬上限', 'maxPer', cfg.maxPer, 50, 300, 10)}
      <div class="cfg-sub">难度系数（1–5 级）</div>
      ${[1, 2, 3, 4, 5].map((d) => rows(`难度 ${d} · ${diffNames[d]}`, `d${d}`, cfg.difficulty[d], 0.5, 5, 0.1)).join('')}
      <div class="cfg-sub">频率系数</div>
      ${rows('每日', 'f.daily', cfg.freq.daily, 0.5, 3, 0.1)}
      ${rows('每周 3–4 次', 'f.weekly34', cfg.freq.weekly34, 0.5, 3, 0.1)}
      ${rows('每周 1–2 次', 'f.weekly12', cfg.freq.weekly12, 0.5, 3, 0.1)}
      ${rows('指定星期', 'f.weekdays', cfg.freq.weekdays, 0.5, 3, 0.1)}
      <div class="cfg-sub">时段系数</div>
      ${rows('窗口内', 'w.in', cfg.window.in, 0.5, 2, 0.1)}
      ${rows('无窗口', 'w.none', cfg.window.none, 0.5, 2, 0.1)}
      ${rows('窗口外', 'w.out', cfg.window.out, 0.5, 2, 0.1)}
      <div class="cfg-sub">连续里程碑奖励（n 次 → 分数）</div>
      <div id="cfg-miles">
        ${cfg.milestones.map((m, i) => `
          <div class="cfg-mile-row" data-i="${i}">
            <input type="number" class="m-n" value="${m.n}" min="1" step="1"/>
            <span>次 →</span>
            <input type="number" class="m-p" value="${m.p}" min="1" step="1"/>
            <span>分</span>
          </div>`).join('')}
      </div>
    `;
    UI.sheet({
      title: '积分系数',
      body,
      actions: [
        {
          label: '恢复默认',
          onClick: async () => {
            const yes = await UI.confirm('恢复所有系数到默认值？', { okLabel: '恢复' });
            if (!yes) return;
            try {
              const d = await api.put('/api/settings', { points: { unit: 0.5, cap: 60, maxPer: 300, difficulty: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.2 }, freq: { daily: 1.0, weekly34: 1.2, weekly12: 1.5, weekdays: 1.0 }, window: { in: 1.1, none: 1.0, out: 0.8 } } });
              App.state.pointsCfg = d.points;
              UI.toast('已恢复默认系数', 'ok');
            } catch (e) {
              UI.toast(e.message, 'err');
            }
          },
        },
        {
          label: '保存',
          kind: 'primary',
          async onClick(close) {
            const get = (k) => Number(body.querySelector(`[data-k="${k}"]`).value);
            const patch = {
              unit: get('unit'),
              cap: get('cap'),
              maxPer: get('maxPer'),
              difficulty: { 1: get('d1'), 2: get('d2'), 3: get('d3'), 4: get('d4'), 5: get('d5') },
              freq: { daily: get('f.daily'), weekly34: get('f.weekly34'), weekly12: get('f.weekly12'), weekdays: get('f.weekdays') },
              window: { in: get('w.in'), none: get('w.none'), out: get('w.out') },
              milestones: [...body.querySelectorAll('.cfg-mile-row')].map((r) => ({
                n: Number(r.querySelector('.m-n').value),
                p: Number(r.querySelector('.m-p').value),
              })),
            };
            try {
              const d = await api.put('/api/settings', { points: patch });
              App.state.pointsCfg = d.points;
              close();
              UI.toast('系数已更新', 'ok');
            } catch (e) {
              UI.toast(e.message, 'err');
            }
          },
        },
      ],
    });
  },

  async dataSheet(root) {
    const body = document.createElement('div');
    body.className = 'data-form';
    body.innerHTML = '<div class="ld-loading">加载中…</div>';
    UI.sheet({
      title: '数据与备份',
      body,
      actions: [{ label: '关闭', onClick: (c) => c() }],
    });
    try {
      const d = await api.get('/api/backups');
      body.innerHTML = `
        <div class="data-sec">
          <div class="data-sec-title">每日自动快照（凌晨 3 点，保留 30 天）</div>
          <button class="btn outline block" id="bk-now">立即快照一份</button>
          <div class="bk-list">
            ${d.backups.length ? d.backups.map((b) => `
              <div class="bk-row">
                <span>${b.name}</span>
                <span class="bk-size">${(b.size / 1024).toFixed(1)} KB</span>
                <a class="mini-btn" href="/api/backups/${b.name}">下载</a>
              </div>`).join('') : '<div class="ld-empty">还没有快照，启动时会自动生成第一份</div>'}
          </div>
        </div>
        <div class="data-sec">
          <div class="data-sec-title">全量导出（JSON + 各表 CSV，一个 zip）</div>
          <a class="btn outline block" href="/api/export">导出数据</a>
        </div>
        <div class="data-sec">
          <div class="data-sec-title">灾难恢复（三步）</div>
          <ol class="dr-steps">
            <li>在新机器上 <code>npm install && npm start</code> 把服务跑起来</li>
            <li>把导出的 zip 里的 <code>data.json</code> 传上去</li>
            <li>执行 <code>node scripts/restore.js data.json</code></li>
          </ol>
          <p class="dr-note">恢复前会自动给当前库做一份快照；忘记密码用 <code>node scripts/reset-password.js 用户名</code>。</p>
        </div>
      `;
      body.querySelector('#bk-now').addEventListener('click', async () => {
        try {
          const b = await api.post('/api/backups');
          UI.toast(`快照完成：${b.name}`, 'ok');
          MePage.dataSheet(root);
        } catch (e) {
          UI.toast(e.message, 'err');
        }
      });
    } catch (e) {
      body.innerHTML = `<div class="ld-empty">${UI.esc(e.message)}</div>`;
    }
  },
};

function pwField(id, label, type) {
  return `
    <label class="field">
      <span class="field-label">${label}</span>
      <input id="${id}" type="${type}" autocomplete="off"/>
    </label>`;
}
