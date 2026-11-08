# -*- coding: utf-8 -*-
# 10 个核心高频图标：潮玩像素风 (32x32 纯手工严谨点阵)
# 风格契合：Cozy Arcade 街机潮玩、1px 纯正暗棕硬描边、无任何 AI 虚化与杂色
import os
from PIL import Image, ImageDraw, ImageFont

N = 32

# 统一基础色
OUTLINE = (40, 30, 25)  # 经典暗黑棕描边
WHITE = (255, 255, 255) # 纯白高光

# 10 个图标的调色板与网格定义
ICONS = {}

# ==============================================================
# 1. 奶茶 (boba) - 左右严格居中，元气吸管 + 焦糖奶茶 + 饱满波霸珍珠
# ==============================================================
ICONS['boba'] = {
    'title': '波霸奶茶',
    'badge_bg': (255, 241, 237), # 马卡龙肉粉
    'pal': {
        '.': None,
        'k': OUTLINE,
        'd': (30, 20, 16),
        'D': (75, 52, 42),
        'w': WHITE,
        'p': (245, 65, 65),     # 元气红吸管
        'P': (195, 35, 35),
        'l': (248, 202, 160),    # 奶茶亮部
        'm': (226, 155, 100),    # 焦糖奶茶色
        's': (185, 115, 65),     # 阴影
        'c': (215, 240, 252),    # 冰感杯盖
        'C': (160, 210, 240),
    },
    'grid': [
        "................................",
        "................................",
        "...............pk...............",
        "..............ppk...............",
        "..............ppk...............",
        "..............ppk...............",
        "..............ppk...............",
        "..............Ppk...............",
        "..........kkkkkkkkkkkk..........",
        ".........kccccwcccccccCkk.......",
        "........kccccwwccccccccCkk......",
        "......kkkkkkkkkkkkkkkkkkkkkk....",
        ".......kCcccccccccccccccccck....",
        ".......kwwwwwwwwwwwwwwwwwwwk....",
        ".......klllmwmmmmmmmmmmmmmsk....",
        ".......klllmwmmmmmmmmmmmmmsk....",
        "........klllmwmmmmmmmmmmmmsk....",
        "........klllmwmmmmmmmmmmmmsk....",
        "........klllmwmmmmmmmmmmmmsk....",
        "........klllmwmmmmmmmmmmmmsk....",
        ".........klllmwmmmmmmmmmmsk.....",
        ".........klllmwmmmmmmmmmmsk.....",
        ".........klwkdDkkmmkdDkkmsk.....",
        "..........kwwkdDkkkdDkddsk......",
        "..........kddkkkdDkkddddsk......",
        "..........kddkdDkkdDkdddsk......",
        "..........kddkkkddkkddddsk......",
        "...........kkkkkkkkkkkk.........",
        "................................",
        "................................",
        "................................",
        "................................",
    ]
}

# ==============================================================
# 2. 背单词 (books) - 三本彩色微缩立体书叠放 (红、绿、蓝封面 + 白书页)
# ==============================================================
ICONS['books'] = {
    'title': '背单词',
    'badge_bg': (234, 247, 238), # 薄荷浅绿
    'pal': {
        '.': None,
        'k': OUTLINE,
        'w': WHITE,
        'r': (240, 80, 80),   # 红书皮
        'R': (190, 45, 45),
        'g': (46, 204, 113),  # 绿书皮
        'G': (30, 150, 80),
        'b': (52, 152, 219),  # 蓝书皮
        'B': (35, 110, 170),
        'p': (245, 235, 220), # 书页纸色
        'y': (255, 210, 50),  # 书签金黄
    },
    'grid': [
        "................................",
        "................................",
        "................................",
        "..........kkkkkkkkkk............",
        ".........krrrrrrrrrrk...........",
        "........krrrrrrwrrrrrk..........",
        ".......krrrrrrrrrrrrrk..........",
        "......krrrrrrrrrrrrrk...........",
        ".....kkkkkkkkkkkkkkk............",
        ".....kppppppppppppk.............",
        ".....kkkkkkkkkkkkk..............",
        "........kkkkkkkkkkkkkk..........",
        ".......kggggggggggggggk.........",
        "......kggggggwggggggggk.........",
        ".....kggggggggggggggggk.........",
        "....kggggggggggggggggk..........",
        "...kkkkkkkkkkkkkkkkkk...........",
        "...kpppppppppppppppk............",
        "...kkkkkkkkkkkkkkkk.............",
        "......kkkkkkkkkkkkkkkkkk........",
        ".....kbbbbbbbbbbbbbbbbbbk.......",
        "....kbbbbbbwbbbbbbbbbbbbk.......",
        "...kbbbbbbbbbbbbbbbbbbbbk.......",
        "..kbbbbbbbbbbbbbbbbbbbbk........",
        "..kbbbbbbbbbbkkybbbbbbk.........",
        "..kkkkkkkkkkkkkykkkkkk..........",
        "..kpppppppppppkykppppk..........",
        "..kppppppppppppyykpppk..........",
        "..kkkkkkkkkkkkkkkkkkk...........",
        "................................",
        "................................",
        "................................",
    ]
}

