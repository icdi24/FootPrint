// agent/workflows/chat.js —— chat 常驻问答工作流（P0 骨架，P2 接「我」页路由）
// 「我」页 zoowy：带用户信息的知识库问答（结构化数据直接拼上下文，不引向量库），
// 保留工具调用能力（chat 白名单：读全 + 排计划相关写；不给写日报/写进度）。
const { PERSONA } = require('../persona');
const ai = require('../../ai');
const { runAgentLoop } = require('../gateway');
const { ensureSession, recentMessages, appendMessage } = require('../session');
const { todayStr, addDaysStr } = require('../../tz');
const { getUserSettings } = require('../../settings');

// 拼用户快照上下文：画像 / 活跃目标 / 今日打卡 / 最近日报 / 近 7 天时长
async function buildUserContext(db, userId, bigGoalId) {
  const parts = [];
  const profile = await db.all(
    "SELECT block, content FROM user_profiles WHERE user_id = ? AND status = 'active' ORDER BY block", [userId]
  );
  parts.push(`【画像】${profile.length ? profile.map((p) => `[${p.block}] ${p.content}`).join('\n') : '（暂无）'}`);

  const goals = await db.all(
    "SELECT type, title, status, streak_count, big_goal_id FROM goals WHERE owner_id = ? AND status = 'active' ORDER BY id DESC LIMIT 20",
    [userId]
  );
  parts.push(`【进行中的目标】${goals.length ? goals.map((g) => `${g.title}(${g.type === 'daily' ? '日常' : '小目标'}${g.streak_count ? '，连续' + g.streak_count : ''})`).join('；') : '（无）'}`);

  const today = todayStr();
  const checkins = await db.all(
    "SELECT c.duration_min, g.title AS goal_title FROM check_ins c JOIN goals g ON g.id = c.goal_id WHERE c.user_id = ? AND c.check_date = ? AND c.status = 'credited'",
    [userId, today]
  );
  parts.push(`【今日打卡】${checkins.length ? checkins.map((c) => `${c.goal_title} ${c.duration_min}分钟`).join('；') : '（还没打）'}`);

  const diaries = await db.all(
    "SELECT diary_date, CASE WHEN user_edited <> '' THEN user_edited ELSE ai_original END AS content FROM diaries WHERE user_id = ? ORDER BY diary_date DESC LIMIT 3",
    [userId]
  );
  if (diaries.length) parts.push(`【最近日报】${diaries.map((d) => `${d.diary_date}：${String(d.content).slice(0, 150)}`).join('\n')}`);

  const usage = await db.all(
    'SELECT usage_date, ROUND(SUM(seconds)/60.0) AS minutes FROM usage_daily WHERE user_id = ? AND usage_date >= ? GROUP BY usage_date ORDER BY usage_date',
    [userId, addDaysStr(today, -6)]
  );
  if (usage.length) parts.push(`【近 7 天手机时长（分钟/天）】${usage.map((u) => `${u.usage_date}:${u.minutes}`).join(' ')}`);

  // 大目标快捷入口带该大目标上下文，不是空聊（1.6）
  if (bigGoalId) {
    const bg = await db.get('SELECT * FROM big_goals WHERE id = ? AND owner_id = ?', [Number(bigGoalId), userId]);
    if (bg) {
      const chain = await db.all(
        "SELECT title, planned_date, plan_status, status FROM goals WHERE big_goal_id = ? AND owner_id = ? AND status != 'archived' ORDER BY COALESCE(plan_order, 999999), id",
        [bg.id, userId]
      );
      parts.push(`【当前讨论的大目标】${bg.title}（${bg.progress}%）\n${bg.description}\n【链上小目标】${chain.map((g) => `${g.planned_date || '未排'} ${g.title}(${g.plan_status || '-'}/${g.status})`).join('；')}`);
    }
  }
  return parts.join('\n\n');
}

