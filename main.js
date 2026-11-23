'use strict';
/* Monsoon EYE / Sentinel OceanWATCH - Windows desktop shell (Electron), made from the PC app of Dashboard Cuaca Aziz 4.6.0.
   Which app this is: edition.json (written by tools/export.js); each has its own name, icon, data folder and port
   (Monsoon EYE 30050, OceanWATCH 30060, Dashboard Cuaca 30040), so the three can run at the same time.
   No phone sharing (QR / HTTPS) in these two apps: iPad and phone use the web app on github.io.
   - Serves the app from http://127.0.0.1:<port> (see lib/server.js).
   - The app window itself can only reach that local server. External sites open in <webview> tags that run in
     their own sandboxed session ("persist:sites"); data is collected by the main process in "persist:collector".
   - Certificate errors are accepted ONLY for the listed government sites (core.CERT_ALLOW), not for every site.
   - Closing the window quits the app. Optional (Settings: "Kekal di tray", off by default): keep running in the tray
     so alerts still ring. */
const { app, BrowserWindow, Menu, Tray, Notification, dialog, shell, session, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
/* the app this copy is, before the shared code is loaded (core.js reads global.EDITION: sites, profiles, language...) */
const ED = (function () {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'edition.json'), 'utf8')); } catch (e) { /* development folder with both apps */ }
  const all = require('./tools/editions');
  return all[process.env.MC_EDITION] || all[Object.keys(all)[0]];
})();
global.EDITION = ED;
const core = require('./www/assets/js/core');
const I18N = require('./www/assets/js/i18n');   /* same instance core.js uses: one language for the whole main process */
const L = I18N.L;
const { create: createServer } = require('./lib/server');
const storeLib = require('./lib/store');
const collectorLib = require('./lib/collector');
const apiLib = require('./lib/api');
const OMB = require('./lib/ombudget');
const { AdBlock } = require('./lib/adblock');

const NAME = ED.name;
const ports = { app: +process.env.MC_APP || ED.pc.port, setup: 0, https: 0 };   /* no phone sharing */
const ICON = path.join(__dirname, 'www', 'assets', 'icons', 'icon-256.png');
const TRAY_ICON = path.join(__dirname, 'www', 'assets', 'icons', 'icon-32.png');
/* Windows ID of the app (groups its taskbar buttons and notifications). "npm start" uses its own ID: the first runs under
   npm start, before the icon fix, left Windows' icon cache holding electron.exe's blue atom for the main ID, and Windows
   never re-reads it. A fresh ID has no cached icon, so Windows has to take ours. The built .exe keeps the main ID. */
const APP_ID = app.isPackaged ? ED.pc.appId : ED.pc.appId + '.npmstart.' + app.getVersion().replace(/[^0-9a-z]/gi, '');
/* "npm start" on Windows: a Start-menu shortcut that carries the app's ID and icon. Windows takes a taskbar button's icon
   from the shortcut with the same ID when there is one - the dependable way, unlike its icon cache, which twice kept
   electron.exe's blue atom. The ID changes with each version, so an old cached icon never carries over. */
function devShortcut() {
  if (process.platform !== 'win32' || app.isPackaged) return;
  try {
    const dir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const lnk = path.join(dir, NAME + ' (npm start).lnk');
    const ok = shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'replace' : 'create', {
      target: process.execPath, args: '"' + app.getAppPath() + '"', cwd: app.getAppPath(),
      icon: path.join(__dirname, 'build', 'icon.ico'), iconIndex: 0, appUserModelId: APP_ID, description: NAME
    });
    if (!ok) console.error('start-menu shortcut not written');
  } catch (e) { console.error('start-menu shortcut: ' + (e && e.message)); }
}
/* Windows taskbar icon.
   The app registers its own ID with Windows (APP_ID). With no Start-menu shortcut for that ID, the taskbar may take the
   icon of the program that runs it - electron.exe under "npm start" - and then keeps it in its icon cache, so the blue
   Electron atom shows even for the built .exe. So on Windows each window:
     - uses the .ico (simple symbol at 16-48 px, full logo from 128 px) instead of the large PNG, and
     - tells the taskbar directly which file holds its icon (setAppDetails): the .exe itself when built, build\icon.ico
       under "npm start". The same goes for "Pin to taskbar". */
