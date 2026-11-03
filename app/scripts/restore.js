// 从导出的 JSON 恢复：node scripts/restore.js <导出文件 data.json>
// 恢复前会自动做一次当前库快照。
const fs = require('fs');
const path = require('path');
const { openDb } = require('../src/db');
const { restoreFromJson } = require('../src/export');
const logMod = require('../src/log');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node scripts/restore.js <data.json>');
    console.error('说明：恢复前自动快照当前库；JSON 来自「设置 → 数据 → 导出」zip 里的 data.json');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`文件不存在：${file}`);
    process.exit(1);
  }
  const json = fs.readFileSync(file, 'utf8');
  const db = await openDb(DATABASE_URL);
  logMod.init(path.join(DATA_DIR, 'logs'));
  try {
    await restoreFromJson(db, json, DATA_DIR);
    logMod.log('restore', `从 ${file} 恢复数据`);
    console.log('恢复完成。当前会话与积分系数设置保持不变，业务数据已替换。');
    process.exit(0);
  } catch (e) {
    console.error('恢复失败：' + e.message);
    process.exit(1);
  }
})();
