// 注册与配对改造的一次性数据迁移（幂等，可重跑）
// 用法：node scripts/migrate-register-pair.js
// 前置：openDb 已把 pair_invites.pair_id 改为可空并加好 requested_by / requested_at
const { openDb } = require('../src/db');
const { nowIso } = require('../src/tz');

const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';

const SERIAL_TABLES = [
  'users', 'goals', 'check_ins', 'point_ledger', 'verifications', 'wish_items',
  'wish_history', 'redemptions', 'uploads', 'big_goals', 'user_profiles',
  'profile_versions', 'plan_versions', 'diaries', 'zoowy_sessions',
  'zoowy_messages', 'ai_calls', 'pairs', 'pair_events', 'profile_changes',
];

(async () => {
  const db = await openDb(DB_URL);

  // 1) users 两列恒等
  // 1a) 老库可能根本没回填过 login_name（早期 seed 脚本只写 nickname）：先用 nickname 补上，
  //     否则这类账号改造后查 login_name 永远登不上
  const blank = await db.all("SELECT id, nickname FROM users WHERE login_name IS NULL OR login_name = '' ORDER BY id");
  if (blank.length) {
    console.log(`[1/3] ${blank.length} 个账号 login_name 为空，用 nickname 回填：`);
    for (const u of blank) console.log(`  #${u.id} -> ${u.nickname}`);
    await db.exec("UPDATE users SET login_name = nickname WHERE login_name IS NULL OR login_name = ''");
  }
  // 1b) 两列都非空但分叉：按 login_name 统一（它是实际在用的登录凭证，且全局唯一）
  const split = await db.all(
    "SELECT id, login_name, nickname FROM users WHERE login_name IS NOT NULL AND login_name <> '' AND nickname IS DISTINCT FROM login_name ORDER BY id"
  );
  if (split.length) {
    console.log(`[1/3] ${split.length} 个两列分叉的账号，按 login_name 统一：`);
    for (const u of split) console.log(`  #${u.id} login_name=${u.login_name} / 原 nickname=${u.nickname}`);
    await db.exec("UPDATE users SET nickname = login_name WHERE login_name IS NOT NULL AND login_name <> '' AND nickname IS DISTINCT FROM login_name");
  }
  if (!blank.length && !split.length) console.log('[1/3] users 两列已一致，无需回填');
  // 1c) 保证「用户名全局唯一」的 DB 约束（migrate-multi.js 里的步骤，幂等）
  const dup = await db.all('SELECT login_name, COUNT(*) AS c FROM users GROUP BY login_name HAVING COUNT(*) > 1');
  if (dup.length) {
    console.log('[1/3] 警告：以下 login_name 重复，跳过唯一索引，需人工处理：' + dup.map((x) => x.login_name).join(', '));
  } else {
    await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_login_name ON users(login_name)');
    await db.exec('ALTER TABLE users ALTER COLUMN login_name SET NOT NULL');
    console.log('[1/3] uq_users_login_name 唯一索引 + NOT NULL 已就位');
  }

  // 2) 旧邀请码语义从「绑组」变「绑人」：未使用的一律作废，避免被误用来触发配对
  const inv = await db.get('SELECT COUNT(*) AS c FROM pair_invites WHERE used_by IS NULL AND revoked_at IS NULL');
  if (Number(inv.c) > 0) {
    await db.run('UPDATE pair_invites SET revoked_at = ? WHERE used_by IS NULL AND revoked_at IS NULL', [nowIso()]);
    console.log(`[2/3] 作废旧邀请码 ${inv.c} 条`);
  } else {
    console.log('[2/3] 没有未使用的旧邀请码');
  }

  // 3) 对齐 SERIAL 序列（restore.js 曾用显式 id 整表插入，序列可能落后）
  for (const t of SERIAL_TABLES) {
    await db.exec(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`);
  }
  console.log(`[3/3] SERIAL 序列已对齐 ${SERIAL_TABLES.length} 张表`);
  process.exit(0);
})().catch((e) => { console.error('迁移失败: ' + e.message); process.exit(1); });
