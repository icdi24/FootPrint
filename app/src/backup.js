// 自动快照：每日 03:00（上海）复制数据库文件，保留 30 天；启动时补当天。
const fs = require('fs');
const path = require('path');

const KEEP_DAYS = 30;

function backupsDir(dataDir) {
  return path.join(dataDir, 'backups');
}

function checkpoint(db) {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (e) { /* 忽略 */ }
}

function backupNow(db, dataDir) {
  const dir = backupsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  checkpoint(db);
  const d = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const name = `app-${d}.db`;
  fs.copyFileSync(path.join(dataDir, 'app.db'), path.join(dir, name));
  prune(dir);
  return { name, size: fs.statSync(path.join(dir, name)).size };
}

function prune(dir) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000);
  for (const f of fs.readdirSync(dir)) {
    if (!/^app-\d{4}-\d{2}-\d{2}\.db$/.test(f)) continue;
    const p = path.join(dir, f);
    try {
      if (fs.statSync(p).mtimeMs < cutoff.getTime()) fs.unlinkSync(p);
    } catch (e) { /* 忽略 */ }
  }
}

function listBackups(dataDir) {
  const dir = backupsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^app-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .map((name) => {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      return { name, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

function hasBackupToday(dataDir) {
  const d = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return listBackups(dataDir).some((b) => b.name === `app-${d}.db`);
}

function scheduleBackup(db, dataDir) {
  const tick = () => {
    try {
      const now = new Date(Date.now() + 8 * 3600 * 1000);
      const h = now.getUTCHours();
      const m = now.getUTCMinutes();
      if (h === 3 && m < 5 && !hasBackupToday(dataDir)) {
        backupNow(db, dataDir);
      }
    } catch (e) { /* 忽略调度错误 */ }
  };
  setInterval(tick, 5 * 60 * 1000);
  tick();
}

module.exports = { backupNow, listBackups, hasBackupToday, scheduleBackup, backupsDir };
