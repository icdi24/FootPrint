# FootPrint：APK ↔ 手机端 Web 逐栏目差异清单

> 比对时间：2026-11-11　参照物：手机端 Web（`public/index.html` + `public/js/pages/*.js`）
> 对齐方：Android（`android/app/src/main/java/me/footprint/app/`，Kotlin + Compose）
> 全程只读比对；五个栏目各由独立子代理逐行核对，并用 ego-browser 抓取了云端手机端 Web 五个 tab 的真实 DOM 文本交叉验证。

## 0. 先说结论（三个决定性事实）

1. **不是 APK 陈旧**。云端 `app-debug.apk` = `FootPrint-v1.9`，`Last-Modified: 2026-11-09 14:25`，14420052 字节，与本地 `footprint-android/.../app-debug.apk` 完全一致；`android/` 最后一次提交也是 `aa0845e 11-09 14:25`。**APK 就是当前源码的构建产物**。
2. **是 Android 源码本身落后于 Web**。11-10 一整天 Web 侧 8 个提交（UI 打磨 / 数据接口补全 / 真实接口接入 / 全状态演示数据），`android/` 零提交；11-11 协作者又推 5 个提交（统一像素图标库 121 枚、手写动效模块、本周坚持条、「我们」页改版、配色对齐）。
3. **两端骨架已对齐**：5 个 tab（今天/目标/愿望单/我们/我的）、星露谷木质像素皮肤、zoowy 可拖动浮标 + 悬浮聊天窗、私聊 WebSocket、匹配大厅、我的状态、手机时长今日对比、未读红点，全都在。
   **差异集中在：弹层级的深度功能、若干整块功能、以及一批会让功能直接失效的 P0 Bug。**

## 0.1 两个 Android 副本（需先统一）

| | `android/`（git 跟踪） | `footprint-android/`（v1.9 的构建源） |
|---|---|---|
| gradlew / gradle wrapper | **没有** | 有 |
| local.properties backendUrl | `http://106.53.188.31:3201/` | 同 |
| 真实源码差异（过滤 CRLF 后） | — | 仅 `net/Api.kt`、`ui/AppViewModel.kt` 多一个 `ChatPartner` 私聊模型修复 |

其余 20 个 `.kt` 只是 CRLF/LF 行尾差异。**结论**：副本不是"不一样"的主因，但必须合并——把 `ChatPartner` 修复并回 `android/`，给 `android/` 补 gradle wrapper，以后只维护一份、只从一份构建。

## 1. P0 —— 功能直接坏掉 / 数据错（必须先修）

