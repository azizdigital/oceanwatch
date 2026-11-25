/* Dashboard Cuaca Aziz - "AI suggestion": the app's own assessment by rules (no outside AI), and a prompt to paste into an AI.
   Land:     chance of flooding per JPS station / district / the user's own places, with the reasons and how sure.
   Offshore: Go / Caution / No-Go for each outside job (boat transfer, crane, basket, ...) against limits the user can change,
             and an overall status (normal ... stay in the LQ).
   Time:     the chosen dates, in day / night shifts, 3-hour steps or whole days.
   Pure functions; the page uses them (window.MCAdvisor), the tests use them in Node.
     blocks({ from, to, res, shift, now })           -> time blocks
     landAreas(mode, settings, snap, placesText)     -> areas;  landUrls(areas) / collectLand(areas, getJson) -> raw
     assessLand({ areas, raw, snap, blocks, now })   -> result
     assessOffshore({ rep, snap, blocks, limits, now }) -> result   (rep = MCOffshore.build(...))
     prompt({ result, settings, snap, rep, target, lang, now }) -> text for ChatGPT / Claude / Gemini / Copilot */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./i18n'));
  else root.MCAdvisor = factory(root.MCI18n);
})(typeof self !== 'undefined' ? self : this, function (I18N) {
  'use strict';
  function L(s, v) {
    if (I18N) return I18N.L(s, v);
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] !== undefined ? v[k] : m; });
  }
  var HOUR = 3600000, DAY = 86400000, TZ = 8 * HOUR, DAYS = 14, FETCH_DAYS = 15;   /* 1.1.5: models fetched for 15 days so that 14 days from now are covered */
  var RISK = function () { return typeof module === 'object' && module.exports ? require('./risk') : (typeof self !== 'undefined' ? self : this).MCRisk; };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(t) { return new Date(t + TZ).toISOString().slice(0, 10); }
  function dayStart(key) { return Date.parse(key + 'T00:00:00Z') - TZ; }
  function hourOf(t) { return new Date(t + TZ).getUTCHours(); }
  function hhmm(t) { var d = new Date(t + TZ); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function shortDay(key) {
    var d = new Date(key + 'T00:00:00Z');
    return [L('Ahd'), L('Isn'), L('Sel'), L('Rab'), L('Kha'), L('Jum'), L('Sab')][d.getUTCDay()] + ' ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1);
  }
  function num(v) { return v === null || v === undefined || v === '' || !isFinite(v) ? null : +v; }
  function clean(a) { return a.filter(function (v) { return v !== null && v !== undefined && isFinite(v); }); }
  function quant(a, q) {
    a = clean(a).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return a[lo] + (a[hi] - a[lo]) * (i - lo);
  }
  function maxOf(a) { a = clean(a); return a.length ? Math.max.apply(null, a) : null; }
  function minOf(a) { a = clean(a); return a.length ? Math.min.apply(null, a) : null; }
  function r0(v) { return v === null || v === undefined ? '-' : String(Math.round(v)); }
  function r1(v) { return v === null || v === undefined ? '-' : (Math.round(v * 10) / 10).toFixed(1); }

  /* ------------------------------------------------------------ time blocks */
  /* res: 'shift' (day shift start-end + night shift), '3h', 'day'. shift: '07-19' */
  function parseShift(text) {
    var m = String(text || '').match(/^\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})\s*$/);
    var a = m ? +m[1] : 7, b = m ? +m[2] : 19;
    if (!(a >= 0 && a <= 23 && b >= 1 && b <= 24 && b > a)) { a = 7; b = 19; }
    return [a, b];
  }
  function blocks(o) {
    var now = o.now || Date.now(), today = dateKey(now), from = o.from && o.from >= today ? o.from : today;
    var last = dateKey(dayStart(today) + (DAYS - 1) * DAY), to = o.to && o.to >= from ? (o.to > last ? last : o.to) : from;
    var sh = parseShift(o.shift), out = [];
    for (var d0 = dayStart(from); dateKey(d0) <= to; d0 += DAY) {
      var key = dateKey(d0), list = [];
      if (o.res === '3h') for (var h = 0; h < 24; h += 3) list.push([d0 + h * HOUR, d0 + (h + 3) * HOUR, hhmm(d0 + h * HOUR) + '–' + hhmm(d0 + (h + 3) * HOUR)]);
      else if (o.res === 'day') list.push([d0, d0 + DAY, L('Sepanjang hari')]);
      else {
        list.push([d0 + sh[0] * HOUR, d0 + sh[1] * HOUR, L('Siang') + ' ' + pad(sh[0]) + '–' + pad(sh[1] % 24)]);
        list.push([d0 + sh[1] * HOUR, d0 + (24 + sh[0]) * HOUR, L('Malam') + ' ' + pad(sh[1] % 24) + '–' + pad(sh[0])]);
      }
      list.forEach(function (b) {
        if (b[1] <= now) return;                      /* already over */
        out.push({ t0: b[0], t1: b[1], day: key, label: b[2], lead: Math.round((dayStart(key) - dayStart(today)) / DAY) });
      });
    }
    return out;
  }

  /* --------------------------------------------------------------- land */
  var DISTRICTS_TRG = [
    { name: 'Besut', lat: 5.73, lon: 102.55, coastal: true }, { name: 'Setiu', lat: 5.52, lon: 102.74, coastal: true },
    { name: 'Kuala Nerus', lat: 5.36, lon: 103.04, coastal: true }, { name: 'Kuala Terengganu', lat: 5.31, lon: 103.13, coastal: true },
    { name: 'Hulu Terengganu', lat: 5.07, lon: 102.98, coastal: false }, { name: 'Marang', lat: 5.20, lon: 103.20, coastal: true },
    { name: 'Dungun', lat: 4.76, lon: 103.40, coastal: true }, { name: 'Kemaman', lat: 4.23, lon: 103.42, coastal: true }
  ];
  /* rain forecast models for land (one request per model, every place at once) */
  var LAND_MODELS = [
    { id: 'ecmwf_ifs025', name: 'ECMWF IFS' }, { id: 'gfs_seamless', name: 'NOAA GFS' }, { id: 'icon_seamless', name: 'DWD ICON' },
    { id: 'jma_seamless', name: 'JMA GSM' }, { id: 'ukmo_seamless', name: 'UK Met Office' }
  ];
  var LEVELS = ['Sangat rendah', 'Rendah', 'Sederhana', 'Tinggi', 'Sangat tinggi'];
  function lc(s) { return String(s || '').toLowerCase(); }
  /* "Kg. Air Putih; 4.20; 103.35; Air Putih; pantai" one place per line (station text and "pantai" are optional) */
  function parsePlaces(text) {
    return String(text || '').split(/\n+/).map(function (line) {
      var p = line.split(/[;|]/).map(function (x) { return x.trim(); });
      var lat = num(p[1]), lon = num(p[2]);
      if (!p[0] || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
      return { name: p[0].slice(0, 60), lat: lat, lon: lon, match: (p[3] || '').slice(0, 60), coastal: /pantai|coast|laut|sea|ya|yes/i.test(p[4] || '') };
    }).filter(Boolean).slice(0, 20);
  }
  function stationLevel(st) {
    if (!st) return null;
    var R = { normal: 0, alert: 1, warning: 2, danger: 3 };
    if (st.status && R[st.status] !== undefined) return R[st.status];
    var v = num(st.level);
    if (v === null) return null;
    return st.danger !== undefined && v >= st.danger ? 3 : st.warning !== undefined && v >= st.warning ? 2 : st.alert !== undefined && v >= st.alert ? 1 : 0;
  }
  function waterList(snap) { return ((snap && snap.jps && snap.jps.water && snap.jps.water.length) ? snap.jps.water : (snap && snap.stations) || []).filter(function (x) { return !x.stale; }); }
  function rainList(snap) { return (snap && snap.jps && snap.jps.rain && snap.jps.rain.stations && snap.jps.rain.stations.length) ? snap.jps.rain.stations : (snap && snap.rainStations) || []; }
  /* the rain gauge at the same place as a river gauge: "Sg. X di Kg. Y (F1)" <-> "Kg. Y (F1)" */
  function rainFor(st, rains) {
    var place = lc(String(st.name || '').split(/\s+di\s+/i).pop());
    return rains.filter(function (r) { return lc(r.name) === place || (place.length > 4 && lc(r.name).indexOf(place) >= 0); });
  }
  function landAreas(mode, s, snap, placesText) {
    s = s || {};
    var W = waterList(snap), R = rainList(snap), dist = lc(s.waterDistrict);
    if (mode === 'district') {
      var names = s.jpsState === 'TRG' || !s.jpsState ? DISTRICTS_TRG : [];
      if (!names.length) {
        var seen = {};
        W.forEach(function (x) { if (x.district && !seen[x.district]) { seen[x.district] = 1; names.push({ name: x.district, lat: s.lat, lon: s.lon, coastal: false }); } });
      }
      return names.map(function (d) {
        var k = lc(d.name);
        return { id: 'd:' + k, kind: 'district', name: d.name, lat: d.lat, lon: d.lon, coastal: d.coastal,
          stations: W.filter(function (x) { return lc(x.district) === k; }), rains: R.filter(function (x) { return lc(x.district) === k; }), river: k === dist };
      });
    }
    if (mode === 'custom') {
      return parsePlaces(placesText).map(function (p, i) {
        var m = lc(p.match);
        return { id: 'p:' + i, kind: 'place', name: p.name, lat: p.lat, lon: p.lon, coastal: p.coastal,
          stations: m ? W.filter(function (x) { return lc(x.name).indexOf(m) >= 0; }) : [], rains: m ? R.filter(function (x) { return lc(x.name).indexOf(m) >= 0; }) : [], river: false };
      });
    }
    /* stations of the profile's district */
    var list = W.filter(function (x) { return !dist || !x.district || lc(x.district) === dist; });
    if (!list.length) list = (snap && snap.stations) || [];
    var distRain = R.filter(function (x) { return !dist || lc(x.district) === dist; });
    return list.map(function (st) {
      var rr = rainFor(st, R);
      return { id: 's:' + (st.id || st.name), kind: 'station', name: st.name, lat: s.lat, lon: s.lon, coastal: false, stations: [st], rains: rr.length ? rr : distRain, rainNear: rr.length > 0, river: true };
    });
  }
  function locations(areas) {
    var out = [], idx = {};
    areas.forEach(function (a) {
      var k = (+a.lat).toFixed(3) + ',' + (+a.lon).toFixed(3);
      if (idx[k] === undefined) { idx[k] = out.length; out.push({ lat: +a.lat, lon: +a.lon }); }
      a.loc = idx[k];
    });
    return out;
  }
  function landUrls(areas) {
    var locs = locations(areas);
    if (!locs.length) return [];
    var q = 'latitude=' + locs.map(function (l) { return l.lat.toFixed(3); }).join(',') + '&longitude=' + locs.map(function (l) { return l.lon.toFixed(3); }).join(',') +
      '&hourly=precipitation&timezone=Asia%2FKuala_Lumpur&forecast_days=' + FETCH_DAYS;
    return LAND_MODELS.map(function (m) { return { id: m.id, url: 'https://api.open-meteo.com/v1/forecast?' + q + '&models=' + m.id }; });
  }
  function collectLand(areas, getJson) {
    var raw = { v: 1, at: Date.now(), key: locations(areas).map(function (l) { return l.lat.toFixed(3) + ',' + l.lon.toFixed(3); }).join(';'), models: {} };
    return Promise.all(landUrls(areas).map(function (x) {
      return Promise.resolve().then(function () { return getJson(x.url); }).then(function (j) {
        var list = Array.isArray(j) ? j : [j];
        if (!list.length || !list[0] || !list[0].hourly) throw new Error('no data');
        raw.models[x.id] = { ok: true, data: list.map(function (o) {
          var h = o.hourly || {}, a = h.precipitation || h['precipitation_' + x.id] || [], off = o.utc_offset_seconds === undefined ? 28800 : o.utc_offset_seconds;
          return { t0: Date.parse(h.time[0] + ':00Z') - off * 1000, p: a.map(function (v) { return v === null ? null : Math.round(v * 10) / 10; }) };
        }) };
      }, function (e) { raw.models[x.id] = { ok: false, error: String((e && e.message) || e).slice(0, 120) }; });
    })).then(function () { return raw; });
  }
  function rainPts(mm, hours) {
    if (mm === null) return 0;
    var T = hours >= 18 ? [30, 60, 100, 150] : hours > 6 ? [25, 50, 80, 120] : [15, 30, 50, 70];
    return mm >= T[3] ? 4 : mm >= T[2] ? 3 : mm >= T[1] ? 2 : mm >= T[0] ? 1 : 0;
  }
  function sumModel(d, t0, t1) {
    if (!d) return null;
    var s = 0, n = 0;
    for (var i = 0; i < d.p.length; i++) {
      var t = d.t0 + i * HOUR;
      if (t >= t0 && t < t1 && d.p[i] !== null) { s += d.p[i]; n++; }
    }
    return n ? s : null;
  }
  function metActive(snap, t0, t1, area, rainOnly) {
    var w = ((snap && snap.met) || {}).warnings || [];
    return w.filter(function (x) {
      var hay = lc([x.title_bm, x.title_en, x.heading_bm, x.heading_en, x.text_bm, x.text_en].join(' '));
      var title = lc([x.title_bm, x.title_en].join(' '));
      /* for floods on land: rain warnings and thunderstorms, not the sea warnings (strong winds & rough seas) */
      if (rainOnly && (/laut|sea|angin kencang|strong wind|ombak|wave/.test(title) || !/hujan|rain|banjir|flood|ribut petir|thunderstorm/.test(hay))) return false;
      if (area && area.kind !== 'station' && hay.indexOf(lc(area.name)) < 0 && hay.indexOf('terengganu') < 0) return false;
      var a = x.from || 0, b = x.to || (x.issued ? x.issued + DAY : Infinity);
      return a < t1 && b > t0;
    });
  }
  /* a thunderstorm warning on land: short heavy showers, counted as 'info'; rain / flood warnings at their own level */
  function metForLand(w) {
    var hay = lc([w.title_bm, w.title_en, w.heading_bm, w.heading_en].join(' '));
    var rain = /hujan|rain|banjir|flood/.test(hay);
    return { severity: rain ? w.severity : 'info', title: metTitle(w) };
  }
  function sevPts(w) { return w.severity === 'critical' ? 3 : w.severity === 'warning' ? 2 : 1; }
  function metTitle(w) { return (I18N && I18N.lang() === 'en' ? w.title_en || w.title_bm : w.title_bm || w.title_en) || 'MET'; }
  function riverRatio(snap, key) {
    var r = snap && snap.river;
    if (!r || !r.days) return null;
    var past = r.days.filter(function (d) { return d.past; }).map(function (d) { return d.q; });
    var base = past.length ? past.reduce(function (a, b) { return a + b; }, 0) / past.length : null;
    var d = r.days.filter(function (x) { return x.date === key; })[0];
    return d && base > 0 ? d.q / base : null;
  }
  function springTide(snap, t0, t1) {
    var ev = (snap && snap.tide && snap.tide.events && snap.tide.events.length ? snap.tide.events : (snap && snap.marine && snap.marine.tidesAll) || []).filter(function (e) { return e.type === 'high' && e.sea !== null; });
    if (ev.length < 4) return null;
    var top = maxOf(ev.map(function (e) { return e.sea; }));
    var hit = ev.filter(function (e) { return e.t >= t0 && e.t < t1 && e.sea >= top - 0.15; })[0];
    return hit || null;
  }
  function confLabel(level) { return ['-', L('Rendah'), L('Sederhana'), L('Tinggi')][level || 0]; }
  /* coast: sea level (model) and waves near the coast, from the land profile's marine point */
  function coastFor(snap, t0, t1) {
    var M = (snap && snap.marine && snap.marine.hourly) || [], H = M.filter(function (h) { return h.t >= t0 && h.t < t1; });
    var seaTop = maxOf(M.map(function (h) { return h.sea; })), sea = maxOf(H.map(function (h) { return h.sea; }));
    var top = H.reduce(function (a, b) { return b.wave !== null && (!a || b.wave > a.wave) ? b : a; }, null);
    var ev = (snap && snap.tide && snap.tide.events && snap.tide.events.length ? snap.tide.events : (snap && snap.marine && snap.marine.tidesAll) || []).filter(function (e) { return e.type === 'high' && e.sea !== null; });
    var tideTop = ev.length >= 4 ? maxOf(ev.map(function (e) { return e.sea; })) : null;
    var tide = ev.filter(function (e) { return e.t >= t0 && e.t < t1; }).reduce(function (a, b) { return !a || b.sea > a.sea ? b : a; }, null);
    return { tide: tideTop === null ? null : tide, top: tideTop, sea: sea, seaTop: seaTop, wave: top ? top.wave : null, waveDir: top ? top.waveDir : null };
  }
  /* Flood Risk Score per area and time block: Weather (rain models + MET), River (JPS level & trend, GloFAS), Coastal (tide, waves) */
  function assessLand(o) {
    var areas = o.areas || [], raw = o.raw || { models: {} }, snap = o.snap || {}, now = o.now || Date.now(), B = o.blocks || [];
    var R = RISK(), trends = o.trends || snap.trends || {};
    var ids = LAND_MODELS.map(function (m) { return m.id; }).filter(function (id) { return raw.models[id] && raw.models[id].ok; });
    locations(areas);   /* each area's place in the answers */
    var items = areas.map(function (a) { return { id: a.id, name: a.name, kind: a.kind }; });
    var cells = B.map(function (b) {
      var hours = (b.t1 - b.t0) / HOUR, leadH = Math.max(0, (b.t0 - now) / HOUR), coast = coastFor(snap, b.t0, b.t1);
      return areas.map(function (a) {
        /* rain per model in this block, and from now until it starts */
        var per = ids.map(function (id) { return sumModel(raw.models[id].data[a.loc], b.t0, b.t1); }).filter(function (v) { return v !== null; });
        var before = quant(ids.map(function (id) { return sumModel(raw.models[id].data[a.loc], now, b.t0); }), 0.5) || 0;
        var rm = quant(per, 0.5), rlo = minOf(per), rhi = maxOf(per);
        var obs = maxOf(a.rains.map(function (r) { var d = r.daily || []; return (d[d.length - 1] || 0) + (d[d.length - 2] || 0) + (r.today || 0); }));
        var met = metActive(snap, b.t0, b.t1, a, true).map(metForLand);
        var wo = { rain: rm, hours: hours, wet: (obs || 0) + before, met: met, range: per.length > 1 ? r0(rlo) + '–' + r0(rhi) + ' mm' : '' };
        var river = R.riverPart({ stations: a.stations, trends: trends, leadH: leadH, glofas: a.river ? riverRatio(snap, b.day) : null });
        var coastal = R.coastalPart(Object.assign({ coastal: a.coastal }, coast));
        var weather = R.weatherPart(wo);
        var sc = R.landScore(weather, river, coastal);
        /* the same with each model's rain: the share that gives High or more, and how far apart they are */
        var lv = per.map(function (v) { return R.landScore(R.weatherPart(Object.assign({}, wo, { rain: v, range: '' })), river, coastal).level; });
        var prob = lv.length ? lv.filter(function (x) { return x >= 3; }).length / lv.length : null;
        var spread = lv.length ? maxOf(lv) - minOf(lv) : null;
        var conf = spread === null ? 1 : spread === 0 ? 3 : spread === 1 ? 2 : 1;
        if (b.lead >= 7) conf = Math.min(conf, 2);
        if (b.lead >= 10) conf = 1;
        if (!a.stations.length && !a.rains.length) conf = Math.min(conf, 2);
        var why = [];
        sc.parts.slice().sort(function (x, y) { return y.score - x.score; }).forEach(function (p) {
          p.why.slice(0, p.score >= 25 ? 3 : 1).forEach(function (w) { why.push(p.name + ': ' + w); });
        });
        if (sc.boost) why.unshift(L('Sungai sudah tinggi dan hujan / air pasang juga tinggi: dinaikkan satu tahap.'));
        return { level: sc.level, label: sc.label, score: sc.score, parts: sc.parts, boost: sc.boost, prob: prob, n: lv.length, conf: conf, confLabel: confLabel(conf), why: why, rain: rm, rainLo: rlo, rainHi: rhi };
      });
    });
    var early = R.earlyFlood([].concat.apply([], areas.map(function (a) { return a.stations; })).filter(function (x, i, all) { return all.indexOf(x) === i; }), trends, now);
    return { kind: 'land', items: items, blocks: B, cells: cells, models: ids, at: raw.at, worst: worstOf(items, cells, B, 'score'), early: early };
  }
  function worstOf(items, cells, B, key) {
    return items.map(function (it, i) {
      var best = null;
      cells.forEach(function (row, j) { var c = row[i]; if (c && (!best || c[key] > best.c[key])) best = { c: c, b: B[j] }; });
      return best;
    });
  }

  /* ------------------------------------------------------------ offshore */
  /* typical industry limits, a starting point only: change them to your company's MOS / SIMOPS / vessel limits.
     w = mean wind 10 m (kt), g = gusts (kt), h = significant wave height Hs (m), sw = swell (m), tp = swell period (s, only when the swell is
     0.8 m or more: long swell moves boats and loads), vis = visibility (km, lower is worse);
     each [caution, stop]. day = daylight only. lt = 'c' thunder -> caution, 's' thunder -> caution, very likely -> stop */
  var ACTIVITIES = [
    { id: 'boat', name: 'Bot antara rig (crew boat / FCB)', w: [20, 25], g: [28, 35], h: [1.5, 2.0], sw: [1.5, 2.0], tp: [9, 12], vis: [3, 1.85], day: false, lt: 'c' },
    { id: 'basket', name: 'Personnel basket (crane)', w: [15, 20], g: [22, 28], h: [1.5, 2.0], tp: [9, 12], vis: [3, 1.85], day: true, lt: 's' },
    { id: 'swing', name: 'Swing rope', w: [15, 20], g: [22, 28], h: [1.2, 1.5], tp: [8, 10], day: true, lt: 's' },
    { id: 'cargo', name: 'Crane: platform ↔ vesel', w: [20, 25], g: [28, 35], h: [2.0, 2.5], tp: [9, 12], day: false, lt: 's' },
    { id: 'crane', name: 'Crane: atas platform', w: [25, 30], g: [32, 38], day: false, lt: 's' },
    { id: 'height', name: 'Kerja tinggi / scaffolding', w: [20, 30], g: [30, 38], day: false, lt: 's' },
    { id: 'overside', name: 'Kerja overside (FRC sedia)', w: [20, 25], g: [28, 35], h: [1.5, 2.0], tp: [10, 13], day: true, lt: 's' },
    { id: 'heli', name: 'Helikopter (helideck)', w: [35, 45], g: [45, 55], vis: [5, 1.5], day: true, lt: 's' },
    { id: 'diving', name: 'Selam (air diving)', w: [15, 20], g: [22, 28], h: [1.2, 1.5], sw: [1.2, 1.5], tp: [8, 10], day: true, lt: 's' },
    { id: 'supply', name: 'Vesel bekalan (standby / kargo)', w: [25, 30], g: [35, 42], h: [2.5, 3.0], tp: [10, 13], day: false, lt: 'c' }
  ];
  /* the overall line: caution = outside work limited, stop = everyone stays in the living quarters */
  var OVERALL = { id: 'lq', name: 'Status kerja luar', w: [30, 40], g: [40, 50], h: [3.5, 5.0] };
  var PARAMS = ['w', 'g', 'h', 'sw', 'tp', 'vis'];
  function copyAct(a) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = Array.isArray(a[k]) ? a[k].slice() : a[k]; }); return o; }
  /* the user's changes, kept as a short JSON text: { boat: { h: [1.5, 2.2], on: false }, lq: { w: [30, 40] } } */
  function limits(text) {
    var ch = {};
    try { ch = text ? JSON.parse(text) : {}; } catch (e) { ch = {}; }
    if (!ch || typeof ch !== 'object') ch = {};
    function apply(a) {
      var o = copyAct(a), c = ch[a.id] || {};
      PARAMS.forEach(function (p) {
        if (c[p] === null) { delete o[p]; return; }
        if (Array.isArray(c[p]) && c[p].length === 2) {
          var x = num(c[p][0]), y = num(c[p][1]);
          if (x !== null && y !== null && x >= 0 && y >= 0) o[p] = [x, y];
        }
      });
      if (typeof c.day === 'boolean') o.day = c.day;
      if (c.lt === 'c' || c.lt === 's') o.lt = c.lt;
      o.on = c.on !== false;
      return o;
    }
    return { acts: ACTIVITIES.map(apply).concat(myJobs(ch._my)), overall: apply(OVERALL) };
  }
  /* OceanWATCH "My jobs": the user's own jobs, kept in the same text under "_my": [{ id: 'my-...', name, w: [caution, stop], ..., demobH, safeH, via }]
     via = how people leave at demob: boat (limits of the crew boat line), heli (helicopter line), tow (supply vessel line) */
  var VIA = { boat: 'boat', heli: 'heli', tow: 'supply' };
  function myJobs(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.slice(0, 20).forEach(function (j, i) {
      if (!j || typeof j !== 'object') return;
      var o = { id: /^my-[a-z0-9-]{1,30}$/.test(j.id) ? j.id : 'my-' + (i + 1), name: String(j.name || '').trim().slice(0, 60) || ('Kerja ' + (i + 1)), mine: true };
      PARAMS.forEach(function (p) {
        if (Array.isArray(j[p]) && j[p].length === 2) { var x = num(j[p][0]), y = num(j[p][1]); if (x !== null && y !== null && x >= 0 && y >= 0) o[p] = [x, y]; }
      });
      o.day = !!j.day; o.lt = j.lt === 'c' ? 'c' : 's'; o.on = j.on !== false;
      o.demobH = Math.max(0, Math.min(72, num(j.demobH) === null ? 6 : num(j.demobH)));
      o.safeH = Math.max(0, Math.min(24, num(j.safeH) === null ? 1 : num(j.safeH)));
      o.via = VIA[j.via] ? j.via : 'boat';
      out.push(o);
    });
    return out;
  }
  function myJobsText(list) {
    return myJobs(list).map(function (o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== 'mine') c[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; }); return c; });
  }
  /* back to the short text: only what differs from the defaults */
  function limitsText(acts, overall, prev) {
    var out = {};
    /* My jobs: their own full definition, with the limits / on / day / thunder from the table */
    var before = limits(prev || '').acts.filter(function (a) { return a.mine; });
    var mine = (acts || []).filter(function (a) { return a && (a.mine || /^my-/.test(a.id)); }).map(function (a) {
      var b = before.filter(function (x) { return x.id === a.id; })[0] || {};
      return Object.assign({}, b, a);
    });
    if (!mine.length && !(acts || []).length) mine = before;
    ACTIVITIES.concat([OVERALL]).forEach(function (d) {
      var a = d.id === 'lq' ? overall : (acts || []).filter(function (x) { return x.id === d.id; })[0];
      if (!a) return;
      var c = {};
      PARAMS.forEach(function (p) {
        if (!a[p] && d[p]) c[p] = null;
        else if (a[p] && (!d[p] || a[p][0] !== d[p][0] || a[p][1] !== d[p][1])) c[p] = [a[p][0], a[p][1]];
      });
      if (d.id !== 'lq') {
        if (!!a.day !== !!d.day) c.day = !!a.day;
        if (a.lt && a.lt !== d.lt) c.lt = a.lt;
        if (a.on === false) c.on = false;
      }
      if (Object.keys(c).length) out[d.id] = c;
    });
    if (mine.length) out._my = myJobsText(mine);
    return Object.keys(out).length ? JSON.stringify(out) : '';
  }
  var PNAME = function (p) { return { w: L('Angin'), g: L('Tiupan'), h: 'Hs', sw: L('Alun'), tp: L('Tempoh alun'), vis: L('Penglihatan') }[p]; };
  var PUNIT = { w: 'kt', g: 'kt', h: 'm', sw: 'm', tp: 's', vis: 'km' };
  /* one job against the worst values of a block: 0 go, 1 caution, 2 no-go */
  function judge(a, v, words) {
    var st = 0, why = [];
    PARAMS.forEach(function (p) {
      var lim = a[p], x = v[p];
      if (!lim || x === null || x === undefined) return;
      var low = p === 'vis', s = low ? x <= lim[1] : x >= lim[1], c = low ? x <= lim[0] : x >= lim[0];
      var d = p === 'h' || p === 'sw' || p === 'vis' ? r1(x) : r0(x);
      if (p === 'tp' && (v.sw === null || v.sw === undefined || v.sw < 0.8)) return;
      if (s) { st = 2; if (words) why.push(L('{p} {v} {u} melebihi had {l}', { p: PNAME(p), v: d, u: PUNIT[p], l: lim[1] })); }
      else if (c) { st = Math.max(st, 1); if (words) why.push(L('{p} {v} {u} (berhati-hati dari {l})', { p: PNAME(p), v: d, u: PUNIT[p], l: lim[0] })); }
    });
    if (v.thunder !== null && v.thunder !== undefined && a.lt) {
      if (v.thunder >= 0.6 && a.lt === 's') { st = 2; if (words) why.push(L('ribut petir sangat mungkin ({p}% model)', { p: Math.round(v.thunder * 100) })); }
      else if (v.thunder >= 0.34 || v.lightning) { st = Math.max(st, 1); if (words) why.push(L('ribut petir mungkin: hentikan bila kilat dalam 10 batu nautika')); }
    }
    return { st: st, why: why };
  }
  var GO = ['Go', 'Caution', 'No-Go'];
  var OV = ['Normal', 'Berhati-hati', 'Kerja luar dihadkan', 'Kekal dalam LQ'];
  function assessOffshore(o) {
    var rep = o.rep, snap = o.snap || {}, now = o.now || Date.now(), B = o.blocks || [], lim = o.limits || limits('');
    var acts = lim.acts.filter(function (a) { return a.on !== false; });
    var items = [{ id: 'lq', name: L(OVERALL.name), kind: 'overall' }].concat(acts.map(function (a) { return { id: a.id, name: L(a.name), kind: 'job', day: a.day }; }));
    var vis = ((snap.weather && snap.weather.hourly) || []).filter(function (h) { return h.vis !== null && h.vis !== undefined; });
    var conf3 = function (a, b, c) { return a === b && b === c ? 3 : (a === b || b === c) ? 2 : 1; };
    var cells = B.map(function (b) {
      var H = rep ? rep.hours.filter(function (h) { return h.t >= b.t0 && h.t < b.t1; }) : [];
      if (!H.length) return items.map(function () { return { st: null, label: '-', why: [L('Tiada data model untuk masa ini (lebih 14 hari, atau model belum dibaca).')], conf: 0, confLabel: '-', prob: null }; });
      var light = function (h) { var hr = hourOf(h.t); return hr >= 7 && hr < 19; };
      var met = metActive(snap, b.t0, b.t1, null, false), metCrit = met.some(function (w) { return w.severity === 'critical'; });
      function vals(list, which) {
        var g = function (k) { return maxOf(list.map(function (h) { return h[k] ? h[k][which] : null; })); };
        return { w: g('w10'), g: g('g'), h: g('hs'), sw: maxOf(list.map(function (h) { return h.wh; })),
          tp: maxOf(list.filter(function (h) { return h.wh !== null && h.wh >= 0.8; }).map(function (h) { return h.wt; })),
          rain: list.reduce(function (a, h) { return h.p !== null ? (a || 0) + h.p : a; }, null),
          vis: minOf(vis.filter(function (x) { return x.t >= b.t0 && x.t < b.t1 && list.some(function (h) { return Math.abs(h.t - x.t) < HOUR; }); }).map(function (x) { return x.vis; })),
          thunder: maxOf(list.map(function (h) { return h.thunder; })), lightning: list.some(function (h) { return h.cape !== null && h.cape >= 1000 && (h.p || 0) >= 1; }) };
      }
      /* the share of single models that say no-go */
      function share(a, list) {
        var n = 0, bad = 0, ok = rep.ok;
        ok.wind.forEach(function (id) {
          var w = list.map(function (h) { return h.by.w[id]; }).filter(Boolean);
          if (!w.length) return;
          n++; if (judge(a, { w: maxOf(w.map(function (x) { return x.w10; })), g: maxOf(w.map(function (x) { return x.g; })) }).st === 2) bad++;
        });
        ok.wave.forEach(function (id) {
          var v = list.map(function (h) { return h.by.v[id]; }).filter(Boolean);
          if (!v.length) return;
          n++; if (judge(a, { h: maxOf(v.map(function (x) { return x.hs; })), sw: maxOf(v.map(function (x) { return x.wh; })),
            tp: maxOf(v.filter(function (x) { return x.wh !== null && x.wh >= 0.8; }).map(function (x) { return x.wt; })) }).st === 2) bad++;
        });
        return n ? bad / n : null;
      }
      var lead = b.lead;
      var jobs = acts.map(function (a) {
        var list = a.day ? H.filter(light) : H;
        if (!list.length) return { st: 2, night: true, label: L(GO[2]), why: [L('Siang sahaja (07:00–19:00)')], conf: 3, confLabel: confLabel(3), prob: null, values: {} };
        var vm = vals(list, 'm'), r = judge(a, vm, true), lo = judge(a, vals(list, 'lo')).st, hi = judge(a, vals(list, 'hi')).st;
        var conf = conf3(lo, r.st, hi);
        if (lead >= 7) conf = Math.min(conf, 2);
        if (lead >= 10) conf = 1;
        if (a.day && list.length < H.length) r.why.push(L('dinilai untuk waktu siang sahaja'));
        if (metCrit) { r.st = 2; r.why.unshift(L('Amaran MET tahap bahaya')); }
        return { st: r.st, label: L(GO[r.st]), why: r.why.length ? r.why : [L('Semua dalam had')], conf: conf, confLabel: confLabel(conf), prob: share(a, list), values: vm };
      });
      /* overall: stay in the LQ / outside work limited / caution / normal */
      var vm = vals(H, 'm'), ov = judge(lim.overall, vm, true), level = ov.st === 2 ? 3 : ov.st === 1 ? 2 : 0, why = ov.why.slice();
      if (metCrit) { level = 3; why.unshift(L('Amaran MET tahap bahaya')); }
      /* jobs that are only done in daylight do not count at night */
      var real = jobs.filter(function (j) { return !j.night; });
      var nogo = real.filter(function (j) { return j.st === 2; }).length, caut = real.filter(function (j) { return j.st === 1; }).length;
      if (level < 2 && real.length && nogo >= Math.ceil(real.length / 2)) { level = 2; why.push(L('{n} daripada {m} kerja No-Go', { n: nogo, m: real.length })); }
      if (level < 1 && (nogo || caut)) { level = 1; why.push(L('{n} kerja perlu berhati-hati / No-Go', { n: nogo + caut })); }
      if (met.length && !metCrit) why.push(L('Amaran MET: {t}.', { t: metTitle(met[0]) }));
      if (!why.length) why.push(L('Angin {w} kt, Hs {h} m: dalam had.', { w: r0(vm.w), h: r1(vm.h) }));
      var olo = judge(lim.overall, vals(H, 'lo')).st, ohi = judge(lim.overall, vals(H, 'hi')).st, oc = conf3(olo, ov.st, ohi);
      if (lead >= 7) oc = Math.min(oc, 2);
      if (lead >= 10) oc = 1;
      /* Operational Risk Score: Wind / Sea / Weather, the worst plus one level when two are high */
      var risk = RISK().offScore(Object.assign({}, vm, { met: met.map(function (w) { return { severity: w.severity, title: metTitle(w) }; }) }));
      return [{ st: level, label: L(OV[level]), why: why, conf: oc, confLabel: confLabel(oc), prob: share(lim.overall, H), values: vm, risk: risk }].concat(jobs);
    });
    /* weather windows: the stretches inside the chosen dates that are Go for each job, hour by hour */
    var from = B.length ? Math.max(B[0].t0, now) : now, to = B.length ? B[B.length - 1].t1 : now;
    var visAt = function (t) { var x = vis.filter(function (v) { return Math.abs(v.t - t) < HOUR; })[0]; return x ? x.vis : null; };
    var metStop = function (t) { return metActive(snap, t, t + HOUR, null, false).some(function (w) { return w.severity === 'critical'; }); };
    var win = rep ? acts.map(function (a) {
      var list = RISK().windows(rep, from, to, function (h) {
        var hr = hourOf(h.t);
        if (a.day && (hr < 7 || hr >= 19)) return false;
        if (metStop(h.t)) return false;
        return judge(a, { w: h.w10.m, g: h.g.m, h: h.hs.m, sw: h.wh, tp: h.wh !== null && h.wh >= 0.8 ? h.wt : null, vis: visAt(h.t), thunder: h.thunder,
          lightning: h.cape !== null && h.cape >= 1000 && (h.p || 0) >= 1 }).st === 0;
      }, o.minWindow || 4);
      return { id: a.id, name: L(a.name), list: list };
    }) : [];
    var early = RISK().earlyOffshore(rep, now, o.early || {});
    return { kind: 'offshore', items: items, blocks: B, cells: cells, at: rep ? rep.at : null, worst: worstOf(items, cells, B, 'st'), limits: lim, windows: win, early: early };
  }

  /* ------------------------------------------------------- continue or demob? (OceanWATCH, Ask AI)
     For one job: the first hour the forecast passes its STOP limits, with the middle value of the models ("m") and, in brackets, the worst ("hi")
     and the best ("lo") of the models. Latest start of demob = that hour - (demob hours + safety hours). People leave at the end of the demob by
     boat / helicopter / tow: its own limits must allow it then (and daylight when that line says so), else the start moves earlier.
     o = { rep, snap, job, via: act of the transfer or null, demobH, safeH, now, hours } */
  function demobPlan(o) {
    var rep = o.rep, job = o.job, now = o.now || Date.now(), end = now + (o.hours || 72) * HOUR, snap = o.snap || {};
    if (!rep || !job) return null;
    var vis = ((snap.weather && snap.weather.hourly) || []).filter(function (h) { return h.vis !== null && h.vis !== undefined; });
    var visAt = function (t) { var x = vis.filter(function (v) { return Math.abs(v.t - t) < HOUR; })[0]; return x ? x.vis : null; };
    var metStop = function (t) { return metActive(snap, t, t + HOUR, null, false).some(function (w) { return w.severity === 'critical'; }); };
    var H = rep.hours.filter(function (h) { return h.t + HOUR > now && h.t < end; });
    var val = function (h, k) {
      return { w: h.w10 ? h.w10[k] : null, g: h.g ? h.g[k] : null, h: h.hs ? h.hs[k] : null, sw: h.wh, tp: h.wh !== null && h.wh >= 0.8 ? h.wt : null, vis: visAt(h.t), thunder: h.thunder,
        lightning: h.cape !== null && h.cape >= 1000 && (h.p || 0) >= 1 };
    };
    var first = function (k) {
      for (var i = 0; i < H.length; i++) {
        if (metStop(H[i].t)) return { t: Math.max(now, H[i].t), why: [L('Amaran MET tahap bahaya')] };
        var r = judge(job, val(H[i], k), true);
        if (r.st === 2) return { t: Math.max(now, H[i].t), why: r.why };
      }
      return null;
    };
    var lim = { m: first('m'), hi: first('hi'), lo: first('lo') };
    var lead = ((o.demobH === undefined ? job.demobH || 6 : o.demobH) + (o.safeH === undefined ? (job.safeH === undefined ? 1 : job.safeH) : o.safeH)) * HOUR;
    var demobH = (o.demobH === undefined ? job.demobH || 6 : o.demobH) * HOUR;
    /* can people leave at time t (the last hour of the demob)? */
    var via = o.via, light = function (t) { var hr = hourOf(t); return hr >= 7 && hr < 19; };
    var hourAt = function (t) { return H.filter(function (h) { return h.t <= t && h.t + HOUR > t; })[0] || null; };
    var canLeave = function (t, k) {
      if (!via) return true;
      if (via.day && !light(t)) return false;
      var h = hourAt(t);
      return !h || judge(via, val(h, k)).st < 2;
    };
    var start = function (x, k) {
      if (!x) return null;
      var s0 = x.t - lead, s = s0, moved = false;
      /* step back an hour at a time until the transfer at the end of the demob is possible (not before now) */
      for (var n = 0; n < 72 && s + demobH >= now; n++) {
        if (canLeave(s + demobH - HOUR / 2, k)) break;
        s -= HOUR; moved = true;
      }
      return { t: s, moved: moved, late: s < now };
    };
    return {
      job: job, limitAt: { m: lim.m && lim.m.t, hi: lim.hi && lim.hi.t, lo: lim.lo && lim.lo.t }, why: lim.m ? lim.m.why : lim.hi ? lim.hi.why : [],
      startBy: { m: start(lim.m, 'm'), hi: start(lim.hi, 'hi'), lo: start(lim.lo, 'lo') },
      leadH: lead / HOUR, demobH: demobH / HOUR, via: via ? via.id : null, hours: o.hours || 72, none: !lim.m && !lim.hi && !lim.lo,
      leaveNow: via ? canLeave(now + HOUR / 2, 'm') : true
    };
  }

  /* ---------------------------------------------------------------- prompt
     everything the app knows, plus what to check and how to answer; for ChatGPT, Claude, Gemini, Copilot or any other AI */
  var TARGETS = {
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/', search: 'Gunakan carian web (Search) ChatGPT.', short: false },
    claude: { name: 'Claude', url: 'https://claude.ai/new', search: 'Gunakan carian web (web search) Claude.', short: false },
    gemini: { name: 'Gemini', url: 'https://gemini.google.com/app', search: 'Gunakan Google Search (dan YouTube jika berguna).', short: false },
    copilot: { name: 'Copilot', url: 'https://copilot.microsoft.com/', search: 'Gunakan carian Bing.', short: true },
    other: { name: 'AI', url: '', search: 'Gunakan carian web jika ada.', short: false }
  };
  function prompt(o) {
    var r = o.result, s = o.settings || {}, snap = o.snap || {}, rep = o.rep, now = o.now || Date.now(), T = TARGETS[o.target] || TARGETS.other;
    var en = o.lang === 'en', short = T.short, out = [];
    var line = function (x) { out.push(x); };
    var off = r.kind === 'offshore', B = r.blocks;
    var range = B.length ? shortDay(B[0].day) + (B[B.length - 1].day !== B[0].day ? ' – ' + shortDay(B[B.length - 1].day) : '') : '-';
    var stamp = dateKey(now) + ' ' + hhmm(now) + ' (MYT, UTC+8)';
    line('# ' + (off ? 'Penilaian cuaca & keadaan laut untuk kerja offshore' : 'Penilaian risiko banjir') + ' — ' + (s.locationName || '') + ', ' + range);
    line('');
    line('## Peranan & tugas');
    line(off ? 'Anda pakar meteorologi marin dan perancang operasi offshore (Laut China Selatan, perairan Malaysia).' : 'Anda pakar hidrologi / banjir dan pengurusan bencana di Malaysia (Pantai Timur, Terengganu).');
    line('Masa sekarang: ' + stamp + '. Tempoh dinilai: ' + range + ' (' + B.length + ' blok masa, ' + (B[0] ? B[0].label : '') + ' ...).');
    line('Saya beri data daripada app "Dashboard Cuaca Aziz" (model cuaca percuma + JPS + MET Malaysia) dan penilaian automatik app itu (berasaskan peraturan, bukan AI).');
    line('Tugas anda: (1) sahkan dan lengkapkan data ini dengan sumber terkini di internet, (2) semak berita dan media sosial, (3) rujuk panduan industri / kajian berkaitan, (4) beri nasihat akhir yang jelas.');
    line(T.search + ' Jika tiada akses internet, katakan dengan jelas dan nilai hanya daripada data di bawah.');
    line('');
    line('## Lokasi');
    if (off) line('- ' + (s.locationName || '') + ': ' + r1(Math.abs(s.marineLat)) + (s.marineLat >= 0 ? 'N' : 'S') + ', ' + r1(Math.abs(s.marineLon)) + (s.marineLon >= 0 ? 'E' : 'W') + ' (offshore, ' + 'koordinat tepat ' + s.marineLat + ', ' + s.marineLon + '). Kawasan ramalan laut MET berkaitan: ' + (s.warningKeywords || '-') + '.');
    else {
      line('- Profil: ' + (s.locationName || '') + ' (' + s.lat + ', ' + s.lon + '), daerah JPS ' + (s.waterDistrict || '-') + ', negeri ' + (s.jpsState || 'TRG') + '.');
      line('- Kawasan dinilai: ' + r.items.map(function (x) { return x.name; }).join('; ') + '.');
    }
    line('');
    if (off) {
      line('## Kerja & had operasi yang saya guna (kt = knot, Hs = tinggi ombak signifikan)');
      r.limits.acts.filter(function (a) { return a.on !== false; }).forEach(function (a) {
        var parts = PARAMS.filter(function (p) { return a[p]; }).map(function (p) { return PNAME(p) + ' ' + (p === 'vis' ? '≤' : '≥') + a[p][0] + '/' + a[p][1] + ' ' + PUNIT[p]; });
        line('- ' + L(a.name) + ': berhati-hati/henti pada ' + parts.join(', ') + (a.day ? '; siang sahaja' : '') + (a.lt === 's' ? '; henti jika kilat dekat' : ''));
      });
      var ov = r.limits.overall;
      line('- Status keseluruhan: "Kerja luar dihadkan" bila angin ≥' + ov.w[0] + ' kt / tiupan ≥' + ov.g[0] + ' kt / Hs ≥' + ov.h[0] + ' m; "Kekal dalam LQ" bila angin ≥' + ov.w[1] + ' kt / tiupan ≥' + ov.g[1] + ' kt / Hs ≥' + ov.h[1] + ' m.');
      line('Had ini nilai lazim industri yang saya tetapkan; semak dengan panduan IMCA / IOGP / OEUK dan nyatakan jika ada yang luar biasa.');
      line('');
    }
    line('## Penilaian automatik app (peraturan)');
    line('Format: blok masa | ' + (off ? 'status kerja luar, kemudian setiap kerja' : 'setiap kawasan') + ' → keputusan (peluang% · keyakinan) : sebab utama');
    B.forEach(function (b, j) {
      var row = r.cells[j].map(function (c, i) {
        var p = c.prob === null || c.prob === undefined ? '' : Math.round(c.prob * 100) + '%';
        var sc = c.score !== undefined ? c.score : c.risk ? c.risk.score : null;
        var parts = (c.parts || (c.risk && c.risk.parts) || []).map(function (x) { return x.name + ' ' + x.score; }).join(', ');
        return r.items[i].name + ' → ' + c.label + (sc !== null ? ' [skor ' + sc + '/100' + (parts ? ': ' + parts : '') + ']' : '') + (p || c.confLabel !== '-' ? ' (' + [p, c.confLabel].filter(Boolean).join(' · ') + ')' : '') + (short && c.st === 0 ? '' : ' : ' + c.why.slice(0, short ? 1 : 3).map(function (x) { return String(x).replace(/\.$/, ''); }).join('; '));
      });
      line('- ' + shortDay(b.day) + ' ' + b.label + ' | ' + row.join(' || '));
    });
    line('Peluang = ' + (off ? 'bahagian model (angin & ombak) yang memberi No-Go' : 'bahagian model hujan yang memberi risiko Tinggi atau lebih') + '. Keyakinan Tinggi = model sepakat; Rendah = model berbeza jauh atau terlalu jauh ke hadapan.');
    line(off ? 'Skor risiko operasi 0–100 = gabungan Risiko angin (angin purata & tiupan), Risiko laut (Hs, alun panjang ≥9 s) dan Risiko cuaca (ribut petir, penglihatan, hujan, amaran MET): ambil yang paling tinggi, naik satu tahap bila dua bahagian ≥50. Tahap: <25 Sangat rendah, 25–49 Rendah, 50–70 Sederhana, 71–84 Tinggi, ≥85 Sangat tinggi.'
      : 'Skor risiko banjir 0–100: Risiko sungai jadi asas (Normal 0, Waspada 5 = naik ketara belum banjir, Amaran 45 = kemungkinan kecil banjir, ≤0.25 m dari Bahaya 70, Bahaya 90 = banjir; dijangka capai Bahaya dalam 4 / 24 jam sehingga 75 / 55). Risiko cuaca (nilai tengah hujan 5 model, tanah basah, amaran MET) dan Risiko pantai (air pasang besar, ombak ke pantai) sahaja paling tinggi 45 (Rendah); ia naikkan skor satu tahap hanya bila sungai sudah Amaran (≥45) dan cuaca/pantai ≥50. Tiada hujan dalam ramalan = sungai tidak dijangka naik. Tahap: <25 Sangat rendah, 25–49 Rendah, 50–70 Sederhana, 71–84 Tinggi, ≥85 Sangat tinggi.');
    if ((r.early || []).length) { line('Amaran awal app:'); r.early.forEach(function (e) { line('- ' + e.title + ': ' + e.body); }); }
    else line('Amaran awal app: tiada (' + (off ? 'angin / ombak tidak naik cepat dalam 24 jam' : 'tiada sungai naik cepat') + ').');
    if (off && (r.windows || []).length) {
      line('Weather window (jam-jam Go berturut-turut, dalam tarikh dipilih):');
      r.windows.forEach(function (w) { line('- ' + w.name + ': ' + (w.list.length ? w.list.slice(0, 4).map(function (x) { return shortDay(dateKey(x.t0)) + ' ' + hhmm(x.t0) + '–' + (dateKey(x.t1) !== dateKey(x.t0) ? shortDay(dateKey(x.t1)) + ' ' : '') + hhmm(x.t1) + ' (' + x.hours + ' j)'; }).join('; ') : 'tiada') ); });
    }
    if (!off && snap.trends && Object.keys(snap.trends).length) {
      line('Trend & anggaran sungai JPS (stesen | paras m | kadar m/jam | naik 4 jam m | naik 24 jam m | anggaran 4 jam m | anggaran 24 jam m | sasaran | keyakinan):');
      Object.keys(snap.trends).slice(0, short ? 6 : 20).forEach(function (n) {
        var t = snap.trends[n], p = t.proj || {}, x = function (v) { return v === null || v === undefined ? '-' : (+v).toFixed(2); };
        line('- ' + n + (t.tidal ? ' (pasang surut)' : '') + ' | ' + x(t.level) + ' | ' + x(t.rate) + ' | ' + x(t.rise4h) + ' | ' + x(t.rise24h) + ' | ' + x(p.p4) + ' | ' + x(p.p24) + ' | ' + (p.targetName ? p.targetName + ' ' + x(p.targetM) + ' m' : '-') + ' | ' + (p.tier ? p.conf + '%' : '-'));
      });
      line('Keyakinan amaran awal = trend sungai (40) + hujan 5 model & tolok JPS (25) + stesen hulu & GloFAS (20) + data segar & lengkap (15); notifikasi hanya ≥ ' + (s.ewConf || 85) + '%.');
    }
    line('');
    line('## Data');
    if (off && rep) {
      line('Model (Open-Meteo): angin ' + rep.ok.wind.join(', ') + '; ombak ' + rep.ok.wave.join(', ') + '; ensemble ' + rep.ok.ens.join(', ') + '. Dibaca ' + dateKey(rep.at) + ' ' + hhmm(rep.at) + ' MYT.');
      line('Setiap hari (nilai tengah model, julat min–max): angin maks 10m kt | tiupan maks kt | Hs maks m | ombak maks ~1.7×Hs | peluang angin ≥' + rep.windKt + ' kt (ensemble) | peluang Hs ≥' + rep.waveM + ' m (model ombak) | hujan mm | keyakinan');
      var days = {}; B.forEach(function (b) { days[b.day] = 1; });
      rep.days.filter(function (d) { return days[d.day || d.date]; }).forEach(function (d) {
        line('- ' + shortDay(d.date) + ': ' + r0(d.wind.m) + ' (' + r0(d.wind.lo) + '–' + r0(d.wind.hi) + ') | ' + r0(d.gust.m) + ' | ' + r1(d.hs.m) + ' (' + r1(d.hs.lo) + '–' + r1(d.hs.hi) + ') | ' + r1(d.hmax) +
          ' | ' + (d.probWind ? Math.round(d.probWind.p * 100) + '%' : '-') + ' | ' + (d.probWave ? Math.round(d.probWave.p * 100) + '%' : '-') + ' | ' + r1(d.rain) + (d.thunder >= 0.34 ? ' ribut petir' : '') + ' | ' + d.conf.label);
      });
      if (!short) {
        line('Setiap 3 jam (nilai tengah): masa | arah angin | angin 10m/80m/tiupan kt | Hs m | sea Hs m Tp s | swell Hs m Tp s arah | CAPE | ribut petir % model');
        var hrs = rep.hours.filter(function (h) { return days[dateKey(h.t)] && h.t >= now - HOUR && hourOf(h.t) % 3 === 2; }).slice(0, 8 * 7);
        hrs.forEach(function (h) {
          line('- ' + shortDay(dateKey(h.t)) + ' ' + hhmm(h.t) + ' | ' + r0(h.dir) + '° | ' + r0(h.w10.m) + '/' + r0(h.w80.m) + '/' + r0(h.g.m) + ' | ' + r1(h.hs.m) + ' | ' + r1(h.sh) + ' ' + r0(h.st) + ' | ' + r1(h.wh) + ' ' + r0(h.wt) + ' ' + r0(h.wd) + '° | ' + r0(h.cape) + ' | ' + (h.thunder === null ? '-' : Math.round(h.thunder * 100)));
        });
      }
      if (rep.warn) line('Amaran 24 jam (app): ' + rep.warn.lines.join(' ') + ' Peluang kilat: ' + rep.warn.lightningText + '.');
      if (rep.summary) line('Ringkasan app: ' + [rep.summary.wind, rep.summary.sea, rep.summary.swell, rep.summary.weather, rep.summary.season].filter(Boolean).join(' '));
    }
    if (!off) {
      var W = waterList(snap), dist = lc(s.waterDistrict);
      var list = W.filter(function (x) { return r.items.some(function (it) { return it.kind === 'district' ? lc(x.district) === lc(it.name) : true; }); });
      if (r.items[0] && r.items[0].kind === 'station') list = W.filter(function (x) { return !dist || lc(x.district) === dist; });
      if (list.length) {
        line('Paras air JPS (masa bacaan | stesen | daerah | paras m | Normal/Waspada/Amaran/Bahaya m):');
        list.slice(0, short ? 12 : 60).forEach(function (x) {
          line('- ' + (x.updated ? String(x.updated).slice(0, 16).replace('T', ' ') : '-') + ' | ' + x.name + ' | ' + (x.district || '-') + ' | ' + r1(num(x.level)) + ' | ' + [x.normal, x.alert, x.warning, x.danger].map(function (v) { return v === undefined || v === null ? '-' : v; }).join('/') + (x.trend ? ' | ' + x.trend : ''));
        });
      }
      var R = rainList(snap);
      if (R.length) {
        line('Hujan JPS (stesen | daerah | 2 hari lalu mm | hari ini mm):');
        R.filter(function (x) { return r.items.some(function (it) { return it.kind !== 'district' || lc(x.district) === lc(it.name); }); }).slice(0, short ? 10 : 50).forEach(function (x) {
          var d = x.daily || [];
          line('- ' + x.name + ' | ' + (x.district || '-') + ' | ' + r0(d[d.length - 2]) + ', ' + r0(d[d.length - 1]) + ' | ' + r0(x.today));
        });
      }
      if (snap.river && snap.river.days) line('GloFAS aliran sungai di titik sungai profil (' + s.riverLat + ', ' + s.riverLon + '), m³/s setiap hari: ' + snap.river.days.filter(function (d) { return !d.past; }).slice(0, 14).map(function (d) { return d.date.slice(5) + ' ' + r0(d.q); }).join(', ') + '.');
      var ev = (snap.tide && snap.tide.events) || [];
      if (ev.length && !short) line('Pasang surut Cukai: ' + ev.filter(function (e) { return e.t >= now; }).slice(0, 10).map(function (e) { return (e.type === 'high' ? 'pasang ' : 'surut ') + dateKey(e.t).slice(5) + ' ' + hhmm(e.t) + ' ' + r1(e.sea) + ' m'; }).join('; ') + '.');
      line('Hujan ramalan setiap blok ada dalam penilaian di atas (nilai tengah 5 model: ' + r.models.join(', ') + ').');
    }
    var met = ((snap.met || {}).warnings || []);
    line(met.length ? 'Amaran MET Malaysia aktif (data.gov.my): ' + met.map(function (w) { return metTitle(w) + ' — ' + (en ? w.heading_en || w.heading_bm : w.heading_bm || w.heading_en) + (w.to ? ' (hingga ' + dateKey(w.to) + ' ' + hhmm(w.to) + ')' : ''); }).join(' | ') : 'Amaran MET Malaysia: tiada amaran aktif untuk kawasan ini pada masa data dibaca.');
    var fc = ((snap.met || {}).forecast || []).slice(0, short ? 3 : 7);
    if (fc.length) line('Ramalan MET Malaysia (' + fc[0].name + '): ' + fc.map(function (d) { return d.date.slice(5) + ' ' + d.summary + (d.when ? ' (' + d.when + ')' : ''); }).join('; ') + '.');
    line('');
    var instr = out.length;
    line('## Apa yang perlu anda semak');
    if (off) {
      line('1. Sumber rasmi: MET Malaysia (met.gov.my — ramalan marin & amaran laut kawasan ' + (s.warningKeywords || 'Terengganu') + ', amaran angin kencang & laut bergelora, ribut tropika), JTWC / JMA / PAGASA jika ada sistem tropika, serta peta ECMWF / Windy untuk tempoh ini.');
      line('2. Berita & media sosial (Facebook, X, TikTok, Telegram, kumpulan maritim, Maritim Malaysia/APMM, Jabatan Laut): laporan laut bergelora, bot tertangguh, amaran nelayan, ribut / angin kencang di Terengganu dan Laut China Selatan. Nyatakan tarikh dan tahap kebolehpercayaan setiap laporan.');
      line('3. Panduan & kajian: had cuaca operasi marin (IMCA, IOGP, OEUK, DNV-ST-N001 "marine operations"), pemindahan krew dengan bot / bakul, angkat crane offshore, operasi helideck (CAP 437), serta kajian Monsun Timur Laut & "cold surge" di Laut China Selatan.');
    } else {
      line('1. Sumber rasmi: JPS Public Infobanjir (publicinfobanjir.water.gov.my), InfoBanjir Terengganu, MET Malaysia (amaran hujan berterusan / ribut petir), NADMA (portalbencana.nadma.gov.my — PPS dibuka), APM / Bomba, JKR (jalan ditutup).');
      line('2. Berita & media sosial (Facebook JPS Terengganu, MetMalaysia, APM, Bomba, Polis, kumpulan komuniti tempatan, X, TikTok, Telegram, Berita Harian, Harian Metro, Bernama, The Star): laporan air naik, jalan tidak boleh dilalui, pemindahan mangsa. Nyatakan tarikh, lokasi dan tahap kebolehpercayaan.');
      line('3. Kajian & panduan: corak banjir Monsun Timur Laut Pantai Timur, "cold surge", kesan air pasang besar di muara (Chukai / Kemaman), sejarah banjir kawasan ini (contoh 2014, 2021–2022), panduan JPS / NADMA.');
    }
    line('4. Bandingkan dengan data app di atas: mana yang sama, mana yang berbeza, dan mana yang lebih dipercayai.');
    line('');
    line('## Format jawapan');
    line('Jawab dalam ' + (en ? 'Bahasa Inggeris' : 'Bahasa Melayu') + ', ringkas dan jelas:');
    line('A. Ringkasan 3–5 ayat: keadaan keseluruhan dan apa yang paling penting.');
    line(off ? 'B. Jadual: blok masa × kerja (Go / Caution / No-Go), dengan peluang %, tahap keyakinan (Tinggi / Sederhana / Rendah) dan sebab ringkas.' : 'B. Jadual: kawasan × blok masa (risiko banjir Sangat rendah / Rendah / Sederhana / Tinggi / Sangat tinggi), dengan peluang %, tahap keyakinan dan sebab ringkas.');
    line('C. Perbezaan antara data app dan sumber luar, serta mana yang anda pilih dan kenapa.');
    line(off ? 'D. Tanda amaran untuk dipantau (contoh garisan squall, angin naik, swell panjang) dan masa terbaik (weather window) untuk kerja penting.' : 'D. Tanda amaran untuk dipantau (paras sungai, hujan berterusan, air pasang) dan kawasan / jalan yang perlu dielakkan.');
    line('E. Cadangan tindakan.');
    line('F. Senarai sumber dengan pautan dan tarikh / masa diterbitkan. Jangan reka sumber; jika tidak dapat disahkan, tulis "tidak dapat disahkan".');
    line('G. Tahap keyakinan keseluruhan dan sebabnya.');
    line('Nota: keputusan akhir dibuat oleh ' + (off ? 'OIM / Marine / pihak berkuasa di lokasi' : 'pihak berkuasa (APM, NADMA, JPS)') + ' berdasarkan keadaan sebenar.');
    var text = out.join('\n');
    if (short && text.length > 8800) {
      /* Copilot takes a shorter prompt: keep the instructions and the answer format whole, shorten the data above them */
      var tail = out.slice(instr).join('\n'), head = out.slice(0, instr).join('\n');
      text = head.slice(0, Math.max(1000, 8700 - tail.length)).replace(/\n[^\n]*$/, '') + '\n... (data dipendekkan untuk Copilot)\n\n' + tail;
    }
    return text;
  }

  return { DAYS: DAYS, LEVELS: LEVELS, ACTIVITIES: ACTIVITIES, OVERALL: OVERALL, DISTRICTS_TRG: DISTRICTS_TRG, LAND_MODELS: LAND_MODELS, TARGETS: TARGETS,
    blocks: blocks, parseShift: parseShift, parsePlaces: parsePlaces, landAreas: landAreas, landUrls: landUrls, collectLand: collectLand, assessLand: assessLand,
    limits: limits, limitsText: limitsText, myJobs: myJobs, demobPlan: demobPlan, VIA: VIA, judge: judge, coastFor: coastFor, metActive: metActive, metTitle: metTitle, metForLand: metForLand, riverRatio: riverRatio, assessOffshore: assessOffshore, prompt: prompt, shortDay: shortDay, dateKey: dateKey, stationLevel: stationLevel };
});
