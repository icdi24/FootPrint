// 数据库：node:sqlite（Node 22 内置），单文件 SQLite。
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS check_ins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
CREATE TABLE IF NOT EXISTS wish_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wish_id INTEGER NOT NULL,
  changed_by INTEGER NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'evidence',
  ext TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'app.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

// 只增不改不删：流水写入（含 balance_after 快照）。
function ledgerAdd(db, { userId, delta, type, refType = '', refId = 0, note = '' }) {
  const row = db.prepare('SELECT COALESCE(SUM(delta), 0) AS bal FROM point_ledger WHERE user_id = ?').get(userId);
  const balanceAfter = Number(row.bal) + delta;
  const info = db
    .prepare(`INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, delta, balanceAfter, type, refType, refId, note, new Date().toISOString());
  return { id: Number(info.lastInsertRowid), balanceAfter };
}

function balanceOf(db, userId) {
  const row = db.prepare('SELECT COALESCE(SUM(delta), 0) AS bal FROM point_ledger WHERE user_id = ?').get(userId);
  return Number(row.bal);
}

function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { openDb, ledgerAdd, balanceOf, tx };
