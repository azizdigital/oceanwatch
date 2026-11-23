'use strict';
/* Monsoon EYE & Sentinel OceanWATCH - tests of what each app adds (no internet, no browser):  node tests/edition.js
   which sites / profiles / language each app has, MET land vs sea warnings, My jobs and the demob formula, the district mirror,
   the HTML of each app (its own parts only). In a repo with one app, only that app is tested. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../tools/editions');
const { transform } = require('../tools/edition-html');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const JS = path.join(__dirname, '..', 'www', 'assets', 'js');
/* a fresh copy of the shared code as one app sees it */
function as(id) {
  global.EDITION = id ? E[id] : undefined;
  ['core', 'i18n', 'advisor', 'risk', 'offshore'].forEach(m => { try { delete require.cache[require.resolve(path.join(JS, m))]; } catch (e) { /* not in this app */ } });
  return { C: require(path.join(JS, 'core')), A: require(path.join(JS, 'advisor')) };
}
const ME = !!E['monsoon-eye'], OW = !!E.oceanwatch;

if (ME) test('Monsoon EYE: 23 land sites, Kemaman only, BM first, no relay of the old app, land warnings only', () => {
  const { C } = as('monsoon-eye');
  assert.strictEqual(C.VERSION, E['monsoon-eye'].version);
  assert.deepStrictEqual(C.SITES.map(s => s.id).sort(), E['monsoon-eye'].sites.slice().sort());
  assert.strictEqual(C.SITES.length, 23);
  assert.ok(!C.SITES.some(s => ['windywave', 'vesselfinder', 'marinetraffic', 'metmarine'].includes(s.id)));
  assert.deepStrictEqual(C.DEFAULT_PROFILES.map(p => p.id), ['kemaman']);
  assert.strictEqual(C.cleanProfile({ id: 'x', name: 'X', kind: 'offshore', lat: 5, lon: 103 }).kind, 'land');
  assert.strictEqual(C.DEFAULTS.lang, 'ms');
  assert.strictEqual(C.DEFAULTS.relayUrl, '');
  assert.ok(C.PROFILE_KEYS.includes('ewUpstream') && C.PROFILE_KEYS.includes('district'));
});
if (OW) test('OceanWATCH: 13 sea sites (with MET marine), Irong Barat only, English first, sea warnings only', () => {
  const { C } = as('oceanwatch');
  assert.deepStrictEqual(C.SITES.map(s => s.id).sort(), E.oceanwatch.sites.slice().sort());
  assert.strictEqual(C.SITES.length, 13);
  assert.ok(C.SITES.some(s => s.id === 'metmarine'));
  assert.ok(!C.SITES.some(s => ['waterlevel', 'floodhub', 'camera', 'nadma'].includes(s.id)));
  assert.deepStrictEqual(C.DEFAULT_PROFILES.map(p => p.name + ':' + p.kind), ['Irong Barat:offshore']);
  assert.strictEqual(C.cleanProfile({ id: 'y', name: 'Y', kind: 'land', lat: 4, lon: 103 }).kind, 'offshore');
  assert.strictEqual(C.DEFAULTS.lang, 'en');
});
test('MET warnings: sea (strong winds & rough seas) vs land (rain, thunderstorms)', () => {
  const { C } = as(Object.keys(E)[0]);
  assert.strictEqual(C.metIsSea({ title_en: 'Strong Winds and Rough Seas Warning', title_bm: 'Amaran Angin Kencang dan Laut Bergelora' }), true);
  assert.strictEqual(C.metIsSea({ title_en: 'Continuous Rain Warning', title_bm: 'Amaran Hujan Berterusan' }), false);
  assert.strictEqual(C.metIsSea({ title_en: 'Thunderstorm Warning', title_bm: 'Amaran Ribut Petir' }), false);
});
if (OW) test('My jobs: kept with the 10 jobs, survive saving the limits table, shown in the jobs list', () => {
  const { A } = as('oceanwatch');
  const text = JSON.stringify({ boat: { h: [1.4, 1.9] }, _my: [{ id: 'my-hwu', name: 'Wellwork - HWU', w: [16, 20], g: [22, 28], h: [1.4, 1.8], demobH: 6, safeH: 1, via: 'boat' }] });
  const l = A.limits(text);
  assert.strictEqual(l.acts.length, 11);
  const mine = l.acts.filter(a => a.mine)[0];
  assert.strictEqual(mine.name, 'Wellwork - HWU'); assert.strictEqual(mine.demobH, 6); assert.strictEqual(mine.via, 'boat');
  assert.deepStrictEqual(l.acts.filter(a => a.id === 'boat')[0].h, [1.4, 1.9]);
  /* the limits table saves only id / limits / on / day / thunder: name and demob come back from the text before */
  const rows = l.acts.map(a => ({ id: a.id, w: a.w, g: a.g, h: a.h, sw: a.sw, tp: a.tp, vis: a.vis, on: a.on, day: a.day, lt: a.lt }));
  rows.filter(r => r.id === 'my-hwu')[0].w = [17, 21];
  const back = A.limits(A.limitsText(rows, l.overall, text)).acts.filter(a => a.mine)[0];
  assert.strictEqual(back.name, 'Wellwork - HWU'); assert.deepStrictEqual(back.w, [17, 21]); assert.strictEqual(back.demobH, 6);
  assert.deepStrictEqual(A.myJobs([{ id: 'bad id', name: '', demobH: 999, via: 'ship' }]).map(j => [j.id, j.demobH, j.via]), [['my-1', 72, 'boat']]);
});
if (OW) test('demob: latest start = first stop hour - (demob + safety); worst model earlier, best later; the boat must be able to leave', async () => {
  const { A } = as('oceanwatch');
  const OFF = require(path.join(JS, 'offshore')), FX = require('./web-fixtures/make');
  const now = Date.parse('2026-11-21T12:30:00+08:00');
  const raw = await OFF.collect(5.5501, 104.7745, async u => FX.offshore(u, now));
  const rep = OFF.build(raw, { now, windKt: 15, waveM: 1.5 });
  const lim = A.limits(JSON.stringify({ _my: [{ id: 'my-hwu', name: 'HWU', w: [18, 22], g: [20, 25], h: [1.6, 1.9], demobH: 6, safeH: 1, via: 'boat' }] }));
  const job = lim.acts.filter(a => a.id === 'my-hwu')[0], boat = lim.acts.filter(a => a.id === 'boat')[0];
  const p = A.demobPlan({ rep, snap: {}, job, via: boat, now });
  assert.ok(p.limitAt.m && p.limitAt.hi, 'a stop hour is found');
  assert.ok(p.limitAt.hi <= p.limitAt.m, 'the worst model reaches the limit first');
  assert.ok(!p.limitAt.lo || p.limitAt.lo >= p.limitAt.m, 'the best model last (or never)');
  assert.strictEqual(p.leadH, 7);
  assert.ok(p.startBy.m.t <= p.limitAt.m - 7 * 3600000, 'start at least demob + safety before');
  /* limits already passed now: start now (late) */
  const tight = Object.assign({}, job, { h: [1.0, 1.2] });
  const q = A.demobPlan({ rep, snap: {}, job: tight, via: boat, now });
  assert.strictEqual(q.limitAt.m, now); assert.ok(q.startBy.m.late);
  /* nothing in 3 days */
  const easy = Object.assign({}, job, { w: [60, 70], g: [70, 80], h: [9, 10] });
  assert.ok(A.demobPlan({ rep, snap: {}, job: easy, via: boat, now }).none);
});
if (ME) test('mirror: a district from mirror/districts.json gets its own folder d/<id>/, only its gauges', async () => {
  const K = require('../mirror/kemaman');
  const jps = { water: [{ name: 'A', gid: '111', district: 'Dungun' }, { name: 'B', gid: '222', district: 'Kemaman' }, { name: 'C', gid: '333', district: 'Dungun' }], rain: { stations: [{ name: 'R', gid: '444', district: 'Dungun' }] } };
  const files = {};
  const io = { now: Date.parse('2026-11-21T12:00:00+08:00'), get: async () => JSON.stringify({ info: {}, values: [] }), previous: async () => null, write: (f, d) => { files[f] = d; } };
  await K.district(jps, io, { district: 'Dungun', folder: 'd/dungun/' });
  const now = files['d/dungun/now.json'];
  assert.ok(now); assert.deepStrictEqual(now.water.map(x => x.gid), ['111', '333']); assert.deepStrictEqual(now.rain.map(x => x.gid), ['444']);
  assert.ok(Object.keys(files).every(f => f.indexOf('d/dungun/') === 0));
  const picked = {};
  await K.district(jps, Object.assign({}, io, { write: (f, d) => { picked[f] = d; } }), { district: 'Dungun', folder: 'd/x/', gids: ['333'] });
  assert.deepStrictEqual(picked['d/x/now.json'].water.map(x => x.gid), ['333']);
});
test('HTML of each app: its own parts and name only', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
  Object.keys(E).forEach(id => {
    const h = transform(html, Object.assign({}, E[id], { exported: true }));
    assert.ok(!/__APP_|__ED_|<!--ED:/.test(h), id + ': every word filled in');
    assert.ok(h.includes('<title>' + E[id].name + '</title>'));
    if (E[id].kind === 'land') { assert.ok(h.includes('data-site-go="waterlevel"') && h.includes('district.js') && !h.includes('myjobs.js') && !h.includes('offshore.js')); }
    else { assert.ok(h.includes('id="cardJobs"') && h.includes('myjobs.js') && h.includes('offshore.js') && !h.includes('district.js') && !h.includes('mirror-parse.js')); }
  });
});
test('every L(\'...\') text in the new files has an English translation', () => {
  const I = require(path.join(JS, 'i18n'));
  const miss = [];
  ['edition-ui.js'].forEach(f => {
    const s = fs.readFileSync(path.join(JS, f), 'utf8'), re = /\bL\(\s*'((?:[^'\\]|\\.)*)'/g;
    let m; while ((m = re.exec(s))) { const k = m[1].replace(/\\'/g, "'"); if (!(k in I.EN)) miss.push(k); }
  });
  assert.deepStrictEqual(miss, []);
});

