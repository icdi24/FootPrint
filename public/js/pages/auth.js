// 认证页：登录（登录名）+ 凭邀请码注册。
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
    if (opts.register) renderRegister(card);
    else renderLogin(card);
  }

  function renderLogin(card) {
    card.innerHTML = `
      <h2 class="auth-title">登录</h2>
      ${field('登录名', 'login-name', 'text', '你的登录名')}
      ${field('口令', 'login-pw', 'password', '口令')}
      <button class="btn primary block" id="login-btn">进入脚印</button>
      <button class="link-btn" id="to-register">有邀请码？加入脚印</button>
      <p class="auth-hint" id="auth-err"></p>`;
    const err = card.querySelector('#auth-err');
    const doLogin = async () => {
      const loginName = card.querySelector('#login-name').value.trim();
      const password = card.querySelector('#login-pw').value;
      if (!loginName || !password) { err.textContent = '填上登录名和口令'; return; }
      try {
        const data = await api.post('/api/login', { loginName, password });
        App.state.me = data.user;
        UI.toast(`欢迎回来，${data.user.nickname} 🐾`, 'ok');
        App.showShell();
      } catch (e) {
        err.textContent = e.message;
      }
    };
    card.querySelector('#login-btn').addEventListener('click', doLogin);
    card.querySelector('#login-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    card.querySelector('#to-register').addEventListener('click', () => renderRegister(card));
  }

  function renderRegister(card) {
    card.innerHTML = `
      <h2 class="auth-title">用邀请码加入</h2>
      <p class="auth-hint">邀请码由对方在「我的 → 我的搭档」里生成，24 小时内有效、只能用一次。</p>
      ${field('邀请码', 'rg-code', 'text', '12 位邀请码')}
      ${field('登录名', 'rg-name', 'text', '2–30 字，以后登录用，不可改')}
      ${field('昵称', 'rg-nick', 'text', '对方看到的名字，可以改')}
      ${field('口令', 'rg-pw', 'password', '至少 8 位')}
      ${field('再输一遍', 'rg-pw2', 'password', '确认口令')}
      ${avatarRow('av-row')}
      <button class="btn primary block" id="rg-btn">加入</button>
      <button class="link-btn" id="to-login">已有账号？去登录</button>
      <p class="auth-hint" id="rg-err"></p>`;
    const err = card.querySelector('#rg-err');
    let avatar = AVATARS[0];
    const wrap = card.querySelector('#av-row');
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      avatar = b.dataset.a;
    });
    const submit = async () => {
      const code = card.querySelector('#rg-code').value.trim();
      const loginName = card.querySelector('#rg-name').value.trim();
      const nickname = card.querySelector('#rg-nick').value.trim();
      const password = card.querySelector('#rg-pw').value;
      const pw2 = card.querySelector('#rg-pw2').value;
      if (!code || !loginName || !nickname) { err.textContent = '把邀请码、登录名、昵称填齐'; return; }
      if (password !== pw2) { err.textContent = '两次口令不一样'; return; }
      try {
        const data = await api.post('/api/register', { code, loginName, nickname, password, avatar });
        App.state.me = data.user;
        UI.toast(`欢迎加入，${data.user.nickname} 🐾`, 'ok');
        App.showShell();
      } catch (e) {
        err.textContent = e.message;
      }
    };
    card.querySelector('#rg-btn').addEventListener('click', submit);
    card.querySelector('#rg-pw2').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    card.querySelector('#to-login').addEventListener('click', () => renderLogin(card));
  }

  return { render };
})();
