// P5-#22 验收接口可复跑冒烟脚本：一条命令跑完，全绿。
// ⚠️ 必须对「测试库 + 测试服务」跑，绝不能打真实库！
// 用法：
//   1. 建测试库 footprint_test（不存在会自动建）
//   2. DATABASE_URL=...footprint_test PORT=3001 npm start
//   3. node scripts/verify-smoke.js http://localhost:3001
const { Pool } = require('pg');
const BASE = process.argv[2] || 'http://localhost:3001';
const TEST_DB = 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint_test';
const REAL_DB = 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 200) : ''}`); }
}

async function main() {
  // 双保险：拒绝对真实库跑（真实库里有栗子/阿白）
  const pool0 = new Pool({ connectionString: REAL_DB });
  const realUsers = await pool0.query("SELECT COUNT(*)::int AS c FROM users WHERE nickname IN ('栗子','阿白')");
  await pool0.end();
  if (Number(realUsers.rows[0].c) > 0) {
    // 真实库存在 → 确认目标确实是测试库（测试库里不该有真实昵称）
    const p = new Pool({ connectionString: TEST_DB });
    const t = await p.query("SELECT COUNT(*)::int AS c FROM users WHERE nickname IN ('栗子','阿白')");
    await p.end();
    if (Number(t.rows[0].c) > 0) {
      console.error('拒绝执行：目标库里发现真实用户（栗子/阿白）！');
      process.exit(1);
    }
    console.log('（真实库存在，但目标是独立测试库，继续）');
  }

  // 服务就绪
  const h = await fetch(`${BASE}/healthz`).then((r) => r.json()).catch(() => null);
  if (!h || !h.ok) { console.error(`服务没起来：${BASE}`); process.exit(1); }

  // 造号（先清掉此前所有测试残留账号：partnerOf 取「id 最小的别人」，库里必须只有本次的号）
  const { openDb } = require('../src/db');
  const { hashPassword } = require('../src/auth');
  const db = await openDb(TEST_DB);
  const stale = await db.all("SELECT id FROM users WHERE nickname LIKE '\\_\\_%' ESCAPE '\\'");
  for (const u of stale) {
    await db.run('DELETE FROM point_ledger WHERE user_id = ?', [u.id]);
    await db.run('DELETE FROM goal_milestones WHERE goal_id IN (SELECT id FROM goals WHERE owner_id = ?)', [u.id]);
    await db.run('DELETE FROM verifications WHERE submitter_id = ? OR reviewer_id = ?', [u.id, u.id]);
    await db.run('DELETE FROM check_ins WHERE user_id = ?', [u.id]);
    await db.run('DELETE FROM plan_versions WHERE owner_id = ?', [u.id]);
    await db.run('DELETE FROM big_goals WHERE owner_id = ?', [u.id]);
    await db.run('DELETE FROM goals WHERE owner_id = ?', [u.id]);
    await db.run('DELETE FROM diaries WHERE user_id = ?', [u.id]);
    await db.run('DELETE FROM user_profiles WHERE user_id = ?', [u.id]);
    await db.run('DELETE FROM profile_versions WHERE user_id = ?', [u.id]);
    await db.run('DELETE FROM zoowy_messages WHERE user_id = ?', [u.id]);
    await db.run('DELETE FROM zoowy_sessions WHERE user_id = ?', [u.id]);
    await db.run('DELETE FROM ai_calls WHERE user_id = ?', [u.id]);
    await db.run('DELETE FROM user_settings WHERE user_id = ?', [u.id]);
    await db.run('DELETE FROM sessions WHERE user_id = ?', [u.id]);
  }
  if (stale.length) await db.run('DELETE FROM users WHERE id IN (' + stale.map(() => '?').join(',') + ')', stale.map((u) => u.id));
  for (const n of ['__smk_a__', '__smk_b__', '__smk_c__']) {
    await db.run(
      "INSERT INTO users (nickname, password_hash, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users WHERE nickname = ?)",
      [n, hashPassword('smoke123'), new Date().toISOString(), n]
    );
  }
  await db.pool.end();

  async function login(n) {
    const r = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: n, password: 'smoke123' }) });
    return { 'Content-Type': 'application/json', Cookie: r.headers.get('set-cookie').split(';')[0] };
  }
  const A = await login('__smk_a__'); // 提交人
  const B = await login('__smk_b__'); // 验收人
  const C = await login('__smk_c__'); // 无关人
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const past = new Date(Date.now() + 8 * 3600 * 1000 - 100 * 86400000).toISOString().slice(0, 10);

  async function mkStage(headers, { endDate, title }) {
    const g = await (await fetch(`${BASE}/api/goals`, { method: 'POST', headers, body: JSON.stringify({ type: 'stage', title, accept_criteria: '冒烟用标准', start_date: past, end_date: endDate, est_total_min: 600 }) })).json();
    return g.goal;
  }
  async function submit(headers, goalId) {
    return (await fetch(`${BASE}/api/goals/${goalId}/submit`, { method: 'POST', headers, body: JSON.stringify({ self_statement: '冒烟提交' }) })).status;
  }
  async function pendingId(headers) {
    const d = await (await fetch(`${BASE}/api/verifications/pending`, { headers })).json();
    return d.verifications[0] ? d.verifications[0].id : null;
  }

  // 1. 正常通过
  let g = await mkStage(A, { endDate: null, title: '冒烟-正常通过' });
  await submit(A, g.id);
  let v = await pendingId(B);
  let r = await fetch(`${BASE}/api/verifications/${v}/approve`, { method: 'POST', headers: B });
  let body = await r.json();
  check('正常通过 200', r.status === 200 && body.ok === true && body.points > 0, body);
  const goalAfter = await (await fetch(`${BASE}/api/goals/${g.id}`, { headers: A })).json();
  check('通过后目标 achieved', goalAfter.goal.status === 'achieved');
  // 重复处理 → 400
  r = await fetch(`${BASE}/api/verifications/${v}/approve`, { method: 'POST', headers: B });
  check('重复处理 400', r.status === 400);
  r = await fetch(`${BASE}/api/verifications/${v}/reject`, { method: 'POST', headers: B, body: JSON.stringify({ reason: 'x' }) });
  check('通过后再驳回 400', r.status === 400);

  // 2. 逾期通过 → 90%
  g = await mkStage(A, { endDate: past, title: '冒烟-逾期通过' });
  await submit(A, g.id);
  v = await pendingId(B);
  r = await fetch(`${BASE}/api/verifications/${v}/approve`, { method: 'POST', headers: B });
  body = await r.json();
  check('逾期通过 200 且 overdue=true', r.status === 200 && body.overdue === true, body);
  // 450 = round(600 分钟 × 0.5 分/分钟 × 1.5 难度系数)，逾期只发 90% → 405
  check('逾期只发 90%（450 → 405）', body.points === 405, body.points);

  // 3. 正常驳回 → 目标回 active
  g = await mkStage(A, { endDate: null, title: '冒烟-驳回' });
  await submit(A, g.id);
  v = await pendingId(B);
  r = await fetch(`${BASE}/api/verifications/${v}/reject`, { method: 'POST', headers: B, body: JSON.stringify({ reason: '证据不够，重交' }) });
  check('驳回 200', r.status === 200);
  const after2 = await (await fetch(`${BASE}/api/goals/${g.id}`, { headers: A })).json();
  check('驳回后目标回 active', after2.goal.status === 'active', after2.goal.status);

  // 4. 非 reviewer 403（C 想处理 A→B 的验收）
  g = await mkStage(A, { endDate: null, title: '冒烟-越权' });
  await submit(A, g.id);
  v = await pendingId(B);
  r = await fetch(`${BASE}/api/verifications/${v}/approve`, { method: 'POST', headers: C });
  check('非 reviewer 处理 403', r.status === 403);
  r = await fetch(`${BASE}/api/verifications/${v}/detail`, { headers: C });
  check('非相关人看详情 403', r.status === 403);
  // 5. 缺理由 400
  r = await fetch(`${BASE}/api/verifications/${v}/reject`, { method: 'POST', headers: B, body: JSON.stringify({ reason: '' }) });
  check('缺理由 400', r.status === 400);
  // 详情（reviewer 可看）
  r = await fetch(`${BASE}/api/verifications/${v}/detail`, { headers: B });
  body = await r.json();
  check('详情 200 且带历史/证据字段', r.status === 200 && Array.isArray(body.history) && body.goal && body.verification, body && body.goal);

  // 清理测试数据
  const d2 = await openDb(TEST_DB);
  const ids = await d2.all("SELECT id FROM users WHERE nickname LIKE '__smk_%'");
  for (const u of ids) {
    await d2.run('DELETE FROM point_ledger WHERE user_id = ?', [u.id]);
    await d2.run('DELETE FROM goal_milestones WHERE goal_id IN (SELECT id FROM goals WHERE owner_id = ?)', [u.id]);
    await d2.run('DELETE FROM verifications WHERE submitter_id = ? OR reviewer_id = ?', [u.id, u.id]);
    await d2.run('DELETE FROM check_ins WHERE user_id = ?', [u.id]);
    await d2.run('DELETE FROM plan_versions WHERE owner_id = ?', [u.id]);
    await d2.run('DELETE FROM big_goals WHERE owner_id = ?', [u.id]);
    await d2.run('DELETE FROM goals WHERE owner_id = ?', [u.id]);
    await d2.run('DELETE FROM sessions WHERE user_id = ?', [u.id]);
  }
  await d2.run("DELETE FROM users WHERE nickname LIKE '__smk_%'");
  await d2.pool.end();

  console.log(`\n冒烟结果：${pass} 通过，${fail} 失败${fail ? '（未全绿，别上线）' : ' ✅ 全绿'}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('冒烟挂了：', e.message); process.exit(1); });
