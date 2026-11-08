const { tx } = require('../../db');
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

function draftView(row) {
  if (!row) return null;
  return {
    ...row.proposal,
    id: row.id, revision: row.revision, goal: row.goal, kind: row.kind,
    weeklyMinutes: row.weekly_minutes, status: row.status, result: row.result,
  };
}

function readMinutes(value) {
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
    return await generateProposal(db, { ...options, goal: options.goal.trim(), weeklyMinutes });
  } catch (error) {
    if (error instanceof ProposalValidationError) throw new PlanningError(422, error.message);
    throw error;
  }
}

function assertGeneratedProposal(proposal, kind, weeklyMinutes) {
  if (!validateGeneratedProposal(proposal, { kind, weeklyMinutes })) {
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
  const row = await db.get(
    `INSERT INTO planning_drafts (owner_id, goal, kind, weekly_minutes, status, proposal)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    [ownerId, goal, kind, weeklyMinutes, 'ready', proposal]
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

async function startReplanDraft(db, ownerId, { bigGoalId, days }) {
  const bg = await db.get("SELECT id,title FROM big_goals WHERE id=? AND owner_id=? AND status='active'", [bigGoalId, ownerId]);
  if (!bg) throw new PlanningError(404, '找不到可重排的大目标');
  if (!Number.isInteger(days) || !days || Math.abs(days) > 30) throw new PlanningError(400, '移动天数应为 ±1–30 天');
  const rows = await db.all(
    `SELECT id,title,planned_date,updated_at FROM goals
     WHERE big_goal_id=? AND owner_id=? AND status='draft' AND plan_status='planned' AND planned_date IS NOT NULL
     ORDER BY plan_order,id LIMIT 20`, [bigGoalId, ownerId]
  );
  if (!rows.length) throw new PlanningError(409, '没有可以重排的未开始小目标');
  const changes = rows.map((row) => ({ id: row.id, title: row.title, from: row.planned_date,
    to: addDaysStr(row.planned_date, days), updatedAt: row.updated_at }));
  const proposal = { question: null, replan: { bigGoalId, changes }, steps: changes.map((item) => ({
    id: String(item.id), title: item.title, doneWhen: `计划释放日期：${item.from} → ${item.to}`, dependsOn: [], next: false,
  })) };
  return draftView(await db.get(
    `INSERT INTO planning_drafts (owner_id,goal,kind,status,proposal) VALUES (?,?,'stage','ready',?) RETURNING *`,
    [ownerId, bg.title, proposal]
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
  const title = row.goal.replace(/\s+/g, ' ').slice(0, 40).replace(/[\uD800-\uDBFF]$/, '');
  const { id: bigGoalId } = await db.get(
    `INSERT INTO big_goals (owner_id, title, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?) RETURNING id`, [row.owner_id, title, row.goal, timestamp, timestamp]
  );
  const goalIds = [];
  for (const [index, step] of steps.entries()) {
    const goalId = await saveGoal(db, row.owner_id, {
      type: 'stage', title: step.title, accept_criteria: step.doneWhen,
      est_total_min: step.minutes, start_date: date, end_date: deadline || null, active: false,
    }, cfg);
    await db.run(
      `UPDATE goals SET big_goal_id = ?, plan_order = ?, planned_date = ?, plan_status = ?, prerequisite_goal_id = ?
       WHERE id = ?`, [bigGoalId, index + 1, date, step.next ? 'released' : 'planned', goalIds[index - 1] ?? null, goalId]
    );
    goalIds.push(goalId);
  }
  await snapshotPlan(db, bigGoalId, 'user', `planning_confirm:${row.id}`);
  return { bigGoalId, goalIds };
}

async function confirmDraft(db, ownerId, id, { revision }) {
  return tx(db, async (c) => {
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
    const result = row.proposal.replan ? await applyReplan(c, row) : await applyProposal(c, row);
    const updated = await c.get("UPDATE planning_drafts SET status = 'applied', result = ? WHERE id = ? RETURNING *", [result, id]);
    return draftView(updated);
  });
}

module.exports = { PlanningError, latestDraft, getDraft, generateChatProposal, startDraft, reviseChatDraft, startReplanDraft, confirmDraft };