| # | 栏目 | 问题 | 证据 |
|---|---|---|---|
| 1 | 今天/目标 | `CheckinResult.bonuses: List<String>`，后端返回对象数组 `[{n,points,balanceAfter}]` → 触发连续里程碑时反序列化抛异常，服务端已入账、App 报「打卡失败」且不刷新 | `Api.kt:770` ↔ `goals.js:84,548`、`checkin.js:116` |
| 2 | 愿望单 | 用 `status == "applied"` 找在途兑换，后端兑换直接写 `'confirmed'`（后端自注「项目里不存在 applied 状态」）→ **撤回 / 标记完成整条链路是死代码** | `WishScreen.kt:190,414-429` ↔ `wish.js:166`、`pair.js:281` |
| 3 | 我的 | 积分系数保存必然 400：`parseCfg` 写死 `milestones=emptyList()` + `encodeDefaults=true` → PUT 带 `[]` → 后端「里程碑表需为 1–8 条」 | `MeScreen.kt:1047` ↔ `points.js:87-99` |
| 4 | 我的 | 改密码最少 6 位、无二次输入、成功后不重登；后端要求 8 位且改密后销毁全部会话 → 6~7 位必被拒，成功后旧 token 仍在使用 | `MeScreen.kt:809,833` ↔ `auth.js:20,222` |
| 5 | 我的 | 退出登录只清本地 Session，**不调 `/api/logout`**，服务端会话/WS 不销毁；且无「登出全部设备」 | `AppViewModel.kt:414` ↔ `me.js:120-132` |
| 6 | 我们 | 打开私聊不向服务端标记已读（`markChatRead()` 定义了但 UI 零调用），`loadChat()` 还把 `_chatUnread` 写回 → 红点回冒 | `ChatScreen.kt` ↔ `chat.js:54` |
| 7 | 目标 | 提交验收硬编码一句话 `"我完成了，请验收"`，自述必填 / 证据文字 / 最多 3 张图全丢 | `GoalsScreen.kt:242` ↔ `goals.js:476-563` |
| 8 | 今天 | 首页「完成」单击即按默认时长一键提交，**绕过整个打卡弹层**（无时长选择/证据/积分预览/长按秒打卡） | `Screens.kt:319,449` ↔ `home.js:150-169`、`checkin.js` |
| 9 | 今天/目标 | `Todo` DTO 无 `weekly` 字段、首页只过滤 `dueToday`，「本周 N/M」硬编码成 `本周 freq_n/3` → 每周 N 次目标在首页不出现、口径错 | `Api.kt:707`、`Screens.kt:318,413` ↔ `home.js:61,216` |
| 10 | 目标/我们 | 图片证据全链路缺失（`Api.kt` 无 upload 方法、`CheckinRequest` 无 `evidence_id`、`SubmitRequest` 无 `evidence_ids`）；撤销打卡 `Api.revoke` 定义了但全项目零调用 | `Api.kt:143,760,1113` ↔ `api.js:31`、`ops.js:211` |

## 2. P1 —— 整块功能缺失（按栏目）

### 今天（首页）
- 缺 **partner-strip**（「🐻 sushi 今天还有 1 张卡没打」+「去看看」→ 我们页）；`HomeResponse.partner/partnerToday` 已有却没用
- 缺「去建目标」按钮、加载态「加载中…」、错误态😿+重试（`getHome` 异常被静默吞）
- 两类小目标卡不可点（plan-card→大目标详情、stage-card→目标页）、`planned_date` 显示原始 ISO 而非「11月2日」、缺「进行中」chip 和「有记录」
- 游客首页只有一句欢迎，缺 0 值积分横幅/日期/空态；卡片无入场动画
- **结构错位**：把 Web「我们」页的手机时长卡混进了首页，却少了 Web 首页的 partner-strip

### 目标（最重）
- **目标详情弹层整块缺失**（连续天数、里程碑进度条「再连 N 次奖励 +P 分」、本月打卡/最长连续/性价比、本月记录、放弃确认）；`Api.kt` 无 `GET /api/goals/:id`
- **小目标详情**、**验收详情**（自述/证据文字/证据图片/第 N 次提交/历史驳回）缺失；`Api.kt` 无 `GET /api/verifications/:id/detail`
- **大目标缺 3 个主操作**：「🐾 让 zoowy 拆计划」「和 zoowy 讨论」「加个小目标」「移出」；`Api.unbindChainGoal` 已封装但零调用，`ZoovyScreen(bigGoalId=)` 从未被传入
- 新建/编辑表单缺 4 个字段（描述/起止日期/自定义积分）、无「每次积分自动·自定义 + 预设 5/10/15/20」、无实时预览与偏高警告、指定星期靠手输「1-7，逗号分隔」
- 日历图例 5 项 → 3 项；daySheet 缺「本周灵活安排」分区与每行 `+N 分`
- 顺延写死 today、无「挪了 N 项」；放弃确认文案与事实矛盾（Android 说「无法恢复打卡记录」，后端其实保留记录）
- 草稿小目标缺「放弃」；大目标模式 FAB 串台（仍打开日常目标表单）
- 通过验收无二次确认；积分预览用 `base*d/30` 简化公式，与 Web/后端公式不一致

