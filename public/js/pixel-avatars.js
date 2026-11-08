// 像素头像生成器（与最终效果图 100% 一致的 16x16 crispEdges SVG）
const PixelAvatars = (() => {
  const C = {
    ink: '#3B2E22',
    cream: '#FFFDF6',
    pink: '#C46A62',
    catBody: '#D9904E',
    bearBody: '#A66A3F',
    bearSoft: '#D5A06B',
    bearMuzzle: '#F0D3A4',
  };

  const r = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  const wrap = (content) => `<svg viewBox="0 0 16 16" width="100%" height="100%" shape-rendering="crispEdges" aria-hidden="true">${content}</svg>`;

  function cat() {
    return wrap([
      r(3, 1, 3, 4, C.ink), r(10, 1, 3, 4, C.ink),
      r(2, 3, 12, 10, C.ink),
      r(3, 4, 10, 8, C.catBody),
      r(3, 2, 2, 3, C.catBody), r(11, 2, 2, 3, C.catBody),
      r(3, 2, 1, 1, C.pink), r(12, 2, 1, 1, C.pink),
      r(5, 6, 1, 2, C.ink), r(10, 6, 1, 2, C.ink),
      r(6, 9, 4, 3, C.cream), r(7, 9, 2, 1, C.pink),
      r(7, 11, 2, 1, C.ink), r(5, 12, 2, 1, C.cream), r(9, 12, 2, 1, C.cream),
      r(1, 8, 2, 1, C.ink), r(13, 8, 2, 1, C.ink),
      r(1, 10, 2, 1, C.ink), r(13, 10, 2, 1, C.ink)
    ].join(''));
  }

  function bear() {
    return wrap([
      r(2, 1, 4, 4, C.ink), r(10, 1, 4, 4, C.ink),
      r(2, 3, 12, 11, C.ink),
      r(3, 4, 10, 9, C.bearBody),
      r(3, 2, 2, 2, C.bearSoft), r(11, 2, 2, 2, C.bearSoft),
      r(5, 7, 1, 2, C.ink), r(10, 7, 1, 2, C.ink),
      r(5, 9, 6, 4, C.bearMuzzle), r(7, 9, 2, 1, C.ink),
      r(7, 11, 2, 1, C.ink), r(5, 12, 2, 1, C.ink), r(9, 12, 2, 1, C.ink),
      r(4, 5, 2, 1, '#8E5A35'), r(10, 5, 2, 1, '#8E5A35')
    ].join(''));
  }

  function render(avatarChar) {
    if (avatarChar === '🐱' || avatarChar === 'cat') return cat();
    if (avatarChar === '🐻' || avatarChar === 'bear') return bear();
    return avatarChar; // fallback
  }

  return { cat, bear, render };
})();

if (typeof window !== 'undefined') {
  window.PixelAvatars = PixelAvatars;
}
