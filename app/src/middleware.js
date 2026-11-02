// 路由中间件：会话认证 + 越权校验（本人或搭档）。
const { userByToken, parseCookies, COOKIE_NAME } = require('./auth');

function makeMiddleware(db) {
  function attachUser(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    req.user = userByToken(db, cookies[COOKIE_NAME]) || null;
    req.token = cookies[COOKIE_NAME] || null;
    next();
  }

  function requireUser(req, res, next) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    next();
  }

  function partnerOf(userId) {
    const row = db.prepare('SELECT * FROM users WHERE id != ? ORDER BY id LIMIT 1').get(userId);
    return row || null;
  }

  // 目标：本人（可写）或搭档（只读）
  function loadGoal(req, res, next) {
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(Number(req.params.id) || 0);
    if (!goal) return res.status(404).json({ error: '目标不存在' });
    const partner = partnerOf(req.user.id);
    if (goal.owner_id !== req.user.id && (!partner || goal.owner_id !== partner.id)) {
      return res.status(403).json({ error: '无权访问' });
    }
    req.goal = goal;
    req.goalIsOwner = goal.owner_id === req.user.id;
    next();
  }

  function requireGoalOwner(req, res, next) {
    loadGoal(req, res, () => {
      if (!req.goalIsOwner) return res.status(403).json({ error: '只能操作自己的目标' });
      next();
    });
  }

  return { attachUser, requireUser, partnerOf, loadGoal, requireGoalOwner };
}

module.exports = { makeMiddleware };
