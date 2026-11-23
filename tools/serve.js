/* Small web server for www/ (development and the browser tests; no Electron, no PC data).
     node tools/serve.js [port] [edition]      edition = monsoon-eye | oceanwatch | dev (default dev: pick with ?ed=me / ?ed=ow)
   HTML pages get the app's name and only its own parts (tools/edition-html.js). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const E = require('./editions');
const { transform } = require('./edition-html');

const port = +(process.argv[2] || process.env.PORT || 42050);
const fixed = process.argv[3] && process.argv[3] !== 'dev' ? process.argv[3] : Object.keys(E).length === 1 ? Object.keys(E)[0] : null;   /* a repo with one app: always that app */
const root = path.join(__dirname, '..', 'www');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file);
    let body = buf;
    if (ext === '.html') {
      const q = /(?:^|&)ed=(me|ow)\b/.exec(u.search.slice(1)), ck = /(?:^|; )ed=(me|ow)/.exec(req.headers.cookie || '');
      const id = fixed || ((q ? q[1] : ck ? ck[1] : 'me') === 'ow' ? 'oceanwatch' : 'monsoon-eye');
      body = transform(buf.toString('utf8'), E[id]);
      if (!fixed) res.setHeader('Set-Cookie', 'ed=' + E[id].short + '; Path=/');
    }
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
}).listen(port, '127.0.0.1', () => console.log('www on http://127.0.0.1:' + port + '/ (' + (fixed || 'dev: ?ed=me / ?ed=ow') + ')'));
