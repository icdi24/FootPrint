# 工作文档 · zoowy 工作流分析与画像变更链路改造

| 项 | 值 |
|---|---|
| 工作日期 | 2026-11-07 |
| 开发分支 | `agent-icdi`（基于 `main` / `origin/main` 的 `b326053`） |
| 交付目标 | 远程主分支 `origin/main` |
| 仓库 | `git@github.com:icdi24/FootPrint.git` |
| 涉及范围 | 后端 `app/src/**`、Web `public/**`、Android `android/app/src/main/**`、根目录文档 |
| 文档状态 | 与本次提交一致 |

---

## 1. 本次工作目标

1. 从 `main` 新建 `agent-icdi` 分支作为工作分支。
2. 完整分析项目里 zoowy agent 工作流的实现与流程（网关、4 个工作流、工具白名单、会话、模型适配）。
3. 建立 zoowy 实现的**唯一事实来源**文档，并立下「改代码必须同提交更新文档」的约定。
4. 本地启动服务，对 agent 相关接口与工作流做端到端联调。
5. 打开「识别有用信息自动更新画像」与「更新后告诉用户改了什么」两条能力，Web 与 Android 双端对齐。
6. 编写本工作文档，并把全部成果一并提交到远程主分支。

---

## 2. 关键设计决策

| 决策 | 理由 |
|---|---|
| **一个网关 + 4 个工作流，不拆多 agent** | 两人自用、单 Node 进程；多 agent 会割裂会话、抢画像读写、成本翻倍。「专业」体现在各自的提示词、工具白名单、输出 schema |
| **模型只提议，服务端裁决** | 没有把「识别有用信息」改成硬脚本（会丢掉识别能力），而是让 4 个工作流都能提议画像补丁，统一由 `applyProfilePatch()` 做 diff 跳过、必填 `reason`、条数与长度校验、懒写快照、生成摘要 |
| **不汇报 ≠ 不留痕** | `reportChanges` 只控制推送 / 未读 / 同步摘要；`profile_changes` 与 `profile_versions` 无条件写，随时可查可回滚 |
| **文档即事实来源 + 可运行校验** | 建立实现文档 + §0 同步约定 + 标记块校验脚本，避免「改了代码忘改文档」 |
| **计划链与画像走同一套确认链路** | plan 的候选小目标与画像补丁都是「intro 提议 → 用户勾选确认 → 服务端写库 → 快照 → 记账」，模型无法绕过确认直接写库 |

---

## 3. 交付清单

### 3.1 后端（`app/src/`）

| 文件 | 改动 |
|---|---|
| `agent/tools.js` | `applyProfilePatch()` 增加服务端 diff、结构化 `changes`/`summary`、懒写快照、变更留痕；`WHITELIST.plan` 放开 `patch_my_profile`；`executeTool()` 把 `workflow` 传入 ctx |
| `agent/workflows/chat.js` | 提示词改为主动识别对话新事实；响应与会话 `meta` 带 `profileChanges`（受 `reportChanges` 控制） |
| `agent/workflows/plan.js` | intro 输出 `profile_patches`（只提议）；confirm 接收并 apply（零额外模型调用），响应带变更摘要 |
| `agent/workflows/progress.js` / `daily.js` | 原有 `profile_patches` 自动走统一管线，结果写入 `profile_changes`，由「我」页红点送达 |
| `settings.js`（新增） | `getUserSettings()` 单一真源，路由与 4 个工作流共用 |
| `profileChanges.js`（新增） | 变更留痕、摘要、已读、版本列表、回滚（回滚不整表删，保留 `shared`） |
| `routes/auth.js` | 改用共享 settings；新增 4 个接口：`GET /me/profile/changes`、`POST /me/profile/changes/read`、`GET /me/profile/versions`、`POST /me/profile/versions/:id/rollback` |
| `routes/zoowy.js` | `GET /zoowy/messages` 返回历史里的 `profileChanges` |
| `routes/biggoals.js` | `/zoowy/plan/confirm` 透传 `profile_patches` |
| `db.js` | 新增 `profile_changes` 表与索引，并纳入 `pairTables` 触发器清单 |

### 3.2 Web（`public/`）

| 文件 | 改动 |
|---|---|
| `js/pages/me.js` | 「画像变更」区块（未读红点、最近摘要）、变更记录弹层（明细展开 / 版本回滚 / 全部已读） |
| `js/pages/zoowy.js` | 气泡显示「📝 更新了画像：xxx」 |
| `js/pages/biggoal.js` | 保存 intro 的 `profile_patches` 并在 confirm 时透传；变更后 toast |
| `css/app.css` | 画像变更与聊天气泡样式 |

### 3.3 Android（`android/app/src/main/`）

| 文件 | 改动 |
|---|---|
| `net/Api.kt` | 新增 `getProfileChanges()` / `markProfileChangesRead()` / `getProfileVersions()` / `rollbackProfileVersion()` / `updateAiSettings()`，配套 7 个 DTO；`UserSettings` 补 `dailyEnabled` |
| `ui/MeScreen.kt` | 「画像变更」区块、变更记录弹层（明细 / 版本回滚 / 全部已读）、「AI 设置」弹层（改完汇报 / 免确认 / AI 日报） |

### 3.4 文档与校验