# ==============================================================
# 3. 练琴 (piano) - 经典立体三角钢琴 / 双层琴键键盘
# ==============================================================
ICONS['piano'] = {
    'title': '练琴',
    'badge_bg': (243, 239, 251), # 薰衣草浅紫
    'pal': {
        '.': None,
        'k': OUTLINE,
        'w': WHITE,
        'p': (155, 89, 182), # 钢琴紫漆
        'P': (110, 55, 135),
        'b': (28, 20, 18),   # 黑键
        'g': (235, 225, 220),# 白键微影
    },
    'grid': [
        "................................",
        "................................",
        "................................",
        "................................",
        ".........kkkkkkkkkkkkkkk........",
        ".......kkppppppppppppppk........",
        "......kppppppppppppppppk........",
        ".....kppwppppppppppppppk........",
        "....kppwwppppppppppppppk........",
        "...kppwwwwpppppppppppppkkk......",
        "...kpppppppppppppppppppppk......",
        "...kpppppppppppppppppppppk......",
        "...kpppppppppppppppppppppk......",
        "...kkkkkkkkkkkkkkkkkkkkkkk......",
        "...kwwwwwwwwwwwwwwwwwwwwwk......",
        "...kwbwwbwwbwwbwwbwwbwwbwk......",
        "...kwbwwbwwbwwbwwbwwbwwbwk......",
        "...kwbwwbwwbwwbwwbwwbwwbwk......",
        "...kwbwwbwwbwwbwwbwwbwwbwk......",
        "...kwwwwwwwwwwwwwwwwwwwwwk......",
        "...kgggggggggggggggggggggk......",
        "...kkkkkkkkkkkkkkkkkkkkkkk......",
        "....kPk...............kPk.......",
        "....kPk...............kPk.......",
        "....kPk...............kPk.......",
        "....kPk...............kPk.......",
        "....kPk...............kPk.......",
        "....kkk...............kkk.......",
        "................................",
        "................................",
        "................................",
        "................................",
    ]
}

# ==============================================================
# 4. 早睡 (sleep) - 温暖弯月亮 + 渐变三连星梦 Zzz
# ==============================================================
ICONS['sleep'] = {
    'title': '早睡',
    'badge_bg': (235, 245, 251), # 清透浅蓝
    'pal': {
        '.': None,
        'k': OUTLINE,
        'w': WHITE,
        'y': (255, 210, 60),  # 月亮明黄
        'Y': (230, 170, 30),
        'b': (75, 160, 245),  # Zzz 湖蓝
        'B': (40, 115, 200),
        's': (255, 235, 120), # 月亮高光
    },
    'grid': [
        "................................",
        "................................",
        "........................kkkkk...",
        ".......................kbbbbbk..",
        "......................kbbbbbbk..",
        "...........................kbk..",
        "..........................kbk...",
        "............kkkk.........kbk....",
        "..........kksssskk......kbbbbbk.",
        ".........ksssyysssk....kbbbbbbk.",
        "........kssyyyyyssk.....kkkkk...",
        ".......ksyyyyyyyyyk.............",
        ".......ksyykkkkkkk......kkkk....",
        "......ksyyk............kbbbbk...",
        "......ksyyk...............kbk...",
        "......ksyyk..............kbk....",
        "......ksyyk.............kbbbbk..",
        "......ksyyk.............kbbbbk..",
        "......ksyyk..............kkkk...",
        ".......ksyyk....................",
        ".......ksyykkkkk................",
        "........kssyyyyk................",
        ".........kssyyyk........kkkk....",
        "..........kkYYkk.......kbbbbk...",
        "............kk..........kkbk....",
        ".......................kbbbbk...",
        "........................kkkk....",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
    ]
}

