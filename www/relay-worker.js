/* Sentinel OceanWATCH - site relay (Cloudflare Worker)
   ======================================================
   Lets the iPad / phone app show sites that refuse to be shown inside another app (X-Frame-Options / CSP frame-ancestors).
   The relay fetches the page, removes only that refusal, and sends it on. It works without the PC.

   Safety:
   - Only the sites of Dashboard Cuaca Aziz (HOSTS below) can be fetched - it is not an open proxy.
   - Every address needs the secret KEY.
   - No cookies or logins are passed on.

   Ads: ad scripts, ad frames and ad boxes are removed from the pages that come through (relay v2).

   Address form:  https://<your-relay>.workers.dev/<KEY>/<https|http>/<host>/<path>?<query>

   GitHub backup (relay v4, optional): https://<your-relay>.workers.dev/<KEY>/mirror asks GitHub to run the app's mirror now
   (it reads JPS & tides and saves the copy in the branch "data"), at most once every 10 minutes. The app calls it each time it
   reads JPS live through this relay. Needs a Worker secret GH_TOKEN: a GitHub fine-grained token for the oceanwatch repository only, permission "Actions: Read and write". Optional variable GH_REPO (default azizdigital/oceanwatch).
   relay v6: also by itself, with a Cron Trigger (e.g. every hour: "0 * * * *"): the mirror of every repository in GH_REPOS (comma
   separated; default azizdigital/monsoon-eye and azizdigital/oceanwatch - one token for both, "Actions: Read and write").
   Relative and "/"-addresses inside the page come back through the relay by themselves (page path, or the Referer).

   Vessel positions (relay v5, optional, Sentinel OceanWATCH): https://<your-relay>.workers.dev/<KEY>/ais?mmsi=<9 digits,...>&box=<lat,lon,lat,lon>
   listens to aisstream.io (free AIS stream, needs a free key) for up to ~25 s and answers the last position of each vessel heard.
   Needs a Worker secret AIS_KEY (aisstream.io › API Keys); the key stays in Cloudflare, never in the app. Answers are kept 2 minutes. */

const KEY = '__KEY__';
const HOSTS = __HOSTS__;

const VERSION = 6;
/* small per-site fixes (e.g. JPS: open with your district chosen), kept in the web app on GitHub so they can change
   without pasting this script again */
const TWEAKS = '__TWEAKS__';
/* ad and pop-up networks: their scripts and frames are taken out of relayed pages, and blocked if the page adds them later */
const AD_HOSTS = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'googletagservices.com',
  'amazon-adsystem.com', 'adnxs.com', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'pubmatic.com', 'rubiconproject.com',
  'openx.net', 'casalemedia.com', 'indexww.com', 'smartadserver.com', 'adform.net', 'moatads.com', 'quantserve.com', 'scorecardresearch.com',
  'advertising.com', 'media.net', 'yieldmo.com', 'sharethrough.com', 'teads.tv', '33across.com', 'gumgum.com', 'sovrn.com', 'lijit.com',
  'bidswitch.net', 'adsrvr.org', '3lift.com', 'triplelift.com', 'mgid.com', 'propellerads.com', 'popads.net', 'popcash.net', 'adsterra.com',
  'exoclick.com', 'ezoic.net', 'ezojs.com', 'ezodn.com', 'fundingchoicesmessages.google.com', 'primis.tech', 'connatix.com', 'vidazoo.com',
  'aniview.com', 'playwire.com', 'freestar.com', 'pub.network', 'venatusmedia.com', 'snigelweb.com', 'adthrive.com', 'mediavine.com',
  'nitropay.com', 'id5-sync.com', 'adsafeprotected.com', 'doubleverify.com', 'adition.com', 'yieldlove.com', 'adpushup.com', 'infolinks.com',
  'revcontent.com', 'zergnet.com', 'bidvertiser.com', 'hilltopads.net', 'onclickads.net', 'adcash.com', 'a-ads.com', 'coinzilla.com'];
const AD_CSS = 'ins.adsbygoogle,.adsbygoogle,[id^="div-gpt-ad"],[id^="google_ads_iframe"],[id^="gpt_unit"],[id*="ezoic-pub-ad"],.ezoic-ad,' +
  '[data-ad-slot],[data-ad-unit],[data-google-query-id],.ad-container,.ad-wrapper,.ad-slot,.adslot,.advertisement,.ad-banner,.adsbox,' +
  '.fc-consent-root,.qc-cmp2-container,#qc-cmp2-container,[id^="sp_message_container"],.adthrive-ad,.mv-ad-box,[class^="ezmob"]' +
  '{display:none!important}';
