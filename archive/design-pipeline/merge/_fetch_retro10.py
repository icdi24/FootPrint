# -*- coding: utf-8 -*-
# 下载 10 个精选真实像素图标 (MIT/开源 pixelarticons / streamline-pixel / withicons-retro)
import urllib.request, os, json

BASE = r'D:\PersonalHub\projects\tcamp\小组项目'
SVG_DIR = os.path.join(BASE, '_retro_svg')
os.makedirs(SVG_DIR, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0'}

ICONS_10 = [
    ('boba', 'withicons-retro', 'cup-soda'),
    ('camera', 'pixelarticons', 'camera'),
    ('run', 'withicons-retro', 'person-running'),
    ('tooth', 'streamline-pixel', 'health-dentistry-tooth'),
    ('book', 'pixelarticons', 'book-open'),
    ('gamepad', 'pixelarticons', 'gamepad'),
    ('headphone', 'pixelarticons', 'headphone'),
    ('cake', 'streamline-pixel', 'food-drink-desert-cake'),
    ('bike', 'streamline-pixel', 'transportation-bicycle'),
    ('cat', 'streamline-pixel', 'pet-animals-cat'),
]

for key, prefix, name in ICONS_10:
    out = os.path.join(SVG_DIR, f'{key}.svg')
    url = f'https://api.iconify.design/{prefix}/{name}.svg'
    try:
        req = urllib.request.Request(url, headers=UA)
        data = urllib.request.urlopen(req, timeout=15).read()
        open(out, 'wb').write(data)
        print(f'OK {key} ({prefix}:{name}) -> {len(data)} bytes')
    except Exception as e:
        print(f'FAIL {key}: {e}')
