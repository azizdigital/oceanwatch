'use strict';
/* Test bench for www/relay-worker.js (the Cloudflare Worker), run in Node:
   - an "origin" site on 127.0.0.1 that refuses framing (X-Frame-Options + CSP), with pictures by relative, "/" and absolute
     addresses, a stylesheet, a same-site data request, a redirect, a link, and a frame-busting script;
   - the relay itself, served by a small Node server that hands each request to the worker's handler. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');

const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

async function loadWorker(key, hosts, opts) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'relay-worker.js'), 'utf8')
    .replace("'__KEY__'", JSON.stringify(key)).replace('__HOSTS__', JSON.stringify(hosts))
    .replace("'__TWEAKS__'", JSON.stringify((opts && opts.tweaks) || ''));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-relay-')), 'relay.mjs');
  fs.writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

function originServer() {
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push({ url: req.url, referer: req.headers.referer || '', cookie: req.headers.cookie || '' });
    const P = srv.address().port, ABS = 'http://127.0.0.1:' + P;
    if (req.url.startsWith('/img/')) { res.writeHead(200, { 'Content-Type': 'image/gif' }); return res.end(GIF); }
    if (req.url === '/s.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); return res.end('#bg{background:url(/img/c.gif);width:5px;height:5px}'); }
    if (req.url === '/api/data') { res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'sid=1; Domain=127.0.0.1' }); return res.end('{"level":"3.21 m"}'); }
    if (req.url.startsWith('/cf530')) { res.writeHead(530, { 'Content-Type': 'text/html' }); return res.end('error code: 1016'); }
    if (req.url.startsWith('/jps-page')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'SAMEORIGIN' });
      return res.end('<!doctype html><html><head><title>River Water Level Data</title></head><body><select id="district"><option value="ALL">ALL</option><option value="Besut">Besut</option><option value="Kemaman">Kemaman</option></select>' +
        '<div id="result">ALL</div><script>function searchStation(){ document.getElementById("result").textContent = "district:" + document.getElementById("district").value; }</script></body></html>');
    }
    if (req.url.startsWith('/jps-water')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'SAMEORIGIN' });
      return res.end('<html><body><table><thead><tr><th>No.</th><th>Station ID</th><th>Station Name</th><th>District</th><th>Main Basin</th><th>Sub River Basin</th><th>Last Updated</th><th>Water Level (m)</th><th colspan=4>Threshold</th></tr></thead><tbody>' +
        '<tr><td>1</td><td>0670491WL</td><td>Sg. Berang</td><td>Hulu Terengganu</td><td>Sungai Terengganu</td><td>Sg. Berang</td><td>20/11/2026 15:30</td><td>20.44</td><td>20.00</td><td>23.50</td><td>24.00</td><td>24.50</td></tr>' +
        '<tr><td>45</td><td>0600261WL</td><td>Sg. Mas di Kg. Sg. Mas (F2)</td><td>Kemaman</td><td>Sungai Kemaman</td><td>Sg. Kemaman</td><td>' + new Date(Date.now() + 8 * 3600000).toISOString().replace(/^(\d+)-(\d+)-(\d+)T(\d+:\d+).*$/, '$3/$2/$1 $4') + '</td><td><a href="/g">31.70</a></td><td>27.00</td><td>31.00</td><td>31.50</td><td>32.00</td></tr></tbody></table></body></html>');
    }
    if (req.url.startsWith('/jps-rain')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<table><tr><th>No.</th><th>Station ID</th><th>Station</th><th>District</th><th>Last Updated</th><th colspan=6>Daily Rainfall</th><th>Rainfall from Midnight</th><th>Total 1 Hour</th></tr>' +
        '<tr><td>52</td><td>4234109</td><td>JPS Kemaman</td><td>Kemaman</td><td>' + new Date(Date.now() + 8 * 3600000).toISOString().replace(/^(\d+)-(\d+)-(\d+)T(\d+:\d+:\d+).*$/, '$3/$2/$1 $4') + '</td><td>6</td><td>20</td><td>12</td><td>8</td><td>2</td><td>8</td><td>14.5</td><td>3.5</td></tr></table>');
    }
    if (req.url.startsWith('/tides')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><html><head><title>Tides</title><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script></head><body>' +
        '<h1 id="h">Cukai tides</h1><ins class="adsbygoogle" style="display:block;height:250px" data-ad-slot="1"></ins><div id="div-gpt-ad-1" style="height:90px">AD</div>' +
        '<script>var s=document.createElement("script");s.src="https://securepubads.g.doubleclick.net/tag/js/gpt.js";document.head.appendChild(s);document.title=s.getAttribute("src")?"leak":"guarded";' +
        'window.__pop=window.open("https://popads.net/x");</script></body></html>');
    }
    if (req.url === '/old') { res.writeHead(302, { Location: ABS + '/page?from=old' }); return res.end(); }
    if (req.url.startsWith('/next')) { res.writeHead(200, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' }); return res.end('<!doctype html><title>Next</title><h1 id="h">Second page</h1>'); }
    if (req.url.startsWith('/page')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'none'; default-src 'self'" });
      return res.end('<!doctype html><html><head><meta name="referrer" content="no-referrer"><title>Paras Air</title>' +
        '<link rel="stylesheet" href="//127.0.0.1:' + P + '/s.css"></head><body>' +
        '<h1 id="h">Paras air Sg. Kemaman</h1>' +
        '<img id="rel" src="img/a.gif"> <img id="root" src="/img/b.gif"> <img id="abs" src="' + ABS + '/img/d.gif"> <div id="bg"></div>' +
        '<p id="data">loading</p><a id="ln" href="' + ABS + '/next">next</a> <a id="out" href="https://example.org/" target="_blank">outside</a>' +
        '<script>fetch("/api/data").then(function(r){return r.json()}).then(function(j){document.getElementById("data").textContent=j.level}).catch(function(e){document.getElementById("data").textContent="ERR "+e});' +
        'if (top !== self) { try { top.location = self.location; } catch (e) {} }</script></body></html>');
    }
    res.writeHead(404); res.end('nope');
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, hits, port: srv.address().port })));
}

function relayServer(mod) {
  const srv = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const url = 'http://127.0.0.1:' + srv.address().port + req.url;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    const out = await mod.handle(new Request(url, { method: req.method, headers, body }), {});
    const h = {};
    out.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(out.status, h);
    res.end(out.body ? Buffer.from(await out.arrayBuffer()) : undefined);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

/* a third origin standing in for the iPad app page (localhost, not 127.0.0.1, so it is another origin) */
function hostServer() {
  const st = { html: '' };
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(st.html); });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, st, url: 'http://localhost:' + srv.address().port + '/app' })));
}

/* opts.hosts: the relay's site list (default 127.0.0.1). opts.route(url): send the relay's own requests for real site
   addresses to the local test site instead (no internet here) */
async function start(key, opts) {
  opts = opts || {};
  const origin = await originServer();
  const mod = await loadWorker(key, opts.hosts || ['127.0.0.1'], opts);
  let restore = null;
  if (opts.route) {
    const orig = globalThis.fetch;
    globalThis.fetch = (u, o) => orig(opts.route(String(u), origin.port) || u, o);
    restore = () => { globalThis.fetch = orig; };
  }
  const relay = await relayServer(mod);
  const host = await hostServer();
  return {
    origin, relay, mod, host,
    url: p => 'http://127.0.0.1:' + relay.port + '/' + key + '/http/127.0.0.1:' + origin.port + p,
    stop: () => { if (restore) restore(); origin.srv.close(); relay.srv.close(); host.srv.close(); }
  };
}
module.exports = { start, loadWorker };
