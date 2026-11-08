# 脚印 · Agent 工作流（zoowy）实现与技术文档

| 项 | 值 |
|---|---|
| 适用范围 | 服务端 `app/src/agent/`、`app/src/ai.js` + 触发路由 + Web / Android 入口 |
| 唯一真源 | `app/src/agent/` 下的实现（本文描述代码实际行为，不是设计稿） |
| 拓扑 | 1 个网关 + 4 个工作流 `plan` / `progress` / `daily` / `chat` |
| 规模 | 13 个工具（7 读 + 6 写）、4 份白名单；仅 `chat` 走 tool-calling loop；4 个工作流均可更新画像 |
| 画像变更 | `profile_changes` 留痕 + `profile_versions` 可回滚，`reportChanges` 控制告知，见 §5.4 / §7 |
| 文档状态 | 与代码同步，最后核对 2026-11-08（v1.4，分支 `agent-icdi`） |
| 校验命令 | `node app/scripts/check-agent-doc.js`（工具清单 / 工作流清单一致性，见 §5.3、§5.4） |
| 表结构校验 | 见 [数据库设计实现文档.md](数据库设计实现文档.md) 的 `check-schema-doc.js` |

> **本文是 zoowy agent 工作流实现的唯一事实来源（Single Source of Truth）。** 与同仓库的 [数据库设计实现文档.md](数据库设计实现文档.md) 采用同一套范式：实现文档 + §0 变更同步约定 + 可运行的清单校验脚本。
>
> 配套文档分工：
> - [待办计划-AI工作流与双端改造.md](待办计划-AI工作流与双端改造.md) —— 记录**为什么这么决策**、范围、验收清单（设计侧）。
> - 本文 —— 记录**代码里实际是什么、怎么跑、改哪里要同步**（实现侧）。
>
> 两者冲突时**以代码为准，并立刻修正文档**，不要靠记忆或口头约定。

---

## 0. 维护约定（改动前必读）

### 0.1 铁律

> **任何涉及 agent 工作流的改动，必须在同一个提交里同步更新本文档。**
> 不允许「先改代码、文档以后补」，也不允许只改代码不改 §12 变更记录。

这条约定同时登记在 [README.md](README.md) 的「Agent 工作流（zoowy）」一节，对在本仓库工作的所有人 / 所有 AI 生效。

### 0.2 触发清单：什么改动必须更新本文

| 改动类型 | 必须更新的章节 |
|---|---|
| 新增 / 删除 / 改名工具（`IMPLEMENTATIONS`） | §3、§5.3、§5.4、§9 |
| 改任一工作流白名单 `WHITELIST` | §5.4、§9 |
| 改提示词、`PERSONA`、输出要求 | §5.6、§6 对应工作流 |
| 改 JSON 输出 schema（字段 / 枚举 / 必填 / 上限） | §6 对应工作流、§9 |
| 改 loop 参数（轮次上限、总超时、单次超时） | §5.2、§9 |
| 改 loop 中断 / 降级与会话落库行为 | §5.2、§6.4、§9、§11 |
| 改模型客户端（重试、解析、记账、`AiError`） | §2、§5.1、§10 |
| 改触发点（路由、定时器、事件挂钩） | §6、§7、§8 |
| 改数据库表 / 字段 / 约束 / 索引 | §4 |
| 改会话、隔离、可见性、分享 | §5.5、§9 |
| 改画像补丁 / 计划快照规则 | §5.4、§9 |
| 改 `reportChanges` / `skipConfirm` 接线 | §5.4、§9、§11 |
| 改幂等、校验、错误码、失败降级 | §5.3、§9 |
| 改前端 / Android 入口与交互流程 | §7、§8 |
| 改环境变量或部署方式 | §10 |
| 填补 §11 里任一已知差距 | 从 §11 移除该条 + 写进 §12 |

**边界**：只改 UI 文案、纯样式、与 agent 无关的 bugfix 不触发。拿不准就算触发，多写一行比漏写强。

### 0.3 每次更新的最小动作

- [ ] 改动对应章节，保证描述与代码一致
- [ ] 复核 §3 文件地图、§4 表结构、§7 API 表、§9 边界表没有过期
- [ ] 在 §12 追加一行变更记录（日期 / 分支 / 改动摘要 / 涉及章节）
- [ ] 更新本文头部「版本 / 日期 / 状态」
- [ ] 若修掉了 §11 的差距，同步更新 [README.md](README.md) 与待办计划里的状态
- [ ] 运行 `node app/scripts/check-agent-doc.js`，工具清单与工作流清单校验通过
- [ ] `git diff` 确认代码与文档落在**同一个提交**

### 0.4 定位方式

本文一律用 `文件 : 符号名()` 定位（如 `gateway.js : runAgentLoop()`），**不写行号** —— 行号会随编辑漂移。在编辑器里全局搜索符号名即可定位代码。

---

## 1. 概述与定位

### 1.1 一句话

zoowy **不是通用 Agent，也不是多个 Agent**，而是自研的一套轻量「**单网关 + 结构化决策 + 工具白名单**」框架：一个 zoowy 网关 + 4 个专业工作流（`plan` / `progress` / `daily` / `chat`），共用一个人设、一套模型客户端、一张工具注册表、一个 PostgreSQL 库。

拓扑决策见待办计划 1.5：两人自用、单 Node 进程，多 agent 会割裂会话、抢画像读写、成本翻倍；「专业」不靠拆 agent，靠**每个工作流自己的提示词 + 工具白名单 + 输出 schema**。

### 1.2 最重要的一个事实

> **四个工作流里只有 `chat` 真正跑了 tool-calling 循环**（`runAgentLoop()`）。
> `plan` / `progress` / `daily` 都是「**调一次模型拿结构化 JSON 决策 → 服务端按决策确定性地调工具**」，没有多轮自主推理。

因此「agent 工作流」在这套代码里是宽泛叫法：不确定性被收进一次 JSON 输出，写库全部由服务端确定性代码完成。

### 1.3 设计原则

1. **模型只输出意图，不直接写库**：`candidates` / `need_change` / `diary` / `profile_patches` 都只是决策数据。
2. **判定权在人手里**：AI 只判进度、画像、计划释放；不判打卡真伪、不碰验收通过/驳回、不改积分（PERSONA 铁律 + 工具注册表里根本没有这些能力）。
3. **不伪造**：JSON 解析失败 / 正文为空 → 抛错、不写库、保留旧数据。
4. **不汇报 ≠ 不留痕**：所有 ok / skip / fail 都进 `ai_calls`；画像变更无条件写 `profile_changes` + `profile_versions`，`reportChanges` 只控制是否推送 / 计未读。
5. **模型提议、服务端裁决**：4 个工作流都能提议画像补丁，但内容无变化、块名非法、缺 `reason` 一律由 `applyProfilePatch()` 跳过，不盲信模型输出。

