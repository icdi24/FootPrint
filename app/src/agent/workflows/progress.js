// agent/workflows/progress.js —— progress 进度工作流（P0 骨架，P1 接小目标完成触发）
// 小目标完成时触发：先判断要不要动大目标进度 → 不动就整轮跳过（不调模型不写库）→
// 动则写进度 + 画像局部补丁（add/update/delete 带 reason，其余块原样留）。
const ai = require('../../ai');
const { PERSONA } = require('../persona');
const { executeTool, readProfileBaseline } = require('../tools');
const { runTurn } = require('../zoowy-turns');
const { createHash } = require('node:crypto');
const { currentRun } = require('../runtime-context');

async function runProgress({ db, userId, goalId }) {
  const goal = await db.get('SELECT * FROM goals WHERE id = ? AND owner_id = ?', [Number(goalId), userId]);
  if (!goal) throw new Error('目标不存在或不是你的');
  if (goal.status !== 'achieved') return { skipped: true, reason: 'not_achieved' };
  if (!goal.big_goal_id) return { skipped: true, reason: 'no_big_goal' };
  const event = createHash('sha256').update(String(goal.updated_at)).digest('hex').slice(0, 16);
  return runTurn(db, { userId, kind: 'background', requestId: `progress_${goal.id}_${event}`,
    input: { action: 'progress', goalId: goal.id } }, ({ signal, commit }) => prepareProgress(db, userId, goal, signal, commit));
}

async function prepareProgress(db, userId, goal, signal, commit) {
  const bg = await db.get('SELECT * FROM big_goals WHERE id = ? AND owner_id = ?', [goal.big_goal_id, userId]);
  if (!bg) return commit(async () => ({ skipped: true, reason: 'no_big_goal' }));

  const chain = await db.all(
    `SELECT title, plan_status, status, planned_date FROM goals
     WHERE big_goal_id = ? AND owner_id = ? AND status != 'archived'
     ORDER BY COALESCE(plan_order, 999999), id`,
    [bg.id, userId]
  );
  const stats = await db.get(
    "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'achieved') AS done FROM goals WHERE big_goal_id = ? AND owner_id = ? AND status != 'archived'",
    [bg.id, userId]
  );
  const profileBaseline = await readProfileBaseline(db, userId);
  const profileBrief = profileBaseline.filter((p) => p.status === 'active')
    .map((p) => `[${p.block}] ${p.content}`).join('\n') || '（暂无画像）';

  const system = `${PERSONA}

现在是「进度」环节：用户刚完成了一个小目标，你来判断这个大目标的 AI 进度要不要动。

先判断：如果这次完成对大方向没有实质推进（比如只是例行一步、或大目标描述太模糊），就 need_change=false，什么都不改。
要动才输出新进度。进度参考客观计数但不必相等——你看的是「离大目标本身还有多远」。

输出严格 JSON：
{
  "need_change": true/false,
  "progress": 0-100 整数（need_change=true 时必填）,
  "note": "为什么是这个进度，一两句（need_change=true 时必填）",
  "profile_patches": [   // 可选：这次完成 reveals 了值得记进画像的信息才给；没有就空数组
    { "op": "add|update|delete", "block": "块名", "content": "新内容(add/update)", "reason": "必填一句话", "evidence": "依据" }
  ]
}`;

  const userBlock = `【大目标】${bg.title}（当前 AI 进度 ${bg.progress}%）\n${bg.description}
【客观计数】done=${stats.done} / total=${stats.total}
【刚完成的小目标】${goal.title}（${goal.planned_date || '未排日期'}，验收标准：${goal.accept_criteria || '无'}）
【链上小目标】${chain.map((g) => `${g.title}(${g.status}${g.plan_status ? '/' + g.plan_status : ''})`).join('；')}
【用户画像】${profileBrief}`;

  const resp = await ai.chat(db, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userBlock },
    ],
    json: true,
    workflow: 'progress',
    action: 'progress_check',
    userId,
    signal,
  });

  const out = resp.parsed || {};
  if (!out.need_change) {
    // 整轮跳过：不写库，但要留痕（上线总验收：ai_calls 里看得到跳过记录）
    await ai.recordSkip(db, { userId, workflow: 'progress', action: 'progress_noop', detail: JSON.stringify({ goal_id: goal.id, big_goal_id: bg.id }) });
    return commit(async () => ({ skipped: true, reason: 'ai_noop' }));
  }

  return commit(async (c) => {
    const current = await c.get('SELECT updated_at FROM big_goals WHERE id=? AND owner_id=? FOR UPDATE', [bg.id, userId]);
    if (!current || current.updated_at !== bg.updated_at) return { skipped: true, reason: 'goal_changed' };
    const results = {};
    results.progress = await executeTool(c, 'progress', userId, 'write_big_goal_progress', {
      id: bg.id, progress: out.progress, note: out.note,
    });
    if (!results.progress.ok) throw new Error(results.progress.error);
    if (Array.isArray(out.profile_patches) && out.profile_patches.length) {
      results.profile = await executeTool(c, 'progress', userId, 'patch_my_profile', { patches: out.profile_patches }, { profileBaseline });
    }
    currentRun().report.committedChanges.push({ operation: 'write_big_goal_progress', recordIds: [bg.id], authorization: 'goal_approved' });
    if (results.profile?.changes?.length) currentRun().report.committedChanges.push({ operation: 'patch_my_profile',
      recordIds: [results.profile.changeId], authorization: 'goal_approved' });
    return { skipped: false, results, profileConflict: Boolean(results.profile?.conflicts?.length) };
  });
}

module.exports = { runProgress };
