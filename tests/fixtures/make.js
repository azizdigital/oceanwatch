'use strict';
/* Made-up but realistic data in the exact shape of each source, built around "now".
   Used by tests/unit.js and by `node server-only.js --mock` (Playwright tests, demo without internet). */
const core = require('../../www/assets/js/core');

const pad = n => (n < 10 ? '0' : '') + n;
function mytStr(ms, withMin) {
  const p = core.myt(ms);
  return p.y + '-' + pad(p.mo) + '-' + pad(p.d) + (withMin ? 'T' + pad(p.h) + ':' + pad(p.mi) : '');
}
function dmy(ms) {
  const p = core.myt(ms); let h = p.h % 12; if (h === 0) h = 12;
  return pad(p.d) + '/' + pad(p.mo) + '/' + p.y + ' ' + h + ':' + pad(p.mi) + ' ' + (p.h < 12 ? 'AM' : 'PM');
}
function dayStart(ms) { return core.localMs(core.dateKey(ms)); }

/* offshore = the request is for a point out at sea (latitude > 5): windier, a thunderstorm and poor visibility ahead */
function openMeteo(now, offshore) {
  const start = dayStart(now) - 2 * 86400000, hourStart = Math.floor(now / 3600000) * 3600000;
  const time = [], p = [], pp = [], temp = [], code = [], gust = [], wind = [], dir = [], vis = [], cape = [];
  for (let i = 0; i < 24 * 9; i++) {
    const t = start + i * 3600000, ahead = (t - hourStart) / 3600000;
    time.push(mytStr(t, true));
    const rain = ahead >= 0 && ahead < 3 ? 8.5 : ahead >= 3 && ahead < 10 ? 2.2 : (i % 7 === 0 ? 1.4 : 0);
    p.push(rain); pp.push(rain > 0 ? 85 : 20); temp.push(24 + 4 * Math.sin(i / 24 * Math.PI * 2));
    if (offshore) {
      code.push(ahead === 2 ? 95 : rain > 5 ? 65 : rain > 0 ? 61 : 3); gust.push(ahead >= 0 && ahead < 8 ? 64 : 42); wind.push(ahead >= 0 && ahead < 8 ? 46 : 30);
      vis.push(ahead === 3 ? 1500 : 12000); cape.push(ahead >= 0 && ahead < 6 ? 1600 : 400);
    } else {
      code.push(rain > 5 ? 65 : rain > 0 ? 61 : 3); gust.push(28 + (i % 5)); wind.push(14 + (i % 4)); vis.push(16000); cape.push(200);
    }
    dir.push(35);
  }
  const daily = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [], precipitation_probability_max: [], wind_gusts_10m_max: [] };
  for (let d = 0; d < 9; d++) {
    const t = start + d * 86400000;
    daily.time.push(mytStr(t)); daily.weather_code.push(d === 2 ? 65 : 61); daily.temperature_2m_max.push(30); daily.temperature_2m_min.push(23);
    daily.precipitation_sum.push(d === 2 ? 48.2 : 6.1); daily.precipitation_probability_max.push(d === 2 ? 95 : 60); daily.wind_gusts_10m_max.push(36);
  }
  return {
    latitude: 4.23, longitude: 103.42, utc_offset_seconds: 28800, timezone: 'Asia/Kuala_Lumpur',
    current: { time: mytStr(Math.floor(now / 900000) * 900000, true), temperature_2m: 25.4, relative_humidity_2m: 94, apparent_temperature: 28.9, precipitation: 3.2,
      weather_code: 63, wind_speed_10m: offshore ? 46 : 14.2, wind_direction_10m: 35, wind_gusts_10m: offshore ? 62 : 31 },
    hourly: { time, precipitation: p, precipitation_probability: pp, temperature_2m: temp, weather_code: code, wind_gusts_10m: gust, wind_speed_10m: wind, wind_direction_10m: dir, visibility: vis, cape },
    daily
  };
}

