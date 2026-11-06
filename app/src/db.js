// 数据库：PostgreSQL（pg 连接池）。从 SQLite 迁移而来，统一异步 API。
const { Pool } = require('pg');

// 把 SQLite 的 `?` 占位符转成 PG 的 `$1 $2 ...`。
// 本项目 SQL 中没有字符串字面量里的 `?`，可安全替换。
function q(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🐾',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'daily',
  title TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🎯',
  description TEXT NOT NULL DEFAULT '',
  freq_mode TEXT NOT NULL DEFAULT 'daily',
  freq_n INTEGER NOT NULL DEFAULT 1,
  weekdays TEXT NOT NULL DEFAULT '',
  window_start TEXT,
  window_end TEXT,
  duration_min INTEGER NOT NULL DEFAULT 30,
  difficulty INTEGER NOT NULL DEFAULT 3,
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  streak_count INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  est_total_min INTEGER,
  accept_criteria TEXT,
  total_points INTEGER,
  custom_points INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS check_ins (
  id SERIAL PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  check_date TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  in_window INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL,
  is_makeup INTEGER NOT NULL DEFAULT 0,
  evidence_text TEXT NOT NULL DEFAULT '',
  evidence_id INTEGER,
  status TEXT NOT NULL DEFAULT 'credited',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkin_credited ON check_ins(goal_id, check_date) WHERE status = 'credited';
CREATE TABLE IF NOT EXISTS point_ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL,
  ref_type TEXT NOT NULL DEFAULT '',
  ref_id INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goal_milestones (
  goal_id INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  awarded_at TEXT NOT NULL,
  PRIMARY KEY (goal_id, threshold)
);
CREATE TABLE IF NOT EXISTS verifications (
  id SERIAL PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id),
  submitter_id INTEGER NOT NULL,
  reviewer_id INTEGER NOT NULL,
  submit_count INTEGER NOT NULL DEFAULT 1,
  evidence_text TEXT NOT NULL DEFAULT '',
  evidence_ids TEXT NOT NULL DEFAULT '',
  self_statement TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS wish_items (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL DEFAULT 'goods',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '🎁',
  price_cny REAL NOT NULL,
  points_cost INTEGER NOT NULL,
  image_id INTEGER,
  cooldown_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wish_history (
  id SERIAL PRIMARY KEY,
  wish_id INTEGER NOT NULL,
  changed_by INTEGER NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS redemptions (
  id SERIAL PRIMARY KEY,
  wish_item_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  points_locked INTEGER NOT NULL,
  points_charged INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'applied',
  note TEXT NOT NULL DEFAULT '',
  applied_at TEXT NOT NULL,
  confirmed_at TEXT,
  fulfilled_at TEXT
);
CREATE TABLE IF NOT EXISTS uploads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'evidence',
  ext TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id INTEGER NOT NULL REFERENCES users(id),
  usage_date TEXT NOT NULL,
  package_name TEXT NOT NULL,
  app_name TEXT NOT NULL DEFAULT '',
  seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, usage_date, package_name)
);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_daily(usage_date);

-- ===== AI 工作流与双端改造（待办计划 P0）=====

-- 大目标：长期方向，不能手动打卡，进度由 AI 写入，另留 done/total 客观计数
CREATE TABLE IF NOT EXISTS big_goals (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🏔️',
  description TEXT NOT NULL DEFAULT '',
  progress INTEGER NOT NULL DEFAULT 0,
  progress_note TEXT NOT NULL DEFAULT '',
  progress_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 个人画像：每用户一份、分块存（basic/resume/skills/goal_progress/important…）
-- status: active 正常 / void AI 标失效（删除只标失效，不物理删）
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  block TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'ai',
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, block)
);

-- 画像快照：每次 apply 前存全量，可看历史、可回滚
CREATE TABLE IF NOT EXISTS profile_versions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  snapshot TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'ai',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- 计划链快照：手改与 AI 重排共用同一套链路，每次写库后存快照
CREATE TABLE IF NOT EXISTS plan_versions (
  id SERIAL PRIMARY KEY,
  big_goal_id INTEGER NOT NULL REFERENCES big_goals(id),
  owner_id INTEGER NOT NULL REFERENCES users(id),
  snapshot TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- AI 日报：每晚 23:30 一人一份；ai_original 原文 + user_edited 改后版（空=未改）
CREATE TABLE IF NOT EXISTS diaries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  diary_date TEXT NOT NULL,
  ai_original TEXT NOT NULL DEFAULT '',
  user_edited TEXT NOT NULL DEFAULT '',
  shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, diary_date)
);

