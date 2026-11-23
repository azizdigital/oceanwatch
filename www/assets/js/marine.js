/* Sentinel OceanWATCH - two pages of its own (menu Cuaca / Weather and Kapal / Vessels).
   Weather: every model OceanWATCH reads (6 weather + 4 wave models, 2 ensembles, offshore.js) put together into one story:
     - each value = the middle of the models (median); in brackets the lowest and highest model (same as the demob formula)
     - periods of 6 hours (00-06, 06-12, 12-18, 18-24, Malaysia time) for 3 days, then one line per day to day 7
     - thunderstorm = share of the weather models that forecast a thunderstorm code (95-99) in the hour; CAPE as a hint
     - tides: the sea level model at the platform (Open-Meteo marine) and the Cukai port table (Tide Forecast, GitHub copy)
   Vessels: the user's own list (name, MMSI / IMO, type, role, job), kept on this device (mc_vessels); the free embedded maps of
     VesselFinder and MarineTraffic (no account, no key) show the chosen ship, or the area around the platform. */
(function () {
  'use strict';
  var MC = window.MC, C = window.MCCore, ED = self.EDITION, I18N = window.MCI18n;
  if (!MC || !C || !ED || ED.kind !== 'offshore') return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = MC.esc, state = MC.state;
  var EN = function () { return I18N && I18N.lang() === 'en'; };
  var T = function (bm, en) { return EN() ? en : bm; };
  var HOUR = 3600000, DAY = 86400000, TZ = 8 * HOUR;
  var O = function () { return window.MCOffshore; };

  MC.TITLES.weather = ['🌊', T('Cuaca offshore', 'Offshore weather'), T('Semua model digabung: angin, ombak, alun, pasang surut, ribut', 'All models together: wind, waves, swell, tides, storms')];
  MC.TITLES.vessels = ['🚢', T('Kapal', 'Vessels'), T('Kapal yang anda pantau · VesselFinder & MarineTraffic', 'Your vessels · VesselFinder & MarineTraffic')];

  /* ------------------------------------------------------------------ helpers */
  function num(v) { return v === null || v === undefined || !isFinite(v) ? null : +v; }
  function r0(v) { v = num(v); return v === null ? '-' : String(Math.round(v)); }
  function r1(v) { v = num(v); return v === null ? '-' : (Math.round(v * 10) / 10).toFixed(1); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function local(t) { return new Date(t + TZ); }
  function hh(t) { var d = local(t); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function dkey(t) { return local(t).toISOString().slice(0, 10); }
  var DAYS_BM = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'], DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dayName(t, now) {
    var k = dkey(t), today = dkey(now), tom = dkey(now + DAY);
    if (k === today) return T('Hari ini', 'Today');
    if (k === tom) return T('Esok', 'Tomorrow');
    var d = local(t);
    return (EN() ? DAYS_EN : DAYS_BM)[d.getUTCDay()] + ' ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1);
  }
  var C16 = ['U', 'UTL', 'TL', 'TTL', 'T', 'TMg', 'Mg', 'SMg', 'S', 'SBD', 'BD', 'BBD', 'B', 'BBL', 'BL', 'UBL'];
  var C16E = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function dir16(d) { d = num(d); return d === null ? '-' : (EN() ? C16E : C16)[Math.round(((d % 360) + 360) % 360 / 22.5) % 16]; }
  var WORD_BM = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'], WORD_EN = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function dirWord(d) { d = num(d); return d === null ? '' : (EN() ? WORD_EN : WORD_BM)[Math.round(((d % 360) + 360) % 360 / 45) % 8]; }
  function maxBy(list, f) { var b = null; list.forEach(function (x) { var v = num(f(x)); if (v !== null && (b === null || v > b.v)) b = { v: v, x: x }; }); return b; }
  function minOf(list, f) { var b = null; list.forEach(function (x) { var v = num(f(x)); if (v !== null && (b === null || v < b)) b = v; }); return b; }
  function sum(list, f) { var s = null; list.forEach(function (x) { var v = num(f(x)); if (v !== null) s = (s || 0) + v; }); return s; }
  function settings() { return state.settings || {}; }

  /* ------------------------------------------------------------------ the story: 6-hour periods */
  var PART_BM = ['Awal pagi', 'Pagi', 'Petang', 'Malam'], PART_EN = ['Early morning', 'Morning', 'Afternoon', 'Night'];
  function periods(rep, now, nDays) {
    var out = [], start = Math.floor((now + TZ) / (6 * HOUR)) * 6 * HOUR - TZ, end = start + nDays * DAY;
    for (var t0 = start; t0 < end; t0 += 6 * HOUR) {
      var H = rep.hours.filter(function (h) { return h.t >= Math.max(t0, now - HOUR) && h.t < t0 + 6 * HOUR; });
      if (!H.length) continue;
      out.push(period(H, t0, now));
    }
    return out;
  }
  /* one period from its hours: the worst hour of the middle line, with the lowest / highest model of the period in brackets */
  function period(H, t0, now) {
    var w = maxBy(H, function (h) { return h.w10.m; }), g = maxBy(H, function (h) { return h.g.m; }), hs = maxBy(H, function (h) { return h.hs.m; });
    var sw = maxBy(H, function (h) { return h.wh; }), th = maxBy(H, function (h) { return h.thunder; }), cape = maxBy(H, function (h) { return h.cape; });
    var part = Math.floor(((t0 + TZ) % DAY) / (6 * HOUR));
    var isNow = now >= t0 && now < t0 + 6 * HOUR;
    return {
      t0: t0, t1: t0 + 6 * HOUR, now: isNow, part: part,
      label: isNow ? T('Sekarang', 'Now') + ' – ' + hh(t0 + 6 * HOUR) : (dkey(t0) === dkey(now) ? (part === 3 ? T('Malam ini', 'Tonight') : EN() ? 'This ' + PART_EN[part].toLowerCase() : PART_BM[part] + ' ini') : (EN() ? PART_EN : PART_BM)[part] + ' ' + dayName(t0, now).toLowerCase()),
      wind: w ? { m: w.v, lo: minOf(H, function (h) { return h.w10.lo; }), hi: maxBy(H, function (h) { return h.w10.hi; }).v, dir: w.x.dir, t: w.x.t } : null,
      gust: g ? { m: g.v, hi: maxBy(H, function (h) { return h.g.hi; }).v } : null,
      hs: hs ? { m: hs.v, lo: minOf(H, function (h) { return h.hs.lo; }), hi: maxBy(H, function (h) { return h.hs.hi; }).v, hmax: hs.x.hmax, dir: hs.x.vdir } : null,
      swell: sw ? { h: sw.v, t: sw.x.wt, dir: sw.x.wd } : null,
      sea: hs ? { h: hs.x.sh, t: hs.x.st, dir: hs.x.sd } : null,
      rain: sum(H, function (h) { return h.p; }),
      thunder: th ? th.v : null, thunderAt: th && th.v >= 0.2 ? th.x.t : null, cape: cape ? cape.v : null,
      models: Math.max.apply(null, H.map(function (h) { return h.n || 0; })), wmodels: Math.max.apply(null, H.map(function (h) { return h.nv || 0; }))
    };
  }
  function rainWords(mm, th) {
    if (th !== null && th >= 0.5) return T('ribut petir dijangka', 'thunderstorms expected');
    if (th !== null && th >= 0.2) return T('mungkin ribut petir', 'thunderstorms possible');
    if (mm === null || mm < 0.3) return T('tiada hujan', 'dry');
    if (mm < 2) return T('hujan renyai', 'light showers');
    if (mm < 10) return T('hujan', 'rain');
    return T('hujan lebat', 'heavy rain');
  }
  function trend(a, b, step) { if (a === null || b === null) return ''; return b - a >= step ? ' ↑' : a - b >= step ? ' ↓' : ''; }
  function sentence(p, prev) {
    var s = settings(), out = [];
    if (p.wind) out.push(T('Angin ', 'Wind ') + (p.wind.dir !== null ? T('dari ', 'from the ') + dirWord(p.wind.dir) + ' ' : '') + '<b>' + r0(p.wind.m) + ' kt</b>' +
      ' <span class="mw-rg">(' + r0(p.wind.lo) + '–' + r0(p.wind.hi) + ')</span>' + trend(prev && prev.wind ? prev.wind.m : null, p.wind.m, 3) +
      (p.gust ? T(', tiupan ', ', gusts ') + r0(p.gust.m) + ' kt' : ''));
    if (p.hs) out.push(T('ombak ', 'waves ') + '<b>' + r1(p.hs.m) + ' m</b> <span class="mw-rg">(' + r1(p.hs.lo) + '–' + r1(p.hs.hi) + ')</span>' + trend(prev && prev.hs ? prev.hs.m : null, p.hs.m, 0.3) +
      T(', maks ', ', max ') + r1(p.hs.hmax) + ' m');
    if (p.swell && p.swell.h !== null) out.push(T('alun ', 'swell ') + r1(p.swell.h) + ' m ' + r0(p.swell.t) + ' s' + (p.swell.dir !== null ? T(' dari ', ' from the ') + dirWord(p.swell.dir) : ''));
    out.push(rainWords(p.rain, p.thunder) + (p.rain !== null && p.rain >= 0.3 ? ' ' + r1(p.rain) + ' mm' : '') + (p.thunderAt ? T(' (sekitar ', ' (around ') + hh(p.thunderAt) + ')' : ''));
    var over = [];
    if (p.wind && p.wind.m >= s.offWindKt) over.push(T('angin', 'wind'));
    if (p.hs && p.hs.m >= s.offWaveM) over.push(T('ombak', 'waves'));
    return { text: out.join(' · '), over: over, wide: p.wind && p.wind.hi !== null && p.wind.lo !== null && p.wind.hi - p.wind.lo >= 10 };
  }
  /* the headline: the most important thing of the next 72 hours */
  function headline(rep, ps, now) {
    var s = settings(), H = rep.hours.filter(function (h) { return h.t >= now - HOUR && h.t < now + 3 * DAY; });
    if (!H.length) return '';
    var w = maxBy(H, function (h) { return h.w10.m; }), hs = maxBy(H, function (h) { return h.hs.m; }), th = H.filter(function (h) { return h.thunder !== null && h.thunder >= 0.5; });
    var bits = [];
    if (w) bits.push(T('Angin paling kuat ', 'Strongest wind ') + '<b>' + r0(w.v) + ' kt</b> ' + T('dari ', 'from the ') + dirWord(w.x.dir) + ' — ' + dayName(w.x.t, now).toLowerCase() + ' ' + hh(w.x.t));
    if (hs) bits.push(T('ombak paling tinggi ', 'highest waves ') + '<b>' + r1(hs.v) + ' m</b> (' + T('maks ', 'max ') + r1(hs.x.hmax) + ' m) — ' + dayName(hs.x.t, now).toLowerCase() + ' ' + hh(hs.x.t));
    if (th.length) bits.push(T('ribut petir dijangka ', 'thunderstorms expected ') + dayName(th[0].t, now).toLowerCase() + ' ' + hh(th[0].t) + (th.length > 1 ? '–' + hh(th[th.length - 1].t + HOUR) : ''));
    var level = (w && w.v >= s.offWindKt) || (hs && hs.v >= s.offWaveM) ? 2 : (w && w.v >= s.offWindKt * 0.8) || (hs && hs.v >= s.offWaveM * 0.8) || th.length ? 1 : 0;
    return { html: bits.join('; ') + '.', level: level };
  }

  /* ------------------------------------------------------------------ pictures (SVG) */
  function compass(title, now, later, unit) {
    var arrow = function (d, col, len, w) {
      if (num(d) === null) return '';
      var a = (d + 180) * Math.PI / 180, x = 60 + Math.sin(a) * len, y = 60 - Math.cos(a) * len, x0 = 60 - Math.sin(a) * len * 0.55, y0 = 60 + Math.cos(a) * len * 0.55;
      return '<line x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" marker-end="url(#mwArr' + (col === 'var(--brand)' ? 'A' : 'B') + ')"/>';
    };
    var ticks = '';
    for (var i = 0; i < 16; i++) { var a = i * 22.5 * Math.PI / 180, r1 = i % 4 ? 46 : 42; ticks += '<line x1="' + (60 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (60 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (60 + Math.sin(a) * 50).toFixed(1) + '" y2="' + (60 - Math.cos(a) * 50).toFixed(1) + '" stroke="var(--line)" stroke-width="1.4"/>'; }
    var L4 = EN() ? ['N', 'E', 'S', 'W'] : ['U', 'T', 'S', 'B'];
    return '<div class="mw-cmp"><svg viewBox="0 0 120 120" role="img" aria-label="' + esc(title) + '"><defs>' +
      '<marker id="mwArrA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--brand)"/></marker>' +
      '<marker id="mwArrB" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--st-warning)"/></marker></defs>' +
      '<circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" stroke-width="1.5"/>' + ticks +
      '<text x="60" y="8" text-anchor="middle" class="mw-cl">' + L4[0] + '</text><text x="114" y="64" text-anchor="middle" class="mw-cl">' + L4[1] + '</text>' +
      '<text x="60" y="119" text-anchor="middle" class="mw-cl">' + L4[2] + '</text><text x="6" y="64" text-anchor="middle" class="mw-cl">' + L4[3] + '</text>' +
      arrow(later.dir, 'var(--st-warning)', 34, 3) + arrow(now.dir, 'var(--brand)', 40, 4.5) + '</svg>' +
      '<div class="mw-cmp-t"><b>' + esc(title) + '</b>' +
      '<span><i class="mw-dot a"></i>' + T('Sekarang', 'Now') + ': ' + (now.text || '-') + '</span>' +
      '<span><i class="mw-dot b"></i>' + T('+24 jam', '+24 h') + ': ' + (later.text || '-') + '</span>' +
      '<small>' + T('Anak panah = arah tujuan; huruf = arah datang', 'Arrow = where it goes; letters = where it comes from') + '</small></div></div>';
  }
  /* a line chart for 7 days: middle line, a band from the lowest to the highest model, an optional second line, and a limit line */
  function band(opts) {
    var W = 1100, Hh = 190, L0 = 34, R0 = 8, T0 = 10, B0 = 22, pts = opts.pts.filter(function (p) { return p.m !== null; });
    if (pts.length < 2) return '<div class="empty">' + T('Tiada data', 'No data') + '</div>';
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t, ymax = Math.max(opts.min || 1, opts.limit || 0, Math.max.apply(null, pts.map(function (p) { return Math.max(p.hi !== null ? p.hi : p.m, p.m2 || 0); }))) * 1.12;
    var X = function (t) { return L0 + (t - t0) / (t1 - t0) * (W - L0 - R0); }, Y = function (v) { return T0 + (1 - v / ymax) * (Hh - T0 - B0); };
    var up = pts.filter(function (p) { return p.hi !== null; }).map(function (p) { return X(p.t).toFixed(1) + ',' + Y(p.hi).toFixed(1); });
    var dn = pts.filter(function (p) { return p.lo !== null; }).map(function (p) { return X(p.t).toFixed(1) + ',' + Y(p.lo).toFixed(1); }).reverse();
    var line = function (k, cls) { return '<polyline class="' + cls + '" fill="none" points="' + pts.filter(function (p) { return num(p[k]) !== null; }).map(function (p) { return X(p.t).toFixed(1) + ',' + Y(p[k]).toFixed(1); }).join(' ') + '"/>'; };
    var grid = '', days = '';
    for (var i = 0; i <= 3; i++) { var v = ymax / 1.12 * i / 3; grid += '<line x1="' + L0 + '" x2="' + (W - R0) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" class="mw-g"/><text x="' + (L0 - 4) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end" class="mw-ax">' + (v >= 10 ? Math.round(v) : v.toFixed(1)) + '</text>'; }
    var d0 = Math.ceil((t0 + TZ) / DAY) * DAY - TZ;
    for (var d = d0; d <= t1; d += DAY) days += '<line x1="' + X(d).toFixed(1) + '" x2="' + X(d).toFixed(1) + '" y1="' + T0 + '" y2="' + (Hh - B0) + '" class="mw-g d"/><text x="' + (X(d) + 3).toFixed(1) + '" y="' + (Hh - 7) + '" class="mw-ax">' + esc(dayName(d, Date.now())) + '</text>';
    var lim = opts.limit ? '<line x1="' + L0 + '" x2="' + (W - R0) + '" y1="' + Y(opts.limit).toFixed(1) + '" y2="' + Y(opts.limit).toFixed(1) + '" class="mw-lim"/><text x="' + (W - R0 - 2) + '" y="' + (Y(opts.limit) - 3).toFixed(1) + '" text-anchor="end" class="mw-ax lim">' + esc(opts.limitText || '') + '</text>' : '';
    var nowX = X(Math.max(t0, Math.min(t1, Date.now())));
    return '<svg class="mw-ch" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + esc(opts.title) + '">' + grid + days + lim +
      (up.length > 1 ? '<polygon class="mw-band ' + (opts.cls || '') + '" points="' + up.concat(dn).join(' ') + '"/>' : '') +
      (opts.second ? line('m2', 'mw-l2') : '') + line('m', 'mw-l ' + (opts.cls || '')) +
      '<line x1="' + nowX.toFixed(1) + '" x2="' + nowX.toFixed(1) + '" y1="' + T0 + '" y2="' + (Hh - B0) + '" class="mw-now"/></svg>';
  }
  function bars(opts) {
    var W = 1100, Hh = 130, L0 = 34, R0 = 8, T0 = 8, B0 = 20, pts = opts.pts;
    if (pts.length < 2) return '';
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t, ymax = Math.max(5, Math.max.apply(null, pts.map(function (p) { return p.v || 0; }))) * 1.1;
    var X = function (t) { return L0 + (t - t0) / (t1 - t0) * (W - L0 - R0); }, Y = function (v) { return T0 + (1 - v / ymax) * (Hh - T0 - B0); };
    var bw = Math.max(1.5, (W - L0 - R0) / pts.length - 0.8), out = '';
    pts.forEach(function (p) {
      if (p.th !== null && p.th >= 0.2) out += '<rect x="' + (X(p.t) - bw / 2).toFixed(1) + '" y="' + T0 + '" width="' + bw.toFixed(1) + '" height="' + (Hh - T0 - B0) + '" class="mw-th" opacity="' + Math.min(0.9, p.th).toFixed(2) + '"/>';
      if (p.v) out += '<rect x="' + (X(p.t) - bw / 2).toFixed(1) + '" y="' + Y(p.v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (Hh - B0 - Y(p.v)).toFixed(1) + '" class="mw-rain"/>';
    });
    var days = '', d0 = Math.ceil((t0 + TZ) / DAY) * DAY - TZ;
    for (var d = d0; d <= t1; d += DAY) days += '<line x1="' + X(d).toFixed(1) + '" x2="' + X(d).toFixed(1) + '" y1="' + T0 + '" y2="' + (Hh - B0) + '" class="mw-g d"/><text x="' + (X(d) + 3).toFixed(1) + '" y="' + (Hh - 6) + '" class="mw-ax">' + esc(dayName(d, Date.now())) + '</text>';
    return '<svg class="mw-ch" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + esc(opts.title) + '">' + days + out +
      '<text x="' + (L0 - 4) + '" y="' + (T0 + 8) + '" text-anchor="end" class="mw-ax">' + Math.round(ymax / 1.1) + '</text></svg>';
  }
  function tideChart(hours, events, now) {
    var pts = hours.filter(function (h) { return h.t >= now - 2 * HOUR && h.t <= now + 3 * DAY && num(h.sea) !== null; });
    if (pts.length < 3) return '<div class="empty">' + T('Tiada paras laut model', 'No model sea level') + '</div>';
    var W = 1100, Hh = 180, L0 = 38, R0 = 8, T0 = 14, B0 = 22, t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    var lo = Math.min.apply(null, pts.map(function (p) { return p.sea; })), hi = Math.max.apply(null, pts.map(function (p) { return p.sea; })), sp = Math.max(0.2, hi - lo);
    var X = function (t) { return L0 + (t - t0) / (t1 - t0) * (W - L0 - R0); }, Y = function (v) { return T0 + (1 - (v - lo + sp * 0.1) / (sp * 1.2)) * (Hh - T0 - B0); };
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.sea).toFixed(1); }).join(' ');
    var area = path + ' L' + X(t1).toFixed(1) + ' ' + (Hh - B0) + ' L' + X(t0).toFixed(1) + ' ' + (Hh - B0) + 'Z';
    var marks = (events || []).filter(function (e) { return e.t >= t0 && e.t <= t1; }).map(function (e) {
      var x = X(e.t), y = Y(e.sea), up = e.type === 'high';
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" class="mw-tm ' + e.type + '"/><text x="' + x.toFixed(1) + '" y="' + (up ? y - 6 : y + 13).toFixed(1) + '" text-anchor="middle" class="mw-ax">' + hh(e.t) + '</text>';
    }).join('');
    var days = '', d0 = Math.ceil((t0 + TZ) / DAY) * DAY - TZ;
    for (var d = d0; d <= t1; d += DAY) days += '<line x1="' + X(d).toFixed(1) + '" x2="' + X(d).toFixed(1) + '" y1="' + T0 + '" y2="' + (Hh - B0) + '" class="mw-g d"/><text x="' + (X(d) + 3).toFixed(1) + '" y="' + (Hh - 6) + '" class="mw-ax">' + esc(dayName(d, now)) + '</text>';
    var nowX = X(Math.max(t0, Math.min(t1, now)));
    return '<svg class="mw-ch" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="tide">' + days +
      '<path d="' + area + '" class="mw-tide-a"/><path d="' + path + '" class="mw-tide"/>' + marks +
      '<text x="' + (L0 - 4) + '" y="' + (Y(hi) + 3).toFixed(1) + '" text-anchor="end" class="mw-ax">' + hi.toFixed(1) + '</text><text x="' + (L0 - 4) + '" y="' + (Y(lo) + 3).toFixed(1) + '" text-anchor="end" class="mw-ax">' + lo.toFixed(1) + '</text>' +
      '<line x1="' + nowX.toFixed(1) + '" x2="' + nowX.toFixed(1) + '" y1="' + T0 + '" y2="' + (Hh - B0) + '" class="mw-now"/></svg>';
  }

  /* ------------------------------------------------------------------ Cukai port tide table (GitHub copy of Tide Forecast) */
  var Port = {
    data: null, at: 0, busy: false, err: '',
    url: function () { return 'https://raw.githubusercontent.com/azizdigital/monsoon-eye/data/tide-cukai.json'; },
    load: function () {
      if (this.busy || (this.data && Date.now() - this.at < 30 * 60000)) return;
      var u = this.url() + '?m=' + Math.floor(Date.now() / 600000);
      this.busy = true;
      (MC.state.mode === 'pc' ? MC.pcGet(u, 20000) : MC.fetchT(u, 20000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }))
        .then(function (j) { Port.data = C.parseTideMirror(j); Port.at = Date.now(); Port.err = ''; }, function (e) { Port.err = e.message; })
        .then(function () { Port.busy = false; if (state.view === 'weather') Weather.render(); });
    }
  };

  /* ------------------------------------------------------------------ Weather page */
  var Weather = {
    tab: MC.load('mc_mw_tab', 'story'),
    render: function () {
      var host = $('weatherHost');
      if (!host || state.view !== 'weather') return;
      var rep = MC.Off.report(), now = Date.now(), s = settings(), snap = state.snap || {};
      if (!rep) {
        if (!MC.Off.busy) MC.Off.load();
        host.innerHTML = '<div class="card"><div class="card-b"><div class="empty">' + (MC.Off.err ? esc(T('Model tidak dapat dibaca: ', 'Models could not be read: ') + MC.Off.err) : T('Membaca 6 model cuaca, 4 model ombak dan 2 ensembel…', 'Reading 6 weather models, 4 wave models and 2 ensembles…')) + '</div></div></div>';
        return;
      }
      Port.load();
      var ps = periods(rep, now, 3), head = headline(rep, ps, now), ok = rep.ok || {};
      var place = s.locationName || 'Offshore', at = rep.at ? hh(rep.at) : '-';
      /* top: where, which models, the headline */
      var h = '<div class="card mw-top lv' + (head ? head.level : 0) + '"><div class="card-b">' +
        '<div class="mw-where"><b>' + esc(place) + '</b> · ' + (+s.marineLat).toFixed(3) + ', ' + (+s.marineLon).toFixed(3) +
        ' · ' + T('dikemas kini ', 'updated ') + at + ' · ' + T('{w}/6 model cuaca, {v}/4 model ombak, {e} ensembel', '{w}/6 weather models, {v}/4 wave models, {e} ensembles').replace('{w}', (ok.wind || []).length).replace('{v}', (ok.wave || []).length).replace('{e}', (ok.ens || []).length) +
        '<button class="btn sm" id="mwRefresh">' + T('Muat semula', 'Reload') + '</button></div>' +
        (head ? '<p class="mw-head">' + head.html + '</p>' : '') +
        '<p class="mw-how">' + T('Nombor tebal = nilai tengah semua model; dalam kurungan = model paling rendah – paling tinggi. Had anda: angin {w} kt, ombak {h} m.',
          'Bold = the middle of all models; in brackets = lowest – highest model. Your limits: wind {w} kt, waves {h} m.').replace('{w}', s.offWindKt).replace('{h}', s.offWaveM) + '</p>' +
        metLine(snap) + '</div></div>';
      /* tabs inside the page */
      var tabs = [['story', T('Cerita', 'Story')], ['table', T('Jadual 3 jam', '3-hour table')], ['charts', T('Graf 7 hari', '7-day charts')], ['tide', T('Pasang surut', 'Tides')]];
      h += '<div class="seg mw-tabs" role="tablist">' + tabs.map(function (x) { return '<button type="button" data-mw-tab="' + x[0] + '" aria-selected="' + (Weather.tab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
      if (Weather.tab === 'story') h += story(rep, ps, now);
      else if (Weather.tab === 'table') h += table(rep, now);
      else if (Weather.tab === 'charts') h += charts(rep, now);
      else h += tides(snap, now);
      host.innerHTML = h;
    }
  };
  function metLine(snap) {
    var w = ((snap.met || {}).warnings || []).slice(0, 2);
    if (!w.length) return '<p class="mw-met ok">✓ ' + T('Tiada amaran laut MET untuk kawasan anda.', 'No MET sea warning for your area.') + '</p>';
    return w.map(function (x) {
      var head = EN() ? (x.heading_en || x.heading_bm) : (x.heading_bm || x.heading_en), short = C.metShort ? C.metShort(x, settings(), Date.now()) : '';
      return '<p class="mw-met' + (x.severity === 'critical' ? ' crit' : '') + '">⚠ <b>MET: ' + esc(head || '') + '</b> ' + esc(String(short || (EN() ? x.text_en || x.text_bm : x.text_bm || x.text_en) || '').slice(0, 240)) + '</p>';
    }).join('');
  }
  function story(rep, ps, now) {
    var h = '<div class="card"><div class="card-h"><h3>' + T('Ramalan 3 hari, setiap 6 jam', '3 days, every 6 hours') + '</h3><small>' + T('semua model digabung', 'all models together') + '</small></div><div class="card-b mw-story">';
    var lastDay = '';
    ps.forEach(function (p, i) {
      var d = dkey(p.t0);
      if (d !== lastDay) { h += '<div class="mw-day">' + esc(dayName(p.t0, now)) + '</div>'; lastDay = d; }
      var sn = sentence(p, ps[i - 1]);
      h += '<div class="mw-p' + (p.now ? ' now' : '') + (sn.over.length ? ' over' : '') + '"><div class="mw-pl"><b>' + esc(p.label) + '</b><small>' + hh(p.t0) + '–' + hh(p.t1) + '</small></div>' +
        '<div class="mw-pt">' + sn.text + (sn.over.length ? ' <span class="chip danger">' + T('melebihi had ', 'over limit ') + sn.over.join(' & ') + '</span>' : '') +
        (sn.wide ? ' <span class="chip alert">' + T('model tidak sependapat', 'models disagree') + '</span>' : '') + '</div></div>';
    });
    /* days 4-7: one line each from the daily summary */
    var later = (rep.days || []).filter(function (d) { return d.lead >= 3 && d.lead <= 6; });
    if (later.length) {
      h += '<div class="mw-day">' + T('Hari 4–7 (gambaran kasar)', 'Days 4–7 (rough outlook)') + '</div>';
      later.forEach(function (d) {
        var t = Date.parse(d.date + 'T12:00:00Z') - TZ;
        h += '<div class="mw-p"><div class="mw-pl"><b>' + esc(dayName(t, now)) + '</b></div><div class="mw-pt">' + T('Angin maks ', 'Max wind ') + '<b>' + r0(d.wind.m) + ' kt</b> <span class="mw-rg">(' + r0(d.wind.lo) + '–' + r0(d.wind.hi) + ')</span>' +
          T(' dari ', ' from the ') + dirWord(d.dir) + ' · ' + T('ombak maks ', 'max waves ') + '<b>' + r1(d.hs.m) + ' m</b> <span class="mw-rg">(' + r1(d.hs.lo) + '–' + r1(d.hs.hi) + ')</span> · ' +
          rainWords(d.rain, d.thunder) + (d.rain >= 0.3 ? ' ' + r1(d.rain) + ' mm' : '') + (d.ens ? ' · ' + T('ensembel: ', 'ensemble: ') + Math.round(d.ens.prob * 100) + '% ' + T('peluang angin ≥ ', 'chance of wind ≥ ') + rep.windKt + ' kt' : '') + '</div></div>';
      });
    }
    h += '</div></div>';
    /* compasses: wind and swell, now and in 24 hours */
    var n0 = rep.hours.filter(function (x) { return x.t >= now - HOUR; })[0], n24 = rep.hours.filter(function (x) { return x.t >= now + DAY - HOUR; })[0];
    if (n0) {
      var wt = function (x) { return x ? dirWord(x.dir) + ' ' + r0(x.w10.m) + ' kt (' + dir16(x.dir) + ')' : '-'; };
      var stx = function (x) { return x && x.wh !== null ? dirWord(x.wd) + ' ' + r1(x.wh) + ' m, ' + r0(x.wt) + ' s (' + dir16(x.wd) + ')' : '-'; };
      h += '<div class="card"><div class="card-h"><h3>' + T('Arah angin & alun', 'Wind & swell direction') + '</h3></div><div class="card-b mw-cmps">' +
        compass(T('Angin', 'Wind'), { dir: n0.dir, text: wt(n0) }, { dir: n24 ? n24.dir : null, text: wt(n24) }) +
        compass(T('Alun (swell)', 'Swell'), { dir: n0.wd, text: stx(n0) }, { dir: n24 ? n24.wd : null, text: stx(n24) }) + '</div></div>';
    }
    return h;
  }
  function table(rep, now) {
    var s = settings(), start = Math.floor((now + TZ) / (3 * HOUR)) * 3 * HOUR - TZ, rows = '', lastDay = '';
    for (var t0 = start; t0 < start + 3 * DAY; t0 += 3 * HOUR) {
      var H = rep.hours.filter(function (h) { return h.t >= Math.max(t0, now - HOUR) && h.t < t0 + 3 * HOUR; });
      if (!H.length) continue;
      var p = period(H, t0, now), d = dkey(t0);
      if (d !== lastDay) { rows += '<tr class="mw-dr"><td colspan="10">' + esc(dayName(t0, now)) + '</td></tr>'; lastDay = d; }
      var cw = p.wind && p.wind.m >= s.offWindKt ? ' bad' : p.wind && p.wind.m >= s.offWindKt * 0.8 ? ' warn' : '';
      var ch = p.hs && p.hs.m >= s.offWaveM ? ' bad' : p.hs && p.hs.m >= s.offWaveM * 0.8 ? ' warn' : '';
      var cth = p.thunder !== null && p.thunder >= 0.5 ? ' bad' : p.thunder !== null && p.thunder >= 0.2 ? ' warn' : '';
      rows += '<tr><td class="mw-tt">' + hh(t0) + '</td>' +
        '<td class="' + cw + '"><b>' + r0(p.wind && p.wind.m) + '</b> <span class="mw-rg">' + r0(p.wind && p.wind.lo) + '–' + r0(p.wind && p.wind.hi) + '</span></td>' +
        '<td>' + r0(p.gust && p.gust.m) + '</td><td>' + dir16(p.wind && p.wind.dir) + '</td>' +
        '<td class="' + ch + '"><b>' + r1(p.hs && p.hs.m) + '</b> <span class="mw-rg">' + r1(p.hs && p.hs.lo) + '–' + r1(p.hs && p.hs.hi) + '</span></td>' +
        '<td>' + r1(p.hs && p.hs.hmax) + '</td>' +
        '<td>' + (p.swell && p.swell.h !== null ? r1(p.swell.h) + ' m · ' + r0(p.swell.t) + ' s · ' + dir16(p.swell.dir) : '-') + '</td>' +
        '<td>' + (p.sea && p.sea.h !== null ? r1(p.sea.h) + ' m · ' + r0(p.sea.t) + ' s' : '-') + '</td>' +
        '<td>' + (p.rain !== null ? r1(p.rain) : '-') + '</td><td class="' + cth + '">' + (p.thunder !== null ? Math.round(p.thunder * 100) + '%' : '-') + '</td></tr>';
    }
    return '<div class="card"><div class="card-h"><h3>' + T('Jadual 3 jam, 3 hari', '3-hour table, 3 days') + '</h3><small>' + T('tebal = tengah model · kecil = rendah–tinggi', 'bold = middle · small = low–high') + '</small></div>' +
      '<div class="card-b mw-tw"><table class="mw-tb"><thead><tr><th>' + T('Masa', 'Time') + '</th><th>' + T('Angin kt', 'Wind kt') + '</th><th>' + T('Tiupan', 'Gust') + '</th><th>' + T('Arah', 'Dir') + '</th>' +
      '<th>Hs m</th><th>' + T('Maks m', 'Max m') + '</th><th>' + T('Alun', 'Swell') + '</th><th>' + T('Ombak angin', 'Wind sea') + '</th><th>' + T('Hujan mm', 'Rain mm') + '</th><th>' + T('Petir', 'Thunder') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function charts(rep, now) {
    var s = settings(), H = rep.hours.filter(function (h) { return h.t >= now - HOUR && h.t <= now + 7 * DAY; });
    var card = function (title, sub, svg) { return '<div class="card"><div class="card-h"><h3>' + title + '</h3><small>' + sub + '</small></div><div class="card-b">' + svg + '</div></div>'; };
    return card(T('Angin (knot)', 'Wind (knots)'), T('garis = tengah · kawasan = model rendah–tinggi · putus-putus = tiupan', 'line = middle · band = low–high model · dashed = gusts'),
        band({ title: 'wind', pts: H.map(function (h) { return { t: h.t, m: h.w10.m, lo: h.w10.lo, hi: h.w10.hi, m2: h.g.m }; }), second: true, limit: s.offWindKt, limitText: T('had ', 'limit ') + s.offWindKt + ' kt', min: 20 })) +
      card(T('Ombak Hs (m)', 'Waves Hs (m)'), T('ketinggian ombak ketara; putus-putus = alun', 'significant wave height; dashed = swell'),
        band({ title: 'waves', cls: 'w', pts: H.map(function (h) { return { t: h.t, m: h.hs.m, lo: h.hs.lo, hi: h.hs.hi, m2: h.wh }; }), second: true, limit: s.offWaveM, limitText: T('had ', 'limit ') + s.offWaveM + ' m', min: 2 })) +
      card(T('Tempoh alun (s)', 'Swell period (s)'), T('tempoh panjang = alun dari jauh, kapal lebih bergoyang', 'long period = swell from far away, more vessel motion'),
        band({ title: 'period', cls: 'p', pts: H.map(function (h) { return { t: h.t, m: h.wt, lo: null, hi: null }; }), min: 10 })) +
      card(T('Hujan & ribut petir', 'Rain & thunderstorms'), T('bar = hujan mm sejam (tengah model) · jalur ungu = peluang ribut petir', 'bars = rain mm per hour (middle) · purple = chance of thunderstorms'),
        bars({ title: 'rain', pts: H.map(function (h) { return { t: h.t, v: h.p, th: h.thunder }; }) }));
  }
  function tides(snap, now) {
    var m = snap.marine || {}, ev = (m.tidesAll || []).filter(function (e) { return e.t >= now - HOUR && e.t <= now + 3 * DAY; });
    var h = '<div class="card"><div class="card-h"><h3>' + T('Pasang surut di platform', 'Tide at the platform') + '</h3><small>' + T('paras laut model (Open-Meteo), relatif', 'model sea level (Open-Meteo), relative') + '</small></div><div class="card-b">' +
      tideChart(m.hourly || [], m.tidesAll || [], now) +
      '<div class="mw-tev">' + (ev.length ? ev.map(function (e) { return '<span class="chip ' + (e.type === 'high' ? 'hi' : 'lo') + '">' + (e.type === 'high' ? T('Pasang ', 'High ') : T('Surut ', 'Low ')) + esc(dayName(e.t, now)) + ' ' + hh(e.t) + ' · ' + (+e.sea).toFixed(2) + ' m</span>'; }).join('') : '<span class="muted">-</span>') + '</div></div></div>';
    var P = Port.data, pe = P ? P.events.filter(function (e) { return e.t >= now - HOUR && e.t <= now + 3 * DAY; }) : [];
    h += '<div class="card"><div class="card-h"><h3>' + T('Pelabuhan Cukai (boat keluar / masuk)', 'Cukai port (boats out / in)') + '</h3><small>Tide Forecast · ' + T('salinan GitHub', 'GitHub copy') + '</small></div><div class="card-b">' +
      (pe.length ? '<table class="mw-tb sm"><thead><tr><th>' + T('Hari', 'Day') + '</th><th>' + T('Masa', 'Time') + '</th><th></th><th>m</th></tr></thead><tbody>' + pe.map(function (e) {
        return '<tr><td>' + esc(dayName(e.t, now)) + '</td><td class="mw-tt">' + hh(e.t) + '</td><td>' + (e.type === 'high' ? '▲ ' + T('Pasang', 'High') : '▼ ' + T('Surut', 'Low')) + '</td><td>' + r1(e.sea) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">' + (Port.busy ? T('Membaca…', 'Loading…') : Port.err ? esc(Port.err) : T('Tiada jadual', 'No table')) + '</div>') + '</div></div>';
    return h;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mw-tab]');
    if (b) { Weather.tab = b.getAttribute('data-mw-tab'); MC.save('mc_mw_tab', Weather.tab); Weather.render(); return; }
    if (e.target.closest('#mwRefresh')) { MC.Off.load(true); Weather.render(); }
  });

  /* ------------------------------------------------------------------ Vessels */
  var TYPES = [['crew', '🚤', 'Crew boat', 'Crew boat'], ['fcb', '🛥️', 'FCB / bot laju', 'FCB / fast boat'], ['psv', '🚢', 'Supply (PSV)', 'Supply (PSV)'], ['ahts', '⚓', 'AHTS', 'AHTS'],
    ['tug', '⛴️', 'Tunda', 'Tug'], ['errv', '🛟', 'Standby (ERRV)', 'Standby (ERRV)'], ['barge', '🏗️', 'Tongkang / barge', 'Barge'], ['tanker', '🛢️', 'Tanker', 'Tanker'], ['other', '🔹', 'Lain-lain', 'Other']];
  function typeOf(id) { return TYPES.filter(function (x) { return x[0] === id; })[0] || TYPES[TYPES.length - 1]; }
  var Vessels = {
    cfg: (function () { var c = MC.load('mc_vessels', null); return c && Array.isArray(c.list) ? c : { list: [], sel: 'area', src: 'vf', zoom: 9, track: true }; })(),
    editing: null,
    save: function () { MC.save('mc_vessels', this.cfg); },
    sel: function () { var c = this.cfg; return c.list.filter(function (v) { return v.id === c.sel; })[0] || null; },
    mapUrl: function (v, src, h) {
      var s = settings(), z = this.cfg.zoom || 9, lat = (+s.marineLat).toFixed(4), lon = (+s.marineLon).toFixed(4);
      if (src === 'mt') return 'https://www.marinetraffic.com/en/ais/embed/zoom:' + (v ? Math.max(z, 10) : z) + '/centery:' + lat + '/centerx:' + lon + '/maptype:4/shownames:true/mmsi:' + (v && v.mmsi ? v.mmsi : 0) +
        '/shipid:0/fleet:/fleet_id:/vtypes:/showmenu:false/remember:false';
      return 'https://www.vesselfinder.com/aismap?zoom=' + (v ? Math.max(z, 10) : z) + '&lat=' + (v ? 'undefined' : lat) + '&lon=' + (v ? 'undefined' : lon) + '&width=100%25&height=' + (h || 600) + '&names=true' +
        (v && v.mmsi ? '&mmsi=' + v.mmsi : '') + (v && v.imo ? '&imo=' + v.imo : '') + '&track=' + (v && this.cfg.track ? 'true' : 'false') +
        '&fleet=false&fleet_name=false&fleet_hide_old_positions=false&clicktoact=false&store_pos=false&ra=' + encodeURIComponent(location.origin + location.pathname);
    },
    fullUrl: function (v, src) {
      if (src === 'mt') return v && v.mmsi ? 'https://www.marinetraffic.com/en/ais/details/ships/mmsi:' + v.mmsi : 'https://www.marinetraffic.com/en/ais/home/centerx:' + settings().marineLon + '/centery:' + settings().marineLat + '/zoom:10';
      return v && (v.imo || v.mmsi) ? 'https://www.vesselfinder.com/vessels/details/' + (v.imo || v.mmsi) : 'https://www.vesselfinder.com/?p=' + settings().marineLat + ',' + settings().marineLon + ',9';
    },
    /* the job the vessel serves: its Go / Caution / No-Go now (Jobs today) */
    job: function (v) {
      if (!v.job) return '';
      var J = MC.EXT.Jobs && MC.EXT.Jobs.get(), it = null, col = -1;
      if (J) J.items.forEach(function (x, i) { if (x.id === v.job) { it = x; col = i; } });
      if (!it) return '<span class="chip">' + esc(v.job) + '</span>';
      var c = J.cells[0][col], st = c && c.st !== null ? c.st : -1, word = st < 0 ? '-' : col === 0 ? ['GO', 'CAUTION', 'LIMITED', 'STAY IN LQ'][st] : ['GO', 'CAUTION', 'NO-GO'][st];
      return '<span class="chip s' + st + '">' + esc(it.name) + ': ' + word + '</span>';
    },
    jobOptions: function (cur) {
      var J = MC.EXT.Jobs && MC.EXT.Jobs.get(), items = J ? J.items : [];
      return '<option value="">' + T('— tiada —', '— none —') + '</option>' + items.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === cur ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
    },
    render: function () {
      var host = $('vesselsHost');
      if (!host || state.view !== 'vessels') return;
      host.classList.toggle('vs-editing', !!Vessels.editing);
      if (Vessels.editing) { host.innerHTML = Vessels.editor(); return; }
      var c = Vessels.cfg, v = Vessels.sel(), src = c.src === 'mt' ? 'mt' : 'vf', s = settings();
      var all = c.sel === 'all' && c.list.length;
      var list = (c.list.length > 1 ? '<button type="button" class="vs-it' + (all ? ' on' : '') + '" data-vs="all"><span class="vs-ic">🧭</span><span><b>' + T('Semua kapal saya', 'All my vessels') + ' (' + c.list.length + ')</b><small>' + T('satu peta setiap kapal, kapal itu sahaja', 'one map per vessel, that vessel only') + '</small></span></button>' : '') +
        '<button type="button" class="vs-it' + (!v && !all ? ' on' : '') + '" data-vs="area"><span class="vs-ic">🗺️</span><span><b>' + T('Kawasan ', 'Around ') + esc(s.locationName || 'platform') + '</b><small>' + T('semua kapal sekitar platform', 'every vessel around the platform') + '</small></span></button>' +
        c.list.map(function (x) {
          var ty = typeOf(x.type);
          return '<button type="button" class="vs-it' + (v && v.id === x.id ? ' on' : '') + '" data-vs="' + esc(x.id) + '"><span class="vs-ic">' + ty[1] + '</span><span><b>' + esc(x.name || x.mmsi || x.imo) + '</b>' +
            '<small>' + esc(EN() ? ty[3] : ty[2]) + (x.mmsi ? ' · MMSI ' + esc(x.mmsi) : '') + (x.imo ? ' · IMO ' + esc(x.imo) : '') + '</small>' +
            (x.role ? '<small class="vs-role">' + esc(x.role) + '</small>' : '') + Vessels.job(x) + '</span></button>';
        }).join('') +
        (c.list.length ? '' : '<p class="muted vs-none">' + T('Belum ada kapal. Tekan ⚙ Tetapan kapal untuk tambah (nama + MMSI atau IMO).', 'No vessels yet. Press ⚙ Vessel settings to add one (name + MMSI or IMO).') + '</p>');
      var bar = '<div class="vs-bar"><div class="seg"><button type="button" data-vs-src="vf" aria-selected="' + (src === 'vf') + '">VesselFinder</button><button type="button" data-vs-src="mt" aria-selected="' + (src === 'mt') + '">MarineTraffic</button></div>' +
        '<label class="vs-z">' + T('Zum', 'Zoom') + ' <select id="vsZoom">' + [7, 8, 9, 10, 11, 12].map(function (z) { return '<option' + (z === +c.zoom ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select></label>' +
        (src === 'vf' ? '<label class="vs-z"><input type="checkbox" id="vsTrack"' + (c.track ? ' checked' : '') + '> ' + T('Trek 24 j', '24 h track') + '</label>' : '') +
        '<div class="sp"></div><button type="button" class="btn sm" id="vsFull">' + T('Buka laman penuh ↗', 'Open full site ↗') + '</button></div>';
      var title = all ? '<div class="vs-title">🧭 <b>' + T('Semua kapal saya', 'All my vessels') + '</b></div>' : v ? '<div class="vs-title">' + typeOf(v.type)[1] + ' <b>' + esc(v.name || '') + '</b>' + (v.role ? ' · ' + esc(v.role) : '') + ' ' + Vessels.job(v) + '</div>' : '<div class="vs-title">🗺️ <b>' + T('Kawasan ', 'Around ') + esc(s.locationName || '') + '</b></div>';
      host.innerHTML = '<div class="vs-side card"><div class="card-h"><h3>' + T('Kapal saya', 'My vessels') + '</h3><div class="sp"></div><button type="button" class="btn sm" id="vsEdit">⚙ ' + T('Tetapan kapal', 'Vessel settings') + '</button></div>' +
        '<div class="card-b vs-list">' + list + '</div></div>' +
        '<div class="vs-main card">' + title + bar + (all ? '<div class="vs-grid">' + c.list.map(function (x) {
          return '<div class="vs-cell"><div class="vs-ch"><span>' + typeOf(x.type)[1] + ' <b>' + esc(x.name) + '</b>' + (x.role ? ' · ' + esc(x.role) : '') + '</span>' + Vessels.job(x) + '</div><div class="vs-map sm" data-vs-map="' + esc(x.id) + '"></div></div>';
        }).join('') + '</div>' : '<div class="vs-map" id="vsMap"></div>') +
        '<p class="muted vs-note">' + T('Peta percuma VesselFinder / MarineTraffic (AIS). Kapal di luar liputan AIS darat mungkin tunjuk kedudukan lama.', 'Free VesselFinder / MarineTraffic maps (AIS). A vessel out of shore AIS range may show an old position.') + '</p></div>';
      if (all) c.list.forEach(function (x) { Vessels.map(x, src, document.querySelector('[data-vs-map="' + x.id + '"]'), 360); });
      else Vessels.map(v, src);
    },
    /* the map: an iframe on the web; a <webview> in the PC app (its window may only load its own pages) */
    map: function (v, src, box, h) {
      box = box || $('vsMap');
      var url = this.mapUrl(v, src, h);
      if (!box) return;
      if (box.getAttribute('data-url') === url) return;
      box.setAttribute('data-url', url);
      box.innerHTML = '';
      var el;
      if (MC.isDesktop) { el = document.createElement('webview'); el.setAttribute('partition', 'persist:sites'); }
      else { el = document.createElement('iframe'); el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'); el.setAttribute('loading', 'lazy'); }
      el.setAttribute('src', url);
      el.setAttribute('title', src === 'mt' ? 'MarineTraffic' : 'VesselFinder');
      box.appendChild(el);
    },
    editor: function () {
      var rows = Vessels.editing.map(function (x, i) {
        return '<tr data-i="' + i + '"><td><input class="inp" data-k="name" value="' + esc(x.name || '') + '" placeholder="' + T('cth KM Sri Kemaman', 'e.g. MV Sea Swift') + '"></td>' +
          '<td><input class="inp" data-k="mmsi" inputmode="numeric" maxlength="9" value="' + esc(x.mmsi || '') + '" placeholder="9 ' + T('digit', 'digits') + '"></td>' +
          '<td><input class="inp" data-k="imo" inputmode="numeric" maxlength="7" value="' + esc(x.imo || '') + '" placeholder="7 ' + T('digit', 'digits') + '"></td>' +
          '<td><select class="sel" data-k="type">' + TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === x.type ? ' selected' : '') + '>' + t[1] + ' ' + esc(EN() ? t[3] : t[2]) + '</option>'; }).join('') + '</select></td>' +
          '<td><input class="inp" data-k="role" value="' + esc(x.role || '') + '" placeholder="' + T('cth Boat demob LQ', 'e.g. LQ demob boat') + '"></td>' +
          '<td><select class="sel" data-k="job">' + Vessels.jobOptions(x.job) + '</select></td>' +
          '<td><button type="button" class="btn sm" data-vs-del="' + i + '" title="' + T('Padam', 'Delete') + '">✕</button></td></tr>' +
          (x.msg ? '<tr class="vs-err"><td colspan="7">' + esc(x.msg) + '</td></tr>' : '');
      }).join('');
      return '<div class="card vs-ed"><div class="card-h"><h3>⚙ ' + T('Tetapan kapal', 'Vessel settings') + '</h3><small>' + T('disimpan dalam peranti ini', 'kept on this device') + '</small></div><div class="card-b">' +
        '<p class="muted">' + T('Isi nama dan sekurang-kurangnya satu nombor: MMSI (9 digit) atau IMO (7 digit). Cari nombor di VesselFinder / MarineTraffic (halaman kapal). Jenis, peranan dan kerja boleh dibiarkan.',
          'Fill in the name and at least one number: MMSI (9 digits) or IMO (7 digits). Find them on VesselFinder / MarineTraffic (the vessel page). Type, role and job are optional.') + '</p>' +
        '<div class="mw-tw"><table class="mw-tb vs-tb"><thead><tr><th>' + T('Nama', 'Name') + '</th><th>MMSI</th><th>IMO</th><th>' + T('Jenis', 'Type') + '</th><th>' + T('Peranan / nota', 'Role / note') + '</th><th>' + T('Kerja (Go / No-Go)', 'Job (Go / No-Go)') + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="relay-btns"><button type="button" class="btn sm" id="vsAdd">+ ' + T('Tambah kapal', 'Add vessel') + '</button><div class="sp"></div><button type="button" class="btn sm" id="vsCancel">' + T('Batal', 'Cancel') + '</button><button type="button" class="btn sm pri" id="vsSave">' + T('Simpan', 'Save') + '</button></div></div></div>';
    },
    check: function (list) {
      var bad = false, seen = {};
      list.forEach(function (x) {
        x.name = String(x.name || '').trim().slice(0, 60); x.mmsi = String(x.mmsi || '').replace(/\D/g, ''); x.imo = String(x.imo || '').replace(/\D/g, ''); x.role = String(x.role || '').trim().slice(0, 80);
        x.msg = '';
        if (!x.mmsi && !x.imo) x.msg = T('Perlu MMSI atau IMO.', 'MMSI or IMO needed.');
        else if (x.mmsi && x.mmsi.length !== 9) x.msg = T('MMSI mesti 9 digit (ada {n}).', 'MMSI must be 9 digits (has {n}).').replace('{n}', x.mmsi.length);
        else if (x.imo && x.imo.length !== 7) x.msg = T('IMO mesti 7 digit (ada {n}).', 'IMO must be 7 digits (has {n}).').replace('{n}', x.imo.length);
        else if (!x.name) x.msg = T('Isi nama kapal.', 'Fill in the vessel name.');
        var key = x.mmsi || x.imo;
        if (!x.msg && seen[key]) x.msg = T('Kapal ini sudah ada dalam senarai.', 'This vessel is already in the list.');
        seen[key] = true;
        if (x.msg) bad = true;
      });
      return !bad;
    }
  };
  function readEditor() {
    [].forEach.call(document.querySelectorAll('.vs-tb tr[data-i]'), function (tr) {
      var x = Vessels.editing[+tr.getAttribute('data-i')];
      [].forEach.call(tr.querySelectorAll('[data-k]'), function (el) { x[el.getAttribute('data-k')] = el.value; });
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if (!t.closest || !t.closest('#vesselsHost')) return;
    if ((b = t.closest('[data-vs]'))) { Vessels.cfg.sel = b.getAttribute('data-vs'); Vessels.save(); Vessels.render(); return; }
    if ((b = t.closest('[data-vs-src]'))) { Vessels.cfg.src = b.getAttribute('data-vs-src'); Vessels.save(); Vessels.render(); return; }
    if (t.closest('#vsFull')) { MC.openExternal(Vessels.fullUrl(Vessels.sel(), Vessels.cfg.src === 'mt' ? 'mt' : 'vf')); return; }
    if (t.closest('#vsEdit')) { Vessels.editing = Vessels.cfg.list.map(function (x) { return Object.assign({}, x); }); if (!Vessels.editing.length) Vessels.editing.push({ type: 'crew' }); Vessels.render(); return; }
    if (t.closest('#vsAdd')) { readEditor(); if (Vessels.editing.length >= 20) return MC.toast(T('Maksimum 20 kapal', 'At most 20 vessels'), '', 'warning'); Vessels.editing.push({ type: 'crew' }); Vessels.render(); return; }
    if ((b = t.closest('[data-vs-del]'))) { readEditor(); Vessels.editing.splice(+b.getAttribute('data-vs-del'), 1); Vessels.render(); return; }
    if (t.closest('#vsCancel')) { Vessels.editing = null; Vessels.render(); return; }
    if (t.closest('#vsSave')) {
      readEditor();
      var list = Vessels.editing.filter(function (x) { return String(x.name || '').trim() || x.mmsi || x.imo; });
      if (!Vessels.check(list)) { Vessels.editing = list.length ? list : [{ type: 'crew' }]; Vessels.render(); MC.toast(T('Semak baris bertanda', 'Check the marked rows'), '', 'warning'); return; }
      Vessels.cfg.list = list.map(function (x, i) { return { id: 'v' + (x.mmsi || x.imo), name: x.name, mmsi: x.mmsi, imo: x.imo, type: x.type || 'other', role: x.role, job: x.job || '' }; });
      if (!Vessels.cfg.list.some(function (x) { return x.id === Vessels.cfg.sel; })) Vessels.cfg.sel = Vessels.cfg.list[0] ? Vessels.cfg.list[0].id : 'area';
      Vessels.save(); Vessels.editing = null; Vessels.render(); MC.toast(T('Kapal disimpan ✓', 'Vessels saved ✓'), Vessels.cfg.list.length + ''); return;
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'vsZoom') { Vessels.cfg.zoom = +e.target.value; Vessels.save(); Vessels.render(); }
    if (e.target.id === 'vsTrack') { Vessels.cfg.track = e.target.checked; Vessels.save(); Vessels.render(); }
  });

  /* ------------------------------------------------------------------ hooks */
  MC.EXT.views = MC.EXT.views || {};
  MC.EXT.views.weather = function () { Weather.render(); };
  MC.EXT.views.vessels = function () { Vessels.render(); };
  var prevDash = MC.EXT.dash;
  MC.EXT.dash = function () {
    if (prevDash) prevDash.apply(this, arguments);
    if (state.view === 'weather') Weather.render();
    if (state.view === 'vessels' && !Vessels.editing) [].forEach.call(document.querySelectorAll('#vesselsHost .vs-it'), function () { /* job chips refresh on next open */ });
  };
  MC.EXT.Marine = { Weather: Weather, Vessels: Vessels, periods: periods, sentence: sentence };
  if (state.view === 'weather') Weather.render();
  if (state.view === 'vessels') Vessels.render();
})();
