# -*- coding: utf-8 -*-
# 最终合并：生图版(11) + 手绘32版(37) + 程序化(4) + 剩余手绘16放大
import json, io, os, sys

BASE = r'D:\PersonalHub\projects\tcamp\小组项目'
N = 32
PIX = os.path.join(BASE, '_pixels.json')
OUT = os.path.join(BASE, 'public', 'js', 'topic-icons.js')
sys.path.insert(0, BASE)

# 1) 生图版
generated = json.load(open(PIX, encoding='utf-8')) if os.path.exists(PIX) else {}

# 2) 手绘 32x32
import _icons32 as A, _icons32b as B, _icons32c as C
HAND32 = {}
HAND32.update(A.ICONS32)
HAND32.update(B.ICONS32)
HAND32.update(C.ICONS32)

# 3) 手绘 16x16（剩余兜底）
import _icons_design as D
HAND16 = D.ICONS
PAL16 = dict(D.PALETTE)
PAL16['t'] = '#7FB2D9'

def hex2rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

def hand32_to_grid(rows):
    """32x32 字母网格 -> 32x32 RGB 网格"""
    g = [[None]*N for _ in range(N)]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                g[y][x] = hex2rgb(PAL16[ch])
    return g

def hand16_to_grid(rows):
    """16x16 放大 2x 到 32x32，并居中"""
    minx, miny, maxx, maxy = 16, 16, -1, -1
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                minx=min(minx,x); maxx=max(maxx,x); miny=min(miny,y); maxy=max(maxy,y)
    if maxx < 0: return [[None]*N for _ in range(N)]
    w = maxx-minx+1; h = maxy-miny+1
    ox = (N - w*2)//2 - minx*2
    oy = (N - h*2)//2 - miny*2
    g = [[None]*N for _ in range(N)]
    for y in range(miny, maxy+1):
        for x in range(minx, maxx+1):
            ch = rows[y][x]
            if ch == '.': continue
            rgb = hex2rgb(PAL16[ch])
            for dy in range(2):
                for dx in range(2):
                    ny = y*2+dy+oy; nx = x*2+dx+ox
                    if 0 <= ny < N and 0 <= nx < N:
                        g[ny][nx] = rgb
    return g

order = []
for line in open(os.path.join(BASE,'_gen_pairs.txt'), encoding='utf-8'):
    if '|' in line: order.append(line.split('|')[0])

data = {}; src = {}
for k in order:
    if k in generated:
        data[k] = generated[k]; src[k] = 'gen'
    elif k in HAND32:
        data[k] = hand32_to_grid(HAND32[k]); src[k] = 'hand32'
    elif k in HAND16:
        data[k] = hand16_to_grid(HAND16[k]); src[k] = 'hand16'
    else:
        print('MISSING', k)

print('total', len(data))
print('  gen:', sum(1 for v in src.values() if v=='gen'))
print('  hand32:', sum(1 for v in src.values() if v=='hand32'))
print('  hand16:', sum(1 for v in src.values() if v=='hand16'))
print('  hand16 keys:', ', '.join(k for k,v in src.items() if v=='hand16'))

# 调色板
palette = []; pal_index = {}
for grid in data.values():
    for row in grid:
        for c in row:
            if c is None: continue
            t = (c[0],c[1],c[2])
            if t not in pal_index:
                pal_index[t] = len(palette); palette.append(t)

def rects_for(grid):
    out = []
    for y in range(N):
        x = 0; row = grid[y]
        while x < N:
            c = row[x]
            if c is None: x += 1; continue
            ci = pal_index[(c[0],c[1],c[2])]
            x1 = x
            while x < N and row[x] is not None and pal_index[(row[x][0],row[x][1],row[x][2])] == ci:
                x += 1
            out.append((x1, y, x-x1, ci))
    return out

EMOJI_MAP = {
    '🎁':'gift','🎧':'headphone','⌚':'watch','👟':'shoe','🎮':'gamepad','📱':'phone','💄':'lipstick',
    '👜':'bag','🛍️':'bag','🍰':'cake','🎬':'movie','🛹':'skateboard','📷':'camera','✈️':'plane',
    '🍲':'hotpot','🪑':'chair','🌷':'flower','🎯':'target','📚':'book','📖':'book','🏃':'run',
    '🏋️':'gym','💪':'muscle','🧘':'meditate','💤':'sleep','🎹':'piano','🎨':'art','✍️':'write',
    '🦷':'tooth','🍎':'apple','🚴':'bike','🧹':'broom','🌅':'sunrise','💧':'water','☕':'coffee',
    '🏁':'flag','🎓':'grad','🎸':'guitar','🏠':'house','💍':'ring','🥇':'medal','🧗':'climb',
    '🏊':'swim','🚵':'mountainbike','🌱':'sprout','🏔️':'mountain','🚀':'rocket','💼':'briefcase',
    '💻':'laptop','🏆':'trophy','❤️':'heart','⭐':'star','🐱':'cat','🍕':'pizza','🤝':'heart',
    '😿':'cat','☂️':'umbrella','🌂':'umbrella','🔔':'bell','🔕':'bell','🪙':'coin','💰':'coin',
}

lines = []
lines.append("// 主题像素图标库 · 32×32 多色版")
lines.append("// 生图版来自 Antigravity gemini 生图（缩像素）；其余为 32×32 手绘像素稿。")
lines.append("// 用法：window.topicIcon(key[,cls])；window.topicFromEmoji(emoji) 兼容旧数据。")
lines.append("(function () {")
lines.append("  const PAL = [" + ", ".join("'#%02x%02x%02x'" % t for t in palette) + "];")
lines.append("  const SRC = " + json.dumps(src, ensure_ascii=False) + ";")
lines.append("  const TOPIC = {")
for k, grid in data.items():
    body = ",".join(f"[{x},{y},{w},{ci}]" for (x,y,w,ci) in rects_for(grid))
    lines.append(f"    {k}: [{body}],")
lines.append("  };")
lines.append("""
  const CACHE = {};
  function svgFor(key) {
    if (CACHE[key]) return CACHE[key];
    const r = TOPIC[key];
    if (!r) return '';
    let s = '';
    for (const [x, y, w, ci] of r) s += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${PAL[ci]}"/>`;
    const svg = `<svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">${s}</svg>`;
    CACHE[key] = svg; return svg;
  }
  function topicIcon(key, cls) {
    if (!TOPIC[key]) return `<span class="ic ${cls || ''}"></span>`;
    return `<span class="ic ${cls || ''}">${svgFor(key)}</span>`;
  }
  const EMOJI_MAP = __EMOJI__;
  function topicFromEmoji(e){ return EMOJI_MAP[e] || null; }
  window.__TOPIC_ICONS = TOPIC;
  window.__TOPIC_SRC = SRC;
  window.__TOPIC_EMOJI = EMOJI_MAP;
  window.topicIcon = topicIcon;
  window.topicFromEmoji = topicFromEmoji;
})();
""".replace("__EMOJI__", json.dumps(EMOJI_MAP, ensure_ascii=False)))

io.open(OUT, 'w', encoding='utf-8').write("\n".join(lines) + "\n")
print('wrote', OUT, 'palette', len(palette), 'bytes', os.path.getsize(OUT))