---

## 2. 技术栈与依赖

| 层 | 选型 | 位置 |
|---|---|---|
| 运行时 | Node.js ≥ 22.13.0，CommonJS（`require`），无构建、无 TypeScript | [app/package.json](app/package.json) |
| Web 框架 | Express `^4.21.2`，单进程 | [app/src/index.js](app/src/index.js) |
| 数据库 | PostgreSQL（`pg ^8.23.1` Pool）；`db.get/all/run` 异步封装；`?` 占位由 `db.js : q()` 转成 `$n` | [app/src/db.js](app/src/db.js) |
| 大模型 | **阿里百炼 DashScope OpenAI 兼容模式**，默认模型 `qwen-plus` | [app/src/ai.js](app/src/ai.js) |
| 调用方式 | **原生 `fetch` + `AbortController`**，`POST {baseUrl}/chat/completions`，Bearer 鉴权 | `ai.js : requestOnce()` |
| 结构化输出 | `response_format: { type: 'json_object' }` + 自写宽松解析 | `ai.js : parseJsonLoose()` |
| 工具调用 | OpenAI function-calling 协议（`tools` / `tool_calls` / `role:'tool'`），手工拼消息 | [app/src/agent/gateway.js](app/src/agent/gateway.js)、`tools.js : toolsFor()` |
| 定时任务 | `setInterval` 5 分钟轮询 + 手算 GMT+8，**不引 cron** | `daily.js : scheduleDaily()` |
| 知识库 | **无向量库**：把该用户结构化数据直接拼进 system prompt | `chat.js : buildUserContext()` |
| 前端 | 原生 JS + `UI.sheet` 弹层，无框架、无构建 | [public/js/pages/zoowy.js](public/js/pages/zoowy.js)、[public/js/pages/biggoal.js](public/js/pages/biggoal.js) |
| Android | Kotlin / Jetpack Compose + 手写 `Api.kt` | `android/app/src/main/java/` |

**刻意不引入**：AI SDK（openai / langchain 等）、agent 框架、向量库、消息队列、cron、独立 AI 服务、Redis。理由见待办计划 1.4（服务端常驻可自动触发）与 1.6（两人数据量极小，拼上下文即可）。

**其余依赖**（与 agent 无直接关系）：`adm-zip`、`bcryptjs`。

---

## 3. 代码地图

### 3.1 后端 `app/src/agent/`

| 文件 | 行数 | 职责 |
|---|---:|---|
| [gateway.js](app/src/agent/gateway.js) | 94 | **唯一的 agent loop**：轮次/超时控制、白名单执行、**轮次超限降级返回**、中断补记 |
| [tools.js](app/src/agent/tools.js) | 516 | 13 个工具实现（含 `list_big_goals` / `create_big_goal`） + `WHITELIST` + 画像补丁（diff/摘要/留痕） + 计划快照 |
| [workflows/plan.js](app/src/agent/workflows/plan.js) | 121 | 规划：自检访谈 → 候选 + 画像补丁提议 → 确认创建并 apply |
| [workflows/progress.js](app/src/agent/workflows/progress.js) | 80 | 进度：先判 `need_change`，不动就跳过 |
| [workflows/daily.js](app/src/agent/workflows/daily.js) | 142 | 日报：23:30 定时 + 幂等生成 |
| [workflows/chat.js](app/src/agent/workflows/chat.js) | 129 | 常驻问答：拼用户快照 + 走 loop + 主动记画像 / 送达变更摘要 + **直接建读大目标** + 先落用户消息 / 失败补记录 |
| [session.js](app/src/agent/session.js) | 37 | 服务端会话（Web / Android 同一份） |
| [persona.js](app/src/agent/persona.js) | 9 | 4 个工作流共用的人设与铁律 |
| [index.js](app/src/agent/index.js) | 19 | 统一导出，纯 re-export，无逻辑 |

### 3.2 支撑与接入

| 文件 | 职责 |
|---|---|
| [app/src/ai.js](app/src/ai.js) | 模型客户端、JSON 解析、`ai_calls` 记账、`AiError` |
| [app/src/settings.js](app/src/settings.js) | `getUserSettings()` 单一真源，路由与 4 个工作流共用（含 `reportChanges`） |
| [app/src/profileChanges.js](app/src/profileChanges.js) | 画像变更留痕、摘要、已读、版本列表与回滚 |
| [app/src/index.js](app/src/index.js) | 挂载 `zoowyRoutes`、启动 `scheduleDaily()` |
| [app/src/routes/zoowy.js](app/src/routes/zoowy.js) | `POST /zoowy/chat`、`GET /zoowy/messages`（响应含 `profileChanges`） |
| [app/src/routes/biggoals.js](app/src/routes/biggoals.js) | `POST /zoowy/plan/intro`、`/confirm`（透传 `profile_patches`）+ 计划链手改（4 处 `snapshotPlan`） |
| [app/src/routes/goals.js](app/src/routes/goals.js) | 验收通过处异步触发 `runProgress()` |
| [app/src/routes/diaries.js](app/src/routes/diaries.js) | 日报查看 / 修改 / 分享 |
| [app/src/routes/auth.js](app/src/routes/auth.js) | `user_settings` 读写、画像手改 / 分享 + 变更列表 / 已读 / 版本 / 回滚接口 |
| [app/src/db.js](app/src/db.js) | 表结构定义与 `ALTER TABLE` 增量迁移 |
| [public/js/pages/zoowy.js](public/js/pages/zoowy.js) | 「我」页聊天弹层（显示「📝 更新了画像」） |
| [public/js/pages/biggoal.js](public/js/pages/biggoal.js) | `runFlow()` 递归访谈 + 候选勾选 + `profile_patches` 透传 |
| [public/js/pages/me.js](public/js/pages/me.js) | 「我」页 zoowy 入口、画像手改、变更告知红点 / 明细 / 版本回滚 |

### 3.3 Android 现状

