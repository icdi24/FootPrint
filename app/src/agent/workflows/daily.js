// agent/workflows/daily.js —— daily 日报工作流（P0 骨架；23:30 定时器 P2 挂到 index.js）
// 每晚 23:30 两人各一份，写 diaries；幂等：(user_id, diary_date) UNIQUE，重跑不生成第二份。
// 有重要信息顺带更新画像（补丁带 reason）。次日生成新日报不回改昨日。
const ai = require('../../ai');
const { PERSONA } = require('../persona');
const { executeTool, readProfileBaseline } = require('../tools');
const { runTurn } = require('../zoowy-turns');
const { currentRun } = require('../runtime-context');
const { todayStr, addDaysStr, nowIso } = require('../../tz');

async function runDaily({ db, userId, date }) {
  const day = isValidDateStr(date) ? date : todayStr();
  // 幂等闸：当天已有日报直接返回（服务重启后 23:35 的补跑也只会写一份）
  const exist = await db.get('SELECT * FROM diaries WHERE user_id = ? AND diary_date = ?', [userId, day]);
  if (exist) {
    await ai.recordSkip(db, { userId, workflow: 'daily', action: 'daily_dup', detail: JSON.stringify({ date: day }) });
    return { duplicate: true, diary: exist };
  }
  return runTurn(db, { userId, kind: 'background', requestId: `daily_${day}`,
    input: { action: 'daily', date: day } }, ({ signal, commit }) => prepareDaily(db, userId, day, signal, commit));
}

async function prepareDaily(db, userId, day, signal, commit) {

  // 拼当日数据：打卡、目标达成、大目标、最近画像、最近使用时长
  const checkins = await db.all(
    `SELECT c.check_date, c.duration_min, c.points, c.status, c.evidence_text, g.title AS goal_title
     FROM check_ins c JOIN goals g ON g.id = c.goal_id
     WHERE c.user_id = ? AND c.check_date >= ? ORDER BY c.check_date DESC LIMIT 50`,
    [userId, addDaysStr(day, -1)]
  );
  const achieved = await db.all(
    "SELECT title FROM goals WHERE owner_id = ? AND status = 'achieved' AND updated_at >= ? LIMIT 10",
    [userId, `${addDaysStr(day, -1)}T00:00:00Z`]
  );
  const bigGoals = await db.all(
    "SELECT title, progress, progress_note, progress_at FROM big_goals WHERE owner_id = ? AND status = 'active' ORDER BY id",
    [userId]
  );
  const profileBaseline = await readProfileBaseline(db, userId);
  const profileRows = profileBaseline.filter((p) => p.status === 'active');
  const usage = await db.all(
    'SELECT usage_date, ROUND(SUM(seconds)/60.0) AS minutes FROM usage_daily WHERE user_id = ? AND usage_date >= ? GROUP BY usage_date ORDER BY usage_date',
    [userId, addDaysStr(day, -6)]
  );

  const system = `${PERSONA}

现在是「日报」环节：给用户写今天（${day}）的日报。素材在用户消息里，缺的就不提，别编。
结构：一段今天干了什么（具体到目标名和数字）→ 一句亮点或提醒 → 一句明天最该做的一件事。
口吻是伙伴复盘，不是老师批作业。300–800 字。

同时判断：今天有没有值得写进画像的新信息（新能力、新偏好、重要事件）？有才给补丁，没有就空数组。

输出严格 JSON：
{
  "diary": "日报正文（markdown）",
  "profile_patches": [
    { "op": "add|update|delete", "block": "块名", "content": "新内容", "reason": "必填一句话", "evidence": "依据，如今天哪个打卡" }
  ]
}`;

  const userBlock = `【今天与前一天的打卡】${checkins.length ? checkins.map((c) => `${c.check_date} ${c.goal_title} ${c.duration_min}分钟${c.status === 'credited' ? '' : '(' + c.status + ')'}`).join('；') : '（今天还没打卡）'}
【今天达成的小目标】${achieved.length ? achieved.map((g) => g.title).join('；') : '（无）'}
【进行中的大目标】${bigGoals.length ? bigGoals.map((b) => `${b.title}（${b.progress}%，${b.progress_note || '无进度说明'}）`).join('；') : '（无）'}
【近 7 天手机使用时长（分钟/天）】${usage.length ? usage.map((u) => `${u.usage_date}:${u.minutes}`).join(' ') : '（未上报）'}
【用户画像】${profileRows.length ? profileRows.map((p) => `[${p.block}] ${p.content}`).join('\n') : '（暂无画像）'}`;

  const resp = await ai.chat(db, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userBlock },
    ],
    json: true,
    workflow: 'daily',
    action: 'daily_generate',
    userId,
    signal,
    idempotencyKey: `daily:${userId}:${day}`,
  });

  const out = resp.parsed || {};
  const diaryText = String(out.diary || '').trim();
  if (!diaryText) {
    // 不写库、不伪造
    await ai.recordCall(db, {
      userId, workflow: 'daily', action: 'daily_generate', status: 'fail',
      detail: JSON.stringify({ reason: 'empty_diary', date: day }),
    });
    throw new ai.AiError('AI 没给出日报正文，本次不写库', { kind: 'bad_json' });
  }

  return commit(async (c) => {
    const exist = await c.get('SELECT id FROM diaries WHERE user_id=? AND diary_date=?', [userId, day]);
    if (exist) return { duplicate: true, diary: exist };
    const writeResult = await executeTool(c, 'daily', userId, 'write_my_diary', { content: diaryText });
    if (!writeResult.ok) throw new Error(writeResult.error);
    const results = { diary: writeResult };
    if (Array.isArray(out.profile_patches) && out.profile_patches.length) {
      results.profile = await executeTool(c, 'daily', userId, 'patch_my_profile', { patches: out.profile_patches }, { profileBaseline });
    }
    currentRun().report.committedChanges.push({ operation: 'write_my_diary', recordIds: [writeResult.diary_id], authorization: 'daily_enabled' });
    if (results.profile?.changes?.length) currentRun().report.committedChanges.push({ operation: 'patch_my_profile',
      recordIds: [results.profile.changeId], authorization: 'daily_enabled' });
    return { ...results, profileConflict: Boolean(results.profile?.conflicts?.length) };
  });
}

