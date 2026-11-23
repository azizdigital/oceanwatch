/* Dashboard Cuaca Aziz - risk scores and early warnings.
   Land:     Weather Risk (rain models + MET), River Risk (JPS level & trend, GloFAS), Coastal Risk (tide, sea level, waves at the coast)
             -> Flood Risk Score 0-100: River risk is the base; rain / tide alone at most 45, one level higher when the river is at Amaran and rain / tide >= 50.
             Early Flood Warning: a river rising fast, or on course to reach Waspada within a few hours, while still below it.
   Offshore: Wind Risk, Sea Risk (Hs, long-period swell), Weather Risk (thunder, visibility, MET) -> Operational Risk Score, same rule.
             Early warnings: wind rising fast (cold surge), wind / waves reaching the limits within the next hours, long swell.
             Weather windows: the earliest stretch of hours that is Go for a job.
   Pure functions (page, desktop app and tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./i18n'));
  else root.MCRisk = factory(root.MCI18n);
})(typeof self !== 'undefined' ? self : this, function (I18N) {
  'use strict';
  function L(s, v) {
    if (I18N) return I18N.L(s, v);
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] !== undefined ? v[k] : m; });
  }
  var HOUR = 3600000, DAY = 86400000, TZ = 8 * HOUR;
  function num(v) { return v === null || v === undefined || v === '' || !isFinite(v) ? null : +v; }
  function clean(a) { return a.filter(function (v) { return v !== null && v !== undefined && isFinite(v); }); }
  function maxOf(a) { a = clean(a); return a.length ? Math.max.apply(null, a) : null; }
  function r0(v) { return v === null || v === undefined ? '-' : String(Math.round(v)); }
  function r1(v) { return v === null || v === undefined ? '-' : (Math.round(v * 10) / 10).toFixed(1); }
  function r2(v) { return v === null || v === undefined ? '-' : (Math.round(v * 100) / 100).toFixed(2); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(t) { var d = new Date(t + TZ); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function dateKey(t) { return new Date(t + TZ).toISOString().slice(0, 10); }
  function when(t, now) { var d = new Date(t + TZ); return hhmm(t) + (dateKey(t) !== dateKey(now) ? ' ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1) : ''); }
  /* piecewise straight line: value -> 0..100 through the points [[x, y], ...] */
  function ramp(x, pts) {
    if (x === null || x === undefined) return 0;
    if (x <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
    return pts[pts.length - 1][1];
  }
  /* < 25 Sangat rendah · 25–49 Rendah · 50–70 Sederhana · 71–84 Tinggi · >= 85 Sangat tinggi */
  var LEVELS = ['Sangat rendah', 'Rendah', 'Sederhana', 'Tinggi', 'Sangat tinggi'];
  var BAND_LO = [0, 25, 50, 71, 85], BAND_HI = [24, 49, 70, 84, 100];
  function level(score) { return score >= 85 ? 4 : score >= 71 ? 3 : score >= 50 ? 2 : score >= 25 ? 1 : 0; }
  /* one level up: +15, kept inside the next band (already Sangat tinggi: unchanged) */
  function bump(s) { var lv = level(s); return lv >= 4 ? s : Math.max(BAND_LO[lv + 1], Math.min(BAND_HI[lv + 1], s + 15)); }
  /* the three parts -> one score: the worst, plus one level when a second part is also high */
  function combine(parts) {
    var v = parts.map(function (p) { return p.score || 0; }).sort(function (a, b) { return b - a; });
    var s = v[0] || 0, boost = v.length > 1 && v[1] >= 50;
    s = boost ? bump(s) : s;
    var lv = level(s);
    return { score: Math.round(s), level: lv, label: L(LEVELS[lv]), boost: boost };
  }
  function part(id, name, score, why) { var s = Math.max(0, Math.min(100, Math.round(score))); var lv = level(s); return { id: id, name: name, score: s, level: lv, label: L(LEVELS[lv]), why: why }; }

  /* ---------------------------------------------------------------- rivers */
  /* JPS graph data (5-minute history) for one station, the last `hours` hours */
  function seriesUrl(gid, now, hours) {
    var f = function (t) { var d = new Date(t + TZ); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
    now = now || Date.now();
    return 'https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/query/searchresultwaterleveldtlead.php?station=' + encodeURIComponent(gid) +
      '&from=' + encodeURIComponent(f(now - (hours || 12) * HOUR)) + '&to=' + encodeURIComponent(f(now)) + '&datafreq=15';
  }
  /* JPS rain gauge graph data (5-minute), the last `hours` hours */
  function rainUrl(gid, now, hours) {
    return seriesUrl(gid, now, hours).replace('searchresultwaterleveldtlead.php?station=', 'searchresultrainfalldthourlylead.php?extra=&station=').replace('&datafreq=15', '&datafreq=60');
  }
  /* least-squares slope (m per hour) of the points in the last `span` hours */
  function slope(pts, end, span) {
    var P = pts.filter(function (p) { return p.t >= end - span * HOUR && p.t <= end; });
    if (P.length < 3 || P[P.length - 1].t - P[0].t < span * HOUR * 0.5) return null;
    var n = P.length, mx = 0, my = 0;
    P.forEach(function (p) { mx += p.t; my += p.v; });
    mx /= n; my /= n;
    var a = 0, b = 0;
    P.forEach(function (p) { a += (p.t - mx) * (p.v - my); b += (p.t - mx) * (p.t - mx); });
    return b ? a / b * HOUR : null;
  }
  function valueAt(pts, t, tolMin) {
    var best = null, tol = (tolMin || 20) * 60000;
    pts.forEach(function (p) { if (Math.abs(p.t - t) <= tol && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p; });
    return best ? best.v : null;
  }
  /* how well a straight line fits the last `span` hours (R², 0..1) */
  function fit(pts, end, span) {
    var P = pts.filter(function (p) { return p.t >= end - span * HOUR && p.t <= end; });
    if (P.length < 3) return null;
    var n = P.length, mx = 0, my = 0;
    P.forEach(function (p) { mx += p.t; my += p.v; });
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    P.forEach(function (p) { sxy += (p.t - mx) * (p.v - my); sxx += (p.t - mx) * (p.t - mx); syy += (p.v - my) * (p.v - my); });
    if (!sxx) return null;
    if (syy < 1e-6) return 1;
    return Math.max(0, Math.min(1, sxy * sxy / (sxx * syy)));
  }
  /* how one river gauge is moving: rates over the last 1, 4 and 24 hours (m/h), fit, freshness, completeness.
     cfg: { stepMin: minutes between readings (5 for JPS), tidal: river mouth (the tide moves it every few hours) } */
  function trend(pts, st, now, cfg) {
    cfg = cfg || {};
    now = now || Date.now();
    pts = (pts || []).filter(function (p) { return p.v !== null && p.v > -100; });
    var last = pts[pts.length - 1];
    if (!last || now - last.t > 3 * HOUR) return null;
    var r1 = slope(pts, last.t, 1); if (r1 === null) r1 = slope(pts, last.t, 2);
    var r4 = slope(pts, last.t, 4), r24 = slope(pts, last.t, 24);
    var v4 = valueAt(pts, last.t - 4 * HOUR, 30), v24 = valueAt(pts, last.t - 24 * HOUR, 60);
    var step = cfg.stepMin || 5, n4 = pts.filter(function (p) { return p.t > last.t - 4 * HOUR; }).length;
    /* the tide moves gauges near the sea up and down every ~6 hours. Seen in the data itself: over the last 24 hours the
       hourly change turns from rising to falling and back again (3 times or more) with a swing of 0.25 m or more.
       Then only the 24-hour trend means anything (a flood is a rise that does not go back down). */
    var hv = [];
    for (var k = 0; k <= 24; k++) hv.push(valueAt(pts, last.t - k * HOUR, 25));
    var turns = 0, sign = 0, lo = null, hi = null;
    for (k = 0; k < 24; k++) {
      if (hv[k] === null || hv[k + 1] === null) continue;
      lo = lo === null ? Math.min(hv[k], hv[k + 1]) : Math.min(lo, hv[k], hv[k + 1]);
      hi = hi === null ? Math.max(hv[k], hv[k + 1]) : Math.max(hi, hv[k], hv[k + 1]);
      var d = hv[k] - hv[k + 1];
      if (Math.abs(d) < 0.03) continue;
      var sg = d > 0 ? 1 : -1;
      if (sign && sg !== sign) turns++;
      sign = sg;
    }
    var tideSeen = turns >= 3 && hi !== null && hi - lo >= 0.25;
    /* without 24 hours of readings the tide cannot be seen: a gauge with Waspada at 4 m or less is near sea level, take it as tidal */
    var lowLying = num(st && st.alert) !== null && st.alert <= 4 && last.t - pts[0].t < 20 * HOUR;
    var tidal = !!cfg.tidal || tideSeen || lowLying;
    var rs = tidal ? r24 : r1 !== null && r4 !== null ? (r1 + r4) / 2 : r1 !== null ? r1 : r4;
    return { at: last.t, level: last.v, rate: rs, rate1: tidal ? null : r1, rate4: tidal ? null : r4, rate24: r24, fit4: tidal ? null : fit(pts, last.t, 4),
      rise4h: v4 === null ? null : last.v - v4, rise24h: v24 === null ? null : last.v - v24, tidal: tidal, tideSeen: tideSeen,
      complete: Math.min(1, n4 / (4 * 60 / step)), ageMin: Math.round((now - last.t) / 60000), step: step,
      rising: rs !== null && rs > 0.01, falling: rs !== null && rs < -0.01, n: pts.length };
  }
  /* a gauge's readings from the app's own history lines ({ t, levels: { id: m } }) plus the reading now (26 hours) */
  function histPoints(hist, st, now) {
    var pts = [];
    (hist || []).forEach(function (h) { var v = h.levels && h.levels[st.id]; if (v !== null && v !== undefined && now - h.t <= 26 * HOUR) pts.push({ t: h.t, v: +v }); });
    if (num(st.level) !== null) pts.push({ t: st.updated ? Date.parse(st.updated) || now : now, v: +st.level });
    return pts.sort(function (a, b) { return a.t - b.t; });
  }

  /* river layout: one line per gauge, "Station < upstream 1, upstream 2 | village 1, village 2"; "~" in front = river mouth (tidal).
     Names are matched by part of the JPS station name. */
  var KEMAMAN_RIVERS = [
    /* from the rivers of OpenStreetMap: Sg. Mas flows into Sg. Cherul (Ban Ho), which meets Sg. Kemaman below Rantau Panjang */
    'Sg. Mas | Kg. Sg. Mas, Kg. Padang Kubu',
    'Ban Ho < Sg. Mas',
    'Air Putih | Kg. Teladas, Kg. Dadong',
    'Rantau Panjang < Air Putih | Kg. Batu 16, Kg. Seberang Tayor, Kg. Batu 14, Kg. Pasir Gajah',
    '~Paya Paman < Rantau Panjang, Ban Ho, Air Putih, Sg. Mas | Kg. Sungai Pinang, Kg. Pasir Minal, Kg. Bukit Mentok, Pengkalan Pandan',
    '~Yak Yah | Kg. Yak Yah, Kg. Padang Kemunting',
    '~Tumpat | Kg. Baru Kemasik',
    '~Geliga < Paya Paman, Yak Yah, Rantau Panjang, Ban Ho | Bandar Chukai, Kg. Geliga, Kg. Bukit Mentok'
  ].join('\n');
  function parseRivers(text) {
    var out = [];
    String(text || '').split(/\n+/).forEach(function (line) {
      line = line.trim();
      if (!line || line[0] === '#') return;
      var tidal = line[0] === '~'; if (tidal) line = line.slice(1).trim();
      var bar = line.split('|'), left = bar[0].split('<');
      var name = left[0].trim();
      if (!name) return;
      var list = function (x) { return String(x || '').split(',').map(function (y) { return y.trim(); }).filter(Boolean); };
      out.push({ match: name.toLowerCase(), name: name, tidal: tidal, up: list(left[1]).map(function (y) { return y.toLowerCase(); }), villages: list(bar[1]) });
    });
    return out;
  }
  function riverFor(rivers, st) {
    var n = String((st && st.name) || '').toLowerCase();
    return (rivers || []).filter(function (r) { return n.indexOf(r.match) >= 0; })[0] || null;
  }
  function isTidal(rivers, st) { var r = riverFor(rivers, st); return r ? r.tidal : /muara/i.test((st && st.name) || ''); }

  /* rain per model (advisor.collectLand answers, one place) in the next 4 and 24 hours */
  function rainAhead(raw, now) {
    var r4 = [], r24 = [], by = [];
    Object.keys((raw && raw.models) || {}).forEach(function (id) {
      var m = raw.models[id], d = m && m.ok && m.data && m.data[0];
      if (!d) return;
      var a = 0, b = 0, n = 0;
      for (var i = 0; i < d.p.length; i++) {
        var t = d.t0 + i * HOUR;
        if (t < now - HOUR || t >= now + 24 * HOUR || d.p[i] === null) continue;
        n++; b += d.p[i]; if (t < now + 4 * HOUR) a += d.p[i];
      }
      if (n) { r4.push(a); r24.push(b); by.push({ id: id, h4: Math.round(a * 10) / 10, h24: Math.round(b * 10) / 10 }); }
    });
    return { rain4: r4, rain24: r24, byModel: by, at: raw && raw.at };
  }
  /* rain so far today at the gauge in the same place ("Sg. X di Kg. Y" <-> "Kg. Y") */
  function obsRain(rains, st) {
    var place = String((st && st.name) || '').split(/\s+di\s+/i).pop().toLowerCase();
    var hit = (rains || []).filter(function (r) { var n = String(r.name || '').toLowerCase(); return n && (n === place || (place.length > 4 && (n.indexOf(place) >= 0 || place.indexOf(n) >= 0))); })[0];
    if (!hit) return null;
    var v = hit.today !== undefined ? hit.today : hit.rainToday;
    return num(v);
  }
  var EW_W = { trend: 40, rain: 25, up: 20, data: 15 };
  var NEXT = [['alert', 'Waspada'], ['warning', 'Amaran'], ['danger', 'Bahaya']];
  function levelIndex(st, v) {
    return num(st.danger) !== null && v >= st.danger ? 3 : num(st.warning) !== null && v >= st.warning ? 2 : num(st.alert) !== null && v >= st.alert ? 1 : 0;
  }
  /* where the river will be in 4 and 24 hours, whether it reaches the next level, and how sure (0..100).
     ctx: { rain4: [mm per model], rain24: [...], obsToday (mm at the gauge), upstream: [trends], glofas (ratio) } */
  function project(tr, st, ctx) {
    ctx = ctx || {};
    if (!tr) return null;
    var lv = levelIndex(st, tr.level);
    if (lv >= 3) return { tier: 0, lv: lv };
    var tgt = NEXT[lv], target = num(st[tgt[0]]);
    if (target === null) return { tier: 0, lv: lv };
    var r = tr.rate === null ? 0 : tr.rate;
    var r24 = tr.rate24 === null ? r : tr.rate24;
    var med = function (a) { a = clean(a || []).sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
    var rain24 = med(ctx.rain24), k = rain24 === null ? 0.6 : rain24 >= 30 ? 1 : rain24 >= 5 ? 0.75 : 0.5;
    /* 4 hours: the recent rate; 24 hours: the 24-hour trend (a short burst does not last a day). No 24-hour record yet: half the recent rate */
    var p4 = tr.level + Math.max(0, tr.tidal ? r24 : r) * 4;
    var long = tr.tidal ? r24 : tr.rate24 === null ? r / 2 : Math.max(tr.rate24, r / 2);
    var p24 = tr.level + Math.max(0, long) * 24 * k;
    var gap = target - tr.level, rr = tr.tidal ? r24 : r;
    var eta = rr > 0.005 ? gap / rr : null;
    /* no rain, no rise: a river only keeps going up when it rains. Dry = the models' middle value under 5 mm in 24 hours
       and under 10 mm so far today at the gauge; within 4 hours it also needs rain now or soon (1 mm in 4 hours, or 10 mm today) */
    var rain4m = med(ctx.rain4), obsT = num(ctx.obsToday);
    var dry = (rain24 === null || rain24 < 5) && (obsT === null || obsT < 10);
    var wet4 = (rain4m !== null && rain4m >= 1) || (obsT !== null && obsT >= 10);
    var tier = dry ? 0 : !tr.tidal && wet4 && p4 >= target ? 4 : p24 >= target ? 24 : 0;
    /* confidence parts, each 0..1 */
    var h = tier || 24, trendS = 0;
    if (rr > 0.005) {
      var agree = tr.rate1 !== null && tr.rate4 !== null ? 1 - Math.min(1, Math.abs(tr.rate1 - tr.rate4) / Math.max(Math.abs(tr.rate4), 0.05)) : 0.6;
      var f4 = tr.fit4 === null ? 0.5 : tr.fit4;
      trendS = tr.tidal ? (tr.rate24 !== null && tr.rate24 > 0 ? 0.7 : 0) : 0.5 * f4 + 0.5 * agree;
      if (h === 24) trendS *= tr.rate24 === null ? 0.7 : tr.rate24 > 0 ? 1 : 0.4;
    }
    var models = clean((h === 4 ? ctx.rain4 : ctx.rain24) || []), thr = h === 4 ? 3 : 15;
    var rainF = models.length ? models.filter(function (v) { return v >= thr; }).length / models.length : 0;
    var obs = num(ctx.obsToday), rainO = obs === null ? 0 : obs >= 30 ? 1 : obs >= 10 ? 0.6 : obs >= 3 ? 0.3 : 0;
    var rainS = Math.max(rainF, rainO);
    var ups = (ctx.upstream || []).filter(Boolean), u = ups.length ? ups.filter(function (x) { return x.rate !== null && x.rate > 0.01; }).length / ups.length : null;
    var g = ctx.glofas === null || ctx.glofas === undefined ? null : ctx.glofas >= 1.5 ? 1 : ctx.glofas >= 1.2 ? 0.6 : ctx.glofas >= 1 ? 0.3 : 0;
    var upS = u !== null && g !== null ? 0.6 * u + 0.4 * g : u !== null ? u : g !== null ? g : 0;
    var fresh = tr.ageMin <= 30 ? 1 : tr.ageMin <= 60 ? 0.6 : 0.2, dataS = 0.5 * fresh + 0.5 * tr.complete;
    var parts = { trend: Math.round(EW_W.trend * trendS), rain: Math.round(EW_W.rain * rainS), up: Math.round(EW_W.up * upS), data: Math.round(EW_W.data * dataS) };
    var conf = parts.trend + parts.rain + parts.up + parts.data;
    if (dry) { p4 = Math.min(p4, tr.level); p24 = Math.min(p24, tr.level); }
    return { tier: tier, dry: dry, lv: lv, target: tgt[0], targetName: tgt[1], targetM: target, p4: p4, p24: p24, eta: dry ? null : eta, gap: gap, conf: conf, parts: parts,
      rain24: rain24, upRising: ups.length ? ups.filter(function (x) { return x.rate !== null && x.rate > 0.01; }).length : null, upN: ups.length, glofas: ctx.glofas };
  }
  /* the early flood warnings: projected to reach the next level within 4 or 24 hours. Only those at >= minConf ring;
     the others are shown quietly. ctx: { rivers (parseRivers), rain4, rain24, glofas, obs(st) -> mm today, minConf, prevLoud: { key: true } } */
  function earlyFlood(stations, trends, now, ctx) {
    ctx = ctx || {};
    var out = [], minConf = ctx.minConf || 85, rivers = ctx.rivers || [];
    var byName = {}; (stations || []).forEach(function (st) { byName[st.name] = st; });
    (stations || []).forEach(function (st) {
      var tr = trends && trends[st.name];
      if (!tr) return;
      var rv = riverFor(rivers, st);
      var up = rv ? (stations || []).filter(function (o) { return o !== st && rv.up.some(function (m) { return String(o.name).toLowerCase().indexOf(m) >= 0; }); }).map(function (o) { return trends[o.name]; }) : [];
      var pr = project(tr, st, { rain4: ctx.rain4, rain24: ctx.rain24, obsToday: ctx.obs ? ctx.obs(st) : null, upstream: up, glofas: ctx.glofas });
      tr.proj = pr;
      if (!pr || !pr.tier) return;
      var base = 'ew:' + (st.id || st.name) + ':' + pr.target + ':' + pr.tier;
      var loud = pr.conf >= minConf || (!!(ctx.prevLoud && ctx.prevLoud[base]) && pr.conf >= minConf - 5);
      var vil = rv && rv.villages.length ? L(' Kampung berisiko: {k}.', { k: rv.villages.join(', ') }) : '';
      /* words and urgency follow what JPS levels mean: Waspada = well above normal (not a flood), Amaran = close to flooding,
         get ready to move; Bahaya = flooding, evacuation */
      var MEAN = { alert: L('paras naik ketara atas normal, belum banjir'), warning: L('hampir paras banjir, bersedia untuk berpindah'), danger: L('banjir, pemindahan dimulakan') };
      var lvl = pr.target === 'danger' ? (pr.tier === 4 ? 'critical' : 'warning') : pr.target === 'warning' ? (pr.tier === 4 ? 'warning' : 'info') : 'info';
      var title = pr.target === 'alert' ? L('Makluman: paras sungai naik ({h} jam): {n}', { h: pr.tier, n: st.name })
        : pr.target === 'warning' ? L('Amaran awal: hampir paras banjir ({h} jam): {n}', { h: pr.tier, n: st.name })
          : L('Amaran awal banjir ({h} jam): {n}', { h: pr.tier, n: st.name });
      out.push({ key: base + (loud ? ':n' : ':q'), base: base, cat: 'water', quiet: !loud,
        level: lvl, station: st.name, tier: pr.tier, conf: pr.conf, parts: pr.parts, proj: pr,
        villages: rv ? rv.villages : [],
        title: title,
        body: L('Paras {v} m, dijangka capai {lv} ({t} m){e}: {m}. Anggaran 4 jam {p4} m, 24 jam {p24} m. Keyakinan {c}%{q}.', {
          v: r2(tr.level), lv: L(pr.targetName), t: r2(pr.targetM), e: pr.eta !== null ? L(' dalam ~{h} jam', { h: pr.eta < 1 ? '<1' : r1(pr.eta) }) : '', m: MEAN[pr.target],
          p4: r2(pr.p4), p24: r2(pr.p24), c: pr.conf, q: loud ? '' : L(' (bawah {k}%: tiada notifikasi)', { k: minConf }) }) + (pr.target === 'alert' ? '' : vil) });
    });
    return out.sort(function (a, b) { return a.tier - b.tier || b.conf - a.conf; });
  }

  /* ------------------------------------------------------------- land parts */
  /* rain in a block of `hours` hours -> 0..100 (30 / 60 / 100 / 150 mm a day; shorter blocks need less) */
  function rainScore(mm, hours) {
    var T = hours >= 18 ? [30, 60, 100, 150] : hours > 6 ? [25, 50, 80, 120] : [15, 30, 50, 70];
    return ramp(mm, [[0, 0], [T[0], 25], [T[1], 50], [T[2], 75], [T[3], 100]]);
  }
  var SEV = { info: 30, warning: 55, critical: 80 };
  /* o: { rain (mm in block), hours, wet (mm already fallen + forecast before), met: [warnings], name } */
  function weatherPart(o) {
    var why = [], s = rainScore(o.rain, o.hours);
    if (o.rain !== null && o.rain >= 1) why.push(L('Hujan ramalan {m} mm dalam {h} jam{r}.', { m: r0(o.rain), h: Math.round(o.hours), r: o.range ? ' (' + L('model') + ' ' + o.range + ')' : '' }));
    var wet = o.wet || 0, ws = wet >= 300 ? 15 : wet >= 200 ? 10 : wet >= 100 ? 5 : 0;
    if (ws && s > 0) { s += ws; why.push(L('Tanah sudah basah: ~{v} mm (3 hari lalu + ramalan sebelum ini).', { v: r0(wet) })); }
    (o.met || []).forEach(function (w) { var f = SEV[w.severity] || 30, t = L('Amaran MET: {t}.', { t: w.title }); if (f > s) { s = f; why.unshift(t); } else why.push(t); });
    if (!why.length) why.push(L('Tiada hujan lebat dijangka.'));
    return part('weather', L('Risiko cuaca'), s, why);
  }
  /* o: { stations: [{ name, level, alert, warning, danger, status }], trends: { id: trend }, lead (days ahead), glofas (ratio) } */
  /* River risk = the risk of a FLOOD from the river. JPS levels: Waspada = well above normal, Amaran = close to flooding
     (get ready), Bahaya = flooding. So the score only gets high when a river is near or at Bahaya, or on course for it:
       Normal 0 · Waspada 5 · Amaran 45 · within 0.25 m of Bahaya 70 · Bahaya 90 (+10 rising, -10 falling, at Amaran or more)
       expected to reach Bahaya: within 4 h up to 75, within 24 h up to 55 (times the confidence); to Amaran: 20; to Waspada: 5 */
  function riverPart(o) {
    var why = [], s = 0, near = o.leadH === undefined ? 1 : o.leadH < 48 ? 1 : o.leadH < 96 ? 0.6 : 0.3;
    var R = { normal: 0, alert: 1, warning: 2, danger: 3 };
    var MEANS = ['', L('naik ketara, belum banjir'), L('kemungkinan kecil akan banjir'), L('banjir')];
    (o.stations || []).forEach(function (st) {
      var v = num(st.level);
      if (v === null || st.stale) return;
      var lv = st.status && R[st.status] !== undefined ? R[st.status] : num(st.danger) !== null && v >= st.danger ? 3 : num(st.warning) !== null && v >= st.warning ? 2 : num(st.alert) !== null && v >= st.alert ? 1 : 0;
      var x = [0, 5, 45, 90][lv], tr = o.trends && o.trends[st.name], pr = tr && tr.proj;
      var nearDanger = lv === 2 && num(st.danger) !== null && st.danger - v <= 0.25;
      if (nearDanger) x = 70;
      if (pr && pr.tier) {
        var c = 0.6 + 0.4 * pr.conf / 100;
        x = Math.max(x, pr.target === 'danger' ? (pr.tier === 4 ? 75 : 55) * c : pr.target === 'warning' ? 20 : 5);
      }
      if (tr && tr.rising && lv >= 2) x += 10;
      if (tr && tr.falling && lv >= 1) x -= 10;
      x = Math.max(0, x) * near;
      if (x > s) s = x;
      var mv = tr && tr.rising ? L(', naik {r} m/jam', { r: r2(tr.rate) }) : tr && tr.falling ? L(', turun') : '';
      if (lv >= 1) why.push(L('{n}: {l} ({v} m) - {m}{t}.', { n: st.name, l: L(['Normal', 'Waspada', 'Amaran', 'Bahaya'][lv]), v: r2(v), m: nearDanger ? L('hampir Bahaya ({d} m)', { d: r2(num(st.danger)) }) : MEANS[lv], t: mv }));
      else if (pr && pr.tier && pr.target !== 'alert') why.push(L('{n}: {v} m, dijangka capai {l} dalam {h} jam (keyakinan {c}%).', { n: st.name, v: r2(v), l: L(pr.targetName), h: pr.tier, c: pr.conf }));
    });
    /* order: the most serious first */
    why.sort(function (a, b) { var k = function (t) { return /Bahaya|Danger/.test(t) ? 0 : /Amaran|Warning/.test(t) ? 1 : 2; }; return k(a) - k(b); });
    if (o.glofas !== null && o.glofas !== undefined) {
      var g = ramp(o.glofas, [[1, 0], [1.5, 15], [2, 30], [3, 50], [5, 75]]);
      if (g >= 30) why.push(L('GloFAS: aliran sungai ~{x}× biasa.', { x: r1(o.glofas) }));
      if (g > s) s = g;
    }
    if (!(o.stations || []).length) why.push(L('Tiada stesen paras air JPS untuk kawasan ini.'));
    else if (!why.length) why.push(L('Tiada sungai menghampiri paras Bahaya.'));
    return part('river', L('Risiko sungai'), s, why);
  }
  /* o: { coastal, tide (high tide in block {t, sea}), top (highest tide in the table), sea: max sea level (m) in block, seaTop,
         wave: max Hs at the coast, waveDir (from), wind: kt onshore } */
  function coastalPart(o) {
    var why = [], s = 0;
    if (!o.coastal) return part('coastal', L('Risiko pantai'), 0, [L('Bukan kawasan pantai.')]);
    if (o.tide && o.top !== null && o.top !== undefined) {
      var d = o.top - o.tide.sea, x = d <= 0.15 ? 45 : d <= 0.3 ? 25 : 0;
      if (x) why.push(L('Air pasang besar {v} m pukul {t}.', { v: r1(o.tide.sea), t: hhmm(o.tide.t) }));
      s = Math.max(s, x);
    } else if (o.sea !== null && o.sea !== undefined && o.seaTop !== null && o.seaTop !== undefined) {
      var d2 = o.seaTop - o.sea, x2 = d2 <= 0.1 ? 40 : d2 <= 0.25 ? 20 : 0;
      if (x2) why.push(L('Paras laut model tinggi ({v} m).', { v: r2(o.sea) }));
      s = Math.max(s, x2);
    }
    var onshore = o.waveDir === null || o.waveDir === undefined || o.waveDir >= 330 || o.waveDir <= 135;
    if (o.wave !== null && o.wave !== undefined && onshore) {
      var w = ramp(o.wave, [[1.5, 0], [2.5, 30], [3.5, 50], [5, 70]]);
      if (w >= 15) why.push(L('Ombak {h} m dari laut ke pantai (air muara lambat surut).', { h: r1(o.wave) }));
      s = s ? s + w * 0.6 : w;
    }
    if (!why.length) why.push(L('Air pasang & ombak biasa.'));
    return part('coastal', L('Risiko pantai'), s, why);
  }
  /* Flood Risk Score: the river is the base. Heavy rain or a high tide alone is at most 45 (Rendah);
     they raise the score one level only when the river is already at Amaran (river >= 45) and they are >= 50 */
  function landScore(w, r, c) {
    var other = Math.max(w.score, c.score), boost = r.score >= 45 && other >= 50;
    var s = Math.round(boost ? bump(r.score) : Math.max(r.score, Math.min(other, 45)));
    var lv = level(s);
    return { score: s, level: lv, label: L(LEVELS[lv]), boost: boost, parts: [w, r, c] };
  }

  /* -------------------------------------------------------- offshore parts */
  /* v: { w, g (kt), h, sw (m), tp (s), thunder (share), lightning (bool), vis (km), rain (mm), met: [warnings] } */
  function windPart(v) {
    var s = Math.max(ramp(v.w, [[10, 0], [15, 25], [22, 50], [28, 75], [34, 100]]), ramp(v.g, [[15, 0], [20, 25], [30, 50], [40, 75], [50, 100]])), why = [];
    if (v.w !== null && v.w !== undefined) why.push(L('Angin {w} kt, tiupan {g} kt.', { w: r0(v.w), g: r0(v.g) }));
    return part('wind', L('Risiko angin'), s, why);
  }
  function seaPart(v) {
    var s = ramp(v.h, [[0.5, 0], [1.25, 25], [2, 50], [3, 75], [4, 100]]), why = [];
    if (v.h !== null && v.h !== undefined) why.push(L('Hs {h} m (ombak maks ~{m} m).', { h: r1(v.h), m: r1(v.h * 1.7) }));
    if (v.sw !== null && v.sw !== undefined && v.sw >= 0.8 && v.tp !== null && v.tp !== undefined && v.tp >= 9) {
      var add = v.tp >= 12 ? 25 : 15;
      s += add;
      why.push(L('Alun panjang {h} m, tempoh {p} s: bot & beban crane lebih bergoyang.', { h: r1(v.sw), p: r0(v.tp) }));
    }
    return part('sea', L('Risiko laut'), s, why);
  }
  function weatherOffPart(v) {
    var s = 0, why = [];
    if (v.thunder !== null && v.thunder !== undefined) {
      var t = v.thunder >= 0.6 ? 75 : v.thunder >= 0.34 ? 50 : v.thunder > 0 ? 25 : 0;
      if (t) why.push(L('Ribut petir dalam {p}% model.', { p: Math.round(v.thunder * 100) }));
      s = Math.max(s, t);
    }
    if (v.lightning && s < 40) { s = 40; why.push(L('Udara tidak stabil (CAPE tinggi) dengan hujan: kilat mungkin.')); }
    if (v.vis !== null && v.vis !== undefined && v.vis < 5) { var x = v.vis < 1.85 ? 75 : v.vis < 3 ? 50 : 25; s = Math.max(s, x); why.push(L('Penglihatan {v} km.', { v: r1(v.vis) })); }
    if (v.rain !== null && v.rain !== undefined && v.rain >= 10) { s = Math.max(s, v.rain >= 30 ? 50 : 30); why.push(L('Hujan lebat {m} mm.', { m: r0(v.rain) })); }
    (v.met || []).forEach(function (w) { var f = SEV[w.severity] || 30, t = L('Amaran MET: {t}.', { t: w.title }); if (f > s) { s = f; why.unshift(t); } else why.push(t); });
    if (!why.length) why.push(L('Tiada ribut petir atau penglihatan rendah.'));
    return part('weather', L('Risiko cuaca'), s, why);
  }
  function offScore(v) { var w = windPart(v), s = seaPart(v), x = weatherOffPart(v), c = combine([w, s, x]); c.parts = [w, s, x]; return c; }
  /* worst values of the hours of an offshore report (MCOffshore.build) between t0 and t1 */
  function offValues(rep, t0, t1, which) {
    which = which || 'm';
    var H = rep ? rep.hours.filter(function (h) { return h.t >= t0 && h.t < t1; }) : [];
    var g = function (k) { return maxOf(H.map(function (h) { return h[k] ? h[k][which] : null; })); };
    var sum = 0, any = false;
    H.forEach(function (h) { if (h.p !== null) { sum += h.p; any = true; } });
    var swH = H.filter(function (h) { return h.wh !== null; });
    var top = swH.reduce(function (a, b) { return !a || b.wh > a.wh ? b : a; }, null);
    return { n: H.length, w: g('w10'), g: g('g'), h: g('hs'), sw: top ? top.wh : null, tp: maxOf(H.filter(function (h) { return h.wh !== null && h.wh >= 0.8; }).map(function (h) { return h.wt; })),
      thunder: maxOf(H.map(function (h) { return h.thunder; })), lightning: H.some(function (h) { return h.cape !== null && h.cape >= 1000 && (h.p || 0) >= 1; }), rain: any ? sum : null };
  }

  /* offshore early warnings for the next `ahead` hours. cfg: { windRise (kt in 6 h), swellTp (s), windKt, waveM, ahead } */
  function earlyOffshore(rep, now, cfg) {
    cfg = cfg || {};
    var out = [], ahead = (cfg.ahead || 24) * HOUR, rise = cfg.windRise || 8, tpMin = cfg.swellTp || 9;
    if (!rep || !rep.hours) return out;
    var H = rep.hours.filter(function (h) { return h.t >= now - HOUR && h.t <= now + ahead + 6 * HOUR && h.w10.m !== null; });
    if (!H.length) return out;
    var day = dateKey(now);
    /* wind rising fast: the biggest rise over 6 hours that starts within the window */
    var best = null;
    H.forEach(function (a) {
      if (a.t > now + ahead) return;
      H.forEach(function (b) {
        if (b.t - a.t < 5 * HOUR || b.t - a.t > 6 * HOUR) return;
        var d = b.w10.m - a.w10.m;
        if (!best || d > best.d) best = { a: a, b: b, d: d };
      });
    });
    if (best && best.d >= rise) {
      var mon = new Date(now + TZ).getUTCMonth() + 1, ne = best.b.dir !== null && (best.b.dir >= 340 || best.b.dir <= 100);
      out.push({ key: 'oew:wind:' + day, cat: 'wind', level: best.b.w10.m >= (cfg.windKt || 15) + 5 ? 'warning' : 'info',
        title: L('Amaran awal: angin naik cepat'),
        body: L('Angin dijangka naik {d} kt dalam 6 jam ({a}–{b}), hingga ~{v} kt{s}.', { d: r0(best.d), a: when(best.a.t, now), b: when(best.b.t, now), v: r0(best.b.w10.m),
          s: ne && [11, 12, 1, 2, 3].indexOf(mon) >= 0 ? L(' — tanda cold surge Monsun Timur Laut') : '' }) });
    }
    /* reaching the limits (from below) */
    var first = function (key, lim) {
      var nowV = H[0][key].m;
      if (nowV !== null && nowV >= lim) return null;
      for (var i = 0; i < H.length; i++) if (H[i].t <= now + ahead && H[i][key].m !== null && H[i][key].m >= lim) return H[i];
      return null;
    };
    var fw = first('w10', cfg.windKt || 15), fh = first('hs', cfg.waveM || 1.5);
    if (fw) out.push({ key: 'oew:windlim:' + day, cat: 'wind', level: 'info', title: L('Amaran awal: angin capai had {k} kt', { k: cfg.windKt || 15 }),
      body: L('Dijangka sekitar {t} (dalam ~{h} jam).', { t: when(fw.t, now), h: r0((fw.t - now) / HOUR) }) });
    if (fh) out.push({ key: 'oew:wavelim:' + day, cat: 'sea', level: 'info', title: L('Amaran awal: ombak capai had {m} m', { m: cfg.waveM || 1.5 }),
      body: L('Hs dijangka {v} m sekitar {t} (dalam ~{h} jam).', { v: r1(fh.hs.m), t: when(fh.t, now), h: r0((fh.t - now) / HOUR) }) });
    var sw = H.filter(function (h) { return h.t <= now + ahead && h.wh !== null && h.wh >= 1 && h.wt !== null && h.wt >= tpMin; })[0];
    if (sw) out.push({ key: 'oew:swell:' + day, cat: 'sea', level: 'info', title: L('Alun panjang dijangka'),
      body: L('Alun {h} m, tempoh {p} s sekitar {t}: berhati-hati untuk bot & crane.', { h: r1(sw.wh), p: r0(sw.wt), t: when(sw.t, now) }) });
    return out;
  }

  /* weather windows: stretches of at least `minH` hours where `judge(values of the hour)` says Go.
     hours: rep.hours; returns [{ t0, t1, hours }] in time order */
  function windows(rep, from, to, ok, minH) {
    var H = rep ? rep.hours.filter(function (h) { return h.t >= from && h.t < to; }) : [], out = [], start = null, last = null;
    function close() { if (start !== null && last - start + HOUR >= (minH || 4) * HOUR) out.push({ t0: start, t1: last + HOUR, hours: Math.round((last + HOUR - start) / HOUR) }); start = null; }
    H.forEach(function (h) {
      if (last !== null && h.t - last > HOUR * 1.5) close();
      if (ok(h)) { if (start === null) start = h.t; last = h.t; } else { close(); last = h.t; }
    });
    close();
    return out;
  }

  return { LEVELS: LEVELS, level: level, bump: bump, combine: combine, ramp: ramp, seriesUrl: seriesUrl, rainUrl: rainUrl, histPoints: histPoints, slope: slope, fit: fit, trend: trend, project: project, earlyFlood: earlyFlood,
    KEMAMAN_RIVERS: KEMAMAN_RIVERS, parseRivers: parseRivers, rainAhead: rainAhead, obsRain: obsRain, riverFor: riverFor, isTidal: isTidal, EW_W: EW_W,
    rainScore: rainScore, weatherPart: weatherPart, riverPart: riverPart, coastalPart: coastalPart, landScore: landScore,
    windPart: windPart, seaPart: seaPart, weatherOffPart: weatherOffPart, offScore: offScore, offValues: offValues, earlyOffshore: earlyOffshore, windows: windows, when: when };
});