| 文件 | 改动 |
|---|---|
| `Agent工作流实现文档.md`（新增） | zoowy 实现的唯一事实来源，v1.2；含 §0 维护约定、12 章技术说明、§11 已知差距、§12 变更记录 |
| `数据库设计实现文档.md`（新增） | 数据库结构实现文档，与 `db.js` 同步；本次完整登记新增的 `profile_changes` 表（表清单、字段、索引、触发器清单、变更记录） |
| `app/scripts/check-agent-doc.js`（新增） | 校验工具清单 / 工作流清单与文档标记块一致 |
| `app/scripts/check-schema-doc.js`（新增） | 校验 `db.js` 建表清单与数据库文档一致 |
| `app/package.json` | 新增 `check:schema-doc` 脚本 |
| `README.md` | 文档索引、数据库章节、Agent 工作流章节、维护约定与自动兜底说明 |
| `app/.smoke/p0-check.js` | 本地冒烟脚本（`.smoke/` 已被 gitignore，**不入库**）：补 6 组行为断言与 `profile_changes` 清理 |

---

## 4. 验证记录

| 验证 | 结果 |
|---|---|
| 本地服务启动（干净端口 34567，避开 3000/3001 的端口冲突） | 成功，PostgreSQL 连接正常 |
| agent 接口与工作流端到端联调 | **51 项全绿**（44 + 补充 7） |
| 画像变更链路联调（真实调用百炼 `qwen-plus`） | **23 项全绿** |
| P0 冒烟 `p0-check.js` | **48 项全绿，0 失败** |
| `node app/scripts/check-agent-doc.js` | 工具清单 11 项、工作流清单 4 项一致 |
| `cd app && npm run check:schema-doc` | `db.js` 与文档均为 28 张表，清单一致（`profile_changes` 已同步） |
| JS 语法检查 | 全部改动文件通过 |
| Kotlin 静态一致性检查 | 新增方法 / DTO 与 `MeScreen` 引用一一对应，接口路径对齐，括号平衡 |

**端到端联调关键证据**：chat 真实调用模型后返回 `profileChanges`（「更新能力」）；plan intro 产出 `profile_patches`、confirm 后 apply；重复补丁被服务端 diff 整轮跳过；`reportChanges=false` 时留痕照写但 `reported=false`、不计未读、响应不送达；版本列表可读、回滚可用；白名单越权仍全部被拒。

**未在本机验证**：Android 编译（仓库无 `gradlew`、`ANDROID_HOME` 为空），需 Android Studio 编译并真机验证新增区块。

---

## 5. 联调环境与注意事项

- 本机 3000 端口存在**双监听冲突**：本项目服务绑 `0.0.0.0:3000`，一个无关的 QQ 后端绑 `127.0.0.1:3000`。`localhost:3000` 正常（走 IPv6 `::1`），`127.0.0.1:3000` 会串到无关服务。3001 同理。联调统一使用干净端口 34567。
- 云端 / 本地 3000 上常驻的实例若仍是旧代码，**必须重启**才能加载新增的 `/api/me/profile/*` 接口；Android 端依赖这些新接口。
- 密钥只在服务器 `.env`，不进 git、不下发 Web / Android；本次 diff 已扫描无敏感信息。
- 测试数据全部清理回基线（`goals` 12 条真实数据未动），临时联调脚本已删除。

---

## 6. 已知差距与下一步

完整清单见 [Agent工作流实现文档.md](Agent工作流实现文档.md) §11（9 条），要点：

1. `skipConfirm` 免确认开关仍未接入工作流（`reportChanges` 已接线）。
2. `progress` 的「整轮跳过」仍需先调一次模型才能判断，未做到「不调模型」。
3. `idempotency_key` 实际只是 `ai_calls` 记账字段，幂等靠查重 + UNIQUE。
4. `daily_enabled` 默认关、`AI_DAILY_LIMIT` 默认 50 为设计外新增。
5. Android 端仍缺 zoowy 聊天 / 拆计划入口（本次只补齐「改了什么」链路）。
6. `chat` loop 抛错时该轮问答不落会话历史。
7. `verify-smoke.js` 仍未覆盖 agent 工作流（`p0-check.js` 已补行为断言）。
8. 定时任务为单进程 `setInterval`，多实例会重复触发。
9. plan 两个入口把客户端错误吞成 500，应映射为 400 / 404。

---

## 7. 文档维护约定（必须遵守）

> **任何涉及 agent 工作流的改动，必须在同一个提交里同步更新 `Agent工作流实现文档.md`，并在 §12 追加变更记录。**
> 任何数据库结构改动必须同步更新 `数据库设计实现文档.md`。

两份实现文档都配了可运行的清单校验脚本：

```bash
node app/scripts/check-agent-doc.js     # 工具 / 工作流清单 vs 文档标记块
cd app && npm run check:schema-doc      # db.js 建表清单 vs 数据库文档
```

触发清单与每次更新的最小动作分别写在 `Agent工作流实现文档.md` §0 与 `数据库设计实现文档.md` §0。

---

## 8. 提交与发布

- 工作分支：`agent-icdi`
- 本次提交：工作文档 + 全部代码 / 文档 / 校验脚本，**一次提交**带上
- 发布方式：提交推送到 `origin/agent-icdi` 后，快进合并到本地 `main` 并推送 `origin/main`
- 提交前基线：`main` = `origin/main` = `b326053`，无分叉
