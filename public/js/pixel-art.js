// 星露谷风「多色像素徽章」：12×12 字符网格，一个字符 = 一个像素。
// 与 icons.js 的区别：icons.js 是单色剪影（fill=currentColor），这里逐格上色，
// 有深棕描边 o / 高光 k / 主体色 / 暗部，形状更饱满，适合做徽章与标题牌。
// 网格不必严格等宽：pixelIcon 会自动求包围盒并居中到方形画布，缺的格补透明。
const PX_PAL = {
  o: '#4E3220', // 深棕描边
  w: '#A2703F', // 木中
  W: '#E8C89A', // 木亮
  y: '#F6D365', // 金亮
  Y: '#D19A2E', // 金暗
  r: '#E2605A', // 莓红
  R: '#A83531', // 深红
  g: '#7CBF55', // 叶绿
  G: '#3F7A34', // 深绿
  b: '#63A9DC', // 天蓝
  B: '#2F6E9E', // 深蓝
  c: '#7FD3C0', // 青
  k: '#FFF6DC', // 奶油高光
  K: '#E7D3A9', // 奶油暗
  p: '#B98BD6', // 浅紫
  P: '#6E4491', // 深紫
  m: '#B9B2A4', // 鼠灰（浅）
  M: '#8B8275', // 鼠灰（暗）
  n: '#F2A6B8', // 鼠粉（耳 / 鼻）
};

