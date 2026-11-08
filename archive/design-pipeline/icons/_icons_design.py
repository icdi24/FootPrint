# -*- coding: utf-8 -*-
# 16x16 多色像素图标设计稿 + 生成器。
# 网格字母 → 调色板（取自项目 DESIGN.md）：
#   .  透明
#   k  描边深棕   #3B2E22
#   n  深棕(主体) #6E5C46
#   w  羊皮纸白   #FFFDF6
#   g  草绿       #3F7C37
#   d  深绿       #2E6228
#   l  浅绿       #A7C98F
#   y  蜂蜜金     #F2B84B
#   Y  深金       #8A4E0F
#   o  橙         #E8953C
#   O  深橙       #B96A1E
#   r  红         #B44A40
#   R  深红       #93342B
#   p  粉         #E5B8AE
#   b  蓝         #4E7CB5
#   B  深蓝       #35608F
#   s  肤色       #F0C39A
#   c  奶油       #F7E7C6
#   x  棕咖啡     #7A4A22
import sys
from PIL import Image, ImageDraw

PALETTE = {
  'k': '#3B2E22', 'n': '#6E5C46', 'w': '#FFFDF6',
  'g': '#3F7C37', 'd': '#2E6228', 'l': '#A7C98F',
  'y': '#F2B84B', 'Y': '#8A4E0F', 'o': '#E8953C', 'O': '#B96A1E',
  'r': '#B44A40', 'R': '#93342B', 'p': '#E5B8AE',
  'b': '#4E7CB5', 'B': '#35608F', 's': '#F0C39A',
  'c': '#F7E7C6', 'x': '#7A4A22', 'q': '#C9BFAE',
}

ICONS = {}

def I(name, *rows):
    assert len(rows) == 16, (name, len(rows))
    for r in rows:
        assert len(r) == 16, (name, r, len(r))
    ICONS[name] = rows

# 载入图标网格定义
with open(r"D:/PersonalHub/projects/tcamp/小组项目/_icons_body.py", encoding="utf-8") as _f:
    exec(_f.read(), globals())


import io

