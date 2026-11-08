# 融合计划 · zoowy v2（融合 agent-whtmo）

| 项 | 值 |
|---|---|
| 版本 | v1.0（计划定稿） |
| 日期 | 2026-11-08 |
| 状态 | **第一批已实施**（2026-11-08）；逐分支拷问（grill-me）已收敛，6 个决策分支全部闭合；第二批外围能力（图片 / 搜索 / 深度思考 / 压缩摘要）待上线 |
| 基座分支 | `agent-icdi` @ `76f6e1f`（已含 `origin/main` 最新 + v1.3/v1.4 改动 + 合并提交） |
| 来源分支 | `origin/agent-whtmo` @ `58a408c` |
| 共同祖先 | `a1423fa` |
| 目标 | 把 whtmo 的聊天主线、提议/确认、规划草案、任务状态机、上下文治理融入当前 zoowy，同时保住 main 已验证的画像链路、业务功能与文档体系 |
| 落地版本 | 实现文档 `Agent工作流实现文档.md` 升 **v2.0** |
| 决策依据 | 本文附录 A 记录每轮 A/B/C 选择与理由 |

> 本文是**实施计划**，不是实现说明。代码落地后必须以 `Agent工作流实现文档.md` v2.0 为事实来源；两者冲突时以代码为准并立刻修文档。

---

## 0. 怎么读这份文档

1. **§1 现状校准** —— 先把早先分析里过时的结论纠正掉；
2. **§2 决策总览** —— 一张表看完 6 个分支的全部决定；
3. **§3–§8** —— 按分支展开：决定 / 理由 / 改动清单 / 验收点 / 明确不做；
4. **§9–§12** —— 逐文件、数据表、接口、双端的可执行清单；
5. **§13–§16** —— 分批上线、部署顺序、回归验收、风险回退；
6. **§17** —— 文档同步约定（你立的硬约定）；
7. **附录 A/B** —— 决策记录与「明确不做」清单。

---

## 1. 现状校准

早先基于 `ee43d7d` 的三份分析截图里有几处已不成立，实施前以本节为准：

| 早先说法 | 现在的实际 |
|---|---|
| GitHub `main` 是 `ee43d7d` | `origin/main` = **`498aca6`**（又多了游客模式 / 匹配大厅 / 搭子私聊 / WebSocket 私聊） |
| 「6 个文件冲突」 | 按当前基线，双方都改的是 **19 个**；另有 36 个 main 侧改动文件（与已提交的 6 个 agent 文件零重叠） |
| 「从 `origin/main` 拉集成分支再合」 | 当前 `agent-icdi` = `76f6e1f`，**已经**含 main 最新 + v1.3/v1.4 改动，工作区干净 |
| 「共用祖先 `a1423fa`」 | ✅ 仍成立 |

两条**仍成立**的观察，已在方案中处理：

- whtmo 新聊天 API 强制 `requestId`，旧 Web 聊天会收到 400 → 第一批必须同步换前端；
- `ai.js` / `docker-compose.yml` 是 whtmo 独占改动，整分支 merge 会**静默**把 `AI_*` 换成 `DEEPSEEK_*`，而 main 的 `routes/zoowy.js:16`、`routes/biggoals.js:296` 仍查 `AI_API_KEY` → 部署后 503。这是「不整分支 merge」的核心理由。

**当前仓库状态**：`agent-icdi` 领先 `origin/agent-icdi` 15 个提交、**未推送**；工作区干净；`check-schema-doc` 红（main 新增的 `pair_messages`/`hall_listings`/`hall_invites` 未登记）。

---

## 2. 决策总览

| # | 分支 | 最终决定 | 关键约束 |
|---|---|---|---|
| ① | 目标形态与基座 | **A** 当前 `agent-icdi` 上选择性移植；chat 升级为主线 + 提议/确认；不整分支 merge、不另拉集成分支；单套替换不并存 | 保留 main 的画像管线、注册配对/大厅/私聊、静态缓存修复 |
| ② | 模型与凭据 | **C→B→部署级→A**：全面切 DeepSeek、彻底删百炼、永久只留管理员写好的一份部署级 Key、整条删 `providerConfig` 链路 | 固定 `api.deepseek.com`、`AI_*` 全清、不留回退、用户永不填 Key |
| ③ | 写入权限模型 | **A→A→A**：按授权来源分级；一次确认按提议聚合；`skipConfirm` 删掉 | 明确请求的单条写入直写；模型主动提议/批量/画像改动才确认；后台工作流写后告知+回滚 |
| ④ | 规划链路 | **A→A**：whtmo `planning` 三件套为唯一草案链路，删旧 `planIntro/confirm`，扩展 `big_goal_id` | 单条直写与批量草案按粒度分工；大目标页按钮带 id 拉起聊天 |
| ⑤ | 上下文与记忆 | **A→A**：`user_profiles` 唯一真值来源；指令与资料分层；超预算分级降级 | `zoowy_preferences` 不建表；规划偏好并入画像专门块；`compactions`/`budget` 作聊天层增强 |
| ⑥ | 交付与验收 | **A→A→A→A**：主干一次上、当前工作区直接做、回归自动化只跑静态+离线 mock、部署前数据副本预演 | 合回 main = 代码集成完成；云端部署另立一步；文档与代码同提交 |