const PX_ART = {
  // 金星币：本月得分 / 积分
  score: [
    '....oooo....',
    '..ooYYYYoo..',
    '.oYYyyyyYYo.',
    '.oYyYkkYyYo.',
    '.oYyyKKyyYo.',
    '.oYyKyyKyYo.',
    '.oYyKKKKyYo.',
    '.oYyKyyKyYo.',
    '.oYyyKKyyYo.',
    '.oYYyyyyYYo.',
    '..ooYYYYoo..',
    '....oooo....',
  ],
  // 钱袋：当前余额
  purse: [
    '....oooo....',
    '...oWWWWo...',
    '..oWwwwwWo..',
    '..owKKKKwo..',
    '.oWwwwwwwWo.',
    '.oWwYYYYwWo.',
    '.oWwYyyYwWo.',
    '.oWwYyyYwWo.',
    '.oWwYYYYwWo.',
    '.oWwwwwwwWo.',
    '..oWwwwwWo..',
    '...oooooo...',
  ],
  // 火焰：最长连续
  flame: [
    '.....rr.....',
    '....rRRr....',
    '...rRyyRr...',
    '...rRyyRr...',
    '..rRRyyRRr..',
    '..rRyyyyRr..',
    '.rRRyyyyRRr.',
    '.rRyyKKyyRr.',
    '.rRyyKKyyRr.',
    '..rRyyyyRr..',
    '...rRRRRr...',
    '....oooo....',
  ],
  // 靶心：完成率 / 目标
  bullseye: [
    '....oooo....',
    '..ooKKKKoo..',
    '.oKkkkkkKKo.',
    '.oKkRRRRkKo.',
    '.oKkRkkRkKo.',
    '.oKkRyyRkKo.',
    '.oKkRyyRkKo.',
    '.oKkRkkRkKo.',
    '.oKkRRRRkKo.',
    '.oKkkkkkKKo.',
    '..ooKKKKoo..',
    '....oooo....',
  ],
  // 沙漏：时间投入
  hourglass: [
    '..oooooooo..',
    '..oWWWWWWo..',
    '..oWbbbbWo..',
    '...oWbWbo...',
    '....obbo....',
    '....obbo....',
    '...oWbWbo...',
    '..oWbbbbWo..',
    '..oWbbbbWo..',
    '..oWWWWWWo..',
    '..oooooooo..',
    '............',
  ],
  // 放大镜：被质疑 / 待验收
  lens: [
    '....oooo....',
    '..ooBBBBoo..',
    '.oBBbbbbBBo.',
    '.oBbbkkbbBo.',
    '.oBbbkkbbBo.',
    '.oBBbbbbBBo.',
    '..ooBBBBoo..',
    '....oWWo....',
    '.....oWo....',
    '.....oWo....',
    '.....ooo....',
    '............',
  ],
  // 日历：这个月 / 月历
  calendar: [
    '..o......o..',
    '.oooooooooo.',
    '.oWWWWWWWWo.',
    '.oooooooooo.',
    '.okkkkkkkko.',
    '.okKKkkKKko.',
    '.okkkkkkkko.',
    '.okKKkkKKko.',
    '.okkkkkkkko.',
    '.okKKkkKKko.',
    '.okkkkkkkko.',
    '.oooooooooo.',
  ],
  // 农舍：今天 / 家
  house: [
    '.....oo.....',
    '....oRRo....',
    '...oRRRRo...',
    '..oRRRRRRo..',
    '.oRRRRRRRRo.',
    'oooooooooooo',
    'oWkkkkkkkkWo',
    'oWkkKKKKkkWo',
    'oWkkKkkKkkWo',
    'oWkkKkkKkkWo',
    'oWkkKKKKkkWo',
    'oooooooooooo',
  ],
  // 太阳：今日 / 晨间
  sun: [
    '.....YY.....',
    '..Y..yy..Y..',
    '...YyyyyY...',
    '..YyyyyyyY..',
    '.YyyyyyyyyY.',
    '.YyykRRkyyY.',
    '.YyykRRkyyY.',
    '.YyyyyyyyyY.',
    '..YyyyyyyY..',
    '...YyyyyY...',
    '..Y..yy..Y..',
    '.....YY.....',
  ],
  // 礼物盒：愿望单 / 兑换
  giftbox: [
    '...oooooo...',
    '..oRrrrrRo..',
    '..oRrRRrRo..',
    '.oooooooooo.',
    '.oyyyyyyyyo.',
    '.oyyYRRyyyo.',
    '.oyyYRRyyyo.',
    '.oyyyyyyyyo.',
    '.oyyYRRyyyo.',
    '.oyyYRRyyyo.',
    '.oyyyyyyyyo.',
    '.oooooooooo.',
  ],
  // 心：我们 / 搭档 / 共同
  hearts: [
    '............',
    '..rr....rr..',
    '.rkRr..rRRr.',
    'rRkRRrrRRRRr',
    'rRRRRRRRRRRr',
    '.rRRRRRRRRr.',
    '..rRRRRRRr..',
    '...rRRRRr...',
    '....rRRr....',
    '.....rr.....',
    '............',
    '............',
  ],
  // 卷轴：日报 / 流水 / 记录
  scroll: [
    '............',
    '.oooooooooo.',
    '.oWWWWWWWWo.',
    '.okkkkkkkko.',
    '.okKKKKKKko.',
    '.okkkkkkkko.',
    '.okKKKKKKko.',
    '.okkkkkkkko.',
    '.okKKKKKKko.',
    '.okkkkkkkko.',
    '.oWWWWWWWWo.',
    '.oooooooooo.',
  ],
  // 爪印：zoowy / 画像
  paw: [
    '............',
    '..oo....oo..',
    '.oPpo..oPpo.',
    '.oPpo..oPpo.',
    '..oo....oo..',
    '...oPPPPo...',
    '..oPppppPo..',
    '..oPppppPo..',
    '...oPPPPo...',
    '....oooo....',
    '............',
    '............',
  ],
  // 宝箱：设置 / 数据备份 / 系数
  chest: [
    '............',
    '..oooooooo..',
    '.oWWWWWWWWo.',
    '.oWYYYYYYWo.',
    '.oooooooooo.',
    '.oWwKKKKwWo.',
    '.oWwKYYKwWo.',
    '.oWwKYYKwWo.',
    '.oWwKKKKwWo.',
    '.oWwwwwwwWo.',
    '.oooooooooo.',
    '............',
  ],
  // 对话气泡：状态 / 聊聊
  chat: [
    '............',
    '..oooooooo..',
    '.okkkkkkkko.',
    '.okKKKKKKko.',
    '.okkkkkkkko.',
    '.okKKKKKKko.',
    '.okkkkkkkko.',
    '.oooooooooo.',
    '..oWo.......',
    '..oo........',
    '............',
    '............',
  ],
  // 柱状图：对比 / 趋势 / 统计
  bars: [
    '............',
    '........gg..',
    '........gg..',
    '..rr....gg..',
    '..rr..bbgg..',
    '..rr..bbgg..',
    '..rr..bbgg..',
    '.oooooooooo.',
    '..oooooooo..',
    '............',
    '............',
    '............',
  ],
  // 头像：我的 / 资料
  avatar: [
    '....oooo....',
    '..ooWWWWoo..',
    '.oWkkkkkkWo.',
    '.oWkKkkKkWo.',
    '.oWkKkkKkWo.',
    '.oWkkkkkkWo.',
    '.oWkkKKkKWo.',
    '..oWkkkkWo..',
    '...oGGGGo...',
    '..oGGGGGGo..',
    '.oGGGGGGGGo.',
    '....oooo....',
  ],
  // 小老鼠：zoowy 贴边浮标专用（粉耳 + 灰脸 + 胡须）
  mouse: [
    '..ooo..ooo..',
    '.onno..onno.',
    '.onmo..onmo.',
    '..oommmmoo..',
    '.ommmmmmmmo.',
    'omkmmmmmmkmo',
    'omommmmmmomo',
    'ommmmnnmmmmo',
    '.ommmmmmmmo.',
    '...oommoo...',
    '...o.oo.o...',
    '............',
  ],
};

