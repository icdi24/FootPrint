# -*- coding: utf-8 -*-
import os, urllib.request, time

BASE = r'D:\PersonalHub\projects\tcamp\小组项目'
TEST_DIR = os.path.join(BASE, '_test_fix_svg')
os.makedirs(TEST_DIR, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120'}

ICONS_TO_TEST = [
    # Run
    'sprint',
    'running-ninja',
    'run',
    # Gym
    'strong-man',
    'weight-lifting-up',
    'weight',
    # Hotpot
    'hot-meal',
    'bubbling-bowl',
    'noodles',
    'cauldron',
    'bowl-of-rice'
]

for name in ICONS_TO_TEST:
    p = os.path.join(TEST_DIR, f'{name}.svg')
    url = f'https://api.iconify.design/game-icons/{name}.svg'
    try:
        req = urllib.request.Request(url, headers=UA)
        d = urllib.request.urlopen(req, timeout=15).read()
        with open(p, 'wb') as f:
            f.write(d)
        print('Fetched', name)
    except Exception as e:
        print('Failed', name, e)
    time.sleep(0.5)