async function runChat({ db, userId, message, bigGoalId = null }) {
  const text = String(message || '').trim();
  if (!text) throw new Error('消息不能为空');

  const { session, messages: history } = await recentMessages(db, userId, 40);
  // 先落用户消息：即使后续 loop 失败，这句也不会从会话历史里消失（§11-6 已修）
  await appendMessage(db, userId, session.id, 'user', text,
    bigGoalId ? { entry: 'big_goal', big_goal_id: Number(bigGoalId) } : null);

  let result;
  try {
    const userContext = await buildUserContext(db, userId, bigGoalId);

    const system = `${PERSONA}

你在「我」页的聊天框里。下面是这位用户的实时数据（每次对话前刷新），回答尽量结合它，像了解他/她的朋友那样说话。
【主动记画像】对话里出现新的、明确的事实（能力、偏好、方向变化、重要事件、约束）时，主动用 patch_my_profile 更新画像：只改该改的块，每条必带 reason 和 evidence，拿不准就不改，别整段重写。改完在回复里用一句话带过。
【大目标与计划】用户明确想立一个长期方向时，用 create_big_goal 直接帮他建好，不用让他手动去点按钮；建之前先 list_big_goals 查是否已有同名的，重复就别再建、把已有的 id 告诉他。想读某个大目标或给它配小目标时，先 list_big_goals 拿 id → read_big_goal 看详情 → 再考虑 create_plan_goal。用户没明确要建 / 改时不要动，只给建议。
数据里没有的就直说没有，别编。回答简短：一般不超过 150 字，除非用户要详细展开。

${userContext}`;

    const convo = [
      { role: 'system', content: system },
      ...history.slice(-30).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];

    result = await runAgentLoop({
      db, userId, workflow: 'chat', action: 'chat_reply', messages: convo,
      idempotencyKey: null,
    });
  } catch (e) {
    // 失败也补一条 assistant 记录，保证对话成对、刷新后看得见
    const kind = (e && e.kind) || 'error';
    const friendly = kind === 'timeout'
      ? '这轮想太久断开了，可以再问一次。'
      : '这轮没答上来，可以再问一次。';
    await appendMessage(db, userId, session.id, 'assistant', `🐾 ${friendly}`, { failed: true, kind });
    // 可预期的 AI 错误降级为正常响应，避免前端拿到 500；意外错误继续抛出便于排查
    if (e instanceof ai.AiError) {
      return { reply: `🐾 ${friendly}`, sessionId: session.id, toolCalls: [], profileChanges: [], failed: true, reason: kind };
    }
    throw e;
  }

  // 画像变更：统一管线已写 profile_changes 留痕；这里只按 reportChanges 决定要不要把摘要送达用户
  const st = await getUserSettings(db, userId);
  const profileChanges = st.reportChanges
    ? result.toolLog
      .filter((t) => t.name === 'patch_my_profile' && t.result && t.result.ok && t.result.changes && t.result.changes.length)
      .map((t) => ({ summary: t.result.summary, changes: t.result.changes, changeId: t.result.changeId }))
    : [];

  // 用户消息已在前面落库；这里只落 assistant（meta 记工具调用/画像变更/降级，前端可展示）
  const assistantMeta = {
    ...(result.toolLog.length ? { tools: result.toolLog.map((t) => t.name) } : {}),
    ...(profileChanges.length ? { profileChanges: profileChanges.map((p) => p.summary) } : {}),
    ...(result.degraded ? { degraded: true, reason: result.reason } : {}),
  };
  await appendMessage(db, userId, session.id, 'assistant', result.content, Object.keys(assistantMeta).length ? assistantMeta : null);

  return {
    reply: result.content,
    sessionId: session.id,
    toolCalls: result.toolLog.map((t) => t.name),
    profileChanges,
    ...(result.degraded ? { degraded: true, reason: result.reason } : {}),
  };
}

module.exports = { runChat, buildUserContext };
