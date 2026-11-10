# -*- coding: utf-8 -*-
"""脚印 · 统一图标库构建脚本
   来源：手机端 22 枚 16x16 剪影 + 街机主题 56 枚（重采样到 16 格）+ 新绘制的缺失图标
   输出：public/js/icons.js（唯一运行时来源）、public/icons/*.svg、public/icons.html、shots/icon-sheet.png
"""
import json, math, os, re

ROOT = r"D:\PersonalHub\projects\tcamp\小组项目"
TOOLS = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(ROOT, 'shots')
N = 16

# ────────────────────────── 绘图原语 ──────────────────────────
def blank():
    return [[0] * N for _ in range(N)]


def put(g, x, y, v=1):
    if 0 <= x < N and 0 <= y < N:
        g[y][x] = v


def rect(g, x0, y0, x1, y1, v=1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(g, x, y, v)


def frame(g, x0, y0, x1, y1, t=1, v=1):
    rect(g, x0, y0, x1, y0 + t - 1, v)
    rect(g, x0, y1 - t + 1, x1, y1, v)
    rect(g, x0, y0, x0 + t - 1, y1, v)
    rect(g, x1 - t + 1, y0, x1, y1, v)


def line(g, x0, y0, x1, y1, t=1, v=1):
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx - dy
    while True:
        rect(g, x0, y0, x0 + t - 1, y0 + t - 1, v)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x0 += sx
        if e2 < dx:
            err += dx
            y0 += sy


def circle(g, cx, cy, r, t=1.3, fill=False, v=1):
    for y in range(N):
        for x in range(N):
            d = math.hypot(x - cx, y - cy)
            if (d <= r) if fill else (r - t < d <= r):
                put(g, x, y, v)


def erase_rect(g, x0, y0, x1, y1):
    rect(g, x0, y0, x1, y1, 0)


def shift(g, dx, dy):
    out = blank()
    for y in range(N):
        for x in range(N):
            if g[y][x]:
                put(out, x + dx, y + dy)
    return out


def mirror_x(g):
    out = blank()
    for y in range(N):
        for x in range(N):
            out[y][N - 1 - x] = g[y][x]
    return out


# ────────────────────────── 新绘制的图标 ──────────────────────────
def draw_paw():
    g = blank()
    for x in (1, 5, 9, 13):
        rect(g, x, 1, x + 1, 3)
    rect(g, 4, 5, 11, 5)
    rect(g, 3, 6, 12, 7)
    rect(g, 2, 8, 13, 9)
    rect(g, 3, 10, 12, 10)
    rect(g, 4, 11, 11, 11)
    return g


def draw_avatar():
    g = blank()
    circle(g, 7.5, 5.5, 3.6, fill=True)
    rect(g, 6, 9, 8, 10)
    rect(g, 3, 11, 12, 11)
    rect(g, 2, 12, 13, 14)
    rect(g, 1, 15, 14, 15)
    return g


def draw_chat():
    g = blank()
    frame(g, 1, 2, 14, 11, 2)
    rect(g, 3, 5, 4, 6)
    rect(g, 7, 5, 8, 6)
    rect(g, 11, 5, 12, 6)
    rect(g, 3, 12, 6, 14)
    rect(g, 4, 15, 5, 15)
    return g


def draw_success():
    g = blank()
    circle(g, 7.5, 7.5, 6.4, 1.5)
    line(g, 4, 8, 6, 10, 1)
    line(g, 6, 10, 11, 4, 1)
    return g


def draw_info():
    g = blank()
    circle(g, 7.5, 7.5, 6.4, 1.5)
    rect(g, 7, 4, 8, 5)
    rect(g, 7, 7, 8, 11)
    return g


def draw_help():
    g = blank()
    circle(g, 7.5, 7.5, 6.4, 1.5)
    rect(g, 5, 4, 6, 4)
    rect(g, 9, 4, 10, 4)
    rect(g, 10, 5, 11, 7)
    rect(g, 8, 7, 10, 8)
    rect(g, 7, 9, 8, 10)
    rect(g, 7, 12, 8, 13)
    return g


def draw_search():
    g = blank()
    circle(g, 6.5, 6.5, 4.6, 1.4)
    line(g, 10, 10, 14, 14, 2)
    return g


def draw_trash():
    g = blank()
    rect(g, 5, 1, 10, 2)
    rect(g, 3, 3, 12, 3)
    rect(g, 4, 4, 11, 14)
    erase_rect(g, 6, 6, 9, 12)
    rect(g, 6, 5, 9, 5)
    return g


def draw_eye():
    g = blank()
    for y in range(8):
        half = max(0, 6 - abs(y - 4))
        rect(g, 8 - half - 2, y + 4, 8 + half + 1, y + 4)
    circle(g, 7.5, 7.5, 2.6, fill=True)
    rect(g, 7, 6, 8, 7, 0)
    return g


def draw_refresh():
    g = blank()
    circle(g, 7.5, 7.5, 5.6, 1.5)
    erase_rect(g, 0, 0, 15, 4)
    rect(g, 10, 1, 14, 3)
    rect(g, 12, 3, 14, 5)
    rect(g, 1, 11, 5, 14)
    rect(g, 1, 12, 3, 14)
    return g


def draw_share():
    g = blank()
    circle(g, 3.5, 8, 2.2, fill=True)
    circle(g, 12, 3.5, 2.2, fill=True)
    circle(g, 12, 12.5, 2.2, fill=True)
    line(g, 5, 7, 11, 4, 1)
    line(g, 5, 9, 11, 12, 1)
    return g


def draw_pin():
    g = blank()
    rect(g, 5, 1, 10, 5)
    rect(g, 6, 2, 9, 4, 0)
    rect(g, 7, 6, 8, 14)
    rect(g, 4, 13, 11, 14)
    return g


def draw_image():
    g = blank()
    frame(g, 1, 2, 14, 13, 1)
    circle(g, 5, 5, 1.3, fill=True)
    rect(g, 2, 11, 6, 9)
    rect(g, 3, 10, 8, 8)
    rect(g, 4, 9, 10, 7)
    rect(g, 6, 11, 13, 9)
    rect(g, 8, 10, 13, 8)
    return g


def draw_chart():
    g = blank()
    rect(g, 2, 13, 13, 14)
    rect(g, 2, 2, 3, 13)
    rect(g, 4, 9, 6, 12)
    rect(g, 8, 5, 10, 12)
    rect(g, 12, 2, 14, 12)
    return g


def draw_moon():
    g = blank()
    circle(g, 8, 8, 6, fill=True)
    circle(g, 11.5, 5.5, 5, fill=True, v=0)
    return g


def draw_sun():
    g = blank()
    circle(g, 7.5, 7.5, 3.4, fill=True)
    for a in range(0, 360, 45):
        rad = math.radians(a)
        x = round(7.5 + 6 * math.cos(rad))
        y = round(7.5 + 6 * math.sin(rad))
        rect(g, x, y, x + 1, y + 1)
    return g


def draw_sparkle():
    g = blank()
    rect(g, 7, 1, 8, 5)
    rect(g, 5, 3, 10, 3)
    rect(g, 7, 6, 8, 7)
    rect(g, 1, 7, 2, 8)
    rect(g, 12, 7, 13, 8)
    rect(g, 3, 11, 4, 12)
    rect(g, 11, 11, 12, 12)
    rect(g, 7, 10, 8, 14)
    rect(g, 5, 12, 10, 12)
    return g


def draw_more():
    g = blank()
    for x in (2, 7, 12):
        circle(g, x + 0.5, 7.5, 1.5, fill=True)
    return g


def draw_bookmark():
    g = blank()
    rect(g, 3, 1, 12, 14)
    rect(g, 6, 2, 9, 14, 0)
    rect(g, 7, 3, 8, 14)
    rect(g, 3, 12, 6, 14, 0)
    rect(g, 9, 12, 12, 14, 0)
    rect(g, 7, 14, 8, 14, 0)
    return g


def draw_cook():
    g = blank()
    rect(g, 1, 6, 11, 13)
    rect(g, 2, 7, 10, 12, 0)
    rect(g, 1, 6, 11, 7)
    rect(g, 12, 8, 15, 9)
    circle(g, 5.5, 9.5, 2, fill=True)
    return g


def draw_lifebuoy():
    g = blank()
    circle(g, 7.5, 7.5, 6.5, 2.2)
    rect(g, 6, 0, 9, 2)
    rect(g, 6, 13, 9, 15)
    rect(g, 0, 6, 2, 9)
    rect(g, 13, 6, 15, 9)
    return g


def draw_wallet():
    g = blank()
    rect(g, 1, 3, 13, 13)
    erase_rect(g, 3, 5, 11, 11)
    rect(g, 1, 3, 13, 4)
    rect(g, 10, 7, 15, 10)
    rect(g, 11, 8, 14, 9, 0)
    return g


def draw_globe():
    g = blank()
    circle(g, 7.5, 7.5, 6.4, 1.4)
    rect(g, 1, 7, 14, 8)
    rect(g, 7, 1, 8, 14)
    circle(g, 7.5, 7.5, 3.2, 0.9)
    return g


def draw_brain():
    g = blank()
    rect(g, 3, 3, 7, 6)
    rect(g, 8, 3, 12, 6)
    rect(g, 2, 6, 13, 10)
    rect(g, 4, 10, 11, 12)
    rect(g, 7, 12, 8, 14)
    rect(g, 7, 4, 8, 11, 0)
    return g


def draw_pill():
    g = blank()
    line(g, 2, 13, 8, 3, 3)
    line(g, 8, 3, 13, 8, 3)
    rect(g, 7, 4, 9, 6, 0)
    return g


def draw_salad():
    g = blank()
    rect(g, 1, 8, 14, 12)
    rect(g, 2, 13, 13, 14)
    circle(g, 4, 7, 2.2, fill=True)
    circle(g, 8, 5, 2.6, fill=True)
    circle(g, 12, 7, 2.2, fill=True)
    rect(g, 4, 9, 12, 10)
    return g


def draw_thought():
    g = blank()
    frame(g, 1, 2, 13, 10, 2)
    rect(g, 4, 11, 6, 12)
    rect(g, 2, 13, 4, 14)
    rect(g, 1, 15, 2, 15)
    rect(g, 4, 5, 5, 6)
    rect(g, 7, 5, 8, 6)
    rect(g, 10, 5, 11, 6)
    return g


def draw_dog():
    g = blank()
    rect(g, 2, 1, 4, 6)
    rect(g, 11, 1, 13, 6)
    rect(g, 4, 3, 11, 12)
    rect(g, 5, 6, 6, 7, 0)
    rect(g, 9, 6, 10, 7, 0)
    rect(g, 6, 9, 9, 10)
    rect(g, 7, 11, 8, 11, 0)
    return g


def draw_stretch():
    g = blank()
    circle(g, 8, 2.5, 1.8, fill=True)
    rect(g, 7, 4, 8, 9)
    line(g, 7, 5, 2, 3, 2)
    line(g, 8, 5, 13, 3, 2)
    line(g, 7, 9, 3, 14, 2)
    line(g, 8, 9, 13, 14, 2)
    return g


def draw_up():
    g = blank()
    line(g, 8, 2, 2, 9, 2)
    line(g, 8, 2, 14, 9, 2)
    rect(g, 7, 9, 9, 14)
    return g


def draw_down():
    g = blank()
    line(g, 2, 6, 8, 13, 2)
    line(g, 14, 6, 8, 13, 2)
    rect(g, 7, 1, 9, 6)
    return g


def draw_cloud():
    g = blank()
    circle(g, 5, 8, 3.2, fill=True)
    circle(g, 10, 7, 3.8, fill=True)
    rect(g, 4, 8, 12, 11)
    return g


def draw_mail():
    g = blank()
    frame(g, 1, 3, 14, 12, 1)
    line(g, 1, 3, 8, 9, 1)
    line(g, 14, 3, 8, 9, 1)
    return g


def draw_key():
    g = blank()
    circle(g, 4.5, 5, 3, 1.8)
    line(g, 6, 7, 14, 14, 2)
    rect(g, 11, 11, 13, 13)
    rect(g, 13, 9, 15, 11)
    return g


def draw_music():
    g = blank()
    rect(g, 9, 1, 14, 3)
    rect(g, 9, 3, 10, 11)
    rect(g, 13, 3, 14, 11)
    rect(g, 6, 11, 10, 14)
    rect(g, 10, 11, 14, 14)
    return g


def draw_video():
    g = blank()
    frame(g, 1, 3, 10, 12, 1)
    rect(g, 11, 6, 14, 5)
    rect(g, 12, 6, 14, 9)
    rect(g, 15, 5, 15, 10)
    return g


def draw_wifi():
    g = blank()
    for i, r in enumerate((6.5, 4.5, 2.5)):
        for y in range(N):
            for x in range(N):
                d = math.hypot(x - 7.5, y - 12)
                if r - 1.1 < d <= r and y <= 12:
                    put(g, x, y)
    circle(g, 7.5, 12.5, 1.4, fill=True)
    return g


def draw_crown():
    g = blank()
    rect(g, 1, 4, 3, 1)
    rect(g, 7, 2, 8, 1)
    rect(g, 12, 4, 14, 1)
    line(g, 1, 4, 4, 9, 2)
    line(g, 3, 4, 7, 9, 2)
    line(g, 14, 4, 11, 9, 2)
    line(g, 12, 4, 8, 9, 2)
    rect(g, 2, 10, 13, 13)
    return g


def draw_sprout():
    g = blank()
    rect(g, 7, 7, 8, 14)
    rect(g, 4, 6, 7, 7)
    rect(g, 2, 4, 6, 6)
    rect(g, 9, 5, 13, 6)
    rect(g, 10, 3, 13, 4)
    rect(g, 5, 10, 10, 11)
    return g


def draw_flower():
    g = blank()
    circle(g, 7.5, 5.5, 1.8, fill=True)
    for cx, cy in ((4, 4), (11, 4), (4, 8), (11, 8), (7.5, 1.5)):
        circle(g, cx, cy, 2, fill=True)
    rect(g, 7, 8, 8, 14)
    rect(g, 4, 11, 7, 12)
    rect(g, 8, 10, 11, 11)
    return g


def draw_lipstick():
    g = blank()
    rect(g, 5, 2, 10, 4)
    rect(g, 6, 1, 9, 1)
    rect(g, 5, 5, 10, 6)
    rect(g, 4, 7, 11, 14)
    rect(g, 5, 8, 10, 8, 0)
    return g


def draw_menu():
    g = blank()
    for y in (3, 7, 11):
        rect(g, 2, y, 13, y + 1)
    return g


def draw_filter():
    g = blank()
    rect(g, 1, 2, 14, 3)
    line(g, 2, 4, 7, 9, 1)
    line(g, 13, 4, 8, 9, 1)
    rect(g, 7, 9, 8, 14)
    return g


def draw_save():
    g = blank()
    frame(g, 1, 1, 14, 14, 1)
    rect(g, 4, 1, 10, 5)
    rect(g, 5, 2, 9, 4, 0)
    rect(g, 4, 9, 11, 13)
    return g


def draw_upload():
    g = blank()
    line(g, 8, 1, 3, 7, 2)
    line(g, 8, 1, 13, 7, 2)
    rect(g, 7, 1, 9, 9)
    rect(g, 2, 12, 13, 14)
    return g


def draw_copy():
    g = blank()
    frame(g, 5, 1, 14, 10, 1)
    frame(g, 1, 5, 10, 14, 1)
    return g


def draw_link():
    g = blank()
    line(g, 5, 10, 11, 4, 2)
    frame(g, 1, 7, 6, 12, 2)
    frame(g, 9, 3, 14, 8, 2)
    return g


def draw_send():
    g = blank()
    line(g, 1, 8, 14, 1, 1)
    line(g, 14, 1, 14, 14, 1)
    line(g, 14, 14, 1, 8, 1)
    rect(g, 1, 7, 6, 9)
    return g


def draw_undo():
    g = blank()
    circle(g, 8, 7.5, 5.2, 1.5)
    erase_rect(g, 0, 0, 7, 15)
    line(g, 7, 2, 2, 7, 2)
    line(g, 2, 7, 7, 12, 2)
    return g


# ── 复检后重绘：以下同名定义覆盖上面走样的版本 ──────────────
def draw_eye():
    g = blank()
    for x in range(1, 15):
        half = max(0, 3 - round(abs(x - 7.5) * 0.5))
        rect(g, x, 7 - half, x, 8 - half)
        rect(g, x, 7 + half, x, 8 + half)
    circle(g, 7.5, 7.5, 2.0, fill=True)
    return g


def draw_pill():
    g = blank()
    rect(g, 4, 2, 11, 3)
    rect(g, 2, 4, 13, 5)
    rect(g, 1, 6, 14, 9)
    rect(g, 2, 10, 13, 11)
    rect(g, 4, 12, 11, 13)
    rect(g, 7, 5, 8, 10, 0)
    return g


def draw_crown():
    g = blank()
    rect(g, 1, 11, 14, 14)
    rect(g, 1, 10, 14, 10)
    rect(g, 2, 4, 3, 9)
    rect(g, 7, 1, 8, 9)
    rect(g, 12, 4, 13, 9)
    return g


def draw_moon():
    g = blank()
    circle(g, 7.5, 7.5, 6.2, fill=True)
    circle(g, 11.2, 4.2, 5.8, fill=True, v=0)
    return g


def draw_wifi():
    g = blank()
    for r in (7.0, 4.6, 2.3):
        for x in range(N):
            d2 = r * r - (x - 7.5) ** 2
            if d2 < 0:
                continue
            y = 12 - round(math.sqrt(d2))
            put(g, x, y)
            put(g, x, y + 1)
    circle(g, 7.5, 12.5, 1.2, fill=True)
    return g


def draw_bookmark():
    g = blank()
    rect(g, 3, 1, 12, 10)
    for y in range(11, 15):
        k = y - 10
        rect(g, 3 + k, y, 12 - k, y)
    return g


def draw_more():
    g = blank()
    for x in (2, 7, 12):
        rect(g, x, 6, x + 2, 8)
    return g


def draw_brain():
    g = blank()
    circle(g, 5, 6, 3.2, fill=True)
    circle(g, 10, 6, 3.2, fill=True)
    rect(g, 4, 8, 11, 11)
    rect(g, 7, 3, 8, 12, 0)
    return g


def draw_ring():
    g = blank()
    circle(g, 7.5, 10, 4.4, 1.6)
    rect(g, 5, 2, 9, 5)
    rect(g, 6, 1, 8, 1)
    rect(g, 6, 3, 8, 4, 0)
    return g


def draw_swim():
    g = blank()
    circle(g, 4, 3.5, 1.9, fill=True)
    line(g, 4, 6, 11, 8, 2)
    rect(g, 1, 11, 14, 12)
    rect(g, 2, 14, 7, 15)
    rect(g, 9, 14, 13, 15)
    return g


def draw_broom():
    g = blank()
    line(g, 12, 1, 6, 9, 2)
    rect(g, 2, 9, 9, 10)
    for y in range(11, 15):
        k = y - 10
        rect(g, 1 + k, y, 10 - k, y)
    return g


# ── 角色形象：小猫 / 小狗 / zoowy 小老鼠 ──────────────────────
# 与功能图标同一 16×16 网格、同一单色剪影画法，不另起一套资产。
# 用途：cat / dog 作双人头像候选，mouse 是 zoowy 贴边浮标，paw 是品牌爪印。
def draw_cat():
    g = blank()
    rect(g, 3, 3, 12, 12)
    rect(g, 2, 1, 4, 4)
    rect(g, 11, 1, 13, 4)
    rect(g, 5, 6, 6, 7, 0)
    rect(g, 9, 6, 10, 7, 0)
    rect(g, 7, 9, 8, 9, 0)
    rect(g, 1, 8, 3, 8)
    rect(g, 12, 8, 14, 8)
    rect(g, 4, 13, 11, 13)
    return g


def draw_dog():
    g = blank()
    rect(g, 4, 3, 11, 12)
    rect(g, 1, 2, 3, 9)
    rect(g, 12, 2, 14, 9)
    rect(g, 5, 6, 6, 7, 0)
    rect(g, 9, 6, 10, 7, 0)
    rect(g, 7, 9, 8, 10)
    rect(g, 5, 12, 10, 13)
    return g


def draw_mouse():
    g = blank()
    circle(g, 4, 4, 2.3, fill=True)
    circle(g, 11, 4, 2.3, fill=True)
    rect(g, 4, 4, 11, 12)
    rect(g, 6, 7, 7, 8, 0)
    rect(g, 9, 7, 10, 8, 0)
    rect(g, 7, 10, 8, 10, 0)
    for y in range(13, 15):
        k = y - 12
        rect(g, 5 + k, y, 10 - k, y)
    return g


HAND = {
    'cat': draw_cat, 'dog': draw_dog, 'mouse': draw_mouse,
    'ring': draw_ring, 'swim': draw_swim, 'broom': draw_broom,
    'menu': draw_menu, 'filter': draw_filter, 'save': draw_save,
    'upload': draw_upload, 'copy': draw_copy, 'link': draw_link,
    'send': draw_send, 'undo': draw_undo,
    'paw': draw_paw, 'avatar': draw_avatar, 'chat': draw_chat,
    'success': draw_success, 'info': draw_info, 'help': draw_help,
    'search': draw_search, 'trash': draw_trash, 'eye': draw_eye,
    'refresh': draw_refresh, 'share': draw_share, 'pin': draw_pin,
    'image': draw_image, 'chart': draw_chart, 'moon': draw_moon,
    'sun': draw_sun, 'sparkle': draw_sparkle, 'more': draw_more,
    'bookmark': draw_bookmark, 'cook': draw_cook, 'lifebuoy': draw_lifebuoy,
    'wallet': draw_wallet, 'globe': draw_globe, 'brain': draw_brain,
    'pill': draw_pill, 'salad': draw_salad, 'thought': draw_thought,
    'dog': draw_dog, 'stretch': draw_stretch, 'up': draw_up,
    'down': draw_down, 'cloud': draw_cloud, 'mail': draw_mail,
    'key': draw_key, 'music': draw_music, 'video': draw_video,
    'wifi': draw_wifi, 'crown': draw_crown,
    # 覆盖街机重采样后失真的 3 枚
    'sprout': draw_sprout, 'flower': draw_flower, 'lipstick': draw_lipstick,
}


# ────────────────────────── 数据读入 ──────────────────────────
def rows_to_grid(rows):
    g = blank()
    rects = []
    for y, row in enumerate(rows.split('/')):
        if not row or row == '-':
            continue
        for run in row.split(','):
            m = re.match(r'(\d+)-(\d+)', run.strip())
            if m:
                rects.append((int(m.group(1)), int(m.group(2)), y))
    if not rects:
        return g
    minx = min(r[0] for r in rects)
    maxx = max(r[1] for r in rects)
    miny = min(r[2] for r in rects)
    maxy = max(r[2] for r in rects)
    dx = (16 - (maxx - minx + 1)) // 2 - minx
    dy = (16 - (maxy - miny + 1)) // 2 - miny
    for a, b, y in rects:
        for x in range(a, b + 1):
            put(g, x + dx, y + dy)
    return g


def read_legacy_pix():
    backup = os.path.join(TOOLS, 'icons.legacy.js')
    src = open(backup if os.path.exists(backup)
               else os.path.join(SHOTS, 'icons.legacy.js'), encoding='utf-8').read()
    m = re.search(r'const PIX = (\{.*?\});', src, re.S)
    try:
        data = json.loads(m.group(1))
        return {n: rows_to_grid(r) for n, r in data.items()}
    except Exception:
        pass
    body = re.search(r'const PIX = \{(.*?)\n\};', src, re.S).group(1)
    out = {}
    for mm in re.finditer(r"(\w+):\s*'([^']+)'", body):
        out[mm.group(1)] = rows_to_grid(mm.group(2))
    return out


def read_arcade():
    data = json.load(open(os.path.join(TOOLS, 'arcade-16-rows.json'), encoding='utf-8'))
    out = {}
    for name, rows in data.items():
        g = blank()
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch == '#':
                    put(g, x, y)
        out[name] = g
    return out


def to_rows(g):
    lines = []
    for row in g:
        runs, start = [], None
        for x, v in enumerate(row + [0]):
            if v and start is None:
                start = x
            elif not v and start is not None:
                runs.append(f'{start}-{x - 1}')
                start = None
        lines.append(','.join(runs) if runs else '-')
    return '/'.join(lines)


def to_path(g):
    parts = []
    for y, row in enumerate(g):
        start = None
        for x, v in enumerate(row + [0]):
            if v and start is None:
                start = x
            elif not v and start is not None:
                parts.append(f'M{start} {y}h{x - start}v1h-{x - start}z')
                start = None
    return ''.join(parts)


# ────────────────────────── 分类 / emoji 映射 ──────────────────────────
CATEGORIES = {
    '导航与界面': ['home', 'target', 'gift', 'us', 'me', 'up', 'down', 'left', 'right',
                'more', 'menu', 'search', 'filter', 'bell', 'star', 'heart', 'bookmark',
                'avatar', 'chat'],
    '角色形象': ['paw', 'cat', 'dog', 'mouse'],
    '操作与状态': ['check', 'plus', 'close', 'download', 'doc', 'alert', 'edit', 'exit',
                'lock', 'clock', 'calendar', 'camera', 'gear', 'coin', 'flame',
                'success', 'info', 'help', 'refresh', 'share', 'trash', 'eye',
                'pin', 'image', 'chart', 'sparkle', 'sun', 'moon', 'save', 'upload',
                'copy', 'link', 'send', 'undo', 'cloud', 'mail', 'key', 'music',
                'video', 'wifi', 'crown', 'wallet', 'thought'],
    '活动与物品': [],
}

EMOJI_MAP = {
    '🏠': 'home', '🎯': 'target', '🎁': 'gift', '👫': 'us', '👤': 'me', '🔥': 'flame',
    '🪙': 'coin', '📷': 'camera', '📸': 'camera', '⚙️': 'gear', '📄': 'doc',
    '⚠️': 'alert', '✅': 'success', '❓': 'help', '✨': 'sparkle', '⭐': 'star',
    '❤️': 'heart', '🔔': 'bell', '🌙': 'sleep', '💤': 'sleep', '☀️': 'sun',
    '🌅': 'sunrise', '📖': 'book', '📚': 'book', '📕': 'book', '📗': 'book',
    '📘': 'book', '💧': 'water', '🏃': 'run', '🏃‍♀️': 'run', '🎸': 'guitar',
    '🧘': 'meditate', '🥗': 'salad', '✍️': 'write', '📝': 'write', '🎨': 'art',
    '🧹': 'broom', '💊': 'pill', '🎧': 'headphone', '🪴': 'sprout', '🌱': 'sprout',
    '🏋️': 'gym', '💪': 'muscle', '🎹': 'piano', '🦷': 'tooth', '🍎': 'apple',
    '🚴': 'bike', '🏁': 'flag', '🎓': 'grad', '✈️': 'plane', '💍': 'ring',
    '🥇': 'medal', '🎖️': 'medal', '🧗': 'climb', '🏊': 'swim', '🚵': 'mountainbike',
    '🏔️': 'mountain', '🚀': 'rocket', '💼': 'briefcase', '💻': 'laptop',
    '🏆': 'trophy', '⌚': 'watch', '👟': 'shoe', '🎮': 'gamepad', '📱': 'phone',
    '💄': 'lipstick', '👜': 'bag', '🍰': 'cake', '🎬': 'movie', '🛹': 'skateboard',
    '🍲': 'hotpot', '♨️': 'hotpot', '🪑': 'chair', '🌷': 'flower', '🧋': 'boba',
    '🛟': 'lifebuoy', '🍳': 'cook', '📌': 'pin', '🐾': 'paw', '💰': 'wallet',
    '🌏': 'globe', '🧠': 'brain', '🤸': 'stretch', '💭': 'thought', '🐱': 'cat',
    '🐶': 'dog', '☕': 'coffee', '🍵': 'coffee', '🌊': 'swim', '🚪': 'exit',
    '🛋️': 'chair', '😴': 'sleep', '🍎': 'apple', '🏡': 'house',
    '🐭': 'mouse', '🐈': 'cat', '🐕': 'dog',
}


def _rewrite(path, pattern, repl):
    """替换文件里一处生成块，保留原有换行风格。"""
    src = open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in src else '\n'
    out, n = re.subn(pattern, repl.replace('\n', nl), src, count=1, flags=re.S)
    if n:
        open(path, 'w', encoding='utf-8', newline='').write(out)
    return n


def sync_consumers(pix, glyphs):
    """把唯一来源同步到所有消费点，防止双端 / 主题图标漂移。

    1. public/web/app.js   内联 PIX_FALLBACK（部署漏文件时的兜底，曾出过事故）
    2. public/web/icons.js 桌面端兜底 PIX
    3. public/themes/arcade/icons/*.svg 街机主题同名 SVG
    """
    body = ',\n'.join(f"    {n}: '{r}'" for n, r in pix.items())
    a = _rewrite(os.path.join(ROOT, 'public', 'web', 'app.js'),
                 r'  const PIX_FALLBACK = \{.*?\n  \};',
                 '  const PIX_FALLBACK = {\n' + body + '\n  };')
    b = _rewrite(os.path.join(ROOT, 'public', 'web', 'icons.js'),
                 r'  const PIX = \{.*?\n  \};',
                 '  const PIX = {\n' + body + '\n  };')
    arcade_dir = os.path.join(ROOT, 'public', 'themes', 'arcade', 'icons')
    c, missing = 0, []
    if os.path.isdir(arcade_dir):
        for f in sorted(os.listdir(arcade_dir)):
            if not f.endswith('.svg'):
                continue
            src = os.path.join(ROOT, 'public', 'icons', f)
            if os.path.exists(src):
                open(os.path.join(arcade_dir, f), 'w', encoding='utf-8').write(
                    open(src, encoding='utf-8').read())
                c += 1
            else:
                missing.append(f[:-4])
    print(f'sync: app.js={a} web/icons.js={b} arcade_svg={c} missing={missing}')


def main():
    legacy = read_legacy_pix()
    arcade = read_arcade()
    glyphs = {}
    glyphs.update(legacy)                       # 手机端 22 枚：基准
    for name, g in arcade.items():
        if name not in glyphs:                  # 同名以手机端为准
            glyphs[name] = g
    for name, fn in HAND.items():
        glyphs[name] = fn()                     # 新绘制 / 修正

    # 分类：前三组只保留真实存在的图标，其余全部归入「活动与物品」
    GROUPS = ('导航与界面', '角色形象', '操作与状态')
    for key in GROUPS:
        CATEGORIES[key] = [n for n in CATEGORIES[key] if n in glyphs]
    known = {n for k in GROUPS for n in CATEGORIES[k]}
    CATEGORIES['活动与物品'] = sorted(n for n in glyphs if n not in known)

    pix = {n: to_rows(g) for n, g in glyphs.items()}
    # 与运行时 pixPath 完全一致的居中结果：SVG / 总览图都用它，避免两套渲染
    render = {n: rows_to_grid(r) for n, r in pix.items()}
    pix_json = json.dumps(pix, ensure_ascii=False, separators=(',', ':'))
    cat_json = json.dumps(CATEGORIES, ensure_ascii=False, separators=(',', ':'))
    emoji_json = json.dumps(EMOJI_MAP, ensure_ascii=False, separators=(',', ':'))

    # 1) 单一运行时来源
    js = JS_TEMPLATE.replace('__PIX__', pix_json).replace('__CAT__', cat_json).replace('__EMOJI__', emoji_json)
    open(os.path.join(ROOT, 'public', 'js', 'icons.js'), 'w', encoding='utf-8').write(js)

    # 2) 独立 SVG 文件
    ico_dir = os.path.join(ROOT, 'public', 'icons')
    os.makedirs(ico_dir, exist_ok=True)
    for name in pix:
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" '
               f'width="16" height="16" shape-rendering="crispEdges">'
               f'<path fill="currentColor" d="{to_path(render[name])}"/></svg>\n')
        open(os.path.join(ico_dir, name + '.svg'), 'w', encoding='utf-8').write(svg)

    # 3) 图标墙
    html = (HTML_TEMPLATE.replace('__PIX__', pix_json)
            .replace('__CAT__', cat_json).replace('__EMOJI__', emoji_json)
            .replace('__COUNT__', str(len(glyphs))))
    open(os.path.join(ROOT, 'public', 'icons.html'), 'w', encoding='utf-8').write(html)

    # 4) PNG 总览（用于视觉校验）
    from PIL import Image, ImageDraw
    names = sorted(glyphs)
    cols, cell, pad, lab = 10, 12, 8, 16
    rowh = 16 * cell + lab + pad * 2
    W = cols * (16 * cell + pad * 2)
    H = ((len(names) + cols - 1) // cols) * rowh
    img = Image.new('RGB', (W, H), '#FAF3E3')
    dr = ImageDraw.Draw(img)
    for i, name in enumerate(names):
        cx, cy = (i % cols) * (16 * cell + pad * 2), (i // cols) * rowh
        g = render[name]
        for y in range(16):
            for x in range(16):
                if g[y][x]:
                    dr.rectangle([cx + pad + x * cell, cy + pad + y * cell,
                                  cx + pad + (x + 1) * cell - 1, cy + pad + (y + 1) * cell - 1], fill='#46382B')
        dr.text((cx + pad, cy + 16 * cell + 2), name, fill='#46382B')
    img.save(os.path.join(SHOTS, 'icon-sheet.png'))

    # 5) 同步所有消费点，避免副本漂移
    sync_consumers(pix, glyphs)

    print('icons:', len(glyphs), '| legacy:', len(legacy), '| arcade:', len(arcade), '| hand:', len(HAND))
    print('categories:', {k: len(v) for k, v in CATEGORIES.items()})


JS_TEMPLATE = r'''/* ═══════════════════════════════════════════════════════════════
   脚印 · 统一像素图标库（唯一来源，手机端 / 桌面工作台共用）
   规范：16×16 网格、单色 currentColor、shape-rendering: crispEdges
   每个图标是 16 行；每行是若干 x1-x2 闭区间，- 表示该行空白。
   本文件由 icon-tools/build.py 生成，请勿手工编辑；改图标请改脚本。
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const PIX = __PIX__;
  const CATEGORIES = __CAT__;
  const EMOJI = __EMOJI__;

  function pixPath(rows) {
    const rects = [];
    String(rows).split('/').forEach((row, y) => {
      if (!row || row === '-') return;
      row.split(',').forEach((run) => {
        const m = run.trim().match(/^(\d+)-(\d+)$/);
        if (m) rects.push([+m[1], y, +m[2] - +m[1] + 1]);
      });
    });
    if (!rects.length) return '';
    let minX = 16, maxX = 0, minY = 16, maxY = 0;
    for (const [x, y, w] of rects) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + w - 1);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const dx = Math.floor((16 - (maxX - minX + 1)) / 2) - minX;
    const dy = Math.floor((16 - (maxY - minY + 1)) / 2) - minY;
    return rects.map(([x, y, w]) => `M${x + dx} ${y + dy}h${w}v1h-${w}Z`).join('');
  }

  function iconSvg(name, cls) {
    const rows = PIX[name];
    if (!rows) return '';
    return `<svg class="px-ico${cls ? ' ' + cls : ''}" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="${pixPath(rows)}"/></svg>`;
  }

  /* 手机端原有 API：<span class="ic"> 包裹 */
  function icon(name, cls) {
    const rows = PIX[name];
    if (!rows) return `<span class="ic ${cls || ''}"></span>`;
    return `<span class="ic ${cls || ''}"><svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${pixPath(rows)}"/></svg></span>`;
  }

  function emojiName(emoji) {
    if (!emoji) return null;
    const key = String(emoji).trim();
    return EMOJI[key] || (PIX[key] ? key : null);
  }

  /* 把内容 emoji 换成同一套像素图标；找不到映射时返回原文 */
  function iconForEmoji(emoji, cls) {
    const name = emojiName(emoji);
    return name ? iconSvg(name, cls) : null;
  }

  /* 内容 emoji → 同一套像素图标（状态/心情表情属于用户表达，不在选择器内，保留 emoji） */
  const EMOJI_SELECTOR = [
    /* 桌面工作台 */
    '.task-emoji,.wish-emoji,.go-emoji,.ck-emoji,.day-emoji,.bd-emoji,.big-emoji,.wk-emoji,.plan-emoji,.fg-emoji,.bg-emoji',
    /* 手机端：所有 *-emoji 展示元素；状态/心情表情属于用户表达，排除 */
    '[class*="-emoji"]:not(.st-pr-emoji):not(.st-prev-emoji):not(.st-detail-emoji):not(.emoji-pick)',
    '[class$="emoji"]:not(.st-pr-emoji):not(.st-prev-emoji):not(.st-detail-emoji):not(.emoji-pick)',
    /* emoji 选择器按钮：只换显示，data-e / data-emoji 值保持不变 */
    '.emoji-pick button[data-e]',
  ].join(',');
  function paintEmojiIcons(root) {
    if (!window.FP_ICON_OPTIONS || !window.FP_ICON_OPTIONS.replaceEmoji) return;
    (root || document).querySelectorAll(EMOJI_SELECTOR).forEach((el) => {
      if (el.dataset.emojiPainted || el.querySelector('svg')) return;
      const raw = (el.textContent || '').trim();
      const name = emojiName(raw);
      if (!name) return;
      el.dataset.emojiPainted = '1';
      el.title = raw;
      el.innerHTML = iconSvg(name, 'emoji-ico');
    });
  }

  const names = Object.keys(PIX);
  window.__ICONS = PIX;
  window.icon = icon;
  window.FP_ICONS = { PIX, CATEGORIES, EMOJI, names, pixPath, iconSvg, icon,
                      emojiName, iconForEmoji, paintEmojiIcons };
  window.FP_ICON_OPTIONS = { replaceEmoji: true };

  if (typeof document !== 'undefined') {
    const st = document.createElement('style');
    st.textContent = '[data-emoji-painted] svg{width:1em;height:1em;display:inline-block;vertical-align:-0.12em}';
    (document.head || document.documentElement).appendChild(st);
    const start = () => {
      paintEmojiIcons(document);
      if (typeof MutationObserver === 'undefined') return;
      let queued = false;
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; paintEmojiIcons(document); });
      }).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})();
'''

HTML_TEMPLATE = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>脚印 · 图标库（__COUNT__ 枚）</title>
<style>
  @font-face { font-family: FP; src: url('/fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2') format('woff2'); }
  * { box-sizing: border-box; }
  body { margin: 0; background: #FAF3E3; color: #46382B; font-family: FP, "Courier New", monospace;
         background-image: radial-gradient(#E2DEC9 1px, transparent 1px); background-size: 9px 9px; }
  header { padding: 28px 32px 18px; border-bottom: 2px solid #D8C9A6; background: #FFFDF6; }
  h1 { margin: 0 0 6px; font-size: 24px; }
  .sub { color: #6E5C46; font-size: 12px; line-height: 1.9; }
  .tools { padding: 14px 32px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  input, select { font: inherit; font-size: 12px; padding: 7px 10px; background: #FFFDF6;
                  border: 2px solid #3B2E22; color: #46382B; }
  .sizes button { font: inherit; font-size: 12px; padding: 7px 12px; margin-right: 6px;
                  border: 2px solid #3B2E22; background: #FFFDF6; color: #46382B; cursor: pointer; }
  .sizes button.on { background: #3F7C37; color: #fff; }
  main { padding: 8px 32px 60px; }
  h2 { font-size: 12px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px dashed #D8C9A6; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
  .cell { background: #FFFDF6; border: 2px solid #D8C9A6; box-shadow: 0 3px 0 #E9DFC7;
          padding: 12px 8px 8px; text-align: center; }
  .cell .art { display: flex; justify-content: center; align-items: center; height: 52px; color: #3B2E22; }
  .cell svg { width: var(--sz, 32px); height: var(--sz, 32px); display: block; }
  .cell .nm { font-size: 12px; margin-top: 8px; word-break: break-all; }
  .cell .em { font-size: 12px; color: #8A7A62; }
  .cell.hidden { display: none; }
  .row2 { display: flex; justify-content: center; gap: 8px; margin-top: 6px; color: #6E5C46; }
  .row2 svg { width: 16px; height: 16px; }
  .row2 svg.big { width: 24px; height: 24px; }
  footer { padding: 20px 32px; border-top: 2px solid #D8C9A6; color: #6E5C46; font-size: 12px; line-height: 1.9; }
</style>
</head>
<body>
<header>
  <h1>脚印 · 统一图标库</h1>
  <div class="sub">共 __COUNT__ 枚 · 16×16 网格 · 单色 currentColor · crispEdges 渲染<br/>
  唯一来源 <b>/js/icons.js</b>，独立 SVG 在 <b>/icons/*.svg</b>，手机端与桌面工作台共用。</div>
</header>
<div class="tools">
  <input id="q" type="search" placeholder="搜索名称或 emoji…" size="26"/>
  <select id="cat"><option value="">全部分类</option></select>
  <div class="sizes"><button data-sz="16">16</button><button data-sz="24">24</button><button data-sz="32" class="on">32</button><button data-sz="48">48</button></div>
</div>
<main id="main"></main>
<footer>规范见仓库根目录 ICONS.md。状态/心情表情属于用户内容，保留 emoji，不纳入图标库。</footer>
<script>
const PIX = __PIX__;
const CAT = __CAT__;
const EMOJI = __EMOJI__;
const rev = {};
Object.keys(EMOJI).forEach(e => { if (!rev[EMOJI[e]]) rev[EMOJI[e]] = e; });
function pixPath(rows) {
  const rects = [];
  String(rows).split('/').forEach((row, y) => {
    if (!row || row === '-') return;
    row.split(',').forEach(run => {
      const m = run.trim().match(/^(\d+)-(\d+)$/);
      if (m) rects.push([+m[1], y, +m[2] - +m[1] + 1]);
    });
  });
  if (!rects.length) return '';
  let minX = 16, maxX = 0, minY = 16, maxY = 0;
  for (const [x, y, w] of rects) { minX = Math.min(minX, x); maxX = Math.max(maxX, x + w - 1); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const dx = Math.floor((16 - (maxX - minX + 1)) / 2) - minX, dy = Math.floor((16 - (maxY - minY + 1)) / 2) - minY;
  return rects.map(([x, y, w]) => `M${x + dx} ${y + dy}h${w}v1h-${w}Z`).join('');
}
function svg(name, cls) {
  return `<svg class="${cls || ''}" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="${pixPath(PIX[name])}"/></svg>`;
}
const main = document.getElementById('main');
const catSel = document.getElementById('cat');
Object.keys(CAT).forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c + ' (' + CAT[c].length + ')'; catSel.appendChild(o); });
const cells = [];
Object.keys(CAT).forEach(cat => {
  const h = document.createElement('h2'); h.textContent = cat + ' · ' + CAT[cat].length; main.appendChild(h);
  const grid = document.createElement('div'); grid.className = 'grid'; main.appendChild(grid);
  CAT[cat].filter(n => PIX[n]).forEach(name => {
    const el = document.createElement('div'); el.className = 'cell'; el.dataset.name = name; el.dataset.cat = cat;
    el.innerHTML = `<div class="art">${svg(name)}</div><div class="row2">${svg(name)}${svg(name, 'big')}</div>
      <div class="nm">${name}</div><div class="em">${rev[name] || ''}</div>`;
    grid.appendChild(el); cells.push(el);
  });
});
function filter() {
  const q = document.getElementById('q').value.trim().toLowerCase(), c = catSel.value;
  cells.forEach(el => {
    const em = (rev[el.dataset.name] || '').toLowerCase();
    const ok = (!q || el.dataset.name.includes(q) || em.includes(q)) && (!c || el.dataset.cat === c);
    el.classList.toggle('hidden', !ok);
  });
  document.querySelectorAll('h2').forEach(h => {
    const g = h.nextElementSibling;
    h.style.display = [...g.children].some(x => !x.classList.contains('hidden')) ? '' : 'none';
  });
}
document.getElementById('q').addEventListener('input', filter);
catSel.addEventListener('change', filter);
document.querySelectorAll('.sizes button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.sizes button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  document.documentElement.style.setProperty('--sz', b.dataset.sz + 'px');
}));
</script>
</body>
</html>
'''

if __name__ == '__main__':
    main()
