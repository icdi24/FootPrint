// 全量导出 / 导入：JSON（恢复用）+ 各表 CSV，打包成一个 zip。
const AdmZip = require('adm-zip');

const TABLES = [
  'users',
  'pairs',
  'pair_members',
  'pair_events',
  'goals',
  'check_ins',
  'point_ledger',
  'goal_milestones',
  'verifications',
  'wish_items',
  'wish_history',
  'redemptions',
  'uploads',
  'settings',
  'usage_daily',
  // ===== AI 工作流 / 多人化新增表（按依赖顺序：父表在前，保证恢复时 INSERT 与 DELETE 的 FK 顺序正确）=====
  'big_goals',
  'user_profiles',
  'profile_versions',
  'plan_versions',
  'diaries',
  'zoowy_sessions',
  'zoowy_messages',
  'ai_calls',
  'user_settings',
  'pair_invites',
];

// 不是每张表都有 id 列（goal_milestones 是联合主键，settings/pair_invites 主键是 key/code），
// 统一 ORDER BY id 会让整个备份直接崩掉（日志里的 backup_fail: column "id" does not exist）
const ORDER_BY = {
  goal_milestones: 'goal_id, threshold',
  settings: 'key',
  usage_daily: 'user_id, usage_date, package_name',
  user_settings: 'user_id',
  pair_invites: 'code',
  pair_members: 'pair_id, user_id', // 联合主键，无 id 列
};

async function dumpAll(db) {
  const tables = {};
  for (const t of TABLES) {
    const order = ORDER_BY[t] || 'id';
    tables[t] = await db.all(`SELECT * FROM ${t} ORDER BY ${order}`);
  }
  return tables;
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  const lines = [head.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push(head.map((h) => csvEscape(r[h])).join(','));
  }
  return lines.join('\r\n');
}

async function buildExportZip(db) {
  const tables = await dumpAll(db);
  const json = JSON.stringify(
    { app: 'footprint', version: 1, exportedAt: new Date().toISOString(), tables },
    null,
    2
  );
  const zip = new AdmZip();
  zip.addFile('data.json', Buffer.from(json, 'utf8'));
  for (const t of TABLES) {
    zip.addFile(`${t}.csv`, Buffer.from(toCsv(tables[t] || []), 'utf8'));
  }
  return zip;
}

// 从导出 JSON 恢复：先备份当前库，再整表替换（事务内完成）。
async function restoreFromJson(db, jsonText, dataDir) {
  const data = JSON.parse(jsonText);
  if (!data || data.app !== 'footprint' || !data.tables || typeof data.tables !== 'object') {
    throw new Error('不是脚印的导出文件（缺少 app/tables 标记）');
  }
  const { backupNow } = require('./backup');
  await backupNow(db, dataDir);
  const { tx } = require('./db');
  await tx(db, async (c) => {
    // 先清空 sessions / login_attempts：它们不在导出清单（登录态/限流状态不随恢复迁移），
    // 但 sessions 有 FK 指向 users，必须先删掉，否则下面的 DELETE FROM users 会撞外键。
    await c.exec('DELETE FROM sessions');
    await c.exec('DELETE FROM login_attempts');
    // 再按依赖逆序清空所有导出的业务表
    for (const t of [...TABLES].reverse()) {
      await c.exec(`DELETE FROM ${t}`);
    }
    for (const t of TABLES) {
      const rows = data.tables[t];
      if (!Array.isArray(rows) || !rows.length) continue;
      const cols = Object.keys(rows[0]);
      const sql = `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
      for (const r of rows) {
        await c.run(sql, cols.map((k) => r[k]));
      }
    }
    // 显式 id 插入不会推进 SERIAL 序列，恢复后首次新建目标/兑换/注册会撞主键，这里逐表对齐。
    // 只处理带 id 列的表：pg_get_serial_sequence 对无 id 列的表（pair_members/settings 等）会直接报错，
    // 故先经 information_schema 确认存在 id 列。
    for (const t of TABLES) {
      const hasId = await c.get(
        `SELECT 1 AS h FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = 'id'`,
        [t]
      );
      if (!hasId) continue;
      const seq = await c.get(`SELECT pg_get_serial_sequence(?, 'id') AS s`, [t]);
      if (!seq || !seq.s) continue;
      const max = await c.get(`SELECT MAX(id) AS m FROM ${t}`);
      if (max && max.m != null) {
        await c.exec(`SELECT setval('${seq.s}', ${max.m})`);
      } else {
        await c.exec(`SELECT setval('${seq.s}', 1, false)`);
      }
    }
  });
  return true;
}

module.exports = { dumpAll, buildExportZip, restoreFromJson, TABLES };