const WIN_ICO_FILE = app.isPackaged ? (process.env.PORTABLE_EXECUTABLE_FILE || process.execPath) : path.join(__dirname, 'build', 'icon.ico');
let appIconImg = null;
function appIcon() {
  if (appIconImg) return appIconImg;
  if (process.platform === 'win32') {
    const ico = nativeImage.createFromPath(path.join(__dirname, 'www', 'assets', 'icons', 'icon.ico'));
    if (!ico.isEmpty()) return (appIconImg = ico);
  }
  return (appIconImg = nativeImage.createFromPath(ICON));
}
function taskbarIcon(w) {
  if (process.platform !== 'win32' || !w || w.isDestroyed()) return;
  try {
    /* Windows only uses appIconPath when a relaunch command is set too - also under "npm start", where the command is
       electron.exe + this folder (without it the taskbar fell back to electron.exe's own blue atom icon) */
    const d = { appId: APP_ID, appIconPath: WIN_ICO_FILE, appIconIndex: 0, relaunchDisplayName: NAME,
      relaunchCommand: app.isPackaged ? '"' + (process.env.PORTABLE_EXECUTABLE_FILE || process.execPath) + '"'
        : '"' + process.execPath + '" "' + app.getAppPath() + '"' };
    w.setAppDetails(d);
    w.setIcon(appIcon());
  } catch (e) { /* older Windows: the window icon still applies */ }
}
const BG = ED.themeColor || '#070e1c';
const SITES_PART = 'persist:sites', COLLECT_PART = 'persist:collector';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + process.versions.chrome + ' Safari/537.36';

let menuLang = '';
let win = null, setupWin = null, tray = null, srv = null, store = null, collector = null, api = null, origin = '', adblock = null;
let quitting = false, trayHinted = false;

app.setName(NAME);
try { app.setPath('userData', process.env.MC_USERDATA || path.join(app.getPath('appData'), NAME)); } catch (e) { /* default */ }
app.setAppUserModelId(APP_ID);
app.on('browser-window-created', (_e, w) => taskbarIcon(w)); /* every window: main, phone QR, site pop-ups */
const firstInstance = app.requestSingleInstanceLock();
if (!firstInstance) app.quit();
app.on('second-instance', () => showWindow());
const startHiddenArg = process.argv.includes('--hidden');   /* only honoured while "keep in tray" is on (otherwise nothing would show) */
let startHidden = false;

/* ---------------------------------------------------------------- windows */
function showWindow(view) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
  if (view) win.webContents.send('mc:nav', view);
}
function goHome() { showWindow('dashboard'); }

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: L('Fail'), submenu: [
      { label: 'Dashboard', accelerator: 'CmdOrCtrl+H', click: goHome },
      { label: L('Kemas kini data sekarang'), accelerator: 'F9', click: () => collector && collector.run('manual') },
      { type: 'separator' },
      { label: L('Buka folder data'), click: () => shell.openPath(store.dataPath) },
      { label: L('Buka dalam pelayar di PC ini'), click: () => shell.openExternal(origin + '/') },
      { type: 'separator' },
      { label: L('Keluar'), accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } }] },
    { label: L('Paparan'), submenu: [
      { label: L('Muat semula aplikasi'), accelerator: 'CmdOrCtrl+Shift+R', click: () => win && win.webContents.reload() },
      { type: 'separator' },
      { role: 'zoomIn', label: L('Besarkan') }, { role: 'zoomOut', label: L('Kecilkan') }, { role: 'resetZoom', label: L('Saiz asal') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: L('Skrin penuh') },
      { label: L('Alat pembangun'), accelerator: 'CmdOrCtrl+Shift+I', click: () => win && win.webContents.toggleDevTools() }] },
    { label: L('Bantuan'), submenu: [
      { label: L('Tentang {n}', { n: NAME }), click: () => dialog.showMessageBox(win, { type: 'info', title: NAME, icon: nativeImage.createFromPath(ICON),
        message: NAME + ' ' + app.getVersion(),
        detail: ED.tagline + '\n\nApp 127.0.0.1:' + ports.app + '\nData: ' + store.dataPath + '\n\nData: MET Malaysia & data.gov.my, Open-Meteo (CC BY 4.0)' + (ED.kind === 'land' ? ', JPS Public Infobanjir, infobanjir Terengganu' : '') + '.\n\n© 2026 Aziz Mohamad' }) }] }
  ]));
}

function buildTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.setToolTip(NAME);
  tray.on('click', () => showWindow());
  updateTray();
}
function updateTray() {
  if (!tray) return;
  const snap = collector ? collector.snapshot() : {};
  const active = ((snap.alerts || {}).active || []).filter(a => !(snap.alerts.acked || {})[a.key]);
  tray.setToolTip(NAME + (active.length ? L(' - {n} alert', { n: active.length }) : '') + (snap.at ? '\n' + L('Kemas kini {t}', { t: core.fmtTime(snap.at) }) : ''));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: L('Buka {n}', { n: NAME }), click: () => showWindow() },
    { label: active.length ? L('{n} alert aktif', { n: active.length }) : L('Tiada alert aktif'), click: () => showWindow('alerts') },
    { type: 'separator' },
    { label: L('Kemas kini data sekarang'), click: () => collector && collector.run('manual') },
    { type: 'separator' },
    { label: L('Keluar'), click: () => { quitting = true; app.quit(); } }
  ]));
}

/* the app window: only the local server, sandboxed, and <webview> tags forced into the sites session */
function lockDown(wc) {
  if (wc.__mcLocked) return; wc.__mcLocked = true;
  wc.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.origin === origin && /(^|\/)setup\/?$/.test(u.pathname)) { openSetup(); return { action: 'deny' }; }
    } catch (e) { /* */ }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => { if (!url.startsWith(origin + '/')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  wc.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false; prefs.contextIsolation = true; prefs.sandbox = true; prefs.webSecurity = true;
    prefs.nodeIntegrationInSubFrames = false;
    params.partition = SITES_PART;
    if (!/^(https?:|about:blank)/i.test(params.src || 'about:blank')) e.preventDefault();
  });
}

/* each site inside a <webview>: popups become small app windows in the same session, shortcuts still work */
function setupSiteContents(wc) {
  if (adblock) adblock.track(wc);
  wc.setWindowOpenHandler(({ url }) => {
    if (!/^https?:/i.test(url)) return { action: 'deny' };
    if (adblock && adblock.blocksPopup(url, wc)) return { action: 'deny' };   /* ad pop-up */
    return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 800, icon: appIcon(), autoHideMenuBar: true,
      backgroundColor: '#ffffff', webPreferences: { partition: SITES_PART, sandbox: true, contextIsolation: true, nodeIntegration: false } } };
  });
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !win) return;
    const ctrl = input.control || input.meta, k = String(input.key || '').toLowerCase();
    let action = null;
    if ((ctrl && k === 'r') || k === 'f5') action = 'reload';
    else if (ctrl && k === 'k') action = 'palette';
    else if (ctrl && k === 'h') action = 'home';
    else if (input.alt && k === 'arrowleft') action = 'back';
    else if (input.alt && k === 'arrowright') action = 'forward';
    else if (k === 'f9') action = 'refresh-data';
    if (action) { e.preventDefault(); win.webContents.send('mc:shortcut', action); }
  });
}

