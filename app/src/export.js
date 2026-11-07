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
];

// 不是每张表都有 id 列（goal_milestones 是联合主键，settings 主键是 key），
// 统一 ORDER BY id 会让整个备份直接崩掉（日志里的 backup_fail: column "id" does not exist）
const ORDER_BY = {
  goal_milestones: 'goal_id, threshold',
  settings: 'key',
  usage_daily: 'user_id, usage_date, package_name',
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
    // 先清空（跳过 settings/sessions，保留会话与当前系数配置）
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
  });
  return true;
}

module.exports = { dumpAll, buildExportZip, restoreFromJson, TABLES };
