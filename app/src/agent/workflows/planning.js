const { tx } = require('../../db');
const { createHash } = require('node:crypto');
const { getPoints } = require('../../points');
const { todayStr, nowIso, addDaysStr } = require('../../tz');
const { createGoal, validateGoalBody } = require('../../routes/goals');
const { snapshotPlan } = require('../tools');
const { validateProposal } = require('./planning-rules');
const { generateProposal, validateGeneratedProposal, ProposalValidationError } = require('./planning-generation');

class PlanningError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function chainSignature(db, ownerId, bigGoalId, lock = false) {
  const bigGoal = await db.get(`SELECT id,title,description,status,updated_at FROM big_goals
    WHERE id=? AND owner_id=?${lock ? ' FOR UPDATE' : ''}`, [bigGoalId, ownerId]);
  if (!bigGoal || bigGoal.status !== 'active') throw new PlanningError(409, '大目标已变更，请重新预览');
  const chain = await db.all(`SELECT id,title,description,accept_criteria,planned_date,plan_order,plan_status,status,
    est_total_min,difficulty,prerequisite_goal_id,updated_at FROM goals
    WHERE big_goal_id=? AND owner_id=? AND status != 'archived' ORDER BY id${lock ? ' FOR UPDATE' : ''}`, [bigGoalId, ownerId]);
  return createHash('sha256').update(JSON.stringify({ bigGoal, chain })).digest('hex');
}

function draftView(row) {
  if (!row) return null;
  return {
    ...row.proposal,
    id: row.id, revision: row.revision, goal: row.goal, kind: row.kind,
    bigGoalId: row.big_goal_id ?? null,
    weeklyMinutes: row.weekly_minutes, status: row.status, result: row.result,
  };
}

function readMinutes(value) {
  // 带已有大目标时允许用户不填每周分钟数（交给规则模板问一个问题），此时不做时间预算校验。
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 5 || value > 10080) {
    throw new PlanningError(400, '每周可用时间需为 5–10080 分钟的整数');
  }
  return value;
}

async function generateChatProposal(db, options) {
  const weeklyMinutes = readMinutes(options.weeklyMinutes);
  if (!['daily', 'stage'].includes(options.kind)) throw new PlanningError(400, '请选择目标类型');
  if (typeof options.goal !== 'string' || !options.goal.trim() || options.goal.length > 200
    || !options.goal.isWellFormed() || options.goal.includes('\0')) throw new PlanningError(400, '目标需要 1–200 字');
  try {
    const bigGoalId = options.bigGoalId ?? options.previousDraft?.bigGoalId;
    const chainSig = bigGoalId ? await chainSignature(db, options.userId, bigGoalId) : null;
    const proposal = await generateProposal(db, { ...options, goal: options.goal.trim(), weeklyMinutes });
    return chainSig ? { ...proposal, chainSig } : proposal;
  } catch (error) {
    if (error instanceof ProposalValidationError) throw new PlanningError(422, error.message);
    throw error;
  }
}

function assertGeneratedProposal(proposal, kind, weeklyMinutes) {
  if (weeklyMinutes == null) {
    // 复用已有大目标且用户未给每周分钟数：只做结构检查，不套时间预算
    const stepsOk = proposal && Array.isArray(proposal.steps) && proposal.steps.length > 0
      && proposal.steps.every((s) => s && typeof s.title === 'string' && s.title.trim()
        && typeof s.doneWhen === 'string' && s.doneWhen.trim()
        && Number.isInteger(s.minutes) && s.minutes > 0);
    if (!stepsOk) throw new PlanningError(422, '草案未通过结构检查，请重新生成');
  } else if (!validateGeneratedProposal(proposal, { kind, weeklyMinutes })) {
    throw new PlanningError(422, '草案未通过结构或预算检查，请重新生成');
  }
  if (proposal.deadline && proposal.deadline < todayStr()) {
    throw new PlanningError(409, '草案的截止日期已过，请重新生成');
  }
}

async function latestDraft(db, ownerId) {
  const row = await db.get('SELECT * FROM planning_drafts WHERE owner_id = ? ORDER BY id DESC LIMIT 1', [ownerId]);
  return draftView(row);
}

