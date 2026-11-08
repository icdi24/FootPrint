# -*- coding: utf-8 -*-
# 下载 game-icons SVG -> 光栅化 512 -> 降采样 32x32 -> 多色量化 -> 输出像素网格
import os, sys, json, io, urllib.request, time
sys.path.insert(0, r'D:\PersonalHub\projects\tcamp\小组项目')
from _gi_map import MAP
from PIL import Image
import numpy as np

BASE = r'D:\PersonalHub\projects\tcamp\小组项目'
RAW = os.path.join(BASE, '_gi_svg')
os.makedirs(RAW, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120'}
N = 32

def download():
    for k, v in MAP.items():
        p = os.path.join(RAW, f'{k}.svg')
        if os.path.exists(p) and os.path.getsize(p) > 100:
            continue
        for attempt in range(3):
            try:
                req = urllib.request.Request(f'https://api.iconify.design/game-icons/{v}.svg', headers=UA)
                d = urllib.request.urlopen(req, timeout=25).read()
                open(p, 'wb').write(d)
                break
            except Exception as e:
                if attempt == 2: print('DL FAIL', k, e)
                time.sleep(1.2)

def svg_to_img(path, size=512):
    """用 cairosvg 或回退：把 path 用 PIL 画（简易）"""
    try:
        import cairosvg
        png = cairosvg.svg2png(url=path, output_width=size, output_height=size)
        from io import BytesIO
        return Image.open(BytesIO(png)).convert('RGBA')
    except Exception:
        return None

if __name__ == '__main__':
    download()
    have = [f for f in os.listdir(RAW) if f.endswith('.svg')]
    print('downloaded', len(have), '/', len(MAP))
    # 检查 cairosvg
    try:
        import cairosvg
        print('cairosvg OK', cairosvg.__version__ if hasattr(cairosvg,'__version__') else '')
    except ImportError:
        print('cairosvg MISSING')