function marine(now, offshore) {
  const start = dayStart(now), time = [], wave = [], period = [], sea = [], wdir = [], wwave = [], swell = [], sper = [], sdir = [];
  const base = offshore ? 2.4 : 1.3;
  for (let i = 0; i < 72; i++) {
    const t = start + i * 3600000;
    time.push(mytStr(t, true)); wave.push(+(base + 0.4 * Math.sin(i / 9)).toFixed(2)); period.push(6.5); sea.push(+(0.9 * Math.sin(i / 12.42 * Math.PI * 2)).toFixed(2));
    wdir.push(40); wwave.push(+(base * 0.7).toFixed(2)); swell.push(+(base * 0.6).toFixed(2)); sper.push(9); sdir.push(55);
  }
  return { utc_offset_seconds: 28800, hourly: { time, wave_height: wave, wave_period: period, sea_level_height_msl: sea, wave_direction: wdir, wind_wave_height: wwave,
    swell_wave_height: swell, swell_wave_period: sper, swell_wave_direction: sdir } };
}

function metForecast(now) {
  const out = [];
  for (let d = 0; d < 7; d++) {
    const date = mytStr(now + d * 86400000);
    out.push({ location: { location_id: 'Ds065', location_name: 'Kemaman' }, date, morning_forecast: 'Hujan di kebanyakan tempat', afternoon_forecast: 'Ribut petir di kebanyakan tempat',
      night_forecast: d === 0 ? 'Hujan menyeluruh' : 'Ribut petir di beberapa tempat', summary_forecast: d === 0 ? 'Hujan menyeluruh' : 'Ribut petir di kebanyakan tempat', summary_when: 'Petang', min_temp: 22, max_temp: 30 });
    out.push({ location: { location_id: 'Tn098', location_name: 'Kemaman' }, date, morning_forecast: 'Hujan', afternoon_forecast: 'Ribut petir', night_forecast: 'Ribut petir', summary_forecast: 'Ribut petir', summary_when: 'Petang', min_temp: 22, max_temp: 30 });
  }
  return out;
}

