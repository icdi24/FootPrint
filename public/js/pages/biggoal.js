// 大目标：表单、详情弹层（整条路线 + 手改 + zoowy 规划）。
// 路线规则：未启动（planned）不进统计/「我们」页/首页；手改优先于 AI 重排；
// 重排只碰 planned；勾选候选 = 一次确认。
const BigGoalForm = {
  async open({ bigGoal, onSaved }) {
    const editing = !!bigGoal;
    const g = bigGoal || { title: '', emoji: '🏔️', description: '' };
    const EMOJIS = ['🏔️', '🚀', '🎓', '💼', '🏃', '📖', '🎸', '💻', '🏆', '🌱', '🎯', '✈️'];
    const body = document.createElement('div');
    body.className = 'goal-form';
    body.innerHTML = `
      <div class="gf-row gf-title-row">
        <div class="emoji-pick" id="bg-emoji">
          ${EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === g.emoji ? 'on' : ''}">${e}</button>`).join('')}
        </div>
        <input id="bg-title" maxlength="40" placeholder="大目标名称，比如：找到 Agent 开发工程师的工作" value="${UI.esc(g.title)}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">描述（这段会喂给 zoowy 帮你拆计划）</label>
        <textarea id="bg-desc" rows="3" maxlength="500" placeholder="想到哪写到哪：为什么想做、现在什么水平、大概多久想成">${UI.esc(g.description)}</textarea>
      </div>
    `;
    let emoji = g.emoji;
    body.querySelector('#bg-emoji').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-e]');
      if (!b) return;
      emoji = b.dataset.e;
      body.querySelectorAll('#bg-emoji button').forEach((x) => x.classList.toggle('on', x === b));
    });
    await UI.sheet({
      title: editing ? '编辑大目标' : '新建大目标',
      body,
      actions: [
        {
          label: editing ? '保存' : '创建',
          kind: 'primary',
          async onClick(close) {
            const title = body.querySelector('#bg-title').value.trim();
            const description = body.querySelector('#bg-desc').value.trim();
            if (!title) return UI.toast('先起个名字', 'err');
            try {
              if (editing) await api.patch(`/api/biggoals/${g.id}`, { title, emoji, description });
              else await api.post('/api/biggoals', { title, emoji, description });
              UI.toast(editing ? '已保存' : '大目标建好了 🏔️', 'ok');
              close();
              if (onSaved) onSaved();
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
      ],
    });
  },
};

// 大目标详情：整条路线（含未启动）+ 进度条 + 手改/增删/调序 + 和 zoowy 讨论
const BigGoalDetail = {
  async open(bgId, { onChanged } = {}) {
    let data;
    try {
      data = await api.get(`/api/biggoals/${bgId}`);
    } catch (e) { return UI.toast(e.message, 'err'); }
    const bg = data.bigGoal;
    const changed = () => { this.open(bgId, { onChanged }); if (onChanged) onChanged(); };

    const body = document.createElement('div');
    body.className = 'bgd-body';
    const pct = Math.max(0, Math.min(100, Number(bg.progress) || 0));
    const PLAN_BADGE = {
      planned: { label: '未启动', cls: 'gray' },
      released: { label: '进行中', cls: 'active' },
      done: { label: '已达成', cls: 'achieved' },
    };
    const statusText = { active: '推进中', done: '已达成', archived: '已归档' };
    body.innerHTML = `
      <div class="bgd-head">
        <div class="bgd-emoji">${UI.esc(bg.emoji)}</div>
        <div class="bgd-info">
          <div class="bgd-title">${UI.esc(bg.title)}</div>
          <div class="bgd-sub">${statusText[bg.status] || ''} · 客观 ${data.done}/${data.total} 个小目标达成</div>
        </div>
      </div>
      <div class="bgd-progress">
        <div class="bgd-bar"><i style="width:${pct}%"></i></div>
        <div class="bgd-pct-row">
          <b>${pct}%</b><span>zoowy 估的进度</span>
        </div>
        ${bg.progress_note ? `<div class="bgd-note">${UI.esc(bg.progress_note)}${bg.progress_at ? ` · ${UI.fmtTimeIso(bg.progress_at)}` : ''}</div>` : ''}
      </div>
      ${bg.description ? `<p class="bgd-desc">${UI.esc(bg.description)}</p>` : ''}
      <div class="bgd-list-title">整条路线（含未启动）</div>
      <div class="bgd-chain" id="bgd-chain">
        ${data.chain.length ? data.chain.map((g) => this.chainItem(g)).join('') : '<div class="gd-empty">还没有小目标，点下面「让 zoowy 帮忙拆」或手动添加</div>'}
      </div>
    `;

    // 链上每项的操作（事件委托）
    body.querySelector('#bgd-chain').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const item = btn.closest('.bgd-item');
      const goal = data.chain.find((g) => g.id === Number(item.dataset.id));
      if (!goal) return;
      const act = btn.dataset.act;
      if (act === 'edit') return this.editChainGoal(bgId, goal, changed);
      if (act === 'unbind') {
        const yes = await UI.confirm(`把「${UI.esc(goal.title)}」从路线里移出？<br/>目标本身不删，只是不再挂在路线上。`, { okLabel: '移出' });
        if (!yes) return;
        try {
          await api.delete(`/api/biggoals/${bgId}/goals/${goal.id}`);
          UI.toast('已移出路线', 'ok');
          changed();
        } catch (e) { UI.toast(e.message, 'err'); }
      }
    });

    UI.sheet({
      title: '大目标',
      body,
      actions: [
        { label: '和 zoowy 讨论', kind: 'primary', onClick: () => { ZoowyPlan.open({ bigGoal: bg, onConfirmed: changed }); } },
        { label: '加个小目标', onClick: () => { this.addChainGoal(bgId, data.chain.length, changed); } },
        { label: '整体顺延 / 提前', onClick: () => { this.shiftSheet(bgId, changed); } },
        { label: '编辑', onClick: () => { BigGoalForm.open({ bigGoal: bg, onSaved: changed }); } },
      ],
    });
  },

  chainItem(g) {
    const badge = PLAN_BADGE[g.plan_status] || PLAN_BADGE.planned;
    const st = g.status;
    const stateLabel = st === 'achieved' ? '已达成 ✓' : st === 'reviewing' ? '待验收' : st === 'abandoned' ? '已放弃' : '';
    const editable = st !== 'achieved' && st !== 'abandoned';
    const overdue = g.planned_date && g.plan_status !== 'done' && st !== 'achieved' && g.planned_date < new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    return `
      <div class="bgd-item ${st === 'achieved' ? 'is-done' : ''}" data-id="${g.id}">
        <div class="bgd-item-main">
          <div class="bgd-item-title">${UI.esc(g.emoji || '🎯')} ${UI.esc(g.title)}</div>
          <div class="bgd-item-meta">
            ${g.planned_date ? `计划 ${UI.fmtDate(g.planned_date)}${overdue ? ' <b class="warn-txt">已逾期</b>' : ''}` : '未排日期'}
            · <span class="sc-badge ${badge.cls}">${badge.label}</span>
            ${stateLabel ? ` · ${stateLabel}` : ''}
          </div>
          ${g.accept_criteria ? `<div class="bgd-item-crit">${UI.esc(g.accept_criteria)}</div>` : ''}
        </div>
        ${editable ? `
        <div class="bgd-item-acts">
          <button class="sc-btn ghost" data-act="edit">改</button>
          ${g.plan_status === 'planned' ? '<button class="sc-btn ghost danger" data-act="unbind">移出</button>' : ''}
        </div>` : ''}
      </div>`;
  },

  // 手改链上小目标（日期/标题/验收标准/顺序）
  editChainGoal(bgId, g, onChanged) {
    const body = document.createElement('div');
    body.className = 'goal-form';
    body.innerHTML = `
      <div class="gf-row">
        <label class="gf-label">名称</label>
        <input id="cg-title" maxlength="30" value="${UI.esc(g.title)}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">计划日期</label>
        <input id="cg-date" type="date" value="${g.planned_date || ''}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">验收标准</label>
        <textarea id="cg-crit" rows="3" maxlength="500">${UI.esc(g.accept_criteria || '')}</textarea>
      </div>
      <div class="gf-row">
        <label class="gf-label">顺序（1 = 最先做）</label>
        <input id="cg-order" type="number" min="1" value="${g.plan_order || 1}"/>
      </div>
      <div class="gf-hint">手改过的，zoowy 重排时默认不动</div>
    `;
    UI.sheet({
      title: '改路线上的小目标',
      body,
      actions: [
        {
          label: '保存', kind: 'primary',
          async onClick(close) {
            const patch = {};
            const title = body.querySelector('#cg-title').value.trim();
            const date = body.querySelector('#cg-date').value;
            const crit = body.querySelector('#cg-crit').value.trim();
            const order = Number(body.querySelector('#cg-order').value);
            if (title && title !== g.title) patch.title = title;
            if (date && date !== g.planned_date) patch.planned_date = date;
            if (crit !== (g.accept_criteria || '')) patch.accept_criteria = crit;
            if (Number.isInteger(order) && order !== g.plan_order) patch.plan_order = order;
            if (!Object.keys(patch).length) return close();
            try {
              await api.patch(`/api/biggoals/${bgId}/goals/${g.id}`, patch);
              UI.toast('已保存（手改优先）', 'ok');
              close();
              onChanged();
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
      ],
    });
  },

  // 往链上加小目标：建新的（复用 StageGoalForm 再绑定）——这里给个轻表单直接建并挂链
  addChainGoal(bgId, chainLen, onChanged) {
    const tomorrow = new Date(Date.now() + 8 * 3600 * 1000 + 86400000).toISOString().slice(0, 10);
    const body = document.createElement('div');
    body.className = 'goal-form';
    body.innerHTML = `
      <div class="gf-row">
        <label class="gf-label">小目标名称</label>
        <input id="ag-title" maxlength="30" placeholder="比如：写完简历初稿"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">计划日期</label>
        <input id="ag-date" type="date" value="${tomorrow}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">验收标准（必填）</label>
        <textarea id="ag-crit" rows="3" maxlength="500" placeholder="写成能被「是/否」回答的标准"></textarea>
      </div>
      <div class="gf-hint">建成即挂到路线末尾，未启动前不进统计、对方看不见</div>
    `;
    UI.sheet({
      title: '加个小目标',
      body,
      actions: [
        {
          label: '创建', kind: 'primary',
          async onClick(close) {
            const title = body.querySelector('#ag-title').value.trim();
            const date = body.querySelector('#ag-date').value;
            const crit = body.querySelector('#ag-crit').value.trim();
            if (!title) return UI.toast('起个名字', 'err');
            if (!crit) return UI.toast('验收标准必填', 'err');
            try {
              const created = await api.post('/api/goals', { type: 'stage', title, accept_criteria: crit, start_date: date });
              await api.post(`/api/biggoals/${bgId}/goals`, { goal_id: created.goal.id, planned_date: date, plan_order: chainLen + 1 });
              UI.toast('已挂到路线末尾', 'ok');
              close();
              onChanged();
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
      ],
    });
  },

  // 整体顺延 / 提前
  shiftSheet(bgId, onChanged) {
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const body = document.createElement('div');
    body.className = 'goal-form';
    body.innerHTML = `
      <div class="gf-row">
        <label class="gf-label">从哪天起</label>
        <input id="sh-date" type="date" value="${today}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">挪几天（负数 = 提前）</label>
        <div class="gf-inline">
          <button type="button" class="step-btn" id="sh-minus">−</button>
          <input id="sh-days" type="number" value="7"/>
          <button type="button" class="step-btn" id="sh-plus">+</button>
        </div>
      </div>
      <div class="gf-hint">只挪「未启动」的；已进行中 / 待验收 / 已达成的不动</div>
    `;
    const daysInput = body.querySelector('#sh-days');
    body.querySelector('#sh-minus').addEventListener('click', () => daysInput.value = Number(daysInput.value || 0) - 1);
    body.querySelector('#sh-plus').addEventListener('click', () => daysInput.value = Number(daysInput.value || 0) + 1);
    UI.sheet({
      title: '整体顺延 / 提前',
      body,
      actions: [
        {
          label: '挪', kind: 'primary',
          async onClick(close) {
            const days = Number(daysInput.value);
            const from = body.querySelector('#sh-date').value;
            if (!days) return UI.toast('填个非零天数', 'err');
            try {
              const r = await api.post(`/api/biggoals/${bgId}/shift`, { from_date: from, days });
              UI.toast(`挪了 ${r.moved} 项`, 'ok');
              close();
              onChanged();
            } catch (e) { UI.toast(e.message, 'err'); }
          },
        },
      ],
    });
  },
};

// zoowy 规划：两路启动 → 信息不够一次问一个（带建议答案）→ 候选勾选 → 一次确认创建
const ZoowyPlan = {
  async open({ bigGoal, bigGoalId, onConfirmed }) {
    const bgId = bigGoal ? bigGoal.id : bigGoalId;
    if (!bgId) {
      // 没有大目标：先选一个
      try {
        const list = (await api.get('/api/biggoals')).bigGoals.filter((b) => b.status === 'active');
        if (!list.length) return UI.toast('先建一个大目标，再让 zoowy 拆', 'err');
        const body = document.createElement('div');
        body.innerHTML = list.map((b) => `
          <button class="bgd-pick" data-id="${b.id}">${UI.esc(b.emoji)} ${UI.esc(b.title)}</button>`).join('');
        UI.sheet({
          title: '拆哪个大目标？',
          body,
          actions: [{ label: '取消', onClick: (close) => close() }],
        }).then(() => {});
        body.addEventListener('click', (e) => {
          const b = e.target.closest('.bgd-pick');
          if (!b) return;
          document.querySelector('.sheet-wrap:last-child .sheet-backdrop')?.click();
          this.open({ bigGoalId: Number(b.dataset.id), onConfirmed });
        });
      } catch (e) { UI.toast(e.message, 'err'); }
      return;
    }

    const body = document.createElement('div');
    body.className = 'zoowy-plan';
    body.innerHTML = `
      <div class="zp-intro">
        <div class="zp-avatar">🐾</div>
        <div class="zp-text">我来帮你把大目标拆成一条能验收的小目标路线。两条路：</div>
      </div>
      <div class="zp-choices">
        <button class="zp-choice" id="zp-idea">✍️ 我先说说想法</button>
        <button class="zp-choice" id="zp-auto">🐾 按已有信息直接来</button>
      </div>
      <div class="zp-idea-extra hidden" id="zp-idea-extra">
        <textarea id="zp-idea-text" rows="3" maxlength="1000" placeholder="说说你的想法：想分几步、大概节奏、卡在哪…（会喂给 zoowy）"></textarea>
        <button class="btn primary" id="zp-idea-go">就这么聊</button>
      </div>
      <div class="zp-flow hidden" id="zp-flow"></div>
    `;
    const flow = body.querySelector('#zp-flow');
    body.querySelector('#zp-idea').addEventListener('click', () => {
      body.querySelector('.zp-choices').classList.add('hidden');
      body.querySelector('#zp-idea-extra').classList.remove('hidden');
    });
    body.querySelector('#zp-idea-go').addEventListener('click', () => {
      const text = body.querySelector('#zp-idea-text').value.trim();
      this.runFlow(flow, { bgId, mode: 'idea', message: text, onConfirmed });
    });
    body.querySelector('#zp-auto').addEventListener('click', () => {
      body.querySelector('.zp-choices').classList.add('hidden');
      this.runFlow(flow, { bgId, mode: 'auto', onConfirmed });
    });

    UI.sheet({ title: `zoowy 帮忙拆：${bigGoal ? UI.esc(bigGoal.title) : ''}`, body, actions: [{ label: '关闭', onClick: (close) => close() }] });
  },

  // 主流程：intro → （可能追问）→ 候选勾选 → confirm
  async runFlow(flow, { bgId, mode, message, history = [], forcePlan = false, onConfirmed }) {
    flow.classList.remove('hidden');
    flow.innerHTML = '<div class="zp-loading">zoowy 正在想…</div>';
    let out;
    try {
      out = await api.post('/api/zoowy/plan/intro', { big_goal_id: bgId, mode, message, history, force: forcePlan });
    } catch (e) {
      flow.innerHTML = `<div class="zp-err">🐾 ${UI.esc(e.message)}</div>`;
      return;
    }

    if (!out.enough && forcePlan) {
      flow.innerHTML = '<div class="zp-err">🐾 zoowy 觉得信息还是不够，但你说不用再问了。去大目标详情页手动「加个小目标」，或者回来跟它聊聊。</div>';
      return;
    }

    if (!out.enough) {
      // 一次只问一个问题，带建议答案
      flow.innerHTML = `
        <div class="zp-q">
          <div class="zp-avatar">🐾</div>
          <div class="zp-bubble">${UI.esc(out.question || '再说说你的情况？')}</div>
        </div>
        ${out.suggestion ? `<button class="zp-suggest" id="zp-use-suggest">💡 建议：${UI.esc(out.suggestion)}（点我直接用）</button>` : ''}
        <textarea id="zp-answer" rows="3" maxlength="1000" placeholder="用一句话回答就行"></textarea>
        <div class="zp-btn-row">
          <button class="btn primary" id="zp-send">回它</button>
          <button class="btn ghost" id="zp-skip">答不上，硬出计划</button>
        </div>
      `;
      const send = (forced) => {
        const answer = forced || flow.querySelector('#zp-answer').value.trim();
        if (!forced && !answer) return UI.toast('写一句再发', 'err');
        this.runFlow(flow, {
          bgId, mode: 'idea', message: answer,
          history: [...history, { q: out.question, a: answer }],
          onConfirmed,
        });
      };
      flow.querySelector('#zp-send').addEventListener('click', () => send(false));
      const useSuggest = flow.querySelector('#zp-use-suggest');
      if (useSuggest) useSuggest.addEventListener('click', () => send(out.suggestion));
      flow.querySelector('#zp-skip').addEventListener('click', () => {
        this.runFlow(flow, { bgId, mode: 'auto', history, forcePlan: true, onConfirmed });
      });
      return;
    }

    // 出候选：勾选 = 一次确认
    const cands = (out.candidates || []).map((c, i) => ({ ...c, _i: i, _on: true }));
    const patches = Array.isArray(out.profile_patches) ? out.profile_patches.slice(0, 8) : [];
    flow.innerHTML = `
      <div class="zp-q">
        <div class="zp-avatar">🐾</div>
        <div class="zp-bubble">拆好了 ${cands.length} 步。勾掉不要的，也可以改日期：</div>
      </div>
      <div class="zp-cands">
        ${cands.map((c) => `
          <label class="zp-cand ${c._on ? 'on' : ''}" data-i="${c._i}">
            <input type="checkbox" checked data-i="${c._i}"/>
            <div class="zp-cand-main">
              <div class="zp-cand-title">${c._i + 1}. ${UI.esc(c.title)}</div>
              <div class="zp-cand-meta">
                <input type="date" class="zp-cand-date" data-i="${c._i}" value="${c.planned_date || ''}"/>
                难度 ${c.difficulty || 3} · 约 ${UI.fmtNum(Number(c.est_total_min) || 600)} 分钟
              </div>
              ${c.accept_criteria ? `<div class="zp-cand-crit">${UI.esc(c.accept_criteria)}</div>` : ''}
            </div>
          </label>`).join('')}
      </div>
      <div class="zp-btn-row">
        <button class="btn ghost" id="zp-add-one">手动补一个</button>
        <button class="btn primary" id="zp-confirm">就这些，建出来</button>
      </div>
    `;
    flow.querySelectorAll('.zp-cand input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => cb.closest('.zp-cand').classList.toggle('on', cb.checked));
    });
    flow.querySelector('#zp-confirm').addEventListener('click', async () => {
      const items = cands
        .filter((c) => flow.querySelector(`.zp-cand input[data-i="${c._i}"]`).checked)
        .map((c) => ({
          ...c,
          planned_date: flow.querySelector(`.zp-cand-date[data-i="${c._i}"]`).value || c.planned_date,
        }));
      if (!items.length) return UI.toast('至少留一个', 'err');
      const btn = flow.querySelector('#zp-confirm');
      btn.disabled = true;
      btn.textContent = '创建中…';
      try {
        const r = await api.post('/api/zoowy/plan/confirm', { big_goal_id: bgId, items, profile_patches: patches });
        const n = (r.created || []).filter((x) => !x.duplicate).length;
        UI.toast(`建了 ${n} 个小目标 🎉`, 'ok');
        if (r.profileChanges) UI.toast(`画像已更新：${r.profileChanges.summary}`, 'ok');
        document.querySelector('.sheet-wrap:last-child .sheet-backdrop')?.click();
        if (onConfirmed) onConfirmed();
      } catch (e) {
        UI.toast(e.message, 'err');
        btn.disabled = false;
        btn.textContent = '就这些，建出来';
      }
    });
    flow.querySelector('#zp-add-one').addEventListener('click', () => {
      BigGoalDetail.addChainGoal(bgId, cands.length, () => {});
    });
  },
};
