// 一次性修复：栗子(1)/阿白(2) 的流水按 created_at 重排重建，恢复 id 顺序==时间顺序。
// 仅限这两个演示账号；他们的流水全部由种子脚本产生，重排安全。
const { openDb } = require('../src/db');

(async () => {
  const db = await openDb(process.env.DATABASE_URL);
  const colRows = await db.all(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'point_ledger' ORDER BY ordinal_position`
  );
  const cols = colRows.map((r) => r.column_name).filter((c) => c !== 'id');
  const rows = await db.all(`SELECT * FROM point_ledger WHERE user_id IN (1, 2) ORDER BY created_at, id`);
  console.log(`共 ${rows.length} 条，列：${cols.join(',')}`);
  await db.run(`DELETE FROM point_ledger WHERE user_id IN (1, 2)`);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const ph = cols.map(() => '?').join(', ');
  const bal = { 1: 0, 2: 0 };
  for (const r of rows) {
    const uid = Number(r.user_id);
    bal[uid] += Number(r.delta);
    const vals = cols.map((c) => (c === 'balance_after' ? bal[uid] : r[c]));
    await db.run(
      `INSERT INTO point_ledger (${colList}) VALUES (${ph})`,
      vals
    );
  }
  // 验证：id 顺序应与 created_at 顺序一致
  const check = await db.all(`SELECT id, user_id, delta, balance_after, created_at FROM point_ledger WHERE user_id IN (1,2) ORDER BY id`);
  let ok = true;
  let prev = { 1: null, 2: null };
  const finalBal = { 1: 0, 2: 0 };
  for (const r of check) {
    const uid = Number(r.user_id);
    if (prev[uid] && r.created_at < prev[uid]) { ok = false; console.log(`乱序：id=${r.id} uid=${uid} ${r.created_at}`); }
    prev[uid] = r.created_at;
    finalBal[uid] += Number(r.delta);
    if (Number(r.balance_after) !== finalBal[uid]) { ok = false; console.log(`余额错：id=${r.id} 快照=${r.balance_after} 实际=${finalBal[uid]}`); }
  }
  console.log(`顺序校验：${ok ? 'OK' : 'FAIL'}；最终余额 1=${finalBal[1]} 2=${finalBal[2]}`);
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
