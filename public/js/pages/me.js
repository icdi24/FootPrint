// 我的页：资料、统计、流水、系数设置、数据与备份。
const MePage = {
  async render(root) {
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
          <div class="date-line">${UI.esc(me.nickname)} 的脚印</div>
        </div>
      </header>

      <section class="profile-card">
        <span class="ps-avatar big">${UI.esc(me.avatar)}</span>
        <div class="pc-main">
          <div class="pc-name">${UI.esc(me.nickname)}</div>
          <div class="pc-meta">和 ${App.state.partner ? UI.esc(App.state.partner.nickname) : '对方'} 互相监督中</div>
        </div>
        <button class="ghost-btn" id="change-pw">${window.icon('lock')} 改口令</button>
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
        <div class="sec-head"><h2>积分流水</h2></div>
        <div class="ledger-list" id="ledger-list"><div class="ld-loading">加载中…</div></div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>设置</h2></div>
        <div class="menu-list">
          <button class="menu-row" id="m-points">${window.icon('gear')}<span>积分系数</span><span class="menu-note">规则可调</span>${window.icon('right')}</button>
          <button class="menu-row" id="m-data">${window.icon('doc')}<span>数据与备份</span><span class="menu-note">导出 · 快照</span>${window.icon('right')}</button>
        </div>
      </section>

      <section class="sec">
        <button class="logout-btn" id="logout">${window.icon('exit')} 退出登录</button>
      </section>

      <p class="about-line">脚印 V0.1 · 只属于你们两个人</p>
    `;

    root.querySelector('#change-pw').addEventListener('click', () => this.changePassword());
    root.querySelector('#m-points').addEventListener('click', () => this.pointsSettings());
    root.querySelector('#m-data').addEventListener('click', () => this.dataSheet(root));
    root.querySelector('#logout').addEventListener('click', async () => {
      const yes = await UI.confirm('退出登录？下次要用口令再进来。', { okLabel: '退出' });
      if (!yes) return;
      try { await api.post('/api/logout'); } catch (e) { /* 忽略 */ }
      App.showAuth();
    });
    this.loadLedger(root);
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

  async changePassword() {
    const body = document.createElement('div');
    body.className = 'pw-form';
    body.innerHTML = `
      ${pwField('old', '现在的口令', 'password')}
      ${pwField('new', '新口令（至少 6 位）', 'password')}
      ${pwField('new2', '再输一遍新口令', 'password')}
      <p class="auth-hint">改完所有设备会登出，用新口令重新登录。忘了口令就用部署者的 reset-password 命令。</p>`;
    UI.sheet({
      title: '修改口令',
      body,
      actions: [
        {
          label: '改口令',
          kind: 'primary',
          async onClick(close) {
            const oldPw = body.querySelector('#old').value;
            const npw = body.querySelector('#new').value;
            const npw2 = body.querySelector('#new2').value;
            if (npw.length < 6) { UI.toast('新口令至少 6 位', 'warn'); return; }
            if (npw !== npw2) { UI.toast('两次新口令不一样', 'warn'); return; }
            try {
              await api.post('/api/me/password', { oldPassword: oldPw, newPassword: npw });
              close();
              UI.toast('口令已改，重新登录一次', 'ok');
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
          <p class="dr-note">恢复前会自动给当前库做一份快照；忘记口令用 <code>node scripts/reset-password.js 昵称</code>。</p>
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
