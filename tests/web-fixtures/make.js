/* made-up Open-Meteo forecast around "now" + mirror files built from the real JPS / tide pages in this folder */
'use strict';
const fs = require('fs'), path = require('path');
/* the JPS parser: mirror/parse.js (Monsoon EYE, the original app) or the page's copy; OceanWATCH has neither (no JPS) */
let P = null;
for (const m of ['../../mirror/parse', '../../www/assets/js/mirror-parse']) { try { P = require(m); break; } catch (e) { /* not in this app */ } }
const dir = __dirname;
function pad(n) { return String(n).padStart(2, '0'); }
function local(ms) { const d = new Date(ms + 8 * 3600000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':00'; }
function forecast(now, opts) {
  opts = opts || {};
  const start = Date.parse(local(now).slice(0, 10) + 'T00:00:00+08:00');
  const H = { time: [], temperature_2m: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [] };
  for (let i = 0; i < 16 * 24; i++) {
    const t = start + i * 3600000;
    H.time.push(local(t)); H.temperature_2m.push(26 + 4 * Math.sin(i / 24 * 2 * Math.PI - 1.5)); H.precipitation_probability.push(i % 24 > 14 ? 70 : 20);
    H.precipitation.push(i % 24 === 16 ? 6.5 : i % 24 === 17 ? 2 : 0); H.weather_code.push(i % 24 === 16 ? 95 : 3);
    H.wind_speed_10m.push(18 + (i % 24) / 2); H.wind_gusts_10m.push((opts.gust || 35) + (i % 24) / 2); H.wind_direction_10m.push(45);
  }
  const D = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [], precipitation_probability_max: [], wind_speed_10m_max: [], wind_gusts_10m_max: [], wind_direction_10m_dominant: [], sunrise: [], sunset: [] };
  for (let d = 0; d < 16; d++) {
    const day = local(start + d * 86400000).slice(0, 10);
    D.time.push(day); D.weather_code.push(d % 3 ? 61 : 95); D.temperature_2m_max.push(31); D.temperature_2m_min.push(23); D.precipitation_sum.push(8.5 + d);
    D.precipitation_probability_max.push(70); D.wind_speed_10m_max.push(30); D.wind_gusts_10m_max.push(opts.gust ? opts.gust + 12 : 47); D.wind_direction_10m_dominant.push(40);
    D.sunrise.push(day + 'T06:55'); D.sunset.push(day + 'T18:50');
  }
  return { utc_offset_seconds: 28800, timezone: 'Asia/Kuala_Lumpur', current: { time: local(now), temperature_2m: 27.4, apparent_temperature: 31, relative_humidity_2m: 84, precipitation: 0.2, weather_code: 80, wind_speed_10m: 22, wind_direction_10m: 45, wind_gusts_10m: opts.gust || 38, is_day: 1 }, hourly: H, daily: D };
}
/* the real marine / ensemble samples shifted so that they start today */
function shiftOpenMeteo(file, now) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const first = (j.hourly || j.daily).time[0];
  const delta = Date.parse(local(now).slice(0, 10) + 'T00:00:00Z') - Date.parse(first.slice(0, 10) + 'T00:00:00Z');
  const sh = t => { const ms = Date.parse((t.length === 10 ? t + 'T00:00' : t) + ':00Z') + delta; const s = new Date(ms).toISOString(); return t.length === 10 ? s.slice(0, 10) : s.slice(0, 16); };
  if (j.hourly) j.hourly.time = j.hourly.time.map(sh);
  if (j.daily) j.daily.time = j.daily.time.map(sh);
  return j;
}
function mirror(now) {
  const iso = new Date(now).toISOString();
  if (!P) return { jps: { state: 'TRG', at: iso, water: [], rain: { days: [], stations: [] }, errors: {} }, tide: { place: 'cukai', at: iso, events: [], error: null } };
  const water = P.jpsWater(fs.readFileSync(path.join(dir, 'jps-water-TRG.html'), 'utf8'));
  const rain = P.jpsRain(fs.readFileSync(path.join(dir, 'jps-rain-TRG.html'), 'utf8'));
  /* make the readings recent */
  const stamp = local(now - 20 * 60000).replace('T', 'T') + ':00+08:00';
  water.forEach(s => { s.updated = stamp; });
  rain.stations.forEach(s => { s.updated = stamp; });
  const tides = P.tides(fs.readFileSync(path.join(dir, 'tide-cukai.html'), 'utf8'), Date.parse('2026-11-20T13:00:00Z'));
  const shift = Date.parse(local(now).slice(0, 10) + 'T00:00:00Z') - Date.parse('2026-11-20T00:00:00Z');
  tides.forEach(e => { e.time = new Date(Date.parse(e.time) + shift).toISOString(); });
  return {
    jps: { state: 'TRG', at: iso, water, rain, waterAt: iso, rainAt: iso, waterUrl: 'https://publicinfobanjir.water.gov.my/aras-air/data-paras-air/aras-air-data/?state=TRG&district=ALL&station=ALL&lang=en', rainUrl: 'https://publicinfobanjir.water.gov.my/x', errors: {} },
    tide: { place: 'cukai', at: iso, url: 'https://www.tide-forecast.com/locations/Cukai/tides/latest', events: tides, eventsAt: iso, error: null }
  };
}
function warnings(now) {
  const w = JSON.parse(fs.readFileSync(path.join(dir, 'dg-warning.json'), 'utf8'));
  const f = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 19);
  w.forEach((x, i) => { if (x.valid_to) { x.valid_from = f(now - 3600000); x.valid_to = f(now + (i + 1) * 6 * 3600000); } });
  return w;
}
function metForecast(now) {
  const f = JSON.parse(fs.readFileSync(path.join(dir, 'dg-forecast-ds.json'), 'utf8'));
  const start = Date.parse(local(now).slice(0, 10) + 'T00:00:00Z');
  f.sort((a, b) => a.date < b.date ? -1 : 1).forEach((x, i) => { x.date = new Date(start + i * 86400000).toISOString().slice(0, 10); });
  return f;
}

