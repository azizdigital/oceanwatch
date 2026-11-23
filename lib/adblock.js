'use strict';
/* Ad blocker for the websites shown inside the app (the persist:sites session only - never the data collector).
   Engine: Ghostery adblocker (MPL-2.0) with EasyList, uBlock Origin filters and two cookie-notice lists (lib/adblock-lists.js).

   - Network: ad / pop-up requests are cancelled before they load.
   - Cosmetic: a small preload in each page hides ad boxes, the empty space they leave, and cookie banners.
   - Pop-ups: window.open() to an ad address is refused (see blocksPopup, used by main.js).
   - Settings: on/off, and sites to leave alone ("exceptions": the whole page, by host name).
   - Lists: the app ships a ready engine (lib/adblock-engine.bin, works offline). Once a day it downloads the lists again,
     builds a new engine in a worker thread and keeps it in <userData>/adblock/. */
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { ipcMain, webContents } = require('electron');
const { ElectronBlocker, Request } = require('@ghostery/adblocker-electron');
const { LISTS, RESOURCES } = require('./adblock-lists');

const DAY = 864e5;
const COLLAPSE = { image: 1, subFrame: 1, media: 1, object: 1 };
const BUNDLED = path.join(__dirname, 'adblock-engine.bin');
const BUNDLED_META = path.join(__dirname, 'adblock-engine.json');