### 愿望单
- 列表不过滤 `status`（下架愿望仍占列表）、无「上架/下架」切换（`WishPayload` 无 status）
- 兑换无二次确认弹层（Web 有「确认兑换」+ 当前余额/兑换后余额 + hint）、成功文案「已锁定 N 分」与「提交即扣分」不符
- 兑换记录行无「撤回」「已收到」按钮、无 2 小时窗口判断、无撤回确认
- 积分价非实时联动、冷却期无法清零（0 传成 null 被省略）、表单无长度/范围校验
- 余额横幅缺 `≈ ¥` 与千分位、缺「差 N 分」具体差额

### 我们
- **邀请码配对 / 解绑 / 配对状态 / 组内动态全套缺失**：`Api.kt` 无任何 `/api/pair/*`，`MeScreen` 无「我的搭档」区块，只能靠匹配大厅组队且无法解绑
- **互享画像 + 分享日报缺失**：`PartnerPageResponse` 无 `sharedProfile/sharedDiaries`，无 `/me/profile/share`、`/diaries/:date/share` 端点
- 缺 `ta 的大目标`（进度条）、**7 天手机时长折线**（`/api/usage/range`）、历史消息分页（`getChatMessages` 零调用）、对方状态详情弹层「我也设一个」
- 「并排看看」是两列纯文本表格，Web 是 5 项专属色横向条形图 + 生长动画
- 打卡证据文字/图片/时间、兑换时间、验收自述/证据、气泡头像等字段模型里有但未渲染
- 二次确认（撤回/接受邀请/通过验收/解绑/清除状态）、驳回理由非空校验、4 个折叠抽屉 +「全部展开」全无

### 我的
- **AI 日报整块缺失**（查看/修改/分享给对方 + 站内红点）；`DiaryWorker` 发的通知点了没有落地页（`open_diary` extra 无人接收）
- 缺 **改用户名**（`PATCH /api/me`）、**我的画像块编辑**（`GET/PUT /api/me/profile/:block`）、**我的搭档**区块
- 缺 **导出数据 / 备份下载 / 灾难恢复说明**（`BackupSection` 只有列表+立即备份）
- 缺「登出全部设备」、通用二次确认弹窗、关于行「脚印 · 两个人互相看得见」、游客完整结构
- 画像变更「查看全部」实际只有 5 条；积分流水 `take(30)` 截断、0 显示「+0」、无千分位
- 统计口径不一致：完成率本地整除（2/3 → 66%，Web 67%）、「最长连续」缺「 天」、「本月得分」缺 `+`、6 色像素徽章 vs 纯色面板

## 3. P2 —— 文案 / 视觉 / 交互细节

- 弹层形态：Web 是底部 `UI.sheet` + 可挂多 action + 遮罩；Android 是居中全屏 `Dialog` + 固定「取消/保存」
- Toast：Web 分 ok/err/warn/bonus 四类、2.6s 自动消失；Android 页面内联常驻 chip / 系统 Toast
- 动画：Web 首页 `stagger-in` 依次浮入、`UI.numberRoll` 数字滚动、GSAP 切页漂浮；Android 无
- 千分位：`UI.fmtNum` vs `toString()`；`≈ ¥` 保留 1 位小数 vs `0.0`
- 时间：`11月2日 13:04` vs `11-02 13:04`；日期 `11月2日` vs 原始 ISO `2026-11-02`
- emoji 集合：愿望单 Web 16 个 vs Android 12 个
- 空态 / 按钮 / 徽章文案：「待验收」vs「等待验收」、「打卡」vs「确认打卡」、「再想想」vs「取消」、「发」vs「发送」、「今日/每天」vs「每日」、「工作日」vs「指定星期」、「本月 +X 分」vs「本月 X 分」
- 私聊输入：Web 多行 + Enter 发送 + Shift+Enter 换行 + 2000 字上限；Android 单行
- 两端**共同缺失**（需产品决策，非 Android 独有）：删除愿望（后端无 DELETE 路由）、experience 分类、愿望图片、计划版本快照查看/回滚、私聊图片与时间戳、主题切换开关、每日提醒开关

## 4. 后端状态