---

## 3. ① 目标形态与基座

### 决定

以 `agent-icdi`（`76f6e1f`）为基座做**选择性移植**；chat 升级为「聊天主线 + 提议/确认」；保留 `progress`/`daily` 两个后台工作流与规划能力、整条画像管线、以及 main 新增的注册配对 / 匹配大厅 / 搭子私聊 / WebSocket / 静态缓存修复。**单套替换，不并存、不留开关。**

> 表述微调（已确认接受）：① 原说「4 工作流骨架保留」，精修为「保留 progress/daily 两个后台工作流 + 规划能力，但 `workflows/plan.js` 这一具体实现由 planning 三件套取代」。

### 理由

1. 基座已含 main 最新与已验证的 v1.3/v1.4（loop 降级、对话落库、大目标直建直读），另起炉灶要重做并重新面对 19 个双方改动文件；
2. 整分支 merge 有**静默破坏**（`ai.js`/`docker-compose.yml` 独占改动），git 不报冲突、上线才炸；
3. whtmo 是「替换」不是「增强」（chat 变唯一主线、删 `/zoowy/plan/*`、`plan.js` 成孤儿），全盘接收会丢 main 的通用画像链路；
4. main 有 `p0-check.js`、`check-agent-doc.js`、`check-schema-doc.js` 三个可运行兜底，whtmo 没有专项回归脚本，在它没有回归网的基座上做反向移植风险不可控。

### 改动清单

- 只按模块摘取 whtmo 的**纯新增文件**；不执行 `git merge origin/agent-whtmo`；
- 现有文件逐个人工裁决（见 §9）。

### 验收点

- 合并结果不含任何「whtmo 独占改动被静默采用」的未处理项；
- 注册配对 / 大厅 / 私聊 / 静态缓存修复的接口仍 200。

### 明确不做

不整分支 merge、不从干净 `origin/main` 拉集成分支、不用 worktree 隔离目录、不留两套提示词/工具并存。

---

## 4. ② 模型与凭据

### 决定（四层子决策）

1. **全面切 DeepSeek**，百炼下线；
2. **彻底删**：固定 `https://api.deepseek.com`、删除 `AI_BASE_URL/AI_API_KEY/AI_MODEL` 全部引用、`AI_*` 全清、**不留回退分支**；
3. **永久只做部署级 Key**：管理员在服务器 `.env` 写一份 `DEEPSEEK_API_KEY`（+ `DEEPSEEK_MODEL`），两人共用；**用户永远不填、看不到 Key**；
4. **整条删 `providerConfig` 链路**：`ai.js` 永远直接读 `aiConfig()`；双端设置页去掉 Key 输入框，只留只读模型显示。

### 已自查的事实

| 事实 | 结论 |
|---|---|
| 当前 `ai.js` | 百炼版，`AI_BASE_URL/KEY/MODEL`、`qwen-plus`、`ai.chat(db, opts)` 无 `providerConfig` |
| `AI_*` 代码引用 | **仅 8 处**：`ai.js` 6 处 + `routes/biggoals.js:296`、`routes/zoowy.js:16` |
| 4 个 `ai.chat()` 调用点 | `gateway.js` / `plan.js` / `progress.js` / `daily.js` 都不传 `providerConfig` → 换 whtmo 版 `ai.js` 后自动回落部署级 `aiConfig()`，**零改动** |
| `docker-compose.yml` | `AI_API_KEY=${AI_API_KEY:?...}` 是**必填**，不改容器起不来 |
| 本地 `.env` | 只有 `AI_*`，无 `DEEPSEEK_*` |
| `providerConfig` 触点 | **8+ 文件**：`routes/zoowy.js`、`workflows/chat.js`、`chat-context.js`、`planning-generation.js`、`gateway.js`、`ai.js`、Web `zoowy.js`、Android `Api.kt`+`ZoowyScreen.kt` |
| 云端 | 公网 IP + 3201 **明文 HTTP**、无域名无 HTTPS、Android 只能 debug 包 |

### 改动清单

