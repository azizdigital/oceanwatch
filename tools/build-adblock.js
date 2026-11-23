'use strict';
/* Build the ad blocker engine that ships inside the app (lib/adblock-engine.bin), so blocking works at once and offline.
   The app refreshes the lists itself once a day from the same addresses.
   Usage: node tools/build-adblock.js        (downloads with curl, which follows the system proxy) */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { FiltersEngine } = require('@ghostery/adblocker');
const { LISTS, RESOURCES, CONFIG } = require('../lib/adblock-lists');

const get = url => execFileSync('curl', ['-sSfL', '--max-time', '120', url], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const texts = LISTS.map(u => { const t = get(u); console.log(String(t.length).padStart(9), u.replace('https://raw.githubusercontent.com/', '')); return t; });
const engine = FiltersEngine.parse(texts.join('\n'), CONFIG);
const res = get(RESOURCES);
engine.updateResources(res, '' + res.length);
const buf = engine.serialize();
const out = path.join(__dirname, '..', 'lib', 'adblock-engine.bin');
fs.writeFileSync(out, buf);
const meta = { built: new Date().toISOString(), lists: LISTS.length, bytes: buf.length, easylist: (/^! *Version:\s*(\d+)/m.exec(texts[0]) || [])[1] || '' };
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'adblock-engine.json'), JSON.stringify(meta, null, 2) + '\n');
console.log('engine', (buf.length / 1048576).toFixed(2), 'MB', meta);
