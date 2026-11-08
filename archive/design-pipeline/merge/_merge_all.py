# -*- coding: utf-8 -*-
# 合并：已生成的生图版(32x32) + 其余手绘版(16x16 -> 2x 放大到 32x32)，输出完整 55 个 topic-icons.js
import json, io, os, sys

BASE = r'D:\PersonalHub\projects\tcamp\小组项目'
N = 32
PIX = os.path.join(BASE, '_pixels.json')
OUT = os.path.join(BASE, 'public', 'js', 'topic-icons.js')

# 1) 生图版
generated = json.load(open(PIX, encoding='utf-8'))

# 2) 手绘版（导入设计稿模块拿 ICONS + PALETTE）
sys.path.insert(0, BASE)
import _icons_design as D
HAND = D.ICONS
PAL = D.PALETTE

def hex2rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

# 手绘 16x16 -> 32x32（每格 2x2），并按 bbox 居中
def hand_to_32(rows):
    # bbox
    minx, miny, maxx, maxy = 16, 16, -1, -1
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                minx=min(minx,x); maxx=max(maxx,x); miny=min(miny,y); maxy=max(maxy,y)
    if maxx < 0: return [[None]*N for _ in range(N)]
    w = maxx-minx+1; h = maxy-miny+1
    # 放大 2 倍后尺寸
    sw, sh = w*2, h*2
    ox = (N - sw)//2 - minx*2
    oy = (N - sh)//2 - miny*2
    g = [[None]*N for _ in range(N)]
    for y in range(miny, maxy+1):
        for x in range(minx, maxx+1):
            ch = rows[y][x]
            if ch == '.': continue
            rgb = hex2rgb(PAL[ch])
            for dy in range(2):
                for dx in range(2):
                    ny = y*2+dy+oy; nx = x*2+dx+ox
                    if 0 <= ny < N and 0 <= nx < N:
                        g[ny][nx] = rgb
    return g

# 顺序
order = []
for line in open(os.path.join(BASE,'_gen_pairs.txt'), encoding='utf-8'):
    if '|' in line: order.append(line.split('|')[0])

data = {}
src = {}
for k in order:
    if k in generated:
        data[k] = generated[k]; src[k] = 'gen'
    elif k in HAND:
        data[k] = hand_to_32(HAND[k]); src[k] = 'hand'
    else:
        print('MISSING', k)

print('merged', len(data), 'gen:', sum(1 for v in src.values() if v=='gen'), 'hand:', sum(1 for v in src.values() if v=='hand'))

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
lines.append("// 已生成图标来自 Antigravity 生图 → 缩像素；其余为手绘像素稿（待生图额度恢复后自动升级）。")
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