- `ai.js` → 采用 whtmo 版并**删掉** `Object.hasOwn(opts,'providerConfig') ? ... : aiConfig()` 一行、删 `providerConfig` 形参；保留 `DEEPSEEK_MODELS` 白名单、`thinking/reasoning_effort/max_tokens`、`finish_reason` 细分、`tool_calls` 完整性校验、`assertContextBudget`、`redirect:'error'`；
- `docker-compose.yml` → `DEEPSEEK_API_KEY`（必填）、`DEEPSEEK_MODEL`，删 `AI_*`；
- `.env` → 新增 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`，删 `AI_*`；
- `routes/zoowy.js:16`、`routes/biggoals.js:296` → 改用 `aiAvailable()`（不再硬编码 `AI_API_KEY`）；
- 所有 `runChat`/`runAgentLoop`/`compactChat`/`generateProposal` 的 `providerConfig` 形参删除；
- `searchDeepSeek` 的 `apiKey` 显式取 `aiConfig().apiKey`；
- 「图片仅 `deepseek-flash`」判断改读 `DEEPSEEK_MODEL`；
- 两处 `if (!providerConfig) 503` 检查删除；
- Web 设置弹层、Android `ZoowySettings` 的 Key 输入框删除，只留只读模型显示；
- 文档 §10 / README / 运维备忘 / 部署计划里的 `AI_*` 换 `DEEPSEEK_*`。

### 验收点

- 容器在无 `AI_*` 变量时能正常启动；
- 4 个旧工作流（日报/进度/plan/聊天）用 DeepSeek 均能出结果；
- `aiAvailable()` 在 `DEEPSEEK_MODEL` 配错时给出明确 `invalid_model`；
- 全仓搜不到 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` / `qwen` / `dashscope` / `providerConfig`。

### 明确不做

不做双提供方适配层、不做账号级加密 Key、不建 `zoowy_model_settings` 表、不搬 `deepseek-settings.js` / `routes/deepseek.js`、不需要 `DEEPSEEK_CREDENTIAL_KEY`、HTTPS 降级为独立安全项（不阻塞本融合）。

---

## 5. ③ 写入权限模型

### 决定（三层子决策）

**按授权来源分级**（不是按「是不是写操作」一刀切）：

| 场景 | 处理 |
|---|---|
| 用户明确请求的、单条、可撤销的写入<br>「帮我建个大目标」「给 id 2 配第一期小目标」「日期推后 3 天」 | **保持直接写**：`create_big_goal` / `create_plan_goal` / `shift_plan_dates` 不动 |
| 模型主动提议 / 批量 / 影响长期记忆的写入<br>画像补丁、批量重排、长期偏好 | **提议 → 用户确认卡片 → 服务端事务写入** |
| 后台无用户在线的 `progress` / `daily` | **保持「先写 + 告知 + 版本回滚」不变**，不套确认卡片 |

**确认粒度**：一次确认、按「提议」聚合；一张卡片展示具体改动（改哪几块 + before/after 摘要 + reason，直接复用 `profile_changes` 的字段）；重复点确认返回已存 `result`（幂等）；30 分钟新鲜度，过期 409；确认时**重新读取当前值**，与提议时 `before` 不一致则拒绝并提示刷新；画像标失效（`delete`）不二次确认（可回滚），正式目标的批量覆盖仍按待办计划 1.8 二次确认。

**`skipConfirm` 删掉**：清掉双端 UI 开关、`settings.js` 返回值、`routes/auth.js` 的 PUT 接受、文档 §11-1；**`user_settings.skip_confirm` 列保留但不再读写**（不 `DROP COLUMN`，因为 `export.js` 备份白名单含 `user_settings`，删列会破坏恢复链路）。`reportChanges` 保留。

### 理由

1. 权限模型的本质是「有没有授权」，不是「是不是写」——用户说「帮我建」已经授权，再弹确认是多余摩擦；
2. 后台任务没有用户在线，套确认 = 丢掉自动画像能力或引入「待确认队列」这种新产品行为，且与已跑通的 `profile_changes`/`profile_versions`/`reportChanges`/双端告知 UI 全面冲突；
3. 待办计划 1.8 自己写着「**免授权省的是弹窗，不是决策**」——收口后卡片=决策，`skipConfirm` 能跳过的只剩决策，与硬边界冲突；且 §11-1 记着它**从未接线**，趁融合清掉比重新接线省事；
4. 保住用户明确要的「AI 直接建大目标」——全盘收口会把它推翻。

### 改动清单

- 新增 `offer_profile_patch` 类工具 + 确认接口（**不能直接照搬** whtmo 的 `offer_preference`，它只管一条 `plan_detail`，要扩展到通用画像补丁）；
- `patch_my_profile` 从 `chat` 白名单移除，`progress`/`daily` 白名单保留；
- Web 聊天页新增 `zc-card` 卡片体系（当前只有气泡渲染）、Android 新增确认卡片；
- `skipConfirm` 全触点清理（DB 列除外）；
- 待办计划 1.8 的「删除/覆盖再确认一次」按风险重新界定适用范围，写进文档。

### 验收点

- 用户说「帮我建个大目标」→ 直接建，不弹卡片；
- 模型主动要改画像 → 出卡片，未确认时 `user_profiles` 无变化；
- 重复点确认不产生第二次写入；30 分钟后点确认返回 409；
- 确认时若画像已被日报改过 → 拒绝并提示刷新；
- 后台日报/进度仍能自动更新画像并写入 `profile_changes`。

---

## 6. ④ 规划链路

### 决定

