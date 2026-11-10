// 演示数据补充（第二批）：给栗子(1)/阿白(2)追加更丰富的数据。
// 只追加不清理；重复执行通过「防重标记」跳过（查 big_goals 现有标题 / zoowy 会话 / 画像块）。
// 用法（容器内）：node scripts/seed-lizi-abai-extra.js
const OFF = 8 * 3600 * 1000;

function shDate(offsetDays) {
  return new Date(Date.now() + OFF - offsetDays * 86400000).toISOString().slice(0, 10);
}
function isoDaysAgo(days, h = 20, m = 0) {
  const t = Date.now() - days * 86400000;
  const d = new Date(t + OFF);
  d.setUTCHours(h - 8, m, 0, 0);
  return d.toISOString();
}

const DEFAULT_POINTS = {
  unit: 0.5, cap: 60, maxPer: 300,
  difficulty: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.2 },
};

async function main() {
  const { openDb } = require('../src/db');
  const db = await openDb(process.env.DATABASE_URL);
  const now = new Date().toISOString();

  // ============ A. 阿白的大目标 + 计划链（跑完半程马拉松）============
  const abaiBig = await db.get(`SELECT id FROM big_goals WHERE owner_id = 2 AND title = '跑完半程马拉松'`);
  if (!abaiBig) {
    const bigInfo = await db.run(
      `INSERT INTO big_goals (owner_id, title, emoji, description, progress, progress_note, progress_at, status, created_at, updated_at)
       VALUES (2, '跑完半程马拉松', '🏅', '明年 4 月的城市半马（21.0975 km），从零基础跑步开始', 20, '能连续跑 8 km 了，配速 6 分 40，膝盖无不适', ?, 'active', ?, ?) RETURNING id`,
      [isoDaysAgo(5, 21, 0), isoDaysAgo(25), now]
    );
    const bigId = Number(bigInfo.id);
    await db.run(
      `INSERT INTO plan_versions (big_goal_id, owner_id, snapshot, source, reason, created_at)
       VALUES (?, 2, ?, 'user', '演示计划链初始化', ?)`,
      [bigId, JSON.stringify({ note: '演示计划链：阿白半马' }), now]
    );

    const stages = [
      { key: 's1', title: '连续跑步 5 公里', emoji: '🏃', criteria: '不停歇连续跑完 5 公里', est: 720, pts: 250, status: 'achieved', plan: 'done', pd: 12, order: 1, doneDays: 10 },
      { key: 's2', title: '连续跑步 10 公里', emoji: '💪', criteria: '不停歇连续跑完 10 公里', est: 1080, pts: 350, status: 'reviewing', plan: 'active', pd: 0, order: 2, doneDays: 0 },
      { key: 's3', title: '月跑量 80 公里', emoji: '📊', criteria: 'Keep 月报截图 80 km', est: 1500, pts: 450, status: 'active', plan: 'active', pd: 5, order: 3, doneDays: 0 },
      { key: 's4', title: '完成一次 15 公里长距离', emoji: '🛣️', criteria: '15 公里长距离跑完且配速不崩', est: 1800, pts: 550, status: 'draft', plan: 'draft', pd: 8, order: 4, doneDays: 0 },
    ];
    const stageIds = {};
    for (const s of stages) {
      const info = await db.run(
        `INSERT INTO goals (owner_id, type, title, emoji, description, freq_mode, freq_n, weekdays,
          window_start, window_end, duration_min, difficulty, start_date, end_date, status, streak_count, streak_best,
          est_total_min, accept_criteria, total_points, big_goal_id, planned_date, plan_order, plan_status, created_at, updated_at)
         VALUES (2, 'stage', ?, ?, ?, 'daily', 1, '', NULL, NULL, 45, 3, ?, NULL, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [s.title, s.emoji, s.criteria, shDate(25), s.status, s.est, s.criteria, s.pts, bigId, shDate(s.pd), s.order, s.plan, now, now]
      );
      stageIds[s.key] = Number(info.id);
    }

    // 已达成：验收记录 + stage_credit 流水（阿白余额要同步加）
    await db.run(
      `INSERT INTO verifications (goal_id, submitter_id, reviewer_id, submit_count, evidence_text, evidence_ids, self_statement, status, reason, created_at, decided_at)
       VALUES (?, 2, 1, 1, 'Keep 轨迹截图：5.32 km 不停歇', '', '跑下来没什么压力，配速 6 分 50', 'approved', '', ?, ?)`,
      [stageIds.s1, isoDaysAgo(10, 20, 30), isoDaysAgo(10, 20, 40)]
    );
    await db.run(
      `INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at)
       VALUES (2, 250, ?, 'stage_credit', 'verification', (SELECT max(id) FROM verifications), '小目标「连续跑步 5 公里」达成', ?)`,
      [Number((await db.get(`SELECT COALESCE(SUM(delta), 0) AS bal FROM point_ledger WHERE user_id = 2`)).bal) + 250, isoDaysAgo(10, 20, 40)]
    );
    await db.run(`UPDATE big_goals SET progress = 20 WHERE id = ?`, [bigId]);

    // 待验收：10 公里已提交，等栗子处理
    await db.run(
      `INSERT INTO verifications (goal_id, submitter_id, reviewer_id, submit_count, evidence_text, evidence_ids, self_statement, status, reason, created_at, decided_at)
       VALUES (?, 2, 1, 1, 'Keep 轨迹截图：10.18 km，用时 68 分钟', '', '配速稳住了，请验收！', 'pending', '', ?, NULL)`,
      [stageIds.s2, isoDaysAgo(0, 18, 30)]
    );

    console.log('A. 阿白大目标+计划链：完成（4 阶段，1 达成 / 1 待栗子验收）');
  } else {
    console.log('A. 阿白大目标已存在，跳过');
  }

  // ============ B. zoowy 聊天记录（两人各 3 条，有会话）============
  for (const uid of [1, 2]) {
    let sess = await db.get(`SELECT id FROM zoowy_sessions WHERE user_id = ?`, [uid]);
    if (!sess) {
      const info = await db.run(
        `INSERT INTO zoowy_sessions (user_id, title, created_at, updated_at) VALUES (?, 'zoowy', ?, ?) RETURNING id`,
        [uid, isoDaysAgo(3, 21, 0), isoDaysAgo(3, 21, 5)]
      );
      sess = { id: Number(info.id) };
    }
    const has = await db.get(`SELECT count(*) AS c FROM zoowy_messages WHERE session_id = ?`, [sess.id]);
    if (Number(has.c) > 0) { console.log(`B. zoowy 会话 uid=${uid} 已有消息，跳过`); continue; }

    const chat = uid === 1 ? [
      ['user', '我最近总是熬夜，早睡老是断，怎么办？', isoDaysAgo(3, 21, 0)],
      ['assistant', '看了下你的打卡：早睡这个目标过去 17 天断了 4 次，都断在周五和周六。规律是「周末社交打乱节奏」。两个建议：① 周五周六把打卡窗口放宽到 24:00，先保住「不漏」；② 睡前 30 分钟把手机放到客厅充电，你可是给自己定了 22:30 的窗口。要不要我把早睡的窗口改到 24:00？', isoDaysAgo(3, 21, 1)],
      ['user', '可以，先这么试试', isoDaysAgo(3, 21, 3)],
    ] : [
      ['user', '跑步这周完成了 2 次，还差 1 次，但明天要加班', isoDaysAgo(2, 21, 0)],
      ['assistant', '你的周目标是每周 3 次，现在 2/3。好消息是周四早晨你历来完成率最高（过去 4 周周四全勤）。建议：明天早起 40 分钟跑个 4 公里短途，不用追求距离，保住次数就行。跑量 goal 我帮你记着呢。', isoDaysAgo(2, 21, 1)],
      ['user', '好，明早叫醒我', isoDaysAgo(2, 21, 4)],
    ];
    for (const [role, content, ts] of chat) {
      await db.run(
        `INSERT INTO zoowy_messages (session_id, user_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, '', ?)`,
        [sess.id, uid, role, content, ts]
      );
    }
    await db.run(`UPDATE zoowy_sessions SET updated_at = ? WHERE id = ?`, [isoDaysAgo(3, 21, 5), sess.id]);
    console.log(`B. zoowy 会话 uid=${uid}：3 条消息`);
  }

  // ============ C. 互享画像（「我们」页可见）============
  const profiles = [
    [1, 'basic', '栗子，程序员，坐标杭州。养了一只叫「包子」的橘猫。', 1],
    [1, 'skills', '会弹一点钢琴（拜厄水平）；正在学日语，目标 N2。', 1],
    [2, 'basic', '阿白，设计师，早睡早起践行者。跑步新人，从 3 公里一路加到 10 公里。', 1],
    [2, 'skills', 'Keep 记录习惯保持中；会做一桌好菜，负责两人的周末伙食。', 1],
  ];
  for (const [uid, block, content, shared] of profiles) {
    await db.run(
      `INSERT INTO user_profiles (user_id, block, content, source, status, shared, updated_at)
       VALUES (?, ?, ?, 'user', 'active', ?, ?) ON CONFLICT (user_id, block) DO NOTHING`,
      [uid, block, content, shared, isoDaysAgo(4, 20, 0)]
    );
  }
  console.log('C. 互享画像：4 块');

  // ============ D. 兑换历史再加一笔（阿白：护膝，已完成）============
  // 与真实流程一致：商品兑换提交即 confirmed（锁分+确认扣减两行流水），之后标记 done；
  // 锁分时余额必须够（当时 746 分），价格取 700 保证全程快照不为负。
  const knee = await db.get(`SELECT id FROM wish_items WHERE owner_id = 2 AND title = '运动护膝'`);
  if (!knee) {
    const info = await db.run(
      `INSERT INTO wish_items (owner_id, category, title, description, emoji, price_cny, points_cost, image_id, cooldown_days, status, created_at, updated_at)
       VALUES (2, 'goods', '运动护膝', '长距离跑步护膝盖', '🦵', 120, 700, NULL, 7, 'active', ?, ?) RETURNING id`,
      [isoDaysAgo(6), isoDaysAgo(6)]
    );
    const red = await db.run(
      `INSERT INTO redemptions (wish_item_id, user_id, points_locked, points_charged, status, applied_at, confirmed_at, fulfilled_at)
       VALUES (?, 2, 700, 700, 'done', ?, ?, ?) RETURNING id`,
      [Number(info.id), isoDaysAgo(3, 19, 30), isoDaysAgo(3, 19, 31), isoDaysAgo(2, 12, 30)]
    );
    const redId = Number(red.id);
    // 直接塞进时间线占位（delta 正确、balance_after 占 0），最后统一按 created_at 重排重建
    await db.run(
      `INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at)
       VALUES (2, -700, 0, 'redeem_lock', 'redemption', ?, '兑换「运动护膝」锁分', ?)`,
      [redId, isoDaysAgo(3, 19, 30)]
    );
    await db.run(
      `INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at)
       VALUES (2, 0, 0, 'redeem_charge', 'redemption', ?, '兑换「运动护膝」确认扣减', ?)`,
      [redId, isoDaysAgo(3, 19, 31)]
    );
    console.log('D. 阿白「运动护膝」已完成（-700 分，11-07 到货）');
  } else {
    console.log('D. 护膝已存在，跳过');
  }

  // ============ E. 栗子小额目标再补 2 个（丰富日常）============
  const extra = [
    { title: '拉伸', emoji: '🧘', desc: '睡前 10 分钟拉伸', duration: 10, difficulty: 1, days: [10, 9, 8, 7, 6, 5] },
    { title: '整理房间', emoji: '🧹', desc: '每周一次大扫除', freq_mode: 'weekly', freq_n: 1, duration: 60, difficulty: 2, days: [9, 2] },
  ];
  for (const o of extra) {
    const exists = await db.get(`SELECT id FROM goals WHERE owner_id = 1 AND title = ?`, [o.title]);
    if (exists) continue;
    const info = await db.run(
      `INSERT INTO goals (owner_id, type, title, emoji, description, freq_mode, freq_n, weekdays,
        window_start, window_end, duration_min, difficulty, start_date, end_date, status, streak_count, streak_best, created_at, updated_at)
       VALUES (1, 'daily', ?, ?, ?, ?, ?, '', NULL, NULL, ?, ?, ?, NULL, 'active', 0, 0, ?, ?) RETURNING id`,
      [o.title, o.emoji, o.desc, o.freq_mode || 'daily', o.freq_n || 1, o.duration, o.difficulty, shDate(12), now, now]
    );
    const gid = Number(info.id);
    for (const d of o.days) {
      const pts = Math.min(Math.round(o.duration * 0.5 * DEFAULT_POINTS.difficulty[o.difficulty]), 300);
      const ts = isoDaysAgo(d, 21, 15);
      const ci = await db.run(
        `INSERT INTO check_ins (goal_id, user_id, check_date, duration_min, in_window, points, is_makeup, evidence_text, status, created_at)
         VALUES (?, 1, ?, ?, 0, ?, 0, '', 'credited', ?) RETURNING id`,
        [gid, shDate(d), o.duration, pts, ts]
      );
      await db.run(
        `INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at) VALUES (?, ?, ?, 'checkin', 'check_in', ?, ?, ?)`,
        [1, pts, 0, Number(ci.id), `「${o.title}」${o.duration} 分钟`, ts]
      );
    }
    console.log(`E. 栗子新目标「${o.title}」+ ${o.days.length} 条打卡`);
  }
  // 最后统一重建一次两人的流水：先按 created_at 排序重排（id 顺序==时间顺序），
  // 再按新 id 顺序重算 balance_after，与线上真实写入行为一致。
  const users = [1, 2];
  for (const uid of users) {
    const rows = await db.all(`SELECT * FROM point_ledger WHERE user_id = ? ORDER BY created_at, id`, [uid]);
    const colRows = await db.all(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'point_ledger' ORDER BY ordinal_position`
    );
    const cols = colRows.map((r) => r.column_name).filter((c) => c !== 'id');
    await db.run(`DELETE FROM point_ledger WHERE user_id = ?`, [uid]);
    let bal = 0;
    for (const r of rows) {
      bal += Number(r.delta);
      const vals = cols.map((c) => (c === 'balance_after' ? bal : r[c]));
      await db.run(
        `INSERT INTO point_ledger (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        vals
      );
    }
  }
  console.log('E. 两人流水已按时间重排并重算 balance_after');

  const sum = await db.all(`SELECT user_id, COALESCE(SUM(delta),0) AS bal FROM point_ledger WHERE user_id IN (1,2) GROUP BY user_id`);
  for (const r of sum) console.log(`  用户 ${r.user_id} 最终余额：${r.bal} 分`);
  await db.pool.end();
}

main().catch((e) => {
  console.error('补充失败：', e);
  process.exit(1);
});
