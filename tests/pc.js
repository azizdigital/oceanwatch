/* PC app check (Electron): starts the real app with a fresh data folder and asks its local server what it is.
     node tests/pc.js            this app alone
     node tests/pc.js --both <otherRepoDir>   this app and the other one at the same time (own ports, own data folders)
   Needs "npm install" first (electron). On Linux without a screen: xvfb-run node tests/pc.js */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

function get(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, headers: { 'X-MC': '1' }, timeout: 5000 }, res => {
      let b = ''; res.on('data', d => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function start(dir) {
  const ed = JSON.parse(fs.readFileSync(path.join(dir, 'edition.json'), 'utf8'));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-' + ed.short + '-'));
  const bin = require(path.join(dir, 'node_modules', 'electron'));
  const args = [dir];
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu');
  const p = spawn(bin, args, { cwd: dir, env: Object.assign({}, process.env, { MC_USERDATA: data, MC_NOSPLASH: '1', ELECTRON_ENABLE_LOGGING: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  p.stdout.on('data', d => { log += d; }); p.stderr.on('data', d => { log += d; });
  return { ed, data, p, log: () => log };
}

async function check(app) {
  const port = app.ed.pc.port;
  let info = null;
  for (let i = 0; i < 60 && !info; i++) {
    await sleep(500);
    try { const r = await get(port, '/api/info'); if (r.status === 200) info = JSON.parse(r.body); } catch (e) { /* not yet */ }
  }
  assert.ok(info, app.ed.name + ': local server did not answer on ' + port + '\n' + app.log().slice(-3000));
  assert.strictEqual(info.name, app.ed.name);
  assert.strictEqual(info.version, app.ed.version);
  assert.strictEqual(info.ports.app, port);
  const page = await get(port, '/');
  assert.strictEqual(page.status, 200);
  assert.ok(page.body.includes(app.ed.name), 'page carries the app name');
  const edJs = await get(port, '/assets/js/edition.js');
  assert.ok(edJs.body.includes('"' + app.ed.id + '"'), 'edition.js is this app');
  const prof = JSON.parse((await get(port, '/api/profiles')).body);
  assert.ok(prof.profiles.length && prof.profiles.every(p => p.kind === app.ed.kind), 'only ' + app.ed.kind + ' profiles');
  /* own data folder */
  for (let i = 0; i < 20 && !fs.existsSync(path.join(app.data, 'config.json')); i++) await sleep(250);
  assert.ok(fs.existsSync(path.join(app.data, 'config.json')), 'config.json in its own data folder');
  /* phone sharing is not part of these apps */
  assert.notStrictEqual((await get(port, '/setup')).status, 200);
  /* the page may read JPS tables / MET through the PC; anything else is refused */
  const no = await get(port, '/api/fetch?url=' + encodeURIComponent('https://example.com/x.json'));
  assert.strictEqual(no.status, 403);
  console.log('  ok  ' + app.ed.name + ' ' + info.version + ' on 127.0.0.1:' + port + ' (' + prof.profiles.map(p => p.name).join(', ') + ')');
}

(async () => {
  const dirs = [path.join(__dirname, '..')];
  const i = process.argv.indexOf('--both');
  if (i > 0 && process.argv[i + 1]) dirs.push(path.resolve(process.argv[i + 1]));
  const apps = dirs.map(start);
  let failed = false;
  try { for (const a of apps) await check(a); }
  catch (e) { failed = true; console.error(e.message); }
  /* the snapshot after the first collection (needs internet; only reported) */
  if (!failed) {
    await sleep(8000);
    for (const a of apps) {
      try { const s = JSON.parse((await get(a.ed.pc.port, '/api/snapshot')).body); console.log('  ..  ' + a.ed.name + ' first collection: ' + (s.at ? 'done' : 'not yet') + (s.sources ? ' · sources ' + Object.keys(s.sources).map(k => k + (s.sources[k].ok ? '✓' : '✗')).join(' ') : '')); }
      catch (e) { console.log('  ..  ' + a.ed.name + ' snapshot: ' + e.message); }
    }
  }
  apps.forEach(a => { try { a.p.kill(); } catch (e) { /* */ } });
  await sleep(1000);
  apps.forEach(a => { try { fs.rmSync(a.data, { recursive: true, force: true }); } catch (e) { /* */ } });
  console.log(failed ? 'PC test FAILED' : 'PC test passed');
  process.exit(failed ? 1 : 0);
})();