**whtmo `planning` 三件套为唯一草案/确认/写入链路，删掉旧 `planIntro/confirmPlan`**；但扩展 `planning_drafts` 支持 `big_goal_id`：

- 加 `big_goal_id INTEGER REFERENCES big_goals(id)` 列（**加列，不塞 JSONB**，要参与归属校验/外键/`FOR UPDATE`）；
- `offer_new_plan` 的 payload 加**可选** `bigGoalId`，值由 `runChat` 上下文带入，**不让模型自己编 id**；带 `bigGoalId` 时允许 `weeklyMinutes` 为空，交给 `planning-rules` 的「问一个问题」分支，避免模型瞎编；
- `applyProposal` 有 `bigGoalId` 时**复用已有大目标、只建小目标** + 设置 `prerequisite_goal_id`；无值时才新建大目标；
- `startReplanDraft` 从「只挪日期」扩展到「增删/重排步骤」，并移植 main `shift_plan_dates` 的「只碰 `plan_status='planned'`、进行中/待验收/已达成锁死」规则；
- `confirmDraft` 事务里 `SELECT big_goals ... FOR UPDATE` 校验 owner + `status='active'`，并**重读链上 `plan_order` 最大值与未完成项状态**，与草案生成时不一致 → 409 提示刷新；
- 大目标页「让 zoowy 帮忙拆」改成 `ZoowyChat.open({ bigGoalId })` 拉起聊天（main 已支持该参数），Android 大目标页拉 `ZoowyScreen(bigGoalId)`；
- **边界**：单条明确请求由 `create_big_goal`/`create_plan_goal` 直写；「帮我规划一下六级备考」这类批量/多步骤才走草案 → 确认卡片。按「单条 vs 一批」分工，不重复实现。

### 理由

1. 只有一套草案写入链路，避免两边都写 `goals`/`plan_versions` 导致快照互相覆盖；
2. `confirmDraft` = `FOR UPDATE` + `revision` 乐观锁 + 单事务 + 重复确认幂等，明显强于 `confirmPlan` 的逐条 try / 失败 skip；
3. `planning-generation.js` 的规则校验（`step-N` 依赖链、时间预算、场地未确认时首步必须是确认场地、截止日期只从用户原话正则抽）是 main 没有的幻觉控制；
4. **必须补 `big_goal_id`**：whtmo 的 `applyProposal` 总是 `INSERT INTO big_goals`，`startReplanDraft` 对已有目标只支持挪日期，大目标页入口还被删了——全盘照搬会丢掉「给已有大目标配小目标」这个刚做好的能力。

### 改动清单

- 新增 `planning.js` / `planning-rules.js` / `planning-generation.js`；
- 删 `workflows/plan.js`、`routes/biggoals.js` 的 `/zoowy/plan/intro` `/confirm`、`public/js/pages/biggoal.js` 的 `runFlow`；
- `planning_drafts` 加列；`offer_new_plan` JSON Schema 放宽 `weeklyMinutes`；
- 双端大目标页按钮改造；
- 文档 §6.1 / §4 / §11 / §12 同步。

### 验收点

- 已有大目标（如「考六级」id=2）能配小目标，不会新建第二个大目标；
- 草案重复确认只应用一次；过期草案 `revision` 冲突返回 409；
- 用户在大目标页手改过链后，旧草案确认被拒绝并提示刷新；
- `plan_versions` 只有一条写入链路的快照。

---

## 7. ⑤ 上下文与记忆

### 决定

**长期记忆**：`user_profiles` + `profile_versions` + `profile_changes` 为**唯一真值来源**；`zoowy_preferences` **不建表**，「规划偏好」并入 `user_profiles` 一个受服务端白名单校验的专门块（如 `planning_preference`，值域沿用 `next_step`/`full_plan`）。

**聊天层上下文治理**（与长期记忆分层，保留）：`zoowy_compactions`（会话摘要，只进本轮 prompt、不写画像、不触发留痕）、`context-budget`（预算）、统一后的上下文组装器。

**组装器 `buildChatContext()` 四层**：

1. `system` **只放指令**：`PERSONA` + `DEFAULT_PROTOCOL v1` + 本轮开关说明；
2. `user`「本轮上下文（**作为资料**）」：结构化快照，按优先级分段、可计量；
3. 历史：`chatHistory()` 的 `zoowy_compactions` 摘要 + `pickRecentHistory()` 按预算取原文；深度思考时历史也作为资料；
4. 末条 `user`：用户消息 + 可选图片 + 链接片段。

**截断优先级**（先保留 → 先丢）：用户本轮消息 → system 指令 → 图片预留(1152/张) → 画像 active 块 → 当前讨论的大目标+链 → 进行中目标/今日打卡 → 最近日报 → 近 7 天时长 → 历史原文（有摘要兜底）。

**超预算**：**分级降级**，按优先级自动丢低价值段，不报错；响应里提示「本轮省略了部分背景」，并在 `ai_calls.detail` 记 `context_trimmed` 列出丢了哪些段。**不**直接 413、**不**自动触发 `compactChat` 重试。

