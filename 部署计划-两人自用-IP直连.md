# 脚印 · 云服务器部署计划（历史文档，已脱敏）

> ⚠️ 本仓库为公开仓库，本文不写真实 IP、账号、口令；实际值向部署者索取。以下为当时（两人自用阶段）的计划记录，多人化后的现状见《云端运维备忘.md》。

- 服务器：`SERVER_IP`（Linux，SSH 密钥登录，sudo 可用）
- 访问方式：**公网 IP + 3201 端口直连**，不做域名、不做 HTTPS
- 数据：清空，只保留两个账号 `<账号A>` / `<账号B>`，初始口令已重置（不再使用文档里的历史值）
- 已探测：22 端口通；80/443 未监听（用不到）

---

## 目标

1. 手机上用浏览器打开 `http://SERVER_IP:3201`，用各自账号登录，功能与本地一致。
2. Android App 用 debug 包指向同一地址，上报/查看使用时长。
3. 两个账号首登后能自己改昵称、改口令。
4. 数据全空（无目标、无打卡、无流水、无愿望单）。

---

## 一、代码改动（本机仓库）

| # | 位置 | 改什么 | 原因 |
|---|---|---|---|
| C1 | `app/src/routes/auth.js` | 新增 `PATCH /api/me`：改昵称（1–20 字、不能和对方重名、唯一性冲突转 400） | “我”页只有改口令，没有改昵称 |
| C2 | `public/js/pages/me.js` | “我”页加“改昵称”按钮 + 弹窗，改完刷新本地状态 | 前端入口 |
| C3 | `app/src/routes/auth.js` | `/me` 与登录返回体确认带 `nickname`，改昵称后会话不失效 | 昵称是会话里读的字段，要确认没有缓存旧值 |
| C4 | `app/scripts/create-users.js`（新） | 幂等脚本：若库为空则创建两个账号，只建用户，不写任何业务数据 | 服务器上一次性初始化 |
| C5 | `docker-compose.yml` | 数据库密码从默认口令改为随机强口令，走 `.env` | 公网服务器，默认口令不可接受 |
| C6 | `app/src/routes/auth.js` | Cookie 保持 `secure:false`（无 HTTPS），但登录限流确认生效 | 已有锁定机制 |

> 说明：两人自用 + IP 直连 → 不做多租户改造，`/api/setup` 那条“只能初始化一次”的分支保持原样，但**部署时直接跳过 setup**，用 C4 脚本建号。（多人化后 `/api/setup` 已停用，改为邀请码注册。）

---

## 二、服务器部署

| # | 步骤 | 命令 / 说明 |
|---|---|---|
| S1 | 装 Docker + Compose | 按发行版：Ubuntu `curl -fsSL https://get.docker.com \| sh`；CentOS 用 `yum install docker-ce docker-compose-plugin`。装完 `docker compose version` 验证 |
| S2 | 上传代码 | 本机 `git status` 里有未提交改动，**先在本机提交或打包**，再用 `scp` 上传压缩包到 `/opt/footprint` |
| S3 | 写 `.env` | `POSTGRES_PASSWORD=<随机 32 位>`，不放 git |
| S4 | 起服务 | `docker compose up -d --build`，等 `curl http://127.0.0.1:3201/healthz` 返回 `{"ok":true}` |
| S5 | 防火墙 | 云控制台安全组放行 **3201/TCP**（来源建议填常用网段）；服务器内 `ufw allow 3201/tcp` |
| S6 | 建账号 | `docker compose exec footprint node scripts/create-users.js`，确认两个用户存在且业务表为空 |
| S7 | 冒烟 | 手机浏览器打开 `http://SERVER_IP:3201` → 登录 → 改昵称 → 改口令 → 重登 |

---

## 三、Android

| # | 改动 | 说明 |
|---|---|---|
| A1 | `android/local.properties`：`backendUrl=http://SERVER_IP:3201/` | 末尾 `/` 必须留 |
| A2 | 重新 Sync + 构建 **debug** 包 | release 包禁明文 HTTP，IP 直连只能 debug |
| A3 | 真机验证 | 登录 → 开使用情况访问 → 首页显示时长；换另一账号看对方数据 |

---

## 四、上线后运维

- 备份：应用每天 03:00 自动 JSON 快照，落在容器卷 `./runtime/data/backups`；另外 `pg_dump` 每周一次到宿主机。
- 改口令忘了：由管理员在 `/admin.html` 的「重置口令」处理（多人化后无自助找回）。
- 升级：本地改完 → 推送 git / 重新打包上传 → `docker compose up -d --build`。

---

## 五、当时需要确认的点（已结案）

1. **SSH 用户名**（root / ubuntu / centos / 其他）—— 密码在终端里输，不要写进文档。
2. 本机未提交改动要不要先 `git commit`？不提交的话打包时会带上工作区文件。
3. 云服务器是 Ubuntu 还是 CentOS（决定 S1 的命令）。
