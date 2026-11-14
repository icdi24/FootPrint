// 搭档（我们）页：对方目标、今日打卡、驳回入口、并排对比。
const express = require('express');
const { todayStr } = require('../tz');
const { getPoints, calcPoints } = require('../points');
const { statsFor } = require('../stats');

module.exports = function partnerRoutes(db) {
  const r = express.Router();
  const mw = require('../middleware').makeMiddleware(db);

  r.get('/partner', mw.requireUser, async (req, res, next) => {
    try {
      const partner = await mw.partnerOf(req.user.id);
      if (!partner) {
        return res.json({ partner: null, empty: true, myStats: await statsFor(db, req.user.id) });
      }
      const cfg = await getPoints(db);
      const today = todayStr();

      const goals = await db.all(
        `SELECT * FROM goals WHERE owner_id = ? AND status IN ('active','achieved','abandoned') ORDER BY id DESC`,
        [partner.id]
      );

      const todayRows = await db.all(
        `SELECT ci.*, g.title AS goal_title, g.emoji AS goal_emoji FROM check_ins ci
         JOIN goals g ON g.id = ci.goal_id
         WHERE ci.user_id = ? AND ci.check_date = ? AND ci.status IN ('credited','rejected','revoked')
         ORDER BY ci.id DESC`,
        [partner.id, today]
      );

      const recentReds = await db.all(
        `SELECT r.*, w.title AS item_title, w.emoji AS item_emoji FROM redemptions r
         LEFT JOIN wish_items w ON w.id = r.wish_item_id
         WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 10`,
        [partner.id]
      );

      const dueGoals = goals.filter((g) => g.status === 'active').length;
      function dueOn(g, date) {
        if (date < g.start_date) return false;
        if (g.end_date && date > g.end_date) return false;
        if (g.freq_mode === 'daily') return true;
        if (g.freq_mode === 'weekdays') {
          const wd = new Set(String(g.weekdays || '').split(',').map(Number).filter(Boolean));
          const d = new Date(date + 'T00:00:00Z');
          return wd.has(d.getUTCDay() === 0 ? 7 : d.getUTCDay());
        }
        return false;
      }
      const expectedToday = goals.filter((g) => g.status === 'active' && dueOn(g, today)).length;
      // 待我验收的小目标（对方提交、我是 reviewer）
      const pendingVerifications = await db.all(
        `SELECT v.*, g.title AS goal_title, g.emoji AS goal_emoji, g.total_points, g.accept_criteria,
                u.nickname AS submitter_username, u.avatar AS submitter_avatar
         FROM verifications v
         JOIN goals g ON g.id = v.goal_id
         JOIN users u ON u.id = v.submitter_id
         WHERE v.reviewer_id = ? AND v.status = 'pending' ORDER BY v.id DESC`,
        [req.user.id]
      );
      // 对方大目标（P3-#18：大目标 + 进度条全可见；链上未启动的不出现）
      const partnerBigGoals = await db.all(
        "SELECT id, title, emoji, description, progress, progress_note, progress_at, status FROM big_goals WHERE owner_id = ? AND status != 'archived' ORDER BY id DESC",
        [partner.id]
      );
      for (const bg of partnerBigGoals) {
        const cnt = await db.get(
          "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'achieved') AS done FROM goals WHERE big_goal_id = ? AND owner_id = ? AND status != 'archived' AND plan_status != 'planned'",
          [bg.id, partner.id]
        );
        bg.done = Number(cnt.done);
        bg.total = Number(cnt.total);
      }

      // 对方主动分享的：不再按 pair_id 过滤。
      // 配对前产生的数据 pair_id 为 NULL，搭档身份已由 pair_members 保证，这里只按人 + shared 判定。
      const sharedDiaries = await db.all(
        `SELECT diary_date, ai_original, user_edited, updated_at FROM diaries
         WHERE user_id = ? AND shared = 1 ORDER BY diary_date DESC LIMIT 7`,
        [partner.id]
      );
      const sharedProfile = await db.all(
        "SELECT block, content, updated_at FROM user_profiles WHERE user_id = ? AND shared = 1 AND status = 'active' ORDER BY block",
        [partner.id]
      );

      res.json({
        partner: { id: partner.id, username: partner.login_name, avatar: partner.avatar },
        partnerStats: await statsFor(db, partner.id),
        myStats: await statsFor(db, req.user.id),
        partnerBigGoals,
        sharedDiaries: sharedDiaries.map((d) => ({
          diary_date: d.diary_date,
          content: d.user_edited || d.ai_original,
          updated_at: d.updated_at,
        })),
        sharedProfile,
        partnerGoals: goals.map((g) => ({
          id: g.id,
          owner_id: g.owner_id,
          type: g.type,
          title: g.title,
          emoji: g.emoji,
          description: g.description,
          accept_criteria: g.accept_criteria,
          total_points: g.total_points,
          freq_mode: g.freq_mode,
          freq_n: g.freq_n,
          weekdays: g.weekdays,
          start_date: g.start_date,
          end_date: g.end_date,
          duration_min: g.duration_min,
          difficulty: g.difficulty,
          status: g.status,
          streak: g.streak_count,
          perCheckinPoints: calcPoints(g, g.duration_min, false, cfg),
        })),
        partnerToday: todayRows.map((ci) => ({
          id: ci.id,
          goalId: ci.goal_id,
          goalTitle: ci.goal_title,
          goalEmoji: ci.goal_emoji,
          points: Number(ci.points),
          durationMin: Number(ci.duration_min),
          evidenceText: ci.evidence_text,
          evidenceUrl: ci.evidence_id ? `/api/file/${ci.evidence_id}` : null,
          status: ci.status,
          createdAt: ci.created_at,
        })),
        partnerRecentRedemptions: recentReds,
        pendingVerifications,
        today: { dueGoals, expected: expectedToday, checked: todayRows.filter((x) => x.status === 'credited').length },
      });
    } catch (e) { next(e); }
  });

  return r;
};