- **已接入（v1.2）**：[Api.kt](android/app/src/main/java/me/footprint/app/net/Api.kt) 新增 `getProfileChanges()` / `markProfileChangesRead()` / `getProfileVersions()` / `rollbackProfileVersion()` / `updateAiSettings()` 及对应 DTO，`UserSettings` 补齐 `dailyEnabled`；[MeScreen.kt](android/app/src/main/java/me/footprint/app/ui/MeScreen.kt) 新增「画像变更」区块（未读红点、最近摘要、明细展开、版本回滚、全部已读）与「AI 设置」弹层（`reportChanges` / `skipConfirm` / `dailyEnabled`）。
- **仍未接入**：zoowy 聊天、拆计划（`/api/zoowy/*`、`/zoowy/plan/*`）在 Android 端依然没有入口；[BigGoals.kt](android/app/src/main/java/me/footprint/app/ui/BigGoals.kt) 只展示 `progress_note` 与创建提示文案，[DiaryWorker.kt](android/app/src/main/java/me/footprint/app/usage/DiaryWorker.kt) 只发日报通知。详见 §11-5。

---

## 4. 数据库表

定义位置：[app/src/db.js](app/src/db.js)（`SCHEMA` + 尾部 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 增量迁移）。

| 表 | 关键字段 | 约束 / 用途 |
|---|---|---|
| `big_goals` | `owner_id, title, description, progress, progress_note, progress_at, status` | AI 写 `progress`，系统另维护客观 `done/total` 供核对 |
| `user_profiles` | `user_id, block, content, source, status, updated_at` | `UNIQUE(user_id, block)`；`status: active / void`，删除只标失效不物理删 |
| `profile_versions` | `user_id, snapshot, changed_by, reason, created_at` | 画像**首次真实变更前**存全量快照（无变化不写）；`GET /me/profile/versions` + `rollback` 已开放读取与回滚 |
| `profile_changes` | `user_id, workflow, summary, detail, reported, is_read, version_id, created_at` | 每次真实画像变更记一条；`reported` = 当时 `reportChanges` 快照，关掉开关仍留痕但 `reported=0` 不计未读；按 `(user_id, id DESC)` 建索引 |
| `plan_versions` | `big_goal_id, owner_id, snapshot, source, reason, created_at` | 手改与 AI 重排**共用**同一张快照表（`source = user / ai`） |
| `diaries` | `user_id, diary_date, ai_original, user_edited, shared` | `UNIQUE(user_id, diary_date)`；展示用 `user_edited \|\| ai_original`，次日不回改昨日 |
| `zoowy_sessions` | `user_id, title, created_at, updated_at` | 每人一个主会话，两入口共用 |
| `zoowy_messages` | `session_id, user_id, role, content, meta, created_at` | `meta` 存 JSON（工具名、入口标记）；按 `session_id` 建索引 |
| `ai_calls` | `user_id, workflow, action, status, model, *_tokens, duration_ms, detail, idempotency_key, created_at` | `status = ok / skip / fail`；按 `user_id` 建索引 |
| `user_settings` | `user_id, skip_confirm, report_changes, daily_enabled, updated_at` | 按用户存；`skip_confirm` 默认 0、`report_changes` 默认 1（v1.1 已接入工作流）、`daily_enabled` 默认 0；`skip_confirm` 仍未接线，见 §11-1 |

`goals` 表为计划链新增字段：`big_goal_id` / `planned_date` / `plan_order` / `plan_status`（`planned / released / done`），与原有 `status` 状态机**解耦**。

---

## 5. 核心机制

### 5.1 模型底座 `app/src/ai.js : chat()`

唯一模型出口。入参 `{ messages, tools, json, timeoutMs, userId, workflow, action, idempotencyKey, db }`，返回 `{ content, toolCalls, parsed, usage }`。

- **配置**：`aiConfig()` 从 env 读 `AI_BASE_URL`（默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`）/ `AI_API_KEY` / `AI_MODEL`（默认 `qwen-plus`）；`aiAvailable()` 只看 key 是否存在。
- **重试克制**：`attempts = json ? 2 : 1`。**只有 `bad_json` 重试一次**；网络错 / 超时 / HTTP 错一律不重试（防定时任务死循环烧额度）。
- **不伪造**：`parseJsonLoose()` 先剥 ` ```json ` 围栏，再抓首尾大括号；仍失败抛 `AiError(kind:'bad_json')`，调用方 catch 后保留旧数据。
- **错误分类**：`AiError.kind ∈ { no_key, network, http, bad_json, timeout }`，另带 `status` / `detail`。
- **记账 best-effort**：`recordCall()` 整体 try/catch，记账失败不影响主流程；记 status、tokens、耗时、`idempotency_key`。`recordSkip()` 是 `status:'skip'` 的语法糖，专门记「整轮跳过」。
- **超时**：`requestOnce()` 用 `AbortController` + `setTimeout`，默认 45s。

### 5.2 网关 `gateway.js : runAgentLoop()`

**唯一的多轮 agent loop，唯一调用点是 `chat.js : runChat()`。**

```
调 ai.chat(messages, tools)
 ├─ 无 tool_calls → content 为最终答案，break
 └─ 有 tool_calls
      → toolRounds += 1
      ├─ > MAX_TOOL_ROUNDS → 记 fail 留痕，降级返回（不抛错）
      │    content = 本轮已有 content + 「这轮查得有点多，先说到这儿。」
      │    返回 { ..., degraded: true, reason: 'max_tool_rounds' }
      └─ 未超限
           → convo.push(assistant 原样带 tool_calls)   ← OpenAI 协议硬要求
           → 逐个 executeTool()（白名单校验）
           → 结果 JSON.stringify 后截 4000 字，以 role:'tool' 回灌
           → 回到循环顶部
```

| 闸 | 值 | 行为 |
|---|---|---|
| `MAX_TOOL_ROUNDS` | 6 | 先自增后判断；第 7 轮**不抛错**，记 `fail(max_tool_rounds, degraded)` 后降级返回，该轮工具不执行 |
| `TOTAL_TIMEOUT_MS` | 60000 | 每轮开头检查，超了记 `fail(total_timeout)` 并中断 |
| 单次模型超时 | `min(45000, 剩余时间 + 1000)` | 给总超时留余量 |

两种中断的差别：

- **轮次超限**（`max_tool_rounds`）：记 `ai_calls` 的 `fail` 留痕（detail 带 `degraded: true`），**降级返回** `{ content, degraded: true, reason }`，不抛错、不返回 500。降级时不会把带 `tool_calls` 却没有工具结果的悬空消息留在 `messages` 里。
- **总超时**（`total_timeout`）：记 `fail` 后仍抛 `AiError(kind:'timeout')`，由 `chat.js : runChat()` 的 catch 兜住（见 §6.4），降级成友好响应并补落会话记录。

