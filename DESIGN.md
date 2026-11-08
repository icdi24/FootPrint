# Design · 脚印

<!-- impeccable:design-record -->

## Visual World

温馨 16-bit 像素风（cozy 16-bit indie game）：羊皮纸地面、草绿与蜂蜜金、像素描边与硬投影，像一台放在深松林桌面上的掌机游戏屏。用户明确指定的方向（卡通风 + 像素风），2026-11-03 落地。

## Mode

Operate（移动端优先的打卡工具；手机 390×844 为主，桌面 1280 居中单列）。

## Typography

- 字体：Fusion Pixel 12px（缝合像素字体，OFL-1.1，自托管于 `public/fonts/`，见 `fonts/OFL.txt`）
  - `FusionPixel`（proportional，正文）与 `FusionPixelMono`（等宽，标题/数字）
  - zh_hans + latin 两个 unicode-range 子集，系统 emoji 字体兜底渲染表情
- 字号只用 12 的整数倍：12（正文/控件）、24（标题/大数）、36（英雄数字），保证像素网格对齐
- 行高 1.9，正文对比 ≥4.5:1

## Palette

| 令牌 | 值 | 用途 |
|---|---|---|
| --bg | #FAF3E3 | 羊皮纸地面（9px 点阵纹理） |
| --bg-2 | #F3E9D2 | 次级面板 |
| --card | #FFFDF6 | 卡片 |
| --ink | #46382B | 正文（深棕） |
| --ink-2 | #6E5C46 | 次级文字 |
| --ink-3 | #8A7A62 | 弱化/装饰 |
| --line / --line-strong | #E9DFC7 / #D8C9A6 | 边框 |
| --outline | #3B2E22 | 像素描边（按钮/面板/激活态） |
| --green / --green-deep | #3F7C37 / #2E6228 | 主色（打卡/激活） |
| --green-soft | #E2EFDA | 主色衬底 |
| --orange / --orange-deep | #E8953C / #8A4E0F | 火焰/连续/今日 |
| --orange-soft | #FBEDD5 | 琥珀衬底 |
| --red / --red-deep | #B44A40 / #93342B | 驳回/危险 |
| --blue | #4E7CB5 | 已完成标签 |
| --gold | #F2B84B | 金币/愿望单余额横幅 |
| 桌面底 | #2E4A2A | 松林深绿桌面背景（≥520px） |

## Surface Levels（目标板块，2026-11-07 定）

用户反馈目标页「很乱」，实测根因是**框太多**（60 个带边框元素）、**层级塌了**（11 与 12px 几乎无差）、**对齐线太多**（29 个左边缘）。定下三级表面与四档字号，目标板块按此执行：

| 级别 | 用在 | 处理 |
|---|---|---|
| 主卡 | 每屏**只有一块** | 2px 深棕描边 + 硬投影 |
| 内容块 | 卡片内部分组 | **无边框**，只用 1px 虚线分隔 |
| 背景 | 其余所有 | 直接落在纸面，不套框 |

- **字号只用四档**：34（英雄数字）/ 16（区块与目标名）/ 14（正文与按钮）/ 12（元信息）。**11px 不再使用**——中文在该尺寸下笔画糊。
- **文字只有两种棕**：`--ink #3A2D1D` 主、`--ink-2 #63513C` 次。不再用 `#7D6C56`。
- **语义色只管状态**：绿=已完成/行动，橙=今天/待办，粉=漏打，蓝=已归档。
- **周网格格子不加外框**：已打用实心绿块表达边界，漏打浅粉+红点，今天橙框+橙点，未来只有小点。今天整列浅橙带贯穿、表头实心橙块。
- **状态语义**：过去未打 = `missed`（粉），只有今天 = `todo`（橙）。不得把过去日期渲染成待打卡。
- **三个 tab 共用骨架**：页头 → 主区（唯一重卡）→ 状态带。切 tab 时骨架不动。
- **大目标与小目标同一套卡片语法**，不做层级区分（用户明确要求）。

实测：目标页边框 54 → 12；日常与大目标 390×844 一屏放完。

## Materials & Components

- **像素描边 + 硬投影**：卡片 2px 边框 + `0 3px 0` 硬投影；按钮 2px 深棕描边 + `0 4px 0` 下沉投影，按压整体下沉 4px（无圆角，直角世界）
- **像素图标**：自绘 16×16 网格 SVG（`js/icons.js`，`shape-rendering: crispEdges`），整倍数缩放（16/32px），22 枚全覆 UI 图标
- **像素爪印**：CSS box-shadow 4px 网格绘制（登录 logo 88px 绿砖 + 白爪），favicon 同款 16×16 SVG
- **点阵纹理**：页面地面 9px 圆点阵；桌面深绿底 10px 点阵
- **虚线分隔**：列表/表格用 2px dashed 暖棕分隔（代替细实线）
- **状态芯片**：直角 2px 边框小方块（st/徽章/图例）
- **弹层**：3px 深棕描边对话框 + 内高光 bevel，像素横条把手
- **Toast**：深棕直角像素框，按类型着色
- **激活 Tab**：草绿像素滑块（steps(5) 滑动），白图标白字
- **加载态**：三个像素方块 blink（steps(1)）

## Motion

- 页面进入 0.22s ease-out；卡片 stagger 浮入
- 按压 = 瞬时下沉（60ms linear），像素世界的手感
- 打勾 popIn steps(3) 弹入；Tab 滑块 steps(5)；进度条 steps(10)
- logo 悬浮 2.6s 缓动；`prefers-reduced-motion` 全量降级

## Browser Surfaces

- 选区绿色白字；:focus-visible 3px 橙色描边；滚动条绿色方块（scrollbar-color + webkit）
- 输入占位符 #7F6F57（≥4.5:1）

## Verification

- Edge headless（puppeteer-core，390×844 @3x / @1x、1280×900）+ 演示数据（seed-demo）截图：登录、五个 Tab、周/月网格、打卡弹层、格子详情、桌面视图
- 控制台无新错误（登录前 /api/me 401 为既有正常行为）；FusionPixel 4 个字面全部 loaded
- 独立终审（fresh-context reviewer）14 张截图逐张查看 + 源码核对 → disposition=fix，8 条 findings 全部修复并复验：
  1. 图标系统性偏上 → pixPath 增加 bbox 求交平移居中，修复后用 getBBox 数值验证 12 枚图标全部居中
  2. 6 处 12px 文本对比度 <4.5:1 → 实色化（bb-yuan .93、wb-label/yuan #4A3A28、--ink-3 #7D6C56、--blue #35608F、disabled 兑换钮 --ink-2、bonus toast 深字金底）
  3. 网格/卡片可点击项无键盘通道 → goals（格子+目标名）、wish-card、home stage-card 补 role="button" + tabindex + Enter/Space
  4. 风格残留 → 桌面投影改阶梯硬框、cell.todo 光晕改 steps(1) 步进描边、弹层/翻页/浮入改 steps()
  5. 缺失按压态 → seg/type-seg/freq-seg/emoji-pick/avatar-pick/wd-pre 补「下压 2px + 硬影消失」
  6. 输入框焦点环被 outline:none 压掉 → 补 :focus-visible 3px 橙色 outline
  7. us/me/gift 图标误读（气泡/云/瓶子）→ 重绘：us 双人形（头+肩+躯干+脚）、me 加脖子与双臂、gift 双环蝴蝶结
  8. 证据缺口 → 补拍月视图（.month-list 8px 日格）与 FAB/tab 高倍裁剪
- 修正记录：爪印初版读成「比耶」→ 改 4 趾 + 大掌垫；「我的」胸像加脖子
