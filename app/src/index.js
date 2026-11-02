// 脚印 V0.1 · 单进程 Web 服务入口。一条命令启动：npm start
const express = require('express');
const path = require('path');
const fs = require('fs');

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

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, '..', 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;

const db = openDb(DATA_DIR);
ensureSettings(db);
logMod.init(path.join(DATA_DIR, 'logs'));
logMod.log('boot', `服务启动 dataDir=${DATA_DIR}`);

// 启动时补当天快照（保证每天至少一份基线）
try {
  if (!backup.hasBackupToday(DATA_DIR)) backup.backupNow(db, DATA_DIR);
} catch (e) {
  logMod.log('backup_fail', String(e.message));
}
backup.scheduleBackup(db, DATA_DIR);

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

app.listen(PORT, () => {
  console.log('');
  console.log('  🐾 脚印 V0.1 已启动');
  console.log(`  ➜ 本机访问  http://localhost:${PORT}`);
  console.log(`  ➜ 数据目录  ${DATA_DIR}`);
  console.log(`  ➜ 健康检查  http://localhost:${PORT}/healthz`);
  console.log('');
});
