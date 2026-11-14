// 画像变更留痕与版本回滚：让「AI 改了什么」可查、可送达、可回滚。
// 铁律：reportChanges 只控制「告不告诉」，不控制「留不留痕」——日志与版本快照无条件写。
const { nowIso } = require('./tz');
const { getUserSettings } = require('./settings');
const { tx } = require('./db');

const BLOCK_LABELS = {
  basic: '基本情况', resume: '简历', skills: '能力',
  goal_progress: '目标进展', important: '重要信息',
};
function label(block) { return BLOCK_LABELS[block] || block; }

function summarize(changes) {
  if (!Array.isArray(changes) || !changes.length) return '';
  return changes.map((c) => {
    const name = label(c.block);
    if (c.op === 'delete') return `${name}标为失效`;
    if (c.op === 'rollback') return `回滚到版本 ${c.versionId || c.reason}`;
    if (c.op === 'add') return `新增${name}`;
    return `更新${name}`;
  }).join('、');
}

// 每次画像真正发生变化后调用一次。changes 由 tools.js : applyProfilePatch() 产出并已做 diff。
async function recordChange(db, { userId, workflow, changes, versionId = null }) {
  if (!Array.isArray(changes) || !changes.length) return null;
  const st = await getUserSettings(db, userId);
  const reported = st.reportChanges ? 1 : 0;
  const summary = summarize(changes);
  const info = await db.run(
    `INSERT INTO profile_changes (user_id, workflow, summary, detail, reported, is_read, version_id, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?) RETURNING id`,
    [userId, workflow || 'ai', summary, JSON.stringify(changes), reported, versionId, nowIso()]
  );
  return { id: Number(info.id), summary, reported: Boolean(reported), changes };
}

// 全部留痕都返回；只有 reported=1 且未读的计入 unread（关掉开关仍能在历史里翻到）。
async function listChanges(db, userId, limit = 30) {
  const rows = await db.all(
    'SELECT * FROM profile_changes WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    [userId, Math.max(1, Math.min(100, Number(limit) || 30))]
  );
  return {
    unread: rows.filter((r) => Number(r.reported) && !Number(r.is_read)).length,
    items: rows.map((r) => ({
      id: r.id,
      workflow: r.workflow,
      summary: r.summary,
      detail: safeParse(r.detail),
      reported: Boolean(Number(r.reported)),
      read: Boolean(Number(r.is_read)),
      versionId: r.version_id,
      createdAt: r.created_at,
    })),
  };
}

async function markRead(db, userId) {
  await db.run('UPDATE profile_changes SET is_read = 1 WHERE user_id = ? AND reported = 1 AND is_read = 0', [userId]);
}

async function listVersions(db, userId, limit = 20) {
  const rows = await db.all(
    'SELECT id, snapshot, changed_by, reason, created_at FROM profile_versions WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    [userId, Math.max(1, Math.min(50, Number(limit) || 20))]
  );
  return rows.map((r) => {
    let blockCount = 0;
    try { blockCount = JSON.parse(r.snapshot).length; } catch (e) { /* 坏快照按 0 处理 */ }
    return {
      id: r.id, changedBy: r.changed_by, reason: r.reason,
      createdAt: r.created_at, blockCount,
    };
  });
}

// 回滚：先给「当前状态」存一份快照，再按目标快照重建。回滚本身也记一条变更。
async function rollback(db, userId, versionId) {
  if (!db.inTransaction) return tx(db, (c) => rollback(c, userId, versionId));
  await db.get('SELECT pg_advisory_xact_lock(7395, ?)', [userId]);
  const v = await db.get('SELECT * FROM profile_versions WHERE id = ? AND user_id = ?', [Number(versionId), userId]);
  if (!v) throw new Error('版本不存在或不是你的');
  let snap;
  try { snap = JSON.parse(v.snapshot); } catch (e) { throw new Error('版本快照损坏，无法回滚'); }
  if (!Array.isArray(snap)) throw new Error('版本快照格式异常，无法回滚');

  const current = await db.all(
    'SELECT block, content, source, status, shared FROM user_profiles WHERE user_id = ? ORDER BY block', [userId]
  );
  await db.run(
    'INSERT INTO profile_versions (user_id, snapshot, changed_by, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, JSON.stringify(current), 'user', `rollback:before:${versionId}`, nowIso()]
  );
  // 不整表删：快照里没有的块只标失效（保留 shared / 历史），避免物理删除丢分享标记
  const snapMap = new Map(snap.map((b) => [b.block, b]));
  for (const b of current) {
    if (!snapMap.has(b.block)) {
      await db.run("UPDATE user_profiles SET status = 'void', updated_at = ? WHERE user_id = ? AND block = ?",
        [nowIso(), userId, b.block]);
    }
  }
  for (const b of snap) {
    const cur = current.find((c) => c.block === b.block);
    await db.run(
      `INSERT INTO user_profiles (user_id, block, content, source, status, shared, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, block) DO UPDATE SET content = EXCLUDED.content, source = EXCLUDED.source,
         status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      [userId, b.block, b.content || '', b.source || 'ai', b.status || 'active', cur ? cur.shared : 0, nowIso()]
    );
  }
  await recordChange(db, {
    userId, workflow: 'user',
    changes: [{ op: 'rollback', block: '-', reason: `回滚到版本 ${versionId}`, evidence: `version ${versionId}`, versionId: Number(versionId) }],
    versionId: Number(versionId),
  });
  return { restored: snap.length, versionId: Number(versionId) };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return []; }
}

module.exports = { recordChange, listChanges, markRead, listVersions, rollback, summarize, label };
