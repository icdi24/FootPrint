// 积分体系：公式与系数（需求 5.2），规则可调、默认值给死（P4）。
const DEFAULT_POINTS = {
  unit: 0.5, // 基础分单价（分/分钟）
  cap: 60, // 单次基础分封顶
  maxPer: 300, // 单次积分硬上限
  difficulty: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.2 },
  freq: { daily: 1.0, weekly34: 1.2, weekly12: 1.5, weekdays: 1.0 },
  window: { in: 1.1, none: 1.0, out: 0.8 },
  milestones: [
    { n: 3, p: 10 },
    { n: 7, p: 25 },
    { n: 14, p: 50 },
    { n: 30, p: 120 },
    { n: 60, p: 300 },
    { n: 100, p: 700 },
    { n: 365, p: 3000 },
  ],
};

const SETTINGS_KEY = 'points';

async function ensureSettings(db) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEY]);
  if (!row) {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [SETTINGS_KEY, JSON.stringify(DEFAULT_POINTS)]);
  }
}

async function getPoints(db) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEY]);
  if (!row) return { ...DEFAULT_POINTS };
  try {
    const parsed = JSON.parse(row.value);
    return {
      unit: Number(parsed.unit ?? DEFAULT_POINTS.unit),
      cap: Number(parsed.cap ?? DEFAULT_POINTS.cap),
      maxPer: Number(parsed.maxPer ?? DEFAULT_POINTS.maxPer),
      difficulty: { ...DEFAULT_POINTS.difficulty, ...(parsed.difficulty || {}) },
      freq: { ...DEFAULT_POINTS.freq, ...(parsed.freq || {}) },
      window: { ...DEFAULT_POINTS.window, ...(parsed.window || {}) },
      milestones: Array.isArray(parsed.milestones) ? parsed.milestones : DEFAULT_POINTS.milestones,
    };
  } catch (e) {
    return { ...DEFAULT_POINTS };
  }
}

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// 校验并落库（部分更新）
async function setPoints(db, patch) {
  const cur = await getPoints(db);
  const next = JSON.parse(JSON.stringify(cur));
  const errors = [];
  if (patch.unit !== undefined) {
    if (!isFiniteNum(patch.unit) || patch.unit < 0.1 || patch.unit > 2) errors.push('单价需在 0.1–2 之间');
    else next.unit = patch.unit;
  }
  if (patch.cap !== undefined) {
    if (!isFiniteNum(patch.cap) || patch.cap < 10 || patch.cap > 200) errors.push('单次封顶需在 10–200 之间');
    else next.cap = patch.cap;
  }
  if (patch.maxPer !== undefined) {
    if (!isFiniteNum(patch.maxPer) || patch.maxPer < 50 || patch.maxPer > 300) errors.push('单次硬上限需在 50–300 之间');
    else next.maxPer = patch.maxPer;
  }
  if (patch.difficulty) {
    for (const [k, v] of Object.entries(patch.difficulty)) {
      if (!isFiniteNum(v) || v < 0.5 || v > 5) errors.push(`难度 ${k} 系数需在 0.5–5 之间`);
      else next.difficulty[k] = v;
    }
  }
  if (patch.freq) {
    for (const [k, v] of Object.entries(patch.freq)) {
      if (!isFiniteNum(v) || v < 0.5 || v > 3) errors.push(`频率系数 ${k} 需在 0.5–3 之间`);
      else next.freq[k] = v;
    }
  }
  if (patch.window) {
    for (const [k, v] of Object.entries(patch.window)) {
      if (!isFiniteNum(v) || v < 0.5 || v > 2) errors.push(`时段系数 ${k} 需在 0.5–2 之间`);
      else next.window[k] = v;
    }
  }
  if (patch.milestones) {
    if (!Array.isArray(patch.milestones) || patch.milestones.length < 1 || patch.milestones.length > 8) {
      errors.push('里程碑表需为 1–8 条');
    } else {
      for (const m of patch.milestones) {
        if (!Number.isInteger(m.n) || m.n < 1 || !Number.isInteger(m.p) || m.p < 1) {
          errors.push('里程碑条目需为正整数');
          break;
        }
      }
      if (!errors.length) next.milestones = patch.milestones;
    }
  }
  if (errors.length) return { ok: false, errors };
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [SETTINGS_KEY, JSON.stringify(next)]
  );
  return { ok: true, cfg: next };
}

function freqFactor(goal, cfg) {
  if (goal.freq_mode === 'daily') return cfg.freq.daily;
  if (goal.freq_mode === 'weekly') return goal.freq_n >= 3 ? cfg.freq.weekly34 : cfg.freq.weekly12;
  return cfg.freq.weekdays;
}

// 供外部传 cfg，避免重复读库
function calcPoints(goal, durationMin, inWindow, cfg) {
  const B = Math.min(durationMin * cfg.unit, cfg.cap);
  const D = cfg.difficulty[goal.difficulty] || 1.5;
  const F = freqFactor(goal, cfg);
  const T = inWindow
    ? cfg.window.in
    : goal.window_start
      ? cfg.window.out
      : cfg.window.none;
  return Math.min(Math.round(B * D * F * T), cfg.maxPer);
}

// 性价比 = 单次积分 ÷ (时长 × 难度系数)；只反映频率与时段加成（需求 5.3）
function valueRatio(goal, cfg) {
  const B = Math.min(goal.duration_min * cfg.unit, cfg.cap);
  const D = cfg.difficulty[goal.difficulty] || 1.5;
  const F = freqFactor(goal, cfg);
  const T = goal.window_start ? cfg.window.in : cfg.window.none;
  return (B * D * F * T) / (goal.duration_min * D);
}

module.exports = { DEFAULT_POINTS, ensureSettings, getPoints, setPoints, calcPoints, freqFactor, valueRatio };