-- zoowy 会话（按 user_id 隔离；两处入口进同一会话）
CREATE TABLE IF NOT EXISTS zoowy_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL DEFAULT 'zoowy',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- zoowy 消息（meta 存 JSON：工具调用记录、入口上下文标记等）
CREATE TABLE IF NOT EXISTS zoowy_messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES zoowy_sessions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_zoowy_msg_session ON zoowy_messages(session_id);

-- AI 调用记账：成功 / 跳过 / 失败都记（skip = AI 判断不用改、整轮没调模型）
CREATE TABLE IF NOT EXISTS ai_calls (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  workflow TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_calls_user ON ai_calls(user_id);

-- 按用户的 AI 设置（现有全局 settings 表只存积分系数，不动）
-- skip_confirm 默认关；report_changes 默认开
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  skip_confirm INTEGER NOT NULL DEFAULT 0,
  report_changes INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
`;

// 打开连接池并建表（异步）。
async function openDb(connString) {
  const pool = new Pool({ connectionString: connString, max: 10 });
  // 建表
  await pool.query(SCHEMA);
  // 迁移：老库补 custom_points 字段（幂等）
  await pool.query('ALTER TABLE goals ADD COLUMN IF NOT EXISTS custom_points INTEGER');
  // 迁移：计划链字段（P0-2，与现有 status 状态机解耦；老目标四列全空 = 不在计划链）
  // 注意：不加 FK —— goals 建表早于 big_goals，纯列也符合本项目 point_ledger 的轻约束风格
  await pool.query('ALTER TABLE goals ADD COLUMN IF NOT EXISTS big_goal_id INTEGER');
  await pool.query('ALTER TABLE goals ADD COLUMN IF NOT EXISTS planned_date TEXT');
  await pool.query('ALTER TABLE goals ADD COLUMN IF NOT EXISTS plan_order INTEGER');
  await pool.query("ALTER TABLE goals ADD COLUMN IF NOT EXISTS plan_status TEXT");
  // 迁移：画像块分享标记（P3：默认仅自己，主动分享后对方可见）
  await pool.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS shared INTEGER NOT NULL DEFAULT 0');
  return makeDb(pool);
}

// 统一异步 API，对齐原有 prepare().get()/.all()/.run() 语义。
function makeDb(pool) {
  async function query(sql, params) {
    const r = await pool.query(q(sql), params || []);
    return r;
  }
  return {
    pool,
    // 单行或 undefined
    async get(sql, params) {
      const r = await query(sql, params);
      return r.rows[0];
    },
    // 多行
    async all(sql, params) {
      const r = await query(sql, params);
      return r.rows;
    },
    // 写入；返回 { changes, id }
    async run(sql, params) {
      const r = await query(sql, params);
      return { changes: r.rowCount, id: r.rows && r.rows[0] ? r.rows[0].id : undefined };
    },
    async exec(sql) {
      await pool.query(sql);
    },
    query,
  };
}

// 只增不改不删：流水写入（含 balance_after 快照）。
async function ledgerAdd(db, { userId, delta, type, refType = '', refId = 0, note = '' }) {
  const row = await db.get('SELECT COALESCE(SUM(delta), 0) AS bal FROM point_ledger WHERE user_id = ?', [userId]);
  const balanceAfter = Number(row.bal) + delta;
  const info = await db.run(
    `INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [userId, delta, balanceAfter, type, refType, refId, note, new Date().toISOString()]
  );
  return { id: Number(info.id), balanceAfter };
}

async function balanceOf(db, userId) {
  const row = await db.get('SELECT COALESCE(SUM(delta), 0) AS bal FROM point_ledger WHERE user_id = ?', [userId]);
  return Number(row.bal);
}

// 事务：fn 拿到一个专用 client，其上有与 db 相同的 get/all/run/exec/query 方法。
async function tx(db, fn) {
  const client = await db.pool.connect();
  const c = makeDb(client);
  try {
    await client.query('BEGIN');
    const r = await fn(c);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { openDb, makeDb, ledgerAdd, balanceOf, tx, q };
