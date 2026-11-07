// 关系层：组查询与可见性判定的唯一入口（阶段 1 建骨架，阶段 4 收口全部调用点）
async function currentPairId(db, userId) {
  const r = await db.get('SELECT pair_id FROM pair_members WHERE user_id = ?', [userId]);
  return r ? Number(r.pair_id) : null;
}

async function pairOf(db, userId) {
  const pid = await currentPairId(db, userId);
  if (!pid) return null;
  const r = await db.get(
    'SELECT u.* FROM pair_members pm JOIN users u ON u.id = pm.user_id WHERE pm.pair_id = ? AND pm.user_id != ?',
    [pid, userId]
  );
  return r || null;
}

async function canAccess(db, meId, targetUserId) {
  if (Number(meId) === Number(targetUserId)) return true;
  const pid = await currentPairId(db, meId);
  if (!pid) return false;
  const r = await db.get('SELECT 1 FROM pair_members WHERE pair_id = ? AND user_id = ?', [pid, targetUserId]);
  return !!r;
}

module.exports = { currentPairId, pairOf, canAccess };