/* made-up offshore model answers (Open-Meteo, one model per request): each model a little different, short models stop early */
const OFF_W = { ecmwf_ifs025: [0, 15], gfs_seamless: [1.5, 16], icon_seamless: [-1, 7], jma_seamless: [0.5, 11], meteofrance_seamless: [-0.5, 4], ukmo_seamless: [1, 7] };
const OFF_V = { ecmwf_wam025: [0, 15, 3], ncep_gfswave025: [0.15, 16, 1], meteofrance_wave: [-0.1, 10, 3], dwd_gwam: [0.05, 7, 1] };
function offshore(url, now) {
  const u = new URL(url), model = u.searchParams.get('models'), days = 14;
  const start = Date.parse(local(now).slice(0, 10) + 'T00:00:00+08:00');
  if (/ensemble-api/.test(url)) {
    const runs = model === 'gfs025' ? 31 : 51, D = { time: [] };
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let d = 0; d < days; d++) D.time.push(local(start + d * 86400000).slice(0, 10));
    for (let m = 0; m < runs; m++) {
      const k = m ? '_member' + String(m).padStart(2, '0') : '';
      D['wind_speed_10m_max' + k] = D.time.map((t, d) => d >= (model === 'gfs025' ? 10 : 15) ? null : Math.round((15 + 4 * Math.sin(d / 2) + (rnd() - 0.5) * (2 + d)) * 10) / 10);
      D['wind_gusts_10m_max' + k] = D['wind_speed_10m_max' + k].map(v => v === null ? null : Math.round(v * 13.5) / 10);
    }
    return { utc_offset_seconds: 28800, daily: D };
  }
  const H = { time: [] };
  const past = u.searchParams.get('forecast_days') === '1' ? +(u.searchParams.get('past_days') || 0) : 0;
  if (past) {
    /* history charts: the past days (+1 day), only what was asked */
    const s0 = start - past * 86400000, P = { time: [] };
    for (let t = s0; t < start + 86400000; t += 3600000) P.time.push(local(t));
    (u.searchParams.get('hourly') || '').split(',').forEach(k => {
      P[k] = P.time.map((t, i) => Math.round((/wave|swell/.test(k) ? 1.2 + 0.4 * Math.sin(i / 20) : /gust/.test(k) ? 20 + 6 * Math.sin(i / 15) : /wind/.test(k) ? 14 + 5 * Math.sin(i / 15) : 27.5 + Math.sin(i / 24 * 6.283)) * 100) / 100);
    });
    return { utc_offset_seconds: 28800, hourly: P };
  }
  for (let i = 0; i < days * 24; i++) H.time.push(local(start + i * 3600000));
  /* advisor (land): rain only, several places in one request -> one answer per place; heavy rain on day 2 afternoon */
  if (u.searchParams.get('hourly') === 'precipitation') {
    const lats = (u.searchParams.get('latitude') || '').split(','), [off] = OFF_W[model] || [0];
    /* plus some rain 3 to 8 hours from now, so the next 24 hours are never dry whatever the time of day */
    const soon = i => { const h = (start + i * 3600000 - now) / 3600000; return h >= 3 && h < 8 ? 3 : 0; };
    const one = k => ({ utc_offset_seconds: 28800, hourly: { time: H.time, precipitation: H.time.map((t, i) => i >= 24 + 12 && i < 24 + 18 ? Math.max(0, 14 + off * 3 - k) : i % 24 === 15 ? 1.5 : soon(i)) } });
    const list = lats.map((x, k) => one(k));
    return list.length > 1 ? list : list[0];
  }
  if (/marine-api/.test(url)) {
    const [off, len, step] = OFF_V[model] || [0, 7, 1], f = (i, v) => (i >= len * 24 || i % step ? null : Math.round(v * 100) / 100);
    H.wave_height = H.time.map((t, i) => f(i, 1.35 + 0.45 * Math.sin(i / 40) + off));
    H.wave_direction = H.time.map((t, i) => f(i, 45));
    H.wave_period = H.time.map((t, i) => f(i, 6));
    H.wind_wave_height = H.time.map((t, i) => f(i, 0.6 + 0.2 * Math.sin(i / 30)));
    H.wind_wave_direction = H.time.map((t, i) => f(i, 60));
    H.wind_wave_period = H.time.map((t, i) => f(i, 3));
    H.wind_wave_peak_period = H.time.map((t, i) => f(i, 4));
    H.swell_wave_height = H.time.map((t, i) => f(i, 1.1 + 0.3 * Math.sin(i / 50)));
    H.swell_wave_direction = H.time.map((t, i) => f(i, 40));
    H.swell_wave_period = H.time.map((t, i) => f(i, 6.5));
    H.swell_wave_peak_period = H.time.map((t, i) => f(i, 7));
    return { utc_offset_seconds: 28800, hourly: H };
  }
  const [off, len] = OFF_W[model] || [0, 7], f = (i, v) => (i >= len * 24 ? null : Math.round(v * 10) / 10);
  const w = i => 12 + 5 * Math.sin(2 * Math.PI * i / 30) + off;
  H.wind_speed_10m = H.time.map((t, i) => f(i, w(i)));
  H.wind_speed_80m = H.time.map((t, i) => f(i, w(i) * 1.15));
  H.wind_gusts_10m = H.time.map((t, i) => f(i, w(i) * 1.4));
  H.wind_direction_10m = H.time.map((t, i) => f(i, 45 + 15 * Math.sin(i / 12)));
  H.temperature_2m = H.time.map((t, i) => f(i, 27.5 + Math.sin(i / 24 * 2 * Math.PI)));
  H.precipitation = H.time.map((t, i) => f(i, i % 24 >= 14 && i % 24 <= 16 ? 2.5 : 0));
  H.cape = H.time.map((t, i) => f(i, i % 24 >= 12 && i % 24 <= 17 ? 900 : 150));
  H.weather_code = H.time.map((t, i) => f(i, i % 24 === 15 && /ecmwf|gfs/.test(model) ? 95 : i % 24 === 14 ? 61 : 3));
  return { utc_offset_seconds: 28800, hourly: H };
}
function isOffshore(url) { const q = new URL(url).searchParams, m = q.get('models') || ''; return (m && m !== 'gfs05') || (!!q.get('past_days') && q.get('forecast_days') === '1'); }

