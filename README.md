# 脚印 · 双人共享监督打卡与积分系统

只有两个人用的、彼此看得见的打卡与目标系统。移动端优先的自部署 Web 应用。

- 需求文档：[需求文档.md](需求文档.md)（本仓库即按它实现）
- AI 工作流决策与验收：[待办计划-AI工作流与双端改造.md](待办计划-AI工作流与双端改造.md)
- **Agent 工作流实现与技术文档：[Agent工作流实现文档.md](Agent工作流实现文档.md)**（zoowy 实现的事实来源）
- 本次开发工作文档：[工作文档-zoowy工作流改造.md](工作文档-zoowy工作流改造.md)
- 设计说明与截图证据：`.oil-ui/部署脚印/`（过程工作区，不进 Git）

## 快速开始

要求 Node.js ≥ 22 和 PostgreSQL 17。

### 方式一：Docker Compose（推荐，一条命令起全部）

```bash
docker compose up -d    # 起 PostgreSQL + 应用，数据落在 ./runtime/
```

### 方式二：本地 PostgreSQL + npm

```bash
# 1. 确保 PostgreSQL 在 localhost:5432 运行，建好 footprint 库
# 2. 启动应用
cd app
npm install
npm start              # 默认 http://localhost:3000
```

应用通过环境变量 `DATABASE_URL` 连库（默认 `postgres://postgres:footprint_dev_pw@localhost:5432/footprint`）。

> 没有 Docker 的本地免安装 PG 方案：下载 EDB 的 PostgreSQL 17 binaries zip，解压后用 `initdb` + `pg_ctl` 启动（参考 `.pg/` 下的说明）。注意 PG 的 initdb 不支持中文路径，数据目录需放英文路径。

注册不再需要邀请码：直接用「用户名 + 密码（≥ 8 位）」注册，注册后是**未配对**状态，功能照常用。到「我的 → 我的搭档」看自己的邀请码发给对方，或输入对方的码、经对方确认后完成配对。会话 30 天。

> 完整设计与改动清单见 [注册与配对改造方案.md](注册与配对改造方案.md)。

## 已实现（V0.1 + 目标拆分）

| 模块 | 内容 |
|---|---|
| 账号 | 开放注册（用户名 + 密码 ≥ 8 位）、bcrypt、30 天会话、改用户名 / 改密码、登出全部设备、登录失败 5 次锁 15 分钟、注册按 IP 限流 |
| 日常目标 | 创建/编辑/放弃（保留记录）；每日 / 每周 N 次 / **指定星期（周一~周日自定义）**；打卡窗口；时长；难度 1–5 |
| 小目标（阶段目标） | 一次性成果；验收标准（能被是/否回答）；预估总时长 × 难度算总积分（封顶 1200）；**必须对方验收**（提交→通过/驳回→积分入账，逾期发 90%） |
| 打卡 | 今日待办首页、2 步打卡（≤10 秒）、长按「完成」秒打卡、可选证据文字 + 1 张图、同日防重、24h 内撤销 |
| 积分 | 公式与默认系数同需求 5.2；连续里程碑奖励（3/7/14/30/60/100/365）；流水只增不改，余额=求和；性价比提示（>0.85 标红） |
| 监督 | 对方目标/进度/流水/兑换全可见；驳回对方打卡；**待我验收**的小目标列表（通过/驳回） |
| 愿望单 | 商品类：参考价 ×10 = 积分价（可改、留历史）、兑换锁分→自动确认实扣、2h 内撤回、冷却期、兑换记录 |
| 统计 | 本月得分、余额、最长连续、完成率、时间投入、被质疑次数；两人并排对比（不排名） |
| 数据 | PostgreSQL；每日 03:00 自动快照（JSON 导出）保留 30 天；手动快照/下载；全量导出 zip（JSON+各表 CSV）；restore 脚本恢复 |
| 周视图 | 模仿参考 App 的周网格打卡表（周/月切换、点格子打卡、漏打标记） |

**暂缓（V0.2/V0.3）**：事件类愿望单、豁免卡、软惩罚规则、补卡、关系终止、积分手动修正、通知中心（Android 日报通知已做）、Webhook/推送、周报月报、只读访客链接、48h 验收超时自动通过、逾期 14 天自动放弃。手机版需求文档.md 是原生 App 增量：M1（读时长）与 AI 工作流改造（大目标 / 日报通知 / Worker 补报）均已实装，功能验收见待办计划；Web 本身仍可独立部署运行。

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `DATABASE_URL` | `postgres://postgres:footprint_dev_pw@localhost:5432/footprint` | PostgreSQL 连接串 |
| `DATA_DIR` | `app/data` | 备份、日志、上传图片都在这里 |
| `FOOTPRINT_VERBOSE` | 空 | 设 1 时把关键日志也打到控制台 |
| `SIGNUP_OPEN` | `1`（开） | 置 `0` 立即关闭注册（紧急关闸） |
| `COOKIE_SECURE` | 空 | 纯 HTTP 下**不能开**；上 HTTPS 后设 `1` 让会话 cookie 带 `Secure` |

