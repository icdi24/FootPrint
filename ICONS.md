# 脚印 · 统一图标库

> 建立于 2026-11-10。解决「同一个产品里并存 5 套图标来源」的问题。
> 同日追加：**角色形象定稿**（小猫 / 小狗 / zoowy 小老鼠）与**防漂移同步机制**。
> 规范与清单以本文件为准；**唯一运行时来源是 `/js/icons.js`**。

---

## 1. 调研：之前为什么不统一

`http://127.0.0.1:3000/` 会按 UA 分流：桌面 → `public/web/`（桌面工作台），手机 → `public/index.html`（手机端）。两端各自的图标来源如下：

| 来源 | 位置 | 内容 | 问题 |
|---|---|---|---|
| 手机 Web 功能图标 | `public/js/icons.js` | 22 枚 16×16 单色像素剪影 | 风格正确，但只有 UI 图标；目标 / 愿望 / 大目标仍用系统 emoji |
| 手机 Web 徽章 | `public/js/pixel-art.js` | 18 枚 12×12 多色像素徽章 | 多色徽章与单色图标混用；桌面端又内联了 16 枚副本 |
| 街机主题 | `public/themes/arcade/icons/*.svg` | 56 枚像素 SVG | `viewBox` 24 与 32 混用、线框细线、部分文件多 `<path>`；只在该 demo 内使用 |
| 桌面工作台 | `public/web/` | `icons.js` 副本 + `app.js` 内联 `PIX_FALLBACK` 副本 + 大量 emoji | 同一份 22 枚存了 3 份；`data-icon` 有时 mono 有时 badge，同一语义两种画法；内容全是 emoji |
| Android | `MainScaffold.kt` `MainTab` | `🏠 ◎ 🎁 👫 👤` | Unicode 字符 / emoji 直接当图标 |
| 角色形象 | 散在 4 处 | zoowy = 小老鼠（多色徽章 `mouse`）、街机头像 = `cat.svg`、用户头像 = 🐱/🐻 emoji、状态里 🐱🐶 | 没有定稿角色，也没有统一载体，跨平台显示不一致 |

不统一可以拆成三层：**① 多份副本**（22 枚被复制 3 次）；**② 三种视觉**（单色剪影 / 多色徽章 / 彩色 emoji）；**③ 三种网格**（16 / 24 / 32）。手机实际截图与 `docs/设计/主题对照-2026-11-08/` 都能看到：底部导航是像素图标，卡片里却是彩色 emoji。

---

## 2. 统一规范

- **唯一来源**：`public/js/icons.js`，手机端与桌面工作台共用；独立 SVG 在 `public/icons/<name>.svg`（供设计稿 / Figma / 原生端取用）。
- **画法**：16×16 网格，单色 `fill="currentColor"`，`shape-rendering="crispEdges"`，尺寸只用整档 16 / 24 / 32 / 48px。
- **数据格式**：每个图标 16 行，每行是若干 `x1-x2` 闭区间，`,` 分隔多段，`-` 表示空行；`pixPath()` 先求 bbox 再整体居中到 16×16。**独立 SVG 与运行时必须用同一套居中结果**（由构建脚本保证，曾校验出 1～2 格偏移并修复）。
- **命名**：小写英文语义名（不用外观名）；与手机端原 22 枚重名时，一律以手机端字形为准。
- **分层**（避免「统一 = 消灭个性」，明确各层职责）：

| 层 | 内容 | 允许位置 |
|---|---|---|
| L1 功能图标 | 本库单色 16×16（含「角色形象」子集） | 所有 UI 图标、导航、目标 / 愿望分类图标、角色头像 |
| L2 徽章 | 12×12 多色像素（`pixel-art.js` / `PX_ART`） | 仅品牌爪印、头像、分区标题装饰；桌面端须显式 `data-icon-kind="badge"` |
| L3 内容 | 状态 / 心情 emoji（😊 😵 🥺 🌤️ …） | 用户表达，属于内容不是图标，保留 |

---

## 3. 已有 → 补齐

| 批次 | 数量 | 处理方式 |
|---|---|---|
| 手机端已有 | 22 | 原样保留，作为字形基准 |
| 街机主题已有 | 56 | 浏览器精确栅格化后重采样到 16 格；其中 4 枚与手机端重名（`camera` / `coin` / `gift` / `target`）以手机端为准，实际并入 **52** 枚 |
| 新绘制 | 54 | **50** 枚全新 / 修正 + **4** 枚角色定稿（其中 `cat` / `dog` 为覆盖重绘） |
| **合计** | **121** | 导航与界面 19 · 角色形象 4 · 操作与状态 43 · 活动与物品 55 |

