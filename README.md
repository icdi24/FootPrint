# 脚印 · 双人共享监督打卡与积分系统

只有两个人用的、彼此看得见的打卡与目标系统。移动端优先的自部署 Web 应用。

- 需求文档：[需求文档.md](需求文档.md)（本仓库即按它实现）
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

第一次打开会进入**初始化向导**：依次创建两个账号（昵称 + 口令 ≥ 6 位）。之后各自用昵称 + 口令登录，会话 30 天。

## 已实现（V0.1 + 目标拆分）

| 模块 | 内容 |
|---|---|
| 账号 | 初始化创建 2 账号、bcrypt 口令、30 天会话、改口令、登出全部设备、登录失败 5 次锁 10 分钟 |
| 日常目标 | 创建/编辑/放弃（保留记录）；每日 / 每周 N 次 / **指定星期（周一~周日自定义）**；打卡窗口；时长；难度 1–5 |
| 小目标（阶段目标） | 一次性成果；验收标准（能被是/否回答）；预估总时长 × 难度算总积分（封顶 1200）；**必须对方验收**（提交→通过/驳回→积分入账，逾期发 90%） |
| 打卡 | 今日待办首页、2 步打卡（≤10 秒）、长按「完成」秒打卡、可选证据文字 + 1 张图、同日防重、24h 内撤销 |
| 积分 | 公式与默认系数同需求 5.2；连续里程碑奖励（3/7/14/30/60/100/365）；流水只增不改，余额=求和；性价比提示（>0.85 标红） |
| 监督 | 对方目标/进度/流水/兑换全可见；驳回对方打卡；**待我验收**的小目标列表（通过/驳回） |
| 愿望单 | 商品类：参考价 ×10 = 积分价（可改、留历史）、兑换锁分→自动确认实扣、2h 内撤回、冷却期、兑换记录 |
| 统计 | 本月得分、余额、最长连续、完成率、时间投入、被质疑次数；两人并排对比（不排名） |
| 数据 | PostgreSQL；每日 03:00 自动快照（JSON 导出）保留 30 天；手动快照/下载；全量导出 zip（JSON+各表 CSV）；restore 脚本恢复 |
| 周视图 | 模仿参考 App 的周网格打卡表（周/月切换、点格子打卡、漏打标记） |

**暂缓（V0.2/V0.3）**：事件类愿望单、豁免卡、软惩罚规则、补卡、关系终止、积分手动修正、通知中心、Webhook/推送、周报月报、只读访客链接、48h 验收超时自动通过、逾期 14 天自动放弃。手机版需求文档.md 是原生 App 增量，不在本 Web 部署内。

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `DATABASE_URL` | `postgres://postgres:footprint_dev_pw@localhost:5432/footprint` | PostgreSQL 连接串 |
| `DATA_DIR` | `app/data` | 备份、日志、上传图片都在这里 |
| `FOOTPRINT_VERBOSE` | 空 | 设 1 时把关键日志也打到控制台 |

时区固定按 `Asia/Shanghai` 判定"今天"与窗口；数据内部存 UTC。

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

## 安全说明（部署给外网前）

- 生产必须走 HTTPS 反向代理（如 Caddy/Nginx 终止 TLS）。
- 证据图片私有存储，经 `/api/file/:id` 鉴权访问（本人或搭档），URL 不可猜。
- 所有接口校验资源属于本人或搭档；关键操作（登录、积分变动、驳回、兑换）写本地日志，保留 90 天。
- 登录限流在进程内存中，重启会清空锁定（单机两人场景可接受）。

## 目录

```
app/                服务端（Express + pg + bcryptjs）
  src/              入口、路由、积分/连续链/备份/导出模块
  scripts/          reset-password、restore、seed-demo（演示数据）
  data/             运行时数据（备份/日志/上传，自动创建）
public/             前端（原生 JS + CSS，无构建步骤，服务端同源直出）
Dockerfile / docker-compose.yml
```

演示账号（`cd app && node scripts/seed-demo.js` 生成，正式部署请勿使用）：栗子 / lizi123，阿白 / abai123。
