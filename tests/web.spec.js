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
  test('Weather page: every model together - story every 6 hours, 3-hour table, 7-day charts, tides (platform + Cukai port)', async ({ page }) => {
    const errors = await open(page, 'ow');
    /* after open(): the newest route wins */
    await page.route(/tide-cukai\.json/, r => { const n = Date.now(), H = 3600000, ev = [];
      for (let i = 0; i < 8; i++) ev.push({ time: new Date(n + (2 + i * 6.2) * H).toISOString(), type: i % 2 ? 'low' : 'high', m: i % 2 ? 0.5 : 2.4 });
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ place: 'cukai', eventsAt: new Date().toISOString(), events: ev }) }); });
    await page.click('.rbtn[data-view="weather"]');
    await expect(page.locator('.mw-head')).toContainText(/kt/, { timeout: 30000 });
    await expect(page.locator('.mw-where')).toContainText(/6\/6/);
    expect(await page.locator('.mw-p').count()).toBeGreaterThanOrEqual(10);
    await expect(page.locator('.mw-p').first()).toContainText(/\d+ kt \(\d+–\d+\)/);
    await expect(page.locator('.mw-cmp svg')).toHaveCount(2);
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
  test('Vessels page: own list (checked numbers), one map per vessel showing only that vessel, MarineTraffic switch', async ({ page }) => {
    const maps = [];
    await page.route(/vesselfinder\.com\/aismap|marinetraffic\.com\/en\/ais\/embed/, r => { maps.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' }); });
    const errors = await open(page, 'ow');
    await page.click('.rbtn[data-view="vessels"]');
    await expect(page.locator('.vs-none')).toBeVisible();
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
    await r2.locator('[data-k="name"]').fill('JM Perkasa 2'); await r2.locator('[data-k="imo"]').fill('9585833'); await r2.locator('[data-k="type"]').selectOption('ahts');
    await page.click('#vsSave');
    await expect(page.locator('.vs-it')).toHaveCount(4);                 /* all, area, 2 vessels */
    await expect(page.locator('.vs-it.on')).toContainText('SK Patron');
    await expect(page.locator('.vs-it.on .chip')).toContainText(/GO|CAUTION|LIMITED|STAY/);
    await expect.poll(() => maps.some(u => /aismap.*mmsi=533049100.*track=true/.test(u))).toBeTruthy();
    await page.click('[data-vs="all"]');
    await expect(page.locator('.vs-grid .vs-cell')).toHaveCount(2);
    await expect.poll(() => maps.some(u => /imo=9585833/.test(u))).toBeTruthy();
    await page.click('[data-vs-src="mt"]');
    await expect.poll(() => maps.some(u => /ais\/embed\/.*mmsi:533049100/.test(u))).toBeTruthy();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('ow_vessels')));
    expect(kept.list.map(v => v.name)).toEqual(['SK Patron', 'JM Perkasa 2']);
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
