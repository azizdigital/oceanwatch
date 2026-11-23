'use strict';
/* Dashboard Cuaca Aziz - local servers (adapted from OIM Wazira lib/server.js).
   App    http://127.0.0.1:30040   the desktop window and "open in browser on this PC"   (this PC only)
   Setup  http://<PC-IP>:30041     phone / tablet: certificate download + guide           } ON only while the
   HTTPS  https://<PC-IP>:30042    phone / tablet: the full app (installable PWA)         } phone setup window is open
   Own ports, so it can run at the same time as OIM Wazira (30030-30032). */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const certs = require('./certs');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.crt': 'application/x-x509-ca-cert'
};
const NO_CACHE = /\.(html?|js|json|webmanifest|css)$/i;
const CA_FILE = '/dashboard-cuaca-ca.crt';

function lanIPs() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal && !/^169\.254\./.test(i.address)) ips.push(i.address);
  }
  const rank = ip => ip.startsWith('192.168.137.') ? 0 : /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ? 1 : 2;
  return ips.sort((a, b) => rank(a) - rank(b));
}

/* opt: { www, dataDir, ports, api(req, res, url, role) -> bool, onError } */
function create(opt) {
  const www = path.resolve(opt.www);
  const ports = Object.assign({ app: 30040, setup: 30041, https: 30042 }, opt.ports || {});
  const onError = opt.onError || (() => {});
  let appSrv = null, setupSrv = null, httpsSrv = null, sharing = false, caInfo = null;

  function sendFile(req, res, filePath) {
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 - tiada'); }
      const ext = path.extname(filePath).toLowerCase();
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': NO_CACHE.test(ext) ? 'no-cache' : 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff', 'Content-Length': st.size
      };
      if (/sw\.js$/i.test(filePath)) headers['Service-Worker-Allowed'] = '/';
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
    });
  }

  function resolvePath(urlPath) {
    let p;
    try { p = decodeURIComponent(urlPath); } catch (e) { return null; }
    if (p.includes('\0')) return null;
    if (p === '/' || p === '') p = '/index.html';
    if (p.endsWith('/')) p += 'index.html';
    const full = path.normalize(path.join(www, p));
    if (full !== www && !full.startsWith(www + path.sep)) return null;
    if (path.relative(www, full).split(path.sep).some(s => s.startsWith('.'))) return null;
    return full;
  }

  function handler(role) {
    return (req, res) => {
      try {
        const u = new URL(req.url, 'http://x');
        const p = u.pathname;
        if (p === CA_FILE) {
          if (!caInfo) { res.writeHead(503); return res.end('sijil belum sedia'); }
          res.writeHead(200, { 'Content-Type': MIME['.crt'], 'Content-Disposition': 'attachment; filename="dashboard-cuaca-ca.crt"' });
          return res.end(caInfo.caPem);
        }
        if (p.startsWith('/api/')) {
          if (role === 'setup' && p !== '/api/info') { res.writeHead(404); return res.end(); }
          if (opt.api && opt.api(req, res, u, role)) return;
          res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"tiada"}');
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
        if (role === 'setup') {
          if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(www, 'phone.html'));
          if (/^\/(assets\/(css|fonts|icons)\/|phone\.html$|favicon\.ico$)/.test(p)) { const f = resolvePath(p); if (f) return sendFile(req, res, f); }
          res.writeHead(302, { Location: '/' }); return res.end();
        }
        if (role === 'app' && (p === '/setup' || p === '/setup/')) return sendFile(req, res, path.join(www, 'setup.html'));
        const f = resolvePath(p);
        if (!f) { res.writeHead(403); return res.end(); }
        sendFile(req, res, f);
      } catch (e) {
        onError(e);
        try { res.writeHead(500); res.end('500'); } catch (e2) { /* */ }
      }
    };
  }

  function listen(srv, port, host) {
    return new Promise((resolve, reject) => {
      const fail = e => { srv.removeListener('listening', ok); e.port = port; reject(e); };
      const ok = () => { srv.removeListener('error', fail); srv.on('error', onError); resolve(); };
      srv.once('error', fail);
      srv.once('listening', ok);
      srv.listen(port, host);
    });
  }
  function close(srv) { return new Promise(r => { if (!srv) return r(); try { srv.close(() => r()); if (srv.closeAllConnections) srv.closeAllConnections(); } catch (e) { r(); } }); }

  async function start() {
    if (appSrv && appSrv.listening) return ports.app;
    appSrv = http.createServer(handler('app'));
    await listen(appSrv, ports.app, '127.0.0.1');
    return ports.app;
  }

  async function setShare(on) {
    if (on === sharing) return sharing;
    if (on) {
      caInfo = certs.ensure({ dataDir: opt.dataDir, ips: lanIPs() });
      setupSrv = http.createServer(handler('setup'));
      httpsSrv = https.createServer({ cert: caInfo.cert, key: caInfo.key }, handler('https'));
      try {
        await listen(setupSrv, ports.setup, '0.0.0.0');
        await listen(httpsSrv, ports.https, '0.0.0.0');
      } catch (e) {
        await close(setupSrv); await close(httpsSrv); setupSrv = httpsSrv = null;
        throw e;
      }
      sharing = true;
    } else {
      await close(setupSrv); await close(httpsSrv);
      setupSrv = httpsSrv = null; sharing = false;
    }
    return sharing;
  }

  async function stop() { await setShare(false); await close(appSrv); appSrv = null; }

  return {
    start, stop, setShare, lanIPs, ports, isSharing: () => sharing, isListening: () => !!(appSrv && appSrv.listening),
    caName: () => (caInfo ? caInfo.caName : certs.CA_NAME)
  };
}

module.exports = { create, lanIPs, CA_FILE };