# ==============================================================
# 5. 喝水 (water) - 饱满晶莹水滴，深浅海蓝层次 + 闪亮高光
# ==============================================================
ICONS['water'] = {
    'title': '喝水',
    'badge_bg': (235, 245, 251), # 清透浅蓝
    'pal': {
        '.': None,
        'k': OUTLINE,
        'w': WHITE,           # 强高光
        'c': (175, 230, 255), # 极浅天蓝
        'b': (85, 185, 245),  # 亮蓝
        'm': (45, 135, 220),  # 主海蓝
        'd': (25, 95, 180),   # 深海蓝暗部
    },
    'grid': [
        "................................",
        "................................",
        "................................",
        "...............kk...............",
        "..............kcck..............",
        "..............kcck..............",
        ".............kcccbk.............",
        ".............kcwwbk.............",
        "............kcwwwbbk............",
        "............kcwwwbbk............",
        "...........kccwwbbbmk...........",
        "...........kccwwbbbmk...........",
        "..........kcccwbbbbmmk..........",
        "..........kcccwbbbbmmk..........",
        ".........kccccbbbbmmmmk.........",
        ".........kcccbbbbbmmmmk.........",
        "........kcccbbbbbbmmdmmk........",
        "........kcccbbbbbbmmddmk........",
        "........kcbbbbbbbmmmddmk........",
        "........kcbbbbbbbmmmddmk........",
        "........kcbbbbbbbmmmddmk........",
        "........kbbbbbbbbmmmddmk........",
        ".........kbbbbbbmmmddmk.........",
        ".........kbbbbbmmmmddk..........",
        "..........kmmmmmmdddk...........",
        "..........kmmmmmmdddk...........",
        "...........kdddddddk............",
        "............kkkkkkk.............",
        "................................",
        "................................",
        "................................",
        "................................",
    ]
}

# ==============================================================
# 6. 一顿火锅 (hotpot) - 双耳小红锅，红汤翻滚，豆腐丸子香菇点缀
# ==============================================================
ICONS['hotpot'] = {
    'title': '一顿火锅',
    'badge_bg': (252, 237, 240), # 浅粉红
    'pal': {
        '.': None,
        'k': OUTLINE,
        'w': WHITE,
        'r': (230, 70, 70),   # 辣红汤/红锅
        'R': (175, 40, 40),
        'y': (255, 210, 80),  # 丸子/蛋饺
        'g': (65, 195, 90),   # 青菜点缀
        'b': (120, 80, 55),   # 香菇棕
        's': (245, 220, 180), # 豆腐块
        'm': (180, 170, 165), # 锅身金属灰
        'M': (130, 120, 115),
    },
    'grid': [
        "................................",
        "................................",
        "..............w....w............",
        ".............w....w.............",
        "............w....w..............",
        ".............w....w.............",
        "........kkkkkkkkkkkkkkkk........",
        "......kkrmmmmmmmmmmmmmmrkk......",
        "....kkrmm..............mmrkk....",
        "...krmm...kkkkkkkkkkkk...mmrk...",
        "..krm....krrrrrrrrrrrrk....mrk..",
        "..krm...krrrrrrwrrrrrrrk...mrk..",
        "...kkkkkrrrrgyyrrrssrrrrkkkkk...",
        "....kmmmmrrggyyrrssssrrrmmmk....",
        "....kmmmmrrrbbbrrrrrrrrrmmmk....",
        "....kmmwmmrrbbbrrrrwwrrmmmmk....",
        ".....kmmwmmrrrrrrrrrwwrmmmk.....",
        ".....kmmmmmmmmmmmmmmmmmmmmk.....",
        "......kmmmmmmmmmmmmmmmmmmk......",
        "......kmmmmmmmmmmmmmmmmmmk......",
        ".......kmmmmmmmmmmmmmmmmk.......",
        "........kmmmmmmmmmmmmmmk........",
        "........kMmmmmmmmmmmmmMk........",
        ".........kkkkkkkkkkkkkk.........",
        "..........kMkk....kkMk..........",
        "..........kMMk....kMMk..........",
        "..........kkkk....kkkk..........",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
    ]
}