/* JPS graph data (5-minute) for the last 14 days, made from the real sample shape: a slow rise then a fall */
function wlSeries(now) {
  const end = Math.floor(now / 300000) * 300000, values = [];
  const f = t => { const d = new Date(t + 8 * 3600000); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear() + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  for (let t = end - 14 * 86400000; t <= end; t += 300000) {
    const h = (end - t) / 3600000, v = 29.1 + 0.6 * Math.exp(-Math.pow((h - 100) / 30, 2)) + 0.02 * Math.sin(h);
    values.push({ dt: f(t), clean: v.toFixed(2), raw: v.toFixed(2), ecm: v.toFixed(2), final: v.toFixed(2), severity: 'SL_NML' });
  }
  return { info: { name: 'Sg. Mas di Kg. Sg. Mas (F2)', normal: '29', alert: '31', warning: '31.5', danger: '32', count: values.length }, values };
}
function rfSeries(now) {
  const end = Math.floor(now / 300000) * 300000, values = [];
  const f = t => { const d = new Date(t + 8 * 3600000); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear() + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  /* like JPS: clean = rain of the last 60 minutes (moving total), cyearly = the year's counter (its steps are the rain of each reading) */
  let y = 500;
  for (let t = end - 14 * 86400000; t <= end; t += 300000) { const h = (end - t) / 3600000, r = h > 96 && h < 110 ? 0.5 : 0; y += r; values.push({ dt: f(t), raw: r, clean: h > 96 && h < 110 ? Math.min(6, (110 - h) * 6) : 0, cyearly: Math.round(y * 10) / 10 }); }
  return { info: { name: 'Kg. Sg. Mas (F2)', light: '10', moderate: '30', heavy: '60', veryheavy: '90', count: values.length }, values };
}


/* Kemaman page (mirror folder kemaman/): 8 water level + 17 rain gauges, 5-minute data.
   now.json = 26 hours of 5-minute levels, 7 days of hourly rain, 3 hours of 5-minute rain; wl-<gid> / rf-<gid> = 30 days of 5-minute data.
   A rain event in the last day: Sg. Cherul (Ban Ho) rises into Amaran, the rest stay lower; the tidal gauges swing with the tide. */
function kemaman(now) {
  const m = mirror(now), W = m.jps.water.filter(s => s.district === 'Kemaman'), R0 = m.jps.rain.stations.filter(s => s.district === 'Kemaman');
  const STEP = 5 * 60000, end = Math.floor((now - 15 * 60000) / STEP) * STEP, N30 = 30 * 288, t30 = end - (N30 - 1) * STEP;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
  /* rain events (hours before "end", length h, mm/h peak): an old one 12 days ago, one 4 days ago, the big one 14-4 hours ago */
  const EV = [[12 * 24 + 6, 8, 9], [4 * 24 + 10, 5, 6], [14, 10, 22], [1.2, 3, 8]];
  const rainAt = (t, k) => { const hb = (end - t) / 3600000; let v = 0;
    EV.forEach(([a, len, pk]) => { const x = (a - hb) / len; if (x >= 0 && x <= 1) v += pk * Math.sin(Math.PI * x) * (0.55 + 0.9 * ((k * 37 % 11) / 11)); });
    return v; };
  const POS = {
    'Sg. Mas di Kg. Sg. Mas (F2)': [4.128, 103.168], 'Sg. Kemaman di Jamb. Air Putih (F2)': [4.318, 103.186], 'Sg. Kemaman di Kg. Rantau Panjang (F2)': [4.262, 103.306],
    'Sg. Cherul di Jambatan Ban Ho': [4.352, 103.292], 'Sg. Kemaman di Rumah Pam Paya Paman': [4.252, 103.372], 'Sg. Cukai di Kg. Yak Yah (F2)': [4.206, 103.398],
    'Sg. Tumpat di Kg. Baru Kemasik': [4.428, 103.448], 'Muara Sg. Kemaman di Kg. Geliga (F2)': [4.243, 103.424] };
  const water = W.map((st, k) => {
    const gid = st.gid || String(9000 + k), tidal = /muara|paya paman|yak yah|kemasik/i.test(st.name), banHo = /ban ho/i.test(st.name);
    const base = banHo ? st.alert - 1.6 : st.level, gain = banHo ? 2.9 : /Sg. Mas di/.test(st.name) ? 2.3 : tidal ? 0.35 : 0.9 + (k % 3) * 0.3, tp = (tidal ? 11 : banHo ? 9 : 6 + k % 3) * 3600000;
    const v = [];
    for (let i = 0; i < N30; i++) {
      const t = t30 + i * STEP; let x = base + (rnd() - 0.5) * 0.01;
      EV.forEach(([a, len, pk]) => { const dt = t - (end - (a - len / 2) * 3600000); if (dt > 0) x += gain * pk / 22 * (dt / tp) * Math.exp(1 - dt / tp); });
      if (tidal) x += 0.55 * Math.sin(2 * Math.PI * (t / 3600000) / 12.42 + k);
      v.push(i % 997 === 500 ? null : r2(x));
    }
    const last = v[v.length - 1];
    return Object.assign({}, st, { gid, level: last, tidal, updated: new Date(end + 8 * 3600000).toISOString().slice(0, 19) + '+08:00', _v: v });
  });
  const RPOS = { 'Hulu Jabor': [4.062, 103.205], 'Jambatan Ban Ho': [4.352, 103.292], 'Kg. Baru Kemasik': [4.428, 103.448], 'Jambatan Air Putih': [4.318, 103.186], 'Rumah Pam Paya Paman': [4.252, 103.372],
    'JPS Kemaman': [4.231, 103.418], 'Yak Yah': [4.206, 103.398], 'SMK Neram (F2)': [4.296, 103.246], 'Jambatan Air Putih (F2)': [4.321, 103.19], 'Hulu Jabor (F2)': [4.066, 103.21],
    'Jambatan Tebak (F2)': [4.188, 103.252], 'Seri Bandi (F2)': [4.178, 103.352], 'Kg. Yak Yah (F2)': [4.209, 103.401], 'Kg. Rantau Panjang (F2)': [4.262, 103.306],
    'Kg. Sg. Mas (F2)': [4.128, 103.168], 'Bukit Teruna Kijal (F2)': [4.342, 103.468], 'Kuarter JPS di Dusun Nyior (F2)': [4.115, 103.322] };
  const rain = R0.map((st, k) => {
    const gid = st.gid || String(8000 + k), v = [];
    for (let i = 0; i < N30; i++) { const t = t30 + i * STEP, x = rainAt(t, k) / 12; v.push(x > 0.05 ? r1(x * (0.6 + 0.8 * rnd())) : 0); }
    return Object.assign({}, st, { gid, updated: new Date(end + 8 * 3600000).toISOString().slice(0, 19) + '+08:00', _v: v });
  });
  const tail = (v, n) => v.slice(v.length - n);
  const hourly = v => { const out = []; for (let i = v.length - 168 * 12; i < v.length; i += 12) out.push(r1(v.slice(i, i + 12).reduce((a, b) => a + (b || 0), 0))); return out; };
  const nowJson = {
    v: 1, at: new Date(end + 5 * 60000).toISOString(), end: end, step: 5,
    water: water.map(st => { const o = Object.assign({}, st); delete o._v; o.s = tail(st._v, 26 * 12); return o; }),
    rain: rain.map(st => { const o = Object.assign({}, st); delete o._v; o.h = hourly(st._v); o.m = tail(st._v, 36); return o; })
  };
  const files = {};
  water.forEach(st => { files['wl-' + st.gid + '.json'] = { v: 1, gid: st.gid, end: end, step: 5, s: st._v }; });
  rain.forEach(st => { files['rf-' + st.gid + '.json'] = { v: 1, gid: st.gid, end: end, step: 5, s: st._v }; });
  return { now: nowJson, files };
}

/* the river flow tab: real GloFAS answers (Open-Meteo, 21/11/2026, cell 4.225 103.375), dates moved so that "today" is today (GMT) */
function glofas(url, now) {
  const u = new URL(url), g = f => JSON.parse(fs.readFileSync(path.join(dir, 'glofas', f), 'utf8'));
  let j;
  if (/consolidated_v4/.test(url)) return g('hist.json');
  if ((u.searchParams.get('latitude') || '').includes(',')) j = g('up.json');
  else if (u.searchParams.get('ensemble') === 'true') j = g('ens.json');
  else if (u.searchParams.get('forecast_days') === '210') j = g('long.json');
  else if (/river_discharge_p25/.test(url) && u.searchParams.get('past_days') === '92') j = g('stats.json');
  else return null;
  const shift = Math.round((Date.parse(new Date(now).toISOString().slice(0, 10)) - Date.parse('2026-11-21')) / 86400000);
  const mv = d => new Date(Date.parse(d) + shift * 86400000).toISOString().slice(0, 10);
  (Array.isArray(j) ? j : [j]).forEach(o => { o.daily.time = o.daily.time.map(mv); });
  return j;
}
module.exports = { glofas, kemaman, wlSeries, rfSeries, offshore, isOffshore, forecast, shiftOpenMeteo, mirror, warnings, metForecast, local };
