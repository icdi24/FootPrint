// 认证页：登录 + 注册（注册后到「我的」里配对）。
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
      ${field('用户名', 'lg-name', 'text', '你的用户名')}
      ${field('密码', 'login-pw', 'password', '密码')}
      <button class="btn primary block" id="login-btn">进入脚印</button>
      <button class="link-btn" id="to-register">还没有账号？注册</button>
      <button class="link-btn" id="back-browse">← 返回逛逛</button>
      <p class="auth-hint" id="auth-err"></p>`;
    const err = card.querySelector('#auth-err');
    const doLogin = async () => {
      const username = card.querySelector('#lg-name').value.trim();
      const password = card.querySelector('#login-pw').value;
      if (!username || !password) { err.textContent = '填上用户名和密码'; return; }
      try {
        const data = await api.post('/api/login', { username, password });
        App.state.me = data.user;
        UI.toast(`欢迎回来，${data.user.username} 🐾`, 'ok');
        App.onAuthed();
      } catch (e) {
        err.textContent = e.message;
      }
    };
    card.querySelector('#login-btn').addEventListener('click', doLogin);
    card.querySelector('#login-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    card.querySelector('#to-register').addEventListener('click', () => renderRegister(card));
    card.querySelector('#back-browse').addEventListener('click', () => App.showShell());
  }

  function renderRegister(card) {
    card.innerHTML = `
      <h2 class="auth-title">注册</h2>
      <p class="auth-hint">注册后到『我的 → 我的搭档』看自己的邀请码，或输入对方的码完成配对</p>
      ${field('用户名', 'rg-name', 'text', '2–30 字，登录用')}
      ${field('密码', 'rg-pw', 'password', '至少 8 位')}
      ${field('再输一遍', 'rg-pw2', 'password', '确认密码')}
      ${avatarRow('av-row')}
      <button class="btn primary block" id="rg-btn">注册</button>
      <button class="link-btn" id="to-login">已有账号？去登录</button>
      <button class="link-btn" id="back-browse">← 返回逛逛</button>
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
      const username = card.querySelector('#rg-name').value.trim();
      const password = card.querySelector('#rg-pw').value;
      const pw2 = card.querySelector('#rg-pw2').value;
      if (!username || !password) { err.textContent = '把用户名和密码填齐'; return; }
      if (password !== pw2) { err.textContent = '两次密码不一样'; return; }
      try {
        const data = await api.post('/api/register', { username, password, avatar });
        App.state.me = data.user;
        UI.toast(`欢迎加入，${data.user.username} 🐾`, 'ok');
        App.onAuthed();
      } catch (e) {
        err.textContent = e.message;
      }
    };
    card.querySelector('#rg-btn').addEventListener('click', submit);
    card.querySelector('#rg-pw2').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    card.querySelector('#to-login').addEventListener('click', () => renderLogin(card));
    card.querySelector('#back-browse').addEventListener('click', () => App.showShell());
  }

  return { render };
})();
