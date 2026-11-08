# -*- coding: utf-8 -*-
# 手工精心点阵：32x32 潮玩像素风 · 波霸珍珠奶茶 (Trendy Boba Milk Tea)
import os
from PIL import Image, ImageDraw

N = 32

# 调色板：潮玩高饱和复古玩具色
PAL = {
    '.': None,                   # 透明
    'k': (40, 30, 25),           # 轮廓深黑棕
    'd': (30, 20, 16),           # 珍珠深黑
    'D': (65, 45, 35),           # 珍珠微光
    'w': (255, 255, 255),        # 纯白高光/反光
    'p': (168, 92, 222),         # 吸管紫
    'P': (130, 65, 185),         # 吸管暗部紫
    'l': (248, 202, 160),        # 奶茶亮色
    'm': (226, 155, 100),        # 奶茶主体焦糖奶茶色
    's': (190, 120, 70),         # 奶茶暗部色
    'c': (210, 238, 252),        # 杯盖/杯口透亮浅蓝
    'C': (165, 215, 245),        # 杯盖阴影蓝
}

# 32 行 x 32 列
# 顶部吸管 (y=2..8)
# 杯盖/封膜 (y=9..12)
# 梯形杯身 (y=13..28)
# 杯底珍珠 (y=23..27)
GRID = [
    "................................", # 0
    "................................", # 1
    "...............pk...............", # 2 吸管斜切口
    "..............ppk...............", # 3
    "..............ppk...............", # 4
    "..............ppk...............", # 5 吸管杆
    "..............ppk...............", # 6
    "..............ppk...............", # 7
    "..............Ppk...............", # 8 插入杯盖处
    "..........kkkkkkkkkkkk..........", # 9 杯盖顶圆弧
    ".........kccccwcccccccCkk.......", # 10 杯盖穹顶
    "........kccccwwccccccccCkk......", # 11
    ".......kkkkkkkkkkkkkkkkkkkk.....", # 12 杯盖凸沿
    "........kCcccccccccccccccck.....", # 13 杯口封膜
    "........kwwwwwwwwwwwwwwwwwk.....", # 14 奶盖/顶层高光
    ".........klllmwmmmmmmmmmsk......", # 15 杯身上部
    ".........klllmwmmmmmmmmmsk......", # 16
    ".........klllmwmmmmmmmmmsk......", # 17 侧面整列高光
    "..........kllmwmmmmmmmmmsk......", # 18 逐渐向内收腰
    "..........kllmwmmmmmmmmmsk......", # 19
    "..........kllmwmmmmmmmmmsk......", # 20
    "..........kllmwmmmmmmmmmsk......", # 21
    "...........kllwmmmmmmmmsk.......", # 22
    "...........klwkdDkmmkdDsk.......", # 23 浮现波霸珍珠
    "...........kwwkdDkmmkdDsk.......", # 24
    "............kkddkkkdDddk........", # 25 珍珠堆叠
    "............kddkdDkdddsk........", # 26
    "............kddkkkddddsk........", # 27
    ".............kkkkkkkkkk.........", # 28 杯底圆角封底
    "................................", # 29
    "................................", # 30
    "................................", # 31
]

