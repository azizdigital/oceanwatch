/* Dashboard Cuaca Aziz - offshore model comparison (like a metocean report): several free models side by side,
   their middle value and spread, chance of going over the user's limits, and how sure the models are.
   Data: Open-Meteo (CC BY 4.0) - weather models (wind, gusts, rain, CAPE), wave models (sea + swell), ensembles.
   Pure functions; the page and the desktop app (main.js) share this file.
     urls(lat, lon)               -> [{ group, id, url }]
     collect(lat, lon, getJson)   -> Promise(raw)   getJson(url) -> Promise(JSON)
     build(raw, { now, windKt, waveM }) -> report  (hours, days, warn, summary, sources)
     rows(report, days)           -> table rows, 3-hourly then 6-hourly then 12-hourly
     outlook(report, days)        -> text lines for the chosen 3 / 7 / 14 days */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./i18n'));
  else root.MCOffshore = factory(root.MCI18n);
})(typeof self !== 'undefined' ? self : this, function (I18N) {
  'use strict';
  function L(s, v) {
    if (I18N) return I18N.L(s, v);
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] !== undefined ? v[k] : m; });
  }
  var DAYS = 14, HOUR = 3600000, DAY = 86400000, TZ_MS = 8 * HOUR, HMAX = 1.7;

  /* weather models (hourly wind at 10 m and 80 m, gusts, rain, CAPE, weather code) */
  var WIND = [
    { id: 'ecmwf_ifs025', name: 'ECMWF IFS', by: 'ECMWF, EU', days: 15, link: 'https://www.ecmwf.int/en/forecasts' },
    { id: 'gfs_seamless', name: 'NOAA GFS', by: 'NOAA NCEP, USA', days: 16, link: 'https://www.emc.ncep.noaa.gov/emc/pages/numerical_forecast_systems/gfs.php' },
    { id: 'icon_seamless', name: 'DWD ICON', by: 'DWD, Germany', days: 7, link: 'https://www.dwd.de/EN/research/weatherforecasting/num_modelling/01_num_weather_prediction_modells/icon_description.html' },
    { id: 'jma_seamless', name: 'JMA GSM', by: 'JMA, Japan', days: 11, link: 'https://www.jma.go.jp/jma/en/Activities/nwp.html' },
    { id: 'meteofrance_seamless', name: 'Météo-France ARPEGE', by: 'Météo-France', days: 4, link: 'https://meteofrance.com/' },
    { id: 'ukmo_seamless', name: 'UK Met Office', by: 'Met Office, UK', days: 7, link: 'https://www.metoffice.gov.uk/research/approach/modelling-systems/unified-model' }
  ];
  /* wave models (sea = wind waves, swell) */
  var WAVE = [
    { id: 'ecmwf_wam025', name: 'ECMWF WAM', by: 'ECMWF, EU', days: 15, link: 'https://www.ecmwf.int/en/forecasts/documentation-and-support/ocean-waves' },
    { id: 'ncep_gfswave025', name: 'NOAA WAVEWATCH III', by: 'NOAA NCEP, USA', days: 16, link: 'https://polar.ncep.noaa.gov/waves/' },
    { id: 'meteofrance_wave', name: 'Météo-France MFWAM', by: 'Météo-France / Copernicus', days: 10, link: 'https://marine.copernicus.eu/' },
    { id: 'dwd_gwam', name: 'DWD GWAM', by: 'DWD, Germany', days: 7, link: 'https://www.dwd.de/' }
  ];
  /* ensembles: many runs of one model with small changes - the share of runs over a limit is the chance */
  var ENS = [
    { id: 'ecmwf_ifs025', name: 'ECMWF ENS', runs: 51, by: 'ECMWF, EU', days: 15, link: 'https://www.ecmwf.int/en/forecasts/documentation-and-support/medium-range-forecasts' },
    { id: 'gfs025', name: 'NOAA GEFS', runs: 31, by: 'NOAA NCEP, USA', days: 10, link: 'https://www.emc.ncep.noaa.gov/emc/pages/numerical_forecast_systems/gefs.php' }
  ];
  var WIND_VARS = ['temperature_2m', 'precipitation', 'weather_code', 'cape', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'wind_speed_80m'];
  var WAVE_VARS = ['wave_height', 'wave_direction', 'wave_period', 'wind_wave_height', 'wind_wave_direction', 'wind_wave_period', 'wind_wave_peak_period',
    'swell_wave_height', 'swell_wave_direction', 'swell_wave_period', 'swell_wave_peak_period'];

  function urls(lat, lon) {
    var q = 'latitude=' + (+lat).toFixed(4) + '&longitude=' + (+lon).toFixed(4) + '&timezone=Asia%2FKuala_Lumpur&forecast_days=' + DAYS;
    var out = [];
    WIND.forEach(function (m) { out.push({ group: 'wind', id: m.id, url: 'https://api.open-meteo.com/v1/forecast?' + q + '&hourly=' + WIND_VARS.join(',') + '&wind_speed_unit=kn&models=' + m.id }); });
    WAVE.forEach(function (m) { out.push({ group: 'wave', id: m.id, url: 'https://marine-api.open-meteo.com/v1/marine?' + q + '&hourly=' + WAVE_VARS.join(',') + '&models=' + m.id }); });
    ENS.forEach(function (m) { out.push({ group: 'ens', id: m.id, url: 'https://ensemble-api.open-meteo.com/v1/ensemble?' + q + '&daily=wind_speed_10m_max,wind_gusts_10m_max&wind_speed_unit=kn&models=' + m.id }); });
    return out;
  }
  /* keep only what the report needs (smaller to store / send to the phone) */
  function slim(j) {
    var out = { utc_offset_seconds: j.utc_offset_seconds === undefined ? 28800 : j.utc_offset_seconds };
    ['hourly', 'daily'].forEach(function (b) {
      if (!j[b] || !j[b].time) return;
      out[b] = {};
      Object.keys(j[b]).forEach(function (k) {
        out[b][k] = k === 'time' ? j[b][k] : j[b][k].map(function (v) { return v === null || v === undefined ? null : Math.round(v * 100) / 100; });
      });
    });
    return out;
  }
  function collect(lat, lon, getJson) {
    var raw = { v: 1, at: Date.now(), lat: +lat, lon: +lon, wind: {}, wave: {}, ens: {} };
    return Promise.all(urls(lat, lon).map(function (x) {
      return Promise.resolve().then(function () { return getJson(x.url); }).then(function (j) {
        if (!j || j.error || !(j.hourly || j.daily)) throw new Error((j && j.reason) || 'no data');
        raw[x.group][x.id] = { ok: true, data: slim(j) };
      }, function (e) { raw[x.group][x.id] = { ok: false, error: String((e && e.message) || e).slice(0, 140) }; });
    })).then(function () { return raw; });
  }

  /* ------------------------------------------------------------ helpers */
  function num(v) { return v === null || v === undefined || v === '' || !isFinite(v) ? null : +v; }
  function clean(a) { return a.filter(function (v) { return v !== null && v !== undefined && isFinite(v); }); }
  function quant(a, q) {
    a = clean(a).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return a[lo] + (a[hi] - a[lo]) * (i - lo);
  }
  function med(a) { return quant(a, 0.5); }
  function stats(a) { a = clean(a); return a.length ? { m: med(a), lo: Math.min.apply(null, a), hi: Math.max.apply(null, a), n: a.length } : { m: null, lo: null, hi: null, n: 0 }; }
  function maxOf(a) { a = clean(a); return a.length ? Math.max.apply(null, a) : null; }
  function sumOf(a) { a = clean(a); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) : null; }
  /* mean direction (degrees the wind / waves come FROM), each weighted by its speed / height */
  function circ(dirs, weights) {
    var x = 0, y = 0, n = 0;
    dirs.forEach(function (d, i) {
      if (d === null || d === undefined || !isFinite(d)) return;
      var w = weights && weights[i] !== null && weights[i] !== undefined ? Math.max(0.01, weights[i]) : 1, r = d * Math.PI / 180;
      x += Math.sin(r) * w; y += Math.cos(r) * w; n++;
    });
    if (!n) return null;
    var deg = Math.atan2(x, y) * 180 / Math.PI;
    return Math.round((deg + 360) % 360);
  }
  function arr(block, name, model) {
    if (!block) return null;
    if (block[name]) return block[name];
    if (model && block[name + '_' + model]) return block[name + '_' + model];
    return null;
  }
  function at(a, i) { return a ? num(a[i]) : null; }
  function ms(t, off) { return Date.parse(String(t).length === 10 ? t + 'T00:00:00Z' : t + ':00Z') - (off === undefined ? 28800 : off) * 1000; }
  function dateKey(t) { return new Date(t + TZ_MS).toISOString().slice(0, 10); }
  function localHour(t) { return new Date(t + TZ_MS).getUTCHours(); }
  var C16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function compass16(d) { return d === null || d === undefined ? '-' : C16[Math.round(((d % 360) + 360) % 360 / 22.5) % 16]; }
  function dirWord(d) {
    if (d === null || d === undefined) return '';
    var w = [L('utara'), L('timur laut'), L('timur'), L('tenggara'), L('selatan'), L('barat daya'), L('barat'), L('barat laut')];
    return w[Math.round(((d % 360) + 360) % 360 / 45) % 8];
  }
  /* Beaufort words (knots) */
  function windClass(kt) {
    if (kt === null) return '';
    return kt < 11 ? L('lemah') : kt < 17 ? L('sederhana') : kt < 22 ? L('segar') : kt < 28 ? L('kuat') : kt < 34 ? L('sangat kuat') : L('ribut (gale)');
  }
  /* Douglas sea state (significant wave height, m) */
  function seaState(h) {
    if (h === null) return '';
    return h < 0.1 ? L('tenang') : h < 0.5 ? L('licin') : h < 1.25 ? L('sedikit berombak') : h < 2.5 ? L('sederhana') : h < 4 ? L('bergelora') : h < 6 ? L('sangat bergelora') : L('tinggi');
  }
  function swellClass(h) { return h === null ? '' : h < 2 ? L('rendah') : h < 4 ? L('sederhana') : L('tinggi'); }
  function r1(v) { return v === null ? '-' : (Math.round(v * 10) / 10).toFixed(1); }
  function r0(v) { return v === null ? '-' : String(Math.round(v)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* -------------------------------------------------------------- build */
  function build(raw, o) {
    o = o || {};
    raw = raw || {};
    var now = o.now || Date.now(), thrW = +o.windKt || 15, thrH = +o.waveM || 1.5;
    var start = Math.floor(now / HOUR) * HOUR, end = start + DAYS * DAY;
    var byT = {}, okW = [], okV = [], okE = [];
    function row(t) { return byT[t] || (byT[t] = { t: t, w: {}, v: {} }); }
    WIND.forEach(function (m) {
      var r = raw.wind && raw.wind[m.id];
      if (!r || !r.ok || !r.data || !r.data.hourly) return;
      var h = r.data.hourly, off = r.data.utc_offset_seconds, any = false;
      var A = {}; WIND_VARS.forEach(function (k) { A[k] = arr(h, k, m.id); });
      (h.time || []).forEach(function (tt, i) {
        var t = ms(tt, off);
        if (t < start - HOUR || t > end) return;
        var w10 = at(A.wind_speed_10m, i);
        if (w10 === null) return;
        any = true;
        row(t).w[m.id] = { w10: w10, w80: at(A.wind_speed_80m, i), g: at(A.wind_gusts_10m, i), dir: at(A.wind_direction_10m, i),
          temp: at(A.temperature_2m, i), p: at(A.precipitation, i), cape: at(A.cape, i), code: at(A.weather_code, i) };
      });
      if (any) okW.push(m.id);
    });
    WAVE.forEach(function (m) {
      var r = raw.wave && raw.wave[m.id];
      if (!r || !r.ok || !r.data || !r.data.hourly) return;
      var h = r.data.hourly, off = r.data.utc_offset_seconds, any = false;
      var A = {}; WAVE_VARS.forEach(function (k) { A[k] = arr(h, k, m.id); });
      (h.time || []).forEach(function (tt, i) {
        var t = ms(tt, off);
        if (t < start - HOUR || t > end) return;
        var hs = at(A.wave_height, i);
        if (hs === null) return;
        any = true;
        var sp = at(A.wind_wave_peak_period, i), wp = at(A.swell_wave_peak_period, i);
        row(t).v[m.id] = { hs: hs, dir: at(A.wave_direction, i), tp: at(A.wave_period, i),
          sh: at(A.wind_wave_height, i), sd: at(A.wind_wave_direction, i), st: sp !== null ? sp : at(A.wind_wave_period, i),
          wh: at(A.swell_wave_height, i), wd: at(A.swell_wave_direction, i), wt: wp !== null ? wp : at(A.swell_wave_period, i) };
      });
      if (any) okV.push(m.id);
    });
    /* hours: middle value + spread across models */
    var hours = Object.keys(byT).map(Number).sort(function (a, b) { return a - b; }).map(function (t) {
      var r = byT[t], W = okW.filter(function (id) { return r.w[id]; }).map(function (id) { return r.w[id]; }),
        V = okV.filter(function (id) { return r.v[id]; }).map(function (id) { return r.v[id]; });
      function g(list, k) { return list.map(function (x) { return x[k]; }); }
      var w10 = stats(g(W, 'w10')), hs = stats(g(V, 'hs')), codes = clean(g(W, 'code'));
      return {
        t: t, n: W.length, nv: V.length, by: r,
        w10: w10, w80: stats(g(W, 'w80')), g: stats(g(W, 'g')), dir: circ(g(W, 'dir'), g(W, 'w10')),
        temp: med(g(W, 'temp')), p: med(g(W, 'p')), cape: med(g(W, 'cape')),
        thunder: codes.length ? codes.filter(function (c) { return c >= 95; }).length / codes.length : null,
        hs: hs, hmax: hs.m === null ? null : hs.m * HMAX, hmaxHi: hs.hi === null ? null : hs.hi * HMAX, vdir: circ(g(V, 'dir'), g(V, 'hs')),
        sh: med(g(V, 'sh')), st: med(g(V, 'st')), sd: circ(g(V, 'sd'), g(V, 'sh')),
        wh: med(g(V, 'wh')), wt: med(g(V, 'wt')), wd: circ(g(V, 'wd'), g(V, 'wh'))
      };
    });
    /* ensembles: daily max wind of every run */
    var ensDay = {};
    ENS.forEach(function (m) {
      var r = raw.ens && raw.ens[m.id];
      if (!r || !r.ok || !r.data || !r.data.daily) return;
      var d = r.data.daily, runs = [], gust = [];
      Object.keys(d).forEach(function (k) {
        if (k === 'wind_speed_10m_max' || k.indexOf('wind_speed_10m_max_') === 0) runs.push(d[k]);
        if (k === 'wind_gusts_10m_max' || k.indexOf('wind_gusts_10m_max_') === 0) gust.push(d[k]);
      });
      if (!runs.length) return;
      var any = false;
      (d.time || []).forEach(function (day, i) {
        var vals = clean(runs.map(function (a) { return num(a[i]); }));
        if (!vals.length) return;
        any = true;
        var e = ensDay[day] || (ensDay[day] = { vals: [], gust: [], models: [] });
        e.vals = e.vals.concat(vals); e.gust = e.gust.concat(clean(gust.map(function (a) { return num(a[i]); })));
        e.models.push(m.id);
      });
      if (any) okE.push(m.id);
    });
    /* days */
    var days = [];
    for (var d = 0; d < DAYS; d++) {
      var key = dateKey(start + d * DAY), H = hours.filter(function (h) { return dateKey(h.t) === key && h.t >= start; });
      if (!H.length) continue;
      var windBy = {}, gustBy = {}, hsBy = {}, rainBy = {}, thunderBy = {};
      okW.forEach(function (id) {
        var v = H.map(function (h) { return h.by.w[id] ? h.by.w[id].w10 : null; });
        if (!clean(v).length) return;
        windBy[id] = maxOf(v);
        gustBy[id] = maxOf(H.map(function (h) { return h.by.w[id] ? h.by.w[id].g : null; }));
        rainBy[id] = sumOf(H.map(function (h) { return h.by.w[id] ? h.by.w[id].p : null; }));
        thunderBy[id] = H.some(function (h) { return h.by.w[id] && h.by.w[id].code >= 95; });
      });
      okV.forEach(function (id) {
        var v = H.map(function (h) { return h.by.v[id] ? h.by.v[id].hs : null; });
        if (clean(v).length) hsBy[id] = maxOf(v);
      });
      var ws = stats(values(windBy)), hss = stats(values(hsBy)), e = ensDay[key];
      var ens = e && e.vals.length >= 10 ? { n: e.vals.length, models: e.models, p10: quant(e.vals, 0.1), p50: med(e.vals), p90: quant(e.vals, 0.9),
        prob: e.vals.filter(function (v) { return v >= thrW; }).length / e.vals.length } : null;
      var wVals = values(windBy), hVals = values(hsBy), tVals = values(thunderBy);
      var probWind = ens ? { p: ens.prob, n: ens.n, src: 'ens' } : wVals.length ? { p: wVals.filter(function (v) { return v >= thrW; }).length / wVals.length, n: wVals.length, src: 'models' } : null;
      var probWave = hVals.length ? { p: hVals.filter(function (v) { return v >= thrH; }).length / hVals.length, n: hVals.length, src: 'models' } : null;
      days.push({
        date: key, lead: d, hours: H.length, wind: ws, windBy: windBy, gust: stats(values(gustBy)), gustBy: gustBy, hs: hss, hsBy: hsBy,
        hmax: hss.m === null ? null : hss.m * HMAX, dir: circ(H.map(function (h) { return h.dir; }), H.map(function (h) { return h.w10.m; })),
        rain: med(values(rainBy)), thunder: tVals.length ? tVals.filter(Boolean).length / tVals.length : null,
        ens: ens, probWind: probWind, probWave: probWave, conf: confidence(ws, hss, ens, d)
      });
    }
    var rep = { at: raw.at || now, now: now, lat: raw.lat, lon: raw.lon, windKt: thrW, waveM: thrH, hours: hours, days: days,
      ok: { wind: okW, wave: okV, ens: okE }, sources: sources(raw, okW, okV, okE) };
    rep.warn = warn24(rep);
    rep.summary = summary(rep);
    return rep;
  }
  function values(o) { return Object.keys(o).map(function (k) { return o[k]; }).filter(function (v) { return v !== null && v !== undefined; }); }

  /* how sure: the spread between models / runs against the size of the value, and how far ahead */
  function confidence(ws, hss, ens, lead) {
    var nW = ws.n, nV = hss.n;
    if (!nW && !nV) return { level: 0, label: '-', spread: null };
    var rw = null, rv = null;
    if (ens) rw = (ens.p90 - ens.p10) / Math.max(ens.p50, 8);
    else if (nW >= 2) rw = (ws.hi - ws.lo) / Math.max(ws.m, 8);
    if (nV >= 2) rv = (hss.hi - hss.lo) / Math.max(hss.m, 0.6);
    var r = Math.max(rw === null ? 0 : rw, rv === null ? 0 : rv);
    var level = r <= 0.35 ? 3 : r <= 0.7 ? 2 : 1;
    if (rw === null && rv === null) level = 1;         /* one source only: nothing to compare */
    if (lead >= 10) level = Math.min(level, 2);         /* day 11+: never "high" */
    return { level: level, label: ['-', L('Rendah'), L('Sederhana'), L('Tinggi')][level], spread: r, windSpread: rw, waveSpread: rv };
  }

  /* next 24 hours: squalls, lightning, going over the limits */
  function warn24(rep) {
    var now = rep.now, H = rep.hours.filter(function (h) { return h.t > now - HOUR && h.t <= now + 24 * HOUR; });
    var gustMax = [], capeMax = [], rain = [], thunder = [];
    rep.ok.wind.forEach(function (id) {
      var W = H.map(function (h) { return h.by.w[id]; }).filter(Boolean);
      if (!W.length) return;
      gustMax.push(maxOf(W.map(function (x) { return x.g; })));
      var c = maxOf(W.map(function (x) { return x.cape; })); if (c !== null) capeMax.push(c);
      rain.push(sumOf(W.map(function (x) { return x.p; })));
      thunder.push(W.some(function (x) { return x.code >= 95; }));
    });
    var gust = stats(gustMax), cape = med(capeMax), rainM = med(rain), tf = thunder.length ? thunder.filter(Boolean).length / thunder.length : 0;
    var lightning = cape === null && !thunder.length ? null : (cape !== null && cape >= 1500) || tf >= 0.6 ? 'high' : (cape !== null && cape >= 500) || tf >= 0.2 ? 'medium' : 'low';
    if (lightning === 'medium' && rainM !== null && rainM < 0.5 && tf === 0) lightning = 'low';   /* unstable air but no rain in any model */
    var lines = [];
    if (lightning && lightning !== 'low' && gust.m !== null) {
      var a = Math.max(20, Math.round(gust.m / 5) * 5), b = Math.max(a + 5, Math.round(gust.hi / 5) * 5);
      lines.push(L('Risiko squall {a}–{b} knot dalam hujan / ribut petir.', { a: a, b: b }));
    } else if (gust.hi !== null && gust.hi >= rep.windKt + 10) lines.push(L('Tiupan angin sehingga {b} knot.', { b: Math.round(gust.hi) }));
    var overW = H.filter(function (h) { return h.w10.m !== null && h.w10.m >= rep.windKt; });
    if (overW.length) lines.push(L('Angin ≥ {k} knot selama ~{h} jam, mula {from} (maks {m} knot).', { k: rep.windKt, h: overW.length, from: hhmm(overW[0].t), m: r0(maxOf(overW.map(function (h) { return h.w10.m; }))) }));
    var overH = H.filter(function (h) { return h.hs.m !== null && h.hs.m >= rep.waveM; });
    if (overH.length) lines.push(L('Ombak Hs ≥ {k} m selama ~{h} jam, mula {from} (maks {m} m).', { k: rep.waveM, h: Math.round(overH.length / Math.max(1, H.filter(function (h) { return h.hs.m !== null; }).length) * 24), from: hhmm(overH[0].t), m: r1(maxOf(overH.map(function (h) { return h.hs.m; }))) }));
    if (!lines.length) lines.push(L('Tiada amaran khas daripada model.'));
    return { lines: lines, lightning: lightning, lightningText: lightning === 'high' ? L('tinggi') : lightning === 'medium' ? L('sederhana') : lightning === 'low' ? L('rendah') : '-',
      gust: gust, cape: cape, rain: rainM, thunderShare: tf };
  }
  function hhmm(t) { var d = new Date(t + TZ_MS); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + (dateKey(t) !== dateKey(Date.now() + 0) ? ' (' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1) + ')' : ''); }

  /* next 48 hours in words, like the "comments" of a forecaster */
  function summary(rep) {
    var now = rep.now, H = rep.hours.filter(function (h) { return h.t >= now - HOUR && h.t <= now + 48 * HOUR; });
    var out = { wind: '', sea: '', swell: '', weather: '', season: '' };
    if (!H.length) return out;
    var w = H.map(function (h) { return h.w10.m; }), wlo = quant(w, 0.1), whi = quant(w, 0.9), wdir = circ(H.map(function (h) { return h.dir; }), w);
    if (wlo !== null) {
      var c1 = windClass(wlo), c2 = windClass(whi);
      out.wind = c1 === c2 ? L('Angin {dir} {c}, {a}–{b} knot.', { dir: dirWord(wdir), c: c1, a: r0(wlo), b: r0(whi) })
        : L('Angin {dir} {c1} hingga {c2}, {a}–{b} knot.', { dir: dirWord(wdir), c1: c1, c2: c2, a: r0(wlo), b: r0(whi) });
    }
    var hs = H.map(function (h) { return h.hs.m; }), hlo = quant(hs, 0.1), hhi = quant(hs, 0.9);
    if (hlo !== null) {
      var s1 = seaState(hlo), s2 = seaState(hhi);
      out.sea = (s1 === s2 ? L('Laut {c}', { c: s1 }) : L('Laut {c1} hingga {c2}', { c1: s1, c2: s2 })) +
        L(', Hs {a}–{b} m (ombak maks ~{m} m).', { a: r1(hlo), b: r1(hhi), m: r1(hhi * HMAX) });
    }
    var wh = med(H.map(function (h) { return h.wh; })), wt = med(H.map(function (h) { return h.wt; })), wd = circ(H.map(function (h) { return h.wd; }), H.map(function (h) { return h.wh; }));
    if (wh !== null) out.swell = L('Alun {dir} {c}, {h} m, tempoh {p} s.', { dir: dirWord(wd), c: swellClass(wh), h: r1(wh), p: r0(wt) });
    /* rain: which part of the day, and thunder */
    var parts = [0, 0, 0, 0], total = 0, th = 0;
    H.forEach(function (h) { if (h.p !== null) { parts[Math.floor(localHour(h.t) / 6)] += h.p; total += h.p; } if (h.thunder !== null && h.thunder >= 0.34) th++; });
    var names = [L('awal pagi'), L('pagi'), L('petang'), L('malam')], top = parts.indexOf(Math.max.apply(null, parts));
    out.weather = total < 1 ? L('Kebanyakannya kering; hujan sedikit sahaja dalam model.')
      : th ? L('Kemungkinan hujan dengan ribut petir, kebanyakannya waktu {p}.', { p: names[top] })
        : L('Kemungkinan hujan, kebanyakannya waktu {p}.', { p: names[top] });
    var mon = new Date(now + TZ_MS).getUTCMonth() + 1;
    if ([11, 12, 1, 2, 3].indexOf(mon) >= 0 && wdir !== null && (wdir >= 340 || wdir <= 110)) out.season = L('Angin dari arah timur laut selaras dengan Monsun Timur Laut (November–Mac).');
    else if ([5, 6, 7, 8, 9].indexOf(mon) >= 0 && wdir !== null && wdir >= 180 && wdir <= 290) out.season = L('Angin dari arah barat daya selaras dengan Monsun Barat Daya (Mei–September).');
    ['wind', 'sea', 'swell'].forEach(function (k) { out[k] = out[k] ? out[k].charAt(0).toUpperCase() + out[k].slice(1) : ''; });
    return out;
  }

  /* the chosen 3 / 7 / 14 days in a few lines */
  function outlook(rep, n) {
    var D = rep.days.slice(0, n), out = [];
    if (!D.length) return out;
    var peakW = D.reduce(function (a, b) { return (b.wind.m || 0) > (a.wind.m || 0) ? b : a; }), peakH = D.reduce(function (a, b) { return (b.hs.m || 0) > (a.hs.m || 0) ? b : a; });
    if (peakW.wind.m !== null) out.push(L('Angin paling kuat: {d}, ~{v} knot (model {lo}–{hi}).', { d: shortDay(peakW.date), v: r0(peakW.wind.m), lo: r0(peakW.wind.lo), hi: r0(peakW.wind.hi) }));
    if (peakH.hs.m !== null) out.push(L('Ombak paling tinggi: {d}, Hs ~{v} m (model {lo}–{hi}).', { d: shortDay(peakH.date), v: r1(peakH.hs.m), lo: r1(peakH.hs.lo), hi: r1(peakH.hs.hi) }));
    var risky = D.filter(function (x) { return (x.probWind && x.probWind.p >= 0.5) || (x.probWave && x.probWave.p >= 0.5); });
    out.push(risky.length ? L('Hari dengan peluang ≥50% melebihi had ({k} knot / {m} m): {list}.', { k: rep.windKt, m: rep.waveM, list: risky.map(function (x) { return shortDay(x.date); }).join(', ') })
      : L('Tiada hari dengan peluang ≥50% melebihi had ({k} knot / {m} m).', { k: rep.windKt, m: rep.waveM }));
    if (D.length >= 3) {
      var a = med(D.slice(0, 2).map(function (x) { return x.wind.m; })), b = med(D.slice(-2).map(function (x) { return x.wind.m; }));
      var ha = med(D.slice(0, 2).map(function (x) { return x.hs.m; })), hb = med(D.slice(-2).map(function (x) { return x.hs.m; }));
      var t = [];
      if (a !== null && b !== null) t.push(b - a >= 3 ? L('angin menguat') : a - b >= 3 ? L('angin melemah') : L('angin lebih kurang sama'));
      if (ha !== null && hb !== null) t.push(hb - ha >= 0.3 ? L('ombak meningkat') : ha - hb >= 0.3 ? L('ombak menurun') : L('ombak lebih kurang sama'));
      if (t.length) out.push(L('Trend hingga {d}: {t}.', { d: shortDay(D[D.length - 1].date), t: t.join(', ') }));
    }
    var low = D.filter(function (x) { return x.conf.level === 1; });
    if (low.length) out.push(L('Keyakinan rendah (model tidak sepakat): {list}.', { list: low.map(function (x) { return shortDay(x.date); }).join(', ') }));
    return out;
  }
  function shortDay(key) {
    var d = new Date(key + 'T00:00:00Z');
    var names = [L('Ahd'), L('Isn'), L('Sel'), L('Rab'), L('Kha'), L('Jum'), L('Sab')];
    return names[d.getUTCDay()] + ' ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1);
  }

  /* table rows: 3-hourly for 2 days, 6-hourly to day 7, then 12-hourly (like the forecast reports) */
  function rows(rep, n) {
    var day0 = Date.parse(dateKey(rep.now) + 'T00:00:00Z') - TZ_MS, endT = day0 + n * DAY;
    return rep.hours.filter(function (h) {
      if (h.t < rep.now - 90 * 60000 || h.t >= endT || h.w10.m === null) return false;
      var li = Math.floor((h.t - day0) / DAY), hr = localHour(h.t);
      return li < 2 ? hr % 3 === 2 : li < 7 ? [2, 8, 14, 20].indexOf(hr) >= 0 : [8, 20].indexOf(hr) >= 0;
    });
  }
  function sources(raw, okW, okV, okE) {
    function one(list, group, ok) {
      return list.map(function (m) {
        var r = raw[group] && raw[group][m.id];
        return { group: group, id: m.id, name: m.name, by: m.by, link: m.link, runs: m.runs || 0, days: m.days, ok: ok.indexOf(m.id) >= 0, error: r && !r.ok ? r.error : (r ? '' : L('belum dibaca')) };
      });
    }
    return one(WIND, 'wind', okW).concat(one(WAVE, 'wave', okV), one(ENS, 'ens', okE));
  }
  function fileName(name, t) {
    var d = new Date((t || Date.now()) + TZ_MS);
    return String(name || 'Offshore').replace(/\(.*?\)/g, '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' +
      d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + '_' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '_LT';
  }

  return { DAYS: DAYS, HMAX: HMAX, WIND: WIND, WAVE: WAVE, ENS: ENS, urls: urls, collect: collect, build: build, rows: rows, outlook: outlook,
    compass16: compass16, windClass: windClass, seaState: seaState, shortDay: shortDay, fileName: fileName, dateKey: dateKey, quant: quant, circ: circ };
});
