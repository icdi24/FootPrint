// 统计：本月得分、余额、连续天数、完成率、时间投入、被质疑次数（需求 10.1）。
const { todayStr, isoToDateStr, isoToMonth, addDaysStr, isoWeekday, mondayOf } = require('./tz');

const OFF = 8 * 3600 * 1000;

function monthStartStr() {
  return todayStr().slice(0, 8) + '01';
}

// 目标在 [from, to] 内应打卡的次数（自然日口径）
function expectedCount(goal, from, to) {
  const start = goal.start_date > from ? goal.start_date : from;
  const end = goal.end_date && goal.end_date < to ? goal.end_date : to;
  if (start > end) return 0;
  const days = Math.round((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000) + 1;
  if (goal.freq_mode === 'daily') return days;
  if (goal.freq_mode === 'weekdays') {
    const wd = new Set(String(goal.weekdays || '').split(',').map(Number).filter(Boolean));
    let c = 0;
    for (let i = 0; i < days; i++) {
      const d = addDaysStr(start, i);
      if (wd.has(isoWeekday(d))) c += 1;
    }
    return c;
  }
  // weekly：与范围相交的自然周数 × N
  let c = 0;
  let cursor = mondayOf(start);
  const endMon = mondayOf(end);
  while (cursor <= endMon) {
    c += 1;
    cursor = addDaysStr(cursor, 7);
  }
  return Math.min(c * (Number(goal.freq_n) || 1), days);
}

function statsFor(db, userId) {
  const monthStart = monthStartStr();
  const today = todayStr();

  const ledgerRows = db.prepare('SELECT delta, type, created_at FROM point_ledger WHERE user_id = ?').all(userId);
  let balance = 0;
  let monthPoints = 0;
  for (const r of ledgerRows) {
    balance += Number(r.delta);
    if (isoToMonth(r.created_at) === today.slice(0, 7) && Number(r.delta) > 0) {
      monthPoints += Number(r.delta);
    }
  }

  const checkins = db
    .prepare(`SELECT * FROM check_ins WHERE user_id = ? AND status = 'credited' ORDER BY check_date DESC`)
    .all(userId);

  const monthCheckins = checkins.filter((c) => c.check_date >= monthStart && c.check_date <= today);
  const timeInvestMin = monthCheckins.reduce((s, c) => s + Number(c.duration_min), 0);

  const goals = db
    .prepare(`SELECT * FROM goals WHERE owner_id = ? AND status IN ('active','achieved','abandoned')`)
    .all(userId);
  let expected = 0;
  for (const g of goals) expected += expectedCount(g, monthStart, today);
  const achieved = monthCheckins.length;
  const completion = expected > 0 ? Math.round((achieved / expected) * 100) : null;

  const bestRow = db.prepare('SELECT MAX(streak_best) AS b FROM goals WHERE owner_id = ?').get(userId);
  const bestStreak = Number(bestRow.b || 0);

  const curRow = db
    .prepare(`SELECT MAX(streak_count) AS c FROM goals WHERE owner_id = ? AND status = 'active'`)
    .get(userId);
  const currentStreak = Number(curRow.c || 0);

  const rejected = db
    .prepare(`SELECT COUNT(*) AS c FROM check_ins WHERE user_id = ? AND status = 'rejected'`)
    .get(userId);
  const rejectedCount = Number(rejected.c);

  return {
    balance,
    monthPoints,
    bestStreak,
    currentStreak,
    completion,
    timeInvestMin,
    monthCheckinCount: achieved,
    monthExpected: expected,
    rejectedCount,
  };
}

module.exports = { statsFor };