/* runs first in the page: later ad scripts, frames, requests and pop-ups from the ad networks are refused */
const AD_GUARD = '(function(){var H=' + JSON.stringify(AD_HOSTS) + ';function bad(u){try{var h=new URL(String(u),location.href).hostname.toLowerCase();' +
  'return H.some(function(x){return h===x||h.slice(-x.length-1)==="."+x})}catch(e){return false}}' +
  '["HTMLScriptElement","HTMLIFrameElement"].forEach(function(n){var P=window[n]&&window[n].prototype,d=P&&Object.getOwnPropertyDescriptor(P,"src");' +
  'if(!d||!d.set)return;Object.defineProperty(P,"src",{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){if(!bad(v))d.set.call(this,v)}})});' +
  'var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(k,v){if(/^(src|href)$/i.test(k)&&/^(SCRIPT|IFRAME|LINK)$/.test(this.tagName)&&bad(v))return;return sa.apply(this,arguments)};' +
  'var f=window.fetch;if(f)window.fetch=function(i){var u=typeof i==="string"?i:i&&i.url;if(u&&bad(u))return Promise.reject(new TypeError("blocked"));return f.apply(this,arguments)};' +
  'var xo=XMLHttpRequest.prototype.open,xs=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__ad=bad(u);return xo.apply(this,arguments)};' +
  'XMLHttpRequest.prototype.send=function(){if(this.__ad)return;return xs.apply(this,arguments)};' +
  'var wo=window.open;window.open=function(u){if(!u||u==="about:blank"||bad(u))return null;return wo.apply(window,arguments)};' +
  'if(navigator.sendBeacon){var sb=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u){return bad(u)?true:sb.apply(null,arguments)}}})();';

