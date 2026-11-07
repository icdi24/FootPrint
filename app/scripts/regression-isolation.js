// 组间隔离黑盒回归：断言 A 组读不到 B 组任何资源
// 独立运行：REG_BASE_URL=http://127.0.0.1:3000 node scripts/regression-isolation.js
// 作为模块：await require('./scripts/regression-isolation').run()
// 可选 REG_ACCOUNTS='[{"loginName":"...","password":"...","partner":"..."}]'
const http = require('http');
const https = require('https');
const assert = require('assert');

const BASE = process.env.REG_BASE_URL || 'http://127.0.0.1:3000';
const ACCOUNTS = process.env.REG_ACCOUNTS ? JSON.parse(process.env.REG_ACCOUNTS) : [
  { loginName: '栗子', password: 'lizi123', partner: '阿白' },
  { loginName: '阿白', password: 'abai123', partner: '栗子' },
  { loginName: 'icdi', password: '123456', partner: 'sushi' },
  { loginName: 'sushi', password: '123456', partner: 'icdi' },
];

function req(method, urlPath, body, cookie) {
  return new Promise((resolve) => {
    const u = new URL(BASE + urlPath);
    const mod = u.protocol === 'https:' ? https : http;
    const headers = {};
    let payload = null;
    if (body) {
      payload = Buffer.from(JSON.stringify(body), 'utf8');
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    if (cookie) headers.Cookie = cookie;
    const r = mod.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d, cookie: res.headers['set-cookie'] }));
    });
    r.on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message }));
    r.setTimeout(8000, () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT ' + urlPath }); });
    if (payload) r.write(payload);
    r.end();
  });
}

async function run() {
  assert(ACCOUNTS.length >= 4, '至少要有两对共 4 个账号');
  const s = [];
  for (const a of ACCOUNTS) {
    const r = await req('POST', '/api/login', { loginName: a.loginName, password: a.password });
    assert.strictEqual(r.status, 200, `${a.loginName} 登录失败: ${r.body}`);
    assert(r.cookie && r.cookie.length, '登录应下发 cookie');
    s.push({ ...a, cookie: r.cookie[0].split(';')[0], id: JSON.parse(r.body).user.id });
  }
  console.log('[1] ' + s.length + ' 个账号登录成功');

  for (const x of s) {
    const r = await req('GET', '/api/home', null, x.cookie);
    assert.strictEqual(r.status, 200, `${x.loginName} 首页失败: ${r.body}`);
    const h = JSON.parse(r.body);
    assert(h.partner && h.partner.nickname === x.partner,
      `${x.loginName} 的搭档应是 ${x.partner}，实际 ${h.partner ? h.partner.nickname : '无'}`);
    const p = await req('GET', '/api/partner', null, x.cookie);
    assert.strictEqual(p.status, 200, `${x.loginName} 的「我们」页失败: ${p.body}`);
    const pd = JSON.parse(p.body);
    assert(pd.partner && pd.partner.nickname === x.partner, `${x.loginName} 的「我们」页搭档错`);
  }
  console.log('[2] 两对互绑，首页与「我们」页搭档均正确');

  const [a, b, c, d] = s;
  for (const [me, other] of [[a, c], [a, d], [c, a], [c, b]]) {
    const r = await req('GET', `/api/stats?user=${other.id}`, null, me.cookie);
    assert.strictEqual(r.status, 403, `${me.loginName} 不应能查 ${other.loginName} 的统计（实际 ${r.status}）`);
  }
  console.log('[3] 跨组统计全部 403');

  const pr = await req('GET', '/api/partner', null, c.cookie);
  const pd = JSON.parse(pr.body);
  const otherGoalIds = (pd.partnerGoals || []).map((g) => g.id);
  if (otherGoalIds.length) {
    const r = await req('GET', `/api/goals/${otherGoalIds[0]}`, null, a.cookie);
    assert([403, 404].includes(r.status), `A 组不能读 B 组目标（实际 ${r.status}）`);
    console.log('[4] 跨组目标读取被拒 ' + r.status);
  } else {
    console.log('[4] B 组无目标，跳过跨组目标断言');
  }

  for (const [me, other] of [[a, b], [c, d]]) {
    const r = await req('GET', `/api/stats?user=${other.id}`, null, me.cookie);
    assert.strictEqual(r.status, 200, '同组应能看对方统计');
  }
  console.log('[5] 同组统计正常放行');
  console.log('组间隔离回归全部通过 ✓');
}

if (require.main === module) {
  run().catch((e) => { console.error('回归失败: ' + e.message); process.exit(1); });
}
module.exports = { run };