def render(path, scale=6, cols=9):
    names = list(ICONS.keys())
    rows = (len(names)+cols-1)//cols
    pad = 8; cell = 16*scale+22
    W = pad*2+cols*cell; H = pad*2+rows*cell
    img = Image.new("RGB", (W, H), (250, 243, 227)); d = ImageDraw.Draw(img)
    for i, n in enumerate(names):
        cx = pad+(i % cols)*cell; cy = pad+(i//cols)*cell
        # 棋盘底以便看透明
        for y, row in enumerate(ICONS[n]):
            for x, ch in enumerate(row):
                if ch != '.':
                    d.rectangle([cx+x*scale, cy+y*scale, cx+x*scale+scale-1, cy+y*scale+scale-1], fill=PALETTE[ch])
        d.text((cx, cy+16*scale+4), n, fill=(70, 56, 43))
    img.save(path); print("saved", path, img.size, "n=", len(names))


def to_runs(rows):
    """每行 run-length: list of (x1,x2,colorletter)."""
    out = []
    for y, row in enumerate(rows):
        x = 0
        while x < 16:
            ch = row[x]
            if ch != '.':
                x1 = x; col = ch
                while x < 16 and row[x] == col:
                    x += 1
                out.append((x1, y, x-1, col))
            else:
                x += 1
    return out


if __name__ == "__main__":
    render(r"D:/PersonalHub/projects/tcamp/小组项目/public/_design.png")

    # ── 生成多色 topic-icons.js ────────────────────────────
    PAL_ORDER = ['k', 'n', 'w', 'g', 'd', 'l', 'y', 'Y', 'o', 'O', 'r', 'R', 'p', 'b', 'B', 's', 'c', 'x', 'q']
    pal_js = "[" + ", ".join(f"'{PALETTE[c]}'" for c in PAL_ORDER) + "]"
    pal_index = {c: i for i, c in enumerate(PAL_ORDER)}

    def shifted_runs(rows):
        """居中平移后，输出 [x,y,w,ci]（16x16 坐标）。同色相邻矩形合并。"""
        # bbox
        minX = minY = 16; maxX = maxY = 0
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch != '.':
                    minX = min(minX, x); maxX = max(maxX, x)
                    minY = min(minY, y); maxY = max(maxY, y)
        dx = (16 - (maxX - minX + 1)) // 2 - minX
        dy = (16 - (maxY - minY + 1)) // 2 - minY
        rects = []
        for y, row in enumerate(rows):
            x = 0
            while x < 16:
                ch = row[x]
                if ch != '.':
                    x1 = x; col = ch
                    while x < 16 and row[x] == col:
                        x += 1
                    rects.append([x1 + dx, y + dy, x - x1, pal_index[col]])
                else:
                    x += 1
        return rects

    js = []
    js.append("// 主题像素图标库 · 多色版（愿望 / 目标 / 小目标 / 大目标 里“选图标”的地方用）。")
    js.append("// 16×16 像素网格，每格一个 1×1 rect；颜色取自项目 DESIGN.md 调色板。")
    js.append("// 由 _icons_design.py 的手绘网格自动生成，勿手改。")
    js.append("// 用法：window.topicIcon(key[, cls]) 直接渲染 <span class=ic><svg/></span>；")
    js.append("//       window.__TOPIC_ICONS / __TOPIC_EMOJI / topicFromEmoji(emoji) 供选图标与旧数据兜底。")
    js.append("(function () {")
    js.append("  // 调色板索引表（0..%d）" % (len(PAL_ORDER) - 1))
    js.append("  const PAL = " + pal_js + ";")
    js.append("  // 每个图标：[[x, y, w, colorIndex], ...]（已做 16×16 居中）")
    js.append("  const TOPIC = {")
    for name, rows in ICONS.items():
        rects = shifted_runs(rows)
        body = ",".join(f"[{x},{y},{w},{ci}]" for (x, y, w, ci) in rects)
        js.append(f"    {name}: [{body}],")
    js.append("  };")
    js.append("")
    js.append(r"""  const CACHE = {};
  function svgFor(key) {
    if (CACHE[key]) return CACHE[key];
    const rects = TOPIC[key];
    if (!rects) return '';
    let shape = '';
    for (const [x, y, w, ci] of rects) {
      shape += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${PAL[ci]}"/>`;
    }
    const svg = `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${shape}</svg>`;
    CACHE[key] = svg;
    return svg;
  }

  function topicIcon(key, cls) {
    if (!TOPIC[key]) return `<span class="ic ${cls || ''}"></span>`;
    return `<span class="ic ${cls || ''}">${svgFor(key)}</span>`;
  }

  // 旧数据里的 emoji → 图标 key（用于兼容已存在的愿望/目标记录）
  const EMOJI_MAP = {
    '🎁': 'gift', '🎧': 'headphone', '⌚': 'watch', '👟': 'shoe', '🎮': 'gamepad',
    '📱': 'phone', '💄': 'lipstick', '👜': 'bag', '🛍️': 'bag', '🍰': 'cake', '🎬': 'movie',
    '🛹': 'skateboard', '📷': 'camera', '✈️': 'plane', '🍲': 'hotpot', '🪑': 'chair', '🌷': 'flower',
    '🎯': 'target', '📚': 'book', '📖': 'book', '🏃': 'run', '🏋️': 'gym', '💪': 'muscle',
    '🧘': 'meditate', '💤': 'sleep', '🎹': 'piano', '🎨': 'art', '✍️': 'write', '🦷': 'tooth',
    '🍎': 'apple', '🚴': 'bike', '🧹': 'broom', '🌅': 'sunrise', '💧': 'water', '☕': 'coffee',
    '🏁': 'flag', '🎓': 'grad', '🎸': 'guitar', '🏠': 'house', '💍': 'ring', '🥇': 'medal',
    '🧗': 'climb', '🏊': 'swim', '🚵': 'mountainbike', '🌱': 'sprout', '🏔️': 'mountain',
    '🚀': 'rocket', '💼': 'briefcase', '💻': 'laptop', '🏆': 'trophy', '❤️': 'heart',
    '⭐': 'star', '🐱': 'cat', '🍕': 'pizza', '🤝': 'heart', '😿': 'cat',
    '☂️': 'umbrella', '🌂': 'umbrella', '🔔': 'bell', '🔕': 'bell', '🪙': 'coin', '💰': 'coin',
  };

  function topicFromEmoji(emoji) { return EMOJI_MAP[emoji] || null; }

  window.__TOPIC_ICONS = TOPIC;
  window.__TOPIC_PAL = PAL;
  window.__TOPIC_EMOJI = EMOJI_MAP;
  window.topicIcon = topicIcon;
  window.topicFromEmoji = topicFromEmoji;
})();""")

    outpath = r"D:/PersonalHub/projects/tcamp/小组项目/public/js/topic-icons.js"
    with io.open(outpath, "w", encoding="utf-8") as f:
        f.write("\n".join(js) + "\n")
    print("wrote", outpath, "icons:", len(ICONS))