function preloadPath() {
  let p = require.resolve('@ghostery/adblocker-electron-preload');
  /* inside the packed app the preload is unpacked next to app.asar (package.json asarUnpack), so Chromium can read it */
  const unpacked = p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  if (unpacked !== p && fs.existsSync(unpacked)) p = unpacked;
  return p;
}
function hostOf(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } }
function cleanHosts(text) {
  return String(text || '').split(/[\s,;]+/).map(h => hostOf(/^[a-z]+:\/\//i.test(h) ? h : 'https://' + h)).filter(Boolean);
}

class AdBlock {
  constructor({ dir, fetchText, log }) {
    this.dir = dir;
    this.fetchText = fetchText;          /* (url) => Promise<string>, through a session that follows the system proxy */
    this.log = log || (() => {});
    this.engine = null;
    this.enabled = true;
    this.except = [];
    this.counts = new Map();             /* webContents id -> blocked on the current page */
    this.status = { source: '', built: '', checked: 0, error: '', updating: false };
    this.sessions = new Set();
    this.toCollapse = new Map();
  }

  /* --------------------------------------------------------------- engine */
  load() {
    const cache = path.join(this.dir, 'engine.bin'), cacheMeta = path.join(this.dir, 'engine.json');
    let bundledBuilt = '';
    try { bundledBuilt = JSON.parse(fs.readFileSync(BUNDLED_META, 'utf8')).built || ''; } catch (e) { /* */ }
    const tryLoad = (file, meta, source) => {
      try {
        const m = meta ? JSON.parse(fs.readFileSync(meta, 'utf8')) : {};
        const eng = ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(file)));
        this.engine = eng;
        this.status.source = source; this.status.built = m.built || ''; this.status.checked = m.checked || 0;
        return true;
      } catch (e) { this.log('adblock: cannot load ' + source + ': ' + (e && e.message)); return false; }
    };
    /* the newer of: the copy downloaded on this PC, or the one inside this version of the app */
    let cacheBuilt = '';
    try { cacheBuilt = JSON.parse(fs.readFileSync(cacheMeta, 'utf8')).built || ''; } catch (e) { /* */ }
    if (cacheBuilt && cacheBuilt > bundledBuilt && tryLoad(cache, cacheMeta, 'updated')) return this;
    if (tryLoad(BUNDLED, BUNDLED_META, 'bundled')) {
      try { this.status.checked = JSON.parse(fs.readFileSync(cacheMeta, 'utf8')).checked || 0; } catch (e) { /* */ }
      return this;
    }
    tryLoad(cache, cacheMeta, 'updated');
    return this;
  }

  setSettings(s) {
    this.enabled = s.adblock !== false;
    this.except = cleanHosts(s.adblockExcept);
  }

  /* is this page left alone? (by the host name of the page in the tab, so its images and frames are left alone too) */
  pageExcepted(wc) {
    if (!this.except.length || !wc || wc.isDestroyed()) return false;
    let h = '';
    try { h = hostOf(wc.getURL()); } catch (e) { /* */ }
    return !!h && this.except.some(x => h === x || h.endsWith('.' + x));
  }
  activeFor(wcId) {
    if (!this.enabled || !this.engine) return false;
    if (!wcId) return true;
    const wc = webContents.fromId(wcId);
    return !this.pageExcepted(wc);
  }
  count(wcId) { if (wcId) this.counts.set(wcId, (this.counts.get(wcId) || 0) + 1); }
  blocked(wcId) { return this.counts.get(wcId) || 0; }

  /* ------------------------------------------------------- one session */
  attach(ses) {
    if (this.sessions.has(ses)) return;
    this.sessions.add(ses);
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
      if (!this.activeFor(d.webContentsId)) return cb({});
      try {
        this.engine.onBeforeRequest(d, res => {
          if (res && (res.cancel || res.redirectURL)) {
            this.count(d.webContentsId);
            if (res.cancel && COLLAPSE[d.resourceType]) this.collapse(d);
          }
          cb(res || {});
        });
      } catch (e) { cb({}); }
    });
    ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (d, cb) => {
      if (!this.activeFor(d.webContentsId)) return cb({});
      try { this.engine.onHeadersReceived(d, cb); } catch (e) { cb({}); }
    });
    ses.registerPreloadScript({ type: 'frame', filePath: preloadPath() });
    if (!this.ipcReady) {
      this.ipcReady = true;
      /* the preload asks which elements to hide; answer only for pages that are blocked */
      ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (e, url, msg) => {
        if (!this.sessions.has(e.sender.session) || !this.activeFor(e.sender.id)) return undefined;
        return this.engine.onInjectCosmeticFilters(e, url, msg);
      });
      ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', e =>
        this.sessions.has(e.sender.session) && this.activeFor(e.sender.id) && this.engine.config.enableMutationObserver === true);
    }
  }
  /* a blocked ad picture or ad frame would leave a broken box: hide the element itself (like uBlock's "collapse") */
  collapse(d) {
    const f = d.frame;
    if (!f) return;
    const key = f.processId + ':' + f.routingId;
    const q = this.toCollapse.get(key) || { frame: f, urls: [] };
    q.urls.push(d.url);
    this.toCollapse.set(key, q);
    clearTimeout(q.t);
    q.t = setTimeout(() => {
      this.toCollapse.delete(key);
      const js = '(' + function (urls) {
        var hide = function () {
          document.querySelectorAll('img,iframe,frame,embed,object,video,picture source').forEach(function (el) {
            var u = el.currentSrc || el.src || el.data || '';
            if (urls.indexOf(u) >= 0) { var t = el.tagName === 'SOURCE' ? el.parentElement : el; if (t) t.style.setProperty('display', 'none', 'important'); }
          });
        };
        hide(); setTimeout(hide, 500);
      } + ')(' + JSON.stringify(q.urls.slice(0, 200)) + ')';
      try { if (!q.frame.isDestroyed || !q.frame.isDestroyed()) q.frame.executeJavaScript(js).catch(() => {}); } catch (e) { /* frame gone */ }
    }, 150);
  }
  /* new page in a tab: start counting again */
  track(wc) {
    wc.on('did-start-navigation', (e) => { if (e.isMainFrame && !e.isSameDocument) this.counts.set(wc.id, 0); });
    wc.once('destroyed', () => this.counts.delete(wc.id));
  }

  /* window.open() from a page: refuse it when the address belongs to an ad server or ad-click tracker.
     (This engine has no "$popup" rules, so the address is checked as if the page loaded it as a frame or script.) */
  blocksPopup(url, openerWc) {
    if (!this.enabled || !this.engine || (openerWc && this.pageExcepted(openerWc))) return false;
    let source = '';
    try { source = openerWc ? openerWc.getURL() : ''; } catch (e) { /* */ }
    try {
      const hit = ['sub_frame', 'script'].some(type => this.engine.match(Request.fromRawDetails({ url, sourceUrl: source, type })).match);
      if (hit && openerWc) this.count(openerWc.id);
      return hit;
    } catch (e) { return false; }
  }

  /* ------------------------------------------------------------- update */
  due(now) { return !this.status.updating && (now || Date.now()) - (this.status.checked || 0) > DAY; }
  async update(force) {
    if (this.status.updating || (!force && !this.due())) return this.info();
    this.status.updating = true; this.status.error = '';
    try {
      const texts = [];
      for (const u of LISTS) texts.push(await this.fetchText(u));
      if (!texts[0] || texts[0].length < 100000) throw new Error('EasyList download looks wrong');
      let resources = '';
      try { resources = await this.fetchText(RESOURCES); } catch (e) { /* keep going without scriptlets */ }
      const buf = await new Promise((resolve, reject) => {
        const w = new Worker(path.join(__dirname, 'adblock-worker.js'), { workerData: { lists: texts, resources } });
        w.once('message', m => (m.ok ? resolve(m.buf) : reject(new Error(m.error))));
        w.once('error', reject);
      });
      const eng = ElectronBlocker.deserialize(new Uint8Array(buf));
      fs.mkdirSync(this.dir, { recursive: true });
      const built = new Date().toISOString(), checked = Date.now();
      fs.writeFileSync(path.join(this.dir, 'engine.bin.tmp'), Buffer.from(buf));
      fs.renameSync(path.join(this.dir, 'engine.bin.tmp'), path.join(this.dir, 'engine.bin'));
      fs.writeFileSync(path.join(this.dir, 'engine.json'), JSON.stringify({ built, checked, lists: LISTS.length }));
      this.engine = eng;
      Object.assign(this.status, { source: 'updated', built, checked, error: '' });
    } catch (e) {
      this.status.error = String(e && e.message || e);
      this.status.checked = Date.now() - DAY + 3 * 3600e3;   /* try again in 3 hours */
      this.log('adblock update failed: ' + this.status.error);
    } finally { this.status.updating = false; }
    return this.info();
  }
  info() {
    return { enabled: this.enabled, except: this.except.slice(), source: this.status.source, built: this.status.built,
      checked: this.status.checked, error: this.status.error, updating: this.status.updating, lists: LISTS.length };
  }
}

module.exports = { AdBlock, cleanHosts, hostOf };