async function openSetup() {
  return;   /* no phone sharing in Monsoon EYE / OceanWATCH */
  /* eslint-disable no-unreachable */
  if (setupWin && !setupWin.isDestroyed()) { setupWin.focus(); return; }
  try { await srv.setShare(true); } catch (e) {
    return dialog.showErrorBox(NAME, e.code === 'EADDRINUSE' ? L('Port {p} sedang digunakan oleh program lain. Perkongsian telefon tidak dapat dimulakan.', { p: e.port }) : String(e.message));
  }
  setupWin = new BrowserWindow({ width: 480, height: 860, minWidth: 360, title: NAME + ' - ' + L('Telefon'), parent: win || undefined, backgroundColor: BG,
    icon: appIcon(), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js') } });
  setupWin.setMenu(null);
  lockDown(setupWin.webContents);
  setupWin.loadURL(origin + '/setup');
  setupWin.on('closed', () => { setupWin = null; srv.setShare(false); });
}

/* splash, same as OIM Wazira: small frameless window for 5 seconds while the main window loads behind it */
const SPLASH_MS = 5000;
let splashWin = null;
function showSplash() {
  splashWin = new BrowserWindow({ width: 440, height: 520, frame: false, resizable: false, movable: true, show: false, center: true,
    skipTaskbar: true, alwaysOnTop: true, backgroundColor: BG, icon: appIcon(),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  splashWin.setMenu(null);
  lockDown(splashWin.webContents);
  splashWin.once('ready-to-show', () => splashWin && splashWin.show());
  splashWin.loadURL(origin + '/splash.html');
  splashWin.on('closed', () => { splashWin = null; });
}

function createWindow() {
  win = new BrowserWindow({ width: 1500, height: 920, minWidth: 900, minHeight: 600, title: NAME, backgroundColor: BG, icon: appIcon(), show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, webviewTag: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.js') } });
  lockDown(win.webContents);
  const t0 = Date.now();
  win.once('ready-to-show', () => {
    if (startHidden) return;
    setTimeout(() => {
      if (!win) return;
      win.maximize(); win.show(); win.focus();
      if (splashWin && !splashWin.isDestroyed()) splashWin.close();
    }, Math.max(0, (splashWin ? SPLASH_MS : 0) - (Date.now() - t0)));
  });
  win.on('close', e => {
    if (quitting) return;
    if (!store.settings().keepInTray) {
      /* close = quit, even though the hidden infobanjir reader window may still be open */
      quitting = true;
      setImmediate(() => app.quit());
      return;
    }
    e.preventDefault();
    win.hide();
    if (!trayHinted && tray && process.platform === 'win32') {
      trayHinted = true;
      try { tray.displayBalloon({ title: NAME, content: L('Masih memantau di tray. Klik kanan ikon untuk Keluar.'), iconType: 'info' }); } catch (e2) { /* */ }
    }
  });
  win.on('closed', () => { win = null; });
  win.loadURL(origin + '/');
}

/* ----------------------------------------------------------- network glue */
function trustGovCerts(ses) {
  ses.setCertificateVerifyProc((req, cb) => cb(core.certAllowed(req.hostname) ? 0 : -3)); /* -3 = Chromium's own verdict */
}
function prepareSessions() {
  const def = session.defaultSession;
  def.webRequest.onBeforeRequest((d, cb) => {
    const u = d.url;
    if (/^(devtools|data|blob|about|chrome-extension):/.test(u)) return cb({});
    let o = ''; try { o = new URL(u).origin; } catch (e) { /* */ }
    /* the app's own pages only talk to the app's server; map pictures (OpenStreetMap tiles) for the Kemaman map are the one exception */
    cb({ cancel: o !== origin && !(o === 'https://tile.openstreetmap.org' && d.resourceType === 'image') });
  });
  const ALLOWED = ['clipboard-sanitized-write', 'notifications', 'fullscreen'];
  def.setPermissionRequestHandler((wc, perm, cb) => cb(ALLOWED.includes(perm)));
  def.setPermissionCheckHandler((wc, perm) => ALLOWED.includes(perm));
  def.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {});

  const sites = session.fromPartition(SITES_PART);
  sites.setUserAgent(CHROME_UA);
  trustGovCerts(sites);
  const SITE_OK = ['fullscreen', 'clipboard-sanitized-write', 'pointerLock'];
  sites.setPermissionRequestHandler((wc, perm, cb) => cb(SITE_OK.includes(perm)));
  sites.setPermissionCheckHandler((wc, perm) => SITE_OK.includes(perm));
  if (adblock) adblock.attach(sites);

  const col = session.fromPartition(COLLECT_PART);
  col.setUserAgent(CHROME_UA);
  trustGovCerts(col);
  col.setPermissionRequestHandler((wc, perm, cb) => cb(false));
}

function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(L('Tamat masa ({s} s)', { s: Math.round(ms / 1000) }))), ms);
  return { signal: ac.signal, done: () => clearTimeout(t) };
}
/* JPS tables are HTML pages (Monsoon EYE › Tambah daerah reads them): the text, wrapped as { text } */
async function fetchText(url, ms) {
  const t = withTimeout(ms || 45000);
  try {
    const r = await session.fromPartition(COLLECT_PART).fetch(url, { signal: t.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return { text: await r.text() };
  } finally { t.done(); }
}
async function fetchJson(url, ms) {
  const t = withTimeout(ms || 25000);
  try {
    const r = await session.fromPartition(COLLECT_PART).fetch(url, { signal: t.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { t.done(); }
}
async function probe(url) {
  const t = withTimeout(20000);
  try {
    const r = await session.fromPartition(COLLECT_PART).fetch(url, { signal: t.signal, redirect: 'follow' });
    const headers = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    try { await r.body.cancel(); } catch (e) { /* */ }
    return { status: r.status, headers };
  } finally { t.done(); }
}

/* read every <table> of a page after its scripts have run (infobanjir builds its tables with JavaScript) */
const EXTRACT_TABLES = `(() => {
  const out = [];
  document.querySelectorAll('table').forEach(t => {
    const grid = [];
    Array.from(t.rows).forEach((tr, ri) => {
      grid[ri] = grid[ri] || [];
      let ci = 0;
      Array.from(tr.cells).forEach(td => {
        while (grid[ri][ci] !== undefined) ci++;
        const txt = (td.innerText || td.textContent || '').replace(/\\s+/g, ' ').trim();
        const cs = Math.min(+td.colSpan || 1, 20), rs = Math.min(+td.rowSpan || 1, 50);
        for (let r = 0; r < rs; r++) { grid[ri + r] = grid[ri + r] || []; for (let c = 0; c < cs; c++) grid[ri + r][ci + c] = txt; }
        ci += cs;
      });
    });
    const rows = grid.map(r => Array.from(r, x => x === undefined ? '' : x)).filter(r => r.some(Boolean));
    if (rows.length > 1) out.push({ rows: rows.slice(0, 400) });
  });
  return out;
})()`;
function scrape(url) {
  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, width: 1280, height: 900,
      webPreferences: { partition: COLLECT_PART, sandbox: true, contextIsolation: true, nodeIntegration: false, images: false, spellcheck: false, backgroundThrottling: false } });
    w.webContents.setAudioMuted(true);
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    let finished = false;
    const end = (err, val) => {
      if (finished) return; finished = true;
      clearTimeout(timer);
      try { w.destroy(); } catch (e) { /* */ }
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => end(new Error(L('Tamat masa membaca laman'))), 60000);
    w.webContents.on('did-fail-load', (e, code, desc, u, main) => { if (main && code !== -3) end(new Error(desc + ' (' + code + ')')); });
    w.loadURL(url).then(async () => {
      /* wait until the table rows stop changing (max ~20 s) */
      let last = -1, same = 0;
      for (let i = 0; i < 20 && !finished; i++) {
        await new Promise(r => setTimeout(r, 1000));
        let n = 0;
        try { n = await w.webContents.executeJavaScript('document.querySelectorAll("table tr").length'); } catch (e) { /* */ }
        if (n > 1 && n === last) { if (++same >= 2) break; } else same = 0;
        last = n;
      }
      if (finished) return;
      const tables = await w.webContents.executeJavaScript(EXTRACT_TABLES);
      if (!tables.length) throw new Error(L('Tiada jadual dijumpai di laman'));
      end(null, tables);
    }).catch(err => end(err));
  });
}

/* --------------------------------------------------------------- alerts */
function notify(list) {
  const s = store.settings();
  updateTray();
  if (!s.notify || !Notification.isSupported()) return;
  const top = list[0];
  const n = new Notification({
    title: (top.level === 'critical' ? '⚠ ' : '') + top.title,
    body: top.body + (list.length > 1 ? '\n' + L('+{n} alert lain', { n: list.length - 1 }) : ''),
    icon: nativeImage.createFromPath(ICON), silent: true, urgency: top.level === 'critical' ? 'critical' : 'normal'
  });
  n.on('click', () => showWindow('alerts'));
  n.show();
  if (win && top.level === 'critical' && !win.isFocused()) win.flashFrame(true);
}

function applySettings(s) {
  /* tray icon only while "keep in tray" is on */
  if (s.keepInTray && !tray && origin) buildTray();
  else if (!s.keepInTray && tray) { try { tray.destroy(); } catch (e) { /* */ } tray = null; }
  if (adblock) adblock.setSettings(s);
  if (s.lang && s.lang !== menuLang) {
    I18N.setLang(s.lang);
    if (menuLang) { buildMenu(); updateTray(); }
    menuLang = s.lang;
  }
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try { app.setLoginItemSettings({ openAtLogin: !!s.startWithWindows, args: s.keepInTray ? ['--hidden'] : [] }); } catch (e) { /* */ }
  }
}

/* ------------------------------------------------------------------ IPC */
function trusted(e) { try { const f = e.senderFrame; return !!f && new URL(f.url).origin === origin; } catch (err) { return false; } }
function ipc() {
  const on = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (!trusted(e)) { e.returnValue = null; return; } fn(e, ...a); });
  const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!trusted(e)) throw new Error('not allowed'); return fn(e, ...a); });
  on('mc:info', e => { e.returnValue = { version: app.getVersion(), ports: srv.ports, dataDir: store.dataPath, platform: process.platform }; });
  on('mc:lan', e => { try { e.returnValue = srv.lanIPs(); } catch (err) { e.returnValue = []; } });
  handle('mc:openExternal', (e, url) => { if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url)); return true; });
  /* Settings › Import from Dashboard Cuaca: the PC app of Dashboard Cuaca keeps its settings in %APPDATA%\Dashboard Cuaca Aziz\config.json */
  handle('mc:importOriginal', () => {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('appData'), 'Dashboard Cuaca Aziz', 'config.json'), 'utf8'));
      return { ok: true, settings: cfg.settings || null, profiles: Array.isArray(cfg.profiles) ? cfg.profiles : [], active: cfg.activeProfile || '' };
    } catch (e) { return { ok: false, error: e.code === 'ENOENT' ? 'none' : String(e.message) }; }
  });
  handle('mc:openDataDir', () => { shell.openPath(store.dataPath); return true; });
  /* Settings › Site relay › Test: done here, because the app page itself may only talk to this PC (prepareSessions).
     Checks the relay, then each blue-dot site through it (targets come from the page; only the app's own sites). */
  handle('mc:relayTest', async (e, relayUrl, key, targets) => {
    const s = core.cleanSettings(Object.assign({}, store.settings(), { relayUrl, relayKey: key }));
    if (!core.relayReady(s)) return { code: 'missing', sites: [] };
    const get = async url => {
      const t = withTimeout(25000);
      try {
        const r = await session.fromPartition(COLLECT_PART).fetch(url, { signal: t.signal, cache: 'no-store', redirect: 'manual' });
        return r;
      } finally { t.done(); }
    };
    let r;
    try { r = await get(s.relayUrl + '/'); } catch (err) { return { code: 'unreachable', sites: [] }; }
    const text = await r.text().catch(() => '');
    if (!/Relay is running/.test(text)) return { code: 'notrelay', sites: [] };
    const hosts = core.relayHosts();
    const list = (Array.isArray(targets) ? targets : []).filter(x => {
      try { const h = new URL(x.url).hostname.toLowerCase().replace(/^www\./, ''); return hosts.some(a => h === a || h.endsWith('.' + a)); } catch (err) { return false; }
    }).slice(0, 12);
    const sites = [];
    for (const x of list) {
      let st = 0, via = false;
      try {
        const rr = await get(core.relayUrlFor(x.url, s));
        st = rr.status; via = !!rr.headers.get('x-relay');
        try { if (rr.body) await rr.body.cancel(); } catch (err) { /* */ }
      } catch (err) { st = 0; via = true; }
      const verdict = st === 0 ? 'down' : core.relayVerdict(st, via);
      /* the key / site list is judged on the real sites; a stand-in that fails is just marked as failed */
      if (!/^alt:/.test(x.id) && (verdict === 'badkey' || verdict === 'notallowed' || verdict === 'notrelay')) return { code: verdict, sites: [] };
      sites.push({ id: x.id, status: st, verdict });
    }
    return { code: 'done', sites };
  });
  /* offshore report: the page's print layout saved as an A4 PDF, where the user chooses */
  handle('mc:savePdf', async (e, name) => {
    const wc = e.sender;
    const data = await wc.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    const file = (String(name || 'Offshore').replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 80) || 'Offshore') + '.pdf';
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(wc), { defaultPath: path.join(app.getPath('documents'), file), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    fs.writeFileSync(r.filePath, data);
    shell.openPath(r.filePath);
    return { ok: true, path: r.filePath };
  });
  handle('mc:adblockInfo', (e, wcId) => Object.assign(adblock.info(), { blocked: adblock.blocked(+wcId || 0) }));
  handle('mc:adblockUpdate', () => adblock.update(true));
  handle('mc:clearSiteData', async () => { await session.fromPartition(SITES_PART).clearStorageData(); return true; });
}