// 字符网格 → 多色 SVG。水平连续同色像素合并成一段 path，按颜色分组减少节点。
function pixelIcon(name, cls) {
  const rows = PX_ART[name];
  if (!rows) return window.icon ? window.icon(name, cls) : '<span class="ic"></span>';
  const w = Math.max.apply(null, rows.map((r) => r.length));
  const h = rows.length;
  const W = Math.max(12, w + 2), H = Math.max(12, h + 2);
  const dx = Math.floor((W - w) / 2), dy = Math.floor((H - h) / 2);
  const byColor = {};
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (!PX_PAL[ch]) { x += 1; continue; }
      let x2 = x;
      while (x2 + 1 < row.length && row[x2 + 1] === ch) x2 += 1;
      const color = PX_PAL[ch];
      (byColor[color] || (byColor[color] = [])).push(
        `M${x + dx} ${y + dy}h${x2 - x + 1}v1h-${x2 - x + 1}Z`
      );
      x = x2 + 1;
    }
  });
  const paths = Object.keys(byColor).map((c) => `<path fill="${c}" d="${byColor[c].join('')}"/>`).join('');
  return `<span class="pxa ${cls || ''}"><svg viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true">${paths}</svg></span>`;
}

// 分区标题 → 语义图标。按关键词顺序匹配，命中不了就用中性的卷轴。
const SEC_ICON_RULES = [
  [/这个月|本月|月历|日历|这个周|本周/, 'calendar'],
  [/状态/, 'chat'],
  [/积分流水|积分|余额|账本/, 'score'],
  [/愿望|想要|礼物|兑换|奖励/, 'giftbox'],
  [/日报|日记|记录|流水|复盘/, 'scroll'],
  [/并排|对比|趋势|统计|时长|手机|数据|图表/, 'bars'],
  [/今日|今天|早上/, 'sun'],
  [/待我验收|验收|待办|质疑/, 'lens'],
  [/已完成|打卡|完成/, 'bullseye'],
  [/目标|小目标|大目标/, 'bullseye'],
  [/我们|搭档|分享|共同|对方|ta |栗子|阿白/, 'hearts'],
  [/zoowy|画像|聊聊|爪/, 'paw'],
  [/设置|备份|导出|导入|系数|数据管理/, 'chest'],
  [/我的|资料/, 'avatar'],
];

const SecIcons = {
  iconFor(title) {
    for (const [re, name] of SEC_ICON_RULES) if (re.test(title)) return name;
    return 'scroll';
  },
  // 幂等：给 h2 打 data-px-icon，重复调用不会重复插入
  decorate(root) {
    if (!root || !root.querySelectorAll) return 0;
    let n = 0;
    root.querySelectorAll('.sec-head h2').forEach((h2) => {
      if (h2.dataset.pxIcon) return;
      const name = this.iconFor(h2.textContent.trim());
      h2.dataset.pxIcon = name;
      h2.insertAdjacentHTML('afterbegin',
        `<span class="sec-ico">${pixelIcon(name)}</span>`);
      n += 1;
    });
    return n;
  },
  // 页面多为异步渲染，用 MutationObserver 等真实内容落定后补图标；切页时调用 dispose
  watch(holder) {
    this.decorate(holder);
    let timer = null;
    const mo = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => this.decorate(holder), 0);
    });
    mo.observe(holder, { childList: true, subtree: true });
    return () => { clearTimeout(timer); mo.disconnect(); };
  },
};

window.pixelIcon = pixelIcon;
window.SecIcons = SecIcons;
window.__PX_ART = PX_ART;
