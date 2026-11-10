// 定制演示种子（云端）：只重置栗子(1)/阿白(2)两个账号的演示数据。
// 与 seed-demo.js 的区别：绝不 TRUNCATE users/sessions 等公共表，不动其他用户，
// 保留 pair 1 的绑定关系，密码统一 12345678，附加手机时长/状态/日报/私聊/大目标计划链。
// 用法（容器内）：node scripts/seed-lizi-abai.js
const bcrypt = require('bcryptjs');
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
  freq: { daily: 1.0, weekly34: 1.2, weekly12: 1.5, weekdays: 1.0 },
  window: { in: 1.1, none: 1.0, out: 0.8 },
  milestones: [
    { n: 3, p: 10 }, { n: 7, p: 25 }, { n: 14, p: 50 },
    { n: 30, p: 120 }, { n: 60, p: 300 }, { n: 100, p: 700 }, { n: 365, p: 3000 },
  ],
};

function pointsFor(goal, duration, inWin) {
  const B = Math.min(duration * 0.5, 60);
  const D = DEFAULT_POINTS.difficulty[goal.difficulty];
  const F = goal.freq_mode === 'daily' ? 1.0 : goal.freq_mode === 'weekly' ? (goal.freq_n >= 3 ? 1.2 : 1.5) : 1.0;
  const T = inWin ? 1.1 : goal.window_start ? 0.8 : 1.0;
  return Math.min(Math.round(B * D * F * T), 300);
}

