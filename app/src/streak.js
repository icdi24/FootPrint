// 连续链：每日/指定星期按「天」、每周 N 次按「达标周」计数（需求 5.5）。
const { todayStr, addDaysStr, isoWeekday, mondayOf } = require('./tz');

// creditedDates: Set<YYYY-MM-DD>（该目标所有 credited 打卡日期）
function computeStreak(goal, creditedDates) {
  const today = todayStr();
  if (goal.freq_mode === 'daily') {
    let cursor = creditedDates.has(today) ? today : addDaysStr(today, -1);
    let count = 0;
    while (creditedDates.has(cursor)) {
      count += 1;
      cursor = addDaysStr(cursor, -1);
    }
    return count;
  }
  if (goal.freq_mode === 'weekdays') {
    const wd = new Set(String(goal.weekdays || '').split(',').map(Number).filter(Boolean));
    if (!wd.size) return 0;
    let cursor = creditedDates.has(today) ? today : addDaysStr(today, -1);
    let count = 0;
    for (let guard = 0; guard < 800; guard++) {
      if (!wd.has(isoWeekday(cursor))) {
        cursor = addDaysStr(cursor, -1);
        continue;
      }
      if (creditedDates.has(cursor)) {
        count += 1;
        cursor = addDaysStr(cursor, -1);
      } else {
        break;
      }
    }
    return count;
  }
  // weekly：按自然周（周一至周日），周内打满 N 次算达标
  const n = Math.max(1, Number(goal.freq_n) || 1);
  const weeks = new Map();
  for (const d of creditedDates) {
    const m = mondayOf(d);
    weeks.set(m, (weeks.get(m) || 0) + 1);
  }
  let cursor = mondayOf(today);
  if ((weeks.get(cursor) || 0) < n) cursor = addDaysStr(cursor, -7);
  let count = 0;
  while ((weeks.get(cursor) || 0) >= n) {
    count += 1;
    cursor = addDaysStr(cursor, -7);
  }
  return count;
}

module.exports = { computeStreak };
