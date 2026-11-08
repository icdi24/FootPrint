// 匹配大厅：无搭子用户发布找搭子信息、浏览他人发布、互相邀请组队。
// 全屏 overlay，从「我们」页无搭子分支的「去匹配大厅」按钮打开。
const HallPage = {
  isOpen: false,
  container: null,
  state: null,

  async open() {
    if (this.isOpen) return;
    this.isOpen = true;

    const body = document.createElement('div');
    body.className = 'hall-body';
    body.innerHTML = '<div class="zp-loading">加载中…</div>';
    this.container = body;

    UI.sheet({
      title: '匹配大厅',
      body,
      actions: [],
      onClose: () => {
        this.isOpen = false;
        this.container = null;
      },
    });

    await this.refresh();
  },

  async refresh() {
    if (!this.container) return;
    this.container.innerHTML = '<div class="zp-loading">加载中…</div>';
    try {
      this.state = await api.get('/api/hall');
      this.draw();
    } catch (e) {
      this.container.innerHTML = `<div class="zp-err">🐾 ${UI.esc(e.message)}</div>`;
    }
  },

  // 用当前 state 渲染整页
  draw() {
    const s = this.state;
    const c = this.container;
    if (!c) return;

    const mine = s.myListing;
    const inviteSection = this.invitesHtml(s);

    c.innerHTML = `
      <div class="hall-sec">
        <div class="hall-sec-title">我的发布</div>
        ${mine ? `
          <div class="hall-mycard">
            <div class="hall-mynote">${UI.esc(mine.note) || '<span class="muted">（没写自我介绍）</span>'}</div>
            ${mine.goalSummary ? `<div class="hall-mysum">🎯 ${UI.esc(mine.goalSummary)}</div>` : ''}
            <div class="hall-btn-row">
              <button class="btn ghost" id="hall-edit">编辑</button>
              <button class="btn outline danger" id="hall-withdraw">撤回</button>
            </div>
          </div>` : `
          <div class="hall-mynone">
            <div>把你的目标摘要 + 一句话介绍发到大伙都能看见的地方。</div>
            <button class="btn primary" id="hall-publish">发布找搭子信息</button>
          </div>`}
      </div>

      ${inviteSection}

      <div class="hall-sec">
        <div class="hall-sec-title">正在找搭子</div>
        ${s.listings.length ? s.listings.map((l) => this.listingCard(l)).join('')
          : '<div class="empty small"><div class="empty-emoji">🌱</div><div class="empty-sub">暂时没人，你发一条吧</div></div>'}
      </div>
    `;

    // 我的发布按钮
    c.querySelector('#hall-publish')?.addEventListener('click', () => this.publishSheet(null));
    c.querySelector('#hall-edit')?.addEventListener('click', () => this.publishSheet(mine));
    c.querySelector('#hall-withdraw')?.addEventListener('click', () => this.withdraw());

    // 大厅列表按钮
    c.querySelectorAll('[data-invite]').forEach((btn) => {
      btn.addEventListener('click', () => this.invite(Number(btn.dataset.invite)));
    });
    c.querySelectorAll('[data-accept]').forEach((btn) => {
      btn.addEventListener('click', () => this.accept(Number(btn.dataset.accept)));
    });
    c.querySelectorAll('[data-decline]').forEach((btn) => {
      btn.addEventListener('click', () => this.decline(Number(btn.dataset.decline)));
    });
    c.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => this.cancel(Number(btn.dataset.cancel)));
    });
  },

  listingCard(l) {
    let btn = '';
    if (l.relation === 'invitedByMe') {
      btn = '<span class="hall-wait">已邀请，待对方确认</span>';
    } else if (l.relation === 'invitedMe') {
      btn = `<button class="btn ghost" data-decline="${l.userId}">拒绝</button>
             <button class="btn primary" data-accept="${l.userId}">接受</button>`;
    } else {
      btn = `<button class="btn primary" data-invite="${l.userId}">邀请</button>`;
    }
    return `
      <div class="hall-card">
        <div class="hall-card-head">
          <span class="hall-avatar">${UI.esc(l.avatar)}</span>
          <div class="hall-who">
            <div class="hall-nick">${UI.esc(l.nickname)}</div>
            <div class="hall-time">${UI.fmtTimeIso(l.createdAt)}</div>
          </div>
        </div>
        ${l.note ? `<div class="hall-note">${UI.esc(l.note)}</div>` : ''}
        ${l.goalSummary ? `<div class="hall-sum">🎯 ${UI.esc(l.goalSummary)}</div>` : ''}
        <div class="hall-btn-row">${btn}</div>
      </div>`;
  },

  invitesHtml(s) {
    const hasIncoming = s.incoming.length;
    const hasOutgoing = s.outgoing.length;
    if (!hasIncoming && !hasOutgoing) return '';

    const incoming = s.incoming.map((inv) => `
      <div class="hall-invite">
        <span class="hall-avatar">${UI.esc(inv.fromUser.avatar)}</span>
        <div class="hall-who">
          <div class="hall-nick">${UI.esc(inv.fromUser.nickname)} 邀请你组队</div>
          <div class="hall-time">${UI.fmtTimeIso(inv.createdAt)}</div>
        </div>
        <div class="hall-btn-row">
          <button class="btn ghost" data-decline="${inv.id}">拒绝</button>
          <button class="btn primary" data-accept="${inv.id}">接受</button>
        </div>
      </div>`).join('');

    const outgoing = s.outgoing.map((inv) => `
      <div class="hall-invite">
        <span class="hall-avatar">${UI.esc(inv.toUser.avatar)}</span>
        <div class="hall-who">
          <div class="hall-nick">你邀请了 ${UI.esc(inv.toUser.nickname)}</div>
          <div class="hall-time">${UI.fmtTimeIso(inv.createdAt)}</div>
        </div>
        <div class="hall-btn-row"><button class="btn ghost" data-cancel="${inv.id}">取消</button></div>
      </div>`).join('');

    return `
      <div class="hall-sec">
        <div class="hall-sec-title">邀请</div>
        ${incoming}${outgoing}
      </div>`;
  },

  publishSheet(existing) {
    const body = document.createElement('div');
    body.className = 'hall-form';
    body.innerHTML = `
      <label class="gf-label">一句话介绍自己（选填，最多 200 字）</label>
      <textarea id="hall-note" rows="3" maxlength="200" placeholder="比如：早起型，想找个人一起坚持每天跑步">${UI.esc(existing ? existing.note : '')}</textarea>
      <div class="hall-form-tip">发布时会自动附上你当前的目标摘要（最多 5 条），让别人一眼看懂你在坚持什么。</div>
    `;
    UI.sheet({
      title: existing ? '编辑我的发布' : '发布找搭子信息',
      body,
      actions: [
        { label: '再想想', onClick: (cl) => cl() },
        {
          label: '发布',
          kind: 'primary',
          async onClick(close) {
            const note = body.querySelector('#hall-note').value.trim();
            try {
              await api.post('/api/hall', { note });
              close();
              UI.toast('已发布到大厅', 'ok');
              HallPage.refresh();
            } catch (e) {
              UI.toast(e.message, 'err');
            }
          },
        },
      ],
    });
  },

  async withdraw() {
    const yes = await UI.confirm('撤回后别人就看不见你了，确定吗？', { danger: true, okLabel: '撤回' });
    if (!yes) return;
    try {
      await api.delete('/api/hall');
      UI.toast('已撤回', 'ok');
      this.refresh();
    } catch (e) { UI.toast(e.message, 'err'); }
  },

  async invite(toUserId) {
    try {
      await api.post('/api/hall/invite', { toUserId });
      UI.toast('邀请已发出，等对方确认', 'ok');
      this.refresh();
    } catch (e) { UI.toast(e.message, 'err'); }
  },

  async accept(id) {
    const yes = await UI.confirm('接受后你们会自动成为搭子，确定吗？', { okLabel: '接受' });
    if (!yes) return;
    try {
      await api.post(`/api/hall/invite/${id}/accept`);
      this.close();
      UI.toast('组队成功 🎉', 'ok');
      // 已组队：刷新「我们」页展示搭子
      App.showTab('partner');
    } catch (e) { UI.toast(e.message, 'err'); }
  },

  async decline(id) {
    try {
      await api.post(`/api/hall/invite/${id}/decline`);
      this.refresh();
    } catch (e) { UI.toast(e.message, 'err'); }
  },

  async cancel(id) {
    try {
      await api.post(`/api/hall/invite/${id}/cancel`);
      this.refresh();
    } catch (e) { UI.toast(e.message, 'err'); }
  },

  close() {
    // 关闭由 UI.sheet 的 backdrop 或这里触发；直接移除弹层
    const wrap = document.querySelector('.sheet-wrap.show');
    if (wrap) {
      wrap.querySelector('.sheet-backdrop')?.click();
    }
    this.isOpen = false;
  },
};
