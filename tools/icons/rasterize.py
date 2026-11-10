# -*- coding: utf-8 -*-
"""精确栅格化结果 -> 16x16 字符画 + 对比预览图。"""
import json, math, os
from PIL import Image, ImageDraw

TOOLS = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(os.path.dirname(os.path.dirname(TOOLS)), 'shots')
SRC = os.path.join(TOOLS, 'arcade-grid.json')
PREVIEW = os.path.join(SHOTS, 'arcade-16-preview.png')
ROWS = os.path.join(TOOLS, 'arcade-16-rows.json')


def bbox(grid, w, h):
    pts = [(x, y) for y in range(h) for x in range(w) if grid[y][x]]
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def resample(grid, w, h, size=16):
    bb = bbox(grid, w, h)
    out = [[0] * size for _ in range(size)]
    if not bb:
        return out
    x0, y0, x1, y1 = bb
    bw, bh = x1 - x0, y1 - y0
    scale = min(size / bw, size / bh)
    tw = max(1, min(size, round(bw * scale)))
    th = max(1, min(size, round(bh * scale)))
    ox, oy = (size - tw) // 2, (size - th) // 2
    for j in range(th):
        for i in range(tw):
            sx0, sx1 = x0 + i * bw / tw, x0 + (i + 1) * bw / tw
            sy0, sy1 = y0 + j * bh / th, y0 + (j + 1) * bh / th
            total = hit = 0.0
            for yy in range(math.floor(sy0), math.ceil(sy1)):
                cy = min(sy1, yy + 1) - max(sy0, yy)
                if cy <= 0 or not (0 <= yy < h):
                    continue
                for xx in range(math.floor(sx0), math.ceil(sx1)):
                    cx = min(sx1, xx + 1) - max(sx0, xx)
                    if cx <= 0 or not (0 <= xx < w):
                        continue
                    area = cx * cy
                    total += area
                    if grid[yy][xx]:
                        hit += area
            out[oy + j][ox + i] = 1 if total and hit / total >= 0.34 else 0
    return out


def main():
    data = json.load(open(SRC, encoding='utf-8'))
    rows = {}
    for name, item in data.items():
        g = item['grid']
        r = resample(g, item['w'], item['h'])
        rows[name] = [''.join('#' if v else '.' for v in row) for row in r]
    json.dump(rows, open(ROWS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    names = sorted(rows)
    cols, cell_a, cell_b, pad, label = 8, 6, 10, 8, 14
    rowh = 16 * cell_b + label + pad * 2
    colw = 32 * cell_a + 16 * cell_b + pad * 3 + 20
    H = ((len(names) + cols - 1) // cols) * rowh
    img = Image.new('RGB', (cols * colw, H), '#FAF3E3')
    dr = ImageDraw.Draw(img)
    for idx, name in enumerate(names):
        item = data[name]
        cx, cy = (idx % cols) * colw, (idx // cols) * rowh
        g = item['grid']
        for y in range(item['h']):
            for x in range(item['w']):
                if g[y][x]:
                    dr.rectangle([cx + pad + x * cell_a, cy + pad + y * cell_a,
                                  cx + pad + (x + 1) * cell_a - 1, cy + pad + (y + 1) * cell_a - 1], fill='#46382B')
        bx = cx + pad * 2 + 32 * cell_a
        for y, row in enumerate(rows[name]):
            for x, ch in enumerate(row):
                if ch == '#':
                    dr.rectangle([bx + x * cell_b, cy + pad + y * cell_b,
                                  bx + (x + 1) * cell_b - 1, cy + pad + (y + 1) * cell_b - 1], fill='#46382B')
        dr.text((cx + pad, cy + 16 * cell_b + 2), name, fill='#46382B')
    img.save(PREVIEW)
    print('saved', PREVIEW, img.size, 'icons', len(names))


if __name__ == '__main__':
    main()
