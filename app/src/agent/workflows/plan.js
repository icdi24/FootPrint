// agent/workflows/plan.js —— plan 规划工作流（P0 骨架，P1 接路由与前端）
// 大目标页按钮触发。两条路：mode='idea'（我先说说想法）/ 'auto'（按已有信息直接来）。
// 流程（1.5 / 1.6）：先自检信息够不够 → 不够就一次问一个、先给建议答案 →
// 够了出候选小目标（不写库）→ 用户勾选 = 一次确认 → confirmPlan 走工具白名单创建。
const ai = require('../../ai');
const { PERSONA } = require('../persona');
const { executeTool, snapshotPlan } = require('../tools');
const { todayStr, addDaysStr } = require('../../tz');

// 第一步：自检 + 出候选（不写任何东西）
async function planIntro({ db, userId, bigGoalId, mode = 'auto', userMessage = '', history = [], force = false }) {
  const bg = await db.get('SELECT * FROM big_goals WHERE id = ? AND owner_id = ?', [Number(bigGoalId), userId]);
  if (!bg) throw new Error('大目标不存在或不是你的');
  const chain = await db.all(
    `SELECT id, title, plan_status, status, planned_date FROM goals
     WHERE big_goal_id = ? AND owner_id = ? ORDER BY COALESCE(plan_order, 999999), id`,
    [bg.id, userId]
  );
  const profileRows = await db.all(
    "SELECT block, content FROM user_profiles WHERE user_id = ? AND status = 'active' ORDER BY block", [userId]
  );

  const system = `${PERSONA}

现在是「规划」环节：帮用户的大目标拆一条小目标路线。分两步走，本次输出只是第一步：
第一步（这次）：判断手里的信息够不够拆出靠谱路线。不够就只问一个问题（一次只问一个），并附上你的建议答案让用户勾。
够了就直接给候选小目标列表。

输出严格 JSON：
{
  "enough": true/false,
  "question": "信息不够时要问的那一个问题（够了就空串）",
  "suggestion": "对上面问题的建议答案，一两句（够了就空串）",
  "candidates": [   // enough=true 时给，3–8 条，按时间先后排
    {
      "title": "小目标名，1–30 字",
      "planned_date": "YYYY-MM-DD，从 ${addDaysStr(todayStr(), 1)} 起排",
      "accept_criteria": "验收标准，对方照这个验收，≤200 字",
      "est_total_min": 600,
      "difficulty": 3,
      "description": "一句话说明，可空",
      "emoji": "🎯"
    }
  ]
}

拆法要求：每个小目标可独立验收；粒度一周到一个月一件；前紧后松留缓冲；别把「每天做什么」当小目标（那是日常目标的事）。
${force ? '\n用户已明确表示不再回答问题：无论信息够不够，本次 enough 必须为 true，直接基于现有信息给出最合理的候选（拿不准的在 description 里标注你的假设）。' : ''}`;

  const ctxBlock = `【大目标】${bg.title}（AI 进度 ${bg.progress}%）\n${bg.description}
【已有的小目标链】${chain.length ? chain.map((g) => `${g.planned_date || '未排'} ${g.title}(${g.plan_status || '未绑定'}/${g.status})`).join('；') : '（空，从头拆）'}
【用户画像】${profileRows.length ? profileRows.map((p) => `[${p.block}] ${p.content}`).join('\n') : '（暂无画像）'}
${history.length ? `【本次对话已问过的】${history.map((h) => `问：${h.q || ''} 答：${h.a || ''}`).join('；')}` : ''}
${mode === 'idea' ? `【用户自己的想法】${userMessage}` : '【启动方式】用户选了「按已有信息直接来」——尽量别反问，信息实在不够才问'}`;

  const resp = await ai.chat(db, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: ctxBlock },
    ],
    json: true,
    workflow: 'plan',
    action: 'plan_intro',
    userId,
  });

  const out = resp.parsed || {};
  if (out.enough && (!Array.isArray(out.candidates) || !out.candidates.length)) {
    throw new ai.AiError('AI 说信息够了但没给候选，已丢弃（不写库）', { kind: 'bad_json' });
  }
  return out;
}

// 第二步：用户勾选候选 = 一次确认 → 走 plan 白名单的工具创建（同一套链路，写 plan_versions）
async function confirmPlan({ db, userId, bigGoalId, items }) {
  if (!Array.isArray(items) || !items.length) throw new Error('没勾任何候选');
  if (items.length > 10) throw new Error('一次最多创建 10 个');
  const bg = await db.get('SELECT * FROM big_goals WHERE id = ? AND owner_id = ?', [Number(bigGoalId), userId]);
  if (!bg) throw new Error('大目标不存在或不是你的');

  const created = [];
  const skipped = [];
  let order = (await db.get(
    'SELECT COALESCE(MAX(plan_order), 0) AS m FROM goals WHERE big_goal_id = ? AND owner_id = ?', [bg.id, userId]
  )).m;
  for (const item of items) {
    order += 1;
    const r = await executeTool(db, 'plan', userId, 'create_plan_goal', {
      big_goal_id: bg.id,
      // AI 候选标题偶尔超长：截到 30 字（工具层硬限制），别让整条候选被跳过
      title: String(item.title || '').trim().slice(0, 30),
      planned_date: item.planned_date,
      plan_order: order,
      accept_criteria: item.accept_criteria,
      est_total_min: item.est_total_min,
      difficulty: item.difficulty,
      description: item.description,
      emoji: item.emoji,
    });
    if (r.ok) created.push({ goal_id: r.goal_id, title: item.title, duplicate: Boolean(r.duplicate) });
    else skipped.push({ title: item.title, error: r.error });
  }
  await snapshotPlan(db, bg.id, 'user', '用户勾选候选计划');
  return { created, skipped };
}

module.exports = { planIntro, confirmPlan };