def render_boba():
    # 1. 纯像素图 32x32 放大展示 (8x 缩放 -> 256x256)
    scale = 10
    img_sprite = Image.new('RGBA', (N * scale, N * scale), (0, 0, 0, 0))
    for y in range(N):
        for x in range(N):
            ch = GRID[y][x]
            col = PAL.get(ch)
            if col:
                for dy in range(scale):
                    for dx in range(scale):
                        img_sprite.putpixel((x * scale + dx, y * scale + dy), (*col, 255))
    
    # 2. 模拟真实 App UI 卡片效果对比图：
    # 背景：羊皮纸底色 + 点阵
    # 容器：圆角方块 (Squircle Badge) + 2px 纯黑描边 + 马卡龙粉底色 (#FFF1ED)
    # 右侧：文字 "奶茶" / "250 分 ≈ ¥25" / "周末的快乐水" + 街机风 "兑换" 按钮
    CARD_W = 680
    CARD_H = 340
    canvas = Image.new('RGB', (CARD_W, CARD_H), (250, 243, 227))
    dr = ImageDraw.Draw(canvas)
    
    # 画羊皮纸微点阵
    for py in range(0, CARD_H, 14):
        for px in range(0, CARD_W, 14):
            dr.point((px, py), fill=(225, 215, 195))
            
    # 卡片外框 (白底 + 纯黑硬边 + 硬投影)
    cx, cy, cw, ch = 30, 40, 620, 160
    # 硬投影 4px
    dr.rounded_rectangle([cx + 3, cy + 3, cx + cw + 3, cy + ch + 3], radius=24, fill=(40, 30, 25))
    # 卡片白底
    dr.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=24, fill=(255, 253, 246), outline=(40, 30, 25), width=3)
    
    # 潮玩图标徽章容器 (大圆角 + 马卡龙肉粉底 + 黑描边)
    bx, by, bw, bh = cx + 20, cy + 24, 112, 112
    dr.rounded_rectangle([bx, by, bx + bw, by + bh], radius=26, fill=(255, 241, 237), outline=(40, 30, 25), width=3)
    
    # 放置 32x32 精致奶茶像素精灵到方块正中央 (缩放到约 84x84)
    sprite_fit = img_sprite.resize((84, 84), Image.NEAREST)
    canvas.paste(sprite_fit, (bx + 14, by + 14), sprite_fit)
    
    # 加载系统字体绘制文字
    try:
        from PIL import ImageFont
        font_title = ImageFont.truetype('msyhbd.ttc', 26)
        font_price = ImageFont.truetype('msyhbd.ttc', 18)
        font_desc = ImageFont.truetype('msyh.ttc', 15)
        font_btn = ImageFont.truetype('msyhbd.ttc', 18)
    except:
        font_title = font_price = font_desc = font_btn = None
        
    tx = bx + bw + 24
    dr.text((tx, cy + 32), "奶茶 (波霸珍珠奶茶)", fill=(40, 30, 25), font=font_title)
    dr.text((tx, cy + 76), "250 分 ≈ ¥25", fill=(210, 105, 30), font=font_price)
    dr.text((tx, cy + 110), "周末的快乐水 · 潮玩像素实装预览", fill=(130, 110, 95), font=font_desc)
    
    # 右侧兑换按钮 (街机高亮绿 + 黑色描边 + 硬投影)
    btn_w, btn_h = 110, 52
    btn_x = cx + cw - btn_w - 24
    btn_y = cy + (ch - btn_h) // 2
    dr.rounded_rectangle([btn_x + 2, btn_y + 2, btn_x + btn_w + 2, btn_y + btn_h + 2], radius=14, fill=(40, 30, 25))
    dr.rounded_rectangle([btn_x, btn_y, btn_x + btn_w, btn_y + btn_h], radius=14, fill=(39, 201, 114), outline=(40, 30, 25), width=3)
    dr.text((btn_x + 36, btn_y + 14), "兑换", fill=(40, 30, 25), font=font_btn)
    
    # 下方展示：放大的 32x32 裸图特写与点阵说明
    dr.text((30, 230), "👇 32×32 纯正手工点阵特写（透明封口膜、弧形杯盖、侧面反光、底部晶莹波霸珍珠）：", fill=(70, 56, 43), font=font_desc)
    
    # 底部放两个：一个原尺寸 32px，一个特写放大 80px
    canvas.paste(img_sprite.resize((70, 70), Image.NEAREST), (30, 260), img_sprite.resize((70, 70), Image.NEAREST))
    canvas.paste(img_sprite.resize((32, 32), Image.NEAREST), (120, 280), img_sprite.resize((32, 32), Image.NEAREST))
    dr.text((170, 285), "← 1:1 实际 32px 原生大小", fill=(120, 100, 85), font=font_desc)

    out_file = r'D:\PersonalHub\projects\tcamp\小组项目\public\trendy_pixel_boba_sample.png'
    canvas.save(out_file)
    print("Saved sample to:", out_file)

if __name__ == '__main__':
    render_boba()
