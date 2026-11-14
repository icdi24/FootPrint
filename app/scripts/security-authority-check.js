// Runs only against an explicitly selected disposable PostgreSQL database.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { openDb, tx } = require('../src/db');
const ai = require('../src/ai');
const { executeTool, readProfileBaseline, applyProfilePatch } = require('../src/agent/tools');
const { runChat, acceptOffer, OPERATION_DESCRIPTORS } = require('../src/agent/workflows/chat');
const { generateChatProposal, startDraft, confirmDraft } = require('../src/agent/workflows/planning');

const url = process.env.SECURITY_TEST_DATABASE_URL;
if (!url) throw new Error('SECURITY_TEST_DATABASE_URL is required');
const parsedUrl = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) || !/^\/security_authority(?:_[a-z0-9_]+)?$/.test(parsedUrl.pathname)) {
  throw new Error('Use a local disposable security_authority database');
}

async function main() {
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  const dbName = parsedUrl.pathname.slice(1);
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
    if (!exists.rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally { await admin.end(); }
  const db = await openDb(url);
  const originalChat = ai.chat;
  let responses = [];
  ai.chat = async () => {
    assert(responses.length, 'unexpected model call');
    const response = responses.shift();
    return typeof response === 'function' ? response() : response;
  };
  const suffix = randomUUID().slice(0, 8);
  const stamp = new Date().toISOString();
  const makeUser = (name) => db.get('INSERT INTO users (nickname,login_name,password_hash,created_at) VALUES (?,?,?,?) RETURNING id',
    [`security_${name}_${suffix}`, `security_${name}_${suffix}`, 'synthetic-unused-hash', stamp]);
  const first = await makeUser('one');
  const second = await makeUser('two');
  const userId = Number(first.id);
  let checks = 0;
  const checked = (name) => { checks++; console.log(`ok ${checks} ${name}`); };
  const countBig = async (title) => Number((await db.get('SELECT COUNT(*) AS n FROM big_goals WHERE owner_id=? AND title=?', [userId, title])).n);
  const call = (name, args) => ({ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } });
  async function chatWithTool(name, args, beforeResponse) {
    responses = [async () => {
      if (beforeResponse) await beforeResponse();
      return { content: '', toolCalls: [call(name, args)] };
    }, { content: '请查看卡片。', toolCalls: [] }];
    return runChat({ db, userId, message: '先预览，等待我确认。', requestId: randomUUID() });
  }
  try {
    for (const op of Object.values(OPERATION_DESCRIPTORS)) assert.equal(typeof op.apply, 'function');
    const forbidden = await executeTool(db, 'chat', userId, 'create_big_goal', { title: 'forbidden' });
    assert.equal(forbidden.ok, false);
    const rejected = await chatWithTool('create_big_goal', { title: 'forbidden' });
    assert.equal(await countBig('forbidden'), 0);
    assert.equal(rejected.cards.length, 0);
    checked('model-supplied direct write rejected by actual loop and executor');

    const title = `待确认_${suffix}`;
    const offered = await chatWithTool('offer_create_big_goal', { title, description: '明确内容' });
    const card = offered.cards[0];
    assert.equal(card.type, 'goal_offer');
    assert.equal(card.revision, 1);
    assert.equal(card.preview.find((p) => p.label === '名称').after, title);
    assert.equal(await countBig(title), 0);
    checked('proposal has concrete preview and does not create a goal');
    await assert.rejects(acceptOffer(db, Number(second.id), card.id, randomUUID(), card.revision), (e) => e.status === 404);
    await assert.rejects(acceptOffer(db, userId, card.id, randomUUID(), 2), (e) => e.status === 409);
    checked('offer ownership and revision cannot be forged');

    const applied = await Promise.all([
      acceptOffer(db, userId, card.id, randomUUID(), card.revision),
      acceptOffer(db, userId, card.id, randomUUID(), card.revision),
    ]);
    assert.equal(await countBig(title), 1);
    assert.equal(applied[0].bigGoalId, applied[1].bigGoalId);
    assert.equal(applied[0].report.tools[0].authorization, 'user_confirmation');
    assert(await db.get('SELECT request_id FROM zoowy_turns WHERE user_id=? AND request_id=?', [userId, `confirm_offer_${card.id}_1`]));
    checked('concurrent confirmation writes once with transactional receipt');

    await db.run("INSERT INTO user_profiles (user_id,block,content,source,status,updated_at) VALUES (?,'basic','原值','user','active',?)", [userId, stamp]);
    await db.run("INSERT INTO user_profiles (user_id,block,content,source,status,updated_at) VALUES (?,'old','停用资料','user','void',?)", [userId, stamp]);
    const read = await executeTool(db, 'chat', userId, 'read_my_profile', {});
    assert(read.blocks.every((b) => b.status === 'active'));
    assert(!read.blocks.some((b) => b.block === 'old'));
    checked('void memory excluded from model read tool');

    const profile = await chatWithTool('offer_profile_patch', { patches: [{ op: 'update', block: 'basic', content: '模型旧建议', reason: '本轮讨论', evidence: '用户原话' }] },
      () => db.run("UPDATE user_profiles SET content='用户新值',updated_at=? WHERE user_id=? AND block='basic'", [new Date().toISOString(), userId]));
    const profileCard = profile.cards[0];
    assert.equal(profileCard.preview[0].before, '原值');
    assert.equal(profileCard.preview[0].after, '模型旧建议');
    await assert.rejects(acceptOffer(db, userId, profileCard.id, randomUUID(), profileCard.revision), (e) => e.status === 409);
    assert.equal((await db.get("SELECT content FROM user_profiles WHERE user_id=? AND block='basic'", [userId])).content, '用户新值');
    checked('profile baseline precedes model wait and stale confirmation cannot overwrite user edit');

    const baseline = await readProfileBaseline(db, userId);
    const profileChanged = await tx(db, async (c) => {
      await c.run("UPDATE user_profiles SET content='用户再次改',updated_at=? WHERE user_id=? AND block='basic'", [new Date().toISOString(), userId]);
      return applyProfilePatch(c, userId, [
        { op: 'update', block: 'basic', content: '旧推断', reason: 'auto' },
        { op: 'add', block: 'skills', content: '新事实', reason: 'auto' },
      ], 'ai', { workflow: 'daily', expected: baseline });
    });
    assert.equal(profileChanged.ok, true);
    assert.deepEqual(profileChanged.conflicts, ['basic']);
    assert.equal((await db.get("SELECT content FROM user_profiles WHERE user_id=? AND block='basic'", [userId])).content, '用户再次改');
    assert.equal((await db.get("SELECT content FROM user_profiles WHERE user_id=? AND block='skills'", [userId])).content, '新事实');
    checked('background skips conflicting memory block while preserving independent updates');

    const bigGoalId = applied[0].bigGoalId;
    await db.run(`INSERT INTO goals (owner_id,type,title,start_date,status,big_goal_id,planned_date,plan_order,plan_status,accept_criteria,created_at,updated_at)
      VALUES (?,'stage','原步骤','2026-11-14','draft',?,'2026-11-15',1,'planned','标准',?,?)`, [userId, bigGoalId, stamp, stamp]);
    responses = [{ parsed: { steps: [{ title: '新步骤', doneWhen: '可观察结果', minutes: 15, purpose: 'work' }] } }];
    const input = { userId, goal: '讨论规划', kind: 'stage', weeklyMinutes: 30, bigGoalId, userRequest: '' };
    const proposal = await generateChatProposal(db, input);
    const draft = await startDraft(db, userId, input, proposal);
    await db.run("UPDATE goals SET planned_date='2026-11-16',updated_at=? WHERE owner_id=? AND big_goal_id=?", [new Date().toISOString(), userId, bigGoalId]);
    await assert.rejects(confirmDraft(db, userId, draft.id, { revision: draft.revision }), (e) => e.status === 409);
    assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM goals WHERE owner_id=? AND big_goal_id=?', [userId, bigGoalId])).n), 1);
    checked('chain date edit with unchanged count/order invalidates old draft');
    console.log(JSON.stringify({ passed: checks, database: dbName, realDatabase: true, realModelCalls: 0 }));
  } finally {
    ai.chat = originalChat;
    await db.pool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