**绝大多数端点后端已具备，Android 只需补客户端接线**，无需改后端：
`/api/home`、`/api/goals/:id`、`/api/points/preview`、`/api/uploads`、`/api/file/:id`、`/api/checkins/:id/revoke`、`/api/verifications/:id/detail`、`/api/biggoals/:id/goals`、`/api/wish*(PUT status)`、`/api/redemptions/:id/{cancel,done}`、`/api/ledger`、`/api/me`、`/api/logout`、`/api/me/logout-all`、`/api/me/profile*`、`/api/diaries*`、`/api/export`、`/api/backups/:name`、`/api/pair/*`、`/api/usage/range`、`/api/chat/read`、`/api/chat/messages?before`。

需后端小改的：
- `points.js:87` `if (patch.milestones)` 把 `[]` 当 truthy → 客户端只改单个系数却发 `[]` 会 400
- `ops.js:167` `/api/ledger` 可加 `?type=` / `?dir=` 过滤与分页（配合收支筛选/查看全部）
- 若做计划版本快照：`GET /biggoals/:id/versions`（`plan_versions` 表已写、无读取路由）
- 若做私聊图片：`chat.js` 增 imageUrl 字段

## 5. 改动落点（文件级）

| 文件 | 主要改动 |
|---|---|
| `net/Api.kt` | 修 `bonuses` DTO；`Todo.weekly`、`StageGoal.end_date`、`WishPayload.status`、`CheckinRequest.evidence_id`、`SubmitRequest.evidence_*`；新增 upload / getGoal / previewPoints / verificationDetail / bindChainGoal / usageRange / pair 全套 / me profile / diaries / logout / export 等封装；透传 `PartnerPageResponse.sharedProfile/sharedDiaries/partnerBigGoals`；合并 `ChatPartner` 修复 |
| `ui/Screens.kt` | 首页接 CheckinDialog（含长按秒打卡）、partner-strip、去建目标、加载/错误/游客态、卡片跳转、`weekly` 口径、千分位、入场动画 |
| `ui/GoalsScreen.kt` | CheckinDialog 提为共用并补图片/预览/bonus toast；新增 GoalDetailDialog / StageDetailDialog / SubmitVerificationDialog / CheckinDetailDialog(撤销)；GoalEditorDialog 补 4 字段+预览；日历图例/daySheet 补齐；FAB 分流 |
| `ui/BigGoals.kt` | 补 zoowy 拆计划/讨论/加小目标/移出；链状态标签；ShiftDialog 起始日与「挪了 N 项」 |
| `ui/WishScreen.kt` | `applied`→`confirmed`；过滤 status、上下架；RedeemConfirmSheet；记录行撤回/已收到 + 2h 窗口；表单联动与校验 |
| `ui/PartnerScreen.kt` | 新增 ta 大目标 / 分享板块 / 7 天折线 / 验收详情 / 状态详情 5 个 Composable；ComparePanel 图表化；折叠抽屉；字段渲染与确认框 |
| `ui/ChatScreen.kt` / `HallScreen.kt` | 多行输入 + 头像 + 分页 + 标记已读；撤回/接受二次确认 |
| `ui/MeScreen.kt` | 新增 MeHeader / DiarySection / PairCard / 我的画像 / 数据导出 / 关于行；修积分系数里程碑、改密码、登出、统计口径、流水；通用 PixelConfirmDialog |
| `ui/AppViewModel.kt` | checkin 透传 evidenceId 与 bonus toast；getHome 错误不吞；logout 调 API；pairStatus 状态；markChatRead 接线；合并 ChatPartner |
| `ui/MainScaffold.kt` / `MainActivity.kt` | 传 tab 切换回调；处理通知 `open_diary` 落地页 |
| `build` | 给 `android/` 补 gradle wrapper，统一构建源 |

## 6. 已定方向：A 全量原生对齐（用户 2026-11-11 确认）

保留 Compose 架构与原生能力（应用使用时长上报 / 系统通知 / zoowy 浮标），按 P0→P1→P2 分轮补齐 5 个栏目，改完重新构建 APK 并部署云端。

### 实施进度