/* MET writes its times in words: "2:00 PM; Wednesday, 18 November 2026" / "2:00 Petang; Rabu, 18 November 2026" */
function metWords(ms, bm) {
  const d = new Date(ms + 8 * 3600000);
  const DE = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], DB = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
  const ME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MB = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
  const day = (bm ? DB : DE)[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + (bm ? MB : ME)[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  const h = d.getUTCHours(), h12 = h % 12 || 12, mm = String(d.getUTCMinutes()).padStart(2, '0');
  return { day, at: h12 + ':' + mm + ' ' + (bm ? (h < 12 ? 'Pagi' : h < 19 ? 'Petang' : 'Malam') : (h < 12 ? 'AM' : 'PM')) + '; ' + day };
}
function seaWarning(now) {
  const top = (now - now % 3600000) + 4 * 3600000;
  const t = metWords(top), tb = metWords(top, true), a = metWords(now + 86400000), ab = metWords(now + 86400000, true), b = metWords(now + 5 * 86400000), bb = metWords(now + 5 * 86400000, true);
  return {
    heading_en: 'FIRST CATEGORY WARNING ON STRONG WINDS AND ROUGH SEAS',
    text_en: 'SECTION A: FOR MALAYSIAN WATERS [WITHIN 24 NAUTICAL MILES] 1) THUNDERSTORMS WARNING Thunderstorms, heavy rain and strong winds are expected over the waters of Perak • Selangor • Pahang • Terengganu • Kelantan • Sarawak • Lahad Datu until ' + t.at + '. This condition may cause strong winds up to 50 kmph and rough seas with wave height up to 3.5 metres and is dangerous to small boats. SECTION B: FOR SHIPPING 1) WARNING ON STRONG WINDS AND ROUGH SEAS (FIRST CATEGORY) Strong northeasterly winds of 40 - 50 kmph with wave height up to 3.5 metres are expected over the waters of Condore • Western part of Reef North • Southeastern Samui • Northern Tioman within the period of ' + a.day + ' until ' + b.day + '. This condition of strong winds and rough seas is dangerous to small crafts, recreational sea activities and water sports. 2) THUNDERSTORMS WARNING Thunderstorms, heavy rain and strong winds are expected over the waters of Samui • Tioman • Straits Of Melaka • Condore • Reef South • Bunguran • Reef North • Eastern part of Phuket • Layang-Layang until ' + t.at + '. This condition may cause strong winds up to 50 kmph and rough seas with wave height up to 3.5 metres and is dangerous to small boats.',
    instruction_en: 'Keadaan angin kencang dan laut bergelora ini adalah berbahaya.',
    heading_bm: 'AMARAN KATEGORI PERTAMA ANGIN KENCANG DAN LAUT BERGELORA',
    text_bm: 'SEKSYEN A: UNTUK PERAIRAN MALAYSIA [DALAM LINGKUNGAN 24 BATU NAUTIKA] 1) AMARAN RIBUT PETIR Ribut petir, hujan lebat dan angin kencang dijangka berlaku di kawasan perairan Perak • Selangor • Pahang • Terengganu • Kelantan • Sarawak • Lahad Datu sehingga ' + tb.at + '. Keadaan ini boleh menyebabkan angin kencang sehingga 50 kmsj dan laut bergelora dengan ketinggian ombak sehingga 3.5 meter dan berbahaya kepada bot-bot kecil. SEKSYEN B: UNTUK PERKAPALAN 1) AMARAN ANGIN KENCANG DAN LAUT BERGELORA (KATEGORI PERTAMA) Angin kencang timur laut berkelajuan 40 - 50 kmsj dengan ketinggian ombak sehingga 3.5 meter dijangka berlaku di kawasan perairan Condore • Bahagian barat Reef North • Tenggara Samui • Utara Tioman dalam tempoh ' + ab.day + ' hingga ' + bb.day + '. Keadaan angin kencang dan laut bergelora ini berbahaya kepada kapal-kapal kecil, aktiviti rekreasi laut dan sukan air. 2) AMARAN RIBUT PETIR Ribut petir, hujan lebat dan angin kencang dijangka berlaku di kawasan perairan Samui • Tioman • Selat Melaka • Condore • Reef South • Bunguran • Reef North • Bahagian timur Phuket • Layang-Layang sehingga ' + tb.at + '. Keadaan ini boleh menyebabkan angin kencang sehingga 50 kmsj dan laut bergelora dengan ketinggian ombak sehingga 3.5 meter dan berbahaya kepada bot-bot kecil.',
    instruction_bm: 'Keadaan angin kencang dan laut bergelora ini adalah berbahaya.'
  };
}

function metWarning(now) {
  const iso = ms => mytStr(ms, true) + ':00';
  return [
    { warning_issue: { issued: iso(now - 3 * 3600000), title_bm: 'Amaran Hujan Berterusan (Waspada)', title_en: 'Continuous Rain Warning (Alert Level)' },
      valid_from: iso(now - 3 * 3600000), valid_to: iso(now + 30 * 3600000),
      heading_en: 'Continuous rain is expected', heading_bm: 'Hujan berterusan dijangka berlaku',
      text_en: 'Terengganu: Besut, Setiu, Kuala Nerus, Kuala Terengganu, Marang, Hulu Terengganu, Dungun and Kemaman.',
      text_bm: 'Terengganu: Besut, Setiu, Kuala Nerus, Kuala Terengganu, Marang, Hulu Terengganu, Dungun dan Kemaman.', instruction_en: '', instruction_bm: '' },
    { warning_issue: { issued: iso(now - 5 * 3600000), title_bm: 'Amaran Ribut Petir', title_en: 'Thunderstorm Warning' },
      valid_from: iso(now - 5 * 3600000), valid_to: iso(now + 2 * 3600000), heading_en: '', heading_bm: '', text_en: 'Sabah: Tawau.', text_bm: 'Sabah: Tawau.', instruction_en: '', instruction_bm: '' },
    /* real MET format (18 Nov 2026), sent three times with different validity windows - the app must show it once */
    ...[[0, 30], [-1, 5], [-2, 5]].map(([a, b]) => Object.assign({ warning_issue: { issued: iso(now - 2 * 3600000), title_bm: 'Amaran Angin Kencang dan Laut Bergelora', title_en: 'Strong Winds and Rough Seas Warning' },
      valid_from: iso(now + a * 3600000), valid_to: iso(now + b * 3600000) }, seaWarning(now))),
    { warning_issue: { issued: iso(now - 50 * 3600000), title_bm: 'Amaran Lama', title_en: 'Old warning' },
      valid_from: iso(now - 50 * 3600000), valid_to: iso(now - 20 * 3600000), heading_en: '', heading_bm: '', text_en: 'Terengganu', text_bm: 'Terengganu', instruction_en: '', instruction_bm: '' }
  ];
}

/* data.gov.my flood-warning: what it returned for Kemaman in Nov 2026 - old readings from Feb 2024 */
function flood() {
  return [
    { station_id: '4131401', station_name: 'Sg. Cherul di Ban Ho Terengganu (RHN)', district: 'Kemaman', state: 'TERENGGANU', main_basin: 'Sungai Kemaman', station_type: 'WLRF',
      water_level_current: 10.7, water_level_indicator: 'NORMAL', water_level_normal_level: 8.0, water_level_alert_level: 9.0, water_level_warning_level: 10.0, water_level_danger_level: 19.0,
      water_level_trend: 'NO CHANGE', water_level_update_datetime: '2024-02-23 14:45:00', rainfall_latest_1hr: 0, rainfall_total_today: 0, water_level_status: 'ON' },
    { station_id: '4232402', station_name: 'Sg. Kemaman di Jambatan Air Putih (F2)', district: 'Kemaman', state: 'TERENGGANU', main_basin: 'Sungai Kemaman', station_type: 'WL',
      water_level_current: -9999, water_level_indicator: 'NORMAL', water_level_update_datetime: '2024-02-23 14:30:00', water_level_status: 'ON' }
  ];
}

/* infobanjir tables as the scraper returns them (rowspan / colspan already expanded) */
function waterTables(now) {
  const t = dmy(now - 10 * 60000);
  const H = 'Paras Air (m)';
  return [{ rows: [
    ['Bil', 'Nama Stesen', 'Daerah', 'Lembangan', 'Masa Kemaskini', H, H, H, H, H],
    ['Bil', 'Nama Stesen', 'Daerah', 'Lembangan', 'Masa Kemaskini', 'Semasa', 'Normal', 'Waspada', 'Amaran', 'Bahaya'],
    ['1', 'Sg. Kemaman di Jambatan Air Putih', 'Kemaman', 'Sg. Kemaman', t, '9.42 ▲', '7.50', '9.00', '10.50', '12.00'],
    ['2', 'Sg. Cherul di Ban Ho', 'Kemaman', 'Sg. Kemaman', t, '10.70', '9.00', '12.00', '14.00', '16.00'],
    ['3', 'Sg. Chukai di Chukai', 'Kemaman', 'Sg. Chukai', t, '2.10 ▲', '1.00', '1.50', '2.00', '2.50'],
    ['4', 'Sg. Kijal di Kijal', 'Kemaman', 'Sg. Kijal', t, '-', '1.00', '2.00', '3.00', '4.00'],
    ['5', 'Sg. Tebak di Kg. Tebak', 'Kemaman', 'Sg. Kemaman', t, '5.05 ▼', '4.00', '6.00', '7.00', '8.00']
  ] }];
}
function rainTables(now) {
  const t = dmy(now - 10 * 60000);
  return [{ rows: [
    ['Bil', 'Nama Stesen', 'Daerah', 'Masa Kemaskini', 'Hujan 1 Jam (mm)', 'Hujan Hari Ini (mm)'],
    ['1', 'Ldg. Kerteh', 'Kemaman', t, '12.5', '48.0'],
    ['2', 'Kg. Ban Ho', 'Kemaman', t, '6.0', '31.5'],
    ['3', 'Chukai', 'Kemaman', t, '9.0', '40.5']
  ] }];
}

/* 28-day outlook: 3 runs, 35 days */
function ensemble(now) {
  const d0 = new Date(now + 8 * 3600000).toISOString().slice(0, 10), D = { time: [] };
  for (let i = 0; i < 35; i++) D.time.push(new Date(Date.parse(d0) + i * 86400000).toISOString().slice(0, 10));
  ['', '_member01', '_member02'].forEach((m, k) => {
    D['precipitation_sum' + m] = D.time.map((t, i) => (i % 5 === 0 ? 12 : 2) + k);
    D['wind_speed_10m_max' + m] = D.time.map((t, i) => 20 + (i % 7) + k * 2);
    D['temperature_2m_max' + m] = D.time.map(() => 31); D['temperature_2m_min' + m] = D.time.map(() => 24);
  });
  return { utc_offset_seconds: 28800, daily: D };
}
function tideMirror(now) {
  const ev = [], t0 = Math.floor(now / 3600000) * 3600000;
  for (let i = 0; i < 12; i++) ev.push({ type: i % 2 ? 'low' : 'high', time: new Date(t0 + (i * 6.2 + 1) * 3600000).toISOString(), m: i % 2 ? 0.7 : 1.9 });
  return { place: 'cukai', url: 'https://www.tide-forecast.com/locations/Cukai/tides/latest', events: ev, eventsAt: new Date(now).toISOString() };
}
function river(now) {
  const d0 = Date.parse(new Date(now + 8 * 3600000).toISOString().slice(0, 10)) - 7 * 86400000, D = { time: [] };
  for (let i = 0; i < 37; i++) D.time.push(new Date(d0 + i * 86400000).toISOString().slice(0, 10));
  D.river_discharge = D.time.map((t, i) => 30 + (i > 10 && i < 16 ? 60 : 0));
  D.river_discharge_median = D.river_discharge; D.river_discharge_p25 = D.river_discharge.map(v => v * 0.8); D.river_discharge_p75 = D.river_discharge.map(v => v * 1.3);
  D.river_discharge_max = D.river_discharge.map(v => v * 2); D.river_discharge_min = D.river_discharge.map(v => v * 0.6);
  return { daily: D };
}
function forUrl(url, now) {
  const lat = +((url.match(/latitude=([\d.]+)/) || [])[1] || 0), offshore = lat > 5;
  if (/open-meteo\.com\/v1\/forecast/.test(url) && /api\.open-meteo/.test(url)) return Promise.resolve(openMeteo(now, offshore));
  if (/marine-api\.open-meteo/.test(url)) return Promise.resolve(marine(now, offshore));
  if (/ensemble-api\.open-meteo/.test(url)) return Promise.resolve(ensemble(now));
  if (/flood-api\.open-meteo/.test(url)) return Promise.resolve(river(now));
  if (/raw\.githubusercontent\.com\/.*tide-cukai/.test(url)) return Promise.resolve(tideMirror(now));
  if (/weather\/forecast/.test(url)) return Promise.resolve(metForecast(now));
  if (/weather\/warning/.test(url)) return Promise.resolve(metWarning(now));
  if (/flood-warning/.test(url)) return Promise.resolve(flood());
  return Promise.reject(new Error('mock: no data for ' + url));
}
function tablesFor(url, now) {
  if (/WaterLevel/i.test(url)) return Promise.resolve(waterTables(now));
  if (/Rainfall/i.test(url)) return Promise.resolve(rainTables(now));
  return Promise.reject(new Error('mock: no table'));
}
function probe(url) {
  const h = core.hostOf(url);
  if (/windy\.com|research\.google/.test(h)) return Promise.resolve({ status: 200, headers: { 'x-frame-options': 'SAMEORIGIN' } });
  if (/jalanow/.test(h)) return Promise.reject(new Error('getaddrinfo ENOTFOUND'));
  return Promise.resolve({ status: 200, headers: {} });
}

module.exports = { seaWarning, metWords, openMeteo, marine, metForecast, metWarning, flood, waterTables, rainTables, forUrl, tablesFor, probe };
