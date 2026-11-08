const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3001;
const APP_DIR = __dirname;
const BASE_PROJECT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // 跨域支持与安全头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let filePath = '';

  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(APP_DIR, 'index.html');
  } else if (pathname.startsWith('/icons_trendy/')) {
    filePath = path.join(BASE_PROJECT_DIR, 'public', pathname);
  } else if (pathname.startsWith('/icons_pixel/')) {
    filePath = path.join(BASE_PROJECT_DIR, 'public', pathname);
  } else if (pathname.startsWith('/fonts/')) {
    filePath = path.join(BASE_PROJECT_DIR, 'public', pathname);
  } else if (pathname.startsWith('/design_refs/')) {
    const sub = pathname.replace('/design_refs/', '');
    filePath = path.join(BASE_PROJECT_DIR, '设计参考', '项目最终方案效果图', sub);
  } else if (pathname.startsWith('/public/')) {
    filePath = path.join(BASE_PROJECT_DIR, pathname);
  } else {
    // 默认在 trendy-app 目录找
    filePath = path.join(APP_DIR, pathname);
    if (!fs.existsSync(filePath)) {
      // 找不到则去 public 找兜底
      const altPath = path.join(BASE_PROJECT_DIR, 'public', pathname);
      if (fs.existsSync(altPath)) {
        filePath = altPath;
      }
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end(`404 Not Found: ${pathname}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Footprint Trendy Toy Web] Running at http://127.0.0.1:${PORT}/`);
  console.log(`[Footprint Trendy Toy Web] Local network at http://localhost:${PORT}/`);
});
