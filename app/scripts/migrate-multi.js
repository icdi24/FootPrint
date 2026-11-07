// 幂等迁移：把现有双人 / 2 对数据迁到多人组模型。
// 用法：node scripts/migrate-multi.js
// 前置：openDb 已建好 pairs / pair_members / pair_invites / login_attempts 与各表 pair_id 列。
const { openDb } = require('../src/db');
const { nowIso } = require('../src/tz');

const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';

// 各表判定「归属用户」的列；goal_milestones 通过 goal_id 间接推导
const USER_COL = {
  goals: 'owner_id',
  check_ins: 'user_id',
  point_ledger: 'user_id',
  verifications: 'submitter_id',
  wish_items: 'owner_id',
  wish_history: 'changed_by',
  redemptions: 'user_id',
  uploads: 'user_id',
  usage_daily: 'user_id',
  big_goals: 'owner_id',
  user_profiles: 'user_id',
  profile_versions: 'user_id',
  plan_versions: 'owner_id',
  diaries: 'user_id',
  zoowy_sessions: 'user_id',
  zoowy_messages: 'user_id',
  ai_calls: 'user_id',
  user_settings: 'user_id',
  goal_milestones: null,
};

(async () => {
  const db = await openDb(DB_URL);

  // 1) 登录名：老账号自动用现有昵称补，之后唯一且非空
  await db.exec("UPDATE users SET login_name = nickname WHERE login_name IS NULL OR login_name = ''");
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_login_name ON users(login_name)');
  await db.exec('ALTER TABLE users ALTER COLUMN login_name SET NOT NULL');
  // 昵称改为「组内不重名」：删掉建表时的全局 UNIQUE 约束（组内校验放应用层）
  const uniq = await db.all(
    "SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%nickname%'"
  );
  for (const c of uniq) await db.exec(`ALTER TABLE users DROP CONSTRAINT "${c.conname}"`);
  console.log('[1/4] login_name 回填完成，nickname 全局唯一约束已移除 ' + uniq.length + ' 个');

  // 2) 建组（幂等）：优先按旧 partner_id 配对，缺该列时按 id 顺序两两配对
  const cnt = await db.get('SELECT COUNT(*) AS c FROM pair_members');
  if (Number(cnt.c) === 0) {
    const hasCol = await db.get(
      "SELECT 1 AS x FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'partner_id'"
    );
    const users = await db.all(
      hasCol ? 'SELECT id, nickname, partner_id FROM users ORDER BY id' : 'SELECT id, nickname FROM users ORDER BY id'
    );
    const pairs = [];
    if (hasCol) {
      const used = new Set();
      for (const u of users) {
        if (used.has(u.id) || !u.partner_id) continue;
        const other = users.find((x) => x.id === Number(u.partner_id));
        if (!other || used.has(other.id)) continue;
        pairs.push([u.id, other.id]);
        used.add(u.id);
        used.add(other.id);
      }
    } else {
      for (let i = 0; i + 1 < users.length; i += 2) pairs.push([users[i].id, users[i + 1].id]);
    }
    for (const [a, b] of pairs) {
      const info = await db.run("INSERT INTO pairs (status, created_at) VALUES ('active', ?) RETURNING id", [nowIso()]);
      const pid = Number(info.id);
      await db.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)', [pid, a, nowIso()]);
      await db.run('INSERT INTO pair_members (pair_id, user_id, joined_at) VALUES (?, ?, ?)', [pid, b, nowIso()]);
      console.log(`  建组 ${pid}: ${a} <-> ${b}`);
    }
    console.log(`[2/4] 建组 ${pairs.length} 个`);
  } else {
    console.log('[2/4] 已有组成员，跳过建组');
  }

  // 3) 回填 pair_id：动态发现所有带该列的业务表
  const tables = await db.all(
    "SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'pair_id' AND table_name NOT IN ('pair_members', 'pair_invites') ORDER BY table_name"
  );
  for (const { t } of tables) {
    if (t === 'goal_milestones') continue; // 依赖 goals.pair_id，放到第二轮
    const col = USER_COL[t];
    if (!col) { console.log(`  跳过 ${t}（无用户列映射）`); continue; }
    await db.exec(`UPDATE ${t} x SET pair_id = pm.pair_id FROM pair_members pm WHERE x.${col} = pm.user_id AND x.pair_id IS NULL`);
    const r = await db.get(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE pair_id IS NOT NULL) AS filled FROM ${t}`);
    console.log(`  ${t}: ${r.filled}/${r.total}`);
  }
  // 间接表必须在 goals 之后回填（字母序里 goal_milestones 排在 goals 前面）
  if (tables.some((x) => x.t === 'goal_milestones')) {
    await db.exec('UPDATE goal_milestones gm SET pair_id = g.pair_id FROM goals g WHERE gm.goal_id = g.id AND gm.pair_id IS NULL');
    const r = await db.get('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE pair_id IS NOT NULL) AS filled FROM goal_milestones');
    console.log(`  goal_milestones: ${r.filled}/${r.total}`);
  }
  // 回填完毕顺手对齐 SERIAL 序列：restore.js 曾用显式 id 整表插入，序列可能落后，
  // 否则改造后第一次新建目标/兑换/注册就会撞主键
  const SERIAL_TABLES = [
    'users', 'goals', 'check_ins', 'point_ledger', 'verifications', 'wish_items',
    'wish_history', 'redemptions', 'uploads', 'big_goals', 'user_profiles',
    'profile_versions', 'plan_versions', 'diaries', 'zoowy_sessions',
    'zoowy_messages', 'ai_calls', 'pairs', 'pair_events',
  ];
  for (const t of SERIAL_TABLES) {
    await db.exec(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`);
  }
  console.log('  SERIAL 序列已对齐 ' + SERIAL_TABLES.length + ' 张表');
  console.log('[3/4] pair_id 回填完成');

  // 4) 验证
  const us = await db.all(
    'SELECT u.id, u.nickname, u.login_name, pm.pair_id FROM users u LEFT JOIN pair_members pm ON pm.user_id = u.id ORDER BY u.id'
  );
  console.log('[4/4] 账号：' + us.map((u) => `${u.id}:${u.login_name}/${u.nickname}->组${u.pair_id || '无'}`).join(', '));
  const g = await db.get('SELECT COUNT(*) AS c FROM goals');
  const ci = await db.get('SELECT COUNT(*) AS c FROM check_ins');
  const pl = await db.get('SELECT COUNT(*) AS c FROM point_ledger');
  console.log(`  业务数据 goals=${g.c} check_ins=${ci.c} ledger=${pl.c}`);
  process.exit(0);
})().catch((e) => { console.error('迁移失败: ' + e.message); process.exit(1); });
