// 演示数据种子：两个账号 + 近两周打卡历史 + 流水 + 连续链 + 愿望单。
// 用法：node scripts/seed-demo.js（需 PG 已启动）
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';
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
  const db = await openDb(DATABASE_URL);
  const now = new Date().toISOString();

  // 清空业务表（TRUNCATE 会重置自增序列）
  const tables = ['redemptions', 'wish_history', 'wish_items', 'goal_milestones', 'point_ledger', 'check_ins', 'verifications', 'goals', 'uploads', 'sessions', 'users'];
  await db.exec(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

  // 两个账号（不变量：login_name 与 nickname 恒等）
  await db.run('INSERT INTO users (login_name, nickname, password_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
    ['栗子', '栗子', bcrypt.hashSync('lizi123', 10), '🐱', now]);
  await db.run('INSERT INTO users (login_name, nickname, password_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
    ['阿白', '阿白', bcrypt.hashSync('abai123', 10), '🐻', now]);

  // 系数（默认）
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    ['points', JSON.stringify(DEFAULT_POINTS)]);

  const goals = [];
  async function addGoal(o) {
    const info = await db.run(
      `INSERT INTO goals (owner_id, type, title, emoji, description, freq_mode, freq_n, weekdays,
        window_start, window_end, duration_min, difficulty, start_date, end_date, status, streak_count, streak_best, created_at, updated_at)
       VALUES (?, 'daily', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', 0, 0, ?, ?) RETURNING id`,
      [o.owner, o.title, o.emoji, o.desc || '', o.freq_mode, o.freq_n || 1, o.weekdays || '', o.ws || null, o.we || null,
        o.duration, o.difficulty, shDate(o.startOffset || 30), now, now]
    );
    goals.push({ id: Number(info.id), ...o, window_start: o.ws || null, window_end: o.we || null });
  }

  // ---- 栗子（user 1）的目标 ----
  await addGoal({ owner: 1, title: '背单词', emoji: '📚', freq_mode: 'daily', duration: 30, difficulty: 2, ws: '06:00', we: '08:00', desc: '每天 30 分钟，用 App 打卡' });
  await addGoal({ owner: 1, title: '练琴', emoji: '🎹', freq_mode: 'daily', duration: 45, difficulty: 3, desc: '哈农 + 一首练习曲' });
  await addGoal({ owner: 1, title: '健身', emoji: '🏋️', freq_mode: 'weekly', freq_n: 3, duration: 60, difficulty: 4 });
  await addGoal({ owner: 1, title: '早睡', emoji: '💤', freq_mode: 'daily', duration: 30, difficulty: 2, ws: '22:30', we: '23:30' });
  await addGoal({ owner: 1, title: '阅读', emoji: '📖', freq_mode: 'weekdays', weekdays: '1,3,5', duration: 30, difficulty: 2, desc: '每天读 20 页' });
  await addGoal({ owner: 1, title: '喝水', emoji: '💧', freq_mode: 'daily', duration: 5, difficulty: 1, desc: '每天 8 杯' });

  // ---- 阿白（user 2）的目标 ----
  await addGoal({ owner: 2, title: '背单词', emoji: '📚', freq_mode: 'daily', duration: 30, difficulty: 2, ws: '07:00', we: '09:00' });
  await addGoal({ owner: 2, title: '跑步', emoji: '🏃', freq_mode: 'weekly', freq_n: 3, duration: 40, difficulty: 3 });
  await addGoal({ owner: 2, title: '早睡', emoji: '💤', freq_mode: 'daily', duration: 30, difficulty: 2, ws: '23:00', we: '23:59' });

  // ---- 打卡计划 ----
  const plan = [
    { g: 0, days: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 13, 14, 15, 16], inWin: false },
    { g: 1, days: [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17], inWin: false },
    { g: 2, days: [0, 2, 4, 6, 7, 10, 11], inWin: false },
    { g: 3, days: [1, 3, 4, 6, 8, 10, 13, 14], inWin: true },
    { g: 4, days: [1, 2, 4, 7, 8, 9, 11, 14, 15], inWin: false },
    { g: 5, days: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10], inWin: false },
    { g: 6, days: [0, 1, 2, 3, 5, 6, 7, 8, 9, 12, 13, 14], inWin: false },
    { g: 7, days: [0, 1, 4, 6, 7, 10], inWin: false },
    { g: 8, days: [1, 2, 3, 5, 6, 8, 9, 12], inWin: true },
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

  // 当前连续链
  const { computeStreak } = require('../src/streak');
  for (const g of goals) {
    const rows = await db.all(`SELECT check_date FROM check_ins WHERE goal_id = ? AND status = 'credited'`, [g.id]);
    const set = new Set(rows.map((r) => r.check_date));
    const cur = computeStreak({ freq_mode: g.freq_mode, freq_n: g.freq_n, weekdays: g.weekdays }, set);
    await db.run('UPDATE goals SET streak_count = ? WHERE id = ?', [cur, g.id]);
  }

  // ---- 愿望单与兑换 ----
  const wishData = [
    [1, '蓝牙耳机', 'AirPods 平替，通勤用', '🎧', 199, 1990, 0, 20],
    [1, '乐高花束', '拼完摆桌上', '🌷', 349, 3490, 0, 15],
    [1, '一顿火锅', '两人的份，攒够了就去', '🍲', 150, 1500, 0, 10],
    [1, '奶茶', '周末的快乐水', '🧋', 25, 250, 0, 30],
    [2, '新跑鞋', '缓震款，旧鞋快废了', '👟', 500, 5000, 0, 12],
  ];
  for (const [owner, title, desc, emoji, price, points, cool, daysAgo] of wishData) {
    await db.run(
      `INSERT INTO wish_items (owner_id, category, title, description, emoji, price_cny, points_cost, image_id, cooldown_days, status, created_at, updated_at)
       VALUES (?, 'goods', ?, ?, ?, ?, ?, NULL, ?, 'active', ?, ?)`,
      [owner, title, desc, emoji, price, points, cool, isoDaysAgo(daysAgo), isoDaysAgo(daysAgo)]
    );
  }

  // 兑换：栗子已完成一笔奶茶（wish_item_id=4）
  await db.run(
    `INSERT INTO redemptions (wish_item_id, user_id, points_locked, points_charged, status, applied_at, confirmed_at, fulfilled_at)
     VALUES (?, ?, ?, ?, 'done', ?, ?, ?)`,
    [4, 1, 250, 250, isoDaysAgo(6, 20, 0), isoDaysAgo(6, 20, 1), isoDaysAgo(5, 12, 30)]
  );
  events.push({ ts: isoDaysAgo(6, 20, 0), type: 'redeem_lock', owner: 1, pts: -250, redId: 1 });
  events.push({ ts: isoDaysAgo(6, 20, 1), type: 'redeem_charge', owner: 1, pts: 0, redId: 1 });

  // ---- 重建流水 ----
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
    }
  }

  console.log('种子完成：');
  console.log('  栗子余额', balances[1], '分；阿白余额', balances[2], '分');
  console.log('  目标', goals.length, '个；打卡', events.filter((e) => e.type === 'checkin').length, '条；里程碑', events.filter((e) => e.type === 'milestone').length, '笔');
  await db.pool.end();
}

main().catch((e) => {
  console.error('种子失败：', e && e.message ? e.message : e);
  process.exit(1);
});