**去重**：删 `chat-status.js`（只有 3 个计数 + 6 个大目标状态，main 的 6 类快照已覆盖且更全），保留 main 的查询但改成可分段计量。

### 理由

1. ③ 已定「聊天里画像改动 → 提议确认 → `applyProfilePatch`」→ 天然写 `user_profiles` + 版本 + 留痕；再建 preferences 表会让同一次偏好写两处，且 `revision`/advisory lock 与 `profile_versions` 重复；
2. main 的画像管线是**超集**（diff 裁决、reason/evidence、标失效、快照、摘要、`reportChanges`、双端红点/明细/回滚），whtmo preferences 只有一条 key、两个枚举值；
3. main 把结构化数据塞进 `system` 有**提示注入风险**（画像内容可能含「忽略以上规则」），whtmo 的「指令/资料分层」更正确；
4. 分级降级不中断对话、不多调模型、不烧额度；但**必须告知省略了什么**，否则用户以为 AI 看了全部数据，反成新幻觉来源（与 `reportChanges` 同一精神）。

### 改动清单

- 新增 `buildChatContext()`（重构 `buildUserContext` 为 `parts[]` 可计量）；
- `assertContextBudget` 改成返回可丢段清单（或新增 `trimContext()`）；
- whtmo `chat.js` 里 `listPreferences`/`offer_preference`/`zoowy_preferences` 相关代码改写成读写 `user_profiles.planning_preference`；
- Web「zoowy 设置」偏好卡、Android `ZoowySettings` 偏好部分合并到「我的画像」；
- 文档 §6.4 流程重写。

### 验收点

- 画像里写入「忽略以上规则」不会被当指令执行；
- 超预算时响应带省略提示、`ai_calls` 有 `context_trimmed`；
- 用户说「以后都先给完整路线」→ 只写 `user_profiles` 一处，`profile_changes` 有留痕。

---

## 8. ⑥ 交付与验收

### 8.1 上线批次

**第一批（主干，必须一次上）**——链路端到端依赖，中间缺一环跑不通：

- ② `ai.js` 换 DeepSeek + compose/env/2 处 503 检查 + `AI_*` 全清；
- ① `chat.js` 新骨架 + `zoovy-turns`/`turn-cancel`/`gateway` + `routes/zoovy.js` 的 5 个接口；
- ③ 权限分级 + `offer_profile_patch` 确认卡片 + 双端卡片 UI；
- ④ `planning` 三件套 + `planning_drafts.big_goal_id`；
- ⑤ `buildChatContext` 统一 + `context-budget` 分级降级；
- 文档 v2.0 + 两个校验脚本同步（同提交）。

**第二批（外围，可独立验收）**：`zoovy-media.js`（图片/链接抓取 + SSRF）、`deepseek-search.js` + `search_web`、`compactChat` 摘要生成（`zoowy_compactions` 表第一批建但不写）、`deepThinking` 深度思考、`zoowy_attachments` 表。

**明确不做**：`zoowy_model_settings` / `zoowy_preferences` 两张表、`routes/deepseek.js`、双端 Key 录入 UI、主密钥、HTTPS 前置。

### 8.2 分支策略与「上线」定义

- **不另拉分支、不用 worktree**，直接在当前 `agent-icdi` 工作区改；
- **开工前先 `git push` 一次**（领先远程 15 个提交，等于免费备份）；
- 做完后向 `main` 提 PR（或本地 merge 回 main 再推），**合回 main = 代码集成完成**；
- **云端部署是单独一步**，不与代码集成混在一起。

### 8.3 回归策略（四层）

| 层 | 内容 | 自动化 |
|---|---|---|
| 1 静态 | `check-agent-doc.js`（标记块）、`check-schema-doc.js`（**随第一批修红**）、全量 `node --check` | ✅ 每次提交必跑 |
| 2 离线行为 | **新固化 `app/.smoke/agent-v2.js`**：把前几轮临时 mock 脚本（15 + 19 项）收进去，覆盖模型适配、权限分级、提议确认新鲜度/幂等/重读链状态、草案 `big_goal_id` 归属、画像唯一真值、上下文降级留痕、白名单越权、参数校验、同名幂等 | ✅ 自动化 |
| 3 真实联调 | 本地服务 + 部署级 Key：5 个 zoowy 接口 200、聊天直建大目标、提议卡片确认写入、日报/进度仍能跑 | ❌ 手动脚本，不进自动化 |
| 4 双端与部署前 | Android Studio 编译 + 真机点卡片；Web 刷新；云端部署前用**现有数据副本**回归 | ❌ 人工 |

既有脚本处理：

