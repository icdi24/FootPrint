# -*- coding: utf-8 -*-
# 程序化生成 4 个几何类图标（比手打点阵精确）：bike / ring / sunrise / grad
import math

N = 32
ICONS32 = {}

def blank():
    return [['.'] * N for _ in range(N)]

def put(g, x, y, ch):
    if 0 <= x < N and 0 <= y < N:
        g[y][x] = ch

def ring(g, cx, cy, r, ch, thick=2):
    """画圆环"""
    for y in range(N):
        for x in range(N):
            d = math.hypot(x - cx, y - cy)
            if r - thick + 0.5 <= d <= r + 0.5:
                put(g, x, y, ch)

def line(g, x0, y0, x1, y1, ch, thick=1):
    steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    for i in range(steps + 1):
        t = i / steps
        x = round(x0 + (x1 - x0) * t)
        y = round(y0 + (y1 - y0) * t)
        for dy in range(thick):
            for dx in range(thick):
                put(g, x + dx, y + dy, ch)

def fill_tri(g, pts, ch):
    (x0, y0), (x1, y1), (x2, y2) = pts
    minx = int(min(x0, x1, x2)); maxx = int(max(x0, x1, x2))
    miny = int(min(y0, y1, y2)); maxy = int(max(y0, y1, y2))
    def sign(ax, ay, bx, by, cx, cy):
        return (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            d1 = sign(x, y, x0, y0, x1, y1)
            d2 = sign(x, y, x1, y1, x2, y2)
            d3 = sign(x, y, x2, y2, x0, y0)
            neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
            pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
            if not (neg and pos):
                put(g, x, y, ch)

def rows_of(g):
    return ["".join(r) for r in g]

# ── 自行车：两个轮 + 车架 + 车座 + 车把 ──────────────
g = blank()
# 后轮、前轮
ring(g, 8, 23, 6, 'k', thick=2)
ring(g, 24, 23, 6, 'k', thick=2)
# 车架（三角结构）
line(g, 8, 23, 15, 15, 'n', 2)     # 后轮 -> 上管
line(g, 15, 15, 24, 23, 'n', 2)    # 上管 -> 前轮
line(g, 8, 23, 17, 23, 'n', 2)     # 后轮 -> 五通
line(g, 17, 23, 15, 15, 'n', 2)    # 五通 -> 上管
line(g, 17, 23, 24, 23, 'n', 2)    # 五通 -> 前轮
# 车座
line(g, 12, 14, 17, 14, 'k', 2)
# 车把
line(g, 22, 15, 26, 15, 'k', 2)
line(g, 24, 15, 24, 22, 'n', 2)
# 脚踏
line(g, 17, 23, 19, 26, 'k', 1)
ICONS32['bike'] = rows_of(g)

# ── 戒指：钻石 + 指环 ────────────────────────────────
g = blank()
# 指环（正圆环）
for y in range(N):
    for x in range(N):
        d = math.hypot(x - 16, y - 23)
        if 7.0 <= d <= 9.0:
            put(g, x, y, 'y')
# 钻石：台面(平顶) -> 冠部(斜边) -> 亭部收尖
# 台面（平顶）
for x in range(12, 21):
    put(g, x, 6, 'w')
    put(g, x, 7, 'w')
# 冠部：每行向两侧张开到最宽，再向下收
widest_y = 10
for y in range(8, widest_y + 1):
    half = 4 + (y - 8)      # 4,5,6
    for x in range(16 - half, 16 + half + 1):
        put(g, x, y, 't')
# 亭部：从最宽收成尖
for i, y in enumerate(range(widest_y + 1, 19)):
    half = 6 - i
    if half < 0:
        break
    for x in range(16 - half, 16 + half + 1):
        put(g, x, y, 't')
# 高光
put(g, 13, 8, 'w'); put(g, 14, 8, 'w')
put(g, 13, 9, 'w')
ICONS32['ring'] = rows_of(g)

# ── 毕业帽：方形帽板 + 帽箍 + 流苏 ───────────────────
g = blank()
# 帽板：扁平菱形（宽 26，高 9）
for i, y in enumerate(range(8, 17)):
    half = int(13 - abs(y - 12) * 2.9)
    if half < 0:
        half = 0
    for x in range(16 - half, 16 + half + 1):
        put(g, x, y, 'k')
# 顶面（内缩，深棕）
for i, y in enumerate(range(10, 15)):
    half = int(10 - abs(y - 12) * 2.2)
    if half < 0:
        half = 0
    for x in range(16 - half, 16 + half + 1):
        put(g, x, y, 'n')
# 帽箍（下方）
for y in range(17, 24):
    for x in range(11, 22):
        put(g, x, y, 'b')
for y in range(19, 23):
    for x in range(12, 21):
        put(g, x, y, 'B')
# 流苏
line(g, 22, 18, 25, 23, 'y', 1)
for y in range(23, 27):
    put(g, 25, y, 'y')
put(g, 24, 27, 'y')
put(g, 26, 27, 'y')
put(g, 25, 27, 'y')
ICONS32['grad'] = rows_of(g)

# ── 日出：半圆太阳 + 地平线 + 光芒 ───────────────────
g = blank()
# 太阳半圆
for y in range(10, 23):
    for x in range(N):
        d = math.hypot(x - 16, y - 22)
        if d <= 8 and y <= 22:
            put(g, x, y, 'r')
# 内层亮
for y in range(10, 23):
    for x in range(N):
        d = math.hypot(x - 16, y - 22)
        if d <= 4.5 and y <= 22:
            put(g, x, y, 'y')
# 光芒
for ang in (200, 220, 250, 290, 320, 340):
    a = math.radians(ang)
    x0 = 16 + math.cos(a) * 10
    y0 = 22 + math.sin(a) * 10
    x1 = 16 + math.cos(a) * 14
    y1 = 22 + math.sin(a) * 14
    line(g, x0, y0, x1, y1, 'o', 1)
# 地平线
line(g, 0, 23, 31, 23, 'k', 1)
line(g, 0, 24, 31, 24, 'k', 1)
# 地面
for x in range(0, N, 2):
    put(g, x, 26, 'g')
    put(g, x + 1, 26, 'g')
ICONS32['sunrise'] = rows_of(g)

# ── 毕业帽：方形帽板 + 帽箍 + 流苏 ───────────────────
g = blank()
# 帽板（菱形）
fill_tri(g, [(16, 5), (30, 12), (16, 19)], 'k')
fill_tri(g, [(16, 5), (2, 12), (16, 19)], 'k')
# 顶面高光（缩小一圈）
fill_tri(g, [(16, 7), (27, 12), (16, 17)], 'n')
fill_tri(g, [(16, 7), (5, 12), (16, 17)], 'n')
# 帽箍
for x in range(11, 22):
    put(g, x, 19, 'b')
    put(g, x, 20, 'b')
for y in range(19, 25):
    put(g, 11, y, 'b')
    put(g, 21, y, 'b')
# 帽箍内
for y in range(21, 24):
    for x in range(12, 21):
        put(g, x, y, 'B')
# 流苏
line(g, 22, 19, 25, 24, 'y', 1)
for y in range(24, 28):
    put(g, 25, y, 'y')
put(g, 24, 27, 'y')
put(g, 26, 27, 'y')
ICONS32['grad'] = rows_of(g)
