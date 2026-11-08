# -*- coding: utf-8 -*-
# 混合最终版：gemini 生图(11, 质量最高) + game-icons 像素化(其余) + 手绘32兜底(少数)
import json, os, sys, io

BASE = r'D:\PersonalHub\projects\tcamp\小组项目'
N = 32
sys.path.insert(0, BASE)

GEN = json.load(open(os.path.join(BASE, '_pixels.json'), encoding='utf-8'))
GI = json.load(open(os.path.join(BASE, '_gi_pixels.json'), encoding='utf-8'))

import _icons32 as A, _icons32b as B, _icons32c as C
HAND32 = {}
HAND32.update(A.ICONS32); HAND32.update(B.ICONS32); HAND32.update(C.ICONS32)

import _icons_design as D
PAL16 = dict(D.PALETTE); PAL16['t'] = '#7FB2D9'

def h2r(h):
    h = h.lstrip('#')
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

def hand32_grid(rows):
    g = [[None]*N for _ in range(N)]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                g[y][x] = h2r(PAL16[ch])
    return g

def hand16_grid(rows):
    minx,miny,maxx,maxy = 16,16,-1,-1
    for y,row in enumerate(rows):
        for x,ch in enumerate(row):
            if ch!='.':
                minx=min(minx,x);maxx=max(maxx,x);miny=min(miny,y);maxy=max(maxy,y)
    if maxx<0: return [[None]*N for _ in range(N)]
    w=maxx-minx+1; h=maxy-miny+1
    ox=(N-w*2)//2-minx*2; oy=(N-h*2)//2-miny*2
    g=[[None]*N for _ in range(N)]
    for y in range(miny,maxy+1):
        for x in range(minx,maxx+1):
            ch=rows[y][x]
            if ch=='.': continue
            rgb=h2r(PAL16[ch])
            for dy in range(2):
                for dx in range(2):
                    ny=y*2+dy+oy; nx=x*2+dx+ox
                    if 0<=ny<N and 0<=nx<N: g[ny][nx]=rgb
    return g

# 手工指定：这些 game-icons 效果差 -> 用手绘32
USE_HAND32 = {'flag','grad','climb','swim','bell','piano','tooth','apple','broom','camera','star'}

order = []
for line in open(os.path.join(BASE,'_gen_pairs.txt'), encoding='utf-8'):
    if '|' in line: order.append(line.split('|')[0])

data = {}; src = {}
for k in order:
    if k in GEN:
        data[k] = GEN[k]; src[k] = 'gemini'
    elif k in USE_HAND32 and k in HAND32:
        data[k] = hand32_grid(HAND32[k]); src[k] = 'hand32'
    elif k in GI:
        data[k] = GI[k]; src[k] = 'gameicons'
    elif k in HAND32:
        data[k] = hand32_grid(HAND32[k]); src[k] = 'hand32'
    elif k in D.ICONS:
        data[k] = hand16_grid(D.ICONS[k]); src[k] = 'hand16'
    else:
        print('MISSING', k)

cnt = {}
for v in src.values(): cnt[v] = cnt.get(v,0)+1
print('total', len(data), cnt)

# 调色板
palette=[]; pidx={}
for grid in data.values():
    for row in grid:
        for c in row:
            if c is None: continue
            t=(c[0],c[1],c[2])
            if t not in pidx: pidx[t]=len(palette); palette.append(t)

def rects_for(grid):
    out=[]
    for y in range(N):
        x=0; row=grid[y]
        while x<N:
            c=row[x]
            if c is None: x+=1; continue
            ci=pidx[(c[0],c[1],c[2])]; x1=x
            while x<N and row[x] is not None and pidx[(row[x][0],row[x][1],row[x][2])]==ci: x+=1
            out.append((x1,y,x-x1,ci))
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

lines=[]
lines.append("// 主题像素图标库 · 32×32 多色版")
lines.append("// 来源：gemini 生图 + game-icons 像素化 + 手绘像素稿（均已缩为 32×32 矢量 SVG）")
lines.append("// 用法：window.topicIcon(key[,cls])；window.topicFromEmoji(emoji) 兼容旧数据。")
lines.append("(function () {")
lines.append("  const PAL = [" + ", ".join("'#%02x%02x%02x'" % t for t in palette) + "];")
lines.append("  const SRC = " + json.dumps(src, ensure_ascii=False) + ";")
lines.append("  const TOPIC = {")
for k,grid in data.items():
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

OUT = os.path.join(BASE,'public','js','topic-icons.js')
io.open(OUT,'w',encoding='utf-8').write("\n".join(lines)+"\n")
print('wrote', OUT, 'palette', len(palette), 'bytes', os.path.getsize(OUT))