- `agent-full.js`（真调百炼、依赖测试服务 3001）→ ② 后必然失效，**保留但标注手动、把调用换成 DeepSeek**；
- `p0-check.js` 第 6 组「4 工作流可写画像」按 ③ 调整（聊天改提议确认、progress/daily 仍直写）；
- `p1-check.js` 计划链用例按 ④ 调整；
- `check-schema-doc` 红项随第一批修好（main 3 张表 + 新增表 + 加列 → 数据库文档 §3/§4/§11）。

### 8.4 部署顺序（云端 3201）

1. 拿到 `DEEPSEEK_API_KEY`，写进**测试**环境（不是云端）；
2. 把云端现有数据**复制一份**到本地测试库（`pg_dump` / `restore.js`，运维备忘已有做法）；
3. 副本 + 新代码 + 真 DeepSeek Key 起测试服务，预演四类：4 个老功能（重点验 **DeepSeek 的 JSON 输出**）、5 个新接口、聊天直建大目标 + 卡片确认写入、Web 刷新 + Android 真机点卡片；
4. **全库备份**（`pg_dump` 或 Web「立即快照一份」）；
5. 低峰期一次部署：`.env` 换 `DEEPSEEK_*` / 删 `AI_*`、compose 换变量、`docker compose up -d --build`；服务启动自动建表与加列；
6. **补 `export.js` 备份白名单**（当前缺 whtmo 新表，不补会漏备份）；
7. 部署后验 `/healthz` + 4 个老功能 + 5 个新接口；
8. Android 重新 Sync + 打 **debug 包**（明文 HTTP 只能用 debug）；
9. 出问题：② 不留回退，只能**回滚代码 + 恢复备份**（运维备忘已有流程）。

### 8.5 风险与回退

| 风险 | 缓解 |
|---|---|
| DeepSeek 的 `response_format: json_object` 行为未验证（百炼已验证） | 部署前数据副本预演，重点跑 4 个老功能 |
| 不留回退，部署即全量切换 | 全库备份 + 代码回滚点 `76f6e1f` + 运维备忘既有 `pg_restore` 流程 |
| `export.js` 白名单漏新表 | 部署第 6 步强制补，回归脚本断言 |
| 前后端版本错配（新聊天强制 `requestId`） | 后端与静态资源**同一次部署**，部署后 Web 刷新验证 |
| 明文 HTTP 传聊天内容 | 独立安全项，不阻塞本融合；长期公开前上 HTTPS 或 `SIGNUP_OPEN=0` |
| 15+ 文件改写与并行会话撞车 | 开工前 push 备份 + 记住 `76f6e1f` 回退点 |

---

## 9. 逐文件改动清单

| 文件 | 动作 | 来源 | 说明 |
|---|---|---|---|
| `app/src/ai.js` | **替换 + 删** | whtmo | 固定 DeepSeek、删 `providerConfig`、删百炼全部引用 |
| `app/src/agent/gateway.js` | **改** | whtmo | 3 轮 + 取消 + `runTool`；`MAX_TOOL_ROUNDS` 按合并后工具集定（建议 6） |
| `app/src/agent/session.js` | **改** | whtmo | `tx` + advisory lock、`appendMessage` 返回 id（main 不依赖，兼容） |
| `app/src/agent/tools.js` | **改（取 main 为主）** | main + 两点增强 | 保留 13 工具与画像管线；吸收「参数必须对象」「结果 >4000 返回错误」；`chat` 白名单按 ③ 分级 |
| `app/src/agent/workflows/chat.js` | **重写** | whtmo 骨架 | 移植 main 的画像管线、v1.3 先落 user/失败补记录、v1.4 大目标工具引导 |
| `app/src/agent/workflows/plan.js` | **删** | — | 被 planning 三件套取代 |
| `app/src/agent/workflows/progress.js` / `daily.js` | **保留** | main | 保持写后告知 + 回滚，重接画像管线 |
| `app/src/agent/workflows/planning.js` / `planning-rules.js` / `planning-generation.js` | **新增** | whtmo | 唯一草案链路；扩展 `big_goal_id` |
| `app/src/agent/zoovy-turns.js` / `turn-cancel.js` | **新增** | whtmo | 任务状态机、幂等、取消 |
| `app/src/agent/context-budget.js` | **新增** | whtmo | 预算 + `pickRecentHistory`；`assertContextBudget` 改成分级降级 |
| `app/src/agent/chat-context.js` | **新增（部分）** | whtmo | `chatHistory`/`zoowy_compactions` 读取第一批；`compactChat` 生成第二批 |
| `app/src/agent/chat-status.js` | **不搬** | — | 与 main 6 类快照重复，删 |
| `app/src/agent/deepseek-settings.js` / `routes/deepseek.js` | **不搬** | — | 账号级 Key 已否掉 |
| `app/src/agent/zoovy-media.js` / `deepseek-search.js` | **第二批新增** | whtmo | 图片/链接/搜索 |
| `app/src/routes/zoovy.js` | **合并** | 两边 | whtmo 的 5 个接口 + main 的 `profileChanges`/`failed` 字段 |
| `app/src/routes/biggoals.js` | **改** | 两边 | 删 `/zoovy/plan/*`；改 `aiAvailable()` |
| `app/src/routes/auth.js` | **改** | main | 删 `skipConfirm` 读写（DB 列留） |
| `app/src/index.js` | **合并** | 两边 | 静态 `no-cache` 修复 + 新路由挂载 + `app.listen(PORT, HOST)` |
| `app/src/settings.js` | **改** | main | 不再返回 `skipConfirm` |
| `app/src/db.js` | **改** | 两边 | 新增 4 张表 + `planning_drafts.big_goal_id` 加列；不建 2 张表 |
| `app/src/export.js` | **改** | main | 备份白名单补新表 |
| `docker-compose.yml` / `.env` | **改** | 两边 | `AI_*` → `DEEPSEEK_*` |
| `public/js/pages/zoovy.js` | **重写** | whtmo | 卡片体系、requestId、停止、开关；去掉 Key 录入 |
| `public/js/pages/biggoal.js` | **改** | main | 删 `runFlow`，按钮带 `bigGoalId` 拉起聊天 |
| `public/js/pages/me.js` | **改** | main | 删「免确认」开关；偏好并入「我的画像」 |
| `public/css/app.css` | **合并** | 两边 | 卡片样式 |
| `android/.../ZoovyScreen.kt` / `ZoovyModels.kt` | **新增** | whtmo | 独立聊天页；去掉 Key 录入 |
| `android/.../Api.kt` / `MeScreen.kt` / `BigGoals.kt` | **合并** | 两边 | zoowy 方法 + 画像变更区块 + 大目标按钮带 id |
| `app/.smoke/agent-v2.js` | **新增** | 本计划 | 固化离线 mock 回归 |
| `app/.smoke/agent-full.js` | **改** | main | 标注手动、调用换 DeepSeek |
| `app/.smoke/p0-check.js` / `p1-check.js` | **改** | main | 按 ③④ 调整用例 |

