// 建两个初始账号（幂等）：库为空时创建 icdi / sushi，密码均 123456。
// 只写 users 表和 settings，不写任何目标/打卡/积分/愿望单等业务数据。
// 用法：node scripts/create-users.js [用户名1] [用户名2] [密码]
// 注：注册已常开，正常部署不需要本脚本；它只用于本地一次性造号。
const path = require('path');
const { openDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { ensureSettings } = require('../src/points');
const { nowIso } = require('../src/tz');
const logMod = require('../src/log');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';

(async () => {
  const name1 = process.argv[2] || 'icdi';
  const name2 = process.argv[3] || 'sushi';
  const password = process.argv[4] || '123456';

  const db = await openDb(DATABASE_URL);
  logMod.init(path.join(DATA_DIR, 'logs'));

  const row = await db.get('SELECT COUNT(*) AS c FROM users');
  if (Number(row.c) > 0) {
    console.error(`已有 ${row.c} 个账号，跳过（不想覆盖现有数据）。`);
    process.exit(1);
  }

  // 不变量：login_name 与 nickname 恒等
  await db.run('INSERT INTO users (login_name, nickname, password_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
    [name1, name1, hashPassword(password), '🐱', nowIso()]);
  await db.run('INSERT INTO users (login_name, nickname, password_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
    [name2, name2, hashPassword(password), '🐻', nowIso()]);
  await ensureSettings(db);

  const check = await db.all('SELECT login_name FROM users ORDER BY id');
  logMod.log('setup', `脚本建号：${check.map((u) => u.login_name).join(' / ')}`);
  console.log(`已创建账号：${check.map((u) => u.login_name).join(' / ')}，密码均 ${password}`);
  console.log('业务数据（目标/打卡/积分/愿望单）为空。');
  process.exit(0);
})();
