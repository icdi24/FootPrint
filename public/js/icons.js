// 自绘 UI 图标：1.6px 圆头线条，24 viewBox，随 currentColor。
const I = {
  home: '<svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5"/><path d="M10 20v-5h4v5"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2.2"/><path d="M12 10v10M4 14h16"/><path d="M12 10s-1.5-5.5-5-5.5A2.2 2.2 0 0 0 7 8.8C7.2 10 9.5 10 12 10Z"/><path d="M12 10s1.5-5.5 5-5.5a2.2 2.2 0 0 1 0 4.3C14.8 10 12.5 10 12 10Z"/></svg>',
  us: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.2" r="3.2"/><path d="M3.5 19.5c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M15.5 14.6c2.4.2 4.2 1.9 4.8 4.6"/></svg>',
  me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="m14.5 5.5-6.5 6.5 6.5 6.5"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 3.5c.8 3.2 4.6 4.6 4.6 8.7a4.6 4.6 0 1 1-9.2 0c0-2.6 1.7-4.5 2.9-6.1.7 1.4 1.2 2.2 1.7 2.7.2-1.9-.2-4.2 0-5.3Z"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><path d="M9.5 9.2c0-1 1.2-1.7 2.5-1.7s2.5.7 2.5 1.7c0 1.1-1.2 1.5-2.5 2.1-1.3.6-2.5 1.1-2.5 2.2 0 1 1.2 1.7 2.5 1.7s2.5-.7 2.5-1.7"/><path d="M12 6.5v11"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="2.5"/><circle cx="12" cy="13" r="3.4"/><path d="M9 7l1.2-2h3.6L15 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19h15"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M6 3.5h8L19 8.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8.5h5"/><path d="M9 13h6M9 16.5h4"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 4 21 19.5H3Z"/><path d="M12 10v4M12 17.2v.2"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="m14.5 5.5 4 4L8 20H4v-4Z"/><path d="m12.8 7.2 4 4"/></svg>',
  exit: '<svg viewBox="0 0 24 24"><path d="M9 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h3"/><path d="M14 7.5 18.5 12 14 16.5"/><path d="M18.5 12H9.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="15.3" r="1.4" fill="currentColor" stroke="none"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3 2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
};

function icon(name, cls) {
  return `<span class="ic ${cls || ''}">${I[name] || ''}</span>`;
}

window.__ICONS = I;
window.icon = icon;
