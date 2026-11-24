// Monsoon EYE & Sentinel OceanWATCH - browser tests (no internet: tests/web-routes.js answers every source).
//   npx playwright install chromium (once), then: npx playwright test
const { test, expect } = require('@playwright/test');
const E = require('../tools/editions');
const { sources } = require('./web-routes');

async function open(page, ed, opts) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await sources(page, opts);
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => true }); });
  await page.goto('/?web&ed=' + ed);
  await page.waitForFunction(() => window.MC && MC.state.snap && MC.state.snap.at, null, { timeout: 45000 });
  return errors;
}

if (E['monsoon-eye']) test.describe('Monsoon EYE', () => {
  test('dashboard: the answer on top, 4 tiles, rivers upstream -> downstream, land warnings only, own storage', async ({ page }) => {
    const errors = await open(page, 'me');
    await expect(page.locator('#dashHero h2')).not.toBeEmpty();
    await expect(page.locator('#dashHero .h-ring b')).toHaveText(/^\d+$/);
    await expect(page.locator('#dashTiles > *')).toHaveCount(4);
    await expect(page.locator('#waterBody .rv')).toHaveCount(8);
    await expect(page.locator('#waterBody .rv').first()).toContainText('Sg. Mas');
    await expect(page.locator('#cardJobs')).toHaveCount(0);
    expect(await page.title()).toContain('Monsoon EYE');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.some(k => k.indexOf('me_') === 0)).toBeTruthy();
    expect(keys.some(k => k.indexOf('mc_') === 0)).toBeFalsy();
    const warns = await page.evaluate(() => (MC.state.snap.met.warnings || []).map(w => w.title_en));
    expect(warns.every(t => !/rough seas/i.test(t))).toBeTruthy();
    expect(errors).toEqual([]);
  });
  test('menu Sungai opens the water level page; Ask AI: every purpose has the app guide and a prompt', async ({ page }) => {
    const errors = await open(page, 'me');
    await page.click('.rbtn[data-site-go="waterlevel"]');
    await expect(page.locator('#siteHost iframe')).toHaveCount(1);
    await page.click('.rbtn[data-view="ask"]');
    const n = await page.locator('.ask-t').count();
    expect(n).toBe(8);
    for (let i = 0; i < n; i++) {
      await page.locator('.ask-t').nth(i).click();
      await expect(page.locator('.ask-guide')).not.toBeEmpty();
      expect((await page.locator('#askPrompt').inputValue()).length).toBeGreaterThan(300);
    }
    expect(errors).toEqual([]);
  });
  test('1.1.4: Water Level page shows the GitHub copy at once while the relay reads live; Info Banjir = app card + "Laman asal"; data age colours; MET land warning level & end; dead gauges hidden', async ({ page }) => {
    const now = Date.now(), iso = t => new Date(t).toISOString().slice(0, 19);
    const pad = n => String(n).padStart(2, '0'), myt = t => { const d = new Date(t + 8 * 3600000); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
    let series = 0;
    /* the relay: JPS 5-minute series, slow (2 s each); everything else fails (the dashboard then uses the GitHub copy) */
    await page.route(/relay\.test\/k3y-me-114\//, async r => {
      const u = r.request().url();
      if (/\/mirror$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":false,"reason":"no-token"}' });
      if (/searchresultwaterleveldtlead/.test(u)) {
        series++; await new Promise(f => setTimeout(f, 2000));
        const v = []; for (let t = now - 3 * 3600000; t <= now; t += 900000) v.push({ dt: myt(t), clean: '10.5' });
        return r.fulfill({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ info: { name: 'x', count: v.length }, values: v }) });
      }
      if (/searchresultrainfall/.test(u)) { await new Promise(f => setTimeout(f, 2000)); return r.fulfill({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '{"count":0},]}No result' }); }
      return r.fulfill({ status: 502, body: 'no' });
    });
    /* MET: continuous rain warning for the whole state, as on 24 Nov 2026 */
    const warnings = () => [{
      warning_issue: { issued: iso(now - 3 * 3600000), title_bm: 'Amaran Hujan Berterusan', title_en: 'Continuous Rain Warning' }, valid_from: iso(now - 6 * 3600000), valid_to: iso(now + 3 * 86400000),
      heading_en: 'CONTINUOUS RAIN WARNING (ALERT)', heading_bm: 'AMARAN HUJAN BERTERUSAN (WASPADA)',
      text_en: 'Continuous rain is expected to occur over the states of Kelantan (Tumpat) • Terengganu until Friday.', text_bm: 'Hujan berterusan dijangka berlaku di negeri Kelantan (Tumpat) • Terengganu sehingga Jumaat.' }];
    await page.addInitScript(() => { if (!sessionStorage.getItem('r')) { sessionStorage.setItem('r', '1'); localStorage.setItem('me_settings', JSON.stringify({ relayUrl: 'https://relay.test', relayKey: 'k3y-me-114' })); } });
    const errors = await open(page, 'me', { warnings, jps: j => { j.waterAt = new Date(now - 5 * 3600000).toISOString(); j.rainAt = new Date(now - 45 * 60000).toISOString(); } });
    /* data age: 5 hours = red, 45 min = amber */
    await expect(page.locator('#waterSub')).toHaveClass(/age-bad/);
    await expect(page.locator('#rainStSub')).toHaveClass(/age-warn/);
    /* MET land warning: level and until when */
    await expect(page.locator('#dashTiles')).toContainText(/Waspada.*hingga|Alert.*until/);
    await expect(page.locator('#dashHero')).not.toContainText(/model mungkin kurang anggar|can be short of heavy monsoon rain/);   /* the models agree (108 mm) */
    await page.evaluate(() => { MC.state.risk.rain = 5; MC.EXT.dash(); });
    await expect(page.locator('#dashHero')).toContainText(/model mungkin kurang anggar|can be short of heavy monsoon rain/);       /* MET warns, models see 5 mm */
    /* Water Level: the GitHub copy shows at once; the live readings come in afterwards */
    await page.click('.rbtn[data-site-go="waterlevel"]');
    const km = page.frameLocator('#siteHost iframe');
    await expect(km.locator('.km-cnt').first()).toBeVisible({ timeout: 4000 });
    await expect(km.locator('#kmLive')).toBeVisible();
    await expect(km.locator('#kmLive')).toHaveCount(0, { timeout: 30000 });
    await expect(km.locator('.km-head')).toContainText(/Langsung \(relay\)|Live \(relay\)/);
    expect(series).toBeGreaterThan(3);
    /* Info Banjir Terengganu (answers only from Malaysia): the app's own card, with the original site one tap away */
    await page.click('.rbtn[data-view="dashboard"]');
    await page.evaluate(() => MC.Sites.show('infobanjir', true));
    await expect(page.locator('.toast.orig a')).toHaveAttribute('href', /infobanjir\.terengganu\.gov\.my/);
    await expect(page.locator('#view-dashboard')).toBeVisible();
    expect(errors).toEqual([]);
  });
  test('add a district: wrong links are caught, the district becomes a profile', async ({ page }) => {
    const errors = await open(page, 'me');
    await page.route(/api\.data\.gov\.my\/weather\/forecast\?contains=Ds/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{ location: { location_id: 'Ds065', location_name: 'Kemaman' } }]) }));
    await page.evaluate(() => MC.show('settings'));
    await page.click('#dzStart');
    await page.click('#dzLoadD');
    await page.locator('select[data-dz=name]').selectOption('Dungun');
    await page.fill('[data-dz=lat]', '4.776'); await page.fill('[data-dz=lon]', '103.415');
    await page.click('#dzNext');
    await page.fill('[data-dz=met]', 'Ds065'); await page.click('#dzCheckMet');
    await expect(page.locator('#distBody .dz-m.bad').filter({ hasText: 'Kemaman' })).toHaveCount(1);
    await page.click('#dzNext');
    await page.click('[data-dz-auto=wl]');
    await expect(page.locator('#distBody .dz-tbl tbody tr')).not.toHaveCount(0);
    const t = page.locator('[data-dz=wlText]');
    await t.fill((await t.inputValue()) + '\n3117070\n4131001_');
    await page.click('[data-dz-read=wl]');
    await expect(page.locator('#distBody')).toContainText('3117070');
    await expect(page.locator('#distBody .dz-m.bad').filter({ hasText: '3117070' })).toHaveCount(1);
    await expect(page.locator('#distBody .dz-m.warn').filter({ hasText: 'Kemaman' })).toHaveCount(1);
    for (let i = 0; i < 3; i++) await page.click('#dzNext');
    page.on('dialog', d => d.dismiss());
    await page.click('#dzSave');
    await expect.poll(() => page.evaluate(() => MC.state.profiles.profiles.map(p => p.name))).toContain('Dungun');
    const d = await page.evaluate(() => JSON.parse(MC.state.profiles.profiles.filter(p => p.name === 'Dungun')[0].district));
    expect(d.state).toBe('TRG'); expect(d.water.length).toBeGreaterThan(0); expect(d.upstream.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

if (E.oceanwatch) test.describe('Sentinel OceanWATCH', () => {
  test('dashboard: Go / No-Go on top with a job picker, jobs today table, sea warnings only, own storage', async ({ page }) => {
    const errors = await open(page, 'ow');
    await expect(page.locator('#dashHero .h-go b')).toHaveText(/GO|CAUTION|NO-GO|LIMITED|STAY IN LQ/, { timeout: 30000 });
    await expect(page.locator('#jobsBody table.jx tr')).toHaveCount(12);
    await page.locator('#heroJob').selectOption('cargo');
    await expect(page.locator('#dashHero .h-go span').first()).toContainText(/Crane|CRANE/);
    await expect(page.locator('#cardWater')).toBeHidden();
    expect(await page.title()).toContain('OceanWATCH');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.some(k => k.indexOf('ow_') === 0)).toBeTruthy();
    const warns = await page.evaluate(() => (MC.state.snap.met.warnings || []).map(w => w.title_en));
    expect(warns.every(t => /seas|wind/i.test(t))).toBeTruthy();
    expect(errors).toEqual([]);
  });
  test('My jobs: add one, it shows in the jobs table and in Ask AI › Continue or demob with a start time', async ({ page }) => {
    const errors = await open(page, 'ow');
    await page.evaluate(() => MC.show('settings'));
    await page.click('#mjAdd');
    await page.fill('#mjName', 'Wellwork - HWU');
    await page.fill('[data-mj="w1"]', '20'); await page.fill('[data-mj="h1"]', '2.5');
    await page.click('#mjSave');
    await expect(page.locator('#myJobsBody .mj-row')).toContainText('Wellwork - HWU');
    await page.evaluate(() => MC.show('dashboard'));
    await expect(page.locator('#jobsBody tr.mine')).toContainText('Wellwork - HWU');
    await page.click('.rbtn[data-view="ask"]');
    await page.click('.ask-t[data-t="demob"]');
    await page.click('.seg[data-f="mode"] [data-v="my"]');
    await expect(page.locator('.ask-guide .big')).toContainText(/demob|Demob|limit|had/i);
    expect(await page.locator('#askPrompt').inputValue()).toContain('Wellwork - HWU');
    const n = await page.locator('.ask-t').count();
    expect(n).toBe(9);
    for (let i = 0; i < n; i++) {
      await page.locator('.ask-t').nth(i).click();
      await expect(page.locator('.ask-guide')).not.toBeEmpty();
      expect((await page.locator('#askPrompt').inputValue()).length).toBeGreaterThan(300);
    }
    expect(errors).toEqual([]);
  });
  test('Weather page: every model together - now, 72 hours in 6-hour columns, 3-hour table, 7-day charts, tides (platform + Cukai port)', async ({ page }) => {
    const errors = await open(page, 'ow');
    /* after open(): the newest route wins */
    await page.route(/tide-cukai\.json/, r => { const n = Date.now(), H = 3600000, ev = [];
      for (let i = 0; i < 8; i++) ev.push({ time: new Date(n + (2 + i * 6.2) * H).toISOString(), type: i % 2 ? 'low' : 'high', m: i % 2 ? 0.5 : 2.4 });
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ place: 'cukai', eventsAt: new Date().toISOString(), events: ev }) }); });
    await page.click('.rbtn[data-view="weather"]');
    await expect(page.locator('.mw-head')).toContainText(/kt/, { timeout: 30000 });
    await expect(page.locator('.mw-models')).toContainText(/6\/6/);
    await expect(page.locator('.mw-hero')).toContainText('Irong Barat A');
    await expect(page.locator('.mw-in')).toHaveCount(4);
    expect(await page.locator('.mw-in svg.ic').count()).toBe(4);              /* drawn icons, no emoji */
    expect(await page.locator('.mw-tl-c').count()).toBeGreaterThanOrEqual(10);
    await page.locator('.mw-tl-c').nth(3).click();
    await expect(page.locator('.mw-tl-c').nth(3)).toHaveClass(/on/);
    await expect(page.locator('.mw-tl-say p')).toContainText(/\d+ kt \(\d+–\d+\)/);
    await page.click('[data-mw-tab="table"]');
    expect(await page.locator('.mw-tb tbody tr:not(.mw-dr)').count()).toBeGreaterThanOrEqual(20);
    await page.click('[data-mw-tab="charts"]');
    await expect(page.locator('svg.mw-ch')).toHaveCount(4);
    await expect(page.locator('svg.mw-ch .mw-lim').first()).toBeAttached();
    await page.click('[data-mw-tab="tide"]');
    await expect(page.locator('.mw-tide')).toBeAttached();
    await expect(page.locator('.mw-tb.sm tbody tr').first()).toContainText(/Pasang|Surut|High|Low/);
    expect(errors).toEqual([]);
  });
  test('Vessels page: own chart of the platform, own list (checked numbers), one map per vessel, MarineTraffic switch, platform pinned', async ({ page }) => {
    const maps = [];
    await page.route(/vesselfinder\.com\/aismap|marinetraffic\.com\/en\/ais\/embed/, r => { maps.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' }); });
    const errors = await open(page, 'ow');
    await page.click('.rbtn[data-view="vessels"]');
    /* our own chart first: coastline, rings, route from Kemaman port, the platform */
    await expect(page.locator('#vsMap svg.ck')).toBeVisible();
    expect(await page.locator('#vsMap .ck-land').count()).toBeGreaterThan(3);
    await expect(page.locator('#vsMap .ck-ring')).toHaveCount(4);
    await expect(page.locator('#vsMap .ck-pfl')).toHaveText('Irong Barat A');
    await expect(page.locator('#vsMap .ck-rt')).toContainText(/\d+ nm · \d+°T/);
    await page.click('[data-ck="in"]');
    await expect(page.locator('#vsMap svg.ck')).toBeVisible();
    await page.click('#vsEdit');
    const row = page.locator('.vs-tb tr[data-i]').first();
    await row.locator('[data-k="name"]').fill('SK Patron');
    await row.locator('[data-k="mmsi"]').fill('53304910');            /* 8 digits: refused */
    await page.click('#vsSave');
    await expect(page.locator('.vs-err')).toContainText(/9/);
    await page.locator('.vs-tb tr[data-i]').first().locator('[data-k="mmsi"]').fill('533049100');
    await page.locator('.vs-tb tr[data-i]').first().locator('[data-k="job"]').selectOption('lq');
    await page.click('#vsAdd');
    const r2 = page.locator('.vs-tb tr[data-i]').nth(1);
    await r2.locator('[data-k="name"]').fill('JM Perkasa 2'); await r2.locator('[data-k="imo"]').fill('9585833'); await r2.locator('[data-k="type"]').selectOption('av');
    await r2.locator('[data-k="call"]').fill('9m-ab 2');
    await page.click('#vsSave');
    await expect(page.locator('.vs-pill.on')).toContainText('Irong Barat A');              /* 1.3.2: saving keeps the area view */
    await page.click('.vs-row [data-vs="v533049100"]');
    await expect(page.locator('.vs-pill[data-vs]')).toHaveCount(3);        /* 1.3.2: area, all, the vessel open now */
    await expect(page.locator('.vs-pill.on')).toContainText('SK Patron');
    await expect(page.locator('.vs-pill.on .vs-st')).toHaveText(/GO|CAUTION|LIMITED|STAY/);
    expect(await page.locator('.vs-pill svg.ic-v').count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.vs-det')).toContainText('533049100');
    await expect.poll(() => maps.some(u => /aismap.*mmsi=533049100.*track=true/.test(u))).toBeTruthy();
    await page.click('[data-vs="all"]');
    await expect(page.locator('.vs-grid .vs-cell')).toHaveCount(2);
    await expect.poll(() => maps.some(u => /imo=9585833/.test(u))).toBeTruthy();
    await page.click('[data-vs-src="mt"]');
    await expect.poll(() => maps.some(u => /ais\/embed\/.*mmsi:533049100/.test(u))).toBeTruthy();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')));
    expect(kept.list.map(v => v.name)).toEqual(['SK Patron', 'JM Perkasa 2']);
    expect(kept.list[1].call).toBe('9MAB2'); expect(kept.list[1].type).toBe('av');
    /* around the platform on an outside map: Irong Barat A pinned over its centre */
    await page.click('[data-vs="area"]');
    await page.click('[data-vs-src="vf"]');
    await expect(page.locator('#vsMap .vs-pin')).toContainText('Irong Barat A');
    await expect(page.locator('#vsMap .vs-pin svg.ic-rig')).toBeAttached();
    await expect(page.locator('#vsCenter')).toBeVisible();
    await page.click('[data-vs="v533049100"]');
    await expect(page.locator('[data-vs-src="chart"]')).toHaveCount(1);        /* 1.3.0: one vessel on our chart too */
    await expect(page.locator('[data-vs-src="vf"]')).toHaveAttribute('aria-selected', 'true');
    expect(errors).toEqual([]);
  });
  test('position reports (1.3.0): formulas, bearing/distance <-> lat/lon, tap, ETA, estimate, history, old report, AIS heard', async ({ page }) => {
    let aisAsked = 0;
    await page.route(/relay\.test\/k3y-ais-130\/ais\?/, r => { aisAsked++; r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: true, vessels: [{ mmsi: '533000486', name: 'JM PERKASA 2', lat: 5.60, lon: 104.70, sog: 8.2, cog: 300, hdg: 299, at: '2026-11-24 00:10:00.1 +0000 UTC' }, { mmsi: '111222333', name: 'OTHER SHIP', lat: 5.45, lon: 104.9, sog: 0, cog: 0, hdg: 511 }] }) }); });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seed130')) return;
      sessionStorage.setItem('seed130', '1');
      const now = Date.now(), H = 3600000;
      localStorage.setItem('ow_settings', JSON.stringify({ relayUrl: 'https://relay.test', relayKey: 'k3y-ais-130' }));
      localStorage.setItem('ow_vessels', JSON.stringify({ list: [
        { id: 'v533049100', name: 'SK Patron', mmsi: '533049100', type: 'psv' },
        { id: 'v533000486', name: 'JM Perkasa 2', mmsi: '533000486', type: 'crew', kn: 22 },
        { id: 'v525007132', name: 'Limin Handler', mmsi: '525007132', type: 'ahts' }], sel: 'area', src: 'chart', zoom: 9, track: true,
        reports: { v525007132: [{ t: now - 9 * H, lat: 5.81, lon: 104.54, sog: 4, cog: 200 }, { t: now - 4 * 24 * H, lat: 5.7, lon: 104.5, sog: null, cog: null }],
          gone: [{ t: now - H, lat: 5, lon: 104 }] } }));
    });
    const errors = await open(page, 'ow');
    /* the formulas (destination point, haversine + bearing, deg-min parsing, dead reckoning, ETA) */
    const g = await page.evaluate(() => {
      const G = MC.EXT.Marine.Geo, P = { lat: 5.5501, lon: 104.7745 }, d = G.dest(P, 45, 12), back = G.inv(P, d);
      const rep = { t: Date.now() - 2 * 3600000, lat: P.lat, lon: P.lon, sog: 10, cog: 90 };
      return { d, back, dm: G.dm(d.lat, 'lat') + ' ' + G.dm(d.lon, 'lon'), p1: G.parse("5°41.5'N", 'lat'), p2: G.parse('104 55 E', 'lon'), p3: G.parse('5.6915', 'lat'), p4: G.parse('5°41.5′S', 'lat'),
        p5: G.parse('104°E', 'lat'), p6: G.parse('5°61′N', 'lat'), p7: G.parse('104°32.4′B', 'lon'), dr: G.dr(rep, Date.now()), dr7: G.dr(Object.assign({}, rep, { t: Date.now() - 7 * 3600000 }), Date.now()),
        eta: G.eta(d, P, 20, 225), away: G.eta(d, P, 20, 45), dur: MC.EXT.Marine.dur(1.5) };
    });
    expect(g.d.lat).toBeCloseTo(5.6915, 3); expect(g.d.lon).toBeCloseTo(104.9165, 3);
    expect(g.back.nm).toBeCloseTo(12, 6); expect(g.back.brg).toBeCloseTo(45, 4);
    expect(g.dm).toBe('5°41.48′N 104°54.99′E');
    expect(g.p1).toBeCloseTo(5.691667, 5); expect(g.p2).toBeCloseTo(104.916667, 5); expect(g.p3).toBe(5.6915); expect(g.p4).toBeCloseTo(-5.691667, 5);
    expect(g.p5).toBeNull(); expect(g.p6).toBeNull(); expect(g.p7).toBeCloseTo(-104.54, 5);
    expect(g.dr.hours).toBeCloseTo(2, 2); expect(g.dr.lat).toBeCloseTo(5.5501, 2); expect(g.dr.lon).toBeCloseTo(104.7745 + 20 / 60 / Math.cos(5.5501 * Math.PI / 180), 2);
    expect(g.dr7).toBeNull();                                                           /* no estimate after 6 h */
    expect(g.eta.hours).toBeCloseTo(0.6, 3); expect(g.eta.toward).toBe(true); expect(g.away.toward).toBe(false);
    expect(g.dur).toBe('1 h 30 min');
    /* the chart: an old report is faded, reports over 3 days and of removed vessels are dropped */
    await page.click('.rbtn[data-view="vessels"]');
    await expect(page.locator('#vsMap .ck-vs.old .ck-hull')).toHaveCount(1);
    await expect(page.locator('.vs-row:has([data-vs="v525007132"]) .vs-rl')).toContainText(/old report/);
    await expect(page.locator('.vs-row.none')).toHaveCount(2);                                  /* not on the chart yet */
    await expect(page.locator('.vs-row.none [data-rp-mr]')).toHaveCount(2);
    const kept0 = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).reports);
    expect(Object.keys(kept0)).toEqual(['v525007132']); expect(kept0.v525007132.length).toBe(1);
    /* AIS heard through the relay: my vessel by its name, another small, the count in the key */
    await expect.poll(() => aisAsked).toBeGreaterThan(0);
    await expect(page.locator('#vsMap .ck-ais.mine')).toHaveCount(1);
    await expect(page.locator('#vsMap .ck-ais')).toHaveCount(2);
    await expect(page.locator('#vsMap .ck-ail.mine')).toContainText('JM Perkasa 2 · AIS');
    await expect(page.locator('#vsMap .ck-key')).toContainText('AIS: 2');
    /* report: bearing + distance fills lat / lon */
    await page.click('#vsRep');
    await page.selectOption('#rpVes', 'v533049100');
    await page.fill('#rpBrg', '045'); await page.fill('#rpNm', '12');
    await expect(page.locator('#rpLat')).toHaveValue('5°41.48′N');
    await expect(page.locator('#rpLon')).toHaveValue('104°54.99′E');
    await expect(page.locator('#rpSay')).toContainText('12.0 nm');
    await expect(page.locator('#rpSay')).toContainText('ETA 1 h 12 min');            /* 12 nm at 10 kn (PSV usual speed) */
    await expect(page.locator('#vsMap .ck-new')).toHaveCount(1);
    /* lat / lon fills bearing + distance */
    await page.fill('#rpLat', '5.5501'); await page.fill('#rpLon', "104°46.47'E");
    await expect(page.locator('#rpNm')).toHaveValue('0.0');
    await page.fill('#rpLat', '5.55'); await page.fill('#rpLon', '104.95');
    await expect(page.locator('#rpBrg')).toHaveValue('090');
    /* a course away from the platform warns */
    await page.fill('#rpSog', '12'); await page.fill('#rpCog', '090');
    await expect(page.locator('#rpSay .warn')).toBeVisible();
    await page.fill('#rpCog', '270');
    await expect(page.locator('#rpSay .warn')).toHaveCount(0);
    /* bad values are refused */
    await page.fill('#rpSog', '55'); await page.click('#rpSave');
    await expect(page.locator('#rpSay .bad')).toContainText('40');
    await page.fill('#rpSog', '12');
    /* a tap on the chart sets the position */
    const box = await page.locator('#vsMap svg.ck').boundingBox();
    await page.mouse.click(box.x + box.width * 0.5 + 40, box.y + box.height * 0.5);
    await expect(page.locator('#rpBrg')).toHaveValue(/^(08\d|09\d)$/);
    await page.fill('#rpBrg', '090'); await page.fill('#rpNm', '10');
    await page.click('#rpSave');
    /* saved: the vessel's own view on the chart, distance / ETA on its card and in the panel */
    await expect(page.locator('.vs-pill.on')).toContainText('SK Patron');
    await expect(page.locator('[data-vs-src="chart"]')).toHaveAttribute('aria-selected', 'true');
    await page.click('[data-vs="area"]');
    await expect(page.locator('.vs-row:has([data-vs="v533049100"]) .vs-rl')).toContainText(/(9\.\d|10\.0) nm · ETA (4\d|50) min/);
    await expect(page.locator('.vs-row').first()).toContainText('SK Patron');                   /* nearest first */
    await page.click('.vs-row [data-vs="v533049100"]');
    await expect(page.locator('.vs-last')).toContainText('090°T · 10.0 nm');
    await expect(page.locator('#vsMap .ck-vs.sel .ck-hull')).toHaveCount(1);
    await expect(page.locator('#vsMap .ck-to')).toHaveCount(1);
    /* a second report: history of 2, a track; one deleted */
    await page.click('[data-rp-new="v533049100"]');
    await page.fill('#rpWhen', await page.evaluate(() => new Date(Date.now() + 8 * 3600000 - 30 * 60000).toISOString().slice(0, 16)));
    await page.fill('#rpBrg', '100'); await page.fill('#rpNm', '15');
    await page.click('#rpSave');
    await expect(page.locator('.vs-hist summary')).toContainText('2');
    await expect(page.locator('#vsMap .ck-trk')).toHaveCount(1);
    const k = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).reports.v533049100);
    expect(k.length).toBe(2); expect(k[0].t).toBeGreaterThan(k[1].t); expect(k[0].sog).toBe(12); expect(k[0].cog).toBe(270);
    await page.locator('.vs-hist summary').click();
    await page.locator('[data-rp-del]').last().click();
    await expect(page.locator('.vs-hist')).toHaveCount(0);
    /* usual speed in Vessel settings: checked, kept */
    await page.click('#vsEdit');
    await page.locator('.vs-tb tr[data-i]').first().locator('[data-k="kn"]').fill('99');
    await page.click('#vsSave');
    await expect(page.locator('.vs-err')).toContainText('40');
    await page.locator('.vs-tb tr[data-i]').first().locator('[data-k="kn"]').fill('11');
    await page.click('#vsSave');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).list[0].kn)).toBe(11);
    expect(errors).toEqual([]);
  });
  test('VesselFinder paste (1.3.0): voyage -> estimate along the route, vessel picked by MMSI, stops at the destination; job chip fits; coast without box edges', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seedvf')) return;
      sessionStorage.setItem('seedvf', '1');
      localStorage.setItem('ow_vessels', JSON.stringify({ list: [
        { id: 'v533000486', name: 'JM Perkasa 2', mmsi: '533000486', type: 'crew', job: 'lq' },
        { id: 'v533049100', name: 'SK Patron', mmsi: '533049100', imo: '9543213', type: 'psv', job: 'lq' }], sel: 'area', src: 'chart', zoom: 9, track: true }));
    });
    const errors = await open(page, 'ow');
    await page.click('.rbtn[data-view="vessels"]');
    /* 1.3.2: my vessels as a list beside the chart, the job status as one small word inside each row */
    const rows = page.locator('.vs-list .vs-row');
    await expect(rows).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const rb = await rows.nth(i).boundingBox(), sb = await rows.nth(i).locator('.vs-st').boundingBox();
      expect(sb.x + sb.width).toBeLessThanOrEqual(rb.x + rb.width + 0.5);
    }
    await expect(rows.first().locator('.vs-st')).toHaveText(/GO|CAUTION|LIMITED|STAY/);
    await expect(page.locator('.vs-pill')).toHaveCount(3);                              /* area, all, settings */
    /* the paste box above the chart: an unknown vessel and a page without MMSI are explained */
    await page.fill('#vsPaste', 'MMSI 111222333\nat 5.1° N, 104.2° E');
    await expect(page.locator('#vsPasteSay .bad')).toContainText('111222333');
    await page.fill('#vsPaste', 'just some text');
    await expect(page.locator('#vsPasteSay .bad')).toContainText('MMSI');
    /* a MarineRadar page pasted there goes straight onto the chart, no form */
    await page.fill('#vsPaste', 'MarineRadar\nJM PERKASA 2\nMMSI 533000486\nJM PERKASA 2 is currently under way in the South China Sea, at 5.3000° N, 104.9000° E, making 9.0 knots on a course of 300°.\nUpdated 20 minutes using terrestrial data');
    await expect(page.locator('#vsPasteSay .ok')).toContainText('JM Perkasa 2');
    await expect(page.locator('.vs-row:has([data-vs="v533000486"]) .vs-rl')).toContainText('MarineRadar');
    await expect(page.locator('#vsMap .ck-vs.t-crew .ck-hull')).toHaveCount(1);
    const jm = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).reports.v533000486[0]);
    expect(jm.src).toBe('mr'); expect(jm.sog).toBe(9); expect(jm.cog).toBe(300); expect((Date.now() - jm.t) / 60000).toBeGreaterThan(18);
    /* the MarineRadar button on a row opens that vessel's page and the report form */
    await page.click('.vs-row:has([data-vs="v533049100"]) [data-rp-mr]');
    await expect(page.locator('#rpVes')).toHaveValue('v533049100');
    await page.click('#rpCancel2');
    /* 1.3.2: other platforms from the satellite dataset, with a show / hide button kept in the settings */
    const opN = await page.evaluate(() => self.MC_PLATFORMS.length);
    expect(opN).toBe(145);
    expect(await page.locator('#vsMap .ck-op').count()).toBeGreaterThan(10);
    await expect(page.locator('#vsMap .ck-key')).toContainText('OOGPs v1.0.0');
    await expect(page.locator('#vsMap .ck-op title').first()).toContainText(/nm \d{3}°T/);
    await page.click('[data-ck="plat"]');
    await expect(page.locator('#vsMap .ck-op')).toHaveCount(0);
    await expect(page.locator('[data-ck="plat"]')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).plat)).toBe(false);
    await page.click('[data-ck="plat"]');
    expect(await page.locator('#vsMap .ck-op').count()).toBeGreaterThan(10);
    for (let i = 0; i < 4; i++) await page.click('[data-ck="in"]');
    await expect(page.locator('#vsMap .ck-opl', { hasText: '1.7 nm 217°T' })).toHaveCount(1);
    expect(await page.locator('#vsMap .ck-opl').count()).toBeLessThan(20);
    /* the coast line is drawn apart from the land, without the clip-box edges */
    await expect(page.locator('#vsMap .ck-coast')).toHaveCount(1);
    const edge = await page.evaluate(() => { const B = self.MC_COAST_BOX; return self.MC_COAST.some(r => r.some(p => p[0] === B[0])) && !!B; });
    expect(edge).toBeTruthy();
    /* the VesselFinder page text, as copied (no coordinates on the free page) */
    const txt = await page.evaluate(() => {
      const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], f = t => { const d = new Date(t); return M[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
      const now = Date.now(), atd = now - 13 * 3600000, eta = now + 12 * 3600000;
      return 'SK PATRON\nOffshore Tug/Supply Ship, IMO 9543213\nThe current position of SK PATRON is at South East Asia reported 3 hours ago by AIS. The vessel is en route to IRONG BARAT, sailing at a speed of 5.3 knots.\n' +
        'Destination\nIRONG BARAT\nETA: ' + f(eta) + ' (in 12 hours)\nPredicted ETA\t-\nCourse / Speed\t \nNavigation Status\tUnder way\nPosition Received\t\n3 hours ago\n\nIMO / MMSI\t9543213 / 533049100\nCallsign\t9MLD3\nLast Port\nKemaman, Malaysia\nATD: ' + f(atd) + ' UTC (13 hours ago)\n';
    });
    await page.click('#vsRep');
    await page.selectOption('#rpVes', 'v533000486');
    await page.fill('#rpVf', txt);
    await expect(page.locator('#rpVes')).toHaveValue('v533049100');                 /* picked by its MMSI */
    await expect(page.locator('#rpVfSay .ok')).toContainText(/VF estimate: Kemaman port ATD .* → Irong Barat A ETA .* \(52%\)/);
    await expect(page.locator('#rpVfSay')).toContainText('3 hours ago');
    await expect(page.locator('#rpSog')).toHaveValue('5.3');
    await expect(page.locator('#rpCog')).toHaveValue(/^04[45]$/);
    const nm = +(await page.locator('#rpNm').inputValue());
    expect(nm).toBeGreaterThan(48); expect(nm).toBeLessThan(58);                        /* 48 % of ~110 nm still to go */
    await page.click('#rpSave');
    await expect(page.locator('.vs-pill.on')).toContainText('SK Patron');
    await expect(page.locator('#vsMap .ck-vl.sel')).toContainText('VF estimate');
    await expect(page.locator('.vs-last')).toContainText('Route estimate (VesselFinder)');
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).reports.v533049100[0]);
    expect(rec.src).toBe('vf'); expect(rec.to.lat).toBeCloseTo(5.5501, 3);
    /* MarineRadar's free page has the real position: used as it is, dated by the age of the data, then carried forward */
    const mr = 'MarineRadar — Home\nSK PATRON — Cargo · IMO 9543213\nMY\nMMSI 533049100\nCURRENT POSITION\nLIVE\n\nSK PATRON is currently under way in the South China Sea, at 4.7882° N, 104.0438° E, making 5.3 knots on a course of 45°. It is sailing from KEMAMAN to KEMAMAN with an ETA of common.stamp.\n\nUpdated 3 hours using terrestrial data\nLIVE SATELLITE · LATEST POSITION\n5.3 kn\nSPEED\n45.0°\n/ 42°\nCOURSE / HEADING';
    await page.click('[data-rp-new="v533049100"]');
    await page.fill('#rpVf', mr);
    await expect(page.locator('#rpVfSay .ok')).toContainText(/MarineRadar: 4°47\.29′N 104°02\.63′E · 3 h (00 min )?ago \(shore AIS\)/);
    await expect(page.locator('#rpSog')).toHaveValue('5.3'); await expect(page.locator('#rpCog')).toHaveValue('045');
    const when = await page.locator('#rpWhen').inputValue();
    const age = await page.evaluate(w => (Date.now() - Date.parse(w + ':00+08:00')) / 3600000, when);
    expect(age).toBeGreaterThan(2.95); expect(age).toBeLessThan(3.05);
    await page.click('#rpSave');
    /* it is 3 hours old, so the newer VF estimate stays on top until that one is deleted */
    const recs = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).reports.v533049100);
    expect(recs.map(r => r.src)).toEqual(['vf', 'mr']);
    await page.locator('.vs-hist summary').click();
    await page.locator('[data-rp-del="' + recs[0].t + '"]').click();
    await expect(page.locator('.vs-last')).toContainText('MarineRadar (AIS)');
    await expect(page.locator('#vsMap .ck-vl.sel')).toContainText('MarineRadar · estimated');
    const mrec = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).reports.v533049100[0]);
    expect(mrec.src).toBe('mr'); expect(mrec.lat).toBeCloseTo(4.7882, 3); expect(mrec.to).toBeUndefined();
    /* the last known position more than 6 hours old (JM PERKASA 2 style): warned, kept as an old report */
    const old = await page.evaluate(() => { const M = MC.EXT.Marine; return M.Vf.estimate(M.Vf.parse('JM PERKASA 2 was last reported under way in the South China Sea, at 5.0142° N, 105.2792° E, on common.stamp.\nUpdated 7 hours using terrestrial data\nMMSI 533000486'), Date.now()); });
    expect(old.real).toBe(true); expect(old.sog).toBeNull();
    const box = await page.evaluate(() => { const M = MC.EXT.Marine; return M.Vf.parse('SK PATRON was last reported under way in the South China Sea, at 4.7882° N, 104.0438° E, on common.stamp.\nUpdated 9 hours using terrestrial data\nUnder way using engine\nCURRENT NAVIGATIONAL STATUS\n5.3 kn\nSPEED\n45.0°\n/ 42°\nCOURSE / HEADING\nMMSI 533049100'); });
    expect(box.sog).toBe(5.3); expect(box.cog).toBe(45); expect(box.age).toBe(9); expect((Date.now() - old.at) / 3600000).toBeCloseTo(7, 2);
    /* the estimate never runs past the destination; unknown places and missing times are explained */
    const g = await page.evaluate(() => {
      const M = MC.EXT.Marine, P = { lat: 5.5501, lon: 104.7745 }, start = M.Geo.dest(P, 225, 5);
      const dr = M.Geo.dr({ t: Date.now() - 3 * 3600000, lat: start.lat, lon: start.lon, sog: 10, cog: 45, to: P }, Date.now());
      const now = Date.now();
      return { left: M.Geo.inv(dr, P).nm, why1: M.Vf.estimate({ dest: 'SINGAPORE', from: 'Kemaman', atd: now - 3600000, eta: now + 3600000 }, now).why,
        why2: M.Vf.estimate({ dest: 'IRONG BARAT', from: 'Kemaman' }, now).why, done: M.Vf.estimate({ dest: 'IRONG BARAT', from: 'Kemaman', atd: now - 9e6, eta: now - 1e6, sog: 9 }, now),
        prem: M.Vf.estimate(M.Vf.parse('Coordinates\t5.304 N/104.528 E\nCourse / Speed\t45.0 ° / 9.8 kn', now), now) };
    });
    expect(g.left).toBeLessThan(0.01);
    expect(g.why1).toContain('SINGAPORE'); expect(g.why2).toMatch(/ATD/);
    expect(g.done.share).toBe(1); expect(g.done.sog).toBeNull(); expect(g.done.pos.lat).toBeCloseTo(5.5501, 3);
    expect(g.prem.pos.lat).toBeCloseTo(5.304, 3); expect(g.prem.cog).toBe(45); expect(g.prem.sog).toBe(9.8);
    expect(errors).toEqual([]);
  });
  test('Open Waters (1.3.2): every 15 min, heard <6 h = where heard, older = estimate along the route to its AIS destination, stale ETA explained', async ({ page }) => {
    let asked = [];
    const now = Date.now(), H = 3600000, iso = t => new Date(t).toISOString().slice(0, 19) + 'Z';
    const eta = t => { const d = new Date(t); return String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
    const feat = (mmsi, name, lat, lon, seen, p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: Object.assign({ mmsi, name, seen: iso(seen), source: 'aishub' }, p) });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seedow')) return;
      sessionStorage.setItem('seedow', '1');
      localStorage.setItem('ow_vessels', JSON.stringify({ list: [
        { id: 'v533049100', name: 'SK Patron', mmsi: '533049100', type: 'psv' }, { id: 'v533000486', name: 'JM Perkasa 2', mmsi: '533000486', type: 'crew' },
        { id: 'v525007132', name: 'Limin Handler', mmsi: '525007132', type: 'ahts' }, { id: 'v533999999', name: 'No AIS', mmsi: '533999999', type: 'tug' },
        { id: 'v533111222', name: 'JM Gemilang', mmsi: '533111222', type: 'psv' }, { id: 'v533222333', name: 'Alkahfi Care', mmsi: '533222333', type: 'fcb' }], sel: 'area', src: 'chart' }));
    });
    const errors = await open(page, 'ow');
    await page.route(/^https:\/\/ais\.openwaters\.io\/v1\/vessels\?mmsi=/, r => { asked.push(r.request().url()); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', features: [
      feat(533049100, 'SK PATRON', 4.229, 103.511, now - 13 * H, { sog: 6.4, cog: 97.8, destination: 'IRONG BARAT', eta: eta(now + 12 * H) }),
      feat(533000486, 'JM PERKASA 2', 5.40, 104.60, now - 2 * H, { sog: 9.5, cog: 40, destination: 'IRONG BARAT', eta: eta(now + 1 * H) }),
      feat(525007132, 'LIMIN HANDLER', 1.225, 104.164, now - 5 * 24 * H, { sog: 2.4, cog: 10, destination: 'RSK', eta: eta(now - 4 * 24 * H) }),
      feat(533111222, 'JM GEMILANG', 5.20, 104.40, now - 10 * H, { sog: 8, cog: 50, destination: 'ANGSI', eta: eta(now + 5 * H) }),
      feat(533222333, 'ALKAHFI CARE', 4.30, 103.60, now - 63 * 24 * H, { sog: 0, cog: 0 })] }) }); });
    await page.click('.rbtn[data-view="vessels"]');
    await expect.poll(() => asked.length).toBe(1);
    expect(asked[0]).toContain('mmsi=533049100,533000486,525007132,533999999,533111222,533222333');
    /* heard 2 h ago: on the chart where it was heard, carried forward by its speed and course */
    await expect(page.locator('.vs-row:has([data-vs="v533000486"]) .vs-rl')).toContainText('Open Waters');
    /* heard 13 h ago near Kemaman, going to Irong Barat, ETA in 12 h: 52 % along the route */
    await expect(page.locator('.vs-row:has([data-vs="v533049100"]) .vs-rl')).toContainText('Open Waters estimate');
    await expect(page.locator('.vs-row:has([data-vs="v533049100"]) .vs-ro')).toContainText('52%');
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).reports);
    expect(rec.v533049100[0].src).toBe('owe'); expect(rec.v533049100[0].to.lat).toBeCloseTo(5.5501, 3);
    expect(rec.v533000486[0].src).toBe('ow'); expect(rec.v533000486[0].lat).toBeCloseTo(5.40, 3);
    /* (A) no estimate possible but heard within 7 days: the last heard position, faded; older (63 days) or no data: not shown */
    expect(rec.v525007132[0].src).toBe('owl'); expect(rec.v533111222[0].src).toBe('owl'); expect(rec.v533222333).toBeUndefined();
    await expect(page.locator('.vs-row:has([data-vs="v525007132"]) .vs-rl')).toContainText(/last heard 5 days ago/);
    await expect(page.locator('.vs-row:has([data-vs="v525007132"]) .vs-ro')).toContainText(/destination RSK unknown|stale ETA/);
    await expect(page.locator('.vs-row:has([data-vs="v533999999"]) .vs-ro')).toContainText('no data');
    await expect(page.locator('.vs-row:has([data-vs="v533222333"]) .vs-rl')).toContainText('not on the chart yet');
    await expect(page.locator('#vsMap .ck-vl')).toHaveCount(4);
    await expect(page.locator('#vsMap .ck-vs.old.t-ahts .ck-hull')).toHaveCount(1);
    /* (B) my places: the unknown AIS destinations are offered; ANGSI -> the nearest platform; then JM Gemilang is estimated toward it */
    await page.click('#vsEdit');
    await expect(page.locator('[data-pl-add="ANGSI"]')).toBeVisible();
    await expect(page.locator('[data-pl-add="RSK"]')).toBeVisible();
    await page.click('[data-pl-add="ANGSI"]');
    const pick = page.locator('.vs-pt tr[data-pi="0"] [data-pk="pick"]');
    expect(await pick.locator('option').count()).toBeGreaterThan(40);
    await pick.selectOption({ index: 2 });
    await expect(page.locator('.vs-pt tr[data-pi="0"] [data-pk="lat"]')).toHaveValue(/°.*′N/);
    await page.click('#plAdd');
    await page.locator('.vs-pt tr[data-pi="1"] [data-pk="name"]').fill('sg kuang');
    await page.click('#vsSave');
    await expect(page.locator('.vs-err')).toContainText('lat / lon');                   /* a place without a location is refused */
    await page.locator('.vs-pt tr[data-pi="1"] [data-pk="lat"]').fill('4.52');
    await page.locator('.vs-pt tr[data-pi="1"] [data-pk="lon"]').fill("103°27.5'E");
    await page.click('#vsSave');
    const pl = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).places);
    expect(pl.map(x => x.name)).toEqual(['ANGSI', 'SG KUANG']); expect(pl[1].lon).toBeCloseTo(103.4583, 3);
    await expect.poll(() => page.evaluate(() => { const r = JSON.parse(localStorage.getItem('ow_vessels')).reports.v533111222; return r && r[0].src; })).toBe('owe');
    await expect(page.locator('.vs-row:has([data-vs="v533111222"]) .vs-rl')).toContainText('Open Waters estimate');
    await expect(page.locator('.vs-auto')).toContainText('every 15 min');
    await expect(page.locator('.vs-note')).toContainText('Open Waters AIS (openwaters.io)');
    /* a fetch now keeps a single Open Waters estimate per vessel; switching off stops it */
    await page.click('#vsOwNow');
    await expect.poll(() => asked.length).toBe(3);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).reports.v533049100.filter(r => r.src === 'owe').length)).toBe(1);
    await page.click('#vsOw');
    await expect(page.locator('.vs-auto')).toContainText('off');
    await expect(page.locator('.vs-ro')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')).ow)).toBe(false);
    expect(errors).toEqual([]);
  });
  test('AIS: nothing heard or no relay = nothing shown, no error', async ({ page }) => {
    await page.route(/relay\.test\/k3y-ais-131\/ais\?/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, reason: 'no-key' }) }));
    await page.addInitScript(() => { localStorage.setItem('ow_settings', JSON.stringify({ relayUrl: 'https://relay.test', relayKey: 'k3y-ais-131' })); });
    const errors = await open(page, 'ow');
    await page.click('.rbtn[data-view="vessels"]');
    await expect(page.locator('#vsMap svg.ck')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator('#vsMap .ck-ais')).toHaveCount(0);
    await expect(page.locator('#vsMap .ck-key')).not.toContainText('AIS');
    await expect(page.locator('#vsRep')).toHaveCount(0);                     /* no vessels yet: nothing to report */
    expect(errors).toEqual([]);
  });
  test('Models page has the comparison card and the PDF button', async ({ page }) => {
    const errors = await open(page, 'ow');
    await page.click('.rbtn[data-view="models"]');
    await expect(page.locator('#modelsHost #cardOffCmp')).toHaveCount(1);
    await expect(page.locator('#ocPdf')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
