const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const BASE = 'D:/PersonalHub/projects/tcamp/小组项目';
const SVG_DIR = path.join(BASE, '_gi_svg');
const OUT_DIR = path.join(BASE, '_gi_png');
const SIZE = 512;

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 简易静态服务：把 svg 包成 HTML 供渲染
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/svg/')) {
    const f = path.join(SVG_DIR, p.slice(5));
    fs.readFile(f, (e, buf) => {
      if (e) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(buf);
    });
    return;
  }
  if (p === '/' ) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body style="margin:0;background:transparent"></body></html>');
    return;
  }
  res.writeHead(404); res.end('nf');
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  const files = fs.readdirSync(SVG_DIR).filter(f => f.endsWith('.svg'));
  let ok = 0, fail = [];
  for (const f of files) {
    const key = f.replace('.svg', '');
    try {
      // 读取 SVG 内容，内联进页面，填成黑色，白底（便于之后量化）
      let svg = fs.readFileSync(path.join(SVG_DIR, f), 'utf8');
      // 统一 viewBox 为 512，currentColor -> 黑
      svg = svg.replace(/width="[^"]*"/, `width="${SIZE}"`).replace(/height="[^"]*"/, `height="${SIZE}"`);
      svg = svg.replace(/fill="currentColor"/g, 'fill="#000000"');
      if (!/fill=/.test(svg)) svg = svg.replace('<svg', '<svg fill="#000000"');
      const html = `<!doctype html><html><head><style>
        html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;background:transparent}
        svg{display:block;width:${SIZE}px;height:${SIZE}px}
      </style></head><body>${svg}</body></html>`;
      await page.setContent(html, { waitUntil: 'load' });
      const el = await page.$('svg');
      if (!el) { fail.push(key + ':no-svg'); continue; }
      await el.screenshot({ path: path.join(OUT_DIR, key + '.png'), omitBackground: true });
      ok++;
    } catch (e) { fail.push(key + ':' + e.message.slice(0, 40)); }
  }
  console.log('rendered', ok, 'failed', fail.length);
  if (fail.length) console.log(fail.join('\n'));
  await browser.close();
  server.close();
})();