# ==============================================================
# 7. 乐高花束 (flower) - 鲜艳粉色郁金香，带花蕊与绿叶
# ==============================================================
ICONS['flower'] = {
    'title': '乐高花束',
    'badge_bg': (252, 237, 240), # 浅粉红
    'pal': {
        '.': None,
        'k': OUTLINE,
        'w': WHITE,
        'p': (255, 95, 135),  # 郁金香粉红
        'P': (215, 50, 95),   # 阴影深粉
        'l': (255, 165, 195), # 高光粉
        'g': (46, 204, 113),  # 绿叶
        'G': (30, 145, 75),   # 深绿叶
        'y': (255, 215, 60),  # 花蕊金黄
    },
    'grid': [
        "................................",
        "................................",
        "................................",
        "...........kkk....kkk...........",
        "..........kllpk..kllpk..........",
        ".........klllllpplllllpk........",
        ".........kllllllppllllpk........",
        "........kllllllpyypllllpk.......",
        "........kllllllpyypllllpk.......",
        "........kllllllppppllllpk.......",
        "........klllllpppppplllpk.......",
        ".........klllppppppppllpk.......",
        ".........kllpppppppppplpk.......",
        "..........kpppppppppppk.........",
        "..........kpppppppppppk.........",
        "...........kPppppppppk..........",
        "............kPPPPPPPk...........",
        ".............kkkGkkk............",
        "...............kGk..............",
        ".....kk........kGk..............",
        "....kglk.......kGk........kk....",
        "...kgllgk......kGk.......kggk...",
        "...kglllgk.....kGk......kgllgk..",
        "....kglllgk....kGk.....kggllgk..",
        ".....kggllgk...kGk....kggllgk...",
        "......kkgglgkk.kGk..kkgglgkk....",
        "........kkggllkkGkkgllggkk......",
        "..........kkgggGkGgggkk.........",
        "............kkkGGkkkk...........",
        "...............kGk..............",
        "...............kkk..............",
        "................................",
    ]
}

# ==============================================================
# 8. 蓝牙耳机 (headphone) - 头戴式复古无线耳机，银白金属耳罩 + 柔软皮质
# ==============================================================
ICONS['headphone'] = {
    'title': '蓝牙耳机',
    'badge_bg': (235, 245, 251), # 清透浅蓝
    'pal': {
        '.': None,
        'k': OUTLINE,
        'w': WHITE,           # 金属高光
        'm': (220, 225, 230), # 银白金属
        'M': (160, 170, 180), # 暗金属
        'b': (52, 152, 219),  # 动感蓝耳罩
        'B': (35, 110, 170),
        's': (65, 75, 85),    # 耳垫软垫深灰
    },
    'grid': [
        "................................",
        "................................",
        "...........kkkkkkkkkk...........",
        "........kkkkmwwwwwwmk.kk........",
        "......kkmmmmmmmmmmmmmmkkk.......",
        ".....kmmmmmmmmmmmmmmmmmmmk......",
        "....kmmkkkkkkkkkkkkkkkmmmmk.....",
        "...kmmk...............kmmmmk....",
        "...kmk.................kmmmk....",
        "..kmk...................kmmk....",
        "..kmk...................kmmk....",
        ".kMMk...................kMMk....",
        ".kMMk...................kMMk....",
        ".kkkk...................kkkk....",
        "kbbbkk.................kbbbkk...",
        "kbbwbk.................kbbwbk...",
        "kbbwwbk...............kbbwwbk...",
        "kbbwwwk...............kbbwwwk...",
        "kbbwwwk...............kbbwwwk...",
        "kbbwbk.................kbbwbk...",
        "kbbbkk.................kbbbkk...",
        "kssssk.................kssssk...",
        "kssssk.................kssssk...",
        "kssssk.................kssssk...",
        "kssssk.................kssssk...",
        "kssssk.................kssssk...",
        ".kkkk...................kkkk....",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
    ]
}

