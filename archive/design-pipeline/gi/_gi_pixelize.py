# -*- coding: utf-8 -*-
# 512 PNG -> 32x32 像素化 -> 双色 -> 像素网格 JSON
import os, sys, json
from PIL import Image
import numpy as np

BASE = r'D:\PersonalHub\projects\tcamp\小组项目'
PNG = os.path.join(BASE, '_gi_png')
OUT = os.path.join(BASE, '_gi_pixels.json')
sys.path.insert(0, BASE)
from _gi_map import MAP

N = 32
SUPERSAMPLE = 8   # 每格 8x8 采样

# 每个图标的主色/亮色（DESIGN.md 调色板）
COLORS = {
 'gift': ('#B44A40', '#F2B84B'), 'headphone': ('#4E7CB5', '#3B2E22'),
 'watch': ('#8A4E0F', '#F2B84B'), 'shoe': ('#4E7CB5', '#B44A40'),
 'gamepad': ('#6E5C46', '#3F7C37'), 'phone': ('#35608F', '#4E7CB5'),
 'lipstick': ('#B44A40', '#F2B84B'), 'bag': ('#93342B', '#F2B84B'),
 'cake': ('#B44A40', '#F7E7C6'), 'movie': ('#3B2E22', '#FFFDF6'),
 'skateboard': ('#4E7CB5', '#F2B84B'), 'camera': ('#3B2E22', '#6E5C46'),
 'plane': ('#4E7CB5', '#FFFFFF'), 'hotpot': ('#B44A40', '#F2B84B'),
 'chair': ('#7A4A22', '#6E5C46'), 'flower': ('#B44A40', '#3F7C37'),
 'target': ('#B44A40', '#FFFDF6'), 'book': ('#4E7CB5', '#FFFDF6'),
 'run': ('#3F7C37', '#F0C39A'), 'gym': ('#3B2E22', '#E8953C'),
 'meditate': ('#3F7C37', '#F0C39A'), 'sleep': ('#4E7CB5', '#FFFDF6'),
 'piano': ('#3B2E22', '#FFFDF6'), 'art': ('#E8953C', '#3B2E22'),
 'write': ('#F2B84B', '#8A4E0F'), 'tooth': ('#C9BFAE', '#FFFDF6'),
 'apple': ('#B44A40', '#3F7C37'), 'bike': ('#3B2E22', '#4E7CB5'),
 'broom': ('#8A4E0F', '#F2B84B'), 'sunrise': ('#E8953C', '#F2B84B'),
 'water': ('#4E7CB5', '#7FB2D9'), 'flag': ('#B44A40', '#3B2E22'),
 'grad': ('#3B2E22', '#4E7CB5'), 'guitar': ('#8A4E0F', '#F2B84B'),
 'muscle': ('#E8953C', '#F0C39A'), 'house': ('#B44A40', '#F2B84B'),
 'ring': ('#F2B84B', '#7FB2D9'), 'medal': ('#F2B84B', '#B44A40'),
 'climb': ('#3F7C37', '#F0C39A'), 'swim': ('#4E7CB5', '#F0C39A'),
 'mountainbike': ('#3B2E22', '#4E7CB5'), 'sprout': ('#3F7C37', '#A7C98F'),
 'mountain': ('#4E7CB5', '#FFFFFF'), 'rocket': ('#B44A40', '#FFFDF6'),
 'briefcase': ('#7A4A22', '#6E5C46'), 'laptop': ('#35608F', '#C9BFAE'),
 'trophy': ('#F2B84B', '#8A4E0F'), 'heart': ('#B44A40', '#93342B'),
 'star': ('#F2B84B', '#8A4E0F'), 'coffee': ('#7A4A22', '#FFFDF6'),
 'cat': ('#E8953C', '#3B2E22'), 'pizza': ('#F2B84B', '#B44A40'),
 'umbrella': ('#B44A40', '#3B2E22'), 'bell': ('#F2B84B', '#8A4E0F'),
 'coin': ('#F2B84B', '#8A4E0F'),
}

def h2r(h):
    h = h.lstrip('#')
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

def process(key):
    p = os.path.join(PNG, key + '.png')
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert('RGBA')
    a = np.array(im)
    alpha = a[:, :, 3]
    ys, xs = np.where(alpha > 40)
    if len(xs) == 0:
        return None
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    crop = im.crop((x0, y0, x1+1, y1+1))
    w, h = crop.size
    s = max(w, h)
    sq = Image.new('RGBA', (s, s), (0,0,0,0))
    sq.paste(crop, ((s-w)//2, (s-h)//2))

    # 高分辨率覆盖度图：每格采样 SUPERSAMPLE^2 个点，算覆盖率
    M = N * SUPERSAMPLE
    big = sq.resize((M, M), Image.BILINEAR)
    ba = np.array(big)
    cov = ba[:, :, 3].astype(float) / 255.0     # 0..1
    lum = ba[:, :, :3].mean(axis=2)

    c1, c2 = COLORS.get(key, ('#3B2E22', '#FFFDF6'))
    r1 = h2r(c1); r2 = h2r(c2)

    grid = [[None]*N for _ in range(N)]
    for gy in range(N):
        for gx in range(N):
            blk_cov = cov[gy*SUPERSAMPLE:(gy+1)*SUPERSAMPLE, gx*SUPERSAMPLE:(gx+1)*SUPERSAMPLE]
            mean_cov = blk_cov.mean()
            if mean_cov < 0.20:      # 该格基本是空的
                continue
            blk_lum = lum[gy*SUPERSAMPLE:(gy+1)*SUPERSAMPLE, gx*SUPERSAMPLE:(gx+1)*SUPERSAMPLE]
            m = (blk_cov > 0.5)
            if m.sum() > 0:
                mean_lum = blk_lum[m].mean()
            else:
                mean_lum = blk_lum.mean()
            # 亮 → c2（高光），暗 → c1（主体）
            if mean_lum > 170:
                col = r2
            elif mean_lum < 90:
                col = r1
            else:
                t = (mean_lum - 90) / 80.0
                col = (int(r1[0]*(1-t)+r2[0]*t), int(r1[1]*(1-t)+r2[1]*t), int(r1[2]*(1-t)+r2[2]*t))
            grid[gy][gx] = col
    return grid

if __name__ == '__main__':
    out = {}
    for k in MAP:
        g = process(k)
        if g:
            out[k] = g
    json.dump(out, open(OUT, 'w'), ensure_ascii=False)
    print('pixelized', len(out), '/', len(MAP))
    miss = [k for k in MAP if k not in out]
    if miss: print('missing:', miss)