工具结果回灌统一截 4000 字，防止上下文膨胀。

### 5.3 工具注册表 `tools.js : IMPLEMENTATIONS / executeTool()`

**13 个工具 = 7 读 + 6 写。**

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

> 上面这对标记块是**机器可读清单**，由 [app/scripts/check-agent-doc.js](app/scripts/check-agent-doc.js) 与 `tools.js : IMPLEMENTATIONS` 比对。增删 / 改名工具时必须同步改这里，否则校验脚本非零退出。

**`list_big_goals` / `create_big_goal`（v1.4）**：前者按 `owner_id` 列自己的大目标（含 `id`、`progress`、客观 `done/total`），让模型先拿到 id 再调 `read_big_goal`；后者在用户明确要立长期方向时直接建大目标，参数 `title`（1–40 字）/ `description`（≤500）/ `deadline`（可选 `YYYY-MM-DD`）/ `emoji`。`big_goals` 表暂无独立截止列，`deadline` 会写成描述末尾的 `【截止】YYYY-MM-DD`，信息不丢但不可按日期查询（见 §11-9）。同名且未归档的大目标视为重复，返回 `duplicate: true` 不重复建。

每个工具是 `{ desc, readOnly, params(JSON Schema), run(ctx, args) }`；`ctx = { db, userId, workflow }`，**`userId` 由服务端会话注入，工具参数里不存在该字段**。`workflow` 供 `patch_my_profile` 写变更留痕时标明来源。`toolsFor()` 把白名单转成 OpenAI `tools` 格式。

`executeTool(db, workflow, userId, name, args)`：先查 `WHITELIST[workflow]`，不在名单直接返回 `fail('无权调用…')`；实现抛异常也兜成 `fail()`，不打断 loop。

**越权防护**：所有 SQL 强制 `owner_id = ?` / `user_id = ?`；`read_big_goal`、`create_plan_goal`、`write_big_goal_progress`、`shift_plan_dates` 会先 `SELECT ... AND owner_id = ?` 校验归属。**注册表里压根不存在**验收通过/驳回、删目标、改积分、改昵称口令、改对方数据的工具 —— 是「能力未定义」而非运行时拦截。

**幂等（业务查重 + 约束，不是 key 去重）**：

| 工具 | 机制 |
|---|---|
| `create_plan_goal` | 同大目标下「同名 + 同 `planned_date` + 未归档」已存在 → 返回 `duplicate:true` 不重复建；标题截 30 字、验收标准必填 ≤500 字、日期 `YYYY-MM-DD` 校验、积分按 `getPoints()` 自动算并封顶 1200 |
| `write_my_diary` | 先查 `(user_id, diary_date)` + 表上 `UNIQUE(user_id, diary_date)`；只写当天，正文 ≤3000 字 |
| `shift_plan_dates` | 只捞 `plan_status='planned'` 的，进行中 / 待验收 / 已达成锁死；`days` 限 ±365 且非 0 |

### 5.4 白名单 / 画像补丁 / 计划快照

**`WHITELIST`（按工作流最小授权）**：

| 工作流 | 工具数 | 工具 |
|---|---:|---|
| `plan` | 6 | `read_my_profile`, `read_big_goal`, `read_my_goals`, `create_plan_goal`, `shift_plan_dates`, `patch_my_profile` |
| `progress` | 5 | `read_my_goals`, `read_big_goal`, `read_checkins`, `write_big_goal_progress`, `patch_my_profile` |
| `daily` | 8 | `read_my_goals`, `read_big_goal`, `read_checkins`, `read_my_profile`, `read_my_usage`, `read_my_diaries`, `write_my_diary`, `patch_my_profile` |
| `chat` | 11 | 读 7 个 + `create_big_goal`, `create_plan_goal`, `shift_plan_dates`, `patch_my_profile` |

<!-- AGENT_WORKFLOWS:START -->
`plan` `progress` `daily` `chat`
<!-- AGENT_WORKFLOWS:END -->

> 同上，标记块由校验脚本与 `tools.js : WHITELIST` 比对；新增 / 删除工作流时必须同步改这里，以及 §6、§12。

`chat` **刻意不给** `write_my_diary` / `write_big_goal_progress`（防伪造），比待办计划 1.8 的描述更严。

**`applyProfilePatch(db, userId, patches, source, meta)`**（画像「该改的改、该留的留」+ 服务端裁决）：

1. 逐条校验：块名 `^[a-z][a-z0-9_]{0,31}$`、**`reason` 必填**、一次最多 8 条、单块 ≤4000 字；`evidence` 建议给；
2. **服务端 diff**：`add/update` 的内容与现有 `active` 块一致 → 跳过（模型说了不算）；`op:'delete'` 只 `SET status='void'` 不物理删；
3. **懒写快照**：只有出现第一条真实变更，才把变更前的全量块写进 `profile_versions`（无变化不写，避免版本噪音）；
4. 真实变更逐条累积 `changes: [{op, block, reason, evidence, before, after}]`，生成人话 `summary`（如「新增能力、更新目标进展」）；
5. 调 `profileChanges.js : recordChange()` 写 `profile_changes`：读 `getUserSettings()` 的 `reportChanges` 存为 `reported`，**留痕无条件写**；
6. 返回 `{ applied, changes, summary, reported, changeId, versionId }`；全部跳过时 `changes=[]` 且带 `note='无实质变化，已跳过（未写库、未存快照、未记变更）'`。

**四个工作流都已接入**（v1.1）：`chat`（提示词主动识别 + loop 工具调用）、`plan`（intro 提议 → confirm 确认后 `executeTool('plan','patch_my_profile')`）、`progress` / `daily`（原有 `profile_patches` 走同一管线）。优先级写进提示词：**用户对话里的最新明确表述 > 用户手改值 > AI 推断值**。

**变更告知链路 `app/src/profileChanges.js`**：

| 符号 | 职责 |
|---|---|
| `recordChange()` | 写 `profile_changes`（`reported` 取当时 `reportChanges`） |
| `listChanges()` | 返回全部留痕 + `unread`（仅 `reported=1 && !is_read`） |
| `markRead()` | 标记 `reported=1` 的行为已读 |
| `listVersions()` | 读 `profile_versions`（**不再只写不读**） |
| `rollback()` | 先存当前快照 → 按目标快照 upsert，快照外的块只标 `void`（保留 `shared` 与历史）→ 记一条 `workflow='user'` 变更 |

