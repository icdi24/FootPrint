// 部署者生成种子邀请码（首个组 / 组内缺人时补码）
// 用法：node scripts/create-seed-invite.js <登录名>
const crypto = require('crypto');
const { openDb } = require('../src/db');
const { nowIso } = require('../src/tz');

const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';

(async () => {
  const loginName = process.argv[2];
  if (!loginName) { console.error('用法: node scripts/create-seed-invite.js <登录名>'); process.exit(1); }
  const db = await openDb(DB_URL);
  const u = await db.get('SELECT id, nickname FROM users WHERE login_name = ?', [loginName]);
  if (!u) { console.error('找不到账号: ' + loginName); process.exit(1); }

  let row = await db.get('SELECT pair_id FROM pair_members WHERE user_id = ?', [u.id]);
  if (!row) {
    const p = await db.run("INSERT INTO pairs (status, created_at) VALUES ('active', ?) RETURNING id", [nowIso()]);
    const pid = Number(p.id);
    await db.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)', [pid, u.id, nowIso()]);
    row = { pair_id: pid };
    console.log('为 ' + u.nickname + ' 新建组 ' + pid);
  }
  const pid = Number(row.pair_id);
  const n = await db.get('SELECT COUNT(*) AS c FROM pair_members WHERE pair_id = ?', [pid]);
  if (Number(n.c) >= 2) { console.error('组 ' + pid + ' 已满 2 人，不能发码'); process.exit(1); }

  const code = crypto.randomBytes(6).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  await db.run(
    'INSERT INTO pair_invites (code, pair_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    [code, pid, u.id, nowIso(), expires]
  );
  console.log('邀请码: ' + code);
  console.log('有效期至: ' + expires + '（24h，一次性）');
  console.log('组: ' + pid + ' | 发码人: ' + u.nickname);
  process.exit(0);
})().catch((e) => { console.error('生成失败: ' + e.message); process.exit(1); });
