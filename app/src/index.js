// 脚印 V0.1 · 单进程 Web 服务入口。一条命令启动：npm start
const express = require('express');
const path = require('path');
const fs = require('fs');

require('./env').loadEnvFile();

const { openDb } = require('./db');
const { ensureSettings } = require('./points');
const { makeMiddleware } = require('./middleware');
const logMod = require('./log');
const backup = require('./backup');
const authRoutes = require('./routes/auth');
const goalsRoutes = require('./routes/goals');
const wishRoutes = require('./routes/wish');
const partnerRoutes = require('./routes/partner');
const opsRoutes = require('./routes/ops');
const usageRoutes = require('./routes/usage');
const bigGoalsRoutes = require('./routes/biggoals');
const diariesRoutes = require('./routes/diaries');
const zoowyRoutes = require('./routes/zoowy');
const deepSeekRoutes = require('./routes/deepseek');
const zoowyAttachmentsRoutes = require('./routes/zoowy-attachments');
const { scheduleDaily } = require('./agent/workflows/daily');
const { scheduleAutoApprove } = require('./verify-auto');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, '..', 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;
// PostgreSQL 连接串：DATABASE_URL 优先，否则拼默认本机 PG。
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';

async function main() {
  const db = await openDb(DATABASE_URL);
  await ensureSettings(db);
  logMod.init(path.join(DATA_DIR, 'logs'));
  logMod.log('boot', `服务启动 dataDir=${DATA_DIR}`);

  // 启动时补当天快照（保证每天至少一份基线）
  try {
    if (!backup.hasBackupToday(DATA_DIR)) await backup.backupNow(db, DATA_DIR);
  } catch (e) {
    logMod.log('backup_fail', String(e.message));
  }
  backup.scheduleBackup(db, DATA_DIR);
  // 小目标验收 48h 超时自动通过（需求 7.4）
  scheduleAutoApprove(db, logMod);

  const mw = makeMiddleware(db);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(mw.attachUser);

  // API
  app.use('/api', authRoutes(db));
  app.use('/api', goalsRoutes(db));
  app.use('/api', wishRoutes(db));
  app.use('/api', partnerRoutes(db));
  app.use('/api', opsRoutes(db, DATA_DIR));
  app.use('/api', usageRoutes(db));
  app.use('/api', bigGoalsRoutes(db));
  app.use('/api', diariesRoutes(db));
  app.use('/api', zoowyRoutes(db));
  app.use('/api', deepSeekRoutes(db));
  app.use('/api', zoowyAttachmentsRoutes(db));
  app.use('/api', require('./routes/pair')(db));
  app.use('/api', require('./routes/admin')(db));

  // AI 日报定时（P2-#12）：每晚 23:30 两人各一份；幂等，服务重启当天会补跑
  scheduleDaily(db, async () => db.all('SELECT id FROM users'));

  // 健康检查（需求 13.5：GET /healthz）
  app.get('/healthz', (req, res) => {
    res.json({ ok: true });
  });

  // 静态前端
  app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));

  // SPA 兜底
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    const indexHtml = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    res.status(404).send('前端文件缺失，请检查 public/ 目录');
  });

  // 统一错误处理
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: '请求体不是合法 JSON' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: '请求体过大' });
    }
    logMod.log('error', String(err && err.stack ? err.stack : err));
    if (!res.headersSent) res.status(500).json({ error: '服务器开小差了' });
  });

  app.listen(PORT, process.env.HOST || undefined, () => {
    console.log('');
    console.log('  🐾 脚印 V0.1 已启动');
    console.log(`  ➜ 本机访问  http://localhost:${PORT}`);
    console.log(`  ➜ 数据库     ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);
    console.log(`  ➜ 数据目录  ${DATA_DIR}`);
    console.log(`  ➜ 健康检查  http://localhost:${PORT}/healthz`);
    console.log('');
  });
}

main().catch((e) => {
  console.error('启动失败：', e && e.message ? e.message : e);
  process.exit(1);
});
