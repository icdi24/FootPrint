// API 封装：同源 Cookie 会话，JSON 请求。
const api = {
  async req(method, url, body) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opt);
    } catch (e) {
      throw new Error('网络不通，检查服务是否在跑');
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) { /* 非 JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `请求失败（${res.status}）`);
      err.status = res.status;
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
