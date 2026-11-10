/* ═══════════════════════════════════════════════════════
   适配层：后端响应 → 前端结构
   后端用 snake_case，前端用 camelCase，这里统一转换
   ═══════════════════════════════════════════════════════ */
(() => {
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

  /* 目标：后端 goal → 前端 goal */
  function adaptGoal(g) {
    if (!g) return null;
    return {
      id: g.id,
      ownerId: g.owner_id ?? g.ownerId,
      type: g.type || 'daily',
      title: g.title || '',
      emoji: g.emoji || '🌱',
      desc: g.description || g.desc || '',
      freqMode: g.freq_mode || 'daily',
      freqN: num(g.freq_n, 3),
      weekdays: Array.isArray(g.weekdays) ? g.weekdays : [],
      durationMin: num(g.duration_min, 30),
      difficulty: num(g.difficulty, 3),
      windowStart: g.window_start || '',
      windowEnd: g.window_end || '',
      startDate: g.start_date || '',
      endDate: g.end_date || '',
      customPoints: num(g.custom_points, 0),
      estTotalMin: num(g.est_total_min, 120),
      criteria: g.accept_criteria || '',
      status: g.status || 'active',
      streak: num(g.streak_count, 0),
      streakBest: num(g.streak_best, 0),
      createdAt: g.created_at ? new Date(g.created_at).getTime() : Date.now(),
      // 后端算好的单次积分（有就用，避免前端重算不一致）
      pointsPer: num(g.perCheckinPoints ?? g.points_per, 0),
    };
  }

  /* 打卡记录 */
  function adaptCheck(c) {
    if (!c) return null;
    return {
      id: c.id,
      goalId: c.goal_id ?? c.goalId,
      userId: c.user_id ?? c.userId,
      date: c.check_date ?? c.date,
      minutes: num(c.duration_min ?? c.minutes, 0),
      points: num(c.points, 0),
      inWindow: !!(c.in_window ?? c.inWindow),
      note: c.evidence_text || c.note || '',
      evidence: c.evidence_url || '',
      status: c.status || 'credited',
      at: c.created_at ? new Date(c.created_at).getTime() : Date.now(),
      isMakeup: !!(c.is_makeup ?? c.isMakeup),
      rejectReason: c.reject_reason || '',
    };
  }

  /* 用户 */
  function adaptUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      name: u.username || u.nickname || u.name || '',
      avatar: u.avatar || '🐾',
      invite: u.invite_code || u.invite || '',
    };
  }

  /* 愿望 */
  function adaptWish(w) {
    if (!w) return null;
    return {
      id: w.id,
      ownerId: w.owner_id,
      kind: w.category === 'goods' ? 'goods' : 'event',
      title: w.title || '',
      emoji: w.emoji || '🎁',
      desc: w.description || '',
      priceCny: num(w.price_cny, 0),
      pointsCost: num(w.points_cost, 0),
      cooldown: num(w.cooldown_days, 0),
      validDays: num(w.valid_days, 0),
      needConfirm: !!w.need_confirm,
      status: w.status || 'active',
      cooldownMsg: w.cooldownMsg || '',
      redeemable: w.redeemable !== false,
    };
  }

  /* 兑换记录 */
  function adaptRedemption(r) {
    if (!r) return null;
    return {
      id: r.id,
      wishId: r.wish_item_id,
      userId: r.user_id,
      title: r.item_title || r.title || '',
      emoji: r.item_emoji || '🎁',
      points: num(r.points_charged ?? r.points_locked ?? r.points, 0),
      status: r.status || 'applied',
      appliedAt: r.applied_at ? new Date(r.applied_at).getTime() : Date.now(),
      kind: r.kind || '',
    };
  }

  /* 大目标 */
  function adaptBigGoal(b) {
    if (!b) return null;
    return {
      id: b.id,
      title: b.title || '',
      emoji: b.emoji || '🎯',
      note: b.description || b.note || '',
      done: num(b.done, 0),
      total: num(b.total, 0),
      progress: num(b.progress, 0),
      chain: Array.isArray(b.chain) ? b.chain.map(adaptChainItem) : [],
    };
  }
  function adaptChainItem(c) {
    return {
      id: c.goal_id ?? c.id,
      title: c.title || '',
      emoji: c.emoji || '📌',
      plannedDate: c.planned_date || '',
      status: c.plan_status === 'done' ? 'done'
        : c.plan_status === 'released' ? 'released' : 'planned',
    };
  }

  /* 使用时长 */
  function adaptUsage(u) {
    if (!u) return { today: { total: 0, apps: [] }, week: [0, 0, 0, 0, 0, 0, 0] };
    const apps = Array.isArray(u.apps) ? u.apps.map((a) => ({
      name: a.appName || a.app_name || a.name || '其他',
      sec: num(a.seconds ?? a.sec, 0),
    })) : [];
    return {
      today: { total: num(u.totalSeconds ?? u.total, 0), apps },
      week: Array.isArray(u.series) ? u.series.map((p) => num(p.totalSeconds, 0)) : [0, 0, 0, 0, 0, 0, 0],
    };
  }

  window.FP_ADAPT = {
    num, adaptGoal, adaptCheck, adaptUser, adaptWish, adaptRedemption,
    adaptBigGoal, adaptChainItem, adaptUsage,
  };
})();