async function startDraft(db, ownerId, input, proposal) {
  const goal = typeof input.goal === 'string' ? input.goal.trim() : '';
  if (!goal || goal.length > 200 || !goal.isWellFormed() || goal.includes('\0')) {
    throw new PlanningError(400, '请填写 1–200 字的目标');
  }
  const { kind } = input;
  if (kind !== 'stage' && kind !== 'daily') throw new PlanningError(400, '请选择目标类型');
  const weeklyMinutes = readMinutes(input.weeklyMinutes);
  assertGeneratedProposal(proposal, kind, weeklyMinutes);
  // bigGoalId 由聊天上下文带入（不让模型编 id）：非空时复用已有大目标，只建小目标
  let bigGoalId = null;
  if (input.bigGoalId != null) {
    const bg = await db.get(
      "SELECT id FROM big_goals WHERE id = ? AND owner_id = ? AND status = 'active'",
      [Number(input.bigGoalId), ownerId]
    );
    if (!bg) throw new PlanningError(404, '找不到这个大目标，或不是你的');
    bigGoalId = bg.id;
  }
  // 记下生成时的链状态指纹，确认时重读比对（防用户在大目标页手改过链）
  let chainSig = proposal.chainSig ?? null;
  if (bigGoalId != null) {
    const current = await chainSignature(db, ownerId, bigGoalId);
    if (!chainSig || chainSig !== current) throw new PlanningError(409, '生成期间目标链已变化，请重新预览');
  }
  const stored = chainSig ? { ...proposal, chainSig } : proposal;
  const row = await db.get(
    `INSERT INTO planning_drafts (owner_id, big_goal_id, goal, kind, weekly_minutes, status, proposal)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [ownerId, bigGoalId, goal, kind, weeklyMinutes, 'ready', stored]
  );
  return draftView(row);
}

async function lockDraft(db, ownerId, id, revision) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new PlanningError(404, '找不到规划草案');
  if (!Number.isInteger(revision) || revision < 1) throw new PlanningError(400, '缺少有效的草案版本');
  const row = await db.get('SELECT * FROM planning_drafts WHERE id = ? AND owner_id = ? FOR UPDATE', [id, ownerId]);
  if (!row) throw new PlanningError(404, '找不到规划草案');
  if (row.revision !== revision) throw new PlanningError(409, '草案已更新，请重新打开查看');
  return row;
}

async function getDraft(db, ownerId, id) {
  return draftView(await db.get('SELECT * FROM planning_drafts WHERE id = ? AND owner_id = ?', [id, ownerId]));
}

async function reviseChatDraft(db, ownerId, id, { revision, goal, weeklyMinutes }, proposal) {
  const row = await lockDraft(db, ownerId, id, revision);
  if (row.status === 'applied' || row.proposal.replan) throw new PlanningError(409, '请基于最新目标重新发起规划');
  const nextGoal = goal ?? row.goal;
  if (typeof nextGoal !== 'string' || !nextGoal.trim() || nextGoal.length > 200 || !nextGoal.isWellFormed() || nextGoal.includes('\0')) {
    throw new PlanningError(400, '目标需要 1–200 字');
  }
  const minutes = readMinutes(weeklyMinutes ?? row.weekly_minutes);
  assertGeneratedProposal(proposal, row.kind, minutes);
  const updated = await db.get(
    `UPDATE planning_drafts SET goal=?, weekly_minutes=?, status='ready', proposal=?, revision=revision+1
     WHERE id=? RETURNING *`, [nextGoal.trim(), minutes, proposal, id]
  );
  return draftView(updated);
}

async function startReplanDraft(db, ownerId, { bigGoalId, days, fromDate }) {
  const bg = await db.get("SELECT id,title FROM big_goals WHERE id=? AND owner_id=? AND status='active'", [bigGoalId, ownerId]);
  if (!bg) throw new PlanningError(404, '找不到可重排的大目标');
  if (!Number.isInteger(days) || !days || Math.abs(days) > 365) throw new PlanningError(400, '移动天数应为 ±1–365 天');
  const rows = await db.all(
    `SELECT id,title,planned_date,updated_at FROM goals
     WHERE big_goal_id=? AND owner_id=? AND status='draft' AND plan_status='planned' AND planned_date IS NOT NULL
     ${fromDate ? 'AND planned_date >= ?' : ''} ORDER BY plan_order,id LIMIT 101`, fromDate ? [bigGoalId, ownerId, fromDate] : [bigGoalId, ownerId]
  );
  if (!rows.length) throw new PlanningError(409, '没有可以重排的未开始小目标');
  if (rows.length > 100) throw new PlanningError(422, '一次最多调整 100 个小目标，请缩小日期范围');
  const changes = rows.map((row) => ({ id: row.id, title: row.title, from: row.planned_date,
    to: addDaysStr(row.planned_date, days), updatedAt: row.updated_at }));
  const proposal = { question: null, replan: { bigGoalId, changes }, steps: changes.map((item) => ({
    id: String(item.id), title: item.title, doneWhen: `计划释放日期：${item.from} → ${item.to}`, dependsOn: [], next: false,
  })) };
  return draftView(await db.get(
    `INSERT INTO planning_drafts (owner_id, big_goal_id, goal, kind, status, proposal) VALUES (?,?,?,'stage','ready',?) RETURNING *`,
    [ownerId, bigGoalId, bg.title, proposal]
  ));
}

async function applyReplan(db, row) {
  const { bigGoalId, changes } = row.proposal.replan;
  const bg = await db.get("SELECT id FROM big_goals WHERE id=? AND owner_id=? AND status='active' FOR UPDATE", [bigGoalId, row.owner_id]);
  if (!bg) throw new PlanningError(409, '目标已变更，请重新预览');
  for (const change of changes) {
    const result = await db.run(
      `UPDATE goals SET planned_date=?, updated_at=? WHERE id=? AND owner_id=? AND big_goal_id=?
       AND status='draft' AND plan_status='planned' AND planned_date=? AND updated_at=?`,
      [change.to, nowIso(), change.id, row.owner_id, bigGoalId, change.from, change.updatedAt]
    );
    if (!result.changes) throw new PlanningError(409, '有步骤状态已变化，请重新预览');
  }
  await snapshotPlan(db, bigGoalId, 'user', `planning_replan:${row.id}`);
  return { bigGoalId, goalIds: changes.map((x) => x.id) };
}

async function saveGoal(db, ownerId, body, cfg) {
  const [error] = validateGoalBody(body);
  if (error) throw new PlanningError(422, error);
  return createGoal(db, ownerId, body, cfg);
}

async function applyProposal(db, row) {
  const { steps, frequency, sessionMinutes, deadline } = row.proposal;
  const cfg = await getPoints(db);
  if (row.kind === 'daily') {
    const goalId = await saveGoal(db, row.owner_id, {
      type: 'daily', title: steps[0].title, description: steps[0].doneWhen,
      freq_mode: 'weekly', freq_n: frequency, duration_min: sessionMinutes, end_date: deadline || null,
    }, cfg);
    return { goalIds: [goalId] };
  }

  const timestamp = nowIso();
  const date = todayStr();
  let bigGoalId = row.big_goal_id ?? null;
  let reused = false;
  if (bigGoalId != null) {
    // 复用已有大目标：事务内锁行校验归属与状态，不新建
    const bg = await db.get(
      "SELECT id FROM big_goals WHERE id = ? AND owner_id = ? AND status = 'active' FOR UPDATE",
      [bigGoalId, row.owner_id]
    );
    if (!bg) throw new PlanningError(409, '大目标已变更，请重新预览');
    reused = true;
  } else {
    const title = row.goal.replace(/\s+/g, ' ').slice(0, 40).replace(/[\uD800-\uDBFF]$/, '');
    const created = await db.get(
      `INSERT INTO big_goals (owner_id, title, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`, [row.owner_id, title, row.goal, timestamp, timestamp]
    );
    bigGoalId = created.id;
  }
  // 复用已有大目标时，plan_order 从链上最大值续排
  const orderRow = await db.get(
    'SELECT COALESCE(MAX(plan_order), 0) AS m FROM goals WHERE big_goal_id = ? AND owner_id = ?',
    [bigGoalId, row.owner_id]
  );
  let order = Number(orderRow.m);
  const goalIds = [];
  let prevId = null;
  for (const step of steps) {
    order += 1;
    const goalId = await saveGoal(db, row.owner_id, {
      type: 'stage', title: step.title, accept_criteria: step.doneWhen,
      est_total_min: step.minutes, start_date: date, end_date: deadline || null, active: false,
    }, cfg);
    await db.run(
      `UPDATE goals SET big_goal_id = ?, plan_order = ?, planned_date = ?, plan_status = ?, prerequisite_goal_id = ?
       WHERE id = ?`, [bigGoalId, order, date, step.next ? 'released' : 'planned', prevId, goalId]
    );
    prevId = goalId;
    goalIds.push(goalId);
  }
  await snapshotPlan(db, bigGoalId, 'user', `planning_confirm:${row.id}`);
  return { bigGoalId, goalIds, reused };
}

async function confirmDraft(db, ownerId, id, { revision }) {
  const apply = async (c) => {
    await c.get('SELECT pg_advisory_xact_lock(7394, ?)', [ownerId]);
    const row = await lockDraft(c, ownerId, id, revision);
    if (row.status === 'applied') return draftView(row);
    if (row.status !== 'ready') throw new PlanningError(409, '请先回答问题并查看草案');
    const input = { goal: row.goal, kind: row.kind, weeklyMinutes: row.weekly_minutes };
    if (!row.proposal.replan) {
      if (row.proposal.schemaVersion !== undefined) assertGeneratedProposal(row.proposal, row.kind, row.weekly_minutes);
      else if (input.weeklyMinutes === null || !validateProposal(row.proposal, input)) {
        throw new PlanningError(422, '草案不满足时间或步骤要求，请重新生成');
      }
    }
    // 确认时重读链状态：与草案生成时不一致就拒绝，避免覆盖用户手改
    if (row.big_goal_id != null && !row.proposal.replan) {
      const sig = await chainSignature(c, ownerId, row.big_goal_id, true);
      if (!row.proposal.chainSig || !/^[a-f0-9]{64}$/.test(row.proposal.chainSig)) throw new PlanningError(409, '旧草案缺少版本依据，请重新预览');
      if (sig !== row.proposal.chainSig) throw new PlanningError(409, '大目标链已变化，请重新预览');
    }
    const result = row.proposal.replan ? await applyReplan(c, row) : await applyProposal(c, row);
    const updated = await c.get("UPDATE planning_drafts SET status = 'applied', result = ? WHERE id = ? RETURNING *", [result, id]);
    return draftView(updated);
  };
  return db.inTransaction ? apply(db) : tx(db, apply);
}

module.exports = { PlanningError, latestDraft, getDraft, generateChatProposal, startDraft, reviseChatDraft, startReplanDraft, confirmDraft, chainSignature };
