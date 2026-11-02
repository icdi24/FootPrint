// UI 工具：toast、底部弹层、确认框、数字滚动、格式化。
const UI = (() => {
  const toastRoot = () => document.getElementById('toast-root');
  const sheetRoot = () => document.getElementById('sheet-root');

  function toast(msg, type = 'info') {
    const root = toastRoot();
    if (!root) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = msg;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  // 底部弹层；opts: {title, body(el), actions:[{label, kind, onClick(close)}], onClose}
  function sheet(opts) {
    return new Promise((resolve) => {
      const root = sheetRoot();
      const wrap = document.createElement('div');
      wrap.className = 'sheet-wrap';
      wrap.innerHTML = `
        <div class="sheet-backdrop"></div>
        <div class="sheet-panel" role="dialog">
          <div class="sheet-handle"></div>
          ${opts.title ? `<div class="sheet-title">${opts.title}</div>` : ''}
          <div class="sheet-body"></div>
          ${opts.actions && opts.actions.length ? `<div class="sheet-actions">${opts.actions.map((a) =>
            `<button class="sheet-action ${a.kind || ''}" data-idx="${opts.actions.indexOf(a)}">${a.label}</button>`
          ).join('')}</div>` : ''}
        </div>`;
      root.appendChild(wrap);
      const panel = wrap.querySelector('.sheet-panel');
      const bodyEl = wrap.querySelector('.sheet-body');
      if (opts.body) {
        if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
        else bodyEl.appendChild(opts.body);
      }
      requestAnimationFrame(() => wrap.classList.add('show'));

      function close(result) {
        wrap.classList.remove('show');
        setTimeout(() => wrap.remove(), 320);
        resolve(result);
      }
      wrap.querySelector('.sheet-backdrop').addEventListener('click', () => close(null));
      if (opts.onClose) {
        // 关闭时回调（用于丢弃草稿）
        const orig = opts.onClose;
        wrap.addEventListener('transitionend', (e) => {
          if (e.target === wrap && !wrap.classList.contains('show')) orig();
        });
      }
      wrap.querySelectorAll('.sheet-action').forEach((btn) => {
        btn.addEventListener('click', () => {
          const a = opts.actions[Number(btn.dataset.idx)];
          if (a.onClick) a.onClick(close);
          else close(Number(btn.dataset.idx));
        });
      });
      panel.addEventListener('click', (e) => e.stopPropagation());
    });
  }

  async function confirm(msg, { danger = false, okLabel = '确定' } = {}) {
    return new Promise((resolve) => {
      const root = sheetRoot();
      const wrap = document.createElement('div');
      wrap.className = 'sheet-wrap';
      wrap.innerHTML = `
        <div class="sheet-backdrop"></div>
        <div class="sheet-panel confirm">
          <div class="sheet-handle"></div>
          <div class="confirm-msg">${msg}</div>
          <div class="sheet-actions">
            <button class="sheet-action" id="cf-no">再想想</button>
            <button class="sheet-action ${danger ? 'danger' : 'primary'}" id="cf-ok">${okLabel}</button>
          </div>
        </div>`;
      root.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('show'));
      const done = (v) => {
        wrap.classList.remove('show');
        setTimeout(() => wrap.remove(), 320);
        resolve(v);
      };
      wrap.querySelector('.sheet-backdrop').addEventListener('click', () => done(false));
      wrap.querySelector('#cf-no').addEventListener('click', () => done(false));
      wrap.querySelector('#cf-ok').addEventListener('click', () => done(true));
    });
  }

  // 数字滚动（从旧值滚到新值）
  function numberRoll(el, from, to, dur = 450) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { el.textContent = fmtNum(to); return; }
    const t0 = performance.now();
    function frame(t) {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function fmtNum(n) {
    return Number(n).toLocaleString('zh-CN');
  }

  function fmtYuan(points) {
    return (Number(points) / 10).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  }

  // '2026-11-02' → '11月2日'
  function fmtDate(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-');
    return `${Number(m)}月${Number(d)}日`;
  }

  function fmtDateShort(s) {
    if (!s) return '';
    const [, m, d] = s.split('-');
    return `${Number(m)}/${Number(d)}`;
  }

  const WDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  function wdayCN(s) {
    const w = new Date(s + 'T00:00:00+08:00').getDay();
    return WDAYS[w];
  }

  function fmtTimeIso(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    if (h < 23) return '晚上好';
    return '夜深了';
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  return { toast, sheet, confirm, numberRoll, fmtNum, fmtYuan, fmtDate, fmtDateShort, wdayCN, fmtTimeIso, greeting, esc, debounce, el };
})();