---

## 10. 数据表变更

| 表 | 批次 | 说明 |
|---|---|---|
| `planning_drafts` | 第一批 | whtmo 原有 + **新增 `big_goal_id INTEGER REFERENCES big_goals(id)`** |
| `zoowy_compactions` | 第一批 | 会话摘要表；第一批建但不写（`compactChat` 第二批） |
| `zoowy_turns` | 第一批 | 任务状态机、幂等、取消 |
| `zoowy_offers` | 第一批 | 提议卡片、30 分钟新鲜度、`result` 幂等 |
| `zoowy_attachments` | 第二批 | 随图片能力上线 |
| `zoowy_model_settings` | **不建** | 账号级 Key 已否掉 |
| `zoowy_preferences` | **不建** | 规划偏好并入 `user_profiles.planning_preference` |
| `user_settings.skip_confirm` | **留列不读** | 不 `DROP COLUMN`（`export.js` 恢复链路依赖列结构） |
| `goals.prerequisite_goal_id` | 第一批 | 由 `applyProposal` 设置，形成前置依赖链 |

**文档同步**：`数据库设计实现文档.md` §3/§4/§6/§11 补上述内容，并**补 main 遗留的 `pair_messages` / `hall_listings` / `hall_invites` 三张表**，让 `check-schema-doc` 变绿。

---