**送达方式**：同步交互（chat / plan）在响应里带 `profileChanges`（受 `reportChanges` 控制），chat 气泡与 plan toast 直接显示；异步 / 定时（progress / daily）写进 `profile_changes`，由「我」页红点 + 变更记录 sheet 送达。**`reportChanges=false` 时留痕照写、仍能翻到，只是不推红点、不带摘要** —— 对应「不汇报 ≠ 不留痕」。

**`snapshotPlan(db, bigGoalId, source, reason)`**：抓大目标 + 按 `plan_order` 排序的整条链，写进 `plan_versions`。AI 侧由 `create_plan_goal` / `shift_plan_dates` 调（`source='ai'`）；手改侧由 [biggoals.js](app/src/routes/biggoals.js) 的 bind / edit / reorder / unbind 4 处调（`source='user'`）。这就是「手改与 AI 重排走同一套链路」的落点。

### 5.5 会话与可见性 `session.js`

- `ensureSession()`：每人一个主会话（`ORDER BY updated_at DESC, id DESC LIMIT 1`），「我」页常驻入口与大目标页快捷入口进**同一个会话**。
- `recentMessages()`：`session_id + user_id` **双重过滤**，只取 `role IN ('user','assistant')`，默认 40 条倒序后反转。
- `appendMessage()`：写 user / assistant 两条，`meta` 存工具名列表与入口标记；`touchSession()` 更新 `updated_at`。
- 聊天记录**只落服务端**，Web / Android 拉同一份；画像全文、日报全文、zoowy 聊天默认仅自己可见。
- 日报分享：[diaries.js](app/src/routes/diaries.js) `POST /diaries/:date/share` 翻 `shared`，对方在「我们」页看摘要；未分享不摆空壳。

### 5.6 人设 `persona.js : PERSONA`

4 个工作流共用的 system 前缀，铁律：只服务当前用户本人（读不到也不改对方数据）、不判打卡真伪 / 不碰验收 / 不改积分、说话像朋友、拿不准直说别编。**改它会同时影响 4 条工作流**，务必回归全部。

---

## 6. 四条工作流

### 6.1 `plan` 规划

| 项 | 内容 |
|---|---|
| 触发 | 大目标创建表单「让 zoowy 帮忙拆」/ 详情页「重新规划」 |
| 接口 | `POST /api/zoowy/plan/intro`、`POST /api/zoowy/plan/confirm` |
| 模型 | `ai.chat(json:true)`，`workflow='plan'`，`action='plan_intro'`；**不走 loop**；intro 阶段不调工具，confirm 阶段由服务端 `executeTool()` 确定性调用（含 `patch_my_profile`） |
| 写库 | 仅 `confirmPlan()` 阶段 |

**阶段一 `planIntro()`（只读，绝不写库）**：

1. 读大目标、链上已有小目标、用户画像 active 块；
2. 拼 system：`PERSONA` + 「两步走，本次只做第一步」+ 严格 JSON schema；
3. 输出 schema：
   ```json
   {
     "enough": true,
     "question": "信息不够时要问的那一个问题（够了空串）",
     "suggestion": "对该问题的建议答案（够了空串）",
     "candidates": [{
       "title": "1–30 字", "planned_date": "YYYY-MM-DD（从明天起）",
       "accept_criteria": "≤200 字", "est_total_min": 600,
       "difficulty": 3, "description": "", "emoji": "🎯"
     }],
     "profile_patches": [{ "op": "add|update|delete", "block": "", "content": "", "reason": "", "evidence": "" }]
   }
   ```
   要求 3–8 条、按时间排序、每条可独立验收、粒度一周到一个月、不把「每天做什么」当小目标；`profile_patches` 是访谈里识别到的新信息（每条必带 `reason`/`evidence`），**只是提议，不写库**；
4. 两种启动模式：`mode='idea'`（带用户自己的想法）/ `mode='auto'`（按已有信息直接来，尽量别反问）；`history` 后端 `slice(-5)`；
5. `force=true` 时 prompt 追加「本次 `enough` 必须为 true，拿不准的在 description 里标注假设」；
6. 若 `enough=true` 但 `candidates` 为空 → 抛 `bad_json`，**丢弃不写库**。

**访谈循环在前端递归**（`biggoal.js : runFlow()`）：`enough=false` → 渲染「一个问题 + 💡建议答案按钮 + 输入框 + 答不上硬出计划」；回答后把 `{q, a}` 累加进 `history` 再递归调 intro；点「硬出计划」传 `force:true`；若模型仍说不够，前端劝用户去手动加，不硬编。

**阶段二 `confirmPlan(items, profilePatches)`（用户勾选 = 一次确认）**：前端可勾掉候选、改日期、「手动补一个」，并把 intro 返回的 `profile_patches` 一并回传 → 逐条 `executeTool('plan', 'create_plan_goal')`，`plan_order` 从链上最大值续排 → `snapshotPlan(source='user')` → 若 `profilePatches` 非空，`executeTool('plan', 'patch_my_profile')` 走 §5.4 统一管线（**零额外模型调用**）。一次最多 10 个候选 / 8 条补丁。响应在 `reportChanges=true` 时带 `profileChanges` 摘要。

> **关键点**：AI 全程不碰数据库。它只负责「判断信息够不够」「产出候选 JSON」「提议画像补丁」；创建与 apply 都是服务端确定性动作，模型无法绕过确认直接写库。

### 6.2 `progress` 进度

| 项 | 内容 |
|---|---|
| 触发 | **对方验收通过之后**，[goals.js](app/src/routes/goals.js) 在 approve 事务提交后用 `setImmediate()` 异步触发（不是「小目标完成」瞬间） |
| 模型 | `ai.chat(json:true)`，`workflow='progress'`，`action='progress_check'` |
| 写工具 | `write_big_goal_progress`、可选 `patch_my_profile` |

流程：

1. 前置跳过：目标未绑大目标 → `skipped: no_big_goal`，**一次模型都不调**；
2. 拼上下文：大目标描述与当前 AI 进度、客观 `done/total`、刚完成的小目标及验收标准、整条链状态、画像；
3. 输出 schema：
   ```json
   {
     "need_change": false,
     "progress": 0,
     "note": "为什么是这个进度",
     "profile_patches": [{ "op": "add|update|delete", "block": "", "content": "", "reason": "", "evidence": "" }]
   }
   ```