### 角色形象定稿（要不要另起一套？不要）

结论：**角色不另起一套图标，作为本库的正式子集 `角色形象`**，同网格、同单色、同渲染、同构建脚本。理由是「小猫小狗」目前散在 4 处载体里，再开一套只会多一份要维护的资产；放进同一库反而能一次定稿、三端共用。

| 图标 | 角色 | 用途 | 替换了什么 |
|---|---|---|---|
| `cat` | 小猫 | 用户头像候选 / 街机主题头像 | 街机 `cat.svg` 线框、🐱 |
| `dog` | 小狗 | 用户头像候选 | 🐶、原手绘狗头 |
| `mouse` | zoowy 小老鼠 | AI 助手贴边浮标、对话窗 | `pixelIcon('mouse')` 多色徽章、🐭 fallback |
| `paw` | 品牌爪印 | 登录 logo / 品牌位 / favicon | 桌面 `data-icon="paw"` 缺图 |

落地：`zoowy-float.js` 的浮标已改为 `FP_ICONS.iconSvg('mouse')`；`🐱 🐶 🐭 🐈 🐕` 已加入 emoji 映射；街机主题的 `cat.svg` 由构建脚本同步为定稿字形。**状态里的「吸猫 / 遛狗」属于用户内容（L3），仍保留 emoji**。

### 其余新绘制的图标

- **导航与界面**：`avatar` `chat` `up` `down` `more` `menu` `search` `filter` `bookmark`
- **操作与状态（28）**：`success` `info` `help` `refresh` `share` `trash` `eye` `pin` `image` `chart` `moon` `sun` `sparkle` `save` `upload` `copy` `link` `send` `undo` `cloud` `mail` `key` `music` `video` `wifi` `crown` `wallet` `thought`
- **活动与物品**：`brain` `broom` `cook` `flower` `globe` `lifebuoy` `lipstick` `pill` `ring` `salad` `sprout` `stretch` `swim`

其中 `paw` / `avatar` 补上桌面端 `data-icon` 一直缺的品牌与头像；`cook` `lifebuoy` `wallet` `globe` `brain` `pill` `salad` `thought` `stretch` 等补的是演示数据与选择器里出现、但两端都没有像素图标的 emoji。

---

## 4. emoji → 图标映射

库内置 **96 条**映射（`FP_ICONS.EMOJI`），覆盖目标 / 愿望 / 大目标选择器与演示数据里的绝大多数 emoji，例如：
`📖 📚 📕 📗 📘 → book`、`💧 → water`、`🌙 💤 → sleep`、`🧋 → boba`、`♨️ 🍲 → hotpot`、`🛟 → lifebuoy`、`🍳 → cook`、`📌 → pin`、`🐾 → paw`、`🐱 → cat`、`🐶 → dog`、`🐭 → mouse`、`💰 → wallet`、`🧠 → brain`、`💊 → pill`、`🥗 → salad`、`🤸 → stretch`。

API：

```js
FP_ICONS.emojiName('📖')                 // 'book'
FP_ICONS.iconForEmoji('📖')              // <svg …> 或 null
FP_ICONS.paintEmojiIcons(root)           // 批量把展示类 emoji 换成图标
window.FP_ICON_OPTIONS.replaceEmoji = false  // 关闭自动替换（默认开启）
```

自动替换由 `MutationObserver` 驱动，两端通用；只改显示，不改 `data-e` / `data-emoji` 值，选择器交互不受影响。状态 / 心情表情（`.st-*`）与无映射的 emoji 保留原文。

---

## 5. 会不会和手机端分离？——不会，且有机制保证

**核心**：手机端与桌面端加载的是**同一个物理文件** `/js/icons.js`，不是各自复制一份。桌面 `web/index.html` 在 `/web/icons.js` **之前**引入它；手机 `index.html` 原本就引入它。所以改一处、两端同时生效。

但上一版确实还留了 3 处会漂移的副本，本轮已全部收编：

| 残留副本 | 处理 |
|---|---|
| `public/web/app.js` 内联 `PIX_FALLBACK` 只有旧 22 枚 | 构建脚本每次运行**自动重写为全量 121 枚**（保留兜底，线上曾因漏文件出过 tab 错位事故） |
| `public/web/icons.js` 兜底 `PIX` 只有旧 22 枚 | 同上，自动同步 |
| `public/themes/arcade/icons/*.svg` 仍是 24/32 网格线框 | 构建脚本**用统一库 16 格 SVG 覆盖** 56 个同名文件，街机主题自动用上同一套 |

