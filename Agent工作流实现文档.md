# 脚印 · Agent 工作流（zoowy）实现与技术文档

| 项 | 值 |
|---|---|
| 适用范围 | 服务端 `app/src/agent/`、`app/src/ai.js` + 触发路由 + Web / Android 入口 |
| 唯一真源 | `app/src/agent/` 下的实现（本文描述代码实际行为，不是设计稿） |
| 拓扑 | **单聊天主线**：chat 走 tool-calling loop；`progress` / `daily` 为后台工作流；`planning` 三件套承担规划草案 |
| 模型 | **DeepSeek 官方固定端点** `https://api.deepseek.com`，`deepseek-flash` / `deepseek-v4-pro`；只保留部署级 `DEEPSEEK_API_KEY` |
| 规模 | 13 个工具（注册表）、4 份 `WHITELIST`；chat 白名单 10 个 + 4 个动态提议工具 |
| 画像变更 | `profile_changes` 留痕 + `profile_versions` 可回滚，`reportChanges` 控制告知 |
| 文档状态 | 与代码同步，最后核对 2026-11-08（**v2.0**，分支 `agent-icdi`） |
| 校验命令 | `node app/scripts/check-agent-doc.js`、`cd app && npm run check:schema-doc` |
| 实施计划 | [融合计划-zoowy-v2.md](融合计划-zoowy-v2.md)（6 个决策分支的取舍与理由） |
| 表结构校验 | [数据库设计实现文档.md](数据库设计实现文档.md) |

> 本文是 zoowy agent 工作流实现的唯一事实来源。冲突时**以代码为准，并立刻修正文档**，不要靠记忆或口头约定。

---

## 0. 维护约定（改动前必读）

### 0.1 铁律

> **任何涉及 agent 工作流的改动，必须在同一个提交里同步更新本文档，并在 §12 追加一行变更记录。**
> 数据库结构变更还须同步 [数据库设计实现文档.md](数据库设计实现文档.md) 并跑 `npm run check:schema-doc`。

这条约定登记在 [README.md](README.md) 的「Agent 工作流（zoowy）」一节，对在本仓库工作的所有人 / 所有 AI 生效。

### 0.2 触发清单：什么改动必须更新本文

| 改动类型 | 必须更新的章节 |
|---|---|
| 新增 / 删除 / 改名工具（`IMPLEMENTATIONS`） | §3、§5.3、§5.4、§9 + `AGENT_TOOLS` 标记块 |
| 改任一工作流白名单 `WHITELIST` | §5.4、§9 |
| 改提示词、`PERSONA`、`DEFAULT_PROTOCOL` | §5.6、§6.1 |
| 改 JSON 输出 schema / 卡片类型 / 提议 payload | §6.1、§6.3、§9 |
| 改 loop 参数（轮次上限、总超时、单次超时、降级行为） | §5.2、§9 |
| 改模型客户端（端点、模型白名单、重试、解析、记账） | §2、§5.1、§10 |
| 改触发点（路由、定时器、事件挂钩） | §6、§7、§8 |
| 改数据库表 / 字段 / 约束 / 索引 | §4 + 数据库设计实现文档 |
| 改会话、隔离、可见性、分享 | §5.7、§9 |
| 改画像补丁 / 计划快照 / 提议确认规则 | §5.4、§5.5、§6.3、§9 |
| 改上下文组装 / 预算降级 | §5.8、§9 |
| 改幂等、校验、错误码、失败降级 | §5.2、§5.5、§9 |
| 改前端 / Android 入口与交互流程 | §7、§8 |
| 改环境变量或部署方式 | §10 |
| 填补 §11 里任一已知差距 | 从 §11 移除该条 + 写进 §12 |

**边界**：只改 UI 文案、纯样式、与 agent 无关的 bugfix 不触发。拿不准就算触发，多写一行比漏写强。

### 0.3 每次更新的最小动作

- [ ] 改动对应章节，保证描述与代码一致
- [ ] 复核 §3 文件地图、§4 表结构、§7 API 表、§9 边界表没有过期
- [ ] 在 §12 追加一行变更记录（日期 / 分支 / 改动摘要 / 涉及章节）
- [ ] 更新本文头部「版本 / 日期 / 状态」
- [ ] 若修掉了 §11 的差距，同步更新 README 与待办计划里的状态
- [ ] 跑 `node app/scripts/check-agent-doc.js`（工具清单 / 工作流清单一致）
- [ ] `git diff` 确认代码与文档落在**同一个提交**

