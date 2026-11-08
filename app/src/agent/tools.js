// agent/tools.js —— 工具注册表与白名单（P0-4）
// 铁律（待办计划 1.8）：
//  1. 绝不注册：验收通过/驳回、删目标、改积分、改昵称口令、改任何对方数据 —— 这里根本没有这些工具
//  2. 所有 SQL 强制 owner_id / user_id = ctx.userId；userId 由服务端会话注入，工具参数里不存在这个字段
//  3. 写工具全部幂等（idempotency_key / 查重 / UNIQUE 约束），防重复建目标、防日报重跑两份
//  4. 每个工作流只拿到白名单内的工具（WHITELIST）
const { nowIso, todayStr, addDaysStr } = require('../tz');
const { getPoints } = require('../points');
const { recordChange } = require('../profileChanges');

// ---------- 小工具 ----------
function clampInt(v, min, max, dft) {
  const n = Number(v);
  if (!Number.isInteger(n)) return dft;
  return Math.max(min, Math.min(max, n));
}

function ok(data) { return { ok: true, ...data }; }
function fail(msg) { return { ok: false, error: String(msg) }; }

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00Z').getTime());
}

// 计划链快照：手改与 AI 重排共用同一套链路（1.2），每次写库后存一份
async function snapshotPlan(db, bigGoalId, source, reason) {
  const bg = await db.get('SELECT * FROM big_goals WHERE id = ?', [bigGoalId]);
  if (!bg) return;
  const chain = await db.all(
    `SELECT id, title, emoji, description, accept_criteria, planned_date, plan_order, plan_status, status
     FROM goals WHERE big_goal_id = ? ORDER BY COALESCE(plan_order, 999999), id`,
    [bigGoalId]
  );
  await db.run(
    'INSERT INTO plan_versions (big_goal_id, owner_id, snapshot, source, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [bigGoalId, bg.owner_id, JSON.stringify({ big_goal: { id: bg.id, title: bg.title, progress: bg.progress }, chain }), source || 'ai', reason || '', nowIso()]
  );
}

// 画像快照 + 块级补丁（1.7）：add/update/delete 必带 reason；delete 只标失效不物理删。
// 服务端裁决（不盲信模型）：内容没变就跳过；只有真的产生变更才写版本快照 + 变更留痕。
// 返回 { applied, changes, summary, reported, changeId, versionId }，供「改完告诉用户改了什么」。
async function applyProfilePatch(db, userId, patches, source, meta = {}) {
  if (!Array.isArray(patches) || !patches.length) return fail('patches 需为非空数组');
  if (patches.length > 8) return fail('一次最多 8 条补丁');
  const results = [];
  const changes = [];
  const current = await db.all(
    "SELECT block, content, source, status FROM user_profiles WHERE user_id = ? ORDER BY block", [userId]
  );
  const before = new Map(current.map((r) => [r.block, r]));
  let versionId = null;

  // 懒写快照：只有第一条真实变更才落 profile_versions，避免「模型说要改、其实没变」的版本噪音
  async function ensureVersion() {
    if (versionId !== null) return versionId;
    const info = await db.run(
      'INSERT INTO profile_versions (user_id, snapshot, changed_by, reason, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [userId, JSON.stringify(current), source || 'ai', `patch:${patches.length}`, nowIso()]
    );
    versionId = Number(info.id);
    return versionId;
  }

  for (const p of patches) {
    const block = String(p && p.block || '').trim();
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(block)) { results.push({ block, skipped: '块名不合法' }); continue; }
    if (!p.reason || !String(p.reason).trim()) { results.push({ block, skipped: '缺 reason，拒绝执行' }); continue; }
    const reason = String(p.reason).slice(0, 120);
    const evidence = String(p.evidence || '').slice(0, 200);
    const existing = before.get(block);

    if (p.op === 'delete') {
      const row = await db.get('SELECT id FROM user_profiles WHERE user_id = ? AND block = ?', [userId, block]);
      if (!row) { results.push({ block, skipped: '块不存在' }); continue; }
      await ensureVersion();
      await db.run("UPDATE user_profiles SET status = 'void', updated_at = ? WHERE user_id = ? AND block = ?",
        [nowIso(), userId, block]);
      results.push({ block, op: 'delete', note: '已标失效（不物理删）' });
      changes.push({ op: 'delete', block, reason, evidence, before: existing ? existing.content : '', after: '' });
      continue;
    }
    if (p.op !== 'add' && p.op !== 'update') { results.push({ block, skipped: 'op 需为 add/update/delete' }); continue; }
    const content = String(p.content || '').trim();
    if (!content) { results.push({ block, skipped: 'content 为空' }); continue; }
    if (content.length > 4000) { results.push({ block, skipped: '单块超过 4000 字' }); continue; }
    // 模型说了不算：与现有 active 内容一致就不写、不记版本、不告诉用户
    if (existing && existing.status === 'active' && existing.content === content) {
      results.push({ block, skipped: '内容无变化，已跳过' });
      continue;
    }
    await ensureVersion();
    await db.run(
      `INSERT INTO user_profiles (user_id, block, content, source, status, updated_at) VALUES (?, ?, ?, ?, 'active', ?)
       ON CONFLICT (user_id, block) DO UPDATE SET content = EXCLUDED.content, source = EXCLUDED.source, status = 'active', updated_at = EXCLUDED.updated_at`,
      [userId, block, content, source || 'ai', nowIso()]
    );
    const op = !existing || existing.status !== 'active' ? 'add' : 'update';
    results.push({ block, op, note: reason });
    changes.push({ op, block, reason, evidence, before: existing ? existing.content : '', after: content });
  }

  const out = { applied: results, changes };
  if (!changes.length) {
    out.summary = '';
    out.note = '无实质变化，已跳过（未写库、未存快照、未记变更）';
    return ok(out);
  }
  // 留痕无条件写；reportChanges 只决定推送 / 未读，不决定留不留痕
  const rec = await recordChange(db, {
    userId, workflow: meta.workflow || source || 'ai', changes, versionId,
  });
  out.summary = rec ? rec.summary : '';
  out.reported = rec ? rec.reported : true;
  out.changeId = rec ? rec.id : null;
  out.versionId = versionId;
  return ok(out);
}

