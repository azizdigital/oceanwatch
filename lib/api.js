'use strict';
/* Dashboard Cuaca Aziz - /api/* for the page (desktop window and phone).
   GET  /api/info            app name, version, ports, sharing
   GET  /api/snapshot        last collected data + settings
   GET  /api/events          live updates (Server-Sent Events): "snapshot" and "alert"
   GET  /api/history?hours=  history lines for the charts
   GET  /api/alerts/log      alert log
   GET  /api/offshore?force= offshore model comparison: the raw answers of several models (kept 30 min)
   GET  /api/fetch?url=      JSON from Open-Meteo, the app's GitHub mirror, the JPS graph data, MET (data.gov.my) and { text } of the JPS tables
   POST /api/refresh         collect now
   POST /api/settings        save settings
   POST /api/alerts/ack      { key | "all" }
   POST /api/alerts/test     ring a test alert
   GET  /api/profiles        { active, profiles }
   POST /api/profiles        { action: "activate" | "save" | "delete", id, profile }
   POST requests must carry the header "X-MC: 1": a web page on another site cannot add that header
   without a CORS pre-flight, which this server never approves, so other sites cannot change anything. */

const MAX_BODY = 64 * 1024;
const { L } = require('../www/assets/js/core');
const OFF = require('../www/assets/js/offshore');
const OMB = require('./ombudget');

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/* opt: { store, collector, info() -> {}, onSettings(settings), onTestAlert(), offshoreFetch(url) -> Promise(JSON) } */
function create(opt) {
  const clients = new Set();

  function broadcast(event, data) {
    const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
    clients.forEach(res => { try { res.write(msg); } catch (e) { clients.delete(res); } });
  }
  setInterval(() => clients.forEach(res => { try { res.write(': ping\n\n'); } catch (e) { clients.delete(res); } }), 25000).unref();

  /* offshore comparison: fetched here (the page may only talk to this PC), one run at a time, kept 30 minutes */
  let offCache = null, offBusy = null;
  function offshore(force) {
    const s = opt.store.settings(), key = (+s.marineLat).toFixed(3) + ',' + (+s.marineLon).toFixed(3);
    if (!opt.offshoreFetch) return Promise.reject(new Error('not available'));
    if (!force && offCache && offCache.key === key && Date.now() - offCache.at < OMB.every(s, Date.now(), opt.visible ? !opt.visible() : false)) return Promise.resolve(offCache.raw);
    if (offBusy && offBusy.key === key) return offBusy.p;
    const p = OFF.collect(s.marineLat, s.marineLon, url => opt.offshoreFetch(url)).then(raw => { offCache = { key, at: Date.now(), raw }; return raw; })
      .finally(() => { offBusy = null; });
    offBusy = { key, p };
    return p;
  }

  /* the page may only talk to this PC: it asks here for the few public JSON sources the AI suggestion needs */
  /* what the app page may read through the PC (it cannot reach the internet itself): Open-Meteo, the GitHub copy (mirror) of the apps,
     JPS 5-minute series, and the JPS state tables (Monsoon EYE › Tambah daerah) */
  const FETCH_OK = [/^https:\/\/(api|ensemble-api|marine-api|flood-api)\.open-meteo\.com\/v1\//, /^https:\/\/raw\.githubusercontent\.com\/azizdigital\/(dashboard-cuaca|monsoon-eye|oceanwatch)\/data\//,
    /^https:\/\/publicinfobanjir\.water\.gov\.my\/wp-content\/themes\/enlighten\/query\/(searchresultwaterleveldtlead|searchresultrainfalldthourlylead)\.php\?/,
    /^https:\/\/publicinfobanjir\.water\.gov\.my\/aras-air\/data-paras-air\/aras-air-data\/\?/, /^https:\/\/publicinfobanjir\.water\.gov\.my\/wp-content\/themes\/shapely\/agency\/searchresultrainfall\.php\?/,
    /^https:\/\/api\.data\.gov\.my\/weather\/forecast\?/];
  const fetchCache = new Map();
  function fetchFor(url) {
    url = String(url || '');
    if (!opt.offshoreFetch || url.length > 4000 || !FETCH_OK.some(re => re.test(url))) return Promise.reject(Object.assign(new Error('not allowed'), { code: 403 }));
    const hit = fetchCache.get(url);
    if (hit && Date.now() - hit.at < (OMB.isOm(url) ? Math.max(3 * 60000, Math.min(20 * 60000, OMB.every(opt.store.settings()))) : 10 * 60000)) return Promise.resolve(hit.data);
    return opt.offshoreFetch(url).then(data => {
      fetchCache.set(url, { at: Date.now(), data });
      if (fetchCache.size > 40) fetchCache.delete(fetchCache.keys().next().value);
      return data;
    });
  }

  function profilesPayload() { return { active: opt.store.activeId(), profiles: opt.store.profiles() }; }
  function snapshotPayload() {
    return Object.assign({}, opt.collector.snapshot(), { settings: opt.store.settings(), profiles: profilesPayload() });
  }

  function handle(req, res, u, role) {
    const p = u.pathname, m = req.method;
    if (m === 'GET' || m === 'HEAD') {
      if (p === '/api/info') { json(res, 200, opt.info(role)); return true; }
      if (role === 'setup') return false;
      if (p === '/api/snapshot') { json(res, 200, snapshotPayload()); return true; }
      if (p === '/api/settings') { json(res, 200, opt.store.settings()); return true; }
      if (p === '/api/profiles') { json(res, 200, profilesPayload()); return true; }
      if (p === '/api/history') {
        const hours = Math.max(1, Math.min(24 * 45, Number(u.searchParams.get('hours')) || 48));
        json(res, 200, { hours, entries: opt.store.history(hours) });
        return true;
      }
      if (p === '/api/offshore') {
        offshore(u.searchParams.get('force') === '1').then(raw => json(res, 200, raw), e => json(res, 502, { error: String(e && e.message || e) }));
        return true;
      }
      if (p === '/api/om') { json(res, 200, OMB.info()); return true; }
      if (p === '/api/fetch') {
        fetchFor(u.searchParams.get('url')).then(d => json(res, 200, d), e => json(res, e.code || 502, { error: String(e && e.message || e) }));
        return true;
      }
      if (p === '/api/alerts/log') { json(res, 200, opt.store.alertLog(Math.min(1000, Number(u.searchParams.get('limit')) || 200))); return true; }
      if (p === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('retry: 5000\n\n');
        res.write('event: snapshot\ndata: ' + JSON.stringify(snapshotPayload()) + '\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return true;
      }
      return false;
    }
    if (m !== 'POST') return false;
    if (req.headers['x-mc'] !== '1') { json(res, 403, { error: 'missing X-MC header' }); return true; }
    if (role === 'setup') return false;
    readBody(req).then(async body => {
      if (p === '/api/refresh') { await opt.collector.run('manual'); return json(res, 200, snapshotPayload()); }
      if (p === '/api/settings') {
        const before = opt.store.settings();
        const s = opt.store.setSettings(body || {});
        if (s.refreshMin !== before.refreshMin) opt.collector.schedule();
        if (s.lang !== before.lang) { try { require('../www/assets/js/i18n').setLang(s.lang); } catch (e) { /* */ } }
        try { opt.onSettings && opt.onSettings(s, before); } catch (e) { /* */ }
        const relocated = ['lang', 'kind', 'lat', 'lon', 'marineLat', 'marineLon', 'metLocationId', 'warningKeywords', 'waterDistrict', 'scrapeInfobanjir', 'useDataGovFlood']
          .some(k => s[k] !== before[k]);
        if (relocated) opt.collector.run('settings');
        broadcast('settings', s);
        broadcast('profiles', profilesPayload());
        return json(res, 200, s);
      }
      if (p === '/api/profiles') {
        const b = body || {}, before = opt.store.activeId();
        if (b.action === 'save') {
          const saved = opt.store.saveProfile(b.profile || {});
          if (b.activate) opt.store.setActive(saved.id);
        } else if (b.action === 'delete') opt.store.deleteProfile(String(b.id));
        else if (b.action === 'activate') opt.store.setActive(String(b.id));
        else return json(res, 400, { error: 'action?' });
        const changed = opt.store.activeId() !== before;
        const edited = b.action === 'save' && (b.profile || {}).id === opt.store.activeId();
        if (changed) opt.collector.switchProfile();
        else if (edited) opt.collector.run('settings');
        try { opt.onSettings && opt.onSettings(opt.store.settings()); } catch (e) { /* */ }
        broadcast('profiles', profilesPayload());
        if (changed || edited) broadcast('settings', opt.store.settings());
        return json(res, 200, profilesPayload());
      }
      if (p === '/api/alerts/ack') { return json(res, 200, opt.collector.ack(String((body && body.key) || 'all'))); }
      if (p === '/api/alerts/test') {
        const a = { key: 'test:' + Date.now(), cat: 'system', level: 'warning', title: L('Ujian alert'), body: L('Ini ujian bunyi dan notifikasi Dashboard Cuaca Aziz.'), test: true, t: Date.now() };
        broadcast('alert', [a]);
        try { opt.onTestAlert && opt.onTestAlert(a); } catch (e) { /* */ }
        return json(res, 200, { ok: true });
      }
      json(res, 404, { error: 'tiada' });
    }).catch(e => { try { json(res, 400, { error: String(e.message) }); } catch (e2) { /* already answered */ } });
    return true;
  }

  return { handle, broadcast, clientCount: () => clients.size };
}

module.exports = { create };
