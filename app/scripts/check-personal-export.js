// Regression checks for personal export boundaries. All records below are synthetic.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { buildPersonalExportZip, personalDownload, PERSONAL_TABLES } = require('../src/personal-export');
const { restoreFromJson, toCsv } = require('../src/export');
const opsRoutes = require('../src/routes/ops');

async function main() {
  const queries = [];
  const db = { all: async (sql, params) => {
    queries.push({ sql, params });
    assert(!/SELECT\s+\*/i.test(sql));
    assert.equal(params[0], 101);
    assert(/WHERE/.test(sql));
    const table = /FROM\s+(\w+)/.exec(sql)[1];
    const maliciousExtras = { password_hash: 'SECRET_HASH', token: 'SECRET_TOKEN', internal: 'SECRET_INTERNAL' };
    if (table === 'users') return [{ id: 101, nickname: 'own-user', ...maliciousExtras }];
    if (table === 'goals') return [{ id: 11, title: '=SUM(1,2)', ...maliciousExtras }];
    if (table === 'profile_versions') return [{ id: 12, snapshot: JSON.stringify([
      { block: 'basic', content: 'own-profile', ...maliciousExtras },
    ]), ...maliciousExtras }];
    if (table === 'plan_versions') return [{ id: 13, snapshot: JSON.stringify({
      big_goal: { id: 1, title: 'own-plan', ...maliciousExtras },
      chain: [{ id: 11, title: 'own-goal' }, { id: 202, title: 'OTHER_USER_PRIVATE' }],
      ...maliciousExtras,
    }) }];
    if (table === 'zoowy_turns') return [{ request_id: 'synthetic-id', state: 'done',
      input: 'SECRET_INTERNAL', result: 'SECRET_INTERNAL', report: {
        state: 'done', tools: [{ name: 'read_my_profile', args: 'SECRET_INTERNAL' }],
        ...maliciousExtras,
      } }];
    if (table === 'ai_calls') return [{ id: 3, total_tokens: 100, detail: 'SECRET_INTERNAL' }];
    if (table === 'zoowy_messages') return [{ id: 4, content: 'own-message', role: 'assistant', meta: JSON.stringify({
      cards: [{ type: 'plan_draft', draft: { goal: 'own-goal', steps: [{ title: 'own-step', ...maliciousExtras }], ...maliciousExtras } }],
      ...maliciousExtras,
    }) }];
    return [];
  } };
  const zip = await buildPersonalExportZip(db, 101);
  const text = zip.readAsText('data.json');
  const data = JSON.parse(text);
  assert.equal(data.scope, 'personal');
  assert.equal(data.attachments.included, false);
  assert.equal(data.tables.goals[0].title, '=SUM(1,2)');
  assert(zip.readAsText('goals.csv').includes("'=SUM(1,2)"));
  assert(!/SECRET_|OTHER_USER_PRIVATE/.test(text));
  for (const forbidden of ['pair_messages', 'pair_invites', 'sessions', 'login_attempts', 'zoowy_offers', 'zoowy_compactions']) {
    assert(!Object.hasOwn(data.tables, forbidden));
  }
  assert.equal(queries.length, PERSONAL_TABLES.length);
  const child = queries.find(q => /FROM goal_milestones/.test(q.sql));
  assert(/JOIN goals/.test(child.sql) && /g.owner_id=\?/.test(child.sql));
  const messages = queries.find(q => /FROM zoowy_messages/.test(q.sql));
  assert.deepEqual(messages.params.slice(0, 2), [101, 101]);
  await assert.rejects(() => buildPersonalExportZip(db, 101, { maxBytes: 32 }), e => e.status === 413);

  let touchedDatabase = false;
  await assert.rejects(() => restoreFromJson({ all() { touchedDatabase = true; } }, text, 'unused'), /不能用于全库恢复/);
  assert.equal(touchedDatabase, false);
  assert.equal(toCsv([{ value: -10 }]), 'value\r\n-10');
  assert(toCsv([{ value: '\t=1+1' }]).includes("'\t=1+1"));

  const router = opsRoutes({}, 'unused');
  for (const [path, method] of [['/backups', 'get'], ['/backups', 'post'], ['/backups/:name', 'get'], ['/admin/export', 'get']]) {
    const route = router.stack.find(l => l.route?.path === path && l.route.methods[method]).route;
    let status;
    const res = { status(n) { status = n; return this; }, json() {} };
    let allowed = false;
    route.stack[1].handle({ user: { id: 101, is_admin: 0 } }, res, () => { allowed = true; });
    assert.equal(status, 403);
    assert.equal(allowed, false);
  }
  let releases = 0;
  let unlocks = 0;
  const snapshotQueries = [];
  const client = {
    async query(sql) {
      snapshotQueries.push(sql);
      if (/pg_try_advisory_lock/.test(sql)) return { rows: [{ acquired: true }] };
      if (/pg_advisory_unlock/.test(sql)) unlocks++;
      return { rows: [] };
    },
    release() { releases++; },
  };
  const response = new EventEmitter();
  response.setHeader = () => {};
  response.send = buffer => assert(Buffer.isBuffer(buffer));
  response.destroy = () => response.emit('close');
  await personalDownload({ pool: { connect: async () => client } }, 101, response);
  assert.equal(releases, 0, 'the session lock must cover the HTTP download, not only zip creation');
  assert(snapshotQueries.some(sql => /REPEATABLE READ READ ONLY/.test(sql)));
  response.emit('finish');
  response.emit('close');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(unlocks, 1);
  assert.equal(releases, 1);
  console.log('personal-export security checks passed: projection, ownership SQL, CSV, size, restore rejection, admin gates');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