### 0.4 定位方式

本文一律用 `文件 : 符号名()` 定位，**不写行号** —— 行号会随编辑漂移。在编辑器里全局搜索符号名即可定位代码。

---

## 1. 概述与定位

### 1.1 一句话

zoowy **不是通用 Agent，也不是多个 Agent**：一条聊天主线 + 两个后台工作流 + 一套规划草案链路，共用一个人设、一套模型客户端、一张工具注册表、一个 PostgreSQL 库。v2.0 融合 `agent-whtmo` 的聊天骨架、提议/确认、任务状态机、上下文治理，同时保住 main 的画像链路、业务功能与文档体系。

**核心不变量**：模型只输出意图与提议；服务端决定能不能写、写什么、留什么痕。

### 1.2 三个最重要的设计

1. **按「授权来源」分级写入**（不是按「是不是写操作」一刀切）：
   - 用户明确请求的、单条、可撤销的写入 → 直接写（`create_big_goal` / `create_plan_goal` / `shift_plan_dates`）；
   - 模型主动提议 / 批量 / 影响长期记忆的写入 → **提议卡片 → 用户确认 → 服务端事务写入**；
   - 后台无用户在线的 `progress` / `daily` → 保持「先写 + 告知 + 版本回滚」。
2. **只保留部署级 Key**：管理员在服务器 `.env` 写一份 `DEEPSEEK_API_KEY`，用户永远不填、看不到 Key；`providerConfig` 链路整条删除。
3. **长期记忆单一真值来源**：`user_profiles` + `profile_versions` + `profile_changes`；`zoowy_preferences` / `zoowy_model_settings` 不建表。规划偏好并入 `user_profiles.planning_preference` 块。

### 1.3 设计原则

1. **不伪造**：JSON 解析失败 / 正文为空 → 抛错、不写库、保留旧数据。
2. **不汇报 ≠ 不留痕**：所有 ok / skip / fail 都进 `ai_calls`；画像变更无条件写 `profile_changes` + `profile_versions`。`reportChanges` 只控制推送 / 未读 / 同步摘要。
3. **服务端裁决**：`applyProfilePatch()` 做 diff 跳过无变化、必填 `reason`、条数与长度上限；模型提议不直接写库。
4. **指令与资料分层**：`system` 只放 `PERSONA` + `DEFAULT_PROTOCOL` 指令；结构化数据放一条标注「作为资料」的 `user` 消息，避免画像内容里的「忽略以上规则」被当指令。
5. **失败不丢对话**：先落 user 消息；AI 类错误补 assistant 错误记录并降级成正常响应；loop 超限 / 超时降级返回，不抛 500。

---

## 2. 技术栈与依赖

| 层 | 选型 | 位置 |
|---|---|---|
| 运行时 | Node.js ≥ 22.13.0，CommonJS，无构建、无 TypeScript | [app/package.json](app/package.json) |
| Web 框架 | Express `^4.21.2`，单进程 + `ws` WebSocket | [app/src/index.js](app/src/index.js) |
| 数据库 | PostgreSQL（`pg` Pool），`?` 占位由 `db.js : q()` 转 `$n` | [app/src/db.js](app/src/db.js) |
| 大模型 | DeepSeek 官方端点 `https://api.deepseek.com`，模型白名单 `[deepseek-flash, deepseek-v4-pro]` | [app/src/ai.js](app/src/ai.js) |
| 调用方式 | 原生 `fetch` + `AbortController` / `AbortSignal.any`，`redirect:'error'` | `ai.js : requestOnce()` |
| 结构化输出 | `response_format: { type: 'json_object' }` + 自写宽松解析 | `ai.js : parseJsonLoose()` |
| 工具调用 | OpenAI function-calling 协议；`thinking` / `reasoning_effort` 深度思考（第二批开放）、`finish_reason` 细分、`tool_calls` 完整性校验 |
| 定时任务 | `setInterval` 5 分钟轮询（无 cron） | `daily.js : scheduleDaily()` |
| 知识库 | 不引向量库；结构化数据直接拼进上下文 | `chat.js : buildUserContext()` |
| 新增依赖 | **零**；全部 Node 内置（`node:crypto` / `node:util` / `node:net` / `node:zlib`） | — |

---

## 3. 代码地图

### 3.1 后端 `app/src/agent/`

