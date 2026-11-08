// 愿望单：进度驱动（UI 优化方案 3.11）—— 可兑换浮顶 + 还在攒/兑换记录双 Tab
const WishPage = {
  tab: 'saving',

  async render(root) {
    root.innerHTML = UI.cloudLoading ? UI.cloudLoading('正在查看心愿清单... 🎁') : '<div class="page-loading">加载中…</div>';
    try {
      await this.draw(root);
    } catch (e) {
      root.innerHTML = `<div class="empty big"><div class="empty-emoji">😿</div><div>${UI.esc(e.message)}</div><button class="btn primary" id="retry">重试</button></div>`;
      root.querySelector('#retry').addEventListener('click', () => WishPage.render(root));
    }
  },

  async draw(root) {
    const data = await api.get('/api/wish');
    const active = data.items.filter((i) => i.status === 'active');
    const balance = data.balance;
    const ready = active.filter((i) => i.redeemable);
    const saving = active
      .filter((i) => !i.redeemable)
      .sort((a, b) => (balance / Number(b.points_cost)) - (balance / Number(a.points_cost)));
    const tab = this.tab;

    root.innerHTML = `
      <div class="wf-screen">
        <header class="wf-head">
          <div><h1 class="wf-title">愿望单</h1><div class="wf-sub">攒够就能换，先攒后换</div></div>
          <button class="wf-btn-ghost" id="add-wish">${window.icon('plus')} 新建</button>
        </header>

        <section class="wf-balance">
          <div class="wf-balance-main"><span class="wf-balance-num">${UI.fmtNum(balance)}</span><span class="wf-balance-unit">分</span></div>
          <div class="wf-balance-side">≈ ¥${UI.fmtYuan(balance)}<br/>1 元 = 10 分</div>
        </section>

        ${ready.length ? `
        <section class="wf-section">
          <div class="wf-section-head"><h2 class="wf-section-title">现在可以换</h2><span class="wf-section-note">${ready.length} 件</span></div>
          ${ready.map((i) => this.readyCard(i, balance)).join('')}
        </section>` : ''}

        <div class="wf-tabs" role="tablist">
          <button class="wf-tab ${tab === 'saving' ? 'on' : ''}" data-tab="saving" role="tab">还在攒 ${saving.length}</button>
          <button class="wf-tab ${tab === 'records' ? 'on' : ''}" data-tab="records" role="tab">兑换记录 ${data.redemptions.length}</button>
        </div>

        ${tab === 'saving' ? `
        <section class="wf-section">
          ${saving.length ? `<div class="wf-saving-list">${saving.map((i) => this.savingRow(i, balance)).join('')}</div>` : `
          <div class="wf-empty">
            <div class="wf-empty-emoji">🎁</div>
            <div class="wf-empty-title">还没有在攒的东西</div>
            <div class="wf-empty-sub">把想要的放进来，填真实价格，系统按 1 元 = 10 分换算</div>
            <button class="wf-btn-primary" id="add-wish-2">${window.icon('plus')} 加第一个愿望</button>
          </div>`}
        </section>` : `
        <section class="wf-section">
          ${data.redemptions.length ? `<div class="wf-rec-list">${data.redemptions.map((r) => this.redRow(r)).join('')}</div>` : `<div class="wf-empty"><div class="wf-empty-emoji">🧾</div><div class="wf-empty-title">还没有兑换记录</div><div class="wf-empty-sub">兑换过的会出现在这里</div></div>`}
        </section>`}
      </div>
    `;

    root.querySelector('#add-wish').addEventListener('click', () => WishForm.open({ onSaved: () => this.draw(root) }));
    const add2 = root.querySelector('#add-wish-2');
    if (add2) add2.addEventListener('click', () => WishForm.open({ onSaved: () => this.draw(root) }));

    root.querySelectorAll('.wf-tab').forEach((btn) => {
      btn.addEventListener('click', () => { this.tab = btn.dataset.tab; this.draw(root); });
    });

    root.querySelectorAll('.wf-redeem').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = data.items.find((x) => x.id === Number(btn.dataset.id));
        if (item) this.redeem(item, balance, root);
      });
    });

    root.querySelectorAll('[data-red-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = data.redemptions.find((x) => x.id === Number(btn.dataset.red));
        if (!r) return;
        if (btn.dataset.redAct === 'cancel') this.cancelRed(r, root);
        if (btn.dataset.redAct === 'done') this.markDone(r, root);
      });
    });
  },

  readyCard(i, balance) {
    const after = balance - Number(i.points_cost);
    return `
      <div class="wf-ready">
        <div class="wf-ready-main">
          <span class="wf-ready-emoji">${i.emoji}</span>
          <div class="wf-ready-text">
            <div class="wf-ready-title">${UI.esc(i.title)}</div>
            <div class="wf-ready-meta">换完还剩 ${UI.fmtNum(after)} 分</div>
          </div>
          <div class="wf-ready-cost">${UI.fmtNum(i.points_cost)}<span>分</span></div>
        </div>
        <button class="wf-btn-primary wf-redeem" data-id="${i.id}">兑换 · −${UI.fmtNum(i.points_cost)} 分</button>
      </div>`;
  },

  savingRow(i, balance) {
    const cost = Number(i.points_cost);
    const pct = Math.max(0, Math.min(100, Math.round((balance / cost) * 100)));
    const cells = 10;
    const filled = Math.round((pct / 100) * cells);
    return `
      <div class="wf-saving" data-id="${i.id}">
        <div class="wf-saving-top">
          <span class="wf-saving-emoji">${i.emoji}</span>
          <div class="wf-saving-main">
            <div class="wf-saving-title">${UI.esc(i.title)}</div>
            <div class="wf-saving-meta">${UI.fmtNum(cost)} 分 · 还差 ${UI.fmtNum(Math.max(0, cost - balance))}</div>
          </div>
          <span class="wf-saving-pct">${pct}%</span>
        </div>
        <div class="wf-progress" aria-label="已攒 ${pct}%">${Array.from({ length: cells }, (_, k) => `<i class="${k < filled ? 'on' : ''}"></i>`).join('')}</div>
      </div>`;
  },

  redRow(r) {
    const statusMap = {
      applied: ['待确认', ''],
      confirmed: ['已扣分', 'ok'],
      done: ['已完成', 'ok'],
      cancelled: ['已取消', 'gray'],
      expired: ['已过期', 'gray'],
    };
    const [label, cls] = statusMap[r.status] || [r.status, ''];
    const canCancel = r.status === 'confirmed' && (Date.now() - new Date(r.applied_at).getTime()) <= 2 * 3600000;
    const canDone = r.status === 'confirmed';
    return `
      <div class="wf-rec">
        <span class="wf-rec-emoji">${r.item_emoji}</span>
        <div class="wf-rec-main">
          <div class="wf-rec-title">${UI.esc(r.item_title)}</div>
          <div class="wf-rec-meta">${UI.fmtTimeIso(r.applied_at)} · ${UI.fmtNum(r.points_locked)} 分</div>
        </div>
        <div class="wf-rec-side">
          <span class="wf-tag ${cls}">${label}</span>
          ${canCancel ? `<button class="wf-btn-ghost small" data-red="${r.id}" data-red-act="cancel">撤回</button>` : ''}
          ${canDone ? `<button class="wf-btn-ghost small" data-red="${r.id}" data-red-act="done">已收到</button>` : ''}
        </div>
      </div>`;
  },

  async redeem(item, balance, root) {
    const cost = Number(item.points_cost);
    const body = document.createElement('div');
    body.className = 'redeem-body';
    body.innerHTML = `
      <div class="rb-item">
        <span class="rb-emoji">${item.emoji}</span>
        <div>
          <div class="rb-title">${UI.esc(item.title)}</div>
          <div class="rb-price">${UI.fmtNum(cost)} 分 ≈ ¥${Number(item.price_cny).toLocaleString('zh-CN')}</div>
        </div>
      </div>
      <div class="rb-lines">
        <div class="rb-line"><span>当前余额</span><b>${UI.fmtNum(balance)}</b></div>
        <div class="rb-line"><span>兑换后余额</span><b>${UI.fmtNum(balance - cost)}</b></div>
      </div>
      <p class="rb-hint">商品类兑换提交即扣分，对方看得见。</p>
    `;
    UI.sheet({
      title: '确认兑换',
      body,
      actions: [
        { label: '再想想', onClick: (c) => c() },
        {
          label: `兑换 · −${UI.fmtNum(cost)} 分`,
          kind: 'primary big',
          async onClick(close) {
            try {
              await api.post(`/api/wish/${item.id}/redeem`, {});
              close();
              UI.toast('兑换成功', 'ok');
              WishPage.draw(root);
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
      ],
    });
  },
};
