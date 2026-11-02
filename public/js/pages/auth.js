// 认证页：首次初始化（两人账号向导）+ 登录。
const AuthPage = (() => {
  const AVATARS = ['🐱', '🐻', '🐰', '🦊', '🐶', '🐼', '🐨', '🦁'];

  function field(label, id, type = 'text', placeholder = '', attrs = '') {
    return `
      <label class="field">
        <span class="field-label">${label}</span>
        <input id="${id}" type="${type}" placeholder="${placeholder}" ${attrs} autocomplete="off"/>
      </label>`;
  }

  function avatarRow(id) {
    return `
      <div class="avatar-pick" id="${id}">
        ${AVATARS.map((a, i) => `<button type="button" data-a="${a}" class="${i === 0 ? 'on' : ''}">${a}</button>`).join('')}
      </div>`;
  }

  function bindAvatar(id) {
    const wrap = document.getElementById(id);
    if (!wrap) return AVATARS[0];
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    });
    return AVATARS[0];
  }

  function render(root, opts = {}) {
    root.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-logo">
          <div class="logo-paw">🐾</div>
          <h1>脚印</h1>
          <p class="auth-sub">两个人互相看得见的打卡与目标</p>
        </div>
        <div class="auth-card" id="auth-card"></div>
      </div>`;
    const card = root.querySelector('#auth-card');
    if (opts.setup) renderSetup(card);
    else renderLogin(card);
  }

  function renderLogin(card) {
    card.innerHTML = `
      <h2 class="auth-title">登录</h2>
      ${field('昵称', 'login-nick', 'text', '你的昵称')}
      ${field('口令', 'login-pw', 'password', '至少 6 位')}
      <button class="btn primary block" id="login-btn">进入脚印</button>
      <p class="auth-hint" id="auth-err"></p>`;
    const err = card.querySelector('#auth-err');
    const doLogin = async () => {
      const nickname = card.querySelector('#login-nick').value.trim();
      const password = card.querySelector('#login-pw').value;
      if (!nickname || !password) { err.textContent = '填上昵称和口令'; return; }
      try {
        const data = await api.post('/api/login', { nickname, password });
        App.state.me = data.user;
        UI.toast(`欢迎回来，${data.user.nickname} 🐾`, 'ok');
        App.showShell();
      } catch (e) {
        err.textContent = e.message;
      }
    };
    card.querySelector('#login-btn').addEventListener('click', doLogin);
    card.querySelector('#login-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  }

  function renderSetup(card) {
    let step = 0;
    const steps = ['我的账号', '对方账号'];
    let me = { avatar: AVATARS[0] };
    let partner = { avatar: AVATARS[1] };

    function draw() {
      card.innerHTML = `
        <div class="setup-steps">
          ${steps.map((s, i) => `<span class="dot ${i === step ? 'on' : i < step ? 'done' : ''}"></span>`).join('')}
        </div>
        <h2 class="auth-title">${step === 0 ? '先创建你的账号' : '再创建对方的账号'}</h2>
        <div class="setup-person">${step === 0 ? '👤 我' : '🤝 对方'}</div>
        ${avatarRow('av-row')}
        ${field('昵称', 'su-nick', 'text', step === 0 ? '你的昵称' : '对方的昵称')}
        ${field('口令', 'su-pw', 'password', '至少 6 位，以后登录用')}
        ${field('再输一遍', 'su-pw2', 'password', '确认口令')}
        <button class="btn primary block" id="su-btn">${step === 0 ? '下一步' : '完成，开始使用'}</button>
        ${step === 1 ? '<button class="link-btn" id="su-back">返回上一步</button>' : ''}
        <p class="auth-hint" id="su-err"></p>`;
      const cur = step === 0 ? me : partner;
      const avWrap = card.querySelector('#av-row');
      const first = step === 0 ? AVATARS[0] : AVATARS[1];
      avWrap.innerHTML = AVATARS.map((a) => `<button type="button" data-a="${a}" class="${a === cur.avatar ? 'on' : ''}">${a}</button>`).join('');
      avWrap.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        avWrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        cur.avatar = b.dataset.a;
      });
      void first;
      const err = card.querySelector('#su-err');
      const next = async () => {
        const nick = card.querySelector('#su-nick').value.trim();
        const pw = card.querySelector('#su-pw').value;
        const pw2 = card.querySelector('#su-pw2').value;
        if (!nick) { err.textContent = '填一下昵称'; return; }
        if (nick.length > 30) { err.textContent = '昵称别超过 30 字'; return; }
        if (pw.length < 6) { err.textContent = '口令至少 6 位'; return; }
        if (pw !== pw2) { err.textContent = '两次口令不一样'; return; }
        if (step === 0) {
          me = { nickname: nick, password: pw, avatar: cur.avatar };
          step = 1;
          draw();
          return;
        }
        partner = { nickname: nick, password: pw, avatar: cur.avatar };
        if (me.nickname === partner.nickname) { err.textContent = '两个人的昵称不能一样'; return; }
        try {
          await api.post('/api/setup', { me, partner });
          UI.toast('两个账号建好了，用各自的昵称登录吧 🎉', 'ok');
          renderLogin(card);
        } catch (e) {
          err.textContent = e.message;
        }
      };
      card.querySelector('#su-btn').addEventListener('click', next);
      card.querySelector('#su-pw2').addEventListener('keydown', (e) => { if (e.key === 'Enter') next(); });
      const back = card.querySelector('#su-back');
      if (back) back.addEventListener('click', () => { step = 0; draw(); });
    }
    draw();
  }

  return { render };
})();
