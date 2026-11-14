// Real PostgreSQL regression. The explicit URL must point to the isolated security_exports DB.
const assert = require('node:assert/strict');
const { Pool, Client } = require('pg');
const { fork } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb, makeDb, tx } = require('../src/db');
const { ensureSession, appendMessage } = require('../src/agent/session');
const { clearHistory } = require('../src/agent/history-privacy');
const { buildPersonalExportZip, personalDownload } = require('../src/personal-export');
const { buildExportZip, restoreFromJson } = require('../src/export');

const connectionString = process.env.SECURITY_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set SECURITY_TEST_DATABASE_URL explicitly; no default database is used');
const target = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '55439' || target.pathname !== '/security_exports') {
  throw new Error('This destructive regression is restricted to localhost:55439/security_exports');
}

async function holdDownload() {
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 3000 });
  const response = new EventEmitter();
  response.setHeader = () => {};
  response.send = () => process.send({ event: 'ready' });
  response.destroy = () => { response.destroyed = true; response.emit('close'); };
  process.once('message', () => response.emit('finish'));
  try {
    await personalDownload(makeDb(pool), Number(process.argv[3]), response);
    await new Promise(resolve => { response.once('finish', resolve); response.once('close', resolve); });
    await new Promise(resolve => setImmediate(resolve));
  } catch (error) {
    process.send({ event: 'error', code: error.code, message: error.message });
  } finally {
    await pool.end();
    process.disconnect();
  }
}

function downloadProcess(userId) {
  const child = fork(__filename, ['--download', String(userId)], {
    env: process.env, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code ? reject(new Error(`Download process exited ${code}`)) : resolve());
  });
  const first = new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Download process exited before reporting its result')));
  });
  return { child, first, exited };
}