并且新增 `tools/icons/check.py`：随时跑一次，校验「主库 / 独立 SVG / 两处内联兜底 / 街机 SVG / 两端加载顺序 / 角色 4 枚」8 项一致，退出码非 0 即视为漂移：

```powershell
python tools/icons/build.py   # 改图标后重跑，自动同步所有消费点
python tools/icons/check.py   # 随时校验，8/8 PASS 才算没分离
```

**接入改动**

| 端 | 文件 | 改动 |
|---|---|---|
| 手机 Web | `public/index.html` | 无需改，原本就加载 `/js/icons.js`；新库自动生效 |
| 手机 Web | `public/js/zoowy-float.js` | 浮标小老鼠改用统一库 `iconSvg('mouse')` |
| 桌面 Web | `public/web/index.html` | 在 `/web/icons.js` 之前引入 `/js/icons.js` |
| 桌面 Web | `public/web/icons.js` | 加 guard：统一库已存在时不覆盖（兜底由构建同步） |
| 桌面 Web | `public/web/app.js` | `monoIcon` 改用 `FP_ICONS.pixPath`；`paintIcons` 默认走单色、徽章须显式 `badge`；调用 `paintEmojiIcons`；`PIX_FALLBACK` 由构建同步 |
| 桌面 Web | 两处 HTML/JS | 14 处 `paw` / `avatar` 显式标记 `data-icon-kind="badge"` |
| 街机主题 | `public/themes/arcade/icons/*.svg` | 56 枚由构建同步为统一字形（原始版本备份在 `shots/arcade-icons-before/`） |

**Android**：`MainTab` 的 `🏠 ◎ 🎁 👫 👤` 建议映射为 `home` / `target` / `gift` / `us` / `me`，用 `public/icons/*.svg` 转 VectorDrawable 后替换 `Text(t.icon)`。原生端需单独接入，本次未改 Kotlin —— 这是目前唯一还不在同一套里的端，其余 Web 双端与街机主题都已收编。

---

## 6. 维护与复现

生成物**不要手改**，改图标请改构建脚本后重跑：

| 文件 | 作用 |
|---|---|
| `tools/icons/build.py` | 主构建：合并字形 → `public/js/icons.js` + `public/icons/*.svg` + `public/icons.html` + `shots/icon-sheet.png`，并同步 3 处消费点 |
| `tools/icons/check.py` | 一致性校验（8 项），防漂移 |
| `tools/icons/icons.legacy.js` | 手机端原 22 枚备份（保持字形基准可复现） |
| `tools/icons/arcade-16-rows.json` | 街机 56 枚重采样到 16 格的字符画 |
| `tools/icons/arcade-grid.json` | 街机 SVG 的浏览器精确栅格化原始网格 |
| `tools/icons/rasterize.py` | 栅格化网格 → 16 格字符画 + 对比预览 |

依赖：Python 3 + Pillow（工作区内置）。改某个图标：编辑 `build.py` 里对应的 `draw_*()` 函数或末尾的复检重绘段，重跑 `build.py` 后再跑 `check.py`。

---

## 7. 验收记录

- `node --check`：`public/js/icons.js`、`public/js/zoowy-float.js`、`public/web/icons.js`、`public/web/app.js` 全部通过。
- `python tools/icons/check.py`：**8/8 PASS**，121 枚，主库 / SVG / 两处兜底 / 街机 SVG / 两端加载顺序 / 角色子集完全一致。
- 图标墙 `http://127.0.0.1:3000/icons.html`：121 格全部渲染，0 个空 SVG。
- 桌面 `http://127.0.0.1:3000/`：库 121 枚；20 个 `data-icon` 全部有 SVG、0 个空图标、0 个 `NaN/undefined` 路径；目标卡片 emoji 已换成像素图标。
- 手机 `http://127.0.0.1:3000/?site=mobile`、街机 `/themes/arcade/index.html`：库 121 枚、0 坏路径、图标正常加载。
- 截图：`shots/icon-sheet.png`（121 枚总览）、`shots/icon-wall.png`（图标墙）、`shots/icon-audit-desktop-after.png`、`shots/icon-audit-mobile-after.png`。

> 说明：状态 / 心情 emoji、品牌彩色爪印与 12×12 多色徽章按第 2 节分层保留，属于刻意保留的表达层，不属于「未统一」。
