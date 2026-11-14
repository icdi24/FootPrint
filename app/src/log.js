// 本地文件日志：登录、积分变动、验收/驳回等关键操作，按天切文件，保留 90 天。
const fs = require('fs');
const path = require('path');

let logsDir = '';

function init(dir) {
  logsDir = dir;
  fs.mkdirSync(dir, { recursive: true });
  prune();
}

function prune() {
  if (!logsDir) return;
  // 清理超过 90 天的日志文件
  const cutoff = Date.now() - 90 * 86400000;
  for (const f of fs.readdirSync(logsDir)) {
    if (!/^app-\d{8}\.log$/.test(f)) continue;
    const p = path.join(logsDir, f);
    try {
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    } catch (e) { /* 忽略 */ }
  }
}

function log(event, detail) {
  try {
    const d = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const line = `${new Date().toISOString()} [${event}] ${String(detail)}`;
    fs.appendFileSync(path.join(logsDir, `app-${d}.log`), line + '\n', 'utf8');
    if (process.env.FOOTPRINT_VERBOSE) console.log(line);
  } catch (e) { /* 日志失败不影响业务 */ }
}

module.exports = { init, log, prune };
