// 手机使用时长演示数据：给 id=1 栗子、id=2 阿白各灌一套「看起来真实」的当日 App 用量。
// 用法：node scripts/seed-usage.js [天数=3]   或   node scripts/seed-usage.js --date=2026-11-03 2026-11-01
// 只连库、不起服务；可重复执行（ON CONFLICT 覆盖写）。
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';
const { todayStr, addDaysStr } = require('../src/tz');

// ---- 两个人的 App 画像 ----
// w = 当天的权重（越像越快被分配到更多时长），max = 单个 App 当日上限（分钟）
// 栗子：偏学习与工具，短视频很少；阿白：偏视频与游戏，刷得多。
const PROFILES = {
  1: {
    label: '栗子',
    range: [150, 300], // 2.5 ~ 5 小时
    apps: [
      ['com.tencent.mm', '微信', 26, 55],
      ['com.netease.cloudmusic', '网易云音乐', 30, 70],
      ['com.eusoft.yidianenglish', '听力英语', 25, 45],
      ['com.tencent.wework', '企业微信', 10, 30],
      ['com.alibaba.android.rimet', '钉钉', 8, 25],
      ['cn.xuexi.android', '学习强国', 10, 30],
      ['com.tencent.mobileqq', 'QQ', 8, 20],
      ['com.xingin.xhs', '小红书', 10, 22],
      ['com.eg.android.AlipayGphone', '支付宝', 5, 12],
      ['com.zhihu.android', '知乎', 8, 18],
      ['com.taobao.taobao', '淘宝', 4, 10],
      ['com.ss.android.ugc.aweme', '抖音', 4, 12],
      ['com.netease.youdao.youdaodict', '有道词典', 5, 12],
      ['com.github.android', 'GitHub', 4, 10],
    ],
  },
  2: {
    label: '阿白',
    range: [210, 360], // 3.5 ~ 6 小时
    apps: [
      ['com.tencent.mm', '微信', 22, 50],
      ['com.ss.android.ugc.aweme', '抖音', 55, 150],
      ['com.tencent.tmgp.sgame', '王者荣耀', 45, 120],
      ['com.smile.gifmaker', '快手', 25, 70],
      ['tv.danmaku.bili', '哔哩哔哩', 35, 90],
      ['com.tencent.mobileqq', 'QQ', 12, 30],
      ['com.taobao.taobao', '淘宝', 14, 35],
      ['com.tencent.qqlive', '腾讯视频', 20, 60],
      ['com.miHoYo.Yuanshen', '原神', 20, 55],
      ['com.sina.weibo', '微博', 10, 25],
      ['com.eg.android.AlipayGphone', '支付宝', 5, 12],
      ['com.ss.android.article.news', '今日头条', 10, 25],
      ['com.netease.cloudmusic', '网易云音乐', 10, 30],
    ],
  },
};

// 每个 App 的最小存在感（分钟），保证挑出来都是「今天真用过」
const MIN_MINUTES = 3;
// 单个 App 硬上限（3 小时）
const MAX_PER_APP = 180;

// ---- 参数 ----
function parseArgs(argv) {
  let days = 3;
  let dates = null;
  for (const a of argv) {
    if (a.startsWith('--date=')) {
      dates = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) {
      dates = (dates || []).concat(a);
    } else if (/^\d+$/.test(a)) {
      days = Math.max(1, Math.min(30, Number(a)));
    } else if (a === '-h' || a === '--help') {
      console.log('用法：node scripts/seed-usage.js [天数=3]  或  node scripts/seed-usage.js --date=YYYY-MM-DD,YYYY-MM-DD ...');
      process.exit(0);
    }
  }
  if (dates && dates.length) {
    for (const d of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`日期格式不对：${d}（要 YYYY-MM-DD）`);
    }
    return { dates: [...new Set(dates)].sort() };
  }
  const today = todayStr();
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDaysStr(today, -i));
  return { dates: out, days };
}

