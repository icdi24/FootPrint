#!/usr/bin/env bash
# 脚印 · 服务器端部署脚本（在服务器上执行，需要 sudo）
#
# 两种用法：
#   1) 服务器能直连 GitHub（推荐，最省事）：
#        bash remote-deploy.sh                 # 部署 main
#        bash remote-deploy.sh <分支名>
#
#   2) 服务器连不上 GitHub，先在本机打好包再上传：
#        # 本机：git archive --format=tar.gz HEAD -o footprint-deploy.tar.gz
#        # 上传：scp footprint-deploy.tar.gz ubuntu@<服务器>:/tmp/
#        bash remote-deploy.sh --tarball /tmp/footprint-deploy.tar.gz
#
# 脚本做的事（顺序固定）：
#   0. 前置检查（compose / .env 必须存在）
#   1. 备份数据库 → $APP_DIR/backup-before-deploy-<时间戳>/cloud-pg.dump
#   2. 取代码（clone 或解包）
#   3. 覆盖代码，但绝不碰 .env 和 runtime/（用户数据 / 备份 / 上传）
#   4. 修正端口绑定（仓库里是 127.0.0.1:3201，公网访问必须是 0.0.0.0:3201）后重建容器
#   5. 健康检查，失败时打印日志位置和回滚命令
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/footprint}"
# 公网地址不写死（仓库是公开的）：不设 PUBLIC_HOST 就跳过公网检查，只验本机
PUBLIC_HOST="${PUBLIC_HOST:-}"
REPO_HTTPS="${REPO_HTTPS:-https://github.com/icdi24/FootPrint.git}"

MODE="git"
REF="main"
TARBALL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tarball) MODE="tarball"; TARBALL="${2:-}"; shift 2 ;;
    --no-build) NO_BUILD="1"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) REF="$1"; shift ;;
  esac
done

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$APP_DIR/backup-before-deploy-$TS"

echo "=============================================================="
echo " 脚印部署  mode=$MODE  ref=$REF"
echo " 应用目录  $APP_DIR"
echo " 备份目录  $BACKUP_DIR"
echo "=============================================================="

# ---------- 0. 前置检查 ----------
[[ -f "$APP_DIR/docker-compose.yml" ]] || { echo "✗ 找不到 $APP_DIR/docker-compose.yml，APP_DIR 不对？"; exit 1; }
[[ -f "$APP_DIR/.env" ]] || { echo "✗ 找不到 $APP_DIR/.env（需要 POSTGRES_PASSWORD / DEEPSEEK_API_KEY）"; exit 1; }
sudo docker compose version >/dev/null 2>&1 || { echo "✗ docker compose 不可用"; exit 1; }
if [[ "$MODE" == "tarball" ]]; then
  [[ -f "$TARBALL" ]] || { echo "✗ 找不到包：$TARBALL"; exit 1; }
fi

cd "$APP_DIR"

# ---------- 1. 备份数据库 ----------
DB_CONTAINER="$(sudo docker compose ps -q db 2>/dev/null | head -1 || true)"
if [[ -z "$DB_CONTAINER" ]]; then
  DB_CONTAINER="$(sudo docker ps --format '{{.Names}}' | grep -i 'db' | head -1 || true)"
fi

mkdir -p "$BACKUP_DIR"
if [[ -n "$DB_CONTAINER" ]]; then
  echo "[1/5] 备份数据库（容器 $DB_CONTAINER）→ $BACKUP_DIR/cloud-pg.dump"
  sudo docker exec "$DB_CONTAINER" pg_dump -U postgres -Fc footprint > "$BACKUP_DIR/cloud-pg.dump"
  ls -lh "$BACKUP_DIR/cloud-pg.dump"
else
  echo "[1/5] ⚠ 没找到 db 容器，跳过数据库备份（继续部署，但回滚就没有数据快照了）"
fi

