// 小目标验收超时自动通过：pending 超过 48h 的验收自动通过（需求 7.4，可关）。
const { nowIso } = require('./tz');

const AUTO_APPROVE_HOURS = 48;

// 扫描并处理超时的 pending 验收；返回处理条数。
async function autoApproveOverdue(db, logMod) {
  try {
    const cutoff = new Date(Date.now() - AUTO_APPROVE_HOURS * 3600 * 1000).toISOString();
    const pending = await db.all(
      `SELECT * FROM verifications WHERE status = 'pending' AND created_at < ?`,
      [cutoff]
    );
    let done = 0;
    for (const v of pending) {
      const g = await db.get('SELECT * FROM goals WHERE id = ?', [v.goal_id]);
      if (!g) continue;
      const { ledgerAdd, tx } = require('./db');
      const approved = await tx(db, async (c) => {
        const update = await c.run(`UPDATE verifications SET status='approved', decided_at=? WHERE id=? AND status='pending'`, [nowIso(), v.id]);
        if (!update.changes) return false;
        await c.run(`UPDATE goals SET status='achieved', updated_at=? WHERE id=?`, [nowIso(), g.id]);
        const points = Number(g.total_points) || 0;
        if (points > 0) {
          await ledgerAdd(c, {
            userId: g.owner_id,
            delta: points,
            type: 'stage_credit',
            refType: 'verification',
            refId: v.id,
            note: `小目标「${g.title}」超时自动通过`,
          });
        }
        return true;
      });
      if (!approved) continue;
      if (logMod) logMod.log('verify_auto', `小目标「${g.title}」超时自动通过 +${g.total_points} 分`);
      done += 1;
    }
    return done;
  } catch (e) {
    if (logMod) logMod.log('verify_auto_fail', String(e.message));
    return 0;
  }
}

// 每 10 分钟检查一次。
function scheduleAutoApprove(db, logMod) {
  const tick = () => { autoApproveOverdue(db, logMod); };
  setInterval(tick, 10 * 60 * 1000);
  tick();
}

module.exports = { autoApproveOverdue, scheduleAutoApprove, AUTO_APPROVE_HOURS };