// 23:30 定时（照抄 backup.js 的 setInterval 轮询模式，不引 cron）。
// 到点给每个用户跑一份；服务重启后当天补跑（runDaily 幂等，已有就跳过）。P2 挂到 index.js。
function scheduleDaily(db, listUsers) {
  let firedDate = '';
  let countDate = '';
  let dayCount = 0;
  const tick = async () => {
    try {
      const now = new Date(Date.now() + 8 * 3600 * 1000);
      const h = now.getUTCHours();
      const m = now.getUTCMinutes();
      const today = now.toISOString().slice(0, 10);
      if (h === 23 && m >= 30 && m < 40 && firedDate !== today) {
        firedDate = today;
        if (countDate !== today) { countDate = today; dayCount = 0; }
        const limit = Number(process.env.AI_DAILY_LIMIT || 50);
        const users = await listUsers();
        for (const u of users) {
          try {
            const st = await db.get('SELECT daily_enabled FROM user_settings WHERE user_id = ?', [u.id]);
            if (!st || !Number(st.daily_enabled)) continue; // 默认关，用户自行开启
            if (dayCount >= limit) {
              await ai.recordCall(db, {
                userId: u.id, workflow: 'daily', action: 'daily_limit', status: 'skip',
                detail: JSON.stringify({ limit, date: today }),
              });
              break;
            }
            dayCount += 1;
            await runDaily({ db, userId: u.id, date: today });
          } catch (e) {
            await ai.recordCall(db, {
              userId: u.id, workflow: 'daily', action: 'daily_schedule', status: 'fail',
              detail: JSON.stringify({ error: String(e.message) }),
            });
          }
        }
      }
    } catch (e) { /* 忽略调度错误 */ }
  };
  setInterval(tick, 5 * 60 * 1000);
  tick();
}

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00Z').getTime());
}

module.exports = { runDaily, scheduleDaily };
