// 时区工具：全部存 UTC（ISO 字符串），业务日期按 Asia/Shanghai（固定 UTC+8）判定。
const OFF = 8 * 3600 * 1000;

function shanghaiNow() {
  return new Date(Date.now() + OFF);
}

function nowIso() {
  return new Date().toISOString();
}

// 今天的业务日期 'YYYY-MM-DD'（上海）
function todayStr() {
  return shanghaiNow().toISOString().slice(0, 10);
}

// 上海当前 HH:MM
function hhmm() {
  const d = shanghaiNow();
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// 日期字符串加减天数
function addDaysStr(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ISO 星期几 1=周一 … 7=周日
function isoWeekday(s) {
  const w = new Date(s + 'T00:00:00Z').getUTCDay();
  return w === 0 ? 7 : w;
}

// 所在周的周一日期
function mondayOf(s) {
  const d = new Date(s + 'T00:00:00Z');
  const w = d.getUTCDay();
  const off = w === 0 ? 6 : w - 1;
  d.setUTCDate(d.getUTCDate() - off);
  return d.toISOString().slice(0, 10);
}

// ISO 时间戳转上海日期字符串
function isoToDateStr(iso) {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + OFF).toISOString().slice(0, 10);
}

// ISO 时间戳转上海月份 'YYYY-MM'
function isoToMonth(iso) {
  return isoToDateStr(iso).slice(0, 7);
}

function dateDiffDays(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

module.exports = {
  nowIso,
  todayStr,
  hhmm,
  addDaysStr,
  isoWeekday,
  mondayOf,
  isoToDateStr,
  isoToMonth,
  dateDiffDays,
};