4. `need_change=false` → `recordSkip(action:'progress_noop')` + 返回，**不写库**；
5. `true` → `write_big_goal_progress`（工具内回查客观 `done/total` 一并返回）+ 可选画像补丁；补丁走 §5.4 统一管线，结果写入 `profile_changes`。

**结果送达**：`progress` 是验收通过后的异步触发，没有 HTTP 响应可带摘要 —— 靠 `profile_changes` + 「我」页红点送达（受 `reportChanges` 控制）。

**失败降级**：触发器整体 `catch` 后只写 `ai_calls(status:'fail', action:'progress_trigger')`，**不影响验收结果、不阻塞响应**。

### 6.3 `daily` 日报

| 项 | 内容 |
|---|---|
| 触发 | `scheduleDaily()`：`setInterval(5min)` + 启动时立即 `tick()`；命中 GMT+8 `23:30 ≤ minute < 23:40` 且当日未跑 |
| 模型 | `ai.chat(json:true)`，`workflow='daily'`，`action='daily_generate'`，`idempotencyKey='daily:${userId}:${day}'` |
| 写工具 | `write_my_diary`、可选 `patch_my_profile` |

**调度器细节**：`new Date(Date.now() + 8*3600*1000)` 手算 GMT+8，取 UTC 小时/分钟；`firedDate` 防同日重复；`dayCount` + `AI_DAILY_LIMIT`（默认 50）封顶；逐用户查 `user_settings.daily_enabled`，**默认 0（关）**，没开就跳过；单用户异常 catch 记 `fail`，不影响其他用户。服务重启后当天窗口内会补跑，`runDaily()` 幂等闸保证只写一份。

**`runDaily()` 流程**：

1. 幂等闸：当天已有日报 → `recordSkip(action:'daily_dup')` 直接返回；
2. 拼当日素材：近两天打卡、当天达成的小目标、进行中大目标 + 进度说明、近 7 天手机时长、画像；
3. 输出 schema：`{ "diary": "markdown 正文 300–800 字", "profile_patches": [...] }`；结构为「今天干了什么 → 亮点/提醒 → 明天最该做的一件事」；
4. 正文为空 → 记 `fail(empty_diary)` 并抛错，**不写库不伪造**；
5. `write_my_diary` 写 `ai_original`，`user_edited` 留空，`shared=0`；有画像补丁再 apply（走 §5.4 统一管线，结果写 `profile_changes`，由「我」页红点送达）。

**日报接口**：`GET /api/diaries/today`（Android WorkManager 每 15 分钟轮询）、`GET /api/diaries?days=7`、`PATCH /api/diaries/:date`（只写 `user_edited`，`ai_original` 原样保留）、`POST /api/diaries/:date/share`。

### 6.4 `chat` 常驻问答

| 项 | 内容 |
|---|---|
| 触发 | `POST /api/zoowy/chat`（「我」页 zoowy 弹层），可带 `big_goal_id` |
| 模型 | `runAgentLoop(workflow:'chat', action:'chat_reply')` —— **唯一走 loop 的工作流** |
| 工具 | `chat` 白名单 11 个（含 `list_big_goals` / `create_big_goal`） |

流程：

1. `recentMessages()` 拉 40 条历史，取后 30 条拼进 convo；
2. **先落 user 消息**（`appendMessage()`，在 `runAgentLoop()` 之前）——即使后续失败，这句也不会从会话历史里消失；
3. `buildUserContext()` **每次对话前刷新**，拼进 system：画像 active 块、进行中目标（≤20）、今日 `credited` 打卡、最近 3 篇日报（各切 150 字）、近 7 天手机时长；带 `big_goal_id` 时再追加该大目标 + 链上小目标（快捷入口不是空聊）；
4. `runAgentLoop()` 带工具跑，回答要求一般 ≤150 字；提示词要求**主动识别对话里的新事实**（能力 / 偏好 / 方向变化 / 重要事件 / 约束）并调 `patch_my_profile`，每条带 `reason` + `evidence`，拿不准不改；**用户明确想立长期方向时用 `create_big_goal` 直接建好（先 `list_big_goals` 查重），要读详情或配小目标时 `list_big_goals` → `read_big_goal` → `create_plan_goal`**；用户没明确要建 / 改时只给建议；
5. **失败兜底**：`runAgentLoop()` 抛 `AiError`（超时 / 模型错误）时，补落一条 assistant 错误记录（`meta: { failed: true, kind }`，正文「🐾 这轮想太久断开了 / 这轮没答上来，可以再问一次。」），并**返回正常响应** `{ reply, ..., failed: true, reason }`，不抛 500；非 `AiError` 的意外错误仍抛出便于排查；
6. 成功后按 `getUserSettings()` 的 `reportChanges` 收集本轮 `patch_my_profile` 的摘要 → 只落 assistant 消息（user 已在第 2 步落库），`meta` 记 `tools` / `profileChanges` / `degraded` → 返回 `{ reply, sessionId, toolCalls, profileChanges, degraded?, reason? }`；
7. 前端气泡显示「📝 更新了画像：xxx」；`GET /zoowy/messages` 也返回历史里的 `profileChanges` 与 `failed` 标记。

**入口校验**：`AI_API_KEY` 未配置 → 503；消息 1–2000 字。`GET /api/zoowy/messages` 拉自己会话（`limit` 1–100，默认 40）。

---

## 7. API 一览

| 方法 | 路径 | 入口 | 对应工作流 |
|---|---|---|---|
| `POST` | `/api/zoowy/chat` | [routes/zoowy.js](app/src/routes/zoowy.js) | `chat` |
| `GET` | `/api/zoowy/messages` | 同上 | 会话读取 |
| `POST` | `/api/zoowy/plan/intro` | [routes/biggoals.js](app/src/routes/biggoals.js) | `plan` 阶段一 |
| `POST` | `/api/zoowy/plan/confirm` | 同上 | `plan` 阶段二 |
| `GET` | `/api/diaries/today` | [routes/diaries.js](app/src/routes/diaries.js) | 日报读取（Android 轮询） |
| `GET` | `/api/diaries` | 同上 | 日报列表 |
| `PATCH` | `/api/diaries/:date` | 同上 | 用户改日报 |
| `POST` | `/api/diaries/:date/share` | 同上 | 分享开关 |
| `POST` | `/api/verifications/:id/approve` | [routes/goals.js](app/src/routes/goals.js) | 间接触发 `progress` |
| `GET/PUT` | `/api/me/settings` | [routes/auth.js](app/src/routes/auth.js) | `user_settings`（`reportChanges` 已接入工作流） |
| `GET` | `/api/me/profile/changes` | 同上 | 画像变更列表 + `unread` |
| `POST` | `/api/me/profile/changes/read` | 同上 | 标记已读 |
| `GET` | `/api/me/profile/versions` | 同上 | 版本历史（不再只写不读） |
| `POST` | `/api/me/profile/versions/:id/rollback` | 同上 | 回滚到指定版本 |

