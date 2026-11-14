/* ═══════════════════════════════════════════════════════
   API 层：桌面端 Web 与后端的唯一通道
   后端：Express + PostgreSQL，接口前缀 /api
   约定：所有请求带 cookie 会话；失败抛 ApiError
   ═══════════════════════════════════════════════════════ */
(() => {
  const BASE = '/api';

  class ApiError extends Error {
    constructor(status, message, payload) {
      super(message || '请求失败');
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload;
    }
  }

  async function request(method, path, body, opts = {}) {
    const init = {
      method,
      credentials: 'same-origin',
      headers: {},
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(BASE + path, init);
    } catch (e) {
      throw new ApiError(0, '网络不通，检查后端是否在运行', e);
    }
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => null);
    }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `请求失败（${res.status}）`;
      throw new ApiError(res.status, msg, data);
    }
    return data;
  }

  const api = {
    ApiError,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b === undefined ? {} : b),
    put: (p, b) => request('PUT', p, b === undefined ? {} : b),
    patch: (p, b) => request('PATCH', p, b === undefined ? {} : b),
    del: (p) => request('DELETE', p),

    /* ── 账号 ── */
    bootstrap: () => api.get('/bootstrap'),
    me: () => api.get('/me'),
    register: (username, password, avatar) => api.post('/register', { username, password, avatar }),
    login: (username, password) => api.post('/login', { username, password }),
    demoLogin: (slot) => api.post('/demo-login', { slot }),
    logout: () => api.post('/logout'),
    updateMe: (patch) => api.patch('/me', patch),
    changePassword: (oldPassword, newPassword) => api.post('/me/password', { oldPassword, newPassword }),
    mySettings: () => api.get('/me/settings'),
    saveMySettings: (patch) => api.put('/me/settings', patch),
    profile: () => api.get('/me/profile'),
    saveProfileBlock: (block, content) => api.put(`/me/profile/${block}`, { content }),
    profileChanges: (limit) => api.get(`/me/profile/changes${limit ? `?limit=${limit}` : ''}`),
    profileVersions: () => api.get('/me/profile/versions'),

    /* ── 配对 ── */
    pairStatus: () => api.get('/pair/status'),
    pairInvite: () => api.post('/pair/invite'),
    pairJoin: (code) => api.post('/pair/join', { code }),
    pairApprove: (id) => api.post(`/pair/request/${id}/approve`),
    pairReject: (id) => api.post(`/pair/request/${id}/reject`),
    pairUnbind: () => api.post('/pair/unbind'),

    /* ── 首页 / 统计 ── */
    home: () => api.get('/home'),
    ledger: () => api.get('/ledger'),
    stats: () => api.get('/stats'),
    pointsSettings: () => api.get('/settings'),
    savePointsSettings: (points) => api.put('/settings', { points }),
    partner: () => api.get('/partner'),

    /* ── 目标 ── */
    goals: (type) => api.get(`/goals${type ? `?type=${type}` : ''}`),
    goal: (id) => api.get(`/goals/${id}`),
    createGoal: (payload) => api.post('/goals', payload),
    updateGoal: (id, payload) => api.put(`/goals/${id}`, payload),
    startGoal: (id) => api.post(`/goals/${id}/start`),
    abandonGoal: (id) => api.post(`/goals/${id}/abandon`),
    goalsWeek: (start) => api.get(`/goals/week${start ? `?start=${start}` : ''}`),
    goalsMonth: (month) => api.get(`/goals/month${month ? `?month=${month}` : ''}`),
    previewPoints: (payload) => api.post('/points/preview', payload),

    /* ── 打卡与审核 ── */
    checkin: (goalId, payload) => api.post(`/goals/${goalId}/checkin`, payload),
    revokeCheckin: (id) => api.post(`/checkins/${id}/revoke`),
    rejectCheckin: (id, reason) => api.post(`/checkins/${id}/reject`, { reason }),
    checkins: () => api.get('/checkins'),
    submitVerify: (goalId, payload) => api.post(`/goals/${goalId}/submit`, payload),
    pendingVerifications: () => api.get('/verifications/pending'),
    verificationDetail: (id) => api.get(`/verifications/${id}/detail`),
    approveVerification: (id) => api.post(`/verifications/${id}/approve`),
    rejectVerification: (id, reason) => api.post(`/verifications/${id}/reject`, { reason }),

    /* ── 愿望单 ── */
    wishes: () => api.get('/wish'),
    partnerWishes: (uid) => api.get(`/wish?user=${encodeURIComponent(uid)}`),
    createWish: (payload) => api.post('/wish', payload),
    updateWish: (id, payload) => api.put(`/wish/${id}`, payload),
    deleteWish: (id) => api.del(`/wish/${id}`),
    redeem: (id) => api.post(`/wish/${id}/redeem`),
    cancelRedemption: (id) => api.post(`/redemptions/${id}/cancel`),
    doneRedemption: (id) => api.post(`/redemptions/${id}/done`),

    /* ── 大目标 ── */
    bigGoals: () => api.get('/biggoals'),
    bigGoal: (id) => api.get(`/biggoals/${id}`),
    createBigGoal: (payload) => api.post('/biggoals', payload),
    updateBigGoal: (id, payload) => api.patch(`/biggoals/${id}`, payload),
    deleteBigGoal: (id) => api.del(`/biggoals/${id}`),
    addChainGoal: (id, payload) => api.post(`/biggoals/${id}/goals`, payload),
    updateChainGoal: (id, goalId, payload) => api.patch(`/biggoals/${id}/goals/${goalId}`, payload),
    removeChainGoal: (id, goalId) => api.del(`/biggoals/${id}/goals/${goalId}`),
    shiftBigGoal: (id, payload) => api.post(`/biggoals/${id}/shift`, payload),

    /* ── 状态 ── */
    status: () => api.get('/status'),
    setStatus: (payload) => api.put('/status', payload),
    clearStatus: () => api.del('/status'),

    /* ── 聊天 ── */
    chat: () => api.get('/chat'),
    chatMessages: (before, limit) => api.get(`/chat/messages?${before ? `before=${before}&` : ''}limit=${limit || 40}`),
    sendChat: (content) => api.post('/chat/messages', { content }),
    chatRead: (upToId) => api.post('/chat/read', { upToId }),

    /* ── 使用时长 ── */
    usageToday: () => api.get('/usage/today'),
    usagePartner: () => api.get('/usage/partner'),
    usageRange: (days) => api.get(`/usage/range?days=${days || 7}`),

    /* ── 匹配大厅 ── */
    hall: () => api.get('/hall'),
    publishHall: (note) => api.post('/hall', { note }),
    withdrawHall: () => api.del('/hall'),
    inviteHall: (toUserId) => api.post('/hall/invite', { toUserId }),
    acceptHallInvite: (id) => api.post(`/hall/invite/${id}/accept`),
    declineHallInvite: (id) => api.post(`/hall/invite/${id}/decline`),

    /* ── 备份 ── */
    backups: () => api.get('/backups'),
    createBackup: () => api.post('/backups'),
  };

  window.FP_API = api;
})();