| 文件 | 职责 |
|---|---|
| `ai.js` | 模型客户端（DeepSeek 固定端点）、`AiError` 分类、`ai_calls` 记账、上下文预算断言、`thinking` |
| `agent/gateway.js` | **唯一的 agent loop**：6 轮 / 12 工具上限 / 60s；轮次超限与超时**降级返回**（`degraded`/`reason`），不抛 500 |
| `agent/tools.js` | 13 个工具实现 + `WHITELIST` + `applyProfilePatch` 画像管线 + `snapshotPlan` |
| `agent/workflows/chat.js` | **聊天主线**：requestId 状态机、上下文组装、提议卡片、单条直写、失败补记录、`DEFAULT_PROTOCOL v2` |
| `agent/workflows/planning.js` / `planning-rules.js` / `planning-generation.js` | 唯一草案 / 确认 / 写入链路；`big_goal_id` 复用已有大目标；规则模板兜底 + 模型生成强校验 |
| `agent/workflows/progress.js` / `daily.js` | 后台工作流（验收通过后异步触发 / 23:30 定时），保持写后告知 + 回滚 |
| `agent/zoowy-turns.js` / `turn-cancel.js` | 任务状态机（`pg_advisory_xact_lock` 原子认领、requestId 幂等、24h 限额、取消、结果回放） |
| `agent/context-budget.js` / `chat-context.js` | 30 万 token 预算、`pickRecentHistory`、`zoowy_compactions` 会话摘要读取（`compactChat` 生成属第二批） |
| `agent/session.js` | 服务端会话（`ensureSession` 事务 + advisory lock；`appendMessage` 返回 id） |
| `agent/persona.js` / `agent/index.js` | 4 个工作流共用的人设、统一导出 |
| `agent/deepseek-settings.js` / `routes/deepseek.js` | **不存在**（账号级 Key 已否掉） |
| `agent/zoowy-media.js` / `deepseek-search.js` | **第二批**（图片 / 链接 / 联网搜索） |

### 3.2 支撑与接入

| 文件 | 职责 |
|---|---|
| [app/src/settings.js](app/src/settings.js) | `getUserSettings()` 单一真源，只返回 `reportChanges` / `dailyEnabled`（`skipConfirm` 已删） |
| [app/src/profileChanges.js](app/src/profileChanges.js) | 变更留痕、摘要、已读、版本列表与回滚 |
| [app/src/routes/zoowy.js](app/src/routes/zoowy.js) | 5 个第一批接口；`handle` 错误分类、`requireJson`、`no-store` |
| [app/src/routes/biggoals.js](app/src/routes/biggoals.js) | 大目标 CRUD / 计划链手改；`/zoowy/plan/*` 已删 |
| [app/src/routes/goals.js](app/src/routes/goals.js) | 目标 CRUD；导出 `createGoal` / `validateGoalBody` 供 planning 复用 |
| [app/src/routes/auth.js](app/src/routes/auth.js) | 账号 / 设置；`skipConfirm` 读写已删 |
| [app/src/export.js](app/src/export.js) | 备份白名单（含 7 张新表）与 `ORDER_BY` 映射 |
| [app/src/index.js](app/src/index.js) | 路由挂载、`server.listen(PORT, HOST)`、静态 `no-cache`、错误处理 |

### 3.3 前端与 Android

Web [public/js/pages/zoowy.js](public/js/pages/zoowy.js)：卡片体系、requestId、停止本轮、提议确认、应用草案。大目标页按钮带 `bigGoalId` 拉起聊天；「我」页删免确认开关。Android：`ZoovyScreen` / `ZoovyModels` + `Api.kt` / `MeScreen` / `BigGoals`。

---

## 4. 数据库表（agent 相关）

| 表 | 用途 |
|---|---|
| `user_profiles` / `profile_versions` / `profile_changes` | 长期画像唯一真值来源 / 快照回滚 / 变更留痕与告知 |
| `planning_drafts` | 规划草案（`big_goal_id` 非空时复用已有大目标）；`revision` / `status` / `proposal` / `result` / `chainSig` |
| `zoowy_turns` | 单轮任务状态机（requestId 幂等 / 取消 / 回放） |
| `zoowy_offers` | 提议卡片（30 分钟新鲜度 + `result` 幂等） |
| `zoowy_compactions` | 会话摘要（第一批建表不写；`compactChat` 第二批） |
| `zoowy_attachments` | **第二批**（图片） |
| `zoowy_model_settings` / `zoowy_preferences` | **明确不建**（账号 Key / 独立偏好表已否掉） |
| `goals.prerequisite_goal_id` | 草案应用时形成前置依赖链 |
| `user_settings.skip_confirm` | **留列不读**（`export.js` 恢复链路依赖列结构；不 `DROP COLUMN`） |