// ---------- 工具实现 ----------
// ctx: { db, userId } —— userId 服务端注入；args 是模型给的参数
const IMPLEMENTATIONS = {
  // ===== 读 =====
  read_my_profile: {
    desc: '读自己的个人画像（分块：basic/resume/skills/goal_progress/important 等），用于了解用户情况',
    readOnly: true,
    params: { type: 'object', properties: {}, required: [] },
    async run(ctx) {
      const rows = await ctx.db.all(
        "SELECT block, content, source, status, updated_at FROM user_profiles WHERE user_id = ? ORDER BY block",
        [ctx.userId]
      );
      return ok({ blocks: rows });
    },
  },

  read_my_goals: {
    desc: '列自己的目标。query.big_goal_id 传了就只看该大目标计划链上的小目标；query.type 可选 daily/stage',
    readOnly: true,
    params: {
      type: 'object',
      properties: {
        big_goal_id: { type: 'integer', description: '大目标 id，只列它链上的小目标' },
        type: { type: 'string', enum: ['daily', 'stage'] },
      },
      required: [],
    },
    async run(ctx, args) {
      const q = args || {};
      const params = [ctx.userId];
      let where = 'owner_id = ?';
      if (q.big_goal_id) { where += ' AND big_goal_id = ?'; params.push(Number(q.big_goal_id)); }
      if (q.type === 'daily' || q.type === 'stage') { where += ` AND type = '${q.type}'`; }
      const rows = await ctx.db.all(
        `SELECT id, type, title, emoji, description, status, big_goal_id, planned_date, plan_order, plan_status,
                accept_criteria, est_total_min, difficulty, start_date, end_date, streak_count
         FROM goals WHERE ${where} AND status != 'archived' ORDER BY id DESC LIMIT 100`,
        params
      );
      return ok({ goals: rows });
    },
  },

  read_big_goal: {
    desc: '读自己的某个大目标（需先由 list_big_goals 拿 id）：描述、AI 进度、客观计数 done/total、链上全部小目标（含未启动的）',
    readOnly: true,
    params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    async run(ctx, args) {
      const bg = await ctx.db.get('SELECT * FROM big_goals WHERE id = ? AND owner_id = ?', [Number(args.id), ctx.userId]);
      if (!bg) return fail('大目标不存在或不是你的');
      const chain = await ctx.db.all(
        `SELECT id, title, emoji, description, accept_criteria, planned_date, plan_order, plan_status, status
         FROM goals WHERE big_goal_id = ? ORDER BY COALESCE(plan_order, 999999), id`,
        [bg.id]
      );
      const done = chain.filter((g) => g.status === 'achieved').length;
      return ok({ big_goal: bg, chain, done, total: chain.length });
    },
  },

  list_big_goals: {
    desc: '列出自己的全部大目标（id、标题、描述、AI 进度、客观 done/total、状态）。想读某个大目标详情或给它加小目标前，先用这个拿 id',
    readOnly: true,
    params: { type: 'object', properties: {}, required: [] },
    async run(ctx) {
      const rows = await ctx.db.all(
        `SELECT b.id, b.title, b.emoji, b.description, b.progress, b.progress_note, b.status, b.created_at,
                (SELECT COUNT(*) FROM goals g WHERE g.big_goal_id = b.id AND g.owner_id = ? AND g.status != 'archived') AS total,
                (SELECT COUNT(*) FROM goals g WHERE g.big_goal_id = b.id AND g.owner_id = ? AND g.status = 'achieved') AS done
         FROM big_goals b WHERE b.owner_id = ? AND b.status != 'archived'
         ORDER BY b.id DESC LIMIT 50`,
        [ctx.userId, ctx.userId, ctx.userId]
      );
      return ok({
        bigGoals: rows.map((r) => ({
          id: Number(r.id), title: r.title, emoji: r.emoji, description: r.description,
          progress: Number(r.progress), progressNote: r.progress_note, status: r.status,
          done: Number(r.done), total: Number(r.total), createdAt: r.created_at,
        })),
      });
    },
  },

  read_checkins: {
    desc: '读自己某段时间的打卡记录（含积分与时长）。days 默认 1（今天）',
    readOnly: true,
    params: {
      type: 'object',
      properties: { days: { type: 'integer', description: '往回看几天，1–31' } },
      required: [],
    },
    async run(ctx, args) {
      const days = clampInt(args && args.days, 1, 31, 1);
      const from = addDaysStr(todayStr(), -(days - 1));
      const rows = await ctx.db.all(
        `SELECT c.check_date, c.duration_min, c.points, c.status, c.evidence_text, g.title AS goal_title
         FROM check_ins c JOIN goals g ON g.id = c.goal_id
         WHERE c.user_id = ? AND c.check_date >= ? ORDER BY c.check_date DESC, c.id DESC LIMIT 200`,
        [ctx.userId, from]
      );
      return ok({ from, checkins: rows });
    },
  },

  read_my_diaries: {
    desc: '读自己最近几天的 AI 日报（展示版：用户改过用改后版）',
    readOnly: true,
    params: {
      type: 'object',
      properties: { days: { type: 'integer', description: '往回看几天，1–14' } },
      required: [],
    },
    async run(ctx, args) {
      const days = clampInt(args && args.days, 1, 14, 3);
      const from = addDaysStr(todayStr(), -(days - 1));
      const rows = await ctx.db.all(
        `SELECT diary_date, CASE WHEN user_edited <> '' THEN user_edited ELSE ai_original END AS content
         FROM diaries WHERE user_id = ? AND diary_date >= ? ORDER BY diary_date DESC`,
        [ctx.userId, from]
      );
      return ok({ from, diaries: rows });
    },
  },

  read_my_usage: {
    desc: '读自己最近几天的手机使用时长（按天汇总，分钟）',
    readOnly: true,
    params: {
      type: 'object',
      properties: { days: { type: 'integer', description: '往回看几天，1–14' } },
      required: [],
    },
    async run(ctx, args) {
      const days = clampInt(args && args.days, 1, 14, 7);
      const from = addDaysStr(todayStr(), -(days - 1));
      const rows = await ctx.db.all(
        `SELECT usage_date, ROUND(SUM(seconds) / 60.0) AS minutes FROM usage_daily
         WHERE user_id = ? AND usage_date >= ? GROUP BY usage_date ORDER BY usage_date`,
        [ctx.userId, from]
      );
      return ok({ from, usage: rows });
    },
  },

  // ===== 写 =====
  create_big_goal: {
    desc: '给自己创建一个大目标（长期方向，不能直接打卡）。用户明确要立目标时才用；建之前先用 list_big_goals 查是否已有同名的。幂等：同名且未归档的不重复建',
    readOnly: false,
    params: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '大目标名称，1–40 字' },
        description: { type: 'string', description: '描述 / 现状 / 重点，≤500 字' },
        deadline: { type: 'string', description: '可选截止日期 YYYY-MM-DD；当前大目标没有独立截止字段，会写进描述末尾' },
        emoji: { type: 'string' },
      },
      required: ['title'],
    },
    async run(ctx, args) {
      const b = args || {};
      const title = String(b.title || '').trim();
      if (!title || title.length > 40) return fail('名称需为 1–40 字');
      let desc = String(b.description || '').trim().slice(0, 500);
      const deadline = String(b.deadline || '').trim();
      if (deadline) {
        if (!isValidDate(deadline)) return fail('deadline 需为 YYYY-MM-DD');
        // 大目标表暂无独立截止列，把日期落到描述末尾，信息不丢
        const tag = `【截止】${deadline}`;
        if (!desc.includes(deadline)) {
          desc = (desc ? desc.slice(0, Math.max(0, 500 - tag.length - 1)) + '\n' : '') + tag;
        }
      }
      // 幂等：同名未归档的大目标不重复建（防 loop 里模型反复调用）
      const dup = await ctx.db.get(
        "SELECT id, title FROM big_goals WHERE owner_id = ? AND title = ? AND status != 'archived' LIMIT 1",
        [ctx.userId, title]
      );
      if (dup) return ok({ big_goal_id: Number(dup.id), duplicate: true, note: '已存在同名大目标，未重复创建' });
      const info = await ctx.db.run(
        `INSERT INTO big_goals (owner_id, title, emoji, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [ctx.userId, title, String(b.emoji || '🏔️').slice(0, 8), desc, nowIso(), nowIso()]
      );
      return ok({
        big_goal_id: Number(info.id), title, description: desc,
        deadlineStoredInDescription: Boolean(deadline),
      });
    },
  },

  create_plan_goal: {
    desc: '在大目标计划链上创建一个小目标（未启动状态，不会出现在首页）。幂等：同大目标下同名同日期不会重复建',
    readOnly: false,
    params: {
      type: 'object',
      properties: {
        big_goal_id: { type: 'integer' },
        title: { type: 'string', description: '1–30 字' },
        planned_date: { type: 'string', description: '计划日期 YYYY-MM-DD' },
        plan_order: { type: 'integer', description: '在链上的顺序，从 1 开始' },
        accept_criteria: { type: 'string', description: '验收标准，必填，≤500 字' },
        description: { type: 'string', description: '补充说明，可空' },
        est_total_min: { type: 'integer', description: '预估总时长（分钟），默认 600' },
        difficulty: { type: 'integer', description: '难度 1–5，默认 3' },
        emoji: { type: 'string' },
      },
      required: ['big_goal_id', 'title', 'planned_date', 'accept_criteria'],
    },
    async run(ctx, args) {
      const b = args || {};
      const bg = await ctx.db.get('SELECT * FROM big_goals WHERE id = ? AND owner_id = ?', [Number(b.big_goal_id), ctx.userId]);
      if (!bg) return fail('大目标不存在或不是你的');
      const title = String(b.title || '').trim();
      const planned = String(b.planned_date || '');
      const criteria = String(b.accept_criteria || '').trim();
      if (!title || title.length > 30) return fail('名称需为 1–30 字');
      if (!isValidDate(planned)) return fail('planned_date 需为 YYYY-MM-DD');
      if (!criteria) return fail('小目标必须写清验收标准');
      if (criteria.length > 500) return fail('验收标准不能超过 500 字');
      // 幂等：同链同标题同日期已存在（未删）就不重复建
      const dup = await ctx.db.get(
        "SELECT id FROM goals WHERE big_goal_id = ? AND owner_id = ? AND title = ? AND planned_date = ? AND status != 'archived'",
        [bg.id, ctx.userId, title, planned]
      );
      if (dup) return ok({ goal_id: dup.id, duplicate: true, note: '已存在，未重复创建' });

      const difficulty = clampInt(b.difficulty, 1, 5, 3);
      const estTotalMin = clampInt(b.est_total_min, 1, 100000, 600);
      const cfg = await getPoints(ctx.db);
      const autoTotal = Math.min(Math.round(estTotalMin * cfg.unit * (cfg.difficulty[difficulty] || 1.5)), 1200);
      const info = await ctx.db.run(
        `INSERT INTO goals (owner_id, type, title, emoji, description, freq_mode, duration_min, difficulty,
           start_date, status, est_total_min, accept_criteria, total_points,
           big_goal_id, planned_date, plan_order, plan_status, created_at, updated_at)
         VALUES (?, 'stage', ?, ?, ?, 'daily', 30, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, 'planned', ?, ?) RETURNING id`,
        [ctx.userId, title, String(b.emoji || '🎯').slice(0, 8), String(b.description || '').trim().slice(0, 200),
          difficulty, planned, estTotalMin, criteria, autoTotal,
          bg.id, planned, clampInt(b.plan_order, 1, 999, null), nowIso(), nowIso()]
      );
      await snapshotPlan(ctx.db, bg.id, 'ai', `create_plan_goal:${title}`);
      return ok({ goal_id: Number(info.id), plan_status: 'planned' });
    },
  },

  shift_plan_dates: {
    desc: '把大目标计划链上某日期起「未启动」的小目标整体顺延/提前 N 天。只动 plan_status=planned 的，进行中/待验收/已达成锁死',
    readOnly: false,
    params: {
      type: 'object',
      properties: {
        big_goal_id: { type: 'integer' },
        from_date: { type: 'string', description: '从哪天开始挪 YYYY-MM-DD' },
        days: { type: 'integer', description: '顺延天数，可为负（提前）' },
      },
      required: ['big_goal_id', 'from_date', 'days'],
    },
    async run(ctx, args) {
      const b = args || {};
      const bg = await ctx.db.get('SELECT * FROM big_goals WHERE id = ? AND owner_id = ?', [Number(b.big_goal_id), ctx.userId]);
      if (!bg) return fail('大目标不存在或不是你的');
      if (!isValidDate(String(b.from_date))) return fail('from_date 需为 YYYY-MM-DD');
      const days = clampInt(b.days, -365, 365, null);
      if (days === null || days === 0) return fail('days 需为非零整数（-365 到 365）');
      const rows = await ctx.db.all(
        "SELECT id, planned_date FROM goals WHERE big_goal_id = ? AND owner_id = ? AND plan_status = 'planned' AND planned_date >= ?",
        [bg.id, ctx.userId, String(b.from_date)]
      );
      for (const g of rows) {
        await ctx.db.run('UPDATE goals SET planned_date = ?, updated_at = ? WHERE id = ?',
          [addDaysStr(g.planned_date, days), nowIso(), g.id]);
      }
      await snapshotPlan(ctx.db, bg.id, 'ai', `shift:${b.from_date}:${days}d`);
      return ok({ moved: rows.length, days });
    },
  },

  write_big_goal_progress: {
    desc: '写自己大目标的 AI 进度（0–100）与进度说明。客观 done/total 由系统另行维护，不用你写',
    readOnly: false,
    params: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        progress: { type: 'integer', description: '0–100' },
        note: { type: 'string', description: '进度说明：为什么是这个值，一两句' },
      },
      required: ['id', 'progress', 'note'],
    },
    async run(ctx, args) {
      const b = args || {};
      const bg = await ctx.db.get('SELECT * FROM big_goals WHERE id = ? AND owner_id = ?', [Number(b.id), ctx.userId]);
      if (!bg) return fail('大目标不存在或不是你的');
      const progress = clampInt(b.progress, 0, 100, null);
      if (progress === null) return fail('progress 需为 0–100 整数');
      const note = String(b.note || '').trim().slice(0, 500);
      if (!note) return fail('note 不能为空');
      const doneRow = await ctx.db.get(
        "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'achieved') AS done FROM goals WHERE big_goal_id = ? AND owner_id = ?",
        [bg.id, ctx.userId]
      );
      await ctx.db.run(
        'UPDATE big_goals SET progress = ?, progress_note = ?, progress_at = ?, updated_at = ? WHERE id = ?',
        [progress, note, nowIso(), nowIso(), bg.id]
      );
      return ok({ progress, objective: { done: Number(doneRow.done), total: Number(doneRow.total) } });
    },
  },

  write_my_diary: {
    desc: '写今天的 AI 日报（只能写当天，重跑不会生成第二份）。内容含：目标完成情况、亮点、建议，口吻是监督伙伴',
    readOnly: false,
    params: {
      type: 'object',
      properties: { content: { type: 'string', description: '日报正文，markdown，≤3000 字' } },
      required: ['content'],
    },
    async run(ctx, args) {
      const content = String(args && args.content || '').trim();
      if (!content) return fail('日报内容不能为空');
      if (content.length > 3000) return fail('日报超过 3000 字');
      const date = todayStr();
      // 幂等：UNIQUE(user_id, diary_date)，已有当天日报就不写（不覆盖）
      const dup = await ctx.db.get('SELECT id FROM diaries WHERE user_id = ? AND diary_date = ?', [ctx.userId, date]);
      if (dup) return ok({ diary_id: dup.id, duplicate: true, note: '当天日报已存在，未重复生成' });
      const info = await ctx.db.run(
        "INSERT INTO diaries (user_id, diary_date, ai_original, user_edited, shared, created_at, updated_at) VALUES (?, ?, ?, '', 0, ?, ?) RETURNING id",
        [ctx.userId, date, content, nowIso(), nowIso()]
      );
      return ok({ diary_id: Number(info.id), date });
    },
  },

  patch_my_profile: {
    desc: '给自己的画像打块级补丁。只改该改的块，其余块原样保留。每条必须带 reason（改它的依据）；delete 只标失效不物理删。优先级：用户对话最新表述 > 用户手改 > AI 推断，拿不准就别改',
    readOnly: false,
    params: {
      type: 'object',
      properties: {
        patches: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['add', 'update', 'delete'] },
              block: { type: 'string', description: '块名：basic/resume/skills/goal_progress/important 或自定义小写英文' },
              content: { type: 'string', description: 'add/update 时的完整新内容' },
              reason: { type: 'string', description: '必填：为什么改，一句话' },
              evidence: { type: 'string', description: '依据：来自哪次打卡/对话/日报' },
            },
            required: ['op', 'block', 'reason'],
          },
        },
      },
      required: ['patches'],
    },
    async run(ctx, args) {
      return applyProfilePatch(ctx.db, ctx.userId, args && args.patches, 'ai', { workflow: ctx.workflow });
    },
  },
};

// ---------- 白名单（待办计划 1.8：按工作流最小授权）----------
const WHITELIST = {
  plan: ['read_my_profile', 'read_big_goal', 'read_my_goals', 'create_plan_goal', 'shift_plan_dates', 'patch_my_profile'],
  progress: ['read_my_goals', 'read_big_goal', 'read_checkins', 'write_big_goal_progress', 'patch_my_profile'],
  daily: ['read_my_goals', 'read_big_goal', 'read_checkins', 'read_my_profile', 'read_my_usage', 'read_my_diaries', 'write_my_diary', 'patch_my_profile'],
  // chat 保留调用能力，但同一套白名单机制：读全 + 大目标/计划/画像写；不给写日报/写进度（防伪造）
  chat: ['read_my_profile', 'read_my_goals', 'read_big_goal', 'list_big_goals', 'read_checkins', 'read_my_usage', 'read_my_diaries', 'create_big_goal', 'create_plan_goal', 'shift_plan_dates', 'patch_my_profile'],
};

// 工具名 → OpenAI tools 格式
function toolsFor(workflow) {
  const names = WHITELIST[workflow] || [];
  return names
    .filter((n) => IMPLEMENTATIONS[n])
    .map((n) => ({
      type: 'function',
      function: { name: n, description: IMPLEMENTATIONS[n].desc, parameters: IMPLEMENTATIONS[n].params },
    }));
}

// 执行一个工具调用：白名单外的一律拒绝（注册表里压根没有验收/删目标/改积分这类工具）
async function executeTool(db, workflow, userId, name, args) {
  const names = WHITELIST[workflow] || [];
  if (!names.includes(name) || !IMPLEMENTATIONS[name]) {
    return fail(`无权调用「${name}」：不在 ${workflow} 工作流白名单内`);
  }
  try {
    return await IMPLEMENTATIONS[name].run({ db, userId, workflow }, args || {});
  } catch (e) {
    return fail(`工具执行出错：${e.message}`);
  }
}

module.exports = { IMPLEMENTATIONS, WHITELIST, toolsFor, executeTool, applyProfilePatch, snapshotPlan };
