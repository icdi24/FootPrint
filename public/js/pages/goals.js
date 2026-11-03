// 目标页：周/月视图网格（模仿参考图）+ 新建/编辑/详情弹层 + FAB。
const GoalsPage = {
  weekStart: null,
  monthAnchor: null,
  viewMode: 'week',
  goalType: 'daily', // daily | stage

  async render(root) {
    if (!this.weekStart) this.weekStart = this._monday(new Date());
    root.innerHTML = '<div class="page-loading">加载中…</div>';
    try {
      await this.draw(root);
    } catch (e) {
      root.innerHTML = `<div class="empty big"><div class="empty-emoji">😿</div><div>${UI.esc(e.message)}</div><button class="btn primary" id="retry">重试</button></div>`;
      root.querySelector('#retry').addEventListener('click', () => GoalsPage.render(root));
    }
  },

  _monday(d) {
    const x = new Date(d);
    const w = x.getDay();
    x.setDate(x.getDate() - (w === 0 ? 6 : w - 1));
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  },

  async draw(root) {
    // 小目标视图走独立渲染
    if (this.goalType === 'stage') { await this.drawStage(root); return; }

    const isWeek = this.viewMode === 'week';
    let data;
    if (isWeek) {
      data = await api.get(`/api/goals/week?start=${this.weekStart}`);
    } else {
      if (!this.monthAnchor) this.monthAnchor = this.weekStart.slice(0, 7);
      data = await api.get(`/api/goals/month?month=${this.monthAnchor}`);
    }
    const [y, m, d] = this.weekStart.split('-').map(Number);
    const today = data.today;
    const navLabel = isWeek ? `${m}月第${this._weekIndex(new Date(y, m - 1, d))}周` : `${Number(this.monthAnchor.slice(5, 7))}月`;
    const pts = isWeek ? data.weekPoints : data.monthPoints;
    const done = isWeek ? data.weekDone : data.monthDone;
    const expected = isWeek ? data.weekExpected : data.monthExpected;

    root.innerHTML = `
      <header class="page-head goals-head">
        ${this._typeSeg('daily')}
        <div class="week-nav sub-nav">
          <div class="seg" id="seg">
            <button data-v="week" class="${isWeek ? 'on' : ''}">周</button>
            <button data-v="month" class="${!isWeek ? 'on' : ''}">月</button>
          </div>
          <div class="week-nav">
            <button class="nav-btn" id="prev">${window.icon('left')}</button>
            <span class="week-label" id="week-label">${navLabel}</span>
            <button class="nav-btn" id="next">${window.icon('right')}</button>
          </div>
        </div>
      </header>

      <section class="grid-card">
        <div class="grid-stats">
          <div class="gs-item"><div class="gs-val">${UI.fmtNum(pts)}</div><div class="gs-label">${isWeek ? '周得分' : '月得分'}</div></div>
          <div class="gs-item"><div class="gs-val">${done}<span class="gs-dim">/${expected}</span></div><div class="gs-label">打卡人次</div></div>
          <div class="gs-item"><div class="gs-val">${data.goals.length}</div><div class="gs-label">进行中目标</div></div>
        </div>
        ${isWeek ? this.weekGrid(data, today) : this.monthList(data, today)}
      </section>

      <button class="fab" id="add-goal" aria-label="新建目标">${window.icon('plus')}</button>
      <div class="fab-hint" id="fab-hint">长按「完成」= 秒打卡</div>
    `;

    root.querySelector('#type-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.goalType = b.dataset.t;
      this.draw(root);
    });
    root.querySelector('#seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.viewMode = b.dataset.v;
      this.draw(root);
    });
    root.querySelector('#prev').addEventListener('click', () => {
      if (this.viewMode === 'week') this.weekStart = this._shift(this.weekStart, -7);
      else this.monthAnchor = this._shiftMonth(this.monthAnchor, -1);
      this.draw(root);
    });
    root.querySelector('#next').addEventListener('click', () => {
      if (this.viewMode === 'week') this.weekStart = this._shift(this.weekStart, 7);
      else this.monthAnchor = this._shiftMonth(this.monthAnchor, 1);
      this.draw(root);
    });
    root.querySelector('#add-goal').addEventListener('click', () => {
      GoalForm.open({ onSaved: () => this.draw(root) });
    });

    // 点格子：今天未打 → 打卡；已打 → 详情/撤销
    root.querySelectorAll('.cell[data-state="todo"], .cell[data-state="done"]').forEach((cell) => {
      const open = () => {
        const goal = data.goals.find((g) => g.id === Number(cell.dataset.goal));
        if (!goal) return;
        if (cell.dataset.state === 'todo') {
          CheckinSheet.open(goal, { onSuccess: () => this.draw(root) });
        } else if (cell.dataset.state === 'done') {
          this.cellDetail(root, goal, cell.dataset.date);
        }
      };
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.addEventListener('click', open);
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });

    // 点目标名 → 详情
    root.querySelectorAll('.grid-row .g-name, .month-row .g-name').forEach((el) => {
      const open = () => {
        const goal = data.goals.find((g) => g.id === Number(el.dataset.id));
        if (goal) GoalForm.openDetail(goal, { onChanged: () => this.draw(root) });
      };
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });

    const hint = root.querySelector('#fab-hint');
    setTimeout(() => { if (hint) hint.classList.add('show'); }, 1500);
    setTimeout(() => { if (hint) hint.classList.remove('show'); }, 6500);
  },

  _shift(s, n) {
    const d = new Date(s + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  },

  _shiftMonth(s, n) {
    const [y, m] = s.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  },

  _weekIndex(d) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const firstMondayOffset = first.getDay() === 0 ? -6 : 1 - first.getDay();
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1;
    const firstMonday = Math.floor((first - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1 + firstMondayOffset;
    if (firstMonday <= 1) {
      return Math.ceil((dayOfYear - (1 - firstMondayOffset)) / 7) || 1;
    }
    return Math.ceil((dayOfYear - firstMonday) / 7) + 1;
  },

  _typeSeg(active) {
    return `<div class="type-seg seg" id="type-seg">
      <button type="button" data-t="daily" class="${active === 'daily' ? 'on' : ''}">日常目标</button>
      <button type="button" data-t="stage" class="${active === 'stage' ? 'on' : ''}">小目标</button>
    </div>`;
  },

  async drawStage(root) {
    let data;
    try {
      data = await api.get('/api/goals?type=stage');
    } catch (e) {
      root.innerHTML = `<div class="empty big"><div class="empty-emoji">😿</div><div>${UI.esc(e.message)}</div><button class="btn primary" id="retry">重试</button></div>`;
      root.querySelector('#retry').addEventListener('click', () => GoalsPage.draw(root));
      return;
    }
    const goals = data.goals || [];
    root.innerHTML = `
      <header class="page-head goals-head">
        ${this._typeSeg('stage')}
      </header>
      <div class="stage-list">
        ${goals.length ? goals.map((g) => this.stageCard(g)).join('') : `
        <div class="empty">
          <div class="empty-emoji">🌱</div>
          <div class="empty-title">还没有小目标</div>
          <div class="empty-sub">定一个阶段要够到的东西，做完请对方验收，一次入账一大笔积分</div>
        </div>`}
      </div>
      <button class="fab" id="add-goal" aria-label="新建小目标">${window.icon('plus')}</button>
    `;

    root.querySelector('#type-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.goalType = b.dataset.t;
      this.draw(root);
    });
    root.querySelector('#add-goal').addEventListener('click', () => {
      StageGoalForm.open({ onSaved: () => this.draw(root) });
    });

    // 卡片点击 → 详情；按钮点击不冒泡进详情
    root.querySelectorAll('.stage-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const goal = goals.find((g) => g.id === Number(card.dataset.id));
        if (goal) this.stageDetail(root, goal);
      });
      const g = goals.find((x) => x.id === Number(card.dataset.id));
      if (!g) return;
      card.querySelector('[data-act="submit"]')?.addEventListener('click', () => this.submitSheet(root, g));
      card.querySelector('[data-act="start"]')?.addEventListener('click', () => this.startStage(root, g));
      card.querySelector('[data-act="edit"]')?.addEventListener('click', () => StageGoalForm.open({ goal: g, onSaved: () => this.draw(root) }));
      card.querySelector('[data-act="abandon"]')?.addEventListener('click', () => this.abandonStage(root, g));
    });
  },

  stageCard(g) {
    const badge = STAGE_BADGE[g.status] || STAGE_BADGE.active;
    const points = Number(g.total_points) || 0;
    const crit = g.accept_criteria || '';
    let foot = '';
    if (g.status === 'active') {
      foot = `
        <div class="sc-actions">
          <button class="sc-btn primary" data-act="submit">提交验收</button>
          <button class="sc-btn ghost" data-act="edit">编辑</button>
          <button class="sc-btn ghost danger" data-act="abandon">放弃</button>
        </div>`;
    } else if (g.status === 'reviewing') {
      foot = `<div class="sc-wait">${window.icon('clock')} 等待对方验收…</div>`;
    } else if (g.status === 'achieved') {
      foot = `<div class="sc-credit">${window.icon('check')} +${UI.fmtNum(points)} 分已入账</div>`;
    } else if (g.status === 'abandoned') {
      foot = `<div class="sc-wait gray">已放弃</div>`;
    } else if (g.status === 'draft') {
      foot = `
        <div class="sc-actions">
          <button class="sc-btn primary" data-act="start">开始</button>
          <button class="sc-btn ghost" data-act="edit">编辑</button>
          <button class="sc-btn ghost danger" data-act="abandon">放弃</button>
        </div>`;
    }
    return `
      <div class="stage-card ${g.status === 'abandoned' ? 'is-abandoned' : ''}" data-id="${g.id}">
        <div class="sc-head">
          <span class="sc-emoji">${g.emoji || '🎯'}</span>
          <div class="sc-title-box">
            <div class="sc-title">${UI.esc(g.title)}</div>
            <div class="sc-meta">${g.end_date ? `截止 ${UI.fmtDate(g.end_date)}` : '长期'} · 难度 ${g.difficulty || 3}</div>
          </div>
          <span class="sc-badge ${badge.cls}">${badge.label}</span>
        </div>
        ${crit ? `<div class="sc-crit">${window.icon('target')} ${UI.esc(crit)}</div>` : ''}
        <div class="sc-points">${window.icon('coin')} 达成 +${UI.fmtNum(points)} 分</div>
        ${foot}
      </div>`;
  },

  abandonStage(root, g) {
    UI.confirm(`确定放弃「${UI.esc(g.title)}」吗？<br/>放弃后不能再提交验收，记录保留。`, { danger: true, okLabel: '放弃' })
      .then(async (yes) => {
        if (!yes) return;
        try {
          await api.post(`/api/goals/${g.id}/abandon`);
          UI.toast('已放弃', 'warn');
          this.draw(root);
        } catch (e) {
          UI.toast(e.message, 'err');
        }
      });
  },

  // 草稿 → 进行中
  async startStage(root, g) {
    try {
      await api.post(`/api/goals/${g.id}/start`);
      UI.toast('已开始，加油 🌱', 'ok');
      this.draw(root);
    } catch (e) {
      UI.toast(e.message, 'err');
    }
  },

  // 小目标详情
  async stageDetail(root, goal) {
    try {
      const data = await api.get(`/api/goals/${goal.id}`);
      const g = data.goal;
      const body = document.createElement('div');
      body.className = 'stage-detail';
      const badge = STAGE_BADGE[g.status] || STAGE_BADGE.active;
      body.innerHTML = `
        <div class="sd-head">
          <div class="sd-emoji">${g.emoji || '🎯'}</div>
          <div class="sd-info">
            <div class="sd-title">${UI.esc(g.title)}</div>
            <span class="sc-badge ${badge.cls}">${badge.label}</span>
          </div>
          <div class="sd-points">+${UI.fmtNum(Number(g.total_points) || 0)}<span>分</span></div>
        </div>
        ${g.accept_criteria ? `<div class="sd-block"><div class="sd-label">验收标准</div><div class="sd-crit">${UI.esc(g.accept_criteria)}</div></div>` : ''}
        ${g.description ? `<div class="sd-block"><div class="sd-label">备注</div><p class="sd-desc">${UI.esc(g.description)}</p></div>` : ''}
        <div class="sd-meta-row">
          <span>预估 ${UI.fmtNum(Number(g.est_total_min) || 0)} 分钟</span>
          <span>难度 ${g.difficulty || 3}</span>
          ${g.start_date ? `<span>${UI.fmtDate(g.start_date)} 起</span>` : ''}
          ${g.end_date ? `<span>${UI.fmtDate(g.end_date)} 截止</span>` : ''}
        </div>
      `;
      const actions = [];
      if (g.status === 'active') {
        actions.push({ label: '提交验收', kind: 'primary', onClick: (close) => { close(); this.submitSheet(root, g); } });
        actions.push({ label: '编辑', onClick: (close) => { close(); StageGoalForm.open({ goal: g, onSaved: () => this.draw(root) }); } });
        actions.push({ label: '放弃', kind: 'danger', onClick: (close) => { close(); this.abandonStage(root, g); } });
      } else if (g.status === 'draft') {
        actions.push({ label: '开始', kind: 'primary', onClick: (close) => { close(); this.startStage(root, g); } });
        actions.push({ label: '编辑', onClick: (close) => { close(); StageGoalForm.open({ goal: g, onSaved: () => this.draw(root) }); } });
        actions.push({ label: '放弃', kind: 'danger', onClick: (close) => { close(); this.abandonStage(root, g); } });
      } else {
        actions.push({ label: '知道了', onClick: (close) => close() });
      }
      UI.sheet({ title: '小目标详情', body, actions });
    } catch (e) {
      UI.toast(e.message, 'err');
    }
  },

  // 提交验收弹层
  async submitSheet(root, g) {
    let evidenceIds = [];
    const body = document.createElement('div');
    body.className = 'submit-body';
    body.innerHTML = `
      <div class="sb-goal">
        <span class="sb-emoji">${g.emoji || '🎯'}</span>
        <div>
          <div class="sb-title">${UI.esc(g.title)}</div>
          <div class="sb-crit">${UI.esc(g.accept_criteria || '')}</div>
        </div>
      </div>
      <label class="gf-label">自述（说说你怎么做到的）</label>
      <textarea id="sb-self" rows="3" maxlength="1000" placeholder="比如：这 8 周每天 1 小时，模拟考从 5.5 提到了 6.5"></textarea>
      <label class="gf-label">证据文字（可选）</label>
      <textarea id="sb-evidence" rows="2" maxlength="1000" placeholder="比如：成绩单编号、完成截图说明"></textarea>
      <label class="gf-label">证据图片（可选，最多 3 张）</label>
      <div class="sb-photos" id="sb-photos"></div>
    `;
    const photos = body.querySelector('#sb-photos');
    function renderPhotos() {
      photos.innerHTML = `
        ${evidenceIds.map((id, i) => `
          <div class="sb-thumb" style="background-image:url('/api/file/${id}')">
            <button type="button" class="sb-rm" data-i="${i}">${window.icon('close')}</button>
          </div>`).join('')}
        ${evidenceIds.length < 3 ? `<button type="button" class="sb-add" id="sb-add">${window.icon('camera')} 加图</button>` : ''}
      `;
      photos.querySelector('#sb-add')?.addEventListener('click', addPhoto);
      photos.querySelectorAll('.sb-rm').forEach((btn) => {
        btn.addEventListener('click', () => {
          evidenceIds.splice(Number(btn.dataset.i), 1);
          renderPhotos();
        });
      });
    }
    async function addPhoto() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', async () => {
        const f = input.files && input.files[0];
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) { UI.toast('图片别超过 10MB', 'warn'); return; }
        try {
          const up = await api.upload(f, 'evidence');
          evidenceIds.push(up.id);
          renderPhotos();
        } catch (e) {
          UI.toast(e.message, 'err');
        }
      });
      input.click();
    }
    renderPhotos();

    let submitting = false;
    UI.sheet({
      title: '提交验收',
      body,
      actions: [
        {
          label: '提交',
          kind: 'primary big',
          async onClick(close) {
            if (submitting) return;
            const self = body.querySelector('#sb-self').value.trim();
            const ev = body.querySelector('#sb-evidence').value.trim();
            if (!self) { UI.toast('写几句自述，对方才知道你怎么做到的', 'warn'); return; }
            submitting = true;
            try {
              await api.post(`/api/goals/${g.id}/submit`, {
                self_statement: self,
                evidence_text: ev,
                evidence_ids: evidenceIds,
              });
              close();
              UI.toast('已提交，等对方验收', 'ok');
              this.draw(root);
            } catch (e) {
              submitting = false;
              UI.toast(e.message, 'err');
            }
          },
        },
      ],
    });
  },

  weekGrid(data, today) {
    const WDS = ['一', '二', '三', '四', '五', '六', '日'];
    const todayIdx = new Date(today + 'T00:00:00Z').getUTCDay() === 0 ? 6 : new Date(today + 'T00:00:00Z').getUTCDay() - 1;
    if (!data.goals.length) {
      return `
        <div class="grid-empty">
          <div class="empty-emoji">🌱</div>
          <div>还没有目标，点右下角 + 建一个</div>
        </div>`;
    }
    const rows = data.goals.map((g) => `
      <div class="grid-row" data-goal="${g.id}">
        <div class="g-name" data-id="${g.id}">
          <span class="g-emoji">${g.emoji}</span>
          <div class="g-name-text">
            <div class="g-title">${UI.esc(g.title)}</div>
            ${g.weeklyProgress ? `<div class="g-sub">本周 ${g.weeklyProgress.done}/${g.weeklyProgress.need}</div>` : ''}
          </div>
        </div>
        <div class="g-score">${UI.fmtNum(g.perCheckinPoints)}</div>
        ${g.cells.map((c) => this.cell(g, c, today)).join('')}
      </div>`).join('');
    return `
      <div class="grid-table">
        <div class="grid-head">
          <div>名称</div><div>分数</div>
          ${WDS.map((w, i) => `<div class="${i === todayIdx ? 'today-col' : ''}${i === 5 || i === 6 ? ' wknd' : ''}">${w}</div>`).join('')}
        </div>
        ${rows}
      </div>
      <div class="grid-legend">
        <span><i class="lg done"></i>已打</span>
        <span><i class="lg miss"></i>漏了</span>
        <span><i class="lg today"></i>今天</span>
      </div>`;
  },

  cell(g, c, today) {
    const cls = `cell ${c.state} ${c.date === today ? 'is-today' : ''}`;
    const inner = c.state === 'done'
      ? `${window.icon('check')}`
      : c.state === 'missed' ? '<i class="miss-dot"></i>'
      : c.state === 'blank' ? '<i class="blank-dot"></i>'
      : '';
    return `<div class="${cls}" data-goal="${g.id}" data-date="${c.date}" data-state="${c.state}">${inner}</div>`;
  },

  monthList(data, today) {
    // 月视图：整月逐日小格 + 本月次数与得分
    if (!data.goals.length) {
      return `<div class="grid-empty"><div class="empty-emoji">🌱</div><div>还没有目标，点右下角 + 建一个</div></div>`;
    }
    return `
      <div class="month-list">
        ${data.goals.map((g) => `
          <div class="month-row" data-goal="${g.id}">
            <div class="month-top">
              <div class="g-name" data-id="${g.id}">
                <span class="g-emoji">${g.emoji}</span>
                <div class="g-name-text">
                  <div class="g-title">${UI.esc(g.title)}</div>
                </div>
              </div>
              <div class="month-num">${g.monthCount} 次 · ${UI.fmtNum(g.monthPoints)} 分</div>
            </div>
            <div class="month-cells">
              ${g.cells.map((c) => `<span class="m-cell ${c.state}" title="${UI.fmtDateShort(c.date)}${c.points ? ' +' + c.points : ''}"></span>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <div class="grid-legend">
        <span><i class="lg done"></i>已打</span>
        <span><i class="lg miss"></i>漏了</span>
        <span><i class="lg today"></i>今天</span>
      </div>`;
  },

  async cellDetail(root, goal, date) {
    try {
      const data = await api.get(`/api/goals/${goal.id}`);
      const ci = (data.monthCheckins || []).find((c) => c.check_date === date && c.status === 'credited');
      if (!ci) return;
      const hours = (Date.now() - new Date(ci.created_at).getTime()) / 3600000;
      const revocable = hours <= 24;
      const body = document.createElement('div');
      body.className = 'ci-detail';
      body.innerHTML = `
        <div class="cid-row"><span>日期</span><b>${UI.fmtDate(ci.check_date)}</b></div>
        <div class="cid-row"><span>时长</span><b>${ci.duration_min} 分钟</b></div>
        <div class="cid-row"><span>得分</span><b class="ok-txt">+${UI.fmtNum(ci.points)}</b></div>
        ${ci.evidence_text ? `<div class="cid-row"><span>记录</span><b>${UI.esc(ci.evidence_text)}</b></div>` : ''}
        ${revocable ? '<p class="cid-hint">24 小时内可以撤销，撤销会扣回这几分</p>' : '<p class="cid-hint">超过 24 小时，只能请对方驳回或线下商量</p>'}
      `;
      UI.sheet({
        title: `${goal.emoji} ${UI.esc(goal.title)}`,
        body,
        actions: revocable ? [
          { label: '再想想', onClick: (c) => c() },
          {
            label: '撤销这次打卡',
            kind: 'danger',
            async onClick(close) {
              try {
                await api.post(`/api/checkins/${ci.id}/revoke`);
                close();
                UI.toast('已撤销，分数扣回', 'warn');
                GoalsPage.draw(root);
              } catch (e) {
                UI.toast(e.message, 'err');
              }
            },
          },
        ] : [{ label: '知道了', onClick: (c) => c() }],
      });
    } catch (e) {
      UI.toast(e.message, 'err');
    }
  },
};

// 新建 / 编辑目标表单
const GoalForm = {
  async open({ goal, onSaved }) {
    const editing = !!goal;
    const g = goal || {
      title: '', emoji: '🎯', description: '', freq_mode: 'daily', freq_n: 1, weekdays: '1,2,3,4,5',
      window_start: '', window_end: '', duration_min: 30, difficulty: 3, start_date: null, end_date: null,
      custom_points: null,
    };
    const EMOJIS = ['🎯', '📚', '🏃', '🏋️', '🧘', '💤', '🎹', '🎨', '✍️', '🦷', '🍎', '🚴', '🧹', '📖', '🌅', '💧'];
    const diffHintMap = { 1: '几乎无门槛', 2: '稍微用点力', 3: '需要专门腾时间', 4: '比较难', 5: '需要长期投入' };
    function diffHint(d) { return diffHintMap[d] || ''; }
    const body = document.createElement('div');
    body.className = 'goal-form';
    body.innerHTML = `
      <div class="gf-row gf-title-row">
        <div class="emoji-pick" id="gf-emoji">
          ${EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === g.emoji ? 'on' : ''}">${e}</button>`).join('')}
        </div>
        <input id="gf-title" maxlength="30" placeholder="目标名称，比如：背单词" value="${UI.esc(g.title)}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">频率</label>
        <div class="freq-seg" id="gf-freq">
          <button type="button" data-v="daily" class="${g.freq_mode === 'daily' ? 'on' : ''}">每日</button>
          <button type="button" data-v="weekly" class="${g.freq_mode === 'weekly' ? 'on' : ''}">每周 N 次</button>
          <button type="button" data-v="weekdays" class="${g.freq_mode === 'weekdays' ? 'on' : ''}">指定星期</button>
        </div>
        <div class="freq-extra hidden" id="gf-freq-extra"></div>
      </div>
      <div class="gf-row">
        <label class="gf-label">单次时长（分钟）</label>
        <div class="gf-inline">
          <button type="button" class="step-btn" id="gf-dur-minus">−</button>
          <input id="gf-duration" type="number" min="1" max="1440" value="${g.duration_min}"/>
          <button type="button" class="step-btn" id="gf-dur-plus">+</button>
        </div>
      </div>
      <div class="gf-row">
        <label class="gf-label">难度 <span class="gf-diff-val" id="gf-diff-val">${g.difficulty}</span></label>
        <input id="gf-difficulty" type="range" min="1" max="5" step="1" value="${g.difficulty}"/>
        <div class="gf-diff-hint" id="gf-diff-hint">${diffHint(g.difficulty)}</div>
      </div>
      <div class="gf-row gf-win-row">
        <label class="gf-label">打卡窗口（可选，窗内 1.1 倍 / 窗外 0.8 倍）</label>
        <div class="gf-inline">
          <input id="gf-ws" type="time" value="${g.window_start || ''}"/>
          <span>–</span>
          <input id="gf-we" type="time" value="${g.window_end || ''}"/>
        </div>
      </div>
      <div class="gf-row">
        <label class="gf-label">起止日期（结束留空 = 长期）</label>
        <div class="gf-inline">
          <input id="gf-start" type="date" value="${g.start_date || new Date().toISOString().slice(0, 10)}"/>
          <span>–</span>
          <input id="gf-end" type="date" value="${g.end_date || ''}"/>
        </div>
      </div>
      <div class="gf-row">
        <label class="gf-label">写清「做到什么算数」（可选）</label>
        <textarea id="gf-desc" rows="2" maxlength="200" placeholder="比如：每天 30 分钟，用 app 打卡">${UI.esc(g.description)}</textarea>
      </div>
      <div class="gf-row">
        <label class="gf-label">每次积分</label>
        <div class="freq-seg" id="gf-points-mode">
          <button type="button" data-v="auto" class="${g.custom_points == null ? 'on' : ''}">自动算</button>
          <button type="button" data-v="custom" class="${g.custom_points != null ? 'on' : ''}">自定义</button>
        </div>
        <div class="cp-extra ${g.custom_points != null ? '' : 'hidden'}" id="gf-cp-extra">
          <div class="cp-presets" id="gf-cp-presets">
            ${[5, 10, 15, 20].map((p) => `<button type="button" class="cp-pre ${Number(g.custom_points) === p ? 'on' : ''}" data-p="${p}">${p}</button>`).join('')}
          </div>
          <div class="gf-inline">
            <input id="gf-custom-points" type="number" min="1" max="9999" placeholder="自定义分" value="${g.custom_points != null ? g.custom_points : ''}"/>
          </div>
        </div>
      </div>
      <div class="gf-preview" id="gf-preview"></div>
    `;

    const freqExtra = body.querySelector('#gf-freq-extra');
    function drawFreqExtra() {
      const mode = body.querySelector('#gf-freq .on').dataset.v;
      if (mode === 'weekly') {
        freqExtra.classList.remove('hidden');
        freqExtra.innerHTML = `
          <span class="fe-label">每周</span>
          <div class="n-seg" id="gf-n">
            ${[1, 2, 3, 4].map((n) => `<button type="button" data-n="${n}" class="${n === g.freq_n ? 'on' : ''}">${n}</button>`).join('')}
          </div>
          <span class="fe-label">次</span>`;
        freqExtra.querySelector('#gf-n').addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          freqExtra.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          preview();
        });
      } else if (mode === 'weekdays') {
        freqExtra.classList.remove('hidden');
        const sel = new Set((g.weekdays || '').split(',').map(Number).filter(Boolean));
        const names = ['一', '二', '三', '四', '五', '六', '日'];
        freqExtra.innerHTML = `
          <div class="wd-presets">
            <button type="button" class="wd-pre" data-set="1,2,3,4,5">工作日</button>
            <button type="button" class="wd-pre" data-set="6,7">周末</button>
            <button type="button" class="wd-pre" data-set="1,2,3,4,5,6,7">每天</button>
          </div>
          <div class="n-seg wd-seg" id="gf-wd">
            ${names.map((w, i) => `<button type="button" data-d="${i + 1}" class="${sel.has(i + 1) ? 'on' : ''}">${w}</button>`).join('')}
          </div>`;
        function syncWd() {
          freqExtra.querySelectorAll('#gf-wd button').forEach((b) => {
            b.classList.toggle('on', sel.has(Number(b.dataset.d)));
          });
        }
        freqExtra.querySelector('#gf-wd').addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          b.classList.toggle('on');
          preview();
        });
        freqExtra.querySelectorAll('.wd-pre').forEach((btn) => {
          btn.addEventListener('click', () => {
            sel.clear();
            btn.dataset.set.split(',').forEach((d) => sel.add(Number(d)));
            syncWd();
            preview();
          });
        });
      } else {
        freqExtra.classList.add('hidden');
      }
    }
    body.querySelector('#gf-freq').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      body.querySelectorAll('#gf-freq button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      drawFreqExtra();
      preview();
    });
    drawFreqExtra();

    // 积分方式：自动 / 自定义
    body.querySelector('#gf-points-mode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      body.querySelectorAll('#gf-points-mode button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      const mode = b.dataset.v;
      const extra = body.querySelector('#gf-cp-extra');
      if (mode === 'custom') {
        extra.classList.remove('hidden');
        const inp = body.querySelector('#gf-custom-points');
        if (!inp.value) inp.value = 10;
        syncCpPresets();
      } else {
        extra.classList.add('hidden');
      }
      preview();
    });
    function syncCpPresets() {
      const val = Number(body.querySelector('#gf-custom-points').value);
      body.querySelectorAll('#gf-cp-presets .cp-pre').forEach((btn) => {
        btn.classList.toggle('on', Number(btn.dataset.p) === val);
      });
    }
    body.querySelector('#gf-cp-presets').addEventListener('click', (e) => {
      const b = e.target.closest('.cp-pre');
      if (!b) return;
      body.querySelector('#gf-custom-points').value = b.dataset.p;
      syncCpPresets();
      preview();
    });
    body.querySelector('#gf-custom-points').addEventListener('input', () => {
      syncCpPresets();
      preview();
    });

    function cur() {
      const mode = body.querySelector('#gf-freq .on').dataset.v;
      let weekdays = '';
      if (mode === 'weekdays') {
        weekdays = [...body.querySelectorAll('#gf-wd button.on')].map((b) => b.dataset.d).join(',');
      }
      const nBtn = body.querySelector('#gf-n .on');
      const pointsMode = body.querySelector('#gf-points-mode .on').dataset.v;
      const cpRaw = body.querySelector('#gf-custom-points').value;
      const cp = pointsMode === 'custom' && cpRaw !== '' ? Number(cpRaw) : null;
      return {
        freq_mode: mode,
        freq_n: nBtn ? Number(nBtn.dataset.n) : 1,
        weekdays,
        duration_min: Number(body.querySelector('#gf-duration').value) || 30,
        difficulty: Number(body.querySelector('#gf-difficulty').value) || 3,
        window_start: body.querySelector('#gf-ws').value || null,
        window_end: body.querySelector('#gf-we').value || null,
        custom_points: (cp != null && Number.isInteger(cp) && cp > 0) ? cp : null,
      };
    }

    function preview() {
      const c = cur();
      const inWin = window.__inWindowCheck({ window_start: c.window_start, window_end: c.window_end });
      const pts = window.__calcClient({ ...c, freq_n: c.freq_n }, c.duration_min, inWin);
      const el = body.querySelector('#gf-preview');
      if (c.custom_points != null) {
        el.innerHTML = `
          <div class="pv-left">
            <div class="pv-label">每次固定</div>
            <div class="pv-val">+${UI.fmtNum(pts)} 分</div>
          </div>
          <div class="pv-right">
            <span class="pv-tag ok">自定义固定分</span>
          </div>`;
        return;
      }
      const ratio = pts / (c.duration_min * (window.__DEFAULT_CFG.difficulty[c.difficulty] || 1.5));
      let warn = '';
      if (ratio > 0.85) warn = `<span class="pv-warn high">⚠ 偏高，对方看得见，容易被质疑</span>`;
      else if (ratio < 0.35) warn = `<span class="pv-warn low">累活给低价，要不要把时长或难度再核一下</span>`;
      el.innerHTML = `
        <div class="pv-left">
          <div class="pv-label">单次预计</div>
          <div class="pv-val">+${UI.fmtNum(pts)} 分</div>
        </div>
        <div class="pv-right">
          ${inWin ? '<span class="pv-tag ok">窗口内 ×1.1</span>' : c.window_start ? '<span class="pv-tag">窗口外 ×0.8</span>' : ''}
          ${warn}
        </div>`;
    }
    body.querySelector('#gf-difficulty').addEventListener('input', (e) => {
      body.querySelector('#gf-diff-val').textContent = e.target.value;
      body.querySelector('#gf-diff-hint').textContent = diffHint(Number(e.target.value));
      preview();
    });
    body.querySelector('#gf-duration').addEventListener('input', preview);
    body.querySelector('#gf-dur-minus').addEventListener('click', () => {
      const i = body.querySelector('#gf-duration');
      i.value = Math.max(1, (Number(i.value) || 30) - 5);
      preview();
    });
    body.querySelector('#gf-dur-plus').addEventListener('click', () => {
      const i = body.querySelector('#gf-duration');
      i.value = Math.min(1440, (Number(i.value) || 30) + 5);
      preview();
    });
    body.querySelector('#gf-ws').addEventListener('input', preview);
    body.querySelector('#gf-we').addEventListener('input', preview);
    body.querySelector('#gf-emoji').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      body.querySelectorAll('#gf-emoji button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    });
    preview();

    let saving = false;
    UI.sheet({
      title: editing ? '编辑目标' : '新目标',
      body,
      actions: [
        { label: editing ? '保存' : '创建目标', kind: 'primary big', async onClick(close) {
          if (saving) return;
          const title = body.querySelector('#gf-title').value.trim();
          if (!title) { UI.toast('先起个名字', 'warn'); return; }
          const c = cur();
          if (c.freq_mode === 'weekdays' && !c.weekdays) { UI.toast('选一下每周哪几天', 'warn'); return; }
          if (c.window_start && !c.window_end) { UI.toast('窗口要填全开始和结束', 'warn'); return; }
          const payload = {
            title,
            emoji: body.querySelector('#gf-emoji .on').dataset.e,
            description: body.querySelector('#gf-desc').value.trim(),
            ...c,
            start_date: body.querySelector('#gf-start').value || undefined,
            end_date: body.querySelector('#gf-end').value || null,
          };
          saving = true;
          try {
            if (editing) await api.put(`/api/goals/${goal.id}`, payload);
            else await api.post('/api/goals', payload);
            close();
            UI.toast(editing ? '已保存' : '目标建好了，今天就开始吧 🌱', 'ok');
            if (onSaved) onSaved();
          } catch (e) {
            saving = false;
            UI.toast(e.message, 'err');
          }
        } },
      ],
    });
  },

  async openDetail(goal, { onChanged }) {
    try {
      const data = await api.get(`/api/goals/${goal.id}`);
      const g = data.goal;
      const body = document.createElement('div');
      body.className = 'goal-detail';
      const ms = data.monthCheckins || [];
      body.innerHTML = `
        <div class="gd-top">
          <div class="gd-emoji">${g.emoji}</div>
          <div class="gd-info">
            <div class="gd-title">${UI.esc(g.title)}</div>
            <div class="gd-meta">${freqText(g)} · ${g.customPoints != null ? `每次固定 +${UI.fmtNum(g.customPoints)} 分` : `每次约 +${UI.fmtNum(g.perCheckinPoints)} 分`}</div>
          </div>
          <div class="gd-streak">${window.icon('flame')}<b>${g.streak_count}</b><span>天</span></div>
        </div>
        ${g.description ? `<p class="gd-desc">${UI.esc(g.description)}</p>` : ''}
        ${g.nextMilestone ? `
        <div class="gd-milestone">
          再连 <b>${g.nextMilestone.remaining}</b> 次，奖励 +${UI.fmtNum(g.nextMilestone.p)} 分
          <div class="mil-bar"><i style="width:${Math.min(100, (g.streak_count / g.nextMilestone.n) * 100)}%"></i></div>
        </div>` : ''}
        <div class="gd-stats">
          <div><b>${ms.length}</b><span>本月打卡</span></div>
          <div><b>${g.streak_best}</b><span>最长连续</span></div>
          <div><b>${g.customPoints != null ? '自定义' : g.ratio}</b><span>性价比</span></div>
        </div>
        <div class="gd-list-title">本月记录</div>
        <div class="gd-list">
          ${ms.length ? ms.map((c) => `
            <div class="gd-item">
              <span>${UI.fmtDate(c.check_date)}</span>
              <span>${c.duration_min} 分钟</span>
              <b class="ok-txt">+${UI.fmtNum(c.points)}</b>
            </div>`).join('') : '<div class="gd-empty">这个月还没有记录</div>'}
        </div>
      `;
      const actions = [];
      if (g.status === 'active' || g.status === 'draft') {
        actions.push({ label: '编辑', onClick: (close) => { close(); GoalForm.open({ goal: g, onSaved: onChanged }); } });
      }
      actions.push({
        label: g.status === 'active' || g.status === 'draft' ? '放弃目标' : '知道了',
        kind: g.status === 'active' || g.status === 'draft' ? 'danger' : '',
        async onClick(close) {
          if (g.status !== 'active' && g.status !== 'draft') return close();
          const yes = await UI.confirm(`确定放弃「${UI.esc(g.title)}」吗？<br/>已得的积分保留，记录还在，30 天内不能重建同名目标。`, { danger: true, okLabel: '放弃' });
          close();
          if (!yes) return;
          try {
            await api.post(`/api/goals/${g.id}/abandon`);
            UI.toast('已放弃，记录和积分都还在', 'warn');
            if (onChanged) onChanged();
          } catch (e) {
            UI.toast(e.message, 'err');
          }
        },
      });
      UI.sheet({ title: '目标详情', body, actions });
    } catch (e) {
      UI.toast(e.message, 'err');
    }
  },
};

const STAGE_BADGE = {
  draft: { label: '草稿', cls: 'gray' },
  active: { label: '进行中', cls: 'active' },
  reviewing: { label: '待验收', cls: 'reviewing' },
  achieved: { label: '已达成', cls: 'achieved' },
  abandoned: { label: '已放弃', cls: 'abandoned' },
};

// 小目标新建 / 编辑表单
const StageGoalForm = {
  async open({ goal, onSaved }) {
    const editing = !!goal;
    const g = goal || {
      title: '', emoji: '🏁', description: '', accept_criteria: '', est_total_min: 600,
      difficulty: 3, start_date: null, end_date: null, status: 'draft', custom_points: null,
    };
    const EMOJIS = ['🏁', '🎓', '📖', '🏃', '🎸', '💪', '✈️', '🏠', '💍', '📷', '🎨', '🥇', '🧗', '🏊', '🚵', '🌱'];
    const DIFF_COEF = { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.2 };
    const diffHintMap = { 1: '几乎无门槛', 2: '稍微用点力', 3: '需要专门腾时间', 4: '比较难', 5: '需要长期投入' };
    const body = document.createElement('div');
    body.className = 'goal-form';
    body.innerHTML = `
      <div class="gf-row gf-title-row">
        <div class="emoji-pick" id="sf-emoji">
          ${EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === g.emoji ? 'on' : ''}">${e}</button>`).join('')}
        </div>
        <input id="sf-title" maxlength="30" placeholder="小目标名称，比如：考过雅思 6.5" value="${UI.esc(g.title)}"/>
      </div>
      <div class="gf-row">
        <label class="gf-label">验收标准（必填，≤500 字）</label>
        <textarea id="sf-criteria" rows="3" maxlength="500" placeholder="写成能被「是 / 否」回答的标准，比如：雅思模考 ≥6.5，附成绩单截图">${UI.esc(g.accept_criteria)}</textarea>
      </div>
      <div class="gf-row">
        <label class="gf-label">预估总时长（分钟）</label>
        <div class="gf-inline">
          <button type="button" class="step-btn" id="sf-min-minus">−</button>
          <input id="sf-est" type="number" min="60" max="100000" step="60" value="${g.est_total_min}"/>
          <button type="button" class="step-btn" id="sf-min-plus">+</button>
        </div>
      </div>
      <div class="gf-row">
        <label class="gf-label">难度 <span class="gf-diff-val" id="sf-diff-val">${g.difficulty}</span></label>
        <input id="sf-difficulty" type="range" min="1" max="5" step="1" value="${g.difficulty}"/>
        <div class="gf-diff-hint" id="sf-diff-hint">${diffHintMap[g.difficulty] || ''}</div>
      </div>
      <div class="gf-row">
        <label class="gf-label">达成积分</label>
        <div class="freq-seg" id="sf-points-mode">
          <button type="button" data-v="auto" class="${g.custom_points == null ? 'on' : ''}">自动算</button>
          <button type="button" data-v="custom" class="${g.custom_points != null ? 'on' : ''}">自定义</button>
        </div>
        <div class="cp-extra ${g.custom_points != null ? '' : 'hidden'}" id="sf-cp-extra">
          <div class="cp-presets" id="sf-cp-presets">
            ${[100, 200, 500, 800].map((p) => `<button type="button" class="cp-pre ${Number(g.custom_points) === p ? 'on' : ''}" data-p="${p}">${p}</button>`).join('')}
          </div>
          <div class="gf-inline">
            <input id="sf-custom-points" type="number" min="1" max="9999" placeholder="自定义总积分" value="${g.custom_points != null ? g.custom_points : ''}"/>
          </div>
        </div>
      </div>
      <div class="gf-row">
        <label class="gf-label">起止日期（结束留空 = 长期）</label>
        <div class="gf-inline">
          <input id="sf-start" type="date" value="${g.start_date || new Date().toISOString().slice(0, 10)}"/>
          <span>–</span>
          <input id="sf-end" type="date" value="${g.end_date || ''}"/>
        </div>
      </div>
      <div class="gf-row">
        <label class="gf-label">备注（可选）</label>
        <textarea id="sf-desc" rows="2" maxlength="200" placeholder="补充背景、方法，或给自己鼓鼓劲">${UI.esc(g.description)}</textarea>
      </div>
      <div class="gf-preview sf-preview" id="sf-preview"></div>
    `;

    function cur() {
      const pointsMode = body.querySelector('#sf-points-mode .on').dataset.v;
      const cpRaw = body.querySelector('#sf-custom-points').value;
      const cp = pointsMode === 'custom' && cpRaw !== '' ? Number(cpRaw) : null;
      return {
        est_total_min: Number(body.querySelector('#sf-est').value) || 600,
        difficulty: Number(body.querySelector('#sf-difficulty').value) || 3,
        custom_points: (cp != null && Number.isInteger(cp) && cp > 0) ? cp : null,
      };
    }
    function totalPoints() {
      const c = cur();
      if (c.custom_points != null) return c.custom_points;
      const coef = DIFF_COEF[c.difficulty] || 1.5;
      return Math.min(Math.round(c.est_total_min * 0.5 * coef), 1200);
    }
    function preview() {
      const c = cur();
      const tag = c.custom_points != null
        ? '<span class="pv-tag ok">自定义固定分</span>'
        : `<span class="pv-tag ok">约 ${UI.fmtNum(c.est_total_min)} 分钟投入</span>`;
      body.querySelector('#sf-preview').innerHTML = `
        <div class="pv-left">
          <div class="pv-label">达成后预计入账</div>
          <div class="pv-val">+${UI.fmtNum(totalPoints())} 分</div>
        </div>
        <div class="pv-right">
          ${tag}
        </div>`;
    }
    body.querySelector('#sf-points-mode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      body.querySelectorAll('#sf-points-mode button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      const extra = body.querySelector('#sf-cp-extra');
      if (b.dataset.v === 'custom') {
        extra.classList.remove('hidden');
        const inp = body.querySelector('#sf-custom-points');
        if (!inp.value) inp.value = 200;
        sfSyncPresets();
      } else {
        extra.classList.add('hidden');
      }
      preview();
    });
    function sfSyncPresets() {
      const val = Number(body.querySelector('#sf-custom-points').value);
      body.querySelectorAll('#sf-cp-presets .cp-pre').forEach((btn) => {
        btn.classList.toggle('on', Number(btn.dataset.p) === val);
      });
    }
    body.querySelector('#sf-cp-presets').addEventListener('click', (e) => {
      const b = e.target.closest('.cp-pre');
      if (!b) return;
      body.querySelector('#sf-custom-points').value = b.dataset.p;
      sfSyncPresets();
      preview();
    });
    body.querySelector('#sf-custom-points').addEventListener('input', () => {
      sfSyncPresets();
      preview();
    });
    body.querySelector('#sf-difficulty').addEventListener('input', (e) => {
      body.querySelector('#sf-diff-val').textContent = e.target.value;
      body.querySelector('#sf-diff-hint').textContent = diffHintMap[Number(e.target.value)] || '';
      preview();
    });
    body.querySelector('#sf-est').addEventListener('input', preview);
    body.querySelector('#sf-min-minus').addEventListener('click', () => {
      const i = body.querySelector('#sf-est');
      i.value = Math.max(60, (Number(i.value) || 600) - 60);
      preview();
    });
    body.querySelector('#sf-min-plus').addEventListener('click', () => {
      const i = body.querySelector('#sf-est');
      i.value = Math.min(100000, (Number(i.value) || 600) + 60);
      preview();
    });
    body.querySelector('#sf-emoji').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      body.querySelectorAll('#sf-emoji button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    });
    preview();

    let saving = false;
    UI.sheet({
      title: editing ? '编辑小目标' : '新小目标',
      body,
      actions: [
        { label: editing ? '保存' : '创建小目标', kind: 'primary big', async onClick(close) {
          if (saving) return;
          const title = body.querySelector('#sf-title').value.trim();
          if (!title) { UI.toast('先起个名字', 'warn'); return; }
          const criteria = body.querySelector('#sf-criteria').value.trim();
          if (!criteria) { UI.toast('验收标准是必填的，写清怎么算数', 'warn'); return; }
          const end = body.querySelector('#sf-end').value;
          const start = body.querySelector('#sf-start').value;
          if (end && start && end < start) { UI.toast('结束日期不能早于开始日期', 'warn'); return; }
          const payload = {
            type: 'stage',
            title,
            emoji: body.querySelector('#sf-emoji .on').dataset.e,
            description: body.querySelector('#sf-desc').value.trim(),
            accept_criteria: criteria,
            est_total_min: Number(body.querySelector('#sf-est').value) || 600,
            difficulty: Number(body.querySelector('#sf-difficulty').value) || 3,
            custom_points: cur().custom_points,
            start_date: start || undefined,
            end_date: end || null,
          };
          saving = true;
          try {
            if (editing) await api.put(`/api/goals/${goal.id}`, payload);
            else await api.post('/api/goals', payload);
            close();
            UI.toast(editing ? '已保存' : '小目标建好了，慢慢啃 🌱', 'ok');
            if (onSaved) onSaved();
          } catch (e) {
            saving = false;
            UI.toast(e.message, 'err');
          }
        } },
      ],
    });
  },
};

function freqText(g) {
  if (g.freq_mode === 'daily') return '每日';
  if (g.freq_mode === 'weekly') return `每周 ${g.freq_n} 次`;
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  return '周' + (g.weekdays || '').split(',').map((d) => names[Number(d) - 1]).join('·');
}