/* PC app (main.js + lib/): Monsoon EYE reads JPS of the profile's state straight from JPS; the GitHub copy only when JPS fails */
if (ME && fs.existsSync(path.join(JS, 'mirror-parse.js')) && fs.existsSync(path.join(__dirname, '..', 'lib', 'collector.js'))) test('Monsoon EYE PC: JPS read directly by the PC, GitHub copy as fallback', async () => {
  as('monsoon-eye');
  ['collector', 'store', 'api'].forEach(m => { try { delete require.cache[require.resolve('../lib/' + m)]; } catch (e) { /* */ } });
  const os = require('os');
  const fx = f => fs.readFileSync(path.join(__dirname, 'web-fixtures', f), 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'me-pc-'));
  const store = require('../lib/store').create(dir);
  let jpsDown = false;
  const asked = [];
  const col = require('../lib/collector').create({
    store,
    fetchJson: async url => { asked.push(url); if (/raw\.githubusercontent\.com\/azizdigital\/monsoon-eye\/data\/jps-TRG\.json/.test(url)) return { state: 'TRG', water: [{ id: 'x', name: 'Mirror St', district: 'Kemaman', level: 1, updated: new Date().toISOString() }], rain: { stations: [] } }; throw new Error('offline'); },
    fetchText: async url => { if (jpsDown) throw new Error('HTTP 503'); return /aras-air-data/.test(url) ? fx('jps-water-TRG.html') : fx('jps-rain-TRG.html'); },
    log: () => {}
  });
  const s1 = await col.run('test'); col.stop();
  assert.ok(s1.jps && s1.jps.live, 'read live from JPS');
  assert.strictEqual(s1.jps.state, 'TRG');
  assert.ok(s1.stations.length >= 5 && s1.stations.every(st => /kemaman/i.test(st.district)), 'Kemaman gauges from the JPS page');
  assert.ok(!asked.some(u => /jps-TRG\.json/.test(u)), 'no GitHub copy needed');
  jpsDown = true;
  const s2 = await col.run('test'); col.stop();
  assert.ok(s2.jps && !s2.jps.live, 'GitHub copy when JPS fails');
  assert.ok(s2.stations.some(st => st.name === 'Mirror St'));
  fs.rmSync(dir, { recursive: true, force: true });
});

(async () => {
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { await t.fn(); pass++; console.log('  ✓ ' + t.name); } catch (e) { fail++; console.log('  ✗ ' + t.name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); }
  }
  global.EDITION = undefined;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