- [x] **统一两个 Android 副本**：合并 `footprint-android` 的 `ChatPartner` 修复到 `android/`；给 `android/` 补 `gradlew` / `gradlew.bat` / `gradle-wrapper.jar`，以后只从这一份构建
- [x] **`Api.kt` 基础层**：修 P0 DTO（bonuses→`List<BonusDto>`+`bonusText()`、`Todo.weekly`、`StageGoal.end_date`、`CheckinRequest.evidence_id`、`WishPayload.status`、`SubmitRequest` 证据字段）；补 `PartnerPageResponse`/`PendingVerification`/`GoalDetail` 字段；新增 `sendRaw` 二进制上传与 30+ 个端点封装（uploadEvidence / getGoal / previewPoints / verificationDetail / bindChainGoal / getUsageRange / pair 全套 / updateUsername / logout / profile / diaries / exportUrl…）
- [x] **骨架层**：`AppViewModel` 加 `homeError`/`retryHome`、`checkin(evidenceId)`、`loadChatMore`、打开聊天自动标已读、`pairStatus` 全套动作、`updateUsername`、`logout` 通知服务端；`MainScaffold` 传 tab 切换回调；`MainActivity` 处理日报通知落地页；`Widgets` 加通用 `PixelConfirmDialog`
- [x] **后端两处小改**：`points.js` 空数组不再误 400；`ops.js` `/api/ledger` 支持 `?type=` / `?dir=` / `?limit=` / `?before=`
- [x] **5 个栏目 P0/P1/P2 补齐**（5 个子代理并行：今天 / 目标 / 愿望单 / 我们 / 我的，共 +6746 行 Kotlin）
- [x] 统一编译修错 → `assembleDebug` 出 APK（14635587 B，2026-11-11 14:05）
- [x] 部署到云端（git archive 部署 `2ad3823` + APK 单独 scp 到 `/opt/footprint/public/app-debug.apk` 并重建镜像）
- [x] 提交推送全部改动（`2ad3823` + `26329a0`）
- [x] **真机验证**：模拟器安装最终版，首页 / 目标 / 我的 三个栏目截图正常，木质皮肤、partner-strip、5 项日历图例、AI 日报、6 色统计徽章全部渲染，无崩溃
- [x] **积分流水改成可展开**（两端，`76c7e94`）：默认只露最近 5 条，点「展开全部 N 条 / 收起」；Web 用 `list.dataset` 记忆展开态并只重渲染、不重复请求，Android 用 `remember`（切页重置回收起）。实测栗子 93 条：5 → 93（收起 ▴）→ 5

> 编译记录：基线 27s、骨架层 9s、全量最终 BUILD SUCCESSFUL。
> 云端 APK：`http://106.53.188.31:3201/app-debug.apk` → 14635587 B，Last-Modified 2026-11-11 14:06。
> 云端验证：健康检查 ok、新流水过滤生效（in 85 / out 1 / checkin 79）、积分系数 7 条里程碑完好、栗子 1721 分 / 阿白 180 分数据无损、手机端 Web HTTP 200。
>
> **已知剩余差异（非缺陷，需产品决策或机制限制）**：
> 1. 私聊图片 / 时间戳：两端 + 后端共同缺失，未做。
> 2. 删除愿望 / experience 分类 / 愿望图片 / 计划版本快照查看：两端 + 后端共同缺失，未做。
> 3. 数据导出下载：Web 同源 `<a href>` 天然带 Cookie；APK 用系统浏览器 + `Browser.EXTRA_HEADERS` 注入 `fp_token`，个别浏览器可能忽略该头导致 401。
> 4. 互享画像「分享块」勾选：后端无「查询已分享块」端点，App 保存时以当前勾选覆盖。
> 5. 一周折线图未画 Y 轴「Xh」数值标签（以图例 + 日期标签代替）；证据图用 OkHttp + Bitmap 自绘无磁盘缓存；状态预设 16 个（Web 30+ 的子集）。
> 6. 「本周 N/M」的 M 在非 weekly 目标按后端 expected 本地推算（WeekGoal DTO 无 weeklyProgress）。