时区固定按 `Asia/Shanghai` 判定"今天"与窗口；数据内部存 UTC。

## 数据库

表结构、启动迁移、组隔离触发器与备份策略见 [数据库设计实现文档.md](数据库设计实现文档.md)。**改库后必须同步更新该文档**，并跑 `cd app && npm run check:schema-doc` 校验表清单一致。

## 运维

```bash
# 忘了口令（部署者执行）
cd app && node scripts/reset-password.js 栗子

# 从导出 JSON 恢复（先自动快照当前库）
node scripts/restore.js data.json

# 健康检查
curl http://localhost:3000/healthz   # → {"ok":true}
```

灾难恢复三步：新机器跑起来（起 PG + 应用）→ 上传导出 zip 里的 `data.json` → `node scripts/restore.js data.json`。

## Android App（M1 · 读手机使用时长）

只读手机各 App 使用时长给对方看，**不包含锁机**（锁机是 M2）。App 是新客户端，复用本仓库后端与账号，本仓库的 Web 代码不需改动。

- 方案定稿：`手机版需求文档.md` 第 **15 节**（平台只做 Android / 只用 `UsageStatsManager` / 只在前台上报 / 上报包名 / 真机测试）。
- 后端待加：`usage_daily` 表 + `app/src/routes/usage.js`（三个接口：`PUT /api/usage/report`、`GET /api/usage/today`、`GET /api/usage/partner`）。
- 开发机只需 Windows + Android Studio；**不需要 Mac**。
- 手机联调要点：手机与电脑同一 Wi-Fi，用电脑局域网 IP 访问（不是 `localhost`）；debug 包放行明文 HTTP；**使用时长在模拟器里恒为 0，核心功能必须真机测**。

## 安全说明（部署给外网前）

- 生产必须走 HTTPS 反向代理（如 Caddy/Nginx 终止 TLS）。
- 证据图片私有存储，经 `/api/file/:id` 鉴权访问（本人或搭档），URL 不可猜。
- 所有接口校验资源属于本人或搭档；关键操作（登录、积分变动、驳回、兑换、配对）写本地日志，保留 90 天。
- 登录限流按用户名 + IP 落 `login_attempts` 表（5 次锁 15 分钟，重启不清空）；注册另有按 IP 限流（1h 5 次 / 1d 20 次）。
- **注册常开 + 明文 HTTP**：口令、会话 cookie、邀请码全明文传输，任何拿到 IP 的人都能注册、抢注用户名、批量灌库。这是当前已知且已接受的风险；长期公开前必须上 HTTPS 反向代理，或置 `SIGNUP_OPEN=0` 关闸。

## 目录

```
app/                服务端（Express + pg + bcryptjs）
  src/              入口、路由、积分/连续链/备份/导出模块
  scripts/          reset-password、restore、seed-demo、migrate-register-pair（改造迁移）
  data/             运行时数据（备份/日志/上传，自动创建）
public/             前端（原生 JS + CSS，无构建步骤，服务端同源直出）
Dockerfile / docker-compose.yml
```

演示账号由 `cd app && node scripts/seed-demo.js` 在本地空库生成（密码见脚本，仅限本地演示）。云端账号密码一律由管理员后台下发并定期轮换，不要沿用演示密码。

## Agent 工作流（zoowy）

zoowy = 一个网关 + 4 个工作流（`plan` 规划 / `progress` 进度 / `daily` 日报 / `chat` 常驻问答），后端自己调阿里百炼 OpenAI 兼容 API，不依赖开发会话里的 agent。实现细节、技术栈、表结构、API、触发链路与安全边界全部记在 [Agent工作流实现文档.md](Agent工作流实现文档.md)；设计决策与验收清单在 [待办计划-AI工作流与双端改造.md](待办计划-AI工作流与双端改造.md)。

> **维护约定**：任何涉及 agent 工作流的改动 —— 工具注册表、白名单、提示词、输出 schema、loop 参数、触发点、表结构、定时任务、会话 / 可见性、前端与 Android 入口、配置项 —— **必须在同一个提交里同步更新 `Agent工作流实现文档.md`**，并在该文档 §12 追加一行变更记录。完整触发清单与最小动作见文档 §0。

自动兜底：改完跑 `node app/scripts/check-agent-doc.js`；增删 / 改名工具或工作流却没同步文档时，脚本会非零退出。

当前已知差距（Android 端仍缺 zoowy 聊天 / 拆计划、`skipConfirm` 未接进工作流、plan 两处错误码等）列在文档 §11；修掉一条就从那里移走。`reportChanges` 已于 v1.1 接线：zoowy 每次改动画像会告诉你改了什么，Web「我」页与 Android「我」页都有红点、明细、版本回滚（v1.2 双端对齐）；关掉开关只是不推送，留痕照写。
