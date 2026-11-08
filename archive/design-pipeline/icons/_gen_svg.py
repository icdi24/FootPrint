# -*- coding: utf-8 -*-
# 由 _pixels.json（32x32 彩色网格）生成多色 topic-icons.js（矢量 SVG，每图标一组 rect）
import json, io, os

BASE = r'D:\PersonalHub\projects\tcamp\小组项目'
PIX = os.path.join(BASE, '_pixels.json')
OUT = os.path.join(BASE, 'public', 'js', 'topic-icons.js')
N = 32

data = json.load(open(PIX, encoding='utf-8'))

# 收集全局调色板（去重）
palette = []
pal_index = {}
for grid in data.values():
    for row in grid:
        for c in row:
            if c is None: continue
            t = (c[0], c[1], c[2])
            if t not in pal_index:
                pal_index[t] = len(palette)
                palette.append(t)

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

def rects_for(grid):
    """同行同色水平合并 -> [x,y,w,colorIdx]。"""
    out = []
    for y in range(N):
        x = 0
        row = grid[y]
        while x < N:
            c = row[x]
            if c is None:
                x += 1; continue
            ci = pal_index[(c[0], c[1], c[2])]
            x1 = x
            while x < N and row[x] is not None and pal_index[(row[x][0], row[x][1], row[x][2])] == ci:
                x += 1
            out.append((x1, y, x - x1, ci))
    return out

# 去掉整图四周多余的空白行/列（再居中裁剪，尽量占满 32x32）
def trim_grid(grid):
    minx, miny, maxx, maxy = N, N, -1, -1
    for y in range(N):
        for x in range(N):
            if grid[y][x] is not None:
                minx=min(minx,x); maxx=max(maxx,x); miny=min(miny,y); maxy=max(maxy,y)
    if maxx < 0: return grid
    w = maxx-minx+1; h = maxy-miny+1
    # 重采样到居中、等比放大填满（不超界）
    scale = min((N*1.0)/w, (N*1.0)/h)
    # 简化：直接居中平移，不缩放（源已经是裁剪方形，基本填满）
    ox = (N - w)//2 - minx
    oy = (N - h)//2 - miny
    newg = [[None]*N for _ in range(N)]
    for y in range(miny, maxy+1):
        for x in range(minx, maxx+1):
            ny, nx2 = y+oy, x+ox
            if 0 <= ny < N and 0 <= nx2 < N:
                newg[ny][nx2] = grid[y][x]
    return newg

lines = []
lines.append("// 主题像素图标库 · 32×32 多色版（由 Antigravity 生图 → 缩像素 → 矢量 SVG 自动生成）。")
lines.append("// 每个图标是一组 <rect>；viewBox 0 0 32 32；纯净色块，任意缩放不糊。")
lines.append("// 用法：window.topicIcon(key[,cls])；window.topicFromEmoji(emoji) 兼容旧数据。")
lines.append("(function () {")
pal_js = "[" + ", ".join(f"'{ ('#%02x%02x%02x' % (r,g,b)) }'" for (r,g,b) in palette) + "]"
lines.append("  const PAL = " + pal_js + ";")
lines.append("  const TOPIC = {")
for key, grid in data.items():
    g = trim_grid(grid)
    rects = rects_for(g)
    body = ",".join(f"[{x},{y},{w},{ci}]" for (x,y,w,ci) in rects)
    lines.append(f"    {key}: [{body}],")
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
  const EMOJI_MAP = EMOJIS_PLACEHOLDER;
  function topicFromEmoji(e){ return EMOJI_MAP[e] || null; }
  window.__TOPIC_ICONS = TOPIC;
  window.__TOPIC_EMOJI = EMOJI_MAP;
  window.topicIcon = topicIcon;
  window.topicFromEmoji = topicFromEmoji;
})();
""".replace("EMOJIS_PLACEHOLDER", json.dumps(EMOJI_MAP, ensure_ascii=False)))

io.open(OUT, 'w', encoding='utf-8').write("\n".join(lines) + "\n")
print("wrote", OUT, "icons:", len(data), "palette:", len(palette))
