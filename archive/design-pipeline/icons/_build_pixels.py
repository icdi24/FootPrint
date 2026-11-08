# -*- coding: utf-8 -*-
# 把 _gen/<key>.jpg 缩成 32x32 像素、量化调色板、生成 topic-icons.js 的多色 SVG 版本
import os, glob, json, io
from PIL import Image
import numpy as np

GEN = r'D:\PersonalHub\projects\tcamp\小组项目\public\_gen'
N = 32  # 最终像素网格

def load_cropped(path):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    rgb = a[:, :, :3].astype(int); alpha = a[:, :, 3]
    # 背景：角落取样
    corners = [rgb[0,0], rgb[0,-1], rgb[-1,0], rgb[-1,-1]]
    bg = np.median(np.array(corners), axis=0)
    diff = np.abs(rgb - bg).sum(axis=2)
    mask = (diff > 45) & (alpha > 20)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return im
    y0,y1,x0,x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = int(0.04 * max(x1-x0, y1-y0))
    y0=max(0,y0-pad); x0=max(0,x0-pad); y1=min(im.height-1,y1+pad); x1=min(im.width-1,x1+pad)
    crop = im.crop((x0,y0,x1+1,y1+1)).convert('RGBA')
    # 把接近背景的像素设为透明
    ca = np.array(crop)
    crgb = ca[:,:,:3].astype(int)
    cdiff = np.abs(crgb - bg).sum(axis=2)
    ca[:,:,3] = np.where(cdiff > 45, ca[:,:,3], 0)
    return Image.fromarray(ca, 'RGBA')

def square_pad(im):
    w,h = im.size; s=max(w,h)
    sq = Image.new('RGBA',(s,s),(0,0,0,0))
    sq.paste(im, ((s-w)//2,(s-h)//2))
    return sq

def quantize(im, ncolors=None):
    # 用中位切分量化到有限色，保留透明
    alpha = im.split()[3]
    rgb = im.convert('RGB')
    q = rgb.quantize(colors=(ncolors or (28)), method=Image.MEDIANCUT, dither=Image.NONE).convert('RGBA')
    qa = np.array(q); qa[:,:,3] = np.array(alpha)
    return Image.fromarray(qa,'RGBA')

def to_pixel_grid(path):
    im = load_cropped(path)
    im = square_pad(im)
    small = im.resize((N,N), Image.BOX)  # BOX 平均，缩小时更稳
    small = quantize(small)
    a = np.array(small)
    # 构造 grid: (N*N) 颜色串；取每个像素 RGB + alpha
    grid = []
    for y in range(N):
        row = []
        for x in range(N):
            r,g,b,al = a[y,x]
            if al < 40:
                row.append(None)
            else:
                row.append((int(r),int(g),int(b)))
        grid.append(row)
    return grid

def build():
    files = sorted(glob.glob(os.path.join(GEN,'*.jpg')))
    # key 顺序参考 pairs
    order = []
    for line in open(r'D:\PersonalHub\projects\tcamp\小组项目\_gen_pairs.txt',encoding='utf-8'):
        if '|' in line: order.append(line.split('|')[0])
    data = {}
    for k in order:
        f = os.path.join(GEN, k+'.jpg')
        if os.path.exists(f):
            data[k] = to_pixel_grid(f)
    print('built', len(data), 'icons')
    return data

if __name__ == '__main__':
    d = build()
    # 存 npz 供后续生成用
    keys = list(d.keys())
    # 序列化为 json（颜色压缩）
    out = {}
    for k,grid in d.items():
        out[k] = [[c for c in row] for row in grid]
    json.dump(out, open(r'D:\PersonalHub\projects\tcamp\小组项目\_pixels.json','w'), ensure_ascii=False)
    print('saved _pixels.json')
