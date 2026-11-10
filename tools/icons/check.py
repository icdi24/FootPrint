# -*- coding: utf-8 -*-
"""脚印 · 图标一致性校验

唯一来源 public/js/icons.js 与所有消费点是否一致。
运行：python tools/icons/check.py    （退出码 0 = 全部通过）
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import build

PUB = os.path.join(ROOT, 'public')
LIB = os.path.join(PUB, 'js', 'icons.js')
SVG_DIR = os.path.join(PUB, 'icons')
ARCADE_DIR = os.path.join(PUB, 'themes', 'arcade', 'icons')

results = []


def check(label, ok, detail=''):
    results.append((label, bool(ok), detail))


def read(path):
    return open(path, encoding='utf-8').read()


def main_lib():
    src = read(LIB)
    m = re.search(r'const PIX = (\{.*?\});', src, re.S)
    return json.loads(m.group(1))


def js_object(path, var):
    src = read(path)
    m = re.search(r'const ' + var + r' = \{(.*?)\n  \};', src, re.S)
    if not m:
        return None
    return dict(re.findall(r"(\w+):\s*'([^']+)'", m.group(1)))


def svg_path(path):
    m = re.search(r'\bd="([^"]+)"', read(path))
    return m.group(1) if m else None


def main():
    pix = main_lib()

    # 1. 独立 SVG 与主库逐枚一致
    files = {f[:-4] for f in os.listdir(SVG_DIR) if f.endswith('.svg')}
    check('SVG 名称集合 == 主库', files == set(pix),
          f'SVG {len(files)} / 主库 {len(pix)}')
    bad = [n for n in pix
           if not os.path.exists(os.path.join(SVG_DIR, n + '.svg'))
           or svg_path(os.path.join(SVG_DIR, n + '.svg')) != build.to_path(build.rows_to_grid(pix[n]))]
    check('SVG path 与主库字形一致', not bad, f'不一致: {bad[:8]}')

    # 2. 桌面端两处内联兜底
    fb = js_object(os.path.join(PUB, 'web', 'app.js'), 'PIX_FALLBACK')
    check('app.js PIX_FALLBACK 与主库一致', fb == pix,
          f'兜底 {len(fb) if fb else 0} / 主库 {len(pix)}')
    wi = js_object(os.path.join(PUB, 'web', 'icons.js'), 'PIX')
    check('web/icons.js 兜底与主库一致', wi == pix,
          f'兜底 {len(wi) if wi else 0} / 主库 {len(pix)}')

    # 3. 街机主题同名 SVG
    if os.path.isdir(ARCADE_DIR):
        arc = [f for f in os.listdir(ARCADE_DIR) if f.endswith('.svg')]
        diff = [f for f in arc
                if not os.path.exists(os.path.join(SVG_DIR, f))
                or read(os.path.join(ARCADE_DIR, f)) != read(os.path.join(SVG_DIR, f))]
        check('街机主题 SVG 与统一库一致', not diff, f'{len(arc)} 枚，差异: {diff[:8]}')
    else:
        check('街机主题 SVG 与统一库一致', True, '目录不存在，跳过')

    # 4. 两端加载顺序
    mobile = read(os.path.join(PUB, 'index.html'))
    check('手机端引入统一库', 'js/icons.js' in mobile)
    desktop = read(os.path.join(PUB, 'web', 'index.html'))
    i_lib, i_old = desktop.find('src="/js/icons.js"'), desktop.find('src="/web/icons.js"')
    check('桌面端先引入统一库', 0 <= i_lib < i_old, f'lib@{i_lib} old@{i_old}')

    # 5. 角色子集存在
    check('角色形象 4 枚齐备', all(n in pix for n in ('paw', 'cat', 'dog', 'mouse')))

    width = max(len(r[0]) for r in results)
    for label, ok, detail in results:
        print(f'{"PASS" if ok else "FAIL"}  {label:<{width}}  {detail}')
    bad_n = sum(1 for _, ok, _ in results if not ok)
    print(f'\n{len(results) - bad_n}/{len(results)} passed, icons={len(pix)}')
    return 1 if bad_n else 0


if __name__ == '__main__':
    sys.exit(main())