## 11. 接口清单（第一批）

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/zoowy/chat` | 重写；强制 `requestId`；单条直写 / 提议卡片 |
| `GET` | `/api/zoowy/messages` | 增强；返回 `cards` / `sources` / `profileChanges` / `failed` |
| `POST` | `/api/zoowy/turns/:requestId/cancel` | 取消本轮 |
| `POST` | `/api/zoowy/offers/:id/accept` | 用户点确认；事务写入 |
| `POST` | `/api/zoowy/drafts/:id/confirm` | 应用指定草案版本 |

**删除 / 不搬**：`/zoowy/plan/intro`、`/zoowy/plan/confirm`、`/zoowy/compact`（随第二批）、`/zoowy/model`（账号 Key）、`/zoowy/preferences`（偏好并入画像）。

**保留**：main 全部既有接口，含 `/api/me/profile/changes`、`/api/me/settings`、`/api/pair/status`、`/api/hall`、`/api/biggoals` 等。

---

## 12. 双端改动

| 端 | 改动 |
|---|---|
| Web | 聊天页重写（卡片/停止/开关/来源）、大目标页按钮改拉起聊天、「我」页删免确认开关、CSS 卡片样式 |
| Android | 新增 `ZoovyScreen` / `ZoovyModels`、`Api.kt` 加 zoowy 方法、`MeScreen` 删免确认开关、`BigGoals` 按钮带 id |
| 部署 | Android 重新 Sync + **debug 包**（明文 HTTP）；后端与静态资源同一次发布 |

---

## 13. 分批上线总表

| | 内容 |
|---|---|
| **第一批** | 模型切换 + 聊天骨架 + 提议/确认 + 草案 + 画像管线 + 上下文预算 + 双端卡片 + 4 张表 + 文档 v2.0 + 校验脚本 |
| **第二批** | 图片/链接抓取（含 SSRF）、联网搜索、`compactChat` 摘要生成、深度思考、`zoowy_attachments` 表 |
| **明确不做** | 账号级 Key 体系、`zoowy_model_settings` / `zoowy_preferences` 表、双端 Key 录入 UI、主密钥、HTTPS 前置、百炼回退分支 |

---

## 14. 文档同步约定（硬性，与代码同一个提交）

> 你于 2026-11-07 立的约定：任何涉及 agent 工作流的改动，必须在同一个提交里同步更新 `Agent工作流实现文档.md`，并在 §12 追加一行变更记录；触发清单与最小动作见该文档 §0。

本计划落地时必须同步：

1. `Agent工作流实现文档.md` 升 **v2.0**：拓扑从「1 网关 + 4 工作流」改写为「单聊天主线 + 可插拔工作流」，§0.2 / §3.1 / §5.2 / §5.3 / §5.4 / §6 / §9 / §10 / §11 / §12 全量对齐；`AGENT_TOOLS` / `AGENT_WORKFLOWS` 标记块同步；§12 追加 v2.0 一行；
2. `数据库设计实现文档.md` 补 4 张新表 + `big_goal_id` 列 + main 遗留 3 张表，`check-schema-doc` 跑绿；
3. `README.md`、 `云端运维备忘.md`、`部署计划-两人自用-IP直连.md`、`待办计划-AI工作流与双端改造.md`、`工作文档-zoowy工作流改造.md` 里的 `AI_*` 换 `DEEPSEEK_*`；
4. `check-agent-doc.js` 标记块随白名单变化同步；
5. 本文状态从「待实施」改为「已实施 / 已归档」。

---

## 附录 A · 决策记录（逐轮拷问）

| 分支 | 问题 | 选择 | 被否掉的选项 |
|---|---|---|---|
| ① | 目标形态与基座 | **A** 当前分支选择性移植、单套替换 | B 干净 main 拉集成分支 + PR；C 只取可靠性三件套 |
| ②-1 | 端点/切分维度 | **C** 全面切 DeepSeek | A 双提供方默认百炼；B 按工作流切 |
| ②-2 | 「下线」边界 | **B** 彻底删、不留回退 | A 带回滚通道；C 只改配置 |
| ②-3 | 凭据归属 | **部署级，用户永不填 Key** | 账号级加密 Key；只做账号级（后台任务会 `no_key`） |
| ②-4 | `providerConfig` 链路 | **A** 整条删 | B 保留参数链服务端填充；C 加密存库管理员写入 |
| ③-1 | 收口边界 | **A** 按授权来源分级 | B 全部收口；C 只收口批量 |
| ③-2 | 确认粒度 | **A** 一次确认按提议聚合 | B 所有删除/覆盖二次确认；C 逐条确认 |
| ③-3 | `skipConfirm` | **A** 删掉（DB 列留着不读） | B 只控制呈现方式；C 保留原语义 |
| ④-1 | 规划取舍 | **A** planning 唯一 + 扩展 `big_goal_id` | B 全盘照搬 whtmo；C main 为主只移植校验 |
| ④-2 | 入口与 id 形态 | **A** 按钮带 id 拉起聊天 + 加列 | B 页内嵌卡片；C 保留 runFlow |
| ⑤-1 | 长期记忆真值来源 | **A** `user_profiles` 唯一 | B 两套并存；C 以 preferences 取代 |
| ⑤-2 | 超预算策略 | **A** 分级降级 + 告知 + 留痕 | B 直接 413；C 自动压缩重试 |
| ⑥-1 | 上线批次 | **A** 主干一次上、外围第二批 | B 先只上聊天继续百炼；C 一次性全上 |
| ⑥-2 | 分支策略 | **A** 当前工作区直接做、合回 main 即完成 | B worktree 隔离；C 先部署验证再合 main |
| ⑥-3 | 回归策略 | **A** 自动化只跑静态+离线 mock | B 真调 AI 也自动化；C 不新增回归 |
| ⑥-4 | 部署前置 | **A** 数据副本预演 → 备份 → 一次部署 | B 直接部署；C 分步临时停日报/进度 |

---

## 附录 B · 明确不做（防止范围 creeping）

- 不做双提供方 / 百炼回退分支、不保留 `AI_*` 任何代码引用；
- 不做账号级 API Key 录入、不建 `zoowy_model_settings` / `zoowy_preferences`、不要主密钥、不把 HTTPS 当本融合前置；
- 不建两套长期记忆、不建两套草案写入链路、不留 `workflows/plan.js` 孤儿文件；
- 不留 `skipConfirm` 开关（DB 列除外）、不留两套提示词/工具并存；
- 不把真实模型调用写进自动化回归、不新增 `/zoowy/model` 接口；
- 第一批不做图片、联网搜索、链接抓取、深度思考、压缩摘要生成。
