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

  /* ------------------------------------------------------------------ drawn icons (no emoji): platform, vessels, weather */
  var SV = function (vb, body, cls) { return '<svg class="' + (cls || 'ic') + '" viewBox="' + vb + '" aria-hidden="true">' + body + '</svg>'; };
  function rigIcon(cls) {
    return SV('0 0 40 40', '<path class="w" d="M3 35c2.5-1.6 5-1.6 7.5 0s5 1.6 7.5 0 5-1.6 7.5 0 5 1.6 7.5 0 5-1.6 7.5 0"/>' +
      '<path d="M11 19l-2.4 15M29 19l2.4 15M10.2 25h19.6M9.4 30h21.2M11 19l19.2 11M29 19L9.8 30"/>' +
      '<rect class="f" x="7" y="15.5" width="26" height="4" rx=".8"/><rect class="f" x="7" y="12" width="7" height="2.6" rx=".6"/>' +
      '<path d="M20.5 3.5l-4 12h8zM18.3 9.5h4.4M17.3 12.5h6.4"/><path d="M27 15.5V9h3v6.5"/>', cls || 'ic ic-rig');
  }
  var HULL = 'M3 18h57l-4.5 6.5H8.5z';
  var VSHAPE = {
    crew: '<path class="f" d="M4 18h56l-5 5.5H8z"/><path d="M19 18v-5.5h20l5 5.5"/><path class="l" d="M23 15h4M30 15h4"/>',
    fcb: '<path class="f" d="M3 18h58l-5.5 6H8z"/><path d="M15 18v-6.5h27l5.5 6.5"/><path d="M24 11.5V8h13v3.5"/><path class="l" d="M19 14.5h4M26 14.5h4M33 14.5h4"/>',
    psv: '<path class="f" d="' + HULL + '"/><path d="M40 18V8h12v10"/><path d="M46 8V3.5M43 5.5h6"/><path class="l" d="M42 11h8M6 15h31M6 15v3M14 15v3M22 15v3M30 15v3"/>',
    ahts: '<path class="f" d="' + HULL + '"/><path d="M37 18V7h12v11"/><path d="M43 7V3"/><path d="M5 18l4-9 4 9"/><path class="l" d="M39 10.5h8M16 15h17"/><circle cx="21" cy="15.5" r="2"/>',
    tug: '<path class="f" d="M10 18h44l-5 6.5H14z"/><path d="M25 18V8.5h12V18"/><path d="M31 8.5V4M28 6h6"/><path class="l" d="M27 12h8"/><path d="M14 16.5h7"/>',
    errv: '<path class="f" d="' + HULL + '"/><path d="M33 18V8h13v10"/><path d="M39.5 8V4"/><path class="l" d="M35 11.5h9"/><path d="M14 18v-6l4-2"/><path class="f o" d="M10 14.5h10l-1.5 2.5h-7z"/>',
    av: '<path class="f" d="M2 18h58l-5 6.5H7z"/><path d="M8 18V5.5h30V18"/><path class="l" d="M8 9.5h30M8 13.5h30M12 7.5h2M18 7.5h2M24 7.5h2M30 7.5h2"/><path d="M38 9l20-5M54 4.8v-2"/>',
    barge: '<path class="f" d="M3 15.5h58v8H3z"/><path d="M44 15.5l6-12 4 12"/><path d="M50 3.5L34 9"/><path class="l" d="M8 12h22v3.5H8z"/>',
    tanker: '<path class="f" d="M2 17.5h60l-4.5 7H6z"/><path d="M5 17.5V8.5h11v9"/><path d="M10 8.5V4.5"/><path class="l" d="M20 15h38M26 15v-2.5M36 15v-2.5M46 15v-2.5"/>',
    other: '<path class="f" d="' + HULL + '"/><path d="M26 18v-7h14v7"/><path class="l" d="M29 14h8"/>'
  };
  function vesselIcon(type, cls) { return SV('0 0 64 28', VSHAPE[type] || VSHAPE.other, cls || 'ic ic-v t-' + (VSHAPE[type] ? type : 'other')); }
  function arrowIcon(dir, cls) {
    if (num(dir) === null) return SV('0 0 40 40', '<circle cx="20" cy="20" r="3"/>', cls || 'ic ic-arr');
    return SV('0 0 40 40', '<g transform="rotate(' + Math.round((dir + 180) % 360) + ' 20 20)"><path class="f" d="M20 4l7 13h-4.5v18h-5V17H13z"/></g>', cls || 'ic ic-arr');
  }
  function skyIcon(rain, th, night) {
    var cloud = '<path class="f c" d="M11 27a6 6 0 0 1 .7-12 8 8 0 0 1 15.4-2A6.5 6.5 0 0 1 29 27z"/>';
    if (th !== null && th >= 0.2) return SV('0 0 40 40', cloud + '<path class="f b" d="M21 26l-4.5 7.5h4l-2 5.5 7-9h-4.2l2.2-4z"/>', 'ic ic-sky storm');
    if (rain !== null && rain >= 0.3) return SV('0 0 40 40', cloud + '<path class="r" d="M14 31l-1.5 4M20 31l-1.5 4M26 31l-1.5 4"/>', 'ic ic-sky rain');
    if (night) return SV('0 0 40 40', '<path class="f m" d="M25 6a12 12 0 1 0 9 19A10 10 0 0 1 25 6z"/>', 'ic ic-sky night');
    return SV('0 0 40 40', '<circle class="f s" cx="20" cy="20" r="7"/><path class="s" d="M20 4v5M20 31v5M4 20h5M31 20h5M8.7 8.7l3.5 3.5M27.8 27.8l3.5 3.5M8.7 31.3l3.5-3.5M27.8 12.2l3.5-3.5"/>', 'ic ic-sky sun');
  }
  function waveIcon() { return SV('0 0 40 40', '<path d="M3 17c4-4 8-4 11 0s7 4 11 0 8-4 12 0M3 25c4-4 8-4 11 0s7 4 11 0 8-4 12 0"/>', 'ic ic-wave'); }

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
    tab: (function () { var t = MC.load('mc_mw_tab', 'story'); return ['story', 'table', 'charts', 'tide'].indexOf(t) >= 0 ? t : 'story'; })(),
    pick: null,
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
      var ps = periods(rep, now, 3), head = headline(rep, ps, now);
      var h = hero(rep, ps, head, now, s, snap);
      var tabs = [['story', T('72 jam', '72 hours')], ['table', T('Jadual 3 jam', '3-hour table')], ['charts', T('Graf 7 hari', '7-day charts')], ['tide', T('Pasang surut', 'Tides')]];
      h += '<div class="seg mw-tabs" role="tablist">' + tabs.map(function (x) { return '<button type="button" role="tab" data-mw-tab="' + x[0] + '" aria-selected="' + (Weather.tab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
      if (Weather.tab === 'story') h += timeline(rep, ps, now);
      else if (Weather.tab === 'table') h += table(rep, now);
      else if (Weather.tab === 'charts') h += charts(rep, now);
      else h += tides(snap, now);
      host.innerHTML = h;
    }
  };
  /* the top of the page: where, the most important thing of the next 72 hours, and four instruments for "now" */
  function lvl(v, lim) { return v === null || !lim ? 'n' : v >= lim ? 'over' : v >= lim * 0.8 ? 'near' : 'ok'; }
  function hero(rep, ps, head, now, s, snap) {
    var ok = rep.ok || {}, n0 = rep.hours.filter(function (x) { return x.t >= now - HOUR; })[0] || rep.hours[0], P = Vessels.platform(), p0 = ps[0] || {};
    var night = function (t) { var hr = local(t).getUTCHours(); return hr < 7 || hr >= 19; };
    var inst = function (cls, icon, label, big, unit, small) {
      return '<div class="mw-in ' + cls + '"><div class="mw-in-i">' + icon + '</div><div class="mw-in-t"><span class="mw-in-l">' + label + '</span>' +
        '<span class="mw-in-v">' + big + '<small>' + unit + '</small></span><span class="mw-in-s">' + small + '</span></div></div>';
    };
    var w = n0 ? n0.w10 : {}, hs = n0 ? n0.hs : {};
    var h = '<section class="mw-hero lv' + (head ? head.level : 0) + '">' +
      '<div class="mw-hero-top">' + rigIcon('ic ic-rig sm') + '<div><b>' + esc(P.name) + '</b><span>' + P.lat.toFixed(4) + ' N, ' + P.lon.toFixed(4) + ' E · ' +
      T('dikemas kini ', 'updated ') + (rep.at ? hh(rep.at) : '-') + '</span></div>' +
      '<span class="mw-models" title="' + esc(T('model yang menjawab', 'models that answered')) + '">' + (ok.wind || []).length + '/6 ' + T('cuaca', 'weather') + ' · ' + (ok.wave || []).length + '/4 ' + T('ombak', 'wave') + ' · ' + (ok.ens || []).length + ' ' + T('ensembel', 'ensembles') + '</span>' +
      '<button class="btn sm" id="mwRefresh">' + T('Muat semula', 'Reload') + '</button></div>' +
      (head ? '<p class="mw-head">' + head.html + '</p>' : '') +
      '<div class="mw-ins">' +
      inst(lvl(w.m, s.offWindKt), arrowIcon(n0 && n0.dir), T('Angin', 'Wind') + ' · ' + dirWord(n0 && n0.dir), r0(w.m), ' kt', T('julat ', 'range ') + r0(w.lo) + '–' + r0(w.hi) + ' · ' + T('tiupan ', 'gusts ') + r0(n0 && n0.g.m)) +
      inst(lvl(hs.m, s.offWaveM), waveIcon(), T('Ombak (Hs)', 'Waves (Hs)'), r1(hs.m), ' m', T('julat ', 'range ') + r1(hs.lo) + '–' + r1(hs.hi) + ' · ' + T('maks ', 'max ') + r1(n0 && n0.hmax)) +
      inst('n', arrowIcon(n0 && n0.wd, 'ic ic-arr sw'), T('Alun', 'Swell') + ' · ' + dirWord(n0 && n0.wd), r1(n0 && n0.wh), ' m', r0(n0 && n0.wt) + ' s · ' + T('ombak angin ', 'wind sea ') + r1(n0 && n0.sh) + ' m') +
      inst(p0.thunder !== null && p0.thunder >= 0.5 ? 'over' : p0.thunder !== null && p0.thunder >= 0.2 ? 'near' : 'ok', skyIcon(p0.rain, p0.thunder, night(now)), T('Hingga ', 'Until ') + hh(p0.t1 || now), cap(rainWords(p0.rain, p0.thunder)), '',
        (p0.rain !== null ? r1(p0.rain) + ' mm' : '-') + (p0.thunder !== null ? ' · ' + T('petir ', 'thunder ') + Math.round(p0.thunder * 100) + '%' : '')) +
      '</div>' + metLine(snap) +
      '<p class="mw-how">' + T('Nombor besar = nilai tengah semua model; julat = model paling rendah hingga paling tinggi. Had anda: angin {w} kt, ombak {h} m.',
        'Big numbers = the middle of all models; range = lowest to highest model. Your limits: wind {w} kt, waves {h} m.').replace('{w}', s.offWindKt).replace('{h}', s.offWaveM) + '</p></section>';
    return h;
  }
  function cap(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }
  /* 72 hours in 6-hour columns: sky, wind arrow, waves, swell, rain; tap a column for its full sentence */
  function timeline(rep, ps, now) {
    var s = settings();
    if (!ps.length) return '';
    if (Weather.pick === null || !ps.some(function (p) { return p.t0 === Weather.pick; })) Weather.pick = ps[0].t0;
    var days = [], cols = '';
    ps.forEach(function (p) { var d = dkey(p.t0); if (!days.length || days[days.length - 1].d !== d) days.push({ d: d, t: p.t0, n: 0 }); days[days.length - 1].n++; });
    var dayRow = days.map(function (d) { return '<div class="mw-tl-d" style="grid-column: span ' + d.n + '">' + esc(dayName(d.t, now)) + '</div>'; }).join('');
    ps.forEach(function (p) {
      var st = p.wind && p.wind.m >= s.offWindKt || p.hs && p.hs.m >= s.offWaveM ? 'over' : p.wind && p.wind.m >= s.offWindKt * 0.8 || p.hs && p.hs.m >= s.offWaveM * 0.8 || (p.thunder !== null && p.thunder >= 0.5) ? 'near' : 'ok';
      var hsH = p.hs && p.hs.m !== null ? Math.max(4, Math.min(100, p.hs.m / Math.max(s.offWaveM * 1.5, 0.5) * 100)) : 0;
      var nightish = p.part === 0 || p.part === 3;
      cols += '<button type="button" class="mw-tl-c ' + st + (p.t0 === Weather.pick ? ' on' : '') + (p.now ? ' now' : '') + '" data-mw-pick="' + p.t0 + '">' +
        '<span class="mw-tl-h">' + (p.now ? T('Kini', 'Now') : hh(p.t0)) + '</span>' +
        skyIcon(p.rain, p.thunder, nightish) +
        '<span class="mw-tl-w">' + arrowIcon(p.wind && p.wind.dir, 'ic ic-arr xs') + '<b>' + r0(p.wind && p.wind.m) + '</b><small>kt</small></span>' +
        '<span class="mw-tl-r">' + r0(p.wind && p.wind.lo) + '–' + r0(p.wind && p.wind.hi) + '</span>' +
        '<span class="mw-tl-bar"><i style="height:' + hsH.toFixed(0) + '%"></i></span>' +
        '<span class="mw-tl-hs"><b>' + r1(p.hs && p.hs.m) + '</b><small>m</small></span>' +
        '<span class="mw-tl-sw">' + (p.swell && p.swell.h !== null ? r1(p.swell.h) + ' m · ' + r0(p.swell.t) + ' s' : '-') + '</span>' +
        '<span class="mw-tl-p">' + (p.thunder !== null && p.thunder >= 0.2 ? Math.round(p.thunder * 100) + '% ⚡' : p.rain !== null && p.rain >= 0.3 ? r1(p.rain) + ' mm' : '–') + '</span></button>';
    });
    var pi = 0; ps.forEach(function (p, i) { if (p.t0 === Weather.pick) pi = i; });
    var sel = ps[pi], sn = sentence(sel, ps[pi - 1]);
    var h = '<section class="card mw-tl-card"><div class="mw-tl-scroll"><div class="mw-tl" style="grid-template-columns: repeat(' + ps.length + ', minmax(74px, 1fr))">' + dayRow + cols + '</div></div>' +
      '<div class="mw-tl-say"><b>' + esc(dayName(sel.t0, now)) + ', ' + esc(sel.label) + ' <small>' + hh(sel.t0) + '–' + hh(sel.t1) + '</small></b><p>' + sn.text +
      (sn.over.length ? ' <span class="chip danger">' + T('melebihi had ', 'over limit ') + sn.over.join(' & ') + '</span>' : '') + (sn.wide ? ' <span class="chip alert">' + T('model tidak sependapat', 'models disagree') + '</span>' : '') + '</p></div>' +
      '<div class="mw-tl-key"><span><i class="k ok"></i>' + T('dalam had', 'within limits') + '</span><span><i class="k near"></i>' + T('hampir had / ribut petir', 'near limits / thunderstorms') + '</span><span><i class="k over"></i>' + T('melebihi had', 'over limits') + '</span><span>' + T('bar = tinggi ombak', 'bar = wave height') + '</span></div></section>';
    var later = (rep.days || []).filter(function (d) { return d.lead >= 3 && d.lead <= 6; });
    if (later.length) {
      h += '<section class="card"><div class="card-h"><h3>' + T('Hari 4 hingga 7', 'Days 4 to 7') + '</h3><small>' + T('gambaran kasar', 'rough outlook') + '</small></div><div class="card-b mw-later">' +
        later.map(function (d) {
          var t = Date.parse(d.date + 'T12:00:00Z') - TZ, st = d.wind.m >= s.offWindKt || d.hs.m >= s.offWaveM ? 'over' : d.wind.m >= s.offWindKt * 0.8 || d.hs.m >= s.offWaveM * 0.8 ? 'near' : 'ok';
          return '<div class="mw-day2 ' + st + '"><b>' + esc(dayName(t, now)) + '</b>' + skyIcon(d.rain, d.thunder, false) +
            '<span>' + arrowIcon(d.dir, 'ic ic-arr xs') + ' <b>' + r0(d.wind.m) + '</b> kt <small>' + r0(d.wind.lo) + '–' + r0(d.wind.hi) + '</small></span>' +
            '<span><b>' + r1(d.hs.m) + '</b> m <small>' + r1(d.hs.lo) + '–' + r1(d.hs.hi) + '</small></span>' +
            (d.ens ? '<span class="muted">' + Math.round(d.ens.prob * 100) + '% ≥ ' + rep.windKt + ' kt</span>' : '') + '</div>';
        }).join('') + '</div></section>';
    }
    return h;
  }
  function metLine(snap) {
    var w = ((snap.met || {}).warnings || []).slice(0, 2);
    if (!w.length) return '<p class="mw-met ok">✓ ' + T('Tiada amaran laut MET untuk kawasan anda.', 'No MET sea warning for your area.') + '</p>';
    return w.map(function (x) {
      var head = EN() ? (x.heading_en || x.heading_bm) : (x.heading_bm || x.heading_en), short = C.metShort ? C.metShort(x, settings(), Date.now()) : '';
      return '<p class="mw-met' + (x.severity === 'critical' ? ' crit' : '') + '">⚠ <b>MET: ' + esc(head || '') + '</b> ' + esc(String(short || (EN() ? x.text_en || x.text_bm : x.text_bm || x.text_en) || '').slice(0, 240)) + '</p>';
    }).join('');
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
    var pk = e.target.closest('[data-mw-pick]');
    if (pk) { Weather.pick = +pk.getAttribute('data-mw-pick'); Weather.render(); }
  });

  /* ------------------------------------------------------------------ Vessels */
  var TYPES = [['crew', '🚤', 'Crew boat', 'Crew boat'], ['fcb', '🛥️', 'FCB / bot laju', 'FCB / fast boat'], ['psv', '🚢', 'Supply (PSV)', 'Supply (PSV)'], ['ahts', '⚓', 'AHTS', 'AHTS'],
    ['tug', '⛴️', 'Tunda', 'Tug'], ['errv', '🛟', 'Standby (ERRV)', 'Standby (ERRV)'], ['av', '🏨', 'AV (kapal penginapan)', 'AV (accommodation vessel)'], ['barge', '🏗️', 'Tongkang / barge', 'Barge'], ['tanker', '🛢️', 'Tanker', 'Tanker'], ['other', '🔹', 'Lain-lain', 'Other']];
  function typeOf(id) { return TYPES.filter(function (x) { return x[0] === id; })[0] || TYPES[TYPES.length - 1]; }
  /* ------------------------------------------------------------------ position reports (1.3.0)
     A vessel's position as the captain reports it (radio / WhatsApp), typed in here: bearing + distance from the platform,
     or lat / lon (both kept in step), or a tap on the chart. Sphere formulas, Earth radius 3440.065 nm. */
  var R_NM = 3440.065, RAD = Math.PI / 180, DR_MAX = 6, KEEP_N = 10, KEEP_T = 3 * DAY;
  var SPEED = { crew: 20, fcb: 18, psv: 10, ahts: 11, tug: 6, errv: 8, av: 7, barge: 5, tanker: 10, other: 10 };
  var Geo = {
    /* the point a distance away on a bearing (destination point) */
    dest: function (p, brg, nm) {
      var d = nm / R_NM, t = brg * RAD, la1 = p.lat * RAD, lo1 = p.lon * RAD;
      var la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(t));
      var lo2 = lo1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
      return { lat: la2 / RAD, lon: ((lo2 / RAD + 540) % 360) - 180 };
    },
    /* distance (haversine) and initial bearing from a to b */
    inv: function (a, b) {
      var la1 = a.lat * RAD, la2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD, dla = la2 - la1;
      var h = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dl / 2) * Math.sin(dl / 2);
      var brg = (Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl)) / RAD + 360) % 360;
      return { nm: 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h))), brg: brg };
    },
    /* "5.6915", "5°41.5'N", "5 41 30 N", "104°54.99′E", "-5.2"; BM letters too: U(tara) S(elatan) T(imur) B(arat) */
    parse: function (s, kind) {
      s = String(s === null || s === undefined ? '' : s).trim().toUpperCase().replace(/,/g, '.');
      if (!s) return null;
      var hm = s.match(/([NSEWUTB])\s*$/) || s.match(/^([NSEWUTB])/), h = hm ? hm[1] : '';
      if (h && kind === 'lat' && 'NSU'.indexOf(h) < 0) return null;
      if (h && kind === 'lon' && 'EWTB'.indexOf(h) < 0) return null;
      var n = s.match(/-?\d+(?:\.\d+)?/g);
      if (!n || n.length > 3) return null;
      var d = +n[0], m = n[1] !== undefined ? +n[1] : 0, sc = n[2] !== undefined ? +n[2] : 0;
      if (n.length > 1 && (n[0].indexOf('.') >= 0 || d < 0)) return null;
      if (m >= 60 || sc >= 60 || (n.length > 2 && n[1].indexOf('.') >= 0)) return null;
      var v = Math.abs(d) + m / 60 + sc / 3600;
      if (d < 0 || h === 'S' || h === 'W' || h === 'B') v = -v;
      if (Math.abs(v) > (kind === 'lat' ? 90 : 180)) return null;
      return v;
    },
    /* 5°41.49′N  (degrees and decimal minutes, as on a chart) */
    dm: function (v, kind) {
      var a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60;
      if (m >= 59.995) { d++; m = 0; }
      return d + '°' + (m < 10 ? '0' : '') + m.toFixed(2) + '′' + (kind === 'lat' ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W'));
    },
    /* dead reckoning: where the vessel should be now, from the last report, its speed and course (at most 6 h) */
    dr: function (rep, now) {
      if (!rep || num(rep.sog) === null || num(rep.cog) === null || rep.sog <= 0) return null;
      var h = (now - rep.t) / HOUR;
      if (h <= 0 || h > DR_MAX) return null;
      var p = Geo.dest(rep, rep.cog, rep.sog * h);
      return { lat: p.lat, lon: p.lon, hours: h };
    },
    /* distance and ETA to the platform on a straight run; "toward" = the course is within 60° of the platform's bearing */
    eta: function (pos, P, kn, cog) {
      var a = Geo.inv(pos, P), toward = num(cog) === null ? null : Math.abs(((cog - a.brg + 540) % 360) - 180) <= 60;
      return { nm: a.nm, brgTo: a.brg, hours: kn > 0 ? a.nm / kn : null, toward: toward, here: a.nm < 0.5 };
    }
  };
  function dur(h) {
    if (h === null || !isFinite(h)) return '-';
    var m = Math.round(h * 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + (EN() ? ' h ' : ' j ') + pad(m % 60) + ' min';
  }
  function ago(t, now) {
    var m = Math.max(0, Math.round((now - t) / 60000));
    if (m < 1) return T('baru tadi', 'just now');
    if (m < 60) return m + T(' min lalu', ' min ago');
    if (m < 48 * 60) return Math.floor(m / 60) + T(' j ', ' h ') + (m % 60 ? pad(m % 60) + ' min ' : '') + T('lalu', 'ago');
    return Math.floor(m / 1440) + T(' hari lalu', ' days ago');
  }
  function brg3(b) { b = Math.round(b) % 360; return (b < 10 ? '00' : b < 100 ? '0' : '') + b + '°T'; }
  var Reports = {
    all: function () { var c = Vessels.cfg; if (!c.reports || typeof c.reports !== 'object') c.reports = {}; return c.reports; },
    list: function (id) { return (this.all()[id] || []).slice(); },
    last: function (id) { return this.all()[id] && this.all()[id][0] || null; },
    add: function (id, r) {
      var all = this.all(), l = (all[id] || []).filter(function (x) { return x.t !== r.t; });
      l.push(r); l.sort(function (a, b) { return b.t - a.t; });
      all[id] = l.slice(0, KEEP_N); this.prune(); Vessels.save();
    },
    del: function (id, t) { var all = this.all(); all[id] = (all[id] || []).filter(function (x) { return x.t !== t; }); this.prune(); Vessels.save(); },
    /* reports older than 3 days, and those of vessels no longer in the list, are dropped */
    prune: function (now) {
      var all = this.all(), cut = (now || Date.now()) - KEEP_T, ids = {}, changed = false;
      Vessels.cfg.list.forEach(function (v) { ids[v.id] = true; });
      Object.keys(all).forEach(function (id) {
        var was = (all[id] || []).length;
        all[id] = ids[id] ? (all[id] || []).filter(function (x) { return x && x.t >= cut && isFinite(x.lat) && isFinite(x.lon); }) : [];
        if (all[id].length !== was) changed = true;
        if (!all[id].length) delete all[id];
      });
      return changed;
    },
    speedOf: function (v) { var k = num(v && v.kn); return k !== null && k > 0 ? k : SPEED[v && v.type] || SPEED.other; },
    /* the vessel now: last report, estimated position, age, distance / ETA to the platform */
    now: function (v, now) {
      var rep = this.last(v.id);
      if (!rep) return null;
      now = now || Date.now();
      var P = Vessels.platform(), age = (now - rep.t) / HOUR, old = age > DR_MAX, est = old ? null : Geo.dr(rep, now), pos = est || rep;
      var kn = num(rep.sog) !== null && rep.sog > 0 ? rep.sog : Reports.speedOf(v), from = num(rep.sog) !== null && rep.sog > 0 ? 'rep' : 'type';
      var fromP = Geo.inv(P, rep);
      return { rep: rep, est: est, pos: pos, age: age, old: old, kn: kn, knFrom: from, fromP: fromP, eta: Geo.eta(pos, P, kn, rep.cog) };
    },
    /* one line for the fleet card / chart label */
    line: function (v, now) {
      var n = this.now(v, now);
      if (!n) return '';
      if (n.old) return T('laporan lama · ', 'old report · ') + ago(n.rep.t, now || Date.now());
      if (n.eta.here) return T('di platform', 'at the platform');
      return n.eta.nm.toFixed(1) + ' nm · ' + (n.eta.toward === false ? T('tidak menghala ke platform', 'not heading to the platform') : 'ETA ' + dur(n.eta.hours));
    }
  };
  var Vessels = {
    cfg: (function () { var c = MC.load('mc_vessels', null); return c && Array.isArray(c.list) ? c : { list: [], sel: 'area', src: 'chart', zoom: 9, track: true }; })(),
    editing: null, rep: null,
    save: function () { MC.save('mc_vessels', this.cfg); },
    /* the platform marked on the area maps: the profile point; its name can be changed in Vessel settings */
    platform: function () {
      var s = settings(), n = String(this.cfg.platform || '').trim();
      return { name: n || (/^irong barat$/i.test(String(s.locationName || '').trim()) ? 'Irong Barat A' : (s.locationName || 'Platform')), lat: +s.marineLat, lon: +s.marineLon };
    },
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
      var c = Vessels.cfg, v = Vessels.sel(), all = c.sel === 'all' && c.list.length > 0, area = !v && !all, P = Vessels.platform(), s = settings();
      /* the area keeps its own source (chart first); one vessel keeps another (VesselFinder first, the chart once a position is reported) */
      var want = v ? c.vsrc || 'vf' : c.src, src = want === 'mt' || want === 'vf' || want === 'chart' ? want : 'chart', rp = Vessels.rep && c.list.length ? Vessels.rep : null;
      if (src === 'chart' && all) src = 'vf';
      if (rp) src = 'chart';
      var now = Date.now();
      if (Reports.prune(now)) Vessels.save();
      var card = function (id, on, icon, name, sub, extra) {
        return '<button type="button" class="vs-fc' + (on ? ' on' : '') + '" data-vs="' + esc(id) + '">' + icon + '<span class="vs-fc-t"><b>' + name + '</b><small>' + sub + '</small>' + (extra || '') + '</span></button>';
      };
      var fleet = card('area', area, rigIcon('ic ic-rig'), T('Kawasan ', 'Around ') + esc(P.name), T('carta & semua kapal sekitar', 'chart & every vessel around')) +
        (c.list.length > 1 ? card('all', all, '<span class="vs-stack">' + c.list.slice(0, 3).map(function (x) { return vesselIcon(x.type); }).join('') + '</span>', T('Semua kapal saya', 'All my vessels'), c.list.length + ' ' + T('peta, satu setiap kapal', 'maps, one per vessel')) : '') +
        c.list.map(function (x) {
          var ty = typeOf(x.type);
          var pl = Reports.line(x, now), old = pl && Reports.now(x, now).old;
          return card(x.id, v && v.id === x.id, vesselIcon(x.type), esc(x.name || x.mmsi || x.imo), esc(EN() ? ty[3] : ty[2]) + (x.call ? ' · ' + esc(x.call) : ''),
            (pl ? '<small class="vs-fc-pos' + (old ? ' old' : '') + '">' + esc(pl) + '</small>' : '') + Vessels.job(x));
        }).join('') +
        '<button type="button" class="vs-fc add" id="vsEdit"><span class="vs-plus">+</span><span class="vs-fc-t"><b>' + (c.list.length ? T('Tetapan kapal', 'Vessel settings') : T('Tambah kapal', 'Add vessels')) + '</b><small>' + T('nama, MMSI / IMO, jenis', 'name, MMSI / IMO, type') + '</small></span></button>';
      var srcs = (all ? [] : [['chart', T('Carta', 'Chart')]]).concat([['vf', 'VesselFinder'], ['mt', 'MarineTraffic']]);
      var title = area ? rigIcon('ic ic-rig sm') + '<div><b>' + esc(P.name) + '</b><span>' + P.lat.toFixed(4) + ' N, ' + P.lon.toFixed(4) + ' E</span></div>'
        : all ? '<div><b>' + T('Semua kapal saya', 'All my vessels') + '</b><span>' + T('setiap peta tunjuk kapal itu sahaja', 'each map shows that vessel only') + '</span></div>'
        : vesselIcon(v.type, 'ic ic-v sm t-' + v.type) + '<div><b>' + esc(v.name) + '</b><span>' + esc(EN() ? typeOf(v.type)[3] : typeOf(v.type)[2]) + (v.role ? ' · ' + esc(v.role) : '') + '</span></div>';
      var bar = '<div class="vs-head">' + '<div class="vs-ttl">' + title + '</div>' +
        '<div class="seg" role="tablist">' + srcs.map(function (x) { return '<button type="button" role="tab" data-vs-src="' + x[0] + '" aria-selected="' + (src === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        (src !== 'chart' ? '<label class="vs-z">' + T('Zum', 'Zoom') + ' <select id="vsZoom">' + [7, 8, 9, 10, 11, 12].map(function (z) { return '<option' + (z === +c.zoom ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select></label>' : '') +
        (src === 'vf' && !area ? '<label class="vs-z"><input type="checkbox" id="vsTrack"' + (c.track ? ' checked' : '') + '> ' + T('Trek 24 j', '24 h track') + '</label>' : '') +
        (area && src !== 'chart' ? '<button type="button" class="btn sm" id="vsCenter">' + T('Pusatkan semula', 'Re-centre') + '</button>' : '') +
        (src !== 'chart' && !all ? '<button type="button" class="btn sm" id="vsFull">' + T('Buka laman penuh', 'Open full site') + ' ↗</button>' : '') +
        (c.list.length && !all && !rp ? '<button type="button" class="btn sm pri" id="vsRep">+ ' + T('Lapor kedudukan', 'Report a position') + '</button>' : '') + '</div>';
      var body;
      if (all) body = '<div class="vs-grid">' + c.list.map(function (x) {
        return '<div class="vs-cell"><div class="vs-ch">' + vesselIcon(x.type, 'ic ic-v xs t-' + x.type) + '<b>' + esc(x.name) + '</b>' + (x.role ? '<span class="muted">' + esc(x.role) + '</span>' : '') + Vessels.job(x) + '</div><div class="vs-map sm" data-vs-map="' + esc(x.id) + '"></div></div>';
      }).join('') + '</div>';
      if (rp) body = '<div class="vs-split rep"><div class="vs-map chart tap" id="vsMap"></div>' + repForm() + '</div>';
      else if (all) { /* above */ }
      else if (v) body = '<div class="vs-split"><div class="vs-map' + (src === 'chart' ? ' chart' : '') + '" id="vsMap"></div>' + Vessels.detail(v, now) + '</div>';
      else body = '<div class="vs-map' + (src === 'chart' ? ' chart' : '') + '" id="vsMap"></div>';
      host.innerHTML = '<div class="vs-fleet" role="list">' + fleet + '</div><section class="vs-stage card">' + bar + body +
        '<p class="muted vs-note">' + (src === 'chart' ? T('Carta OceanWATCH: kapal di carta ini ialah kedudukan yang anda lapor (bukan AIS langsung); garis putus-putus = anggaran dari laju & haluan, paling lama 6 jam. Kedudukan AIS langsung ada di VesselFinder / MarineTraffic.',
          'OceanWATCH chart: vessels here are the positions you reported (not live AIS); the dashed line is the estimate from speed & course, at most 6 h. Live AIS positions are on VesselFinder / MarineTraffic.')
          : T('Peta percuma VesselFinder / MarineTraffic (AIS). Kapal di luar liputan AIS darat mungkin tunjuk kedudukan lama.', 'Free VesselFinder / MarineTraffic maps (AIS). A vessel out of shore AIS range may show an old position.')) + '</p></section>';
      if (all && !rp) c.list.forEach(function (x) { Vessels.map(x, src, document.querySelector('[data-vs-map="' + x.id + '"]'), 360); });
      else if (src === 'chart') Chart.draw($('vsMap'));
      else Vessels.map(v, src);
    },
    /* the panel beside one vessel's map */
    detail: function (v, now) {
      var ty = typeOf(v.type), row = function (k, val) { return val ? '<div><dt>' + k + '</dt><dd>' + val + '</dd></div>' : ''; };
      now = now || Date.now();
      var n = Reports.now(v, now), P = Vessels.platform(), hist = Reports.list(v.id);
      var last = n ? '<div class="vs-last' + (n.old ? ' old' : '') + '"><div class="vs-lh"><b>' + T('Kedudukan dilapor', 'Reported position') + '</b><span>' + hh(n.rep.t) + ' · ' + ago(n.rep.t, now) + '</span></div>' +
        '<dl>' + row(T('Dari platform', 'From platform'), brg3(n.fromP.brg) + ' · ' + n.fromP.nm.toFixed(1) + ' nm') + row('Lat / Lon', Geo.dm(n.rep.lat, 'lat') + '<br>' + Geo.dm(n.rep.lon, 'lon')) +
        row(T('Laju / haluan', 'Speed / course'), (num(n.rep.sog) !== null ? n.rep.sog + ' kn' : '-') + ' / ' + (num(n.rep.cog) !== null ? brg3(n.rep.cog) : '-')) +
        (n.est ? row(T('Anggaran sekarang', 'Estimated now'), n.eta.nm.toFixed(1) + ' nm ' + T('dari platform', 'from the platform')) : '') +
        row('ETA', n.old ? T('- (laporan lama)', '- (old report)') : n.eta.here ? T('di platform', 'at the platform') : n.eta.toward === false ? T('tidak menghala ke platform', 'not heading to the platform') :
          '<b>' + dur(n.eta.hours) + '</b><br><small>' + n.kn + ' kn' + (n.knFrom === 'type' ? T(' (laju biasa)', ' (usual speed)') : '') + '</small>') +
        (n.rep.note ? row(T('Nota', 'Note'), esc(n.rep.note)) : '') + '</dl>' +
        (hist.length > 1 ? '<details class="vs-hist"><summary>' + T('Sejarah ', 'History ') + '(' + hist.length + ')</summary><ol>' + hist.map(function (r) {
          var a = Geo.inv(P, r);
          return '<li><span>' + dayName(r.t, now).slice(0, 3) + ' ' + hh(r.t) + '</span><span>' + brg3(a.brg) + ' ' + a.nm.toFixed(1) + ' nm' + (num(r.sog) !== null ? ' · ' + r.sog + ' kn' : '') + '</span><button type="button" class="vs-hx" data-rp-del="' + r.t + '" aria-label="' + T('Padam laporan', 'Delete report') + '">✕</button></li>';
        }).join('') + '</ol></details>' : '') + '</div>'
        : '<div class="vs-last none">' + T('Belum ada laporan kedudukan untuk kapal ini.', 'No position report for this vessel yet.') + '</div>';
      return '<aside class="vs-det">' + vesselIcon(v.type, 'ic ic-v lg t-' + v.type) + '<h4>' + esc(v.name) + '</h4><p class="muted">' + esc(EN() ? ty[3] : ty[2]) + '</p>' +
        '<dl>' + row('MMSI', esc(v.mmsi)) + row('IMO', esc(v.imo)) + row(T('Callsign', 'Call sign'), esc(v.call)) + row(T('Peranan', 'Role'), esc(v.role)) + '</dl>' +
        (v.job ? '<div class="vs-det-job"><span class="muted">' + T('Kerja sekarang', 'Job now') + '</span>' + Vessels.job(v) + '</div>' : '') + last +
        '<div class="vs-det-b"><button type="button" class="btn sm pri" data-rp-new="' + esc(v.id) + '">+ ' + T('Lapor kedudukan', 'Report a position') + '</button><button type="button" class="btn sm" data-vs-open="vf">VesselFinder ↗</button><button type="button" class="btn sm" data-vs-open="mt">MarineTraffic ↗</button></div></aside>';
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
      /* area map: the platform pinned over the map's centre (the map opens centred on it); moving the map inside it cannot be
         seen by the app, so the pin fades once the map is touched and "Re-centre" puts both back */
      if (!v && box.id === 'vsMap') {
        var P = this.platform(), pin = document.createElement('div');
        pin.className = 'vs-pin ' + src;
        pin.innerHTML = rigIcon('ic ic-rig pin') + '<b>' + esc(P.name) + '</b>';
        box.appendChild(pin);
        box.classList.remove('moved');
      }
    },
    editor: function () {
      var rows = Vessels.editing.map(function (x, i) {
        return '<tr data-i="' + i + '"><td><input class="inp" data-k="name" value="' + esc(x.name || '') + '" placeholder="' + T('cth KM Sri Kemaman', 'e.g. MV Sea Swift') + '"></td>' +
          '<td><input class="inp" data-k="mmsi" inputmode="numeric" maxlength="9" value="' + esc(x.mmsi || '') + '" placeholder="9 ' + T('digit', 'digits') + '"></td>' +
          '<td><input class="inp" data-k="imo" inputmode="numeric" maxlength="7" value="' + esc(x.imo || '') + '" placeholder="7 ' + T('digit', 'digits') + '"></td>' +
          '<td><input class="inp" data-k="call" maxlength="10" value="' + esc(x.call || '') + '" placeholder="' + T('cth 9MAB2', 'e.g. 9MAB2') + '" autocapitalize="characters"></td>' +
          '<td><select class="sel" data-k="type">' + TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === x.type ? ' selected' : '') + '>' + esc(EN() ? t[3] : t[2]) + '</option>'; }).join('') + '</select></td>' +
          '<td><input class="inp vs-kn" data-k="kn" inputmode="decimal" maxlength="4" value="' + esc(x.kn || '') + '" placeholder="' + (SPEED[x.type] || SPEED.other) + '"></td>' +
          '<td><input class="inp" data-k="role" value="' + esc(x.role || '') + '" placeholder="' + T('cth Boat demob LQ', 'e.g. LQ demob boat') + '"></td>' +
          '<td><select class="sel" data-k="job">' + Vessels.jobOptions(x.job) + '</select></td>' +
          '<td><button type="button" class="btn sm" data-vs-del="' + i + '" title="' + T('Padam', 'Delete') + '">✕</button></td></tr>' +
          (x.msg ? '<tr class="vs-err"><td colspan="9">' + esc(x.msg) + '</td></tr>' : '');
      }).join('');
      return '<div class="card vs-ed"><div class="card-h"><h3>⚙ ' + T('Tetapan kapal', 'Vessel settings') + '</h3><small>' + T('disimpan dalam peranti ini', 'kept on this device') + '</small></div><div class="card-b">' +
        '<p class="muted">' + T('Isi nama dan sekurang-kurangnya satu nombor: MMSI (9 digit) atau IMO (7 digit). Cari nombor di VesselFinder / MarineTraffic (halaman kapal). Jenis, peranan dan kerja boleh dibiarkan.',
          'Fill in the name and at least one number: MMSI (9 digits) or IMO (7 digits). Find them on VesselFinder / MarineTraffic (the vessel page). Type, role and job are optional.') + '</p>' +
        '<div class="fld vs-pfld"><label for="vsPlatform">' + T('Nama platform di peta', 'Platform name on the map') + '<small>' + T('ditanda di titik profil ', 'marked at the profile point ') + (+settings().marineLat).toFixed(4) + ', ' + (+settings().marineLon).toFixed(4) + '</small></label>' +
        '<input class="inp" id="vsPlatform" maxlength="40" value="' + esc(Vessels.cfg.platform || '') + '" placeholder="' + esc(Vessels.platform().name) + '"></div>' +
        '<div class="mw-tw"><table class="mw-tb vs-tb"><thead><tr><th>' + T('Nama', 'Name') + '</th><th>MMSI</th><th>IMO</th><th>' + T('Callsign', 'Call sign') + '</th><th>' + T('Jenis', 'Type') + '</th><th>' + T('Laju biasa (kn)', 'Usual speed (kn)') + '</th><th>' + T('Peranan / nota', 'Role / note') + '</th><th>' + T('Kerja (Go / No-Go)', 'Job (Go / No-Go)') + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="relay-btns"><button type="button" class="btn sm" id="vsAdd">+ ' + T('Tambah kapal', 'Add vessel') + '</button><div class="sp"></div><button type="button" class="btn sm" id="vsCancel">' + T('Batal', 'Cancel') + '</button><button type="button" class="btn sm pri" id="vsSave">' + T('Simpan', 'Save') + '</button></div></div></div>';
    },
    check: function (list) {
      var bad = false, seen = {};
      list.forEach(function (x) {
        x.name = String(x.name || '').trim().slice(0, 60); x.mmsi = String(x.mmsi || '').replace(/\D/g, ''); x.imo = String(x.imo || '').replace(/\D/g, ''); x.role = String(x.role || '').trim().slice(0, 80); x.call = String(x.call || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
        x.kn = String(x.kn === undefined || x.kn === null ? '' : x.kn).trim().replace(',', '.');
        x.msg = '';
        if (x.kn && !(+x.kn >= 1 && +x.kn <= 40)) x.msg = T('Laju biasa 1 hingga 40 kn (atau kosongkan).', 'Usual speed 1 to 40 kn (or leave empty).');
        else if (!x.mmsi && !x.imo) x.msg = T('Perlu MMSI atau IMO.', 'MMSI or IMO needed.');
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
  /* the report form, beside the chart (the chart can be tapped to set the position) */
  function repDefaultWhen(now) { var d = local(now || Date.now()); return d.toISOString().slice(0, 16); }
  function repWhen(s) { var t = Date.parse(String(s || '') + ':00+08:00'); return isFinite(t) ? t : null; }
  function repForm() {
    var r = Vessels.rep, P = Vessels.platform(), c = Vessels.cfg;
    var v = c.list.filter(function (x) { return x.id === r.id; })[0] || c.list[0];
    var f = function (id, lab, val, ph, unit, mode) {
      return '<label class="rp-f"><span>' + lab + '</span><span class="rp-in"><input class="inp" id="' + id + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '"' + (mode ? ' inputmode="' + mode + '"' : '') + ' autocomplete="off">' + (unit ? '<i>' + unit + '</i>' : '') + '</span></label>';
    };
    return '<aside class="vs-rep" aria-label="' + T('Lapor kedudukan', 'Report a position') + '"><div class="rp-h"><b>' + T('Lapor kedudukan', 'Report a position') + '</b><button type="button" class="btn sm" id="rpCancel" aria-label="' + T('Tutup', 'Close') + '">✕</button></div>' +
      '<div class="rp-2 one"><label class="rp-f"><span>' + T('Kapal', 'Vessel') + '</span><select class="sel" id="rpVes">' + c.list.map(function (x) { return '<option value="' + esc(x.id) + '"' + (v && x.id === v.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="rp-f"><span>' + T('Masa laporan', 'Report time') + '</span><input class="inp" type="datetime-local" id="rpWhen" value="' + esc(r.when) + '"></label></div>' +
      '<fieldset class="rp-g"><legend>' + T('Dari ', 'From ') + esc(P.name) + '</legend><div class="rp-2">' + f('rpBrg', T('Bearing', 'Bearing'), r.brg, T('cth 045', 'e.g. 045'), '°T', 'decimal') + f('rpNm', T('Jarak', 'Distance'), r.nm, T('cth 12', 'e.g. 12'), 'nm', 'decimal') + '</div></fieldset>' +
      '<fieldset class="rp-g"><legend>Lat / Lon</legend><div class="rp-2">' + f('rpLat', 'Lat', r.lat, "5°41.5'N / 5.6915", '', '') + f('rpLon', 'Lon', r.lon, "104°55'E / 104.9165", '', '') + '</div>' +
      '<p class="rp-tap">' + T('atau ketik tempat kapal di Carta', 'or tap where the vessel is on the chart') + '</p></fieldset>' +
      '<fieldset class="rp-g"><legend>' + T('Pergerakan (pilihan)', 'Movement (optional)') + '</legend><div class="rp-2">' +
      f('rpSog', T('Laju', 'Speed'), r.sog, T('biasa ', 'usual ') + Reports.speedOf(v), 'kn', 'decimal') + f('rpCog', T('Haluan', 'Course'), r.cog, T('cth 045', 'e.g. 045'), '°T', 'decimal') + '</div></fieldset>' +
      '<label class="rp-f"><span>' + T('Nota', 'Note') + '</span><input class="inp" id="rpNote" maxlength="80" value="' + esc(r.note || '') + '" placeholder="' + T('cth kapten via radio', 'e.g. captain on the radio') + '"></label>' +
      '<div class="rp-say" id="rpSay" aria-live="polite">' + repSay() + '</div>' +
      '<div class="rp-b"><button type="button" class="btn sm" id="rpCancel2">' + T('Batal', 'Cancel') + '</button><button type="button" class="btn sm pri" id="rpSave">' + T('Simpan laporan', 'Save report') + '</button></div></aside>';
  }
  /* what the form will save, in words */
  function repSay() {
    var r = Vessels.rep, P = Vessels.platform(), v = Vessels.cfg.list.filter(function (x) { return x.id === r.id; })[0];
    if (r.err) return '<span class="bad">' + esc(r.err) + '</span>';
    if (!r.pos) return '<span class="muted">' + T('Isi bearing + jarak, atau lat / lon, atau ketik di Carta.', 'Fill in bearing + distance, or lat / lon, or tap the chart.') + '</span>';
    var a = Geo.inv(P, r.pos), sog = num(parseFloat(r.sog)), cog = num(parseFloat(r.cog)), kn = sog !== null && sog > 0 ? sog : Reports.speedOf(v);
    var e = Geo.eta(r.pos, P, kn, cog), ty = typeOf(v && v.type);
    return '<b>' + a.nm.toFixed(1) + ' nm</b> ' + T('dari ', 'from ') + esc(P.name) + T(' pada ', ' on ') + '<b>' + brg3(a.brg) + '</b><br>' +
      Geo.dm(r.pos.lat, 'lat') + ' ' + Geo.dm(r.pos.lon, 'lon') + '<br>' +
      (e.here ? T('Di platform.', 'At the platform.') : 'ETA <b>' + dur(e.hours) + '</b> ' + T('pada ', 'at ') + kn + ' kn ' +
        (sog !== null && sog > 0 ? T('(laju dilapor)', '(reported speed)') : T('(laju biasa ', '(usual speed for ') + esc(EN() ? ty[3] : ty[2]) + ')') +
        (e.toward === false ? '<br><span class="warn">' + T('Haluan ', 'Course ') + brg3(cog) + T(' tidak menghala ke platform (platform pada ', ' is not toward the platform (platform on ') + brg3(e.brgTo) + ').</span>' : ''));
  }
  function repRead() {
    var r = Vessels.rep, g = function (id) { var el = $(id); return el ? el.value : ''; };
    r.id = g('rpVes') || r.id; r.when = g('rpWhen'); r.brg = g('rpBrg'); r.nm = g('rpNm'); r.lat = g('rpLat'); r.lon = g('rpLon'); r.sog = g('rpSog'); r.cog = g('rpCog'); r.note = g('rpNote');
  }
  /* keep the two ways of giving the position in step */
  function repSync(from) {
    var r = Vessels.rep, P = Vessels.platform();
    repRead(); r.err = '';
    if (from === 'brg') {
      var b = num(parseFloat(r.brg)), d = num(parseFloat(r.nm));
      if (b !== null && d !== null && b >= 0 && b <= 360 && d >= 0 && d <= 300) {
        r.pos = Geo.dest(P, b % 360, d); r.lat = Geo.dm(r.pos.lat, 'lat'); r.lon = Geo.dm(r.pos.lon, 'lon');
        if ($('rpLat')) { $('rpLat').value = r.lat; $('rpLon').value = r.lon; }
      } else r.pos = null;
    } else if (from === 'll' || from === 'tap') {
      var la = Geo.parse(r.lat, 'lat'), lo = Geo.parse(r.lon, 'lon');
      if (la !== null && lo !== null) {
        r.pos = { lat: la, lon: lo };
        var a = Geo.inv(P, r.pos);
        r.brg = String(Math.round(a.brg) % 360).padStart(3, '0'); r.nm = a.nm.toFixed(1);
        if ($('rpBrg')) { $('rpBrg').value = r.brg; $('rpNm').value = r.nm; }
      } else r.pos = null;
    }
    if ($('rpSay')) $('rpSay').innerHTML = repSay();
    var box = $('vsMap'); if (box && box.querySelector('svg.ck')) Chart.draw(box);
  }
  function repOpen(id) {
    var c = Vessels.cfg, v = c.list.filter(function (x) { return x.id === id; })[0] || Vessels.sel() || c.list[0];
    if (!v) return;
    Vessels.rep = { id: v.id, when: repDefaultWhen(), brg: '', nm: '', lat: '', lon: '', sog: '', cog: '', note: '', pos: null, err: '' };
    Vessels.render();
  }
  function repSave() {
    var r = Vessels.rep, now = Date.now();
    repRead(); r.err = '';
    var t = repWhen(r.when), sog = r.sog === '' ? null : num(parseFloat(r.sog)), cog = r.cog === '' ? null : num(parseFloat(r.cog));
    if (!r.pos) r.err = T('Isi kedudukan dahulu.', 'Fill in the position first.');
    else if (t === null) r.err = T('Masa laporan tidak sah.', 'The report time is not valid.');
    else if (t > now + 10 * 60000) r.err = T('Masa laporan belum tiba.', 'The report time is in the future.');
    else if (t < now - KEEP_T) r.err = T('Laporan lebih 3 hari tidak disimpan.', 'Reports older than 3 days are not kept.');
    else if (r.sog !== '' && (sog === null || sog < 0 || sog > 40)) r.err = T('Laju 0 hingga 40 kn.', 'Speed 0 to 40 kn.');
    else if (r.cog !== '' && (cog === null || cog < 0 || cog > 360)) r.err = T('Haluan 0 hingga 360°.', 'Course 0 to 360°.');
    if (r.err) { if ($('rpSay')) $('rpSay').innerHTML = repSay(); return; }
    Reports.add(r.id, { t: t, lat: +r.pos.lat.toFixed(5), lon: +r.pos.lon.toFixed(5), sog: sog, cog: cog === null ? null : cog % 360, note: String(r.note || '').trim().slice(0, 80) });
    var v = Vessels.cfg.list.filter(function (x) { return x.id === r.id; })[0];
    Vessels.rep = null; Vessels.cfg.sel = r.id; Vessels.cfg.vsrc = 'chart'; Vessels.save(); Vessels.render();
    MC.toast(T('Kedudukan disimpan ✓', 'Position saved ✓'), v ? v.name : '');
  }

  /* AIS through the user's relay (relay v5 + aisstream.io): silent - shown only when something is heard.
     aisstream has no shore receiver on the east coast today, so this is usually empty; a receiver added later shows up here by itself. */
  var Ais = {
    list: [], at: 0, busy: false, WAIT: 15, EVERY: 2 * 60000,
    url: function () {
      var s = settings(), P = Vessels.platform();
      if (!C.relayReady(s) || !isFinite(P.lat) || !isFinite(P.lon)) return '';
      return s.relayUrl + '/' + s.relayKey + '/ais?box=' + [P.lat - 0.75, P.lon - 0.75, P.lat + 0.75, P.lon + 0.75].map(function (x) { return x.toFixed(3); }).join(',') + '&wait=' + this.WAIT;
    },
    /* aisstream time "2026-11-23 23:59:29.92 +0000 UTC" -> ms */
    time: function (t) { var m = String(t || '').match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)/); return m ? Date.parse(m[1] + 'T' + m[2] + 'Z') : null; },
    load: function (redraw) {
      var u = this.url(), self0 = this, now = Date.now();
      if (!u || this.busy || now - this.at < this.EVERY || typeof fetch !== 'function') return;
      this.busy = true; this.at = now;
      fetch(u, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        self0.busy = false;
        self0.list = j && j.ok && Array.isArray(j.vessels) ? j.vessels.filter(function (v) { return isFinite(v.lat) && isFinite(v.lon); }).map(function (v) {
          return { mmsi: String(v.mmsi || ''), name: String(v.name || '').trim(), lat: +v.lat, lon: +v.lon, sog: num(v.sog), cog: num(v.cog), hdg: num(v.hdg), t: self0.time(v.at) || now };
        }) : [];
        if (self0.list.length && redraw) redraw();
      }, function () { self0.busy = false; self0.list = []; });
    }
  };
  /* the vessels on the chart: track, reported point, estimate now, label with distance / ETA */
  function chartVessels(X, Y, u, fs, now) {
    var o = '', lab = '', c = Vessels.cfg, P = Vessels.platform();
    c.list.forEach(function (v) {
      var n = Reports.now(v, now);
      if (!n) return;
      var sel = c.sel === v.id, l = Reports.list(v.id).slice().reverse(), cls = 'ck-vs t-' + (VSHAPE[v.type] ? v.type : 'other') + (n.old ? ' old' : '') + (sel ? ' sel' : '');
      o += '<g class="' + cls + '">';
      if (l.length > 1) o += '<polyline class="ck-trk" points="' + l.map(function (r) { return X(r.lon).toFixed(2) + ',' + Y(r.lat).toFixed(2); }).join(' ') + '" stroke-width="' + fs(1.4) + '" stroke-dasharray="' + fs(1) + ' ' + fs(4) + '"/>' +
        l.slice(0, -1).map(function (r) { return '<circle class="ck-tp" cx="' + X(r.lon).toFixed(2) + '" cy="' + Y(r.lat).toFixed(2) + '" r="' + fs(2.4) + '"/>'; }).join('');
      var rx = X(n.rep.lon), ry = Y(n.rep.lat), x = X(n.pos.lon), y = Y(n.pos.lat);
      if (n.est) o += '<line class="ck-dr" x1="' + rx.toFixed(2) + '" y1="' + ry.toFixed(2) + '" x2="' + x.toFixed(2) + '" y2="' + y.toFixed(2) + '" stroke-width="' + fs(1.6) + '" stroke-dasharray="' + fs(5) + ' ' + fs(4) + '"/>' +
        '<circle class="ck-rp" cx="' + rx.toFixed(2) + '" cy="' + ry.toFixed(2) + '" r="' + fs(4) + '" stroke-width="' + fs(1.5) + '"/>';
      if (sel && !n.eta.here) o += '<line class="ck-to" x1="' + x.toFixed(2) + '" y1="' + y.toFixed(2) + '" x2="0" y2="0" stroke-width="' + fs(1.2) + '" stroke-dasharray="' + fs(8) + ' ' + fs(5) + '"/>';
      if (sel) o += '<circle class="ck-sel" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + fs(14) + '" stroke-width="' + fs(1.5) + '"/>';
      /* top-down hull pointing along the course; a dot when the course is not known */
      var hull = num(n.rep.cog) !== null ? '<path class="ck-hull' + (n.est ? ' est' : '') + '" transform="translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') rotate(' + n.rep.cog + ') scale(' + (u * 1.45).toFixed(4) + ')" d="M0 -12C3.5 -8 5.5 -4 5.5 1V10H-5.5V1C-5.5 -4 -3.5 -8 0 -12Z" stroke-width="1.4"/>'
        : '<circle class="ck-hull" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + fs(7) + '" stroke-width="' + fs(1.6) + '"/>';
      o += hull + '</g>';
      lab += '<g class="ck-vl ' + cls + '"><text x="' + (x + 16 * u).toFixed(2) + '" y="' + (y - 2 * u).toFixed(2) + '" font-size="' + fs(12.5) + '" class="n">' + esc(v.name) + '</text>' +
        '<text x="' + (x + 16 * u).toFixed(2) + '" y="' + (y + 12 * u).toFixed(2) + '" font-size="' + fs(11) + '">' + esc(Reports.line(v, now)) + (n.est ? T(' · anggaran', ' · estimated') : '') + '</text></g>';
    });
    /* vessels heard on AIS (when any): mine by name, others small */
    var mine = {};
    c.list.forEach(function (v) { if (v.mmsi) mine[v.mmsi] = v; });
    Ais.list.forEach(function (a) {
      var x = X(a.lon), y = Y(a.lat), v = mine[a.mmsi], dir = a.hdg !== null && a.hdg < 360 ? a.hdg : a.cog;
      o += '<g class="ck-ais' + (v ? ' mine t-' + (VSHAPE[v.type] ? v.type : 'other') : '') + '">' + (dir !== null ? '<path transform="translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') rotate(' + dir + ') scale(' + (u * (v ? 1.3 : 0.9)).toFixed(4) + ')" d="M0 -9L6 7L0 4L-6 7Z" stroke-width="1.2"/>'
        : '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + fs(v ? 5 : 3.5) + '" stroke-width="' + fs(1.2) + '"/>') + '</g>';
      if (v || Chart.span <= 30) lab += '<g class="ck-vl ck-ail' + (v ? ' mine' : '') + '"><text x="' + (x + 9 * u).toFixed(2) + '" y="' + (y + 4 * u).toFixed(2) + '" font-size="' + fs(v ? 11.5 : 10) + '">' +
        esc((v ? v.name : a.name || a.mmsi) + ' · AIS ' + hh(a.t) + (a.sog !== null ? ' · ' + r1(a.sog) + ' kn' : '')) + '</text></g>';
    });
    /* the position being typed in the report form */
    var r = Vessels.rep;
    if (r && r.pos) {
      var px = X(r.pos.lon), py = Y(r.pos.lat);
      o += '<g class="ck-new"><line x1="0" y1="0" x2="' + px.toFixed(2) + '" y2="' + py.toFixed(2) + '" stroke-width="' + fs(1.4) + '" stroke-dasharray="' + fs(4) + ' ' + fs(4) + '"/>' +
        '<circle cx="' + px.toFixed(2) + '" cy="' + py.toFixed(2) + '" r="' + fs(10) + '" stroke-width="' + fs(2) + '"/><path d="M' + (px - 16 * u).toFixed(2) + ' ' + py.toFixed(2) + 'h' + fs(32) + 'M' + px.toFixed(2) + ' ' + (py - 16 * u).toFixed(2) + 'v' + fs(32) + '" stroke-width="' + fs(1.4) + '"/></g>';
    }
    return { o: o, lab: lab };
  }
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if (!t.closest || !t.closest('#vesselsHost')) return;
    if (t.closest('#vsRep')) { repOpen(Vessels.sel() ? Vessels.sel().id : ''); return; }
    if ((b = t.closest('[data-rp-new]'))) { repOpen(b.getAttribute('data-rp-new')); return; }
    if (t.closest('#rpCancel') || t.closest('#rpCancel2')) { Vessels.rep = null; Vessels.render(); return; }
    if (t.closest('#rpSave')) { repSave(); return; }
    if ((b = t.closest('[data-rp-del]'))) { var sv = Vessels.sel(); if (sv) { Reports.del(sv.id, +b.getAttribute('data-rp-del')); Vessels.render(); } return; }
    if ((b = t.closest('[data-vs]'))) { Vessels.cfg.sel = b.getAttribute('data-vs'); Vessels.save(); Vessels.render(); return; }
    if ((b = t.closest('[data-vs-src]'))) { Vessels.cfg[Vessels.sel() ? 'vsrc' : 'src'] = b.getAttribute('data-vs-src'); Vessels.save(); Vessels.render(); return; }
    if ((b = t.closest('[data-vs-open]'))) { MC.openExternal(Vessels.fullUrl(Vessels.sel(), b.getAttribute('data-vs-open'))); return; }
    if (t.closest('#vsCenter')) { var mb = $('vsMap'); if (mb) mb.removeAttribute('data-url'); Vessels.render(); return; }
    if (t.closest('#vsFull')) { MC.openExternal(Vessels.fullUrl(Vessels.sel(), Vessels.cfg.src === 'mt' ? 'mt' : 'vf')); return; }
    if (t.closest('#vsEdit')) { Vessels.editing = Vessels.cfg.list.map(function (x) { return Object.assign({}, x); }); if (!Vessels.editing.length) Vessels.editing.push({ type: 'crew' }); Vessels.render(); return; }
    if (t.closest('#vsAdd')) { readEditor(); if (Vessels.editing.length >= 20) return MC.toast(T('Maksimum 20 kapal', 'At most 20 vessels'), '', 'warning'); Vessels.editing.push({ type: 'crew' }); Vessels.render(); return; }
    if ((b = t.closest('[data-vs-del]'))) { readEditor(); Vessels.editing.splice(+b.getAttribute('data-vs-del'), 1); Vessels.render(); return; }
    if (t.closest('#vsCancel')) { Vessels.editing = null; Vessels.render(); return; }
    if (t.closest('#vsSave')) {
      readEditor();
      var list = Vessels.editing.filter(function (x) { return String(x.name || '').trim() || x.mmsi || x.imo; });
      if (!Vessels.check(list)) { Vessels.editing = list.length ? list : [{ type: 'crew' }]; Vessels.render(); MC.toast(T('Semak baris bertanda', 'Check the marked rows'), '', 'warning'); return; }
      Vessels.cfg.list = list.map(function (x, i) { return { id: 'v' + (x.mmsi || x.imo), name: x.name, mmsi: x.mmsi, imo: x.imo, call: x.call || '', type: x.type || 'other', kn: x.kn ? +x.kn : '', role: x.role, job: x.job || '' }; });
      Vessels.cfg.platform = String(($('vsPlatform') || {}).value || '').trim().slice(0, 40);
      if (!Vessels.cfg.list.some(function (x) { return x.id === Vessels.cfg.sel; })) Vessels.cfg.sel = Vessels.cfg.list[0] ? Vessels.cfg.list[0].id : 'area';
      Vessels.save(); Vessels.editing = null; Vessels.render(); MC.toast(T('Kapal disimpan ✓', 'Vessels saved ✓'), Vessels.cfg.list.length + ''); return;
    }
  });
  document.addEventListener('input', function (e) {
    var id = e.target.id;
    if (!Vessels.rep) return;
    if (id === 'rpBrg' || id === 'rpNm') repSync('brg');
    else if (id === 'rpLat' || id === 'rpLon') repSync('ll');
    else if (id === 'rpSog' || id === 'rpCog') { repRead(); Vessels.rep.err = ''; if ($('rpSay')) $('rpSay').innerHTML = repSay(); var bx = $('vsMap'); if (bx) Chart.draw(bx); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'rpVes' && Vessels.rep) { repRead(); var vv = Vessels.cfg.list.filter(function (x) { return x.id === Vessels.rep.id; })[0]; if ($('rpSog')) $('rpSog').placeholder = T('biasa ', 'usual ') + Reports.speedOf(vv); if ($('rpSay')) $('rpSay').innerHTML = repSay(); }
    if (e.target.id === 'vsZoom') { Vessels.cfg.zoom = +e.target.value; Vessels.save(); Vessels.render(); }
    if (e.target.id === 'vsTrack') { Vessels.cfg.track = e.target.checked; Vessels.save(); Vessels.render(); }
  });

  /* ------------------------------------------------------------------ OceanWATCH chart: our own map, drawn here (no map service)
     Coordinates in nautical miles from the platform (x east, y south): x = dLon·60·cos(lat), y = -dLat·60. Pan by dragging,
     zoom with the buttons or the wheel; labels are drawn again at each zoom so they keep their size. */
  var PLACES = [['Kuala Terengganu', 5.33, 103.14, 'town'], ['Marang', 5.21, 103.21, 'town'], ['Dungun', 4.78, 103.42, 'town'], ['Paka', 4.64, 103.44, 'town'],
    ['Kerteh', 4.51, 103.45, 'town'], ['Kemaman (Chukai)', 4.23, 103.42, 'town'], ['Kuantan', 3.81, 103.33, 'town'], ['Pulau Redang', 5.78, 103.01, 'isle'],
    ['Pulau Kapas', 5.22, 103.27, 'isle'], ['Pulau Tenggol', 4.80, 103.68, 'isle'], ['Pulau Tioman', 2.80, 104.16, 'isle']];
  var PORT = { name: T('Pelabuhan Kemaman', 'Kemaman port'), lat: 4.262, lon: 103.468 };
  function nmBetween(a, b) {
    var R = 3440.065, la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180, dl = (b.lon - a.lon) * Math.PI / 180, dla = la2 - la1;
    var h = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    var brg = (Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl)) * 180 / Math.PI + 360) % 360;
    return { nm: 2 * R * Math.asin(Math.sqrt(h)), brg: brg };
  }
  var Chart = {
    span: MC.load('mc_chart_span', 50), cx: 0, cy: 0,
    draw: function (box) {
      if (!box) return;
      var P = Vessels.platform(), k = Math.cos(P.lat * Math.PI / 180);
      var X = function (lon) { return (lon - P.lon) * 60 * k; }, Y = function (lat) { return -(lat - P.lat) * 60; };
      var W = box.clientWidth || 900, H = box.clientHeight || 560, ar = H / W, span = this.span, vw = span * 2, vh = vw * ar;
      var x0 = this.cx - span, y0 = this.cy - vh / 2, u = vw / W;        /* u = nautical miles per screen pixel */
      var fs = function (px) { return (px * u).toFixed(3); };
      var o = '<defs><radialGradient id="ckSea" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#0c3150"/><stop offset="1" stop-color="#061a2e"/></radialGradient></defs>';
      o += '<rect x="' + (x0 - vw) + '" y="' + (y0 - vh) + '" width="' + vw * 3 + '" height="' + vh * 3 + '" fill="url(#ckSea)"/>';
      /* graticule every 15' (every 5' when close) with chart-style labels on the left and top edges */
      var step = span > 35 ? 0.25 : span > 12 ? 1 / 12 : 1 / 60 * 2, lab = '';
      var latA = P.lat - (y0 + vh) / 60 - step, latB = P.lat - y0 / 60 + step, lonA = P.lon + x0 / 60 / k - step, lonB = P.lon + (x0 + vw) / 60 / k + step;
      var dm = function (d, pos, neg) { var a = Math.abs(d), deg = Math.floor(a + 1e-9), min = Math.round((a - deg) * 60); if (min === 60) { deg++; min = 0; } return deg + '°' + (min < 10 ? '0' : '') + min + '′' + (d >= 0 ? pos : neg); };
      for (var la = Math.ceil(latA / step) * step; la <= latB; la += step) {
        o += '<line class="ck-g" x1="' + (x0 - vw) + '" x2="' + (x0 + 2 * vw) + '" y1="' + Y(la).toFixed(2) + '" y2="' + Y(la).toFixed(2) + '" stroke-width="' + fs(1) + '"/>';
        if (Y(la) - y0 > 30 * u && y0 + vh - Y(la) > 30 * u) lab += '<text class="ck-gl" x="' + (x0 + 6 * u).toFixed(2) + '" y="' + (Y(la) - 4 * u).toFixed(2) + '" font-size="' + fs(10.5) + '">' + dm(la, 'N', 'S') + '</text>';
      }
      for (var lo = Math.ceil(lonA / step) * step; lo <= lonB; lo += step) {
        o += '<line class="ck-g" y1="' + (y0 - vh) + '" y2="' + (y0 + 2 * vh) + '" x1="' + X(lo).toFixed(2) + '" x2="' + X(lo).toFixed(2) + '" stroke-width="' + fs(1) + '"/>';
        if (X(lo) - x0 > 70 * u && x0 + vw - X(lo) > 90 * u) lab += '<text class="ck-gl" x="' + (X(lo) + 4 * u).toFixed(2) + '" y="' + (y0 + 14 * u).toFixed(2) + '" font-size="' + fs(10.5) + '">' + dm(lo, 'E', 'W') + '</text>';
      }
      /* land */
      (self.MC_COAST || []).forEach(function (r) {
        o += '<path class="ck-land" stroke-width="' + fs(1.2) + '" d="' + r.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(2) + ' ' + Y(p[1]).toFixed(2); }).join('') + 'Z"/>';
      });
      /* range rings */
      [5, 10, 20, 40].forEach(function (nm) {
        o += '<circle class="ck-ring" cx="0" cy="0" r="' + nm + '" stroke-width="' + fs(1.2) + '" stroke-dasharray="' + fs(6) + ' ' + fs(5) + '"/>' +
          '<text class="ck-rl" x="' + (nm * 0.7071 + 3 * u).toFixed(2) + '" y="' + (-nm * 0.7071 - 3 * u).toFixed(2) + '" font-size="' + fs(11) + '">' + nm + ' nm</text>';
      });
      /* the route from Kemaman port */
      var rt = nmBetween(PORT, P), px = X(PORT.lon), py = Y(PORT.lat);
      o += '<line class="ck-route" x1="' + px.toFixed(2) + '" y1="' + py.toFixed(2) + '" x2="0" y2="0" stroke-width="' + fs(1.6) + '" stroke-dasharray="' + fs(2) + ' ' + fs(6) + '"/>' +
        '<circle class="ck-port" cx="' + px.toFixed(2) + '" cy="' + py.toFixed(2) + '" r="' + fs(4.5) + '" stroke-width="' + fs(1.5) + '"/>';
      var mx = px / 2, my = py / 2, ang = Math.atan2(-py, -px) * 180 / Math.PI;
      if (ang > 90 || ang < -90) ang += 180;
      o += '<text class="ck-rt" text-anchor="middle" transform="translate(' + mx.toFixed(2) + ' ' + (my - 6 * u).toFixed(2) + ') rotate(' + ang.toFixed(1) + ')" font-size="' + fs(11.5) + '">' +
        Math.round(rt.nm) + ' nm · ' + Math.round(rt.brg) + '°T</text>';
      /* places */
      PLACES.concat([[PORT.name, PORT.lat, PORT.lon, 'port']]).forEach(function (pl) {
        var x = X(pl[2]), y = Y(pl[1]);
        o += (pl[3] === 'town' ? '<circle class="ck-town" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + fs(2.6) + '"/>' : '') +
          '<text class="ck-pl ' + pl[3] + '" x="' + (x + (pl[3] === 'town' ? -6 : 7) * u).toFixed(2) + '" y="' + (y + 4 * u).toFixed(2) + '" text-anchor="' + (pl[3] === 'town' ? 'end' : 'start') + '" font-size="' + fs(pl[3] === 'isle' ? 10.5 : 11.5) + '">' + esc(pl[0]) + '</text>';
      });
      /* wind and swell now, as arrows through the platform */
      var rep = MC.Off.report(), n0 = rep && rep.hours.filter(function (x) { return x.t >= Date.now() - HOUR; })[0];
      var flow = function (dir, cls, len, lbl) {
        if (!n0 || num(dir) === null) return '';
        /* from the edge of the platform mark, out the way the wind / swell goes */
        var a = (dir + 180) * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), r0 = 24 * u, L0 = len * u;
        var x1 = dx * r0, y1 = dy * r0, x2 = dx * (r0 + L0), y2 = dy * (r0 + L0), ah = 9 * u;
        return '<g class="ck-flow ' + cls + '"><line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '" stroke-width="' + fs(3) + '"/>' +
          '<path d="M' + (x2 + dx * ah).toFixed(2) + ' ' + (y2 + dy * ah).toFixed(2) + 'L' + (x2 - dy * ah * 0.7).toFixed(2) + ' ' + (y2 + dx * ah * 0.7).toFixed(2) + 'L' + (x2 + dy * ah * 0.7).toFixed(2) + ' ' + (y2 - dx * ah * 0.7).toFixed(2) + 'Z"/>' +
          '<text x="' + (x2 + dx * 16 * u).toFixed(2) + '" y="' + (y2 + dy * 16 * u + 4 * u).toFixed(2) + '" text-anchor="middle" font-size="' + fs(11) + '">' + lbl + '</text></g>';
      };
      if (n0) o += flow(n0.wd, 'swell', 95, T('alun ', 'swell ') + r1(n0.wh) + ' m') + flow(n0.dir, 'wind', 70, r0(n0.w10.m) + ' kt');
      var vl = chartVessels(X, Y, u, fs, Date.now()), self1 = this;
      Ais.load(function () { var bx = $('vsMap'); if (bx && bx.querySelector('svg.ck') && !Vessels.editing) self1.draw(bx); });
      /* the platform */
      var ic = 34 * u;
      o += '<g class="ck-pf"><circle cx="0" cy="0" r="' + fs(17) + '" class="ck-halo"/><svg x="' + (-ic / 2).toFixed(2) + '" y="' + (-ic * 0.82).toFixed(2) + '" width="' + ic.toFixed(2) + '" height="' + ic.toFixed(2) + '" viewBox="0 0 40 40" class="ic ic-rig">' +
        rigIcon('').replace(/^<svg[^>]*>|<\/svg>$/g, '') + '</svg>' +
        '<text class="ck-pfl" x="0" y="' + (ic * 0.45).toFixed(2) + '" text-anchor="middle" font-size="' + fs(12.5) + '">' + esc(P.name) + '</text></g>';
      var nmScale = [1, 2, 5, 10, 20, 50].filter(function (n) { return n / u <= 140; }).pop() || 1;
      box.innerHTML = '<svg class="ck" viewBox="' + x0.toFixed(3) + ' ' + y0.toFixed(3) + ' ' + vw.toFixed(3) + ' ' + vh.toFixed(3) + '" role="img" aria-label="' + esc(T('Carta sekitar ', 'Chart around ') + P.name) + '">' + o + vl.o + lab + vl.lab + '</svg>' +
        '<div class="ck-ui"><button type="button" class="ck-b" data-ck="in" aria-label="' + T('Zum masuk', 'Zoom in') + '">+</button><button type="button" class="ck-b" data-ck="out" aria-label="' + T('Zum keluar', 'Zoom out') + '">−</button>' +
        '<button type="button" class="ck-b" data-ck="home" aria-label="' + T('Pusatkan pada platform', 'Centre on the platform') + '">' + rigIcon('ic ic-rig xs') + '</button><button type="button" class="ck-b w" data-ck="port">' + T('Pelabuhan', 'Port') + '</button></div>' +
        '<div class="ck-rose" aria-hidden="true"><svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="27"/><path class="n" d="M30 5l5 25h-10z"/><path d="M30 55l5-25h-10z"/><path d="M5 30l25 5V25zM55 30l-25 5V25z"/><text x="30" y="16" text-anchor="middle">' + (EN() ? 'N' : 'U') + '</text></svg></div>' +
        '<div class="ck-scale"><i style="width:' + (nmScale / u).toFixed(0) + 'px"></i><span>' + nmScale + ' nm</span></div>' +
        (n0 || Ais.list.length ? '<div class="ck-key">' + (Ais.list.length ? '<span><i class="ais"></i>AIS: ' + Ais.list.length + T(' kapal didengar', ' vessels heard') + '</span>' : '') + (n0 ? '<span><i class="wind"></i>' + T('angin', 'wind') + ' ' + r0(n0.w10.m) + ' kt ' + T('dari ', 'from ') + dir16(n0.dir) + '</span><span><i class="swell"></i>' + T('alun', 'swell') + ' ' + r1(n0.wh) + ' m ' + r0(n0.wt) + ' s ' + T('dari ', 'from ') + dir16(n0.wd) + '</span>' : '') + '</div>' : '');
      this.wire(box);
    },
    wire: function (box) {
      var svg = box.querySelector('svg.ck'), self0 = this;
      if (!svg) return;
      var drag = null;
      svg.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, cx: self0.cx, cy: self0.cy, moved: false }; svg.setPointerCapture(e.pointerId); svg.classList.add('grab'); });
      svg.addEventListener('pointermove', function (e) {
        if (!drag) return;
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
        if (!drag.moved) return;
        var u = self0.span * 2 / (box.clientWidth || 900);
        self0.cx = drag.cx - (e.clientX - drag.x) * u; self0.cy = drag.cy - (e.clientY - drag.y) * u;
        var vb = svg.viewBox.baseVal, vw = vb.width, vh = vb.height;
        svg.setAttribute('viewBox', (self0.cx - vw / 2).toFixed(3) + ' ' + (self0.cy - vh / 2).toFixed(3) + ' ' + vw.toFixed(3) + ' ' + vh.toFixed(3));
      });
      var end = function (e) {
        if (!drag) return;
        var tap = !drag.moved; drag = null;
        if (tap && e && e.type === 'pointerup' && Vessels.rep) {
          var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
          var m = svg.getScreenCTM(), q = m ? pt.matrixTransform(m.inverse()) : null, P = Vessels.platform(), k = Math.cos(P.lat * Math.PI / 180);
          if (q) {
            var la = P.lat - q.y / 60, lo = P.lon + q.x / 60 / k;
            if ($('rpLat')) { $('rpLat').value = Geo.dm(la, 'lat'); $('rpLon').value = Geo.dm(lo, 'lon'); }
            repSync('tap'); return;
          }
        }
        self0.draw(box);
      };
      svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
      svg.addEventListener('wheel', function (e) { e.preventDefault(); self0.zoom(e.deltaY > 0 ? 1.25 : 0.8, box); }, { passive: false });
    },
    zoom: function (f, box) { this.span = Math.max(4, Math.min(160, this.span * f)); MC.save('mc_chart_span', this.span); this.draw(box); },
    home: function (box) { this.cx = 0; this.cy = 0; this.span = 50; MC.save('mc_chart_span', 50); this.draw(box); },
    port: function (box) {
      var P = Vessels.platform(), k = Math.cos(P.lat * Math.PI / 180), px = (PORT.lon - P.lon) * 60 * k, py = -(PORT.lat - P.lat) * 60;
      var ar = (box.clientHeight || 560) / (box.clientWidth || 900);
      this.cx = px / 2; this.cy = py / 2; this.span = Math.max(40, Math.abs(px) / 2 + 16, (Math.abs(py) / 2 + 16) / ar); this.draw(box);
    }
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-ck]'), box = $('vsMap');
    if (!b || !box) return;
    var a = b.getAttribute('data-ck');
    if (a === 'in') Chart.zoom(0.7, box); else if (a === 'out') Chart.zoom(1.4, box); else if (a === 'home') Chart.home(box); else if (a === 'port') Chart.port(box);
  });
  window.addEventListener('resize', function () { var box = $('vsMap'); if (box && box.querySelector('svg.ck')) Chart.draw(box); });
  /* the page loses focus to the map inside it = the user is moving that map: the pin may no longer be on the platform */
  window.addEventListener('blur', function () {
    setTimeout(function () {
      var a = document.activeElement, box = a && a.closest ? a.closest('#vsMap') : null;
      if (box && box.querySelector('.vs-pin')) box.classList.add('moved');
    }, 0);
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
  MC.EXT.Marine = { Weather: Weather, Vessels: Vessels, periods: periods, sentence: sentence, Geo: Geo, Reports: Reports, SPEED: SPEED, dur: dur, Ais: Ais };
  if (state.view === 'weather') Weather.render();
  if (state.view === 'vessels') Vessels.render();
})();