# ==============================================================
# 9. 运动鞋 (shoe) - 经典复古球鞋侧视，白胶底 + 宝蓝鞋身 + 火红点缀
# ==============================================================
ICONS['shoe'] = {
    'title': '运动鞋',
    'badge_bg': (255, 241, 237), # 马卡龙肉粉
    'pal': {
        '.': None,
        'k': OUTLINE,
        'w': WHITE,           # 纯白中底与Logo
        'b': (45, 110, 220),  # 亮蓝鞋面
        'B': (25, 75, 170),
        'r': (235, 60, 60),   # 醒目红后跟
        'y': (255, 205, 45),  # 柠檬黄鞋舌/带
        'g': (200, 160, 120), # 生胶大底
    },
    'grid': [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "............kkkkk...............",
        "...........kyyyykkk.............",
        "..........kyyyyykwwk............",
        ".........kkkyyyykwwwk...........",
        "........krrrkyyykwwwwk..........",
        ".......krrrrrkyykwwwwwk.........",
        "......krrrrrrkbbkwwwwwwk........",
        "......krrrrrkkbbkwwwwwwwk.......",
        ".....krrrrrkkbbbkwwwwwwwwk......",
        "....krrrrrkkbbbbkwwwwwwwwwk.....",
        "....krrrrkkbbbbbkwwwwwwwwwk.....",
        "...krrrrrkkbbbbbbkwwwwwwwwk.....",
        "..krrrrrrkbbbbbbbbkwwwwwwk......",
        "..krrrrrkbbbbwbbbbkwwwwwwk......",
        "..krrrrrkbbwwwwwbbkwwwwwk.......",
        "..krrrrkbbwwwwwwwbkwwwwwk.......",
        "..krrrrkbbwwwwwwwbbkwwwwk.......",
        ".kkkkkkkbbwwwwwwwbbkkkkkkk......",
        ".kwwwwwwwwwwwwwwwwwwwwwwwk......",
        ".kwwwwwwwwwwwwwwwwwwwwwwwkk.....",
        ".kwwwwwwwwwwwwwwwwwwwwwwwwwk....",
        ".kkkkkkkkkkkkkkkkkkkkkkkkkkk....",
        "..kggg..kggg..kggg..kggg..k.....",
        "..kkkk..kkkk..kkkk..kkkk..k.....",
        "................................",
        "................................",
        "................................",
    ]
}

# ==============================================================
# 10. 复古相机 (camera) - 经典旁轴相机，银黑机械感 + 镀膜大镜头
# ==============================================================
ICONS['camera'] = {
    'title': '复古相机',
    'badge_bg': (249, 249, 249), # 极简灰白
    'pal': {
        '.': None,
        'k': OUTLINE,
        'w': WHITE,           # 镜头反光高光
        'm': (225, 230, 235), # 银色顶盖
        'M': (170, 180, 190),
        'b': (50, 42, 38),    # 荔枝皮暗黑机身
        'c': (85, 175, 245),  # 镜头镀膜蓝
        'C': (40, 110, 185),  # 镜头深蓝
        'r': (235, 60, 60),   # 红色可乐标
    },
    'grid': [
        "................................",
        "................................",
        "................................",
        "..........kkk...................",
        ".........krrrk..................",
        ".........krrrk..................",
        "....kkkkkkkkkkkkkkkkkkkkkk......",
        "...kmmmmmmmmmmmmmmmmmmmmmmk.....",
        "...kmmkkmmmmmmmmkwwwwkmmmmk.....",
        "...kmmkkmmmmmmmmkwwwwkmmmmk.....",
        "...kkkkkkkkkkkkkkkkkkkkkkkk.....",
        "...kbbbbbbbbbbbbbbbbbbbbbbk.....",
        "...kbbbbbbkkkkkkkkbbbbbbbbk.....",
        "...kbbbbkkcccccccckkbbbbbbk.....",
        "...kbbbkcwwwwccccccckbbbbbk.....",
        "...kbbkccwwwwwccccccckbbbbk.....",
        "...kbbkcww..wwwcccccckbbbbk.....",
        "...kbbkcw....wwcccccckbbbbk.....",
        "...kbbkc......wcccccckbbbbk.....",
        "...kbbkcc....ccCCCCCCkbbbbk.....",
        "...kbbkcccccccCCCCCCCkbbbbk.....",
        "...kbbbkkcccccCCCCCCkkbbbbk.....",
        "...kbbbbbbkkkkkkkkbbbbbbbbk.....",
        "...kbbbbbbbbbbbbbbbbbbbbbbk.....",
        "...kkkkkkkkkkkkkkkkkkkkkkkk.....",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
    ]
}