完整表清单与字段见 [数据库设计实现文档.md](数据库设计实现文档.md)（35 张表，`check-schema-doc` 校验）。

---

## 5. 核心机制

### 5.1 模型底座 `ai.js`

- `aiConfig()` 只读 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`；**无 `providerConfig` 参数**、无 `AI_*` 引用、无百炼回退分支。
- `aiAvailable()` 同时要求 key 存在且模型在 `DEEPSEEK_MODELS` 白名单内；两处路由的 503 检查统一走它。
- `chat(db, opts)`：`throwIfCancelled(signal)` → `body.thinking` / `maxTokens` / `response_format` → `requestOnce()`；只 `bad_json` 重试一次（网络 / 超时 / HTTP 错不重试，防烧额度）；`finish_reason` 细分 length / content_filter / aborted；`tool_calls` 完整性校验；`redirect:'error'`。
- `recordCall()` best-effort 记账；`recordSkip()` 专记「整轮跳过」。

### 5.2 网关 `gateway.js : runAgentLoop()`

**唯一的多轮 agent loop，唯一调用点是 `chat.js : runChat()`。**

| 闸 | 值 | 行为 |
|---|---|---|
| `MAX_TOOL_ROUNDS` | 6 | 先自增后判断；第 7 轮记 `fail(max_tool_rounds, degraded)` 后**降级返回**，该轮工具不执行 |
| `MAX_TOOL_CALLS` | 12 | 总工具调用上限，超限同样降级 |
| `TOTAL_TIMEOUT_MS` | 60000 | 超时降级返回，不抛 500 |

降级返回：`content = 本轮已有内容 + 「这轮查得有点多，先说到这儿。」`（超时用「这轮想得太久，先说到这儿。」），返回 `{ ..., degraded: true, reason }`。取消（`signal`）仍传播给 `runTurn` 标记 `cancelled`。工具结果回灌截 4000 字，超限返回明确错误而非静默截断；参数必须是对象且 ≤8000 字符。

### 5.3 工具注册表 `tools.js`

**13 个工具 = 7 读 + 6 写**，标记块由 `check-agent-doc.js` 校验。

| 读 | 写 |
|---|---|
| `read_my_profile` | `create_big_goal` |
| `read_my_goals` | `create_plan_goal` |
| `read_big_goal` | `shift_plan_dates` |
| `list_big_goals` | `write_big_goal_progress` |
| `read_checkins` | `write_my_diary` |
| `read_my_diaries` | `patch_my_profile` |
| `read_my_usage` | |

<!-- AGENT_TOOLS:START -->
`read_my_profile` `read_my_goals` `read_big_goal` `list_big_goals` `read_checkins` `read_my_diaries` `read_my_usage` `create_big_goal` `create_plan_goal` `shift_plan_dates` `write_big_goal_progress` `write_my_diary` `patch_my_profile`
<!-- AGENT_TOOLS:END -->

> 上面这对标记块是**机器可读清单**，由 [check-agent-doc.js](app/scripts/check-agent-doc.js) 与 `tools.js : IMPLEMENTATIONS` 比对。增删 / 改名工具时必须同步改这里，否则校验脚本非零退出。

`executeTool(db, workflow, userId, name, args)`：先查 `WHITELIST[workflow]`，不在名单直接 `fail`；`ctx = { db, userId, workflow }`，**`userId` 由服务端会话注入，工具参数里不存在该字段**。
`toolsFor()` 把白名单转成 OpenAI `tools` 格式；chat 主线用 `scopedTools` 动态注入（注册表工具 + 4 个提议工具）。

**写工具幂等**：`create_big_goal` 同名未归档查重、`create_plan_goal` 同链同名同日期查重、`write_my_diary` 查 `(user_id, diary_date)` + UNIQUE 约束。

### 5.4 白名单（按授权来源分级）

| 工作流 | 工具 | 说明 |
|---|---|---|
| `plan` | 5 | 旧工作流白名单（`/zoowy/plan/*` 路由已删，`patch_my_profile` 已清理） |
| `progress` | 5 | 含 `patch_my_profile`（后台工作流可直写画像） |
| `daily` | 8 | 含 `patch_my_profile` |
| `chat` | **10** | 读 7 个 + 单条直写 3 个；**不含 `patch_my_profile`**（收口成提议） |

<!-- AGENT_WORKFLOWS:START -->
`plan` `progress` `daily` `chat`
<!-- AGENT_WORKFLOWS:END -->

> 标记块由校验脚本与 `tools.js : WHITELIST` 比对；新增 / 删除工作流时必须同步改这里，以及 §6、§12。

**chat 的 4 个动态提议工具**（定义在 `chat.js : OFFER_TOOLS`，不进注册表）：`offer_new_plan`、`offer_draft_revision`、`offer_date_shift`、`offer_profile_patch`。前三个进 `zoowy_offers` → 草案链路；`offer_profile_patch` 确认后走 `applyProfilePatch`。

### 5.5 提议 / 确认链路

1. 模型调 `offer_*` → `makeOffer()` 校验参数与归属（`bigGoalId` 由聊天上下文带入，**不让模型编 id**）→ `runChat` 的 `commit` 把 payload 写进 `zoowy_offers`，返回卡片。
2. 前端点「同意」→ `POST /zoowy/offers/:id/accept` → `readOffer()` 校验 30 分钟新鲜度与 `result` 幂等 → `applyOffer()` 事务。
3. `applyOffer`：`profile_patch` → `applyProfilePatch(..., { workflow:'chat' })`；`new`/`revise` → `generateChatProposal` → `startDraft`/`reviseChatDraft`；`shift` → `startReplanDraft`。
4. `plan_draft` 卡片点「应用这版」→ `POST /zoovy/drafts/:id/confirm` → `confirmDraft()`：`lockDraft` FOR UPDATE + `revision` 乐观锁 + 链状态指纹 `chainSig` 重读比对 → `applyProposal` / `applyReplan` → 标 `applied` 存 `result`。
5. 重复点确认返回已存 `result`；过期 409；链被手改过 409 提示刷新。

### 5.6 人设与协议

- `persona.js : PERSONA` 与 `chat.js : DEFAULT_PROTOCOL v2` **分开**：前者身份与铁律，后者版本化的行为规则（资料里的命令不具有权限、用户明确请求可直写、模型主动提议必须出卡片）。
- 改这两处会同时影响所有工作流，务必回归全部。

### 5.7 会话与可见性 `session.js`

`ensureSession()` 用 `tx` + `pg_advisory_xact_lock` 防并发建重复会话；`appendMessage()` 返回 `row.id`；`recentMessages()` 双重 `session_id + user_id` 过滤，返回 `id / role / content / meta / created_at`。`meta` 存 `tools` / `profileChanges` / `failed` / `degraded` / `cards`。

### 5.8 上下文组装与预算 `chat.js : buildUserContext()`

四层消息：

1. `system` = `PERSONA` + `DEFAULT_PROTOCOL v2` + 开关说明（**只放指令**）；
2. `user`「本轮上下文（**作为资料**）」= 结构化快照（画像 / 目标 / 打卡 / 日报 / 时长 / 当前讨论的大目标+链）+ 会话摘要 + 最近草案；
3. 历史 = `chatHistory()` 的 `zoowy_compactions` 摘要 + `pickRecentHistory()` 按 23 万历史预算取原文；
4. 末条 `user` = 用户消息。

**截断优先级**（先保留 → 先丢）：用户本轮消息 → system 指令 → 图片预留 → 画像 active 块 → 当前讨论的大目标+链 → 进行中目标/今日打卡 → 最近日报 → 近 7 天时长 → 历史原文（有摘要兜底）。
**超预算分级降级**：`fitParts()` 按优先级自动丢低价值段，响应提示省略了什么，`ai_calls` 记 `context_trimmed` 列出丢了哪些段；**不**直接 413、**不**自动触发压缩重试。

---

## 6. 工作流

### 6.1 `chat` 常驻问答（唯一主线）

| 项 | 内容 |
|---|---|
| 触发 | `POST /api/zoowy/chat`（「我」页 zoowy 弹层），可带 `big_goal_id` |
| 前置 | `requestId`（8–80 位）、消息 1–2000 字、`aiAvailable()` |
| 模型 | `runAgentLoop(workflow:'chat', action:'chat_reply')` |
| 工具 | 注册表 10 个 + 动态提议 4 个 |

流程：

1. `ensureSession` → **先落 user 消息**（v1.3 修复：失败也不丢对话）；
2. `runTurn()` 原子认领任务（requestId 幂等 / 取消 / 结果回放）；
3. 并行加载上下文 → `buildUserContext()` 分段 → `fitParts()` 分级降级；
4. `runAgentLoop()` 带 `scopedTools` + `runTool`；
5. `runTool`：注册表工具走 `executeTool`（白名单分级）；`offer_*` 生成提议（本轮最多一条）；
6. `commit`：提议写 `zoowy_offers` 出卡片、落 assistant 消息（meta 记工具 / 画像变更 / 降级）、按 `reportChanges` 收集画像变更摘要；
7. `catch`：`AiError` → 补 assistant 错误记录 + 返回友好响应；其它错误继续抛出。

### 6.2 `planning` 规划草案

`planning-generation.js` 用模型生成 proposal，`planning-rules.js` 做规则模板兜底与 `validateProposal`，`planning.js` 管草案状态机与事务。

强校验：步骤 1–6、时间预算、`step-N` 依赖链、`purpose` 枚举、标题 NFKC 去重、**场地未确认时首步必须是确认场地**、截止日期只从用户原话正则抽（取最后一次出现）。带 `bigGoalId` 时允许 `weeklyMinutes` 为空，只做结构检查。

`applyProposal`：`big_goal_id` 非空 → 复用已有大目标（`FOR UPDATE` 校验 owner + active）、`plan_order` 从链上最大值续排、只建小目标 + 设置 `prerequisite_goal_id`；为空 → 新建大目标。`snapshotPlan` 写快照。

旧 `workflows/plan.js`（`planIntro` / `confirmPlan`）与 `/zoowy/plan/intro`、`/zoowy/plan/confirm` **已删除**，避免两套写入链路并存。

### 6.3 `progress` / `daily` 后台工作流

- `progress`：对方验收通过后 `setImmediate()` 异步触发；`need_change=false` → `recordSkip(progress_noop)` 不写库；`true` → `write_big_goal_progress` + 可选画像补丁。
- `daily`：`scheduleDaily()` 23:30 轮询，逐用户查 `daily_enabled`，`runDaily()` 幂等（当天已有 `daily_dup` 跳过）；`write_my_diary` 写 `ai_original`，用户改后写 `user_edited`。
- **两者都保留 `patch_my_profile` 直写**（无用户在线，不套确认卡片），写后由 `profile_changes` 留痕 + `reportChanges` 告知 + `profile_versions` 可回滚。

---

## 7. API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/zoowy/chat` | 聊天主线；强制 `requestId`；返回 `cards` / `profileChanges` / `degraded` |
| `GET` | `/api/zoowy/messages` | 历史（含 `cards` / `tools` / `profileChanges` / `failed`） |
| `POST` | `/api/zoowy/turns/:requestId/cancel` | 取消本轮 |
| `POST` | `/api/zoowy/offers/:id/accept` | 用户点确认 → 事务写入 |
| `POST` | `/api/zoowy/drafts/:id/confirm` | 应用指定草案版本 |
| `GET/PUT` | `/api/me/settings` | 只返回 / 接受 `reportChanges` / `dailyEnabled` |
| `GET` | `/api/me/profile/changes` 等 | 画像变更列表 / 已读 / 版本列表 / 回滚（保留） |
| `GET` | `/api/biggoals` 等 | 大目标 CRUD / 计划链手改（保留） |
| `GET/PUT` | `/api/me/settings` | 见上 |

**第一批不提供**：`/zoowy/compact`（摘要生成）、`/zoowy/model`（账号 Key）、`/zoowy/preferences`（偏好并入画像）、图片 / 搜索接口（第二批）。

全部经 `mw.requireUser`，`userId` 取自服务端会话。

---

## 8. 触发链路总览

```
【chat】
前端生成 requestId → POST /api/zoowy/chat
  → runChat：ensureSession → 先落 user 消息 → runTurn(claim) → 上下文组装（分级降级）
  → runAgentLoop（6 轮 / 60s）
      ├─ 注册表工具 → executeTool（白名单分级：读 / 单条直写）
      └─ offer_* → zoowy_offers → 卡片
  → commit：落 assistant（meta: tools/profileChanges/degraded）+ 返回 cards
  → 用户点卡片 → POST /zoowy/offers/:id/accept → 事务 applyOffer
  → 点「应用这版」→ POST /zoovy/drafts/:id/confirm → confirmDraft 事务 → goals/plan_versions

【progress】验收通过 → setImmediate → runProgress → need_change? → 写进度 + 画像补丁 → profile_changes
【daily】23:30 scheduleDaily → runDaily 幂等 → write_my_diary + 画像补丁 → profile_changes
```

所有模型调用经 `ai.js : chat()` → `recordCall()` 写 `ai_calls`；所有画像真实变更经 `applyProfilePatch()` → `recordChange()` 写 `profile_changes` + `profile_versions`。

---

## 9. 安全边界与可靠性

| 边界 | 实现位置 / 手段 |
|---|---|
| 越权 | `userId` 服务端注入、工具参数无该字段；SQL 强制 owner/user 过滤；会话双重过滤；`bigGoalId` 由上下文带入并校验归属 |
| 最小授权 | 4 份 `WHITELIST`；`create_big_goal` 只进 chat；高危能力（验收、删目标、改积分、改口令）**根本不注册** |
| 写入收口 | 模型主动提议的画像 / 批量 / 偏好改动一律 `offer_*` → 用户确认 → 事务；确认=决策，**无开关可跳过**（`skipConfirm` 已删） |
| 防伪造 | chat 不给写日报/写进度；`response_format: json_object` + 解析失败不写库；资料与指令分层防提示注入 |
| 可回滚 | `profile_versions`（首次真实变更前全量快照）+ `plan_versions`（每次写链后快照）；已开放列表与回滚接口 |
| 留痕 | `ai_calls` 记 ok/skip/fail + tokens；`profile_changes` 记每次画像变更（before/after、reason/evidence）；`context_trimmed` 记上下文省略 |
| 服务端裁决 | `applyProfilePatch()` diff 跳过无变化、块名 / `reason` 校验、≤8 条与 ≤4000 字；提议 payload 校验 op / block / reason |
| 汇报开关 | `reportChanges` 只控制推送 / 未读 / 同步摘要；留痕与版本快照无条件写 |
| 幂等 | 同名未归档查重 + `UNIQUE(user_id, diary_date)` + `zoowy_offers.result` + requestId 状态机 + 草案 `revision` 乐观锁 + `chainSig` 重读 |
| 成本 / 失控 | 6 轮 / 12 工具 / 60s / 45s；只 `bad_json` 重试一次；`AI_DAILY_LIMIT` 默认 50；超预算分级降级不重跑模型 |
| 失败降级 | 记账 best-effort；轮次超限 / 超时降级返回不抛 500；chat 失败补 assistant 记录；progress 异步失败不影响验收；daily 单用户失败不影响他人 |
| 密钥 | 只放服务器 `.env` 的 `DEEPSEEK_API_KEY`；不下发 Web / Android；出站 HTTPS；用户永不填 Key |
| 隐私 | 画像 / 日报 / 聊天默认仅自己；`shared` 主动分享后才在「我们」页出现摘要 |

---

## 10. 配置与部署

| 变量 | 默认 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 空 | **必填**（`docker-compose.yml` 用 `:?`）；管理员在服务器 `.env` 写好，两人共用 |
| `DEEPSEEK_MODEL` | `deepseek-flash` | 只能是 `deepseek-flash` 或 `deepseek-v4-pro` |
| `AI_DAILY_LIMIT` | `50` | 日报每日生成上限 |

**已全清**：`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` / `qwen-plus` / `dashscope` / `providerConfig` / `DEEPSEEK_CREDENTIAL_KEY` / `zoowy_model_settings`。不留百炼回退分支，不自填端点。

云端现状：公网 IP + 3201 明文 HTTP、Docker Compose、Android 只能 debug 包。HTTPS 是**独立安全项**，不阻塞本融合。

部署顺序（详见 [融合计划-zoowy-v2.md](融合计划-zoowy-v2.md) §8.4）：数据副本预演 → 全库备份 → `.env` 换 Key → 一次部署（启动自动建表）→ 补 `export.js` 备份白名单 → 复验接口 → Android 重新打 debug 包。回退 = 回滚代码 + 恢复备份。

---

## 11. 已知差距与待办

| # | 差距 | 影响 | 建议 |
|---|---|---|---|
| 1 | 第一批未开放图片 / 联网搜索 / 链接抓取 / 深度思考 / `compactChat` 摘要生成 | 外围能力未上线 | 第二批独立验收（SSRF / PNG 解析 / `reasoning_content` 需专项验证） |
| 2 | `big_goals` 表无独立截止日期列 | `deadline` 写进 `description` 末尾（`【截止】…`），无法按日期查询 / 提醒 | 加 `deadline TEXT` 列并同步数据库文档 |
| 3 | `startReplanDraft` 目前仍只支持「挪日期」 | 增删 / 重排步骤尚未实现 | 按融合计划扩展，并移植 `shift_plan_dates` 的「只碰 planned」保护 |
| 4 | whtmo 自带的 3 份设计稿与实现有偏差 | 自填 Base URL / 202+轮询 / `plan_turns` 表等描述已不成立 | 归档为设计依据，不当实现说明用 |
| 5 | 定时任务为单进程 `setInterval` | 多实例会重复触发与重复计费 | 上分布式锁，或明确约束单实例部署 |
| 6 | `verify-smoke.js` / `p1-check.js` 仍按旧链路 | 回归覆盖不全 | 按 v2.0 调整；`p0-check.js` 已调整、`agent-v2.js` 已新增（26 项全绿）、`agent-full.js` 已标注手动并换 DeepSeek |
| 7 | Android 端未做真机运行验证 | 无法确认卡片交互 | Android Studio 编译 + 真机点卡片 |
| 8 | 云端仍是明文 HTTP | 聊天内容明文传输 | 独立安全项：上 HTTPS 或 `SIGNUP_OPEN=0` |

---

## 12. 变更记录

| 版本 | 日期 | 分支 | 改动摘要 | 涉及章节 |
|---|---|---|---|---|
| v1.0 | 2026-11-07 | `agent-icdi` | 初始建立；§0 维护约定 + 标记块校验脚本；登记 8 条已知差距 | 全文 |
| v1.1 | 2026-11-07 | `agent-icdi` | 4 工作流画像自动更新、`profile_changes` / `settings.js` / `profileChanges.js`、`reportChanges` 接线、版本回滚 | §1、§3、§4、§5、§6、§7、§8、§9、§11 |
| v1.2 | 2026-11-07 | `agent-icdi` | 双端「改完告诉用户改了什么」；P0 冒烟 48 项全绿 | §3.3、§7、§11 |
| v1.3 | 2026-11-08 | `agent-icdi` | gateway 轮次超限降级不抛 500；chat 先落 user 消息 + 失败补 assistant 记录；`failed` 标记 | §5.2、§6.4、§9 |
| v1.4 | 2026-11-08 | `agent-icdi` | `list_big_goals` / `create_big_goal`，chat 白名单 9→11，提示词引导；`deadline` 写描述 | §3.1、§5.3、§5.4、§6.4 |
| **v2.0** | **2026-11-08** | `agent-icdi` | **融合 `agent-whtmo`**：全面切 DeepSeek 并删 `AI_*` / `providerConfig` 链路（用户永不填 Key）；单聊天主线 + 提议/确认卡片（按授权来源分级、一次确认、30 分钟幂等）；`planning` 三件套为唯一草案链路并扩展 `big_goal_id`；`user_profiles` 唯一长期记忆；指令/资料分层 + 上下文分级降级；`zoowy_turns` / `zoowy_offers` / `zoowy_compactions` / `planning_drafts` 4 张表；gateway 降级返回与取消；`skipConfirm` 删除；`check-schema-doc` 修绿（35 张表）。决策依据与剩余批次见 [融合计划-zoowy-v2.md](融合计划-zoowy-v2.md) | **全文重写** |
| **v2.0.1** | **2026-11-08** | `agent-icdi` | 全链路离线测试发现融合时漏了 whtmo 的 `goals.prerequisite_goal_id` 迁移，导致草案「应用这版」必然 500；在 `db.js : openDb()` 补幂等 `ALTER TABLE goals ADD COLUMN IF NOT EXISTS prerequisite_goal_id INTEGER`。新增 `app/.smoke/flow-v2.js` 覆盖「单条直写 / 提议→确认 / 草案→应用 / 失败补记录 / 过期提议」 | §4、§6.2、§12 |
| **v2.0.2** | **2026-11-08** | `agent-icdi` | 用有效 DeepSeek Key 跑真实链路：模型自主调用 `list_big_goals` + `create_big_goal`、大目标落库、普通问答正常、`ai_calls` 记账 ok、对话成对落库（8/8）。把全链路回归正式化为 `app/scripts/flow-v2-check.js` + `npm run check:flow-v2`（23 项，抓到过 §12 v2.0.1 的那个 500） | §11、§12 |