/* -------------------------------------------------------------- startup */
app.whenReady().then(async () => {
  devShortcut();   /* before the first window, so the taskbar finds the shortcut's icon */
  if (!firstInstance) return;
  store = storeLib.create(app.getPath('userData'));
  I18N.setLang(store.settings().lang);
  collector = collectorLib.create({
    store, fetchJson: OMB.wrap(fetchJson), fetchText: (u, ms) => fetchText(u, ms).then(r => r.text), scrape, probe,
    visible: () => !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()),
    onUpdate: snap => { api.broadcast('snapshot', Object.assign({}, collector.snapshot(), { settings: store.settings() })); updateTray(); },
    onAlerts: list => { api.broadcast('alert', list); notify(list); },
    log: (...a) => console.error(...a)
  });
  api = apiLib.create({
    store, collector,
    info: role => ({ name: NAME, lang: store.settings().lang, version: app.getVersion(), desktop: role === 'app', sharing: srv.isSharing(), ports: srv.ports, ips: srv.lanIPs(), ca: srv.caName() }),
    onSettings: s => applySettings(s),
    onTestAlert: a => notify([a]),
    offshoreFetch: url => /aras-air-data|searchresultrainfall\.php/.test(url) ? fetchText(url) : OMB.wrap(fetchJson)(url, 30000),
    visible: () => !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized())
  });
  srv = createServer({ www: path.join(__dirname, 'www'), dataDir: app.getPath('userData'), ports, api: api.handle, onError: e => console.error('server', e && e.message) });
  try { await srv.start(); } catch (e) {
    dialog.showErrorBox(NAME, e.code === 'EADDRINUSE' ? L('Port {p} sedang digunakan. {n} mungkin sudah dibuka, atau program lain menggunakan port ini.', { p: ports.app, n: NAME }) : String(e.message));
    return app.quit();
  }
  origin = 'http://127.0.0.1:' + srv.ports.app;
  adblock = new AdBlock({
    dir: path.join(app.getPath('userData'), 'adblock'),
    fetchText: async url => {
      const t = withTimeout(120000);
      try {
        const r = await session.fromPartition(COLLECT_PART).fetch(url, { signal: t.signal, cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.text();
      } finally { t.done(); }
    },
    log: (...a) => console.error(...a)
  }).load();
  adblock.setSettings(store.settings());
  prepareSessions();
  ipc();
  buildMenu();
  startHidden = startHiddenArg && !!store.settings().keepInTray;
  if (store.settings().keepInTray) buildTray();
  applySettings(store.settings());
  if (!startHidden && !process.env.MC_NOSPLASH) showSplash();
  createWindow();
  collector.start(1500);
  /* fresh ad lists once a day, quietly in the background */
  setTimeout(() => adblock.update().catch(() => {}), 90 * 1000);
  setInterval(() => { if (adblock.due()) adblock.update().catch(() => {}); }, 3600 * 1000);
  setInterval(async () => {
    if (quitting || !srv || srv.isListening()) return;
    try { await srv.start(); } catch (e) { console.error('server restart', e && e.message); }
  }, 5000);
});

app.on('web-contents-created', (e, wc) => {
  const type = wc.getType();
  if (type === 'webview') setupSiteContents(wc);
  else if (type === 'window' && wc.session === session.defaultSession) lockDown(wc);
  else if (type === 'window' && wc.session === session.fromPartition(SITES_PART)) setupSiteContents(wc);
});
app.on('window-all-closed', () => { if (quitting || !store || !store.settings().keepInTray) app.quit(); });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { if (collector) collector.stop(); if (srv) srv.stop(); if (tray) tray.destroy(); });
