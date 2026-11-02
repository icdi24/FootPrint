// 目标页：周/月视图网格（模仿参考图）+ 新建/编辑/详情弹层 + FAB。
const GoalsPage = {
  weekStart: null,
  monthAnchor: null,
  viewMode: 'week',

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
        <div class="seg" id="seg">
          <button data-v="week" class="${isWeek ? 'on' : ''}">周</button>
          <button data-v="month" class="${!isWeek ? 'on' : ''}">月</button>
        </div>
        <div class="week-nav">
          <button class="nav-btn" id="prev">${window.icon('left')}</button>
          <span class="week-label" id="week-label">${navLabel}</span>
          <button class="nav-btn" id="next">${window.icon('right')}</button>
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
      cell.addEventListener('click', () => {
        const goal = data.goals.find((g) => g.id === Number(cell.dataset.goal));
        if (!goal) return;
        if (cell.dataset.state === 'todo') {
          CheckinSheet.open(goal, { onSuccess: () => this.draw(root) });
        } else if (cell.dataset.state === 'done') {
          this.cellDetail(root, goal, cell.dataset.date);
        }
      });
    });

    // 点目标名 → 详情
    root.querySelectorAll('.grid-row .g-name, .month-row .g-name').forEach((el) => {
      el.addEventListener('click', () => {
        const goal = data.goals.find((g) => g.id === Number(el.dataset.id));
        if (goal) GoalForm.openDetail(goal, { onChanged: () => this.draw(root) });
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
          <span class="fe-label">每周</span>
          <div class="n-seg wd-seg" id="gf-wd">
            ${names.map((w, i) => `<button type="button" data-d="${i + 1}" class="${sel.has(i + 1) ? 'on' : ''}">${w}</button>`).join('')}
          </div>`;
        freqExtra.querySelector('#gf-wd').addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          b.classList.toggle('on');
          preview();
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

    function cur() {
      const mode = body.querySelector('#gf-freq .on').dataset.v;
      let weekdays = '';
      if (mode === 'weekdays') {
        weekdays = [...body.querySelectorAll('#gf-wd button.on')].map((b) => b.dataset.d).join(',');
      }
      const nBtn = body.querySelector('#gf-n .on');
      return {
        freq_mode: mode,
        freq_n: nBtn ? Number(nBtn.dataset.n) : 1,
        weekdays,
        duration_min: Number(body.querySelector('#gf-duration').value) || 30,
        difficulty: Number(body.querySelector('#gf-difficulty').value) || 3,
        window_start: body.querySelector('#gf-ws').value || null,
        window_end: body.querySelector('#gf-we').value || null,
      };
    }

    function preview() {
      const c = cur();
      const inWin = window.__inWindowCheck({ window_start: c.window_start, window_end: c.window_end });
      const pts = window.__calcClient({ ...c, freq_n: c.freq_n }, c.duration_min, inWin);
      const ratio = pts / (c.duration_min * (window.__DEFAULT_CFG.difficulty[c.difficulty] || 1.5));
      const el = body.querySelector('#gf-preview');
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
            <div class="gd-meta">${freqText(g)} · 每次约 +${UI.fmtNum(g.perCheckinPoints)} 分</div>
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
          <div><b>${g.ratio}</b><span>性价比</span></div>
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

function freqText(g) {
  if (g.freq_mode === 'daily') return '每日';
  if (g.freq_mode === 'weekly') return `每周 ${g.freq_n} 次`;
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  return '周' + (g.weekdays || '').split(',').map((d) => names[Number(d) - 1]).join('·');
}
