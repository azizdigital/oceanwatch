'use strict';
/* Dashboard Cuaca Aziz - everything kept on disk, inside the app data folder:
   config.json                          shared settings + profiles + which profile is active
   data/snapshot-<profile>.json         last collected data of each profile (shown at once, also with no internet)
   data/history/<profile>/YYYY-MM-DD.jsonl   one line per collection (kept 45 days)
   data/alerts.jsonl                    alert log of all profiles (last ~1000)
   3.0 files (data/snapshot.json, data/history/*.jsonl) are moved to the "kemaman" profile on first start. */
const fs = require('fs');
const path = require('path');
const core = require('../www/assets/js/core');

const KEEP_DAYS = 45;

function create(dataDir) {
  const dataPath = path.join(dataDir, 'data');
  const histRoot = path.join(dataPath, 'history');
  const cfgFile = path.join(dataDir, 'config.json');
  const alertFile = path.join(dataPath, 'alerts.jsonl');
  fs.mkdirSync(histRoot, { recursive: true });

  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) || {}; } catch (e) { cfg = {}; }

  function writeAtomic(p, text) {
    const tmp = p + '.part';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, p);
  }
  function persist() { try { writeAtomic(cfgFile, JSON.stringify(cfg, null, 2)); } catch (e) { /* ignore */ } }

  /* ---- profiles (first start, or coming from 3.0: Kemaman keeps the old location settings) */
  if (!Array.isArray(cfg.profiles) || !cfg.profiles.length) {
    const old = cfg.settings || {};
    cfg.profiles = core.DEFAULT_PROFILES.map(p => {
      if (p.id !== 'kemaman') return core.cleanProfile(p);
      const from = {};
      core.PROFILE_KEYS.forEach(k => { if (old[k] !== undefined) from[k] = old[k]; });
      return core.cleanProfile(Object.assign({}, p, from, { kind: 'land' }));
    });
    cfg.activeProfile = 'kemaman';
    persist();
  }
  cfg.profiles = cfg.profiles.map(p => core.cleanProfile(p));
  if (!cfg.profiles.some(p => p.id === cfg.activeProfile)) cfg.activeProfile = cfg.profiles[0].id;
  /* move 3.0 data into the kemaman profile */
  try {
    const oldSnap = path.join(dataPath, 'snapshot.json'), newSnap = path.join(dataPath, 'snapshot-kemaman.json');
    if (fs.existsSync(oldSnap) && !fs.existsSync(newSnap)) fs.renameSync(oldSnap, newSnap);
    const kdir = path.join(histRoot, 'kemaman');
    fs.readdirSync(histRoot).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).forEach(f => {
      fs.mkdirSync(kdir, { recursive: true });
      fs.renameSync(path.join(histRoot, f), path.join(kdir, f));
    });
  } catch (e) { /* nothing to move */ }

  function profiles() { return cfg.profiles.slice(); }
  function activeId() { return cfg.activeProfile; }
  function active() { return cfg.profiles.find(p => p.id === cfg.activeProfile) || cfg.profiles[0]; }
  function setActive(id) {
    if (!cfg.profiles.some(p => p.id === id)) throw new Error(core.L('Profil tiada: {id}', { id }));
    cfg.activeProfile = id; persist();
    return active();
  }
  function saveProfile(p) {
    const i = cfg.profiles.findIndex(x => x.id === p.id);
    const clean = core.cleanProfile(p, i >= 0 ? cfg.profiles[i] : null);
    if (i >= 0) cfg.profiles[i] = clean;
    else {
      if (cfg.profiles.length >= 20) throw new Error(core.L('Maksimum 20 profil'));
      let id = clean.id, n = 2;
      while (cfg.profiles.some(x => x.id === id)) id = clean.id + '-' + (n++);
      clean.id = id;
      cfg.profiles.push(clean);
    }
    persist();
    return clean;
  }
  function deleteProfile(id) {
    if (cfg.profiles.length <= 1) throw new Error(core.L('Sekurang-kurangnya satu profil diperlukan'));
    cfg.profiles = cfg.profiles.filter(p => p.id !== id);
    if (cfg.activeProfile === id) cfg.activeProfile = cfg.profiles[0].id;
    persist();
    try { fs.unlinkSync(path.join(dataPath, 'snapshot-' + id + '.json')); } catch (e) { /* */ }
    return cfg.activeProfile;
  }

  /* ---- settings: shared part in cfg.settings, location/threshold part in the active profile */
  function settings() { return core.profileSettings(cfg.settings, active()); }
  function setSettings(patch) {
    patch = patch || {};
    const shared = Object.assign({}, cfg.settings || {}), prof = Object.assign({}, active());
    Object.keys(patch).forEach(k => {
      if (k === 'locationName' || k === 'profileName') { if (String(patch[k]).trim()) prof.name = patch[k]; }
      else if (core.PROFILE_KEYS.includes(k)) prof[k] = patch[k];
      else if (k in core.DEFAULTS) shared[k] = patch[k];
    });
    const s = core.cleanSettings(shared);
    cfg.settings = {};
    Object.keys(s).forEach(k => { if (!core.PROFILE_KEYS.includes(k) && k !== 'locationName') cfg.settings[k] = s[k]; });
    const i = cfg.profiles.findIndex(p => p.id === prof.id);
    cfg.profiles[i] = core.cleanProfile(prof, cfg.profiles[i]);
    persist();
    return settings();
  }
  function get(k) { return cfg[k]; }
  function set(k, v) { cfg[k] = v; persist(); }

  function readJson(name, fallback) {
    try { return JSON.parse(fs.readFileSync(path.join(dataPath, name), 'utf8')); } catch (e) { return fallback === undefined ? null : fallback; }
  }
  function writeJson(name, obj) { writeAtomic(path.join(dataPath, name), JSON.stringify(obj)); }
  function snapName(id) { return 'snapshot-' + (id || activeId()) + '.json'; }

  function histDir(id) { const d = path.join(histRoot, id || activeId()); fs.mkdirSync(d, { recursive: true }); return d; }
  function appendHistory(entry, id) {
    fs.appendFileSync(path.join(histDir(id), core.dateKey(entry.t) + '.jsonl'), JSON.stringify(entry) + '\n');
  }
  function history(hours, now, id) {
    now = now || Date.now();
    const from = now - hours * 3600000, out = [], dir = histDir(id);
    const days = Math.ceil(hours / 24) + 1;
    for (let i = days; i >= 0; i--) {
      let txt = '';
      try { txt = fs.readFileSync(path.join(dir, core.dateKey(now - i * 86400000) + '.jsonl'), 'utf8'); } catch (e) { continue; }
      txt.split('\n').forEach(l => {
        if (!l) return;
        try { const e = JSON.parse(l); if (e.t >= from && e.t <= now) out.push(e); } catch (err) { /* half-written line */ }
      });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }
  function pruneHistory(now) {
    const cut = core.dateKey((now || Date.now()) - KEEP_DAYS * 86400000);
    try {
      fs.readdirSync(histRoot, { withFileTypes: true }).filter(d => d.isDirectory()).forEach(d => {
        const dir = path.join(histRoot, d.name);
        fs.readdirSync(dir).forEach(f => { if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < cut) fs.unlinkSync(path.join(dir, f)); });
      });
    } catch (e) { /* */ }
  }

  function appendAlertLog(a) {
    fs.appendFileSync(alertFile, JSON.stringify(a) + '\n');
    try {
      const lines = fs.readFileSync(alertFile, 'utf8').split('\n').filter(Boolean);
      if (lines.length > 2000) writeAtomic(alertFile, lines.slice(-1000).join('\n') + '\n');
    } catch (e) { /* */ }
  }
  function alertLog(limit) {
    try {
      return fs.readFileSync(alertFile, 'utf8').split('\n').filter(Boolean).slice(-(limit || 200)).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).reverse();
    } catch (e) { return []; }
  }

  return {
    dataDir, dataPath, settings, setSettings, get, set, readJson, writeJson, snapName,
    profiles, active, activeId, setActive, saveProfile, deleteProfile,
    appendHistory, history, pruneHistory, appendAlertLog, alertLog
  };
}

module.exports = { create };
