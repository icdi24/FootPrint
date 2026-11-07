// 创建 / 提升管理员：node scripts/create-admin.js <登录名> [口令]
// 账号已存在 → 提升为管理员；不存在 → 新建独立管理员账号（不进任何组）
const { openDb } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { nowIso } = require('../src/tz');

const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';

(async () => {
  const loginName = process.argv[2];
  if (!loginName) { console.error('用法: node scripts/create-admin.js <登录名> [口令]'); process.exit(1); }
  const db = await openDb(DB_URL);
  const u = await db.get('SELECT id, nickname FROM users WHERE login_name = ?', [loginName]);
  if (u) {
    await db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [u.id]);
    console.log(`已把 ${u.nickname} (${loginName}) 提升为管理员`);
  } else {
    const pw = process.argv[3];
    if (!pw || pw.length < 8) { console.error('新建管理员需给至少 8 位口令'); process.exit(1); }
    const info = await db.run(
      'INSERT INTO users (login_name, nickname, password_hash, avatar, created_at, is_admin) VALUES (?, ?, ?, ?, ?, 1) RETURNING id',
      [loginName, loginName, hashPassword(pw), '🛠️', nowIso()]
    );
    console.log(`已新建管理员 ${loginName} (id=${info.id})`);
  }
  process.exit(0);
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1); });

void crypto;
