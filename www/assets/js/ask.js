/* Ask AI (Tanya AI) for Monsoon EYE and Sentinel OceanWATCH: one purpose at a time.
   Every purpose has (1) a small form, (2) the APP'S OWN GUIDE - worked out here with rules from the app's data, so there is an answer
   even with no AI and no internet AI account - and (3) a PROMPT with the latest data filled in, to copy into ChatGPT / Claude / Gemini / Copilot.
   Texts: T(bm, en) follows the app's language; P(bm, en) follows the language chosen for the AI's answer. */
(function () {
  'use strict';
  var MC = window.MC, C = window.MCCore, ED = window.EDITION || { kind: 'land', name: 'Monsoon EYE', version: '1.0.0' }, I18N = window.MCI18n;
  if (!MC || !C || !$('askList')) return;
  function $(id) { return document.getElementById(id); }
  var esc = MC.esc, f = MC.f, state = MC.state, LAND = ED.kind !== 'offshore';
  var A = function () { return window.MCAdvisor; }, R = function () { return window.MCRisk; };
  var HOUR = 3600000, DAY = 86400000;
  var T = function (bm, en) { return I18N.lang() === 'en' ? en : bm; };
  var ui = MC.load('mc_ask', {});
  if (!ui.lang) ui.lang = I18N.lang();
  if (!ui.len) ui.len = 'short';
  if (!ui.v) ui.v = {};
  var P = function (bm, en) { return ui.lang === 'en' ? en : bm; };
  function keep() { MC.save('mc_ask', ui); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(t) { var p = C.myt(t); return pad(p.h) + ':' + pad(p.mi); }
  function dayLbl(t, lang) {
    var k = C.dateKey(t), now = Date.now(), en = (lang || I18N.lang()) === 'en';
    if (k === C.dateKey(now)) return en ? 'today' : 'hari ini';
    if (k === C.dateKey(now + DAY)) return en ? 'tomorrow' : 'esok';
    var p = C.myt(t), dn = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'];
    return dn[new Date(t + 8 * HOUR).getUTCDay()] + ' ' + p.d + '/' + p.mo;
  }
  function when(t, lang) { return t === null || t === undefined ? '-' : dayLbl(t, lang) + ' ' + hm(t); }
  function stamp() { var p = C.myt(Date.now()); return pad(p.d) + '/' + pad(p.mo) + '/' + p.y + ' ' + pad(p.h) + ':' + pad(p.mi); }
  function med(a) { a = a.filter(function (x) { return x !== null && x !== undefined && isFinite(x); }).sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; }
  function sum(a) { var s = null; a.forEach(function (x) { if (x !== null && x !== undefined && isFinite(x)) s = (s || 0) + x; }); return s; }
  function maxv(a) { a = a.filter(function (x) { return x !== null && x !== undefined && isFinite(x); }); return a.length ? Math.max.apply(null, a) : null; }
  function minv(a) { a = a.filter(function (x) { return x !== null && x !== undefined && isFinite(x); }); return a.length ? Math.min.apply(null, a) : null; }
  var LVL = [T('Hijau', 'Green'), T('Kuning', 'Yellow'), T('Oren', 'Orange'), T('Merah', 'Red'), T('Ungu', 'Purple')];
  var ST = { normal: T('Normal', 'Normal'), alert: T('Waspada', 'Alert'), warning: T('Amaran', 'Warning'), danger: T('Bahaya', 'Danger') };
  var STP = function (k) { return { normal: P('Normal', 'Normal'), alert: P('Waspada', 'Alert'), warning: P('Amaran', 'Warning'), danger: P('Bahaya', 'Danger') }[k] || k; };
  var RANK = { normal: 0, alert: 1, warning: 2, danger: 3 };

  /* ================================================================= data: land */
  function snap() { return state.snap || {}; }
  function stations() { return (snap().stations || []).filter(function (x) { return x.level !== null && x.level !== undefined; }); }
  function trendOf(st) { return st && snap().trends ? snap().trends[st.name] || null : null; }
  function stLine(st, lang) {
    var t = trendOf(st), pr = t && t.proj, en = lang === 'en';
    var rate = t && t.rate !== null && t.rate !== undefined ? (t.rate > 0 ? '+' : '') + f(t.rate, 2) + (en ? ' m/h' : ' m/j') : '';
    var go = pr && pr.tier ? (en ? '; may reach ' : '; mungkin capai ') + STP(pr.target) + (en ? ' within ' : ' dalam ') + pr.tier + (en ? ' h (confidence ' : ' j (keyakinan ') + pr.conf + '%)' : '';
    return st.name + ': ' + f(st.level, 2) + ' m (' + STP(st.status) + ')' + (rate ? ', ' + rate : '') + (t && t.tidal ? (en ? ', tidal' : ', pasang surut') : '') +
      (en ? ' · Alert/Warning/Danger ' : ' · Waspada/Amaran/Bahaya ') + f(st.alert, 2) + '/' + f(st.warning, 2) + '/' + f(st.danger, 2) + ' m' + go + ' · ' + C.timeAgo(st.updated);
  }
  function places() {
    var out = [], s = state.settings, list = A().parsePlaces ? A().parsePlaces(s.advPlaces) : [];
    list.forEach(function (p, i) { out.push({ id: 'p' + i, name: p.name, hint: p.station || '', coastal: !!p.coastal, kind: 'place' }); });
    stations().forEach(function (st) { out.push({ id: 's:' + st.id, name: st.name, st: st, kind: 'station' }); });
    out.push({ id: 'district', name: T('Seluruh daerah ', 'Whole district ') + (s.waterDistrict || s.locationName), kind: 'district' });
    return out;
  }
  function placeOf(id) {
    var list = places(), p = list.filter(function (x) { return x.id === id; })[0] || list[0];
    var all = stations();
    if (p.kind === 'station') p.stations = [p.st];
    else if (p.kind === 'place' && p.hint) p.stations = all.filter(function (st) { return String(st.name).toLowerCase().indexOf(String(p.hint).toLowerCase()) >= 0; });
    if (!p.stations || !p.stations.length) p.stations = all.slice();
    p.worst = p.stations.slice().sort(function (a, b) { return (RANK[b.status] || 0) - (RANK[a.status] || 0) || pctD(b) - pctD(a); })[0] || null;
    return p;
  }
  function pctD(st) { var lo = st.normal !== null && st.normal !== undefined ? st.normal : 0; return st.danger ? (st.level - lo) / Math.max(0.01, st.danger - lo) : 0; }
  /* rain ahead at the profile's place: hourly forecast (one model) and the 5-model middle value for 24 h */
  function rainAhead(h) {
    var w = snap().weather, now = Date.now();
    var hr = ((w && w.hourly) || []).filter(function (x) { return x.t >= now - HOUR && x.t < now + h * HOUR; });
    return sum(hr.map(function (x) { return x.p; }));
  }
  function rain24() { var r = state.risk; return r && r.kind === 'land' && r.rain !== null && r.rain !== undefined ? r.rain : rainAhead(24); }
  function metLand() { return (snap().met && snap().met.warnings) || []; }
  function metLine(w, lang) {
    var t = (lang === 'en' ? w.title_en || w.title_bm : w.title_bm || w.title_en) || 'MET';
    return t + (w.to ? (lang === 'en' ? ' until ' : ' sehingga ') + when(w.to, lang) : '');
  }
  function earlyLoud() { return ((state.risk && state.risk.early) || snap().early || []).filter(function (e) { return !e.quiet; }); }
  function nextTides(n) {
    var sn = snap(), ev = sn.tide && sn.tide.events && sn.tide.events.length ? sn.tide.events : (sn.marine && sn.marine.tidesAll) || [];
    return ev.filter(function (e) { return e.type === 'high' && e.t > Date.now(); }).slice(0, n || 2);
  }
  function glofasLine(lang) {
    var r = snap().river, en = lang === 'en';
    if (!r || !r.days || !r.days.length) return null;
    var fut = r.days.filter(function (d) { return !d.past; }), pk = fut.slice().sort(function (a, b) { return b.q - a.q; })[0], now = r.days.filter(function (d) { return d.date === C.dateKey(Date.now()); })[0];
    return 'GloFAS: ' + (now ? (en ? 'today ' : 'hari ini ') + f(now.q, 0) + ' m³/s' : '') + (pk ? (en ? ', 30-day peak ' : ', puncak 30 hari ') + f(pk.q, 0) + ' m³/s (' + pk.date + ')' : '');
  }
  function dailyFc(n) { var w = snap().weather, today = C.dateKey(Date.now()); return ((w && w.daily) || []).filter(function (x) { return x.date >= today; }).slice(0, n || 7); }
  function riskNow() { var r = state.risk; return r && r.kind === 'land' ? r : null; }
  function landData(lang, full, focus) {
    var s = state.settings, out = [], en = lang === 'en', r = riskNow();
    out.push((en ? '- Place: ' : '- Tempat: ') + s.locationName + (s.waterDistrict ? (en ? ' district (JPS: ' : ' (daerah JPS: ') + s.waterDistrict + ')' : '') + ', ' + f(s.lat, 4) + ', ' + f(s.lon, 4));
    if (r) out.push((en ? '- App flood risk score (next 24 h): ' : '- Skor risiko banjir app (24 j akan datang): ') + r.score.score + '/100 (' + r.score.label + ')');
    var sts = focus && focus.length ? focus : stations();
    if (!full && !focus) sts = sts.slice().sort(function (a, b) { return (RANK[b.status] || 0) - (RANK[a.status] || 0) || pctD(b) - pctD(a); }).slice(0, 5);
    if (sts.length) { out.push(en ? '- JPS river gauges (5-minute data):' : '- Paras sungai JPS (data 5 minit):'); sts.forEach(function (st) { out.push('  - ' + stLine(st, lang)); }); }
    if (r && r.by && r.by.length) out.push((en ? '- Rain next 24 h, 5 models: ' : '- Hujan 24 j akan datang, 5 model: ') + r.by.map(function (x) { var nm = (A().LAND_MODELS || []).filter(function (m) { return m.id === x.id; })[0]; return (nm ? nm.name : x.id) + ' ' + f(x.h24, 0); }).join(' · ') + ' mm' + (en ? ' (middle ' : ' (nilai tengah ') + f(r.rain, 0) + ' mm)');
    else out.push((en ? '- Rain next 24 h: ' : '- Hujan 24 j akan datang: ') + f(rainAhead(24), 0) + ' mm (Open-Meteo)');
    out.push((en ? '- Rain next 3 h / 72 h: ' : '- Hujan 3 j / 72 j: ') + f(rainAhead(3), 1) + ' / ' + f(rainAhead(72), 0) + ' mm');
    var e = earlyLoud(); out.push((en ? '- App early flood warnings: ' : '- Amaran awal banjir app: ') + (e.length ? e.map(function (x) { return x.title + ' — ' + x.body; }).join(' | ') : (en ? 'none' : 'tiada')));
    var m = metLand(); out.push((en ? '- MET Malaysia land warnings: ' : '- Amaran MET Malaysia (darat): ') + (m.length ? m.map(function (w) { return metLine(w, lang); }).join(' | ') : (en ? 'none' : 'tiada')));
    var td = nextTides(2); if (td.length) out.push((en ? '- High tide: ' : '- Air pasang: ') + td.map(function (x) { return when(x.t, lang) + ' ' + f(x.sea, 2) + ' m'; }).join(', '));
    var g = glofasLine(lang); if (g) out.push('- ' + g);
    if (full) {
      var d = dailyFc(7);
      if (d.length) { out.push(en ? '- Daily forecast (Open-Meteo):' : '- Ramalan harian (Open-Meteo):'); d.forEach(function (x) { out.push('  - ' + x.date + ': ' + f(x.p, 1) + ' mm, ' + f(x.tmin, 0) + '–' + f(x.tmax, 0) + '°C, ' + (en ? 'gusts ' : 'tiupan ') + f(x.gust, 0) + ' km/h'); }); }
      var fc = (snap().met && snap().met.forecast) || [];
      if (fc.length) { out.push(en ? '- MET Malaysia district forecast:' : '- Ramalan MET Malaysia (daerah):'); fc.slice(0, 4).forEach(function (x) { out.push('  - ' + x.date + ': ' + (en ? 'morning ' : 'pagi ') + x.morning + ', ' + (en ? 'afternoon ' : 'petang ') + x.afternoon + ', ' + (en ? 'night ' : 'malam ') + x.night); }); }
    }
    return out;
  }

  /* ================================================================= data: offshore */
  function rep() { return MC.Off.report(); }
  function jobsAll() { var Ad = A(); return Ad.limits(state.settings.advLimits); }
  function jobById(id) { var l = jobsAll(); return id === 'lq' ? Object.assign({ id: 'lq', name: Ad0(l.overall.name) }, l.overall) : l.acts.filter(function (a) { return a.id === id; })[0] || null; }
  function Ad0(n) { return I18N.L(n); }
  function jobOptions(withLq, onlyOn) {
    var l = jobsAll(), out = [];
    if (withLq) out.push(['lq', I18N.L(l.overall.name)]);
    l.acts.forEach(function (a) { if (!onlyOn || a.on !== false) out.push([a.id, (a.mine ? '★ ' : '') + I18N.L(a.name)]); });
    return out;
  }
  function offAssess(fromT, toT, res) {
    var Ad = A(), r = rep(), s = state.settings, now = Date.now();
    if (!r) return null;
    var B = Ad.blocks({ from: C.dateKey(fromT), to: C.dateKey(toT), res: res || '3h', shift: s.advShift, now: now }).filter(function (b) { return b.t1 > fromT && b.t0 < toT; });
    return Ad.assessOffshore({ rep: r, snap: snap(), blocks: B, limits: Ad.limits(s.advLimits), now: now, minWindow: s.advWindowH, early: MC.Early.offCfg(s) });
  }
  function hoursIn(t0, t1) { var r = rep(); return r ? r.hours.filter(function (h) { return h.t >= t0 && h.t < t1; }) : []; }
  function rng(H, k, sub) { var lo = minv(H.map(function (h) { return h[k] ? (sub ? h[k][sub] : h[k]) : null; })), hi = maxv(H.map(function (h) { return h[k] ? (sub ? h[k][sub] : h[k]) : null; })); return lo === null ? '-' : lo === hi ? f(lo, k === 'hs' || k === 'wh' ? 1 : 0) : f(lo, k === 'hs' || k === 'wh' ? 1 : 0) + '–' + f(hi, k === 'hs' || k === 'wh' ? 1 : 0); }
  function compass(d) { return d === null || d === undefined ? '' : C.compass(d); }
  function offSummary(t0, t1, lang) {
    var H = hoursIn(t0, t1), en = lang === 'en';
    if (!H.length) return en ? 'no model data for this time' : 'tiada data model untuk masa ini';
    var gHi = maxv(H.map(function (h) { return h.g.hi; })), hsHi = maxv(H.map(function (h) { return h.hs.hi; }));
    var th = maxv(H.map(function (h) { return h.thunder; }));
    return (en ? 'wind ' : 'angin ') + rng(H, 'w10', 'm') + ' kt ' + compass(med(H.map(function (h) { return h.dir; }))) + (en ? ', gusts ' : ', tiupan ') + rng(H, 'g', 'm') + ' kt (' + (en ? 'worst model ' : 'model teruk ') + f(gHi, 0) + '), Hs ' + rng(H, 'hs', 'm') + ' m (' + (en ? 'worst ' : 'teruk ') + f(hsHi, 1) + ', Hmax ≈ ' + f((maxv(H.map(function (h) { return h.hs.m; })) || 0) * 1.7, 1) + ' m), ' +
      (en ? 'swell ' : 'alun ') + rng(H, 'wh') + ' m / ' + rng(H, 'wt') + ' s ' + compass(med(H.map(function (h) { return h.wd; }))) + (th !== null ? (en ? ', thunderstorm in ' : ', ribut petir dalam ') + Math.round(th * 100) + '% ' + (en ? 'of models' : 'model') : '');
  }
  function metSea() { return (snap().met && snap().met.warnings) || []; }
  function offData(lang, full, t0, t1) {
    var s = state.settings, out = [], en = lang === 'en', r = rep(), now = Date.now();
    out.push((en ? '- Location: ' : '- Lokasi: ') + s.locationName + ' ' + f(Math.abs(s.marineLat), 4) + (s.marineLat >= 0 ? 'N' : 'S') + ' ' + f(Math.abs(s.marineLon), 4) + (s.marineLon >= 0 ? 'E' : 'W') + (en ? ' (MET sea areas: ' : ' (kawasan laut MET: ') + (s.warningKeywords || '-') + ')');
    if (!r) { out.push(en ? '- Model data not read yet.' : '- Data model belum dibaca.'); return out; }
    out.push((en ? '- Models: ' : '- Model: ') + r.ok.wind.length + (en ? ' wind, ' : ' angin, ') + r.ok.wave.length + (en ? ' wave, ensembles ' : ' ombak, ensemble ') + r.ok.ens.join(', ') + (en ? ' (read ' : ' (dibaca ') + when(r.at, lang) + ')');
    out.push((en ? '- Now – 6 h: ' : '- Sekarang – 6 j: ') + offSummary(now, now + 6 * HOUR, lang));
    out.push((en ? '- 6 – 24 h: ' : '- 6 – 24 j: ') + offSummary(now + 6 * HOUR, now + 24 * HOUR, lang));
    if (t0 && t1) out.push((en ? '- Asked period ' : '- Tempoh ditanya ') + when(t0, lang) + ' – ' + when(t1, lang) + ': ' + offSummary(t0, t1, lang));
    var days = (r.days || []).slice(0, full ? 7 : 3);
    if (days.length) {
      out.push(en ? '- Daily (middle of models, spread in brackets):' : '- Harian (nilai tengah model, julat dalam kurungan):');
      days.forEach(function (d) {
        out.push('  - ' + d.date + ': ' + (en ? 'max wind ' : 'angin maks ') + f(d.wind.m, 0) + ' kt (' + f(d.wind.lo, 0) + '–' + f(d.wind.hi, 0) + '), ' + (en ? 'gust ' : 'tiupan ') + f(d.gust.m, 0) + ' kt, Hs ' + f(d.hs.m, 1) + ' m (' + f(d.hs.lo, 1) + '–' + f(d.hs.hi, 1) + ')' +
          (d.ens ? ', ensemble P90 ' + f(d.ens.p90, 0) + ' kt' : '') + (d.thunder ? (en ? ', thunder ' : ', petir ') + Math.round(d.thunder * 100) + '%' : '') + (en ? ', confidence ' : ', keyakinan ') + (d.conf ? d.conf.label : '-'));
      });
    }
    var e = (MC.EXT.Jobs && MC.EXT.Jobs.get() || {}).early || [];
    out.push((en ? '- App early warnings: ' : '- Amaran awal app: ') + (e.length ? e.map(function (x) { return x.title + ' — ' + x.body; }).join(' | ') : (en ? 'none' : 'tiada')));
    var m = metSea(); out.push((en ? '- MET Malaysia sea warnings: ' : '- Amaran laut MET Malaysia: ') + (m.length ? m.map(function (w) { return metLine(w, lang); }).join(' | ') : (en ? 'none' : 'tiada')));
    var cur = snap().weather && snap().weather.hourly, vis = (cur || []).filter(function (h) { return h.t >= now && h.t < now + 12 * HOUR && h.vis !== null && h.vis !== undefined; });
    if (vis.length) out.push((en ? '- Visibility next 12 h: min ' : '- Penglihatan 12 j: min ') + f(minv(vis.map(function (h) { return h.vis; })), 1) + ' km');
    if (full) {
      var H = hoursIn(now, now + 24 * HOUR).filter(function (h, i) { return i % 3 === 0; });
      if (H.length) { out.push(en ? '- Every 3 h (middle, worst model):' : '- Setiap 3 j (nilai tengah, model teruk):'); H.forEach(function (h) { out.push('  - ' + when(h.t, lang) + ': ' + f(h.w10.m, 0) + '/' + f(h.g.m, 0) + ' kt (' + f(h.g.hi, 0) + '), Hs ' + f(h.hs.m, 1) + ' (' + f(h.hs.hi, 1) + ') m, ' + (en ? 'swell ' : 'alun ') + f(h.wh, 1) + ' m ' + f(h.wt, 0) + ' s'); }); }
    }
    return out;
  }
  function limitText(a, lang) {
    var en = (lang || I18N.lang()) === 'en', P2 = [['w', en ? 'wind' : 'angin', 'kt'], ['g', en ? 'gusts' : 'tiupan', 'kt'], ['h', 'Hs', 'm'], ['sw', en ? 'swell' : 'alun', 'm'], ['tp', en ? 'swell period' : 'tempoh alun', 's'], ['vis', en ? 'visibility' : 'penglihatan', 'km']];
    return P2.filter(function (p) { return a && a[p[0]]; }).map(function (p) { return p[1] + ' ' + a[p[0]][0] + ' / ' + a[p[0]][1] + ' ' + p[2]; }).join(', ') + (a && a.day ? (en ? ', daylight only' : ', siang sahaja') : '');
  }

  /* ================================================================= prompt frame */
  function promptFrame(o) {
    var lang = ui.lang, en = lang === 'en', L1 = [];
    L1.push('# ' + o.title + ' — ' + state.settings.locationName + ' (' + stamp() + ')');
    L1.push('');
    L1.push(o.role);
    L1.push(en ? 'Answer in plain English. Short sentences. Times in Malaysia time (UTC+8).' : 'Jawab dalam Bahasa Melayu yang mudah. Ayat pendek. Masa dalam waktu Malaysia (UTC+8).');
    L1.push('');
    if (o.ask && o.ask.length) { L1.push(en ? '## My situation' : '## Keadaan saya'); o.ask.forEach(function (x) { L1.push('- ' + x); }); L1.push(''); }
    L1.push(en ? '## Latest data (from the app ' + ED.name + ' ' + ED.version + ')' : '## Data terkini (dari app ' + ED.name + ' ' + ED.version + ')');
    o.data.forEach(function (x) { L1.push(x); });
    if (o.guide) { L1.push(''); L1.push(en ? '## What the app itself worked out (rules, not AI)' : '## Apa yang app kira sendiri (peraturan, bukan AI)'); o.guide.forEach(function (x) { L1.push('- ' + x); }); }
    L1.push('');
    L1.push(en ? '## Questions' : '## Soalan');
    o.q.forEach(function (x, i) { L1.push((i + 1) + '. ' + x); });
    L1.push('');
    L1.push(en ? '## How to answer' : '## Cara jawab');
    (o.how || []).concat(en ? [
      'Use web search: check the official sources now (' + (LAND ? 'MET Malaysia met.gov.my, JPS publicinfobanjir.water.gov.my, NADMA portalbencana.nadma.gov.my, APM' : 'MET Malaysia marine forecast & warnings, the operator\'s marine / OIM instructions') + ') and news / social media from the last 24 hours. Name the sources and their time.',
      'Say clearly what is certain and what is not. If the data above and the official sources differ, follow the official sources.',
      ui.len === 'short' ? 'Keep it under 200 words, start with the answer in one line.' : 'Start with the answer in one line, then the reasons, then what to do and when.'
    ] : [
      'Guna carian web: semak sumber rasmi sekarang (' + (LAND ? 'MET Malaysia met.gov.my, JPS publicinfobanjir.water.gov.my, NADMA portalbencana.nadma.gov.my, APM' : 'ramalan & amaran marin MET Malaysia, arahan marin / OIM syarikat') + ') dan berita / media sosial 24 jam terakhir. Sebut sumber dan masanya.',
      'Nyatakan dengan jelas apa yang pasti dan apa yang tidak. Jika data di atas berbeza dengan sumber rasmi, ikut sumber rasmi.',
      ui.len === 'short' ? 'Jawapan bawah 200 patah perkataan; mula dengan jawapan dalam satu baris.' : 'Mula dengan jawapan dalam satu baris, kemudian sebab, kemudian apa perlu dibuat dan bila.'
    ]).forEach(function (x) { L1.push('- ' + x); });
    return L1.join('\n');
  }
  var ROLE_LAND = function () { return P('Anda pakar banjir dan pengurusan bencana di Pantai Timur Malaysia (Terengganu), yang menerangkan dengan mudah kepada orang kampung.', 'You are a flood and disaster-management expert for the east coast of Peninsular Malaysia (Terengganu), explaining simply to local residents.'); };
  var ROLE_OFF = function () { return P('Anda pakar meteorologi marin dan perancang operasi offshore (Laut China Selatan, perairan Malaysia).', 'You are a marine meteorologist and offshore operations planner (South China Sea, Malaysian waters).'); };

  /* ================================================================= small HTML helpers */
  function big(level, text) { return '<div class="big l' + level + '">' + text + '</div>'; }
  function ul(list) { return '<ul>' + list.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  function seg(id, opts, val) { return '<div class="seg" data-f="' + id + '">' + opts.map(function (o) { return '<button type="button" data-v="' + esc(o[0]) + '" aria-selected="' + (String(o[0]) === String(val)) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function sel(id, opts, val) { return '<select class="sel" data-f="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function inp(id, val, ph, type) { return '<input class="inp" data-f="' + id + '" value="' + esc(val === undefined ? '' : val) + '" placeholder="' + esc(ph || '') + '"' + (type ? ' type="' + type + '" inputmode="decimal"' : '') + '>'; }
  function field(label, html) { return '<div><label>' + esc(label) + '</label>' + html + '</div>'; }
  var CHK_COL = ['#16a34a', '#ca8a04', '#dc2626', '#a21caf'];
  function strip(cells, t0, t1, labels) {
    return '<div class="strip">' + cells.map(function (c) { return '<i style="background:' + (c === null ? 'var(--fill-2)' : CHK_COL[c]) + '"></i>'; }).join('') + '</div><div class="strip-l">' + labels.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
  }
  function need(cond, msg) { return cond ? null : '<div class="empty">' + msg + '</div>'; }

  /* ================================================================= LAND purposes (Monsoon EYE) */
  function placeOpts() { return places().map(function (p) { return [p.id, p.name]; }); }
  /* the action level for a place: 0 nothing, 1 get ready, 2 move things up / ready to leave, 3 leave */
  function actionLevel(p, horizonH, vuln, ground) {
    var st = p.worst, t = trendOf(st), pr = t && t.proj, lvl = 0, why = [];
    if (!st) return { lvl: 0, why: [T('Tiada bacaan sungai untuk tempat ini.', 'No river reading for this place.')] };
    var cur = RANK[st.status] || 0;
    lvl = cur === 3 ? 3 : cur === 2 ? 2 : cur === 1 ? 1 : 0;
    why.push(T('{s} sekarang {l} ({v} m).', 'Now {l} at {s} ({v} m).').replace('{s}', esc(st.name)).replace('{l}', ST[st.status] || st.status).replace('{v}', f(st.level, 2)));
    if (pr && pr.tier && pr.tier <= horizonH) {
      var tg = RANK[pr.target] || 0;
      if (tg > lvl) { lvl = tg; why.push(T('Dijangka capai {l} dalam {h} jam (keyakinan {c}%).', 'Expected to reach {l} within {h} hours (confidence {c}%).').replace('{l}', ST[pr.target]).replace('{h}', pr.tier).replace('{c}', pr.conf)); }
    }
    var rr = horizonH <= 24 ? rain24() : rainAhead(horizonH);
    if (rr !== null && rr >= 100 && lvl < 2) { lvl = Math.max(lvl, 1); why.push(T('Hujan lebat {m} mm dijangka.', 'Heavy rain {m} mm expected.').replace('{m}', f(rr, 0))); }
    var crit = metLand().some(function (w) { return w.severity === 'critical' && /hujan|rain|banjir|flood/i.test((w.title_bm || '') + (w.title_en || '')); });
    if (crit && lvl < 2) { lvl = 2; why.push(T('Amaran MET hujan tahap bahaya.', 'MET danger-level rain warning.')); }
    if (lvl >= 1 && (vuln || ground) && lvl < 3) { lvl++; why.push(vuln ? T('Ada warga emas / bayi / OKU: bertindak satu tahap lebih awal.', 'Elderly / babies / disabled at home: act one step earlier.') : T('Rumah atas tanah: bertindak satu tahap lebih awal.', 'House on the ground: act one step earlier.')); }
    return { lvl: Math.min(3, lvl), why: why, st: st, pr: pr };
  }
  var ACTIONS = function () {
    return [
      [T('Tiada tindakan khas', 'Nothing special to do'), [T('Pantau app 2–3 kali sehari.', 'Check the app 2–3 times a day.'), T('Pastikan beg kecemasan sedia (Tanya AI › Senarai semak beg).', 'Keep the emergency bag ready (Ask AI › bag checklist).')]],
      [T('Bersedia', 'Get ready'), [T('Simpan dokumen penting (IC, sijil, geran, insurans) dalam beg kalis air.', 'Put important papers (IC, certificates, land titles, insurance) in a waterproof bag.'), T('Cas telefon & powerbank; isi minyak kenderaan.', 'Charge phones & power banks; fill the car.'), T('Semak beg kecemasan & ubat 7 hari.', 'Check the emergency bag & 7 days of medicine.'), T('Pantau paras sungai setiap jam; simpan nombor 999 & BOMBA.', 'Check the river every hour; keep 999 & fire brigade numbers.')]],
      [T('Alih barang & kenderaan sekarang', 'Move things & vehicles up now'), [T('Alih barang berharga & elektrik ke tempat tinggi / tingkat atas.', 'Move valuables & electrical items up high / upstairs.'), T('Alih kereta & motosikal ke tempat tinggi sebelum jalan dinaiki air.', 'Move cars & motorbikes to high ground before roads flood.'), T('Bawa beg kecemasan dekat pintu; maklumkan jiran & warga emas.', 'Keep the emergency bag by the door; tell neighbours & the elderly.'), T('Sedia untuk berpindah bila diarah (APM / ketua kampung).', 'Be ready to leave when told (APM / village head).')]],
      [T('Pindah — ikut arahan pihak berkuasa', 'Leave — follow the authorities'), [T('Pergi ke PPS bila diarah, atau lebih awal jika air mula masuk rumah.', 'Go to the relief centre (PPS) when told, or earlier if water starts coming in.'), T('Matikan suis utama elektrik & gas sebelum keluar.', 'Switch off the main electricity & gas before leaving.'), T('Jangan redah air banjir (arus kuat, lubang, renjatan elektrik).', 'Do not walk or drive through flood water (strong current, holes, electric shock).'), T('Senarai PPS: Portal NADMA (menu Laman).', 'Relief centres: NADMA portal (Sites menu).')]]
    ];
  };
  var LAND_T = [
    { id: 'prep', sec: T('Banjir', 'Floods'), icon: '🏠', title: T('Perlu bersedia atau pindah?', 'Get ready or leave?'), desc: T('Risiko rumah / kampung 24–72 j, bila alih barang & kereta, bila ke PPS', 'Risk for my home / village in 24–72 h, when to move things, when to go to the relief centre'),
      form: function (v) { return field(T('Tempat saya', 'My place'), sel('place', placeOpts(), v.place)) + field(T('Tempoh', 'Period'), seg('h', [[24, '24 j'], [48, '48 j'], [72, '72 j']], v.h || 48)) +
        field(T('Rumah saya', 'My house'), seg('house', [['ground', T('Atas tanah', 'On the ground')], ['high', T('Tinggi / bertingkat', 'Raised / upstairs')]], v.house || 'ground')) +
        field(T('Ada warga emas / bayi / OKU?', 'Elderly / babies / disabled at home?'), seg('vuln', [['y', T('Ya', 'Yes')], ['n', T('Tidak', 'No')]], v.vuln || 'n')); },
      guide: function (v) {
        var p = placeOf(v.place), h = +(v.h || 48), a = actionLevel(p, h, v.vuln === 'y', (v.house || 'ground') === 'ground'), act = ACTIONS()[a.lvl];
        var lat = '';
        if (a.pr && a.pr.tier && a.pr.eta) lat = '<p><b>' + T('Paling lewat:', 'At the latest:') + '</b> ' + T('alih barang & kereta sebelum {t} (jangkaan sampai {l}).', 'move things & cars before {t} (expected to reach {l}).').replace('{t}', when(a.pr.eta - 2 * HOUR)).replace('{l}', ST[a.pr.target]) + '</p>';
        return big([0, 1, 2, 3][a.lvl], ['🟢', '🟡', '🟠', '🔴'][a.lvl] + ' ' + act[0]) + '<h4>' + T('Sebab', 'Why') + '</h4>' + ul(a.why) + lat + '<h4>' + T('Apa perlu dibuat', 'What to do') + '</h4>' + ul(act[1]) +
          '<p class="note">' + T('Panduan app ikut paras JPS, trend, hujan 5 model & amaran MET. Bukan arahan rasmi — ikut arahan APM / NADMA / ketua kampung.', 'App guide from JPS levels, trend, 5-model rain & MET warnings. Not an official instruction — follow APM / NADMA / the village head.') + '</p>';
      },
      prompt: function (v) {
        var p = placeOf(v.place), h = +(v.h || 48), a = actionLevel(p, h, v.vuln === 'y', (v.house || 'ground') === 'ground');
        return promptFrame({ title: P('Perlu bersedia atau pindah?', 'Get ready or leave?'), role: ROLE_LAND(),
          ask: [P('Tempat: ', 'Place: ') + p.name, P('Tempoh: ', 'Period: ') + h + P(' jam', ' hours'), P('Rumah: ', 'House: ') + ((v.house || 'ground') === 'ground' ? P('atas tanah', 'on the ground') : P('tinggi / bertingkat', 'raised / two floors')), P('Ada warga emas / bayi / OKU: ', 'Elderly / babies / disabled: ') + (v.vuln === 'y' ? P('ya', 'yes') : P('tidak', 'no'))],
          data: landData(ui.lang, ui.len === 'full', p.stations.slice(0, 6)), guide: a.why.map(function (x) { return x.replace(/<[^>]+>/g, ''); }).concat([P('Tahap tindakan app: ', 'App action level: ') + ACTIONS()[a.lvl][0]]),
          q: [P('Perlu saya bersedia, alih barang & kereta, atau pindah? Bila paling lewat?', 'Should I get ready, move things & the car, or leave? When at the latest?'), P('Tanda-tanda apa perlu diperhati di tempat saya?', 'Which signs should I watch for at my place?'), P('PPS mana yang terdekat dan dibuka sekarang?', 'Which relief centre (PPS) is nearest and open now?')] });
      } },
    { id: 'river', sec: T('Banjir', 'Floods'), icon: '📈', title: T('Sungai naik atau turun?', 'Is the river rising or falling?'), desc: T('Penerangan mudah keadaan semua stesen sekarang', 'A simple picture of every gauge now'),
      form: function () { return ''; },
      guide: function () {
        var sts = stations();
        if (!sts.length) return need(false, T('Belum ada bacaan JPS.', 'No JPS readings yet.'));
        var word = function (t) {
          if (!t || t.rate === null || t.rate === undefined) return T('tiada trend', 'no trend');
          var r = t.rate;
          return r > 0.1 ? T('naik cepat', 'rising fast') : r > 0.01 ? T('naik perlahan', 'rising slowly') : r < -0.05 ? T('turun', 'falling') : r < -0.01 ? T('turun perlahan', 'falling slowly') : T('stabil', 'steady');
        };
        var up = sts.filter(function (s) { var t = trendOf(s); return t && t.rising; }).length;
        return big(up ? 1 : 0, up ? T('{n} daripada {m} stesen sedang naik', '{n} of {m} gauges are rising').replace('{n}', up).replace('{m}', sts.length) : T('Tiada stesen naik', 'No gauge is rising')) +
          '<div class="oc-scroll"><table class="tbl"><thead><tr><th>' + T('Stesen', 'Gauge') + '</th><th class="num">m</th><th>' + T('Tahap', 'Level') + '</th><th>' + T('Trend', 'Trend') + '</th><th>' + T('Anggaran', 'Outlook') + '</th></tr></thead><tbody>' +
          sts.map(function (s) { var t = trendOf(s), pr = t && t.proj; return '<tr><td>' + esc(s.name) + (t && t.tidal ? ' <small class="muted">(' + T('pasang surut', 'tidal') + ')</small>' : '') + '</td><td class="num">' + f(s.level, 2) + '</td><td>' + (ST[s.status] || '-') + '</td><td>' + word(t) + (t && t.rate !== null && t.rate !== undefined ? ' <small class="muted">' + (t.rate > 0 ? '+' : '') + f(t.rate, 2) + ' m/j</small>' : '') + '</td><td>' + (pr && pr.tier ? T('{l} dalam {h} j', '{l} in {h} h').replace('{l}', ST[pr.target]).replace('{h}', pr.tier) + ' <small class="muted">(' + pr.conf + '%)</small>' : T('kekal', 'stays')) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
          '<p class="note">' + T('Stesen pasang surut dinilai ikut trend 24 jam (air naik turun setiap ~6 jam).', 'Tidal gauges are judged on the 24-hour trend (water goes up and down every ~6 hours).') + '</p>';
      },
      prompt: function () {
        return promptFrame({ title: P('Sungai naik atau turun?', 'Is the river rising or falling?'), role: ROLE_LAND(), data: landData(ui.lang, true),
          q: [P('Terangkan dengan mudah: sungai mana naik, mana turun, dan kenapa (hujan hulu, air pasang).', 'Explain simply: which rivers are rising, which are falling, and why (upstream rain, high tide).'), P('Dalam 24 jam akan datang, stesen mana paling perlu diperhati?', 'In the next 24 hours, which gauges need watching most?')] });
      } },
    { id: 'after', sec: T('Banjir', 'Floods'), icon: '🏡', title: T('Lepas banjir: bila selamat balik?', 'After the flood: when is it safe to go home?'), desc: T('Trend surut, hujan hulu, pasang surut', 'Falling trend, upstream rain, tide'),
      form: function (v) { return field(T('Rumah saya di', 'My home is at'), sel('place', placeOpts(), v.place)); },
      guide: function (v) {
        var p = placeOf(v.place), st = p.worst, t = trendOf(st), r24 = rain24(), tide = nextTides(1)[0];
        if (!st) return need(false, T('Tiada bacaan sungai.', 'No river reading.'));
        var below = (RANK[st.status] || 0) <= 1, falling = t && t.rate !== null && t.rate < -0.005, dry = r24 !== null && r24 < 20, noMet = !metLand().some(function (w) { return /hujan|rain/i.test((w.title_bm || '') + (w.title_en || '')); });
        var ok = [below, falling, dry, noMet].filter(Boolean).length, lvl = ok === 4 ? 0 : ok >= 2 ? 1 : 2;
        var chk = function (b, txt) { return (b ? '✅ ' : '❌ ') + txt; };
        return big(lvl, [T('🟢 Boleh mula balik (ikut arahan pihak berkuasa)', '🟢 You may start going back (follow the authorities)'), T('🟡 Hampir — tunggu sedikit lagi', '🟡 Nearly — wait a little longer'), T('🔴 Belum selamat untuk balik', '🔴 Not safe to go back yet')][lvl]) +
          ul([chk(below, T('Paras {s} bawah Amaran ({v} m)', 'Level at {s} below Warning ({v} m)').replace('{s}', esc(st.name)).replace('{v}', f(st.level, 2))), chk(falling, T('Air sedang surut', 'Water is going down')), chk(dry, T('Hujan 24 j akan datang kurang 20 mm ({m} mm)', 'Rain next 24 h under 20 mm ({m} mm)').replace('{m}', f(r24, 0))), chk(noMet, T('Tiada amaran hujan MET', 'No MET rain warning'))]) +
          (tide ? '<p class="note">' + T('Air pasang seterusnya {t} ({v} m) — kawasan dekat laut mungkin naik semula sebentar.', 'Next high tide {t} ({v} m) — places near the sea may rise again for a while.').replace('{t}', when(tide.t)).replace('{v}', f(tide.sea, 2)) + '</p>' : '') +
          '<h4>' + T('Bila balik', 'When you go back') + '</h4>' + ul([T('Jangan hidupkan suis elektrik yang basah — panggil juruelektrik.', 'Do not switch on wet electrics — call an electrician.'), T('Semak dinding, lantai & bumbung sebelum masuk.', 'Check walls, floors & roof before going in.'), T('Buang makanan yang kena air banjir; masak air minuman.', 'Throw away food touched by flood water; boil drinking water.'), T('Pakai kasut but & sarung tangan; hati-hati ular & kala jengking.', 'Wear boots & gloves; watch for snakes & scorpions.'), T('Ambil gambar kerosakan untuk insurans / bantuan.', 'Take photos of damage for insurance / aid.')]);
      },
      prompt: function (v) {
        var p = placeOf(v.place);
        return promptFrame({ title: P('Lepas banjir: bila selamat balik?', 'After the flood: when is it safe to go home?'), role: ROLE_LAND(), ask: [P('Rumah saya di: ', 'My home is at: ') + p.name], data: landData(ui.lang, ui.len === 'full', p.stations.slice(0, 6)),
          q: [P('Bila paling awal selamat untuk balik ke rumah? Apa tandanya?', 'When is the earliest safe time to go home? What are the signs?'), P('Ada risiko air naik semula (hujan hulu, air pasang) dalam 2–3 hari?', 'Is there a risk of the water rising again (upstream rain, high tide) in 2–3 days?'), P('Senarai semak membersih rumah selepas banjir.', 'A checklist for cleaning the house after the flood.')] });
      } },
    { id: 'bag', sec: T('Banjir', 'Floods'), icon: '🎒', title: T('Senarai semak beg kecemasan', 'Emergency bag checklist'), desc: T('Ikut tahap risiko sekarang', 'For the risk level now'),
      form: function (v) { return field(T('Bilangan orang', 'People'), inp('n', v.n || 4, '4', 'number')) + field(T('Ada', 'With'), seg('who', [['', T('Dewasa sahaja', 'Adults only')], ['baby', T('Bayi', 'Baby')], ['old', T('Warga emas', 'Elderly')], ['both', T('Bayi & warga emas', 'Baby & elderly')]], v.who || '')) +
        field(T('Haiwan peliharaan?', 'Pets?'), seg('pet', [['n', T('Tiada', 'No')], ['y', T('Ada', 'Yes')]], v.pet || 'n')); },
      guide: function (v) {
        var n = Math.max(1, Math.min(30, parseInt(v.n, 10) || 4)), r = riskNow(), lvl = r ? r.score.level : 0, days = 3;
        var items = [T('IC, sijil lahir, geran, polisi insurans, buku bank — dalam beg zip kalis air', 'IC, birth certificates, land titles, insurance, bank books — in a waterproof zip bag'),
          T('Air minuman {l} liter ({n} orang × 3 liter × {d} hari)', 'Drinking water {l} litres ({n} people × 3 litres × {d} days)').replace('{l}', n * 3 * days).replace('{n}', n).replace('{d}', days),
          T('Makanan kering / tin untuk {d} hari + pembuka tin', 'Dry / tinned food for {d} days + tin opener').replace('{d}', days),
          T('Ubat harian 7 hari + preskripsi; kit pertolongan cemas', 'Daily medicine for 7 days + prescriptions; first-aid kit'),
          T('Lampu suluh + bateri, powerbank penuh, wisel', 'Torch + batteries, full power bank, whistle'),
          T('Pakaian 3 hari, tuala, selimut nipis, baju hujan', 'Clothes for 3 days, towel, thin blanket, raincoat'),
          T('Wang tunai kecil (ATM mungkin tutup)', 'Some cash (ATMs may be down)'), T('Barang kebersihan, pelitup muka, beg plastik', 'Toiletries, face masks, plastic bags')];
        if (v.who === 'baby' || v.who === 'both') items.push(T('Susu, botol, lampin & tisu basah untuk 3 hari', 'Milk, bottles, nappies & wet wipes for 3 days'));
        if (v.who === 'old' || v.who === 'both') items.push(T('Cermin mata, alat bantu dengar, tongkat, ubat tambahan', 'Glasses, hearing aids, walking stick, extra medicine'));
        if (v.pet === 'y') items.push(T('Makanan & sangkar / tali haiwan', 'Pet food & carrier / lead'));
        var when2 = lvl >= 2 ? T('🟠 Kemas sekarang dan letak dekat pintu.', '🟠 Pack now and keep it by the door.') : lvl === 1 ? T('🟡 Semak isi beg hari ini.', '🟡 Check the bag today.') : T('🟢 Sedia sepanjang musim tengkujuh (Nov – Mac).', '🟢 Keep it ready all monsoon season (Nov – Mar).');
        return big(Math.min(3, lvl), when2) + '<ol>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>';
      },
      prompt: function (v) {
        var n = Math.max(1, Math.min(30, parseInt(v.n, 10) || 4));
        return promptFrame({ title: P('Senarai semak beg kecemasan banjir', 'Flood emergency bag checklist'), role: ROLE_LAND(), ask: [P('Bilangan orang: ', 'People: ') + n, P('Ada: ', 'With: ') + (v.who || P('dewasa sahaja', 'adults only')), P('Haiwan: ', 'Pets: ') + (v.pet === 'y' ? P('ada', 'yes') : P('tiada', 'no'))],
          data: landData(ui.lang, false), q: [P('Senarai lengkap beg kecemasan untuk keluarga ini, dengan kuantiti.', 'A full emergency bag list for this family, with quantities.'), P('Apa perlu disediakan sekarang ikut tahap risiko semasa?', 'What should be prepared now for the current risk level?')] });
      } },
    { id: 'travel', sec: T('Harian', 'Daily'), icon: '🚗', title: T('Perjalanan selamat?', 'Is my trip safe?'), desc: T('Jalan mungkin banjir untuk perjalanan anda', 'Roads that may flood on your trip'),
      form: function (v) {
        var opts = stations().map(function (s) { return [s.id, s.name]; });
        return field(T('Dari', 'From'), inp('from', v.from, T('cth Chukai', 'e.g. Chukai'))) + field(T('Ke', 'To'), inp('to', v.to, T('cth Kerteh', 'e.g. Kerteh'))) +
          field(T('Bila', 'When'), seg('day', [['0', T('Hari ini', 'Today')], ['1', T('Esok', 'Tomorrow')], ['2', T('Lusa', 'Day after')]], v.day || '0')) + field(T('Jam bertolak', 'Leaving at'), inp('time', v.time || '07:00', '07:00')) +
          field(T('Lalu dekat sungai / stesen', 'Passing near rivers / gauges'), '<select class="sel" data-f="sts" multiple size="4">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + ((v.sts || []).indexOf(o[0]) >= 0 ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>');
      },
      guide: function (v) {
        var dt = tripTime(v), w = snap().weather, H = ((w && w.hourly) || []).filter(function (h) { return h.t >= dt - HOUR && h.t < dt + 3 * HOUR; });
        var rr = sum(H.map(function (h) { return h.p; })), th = H.some(function (h) { return h.code >= 95; }), pp = maxv(H.map(function (h) { return h.pp; }));
        var sts = stations().filter(function (s) { return (v.sts || []).indexOf(s.id) >= 0; }), worst = sts.reduce(function (m, s) { return Math.max(m, RANK[s.status] || 0); }, 0);
        var proj = sts.filter(function (s) { var t = trendOf(s); return t && t.proj && t.proj.tier && (RANK[t.proj.target] || 0) >= 2; });
        var lvl = worst >= 2 || proj.length ? 3 : (rr || 0) >= 20 || th ? 2 : (rr || 0) >= 5 || worst === 1 ? 1 : 0;
        return big(lvl, [T('🟢 Perjalanan OK', '🟢 Trip looks fine'), T('🟡 Boleh, berhati-hati', '🟡 OK, take care'), T('🟠 Hujan lebat / ribut petir — pertimbang tunda', '🟠 Heavy rain / thunder — think about waiting'), T('🔴 Elak laluan dekat sungai tinggi', '🔴 Avoid routes near high rivers')][lvl]) +
          ul([T('Masa: {t}', 'Time: {t}').replace('{t}', when(dt)), T('Hujan 3 jam dari bertolak: {m} mm (peluang {p}%)', 'Rain 3 h from leaving: {m} mm (chance {p}%)').replace('{m}', f(rr, 1)).replace('{p}', f(pp, 0)) + (th ? ' · ⛈️ ' + T('ribut petir', 'thunderstorm') : '')]
            .concat(sts.map(function (s) { return esc(s.name) + ': ' + (ST[s.status] || '-') + ' ' + f(s.level, 2) + ' m'; }))
            .concat(sts.length ? [] : [T('Pilih sungai / stesen yang dilalui untuk semakan paras air.', 'Pick the rivers / gauges you pass to check water levels.')])) +
          '<h4>' + T('Ingat', 'Remember') + '</h4>' + ul([T('Jangan redah air lebih 15 cm (kereta boleh hanyut pada 30 cm).', 'Never drive through more than 15 cm of water (cars float at 30 cm).'), T('Guna jalan utama; semak kemas kini JKR / polis & Waze sebelum bertolak.', 'Use main roads; check JKR / police updates & Waze before leaving.'), T('Beritahu keluarga laluan & masa sampai.', 'Tell family your route & arrival time.')]);
      },
      prompt: function (v) {
        var dt = tripTime(v), sts = stations().filter(function (s) { return (v.sts || []).indexOf(s.id) >= 0; });
        return promptFrame({ title: P('Perjalanan selamat?', 'Is my trip safe?'), role: ROLE_LAND(), ask: [P('Dari: ', 'From: ') + (v.from || '-'), P('Ke: ', 'To: ') + (v.to || '-'), P('Bertolak: ', 'Leaving: ') + when(dt, ui.lang)],
          data: landData(ui.lang, ui.len === 'full', sts.length ? sts : null), q: [P('Adakah laluan ini selamat pada masa itu? Jalan / kawasan mana mungkin banjir atau ditutup?', 'Is this route safe at that time? Which roads / areas may flood or be closed?'), P('Laluan alternatif dan masa terbaik untuk bertolak.', 'Other routes and the best time to leave.')] });
      } },
    { id: 'outdoor', sec: T('Harian', 'Daily'), icon: '⛱️', title: T('Aktiviti luar / hujan', 'Outdoor plans / rain'), desc: T('Kenduri, kebun, memancing sungai', 'Feast, garden, river fishing'),
      form: function (v) { return field(T('Aktiviti', 'Activity'), sel('act', [['kenduri', T('Kenduri / majlis luar', 'Feast / outdoor event')], ['kebun', T('Kerja kebun / ladang', 'Garden / farm work')], ['pancing', T('Memancing sungai / bot kecil', 'River fishing / small boat')], ['sukan', T('Sukan / riadah', 'Sport / exercise')], ['jemur', T('Jemur pakaian / hasil', 'Drying clothes / crops')]], v.act || 'kenduri')) +
        field(T('Hari', 'Day'), seg('day', [['0', T('Hari ini', 'Today')], ['1', T('Esok', 'Tomorrow')], ['2', T('Lusa', 'Day after')]], v.day || '0')) + field(T('Masa', 'Time'), seg('slot', [['m', T('Pagi', 'Morning')], ['a', T('Petang', 'Afternoon')], ['n', T('Malam', 'Night')], ['d', T('Sepanjang hari', 'All day')]], v.slot || 'd')); },
      guide: function (v) {
        var d0 = C.localMs(C.dateKey(Date.now() + (+v.day || 0) * DAY)), sl = { m: [7, 12], a: [12, 19], n: [19, 24], d: [7, 22] }[v.slot || 'd'];
        var w = snap().weather, H = ((w && w.hourly) || []).filter(function (h) { return h.t >= d0 + sl[0] * HOUR && h.t < d0 + sl[1] * HOUR; });
        if (!H.length) return need(false, T('Tiada ramalan setiap jam untuk masa ini.', 'No hourly forecast for this time.'));
        var rr = sum(H.map(function (h) { return h.p; })), pp = maxv(H.map(function (h) { return h.pp; })), th = H.filter(function (h) { return h.code >= 95; }), gust = maxv(H.map(function (h) { return h.gust; }));
        var dryH = H.filter(function (h) { return (h.p || 0) < 0.3 && (h.pp === null || h.pp < 40); });
        var lvl = th.length || (rr || 0) >= 20 ? 2 : (rr || 0) >= 3 || (pp || 0) >= 60 ? 1 : 0;
        if (v.act === 'pancing') { var st = stations().filter(function (s) { return (RANK[s.status] || 0) >= 1; }); if (st.length) lvl = Math.max(lvl, (RANK[st[0].status] || 0) >= 2 ? 3 : 2); }
        var best = []; var run = null;
        dryH.forEach(function (h) { if (run && h.t === run.t1) run.t1 = h.t + HOUR; else { run = { t0: h.t, t1: h.t + HOUR }; best.push(run); } });
        best.sort(function (a, b) { return (b.t1 - b.t0) - (a.t1 - a.t0); });
        return big(lvl, [T('🟢 Sesuai', '🟢 Good to go'), T('🟡 Boleh, sedia payung / khemah', '🟡 OK, bring umbrellas / a tent'), T('🟠 Hujan lebat / ribut petir dijangka', '🟠 Heavy rain / thunderstorms expected'), T('🔴 Elak — sungai tinggi', '🔴 Avoid — river is high')][lvl]) +
          ul([T('Hujan dalam tempoh: {m} mm, peluang maks {p}%', 'Rain in this time: {m} mm, max chance {p}%').replace('{m}', f(rr, 1)).replace('{p}', f(pp, 0)), th.length ? '⛈️ ' + T('Ribut petir sekitar {t}', 'Thunderstorm around {t}').replace('{t}', hm(th[0].t)) : T('Tiada ribut petir dalam ramalan', 'No thunderstorm in the forecast'), T('Tiupan angin maks {g} km/j', 'Max gusts {g} km/h').replace('{g}', f(gust, 0)),
            best.length ? T('Masa paling kering: {a}–{b}', 'Driest time: {a}–{b}').replace('{a}', hm(best[0].t0)).replace('{b}', hm(best[0].t1)) : T('Tiada tempoh kering yang jelas', 'No clear dry spell')]) +
          (th.length ? '<p class="note">' + T('Ribut petir: masuk ke bangunan bila dengar guruh; jauhi pokok tinggi, air & tiang logam.', 'Thunderstorms: go indoors when you hear thunder; stay away from tall trees, water & metal poles.') + '</p>' : '');
      },
      prompt: function (v) {
        var names = { kenduri: P('kenduri / majlis luar', 'outdoor feast / event'), kebun: P('kerja kebun', 'garden / farm work'), pancing: P('memancing di sungai', 'river fishing'), sukan: P('sukan / riadah', 'sport'), jemur: P('jemur pakaian / hasil', 'drying clothes / crops') };
        var w = snap().weather, d0 = C.localMs(C.dateKey(Date.now() + (+v.day || 0) * DAY));
        var H = ((w && w.hourly) || []).filter(function (h) { return h.t >= d0 + 6 * HOUR && h.t < d0 + 24 * HOUR; });
        return promptFrame({ title: P('Aktiviti luar', 'Outdoor plans'), role: P('Anda pakar cuaca di Malaysia yang memberi nasihat praktikal.', 'You are a Malaysian weather expert giving practical advice.'),
          ask: [P('Aktiviti: ', 'Activity: ') + (names[v.act] || v.act), P('Hari: ', 'Day: ') + dayLbl(d0 + 12 * HOUR, ui.lang), P('Masa: ', 'Time: ') + ({ m: P('pagi', 'morning'), a: P('petang', 'afternoon'), n: P('malam', 'night'), d: P('sepanjang hari', 'all day') }[v.slot || 'd'])],
          data: landData(ui.lang, false).concat(H.length ? [P('- Hujan setiap jam (mm, peluang %): ', '- Hourly rain (mm, chance %): ') + H.map(function (h) { return hm(h.t) + ' ' + f(h.p, 1) + (h.pp !== null ? '/' + f(h.pp, 0) + '%' : '') + (h.code >= 95 ? '⛈' : ''); }).join(', ')] : []),
          q: [P('Sesuai atau tidak? Masa terbaik?', 'Is it a good idea? Best time?'), P('Persediaan jika hujan / ribut petir.', 'What to prepare for rain / thunder.')] });
      } },
    { id: 'wa', sec: T('Harian', 'Daily'), icon: '💬', title: T('Ringkasan WhatsApp', 'WhatsApp summary'), desc: T('Mesej pendek untuk keluarga / kampung', 'Short message for family / village'),
      form: function (v) { return field(T('Untuk', 'For'), seg('to', [['fam', T('Keluarga', 'Family')], ['kg', T('Kumpulan kampung', 'Village group')]], v.to || 'fam')); },
      guide: function (v) {
        var msg = waText(v);
        return '<h4>' + T('Mesej sedia dihantar', 'Message ready to send') + '</h4><textarea class="inp ask-prompt" id="askWa" readonly style="min-height:170px;font-family:var(--font);font-size:13.5px">' + esc(msg) + '</textarea>' +
          '<div class="ask-btns"><button type="button" class="btn pri" id="askWaCopy">📋 ' + T('Salin mesej', 'Copy message') + '</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">WhatsApp ↗</a><small class="muted">' + msg.length + T(' aksara', ' characters') + '</small></div>';
      },
      prompt: function (v) {
        return promptFrame({ title: P('Ringkasan WhatsApp', 'WhatsApp summary'), role: ROLE_LAND(), ask: [P('Untuk: ', 'For: ') + (v.to === 'kg' ? P('kumpulan WhatsApp kampung', 'the village WhatsApp group') : P('keluarga', 'family'))],
          data: landData(ui.lang, false), guide: [P('Draf app: ', 'App draft: ') + waText(v).replace(/\n/g, ' / ')], q: [P('Tulis semula draf ini sebagai mesej WhatsApp pendek (bawah 600 aksara), tenang tapi jelas, dengan apa perlu dibuat.', 'Rewrite this draft as a short WhatsApp message (under 600 characters), calm but clear, with what to do.')] });
      } },
    { id: 'outlook', sec: T('Harian', 'Daily'), icon: '🗓️', title: T('Tinjauan 7 hari / tengkujuh', '7-day / monsoon outlook'), desc: T('Minggu ni & musim monsun', 'This week & the monsoon season'),
      form: function () { return ''; },
      guide: function () {
        var d = dailyFc(7);
        if (!d.length) return need(false, T('Tiada ramalan harian.', 'No daily forecast.'));
        var tot = sum(d.map(function (x) { return x.p; })), wet = d.filter(function (x) { return (x.p || 0) >= 30; }), mo = C.myt(Date.now()).mo, monsoon = mo >= 11 || mo <= 3;
        var lvl = wet.length >= 2 || (tot || 0) >= 150 ? 2 : wet.length || (tot || 0) >= 60 ? 1 : 0;
        return big(lvl, T('Jumlah hujan 7 hari: {m} mm · {n} hari lebat (≥ 30 mm)', 'Rain over 7 days: {m} mm · {n} heavy days (≥ 30 mm)').replace('{m}', f(tot, 0)).replace('{n}', wet.length)) +
          '<div class="oc-scroll"><table class="tbl"><thead><tr><th>' + T('Hari', 'Day') + '</th><th class="num">' + T('Hujan', 'Rain') + '</th><th class="num">°C</th><th class="num">' + T('Tiupan', 'Gusts') + '</th></tr></thead><tbody>' +
          d.map(function (x) { return '<tr><td>' + esc(dayLbl(C.localMs(x.date) + 12 * HOUR)) + '</td><td class="num' + ((x.p || 0) >= 30 ? ' hot' : '') + '">' + f(x.p, 1) + ' mm</td><td class="num">' + f(x.tmin, 0) + '–' + f(x.tmax, 0) + '</td><td class="num">' + f(x.gust, 0) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
          (glofasLine() ? '<p class="note">' + esc(glofasLine()) + '</p>' : '') +
          '<p class="note">' + (monsoon ? T('Sekarang musim Monsun Timur Laut (Nov – Mac): hujan lebat berterusan beberapa hari & "monsoon surge" biasa berlaku. Pantau amaran MET setiap hari.', 'It is the Northeast Monsoon (Nov – Mar): several days of heavy rain & "monsoon surges" are common. Check MET warnings daily.')
            : T('Bukan musim monsun timur laut: hujan biasanya ribut petir petang yang singkat.', 'Not the northeast monsoon: rain is usually short afternoon thunderstorms.')) + '</p>';
      },
      prompt: function () {
        return promptFrame({ title: P('Tinjauan 7 hari & musim tengkujuh', '7-day & monsoon outlook'), role: ROLE_LAND(), data: landData(ui.lang, true),
          q: [P('Ringkasan cuaca & risiko banjir 7 hari akan datang, hari mana paling berisiko.', 'Summary of weather & flood risk for the next 7 days, which days are riskiest.'), P('Apa kata MET Malaysia tentang monsun / "monsoon surge" minggu ini dan 2–4 minggu akan datang?', 'What does MET Malaysia say about the monsoon / monsoon surges this week and the next 2–4 weeks?')] });
      } }
  ];
  function tripTime(v) {
    var m = /^(\d{1,2})[:.]?(\d{2})?$/.exec(String(v.time || '07:00').trim()), hh = m ? Math.min(23, +m[1]) : 7, mm = m && m[2] ? Math.min(59, +m[2]) : 0;
    var t = C.localMs(C.dateKey(Date.now() + (+v.day || 0) * DAY)) + hh * HOUR + mm * 60000;
    return t;
  }
  function waText(v) {
    var r = riskNow(), sts = stations().slice().sort(function (a, b) { return (RANK[b.status] || 0) - (RANK[a.status] || 0) || pctD(b) - pctD(a); }), e = earlyLoud(), m = metLand();
    var en = I18N.lang() === 'en', lines = [];
    lines.push((v.to === 'kg' ? (en ? '📢 Flood update ' : '📢 Makluman banjir ') : (en ? '🌧️ Weather & river ' : '🌧️ Cuaca & sungai ')) + state.settings.locationName + ' — ' + stamp());
    if (r) lines.push((en ? 'Flood risk 24 h: ' : 'Risiko banjir 24 j: ') + ['🟢', '🟡', '🟠', '🔴', '🟣'][r.score.level] + ' ' + r.score.label + ' (' + r.score.score + '/100)');
    sts.slice(0, 3).forEach(function (s) { var t = trendOf(s); lines.push('• ' + s.name + ': ' + f(s.level, 2) + ' m ' + (ST[s.status] || '') + (t && t.rising ? (en ? ' ↑ rising' : ' ↑ naik') : t && t.rate < -0.01 ? (en ? ' ↓ falling' : ' ↓ turun') : '')); });
    lines.push((en ? 'Rain next 24 h: ~' : 'Hujan 24 j: ~') + f(rain24(), 0) + ' mm');
    if (e.length) lines.push('⚠️ ' + e[0].title);
    if (m.length) lines.push('MET: ' + metLine(m[0], I18N.lang()));
    var lvl = r ? r.score.level : 0;
    lines.push(lvl >= 3 ? (en ? 'Get ready to leave; follow APM / village head.' : 'Sedia untuk pindah; ikut arahan APM / ketua kampung.') : lvl >= 2 ? (en ? 'Move valuables & cars to high ground.' : 'Alih barang berharga & kereta ke tempat tinggi.') : lvl === 1 ? (en ? 'Keep watch; bag & documents ready.' : 'Terus pantau; sedia beg & dokumen.') : (en ? 'No action needed. Stay alert.' : 'Tiada tindakan khas. Terus berwaspada.'));
    lines.push(en ? '(from the Monsoon EYE app; follow official instructions)' : '(dari app Monsoon EYE; ikut arahan rasmi)');
    return lines.join('\n').slice(0, 700);
  }

  /* ================================================================= OFFSHORE purposes (OceanWATCH) */
  var VIA_ACT = { boat: 'boat', heli: 'heli', tow: 'supply' };
  function goWord(st) { return st === null || st === undefined ? '-' : ['GO', 'CAUTION', 'NO-GO', 'NO-GO'][st]; }
  function jobCells(r, id) { var i = r.items.map(function (x) { return x.id; }).indexOf(id); return i < 0 ? null : r.cells.map(function (row) { return row[i]; }); }
  function needOff() { return rep() ? null : need(false, MC.Off.busy ? T('Membaca model…', 'Reading the models…') : MC.Off.err ? esc(MC.Off.err) : T('Belum ada data model offshore. Tekan ⚡ di atas.', 'No offshore model data yet. Tap ⚡ at the top.')); }
  function rangeFrom(v, defH) {
    var now = Date.now(), d = +(v.day || 0), t0 = d === 0 ? now : C.localMs(C.dateKey(now + d * DAY)) + 6 * HOUR;
    var hrs = +(v.hrs || defH || 12);
    return [t0, t0 + hrs * HOUR];
  }
  function blockTable(r, ids) {
    return '<div class="oc-scroll"><table class="jx"><tr><th></th>' + r.blocks.map(function (b) { return '<th>' + esc(b.label.split('–')[0]) + '<small>' + esc(A().shortDay(b.day)) + '</small></th>'; }).join('') + '</tr>' +
      ids.map(function (id) { var i = r.items.map(function (x) { return x.id; }).indexOf(id); if (i < 0) return ''; return '<tr' + (i === 0 ? ' class="lq"' : '') + '><td>' + esc(r.items[i].name) + '</td>' + r.cells.map(function (row) { var c = row[i]; return '<td class="c s' + (c.st === null ? 'x' : c.st) + '" title="' + esc((c.why || []).join(' · ')) + '">' + (c.st === null ? '-' : i === 0 ? ['G', 'C', 'L', 'LQ'][c.st] : ['G', 'C', 'N'][c.st]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
  }
  function dayOpts() { return [['0', T('Sekarang', 'Now')], ['1', T('Esok', 'Tomorrow')], ['2', T('Lusa', 'Day after')]]; }
  function demobJob(v) {
    if (v.mode === 'gen') {
      var n = function (x, d) { var y = parseFloat(String(x === undefined ? '' : x).replace(',', '.')); return isFinite(y) ? y : d; };
      var o = { id: 'gen', name: T('Kerja umum', 'General job'), w: [n(v.gw, 20) * 0.8, n(v.gw, 20)], g: [n(v.gg, 28) * 0.8, n(v.gg, 28)], h: [n(v.gh, 1.8) * 0.8, n(v.gh, 1.8)], lt: 's', demobH: n(v.gd, 6), safeH: 1, via: v.gvia || 'boat' };
      if (n(v.gtp, 0) > 0) o.tp = [n(v.gtp, 10) - 1, n(v.gtp, 10)];
      return o;
    }
    var j = jobById(v.job || (v.mode === 'my' ? (jobsAll().acts.filter(function (a) { return a.mine; })[0] || {}).id : 'cargo'));
    if (!j) return null;
    if (!j.mine) j = Object.assign({}, j, { demobH: +(v.sd || 6), safeH: 1, via: v.svia || 'boat' });
    return j;
  }
  function demobOut(v) {
    var job = demobJob(v), M = A();
    if (!job) return null;
    var via = jobById(VIA_ACT[job.via] || 'boat');
    return { job: job, plan: M.demobPlan({ rep: rep(), snap: snap(), job: job, via: via, now: Date.now(), hours: 72 }) };
  }
  function demobSentence(o, lang) {
    var p = o.plan, en = lang === 'en', S = p.startBy;
    if (p.none) return en ? 'No stop limit is reached in the next 3 days (all models) — no demob needed for weather.' : 'Tiada had henti dicapai dalam 3 hari (semua model) — tiada keperluan demob kerana cuaca.';
    var w = function (x) { return x ? (x.late ? (en ? 'NOW (already late)' : 'SEKARANG (sudah lewat)') : when(x.t, lang)) : (en ? 'none in 3 days' : 'tiada dalam 3 hari'); };
    var main = S.m || S.hi;
    if (main && main.late && (!S.hi || S.hi.late) && (!S.lo || S.lo.late)) return en ? 'Start demob NOW — the stop limit is already reached or too close (all models)' : 'Mula demob SEKARANG — had henti sudah dicapai atau terlalu dekat (semua model)';
    return (en ? 'Start demob by ' : 'Mula demob paling lewat ') + w(main) + ' (' + (en ? 'worst model ' : 'model teruk ') + w(S.hi) + ' · ' + (en ? 'best model ' : 'model ok ') + w(S.lo) + ')';
  }
  var OFF_T = [
    { id: 'canjob', sec: 'Go / No-Go', icon: '🏗️', title: T('Boleh buat kerja X?', 'Can we do job X?'), desc: T('Satu kerja + masa → Go / No-Go dengan sebab', 'One job + time → Go / No-Go with reasons'),
      form: function (v) { return field(T('Kerja', 'Job'), sel('job', jobOptions(false), v.job || 'cargo')) + field(T('Bila', 'When'), seg('day', dayOpts(), v.day || '0')) + field(T('Berapa lama', 'How long'), seg('hrs', [['6', '6 j'], ['12', '12 j'], ['24', '24 j']], v.hrs || '12')); },
      guide: function (v) {
        var x = needOff(); if (x) return x;
        var rg = rangeFrom(v, 12), r = offAssess(rg[0], rg[1]), cells = r && jobCells(r, v.job || 'cargo');
        if (!cells || !cells.length) return need(false, T('Tiada blok masa.', 'No time blocks.'));
        var worst = Math.max.apply(null, cells.map(function (c) { return c.st === null ? 0 : c.st; })), goN = cells.filter(function (c) { return c.st === 0; }).length;
        var w = (r.windows || []).filter(function (x) { return x.id === (v.job || 'cargo'); })[0];
        return big(worst === 0 ? 0 : worst === 1 ? 1 : goN ? 2 : 3, (worst === 0 ? '🟢 GO ' : worst === 1 ? '🟡 CAUTION ' : goN ? '🟠 ' + T('Sebahagian masa sahaja', 'Only part of the time') + ' ' : '🔴 NO-GO ') + '— ' + esc(r.items.filter(function (it) { return it.id === (v.job || 'cargo'); })[0].name)) +
          blockTable(r, ['lq', v.job || 'cargo']) + '<h4>' + T('Sebab', 'Reasons') + '</h4>' + ul(cells.map(function (c, i) { return '<b>' + esc(r.blocks[i].label) + ' ' + goWord(c.st) + '</b>: ' + esc((c.why || []).join('; ')); })) +
          (w && w.list.length ? '<p><b>' + T('Weather window:', 'Weather window:') + '</b> ' + w.list.slice(0, 3).map(function (x) { return when(x.t0) + ' – ' + when(x.t1) + ' (' + x.hours + ' j)'; }).join(', ') + '</p>' : '') +
          '<p class="note">' + T('Had: ', 'Limits: ') + esc(limitText(jobById(v.job || 'cargo'))) + '. ' + T('Keputusan akhir oleh OIM / Marine.', 'Final decision by the OIM / Marine.') + '</p>';
      },
      prompt: function (v) {
        var rg = rangeFrom(v, 12), j = jobById(v.job || 'cargo'), r = offAssess(rg[0], rg[1]), cells = r && jobCells(r, v.job || 'cargo');
        return promptFrame({ title: P('Boleh buat kerja: ', 'Can we do: ') + I18N.L(j.name), role: ROLE_OFF(), ask: [P('Kerja: ', 'Job: ') + I18N.L(j.name) + ' (' + P('had berhati-hati / henti: ', 'caution / stop limits: ') + limitText(j, ui.lang) + ')', P('Masa: ', 'Time: ') + when(rg[0], ui.lang) + ' – ' + when(rg[1], ui.lang)],
          data: offData(ui.lang, ui.len === 'full', rg[0], rg[1]), guide: cells ? cells.map(function (c, i) { return r.blocks[i].label + ': ' + goWord(c.st) + ' — ' + (c.why || []).join('; '); }) : null,
          q: [P('Go atau No-Go untuk kerja ini pada masa itu? Blok masa mana paling selamat?', 'Go or No-Go for this job at that time? Which time block is safest?'), P('Risiko utama (angin, alun panjang, ribut petir) dan apa perlu diperhati.', 'Main risks (wind, long swell, thunderstorms) and what to watch.')],
          how: ui.lang === 'en' ? ['Refer to IMCA / IOGP / DNV-ST-N001 marine operations practice where useful.'] : ['Rujuk amalan IMCA / IOGP / DNV-ST-N001 (marine operations) bila berkaitan.'] });
      } },
    { id: 'demob', sec: 'Go / No-Go', icon: '🧰', title: T('Teruskan atau demob?', 'Continue or demob?'), desc: T('Bila berhenti, pukul berapa mula demob — kerja & had sendiri', 'When to stop, what time to start demob — your own job & limits'),
      form: function (v) {
        var mode = v.mode || 'std', mine = jobsAll().acts.filter(function (a) { return a.mine; });
        var h = field(T('Jenis', 'Type'), seg('mode', [['std', T('10 kerja standard', '10 standard jobs')], ['gen', T('Umum', 'General')], ['my', T('Kerja saya', 'My job')]], mode));
        var viaOpts = [['boat', T('Bot (FCB)', 'Boat (FCB)')], ['heli', T('Helikopter', 'Helicopter')], ['tow', T('Tunda barge', 'Tow barge')]];
        if (mode === 'std') h += field(T('Kerja', 'Job'), sel('job', jobOptions(false).filter(function (o) { return !/^my-/.test(o[0]); }), v.job || 'cargo')) + field(T('Demob ambil (jam)', 'Demob takes (hours)'), inp('sd', v.sd || 6, '6', 'number')) + field(T('Demob dengan', 'Demob by'), seg('svia', viaOpts, v.svia || 'boat'));
        else if (mode === 'gen') h += field(T('Henti bila angin ≥ (kt)', 'Stop when wind ≥ (kt)'), inp('gw', v.gw || 20, '20', 'number')) + field(T('Henti bila tiupan ≥ (kt)', 'Stop when gusts ≥ (kt)'), inp('gg', v.gg || 28, '28', 'number')) +
          field(T('Henti bila Hs ≥ (m)', 'Stop when Hs ≥ (m)'), inp('gh', v.gh || 1.8, '1.8', 'number')) + field(T('Henti bila tempoh alun ≥ (s, 0 = tidak)', 'Stop when swell period ≥ (s, 0 = off)'), inp('gtp', v.gtp || 0, '0', 'number')) +
          field(T('Demob ambil (jam)', 'Demob takes (hours)'), inp('gd', v.gd || 6, '6', 'number')) + field(T('Demob dengan', 'Demob by'), seg('gvia', viaOpts, v.gvia || 'boat'));
        else h += mine.length ? field(T('Kerja saya', 'My job'), sel('job', mine.map(function (a) { return [a.id, a.name]; }), v.job && /^my-/.test(v.job) ? v.job : mine[0].id)) + '<div><label>&nbsp;</label><button type="button" class="btn" data-go="settings" data-anchor-to="myJobsCard">⚙️ ' + T('Urus kerja saya', 'Manage my jobs') + '</button></div>'
          : '<div><label>' + T('Kerja saya', 'My job') + '</label><button type="button" class="btn pri" data-go="settings" data-anchor-to="myJobsCard">➕ ' + T('Tambah kerja saya (Tetapan)', 'Add my job (Settings)') + '</button></div>';
        return h;
      },
      guide: function (v) {
        var x = needOff(); if (x) return x;
        if ((v.mode || 'std') === 'my' && !jobsAll().acts.some(function (a) { return a.mine; })) return need(false, T('Belum ada kerja sendiri. Tambah di Tetapan › Kerja saya (contoh: Wellwork HWU, had angin 20 kt, Hs 1.8 m, demob 6 jam dengan bot).', 'No own job yet. Add one in Settings › My jobs (e.g. Wellwork HWU, wind 20 kt, Hs 1.8 m, demob 6 hours by boat).'));
        var o = demobOut(v); if (!o) return need(false, T('Pilih kerja.', 'Pick a job.'));
        var p = o.plan, now = Date.now(), M = A(), H = rep().hours.filter(function (h) { return h.t + HOUR > now && h.t < now + 72 * HOUR; });
        var metStop = function (t) { return M.metActive(snap(), t, t + HOUR, null, false).some(function (w) { return w.severity === 'critical'; }); };
        var cells = H.map(function (h) { return metStop(h.t) ? 2 : M.judge(o.job, { w: h.w10.m, g: h.g.m, h: h.hs.m, sw: h.wh, tp: h.wh !== null && h.wh >= 0.8 ? h.wt : null, thunder: h.thunder }).st; });
        var lab = [0, 12, 24, 36, 48, 60, 71].filter(function (i) { return i < H.length; }).map(function (i) { return when(H[i].t); });
        var S = p.startBy, main = S.m || S.hi, lvl = p.none ? 0 : main && main.late ? 3 : main && main.t - now < 6 * HOUR ? 2 : 1;
        var vianame = { boat: T('bot', 'boat'), heli: T('helikopter', 'helicopter'), tow: T('tunda barge', 'tow barge') }[o.job.via || 'boat'];
        return big(lvl, (p.none ? '🟢 ' : ['🟢 ', '🟡 ', '🟠 ', '🔴 '][lvl]) + esc(demobSentence(o, I18N.lang()))) + strip(cells, now, now + 72 * HOUR, lab) +
          ul([p.limitAt.m ? T('Had henti dicapai (nilai tengah): {t}', 'Stop limit reached (middle of models): {t}').replace('{t}', when(p.limitAt.m)) + (p.why.length ? ' — ' + esc(p.why.join('; ')) : '') : T('Nilai tengah model: tiada had henti dalam 3 hari', 'Middle of models: no stop limit in 3 days'),
            T('Model paling teruk: {a} · model paling ok: {b}', 'Worst model: {a} · best model: {b}').replace('{a}', p.limitAt.hi ? when(p.limitAt.hi) : '-').replace('{b}', p.limitAt.lo ? when(p.limitAt.lo) : T('tiada dalam 3 hari', 'none in 3 days')),
            T('Demob {d} jam + {s} jam selamat, keluar dengan {v}', 'Demob {d} h + {s} h safety, leaving by {v}').replace('{d}', p.demobH).replace('{s}', p.leadH - p.demobH).replace('{v}', vianame) + (main && main.moved ? ' — ' + T('masa dimajukan supaya {v} masih dalam had ketika keluar', 'moved earlier so the {v} is still within limits when leaving').replace('{v}', vianame) : ''),
            p.leaveNow ? T('{v} boleh keluar sekarang', 'The {v} can leave now').replace('{v}', vianame) : '⚠️ ' + T('{v} di luar had sekarang', 'The {v} is outside its limits now').replace('{v}', vianame)]) +
          '<p class="note">' + T('Jalur: 3 hari setiap jam untuk kerja ini (hijau Go, kuning Caution, merah No-Go). Had: ', 'Strip: 3 days, every hour for this job (green Go, yellow Caution, red No-Go). Limits: ') + esc(limitText(o.job)) + '. ' + T('Keputusan akhir oleh OIM / Marine.', 'Final decision by the OIM / Marine.') + '</p>';
      },
      prompt: function (v) {
        var o = demobOut(v);
        if (!o) return '';
        var j = o.job;
        return promptFrame({ title: P('Teruskan atau demob? — ', 'Continue or demob? — ') + I18N.L(j.name), role: ROLE_OFF(),
          ask: [P('Kerja: ', 'Job: ') + I18N.L(j.name), P('Had berhati-hati / henti: ', 'Caution / stop limits: ') + limitText(j, ui.lang), P('Demob ambil ', 'Demob takes ') + (j.demobH || 6) + P(' jam + 1 jam selamat, keluar dengan ', ' h + 1 h safety, leaving by ') + (j.via || 'boat')],
          data: offData(ui.lang, ui.len === 'full'), guide: [demobSentence(o, ui.lang)].concat(o.plan.why || []),
          q: [P('Patut teruskan kerja atau mula demob? Pukul berapa paling lewat mula demob?', 'Should we continue or start demob? What is the latest time to start demob?'), P('Sejauh mana model bersetuju? Apa yang boleh mengubah keputusan (cold surge, alun panjang, ribut petir)?', 'How well do the models agree? What could change the decision (cold surge, long swell, thunderstorms)?'), P('Bila boleh mob semula?', 'When could we mobilise again?')] });
      } },
    { id: 'window', sec: 'Go / No-Go', icon: '🪟', title: T('Cari weather window', 'Find a weather window'), desc: T('Tempoh selamat seterusnya untuk satu kerja, 3–7 hari', 'Next safe period for a job, 3–7 days'),
      form: function (v) { return field(T('Kerja', 'Job'), sel('job', jobOptions(false), v.job || 'cargo')) + field(T('Cari dalam', 'Search'), seg('days', [['3', '3 ' + T('hari', 'days')], ['5', '5 ' + T('hari', 'days')], ['7', '7 ' + T('hari', 'days')]], v.days || '3')) + field(T('Paling pendek (jam)', 'Shortest (hours)'), inp('min', v.min || state.settings.advWindowH, '4', 'number')); },
      guide: function (v) {
        var x = needOff(); if (x) return x;
        var Ad = A(), now = Date.now(), d = +(v.days || 3), s = state.settings;
        var B = Ad.blocks({ from: C.dateKey(now), to: C.dateKey(now + (d - 1) * DAY), res: 'day', now: now });
        var r = Ad.assessOffshore({ rep: rep(), snap: snap(), blocks: B, limits: Ad.limits(s.advLimits), now: now, minWindow: Math.max(1, +(v.min || s.advWindowH)), early: MC.Early.offCfg(s) });
        var w = (r.windows || []).filter(function (x) { return x.id === (v.job || 'cargo'); })[0];
        var list = w ? w.list : [];
        return big(list.length ? 0 : 3, list.length ? '🟢 ' + T('{n} window dijumpai', '{n} windows found').replace('{n}', list.length) : '🔴 ' + T('Tiada window cukup panjang', 'No window long enough')) +
          (list.length ? '<table class="tbl"><thead><tr><th>' + T('Mula', 'From') + '</th><th>' + T('Tamat', 'To') + '</th><th class="num">' + T('Jam', 'Hours') + '</th></tr></thead><tbody>' + list.slice(0, 10).map(function (x) { return '<tr><td>' + when(x.t0) + '</td><td>' + when(x.t1) + '</td><td class="num">' + x.hours + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
          '<p class="note">' + T('Window = setiap jam Go (nilai tengah model) untuk kerja ini, termasuk siang sahaja & amaran MET tahap bahaya. Had: ', 'Window = every hour Go (middle of models) for this job, including daylight-only & MET danger warnings. Limits: ') + esc(limitText(jobById(v.job || 'cargo'))) + '</p>';
      },
      prompt: function (v) {
        var j = jobById(v.job || 'cargo');
        return promptFrame({ title: P('Cari weather window — ', 'Find a weather window — ') + I18N.L(j.name), role: ROLE_OFF(), ask: [P('Kerja: ', 'Job: ') + I18N.L(j.name) + ' (' + limitText(j, ui.lang) + ')', P('Cari dalam ', 'Within ') + (v.days || 3) + P(' hari, sekurang-kurangnya ', ' days, at least ') + (v.min || state.settings.advWindowH) + P(' jam', ' hours')],
          data: offData(ui.lang, true), q: [P('Bila weather window terbaik untuk kerja ini? Berapa yakin?', 'When is the best weather window for this job? How confident?'), P('Rancangan alternatif jika window terlepas.', 'A fallback plan if the window is missed.')] });
      } },
    { id: 'downtime', sec: 'Go / No-Go', icon: '⏳', title: T('Weather downtime minggu ni', 'Weather downtime this week'), desc: T('Jam hilang setiap kerja, rancang sekitarnya', 'Hours lost per job, plan around them'),
      form: function (v) { return field(T('Tempoh', 'Period'), seg('days', [['3', '3 ' + T('hari', 'days')], ['7', '7 ' + T('hari', 'days')]], v.days || '7')); },
      guide: function (v) {
        var x = needOff(); if (x) return x;
        var now = Date.now(), d = +(v.days || 7), M = A(), lim = M.limits(state.settings.advLimits), H = rep().hours.filter(function (h) { return h.t >= now && h.t < now + d * DAY; });
        var light = function (t) { var hr = C.myt(t).h; return hr >= 7 && hr < 19; };
        var rows = lim.acts.filter(function (a) { return a.on !== false; }).map(function (a) {
          var hh = a.day ? H.filter(function (h) { return light(h.t); }) : H, lost = 0;
          hh.forEach(function (h) { if (M.judge(a, { w: h.w10.m, g: h.g.m, h: h.hs.m, sw: h.wh, tp: h.wh !== null && h.wh >= 0.8 ? h.wt : null, thunder: h.thunder }).st === 2) lost++; });
          return { a: a, lost: lost, of: hh.length };
        }).sort(function (x, y) { return y.lost / Math.max(1, y.of) - x.lost / Math.max(1, x.of); });
        return '<table class="tbl"><thead><tr><th>' + T('Kerja', 'Job') + '</th><th class="num">' + T('Jam No-Go', 'No-Go hours') + '</th><th class="num">%</th></tr></thead><tbody>' + rows.map(function (r) { var pc = Math.round(r.lost / Math.max(1, r.of) * 100); return '<tr><td>' + (r.a.mine ? '★ ' : '') + esc(I18N.L(r.a.name)) + (r.a.day ? ' <small class="muted">(' + T('siang', 'daylight') + ')</small>' : '') + '</td><td class="num">' + r.lost + ' / ' + r.of + '</td><td class="num' + (pc >= 50 ? ' hot' : '') + '">' + pc + '%</td></tr>'; }).join('') + '</tbody></table>' +
          '<p class="note">' + T('Dikira setiap jam dengan nilai tengah model, {d} hari ke depan (data model sehingga ~7–10 hari).', 'Counted hour by hour with the middle of the models, {d} days ahead (model data up to ~7–10 days).').replace('{d}', d) + '</p>';
      },
      prompt: function (v) {
        return promptFrame({ title: P('Weather downtime minggu ini', 'Weather downtime this week'), role: ROLE_OFF(), data: offData(ui.lang, true),
          q: [P('Anggaran jam hilang (weather downtime) setiap jenis kerja untuk ', 'Estimated hours lost (weather downtime) per job type for the next ') + (v.days || 7) + P(' hari.', ' days.'), P('Cadangan susunan kerja supaya kerja sensitif cuaca dibuat dalam window terbaik.', 'How to order the work so weather-sensitive jobs fall in the best windows.')] });
      } },
    { id: 'crew', sec: T('Orang & perjalanan', 'People & travel'), icon: '🚁', title: T('Crew change', 'Crew change'), desc: T('Helikopter / bot: risiko tunda atau batal', 'Helicopter / boat: risk of delay or cancel'),
      form: function (v) { return field(T('Dengan', 'By'), seg('by', [['heli', T('Helikopter', 'Helicopter')], ['boat', T('Bot (FCB)', 'Boat (FCB)')]], v.by || 'heli')) + field(T('Hari', 'Day'), seg('day', dayOpts(), v.day || '1')); },
      guide: function (v) {
        var x = needOff(); if (x) return x;
        var id = v.by === 'boat' ? 'boat' : 'heli', now = Date.now(), d = +(v.day || 1), t0 = d === 0 ? now : C.localMs(C.dateKey(now + d * DAY)) + 7 * HOUR, t1 = C.localMs(C.dateKey(now + d * DAY)) + 19 * HOUR;
        if (t1 <= now) return need(false, T('Waktu siang hari ini sudah tamat — pilih esok.', 'Today\'s daylight is over — pick tomorrow.'));
        var r = offAssess(t0, t1), cells = jobCells(r, id) || [], go = cells.filter(function (c) { return c.st === 0; }).length, ng = cells.filter(function (c) { return c.st === 2; }).length;
        var lvl = !cells.length ? 1 : ng === cells.length ? 3 : ng ? 2 : cells.some(function (c) { return c.st === 1; }) ? 1 : 0;
        return big(lvl, ['🟢 ' + T('Risiko tunda rendah', 'Low risk of delay'), '🟡 ' + T('Mungkin tunda sebentar', 'May be delayed a little'), '🟠 ' + T('Risiko tunda tinggi — rancang masa ganti', 'High risk of delay — plan a backup time'), '🔴 ' + T('Kemungkinan besar batal', 'Likely cancelled')][lvl]) + blockTable(r, ['lq', id]) +
          ul(cells.map(function (c, i) { return '<b>' + esc(r.blocks[i].label) + '</b> ' + goWord(c.st) + ': ' + esc((c.why || []).join('; ')); })) + (go ? '' : '<p class="note">' + T('Tiada blok Go pada waktu siang hari itu.', 'No Go block in that day\'s daylight.') + '</p>');
      },
      prompt: function (v) {
        var d = +(v.day || 1), t0 = C.localMs(C.dateKey(Date.now() + d * DAY)) + 7 * HOUR;
        return promptFrame({ title: P('Crew change dengan ', 'Crew change by ') + (v.by === 'boat' ? P('bot', 'boat') : P('helikopter', 'helicopter')), role: ROLE_OFF(), ask: [P('Hari: ', 'Day: ') + dayLbl(t0, ui.lang), P('Had: ', 'Limits: ') + limitText(jobById(v.by === 'boat' ? 'boat' : 'heli'), ui.lang)],
          data: offData(ui.lang, ui.len === 'full', t0, t0 + 12 * HOUR), q: [P('Risiko crew change ditunda atau dibatalkan? Masa terbaik?', 'Risk of the crew change being delayed or cancelled? Best time?'), P('Pelan ganti jika tidak dapat terbang / belayar.', 'Backup plan if flying / sailing is not possible.')] });
      } },
    { id: 'medevac', sec: T('Orang & perjalanan', 'People & travel'), icon: '🚑', title: T('Medevac sekarang?', 'Medevac now?'), desc: T('Boleh heli atau bot pergi sekarang', 'Can a helicopter or boat go right now'),
      form: function () { return ''; },
      guide: function () {
        var x = needOff(); if (x) return x;
        var now = Date.now(), r = offAssess(now, now + 6 * HOUR), rows = [['heli', T('Helikopter', 'Helicopter')], ['boat', T('Bot (FCB)', 'Boat (FCB)')], ['supply', T('Vesel bekalan', 'Supply vessel')]];
        var best = rows.map(function (x) { var c = jobCells(r, x[0]); return { x: x, c: c ? c[0] : null, next: c }; });
        var any = best.some(function (b) { return b.c && b.c.st < 2; });
        return big(any ? 0 : 3, any ? '🟢 ' + T('Ada cara keluar sekarang', 'There is a way out now') : '🔴 ' + T('Semua cara di luar had sekarang — hubungi ERT / ERC', 'Every way is outside its limits now — call the ERT / ERC')) +
          '<table class="tbl"><tbody>' + best.map(function (b) { return '<tr><td><b>' + esc(b.x[1]) + '</b></td><td>' + (b.c ? goWord(b.c.st) : '-') + '</td><td>' + esc(b.c ? (b.c.why || []).join('; ') : '') + '</td></tr>'; }).join('') + '</tbody></table>' +
          '<p class="note">' + T('Medevac ialah keputusan ERT / OIM / juruterbang. Had kecemasan boleh berbeza daripada had kerja biasa. Siang sahaja untuk helikopter ikut had dalam app.', 'Medevac is the ERT / OIM / pilot\'s decision. Emergency limits may differ from normal work limits. Helicopter daylight-only follows the app\'s limits.') + '</p>';
      },
      prompt: function () {
        var now = Date.now();
        return promptFrame({ title: P('Medevac sekarang?', 'Medevac now?'), role: ROLE_OFF(), data: offData(ui.lang, false, now, now + 6 * HOUR),
          q: [P('Boleh helikopter atau bot buat medevac sekarang dan dalam 6 jam? Mana lebih selamat?', 'Can a helicopter or boat do a medevac now and in the next 6 hours? Which is safer?'), P('Apa had biasa medevac offshore (siang / malam, angin, ombak, penglihatan)?', 'What are the usual offshore medevac limits (day / night, wind, waves, visibility)?')] });
      } },
    { id: 'brief', sec: T('Taklimat', 'Briefing'), icon: '📋', title: T('Taklimat harian / toolbox', 'Daily briefing / toolbox'), desc: T('Taklimat pagi & serah syif', 'Morning brief & shift handover'),
      form: function (v) { return field(T('Syif', 'Shift'), seg('shift', [['day', T('Siang', 'Day')], ['night', T('Malam', 'Night')]], v.shift || 'day')); },
      guide: function (v) {
        var x = needOff(); if (x) return x;
        var txt = briefText(v);
        return '<textarea class="inp ask-prompt" id="askBrief" readonly style="min-height:240px">' + esc(txt) + '</textarea><div class="ask-btns"><button type="button" class="btn pri" data-copy="askBrief">📋 ' + T('Salin taklimat', 'Copy briefing') + '</button></div>';
      },
      prompt: function (v) {
        return promptFrame({ title: P('Taklimat cuaca syif ', 'Shift weather briefing — ') + (v.shift === 'night' ? P('malam', 'night') : P('siang', 'day')), role: ROLE_OFF(), data: offData(ui.lang, true), guide: briefText(v).split('\n'),
          q: [P('Tulis taklimat toolbox 1 minit (angin, laut, cuaca, kerja yang dihadkan, perkara perlu diperhati).', 'Write a 1-minute toolbox briefing (wind, sea, weather, limited jobs, things to watch).')] });
      } },
    { id: 'monsoon', sec: T('Taklimat', 'Briefing'), icon: '🌀', title: T('Monsun / cold surge / ribut', 'Monsoon / cold surge / storm'), desc: T('Apa perlu disediakan', 'What to prepare'),
      form: function () { return ''; },
      guide: function () {
        var x = needOff(); if (x) return x;
        var r = rep(), d = (r.days || []).slice(0, 10), pk = d.slice().sort(function (a, b) { return (b.gust.m || 0) - (a.gust.m || 0); })[0], hsPk = d.slice().sort(function (a, b) { return (b.hs.m || 0) - (a.hs.m || 0); })[0];
        var e = (MC.EXT.Jobs && MC.EXT.Jobs.get() || {}).early || [], m = metSea(), lvl = m.some(function (w) { return w.severity === 'critical'; }) ? 3 : m.length || e.length ? 2 : (pk && pk.gust.m >= 30) ? 1 : 0;
        return big(lvl, ['🟢 ' + T('Tiada tanda ribut / surge dalam 10 hari', 'No sign of a storm / surge in 10 days'), '🟡 ' + T('Angin kuat dijangka — pantau', 'Strong wind expected — keep watching'), '🟠 ' + T('Amaran aktif — bersedia', 'Warnings out — get ready'), '🔴 ' + T('Amaran MET tahap bahaya', 'MET danger-level warning')][lvl]) +
          ul([pk ? T('Tiupan paling kuat: {g} kt pada {d} (julat model {lo}–{hi})', 'Strongest gusts: {g} kt on {d} (models {lo}–{hi})').replace('{g}', f(pk.gust.m, 0)).replace('{d}', pk.date).replace('{lo}', f(pk.gust.lo, 0)).replace('{hi}', f(pk.gust.hi, 0)) : '-',
            hsPk ? T('Ombak paling tinggi: Hs {h} m pada {d} (Hmax ≈ {m} m)', 'Highest waves: Hs {h} m on {d} (Hmax ≈ {m} m)').replace('{h}', f(hsPk.hs.m, 1)).replace('{d}', hsPk.date).replace('{m}', f(hsPk.hmax, 1)) : '-']
            .concat(e.map(function (x) { return '⚠️ ' + esc(x.title); })).concat(m.map(function (w) { return '📡 ' + esc(metLine(w, I18N.lang())); }))) +
          '<h4>' + T('Persediaan', 'Preparation') + '</h4>' + ul([T('Semak & ikat barang lepas di dek (sea fastening).', 'Check & secure loose items on deck (sea fastening).'), T('Semak pelan demob & masa mula demob (Teruskan atau demob?).', 'Review the demob plan & start time (Continue or demob?).'), T('Pastikan bekalan air, makanan, bahan api cukup untuk tunda 3–5 hari.', 'Make sure water, food and fuel last a 3–5 day delay.'), T('Sahkan vesel standby & status helikopter.', 'Confirm the standby vessel & helicopter status.'), T('Taklimat semua krew tentang had & arahan kekal dalam LQ.', 'Brief all crew on the limits & the stay-in-LQ instruction.')]);
      },
      prompt: function () {
        return promptFrame({ title: P('Monsun / cold surge / ribut', 'Monsoon / cold surge / storm'), role: ROLE_OFF(), data: offData(ui.lang, true),
          q: [P('Ada monsoon surge, cold surge atau ribut tropika yang akan memberi kesan dalam 10 hari? Bila & sekuat mana?', 'Is a monsoon surge, cold surge or tropical storm coming in the next 10 days? When & how strong?'), P('Apa perlu disediakan di platform / vesel, dan bila?', 'What should be prepared on the platform / vessels, and when?')] });
      } },
    { id: 'dpr', sec: T('Taklimat', 'Briefing'), icon: '📝', title: T('Laporan cuaca harian (AMT / DPR)', 'Daily weather report (AMT / DPR)'), desc: T('Teks untuk laporan harian', 'Text for the daily report'),
      form: function () { return ''; },
      guide: function () {
        var x = needOff(); if (x) return x;
        return '<textarea class="inp ask-prompt" id="askDpr" readonly style="min-height:260px">' + esc(dprText()) + '</textarea><div class="ask-btns"><button type="button" class="btn pri" data-copy="askDpr">📋 ' + T('Salin laporan', 'Copy report') + '</button><button type="button" class="btn" id="askPdf">📄 PDF (AMT)</button></div>';
      },
      prompt: function () {
        return promptFrame({ title: P('Laporan cuaca harian (DPR)', 'Daily weather report (DPR)'), role: ROLE_OFF(), data: offData(ui.lang, true), guide: dprText().split('\n'),
          q: [P('Semak dan kemaskan teks laporan cuaca harian ini (format DPR / AMT), betulkan jika sumber rasmi berbeza.', 'Check and tidy this daily weather report text (DPR / AMT format); correct it where the official sources differ.')] });
      } }
  ];
  function briefText(v) {
    var s = state.settings, sh = A().parseShift(s.advShift), now = Date.now(), d0 = C.localMs(C.dateKey(now)), en = I18N.lang() === 'en';
    var t0 = v.shift === 'night' ? d0 + sh[1] * HOUR : d0 + sh[0] * HOUR; if (t0 + 12 * HOUR < now) t0 += DAY;
    var t1 = t0 + 12 * HOUR, r = offAssess(Math.max(now, t0), t1), lines = [];
    lines.push((en ? 'WEATHER BRIEF — ' : 'TAKLIMAT CUACA — ') + s.locationName + ' — ' + (v.shift === 'night' ? (en ? 'night shift ' : 'syif malam ') : (en ? 'day shift ' : 'syif siang ')) + when(t0) + '–' + hm(t1));
    lines.push('• ' + offSummary(Math.max(now, t0), t1, I18N.lang()));
    if (r) {
      var lq = jobCells(r, 'lq') || [], worst = Math.max.apply(null, lq.map(function (c) { return c.st || 0; }).concat([0]));
      lines.push('• LQ: ' + ['Normal', en ? 'Caution' : 'Berhati-hati', en ? 'Outside work limited' : 'Kerja luar dihadkan', en ? 'Stay in LQ' : 'Kekal dalam LQ'][worst]);
      var ng = r.items.filter(function (it, i) { return i && r.cells.some(function (row) { return row[i].st === 2 && !row[i].night; }); }).map(function (it) { return it.name; });
      if (ng.length) lines.push('• ' + (en ? 'No-Go at some time: ' : 'No-Go pada sebahagian masa: ') + ng.join(', '));
    }
    metSea().forEach(function (w) { lines.push('• MET: ' + metLine(w, I18N.lang())); });
    var e = (MC.EXT.Jobs && MC.EXT.Jobs.get() || {}).early || []; e.forEach(function (x) { lines.push('• ⚠ ' + x.title); });
    lines.push(en ? '• Stop work & tell the supervisor if lightning is within 10 nm or wind / sea gets worse than forecast.' : '• Henti kerja & maklum penyelia jika kilat dalam 10 batu nautika atau angin / laut lebih teruk dari ramalan.');
    return lines.join('\n');
  }
  function dprText() {
    var s = state.settings, now = Date.now(), en = I18N.lang() === 'en', r = rep(), d = (r && r.days) || [], lines = [];
    var p = C.myt(now);
    lines.push((en ? 'WEATHER — ' : 'CUACA — ') + s.locationName + ' ' + f(Math.abs(s.marineLat), 3) + 'N ' + f(Math.abs(s.marineLon), 3) + 'E — ' + pad(p.d) + '/' + pad(p.mo) + '/' + p.y + ' ' + hm(now) + ' LT');
    lines.push((en ? 'Next 24 h: ' : '24 j: ') + offSummary(now, now + 24 * HOUR, I18N.lang()));
    d.slice(1, 3).forEach(function (x) { lines.push(x.date + ': ' + (en ? 'wind max ' : 'angin maks ') + f(x.wind.m, 0) + ' kt (' + f(x.wind.lo, 0) + '–' + f(x.wind.hi, 0) + '), ' + (en ? 'gust ' : 'tiupan ') + f(x.gust.m, 0) + ' kt, Hs ' + f(x.hs.m, 1) + ' m (' + f(x.hs.lo, 1) + '–' + f(x.hs.hi, 1) + '), Hmax ' + f(x.hmax, 1) + ' m'); });
    var m = metSea(); lines.push('MET: ' + (m.length ? m.map(function (w) { return metLine(w, I18N.lang()); }).join('; ') : (en ? 'no sea warning' : 'tiada amaran laut')));
    var J = MC.EXT.Jobs && MC.EXT.Jobs.get();
    if (J) { var c0 = J.cells[0]; lines.push((en ? 'Ops now: ' : 'Operasi sekarang: ') + J.items.map(function (it, i) { return it.name + ' ' + (i === 0 ? ['Normal', 'Caution', 'Limited', 'LQ'][c0[i].st] || '-' : goWord(c0[i].st)); }).slice(0, 6).join(', ')); }
    lines.push(en ? 'Source: Sentinel OceanWATCH (Open-Meteo models: ECMWF, GFS, ICON, JMA, Météo-France, UKMO; waves ECMWF WAM, GFS Wave, MF Wave, DWD GWAM) + MET Malaysia.' : 'Sumber: Sentinel OceanWATCH (model Open-Meteo: ECMWF, GFS, ICON, JMA, Météo-France, UKMO; ombak ECMWF WAM, GFS Wave, MF Wave, DWD GWAM) + MET Malaysia.');
    return lines.join('\n');
  }

  /* ================================================================= the page */
  var LIST = LAND ? LAND_T : OFF_T;
  function cur() { var id = ui.t && LIST.some(function (x) { return x.id === ui.t; }) ? ui.t : (LAND ? 'prep' : 'demob'); return LIST.filter(function (x) { return x.id === id; })[0]; }
  function renderList() {
    var last = '', c = cur();
    $('askList').innerHTML = '<h3>✨ ' + T('Tanya AI', 'Ask AI') + ' <small class="muted" style="font-weight:500">' + T('pilih tujuan', 'pick a purpose') + '</small></h3>' + LIST.map(function (t) {
      var h = t.sec !== last ? '<div class="ask-sec">' + esc(t.sec) + '</div>' : ''; last = t.sec;
      return h + '<button type="button" class="ask-t" data-t="' + t.id + '" aria-current="' + (t.id === c.id) + '"><span class="e">' + t.icon + '</span><span><b>' + esc(t.title) + '</b><span>' + esc(t.desc) + '</span></span></button>';
    }).join('') + '<p class="note" style="margin:6px 2px 0">' + T('Setiap tujuan: panduan app sendiri (tanpa AI) + prompt untuk AI luar.', 'Every purpose: the app\'s own guide (no AI) + a prompt for an outside AI.') + '</p>';
  }
  var TARGETS = [['chatgpt', 'ChatGPT', 'https://chatgpt.com/'], ['claude', 'Claude', 'https://claude.ai/new'], ['gemini', 'Gemini', 'https://gemini.google.com/app'], ['copilot', 'Copilot', 'https://copilot.microsoft.com/']];
  function renderMain() {
    var t = cur(), v = ui.v[t.id] || (ui.v[t.id] = {}), g = '', p = '';
    try { g = t.guide(v); } catch (e) { g = '<div class="empty">' + esc(e.message) + '</div>'; console.error(e); }
    try { p = t.prompt(v); } catch (e) { p = String(e.message); console.error(e); }
    var form = t.form(v);
    $('askMain').innerHTML = '<section class="card"><div class="card-h"><h3>' + t.icon + ' ' + esc(t.title) + '</h3><small>' + esc(t.desc) + '</small></div>' + (form ? '<div class="card-b"><div class="ask-form">' + form + '</div></div>' : '') + '</section>' +
      '<section class="card"><div class="card-h"><h3>🧭 ' + T('Panduan app', 'App guide') + '</h3><small>' + T('dikira oleh app sendiri — boleh guna tanpa AI', 'worked out by the app itself — works with no AI') + '</small></div><div class="card-b ask-guide">' + g + '</div></section>' +
      '<section class="card"><div class="card-h"><h3>📋 ' + T('Prompt untuk AI', 'Prompt for AI') + '</h3><small>' + T('data terkini dimasukkan sendiri', 'latest data filled in') + '</small><div class="sp"></div>' +
      '<div class="seg" data-ui="len"><button type="button" data-v="short" aria-selected="' + (ui.len === 'short') + '">' + T('Ringkas', 'Short') + '</button><button type="button" data-v="full" aria-selected="' + (ui.len === 'full') + '">' + T('Penuh', 'Full') + '</button></div>' +
      '<div class="seg" data-ui="lang"><button type="button" data-v="ms" aria-selected="' + (ui.lang === 'ms') + '">BM</button><button type="button" data-v="en" aria-selected="' + (ui.lang === 'en') + '">EN</button></div></div>' +
      '<div class="card-b"><textarea class="inp ask-prompt" id="askPrompt" readonly spellcheck="false">' + esc(p) + '</textarea>' +
      '<div class="ask-btns"><button type="button" class="btn pri" data-copy="askPrompt">📋 ' + T('Salin prompt', 'Copy prompt') + '</button>' + TARGETS.map(function (x) { return '<button type="button" class="btn" data-ai="' + x[2] + '">' + x[1] + ' ↗</button>'; }).join('') +
      '<small class="muted">' + p.length.toLocaleString() + T(' aksara', ' characters') + '</small></div><p class="note">' + T('Salin, buka AI, tampal. Hidupkan carian web AI itu supaya ia semak sumber terkini.', 'Copy, open the AI, paste. Turn on the AI\'s web search so it checks the latest sources.') + '</p></div></section>';
    var wa = $('askWaCopy'); if (wa) wa.onclick = function () { copy('askWa'); };
    var pdf = $('askPdf'); if (pdf) pdf.onclick = function () { MC.Off.pdf(); };
  }
  function render() { renderList(); renderMain(); }
  function copy(id) {
    var t = $(id), done = function () { MC.toast(T('Disalin ✓', 'Copied ✓'), T('Buka AI / WhatsApp dan tampal.', 'Open the AI / WhatsApp and paste.')); };
    var fb = function () { t.removeAttribute('readonly'); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* */ } t.setAttribute('readonly', ''); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, fb); else fb();
  }
  $('view-ask').addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]');
    if (b && b.classList.contains('ask-t')) { ui.t = b.getAttribute('data-t'); keep(); render(); return; }
    var sg = e.target.closest('.seg[data-f] [data-v]');
    if (sg) { var t = cur(), v = ui.v[t.id] || (ui.v[t.id] = {}); v[sg.parentNode.getAttribute('data-f')] = sg.getAttribute('data-v'); if (sg.parentNode.getAttribute('data-f') === 'mode') delete v.job; keep(); renderMain(); return; }
    var su = e.target.closest('.seg[data-ui] [data-v]');
    if (su) { ui[su.parentNode.getAttribute('data-ui')] = su.getAttribute('data-v'); keep(); renderMain(); return; }
    var cp = e.target.closest('[data-copy]'); if (cp) { copy(cp.getAttribute('data-copy')); return; }
    var ai = e.target.closest('[data-ai]'); if (ai) { copy('askPrompt'); MC.openExternal(ai.getAttribute('data-ai')); return; }
    var go = e.target.closest('[data-anchor-to]');
    if (go) setTimeout(function () { var el = $(go.getAttribute('data-anchor-to')); if (el) el.scrollIntoView({ block: 'start' }); }, 120);
  });
  $('view-ask').addEventListener('change', function (e) {
    var el = e.target.closest('[data-f]');
    if (!el || el.classList.contains('seg')) return;
    var t = cur(), v = ui.v[t.id] || (ui.v[t.id] = {}), k = el.getAttribute('data-f');
    v[k] = el.multiple ? [].filter.call(el.options, function (o) { return o.selected; }).map(function (o) { return o.value; }) : el.value;
    keep(); renderMain();
  });
  MC.EXT.views = MC.EXT.views || {};
  MC.EXT.views.ask = function () { if (!LAND) MC.Off.load(false); render(); };
  /* new data while the page is open: draw again (not while typing) */
  var prevDash = MC.EXT.dash;
  MC.EXT.dash = function () { if (prevDash) prevDash(); if (state.view === 'ask' && !$('view-ask').contains(document.activeElement)) renderMain(); };
  MC.EXT.Ask = { templates: LIST, render: render, waText: waText, dprText: dprText, briefText: briefText };
})();
