const { todayStr } = require('../tz');

async function readChatStatus(db, userId) {
  const today = todayStr();
  const [summary, rows] = await Promise.all([
    db.get(`SELECT
      (SELECT COUNT(*) FROM goals WHERE owner_id=? AND type='daily' AND status='active') AS active_habits,
      (SELECT COUNT(DISTINCT c.goal_id) FROM check_ins AS c JOIN goals AS g ON g.id=c.goal_id
        WHERE c.user_id=? AND g.owner_id=? AND g.type='daily' AND c.check_date=? AND c.status='credited') AS checked_today,
      (SELECT COUNT(*) FROM big_goals WHERE owner_id=? AND status='active') AS active_big_goals`,
    [userId, userId, userId, today, userId]),
    db.all(`WITH recent AS (
        SELECT id,title,updated_at FROM big_goals WHERE owner_id=? AND status='active'
        ORDER BY updated_at DESC,id DESC LIMIT 6
      )
      SELECT b.id,b.title,
        COUNT(g.id) FILTER (WHERE g.status='draft') AS pending,
        COUNT(g.id) FILTER (WHERE g.status='active') AS in_progress,
        COUNT(g.id) FILTER (WHERE g.status='reviewing') AS awaiting_review,
        COUNT(g.id) FILTER (WHERE g.status='achieved') AS completed
      FROM recent AS b LEFT JOIN goals AS g ON g.big_goal_id=b.id AND g.owner_id=?
      GROUP BY b.id,b.title,b.updated_at ORDER BY b.updated_at DESC,b.id DESC`, [userId, userId]),
  ]);
  return {
    date: today,
    checkIns: { creditedToday: Number(summary.checked_today), activeHabits: Number(summary.active_habits) },
    activeBigGoals: Number(summary.active_big_goals),
    recentBigGoals: rows.map((row) => ({ id: row.id, title: row.title, pending: Number(row.pending),
      inProgress: Number(row.in_progress), awaitingReview: Number(row.awaiting_review), completed: Number(row.completed) })),
  };
}

module.exports = { readChatStatus };
