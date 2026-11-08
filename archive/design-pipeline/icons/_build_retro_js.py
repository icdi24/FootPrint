# -*- coding: utf-8 -*-
# 解析 _retro_svg 下的所有 55 个 SVG 文件，生成干净的 public/js/topic-icons.js
import os, re, json

BASE = r'D:\PersonalHub\projects\tcamp\小组项目'
SVG_DIR = os.path.join(BASE, '_retro_svg')
OUT_JS = os.path.join(BASE, 'public', 'js', 'topic-icons.js')

pairs = [line.split('|')[0] for line in open(os.path.join(BASE, '_gen_pairs.txt'), encoding='utf-8').read().splitlines() if '|' in line]

svg_data = {}

for k in pairs:
    p = os.path.join(SVG_DIR, f'{k}.svg')
    if not os.path.exists(p):
        print(f'Missing {k}')
        continue
    content = open(p, encoding='utf-8').read()
    # 提取 viewBox
    vb_m = re.search(r'viewBox="([^"]+)"', content)
    vb = vb_m.group(1) if vb_m else '0 0 24 24'
    # 提取 inner content
    inner = re.sub(r'^<svg[^>]*>', '', content).strip()
    inner = re.sub(r'</svg>$', '', inner).strip()
    # 保证 fill 为 currentColor
    inner = re.sub(r'fill="[^"]+"', 'fill="currentColor"', inner)
    svg_data[k] = {
        'vb': vb,
        'body': inner
    }

print(f'Parsed {len(svg_data)} SVGs successfully.')

EMOJI_MAP = {
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
}

js_lines = [
    "// 权威开源像素图标库（Pixelarticons / Streamline Pixel / Withicons-Retro 融合版）",
    "// 纯正 1-bit 像素描边 · 严格网格对齐 · 零杂色零模糊 · crispEdges 渲染",
    "(function () {",
    "  const ICONS = " + json.dumps(svg_data, ensure_ascii=False) + ";",
    "  const EMOJI_MAP = " + json.dumps(EMOJI_MAP, ensure_ascii=False) + ";",
    "",
    "  function topicIcon(name, cls) {",
    "    const item = ICONS[name];",
    "    if (!item) return `<span class=\"ic ${cls || ''}\"></span>`;",
    "    return `<span class=\"ic ${cls || ''}\"><svg viewBox=\"${item.vb}\" shape-rendering=\"crispEdges\" aria-hidden=\"true\">${item.body}</svg></span>`;",
    "  }",
    "",
    "  function topicFromEmoji(emoji) {",
    "    return EMOJI_MAP[emoji] || null;",
    "  }",
    "",
    "  window.__TOPIC_ICONS = ICONS;",
    "  window.__TOPIC_EMOJI = EMOJI_MAP;",
    "  window.topicIcon = topicIcon;",
    "  window.topicFromEmoji = topicFromEmoji;",
    "})();"
]

with open(OUT_JS, 'w', encoding='utf-8') as f:
    f.write('\n'.join(js_lines))

print(f'Written {OUT_JS}, size: {os.path.getsize(OUT_JS)} bytes')