全部经 `mw.requireUser`，`userId` 取自服务端会话。

**客户端覆盖**：Web 与 Android 都接了上表 `/api/me/profile/*` 与 `/api/me/settings`（Android 见 §3.3）；`/api/zoowy/*` 与 `/api/zoowy/plan/*` 目前仍只有 Web 调用。

---

## 8. 触发链路总览

```
【plan】大目标页按钮
  前端 BigGoalDetail.runFlow()
    → POST /zoowy/plan/intro ──→ planIntro() ──→ ai.chat(json) ──→ {enough,question,suggestion,candidates,profile_patches}
         ↑                                                    │
         └────── history 累加递归（一次问一个） ← enough=false ──┘
    → 用户勾选候选（一次确认）
    → POST /zoowy/plan/confirm ─→ confirmPlan() ─→ executeTool('create_plan_goal') ×N
                                ─→ snapshotPlan(source='user') → plan_versions
                                ─→ executeTool('patch_my_profile') → profile_changes + profile_versions

【progress】对方点「验收通过」
  goals.js approve 事务 → res.json → setImmediate
    → runProgress() ─→ ai.chat(json) ─→ need_change?
         ├─ false → recordSkip(progress_noop) → 结束（不写库）
         └─ true  → write_big_goal_progress + patch_my_profile? → profile_changes（我页红点）

【daily】服务进程 23:30（GMT+8）
  scheduleDaily.tick() → 遍历 users → daily_enabled? → runDaily()
    → 幂等闸 → ai.chat(json) → write_my_diary + patch_my_profile? → profile_changes（我页红点）
  Android DiaryWorker（15min）→ GET /diaries/today → 有就发通知

【chat】「我」页发消息
  POST /zoowy/chat → runChat()
    → recentMessages + buildUserContext
    → runAgentLoop() ⇄ ai.chat(tools) ⇄ executeTool()   ← 最多 6 轮 / 60s
    → appendMessage(user) + appendMessage(assistant, meta: tools/profileChanges)
    → 响应 profileChanges（reportChanges 开时）
```

所有模型调用（含中间轮次）都经 `ai.js : chat()` → `recordCall()` 写 `ai_calls`。
所有画像真实变更都经 `tools.js : applyProfilePatch()` → `profileChanges.js : recordChange()` 写 `profile_changes` + `profile_versions`。

---

## 9. 安全边界与可靠性

| 边界 | 实现位置 / 手段 |
|---|---|
| 越权 | `userId` 服务端注入、工具参数无该字段；SQL 强制 owner/user 过滤；会话 `session_id + user_id` 双重过滤 |
| 最小授权 | 4 份 `WHITELIST`；新增的 `create_big_goal` 只进 `chat`，`plan`/`progress`/`daily` 仍无此能力；高危能力（验收、删目标、改积分、改口令）**根本不注册** |
| 防伪造 | `chat` 不给写日报/写进度；`response_format: json_object` + 解析失败不写库 |
| 可回滚 | `profile_versions`（首次真实变更前全量快照，已开放列表 + 回滚接口）、`plan_versions`（每次写链后快照） |
| 留痕 | `ai_calls` 记 ok/skip/fail + tokens + 耗时；`profile_changes` 记每次画像变更（含 before/after、reason/evidence）；`recordSkip()` 专记「判断不用改」 |
| 服务端裁决 | `applyProfilePatch()` 做 diff 跳过无变化、块名 / `reason` 校验、≤8 条与 ≤4000 字上限，模型提议不直接写库 |
| 汇报开关 | `reportChanges` 只控制推送 / 未读 / 同步摘要；留痕与版本快照无条件写（不汇报 ≠ 不留痕） |
| 幂等 | 业务查重（含 `create_big_goal` 的同名未归档查重）+ `UNIQUE(user_id, diary_date)` + 只动 `plan_status='planned'` |
| 成本 / 失控 | 6 轮 / 60s / 45s 三道超时，第 7 轮不再执行工具、立即降级返回；只 `bad_json` 重试一次；`AI_DAILY_LIMIT` 默认 50 |
| 失败降级 | 记账 best-effort；**轮次超限降级返回不抛 500**（§5.2）；**chat 失败先落 user 消息 + 补 assistant 错误记录，AI 类错误返回友好响应**（§6.4）；progress 异步且失败不影响验收；daily 单用户失败不影响他人 |
| 密钥 | 只在服务器 `.env`，`aiConfig()` 从 env 读；不下发 Web / Android；出站 HTTPS |
| 隐私 | 画像 / 日报 / 聊天默认仅自己；`shared` 主动分享后才在「我们」页出现摘要 |
| 手改优先 | `shift_plan_dates` 只碰 `plan_status='planned'`；手改与 AI 重排共用 `snapshotPlan` |

---

## 10. 配置与部署

| 变量 | 默认 | 说明 |
|---|---|---|
| `AI_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 百炼 OpenAI 兼容端点（末尾斜杠会被去掉） |
| `AI_API_KEY` | 空 | **必填**；为空时 zoowy 接口 503、日报调度跳过 |
| `AI_MODEL` | `qwen-plus` | 换模型只改 env |
| `AI_DAILY_LIMIT` | `50` | 单日日报生成次数上限 |
| `DATABASE_URL` | `postgres://postgres:footprint_dev_pw@localhost:5432/footprint` | PG 连接串 |
| `DATA_DIR` | `app/data` | 备份 / 日志 / 上传 |

- 密钥只放服务器 `.env`，**不进 git、不下发到 Web / Android**；建议在百炼控制台设日调用上限与预算告警。
- [app/src/index.js](app/src/index.js) 启动时 `app.use('/api', zoowyRoutes(db))` 并调用 `scheduleDaily(db, () => db.all('SELECT id FROM users'))`。
- 定时器依赖**单进程** `setInterval`；多实例部署会各自触发，靠 `diaries` UNIQUE + 幂等闸兜底不重复，但会重复消耗模型调用。
- 时区固定 `Asia/Shanghai`（`app/src/tz.js`），日报判定用 GMT+8 手算。
- 云端为明文 HTTP + Android debug 包；调百炼是出站 HTTPS，密钥不经浏览器 / 手机。

