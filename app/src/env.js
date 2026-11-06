// 轻量 .env 加载（无依赖）：读项目根 .env，已有环境变量优先（Docker compose 注入的不被覆盖）
const path = require('path');
const fs = require('fs');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  try {
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      const val = m[2].replace(/^["']|["']$/g, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  } catch (e) { /* .env 缺失或读不了就当没有 */ }
}

module.exports = { loadEnvFile };