function adHost(url) {
  try {
    const h = new URL(url, 'https://x/').hostname.toLowerCase();
    return AD_HOSTS.some(x => h === x || h.endsWith('.' + x));
  } catch (e) { return false; }
}
/* take the ads out of an HTML page (simple text passes: Cloudflare's free plan gives each request little time) */
function stripAds(html) {
  const srcOf = tag => { const m = /\s(?:src|href)\s*=\s*["']?([^"'\s>]+)/i.exec(tag); return m ? m[1].replace(/&amp;/g, '&') : ''; };
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => {
    const open = tag.slice(0, tag.indexOf('>') + 1);
    if (adHost(srcOf(open))) return '';
    const body = tag.slice(open.length);
    if (body.length < 4000 && /adsbygoogle|googletag\.(cmd|pubads)|__tcfapi|ezstandalone|pbjs\.que/.test(body)) return '';
    return tag;
  });
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, tag => adHost(srcOf(tag.slice(0, tag.indexOf('>') + 1))) ? '' : tag);
  html = html.replace(/<link\b[^>]*>/gi, tag => adHost(srcOf(tag)) ? '' : tag);
  html = html.replace(/<ins\b[^>]*class=["'][^"']*adsbygoogle[^"']*["'][^>]*>[\s\S]*?<\/ins>/gi, '');
  const add = '<style>' + AD_CSS + '</style><script>' + AD_GUARD + '</script>' +
    (/^https?:\/\//.test(TWEAKS) ? '<script src="' + TWEAKS + '" defer></script>' : '');
  const head = /<head\b[^>]*>/i.exec(html);
  return head ? html.slice(0, head.index + head[0].length) + add + html.slice(head.index + head[0].length) : add + html;
}

const DROP_RESPONSE = ['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'strict-transport-security',
  'set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'referrer-policy', 'cross-origin-opener-policy',
  'cross-origin-embedder-policy', 'cross-origin-resource-policy', 'permissions-policy', 'report-to', 'nel', 'alt-svc'];
const PASS_REQUEST = ['accept', 'accept-language', 'cache-control', 'content-type', 'if-modified-since', 'if-none-match', 'range', 'user-agent', 'x-requested-with'];

function allowed(host) {
  host = String(host || '').toLowerCase();
  return HOSTS.some(h => host === h || host.endsWith('.' + h));
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function page(status, title, text, link, fromSite) {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
    '<body style="font:15px -apple-system,Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;min-height:90vh;margin:0;text-align:center">' +
    '<div style="max-width:420px;padding:20px"><div style="font-size:34px">📡</div><h2 style="margin:8px 0">' + esc(title) + '</h2><p style="color:#94a3b8;line-height:1.5">' + esc(text) + '</p>' +
    (link ? '<p><a href="' + esc(link) + '" target="_blank" rel="noopener" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">Open in browser / Buka di pelayar ↗</a></p>' : '') +
    '</div></body>', { status, headers: Object.assign({ 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-relay', 'cache-control': 'no-store' },
      fromSite ? { 'x-relay': 'dashboard-cuaca-aziz' } : {}) });
}

/* "/KEY/https/host/path?q" -> https://host/path?q   (null when it is not that form) */
function targetFromPath(url) {
  const m = /^\/([^/]+)\/(https?)\/([^/?#]+)(\/[^?#]*)?$/.exec(url.pathname);
  if (!m || m[1] !== KEY) return null;
  return new URL(m[2] + '://' + m[3] + (m[4] || '/') + url.search);
}
function relayPath(target) {
  const u = typeof target === 'string' ? new URL(target) : target;
  return '/' + KEY + '/' + u.protocol.replace(':', '') + '/' + u.host + u.pathname + u.search;
}

/* absolute addresses of the allowed sites inside HTML/CSS -> through the relay, so pages, frames and same-site
   requests keep working (pictures etc. from other sites load directly) */
function rewriteText(text, origin, proto) {
  const hosts = HOSTS.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp('(["\'(=\\s,])(https?:)?\\/\\/((?:[a-z0-9-]+\\.)*(?:' + hosts + ')(?::\\d+)?)(?=[\\/"\'?#)\\s>])', 'gi');
  return text.replace(re, (all, pre, p, host) => pre + origin + '/' + KEY + '/' + (p ? p.replace(':', '') : (proto || 'https')) + '/' + host);
}

/* GitHub backup: run the mirror workflow, not more than once in MIRROR_GAP (also checked on GitHub, since a Worker forgets).
   relay v6: every repository in GH_REPOS (or GH_REPO, or the two land apps below), and by itself on a Cron Trigger (e.g. every hour)
   - GitHub's own 15-minute schedule runs late, sometimes only twice a day. */
const MIRROR_GAP = 10 * 60000;
const MIRROR_REPOS = ['azizdigital/monsoon-eye', 'azizdigital/' + 'dashboard-cuaca'];
const lastPoke = {};
function mirrorRepos(env) {
  const list = String((env && (env.GH_REPOS || env.GH_REPO)) || '').split(/[\s,]+/).filter(x => /^[\w.-]+\/[\w.-]+$/.test(x));
  return list.length ? list : MIRROR_REPOS;
}
async function pokeAll(env, now) {
  const repos = mirrorRepos(env), out = {};
  for (const r of repos) out[r] = await pokeOne(env, now, r);
  const vals = Object.values(out);
  return { ok: vals.some(v => v.ok), reason: vals.every(v => !v.ok) ? vals[0].reason : undefined, repos: out };
}
async function pokeMirror(env, now) { return json(await pokeAll(env, now)); }
const json = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
async function pokeOne(env, now, repo) {
  const token = env && env.GH_TOKEN;
  if (!token) return { ok: false, reason: 'no-token' };
  if (now - (lastPoke[repo] || 0) < MIRROR_GAP) return { ok: true, skipped: 'recent', next: lastPoke[repo] + MIRROR_GAP };
  const gh = (path, opt) => fetch('https://api.github.com/repos/' + repo + '/actions/workflows/mirror.yml' + path, Object.assign({
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'user-agent': 'dashboard-cuaca-relay', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' } }, opt || {}));
  try {
    const runs = await gh('/runs?per_page=1');
    if (runs.status === 401 || runs.status === 403 || runs.status === 404) return { ok: false, reason: 'token', status: runs.status };
    const last = runs.ok ? ((await runs.json()).workflow_runs || [])[0] : null;
    const t = last ? Date.parse(last.created_at) : 0;
    if (last && (last.status !== 'completed' || now - t < MIRROR_GAP)) { lastPoke[repo] = Math.max(lastPoke[repo] || 0, t); return { ok: true, skipped: last.status !== 'completed' ? 'running' : 'recent', last: last.created_at }; }
    const r = await gh('/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
    if (r.status !== 204) return { ok: false, reason: 'github', status: r.status };
    lastPoke[repo] = now;
    return { ok: true, started: new Date(now).toISOString() };
  } catch (e) { return { ok: false, reason: 'github', error: String(e && e.message || e) }; }
}

/* AIS (relay v5): listen to aisstream.io for the asked vessels / area, then answer what was heard */
const AIS_WAIT = 25000, AIS_KEEP = 120;
function aisNum(v, lo, hi) { const n = +v; return isFinite(n) && n >= lo && n <= hi ? n : null; }
async function ais(url, env, ctx) {
  if (!env || !env.AIS_KEY) return json({ ok: false, reason: 'no-key' });
  const mmsi = String(url.searchParams.get('mmsi') || '').split(',').map(x => x.replace(/\D/g, '')).filter(x => x.length === 9).slice(0, 50);
  const b = String(url.searchParams.get('box') || '').split(',').map(Number);
  const box = b.length === 4 && b.every(isFinite) ? [[Math.min(b[0], b[2]), Math.min(b[1], b[3])], [Math.max(b[0], b[2]), Math.max(b[1], b[3])]] : null;
  if (!mmsi.length && !box) return json({ ok: false, reason: 'ask' }, 400);
  const wait = Math.max(5, Math.min(25, +url.searchParams.get('wait') || 20)) * 1000;
  /* the same question within 2 minutes: the kept answer (aisstream asks to keep connections few) */
  const cache = caches.default, ck = new Request('https://ais.cache/' + mmsi.join(',') + '/' + (box ? box.flat().join(',') : '') + '/' + wait);
  const hit = await cache.match(ck);
  if (hit && url.searchParams.get('debug') !== '1') return new Response(hit.body, hit);
  let res;
  try { res = await fetch('https://stream.aisstream.io/v0/stream', { headers: { Upgrade: 'websocket' } }); }
  catch (e) { return json({ ok: false, reason: 'connect', error: String(e && e.message || e) }); }
  const ws = res.webSocket;
  if (!ws) return json({ ok: false, reason: 'connect', status: res.status });
  ws.accept();
  const seen = {}, t0 = Date.now(), debug = url.searchParams.get('debug') === '1', raw = [], reading = []; let msgs = 0, err = '';
  const done = new Promise(resolve => {
    const stop = setTimeout(resolve, Math.min(wait, AIS_WAIT));
    /* aisstream sends each message as binary (a Blob in Workers): read it as text first */
    const take = text => {
      if (debug && raw.length < 3) raw.push(String(text).slice(0, 600));
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      if (m.error) { err = String(m.error); clearTimeout(stop); resolve(); return; }
      const meta = m.MetaData || {}, id = String(meta.MMSI || ''), msg = m.Message || {};
      if (!id) return;
      const v = seen[id] || (seen[id] = { mmsi: id });
      if (meta.ShipName) v.name = String(meta.ShipName).trim();
      const pr = msg.PositionReport || msg.StandardClassBPositionReport || msg.ExtendedClassBPositionReport;
      if (pr) {
        const lat = aisNum(pr.Latitude, -90, 90), lon = aisNum(pr.Longitude, -180, 180);
        if (lat !== null && lon !== null) {
          v.lat = lat; v.lon = lon; v.sog = aisNum(pr.Sog, 0, 102.2); v.cog = aisNum(pr.Cog, 0, 359.9); v.hdg = aisNum(pr.TrueHeading, 0, 359);
          v.status = pr.NavigationalStatus !== undefined ? pr.NavigationalStatus : null; v.at = meta.time_utc || new Date().toISOString();
        }
      }
      const sd = msg.ShipStaticData;
      if (sd) { if (sd.Destination) v.dest = String(sd.Destination).trim(); if (sd.CallSign) v.call = String(sd.CallSign).trim(); if (sd.Type !== undefined) v.type = sd.Type; }
      if (mmsi.length && !box && mmsi.every(x => seen[x] && seen[x].lat !== undefined)) { clearTimeout(stop); resolve(); }
    };
    ws.addEventListener('message', ev => {
      msgs++;
      const d = ev.data;
      let read;
      try { read = typeof d === 'string' ? Promise.resolve(d) : d && typeof d.text === 'function' ? d.text() : Promise.resolve(new TextDecoder().decode(d)); }
      catch (e) { read = Promise.resolve(''); }
      reading.push(read.then(take, () => {}));
    });
    ws.addEventListener('close', () => { clearTimeout(stop); resolve(); });
    ws.addEventListener('error', () => { clearTimeout(stop); resolve(); });
  });
  const sub = { APIKey: env.AIS_KEY, BoundingBoxes: [box || [[-90, -180], [90, 180]]], FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'ShipStaticData'] };
  if (mmsi.length) sub.FiltersShipMMSI = mmsi;
  try { ws.send(JSON.stringify(sub)); } catch (e) { return json({ ok: false, reason: 'connect', error: String(e && e.message || e) }); }
  await done;
  await Promise.all(reading);
  try { ws.close(1000, 'done'); } catch (e) { /* closed */ }
  const vessels = Object.keys(seen).map(k => seen[k]).filter(v => v.lat !== undefined);
  const answer = err ? { ok: false, reason: 'aisstream', error: err } : { ok: true, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), messages: msgs, vessels };
  if (debug) { answer.debug = raw; return json(answer); }
  const out = json(answer);
  if (!err) {
    const keep = new Response(out.clone().body, out); keep.headers.set('cache-control', 'max-age=' + AIS_KEEP);
    const put = cache.put(ck, keep);
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return out;
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const origin = url.origin;
  if (url.pathname === '/' + KEY + '/mirror') return pokeMirror(env, Date.now());
  if (url.pathname === '/' + KEY + '/ais') return ais(url, env, ctx);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD, POST', 'access-control-allow-headers': '*', 'access-control-max-age': '86400' } });
  }
  if (url.pathname === '/' || url.pathname === '/favicon.ico') return page(200, "Sentinel OceanWATCH relay", 'Relay is running. / Relay berjalan. (relay v' + VERSION + ')');
  if (request.headers.get('service-worker') === 'script') return new Response('', { status: 404 });

  let target = targetFromPath(url);
  /* "/img/a.png" asked by a relayed page: rebuild it from the page that asked (Referer) */
  if (!target) {
    const ref = request.headers.get('referer');
    try {
      const ru = ref ? new URL(ref) : null;
      const base = ru && ru.origin === origin ? targetFromPath(ru) : null;
      if (base) target = new URL(url.pathname + url.search, base);
    } catch (e) { /* bad referer */ }
    if (target) return Response.redirect(origin + relayPath(target), 307);
    return page(404, 'Not found', 'This address is not a relay address. / Alamat ini bukan alamat relay.');
  }
  if (!allowed(target.hostname)) return page(403, 'Not allowed / Tidak dibenarkan', target.hostname + ' is not one of the Dashboard Cuaca Aziz sites.');

  const headers = new Headers();
  for (const h of PASS_REQUEST) { const v = request.headers.get(h); if (v) headers.set(h, v); }
  if (!headers.get('user-agent')) headers.set('user-agent', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  headers.set('referer', target.origin + '/');

  let res;
  try {
    res = await fetch(target.href, { method: request.method === 'POST' ? 'POST' : request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers, body: request.method === 'POST' ? await request.arrayBuffer() : undefined, redirect: 'manual' });
  } catch (e) {
    return page(502, 'Site not reachable / Laman tidak dapat dicapai', String(e && e.message || e), target.href, true);
  }

  /* Cloudflare could not reach the site itself (530 = its address cannot be found, 52x = no answer): a clear page instead */
  if (res.status === 530 || (res.status >= 520 && res.status <= 527)) {
    return page(res.status, 'Site not reachable through the relay / Laman tidak dapat dicapai melalui relay',
      (res.status === 530 ? 'Cloudflare cannot find this site\'s address (DNS). / Cloudflare tidak dapat mencari alamat laman ini.' : 'The site did not answer Cloudflare. / Laman tidak membalas Cloudflare.') +
      ' (HTTP ' + res.status + ')', target.href, true);
  }

  const out = new Headers();
  res.headers.forEach((v, k) => { if (DROP_RESPONSE.indexOf(k.toLowerCase()) < 0) out.set(k, v); });
  out.set('access-control-allow-origin', '*');
  out.set('x-relay', 'dashboard-cuaca-aziz');
  out.set('access-control-expose-headers', 'x-relay');

  /* redirects stay inside the relay */
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    const loc = new URL(res.headers.get('location'), target);
    out.set('location', allowed(loc.hostname) ? origin + relayPath(loc) : loc.href);
    return new Response(null, { status: res.status, headers: out });
  }

  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (/text\/html|application\/xhtml|text\/css/.test(type) && request.method !== 'HEAD') {
    let text = await res.text();
    text = rewriteText(text, origin, target.protocol.replace(':', ''));
    if (/html/.test(type)) {
      /* the page's own "no referrer" would stop "/"-addresses from finding their way back */
      text = text.replace(/<meta[^>]+name=["']?referrer["']?[^>]*>/gi, '');
      text = text.replace(/<meta[^>]+http-equiv=["']?(?:x-frame-options|content-security-policy)["']?[^>]*>/gi, '');
      text = stripAds(text);
    }
    return new Response(text, { status: res.status, headers: out });
  }
  return new Response(res.body, { status: res.status, headers: out });
}

/* relay v6: Cron Trigger (Cloudflare › the Worker › Settings › Triggers, e.g. every hour) = run the GitHub mirrors */
export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
  scheduled: (event, env, ctx) => { const p = pokeAll(env, Date.now()); if (ctx && ctx.waitUntil) ctx.waitUntil(p); return p; }
};
export { handle, rewriteText, targetFromPath, relayPath, allowed, stripAds, adHost, ais, pokeAll, mirrorRepos, VERSION };
