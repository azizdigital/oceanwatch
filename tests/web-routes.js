/* Made-up answers for every public source the web apps read (Open-Meteo, data.gov.my, GitHub mirror, maps), so the browser tests and the
   screenshot tool run with no internet. Same data as tests/web-fixtures (taken from the real sources in Nov 2026). */
'use strict';
const F = require('./web-fixtures/make');

async function sources(page, opts = {}) {
  const now = opts.now || Date.now(), m = F.mirror(now);
  if (opts.jps) opts.jps(m.jps);
  const json = (r, b, st = 200) => r.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
  const off = (r, other) => {
    const u = r.request().url();
    if (!F.isOffshore(u)) return other();
    if ((opts.offFail || []).some(x => u.includes('models=' + x))) return json(r, { error: true, reason: 'bad model' }, 400);
    return json(r, F.offshore(u, now));
  };
  await page.route(/^https:\/\/api\.open-meteo\.com\//, r => off(r, () => json(r, F.forecast(now, { gust: opts.gust }))));
  await page.route(/^https:\/\/marine-api\.open-meteo\.com\//, r => off(r, () => json(r, F.shiftOpenMeteo('om-marine.json', now))));
  await page.route(/^https:\/\/ensemble-api\.open-meteo\.com\//, r => off(r, () => json(r, F.shiftOpenMeteo('om-ensemble-gfs.json', now))));
  await page.route(/^https:\/\/flood-api\.open-meteo\.com\//, r => { const g = F.glofas(r.request().url(), now); if (g) return json(r, g); return json(r, F.shiftOpenMeteo('om-flood.json', now - 7 * 86400000)); });
  await page.route(/^https:\/\/api\.data\.gov\.my\/weather\/warning/, r => json(r, F.warnings(now)));
  await page.route(/^https:\/\/api\.data\.gov\.my\/weather\/forecast/, r => json(r, F.metForecast(now).map(x => Object.assign(x, { location: { location_id: 'Ds065', location_name: 'Kemaman' } }))));
  await page.route(/^https:\/\/api\.data\.gov\.my\/flood-warning/, r => json(r, []));
  const K = F.kemaman(now);
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, r => {
    const u = r.request().url(), k = /\/kemaman\/(.+?\.json)/.exec(u);
    if (k) return k[1] === 'now.json' ? json(r, K.now) : K.files[k[1]] ? json(r, K.files[k[1]]) : json(r, {}, 404);
    if (opts.mirror) { const x = opts.mirror(u, m); if (x) return json(r, x); }
    return /jps-TRG/.test(u) ? json(r, m.jps) : /tide-cukai/.test(u) ? json(r, m.tide) : json(r, {}, 404);
  });
  await page.route(/tile\.openstreetmap\.org/, r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  await page.route(/^https:\/\/(embed\.windy\.com|www\.rainviewer\.com|webcams\.windy\.com)\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1 id=h>' + new URL(r.request().url()).hostname + '</h1>' }));
  if (opts.relay) await page.route(opts.relay.match, opts.relay.handle);
}
module.exports = { sources, F };
