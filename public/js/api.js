// API 封装：同源 Cookie 会话，JSON 请求。
const api = {
  generation: 0,
  historyGeneration: 0,
  pending: new Set(),
  invalidateSession(broadcast = true) {
    this.generation += 1;
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
    if (broadcast) try { localStorage.setItem('footprint.auth-change', crypto.randomUUID()); } catch (_) { /* 页面内隔离仍生效 */ }
    window.dispatchEvent(new CustomEvent('footprint:auth-change', { detail: { remote: !broadcast } }));
  },
  clearHistoryViews(broadcast = true) {
    this.historyGeneration += 1;
    if (broadcast) try { localStorage.setItem('footprint.history-cleared', crypto.randomUUID()); } catch (_) { /* 页面内隔离仍生效 */ }
    window.dispatchEvent(new Event('footprint:history-cleared'));
  },
  async req(method, url, body) {
    if (/^\/api\/(?:login|register|demo-login|logout|me\/logout-all)$/.test(url)) this.invalidateSession();
    const generation = this.generation;
    const historyGeneration = this.historyGeneration;
    const controller = new AbortController();
    this.pending.add(controller);
    const opt = { method, headers: {}, credentials: 'same-origin', signal: controller.signal };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opt);
    } catch (e) {
      this.pending.delete(controller);
      if (generation !== this.generation) throw Object.assign(new Error('登录状态已变化'), { code: 'session_changed' });
      throw new Error('网络不通，检查服务是否在跑');
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) { /* 非 JSON */ }
    this.pending.delete(controller);
    if (generation !== this.generation) throw Object.assign(new Error('登录状态已变化'), { code: 'session_changed' });
    if (url.startsWith('/api/zoowy/') && historyGeneration !== this.historyGeneration) throw Object.assign(new Error('聊天已清空'), { code: 'history_cleared' });
    if (!res.ok) {
      const err = new Error((data && data.error) || `请求失败（${res.status}）`);
      err.status = res.status;
      err.code = data?.code;
      throw err;
    }
    return data;
  },
  get(url) { return this.req('GET', url); },
  post(url, body) { return this.req('POST', url, body); },
  put(url, body) { return this.req('PUT', url, body); },
  patch(url, body) { return this.req('PATCH', url, body); },
  delete(url) { return this.req('DELETE', url); },
  async upload(file, kind) {
    let ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    if (['jpeg'].includes(ext)) ext = 'jpg';
    if (!['jpg', 'png', 'webp', 'gif'].includes(ext)) ext = 'jpg';
    let res;
    try {
      res = await fetch(`/api/uploads?ext=${ext}&kind=${kind || 'evidence'}`, {
        method: 'PUT',
        body: file,
        credentials: 'same-origin',
      });
    } catch (e) {
      throw new Error('网络不通，检查服务是否在跑');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data;
  },
};
window.addEventListener('storage', (event) => {
  if (event.key === 'footprint.auth-change') api.invalidateSession(false);
  if (event.key === 'footprint.history-cleared') api.clearHistoryViews(false);
});