# ---------- 2. 取代码 ----------
SRC_DIR="/tmp/fp-src-$TS"
if [[ "$MODE" == "git" ]]; then
  echo "[2/5] 从 GitHub 拉取 $REF"
  rm -rf "$SRC_DIR"
  if ! git clone --quiet --depth 1 --branch "$REF" "$REPO_HTTPS" "$SRC_DIR"; then
    echo "✗ git clone 失败（服务器可能连不上 GitHub）"
    echo "  改用打包方式：本机 git archive → scp 到 /tmp → bash remote-deploy.sh --tarball <包路径>"
    exit 1
  fi
  echo "      提交：$(git -C "$SRC_DIR" log -1 --format='%h %ad %s' --date=iso)"
else
  echo "[2/5] 解包 $TARBALL"
  rm -rf "$SRC_DIR"; mkdir -p "$SRC_DIR"
  tar -xzf "$TARBALL" -C "$SRC_DIR"
  # 兼容两种包结构：根目录直接是文件，或带一层 FootPrint-<ref>/ 目录
  if [[ ! -f "$SRC_DIR/docker-compose.yml" ]]; then
    inner="$(find "$SRC_DIR" -maxdepth 1 -mindepth 1 -type d | head -1)"
    [[ -n "$inner" && -f "$inner/docker-compose.yml" ]] && SRC_DIR="$inner"
  fi
  [[ -f "$SRC_DIR/docker-compose.yml" ]] || { echo "✗ 包里没有 docker-compose.yml，包结构不对"; exit 1; }
fi

# ---------- 3. 覆盖代码（保留 .env / runtime） ----------
echo "[3/5] 覆盖代码（.env 与 runtime/ 原样保留）"
tar -C "$SRC_DIR" -cf - \
  --exclude='.git' --exclude='.env' --exclude='runtime' --exclude='node_modules' \
  . | sudo tar -C "$APP_DIR" -xf -
sudo chown -R ubuntu:ubuntu "$APP_DIR"
# runtime/ 是数据卷，单独确保属主正确，但不动内容
[[ -d "$APP_DIR/runtime" ]] && sudo chown -R ubuntu:ubuntu "$APP_DIR/runtime" || true

# ---------- 4. 端口绑定 + 重建 ----------
echo "[4/5] 修正端口绑定并重建容器"
sed -i 's|"127.0.0.1:3201:3000"|"3201:3000"|' "$APP_DIR/docker-compose.yml"
grep -n -A1 'ports:' "$APP_DIR/docker-compose.yml" | head -4

if [[ "${NO_BUILD:-0}" == "1" ]]; then
  echo "      --no-build：只同步代码，不重建"
else
  cd "$APP_DIR"
  sudo docker compose up -d --build
fi

# ---------- 5. 健康检查 ----------
echo "[5/5] 健康检查"
LOCAL_OK="no"
for i in $(seq 1 12); do
  if curl -fsS --max-time 3 http://127.0.0.1:3201/healthz >/dev/null 2>&1; then LOCAL_OK="yes"; break; fi
  sleep 3
done

echo -n "  本机 127.0.0.1:3201/healthz → "
curl -fsS --max-time 5 http://127.0.0.1:3201/healthz || echo "(失败)"
echo
if [[ -n "$PUBLIC_HOST" ]]; then
  echo -n "  公网 $PUBLIC_HOST:3201/healthz → "
  curl -fsS --max-time 5 "http://$PUBLIC_HOST:3201/healthz" || echo "(失败，可能安全组或还没起来)"
  echo
fi
sudo docker compose -f "$APP_DIR/docker-compose.yml" ps

echo
if [[ "$LOCAL_OK" == "yes" ]]; then
  echo "✅ 部署完成：$REF（$TS）"
  echo "   回滚（若功能异常）："
  echo "     1) sudo docker compose -f $APP_DIR/docker-compose.yml down"
  echo "     2) 把代码切回上一个版本（--tarball 模式重新传旧包，或 git checkout 旧提交）"
  echo "     3) sudo docker exec -i $DB_CONTAINER pg_restore -U postgres -d footprint --clean --if-exists < $BACKUP_DIR/cloud-pg.dump"
  echo "     4) sudo docker compose -f $APP_DIR/docker-compose.yml up -d --build"
else
  echo "❌ 健康检查没通过。排查："
  echo "     sudo docker compose -f $APP_DIR/docker-compose.yml logs --tail=100 footprint"
  echo "   数据库备份：$BACKUP_DIR/cloud-pg.dump"
  exit 1
fi
