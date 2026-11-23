/* Monsoon EYE & Sentinel OceanWATCH - the parts each app adds on top of the shared page (app.js):
     - the labelled menu, the app's name and the "Laman" button
     - the answer box on top of the dashboard (hero): land = flood risk in words, offshore = Go / Caution / No-Go of the main job
     - land: 4 tiles and the river bars (upstream -> downstream); offshore: "Jobs today" (every job x 3-hour blocks) and the Models page
     - Settings: import from the original Dashboard Cuaca
   Ask AI (ask.js), My jobs (myjobs.js) and the district form (district.js) hook in the same way. */
(function () {
  'use strict';
  var MC = window.MC, C = window.MCCore, ED = window.EDITION || { kind: 'land', short: 'me', name: 'Monsoon EYE' }, I18N = window.MCI18n, L = I18N.L;
  if (!MC || !C) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = MC.esc, f = MC.f, state = MC.state, LAND = ED.kind !== 'offshore';
  var R = function () { return window.MCRisk; }, A = function () { return window.MCAdvisor; };
  var HOUR = 3600000, DAY = 86400000;
  function hm(t) { var p = C.myt(t); return (p.h < 10 ? '0' : '') + p.h + ':' + (p.mi < 10 ? '0' : '') + p.mi; }
  function when(t, now) {
    now = now || Date.now();
    var d = C.dateKey(t), today = C.dateKey(now), tom = C.dateKey(now + DAY);
    return (d === today ? '' : d === tom ? L('esok') + ' ' : C.fmtDate(t).split(' ').slice(0, 2).join(' ') + ' ') + hm(t);
  }

  /* ---------------------------------------------------------------- the app's frame */
  document.title = ED.name;
  MC.TITLES.dashboard = [LAND ? '🌧️' : '🌊', ED.name, ''];
  MC.TITLES.ask = ['✨', L('Tanya AI'), L('Panduan app sendiri & prompt untuk AI')];
  if (!LAND) {
    MC.TITLES.advisor = ['🗂️', L('Kerja'), L('Go / Caution / No-Go setiap kerja & weather window')];
    MC.TITLES.models = ['📊', L('Model'), L('Perbandingan model offshore & PDF A4 gaya AMT')];
  } else {
    MC.TITLES.advisor = ['🗺️', L('Risiko ikut kawasan'), L('Setiap stesen / daerah / tempat saya, ikut blok masa')];
  }
  /* rail buttons that open one of the app's own pages (Sungai / Hujan / Aliran) */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-site-go]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    MC.Sites.show(b.getAttribute('data-site-go'), true);
    markRail(b.getAttribute('data-site-go'));
  }, true);
  function markRail(site) {
    [].forEach.call(document.querySelectorAll('.rbtn[data-site-go]'), function (x) { x.setAttribute('aria-current', String(x.getAttribute('data-site-go') === site)); });
    if (site) [].forEach.call(document.querySelectorAll('.rbtn[data-view="site"]'), function (x) { x.setAttribute('aria-current', 'false'); });
  }
  var prevShow = MC.EXT.onShow;
  MC.EXT.onShow = function (view) {
    if (prevShow) prevShow(view);
    var cur = view === 'site' && MC.Sites.current;
    var own = cur && document.querySelector('.rbtn[data-site-go="' + cur + '"]');
    markRail(own ? cur : null);
    if (own) [].forEach.call(document.querySelectorAll('.rbtn[data-view="site"]'), function (x) { x.setAttribute('aria-current', 'false'); });
    if (view === 'models') Models.show();
    if (view === 'advisor' && !LAND && !MC.Adv.result) setTimeout(function () { MC.Adv.run(false); }, 50);
    if (view === 'settings') Import.render();
    if (MC.EXT.views && MC.EXT.views[view]) MC.EXT.views[view]();
  };
  /* "Laman" with no site open: show the list of sites instead of a message */
  var railSites = $('railSites');
  if (railSites) railSites.addEventListener('click', function (e) {
    if (MC.Sites.current || MC.Sites.open.length) return;
    e.preventDefault(); e.stopPropagation();
    MC.toggleSide(true);
    var q = $('sideSearch'); if (q && window.innerWidth > 820) setTimeout(function () { q.focus(); }, 50);
  }, true);

  /* ---------------------------------------------------------------- hero: land */
  var LV = ['🟢', '🟡', '🟠', '🔴', '🟣'];
  var RING = ['var(--st-normal)', 'var(--st-alert)', 'var(--st-warning)', 'var(--st-danger)', '#a855f7'];
  var ST_NAME = { normal: 'Normal', alert: 'Waspada', warning: 'Amaran', danger: 'Bahaya' };
  var ST_COL = { normal: 'var(--st-normal)', alert: 'var(--st-alert)', warning: 'var(--st-warning)', danger: 'var(--st-danger)', unknown: 'var(--st-unknown)' };
  function freshStations(snap) { return ((snap && snap.stations) || []).filter(function (x) { return !x.stale && x.level !== null && x.level !== undefined; }); }
  function worstStation(snap) {
    var list = freshStations(snap), rank = C.STATUS_RANK || { normal: 0, alert: 1, warning: 2, danger: 3 };
    list.sort(function (a, b) {
      var d = (rank[b.status] || 0) - (rank[a.status] || 0);
      if (d) return d;
      var pa = a.danger ? (a.level - (a.normal || 0)) / Math.max(0.01, a.danger - (a.normal || 0)) : 0, pb = b.danger ? (b.level - (b.normal || 0)) / Math.max(0.01, b.danger - (b.normal || 0)) : 0;
      return pb - pa;
    });
    return list[0] || null;
  }
  function nextHighTide(snap, now) {
    var ev = (snap.tide && snap.tide.events && snap.tide.events.length ? snap.tide.events : (snap.marine && snap.marine.tidesAll) || []);
    return ev.filter(function (e) { return e.type === 'high' && e.t > now; })[0] || null;
  }
  /* the sentence on top: rules on the river level of the worst gauge (not AI) */
  function landHeadline(st, tr, early) {
    var loud = (early || []).filter(function (e) { return !e.quiet; });
    var rising = tr && tr.rising, falling = tr && tr.rate !== null && tr.rate !== undefined && tr.rate < -0.01;
    if (!st) return L('Belum ada bacaan sungai terkini');
    var toDanger = st.danger !== null && st.danger !== undefined ? st.danger - st.level : null;
    if (st.status === 'danger') return L('BANJIR — paras Bahaya di {s}', { s: st.name });
    if (st.status === 'warning' && toDanger !== null && toDanger <= 0.25) return L('Hampir paras banjir — bersedia');
    if (st.status === 'warning') return rising ? L('Sungai naik, tapi belum paras banjir') : falling ? L('Sungai tinggi tapi sedang turun') : L('Sungai tinggi, belum paras banjir');
    if (st.status === 'alert') return rising ? L('Sungai naik, masih jauh dari paras banjir') : L('Sungai atas paras biasa, masih jauh dari paras banjir');
    return loud.length ? L('Sungai normal, tapi dijangka naik') : L('Tiada risiko banjir buat masa ini');
  }
  function heroLand() {
    var r = state.risk, snap = state.snap || {}, now = Date.now(), host = $('dashHero');
    if (!host) return;
    if (!r || r.kind !== 'land') { host.innerHTML = ''; return; }
    var sc = r.score, st = worstStation(snap), tr = st && snap.trends ? snap.trends[st.name] : null;
    var loud = (r.early || []).filter(function (e) { return !e.quiet; });
    var head = landHeadline(st, tr, r.early);
    var bits = [];
    if (st) {
      var td = st.danger !== null && st.danger !== undefined ? st.danger - st.level : null;
      bits.push(L('{s} pada paras {l} ({v} m{t})', { s: esc(st.name), l: '<b style="color:' + ST_COL[st.status] + '">' + L(ST_NAME[st.status] || st.status) + '</b>', v: f(st.level, 2),
        t: tr && tr.rising ? ', ' + L('naik') : tr && tr.rate < -0.01 ? ', ' + L('turun') : '' }) + (td !== null && st.status !== 'danger' ? ' · ' + L('{d} m ke Bahaya', { d: f(Math.max(0, td), 2) }) : '') + '.');
    }
    if (r.rain !== null && r.rain !== undefined) bits.push(L('Hujan {m} mm dijangka dalam 24 jam', { m: f(r.rain, 0) }) + (r.by && r.by.length > 1 ? ' (' + L('{h} daripada {n} model ≥ 30 mm', { h: r.heavy, n: r.by.length }) + ')' : '') + '.');
    bits.push(loud.length ? '<b>' + esc(loud[0].title) + '</b>' + (loud.length > 1 ? ' (+' + (loud.length - 1) + ')' : '') + '.' : L('Tiada amaran awal banjir buat masa ini.'));
    var tide = nextHighTide(snap, now), metW = r.metW || [];
    var facts = [
      ['⏱️', loud.length ? esc(loud[0].title) : L('Amaran awal: tiada'), loud.length ? esc(loud[0].body || '') : L('Anggaran 4 j / 24 j di bawah tahap seterusnya'), 'cardRisk'],
      ['🌧️', r.rain !== null && r.rain !== undefined ? L('{m} mm dalam 24 j', { m: f(r.rain, 0) }) : L('Hujan 24 j: -'), r.rainRange ? L('5 model: {r}', { r: r.rainRange }) : L('ramalan Open-Meteo'), 'cardRain'],
      tide ? ['🌊', L('Air pasang {v} m · {t}', { v: f(tide.sea, 1), t: when(tide.t, now) }), metW.length ? esc(metW[0].title) : L('Risiko pantai: {l}', { l: r.coastal ? r.coastal.label : '-' }), 'cardTide']
        : ['⚠️', metW.length ? esc(metW[0].title) : L('Tiada amaran MET darat'), L('MET Malaysia'), 'cardWarn']
    ];
    host.innerHTML = '<div class="h-ring" style="background:conic-gradient(' + RING[sc.level] + ' 0 ' + sc.score + '%, color-mix(in srgb, var(--ink) 9%, transparent) ' + sc.score + '% 100%)"><div><b>' + sc.score + '</b><span>/ 100</span></div></div>' +
      '<div><span class="h-k">' + L('Risiko banjir · 24 jam akan datang') + ' · ' + esc(state.settings.locationName) + '</span><br><span class="h-lv l' + sc.level + '">' + LV[sc.level] + ' ' + esc(String(sc.label).toUpperCase()) + '</span>' +
      '<h2>' + esc(head) + '</h2><p>' + bits.join(' ') + '</p></div>' +
      '<div class="h-facts">' + facts.map(function (x) { return '<button type="button" class="h-fact" data-anchor="' + x[3] + '"><span class="e">' + x[0] + '</span><div><b>' + x[1] + '</b><span>' + x[2] + '</span></div></button>'; }).join('') + '</div>';
  }

  /* ---------------------------------------------------------------- hero: offshore */
  var GO_WORD = ['GO', 'CAUTION', 'NO-GO'];
  var LQ_WORD = ['GO', 'CAUTION', 'LIMITED', 'STAY IN LQ'];
  var Jobs = {
    res: null, key: '',
    /* every job (and the LQ line) in 3-hour blocks from now, for 3 days */
    get: function () {
      var rep = MC.Off.report(), Ad = A();
      if (!rep || !Ad) return null;
      var s = state.settings, now = Date.now(), k = rep.at + '|' + s.advLimits + '|' + Math.floor(now / (10 * 60000)) + '|' + I18N.lang();
      if (this.res && this.key === k) return this.res;
      var B = Ad.blocks({ from: C.dateKey(now), to: C.dateKey(now + 3 * DAY), res: '3h', now: now });
      this.res = Ad.assessOffshore({ rep: rep, snap: state.snap || {}, blocks: B, limits: Ad.limits(s.advLimits), now: now, minWindow: s.advWindowH, early: MC.Early.offCfg(s) });
      this.key = k;
      return this.res;
    },
    main: function () { var m = MC.load('mc_main_job', 'lq'); var r = this.res; return r && r.items.some(function (it) { return it.id === m; }) ? m : 'lq'; },
    /* first block from i on where the job is not No-Go (or, for LQ, below "limited") */
    until: function (r, col, from) {
      for (var j = from; j < r.cells.length; j++) { var c = r.cells[j][col]; if (c.st !== null && (col === 0 ? c.st < 2 : c.st < 2)) return r.blocks[j].t0; }
      return null;
    }
  };
  function heroOff() {
    var host = $('dashHero'), s = state.settings, snap = state.snap || {}, now = Date.now();
    if (!host) return;
    var r = Jobs.get();
    if (!r || !r.blocks.length) {
      host.innerHTML = '<div class="h-go sx"><div><span>' + L('KERJA LUAR (LQ)') + '</span><b>…</b><span>' + (MC.Off.busy ? L('membaca model') : L('belum ada data model')) + '</span></div></div><div><span class="h-k">' + L('Status operasi · 24 jam akan datang') + '</span><h2>' + (MC.Off.err ? esc(L('Model offshore tidak dapat dibaca: ') + MC.Off.err) : L('Membaca 6 model angin & 4 model ombak…')) + '</h2></div><div></div>';
      return;
    }
    var mainId = Jobs.main(), col = Math.max(0, r.items.map(function (it) { return it.id; }).indexOf(mainId)), it = r.items[col], c0 = r.cells[0][col], b0 = r.blocks[0];
    var lq = col === 0, st = c0.st === null ? -1 : c0.st, word = st < 0 ? '-' : lq ? LQ_WORD[st] : GO_WORD[st], cls = st < 0 ? 'sx' : 's' + (lq ? st : st);
    /* headline: the jobs that are No-Go now, and until when */
    var nogo = [];
    r.items.forEach(function (x, i) {
      if (i === 0) return;
      var c = r.cells[0][i];
      if (c.st === 2 && !c.night) { var u = Jobs.until(r, i, 1); nogo.push({ name: x.name, until: u }); }
    });
    var head;
    if (lq && st >= 2) head = L(['Normal', 'Berhati-hati', 'Kerja luar dihadkan', 'Kekal dalam LQ'][st]) + (c0.why && c0.why[0] ? ': ' + c0.why[0] : '');
    else if (nogo.length) {
      var names = nogo.slice(0, 3).map(function (x) { return x.name; }).join(', ') + (nogo.length > 3 ? ' +' + (nogo.length - 3) : '');
      var u = nogo.map(function (x) { return x.until; }).filter(Boolean).sort()[0];
      head = L('{n} No-Go sekarang', { n: names }) + (u ? ' — ' + L('sehingga {t}', { t: when(u, now) }) : '');
    } else head = st === 1 ? L('Boleh kerja dengan berhati-hati') : L('Semua kerja dalam had');
    var v = c0.values || {}, why = (c0.why || []).slice(0, 2).join(' · ');
    var p = L('Sekarang ({b}): angin {w} kt, tiupan {g} kt, Hs {h} m, alun {s} m.', { b: b0.label, w: f(v.w, 0), g: f(v.g, 0), h: f(v.h, 1), s: f(v.sw, 1) }) + (why ? ' ' + esc(why) + '.' : '');
    /* next GO window for the chosen job */
    var win = null;
    if (lq) { for (var j = 0; j < r.cells.length; j++) if (r.cells[j][0].st === 0) { var k = j; while (k + 1 < r.cells.length && r.cells[k + 1][0].st === 0) k++; win = { t0: Math.max(now, r.blocks[j].t0), t1: r.blocks[k].t1 }; break; } }
    else { var w = (r.windows || []).filter(function (x) { return x.id === it.id; })[0]; if (w && w.list.length) win = w.list[0]; }
    if (win) p += ' ' + L('GO seterusnya untuk {j}: {a} – {b}.', { j: '<b>' + esc(it.name) + '</b>', a: '<b>' + when(win.t0, now), b: when(win.t1, now) + '</b>' });
    var lim = (A().limits(s.advLimits)), la = lq ? lim.overall : (lim.acts.filter(function (a) { return a.id === it.id; })[0] || {});
    var chips = [['w', L('Angin'), 'kt'], ['g', L('Tiupan'), 'kt'], ['h', 'Hs', 'm'], ['sw', L('Alun'), 'm'], ['tp', 'Tp', 's'], ['vis', L('Penglihatan'), 'km']].filter(function (x) { return la[x[0]]; })
      .map(function (x) { return '<span>' + x[1] + ' <b>' + la[x[0]][1] + ' ' + x[2] + '</b></span>'; }).join('') + (la.day ? '<span>' + L('Siang sahaja') + '</span>' : '');
    var early = (r.early || [])[0], met = ((snap.met && snap.met.warnings) || [])[0];
    var facts = [
      ['🟢', win ? L('GO seterusnya: {a} – {b}', { a: when(win.t0, now), b: when(win.t1, now) }) : L('Tiada GO window dalam 3 hari'), esc(it.name) + (win && win.hours ? ' · ' + win.hours + L(' jam') : ''), 'cardJobs'],
      ['⚠️', early ? esc(early.title) : L('Amaran awal: tiada'), early ? esc(early.body || '') : L('Angin & alun tidak naik cepat dalam 24 j'), 'cardRisk'],
      ['📡', met ? esc(A().metTitle(met)) : L('Tiada amaran MET laut'), met ? esc(String(met.heading_en || met.heading_bm || met.text_en || '').slice(0, 70)) : esc(s.warningKeywords || ''), 'cardWarn']
    ];
    var opts = r.items.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === it.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
    host.innerHTML = '<div class="h-go ' + cls + '"><div><span>' + esc(lq ? L('KERJA LUAR (LQ)') : it.name.toUpperCase()) + '</span><b>' + word + '</b><span>' + L('sekarang · {b}', { b: b0.label }) + '</span><br>' +
      '<select id="heroJob" aria-label="' + esc(L('Kerja utama')) + '">' + opts + '</select></div></div>' +
      '<div><span class="h-k">' + L('Status operasi · 24 jam akan datang') + ' · ' + esc(s.locationName) + '</span><h2>' + esc(head) + '</h2><p>' + p + '</p><div class="h-lims">' + chips + '</div></div>' +
      '<div class="h-facts">' + facts.map(function (x) { return '<button type="button" class="h-fact" data-anchor="' + x[3] + '"><span class="e">' + x[0] + '</span><div><b>' + x[1] + '</b><span>' + x[2] + '</span></div></button>'; }).join('') + '</div>';
    $('heroJob').onchange = function () { MC.save('mc_main_job', this.value); heroOff(); };
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.h-fact[data-anchor]');
    if (!b) return;
    var el = $(b.getAttribute('data-anchor'));
    if (el && el.offsetParent !== null) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (b.getAttribute('data-anchor') === 'cardJobs') MC.show('advisor');
  });

  /* ---------------------------------------------------------------- land: tiles + river bars */
  function tilesLand() {
    var s = state.snap || {}, w = s.weather, cur = w && w.current, sum = w && w.summary, st = worstStation(s), fresh = freshStations(s);
    var warns = (s.met && s.met.warnings) || [], wc = C.wmo(cur ? cur.code : null);
    var tr = st && s.trends ? s.trends[st.name] : null, td = st && st.danger !== null && st.danger !== undefined ? st.danger - st.level : null;
    var nAbove = fresh.filter(function (x) { return (C.STATUS_RANK[x.status] || 0) >= 1; }).length;
    $('dashTiles').innerHTML = [
      st ? '<button class="tile' + (st.status !== 'normal' ? ' hot' : '') + '" data-hist="' + esc(st.id) + '"><div class="k">' + L('Paras sungai tertinggi') + '</div><div class="v">' + f(st.level, 2) + '<small>m ' + MC.trendHtml(st.trend) + '</small></div><div class="s">' + esc(st.name) + ' · <b style="color:' + ST_COL[st.status] + '">' + L(ST_NAME[st.status] || '-') + '</b>' + (td !== null && st.status !== 'danger' ? ' · ' + L('{d} m ke Bahaya', { d: f(Math.max(0, td), 2) }) : '') + ' · ' + L('{n} / {m} atas ambang', { n: nAbove, m: fresh.length }) + '</div></button>'
        : '<div class="tile"><div class="k">' + L('Paras sungai') + '</div><div class="v">-</div><div class="s">' + L('Belum ada bacaan JPS terkini') + '</div></div>',
      '<div class="tile"><div class="k">' + L('Hujan 3 jam akan datang') + '</div><div class="v">' + f(sum && sum.next3h) + '<small>mm</small></div><div class="s">24 j: <b>' + f(sum && sum.next24h) + ' mm</b>' + L(' · lalu: ') + f(sum && sum.past24h) + ' mm' + (sum && sum.maxProb6h !== null && sum.maxProb6h !== undefined ? L(' · peluang ') + f(sum.maxProb6h, 0) + '%' : '') + '</div></div>',
      '<div class="tile"><div class="k">' + L('Cuaca sekarang') + '</div><div class="v"><span class="emoji">' + wc.icon + '</span>' + f(cur && cur.temp, 0) + '<small>°C</small></div><div class="s">' + esc(wc.text) + (cur ? L(' · Lembap ') + f(cur.rh, 0) + '% · ' + L('angin {w} km/j', { w: f(cur.wind, 0) }) : '') + '</div></div>',
      '<button class="tile" data-go="alerts"><div class="k">' + L('Amaran MET (darat)') + '</div><div class="v">' + warns.length + '<small>' + L('aktif') + '</small></div><div class="s">' + (warns.length ? esc(C.metShort(warns[0], state.settings, Date.now(), true) || A().metTitle(warns[0])) : L('Tiada amaran untuk ') + esc(state.settings.warningKeywords)) + '</div></button>'
    ].join('');
  }
  /* upstream -> downstream order from the river layout (Tetapan), then the others */
  function riverOrder(list) {
    var rivers = R() && R().parseRivers ? R().parseRivers(state.settings.ewUpstream) : [];
    var pos = function (st) {
      for (var i = 0; i < rivers.length; i++) if (String(st.name).toLowerCase().indexOf(String(rivers[i].name).toLowerCase()) >= 0) return i;
      return 999;
    };
    return list.slice().sort(function (a, b) { return pos(a) - pos(b); });
  }
  function riverBars() {
    var body = $('waterBody'), snap = state.snap || {};
    if (!body) return;
    var all = (snap.stations || []).filter(function (x) { return x.level !== null && x.level !== undefined; });
    if (!all.length) return;   /* app.js already wrote why there is nothing */
    var tr = snap.trends || {}, list = riverOrder(all);
    var row = function (st) {
      var lo = st.normal !== null && st.normal !== undefined ? st.normal : st.alert !== null && st.alert !== undefined ? st.alert - Math.max(0.5, (st.danger - st.alert) || 1) : null;
      var p = st.danger !== null && st.danger !== undefined && lo !== null && st.danger > lo ? (st.level - lo) / (st.danger - lo) * 80 : null;
      p = p === null ? null : Math.max(0, Math.min(100, p));
      var t = tr[st.name], arrow = t && t.rising ? ' <span style="color:var(--st-warning);font-weight:800">▲</span>' : t && t.rate !== null && t.rate !== undefined && t.rate < -0.01 ? ' <span style="color:var(--st-normal);font-weight:800">▼</span>' : '';
      var sub = [st.basin, t && t.tidal ? L('pasang surut') : '', t && t.rate !== null && t.rate !== undefined ? (t.rate > 0 ? '+' : '') + f(t.rate, 2) + ' m/j' : '', C.timeAgo(st.updated)].filter(Boolean).join(' · ');
      return '<div class="rv' + (st.stale ? ' old' : '') + '" data-hist="' + esc(st.id) + '" title="' + esc(L('Waspada / Amaran / Bahaya: ') + f(st.alert, 2) + ' / ' + f(st.warning, 2) + ' / ' + f(st.danger, 2) + ' m') + '"><span class="sd" style="background:' + (ST_COL[st.status] || ST_COL.unknown) + '"></span>' +
        '<div class="n"><b>' + esc(st.name) + '</b><span>' + esc(sub) + '</span></div><div class="lv">' + f(st.level, 2) + arrow + '</div>' +
        '<div class="barw"><div class="bar"></div>' + (p === null ? '' : '<i style="left:calc(' + p.toFixed(1) + '% - 1px)"></i>') + '</div>' +
        '<div class="pc" style="color:' + (ST_COL[st.status] || ST_COL.unknown) + '">' + L(ST_NAME[st.status] || '-') + (st.stale ? '<br><small class="muted">' + L('lama') + '</small>' : '') + '</div></div>';
    };
    body.innerHTML = list.map(row).join('') + '<p class="note">' + L('Disusun hulu → hilir (Tetapan › susunan sungai). Penanda = kedudukan antara Normal dan Bahaya (jalur merah). ▲ naik · ▼ turun. Tekan stesen untuk graf 1–30 hari.') + '</p>';
  }

  /* ---------------------------------------------------------------- offshore: jobs today */
  var JobsCard = {
    h: MC.load('mc_jobs_h', '24'), open: null,
    render: function () {
      var body = $('jobsBody');
      if (!body) return;
      var r = Jobs.get(), now = Date.now(), s = state.settings;
      [].forEach.call(document.querySelectorAll('#jobsSeg button'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-h') === JobsCard.h)); });
      if (!r) { body.innerHTML = '<div class="empty">' + (MC.Off.busy ? L('Membaca model…') : MC.Off.err ? esc(MC.Off.err) : L('Belum ada data model offshore.')) + '</div>'; return; }
      var idx = [];
      if (JobsCard.h === 'shift') {
        /* day / night shifts: the worst block inside each, 3 days */
        var Ad = A(), B = Ad.blocks({ from: C.dateKey(now), to: C.dateKey(now + 2 * DAY), res: 'shift', shift: s.advShift, now: now });
        r = Ad.assessOffshore({ rep: MC.Off.report(), snap: state.snap || {}, blocks: B, limits: Ad.limits(s.advLimits), now: now, minWindow: s.advWindowH, early: MC.Early.offCfg(s) });
        idx = B.map(function (b, i) { return i; });
      } else {
        var n = JobsCard.h === '72' ? 24 : 8;
        for (var i = 0; i < Math.min(n, r.blocks.length); i++) idx.push(i);
      }
      JobsCard.cur = r;
      var mine = {}; (A().limits(s.advLimits).acts || []).forEach(function (a) { if (a.mine) mine[a.id] = true; });
      var lastDay = '', head = '<tr><th></th>' + idx.map(function (j) {
        var b = r.blocks[j], first = b.day !== lastDay; lastDay = b.day;
        return '<th>' + esc(JobsCard.h === 'shift' ? b.label : b.label.split('–')[0]) + (first ? '<small>' + esc(A().shortDay(b.day)) + '</small>' : '') + '</th>';
      }).join('') + '</tr>';
      var LET = ['G', 'C', 'N', 'LQ'];
      var rows = r.items.map(function (it, i) {
        return '<tr class="' + (i === 0 ? 'lq' : '') + (mine[it.id] ? ' mine' : '') + '"><td>' + esc(it.name) + '</td>' + idx.map(function (j) {
          var c = r.cells[j][i], st = c.st === null ? 'x' : c.st;
          return '<td class="c s' + st + '" data-jb="' + j + '" data-ji="' + i + '" title="' + esc((c.why || []).join(' · ')) + '">' + (c.st === null ? '-' : i === 0 ? ['G', 'C', 'L', 'LQ'][c.st] : LET[c.st]) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      body.innerHTML = '<div class="oc-scroll"><table class="jx">' + head + rows + '</table></div><div id="jxWhy"></div>' +
        '<p class="note"><b style="color:var(--st-normal)">G</b> Go · <b style="color:var(--st-alert)">C</b> Caution · <b style="color:var(--st-danger)">N</b> No-Go · ' + L('LQ: L = kerja luar dihadkan, LQ = kekal dalam LQ.') + ' ' +
        L('Tekan petak untuk sebab. Had: menu Kerja › Had operasi; kerja sendiri: Tetapan › Kerja saya.') + '</p>';
      $('jobsSub').textContent = JobsCard.h === 'shift' ? L('syif siang / malam · 3 hari') : L('blok 3 jam · nilai paling teruk setiap blok · had anda');
    },
    why: function (j, i) {
      var r = JobsCard.cur, M = A();
      if (!r) return;
      var c = r.cells[j][i], b = r.blocks[j], it = r.items[i], v = c.values || {};
      $('jxWhy').innerHTML = '<div class="jx-why"><b>' + esc(it.name) + ' — ' + esc(c.label) + '</b> <span class="muted">' + esc(M.shortDay(b.day) + ' ' + b.label) + ' · ' + L('keyakinan') + ' ' + esc(c.confLabel || '-') + (c.prob !== null && c.prob !== undefined ? ' · ' + Math.round(c.prob * 100) + '% ' + L('model No-Go') : '') + '</span>' +
        '<ul>' + (c.why || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        (v.w !== undefined ? '<p class="note" style="margin:6px 0 0">' + L('Nilai tengah model: angin {w} kt, tiupan {g} kt, Hs {h} m, alun {s} m', { w: f(v.w, 0), g: f(v.g, 0), h: f(v.h, 1), s: f(v.sw, 1) }) + '</p>' : '') + '</div>';
    }
  };
  if ($('jobsSeg')) {
    $('jobsSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-h]'); if (!b) return; JobsCard.h = b.getAttribute('data-h'); MC.save('mc_jobs_h', JobsCard.h); JobsCard.render(); });
    $('jobsBody').addEventListener('click', function (e) { var c = e.target.closest('[data-jb]'); if (c) JobsCard.why(+c.getAttribute('data-jb'), +c.getAttribute('data-ji')); });
    $('jobsPdf').onclick = function () { MC.Off.pdf(); };
  }

  /* ---------------------------------------------------------------- offshore: the Models page (the comparison card moves there) */
  var Models = {
    show: function () {
      var host = $('modelsHost'), card = $('cardOffCmp');
      if (host && card && card.parentNode !== host) host.appendChild(card);
      MC.Off.load(false);
    }
  };
  if (!LAND) Models.show();

  /* ---------------------------------------------------------------- the dashboard hook */
  var prevDash = MC.EXT.dash;
  MC.EXT.dash = function () {
    if (prevDash) prevDash();
    if (LAND) { heroLand(); tilesLand(); riverBars(); }
    else { Jobs.res = null; heroOff(); JobsCard.render(); }
  };
  MC.EXT.Jobs = Jobs;

  /* ---------------------------------------------------------------- import from the original Dashboard Cuaca (same iPad, same address) */
  var Import = {
    read: function () {
      var get = function (k) { try { var v = ED.rawGet ? ED.rawGet(k) : null; return v ? JSON.parse(v) : null; } catch (e) { return null; } };
      return { s: get('mc_settings'), p: get('mc_profiles'), theme: ED.rawGet ? ED.rawGet('mc_theme') : null };
    },
    render: function () {
      var body = $('importBody');
      if (!body) return;
      var o = this.read(), profs = (o.p && o.p.profiles) || [], mine = profs.filter(function (p) { return p.kind === ED.kind; });
      if (!o.s && !profs.length) {
        body.innerHTML = '<p class="muted">' + L('Tiada tetapan Dashboard Cuaca dalam pelayar / iPad ini. Import hanya berfungsi bila app asal dibuka dari alamat yang sama (azizdigital.github.io) dalam app yang sama (Safari atau ikon Skrin Utama).') + '</p>' +
          '<p class="muted" style="font-size:12px">' + L('Cara lain: dalam Dashboard Cuaca, Tetapan › Peranti lain › Salin pautan tetapan, kemudian di sini Tetapan › Peranti lain › Tampal pautan.') + '</p>';
        return;
      }
      body.innerHTML = '<p class="muted">' + L('Dijumpai dalam Dashboard Cuaca: {n} profil {k} ({list}){r}.', { n: mine.length, k: LAND ? L('darat') : 'offshore', list: mine.map(function (p) { return esc(p.name); }).join(', ') || '-',
        r: o.s && o.s.relayKey ? L(', kunci relay') : '' }) + '</p>' +
        '<div class="relay-btns"><button type="button" class="btn sm pri" id="impGo">' + L('Import sekarang') + '</button></div>' +
        '<p class="muted" style="font-size:12px">' + (LAND ? L('Disalin: profil darat, ambang alert, Tempat saya, susunan sungai, bunyi, bahasa & tema. Kunci relay disalin; alamat relay perlu diisi selepas buat relay baru Monsoon EYE (Tetapan › Relay laman).')
          : L('Disalin: profil offshore, had kerja, syif, ambang alert, bunyi, bahasa & tema. Kunci relay disalin; alamat relay perlu diisi selepas buat relay baru OceanWATCH (Tetapan › Relay laman).')) + '</p><div class="relay-msg muted" id="impMsg"></div>';
      $('impGo').onclick = function () { Import.run(o, mine); };
    },
    run: function (o, mine) {
      if (!confirm(L('Salin tetapan dari Dashboard Cuaca ke {a}? Tetapan {a} sekarang akan diganti.', { a: ED.name }))) return;
      var keep = ['refreshMin', 'staleHours', 'sound', 'soundLevel', 'notify', 'siteCheck', 'lang', 'omEveryMin', 'advShift', 'relayKey'];   /* the relay key: the new relay of this app can use the same one (its address is new) */
      keep = keep.concat(LAND ? ['advPlaces', 'ewUpstream', 'ewConf', 'coastal'] : ['advLimits', 'advWindowH', 'ewWindRise', 'ewSwellTp', 'offWindKt', 'offWaveM']);
      var ns = Object.assign({}, state.settings);
      if (o.s) keep.forEach(function (k) { if (o.s[k] !== undefined) ns[k] = o.s[k]; });
      ns.kind = ED.kind;
      if (mine.length) {
        var profs = mine.slice(0, 20).map(function (p) { var x = Object.assign({}, p); if (x.id === 'irong-barat') x.name = String(x.name).replace(/\s*\(offshore\)\s*$/i, ''); return C.cleanProfile(x); });
        var act = o.p && profs.some(function (x) { return x.id === o.p.active; }) ? o.p.active : profs[0].id;
        MC.setProfiles({ active: act, profiles: profs });
        ns = C.profileSettings(ns, profs.filter(function (x) { return x.id === act; })[0]);
      }
      ns = C.cleanSettings(ns);
      MC.save('mc_settings', ns);
      if (o.theme === 'light' || o.theme === 'dark') { try { localStorage.setItem('mc_theme', o.theme); } catch (e) { /* */ } }
      MC.save('mc_snap', null);
      $('impMsg').textContent = L('Disalin ✓ — app dimuat semula…');
      setTimeout(function () { location.reload(); }, 700);
    }
  };
  MC.EXT.Import = Import;

  /* first draw with the hooks in place */
  try { MC.renderAll(); } catch (e) { /* no data yet */ }
  MC.setTitle();
})();
