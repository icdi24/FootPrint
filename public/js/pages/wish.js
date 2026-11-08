// 愿望单页：商品卡 + 兑换 + 兑换记录（V0.1 商品类）。
const WishPage = {
  async render(root) {
    if (App.isGuest()) {
      this.renderGuest(root);
      return;
    }
    root.innerHTML = '<div class="page-loading">加载中…</div>';
    try {
      await this.draw(root);
    } catch (e) {
      root.innerHTML = `<div class="empty big"><div class="empty-emoji">😿</div><div>${UI.esc(e.message)}</div><button class="btn primary" id="retry">重试</button></div>`;
      root.querySelector('#retry').addEventListener('click', () => WishPage.render(root));
    }
  },

  // 游客视图：完整界面（新建按钮、余额横幅、愿望列表），数据为空，点任何入口跳登录。
  renderGuest(root) {
    root.innerHTML = `
      <header class="page-head wish-head">
        <div>
          <div class="hello">愿望单</div>
          <div class="date-line">攒够分，换点真的</div>
        </div>
        <button class="ghost-btn" id="add-wish">${window.icon('plus')} 新建</button>
      </header>
      <section class="wish-balance">
        <div>
          <div class="wb-label">可用积分</div>
          <div class="wb-val">0</div>
        </div>
        <div class="wb-yuan">≈ ¥0<span> · 1 元 = 10 分</span></div>
      </section>
      <section class="sec">
        <div class="sec-head"><h2>想要的东西</h2></div>
        <div class="empty">
          <div class="empty-emoji">🎁</div>
          <div class="empty-title">愿望单还是空的</div>
          <div class="empty-sub">把想买的东西放进来，填上真实价格，系统按 1 元 = 10 分换算</div>
        </div>
      </section>
    `;
    UI.guestGate(root);
  },

  async draw(root) {
    const data = await api.get('/api/wish');
    const active = data.items.filter((i) => i.status === 'active');

    root.innerHTML = `
      <header class="page-head wish-head">
        <div>
          <div class="hello">愿望单</div>
          <div class="date-line">攒够分，换点真的</div>
        </div>
        <button class="ghost-btn" id="add-wish">${window.icon('plus')} 新建</button>
      </header>

      <section class="wish-balance">
        <div>
          <div class="wb-label">可用积分</div>
          <div class="wb-val">${UI.fmtNum(data.balance)}</div>
        </div>
        <div class="wb-yuan">≈ ¥${UI.fmtYuan(data.balance)}<span> · 1 元 = 10 分</span></div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>想要的东西</h2>${active.length ? `<span class="sec-count">${active.length} 件</span>` : ''}</div>
        ${active.length ? `<div class="wish-list">${active.map((i) => this.itemCard(i, data.balance)).join('')}</div>` : `
        <div class="empty">
          <div class="empty-emoji">🎁</div>
          <div class="empty-title">愿望单还是空的</div>
          <div class="empty-sub">把想买的东西放进来，填上真实价格，系统按 1 元 = 10 分换算</div>
        </div>`}
      </section>

      ${data.redemptions.length ? `
      <section class="sec">
        <div class="sec-head"><h2>兑换记录</h2></div>
        <div class="red-list">
          ${data.redemptions.map((r) => this.redRow(r)).join('')}
        </div>
      </section>` : ''}
    `;

    root.querySelector('#add-wish').addEventListener('click', () => {
      WishForm.open({ onSaved: () => this.draw(root) });
    });
    root.querySelectorAll('.btn-redeem').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = data.items.find((x) => x.id === Number(btn.dataset.id));
        if (item) this.redeem(item, data.balance, root);
      });
    });
    root.querySelectorAll('.wish-card').forEach((card) => {
      const open = (e) => {
        if (e.target.closest('.btn-redeem')) return;
        const item = data.items.find((x) => x.id === Number(card.dataset.id));
        if (item) WishForm.open({ item, onSaved: () => this.draw(root) });
      };
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.btn-redeem')) {
          e.preventDefault(); open(e);
        }
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

  itemCard(i, balance) {
    const lack = Number(i.points_cost) - balance;
    const btn = i.redeemable
      ? `<button class="btn-redeem" data-id="${i.id}">兑换</button>`
      : i.cooldownMsg
        ? `<button class="btn-redeem disabled" disabled>冷却中</button>`
        : `<button class="btn-redeem disabled" disabled>差 ${UI.fmtNum(lack)} 分</button>`;
    return `
      <div class="wish-card" data-id="${i.id}">
        <div class="wc-emoji">${i.emoji}</div>
        <div class="wc-main">
          <div class="wc-title">${UI.esc(i.title)}</div>
          <div class="wc-price">${UI.fmtNum(i.points_cost)} 分 <span>≈ ¥${Number(i.price_cny).toLocaleString('zh-CN')}</span></div>
          ${i.description ? `<div class="wc-desc">${UI.esc(i.description)}</div>` : ''}
          ${i.cooldownMsg ? `<div class="wc-cool">${UI.esc(i.cooldownMsg)}</div>` : ''}
        </div>
        <div class="wc-side">${btn}</div>
      </div>`;
  },

  redRow(r) {
    const statusMap = {
      applied: ['待确认', 'st'],
      confirmed: ['已扣分', 'st ok'],
      done: ['已完成', 'st done'],
      cancelled: ['已取消', 'st gray'],
      expired: ['已过期', 'st gray'],
    };
    const [label, cls] = statusMap[r.status] || [r.status, 'st'];
    const canCancel = r.status === 'confirmed' && (Date.now() - new Date(r.applied_at).getTime()) <= 2 * 3600000;
    const canDone = r.status === 'confirmed';
    return `
      <div class="red-row">
        <span class="rr-emoji">${r.item_emoji}</span>
        <div class="rr-main">
          <div class="rr-title">${UI.esc(r.item_title)}</div>
          <div class="rr-sub">${UI.fmtTimeIso(r.applied_at)} · ${UI.fmtNum(r.points_locked)} 分</div>
        </div>
        <div class="rr-side">
          <span class="st ${cls}">${label}</span>
          ${canCancel ? `<button class="mini-btn danger" data-red="${r.id}" data-red-act="cancel">撤回</button>` : ''}
          ${canDone ? `<button class="mini-btn" data-red="${r.id}" data-red-act="done">已收到</button>` : ''}
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
      <p class="rb-hint">商品类兑换自己说了算，提交即扣分；买没买、花没花，对方看得见。</p>
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
              const data = await api.post(`/api/wish/${item.id}/redeem`);
              close();
              UI.toast(`兑换成功，余额 ${UI.fmtNum(data.balance)} 分`, 'ok');
              WishPage.draw(root);
            } catch (e) {
              UI.toast(e.message, 'err');
            }
          },
        },
      ],
    });
  },

  async cancelRed(r, root) {
    const yes = await UI.confirm('撤回这次兑换？积分会退回余额。', { okLabel: '撤回' });
    if (!yes) return;
    try {
      await api.post(`/api/redemptions/${r.id}/cancel`);
      UI.toast('已撤回，积分退回', 'warn');
      this.draw(root);
    } catch (e) {
      UI.toast(e.message, 'err');
    }
  },

  async markDone(r, root) {
    try {
      await api.post(`/api/redemptions/${r.id}/done`);
      UI.toast('记好了，去把它买回来吧 🛍️', 'ok');
      this.draw(root);
    } catch (e) {
      UI.toast(e.message, 'err');
    }
  },
};

// 新建/编辑愿望
const WishForm = {
  async open({ item, onSaved }) {
    const editing = !!item;
    const w = item || { title: '', emoji: '🎁', description: '', price_cny: '', points_cost: '', cooldown_days: 0, status: 'active' };
    const EMOJIS = ['🎁', '🎧', '⌚', '👟', '🎮', '📱', '💄', '👜', '🍰', '🎬', '🛹', '📷', '✈️', '🍲', '🪑', '🌷'];
    const body = document.createElement('div');
    body.className = 'wish-form';
    body.innerHTML = `
      <div class="gf-row">
        <div class="emoji-pick" id="wf-emoji">
          ${EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === w.emoji ? 'on' : ''}">${e}</button>`).join('')}
        </div>
        <input id="wf-title" maxlength="30" placeholder="想要什么，比如：蓝牙耳机" value="${UI.esc(w.title)}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">参考价（元）</label>
        <input id="wf-price" type="number" min="0.1" step="0.1" placeholder="真实价格，比如 199" value="${w.price_cny}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">积分价（自动 = 参考价 × 10，可改）</label>
        <input id="wf-points" type="number" min="1" step="1" placeholder="自动换算" value="${w.points_cost}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">描述（可选）</label>
        <textarea id="wf-desc" rows="2" maxlength="300" placeholder="型号、颜色，写清楚一点">${UI.esc(w.description)}</textarea>
      </div>
      <div class="gf-row">
        <label class="gf-label">冷却期（兑换后 N 天不能再兑，0 = 不限制）</label>
        <input id="wf-cool" type="number" min="0" max="365" value="${w.cooldown_days}"/>
      </div>
      ${editing ? `
      <div class="gf-row">
        <label class="gf-label">状态</label>
        <div class="freq-seg" id="wf-status">
          <button type="button" data-v="active" class="${w.status === 'active' ? 'on' : ''}">上架</button>
          <button type="button" data-v="archived" class="${w.status !== 'active' ? 'on' : ''}">下架</button>
        </div>
      </div>` : ''}
      <p class="wf-hint">改价会记入历史，对方看得见。参考价别虚标，这是你们之间的信用。</p>
    `;
    const priceInput = body.querySelector('#wf-price');
    const pointsInput = body.querySelector('#wf-points');
    let autoPoints = true;
    priceInput.addEventListener('input', () => {
      if (autoPoints && priceInput.value) {
        pointsInput.value = Math.round(Number(priceInput.value) * 10);
      }
    });
    pointsInput.addEventListener('input', () => { autoPoints = false; });
    body.querySelector('#wf-emoji').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      body.querySelectorAll('#wf-emoji button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    });

    let saving = false;
    UI.sheet({
      title: editing ? '编辑愿望' : '新建愿望',
      body,
      actions: [
        {
          label: editing ? '保存' : '放上愿望单',
          kind: 'primary big',
          async onClick(close) {
            if (saving) return;
            const title = body.querySelector('#wf-title').value.trim();
            const price = Number(body.querySelector('#wf-price').value);
            const points = pointsInput.value ? Number(pointsInput.value) : undefined;
            if (!title) { UI.toast('先起个名字', 'warn'); return; }
            if (!price || price <= 0) { UI.toast('参考价要大于 0', 'warn'); return; }
            const payload = {
              title,
              emoji: body.querySelector('#wf-emoji .on').dataset.e,
              description: body.querySelector('#wf-desc').value.trim(),
              price_cny: price,
              points_cost: points,
              cooldown_days: Number(body.querySelector('#wf-cool').value) || 0,
            };
            if (editing) {
              const st = body.querySelector('#wf-status .on');
              payload.status = st ? st.dataset.v : 'active';
            }
            saving = true;
            try {
              if (editing) await api.put(`/api/wish/${item.id}`, payload);
              else await api.post('/api/wish', payload);
              close();
              UI.toast(editing ? '已保存' : '放上愿望单了 🎁', 'ok');
              if (onSaved) onSaved();
            } catch (e) {
              saving = false;
              UI.toast(e.message, 'err');
            }
          },
        },
      ],
    });
  },
};