async function main() {
  const { openDb } = require('../src/db');
  const db = await openDb(process.env.DATABASE_URL);
  const now = new Date().toISOString();
  const PW = bcrypt.hashSync('12345678', 10);

  // ---- 0. 重置两人密码 + 清会话 ----
  await db.run('UPDATE users SET password_hash = ? WHERE id IN (1, 2)', [PW]);
  await db.run('DELETE FROM sessions WHERE user_id IN (1, 2)');

  // ---- 1. 清理两人旧业务数据（依赖顺序；只动 user 1/2 与 pair 1）----
  const bigIds = (await db.all(`SELECT id FROM big_goals WHERE owner_id IN (1, 2)`)).map((r) => r.id);
  if (bigIds.length) await db.run(`DELETE FROM plan_versions WHERE big_goal_id IN (${bigIds.join(',')})`);
  await db.run(`DELETE FROM zoowy_messages WHERE user_id IN (1, 2)`);
  await db.run(`DELETE FROM zoowy_sessions WHERE user_id IN (1, 2)`);
  await db.run(`DELETE FROM verifications WHERE submitter_id IN (1, 2) OR reviewer_id IN (1, 2)`);
  await db.run(`DELETE FROM check_ins WHERE user_id IN (1, 2)`);
  const goalIds = (await db.all(`SELECT id FROM goals WHERE owner_id IN (1, 2)`)).map((r) => r.id);
  if (goalIds.length) await db.run(`DELETE FROM goal_milestones WHERE goal_id IN (${goalIds.join(',')})`);
  await db.run(`DELETE FROM point_ledger WHERE user_id IN (1, 2)`);
  await db.run(`DELETE FROM wish_history WHERE changed_by IN (1, 2)`);
  await db.run(`DELETE FROM redemptions WHERE user_id IN (1, 2)`);
  await db.run(`DELETE FROM wish_items WHERE owner_id IN (1, 2)`);
  await db.run(`DELETE FROM uploads WHERE user_id IN (1, 2)`);
  await db.run(`DELETE FROM diaries WHERE user_id IN (1, 2)`);
  await db.run(`DELETE FROM usage_daily WHERE user_id IN (1, 2)`);
  await db.run(`DELETE FROM goals WHERE owner_id IN (1, 2)`);
  await db.run(`DELETE FROM big_goals WHERE owner_id IN (1, 2)`);
  await db.run(`DELETE FROM user_settings WHERE user_id IN (1, 2)`);
  await db.run(`DELETE FROM pair_messages WHERE pair_id = 1`);
  await db.run(`DELETE FROM pair_events WHERE pair_id = 1`);
  await db.run(`DELETE FROM pair_invites WHERE pair_id = 1`);

  // ---- 2. 配对保持（pair 1 已 active，补一条绑定审计）----
  await db.run(`INSERT INTO pair_events (pair_id, user_id, action, detail, created_at) VALUES (1, 1, 'seed', '演示数据初始化', ?)`, [now]);

  // ---- 3. 系数（默认）----
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    ['points', JSON.stringify(DEFAULT_POINTS)]);

  // ---- 4. 目标 ----
  const goals = [];
  async function addGoal(o) {
    const info = await db.run(
      `INSERT INTO goals (owner_id, type, title, emoji, description, freq_mode, freq_n, weekdays,
        window_start, window_end, duration_min, difficulty, start_date, end_date, status, streak_count, streak_best, created_at, updated_at)
       VALUES (?, 'daily', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', 0, 0, ?, ?) RETURNING id`,
      [o.owner, o.title, o.emoji, o.desc || '', o.freq_mode, o.freq_n || 1, o.weekdays || '', o.ws || null, o.we || null,
        o.duration, o.difficulty, shDate(30), now, now]
    );
    goals.push({ id: Number(info.id), ...o, window_start: o.ws || null, window_end: o.we || null });
  }

  // 栗子（user 1）
  await addGoal({ owner: 1, title: '背单词', emoji: '📚', freq_mode: 'daily', duration: 30, difficulty: 2, ws: '06:00', we: '08:00', desc: '每天 30 分钟，用 App 打卡' });
  await addGoal({ owner: 1, title: '练琴', emoji: '🎹', freq_mode: 'daily', duration: 45, difficulty: 3, desc: '哈农 + 一首练习曲' });
  await addGoal({ owner: 1, title: '健身', emoji: '🏋️', freq_mode: 'weekly', freq_n: 3, duration: 60, difficulty: 4 });
  await addGoal({ owner: 1, title: '早睡', emoji: '💤', freq_mode: 'daily', duration: 30, difficulty: 2, ws: '22:30', we: '23:30' });
  await addGoal({ owner: 1, title: '阅读', emoji: '📖', freq_mode: 'weekdays', weekdays: '1,3,5', duration: 30, difficulty: 2, desc: '每天读 20 页' });
  await addGoal({ owner: 1, title: '喝水', emoji: '💧', freq_mode: 'daily', duration: 5, difficulty: 1, desc: '每天 8 杯' });
  // 阿白（user 2）
  await addGoal({ owner: 2, title: '背单词', emoji: '📚', freq_mode: 'daily', duration: 30, difficulty: 2, ws: '07:00', we: '09:00' });
  await addGoal({ owner: 2, title: '跑步', emoji: '🏃', freq_mode: 'weekly', freq_n: 3, duration: 40, difficulty: 3 });
  await addGoal({ owner: 2, title: '早睡', emoji: '💤', freq_mode: 'daily', duration: 30, difficulty: 2, ws: '23:00', we: '23:59' });

  // ---- 5. 打卡计划（0 = 今天；今日两人各打一部分，留待办）----
  const plan = [
    { g: 0, days: [16, 15, 14, 13, 12, 11, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], inWin: false },
    { g: 1, days: [17, 16, 14, 13, 11, 10, 8, 7, 5, 4, 2, 1], inWin: false },
    { g: 2, days: [15, 13, 11, 9, 7, 5, 3, 1], inWin: false },
    { g: 3, days: [16, 15, 13, 12, 10, 9, 7, 6, 4, 3, 1], inWin: true },
    { g: 4, days: [15, 13, 11, 8, 6, 4, 1], inWin: false },
    { g: 5, days: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], inWin: false },
    { g: 6, days: [16, 15, 13, 12, 10, 9, 7, 6, 4, 3, 1, 0], inWin: false },
    { g: 7, days: [14, 12, 10, 8, 6, 4, 2], inWin: false },
    { g: 8, days: [15, 13, 11, 9, 7, 5, 3, 1], inWin: true },
  ];

  const evidence = {
    '0': '今天背了 50 个新词，正确率 87%',
    '1': '哈农 15 分钟 + 练习曲两遍',
    '2': '腿推 4 组 + 深蹲 3 组',
    '3': '十点半就上床了',
    '4': '读完了《置身事内》第二章',
    '5': '喝了 8 杯，全部打卡',
    '6': '复习了昨天的 50 个词',
    '7': '晨跑 5 公里，配速 6 分半',
    '8': '23 点 05 关灯',
  };

  const events = [];
  async function addCheckin(gIdx, offsetDays) {
    const g = goals[gIdx];
    const duration = g.duration;
    const inWin = plan[gIdx].inWin;
    const pts = pointsFor(g, duration, inWin);
    const date = shDate(offsetDays);
    if (events.some((e) => e.type === 'checkin' && e.g === gIdx && e.d === date)) return;
    const hour = g.title === '早睡' ? 23 : g.title === '喝水' ? (offsetDays === 0 ? 9 : 10) : offsetDays === 0 ? 9 : 20;
    const ts = isoDaysAgo(offsetDays, hour, Math.floor(Math.random() * 59));
    const info = await db.run(
      `INSERT INTO check_ins (goal_id, user_id, check_date, duration_min, in_window, points, is_makeup, evidence_text, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'credited', ?) RETURNING id`,
      [g.id, g.owner, date, duration, inWin ? 1 : 0, pts, evidence[gIdx] || '', ts]
    );
    events.push({ ts, type: 'checkin', g: gIdx, ciId: Number(info.id), pts, d: date, owner: g.owner });
  }
  for (const p of plan) for (const off of p.days) await addCheckin(p.g, off);

  async function award(g, n, p, date) {
    if (events.some((e) => e.type === 'milestone' && e.g === g.id && e.n === n)) return;
    const ts = isoDaysAgo(daysSince(date), 21, 30);
    events.push({ ts, type: 'milestone', g: g.id, n, pts: p, owner: g.owner });
    await db.run('INSERT INTO goal_milestones (goal_id, threshold, awarded_at) VALUES (?, ?, ?)', [g.id, n, ts]);
  }
  function daysSince(dateStr) {
    return Math.round((Date.now() + OFF - new Date(dateStr + 'T00:00:00+08:00').getTime()) / 86400000);
  }
  async function walkMilestones() {
    const byGoal = {};
    for (const e of events) if (e.type === 'checkin') (byGoal[e.g] = byGoal[e.g] || []).push(e);
    for (const [gIdx, list] of Object.entries(byGoal)) {
      const g = goals[Number(gIdx)];
      list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.ciId - b.ciId));
      const awarded = new Set();
      let last = null;
      let count = 0;
      let best = 0;
      if (g.freq_mode === 'weekly') {
        const weeks = {};
        for (const e of list) {
          const d = new Date(e.d + 'T00:00:00Z');
          const wd = d.getUTCDay();
          const off = wd === 0 ? 6 : wd - 1;
          const mon = new Date(d);
          mon.setUTCDate(d.getUTCDate() - off);
          weeks[mon.toISOString().slice(0, 10)] = (weeks[mon.toISOString().slice(0, 10)] || 0) + 1;
        }
        const weeksSorted = Object.keys(weeks).sort();
        count = 0;
        for (const wk of weeksSorted) {
          if (weeks[wk] >= g.freq_n) {
            count += 1;
            for (const m of DEFAULT_POINTS.milestones) {
              if (count >= m.n && !awarded.has(m.n)) { await award(g, m.n, m.p, wk); awarded.add(m.n); }
            }
          } else {
            count = 0;
            awarded.clear();
          }
          best = Math.max(best, count);
        }
      } else {
        const skip = new Set();
        if (g.freq_mode === 'weekdays') {
          for (let i = 1; i <= 7; i++) if (!String(g.weekdays).includes(String(i))) skip.add(i);
        }
        for (const e of list) {
          const d = new Date(e.d + 'T00:00:00Z');
          const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
          if (skip.has(wd)) continue;
          const diff = last ? (new Date(e.d) - new Date(last)) / 86400000 : null;
          if (last && diff === 1) count += 1;
          else count = 1;
          last = e.d;
          best = Math.max(best, count);
          for (const m of DEFAULT_POINTS.milestones) {
            if (count >= m.n && !awarded.has(m.n)) { await award(g, m.n, m.p, e.d); awarded.add(m.n); }
          }
        }
      }
      await db.run('UPDATE goals SET streak_best = ? WHERE id = ?', [best, g.id]);
    }
  }
  await walkMilestones();

  const { computeStreak } = require('../src/streak');
  for (const g of goals) {
    const rows = await db.all(`SELECT check_date FROM check_ins WHERE goal_id = ? AND status = 'credited'`, [g.id]);
    const set = new Set(rows.map((r) => r.check_date));
    const cur = computeStreak({ freq_mode: g.freq_mode, freq_n: g.freq_n, weekdays: g.weekdays }, set);
    await db.run('UPDATE goals SET streak_count = ? WHERE id = ?', [cur, g.id]);
  }

  // ---- 6. 愿望单 + 一笔已完成兑换 ----
  const wishData = [
    [1, '蓝牙耳机', 'AirPods 平替，通勤用', '🎧', 199, 1990, 20],
    [1, '乐高花束', '拼完摆桌上', '🌷', 349, 3490, 15],
    [1, '一顿火锅', '两人的份，攒够了就去', '🍲', 150, 1500, 10],
    [1, '奶茶', '周末的快乐水', '🧋', 25, 250, 30],
    [2, '新跑鞋', '缓震款，旧鞋快废了', '👟', 500, 5000, 12],
  ];
  let milkTeaId = null;
  for (const [owner, title, desc, emoji, price, points, daysAgo] of wishData) {
    const info = await db.run(
      `INSERT INTO wish_items (owner_id, category, title, description, emoji, price_cny, points_cost, image_id, cooldown_days, status, created_at, updated_at)
       VALUES (?, 'goods', ?, ?, ?, ?, ?, NULL, ?, 'active', ?, ?) RETURNING id`,
      [owner, title, desc, emoji, price, points, 30, isoDaysAgo(daysAgo), isoDaysAgo(daysAgo)]
    );
    if (title === '奶茶') milkTeaId = Number(info.id);
  }
  await db.run(
    `INSERT INTO redemptions (wish_item_id, user_id, points_locked, points_charged, status, applied_at, confirmed_at, fulfilled_at)
     VALUES (?, 1, 250, 250, 'done', ?, ?, ?)`,
    [milkTeaId, isoDaysAgo(6, 20, 0), isoDaysAgo(6, 20, 1), isoDaysAgo(5, 12, 30)]
  );
  events.push({ ts: isoDaysAgo(6, 20, 0), type: 'redeem_lock', owner: 1, pts: -250, redId: 1 });
  events.push({ ts: isoDaysAgo(6, 20, 1), type: 'redeem_charge', owner: 1, pts: 0, redId: 1 });

  // ---- 7. 大目标 + 计划链（栗子：备考日语 N2）----
  const bigInfo = await db.run(
    `INSERT INTO big_goals (owner_id, title, emoji, description, progress, progress_note, progress_at, status, created_at, updated_at)
     VALUES (1, '考下日语 N2', '🏔️', '今年 12 月考 N2，词汇语法听力分头推进', 25, '五十音图已过关，N5 词汇背到 600', ?, 'active', ?, ?) RETURNING id`,
    [isoDaysAgo(8, 21, 0), isoDaysAgo(20), now]
  );
  const bigId = Number(bigInfo.id);
  await db.run(
    `INSERT INTO plan_versions (big_goal_id, owner_id, snapshot, source, reason, created_at)
     VALUES (?, 1, ?, 'user', '演示数据初始化', ?)`,
    [bigId, JSON.stringify({ note: '演示计划链' }), now]
  );

  const stages = [
    { key: 'sg1', title: '五十音图全掌握', emoji: '🌸', criteria: '五十音图听写全对', est: 600, pts: 200, status: 'achieved', plan: 'done', pd: 8, order: 1 },
    { key: 'sg2', title: 'N5 词汇 800 词', emoji: '📖', criteria: '800 词听写正确率 90%', est: 900, pts: 300, status: 'reviewing', plan: 'active', pd: 0, order: 2 },
    { key: 'sg3', title: 'N5 语法 50 条', emoji: '🧱', criteria: '50 条语法各完成 10 道造句', est: 1200, pts: 400, status: 'active', plan: 'active', pd: 3, order: 3 },
    { key: 'sg4', title: 'N4 词汇 1200 词', emoji: '📗', criteria: '1200 词听写正确率 85%', est: 1500, pts: 500, status: 'draft', plan: 'draft', pd: 10, order: 4 },
  ];
  const stageIds = {};
  for (const s of stages) {
    const info = await db.run(
      `INSERT INTO goals (owner_id, type, title, emoji, description, freq_mode, freq_n, weekdays,
        window_start, window_end, duration_min, difficulty, start_date, end_date, status, streak_count, streak_best,
        est_total_min, accept_criteria, total_points, big_goal_id, planned_date, plan_order, plan_status, created_at, updated_at)
       VALUES (1, 'stage', ?, ?, ?, 'daily', 1, '', NULL, NULL, 30, 3, ?, NULL, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [s.title, s.emoji, s.criteria, shDate(20), s.status, s.est, s.criteria, s.pts, bigId, shDate(s.pd), s.order, s.plan, now, now]
    );
    stageIds[s.key] = Number(info.id);
  }

  // 已达成的小目标：验收记录 + stage_credit 流水
  await db.run(
    `INSERT INTO verifications (goal_id, submitter_id, reviewer_id, submit_count, evidence_text, evidence_ids, self_statement, status, reason, created_at, decided_at)
     VALUES (?, 1, 2, 1, '五十音图听写全对截图已传', '', '平假名片假名都过关了', 'approved', '', ?, ?)`,
    [stageIds.sg1, isoDaysAgo(8, 21, 0), isoDaysAgo(8, 21, 10)]
  );
  events.push({ ts: isoDaysAgo(8, 21, 10), type: 'stage_credit', owner: 1, pts: 200, vId: 1, title: '五十音图全掌握' });

  // 待验收：N5 词汇已提交，等阿白处理（「待我验收」红点）
  await db.run(
    `INSERT INTO verifications (goal_id, submitter_id, reviewer_id, submit_count, evidence_text, evidence_ids, self_statement, status, reason, created_at, decided_at)
     VALUES (?, 1, 2, 1, '800 词全部过完一遍，错词本 60 个', '', '请验收！', 'pending', '', ?, NULL)`,
    [stageIds.sg2, isoDaysAgo(0, 10, 20)]
  );

  // ---- 8. 重建流水（按时间排序，余额快照正确）----
  events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const balances = { 1: 0, 2: 0 };
  for (const e of events) {
    if (e.type === 'checkin') {
      const g = goals[e.g];
      balances[e.owner] += e.pts;
      await db.run('INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [e.owner, e.pts, balances[e.owner], 'checkin', 'check_in', e.ciId, `「${g.title}」${g.duration} 分钟`, e.ts]);
    } else if (e.type === 'milestone') {
      balances[e.owner] += e.pts;
      await db.run('INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [e.owner, e.pts, balances[e.owner], 'streak_bonus', 'goal', e.g, `连续 ${e.n} 达成`, e.ts]);
    } else if (e.type === 'redeem_lock') {
      balances[e.owner] += e.pts;
      await db.run('INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [e.owner, e.pts, balances[e.owner], 'redeem_lock', 'redemption', e.redId, '兑换「奶茶」预占 250 分', e.ts]);
    } else if (e.type === 'redeem_charge') {
      await db.run('INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [e.owner, 0, balances[e.owner], 'redeem_charge', 'redemption', e.redId, '兑换确认扣减 250 分', e.ts]);
    } else if (e.type === 'stage_credit') {
      balances[e.owner] += e.pts;
      await db.run('INSERT INTO point_ledger (user_id, delta, balance_after, type, ref_type, ref_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [e.owner, e.pts, balances[e.owner], 'stage_credit', 'verification', e.vId, `小目标「${e.title}」达成`, e.ts]);
    }
  }

  // ---- 9. 手机使用时长（近 7 天 + 今天）----
  const APPS = {
    1: [['com.tencent.mm', '微信'], ['com.xingin.xhs', '小红书'], ['com.tencent.bangcle.weiai', '百词斩'], ['com.netease.cloudmusic', '网易云音乐'], ['com.bilibili.app', '哔哩哔哩']],
    2: [['com.tencent.mm', '微信'], ['com.bilibili.app', '哔哩哔哩'], ['com.keep.keep', 'Keep'], ['com.android.chrome', '浏览器']],
  };
  for (const uid of [1, 2]) {
    for (let d = 6; d >= 0; d--) {
      const date = shDate(d);
      const apps = APPS[uid];
      const picks = apps.filter(() => Math.random() < 0.85);
      for (const [pkg, name] of picks) {
        const seconds = 600 + Math.floor(Math.random() * 6000);
        await db.run(
          `INSERT INTO usage_daily (user_id, usage_date, package_name, app_name, seconds, updated_at)
           VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, usage_date, package_name) DO NOTHING`,
          [uid, date, pkg, name, seconds, isoDaysAgo(d, 22, 0)]
        );
      }
    }
  }

  // ---- 10. 微信式状态 ----
  await db.run(`UPDATE users SET status = ? WHERE id = 1`,
    [JSON.stringify({ key: 'work:搬砖', emoji: '🧱', label: '搬砖', text: '今天也在努力搬砖', group: 'work', at: now })]);
  await db.run(`UPDATE users SET status = ? WHERE id = 2`,
    [JSON.stringify({ key: 'work:沉迷学习', emoji: '📚', label: '沉迷学习', text: 'N5 词汇冲刺中', group: 'work', at: now })]);

  // ---- 11. AI 日报（昨天，互相可见）----
  await db.run(
    `INSERT INTO diaries (user_id, diary_date, ai_original, user_edited, shared, created_at, updated_at)
     VALUES (1, ?, ?, '', 1, ?, ?) ON CONFLICT (user_id, diary_date) DO NOTHING`,
    [shDate(1),
      '栗子今天完成了背单词和喝水，连续 16 天了，很稳。练琴和健身这周还差一点，周末补上就好。愿望单里的耳机已经攒了一半，再坚持两周就能换啦。',
      isoDaysAgo(1, 23, 30), isoDaysAgo(1, 23, 30)]
  );
  await db.run(
    `INSERT INTO diaries (user_id, diary_date, ai_original, user_edited, shared, created_at, updated_at)
     VALUES (2, ?, ?, '', 1, ?, ?) ON CONFLICT (user_id, diary_date) DO NOTHING`,
    [shDate(1),
      '阿白今天背了单词、晨跑 5 公里，跑步这周已经完成 2 次。今晚记得 23 点前关灯，早睡链别断。',
      isoDaysAgo(1, 23, 30), isoDaysAgo(1, 23, 30)]
  );

  // ---- 12. 搭子私聊（最后一条栗子发的未读，阿白有红点）----
  await db.run(`INSERT INTO pair_messages (pair_id, sender_id, content, created_at, read_at) VALUES (1, 1, '今晚一起练琴吗？', ?, ?)`,
    [isoDaysAgo(1, 19, 0), isoDaysAgo(1, 19, 30)]);
  await db.run(`INSERT INTO pair_messages (pair_id, sender_id, content, created_at, read_at) VALUES (1, 2, '好啊，八点线上见 🎹', ?, ?)`,
    [isoDaysAgo(1, 19, 40), isoDaysAgo(1, 19, 45)]);
  await db.run(`INSERT INTO pair_messages (pair_id, sender_id, content, created_at, read_at) VALUES (1, 1, 'N5 词汇我已经提交验收了，有空帮我看看～', ?, NULL)`,
    [isoDaysAgo(0, 10, 25)]);

  // ---- 13. 用户级 AI 设置（默认值）----
  for (const uid of [1, 2]) {
    await db.run(`INSERT INTO user_settings (user_id, skip_confirm, report_changes, updated_at) VALUES (?, 0, 1, ?) ON CONFLICT (user_id) DO NOTHING`,
      [uid, now]);
  }

  const cnt = {
    goals: (await db.all(`SELECT id FROM goals WHERE owner_id IN (1,2)`)).length,
    checkins: (await db.all(`SELECT user_id FROM check_ins WHERE user_id IN (1,2)`)).length,
    ledger: (await db.all(`SELECT user_id FROM point_ledger WHERE user_id IN (1,2)`)).length,
    usage: (await db.all(`SELECT user_id FROM usage_daily WHERE user_id IN (1,2)`)).length,
  };
  console.log('种子完成：');
  console.log(`  栗子余额 ${balances[1]} 分；阿白余额 ${balances[2]} 分`);
  console.log(`  目标 ${cnt.goals} 个（含计划链 4 个）；打卡 ${cnt.checkins} 条；流水 ${cnt.ledger} 笔；时长 ${cnt.usage} 行`);
  await db.pool.end();
}

main().catch((e) => {
  console.error('种子失败：', e);
  process.exit(1);
});