// ---- 指定日期的稳定随机（同一天重复跑，总量不跳变）----
function rngFor(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return function rand() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 生成某人某天的 App 用量（分钟）----
function genDay(uid, profile, date) {
  const rand = rngFor(`${uid}|${date}`);
  const [lo, hi] = profile.range;
  const totalMin = Math.floor(lo + rand() * (hi - lo));

  // 先定「出现几个 App」（8~14），再按权重分时长
  const pool = profile.apps.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const n = Math.min(pool.length, 8 + Math.floor(rand() * 7));
  const picked = pool.slice(0, n);

  const weights = picked.map(([, , w]) => w * (0.55 + rand() * 0.9));
  const wSum = weights.reduce((a, b) => a + b, 0);
  let rows = picked.map(([pkg, name, , max], i) => {
    const raw = (totalMin * weights[i]) / wSum;
    const min = Math.min(MIN_MINUTES + Math.floor(rand() * 5), Math.min(max, MAX_PER_APP));
    let m = Math.round(raw);
    m = Math.max(min, Math.min(m, Math.min(max, MAX_PER_APP)));
    return { packageName: pkg, appName: name, minutes: m };
  });

  // 按比例缩放，让总和贴近目标（逐项夹在 [min, 上限] 之间）
  const sum = () => rows.reduce((a, r) => a + r.minutes, 0);
  let guard = 0;
  while (sum() !== totalMin && guard++ < 60) {
    const diff = totalMin - sum();
    const step = diff > 0 ? 1 : -1;
    // 按权重大小挑一个能动的
    const movable = rows.filter((r) => {
      const cap = Math.min(MAX_PER_APP, profile.apps.find((a) => a[0] === r.packageName)[3]);
      return step > 0 ? r.minutes < cap : r.minutes > MIN_MINUTES;
    });
    if (!movable.length) break;
    movable.sort((a, b) => (step > 0 ? b.minutes - a.minutes : a.minutes - b.minutes));
    // 每次动 1~3 分钟，避免均匀得不像话
    const pick = movable[0];
    const amt = Math.min(Math.abs(diff), 1 + Math.floor(rand() * 3));
    pick.minutes += step * amt;
  }

  // 抹掉可能出现的 0/负值，按秒取整为 60 的整数倍
  rows = rows.filter((r) => r.minutes > 0);
  for (const r of rows) r.seconds = r.minutes * 60;
  rows.sort((a, b) => b.seconds - a.seconds);
  return rows;
}

// ---- 格式化 ----
function human(sec) {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return `${h} 小时 ${mm} 分`;
  if (h) return `${h} 小时`;
  return `${mm} 分`;
}

// 今天那天的 updated_at：最近 10 分钟内（按「第几个 App」错开几秒，看起来像分批上报）
function updatedAtFor(date, today, idx) {
  if (date !== today) {
    // 历史日期：那天晚上 23:4x
    return new Date(new Date(`${date}T23:4${String(idx % 10)}:00+08:00`).getTime()).toISOString();
  }
  return new Date(Date.now() - (idx * 17 + 40) * 1000).toISOString();
}

async function main() {
  const { openDb } = require('../src/db');
  const opt = parseArgs(process.argv.slice(2));
  const today = todayStr();
  const db = await openDb(DATABASE_URL);

  const users = await db.all(`SELECT id, nickname FROM users WHERE id IN (1, 2) ORDER BY id`);
  if (users.length < 2) throw new Error('库里没有 id=1 / id=2 两个用户，先跑 seed-demo.js');

  const summary = [];
  for (const u of users) {
    const profile = PROFILES[u.id];
    if (!profile) continue;
    for (const date of opt.dates) {
      const rows = genDay(u.id, profile, date);
      let total = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        await db.run(
          `INSERT INTO usage_daily (user_id, usage_date, package_name, app_name, seconds, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, usage_date, package_name)
           DO UPDATE SET app_name = EXCLUDED.app_name, seconds = EXCLUDED.seconds, updated_at = EXCLUDED.updated_at`,
          [u.id, date, r.packageName, r.appName, r.seconds, updatedAtFor(date, today, i)]
        );
        total += r.seconds;
      }
      summary.push({ id: u.id, nickname: u.nickname, date, total, count: rows.length, top: rows.slice(0, 3) });
    }
  }

  // 输出摘要
  console.log('时长数据灌好了（可重复执行）：');
  const order = [...opt.dates].sort().reverse();
  for (const date of order) {
    const dayName = date === today ? '今天' : date === addDaysStr(today, -1) ? '昨天' : date.slice(5);
    const list = summary.filter((s) => s.date === date);
    const line = list.map((s) => `${s.nickname} ${dayName} ${human(s.total)}`).join(' ｜ ');
    console.log(`  ${line}`);
    for (const s of list) {
      const tops = s.top.map((r) => `${r.appName} ${Math.round(r.seconds / 60)}分`).join('、');
      console.log(`    ${s.nickname}：${s.count} 个 App，最多的是 ${tops}`);
    }
  }
  await db.pool.end();
}

main().catch((e) => {
  console.error('灌数据失败：', e && e.message ? e.message : e);
  process.exit(1);
});
