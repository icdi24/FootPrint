// 我的页：主摘要 + 次指标（UI 优化方案）
const MePage = {
  async render(root) {
    root.innerHTML = UI.cloudLoading ? UI.cloudLoading('正在载入个人脚印... 🌿') : '<div class="page-loading">加载中…</div>';
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
    const partner = App.state.partner;
    const logoutHtml = App.state.localNoLogin ? '' : `
      <section class="mf-section">
        <button class="mf-btn-outline" id="logout">${window.icon('exit')} 退出登录</button>
      </section>`;

    root.innerHTML = `
      <div class="mf-screen">
        <header class="mf-head">
          <div><h1 class="mf-title">我的</h1><div class="mf-sub">${UI.esc(me.nickname)} 的脚印</div></div>
        </header>

        <section class="mf-profile">
          <span class="mf-avatar">${UI.esc(me.avatar)}</span>
          <div class="mf-profile-main">
            <div class="mf-profile-name">${UI.esc(me.nickname)}</div>
            <div class="mf-profile-meta">${partner ? `和 ${UI.esc(partner.nickname)} 互相监督中` : '还没有搭档'}</div>
          </div>
          <button class="mf-btn-ghost" id="change-pw">${window.icon('lock')} 改口令</button>
        </section>

        <section class="mf-summary">
          <div>
            <div class="mf-sum-label">可用积分</div>
            <div class="mf-sum-value">${UI.fmtNum(stats.balance)}</div>
          </div>
          <div class="mf-sum-right">
            <div class="mf-sum-row"><span>本月得分</span><b>+${UI.fmtNum(stats.monthPoints)}</b></div>
            <div class="mf-sum-row"><span>当前连续</span><b>${stats.currentStreak} 天</b></div>
          </div>
        </section>

        <section class="mf-grid">
          <div class="mf-cell"><div class="mf-cell-label">本月完成率</div><div class="mf-cell-value">${stats.completion === null ? '—' : `${stats.completion}%`}</div></div>
          <div class="mf-cell"><div class="mf-cell-label">时间投入</div><div class="mf-cell-value">${(stats.timeInvestMin / 60).toFixed(1)} 小时</div></div>
          <div class="mf-cell"><div class="mf-cell-label">最长连续</div><div class="mf-cell-value">${stats.bestStreak} 天</div></div>
          <div class="mf-cell"><div class="mf-cell-label">被驳回次数</div><div class="mf-cell-value">${stats.rejectedCount}</div></div>
        </section>

        <section class="mf-section">
          <div class="mf-section-head"><h2 class="mf-section-title">积分流水</h2></div>
          <div id="ledger-list"><div class="mf-loading">加载中…</div></div>
        </section>

        <section class="mf-section">
          <div class="mf-section-head"><h2 class="mf-section-title">AI 日报</h2><span class="mf-section-note" id="diary-dot" style="display:none">有新的</span></div>
          <div id="diary-box"><div class="mf-loading">加载中…</div></div>
        </section>

        <section class="mf-section">
          <div class="mf-section-head"><h2 class="mf-section-title">设置</h2></div>
          <div class="mf-menu">
            <button class="mf-menu-row" id="m-profile"><span>我的画像</span><span class="mf-menu-note">仅自己可见</span></button>
            <button class="mf-menu-row" id="m-zoowy"><span>和 zoowy 聊聊</span><span class="mf-menu-note">知道你的目标</span></button>
            <button class="mf-menu-row" id="m-points"><span>积分系数</span><span class="mf-menu-note">规则可调</span></button>
            <button class="mf-menu-row" id="m-data"><span>数据与备份</span><span class="mf-menu-note">导出 · 快照</span></button>
            <button class="mf-menu-row" id="change-nick"><span>改昵称</span><span class="mf-menu-note">${UI.esc(me.nickname)}</span></button>
          </div>
        </section>

        <section class="mf-section">
          <div class="mf-section-head"><h2 class="mf-section-title">我的搭档</h2></div>
          <div id="pair-card"><div class="mf-loading">加载中…</div></div>
        </section>

        ${logoutHtml}
        <p class="mf-about">脚印 · 两个人互相看得见</p>
      </div>
    `;

    root.querySelector('#change-nick').addEventListener('click', () => this.changeNickname(root));
    root.querySelector('#change-pw').addEventListener('click', () => this.changePassword());
    root.querySelector('#m-points').addEventListener('click', () => this.pointsSettings());
    root.querySelector('#m-data').addEventListener('click', () => this.dataSheet(root));
    root.querySelector('#m-zoowy').addEventListener('click', () => ZoowyChat.open({ title: 'zoowy' }));
    root.querySelector('#m-profile').addEventListener('click', () => this.profileSheet());
    this.loadDiary(root);
    const logoutBtn = root.querySelector('#logout');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      const yes = await UI.confirm('退出登录？下次要用口令再进来。', { okLabel: '退出' });
      if (!yes) return;
      try { await api.post('/api/logout'); } catch (e) { /* 忽略 */ }
      App.showAuth();
    });
    this.loadPairCard(root);
    this.loadLedger(root);
  },

  // ---- 我的搭档：邀请码 / 解绑 ----
  async loadPairCard(root) {
    const box = root.querySelector('#pair-card');
    if (!box) return;
    let st;
    try {
      st = await api.get('/api/pair/status');
    } catch (e) {
      box.innerHTML = `<div class="mf-loading">${UI.esc(e.message)}</div>`;
      return;
    }
    let invites = [];
    if (st.canInvite) {
      try { invites = (await api.get('/api/pair/invites')).invites || []; } catch (e) { /* 忽略 */ }
    }
    box.innerHTML = `
      <div class="mf-pair">
        ${st.partner ? `
          <div class="mf-pair-row">
            <span class="mf-pair-avatar">${UI.esc(st.partner.avatar)}</span>
            <div class="mf-pair-main">
              <div class="mf-pair-name">${UI.esc(st.partner.nickname)}</div>
              <div class="mf-pair-meta">已绑定 · 互相监督中</div>
            </div>
          </div>` : `<div class="mf-pair-empty">还没有搭档，生成邀请码请对方加入。</div>`}
        ${st.canInvite ? `
          <button class="mf-btn-primary" id="pair-gen">生成邀请码</button>
          ${invites.length ? `<div class="mf-invite-list">${invites.map((v) => `
            <div class="mf-invite-row"><code>${UI.esc(v.code)}</code><span>${UI.esc(String(v.expires_at).slice(5, 16).replace('T', ' '))} 前有效</span><button class="mf-btn-ghost small" data-revoke="${UI.esc(v.code)}">撤销</button></div>`).join('')}</div>` : ''}` : ''}
        ${st.paired ? '<button class="mf-btn-outline" id="pair-unbind">解除绑定</button>' : ''}
      </div>`;
    const gen = box.querySelector('#pair-gen');
    if (gen) gen.addEventListener('click', async () => {
      try {
        const d = await api.post('/api/pair/invite', {});
        const body = document.createElement('div');
        body.className = 'mf-invite-card';
        body.innerHTML = `<div class="mf-invite-title">把这串码发给对方</div><div class="mf-invite-code">${UI.esc(d.code)}</div><div class="mf-invite-hint">24 小时内有效，只能用一次</div>`;
        UI.sheet({ title: '邀请码', body, actions: [{ label: '知道了', onClick: (close) => close() }] });
        this.loadPairCard(root);
      } catch (e) { UI.toast(e.message); }
    });
    box.querySelectorAll('[data-revoke]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await api.post(`/api/pair/invite/${btn.dataset.revoke}/revoke`, {});
        UI.toast('已撤销', 'ok');
        this.loadPairCard(root);
      } catch (e) { UI.toast(e.message); }
    }));
    const unbind = box.querySelector('#pair-unbind');
    if (unbind) unbind.addEventListener('click', async () => {
      const yes = await UI.confirm('解除绑定后，对方立刻看不到你的数据；未完成的验收和未确认的兑换会作废。确定吗？', { okLabel: '解除绑定' });
      if (!yes) return;
      try {
        const d = await api.post('/api/pair/unbind', {});
        UI.toast(`已解除绑定（作废验收 ${d.cancelledVerifications} 条、退分 ${d.refunded} 笔）`, 'ok');
        MePage.render(root);
      } catch (e) { UI.toast(e.message); }
    });
  },

  // ---- AI 日报 ----
  async loadDiary(root) {
    const box = root.querySelector('#diary-box');
    const dot = root.querySelector('#diary-dot');
    if (!box) return;
    let d;
    try {
      d = await api.get('/api/diaries/today');
    } catch (e) {
      box.innerHTML = `<div class="mf-loading">${UI.esc(e.message)}</div>`;
      return;
    }
    if (!d.diary) {
      box.innerHTML = '<div class="mf-empty-row">今天的日报 23:30 由 zoowy 生成，到时候来看。</div>';
      return;
    }
    const diary = d.diary;
    try {
      const lastRead = localStorage.getItem('fp_diary_read');
      if (lastRead !== diary.diary_date && dot) dot.style.display = '';
    } catch (e) { /* localStorage 不可用就无红点 */ }
    const preview = String(diary.content).slice(0, 80);
    box.innerHTML = `
      <div class="mf-diary" id="diary-card">
        <div class="mf-diary-date">${UI.fmtDate(diary.diary_date)}${diary.edited ? ' · 已改过' : ''}</div>
        <div class="mf-diary-text">${UI.esc(preview)}${diary.content.length > 80 ? '…' : ''}</div>
        ${diary.shared ? '<div class="mf-diary-shared">已分享给对方</div>' : ''}
      </div>`;
    box.querySelector('#diary-card').addEventListener('click', () => this.diarySheet(diary, root));
  },

  diarySheet(diary, root) {
    try { localStorage.setItem('fp_diary_read', diary.diary_date); } catch (e) { /* 忽略 */ }
    const dot = document.getElementById('diary-dot');
    if (dot) dot.style.display = 'none';
    const body = document.createElement('div');
    body.className = 'diary-full';
    body.innerHTML = `
      <div class="df-text">${UI.esc(diary.content).replace(/\n/g, '<br/>')}</div>
      <textarea id="df-edit" rows="8" class="hidden">${UI.esc(diary.content)}</textarea>
      <div class="gf-hint">改过的版本会盖在 AI 原文上（原文保留）；明天生成新日报不会回改这篇。</div>
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

  async profileSheet() {
    let d;
    try { d = await api.get('/api/me/profile'); } catch (e) { return UI.toast(e.message, 'err'); }
    const BLOCK_NAMES = { basic: '基本情况', resume: '简历', skills: '能力', goal_progress: '目标进展', important: '重要信息' };
    const body = document.createElement('div');
    body.className = 'profile-body';
    const active = d.blocks.filter((b) => b.status === 'active');
    body.innerHTML = `
      ${active.length ? active.map((b) => `
        <div class="pf-block" data-block="${UI.esc(b.block)}">
          <div class="pf-head"><b>${UI.esc(BLOCK_NAMES[b.block] || b.block)}</b><span class="pf-src">${b.source === 'user' ? '你改的' : 'zoowy 记的'}</span></div>
          <div class="pf-content">${UI.esc(b.content).replace(/\n/g, '<br/>')}</div>
          <div class="pf-acts"><button class="sc-btn ghost" data-act="edit">改</button><button class="sc-btn ghost danger" data-act="del">删</button></div>
        </div>`).join('') : '<div class="ld-empty">画像还是空的。聊几天天、打几天卡，zoowy 会慢慢记住你。</div>'}
      <button class="ghost-btn" id="pf-add">＋ 补一块</button>
    `;
    UI.sheet({ title: '我的画像', body, actions: [{ label: '关闭', onClick: (close) => close() }] });
  },

  async loadLedger(root) {
    const list = root.querySelector('#ledger-list');
    if (!list) return;
    try {
      const d = await api.get('/api/me/ledger?limit=15');
      if (!d.items.length) { list.innerHTML = '<div class="ld-empty">还没有流水，去打第一张卡吧</div>'; return; }
      list.innerHTML = d.items.map((x) => `
        <div class="ld-row">
          <div class="ld-main"><div class="ld-type">${x.typeLabel}${x.note ? ` · ${UI.esc(x.note)}` : ''}</div><div class="ld-time">${UI.fmtTimeIso(x.createdAt)}</div></div>
          <div class="ld-amt ${x.delta > 0 ? 'pos' : x.delta < 0 ? 'neg' : ''}">${x.delta > 0 ? '+' : ''}${UI.fmtNum(x.delta)}</div>
        </div>`).join('');
    } catch (e) {
      if (list) list.innerHTML = '<div class="ld-empty">流水加载失败</div>';
    }
  },

  async changeNickname(root) {
    const body = document.createElement('div');
    body.className = 'goal-form';
    body.innerHTML = `<div class="gf-row"><label class="gf-label">新昵称</label><input id="new-nick" value="${UI.esc(App.state.me.nickname)}" maxlength="30"/></div>`;
    UI.sheet({
      title: '修改昵称',
      body,
      actions: [{ label: '取消', onClick: (c) => c() }, {
        label: '保存', kind: 'primary',
        async onClick(close) {
          const val = body.querySelector('#new-nick').value.trim();
          if (!val) return UI.toast('昵称不能为空', 'err');
          try {
            await api.patch('/api/me', { nickname: val });
            App.state.me.nickname = val;
            UI.toast('昵称已修改', 'ok');
            close();
            MePage.render(root);
          } catch (e) { UI.toast(e.message, 'err'); }
        }
      }]
    });
  },

  async changePassword() {
    const body = document.createElement('div');
    body.className = 'pw-form';
    body.innerHTML = `
      <label class="field"><span class="field-label">原口令</span><input id="old-pw" type="password"/></label>
      <label class="field"><span class="field-label">新口令（至少 6 位）</span><input id="new-pw" type="password"/></label>
    `;
    UI.sheet({
      title: '修改口令',
      body,
      actions: [{ label: '取消', onClick: (c) => c() }, {
        label: '修改', kind: 'primary',
        async onClick(close) {
          const o = body.querySelector('#old-pw').value;
          const n = body.querySelector('#new-pw').value;
          try {
            await api.post('/api/me/password', { oldPassword: o, newPassword: n });
            close();
            UI.toast('口令已修改', 'ok');
          } catch (e) { UI.toast(e.message, 'err'); }
        }
      }]
    });
  },

  async pointsSettings() {
    let cfg;
    try { cfg = (await api.get('/api/settings')).points; } catch (e) { return UI.toast(e.message, 'err'); }
    const body = document.createElement('div');
    body.className = 'goal-form';
    body.innerHTML = `<div style="padding:10px; font-size:12px;">单次时长系数：${cfg.unit}，单次上限：${cfg.cap} 分</div>`;
    UI.sheet({ title: '积分规则', body, actions: [{ label: '知道了', onClick: (c) => c() }] });
  },

  async dataSheet(root) {
    const body = document.createElement('div');
    body.innerHTML = `<div style="padding:14px; text-align:center;"><button class="btn primary" id="do-backup">立即生成快照</button></div>`;
    body.querySelector('#do-backup').addEventListener('click', async () => {
      try {
        await api.post('/api/ops/backup');
        UI.toast('快照已生成', 'ok');
      } catch (e) { UI.toast(e.message, 'err'); }
    });
    UI.sheet({ title: '数据与备份', body, actions: [{ label: '关闭', onClick: (c) => c() }] });
  }
};
