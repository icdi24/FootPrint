// zoowy v2 全链路离线回归（不需要模型 / 网络；用本地 PG 与 mock ai.chat）。
// 用 mock ai.chat 跑通「单条直写 / 提议→确认 / 草案→应用 / 失败补记录 / 过期提议」，
// 覆盖除「模型本身」外的全部环节。跑法：cd app && npm run check:flow-v2
const path = require('path');
process.chdir(path.join(__dirname, '..'));
require('../src/env').loadEnvFile();
const { randomUUID } = require('node:crypto');
const ai = require('../src/ai');
const { openDb } = require('../src/db');
const chat = require('../src/agent/workflows/chat');
const { PlanningError } = require('../src/agent/workflows/planning');

const TAG = '【流测试】';
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' :: ' + String(detail).slice(0, 160) : ''}`);
};

// ---- mock 模型：按 action 返回脚本化结果 ----
const scripted = { chat_reply: [], generate_chat_draft: { steps: [
  { title: '摸底并归因', doneWhen: '完成一套真题并写出错题归因', minutes: 60, purpose: 'work' },
] } };
const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
const origChat = ai.chat;
ai.chat = async (db, opts) => {
  if (opts.action === 'generate_chat_draft') {
    return { content: '', parsed: scripted.generate_chat_draft, usage };
  }
  if (opts.action === 'chat_reply') {
    const next = scripted.chat_reply.shift();
    if (next && next.throw) throw new ai.AiError('模拟模型超时', { kind: 'timeout' });
    if (next) return { content: next.content || '', toolCalls: next.toolCalls || [], usage };
    return { content: '（模型无更多输出）', toolCalls: [], usage };
  }
  return origChat(db, opts);
};

const call = (name, args) => ({ id: 'c_' + randomUUID().slice(0, 8), function: { name, arguments: JSON.stringify(args) } });
const rid = () => 'flow-' + randomUUID();
const run = (message, bigGoalId = null) => chat.runChat({ db, userId: 1, message, requestId: rid(), bigGoalId });

let db;
async function wipe() {
  // 先删引用方（planning_drafts.big_goal_id 有 FK），再删被引用方
  await db.run('DELETE FROM planning_drafts WHERE goal LIKE ? OR big_goal_id IN (SELECT id FROM big_goals WHERE title LIKE ?)', [TAG + '%', TAG + '%']);
  await db.run('DELETE FROM goals WHERE big_goal_id IN (SELECT id FROM big_goals WHERE title LIKE ?)', [TAG + '%']);
  await db.run('DELETE FROM plan_versions WHERE big_goal_id IN (SELECT id FROM big_goals WHERE title LIKE ?)', [TAG + '%']);
  await db.run('DELETE FROM big_goals WHERE title LIKE ?', [TAG + '%']);
  await db.run('DELETE FROM zoowy_offers WHERE payload::text LIKE ? OR payload::text LIKE ?', [TAG + '%', '%flowtest%']);
  await db.run('DELETE FROM zoowy_messages WHERE user_id = 1 AND id > ?', [maxId.msg]);
  await db.run('DELETE FROM zoowy_turns WHERE user_id = 1 AND request_id LIKE ?', ['flow-%']);
  await db.run('DELETE FROM profile_changes WHERE user_id = 1 AND summary LIKE ?', ['%流测试%']);
  await db.run('DELETE FROM profile_versions WHERE user_id = 1 AND id > ?', [maxId.pv]);
  await db.run('DELETE FROM user_profiles WHERE user_id = 1 AND block = ?', ['flowtest']);
  await db.run('DELETE FROM ai_calls WHERE user_id = 1 AND id > ?', [maxId.ac]);
}

const maxId = {};
(async () => {
  db = await openDb(process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint');
  for (const [k, sql] of Object.entries({
    msg: 'SELECT COALESCE(MAX(id),0) m FROM zoowy_messages WHERE user_id=1',
    pv: 'SELECT COALESCE(MAX(id),0) m FROM profile_versions WHERE user_id=1',
    ac: 'SELECT COALESCE(MAX(id),0) m FROM ai_calls WHERE user_id=1',
  })) maxId[k] = Number((await db.get(sql)).m);
  await wipe();
  try {
    // ===== 场景 1：用户明确请求的单条直写 =====
    const bgCountBefore = Number((await db.get("SELECT COUNT(*) n FROM big_goals WHERE owner_id=1")).n);
    scripted.chat_reply = [
      { toolCalls: [call('create_big_goal', { title: TAG + '六级备考', description: '流测试用' })] },
      { content: '已帮你建好大目标。' },
    ];
    const r1 = await run('帮我建个大目标');
    check('1 单条直写：返回正常回复', r1.reply && r1.reply.includes('建好') && !r1.failed, r1.reply);
    check('2 单条直写：大目标已落库', Number((await db.get("SELECT COUNT(*) n FROM big_goals WHERE owner_id=1")).n) === bgCountBefore + 1);
    check('3 单条直写：不需要确认卡片', (r1.cards || []).length === 0, JSON.stringify(r1.cards));
    const bg = await db.get('SELECT id FROM big_goals WHERE title = ? AND owner_id = 1', [TAG + '六级备考']);
    const bgId = bg.id;
    check('4 单条直写：对话成对落库', Number((await db.get('SELECT COUNT(*) n FROM zoowy_messages WHERE user_id=1 AND id > ?', [maxId.msg])).n) >= 2);

    // ===== 场景 2：模型主动提议 → 用户确认 → 画像写入 =====
    const profileBefore = await db.get("SELECT content FROM user_profiles WHERE user_id=1 AND block='flowtest'");
    scripted.chat_reply = [
      { toolCalls: [call('offer_profile_patch', { patches: [
        { op: 'add', block: 'flowtest', content: '流测试画像', reason: '全链路测试', evidence: 'flow-v2.js' },
      ] })] },
      { content: '这条我先提议一下。' },
    ];
    const r2 = await run('你觉得我该记点什么');
    const po = (r2.cards || []).find((c) => c.type === 'profile_offer');
    check('5 提议：出 profile_offer 卡片', Boolean(po), JSON.stringify(r2.cards));
    const offerId = po.id;
    check('6 提议：未确认时画像没被写', !(await db.get("SELECT content FROM user_profiles WHERE user_id=1 AND block='flowtest'")));
    const acc = await chat.acceptOffer(db, 1, offerId, rid());
    check('7 确认：返回 profile_applied', acc.type === 'profile_applied', JSON.stringify(acc).slice(0, 120));
    check('8 确认：画像已写入', Boolean(await db.get("SELECT content FROM user_profiles WHERE user_id=1 AND block='flowtest'")));
    const pcCount = Number((await db.get("SELECT COUNT(*) n FROM profile_changes WHERE user_id=1 AND summary LIKE '%flowtest%'")).n);
    check('9 确认：画像变更留痕', pcCount >= 1, 'count=' + pcCount);
    const acc2 = await chat.acceptOffer(db, 1, offerId, rid());
    check('10 幂等：重复确认返回已存结果', acc2.type === 'profile_applied' && acc2.changeId === acc.changeId);
    check('11 幂等：重复确认不重复留痕', Number((await db.get("SELECT COUNT(*) n FROM profile_changes WHERE user_id=1 AND summary LIKE '%flowtest%'")).n) === pcCount);

    // ===== 场景 3：草案链路，复用已有大目标 =====
    const goalsBefore = Number((await db.get('SELECT COUNT(*) n FROM goals WHERE big_goal_id = ?', [bgId])).n);
    scripted.chat_reply = [
      { toolCalls: [call('offer_new_plan', { goal: TAG + '备考计划', kind: 'stage', weeklyMinutes: 120 })] },
      { content: '草案提议好了。' },
    ];
    const r3 = await run('帮我规划一下', bgId);
    const pl = (r3.cards || []).find((c) => c.type === 'plan_offer');
    check('12 草案：出 plan_offer 卡片', Boolean(pl), JSON.stringify(r3.cards));
    const card3 = await chat.acceptOffer(db, 1, pl.id, rid());
    check('13 草案：同意后生成 plan_draft', card3.type === 'plan_draft', JSON.stringify(card3).slice(0, 140));
    const draft = card3.draft;
    check('14 草案：带入已有 bigGoalId', draft && draft.bigGoalId === bgId, JSON.stringify(draft).slice(0, 160));
    check('15 草案：状态 ready 且有待应用步骤', draft && draft.status === 'ready' && draft.steps.length >= 1);
    const applied = await chat.confirmChatDraft(db, 1, draft.id, draft.revision);
    check('16 应用：返回 plan_draft', applied.type === 'plan_draft');
    const goalsAfter = Number((await db.get('SELECT COUNT(*) n FROM goals WHERE big_goal_id = ?', [bgId])).n);
    check('17 应用：小目标写入已有大目标链', goalsAfter === goalsBefore + draft.steps.length, `${goalsBefore} -> ${goalsAfter}`);
    const bgAfter = Number((await db.get("SELECT COUNT(*) n FROM big_goals WHERE owner_id=1")).n);
    check('18 应用：没有新建第二个大目标', bgAfter === bgCountBefore + 1, 'bigGoals=' + bgAfter);
    check('19 应用：写了 plan_versions 快照', Number((await db.get('SELECT COUNT(*) n FROM plan_versions WHERE big_goal_id = ?', [bgId])).n) >= 1);
    check('20 应用：草案标为 applied', applied.draft && applied.draft.status === 'applied', applied.draft && applied.draft.status);

    // ===== 场景 4：模型失败 → 补 assistant 错误记录 =====
    const msgBefore4 = Number((await db.get('SELECT COUNT(*) n FROM zoowy_messages WHERE user_id=1 AND id > ?', [maxId.msg])).n);
    scripted.chat_reply = [{ throw: true }];
    const r4 = await run('这轮会失败');
    check('21 失败：返回 failed 友好响应', r4.failed === true && r4.reply && r4.reply.includes('🐾'), r4.reply);
    const msgAfter4 = Number((await db.get('SELECT COUNT(*) n FROM zoowy_messages WHERE user_id=1 AND id > ?', [maxId.msg])).n);
    check('22 失败：对话仍成对落库（不消失）', msgAfter4 === msgBefore4 + 2, `${msgBefore4} -> ${msgAfter4}`);

    // ===== 场景 5：过期提议（30 分钟新鲜度） =====
    const expired = await db.get(
      `INSERT INTO zoowy_offers (user_id, session_id, payload) VALUES (?, ?, ?) RETURNING id`,
      [1, (await db.get('SELECT id FROM zoowy_sessions WHERE user_id=1 ORDER BY id LIMIT 1')).id,
        JSON.stringify({ op: 'profile_patch', patches: [{ op: 'add', block: 'flowtest2', content: 'x', reason: '过期测试' }], messageId: 1, summary: '过期提议' })]
    );
    await db.run("UPDATE zoowy_offers SET created_at = NOW() - INTERVAL '31 minutes' WHERE id = ?", [expired.id]);
    let expiredErr = null;
    try { await chat.acceptOffer(db, 1, Number(expired.id), rid()); } catch (e) { expiredErr = e; }
    check('23 过期：31 分钟前提议被拒 409', expiredErr instanceof PlanningError && expiredErr.status === 409, expiredErr && expiredErr.message);
  } finally {
    ai.chat = origChat;
    await wipe();
    await db.pool.end();
  }
  console.log(`\n========== ${pass} PASS / ${fail} FAIL ==========`);
  if (fail) process.exitCode = 1;
})().catch((e) => { console.error('脚本异常：', e); process.exitCode = 1; });