---

## 11. 已知差距与待办

> 这一节是「设计文档承诺 vs 当前代码」的诚实对照。**修掉任何一条时，把它从这里移走并写进 §12。**

| # | 差距 | 影响 | 建议 |
|---|---|---|---|
| 1 | `skipConfirm` 仍未接入工作流（**`reportChanges` 已于 v1.1 接线**，`settings.js` 为单一真源） | 待办计划 1.8 的「免确认」开关存了值但不生效；`plan` 勾选确认是前端硬走的，无免确认分支 | 若要做，只免弹窗不免候选确认；白名单与留痕不得放开 |
| 2 | 待办计划 1.5 写「不用重写就整轮跳过（**不调模型**）」，但 `progress` 必须先调一次模型才能拿到 `need_change` | 做到「不写库」，没做到「不调模型」；真正零模型调用的跳过只有 `no_big_goal` 与 `daily_dup` | 加规则化前置判断（如客观计数未变且无新信息）再决定是否调模型；或修正设计措辞 |
| 3 | 待办计划 P0-4 说「写工具带 `idempotency_key`」，实际它只是 `ai_calls` 的记账字段（仅 `daily` 传值，gateway 透传 `null`） | 幂等效果由查重 + UNIQUE 达成，机制与文档描述不符 | 二选一：统一实现 key 去重，或把设计与本文统一改成「业务查重 + 约束」 |
| 4 | `daily_enabled` 默认 0（关）、`AI_DAILY_LIMIT` 默认 50 均为设计外新增 | 不主动开启就不出日报，与「每晚 23:30 两人各一份」不一致 | 明确为产品决策并同步待办计划 / README，或改默认值 |
| 5 | Android 端仍无 zoowy 聊天 / 拆计划入口（**v1.2 已补齐画像变更、版本回滚、AI 设置**） | 待办计划 #9 / #14 要求双端都有聊天与拆计划；目前「改了什么 / 版本回滚 / 开关」双端一致，聊天与拆计划仍只 Web 有 | 补 `Api.kt` 的 chat / plan 接口 + Compose 页面 |
| 6 | [app/scripts/verify-smoke.js](app/scripts/verify-smoke.js) 只清理 `zoowy_messages` / `zoowy_sessions` / `plan_versions`，未真正跑工作流 | 57 项回归未覆盖 agent 行为（需真实 key 与模型，离线冒烟测不了） | 补一组 mock `ai.chat` 的工作流单测，覆盖白名单拒绝、幂等、JSON 失败不写库 |
| 7 | 定时任务为单进程 `setInterval` | 多实例会重复触发与重复计费 | 上分布式锁，或明确约束单实例部署 |
| 8 | `/zoowy/plan/intro` 传不存在的大目标、`/confirm` 传空 `items` 都返回 500「服务器开小差了」 | 拒绝与不写库都生效，但客户端错误被统一错误处理吞成 500，前端看不到真实原因（2026-11-07 接口联调发现） | 在 plan 两个入口把业务 `throw` 映射成 400 / 404 |
| 9 | `big_goals` 表没有独立截止日期字段 | 用户给大目标填的「截止 YYYY-MM-DD」目前只能由 `create_big_goal` 写进 `description` 末尾（`【截止】…`），无法按日期查询或提醒（v1.4 的临时处理） | 给 `big_goals` 加 `deadline TEXT` 列，并同步《数据库设计实现文档.md》§4 / §5 / §11 |

---

## 12. 变更记录

| 版本 | 日期 | 分支 | 改动摘要 | 涉及章节 |
|---|---|---|---|---|
| v1.0 | 2026-11-07 | `agent-icdi` | 初始建立：完整梳理 zoowy 实现与技术栈；写入 §0 维护约定与触发清单；新增 `check-agent-doc.js` + 两处机器可读标记块做自动兜底；登记 §11 八条已知差距 | 全文 |
| v1.1 | 2026-11-07 | `agent-icdi` | 打开 4 个工作流的画像自动更新（chat 提示词主动识别、plan 白名单加 `patch_my_profile` + intro 提议 / confirm apply）；新增 `settings.js`、`profileChanges.js`、`profile_changes` 表；`reportChanges` 接线，变更摘要同步送达 +「我」页红点 / 明细 / 版本回滚；`profile_versions` 不再只写不读；`applyProfilePatch()` 增加服务端 diff 裁决与懒写快照。接口联调 23 项全绿 | §1、§3、§4、§5.3/5.4、§6、§7、§8、§9、§11、§12 |
| v1.2 | 2026-11-07 | `agent-icdi` | 双端补齐「改完告诉用户改了什么」：Android `Api.kt` 新增 5 个方法 + DTO、`MeScreen.kt` 新增画像变更区块 / 明细 / 版本回滚 / AI 设置弹层，`UserSettings` 补 `dailyEnabled`；`app/.smoke/p0-check.js` 补 6 组行为断言（开关接线、diff 裁决、留痕、版本可读 / 回滚、4 工作流权限）与 `profile_changes` 清理。P0 冒烟 48 项全绿 | §3.3、§7、§11、§12 |
| v1.3 | 2026-11-08 | `agent-icdi` | 修掉 §11 原第 6 条：`gateway.js` 轮次超限不再抛 500，改为记 `fail` 留痕 + 返回「本轮已有内容 + 这轮查得有点多，先说到这儿」的降级响应（`degraded`/`reason`），并不再留下悬空的 `tool_calls` 消息；`chat.js` 先落 user 消息，`AiError` 失败补 assistant 错误记录并返回友好响应，`GET /zoowy/messages` 增加 `failed` 标记；总超时仍抛错但由 chat 兜住。mock 联调 15 项全绿 | §0.2、§3.1、§5.2、§6.4、§9、§11、§12 |
| v1.4 | 2026-11-08 | `agent-icdi` | 让 zoowy 能直接建 / 读大目标：新增 `list_big_goals`（按 owner 列大目标，含 id / 进度 / 客观 done,total）与 `create_big_goal`（title / description / deadline / emoji，归属校验、同名未归档幂等、1–40 字与日期校验）；`chat` 白名单 9→11 并加提示词引导（先 list 查重 / 拿 id → read 详情 → 再 create_plan_goal）；`AGENT_TOOLS` 标记块同步。`deadline` 因表无独立列暂写入描述，登记为 §11-9 | §3.1、§5.3/5.4、§6.4、§9、§11、§12 |
