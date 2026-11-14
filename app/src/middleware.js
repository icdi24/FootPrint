// 路由中间件：会话认证 + 越权校验（同组成员）。关系判定统一收口到 pair.js
const { userByToken, parseCookies, COOKIE_NAME } = require('./auth');
const { currentPairId, pairOf, canAccess } = require('./pair');

function makeMiddleware(db) {
  async function attachUser(req, res, next) {
    try {
      const cookies = parseCookies(req.headers.cookie);
      req.user = (await userByToken(db, cookies[COOKIE_NAME])) || null;
      req.token = cookies[COOKIE_NAME] || null;

      // 本地部署模式：跳过登录，自动使用指定演示账号（仅 LOCAL_NO_LOGIN=1 时生效，线上不触发）
      if (!req.user && String(process.env.LOCAL_NO_LOGIN || '').toLowerCase() === '1') {
        const wanted = process.env.LOCAL_LOGIN_USER || '栗子';
        req.user = await db.get(
          'SELECT * FROM users WHERE login_name = ? OR nickname = ? ORDER BY id LIMIT 1',
          [wanted, wanted]
        ) || await db.get('SELECT * FROM users ORDER BY id LIMIT 1');
        req.token = 'local-no-login';
      }

      next();
    } catch (e) {
      next(e);
    }
  }

  function requireUser(req, res, next) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.user || !Number(req.user.is_admin)) return res.status(403).json({ error: '需要管理员权限' });
    next();
  }

  // 同 pair_id 的另一个成员；无组返回 null（老 partner_id / count==2 回退已废弃）
  async function partnerOf(userId) {
    return pairOf(db, userId);
  }

  // 目标：本人（可写）或同组成员（只读）
  async function loadGoal(req, res, next) {
    try {
      const goal = await db.get('SELECT * FROM goals WHERE id = ?', [Number(req.params.id) || 0]);
      if (!goal) return res.status(404).json({ error: '目标不存在' });
      if (!(await canAccess(db, req.user.id, goal.owner_id))) {
        return res.status(403).json({ error: '无权访问' });
      }
      req.goal = goal;
      req.goalIsOwner = goal.owner_id === req.user.id;
      next();
    } catch (e) {
      next(e);
    }
  }

  async function requireGoalOwner(req, res, next) {
    await loadGoal(req, res, () => {
      if (!req.goalIsOwner) return res.status(403).json({ error: '只能操作自己的目标' });
      next();
    });
  }

  return {
    attachUser, requireUser, requireAdmin, partnerOf, loadGoal, requireGoalOwner,
    canAccess: (meId, targetId) => canAccess(db, meId, targetId),
    currentPairId: (userId) => currentPairId(db, userId),
  };
}

module.exports = { makeMiddleware };