# 校验网格规格
for key, data in ICONS.items():
    g = data['grid']
    assert len(g) == 32, f'{key} has {len(g)} rows'
    for r_idx, row in enumerate(g):
        assert len(row) == 32, f'{key} row {r_idx} len is {len(row)}'

print(f"Validated all {len(ICONS)} handcrafted pixel grids successfully!")

# 导出单图、高清精灵与组合大卡片展示图
OUT_DIR = r'D:\PersonalHub\projects\tcamp\小组项目\public\icons_trendy'
os.makedirs(OUT_DIR, exist_ok=True)

# 组合展示图：两排，每排 5 个，每个带独立马卡龙徽章容器 + 中文名
SHOW_W = 1000
SHOW_H = 460
showcase = Image.new('RGB', (SHOW_W, SHOW_H), (250, 243, 227))
dr_show = ImageDraw.Draw(showcase)

# 羊皮纸点阵
for py in range(0, SHOW_H, 14):
    for px in range(0, SHOW_W, 14):
        dr_show.point((px, py), fill=(225, 215, 195))

try:
    font_title = ImageFont.truetype('msyhbd.ttc', 22)
    font_sub = ImageFont.truetype('msyh.ttc', 13)
    font_label = ImageFont.truetype('msyhbd.ttc', 15)
except:
    font_title = font_sub = font_label = None

dr_show.text((36, 20), "前 10 个高频图标 · 潮玩像素风纯手工精绘完成品", fill=(40, 30, 25), font=font_title)
dr_show.text((36, 54), "32×32 纯手工点阵 · 1px 极净硬轮廓 · 马卡龙色块微缩潮玩质感 · 100% 绝无 AI 模糊脏边", fill=(130, 110, 95), font=font_sub)

keys = list(ICONS.keys())
for i, key in enumerate(keys):
    item = ICONS[key]
    pal = item['pal']
    grid = item['grid']
    
    # 1. 32x32 裸图
    im32 = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    for y in range(N):
        for x in range(N):
            c = pal.get(grid[y][x])
            if c: im32.putpixel((x, y), (*c, 255))
    im32.save(os.path.join(OUT_DIR, f'{key}_32.png'))
    
    # 2. 256x256 高清点阵图
    im256 = im32.resize((256, 256), Image.NEAREST)
    im256.save(os.path.join(OUT_DIR, f'{key}_256.png'))
    
    # 3. 组合展示徽章 (130x130)
    col = i % 5
    row = i // 5
    ox = 36 + col * 190
    oy = 90 + row * 175
    
    badge_bg = item['badge_bg']
    # 投影
    dr_show.rounded_rectangle([ox + 3, oy + 3, ox + 143, oy + 143], radius=28, fill=(40, 30, 25))
    # 主卡片
    dr_show.rounded_rectangle([ox, oy, ox + 140, oy + 140], radius=28, fill=badge_bg, outline=(40, 30, 25), width=3)
    
    # 贴入点阵 (104x104)
    sprite = im32.resize((104, 104), Image.NEAREST)
    showcase.paste(sprite, (ox + 18, oy + 18), sprite)
    
    # 标签
    label_text = item['title']
    dr_show.text((ox + 70 - len(label_text)*8, oy + 146), label_text, fill=(40, 30, 25), font=font_label)

out_showcase = r'D:\PersonalHub\projects\tcamp\小组项目\public\top10_trendy_showcase.png'
showcase.save(out_showcase)
print("Saved final top 10 showcase image to:", out_showcase)