async function main() {
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 3000 });
  await admin.connect();
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname='security_exports'");
    if (!existing.rowCount) await admin.query('CREATE DATABASE security_exports');
  } finally { await admin.end(); }
  const reset = new Client({ connectionString });
  await reset.connect();
  try { await reset.query('DROP SCHEMA public CASCADE'); await reset.query('CREATE SCHEMA public'); }
  finally { await reset.end(); }
  const db = await openDb(connectionString);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footprint-export-security-'));
  let assertions = 0;
  const check = (condition, message) => { assert(condition, message); assertions++; };
  const insert = async (table, row) => {
    const fields = Object.keys(row);
    return db.get(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')}) RETURNING *`, Object.values(row));
  };
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  try {
    const alice = await insert('users', { nickname: 'alice-export', login_name: 'alice-export', password_hash: 'HASH_MUST_NOT_EXPORT_A', created_at: now });
    const bob = await insert('users', { nickname: 'bob-export', login_name: 'bob-export', password_hash: 'HASH_MUST_NOT_EXPORT_B', created_at: now });
    const seed = async (user, marker) => {
      const big = await insert('big_goals', { owner_id: user.id, title: marker + '-big', created_at: now, updated_at: now });
      const goal = await insert('goals', { owner_id: user.id, title: marker + '-goal', type: 'stage', big_goal_id: big.id, start_date: day, created_at: now, updated_at: now });
      await insert('check_ins', { goal_id: goal.id, user_id: user.id, check_date: day, duration_min: 10, points: 10, created_at: now });
      await insert('point_ledger', { user_id: user.id, delta: 10, balance_after: 10, type: 'test', note: marker, created_at: now });
      await insert('goal_milestones', { goal_id: goal.id, threshold: 1, awarded_at: now });
      await insert('verifications', { goal_id: goal.id, submitter_id: user.id, reviewer_id: user.id === alice.id ? bob.id : alice.id, self_statement: marker, created_at: now });
      const wish = await insert('wish_items', { owner_id: user.id, title: marker + '-wish', price_cny: 10, points_cost: 100, created_at: now, updated_at: now });
      await insert('wish_history', { wish_id: wish.id, changed_by: user.id, detail: marker, created_at: now });
      await insert('redemptions', { wish_item_id: wish.id, user_id: user.id, points_locked: 100, note: marker, applied_at: now });
      await insert('uploads', { user_id: user.id, ext: 'png', created_at: now });
      await insert('usage_daily', { user_id: user.id, usage_date: day, package_name: 'test.app', app_name: marker, seconds: 60, updated_at: now });
      await insert('user_profiles', { user_id: user.id, block: 'basic', content: marker + '-profile', updated_at: now });
      const version = await insert('profile_versions', { user_id: user.id, snapshot: JSON.stringify([{ block: 'basic', content: marker + '-old', debug: 'INTERNAL_MUST_NOT_EXPORT' }]), reason: marker, created_at: now });
      await insert('profile_changes', { user_id: user.id, workflow: 'test', summary: marker, detail: JSON.stringify([{ op: 'update', block: 'basic', before: marker + '-old', after: marker + '-profile', debug: 'INTERNAL_MUST_NOT_EXPORT' }]), version_id: version.id, created_at: now });
      await insert('diaries', { user_id: user.id, diary_date: day, ai_original: marker + '-diary', created_at: now, updated_at: now });
      const session = await ensureSession(db, user.id);
      await appendMessage(db, user.id, session.id, 'user', marker + '-chat');
      await appendMessage(db, user.id, session.id, 'assistant', marker + '-reply', { internal: 'INTERNAL_MUST_NOT_EXPORT' });
      await insert('zoowy_compactions', { session_id: session.id, user_id: user.id, through_message_id: 0, summary: marker + '-internal-summary' });
      await insert('zoowy_offers', { user_id: user.id, session_id: session.id, payload: { message: marker + '-chat', internal: 'INTERNAL_MUST_NOT_EXPORT' } });
      await insert('planning_drafts', { owner_id: user.id, big_goal_id: big.id, goal: marker, kind: 'stage', status: 'ready', proposal: { steps: [{ id: 'step-1', title: marker, doneWhen: 'done', debug: 'INTERNAL_MUST_NOT_EXPORT' }], internal: 'INTERNAL_MUST_NOT_EXPORT' } });
      await insert('ai_calls', { user_id: user.id, workflow: 'chat', status: 'ok', model: 'test-model', total_tokens: 100, detail: 'INTERNAL_MUST_NOT_EXPORT', created_at: now });
      await insert('user_settings', { user_id: user.id, updated_at: now });
      await insert('zoowy_turns', { user_id: user.id, request_id: marker + '_done', input: { message: marker }, state: 'done', result: { raw: 'INTERNAL_MUST_NOT_EXPORT' }, report: { state: 'done', tools: [{ name: 'read_my_profile', authorization: 'user_request', internal: 'INTERNAL_MUST_NOT_EXPORT' }], internal: 'INTERNAL_MUST_NOT_EXPORT' }, finished_at: now });
      await insert('zoowy_turns', { user_id: user.id, request_id: marker + '_running', input: { message: marker }, state: 'running' });
      return { user, big, goal, session, version };
    };
    const a = await seed(alice, 'ALICE_PRIVATE');
    const b = await seed(bob, 'BOB_PRIVATE');
    await insert('plan_versions', { big_goal_id: a.big.id, owner_id: alice.id, snapshot: JSON.stringify({ big_goal: { id: a.big.id, title: 'ALICE_PRIVATE' }, chain: [{ id: a.goal.id, title: 'ALICE_PRIVATE' }, { id: b.goal.id, title: 'BOB_PRIVATE' }] }), created_at: now });

    const personal = await tx(db, c => buildPersonalExportZip(c, alice.id), { readOnly: true, timeoutMs: 30000 });
    const personalText = personal.readAsText('data.json');
    const payload = JSON.parse(personalText);
    check(personalText.includes('ALICE_PRIVATE'), 'owner content is present');
    check(!personalText.includes('BOB_PRIVATE'), 'other user content and nested foreign snapshots are absent');
    check(!/HASH_MUST_NOT_EXPORT|INTERNAL_MUST_NOT_EXPORT/.test(personalText), 'credentials and internal fields are absent');
    check(payload.scope === 'personal' && payload.tables.profile_versions.length === 1, 'personal version payload exists');
    check(payload.tables.zoowy_turns.length === 2 && !Object.hasOwn(payload.tables.zoowy_turns[0], 'input'), 'turn export uses safe DTO');
    check(payload.tables.goal_milestones.length === 1 && payload.tables.wish_history.length === 1, 'child ownership queries compile and isolate');
    check(payload.tables.verifications.length === 1 && !Object.hasOwn(payload.tables.verifications[0], 'reviewer_id'), 'verification excludes partner identity');
    const filesBefore = fs.readdirSync(dataDir);
    await assert.rejects(() => restoreFromJson(db, personalText, dataDir), /不能用于全库恢复/);
    check(JSON.stringify(fs.readdirSync(dataDir)) === JSON.stringify(filesBefore), 'personal restore rejection has no backup side effect');

    const first = downloadProcess(alice.id);
    check((await first.first).event === 'ready', 'first process acquires export slot');
    const conflicting = downloadProcess(alice.id);
    check((await conflicting.first).code === 'export_running', 'second process cannot export same owner while download is open');
    await conflicting.exited;
    const independent = downloadProcess(bob.id);
    check((await independent.first).event === 'ready', 'different user export remains available');
    independent.child.send('finish'); await independent.exited;
    first.child.send('finish'); await first.exited;
    const afterFinish = downloadProcess(alice.id);
    check((await afterFinish.first).event === 'ready', 'download finish releases the shared slot');
    afterFinish.child.send('finish'); await afterFinish.exited;

    const full = await buildExportZip(db);
    const oldSnapshot = full.readAsText('data.json');
    check(JSON.parse(oldSnapshot).tables.profile_changes.length === 2, 'full backup includes profile_changes');
    await clearHistory(db, alice.id, dataDir);
    check((await db.get('SELECT COUNT(*) AS n FROM zoowy_messages WHERE user_id=?', [alice.id])).n === '0', 'chat was cleared before restoring');
    await restoreFromJson(db, oldSnapshot, dataDir);
    check((await db.get('SELECT COUNT(*) AS n FROM zoowy_messages WHERE user_id=?', [alice.id])).n === '0', 'independent tombstone prevents chat resurrection');
    check((await db.get('SELECT COUNT(*) AS n FROM zoowy_messages WHERE user_id=?', [bob.id])).n === '2', 'restore preserves other user chat');
    check((await db.get('SELECT COUNT(*) AS n FROM profile_changes')).n === '2', 'profile_changes successfully restored with versions');
    check((await db.get('SELECT COUNT(*) AS n FROM goals WHERE owner_id=?', [alice.id])).n === '1', 'history clear and restore preserve confirmed business data');
    check((await db.get('SELECT state FROM zoowy_turns WHERE user_id=? AND request_id=?', [bob.id, 'BOB_PRIVATE_running'])).state === 'failed', 'backup never resumes old running work');
    const clearedTurn = await db.get('SELECT input,result,cleared FROM zoowy_turns WHERE user_id=? AND request_id=?', [alice.id, 'ALICE_PRIVATE_done']);
    check(clearedTurn.cleared && !clearedTurn.result && JSON.stringify(clearedTurn.input) === '{}', 'restored task caches cannot resurrect chat');
    check((await db.get('SELECT COUNT(*) AS n FROM zoowy_compactions WHERE user_id=?', [alice.id])).n === '0', 'restored summary is erased');
    check(!fs.readFileSync(path.join(dataDir, 'privacy-deletions.jsonl'), 'utf8').includes('ALICE_PRIVATE'), 'deletion journal contains no chat content');
    console.log(`personal-export PostgreSQL checks passed: ${assertions}, including separate-process download locks and old-backup deletion replay`);
  } finally {
    await db.pool.end();
    assert.equal(path.dirname(fs.realpathSync(dataDir)), fs.realpathSync(os.tmpdir()));
    assert(path.basename(dataDir).startsWith('footprint-export-security-'));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

(process.argv[2] === '--download' ? holdDownload() : main()).catch(error => { console.error(error); process.exitCode = 1; });
