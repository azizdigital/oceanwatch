/* Dashboard Cuaca Aziz 3.0 - the page (desktop window and phone PWA).
   Data comes from the PC (/api/events live, /api/snapshot) - or, on a phone that cannot reach the PC,
   straight from the public APIs ("mod terus"), parsed with the same MCCore code.
   Sites open in <webview> on the desktop and in <iframe> elsewhere (with an "open in new tab" fallback
   for sites that refuse to be framed). */
(function () {
  'use strict';
  var C = window.MCCore, CH = window.MCCharts, I18N = window.MCI18n, L = I18N.L;
  var $ = function (id) { return document.getElementById(id); };
  var D = window.mcDesktop || null;
  var isDesktop = !!(D && D.desktop);
  document.documentElement.classList.toggle('is-desktop', isDesktop);
  /* web app (GitHub Pages and the like): there is no PC behind it - everything is fetched and kept on this device */
  var MIRROR = (new URLSearchParams(location.search)).get('mirror') || C.mirrorBase(location);
  var isWeb = !isDesktop && (/\.github\.io$/i.test(location.hostname) || /[?&]web\b/.test(location.search) || document.documentElement.hasAttribute('data-web'));
  document.documentElement.classList.toggle('is-web', isWeb);
  if (isWeb) { var st1 = document.createElement('style'); st1.textContent = '.pc-only{display:none!important}'; document.head.appendChild(st1); }
  else { var st2 = document.createElement('style'); st2.textContent = '.web-only{display:none!important}'; document.head.appendChild(st2); }
  if (!isDesktop) { var st0 = document.createElement('style'); st0.textContent = '.desk-only,.rail .desk#railPhone{display:none!important}'; document.head.appendChild(st0); }

  /* ---------------------------------------------------------------- utils */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full / private */ } }
  function f(v, d) { return v === null || v === undefined || !isFinite(v) ? '-' : (+v).toFixed(d === undefined ? 1 : d); }
  /* the iPad app (ios/ in the repo): a native shell around this page. Sites open in full native browser views,
     so no site can refuse to be shown and the Malaysia-only sites answer (the iPad is in Malaysia). */
  var Native = {
    ok: !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dcOpen),
    open: function (site) {
      try { window.webkit.messageHandlers.dcOpen.postMessage({ id: site.id, title: L(site.title), url: siteUrl(site) }); } catch (e) { /* */ }
    },
    /* 4.2.0: the app turns the print layout into a PDF and opens the iPad share sheet (Save to Files, Mail...) */
    pdfOk: !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dcPdf),
    pdf: function (name) { try { window.webkit.messageHandlers.dcPdf.postMessage({ name: name }); } catch (e) { /* */ } }
  };
  if (Native.ok) document.documentElement.classList.add('is-native');
  /* iPad / iPhone in a Safari tab: sites that open "outside" become Safari tabs. From the Home Screen icon they open
     as a sheet over the app with "Done" - say how, once */
  (function iosHint() {
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    if (!ios || standalone || Native.ok || isDesktop) return;
    try { if (localStorage.getItem('mc_ios_hint_off')) return; } catch (e) { /* */ }
    var d = document.createElement('div');
    d.className = 'ios-hint';
    d.innerHTML = '<span>📲 ' + L('Pasang app ini: butang Kongsi ⬆️ → Tambah ke Skrin Utama, kemudian buka dari ikon itu. Laman yang dibuka di luar akan keluar di atas app dengan butang Done.') + '</span><button type="button" aria-label="OK">✕</button>';
    d.querySelector('button').onclick = function () { d.remove(); try { localStorage.setItem('mc_ios_hint_off', '1'); } catch (e) { /* */ } };
    document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(d); });
    if (document.readyState !== 'loading') document.body.appendChild(d);
  })();
  function toast(title, body, level, ms) {
    var t = document.createElement('div');
    t.className = 'toast ' + (level || '');
    t.innerHTML = '<b>' + esc(title) + '</b>' + (body ? esc(body) : '');
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 5000);
  }
  function fetchT(url, ms, opts) {
    var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, ms || 15000);
    return fetch(url, Object.assign({ signal: ac.signal, cache: 'no-store' }, opts || {})).finally(function () { clearTimeout(t); });
  }
  function apiPost(p, body) {
    return fetchT(p, 120000, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MC': '1' }, body: JSON.stringify(body || {}) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  /* PC app: an outside address read by the PC (lib/api.js /api/fetch, its own list of allowed sources); JSON, or { text } for JPS pages */
  function pcGet(u, ms) { return fetchT('/api/fetch?url=' + encodeURIComponent(u), ms || 60000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function openExternal(url) { if (D) D.openExternal(url); else window.open(url, '_blank', 'noopener'); }

  var state = {
    view: 'dashboard', snap: load('mc_snap', null), settings: C.cleanSettings(load('mc_settings', null)),
    mode: isDesktop ? 'pc' : 'connecting', mutedUntil: 0, histStation: load('mc_hist_station', ''), dirty: false,
    profiles: load('mc_profiles', { active: C.DEFAULT_PROFILES[0].id, profiles: C.DEFAULT_PROFILES.map(function (p) { return C.cleanProfile(p); }) })
  };

  var APPNAME = (window.EDITION && window.EDITION.name) || 'Dashboard Cuaca Aziz';
  /* Monsoon EYE / OceanWATCH: edition-ui.js adds its parts (hero, jobs, Ask AI, district form...) through these hooks */
  var EXT = { onShow: null, dash: null, after: null };
  /* ---------------------------------------------------------------- views */
  var TITLES = {
    dashboard: ['🌤️', 'Dashboard', 'Kemaman, Terengganu'], site: ['🌐', L('Laman web'), ''], wall: ['🧱', L('Mod dinding'), L('Beberapa laman serentak')],
    history: ['📈', L('Sejarah & graf'), L('Paras air, hujan & suhu')], advisor: ['🤖', L('Cadangan AI'), L('Penilaian automatik & prompt untuk AI')], alerts: ['🔔', 'Alert', L('Ambang & log')], settings: ['⚙️', L('Tetapan'), '']
  };
  function show(view) {
    if (!TITLES[view]) view = 'dashboard';
    if (view === 'site' && !Sites.current) { if (Sites.open.length) Sites.activate(Sites.open[Sites.open.length - 1]); else { toggleSide(true); toast(L('Pilih laman'), L('Pilih laman dari senarai di kiri.')); return; } }
    state.view = view;
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('on', v.id === 'view-' + view); });
    document.querySelectorAll('.rbtn[data-view]').forEach(function (b) { b.setAttribute('aria-current', String(b.getAttribute('data-view') === view)); });
    setTitle();
    if (view === 'wall') Wall.render();
    if (view === 'history') History.load();
    if (view === 'alerts') Alerts.renderView();
    if (view === 'settings') Settings.fill();
    if (view === 'advisor') Adv.render();
    if (view !== 'site') renderSideActive();
    if (window.innerWidth <= 820) toggleSide(false);
    if (EXT.onShow) try { EXT.onShow(view); } catch (e) { console.error(e); }
  }
  function setTitle() {
    var t = TITLES[state.view];
    if (state.view === 'site' && Sites.current) {
      var s = C.siteById(Sites.current);
      $('topIcon').textContent = s.icon; $('topTitle').textContent = s.title; $('topSub').textContent = s.desc;
    } else {
      $('topIcon').textContent = t[0]; $('topTitle').textContent = t[1];
      $('topSub').textContent = state.view === 'dashboard' ? state.settings.locationName + (state.settings.kind === 'offshore' ? ' · offshore ' + f(state.settings.marineLat, 4) + ', ' + f(state.settings.marineLon, 4) : '') : t[2];
    }
  }

  /* ------------------------------------------------------------ profiles */
  var KIND_ICON = { land: '🏘️', offshore: '🛢️' };
  function renderProfiles() {
    var P = state.profiles || {}, list = P.profiles || [], act = list.filter(function (p) { return p.id === P.active; })[0];
    $('profIcon').textContent = act ? KIND_ICON[act.kind] : '📍';
    $('profName').textContent = act ? act.name : state.settings.locationName;
    $('profMenu').innerHTML = list.map(function (p) {
      return '<button role="menuitemradio" data-prof="' + esc(p.id) + '" aria-current="' + (p.id === P.active) + '"><span class="e">' + KIND_ICON[p.kind] + '</span>' + esc(p.name) +
        '<small>' + (p.kind === 'offshore' ? 'offshore' : L('darat')) + '</small></button>';
    }).join('') + '<hr><button data-go="settings" data-prof-manage="1"><span class="e">⚙️</span>Urus profil…</button>';
    $('profList').innerHTML = list.map(function (p) {
      var on = p.id === P.active;
      return '<div class="prow' + (on ? ' on' : '') + '"><span class="e">' + KIND_ICON[p.kind] + '</span><div><b>' + esc(p.name) + '</b><br><small>' + (p.kind === 'offshore' ? 'offshore' : L('darat')) + ' · ' +
        f(p.lat, 4) + ', ' + f(p.lon, 4) + '</small></div><div class="sp"></div>' +
        (on ? '<span class="chip st-normal"><i>●</i>Aktif</span>' : '<button type="button" class="btn sm" data-prof="' + esc(p.id) + '">Aktifkan</button>') +
        (list.length > 1 ? '<button type="button" class="btn sm warn" data-prof-del="' + esc(p.id) + '">Padam</button>' : '') + '</div>';
    }).join('');
    document.querySelectorAll('.pname').forEach(function (el) { el.textContent = act ? act.name : '-'; });
  }
  function switchProfile(id) {
    $('profMenu').hidden = true;
    if (id === state.profiles.active) return;
    var p = (state.profiles.profiles || []).filter(function (x) { return x.id === id; })[0];
    Data.profile('activate', { id: id }).then(function () { toast(L('Profil: ') + (p ? p.name : id), L('Data sedang dikemas kini…'), null, 3000); })
      .catch(function (e) { toast(L('Gagal tukar profil'), e.message, 'warning'); });
  }
  function toggleSide(on) {
    var app = $('app');
    if (window.innerWidth <= 820) app.classList.toggle('side-open', on === undefined ? !app.classList.contains('side-open') : on);
    else { var off = on === undefined ? !app.classList.contains('side-off') : !on; app.classList.toggle('side-off', off); save('mc_side_off', off); }
  }

  /* -------------------------------------------------------------- sidebar */
  function siteDot(id) {
    var h = (state.snap && state.snap.sites || {})[id];
    if (!isDesktop && C.relayAdsFor(C.siteById(id), state.settings) && (!h || h.ok)) return '<span class="dot ok relay" title="' + esc(L('Melalui relay, tanpa iklan')) + '"></span>';
    if (!h) return '<span class="dot" title="Belum disemak"></span>';
    if (!h.ok) return '<span class="dot bad" title="' + esc(L('Tidak dapat dicapai: ') + (h.error || 'HTTP ' + h.status)) + '"></span>';
    if (!isDesktop && C.siteBlocked(C.siteById(id), h)) return C.relayFor(C.siteById(id), state.settings) ? '<span class="dot ok relay" title="' + esc(L('Dipaparkan melalui relay')) + '"></span>' :
      C.altFor(C.siteById(id), state.settings) ? '<span class="dot ok alt" title="' + esc(L('Laman ganti dalam app')) + '"></span>' : '<span class="dot ok" title="Dibuka di tab baru (laman tidak benarkan paparan terbenam)"></span>';
    return '<span class="dot ok" title="OK · ' + h.ms + ' ms"></span>';
  }
  function renderSide() {
    var q = ($('sideSearch').value || '').toLowerCase().trim();
    $('sideList').innerHTML = C.CATEGORIES.map(function (c) {
      var items = c.items.filter(function (s) { return !q || (s.title + ' ' + s.desc + ' ' + c.name + ' ' + L(s.title) + ' ' + L(s.desc) + ' ' + L(c.name)).toLowerCase().indexOf(q) >= 0; });
      if (!items.length) return '';
      return '<div class="cat"><div class="cat-h"><span class="emoji">' + c.icon + '</span>' + esc(c.name) + '<span class="n">' + items.length + '</span></div>' +
        items.map(function (s) {
          return '<button class="site" data-site="' + s.id + '"><span class="ic">' + s.icon + '</span><span style="min-width:0"><span class="t" style="display:block">' + esc(s.title) +
            '</span><span class="d" style="display:block">' + esc(s.desc) + '</span></span><span style="display:flex;align-items:center;gap:6px">' +
            (Sites.open.indexOf(s.id) >= 0 ? '<span class="open" title="Terbuka"></span>' : '') + siteDot(s.id) + '</span></button>';
        }).join('') + '</div>';
    }).join('') || '<div class="empty">Tiada laman sepadan.</div>';
    renderSideActive();
  }
  function renderSideActive() {
    document.querySelectorAll('.site[data-site]').forEach(function (b) { b.setAttribute('aria-current', String(state.view === 'site' && b.getAttribute('data-site') === Sites.current)); });
  }

  /* --------------------------------------------------------------- frames */
  var NET_ERR = {
    '-105': L('Nama laman tidak dijumpai. Semak sambungan internet.'), '-106': L('Tiada sambungan internet.'), '-102': L('Laman menolak sambungan.'),
    '-118': L('Laman terlalu lama untuk menjawab.'), '-7': L('Laman terlalu lama untuk menjawab.'), '-109': L('Laman tidak dapat dicapai.'), '-21': L('Rangkaian bertukar. Cuba lagi.'),
    '-200': L('Sijil keselamatan laman tidak sah.'), '-201': L('Sijil laman sudah tamat tempoh.'), '-202': L('Sijil laman tidak dipercayai.')
  };
  function siteUrl(site) { return C.siteUrl(site, state.settings); }
  /* look for the newest full date written in the page: cameras that stopped updating still show their last date */
  var FRESH_DAYS = 2;
  function freshInfo(fr) {
    if (!fr || !fr.fresh || !fr.fresh.at) return null;
    var age = Date.now() - fr.fresh.at, old = age > FRESH_DAYS * 86400000;
    return { old: old, text: (old ? L('⚠ Tarikh terkini di laman: ') : L('✓ Tarikh terkini di laman: ')) + C.fmtDateTime(fr.fresh.at) + ' (' + C.timeAgo(fr.fresh.at) + ')',
      tip: old ? L('Laman ini hanya menunjukkan tarikh lama. Kamera / data mungkin sudah tidak dikemas kini oleh pemiliknya.') : L('Tarikh paling baru yang tertulis di laman ini.') };
  }
  /* one site inside a host element. Desktop: <webview>. Browser/phone: <iframe>, or a "blocked" card. */
  /* the Kemaman page asks for its original site (PC): the frame whose page sent it switches to the real site */
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || !e.data.kmOrig) return;
    var all = (Sites.frames ? Object.keys(Sites.frames).map(function (k) { return Sites.frames[k]; }) : []).concat(Wall.frames || []);
    all.forEach(function (f) { if (f && f.showOrig && f.view && f.view.contentWindow === e.source) f.showOrig(true); });
  });
  function makeFrame(site, host, onState) {
    var wrap = document.createElement('div'), altInfo = null;
    wrap.className = 'frame';
    var prog = document.createElement('div'); prog.className = 'prog'; prog.style.width = '0'; wrap.appendChild(prog);
    host.appendChild(wrap);
    var startUrl = siteUrl(site);
    var fr = { id: site.id, site: site, el: wrap, loading: false, lastLoad: Date.now(), url: startUrl, baseUrl: startUrl, zoom: 0, view: null, blocked: false, fresh: null };
    var noCache = site.category === 'kamera';   /* cameras: always fetch new images */
    var msg = null;
    function message(icon, title, text, retry) {
      clearMsg();
      msg = document.createElement('div'); msg.className = 'fmsg';
      msg.innerHTML = '<div class="box"><div class="e">' + icon + '</div><h4>' + esc(title) + '</h4><p>' + esc(text) + '</p><div class="row">' +
        (retry ? '<button class="btn pri" data-a="retry">Cuba lagi</button>' : '') + '<button class="btn' + (retry ? '' : ' pri') + '" data-a="ext">Buka dalam pelayar ↗</button></div></div>';
      msg.addEventListener('click', function (e) { var a = e.target.getAttribute('data-a'); if (a === 'retry') fr.reload(); if (a === 'ext') openExternal(fr.url || site.url); });
      wrap.appendChild(msg);
    }
    function clearMsg() { if (msg) { msg.remove(); msg = null; } }
    function progress(on) {
      fr.loading = on;
      if (on) { prog.style.opacity = '1'; prog.style.width = '30%'; setTimeout(function () { if (fr.loading) prog.style.width = '70%'; }, 600); }
      else { prog.style.width = '100%'; setTimeout(function () { prog.style.opacity = '0'; prog.style.width = '0'; }, 400); }
      onState && onState(fr);
    }
    var health = (state.snap && state.snap.sites || {})[site.id];
    /* iPad / phone / web: the app's own page for this tab (Water Level / Rainfall Kemaman) */
    var ownPage = !isDesktop ? C.altFor(site, state.settings) : null;
    if (!(ownPage && ownPage.page)) ownPage = null;
    if (isDesktop) {
      /* PC: the real site in a <webview>; Water Level / Rainfall Kemaman: the app's own page (JPS read straight from the PC),
         with "Laman asal" = the real infobanjir site in the same tab and "← Halaman app" back (remembered per tab / wall pane) */
      var deskOwn = C.ALT[site.id] && C.ALT[site.id].page ? C.ALT[site.id] : null;
      var paneEl = host.closest ? host.closest('.pane') : null, paneSel = paneEl && paneEl.querySelector('select[data-pane]');
      var origKey = site.id + ':' + (paneSel ? 'wall' + paneSel.getAttribute('data-pane') : 'tab');
      var clearView = function () { if (fr.view && fr.view.parentNode) fr.view.parentNode.removeChild(fr.view); var b = wrap.querySelector('.origbar'); if (b) b.remove(); clearMsg(); };
      var deskWebview = function () {
        var wv = document.createElement('webview');
        wv.setAttribute('partition', 'persist:sites');
        wv.setAttribute('allowpopups', '');
        wv.setAttribute('src', startUrl);
        wrap.appendChild(wv);
        fr.view = wv;
        wv.addEventListener('did-start-loading', function () { clearMsg(); progress(true); });
        /* the same small per-site fixes as through the relay (e.g. JPS with the profile's district chosen) */
        wv.addEventListener('dom-ready', function () {
          if (!/publicinfobanjir\.water\.gov\.my/.test(wv.getURL ? wv.getURL() : '')) return;
          fetch('relay-tweaks.js', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; })
            .then(function (code) { if (code) wv.executeJavaScript(code).catch(function () { }); }).catch(function () { });
        });
        wv.addEventListener('did-stop-loading', function () {
          fr.lastLoad = Date.now(); progress(false);
          clearTimeout(fr.freshTimer);
          fr.freshTimer = setTimeout(function () {
            try {
              wv.executeJavaScript('(document.body ? document.body.innerText : "").slice(0, 200000)').then(function (text) {
                var at = C.newestDate(text, Date.now());
                fr.fresh = at ? { at: at, checked: Date.now() } : null;
                onState && onState(fr);
              }).catch(function () { });
            } catch (e) { /* page gone */ }
          }, 3000);
        });
        wv.addEventListener('did-fail-load', function (e) {
          if (!e.isMainFrame || e.errorCode === -3) return;
          progress(false);
          message('📡', L('Laman tidak dapat dibuka'), (NET_ERR[String(e.errorCode)] || e.errorDescription || L('Ralat')) + ' (' + e.errorCode + ')', true);
        });
        wv.addEventListener('did-navigate', function (e) { fr.url = e.url; onState && onState(fr); });
        wv.addEventListener('did-navigate-in-page', function (e) { if (e.isMainFrame) { fr.url = e.url; onState && onState(fr); } });
        wv.addEventListener('render-process-gone', function () { message('💥', L('Laman berhenti'), L('Paparan laman ini terhenti.'), true); });
        fr.reload = function () { clearMsg(); try { if (noCache) wv.reloadIgnoringCache(); else wv.reload(); } catch (e) { wv.src = fr.url || startUrl; } };
        fr.goto = function (u) { clearMsg(); fr.url = fr.baseUrl = u; try { wv.loadURL(u); } catch (e) { wv.src = u; } };
        fr.back = function () { try { if (wv.canGoBack()) wv.goBack(); } catch (e) { /* */ } };
        fr.fwd = function () { try { if (wv.canGoForward()) wv.goForward(); } catch (e) { /* */ } };
        fr.home = function () { clearMsg(); fr.url = fr.baseUrl; try { wv.loadURL(fr.baseUrl); } catch (e) { wv.src = fr.baseUrl; } };
        fr.setZoom = function (z) { fr.zoom = Math.max(-5, Math.min(5, z)); try { wv.setZoomLevel(fr.zoom); } catch (e) { /* */ } };
      };
      var deskOwnPage = function () {
        var f = document.createElement('iframe');
        f.setAttribute('allow', 'fullscreen');
        f.src = deskOwn.url + '&pc=1';
        wrap.appendChild(f);
        fr.view = f; fr.own = true; fr.url = fr.baseUrl = startUrl;
        progress(true);
        f.addEventListener('load', function () { fr.lastLoad = Date.now(); progress(false); });
        fr.reload = function () { clearMsg(); try { f.contentWindow.location.reload(); } catch (e) { f.src = f.src; } };
        fr.back = fr.fwd = fr.setZoom = function () { };
        fr.home = function () { fr.reload(); };
        fr.goto = function (u) { fr.url = fr.baseUrl = u; };
      };
      var origPref = function () { var m = load('mc_orig', {}); return !!m[origKey]; };
      fr.showOrig = function (on) {
        var m = load('mc_orig', {}); if (on) m[origKey] = 1; else delete m[origKey]; save('mc_orig', m);
        clearView(); fr.own = false;
        if (on) {
          deskWebview();
          var bar = document.createElement('div'); bar.className = 'altbar origbar';
          bar.innerHTML = '<span>🌐 ' + esc(site.id === 'floodhub' ? L('Laman asal') + ': Google Flood Hub' : L('Laman asal: infobanjir Terengganu')) + '</span><button class="btn sm" type="button">← ' + esc(L(site.id === 'rainfall' ? 'Halaman app (Hujan Kemaman)' : site.id === 'floodhub' ? 'Halaman app (Aliran Sungai Kemaman)' : 'Halaman app (Paras Air Kemaman)')) + '</button>';
          bar.querySelector('button').onclick = function () { fr.showOrig(false); };
          wrap.insertBefore(bar, fr.view); wrap.classList.add('has-alt');
        } else { wrap.classList.remove('has-alt'); deskOwnPage(); }
        onState && onState(fr);
      };
      if (deskOwn && !origPref()) deskOwnPage();
      else if (deskOwn) fr.showOrig(true);
      else deskWebview();
    } else if (!ownPage && ((C.siteBlocked(site, health) && C.relayFor(site, state.settings)) || (!isDesktop && C.relayAdsFor(site, state.settings))) && C.relayUrlFor(startUrl, state.settings)) {
      /* the site refuses to be framed: show it through the user's relay (Cloudflare Worker), which removes only that refusal */
      var rf = document.createElement('iframe');
      rf.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads');
      rf.setAttribute('allow', 'fullscreen; geolocation');
      rf.src = C.relayUrlFor(startUrl, state.settings);
      wrap.appendChild(rf);
      fr.view = rf; fr.relay = true;
      progress(true);
      rf.addEventListener('load', function () { fr.lastLoad = Date.now(); progress(false); });
      fr.reload = function () { clearMsg(); progress(true); rf.src = 'about:blank'; setTimeout(function () { rf.src = C.relayUrlFor(fr.url || startUrl, state.settings); }, 30); };
      fr.back = fr.fwd = function () { };
      fr.home = function () { fr.url = fr.baseUrl; fr.reload(); };
      fr.goto = function (u) { fr.url = fr.baseUrl = u; fr.reload(); };
      fr.setZoom = function () { };
    } else if (!isDesktop && (ownPage || C.siteBlocked(site, health)) && (altInfo = C.altFor(site, state.settings)) && altInfo.kind === 'url') {
      /* the site cannot be shown here and the relay cannot fetch it: a stand-in from the same source, inside the app */
      var bar = document.createElement('div');
      bar.className = 'altbar';
      bar.innerHTML = '<span>↪ ' + esc(L('Laman ganti:')) + ' <b>' + esc(L(altInfo.title)) + '</b></span><a href="' + esc(startUrl) + '" target="_blank" rel="noopener">' + esc(L('Laman asal ↗')) + '</a>';
      if (!altInfo.page) { wrap.appendChild(bar); wrap.classList.add('has-alt'); }
      var af = document.createElement('iframe');
      if (altInfo.viaRelay) af.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads');
      af.setAttribute('allow', 'fullscreen; geolocation');
      af.src = altInfo.viaRelay ? C.relayUrlFor(altInfo.url, state.settings) : altInfo.url;
      wrap.appendChild(af);
      fr.view = af; fr.alt = true;
      progress(true);
      af.addEventListener('load', function () { fr.lastLoad = Date.now(); progress(false); });
      fr.reload = function () { clearMsg(); progress(true); var u = af.src; af.src = 'about:blank'; setTimeout(function () { af.src = u; }, 30); };
      fr.back = fr.fwd = fr.setZoom = function () { };
      fr.home = function () { fr.reload(); };
      /* the profile moved: the stand-in follows the new place too */
      fr.goto = function (u) {
        fr.url = fr.baseUrl = u;
        var a2 = C.altFor(site, state.settings);
        if (a2 && a2.kind === 'url') af.src = a2.viaRelay ? C.relayUrlFor(a2.url, state.settings) : a2.url;
        var ln = bar.querySelector('a'); if (ln) ln.href = u;
      };
    } else if (C.siteBlocked(site, health)) {
      fr.blocked = true;
      message(site.icon, site.title, L('Laman ini tidak membenarkan paparan di dalam app lain. Buka di tab baru - app ini kekal terbuka di tab asal.'), false);
      fr.reload = fr.back = fr.fwd = fr.home = fr.setZoom = function () { };
      fr.goto = function (u) { fr.url = fr.baseUrl = u; };
    } else {
      var ifr = document.createElement('iframe');
      ifr.setAttribute('referrerpolicy', 'no-referrer');
      ifr.setAttribute('allow', 'fullscreen');
      ifr.setAttribute('loading', 'eager');
      ifr.src = startUrl;
      wrap.appendChild(ifr);
      fr.view = ifr;
      progress(true);
      ifr.addEventListener('load', function () { fr.lastLoad = Date.now(); progress(false); });
      fr.reload = function () { clearMsg(); progress(true); ifr.src = 'about:blank'; setTimeout(function () { ifr.src = fr.url || startUrl; }, 30); };
      fr.back = fr.fwd = function () { };
      fr.home = function () { fr.url = fr.baseUrl; fr.reload(); };
      fr.goto = function (u) { fr.url = fr.baseUrl = u; fr.reload(); };
      fr.setZoom = function () { };
    }
    fr.destroy = function () { wrap.remove(); };
    return fr;
  }

  /* --------------------------------------------------------- site viewer */
  var Sites = {
    /* tabs kept from last time; on phones / browsers not the sites that refuse framing and have no stand-in frame
       (they open in their own window, or go to a card on the dashboard) */
    open: load('mc_open', []).filter(function (id) {
      var st = C.siteById(id);
      if (!st) return false;
      if (isDesktop || !st.noFrame) return true;
      var ss = load('mc_settings', null) || C.DEFAULTS;
      if (C.relayFor(st, ss)) return true;
      var a = C.altFor(st, ss);
      return !!(a && a.kind === 'url');
    }),
    frames: {}, current: null, auto: load('mc_auto', {}), MAX: 6,
    activate: function (id) {
      if (!C.siteById(id)) return;
      var i = this.open.indexOf(id);
      if (i >= 0) this.open.splice(i, 1);
      this.open.push(id);
      while (this.open.length > this.MAX) this.close(this.open[0], true);
      save('mc_open', this.open);
      if (!this.frames[id]) this.frames[id] = makeFrame(C.siteById(id), $('siteHost'), function (fr) { if (fr.id === Sites.current) Sites.bar(); });
      this.current = id;
      save('mc_last_site', id);
      Object.keys(this.frames).forEach(function (k) { Sites.frames[k].el.classList.toggle('on', k === id); });
      this.tabs(); this.bar(); renderSide();
    },
    /* relay switched on / off / changed: blocked sites already open are rebuilt the new way */
    rebuildBlocked: function () {
      var self = this, cur = this.current;
      Object.keys(this.frames).forEach(function (id) {
        var fr = self.frames[id];
        if (fr && (fr.blocked || fr.relay || fr.alt || (C.siteById(id) || {}).ads)) { fr.destroy(); delete self.frames[id]; }
      });
      if (cur && state.view === 'site') this.activate(cur);
      renderSide();
    },
    /* tapped = opened by the user's own tap/click (the phone may then open a window) */
    show: function (id, tapped) {
      var site = C.siteById(id);
      /* the iPad app: every site in its own full browser view (like Electron on the PC) */
      /* except the app's own Kemaman water level / rainfall pages: shown in the tab like on the web */
      var own = !isDesktop && site && C.altFor(site, state.settings);
      if (Native.ok && site && tapped && !(own && own.page)) { Native.open(site); return; }
      /* infobanjir Terengganu & met.gov.my only answer from Malaysia (not through the relay): their data on the
         dashboard cards (water level, station rainfall, MET); only a site with no stand-in opens the real site over the app */
      if (!isDesktop && site && tapped && C.malaysiaOnly(site, state.settings) && !C.altFor(site, state.settings)) {
        var mw = null;
        try { mw = window.open(siteUrl(site), '_blank'); } catch (e) { mw = null; }
        if (mw) { try { mw.opener = null; } catch (e2) { /* */ } return; }
      }
      /* iPad / phone without a relay: a site that refuses to be framed opens at once in the app's own browser sheet
         (iOS: over the app, with "Done" to come back); its tab keeps a card with the same button */
      if (!isDesktop && site && C.siteBlocked(site, (state.snap && state.snap.sites || {})[id]) && !C.relayFor(site, state.settings)) {
        var alt = C.altFor(site, state.settings);
        if (alt && alt.kind === 'view') {
          /* e.g. Met Malaysia: the app's own MET forecast & warnings (official MET data) */
          show(alt.view);
          var card = $(alt.anchor);
          if (!card || !card.offsetParent) card = $('cardWarn');
          if (card) setTimeout(function () { card.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' }); card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 1600); }, 60);
          toast(L('Laman ganti: ') + L(alt.title), '');
          return;
        }
        if (!alt && tapped) {
          /* no stand-in: straight to the site (iPhone / iPad home-screen app: a sheet over the app with "Done"); the card only if the window was blocked */
          var w = null;
          try { w = window.open(siteUrl(site), '_blank'); } catch (e) { w = null; }
          if (w) { try { w.opener = null; } catch (e2) { /* */ } return; }
        }
      }
      this.activate(id); show('site');
    },
    close: function (id, quiet) {
      var fr = this.frames[id];
      if (fr) { fr.destroy(); delete this.frames[id]; }
      var i = this.open.indexOf(id); if (i >= 0) this.open.splice(i, 1);
      save('mc_open', this.open);
      if (this.current === id) {
        this.current = null;
        if (!quiet) { if (this.open.length) this.activate(this.open[this.open.length - 1]); else show('dashboard'); }
      }
      if (!quiet) { this.tabs(); renderSide(); }
    },
    /* "Tutup semua", as in OIM Wazira: every open site is closed and the dashboard comes back */
    closeAll: function () {
      var n = this.open.length;
      Object.keys(this.frames).forEach(function (k) { Sites.frames[k].destroy(); });
      this.frames = {}; this.open = []; this.current = null;
      save('mc_open', this.open);
      this.tabs(); renderSide();
      if (state.view === 'site') show('dashboard');
      if (n) toast(L('Semua laman ditutup'), n + L(' laman'), null, 2500);
    },
    /* the profile moved: sites that follow the profile's location go to the new place */
    relocate: function () {
      Object.keys(this.frames).forEach(function (k) { var fr = Sites.frames[k], u = siteUrl(fr.site); if (fr.site.profile && u !== fr.baseUrl) fr.goto(u); });
      Wall.frames.forEach(function (fr) { var u = siteUrl(fr.site); if (fr.site.profile && u !== fr.baseUrl) fr.goto(u); });
      if (state.view === 'site') this.bar();
    },
    tabs: function () {
      $('siteTabs').innerHTML = this.open.map(function (id) {
        var s = C.siteById(id);
        return '<span class="stab" role="tab" data-tab="' + id + '" aria-current="' + (id === Sites.current) + '"><span class="e">' + s.icon + '</span>' + esc(s.title) +
          '<button class="x" data-close="' + id + '" title="Tutup (Ctrl+W)">×</button></span>';
      }).join('');
      $('closeAllBtn').disabled = !this.open.length;
      $('closeAllBtn').textContent = this.open.length > 1 ? L('Tutup semua (') + this.open.length + ')' : L('Tutup semua');
    },
    bar: function () {
      var fr = this.frames[this.current];
      if (!fr) return;
      $('sUrl').textContent = (fr.url || fr.site.url).replace(/^https?:\/\//, '');
      $('sDot').className = 'dot ' + (fr.loading ? 'warn' : 'ok');
      $('sAuto').value = String(this.auto[fr.id] || 0);
      var fi = freshInfo(fr), chip = $('sFresh');
      chip.hidden = !fi;
      if (fi) { chip.className = 'fresh ' + (fi.old ? 'old' : 'ok'); chip.textContent = fi.text; chip.title = fi.tip; }
      $('sNote').hidden = !fr.site.note;
      $('sNote').textContent = fr.site.note ? L(fr.site.note) : '';
      Shield.show(fr);
      setTitle();
    },
    cur: function () { return this.frames[this.current]; },
    tick: function () {
      var now = Date.now();
      Object.keys(Sites.frames).forEach(function (id) {
        var min = Sites.auto[id], fr = Sites.frames[id];
        if (min && !fr.loading && now - fr.lastLoad >= min * 60000) fr.reload();
      });
    }
  };
  setInterval(Sites.tick, 15000);

  /* ------------------------------------------------------------------ wall */
  var WALL_N = { '1x2': 2, '2x2': 4, '1+2': 3, '2x3': 6 };
  var Wall = {
    cfg: load('mc_wall', { layout: '2x2', auto: 10, panes: window.EDITION && window.EDITION.kind === 'offshore' ? ['windywave', 'windywind', 'vesselfinder', 'metradar', 'nullschool', 'zoomearth'] : ['waterlevel', 'rainviewer', 'camera', 'windy', 'floodhub', 'tideschart'] }),
    frames: [], built: '',
    render: function () {
      var cfg = this.cfg, n = WALL_N[cfg.layout] || 4, key = cfg.layout + '|' + cfg.panes.slice(0, n).join(',');
      $('wLayout').value = cfg.layout; $('wAuto').value = String(cfg.auto || 0);
      if (key === this.built) return;
      this.built = key;
      var wall = $('wall');
      this.frames.forEach(function (fr) { fr && fr.destroy(); });
      this.frames = [];
      wall.setAttribute('data-l', cfg.layout);
      wall.innerHTML = '';
      var opts = C.SITES.map(function (s) { return '<option value="' + s.id + '">' + s.icon + ' ' + esc(L(s.title)) + '</option>'; }).join('');
      for (var i = 0; i < n; i++) {
        var id = cfg.panes[i] || C.SITES[i].id;
        var pane = document.createElement('div');
        pane.className = 'pane';
        pane.innerHTML = '<div class="pane-h"><select class="sel sm" data-pane="' + i + '">' + opts + '</select><span class="fresh old pfresh" hidden></span>' +
          '<button class="ibtn" data-preload="' + i + '" title="Muat semula"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></button>' +
          '<button class="ibtn" data-pmax="' + i + '" title="Buka besar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button></div><div class="shost"></div>';
        wall.appendChild(pane);
        pane.querySelector('select').value = id;
        var fr = makeFrame(C.siteById(id), pane.querySelector('.shost'), (function (p) {
          return function (f) {
            var fi = freshInfo(f), c = p.querySelector('.pfresh');
            c.hidden = !(fi && fi.old);
            if (fi && fi.old) { c.textContent = '⚠ ' + C.fmtDate(f.fresh.at).replace(/^\S+ /, '') + ' ' + C.myt(f.fresh.at).y; c.title = fi.text; }
          };
        })(pane));
        fr.el.classList.add('on');
        this.frames.push(fr);
      }
    },
    setPane: function (i, id) { this.cfg.panes[i] = id; save('mc_wall', this.cfg); this.built = ''; this.render(); },
    tick: function () {
      var min = Wall.cfg.auto;
      if (!min || state.view !== 'wall') return;
      Wall.frames.forEach(function (fr) { if (fr && !fr.loading && Date.now() - fr.lastLoad >= min * 60000) fr.reload(); });
    }
  };
  setInterval(Wall.tick, 20000);

  /* ------------------------------------------------------------- dashboard */
  var STATUS_ICON = { normal: '✓', alert: '!', warning: '!!', danger: '▲', unknown: '?' };
  function chip(status) { return '<span class="chip st-' + status + '"><i>' + STATUS_ICON[status] + '</i>' + C.statusName(status) + '</span>'; }
  function trendHtml(t) { return t === 'rising' ? '<span class="tr-rising" title="Naik">▲</span>' : t === 'falling' ? '<span class="tr-falling" title="Turun">▼</span>' : t === 'steady' ? '<span class="tr-steady" title="Tiada perubahan">▬</span>' : ''; }
  function gauge(st) {
    var top = st.danger || st.warning || st.alert;
    if (!top || st.level === null) return '';
    var base = Math.min(st.normal !== null && st.normal !== undefined ? st.normal : st.level, st.level, top) * 0.9, max = top * 1.08;
    var pct = function (v) { return Math.max(0, Math.min(100, (v - base) / (max - base) * 100)); };
    var col = { normal: 'var(--st-normal)', alert: 'var(--st-alert)', warning: 'var(--st-warning)', danger: 'var(--st-danger)', unknown: 'var(--st-unknown)' }[st.status];
    return '<div class="gauge" title="Paras berbanding ambang"><div class="f" style="width:' + pct(st.level) + '%;background:' + col + '"></div>' +
      (st.alert ? '<div class="m a" style="left:' + pct(st.alert) + '%"></div>' : '') + (st.warning ? '<div class="m w" style="left:' + pct(st.warning) + '%"></div>' : '') +
      (st.danger ? '<div class="m d" style="left:' + pct(st.danger) + '%"></div>' : '') + '</div>';
  }
  function activeAlerts() {
    var a = (state.snap && state.snap.alerts) || {};
    return (a.active || []).map(function (x) { return Object.assign({}, x, { acked: !!(a.acked || {})[x.key] }); });
  }
  function metEmoji(t) {
    t = String(t || '').toLowerCase();
    if (/ribut petir/.test(t)) return '⛈️'; if (/hujan menyeluruh|hujan lebat/.test(t)) return '🌧️'; if (/tiada hujan/.test(t)) return '🌤️';
    if (/hujan/.test(t)) return '🌦️'; if (/berangin/.test(t)) return '🌬️'; if (/kabus|jerebu/.test(t)) return '🌫️'; return '⛅';
  }
  var LV_ICON = { critical: '🚨', warning: '⚠️', info: 'ℹ️' };
  /* ---- MET warning card: tiles, "your areas", then the full MET text (folded) */
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var PROPER = ['Malaysia', 'Malaysian', 'MET', 'Sabah', 'Sarawak', 'Labuan', 'Semenanjung'];
  function sentence(s, extra) {
    s = String(s || '').trim();
    if (!s || /[a-z]/.test(s)) return s;
    var t = s.toLowerCase().replace(/\[/g, '(').replace(/\]/g, ')');
    t = t.charAt(0).toUpperCase() + t.slice(1);
    PROPER.concat(extra || []).forEach(function (w) { if (w) t = t.replace(new RegExp('\\b' + escRe(w.toLowerCase()) + '\\b', 'g'), w); });
    return t;
  }
  function secTitle(s, keys) {
    var m = /^(SECTION|SEKSYEN|BAHAGIAN)\s+([A-Z])\s*:\s*(.*)$/i.exec(String(s || ''));
    if (!m) return sentence(s, keys);
    var head = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2].toUpperCase();
    return head + (m[3] ? ' · ' + sentence(m[3], keys) : '');
  }
  /* bold the times & numbers MET wrote, colour the user's areas; everything else stays as MET wrote it */
  function metMark(text, phrases, keys) {
    var marks = [];
    (phrases || []).forEach(function (p) { if (p) marks.push({ s: p, c: 'mb' }); });
    (keys || []).forEach(function (k) { if (k) marks.push({ s: k, c: 'me' }); });
    if (!marks.length) return esc(text);
    marks.sort(function (a, b) { return b.s.length - a.s.length; });
    var cls = {};
    marks.forEach(function (m) { if (!cls[m.s.toLowerCase()]) cls[m.s.toLowerCase()] = m.c; });
    var re = new RegExp(marks.map(function (m) { return (/^\w/.test(m.s) ? '\\b' : '') + escRe(m.s) + (/\w$/.test(m.s) ? '\\b' : ''); }).join('|'), 'gi');
    var out = '', last = 0, mm;
    text = String(text || '');
    while ((mm = re.exec(text))) {
      out += esc(text.slice(last, mm.index)) + '<span class="' + (cls[mm[0].toLowerCase()] || 'mb') + '">' + esc(mm[0]) + '</span>';
      last = mm.index + mm[0].length;
      if (!mm[0].length) re.lastIndex++;
    }
    return out + esc(text.slice(last));
  }
  var MET_ICON = { thunder: '⛈️', wind: '🌊', rain: '🌧️', cyclone: '🌀', other: '⚠️' };
  function hazardPill(it, now) {
    if (it.type === 'thunder') return '<span class="mpill thunder">' + L('Ribut petir') + '</span><span class="mwhen">' + (it.until ? L('sehingga {t}', { t: C.metWhen(it.until, now) }) : '') + '</span>';
    if (it.type === 'wind') {
      var bits = [];
      if (it.wind) bits.push(L('Angin {w}', { w: (it.wind[0] ? it.wind[0] + '–' : '') + it.wind[1] + ' ' + L('km/j') }));
      if (it.wave !== null) bits.push(L('ombak {v} m', { v: it.wave }));
      return '<span class="mpill wind">' + (bits.join(' · ') || esc(sentence(it.label))) + '</span><span class="mwhen">' + esc(it.from || it.to ? C.metRange(it.from, it.to) : it.until ? L('sehingga {t}', { t: C.metWhen(it.until, now) }) : '') + '</span>';
    }
    return '<span class="mpill other">' + esc(sentence(it.label) || L('Amaran')) + '</span><span class="mwhen">' + esc(it.until ? L('sehingga {t}', { t: C.metWhen(it.until, now) }) : it.from || it.to ? C.metRange(it.from, it.to) : '') + '</span>';
  }
  function metCard(x) {
    var now = Date.now(), keys = String(state.settings.warningKeywords || '').split(/[,;]/).map(function (k) { return k.trim(); }).filter(Boolean);
    var p = C.parseMetText(metField(x, 'heading'), metField(x, 'text'));
    var sm = C.metSummary(p, state.settings.warningKeywords);
    var instr = metField(x, 'instruction');
    if (instr && I18N.lang() === 'en' && I18N.has(instr)) instr = L(instr);
    var from = x.from ? { ms: x.from, hasTime: true } : sm.from, to = x.to ? { ms: x.to, hasTime: true } : sm.to;

    var tiles = [];
    if (sm.wind) tiles.push('<div class="mtile"><div class="k">💨 ' + L('Angin') + '</div><div class="v">' + (sm.wind[0] ? sm.wind[0] + '–' : '') + sm.wind[1] + '<small>' + L('km/j') + '</small></div><div class="s">' +
      (sm.wind[0] ? Math.round(C.kt(sm.wind[0])) + '–' : '') + Math.round(C.kt(sm.wind[1])) + ' ' + L('knot') + (sm.dir ? ' · ' + esc(sm.dir) : '') + '</div></div>');
    if (sm.wave !== null) tiles.push('<div class="mtile"><div class="k">🌊 ' + L('Ombak') + '</div><div class="v">' + sm.wave + '<small>m</small></div><div class="s">' + L('sehingga · laut bergelora') + '</div></div>');
    if (sm.thunderUntil) tiles.push('<div class="mtile"><div class="k">⛈️ ' + L('Ribut petir') + '</div><div class="v sm">' + L('Hingga {t}', { t: C.fmtTime(sm.thunderUntil.ms) }) + '</div><div class="s">' +
      esc(C.dateKey(sm.thunderUntil.ms) === C.dateKey(now) ? L('hari ini') : C.fmtDate(sm.thunderUntil.ms)) + '</div></div>');
    if (from || to) tiles.push('<div class="mtile"><div class="k">📅 ' + L('Sah') + '</div><div class="v sm">' + esc(C.metRange(from, to)) + '</div><div class="s">' + (to ? L('hingga {t}', { t: C.fmtTime(to.ms) }) : '') + '</div></div>');

    var rows = sm.mine.map(function (m) {
      return '<div class="mrow"><b>' + esc(m.area) + '</b><div>' + m.hits.map(function (h) {
        return '<div class="mhit">' + hazardPill(h.item, now) + (h.note ? '<span class="mnote">' + esc(h.note) + '</span>' : '') + '</div>';
      }).join('') + '</div></div>';
    }).join('');
    if (sm.others.length) rows += '<div class="mrow other"><span>' + L('Kawasan lain') + '</span><div>' + esc(sm.others.slice(0, 8).join(', ')) + (sm.others.length > 8 ? ' +' + (sm.others.length - 8) : '') + '</div></div>';

    var full = (p.intro ? '<p class="mintro">' + esc(sentence(p.intro, keys)) + '</p>' : '') + p.sections.map(function (sec) {
      return (sec.title ? '<div class="msec">' + esc(secTitle(sec.title, keys)) + '</div>' : '') + sec.items.map(function (it) {
        return '<p>' + (it.n ? '<span class="mlab">' + it.n + ') ' + esc(sentence(it.label)) + (it.label ? '.' : '') + '</span> ' : it.label ? '<span class="mlab">' + esc(sentence(it.label)) + '.</span> ' : '') +
          metMark(it.body, it.phrases, keys) + '</p>';
      }).join('');
    }).join('') + (instr ? '<p class="minstr">⚠ ' + esc(instr) + '</p>' : '');

    /* a plain warning (e.g. "Continuous rain: Terengganu: Besut, ...") has nothing to sum up: show its text as it is */
    var summarised = !!(sm.wind || sm.wave !== null || sm.thunderUntil || sm.items.some(function (i) { return i.areas.length; }));
    if (!summarised) { tiles = []; rows = ''; }
    var plain = (p.intro ? '<p class="mintro">' + esc(sentence(p.intro, keys)) + '</p>' : '') + sm.items.map(function (it) { return '<p>' + metMark(it.body, it.phrases, keys) + '</p>'; }).join('') + (instr ? '<p class="minstr">⚠ ' + esc(instr) + '</p>' : '');
    return '<div class="mcard lv-' + x.severity + '">' +
      '<div class="mhead"><span class="mic">' + (MET_ICON[C.metType(x.title_en + ' ' + x.title_bm)] || '⚠️') + '</span><div><b>' + esc(sentence(metField(x, 'title'))) + '</b><small>' +
      (p.intro && summarised ? esc(sentence(p.intro, keys)) + ' · ' : '') + L('Dikeluarkan ') + esc(C.fmtDateTime(x.issued)) + '</small></div></div>' +
      (tiles.length ? '<div class="mtiles n' + tiles.length + '">' + tiles.join('') + '</div>' : '') +
      (rows ? '<div class="mareas">' + rows + '</div>' : '') +
      (summarised ? '<details class="mfull"><summary><span class="sh">' + L('Tunjuk teks penuh') + '</span><span class="hd">' + L('Sorok teks penuh') + '</span></summary><div class="mtext">' + full + '</div></details>'
        : '<div class="mtext">' + plain + '</div>') +
      '<div class="msrc">' + L('Sumber: MET Malaysia (data.gov.my)') + (to ? L(' · sah hingga ') + esc(C.fmtDateTime(to.ms)) : '') + '</div></div>';
  }

  /* MET warnings come in BM and English: show the one that matches the language (fall back to the other) */
  function metField(w, k) { var en = w[k + '_en'], bm = w[k + '_bm']; return I18N.lang() === 'ms' ? (bm || en || '') : (en || bm || ''); }

  /* offshore: wave & gust charts + 24 h table every 3 hours */
  function renderOffshore(s) {
    var w = s.weather, m = s.marine, h0 = Math.floor(Date.now() / 3600000) * 3600000, st = state.settings;
    $('offSub').textContent = L('titik {p}', { p: f(st.marineLat, 3) + ', ' + f(st.marineLon, 3) }) + ' · model Open-Meteo';
    if (m && m.hourly) CH.line($('chartWave'), { points: m.hourly.filter(function (h) { return h.t >= h0 - 6 * 3600000 && h.t <= h0 + 48 * 3600000; }).map(function (h) { return { t: h.t, v: h.wave }; }),
      unit: 'm', height: 180, area: true, decimals: 1, label: L('Tinggi ombak'), thresholds: [{ v: st.waveM, label: L('Ambang'), cls: 'warning' }] });
    else $('chartWave').innerHTML = '<div class="empty">Tiada data ombak</div>';
    if (w && w.hourly) CH.line($('chartGust'), { points: w.hourly.filter(function (h) { return h.t >= h0 - 6 * 3600000 && h.t <= h0 + 48 * 3600000; }).map(function (h) { return { t: h.t, v: C.kt(h.gust) }; }),
      unit: 'knot', height: 180, decimals: 0, label: L('Tiupan angin'), thresholds: [{ v: C.kt(st.gustKmh), label: L('Ambang'), cls: 'warning' }] });
    else $('chartGust').innerHTML = '<div class="empty">Tiada data angin</div>';
    var byT = {};
    ((m && m.hourly) || []).forEach(function (h) { byT[h.t] = h; });
    /* each row covers 3 hours and shows the worst value inside them, so a short peak is never skipped */
    var hrs = ((w && w.hourly) || []).filter(function (h) { return h.t >= h0 && h.t < h0 + 27 * 3600000; });
    var rows = [];
    for (var k = 0; k < hrs.length; k += 3) {
      var win = hrs.slice(k, k + 3), r = Object.assign({}, win[0]);
      var mx = function (arr, key) { var v = null; arr.forEach(function (x) { if (x && x[key] !== null && x[key] !== undefined && (v === null || x[key] > v)) v = x[key]; }); return v; };
      var mn = function (arr, key) { var v = null; arr.forEach(function (x) { if (x && x[key] !== null && x[key] !== undefined && (v === null || x[key] < v)) v = x[key]; }); return v; };
      var mwin = win.map(function (x) { return byT[x.t]; });
      r.gust = mx(win, 'gust'); r.wind = mx(win, 'wind'); r.vis = mn(win, 'vis'); r.cape = mx(win, 'cape'); r.pp = mx(win, 'pp'); r.code = mx(win, 'code');
      r.m = { wave: mx(mwin, 'wave'), swell: mx(mwin, 'swell'), swellPeriod: (byT[win[0].t] || {}).swellPeriod };
      rows.push(r);
    }
    var hi = function (v, lim, cls) { return v !== null && v !== undefined && lim && v >= lim ? ' class="num hi"' : ' class="num' + (cls ? ' ' + cls : '') + '"'; };
    $('offTable').innerHTML = rows.length ? '<table class="tbl otbl"><caption class="muted" style="caption-side:bottom;text-align:left;font-size:11px;padding-top:6px">Setiap baris = nilai paling teruk dalam 3 jam itu (angin & ombak tertinggi, penglihatan terendah).</caption><thead><tr><th>Masa</th><th></th><th class="num">Angin (knot)</th><th class="num">Tiupan</th><th class="num">Ombak (m)</th><th class="num">Alun (m / s)</th><th class="num">Penglihatan</th><th>Ribut petir</th></tr></thead><tbody>' +
      rows.map(function (h, i) {
        var mh = h.m || {}, wc2 = C.wmo(h.code), th = h.code !== null && h.code >= 95 ? 'tinggi' : (h.cape || 0) >= 1000 && (h.pp || 0) >= 50 ? 'sederhana' : 'rendah';
        return '<tr><td' + (i === 0 ? ' class="now"' : '') + '>' + C.fmtTime(h.t) + '–' + C.fmtTime(h.t + 3 * 3600000) + (C.dateKey(h.t) !== C.dateKey(Date.now()) ? ' <span class="muted">' + C.fmtDate(h.t).split(' ')[0] + '</span>' : '') + '</td>' +
          '<td class="th-ic" title="' + esc(wc2.text) + '">' + wc2.icon + '</td>' +
          '<td class="num">' + f(C.kt(h.wind), 0) + ' ' + C.compass(h.dir) + '</td><td' + hi(h.gust, st.gustKmh) + '>' + f(C.kt(h.gust), 0) + '</td>' +
          '<td' + hi(mh.wave, st.waveM) + '>' + f(mh.wave) + '</td><td class="num">' + f(mh.swell) + ' / ' + f(mh.swellPeriod, 0) + '</td>' +
          '<td' + (h.vis !== null && h.vis !== undefined && st.visKm && h.vis < st.visKm ? ' class="num hi"' : ' class="num"') + '>' + f(h.vis) + ' km</td>' +
          '<td><span class="riskchip risk-' + th + '">' + L(th) + '</span></td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">Tiada ramalan.</div>';
  }

  /* ------------------------------------------ offshore model comparison (like a metocean report)
     several free models side by side (offshore.js): middle value + spread, % chance over the limits, confidence; PDF */
  var OC_DAYS = [3, 7, 14];
  var Off = {
    raw: null, rep: null, repKey: '', busy: false, err: '', errAt: 0,
    days: OC_DAYS.indexOf(load('mc_oc_days', 3)) >= 0 ? load('mc_oc_days', 3) : 3,
    open: load('mc_oc_open', {}),
    key: function (lat, lon) { return (+lat).toFixed(3) + ',' + (+lon).toFixed(3); },
    mine: function () {
      var s = state.settings;
      if (!this.raw) { var c = load('mc_oc_raw', null); if (c && c.v === 1) this.raw = c; }
      return this.raw && this.raw.key === this.key(s.marineLat, s.marineLon) ? this.raw : null;
    },
    load: function (force) {
      var s = state.settings;
      if (s.kind !== 'offshore' || !window.MCOffshore) return Promise.resolve();
      if (this.busy) return this.busy;
      var mine = this.mine();
      if (!force && mine && Date.now() - mine.at < (state.mode === 'pc' ? 3 * 60000 : OM.every())) return Promise.resolve();
      if (!force && this.err && Date.now() - this.errAt < 5 * 60000) return Promise.resolve();
      var get = function (u) { return fetchT(u, 45000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); };
      var p = state.mode === 'pc' ? get('/api/offshore' + (force ? '?force=1' : '')) : window.MCOffshore.collect(s.marineLat, s.marineLon, function (u) { return OM.json(u, 45000); });
      this.busy = p.then(function (raw) {
        var ok = 0;
        ['wind', 'wave', 'ens'].forEach(function (g) { Object.keys(raw[g] || {}).forEach(function (k) { if (raw[g][k].ok) ok++; }); });
        if (!ok) throw new Error(L('Tiada model menjawab'));
        raw.key = Off.key(raw.lat, raw.lon);
        Off.raw = raw; Off.rep = null; Off.err = '';
        save('mc_oc_raw', raw);
      }).catch(function (e) { Off.err = (e && e.message) || String(e); Off.errAt = Date.now(); })
        .then(function () { Off.busy = false; renderOffCmp(); try { renderRiskCard(); } catch (e) { /* */ } if (EXT.dash) try { EXT.dash(); } catch (e) { console.error(e); } });
      renderOffCmp();
      return this.busy;
    },
    report: function () {
      var raw = this.mine(), s = state.settings;
      if (!raw || !window.MCOffshore) return null;
      var k = raw.at + '|' + s.offWindKt + '|' + s.offWaveM + '|' + Math.floor(Date.now() / 600000) + '|' + I18N.lang();
      if (!this.rep || this.repKey !== k) { this.repKey = k; this.rep = window.MCOffshore.build(raw, { now: Date.now(), windKt: s.offWindKt, waveM: s.offWaveM }); }
      return this.rep;
    },
    pdf: function () {
      var rep = Off.report();
      if (!rep) { toast(L('Belum ada data untuk PDF'), Off.busy ? L('Membaca model…') : '', 'warning'); return; }
      var root = $('printRoot');
      if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.appendChild(root); }
      root.innerHTML = '<div class="rpt">' + ocHtml(rep, Off.days, true) + '</div>';
      var html = document.documentElement;
      html.classList.add('printing');
      ocCharts(rep, Off.days, root);
      var name = window.MCOffshore.fileName(state.settings.locationName, rep.at), title = document.title;
      document.title = name;
      var done = function () { html.classList.remove('printing'); document.title = title; };
      if (D && D.savePdf) {
        D.savePdf(name).then(function (r) { if (r && r.ok) toast(L('PDF disimpan'), r.path || ''); }, function (e) { toast(L('Gagal simpan PDF'), (e && e.message) || '', 'warning'); }).then(done);
        return;
      }
      if (Native.pdfOk) { window.dcPdfDone = function () { window.dcPdfDone = null; done(); }; Native.pdf(name); return; }
      window.addEventListener('afterprint', function h() { window.removeEventListener('afterprint', h); done(); });
      window.print();
    }
  };
  /* A4 PDF of HTML from one of the app's own pages in a tab (Kemaman water level / rainfall): the same print path as the offshore report
     (iPad app: its PDF + share sheet; PC: save dialog; browser: print) */
  function printHtml(html, name, css) {
    var root = $('printRoot');
    if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.appendChild(root); }
    var link = null, title = document.title, htmlEl = document.documentElement;
    var done = function () { htmlEl.classList.remove('printing'); document.title = title; root.innerHTML = ''; if (link) link.remove(); };
    var go = function () {
      root.innerHTML = '<div class="rpt km-print">' + html + '</div>';
      htmlEl.classList.add('printing'); document.title = name;
      if (D && D.savePdf) { D.savePdf(name).then(function (r) { if (r && r.ok) toast(L('PDF disimpan'), r.path || ''); }, function (e) { toast(L('Gagal simpan PDF'), (e && e.message) || '', 'warning'); }).then(done); return; }
      if (Native.pdfOk) { window.dcPdfDone = function () { window.dcPdfDone = null; done(); }; Native.pdf(name); return; }
      window.addEventListener('afterprint', function h() { window.removeEventListener('afterprint', h); done(); });
      window.print();
    };
    if (css && !document.querySelector('link[data-print="' + css + '"]')) {
      link = document.createElement('link'); link.rel = 'stylesheet'; link.href = css; link.setAttribute('data-print', css);
      link.onload = go; link.onerror = go; document.head.appendChild(link);
    } else go();
  }
  var OC_RISK = { high: 'tinggi', medium: 'sederhana', low: 'rendah' };
  function ocPct(p) { return p ? '<span class="' + (p.p >= 0.5 ? 'hot' : '') + '">' + Math.round(p.p * 100) + '%</span>' : '-'; }
  var LV5 = ['🟢', '🟡', '🟠', '🔴', '🟣'];   /* Sangat rendah · Rendah · Sederhana · Tinggi · Sangat tinggi */
  function ocConf(c) { return c && c.level ? '<span class="oc-conf c' + c.level + '">' + ['', '●○○', '●●○', '●●●'][c.level] + ' ' + esc(c.label) + '</span>' : '-'; }
  function ocHtml(rep, n, pdf) {
    var s = state.settings, O = window.MCOffshore, D = rep.days.slice(0, n), kt = rep.windKt, hm = rep.waveM;
    var runs = 0; D.forEach(function (x) { if (x.ens && x.ens.n > runs) runs = x.ens.n; });
    var en = I18N.lang() === 'en', met = (((state.snap && state.snap.met) || {}).warnings || []);
    var issue = C.fmtDate(rep.at) + ', ' + C.fmtTime(rep.at) + ' LT';
    var li = function (t) { return '<li>' + esc(t) + '</li>'; };
    var h = '';
    if (pdf) h += '<div class="r-head"><div><h1>' + esc(String(s.locationName).replace(/\s*\(.*?\)\s*/g, ' ').trim()) + ' — ' + esc(C.fmtDate(rep.at)) + ' (' + C.fmtTime(rep.at) + L(' LT keluaran') + ')</h1></div>' +
      '<div class="r-brand"><b>' + esc(APPNAME) + '</b><small>' + L('Ramalan automatik daripada beberapa model percuma') + '</small></div></div>';
    h += '<div class="oc-meta">' +
      '<div><span>' + L('Lokasi') + '</span><b>' + f(Math.abs(rep.lat), 2) + (rep.lat >= 0 ? 'N' : 'S') + ', ' + f(Math.abs(rep.lon), 2) + (rep.lon >= 0 ? 'E' : 'W') + '</b></div>' +
      '<div><span>' + L('Dikeluarkan') + '</span><b>' + esc(issue) + '</b></div>' +
      '<div><span>' + L('Tempoh') + '</span><b>' + L('{n} hari', { n: n }) + '</b></div>' +
      '<div><span>' + L('Model') + '</span><b>' + L('{w} angin · {v} ombak · {e} larian ensemble', { w: rep.ok.wind.length, v: rep.ok.wave.length, e: runs }) + '</b></div>' +
      '<div><span>' + L('Had') + '</span><b>' + kt + ' kt · Hs ' + hm + ' m</b></div></div>';
    /* warning, next 24 h */
    var w = rep.warn, metHtml = met.length ? met.map(function (x) {
      return '<div class="oc-met">⚠️ <b>' + esc(en ? x.title_en || x.title_bm : x.title_bm || x.title_en) + '</b> ' + esc(en ? x.heading_en || x.heading_bm : x.heading_bm || x.heading_en) +
        (x.to ? ' <small class="muted">' + L('hingga ') + esc(C.fmtDate(x.to) + ' ' + C.fmtTime(x.to)) + '</small>' : '') + '</div>';
    }).join('') : '<div class="muted oc-met">' + L('MET Malaysia: tiada amaran untuk kawasan ini.') + '</div>';
    h += '<div class="oc-sec oc-warnbox"><h4>' + L('Amaran (24 jam)') + '</h4><ul>' + w.lines.map(li).join('') + '</ul>' +
      '<div>' + L('Peluang kilat:') + ' <span class="riskchip risk-' + (OC_RISK[w.lightning] || 'rendah') + '">' + esc(w.lightningText) + '</span>' +
      (w.cape !== null ? ' <small class="muted">CAPE ' + f(w.cape, 0) + ' J/kg</small>' : '') + '</div>' + metHtml + '</div>';
    /* summary */
    var sm = rep.summary;
    h += '<div class="oc-sec"><h4>' + L('Ringkasan (dijana daripada model)') + '</h4>' +
      '<p>' + esc([sm.wind, sm.sea, sm.swell].filter(Boolean).join(' ')) + '</p>' +
      '<p>' + esc([sm.weather, sm.season].filter(Boolean).join(' ')) + '</p>' +
      '<ul class="oc-ol">' + O.outlook(rep, n).map(li).join('') + '</ul></div>';
    /* day by day */
    var daysH = '<div class="oc-sec"><h4>' + L('Setiap hari: nilai tengah model (julat), peluang & keyakinan') + '</h4><div class="oc-scroll"><table class="tbl oc-days"><thead><tr><th>' + L('Hari') + '</th><th>' + L('Arah') + '</th>' +
      '<th class="num">' + L('Angin maks (knot)') + '</th><th class="num">' + L('Peluang ≥{k} kt', { k: kt }) + '</th><th class="num">' + L('Hs maks (m)') + '</th><th class="num">' + L('Ombak maks (m)') + '</th>' +
      '<th class="num">' + L('Peluang ≥{m} m', { m: hm }) + '</th><th class="num">' + L('Hujan (mm)') + '</th><th>' + L('Keyakinan') + '</th></tr></thead><tbody>' +
      D.map(function (x) {
        return '<tr><td><b>' + esc(O.shortDay(x.date)) + '</b></td><td>' + arrow(x.dir) + O.compass16(x.dir) + '</td>' +
          '<td class="num"><span class="' + (x.wind.m !== null && x.wind.m >= kt ? 'hot' : '') + '">' + f(x.wind.m, 0) + '</span> <small>(' + f(x.wind.lo, 0) + '–' + f(x.wind.hi, 0) + ')</small></td>' +
          '<td class="num">' + ocPct(x.probWind) + '</td>' +
          '<td class="num"><span class="' + (x.hs.m !== null && x.hs.m >= hm ? 'hot' : '') + '">' + f(x.hs.m, 1) + '</span> <small>(' + f(x.hs.lo, 1) + '–' + f(x.hs.hi, 1) + ')</small></td>' +
          '<td class="num">' + f(x.hmax, 1) + '</td><td class="num">' + ocPct(x.probWave) + '</td>' +
          '<td class="num">' + f(x.rain, 1) + (x.thunder !== null && x.thunder >= 0.34 ? ' ⚡' : '') + '</td><td>' + ocConf(x.conf) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="note">' + L('Peluang angin = bahagian larian ensemble (ECMWF 51 + NOAA GEFS 31; selepas hari ke-10 ECMWF sahaja) yang angin maks hariannya melebihi had. Peluang ombak = bahagian model ombak yang melebihi had. ⚡ = ribut petir dalam sekurang-kurangnya 1/3 model.') + '</p></div>';
    /* charts */
    var chartsH = '<div class="oc-sec r-keep"><h4>' + L('Carta angin (knot)') + '</h4><div class="oc-arrows oc-a-wind"></div><div class="chartbox oc-wind"></div></div>' +
      '<div class="oc-sec r-keep"><h4>' + L('Carta ombak (m)') + '</h4><div class="chartbox oc-wave"></div></div>';
    /* every model, daily max */
    var cols = D.map(function (x) { return '<th class="num">' + esc(O.shortDay(x.date)) + '</th>'; }).join('');
    var cell = function (v, thr, d) { return '<td class="num' + (v !== null && v !== undefined && v >= thr ? ' hot' : '') + '">' + f(v, d) + '</td>'; };
    var mat = '<div class="oc-scroll"><table class="tbl oc-mat"><thead><tr><th>' + L('Angin maks 10m (knot)') + '</th>' + cols + '</tr></thead><tbody>' +
      O.WIND.map(function (m) { return '<tr><td>' + esc(m.name) + '</td>' + D.map(function (x) { return cell(x.windBy[m.id], kt, 0); }).join('') + '</tr>'; }).join('') +
      '<tr class="ens"><td>' + L('Ensemble 10–90%') + '</td>' + D.map(function (x) { return '<td class="num">' + (x.ens ? f(x.ens.p10, 0) + '–' + f(x.ens.p90, 0) : '-') + '</td>'; }).join('') + '</tr>' +
      '<tr class="ens"><td>' + L('Peluang ≥{k} kt', { k: kt }) + '</td>' + D.map(function (x) { return '<td class="num">' + ocPct(x.probWind) + '</td>'; }).join('') + '</tr>' +
      '</tbody></table></div><div class="oc-scroll"><table class="tbl oc-mat"><thead><tr><th>' + L('Hs maks (m)') + '</th>' + cols + '</tr></thead><tbody>' +
      O.WAVE.map(function (m) { return '<tr><td>' + esc(m.name) + '</td>' + D.map(function (x) { return cell(x.hsBy[m.id], hm, 1); }).join('') + '</tr>'; }).join('') +
      '<tr class="ens"><td>' + L('Keyakinan') + '</td>' + D.map(function (x) { return '<td class="num">' + (x.conf.level ? ['', '●○○', '●●○', '●●●'][x.conf.level] : '-') + '</td>'; }).join('') + '</tr>' +
      '</tbody></table></div><p class="note">' + L('Kosong (-) = model itu tidak meramal sejauh itu atau tidak menjawab.') + '</p>';
    /* detailed table */
    var R = O.rows(rep, n), lastDay = '';
    var tbl = '<div class="oc-scroll"><table class="tbl oc-rows"><thead><tr class="grp"><th rowspan="2">' + L('Tarikh / masa') + '</th><th colspan="4">' + L('Angin') + '</th><th colspan="2">' + L('Keseluruhan') + '</th>' +
      '<th colspan="3">' + L('Laut (sea)') + '</th><th colspan="3">' + L('Alun (swell)') + '</th><th>' + L('Suhu') + '</th></tr><tr>' +
      '<th>' + L('Arah') + '</th><th class="num">10m<br><small>kt</small></th><th class="num">80m<br><small>kt</small></th><th class="num">' + L('Tiupan') + '<br><small>kt</small></th>' +
      '<th class="num">Hs<br><small>m</small></th><th class="num">' + L('Maks') + '<br><small>m</small></th><th class="num">Hs<br><small>m</small></th><th class="num">Tp<br><small>s</small></th><th>' + L('Arah') + '</th>' +
      '<th class="num">Hs<br><small>m</small></th><th class="num">Tp<br><small>s</small></th><th>' + L('Arah') + '</th><th class="num">°C</th></tr></thead><tbody>' +
      R.map(function (r) {
        var dk = C.dateKey(r.t), first = dk !== lastDay;
        lastDay = dk;
        return '<tr' + (first ? ' class="dstart"' : '') + '><td>' + (first ? '<b>' + esc(O.shortDay(dk)) + '</b> ' : '') + C.fmtTime(r.t) + '</td>' +
          '<td>' + O.compass16(r.dir) + '</td>' + cell(r.w10.m, kt, 0) + '<td class="num">' + f(r.w80.m, 0) + '</td><td class="num">' + f(r.g.m, 0) + '</td>' +
          cell(r.hs.m, hm, 1) + '<td class="num">' + f(r.hmax, 1) + '</td><td class="num">' + f(r.sh, 1) + '</td><td class="num">' + f(r.st, 0) + '</td><td>' + O.compass16(r.sd) + '</td>' +
          '<td class="num">' + f(r.wh, 1) + '</td><td class="num">' + f(r.wt, 0) + '</td><td>' + O.compass16(r.wd) + '</td><td class="num">' + f(r.temp, 0) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="note">' + L('Setiap 3 jam untuk 2 hari pertama, kemudian 6 jam hingga hari ke-7, kemudian 12 jam. Nilai = nilai tengah semua model.') + '</p>';
    /* sources */
    var grp = { wind: L('angin & cuaca'), wave: L('ombak'), ens: L('ensemble angin') };
    var src = '<ul class="oc-src">' + rep.sources.map(function (x) {
      return '<li class="' + (x.ok ? 'ok' : 'bad') + '">' + (x.ok ? '✓' : '✗') + ' <a href="' + esc(x.link) + '" target="_blank" rel="noopener">' + esc(x.name) + '</a>' + (x.runs ? ' (' + x.runs + L(' larian') + ')' : '') +
        ' <small class="muted">' + esc(x.by) + ' · ' + esc(grp[x.group]) + ' · ' + L('{d} hari', { d: x.days }) + (x.ok ? '' : ' · ' + esc(x.error || L('gagal'))) + '</small></li>';
    }).join('') + '</ul>' +
      '<p class="note">' + L('Data model: Open-Meteo.com (CC BY 4.0), daripada ECMWF, NOAA, DWD, JMA, Météo-France dan Met Office. Amaran rasmi: MET Malaysia (data.gov.my).') + '</p>' +
      '<p class="note">' + L('Kaedah: nilai tengah = median model yang ada pada masa itu; julat = paling rendah hingga paling tinggi. Ombak maks ≈ 1.7 × Hs (anggaran). Keyakinan Tinggi bila model / larian hampir sama, Rendah bila jauh berbeza; hari ke-11 dan seterusnya paling tinggi Sederhana. Squall & kilat dianggar daripada tiupan angin, CAPE dan kod cuaca model.') + '</p>' +
      '<p class="note"><b>' + L('Ramalan automatik ini bukan ramalan rasmi dan bukan pengganti ramalan offshore berbayar. Keadaan sebenar boleh berbeza.') + '</b></p>';
    if (pdf) {
      /* page 1 like the paper reports: warning, summary, wind & wave charts; page 2: days, every model, sources; then the table */
      h += chartsH + '<div class="r-page">' + daysH + '<div class="oc-sec r-keep"><h4>' + L('Perbandingan setiap model (maks harian)') + '</h4>' + mat + '</div>' +
        '<div class="oc-sec r-keep"><h4>' + L('Sumber & kaedah') + '</h4>' + src + '</div></div>' +
        '<div class="r-page"><h4 class="r-bar">' + L('Perincian') + '</h4>' + tbl + '</div>';
    } else {
      h += daysH + chartsH;
      var det = function (k, title, body) { return '<details class="jpsd oc-det" data-k="' + k + '"' + (Off.open[k] ? ' open' : '') + '><summary>' + title + '</summary>' + body + '</details>'; };
      h += det('models', L('Perbandingan setiap model (maks harian)'), mat) + det('table', L('Jadual terperinci (3 jam → 6 jam → 12 jam)'), tbl) + det('src', L('Sumber & kaedah'), src);
    }
    return h;
  }
  /* wind & wave charts (+ the direction arrows above the wind chart) for the chosen days, in the card or the PDF */
  function ocCharts(rep, n, root) {
    var wH = root.querySelector('.oc-wind'), vH = root.querySelector('.oc-wave'), aH = root.querySelector('.oc-a-wind');
    if (!wH || !window.Charts) return;
    var day0 = C.localMs(C.dateKey(Date.now())), end = day0 + n * 86400000;
    /* 3-hourly steps: some wave models only give every 3 hours, and mixing would make a saw-tooth */
    var H = rep.hours.filter(function (h) { return h.t >= rep.now - 3 * 3600000 && h.t <= end && new Date(h.t).getUTCHours() % 3 === 0; });
    var HW = H.filter(function (h) { return h.w10.m !== null; }), HV = H.filter(function (h) { return h.hs.m !== null; });
    if (!HW.length) { wH.innerHTML = '<div class="empty">-</div>'; return; }
    var ticks = []; for (var t = day0; t <= end; t += 86400000) ticks.push(t);
    var common = { ticks: ticks, xFormat: tickDay, tipTime: tipTime, now: Date.now(), yMin: 0 };
    var line = function (list, v, name) { return { name: name, color: '#e0393e', dash: '5 4', unit: '', digits: 1, points: [[list[0].t, v], [list[list.length - 1].t, v]] }; };
    window.Charts.chart(wH, Object.assign({ height: 200, yLabel: 'knot', label: L('Carta angin (knot)'), series: [
      { name: L('Julat model'), kind: 'band', color: '#199e70', unit: 'kt', digits: 0, points: HW.map(function (h) { return [h.t, h.w10.lo, h.w10.hi]; }) },
      { name: L('Angin 10m'), color: '#199e70', unit: 'kt', digits: 0, points: HW.map(function (h) { return [h.t, h.w10.m]; }) },
      { name: L('Angin 80m'), color: '#3987e5', unit: 'kt', digits: 0, points: HW.map(function (h) { return [h.t, h.w80.m]; }) },
      line(HW, rep.windKt, L('Had {k} kt', { k: rep.windKt }))] }, common));
    if (vH && HV.length) window.Charts.chart(vH, Object.assign({ height: 200, yLabel: 'm', label: L('Carta ombak (m)'), series: [
      { name: L('Julat model'), kind: 'band', color: '#3987e5', unit: 'm', digits: 1, points: HV.map(function (h) { return [h.t, h.hs.lo, h.hs.hi]; }) },
      { name: L('Hs (ombak signifikan)'), color: '#3987e5', unit: 'm', digits: 1, points: HV.map(function (h) { return [h.t, h.hs.m]; }) },
      { name: L('Ombak maks'), color: '#199e70', unit: 'm', digits: 1, points: HV.map(function (h) { return [h.t, h.hmax]; }) },
      line(HV, rep.waveM, L('Had {m} m', { m: rep.waveM }))] }, common));
    else if (vH) vH.innerHTML = '<div class="empty">' + L('Tiada data ombak.') + '</div>';
    /* arrows: every 6 h (3 days), 12 h (7 days) or 24 h (14 days), placed over the chart's time axis */
    if (aH) {
      var svg = wH.querySelector('svg'), W = svg ? +svg.getAttribute('width') : 600, tA = HW[0].t, tB = HW[HW.length - 1].t;
      var hrs = n <= 3 ? [2, 8, 14, 20] : n <= 7 ? [8, 20] : [14];
      aH.innerHTML = HW.filter(function (h) { return hrs.indexOf(new Date(h.t + 8 * 3600000).getUTCHours()) >= 0 && h.dir !== null; }).map(function (h) {
        var x = (36 + (h.t - tA) / Math.max(1, tB - tA) * (W - 46)) / W * 100;
        return '<span style="left:' + x.toFixed(2) + '%"><i style="transform:rotate(' + Math.round(h.dir + 180) + 'deg)">↑</i><small>' + window.MCOffshore.compass16(h.dir) + '</small></span>';
      }).join('');
    }
  }
  function renderOffCmp() {
    var body = $('ocBody'), s = state.settings;
    if (!body || s.kind !== 'offshore') return;
    [].forEach.call(document.querySelectorAll('#ocSeg [data-days]'), function (b) {
      b.setAttribute('aria-selected', String(+b.getAttribute('data-days') === Off.days));
      b.onclick = function () { Off.days = +b.getAttribute('data-days'); save('mc_oc_days', Off.days); renderOffCmp(); };
    });
    $('ocPdf').onclick = function () { Off.pdf(); };
    var rep = Off.report();
    $('ocSub').textContent = rep ? L('{w} model angin · {v} model ombak · dikemas kini {t}', { w: rep.ok.wind.length, v: rep.ok.wave.length, t: C.fmtTime(rep.at) }) : L('beberapa model percuma · nilai tengah & julat');
    if (!rep) {
      body.innerHTML = '<div class="empty">' + (Off.busy ? L('Membaca model…') : Off.err ? esc(L('Gagal membaca model: ') + Off.err) : L('Belum ada data.')) + '</div>';
      return;
    }
    body.innerHTML = (Off.busy ? '<p class="note">' + L('Mengemas kini…') + '</p>' : Off.err ? '<p class="note">' + esc(L('Gagal kemas kini: ') + Off.err) + '</p>' : '') + ocHtml(rep, Off.days, false);
    ocCharts(rep, Off.days, body);
    [].forEach.call(body.querySelectorAll('details.oc-det'), function (d) {
      d.addEventListener('toggle', function () { Off.open[d.getAttribute('data-k')] = d.open; save('mc_oc_open', Off.open); });
    });
  }
  /* ------------------------------------------------------- AI suggestion (tab "Cadangan AI")
     automatic: the app's own rules (advisor.js) on the app's data; prompt: all the data + what to check, for an outside AI */
  var Adv = {
    ui: load('mc_adv', {}), result: null, landRaw: null, busy: false, wired: false,
    get: function (u) {
      if (state.mode !== 'pc') return OM.json(u, 60000);
      return fetchT('/api/fetch?url=' + encodeURIComponent(u), 60000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    },
    opt: function () {
      var u = this.ui, today = C.dateKey(Date.now());
      if (!u.from || u.from < today) u.from = today;
      if (!u.to || u.to < u.from) u.to = u.from;
      var last = C.dateKey(Date.now() + 13 * 86400000);
      if (u.to > last) u.to = last;
      u.res = ['shift', '3h', 'day'].indexOf(u.res) >= 0 ? u.res : 'shift';
      u.area = ['station', 'district', 'custom'].indexOf(u.area) >= 0 ? u.area : 'station';
      u.target = window.MCAdvisor && window.MCAdvisor.TARGETS[u.target] ? u.target : 'chatgpt';
      u.lang = u.lang === 'en' ? 'en' : 'ms';
      return u;
    },
    keep: function () { save('mc_adv', this.ui); },
    wire: function () {
      if (this.wired) return;
      this.wired = true;
      var A = this;
      $('advFrom').onchange = function () { A.ui.from = this.value; if (A.ui.to < A.ui.from) A.ui.to = A.ui.from; A.keep(); A.render(); };
      $('advTo').onchange = function () { A.ui.to = this.value; A.keep(); A.render(); };
      [].forEach.call(document.querySelectorAll('#advQuick [data-q]'), function (b) {
        b.onclick = function () {
          var q = +b.getAttribute('data-q'), d0 = Date.now();
          A.ui.from = C.dateKey(q === 1 ? d0 + 86400000 : d0);
          A.ui.to = C.dateKey(q <= 1 ? (q === 1 ? d0 + 86400000 : d0) : d0 + (q - 1) * 86400000);
          A.keep(); A.render();
        };
      });
      [['advRes', 'res'], ['advArea', 'area'], ['advTarget', 't']].forEach(function (x) {
        [].forEach.call(document.querySelectorAll('#' + x[0] + ' button'), function (b) {
          b.onclick = function () { A.ui[x[1] === 't' ? 'target' : x[1]] = b.getAttribute('data-' + x[1]); A.keep(); A.render(); if (x[1] === 't') A.showPrompt(); };
        });
      });
      $('advLang').onchange = function () { A.ui.lang = this.value; A.keep(); A.showPrompt(); };
      $('advShift').onchange = function () {
        var v = this.value.trim();
        if (!/^\d{1,2}\s*-\s*\d{1,2}$/.test(v)) { this.value = state.settings.advShift; return; }
        Data.saveSettings(Object.assign({}, state.settings, { advShift: v, profileName: state.settings.locationName })).then(function () { A.render(); });
      };
      $('advRun').onclick = function () { A.run(false); };
      $('advPromptBtn').onclick = function () { A.run(true); };
      $('advCopy').onclick = function () { A.copy(); };
      $('advShare').onclick = function () {
        var t = $('advPrompt').value;
        if (navigator.share) navigator.share({ title: L('Prompt Cadangan AI'), text: t }).catch(function () { });
        else A.copy();
      };
      $('advOpenAI').onclick = function () { var T = window.MCAdvisor.TARGETS[A.ui.target]; if (T.url) openExternal(T.url); };
      $('advPlacesSave').onclick = function () {
        var v = $('advPlaces').value, n = window.MCAdvisor.parsePlaces(v).length;
        Data.saveSettings(Object.assign({}, state.settings, { advPlaces: v, profileName: state.settings.locationName })).then(function () {
          $('advPlacesMsg').textContent = L('Disimpan: {n} tempat sah.', { n: n }); A.landRaw = null;
        });
      };
      $('advBody').addEventListener('click', function (e) {
        var c = e.target.closest('[data-ac]');
        if (c) A.detail(+c.getAttribute('data-ab'), +c.getAttribute('data-ac'));
      });
    },
    render: function () {
      if (!$('view-advisor') || !window.MCAdvisor) return;
      this.wire();
      var u = this.opt(), s = state.settings, off = s.kind === 'offshore';
      $('advFrom').value = u.from; $('advTo').value = u.to;
      $('advFrom').min = $('advTo').min = C.dateKey(Date.now()); $('advFrom').max = $('advTo').max = C.dateKey(Date.now() + 13 * 86400000);
      [['advRes', 'res', u.res], ['advArea', 'area', u.area], ['advTarget', 't', u.target]].forEach(function (x) {
        [].forEach.call(document.querySelectorAll('#' + x[0] + ' button'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-' + x[1]) === x[2])); });
      });
      $('advLang').value = u.lang;
      if (document.activeElement !== $('advShift')) $('advShift').value = s.advShift;
      if (document.activeElement !== $('advPlaces') && !$('advPlaces').value) $('advPlaces').value = s.advPlaces || '';
      $('advSub').textContent = (s.locationName || '') + ' · ' + (off ? L('kerja offshore: Go / Caution / No-Go') : L('risiko banjir & kawasan'));
      $('advOpenAI').textContent = L('Buka {n} ↗', { n: window.MCAdvisor.TARGETS[u.target].name });
      $('advOpenAI').hidden = !window.MCAdvisor.TARGETS[u.target].url;
      if (off) this.renderLimits();
    },
    /* gather the data, judge, show; prompt = also build the text for the outside AI */
    run: function (withPrompt) {
      var A = this, s = state.settings, u = this.opt(), M = window.MCAdvisor;
      if (A.busy) { if (withPrompt) A.wantPrompt = true; return; }
      A.busy = true; A.wantPrompt = !!withPrompt;
      $('advOut').hidden = false;
      $('advBody').innerHTML = '<div class="empty">' + L('Mengumpul data…') + '</div>';
      var B = M.blocks({ from: u.from, to: u.to, res: u.res, shift: s.advShift, now: Date.now() });
      var job;
      if (s.kind === 'offshore') {
        job = Off.load(false).then(function () {
          var rep = Off.report();
          if (!rep) throw new Error(Off.err || L('Tiada data model offshore'));
          return M.assessOffshore({ rep: rep, snap: state.snap || {}, blocks: B, limits: M.limits(s.advLimits), now: Date.now(), minWindow: s.advWindowH, early: Early.offCfg(s) });
        });
      } else {
        var snap = state.snap || {};
        var needJps = !(snap.jps && snap.jps.water && snap.jps.water.length) && u.area !== 'station';
        job = (needJps ? A.get(C.mirrorUrls(s, MIRROR).jpsMirror + '?m=' + Math.floor(Date.now() / 600000)).then(function (j) {
          return Object.assign({}, snap, { jps: { water: j.water || [], rain: j.rain || { days: [], stations: [] }, waterAt: j.waterAt ? Date.parse(j.waterAt) : null } });
        }, function () { return snap; }) : Promise.resolve(snap)).then(function (sn) {
          var areas = M.landAreas(u.area, s, sn, s.advPlaces);
          if (!areas.length) throw new Error(u.area === 'custom' ? L('Belum ada tempat. Tambah di kotak "Tempat saya" di bawah.') : L('Tiada stesen / kawasan dalam data.'));
          var key = areas.map(function (a) { return (+a.lat).toFixed(3) + ',' + (+a.lon).toFixed(3); }).join(';');
          var have = A.landRaw && A.landRaw.areaKey === key && Date.now() - A.landRaw.at < 30 * 60000 ? Promise.resolve(A.landRaw)
            : M.collectLand(areas, function (x) { return A.get(x); }).then(function (raw) { raw.areaKey = key; A.landRaw = raw; return raw; });
          return have.then(function (raw) {
            if (!Object.keys(raw.models).some(function (k) { return raw.models[k].ok; })) throw new Error(L('Tiada model hujan menjawab'));
            M.landUrls(areas);   /* gives each area its place in the answers (also when the answers were kept) */
            var r = M.assessLand({ areas: areas, raw: raw, snap: sn, blocks: B, now: Date.now(), trends: (state.snap || {}).trends || {} });
            r.snap = sn;
            return r;
          });
        });
      }
      job.then(function (r) {
        A.result = r;
        A.show(r);
        if (A.wantPrompt) A.showPrompt(true);
      }).catch(function (e) {
        $('advBody').innerHTML = '<div class="empty">' + esc(L('Tidak dapat menilai: ') + ((e && e.message) || e)) + '</div>';
      }).then(function () { A.busy = false; A.wantPrompt = false; });
    },
    icon: function (r, c) {
      if (c.st === null || (c.level === undefined && c.st === undefined)) return '⚪';
      if (r.kind === 'land') return LV5[c.level];
      return ['🟢', '🟡', '🔴', '⛔'][c.st];
    },
    sev: function (r, c) { return r.kind === 'land' ? c.level : c.st === null ? -1 : c.st; },
    show: function (r) {
      var A = this, M = window.MCAdvisor, off = r.kind === 'offshore', B = r.blocks;
      $('advOutTitle').textContent = off ? L('Keputusan kerja offshore') : L('Risiko banjir');
      $('advOutSub').textContent = (B.length ? M.shortDay(B[0].day) + (B[B.length - 1].day !== B[0].day ? ' – ' + M.shortDay(B[B.length - 1].day) : '') : '') + ' · ' + L('{n} blok masa', { n: B.length }) + (r.at ? ' · ' + L('data model ') + C.fmtTime(r.at) : '');
      if (!B.length) { $('advBody').innerHTML = '<div class="empty">' + L('Tiada blok masa dalam julat ini.') + '</div>'; return; }
      var dot = function (c) { return c.conf ? ['', '●○○', '●●○', '●●●'][c.conf] : ''; };
      var pct = function (c) { return c.prob === null || c.prob === undefined ? '' : Math.round(c.prob * 100) + '%'; };
      /* summary: worst of each item, and how many blocks are fine */
      var sum = '<div class="oc-scroll"><table class="tbl adv-sum"><thead><tr><th>' + (off ? L('Kerja') : L('Kawasan')) + '</th><th>' + L('Paling teruk') + '</th><th>' + L('Bila') + '</th><th>' + L('Sebab') + '</th><th class="num">' + (off ? 'Go / Caution / No-Go' : L('Rendah / Sederhana / Tinggi+')) + '</th></tr></thead><tbody>' +
        r.items.map(function (it, i) {
          var w = r.worst[i], cnt = [0, 0, 0];
          r.cells.forEach(function (row) { var v = A.sev(r, row[i]); if (v >= 0) cnt[off ? Math.min(2, it.kind === 'overall' ? (v >= 2 ? 2 : v) : v) : v <= 1 ? 0 : v === 2 ? 1 : 2]++; });
          return '<tr' + (it.kind === 'overall' ? ' class="adv-ov"' : '') + '><td><b>' + esc(it.name) + '</b></td><td>' + (w ? A.icon(r, w.c) + ' ' + esc(w.c.label) : '-') + '</td><td>' + (w ? esc(M.shortDay(w.b.day) + ' ' + w.b.label) : '-') + '</td>' +
            '<td class="adv-why">' + (w ? esc(w.c.why[0] || '') : '') + '</td><td class="num">' + cnt.join(' / ') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      /* the matrix: one row per time block, one column per job / area; tap a cell for the reasons */
      var lastDay = '', mat = '<div class="oc-scroll"><table class="tbl adv-mat"><thead><tr><th>' + L('Masa') + '</th>' + r.items.map(function (it) { return '<th' + (it.kind === 'overall' ? ' class="adv-ov"' : '') + '>' + esc(it.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        B.map(function (b, j) {
          var first = b.day !== lastDay; lastDay = b.day;
          return '<tr' + (first ? ' class="dstart"' : '') + '><td class="adv-t">' + (first ? '<b>' + esc(M.shortDay(b.day)) + '</b><br>' : '') + '<small>' + esc(b.label) + '</small></td>' + r.cells[j].map(function (c, i) {
            var sc = c.score !== undefined ? c.score : c.risk ? c.risk.score : null;
            return '<td><button type="button" class="adv-c s' + A.sev(r, c) + '" data-ab="' + j + '" data-ac="' + i + '">' + A.icon(r, c) + ' ' + esc(c.label) + '<small>' + [sc !== null ? L('skor {s}', { s: sc }) : '', pct(c), dot(c)].filter(Boolean).join(' · ') + '</small></button></td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
      var legend = off ? L('🟢 Go · 🟡 Caution · 🔴 No-Go · ⛔ Kekal dalam LQ. % = bahagian model yang memberi No-Go. ●●● keyakinan tinggi (model sepakat), ●○○ rendah. Tekan petak untuk sebab.')
        : L('🟢 Sangat rendah · 🟡 Rendah · 🟠 Sederhana · 🔴 Tinggi · 🟣 Sangat tinggi. % = bahagian model hujan yang memberi risiko Tinggi atau lebih. ●●● keyakinan tinggi, ●○○ rendah. Tekan petak untuk sebab.');
      var R = window.MCRisk, now = Date.now();
      var early = '<h4 class="adv-h">' + L('Amaran awal') + '</h4>' + ((r.early || []).length ? r.early.map(function (e) {
        return '<div class="rk-ewi lv-' + e.level + '">' + (e.level === 'warning' ? '⚠️' : '🔔') + ' <b>' + esc(e.title) + '</b><span>' + esc(e.body) + '</span></div>';
      }).join('') : '<p class="note" style="margin-top:0">' + (off ? L('Tiada angin / ombak naik cepat dalam 24 jam.') : L('Tiada sungai naik cepat.')) + '</p>');
      var wins = off ? '<h4 class="adv-h">' + L('Weather window (≥{h} jam, dalam tarikh dipilih)', { h: state.settings.advWindowH }) + '</h4><div class="oc-scroll"><table class="tbl adv-sum"><tbody>' + (r.windows || []).map(function (w) {
        return '<tr><td><b>' + esc(w.name) + '</b></td><td>' + (w.list.length ? w.list.slice(0, 4).map(function (x) { return '🟢 ' + esc(R.when(x.t0, now) + ' – ' + R.when(x.t1, now)) + ' <small class="muted">(' + x.hours + L(' jam') + ')</small>'; }).join('<br>') : '<span class="muted">' + L('Tiada tempoh selamat yang cukup panjang') + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '';
      $('advBody').innerHTML = '<h4 class="adv-h">' + L('Ringkasan') + '</h4>' + sum + early + wins + '<h4 class="adv-h">' + L('Setiap blok masa') + '</h4><p class="note" style="margin-top:0">' + legend + '</p>' + mat +
        '<div id="advDetail" class="adv-detail" hidden></div>' +
        '<p class="note">' + (off ? L('Had ialah nilai lazim industri yang boleh ditukar di bawah. Keputusan akhir oleh OIM / Marine mengikut keadaan sebenar dan prosedur syarikat.')
          : L('Penilaian ini daripada ramalan hujan 5 model, paras & hujan JPS, GloFAS, amaran MET dan air pasang. Bukan amaran rasmi - ikut arahan APM / NADMA / JPS.')) + '</p>';
    },
    detail: function (j, i) {
      var r = this.result, M = window.MCAdvisor;
      if (!r || !r.cells[j]) return;
      var c = r.cells[j][i], b = r.blocks[j], it = r.items[i], v = c.values || {};
      var vals = r.kind === 'offshore' && v.w !== undefined ? '<p class="note">' + L('Nilai tengah model: angin {w} kt, tiupan {g} kt, Hs {h} m, alun {s} m', { w: f(v.w, 0), g: f(v.g, 0), h: f(v.h, 1), s: f(v.sw, 1) }) + (v.vis !== null && v.vis !== undefined ? L(', penglihatan {v} km', { v: f(v.vis, 1) }) : '') + '</p>'
        : r.kind === 'land' && c.rain !== null && c.rain !== undefined ? '<p class="note">' + L('Hujan: nilai tengah {m} mm, model {lo}–{hi} mm', { m: f(c.rain, 0), lo: f(c.rainLo, 0), hi: f(c.rainHi, 0) }) + '</p>' : '';
      var d = $('advDetail');
      d.hidden = false;
      d.innerHTML = '<div class="adv-dh"><b>' + this.icon(r, c) + ' ' + esc(it.name) + ' — ' + esc(c.label) + '</b><span>' + esc(M.shortDay(b.day) + ' ' + b.label) + '</span><button type="button" class="ibtn" aria-label="Tutup" onclick="this.parentNode.parentNode.hidden=true">✕</button></div>' +
        '<div class="kv"><div><span>' + L('Peluang') + '</span><b>' + (c.prob === null || c.prob === undefined ? '-' : Math.round(c.prob * 100) + '%') + '</b></div><div><span>' + L('Keyakinan') + '</span><b>' + esc(c.confLabel) + '</b></div></div>' +
        (c.parts ? '<div class="adv-parts">' + c.parts.map(rkBar).join('') + '</div>' : c.risk ? '<p class="note">' + L('Skor risiko operasi: {s}/100 ({l})', { s: c.risk.score, l: c.risk.label }) + '</p><div class="adv-parts">' + c.risk.parts.map(rkBar).join('') + '</div>' : '') +
        '<ul>' + c.why.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + vals;
      d.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
    showPrompt: function (scroll) {
      var r = this.result, u = this.opt(), M = window.MCAdvisor;
      if (!r) return;
      var text = M.prompt({ result: r, settings: state.settings, snap: r.snap || state.snap || {}, rep: r.kind === 'offshore' ? Off.report() : null, target: u.target, lang: u.lang, now: Date.now() });
      $('advPromptCard').hidden = false;
      $('advPrompt').value = text;
      $('advCount').textContent = L('{n} aksara', { n: text.length.toLocaleString() });
      $('advPromptSub').textContent = L('untuk {n}', { n: M.TARGETS[u.target].name });
      if (scroll) $('advPromptCard').scrollIntoView({ block: 'start' });
    },
    copy: function () {
      var t = $('advPrompt'), done = function () { toast(L('Prompt disalin'), L('Buka AI dan tampal (Ctrl+V / tekan lama › Tampal).')); };
      var fallback = function () { t.removeAttribute('readonly'); t.select(); t.setSelectionRange(0, t.value.length); try { document.execCommand('copy'); done(); } catch (e) { toast(L('Tidak dapat salin'), L('Pilih teks dan salin sendiri.'), 'warning'); } t.setAttribute('readonly', ''); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, fallback); else fallback();
    },
    /* limits editor: one row per job, caution / stop for each value; blank = not used */
    renderLimits: function () {
      var M = window.MCAdvisor, lim = M.limits(state.settings.advLimits), host = $('advLimitsBody');
      if (!host || host.contains(document.activeElement)) return;
      var P = [['w', L('Angin kt')], ['g', L('Tiupan kt')], ['h', 'Hs m'], ['sw', L('Alun m')], ['tp', L('Tempoh alun s')], ['vis', L('Penglihatan km')]];
      var row = function (a, ov) {
        return '<tr data-id="' + a.id + '"><td>' + (ov ? '<b>' + esc(L(a.name)) + '</b>' : '<label><input type="checkbox" data-k="on"' + (a.on !== false ? ' checked' : '') + '> ' + esc(L(a.name)) + '</label>') + '</td>' +
          P.map(function (p) {
            var v = a[p[0]] || ['', ''];
            if (ov && (p[0] === 'sw' || p[0] === 'tp' || p[0] === 'vis')) return '<td></td>';
            return '<td class="adv-lim"><input class="inp" inputmode="decimal" data-k="' + p[0] + '0" value="' + v[0] + '"><input class="inp" inputmode="decimal" data-k="' + p[0] + '1" value="' + v[1] + '"></td>';
          }).join('') +
          '<td>' + (ov ? '' : '<input type="checkbox" data-k="day"' + (a.day ? ' checked' : '') + '>') + '</td>' +
          '<td>' + (ov ? '' : '<select class="sel" data-k="lt"><option value="c"' + (a.lt === 'c' ? ' selected' : '') + '>' + L('Berhati-hati') + '</option><option value="s"' + (a.lt === 's' ? ' selected' : '') + '>' + L('Henti') + '</option></select>') + '</td></tr>';
      };
      host.innerHTML = '<p class="note" style="margin-top:0">' + L('Setiap nilai: berhati-hati / henti. Penglihatan: lebih rendah = lebih teruk. Kosong = tidak digunakan. Baris "Status kerja luar": berhati-hati = kerja luar dihadkan, henti = kekal dalam LQ.') + '</p>' +
        '<div class="oc-scroll"><table class="tbl adv-limits"><thead><tr><th>' + L('Kerja') + '</th>' + P.map(function (p) { return '<th>' + p[1] + '</th>'; }).join('') + '<th>' + L('Siang sahaja') + '</th><th>' + L('Ribut petir') + '</th></tr></thead><tbody>' +
        row(lim.overall, true) + lim.acts.map(function (a) { return row(a, false); }).join('') + '</tbody></table></div>' +
        '<div class="adv-row"><button class="btn pri" type="button" id="advLimSave">' + L('Simpan had') + '</button><button class="btn" type="button" id="advLimReset">' + L('Guna nilai asal') + '</button><small id="advLimMsg" class="muted"></small></div>';
      var A = this;
      $('advLimSave').onclick = function () {
        var acts = [], ov = null;
        [].forEach.call(host.querySelectorAll('tbody tr'), function (tr) {
          var id = tr.getAttribute('data-id'), a = { id: id }, g = function (k) { var e = tr.querySelector('[data-k="' + k + '"]'); return e ? e : null; };
          P.forEach(function (p) {
            var x = g(p[0] + '0'), y = g(p[0] + '1');
            if (!x || !y) return;
            var c = parseFloat(String(x.value).replace(',', '.')), st = parseFloat(String(y.value).replace(',', '.'));
            if (isFinite(c) && isFinite(st)) a[p[0]] = [c, st];
          });
          if (id === 'lq') { ov = a; return; }
          a.on = g('on').checked; a.day = g('day').checked; a.lt = g('lt').value;
          acts.push(a);
        });
        var text = M.limitsText(acts, ov, state.settings.advLimits);
        Data.saveSettings(Object.assign({}, state.settings, { advLimits: text, profileName: state.settings.locationName })).then(function () {
          $('advLimMsg').textContent = L('Disimpan ✓'); if (A.result && A.result.kind === 'offshore') A.run(false);
        });
      };
      $('advLimReset').onclick = function () {
        Data.saveSettings(Object.assign({}, state.settings, { advLimits: '', profileName: state.settings.locationName })).then(function () { host.innerHTML = ''; A.renderLimits(); });
      };
    }
  };
  /* ------------------------------------------- risk score card (dashboard): the next 24 hours
     land: Weather / River / Coastal -> Flood Risk Score + Early Flood Warning; offshore: Wind / Sea / Weather -> Operational Risk Score,
     early warnings and the first weather window of each job */
  function rkBar(p) {
    return '<div class="rk-part lv' + p.level + '"><div class="rk-ph"><b>' + esc(p.name) + '</b><span>' + esc(p.label) + ' · ' + p.score + '</span></div>' +
      '<div class="rk-bar"><i style="width:' + Math.max(3, p.score) + '%"></i></div><small>' + p.why.slice(0, 3).map(esc).join('<br>') + '</small></div>';
  }
  var RK_SCALE = '<25 ' + L('Sangat rendah') + ' · 25–49 ' + L('Rendah') + ' · 50–70 ' + L('Sederhana') + ' · 71–84 ' + L('Tinggi') + ' · ≥85 ' + L('Sangat tinggi');
  function rkHead(sc, title, boostText) {
    return '<div class="rk-top lv' + sc.level + '"><div class="rk-score"><b>' + sc.score + '</b><small>/100</small></div><div><span class="rk-k">' + esc(title) + '</span><span class="rk-lv">' +
      LV5[sc.level] + ' ' + esc(sc.label) + '</span>' + (sc.boost ? '<small>' + esc(boostText) + '</small>' : '') + '<small class="rk-scale">' + esc(RK_SCALE) + '</small></div></div>';
  }
  function rkEarly(list, none) {
    return '<div class="rk-ew"><h4>' + L('Amaran awal') + '</h4>' + (list.length ? list.map(function (e) {
      var parts = e.parts ? '<div class="rk-conf"><div class="rk-bar"><i style="width:' + e.conf + '%"></i></div><small>' + L('Keyakinan {c}%: trend {t}/40 · hujan {r}/25 · hulu & GloFAS {u}/20 · data {d}/15', { c: e.conf, t: e.parts.trend, r: e.parts.rain, u: e.parts.up, d: e.parts.data }) + '</small></div>' : '';
      return '<div class="rk-ewi lv-' + e.level + (e.quiet ? ' quiet' : '') + '">' + (e.quiet ? '🔕' : e.level === 'info' ? '🔔' : '⚠️') + ' <b>' + esc(e.title) + '</b><span>' + esc(e.body) + '</span>' + parts + '</div>';
    }).join('') : '<div class="muted">' + none + '</div>') + '</div>';
  }
  function renderRiskCard() {
    var body = $('rkBody'), s = state.settings, snap = state.snap || {}, R = window.MCRisk, A = window.MCAdvisor, now = Date.now();
    if (!body || !R || !A) return;
    $('rkMore').onclick = function () { show('advisor'); };
    var t1 = now + 24 * 3600000, h = '';
    if (s.kind === 'offshore') {
      $('rkTitle').textContent = '📊 ' + L('Skor risiko operasi offshore');
      var rep = Off.report();
      if (!rep) { body.innerHTML = '<div class="empty">' + (Off.busy ? L('Membaca model…') : L('Belum ada data model offshore.')) + '</div>'; return; }
      var met = A.metActive(snap, now, t1, null, false).map(function (w) { return { severity: w.severity, title: A.metTitle(w) }; });
      var vals = R.offValues(rep, now, t1);
      var vis = ((snap.weather && snap.weather.hourly) || []).filter(function (x) { return x.t >= now && x.t < t1 && x.vis !== null && x.vis !== undefined; }).map(function (x) { return x.vis; });
      if (vis.length) vals.vis = Math.min.apply(null, vis);
      var sc = R.offScore(Object.assign(vals, { met: met }));
      /* first weather window of each job in the next 3 days */
      var lim = A.limits(s.advLimits), B = A.blocks({ from: C.dateKey(now), to: C.dateKey(now + 2 * 86400000), res: 'day', now: now });
      var res = A.assessOffshore({ rep: rep, snap: snap, blocks: B, limits: lim, now: now, minWindow: s.advWindowH, early: Early.offCfg(s) });
      var early = res.early || [];
      state.risk = { kind: 'offshore', score: sc, res: res, early: early, rep: rep, at: now };
      h = rkHead(sc, L('24 jam akan datang'), L('Dua risiko tinggi serentak: dinaikkan satu tahap.')) + '<div class="rk-parts">' + sc.parts.map(rkBar).join('') + '</div>' +
        '<div class="rk-cols">' + rkEarly(early, L('Tiada angin / ombak naik cepat dalam 24 jam.')) +
        '<div class="rk-win"><h4>' + L('Weather window (3 hari, ≥{h} jam)', { h: s.advWindowH }) + '</h4><table class="tbl"><tbody>' + res.windows.map(function (w) {
          var x = w.list[0];
          return '<tr><td>' + esc(w.name) + '</td><td>' + (x ? '🟢 ' + esc(R.when(x.t0, now) + ' – ' + R.when(x.t1, now)) + ' <small class="muted">(' + x.hours + L(' jam') + ')</small>' : '<span class="muted">' + L('Tiada dalam 3 hari') + '</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      $('rkSub').textContent = L('angin · laut · cuaca, gabungan model');
    } else {
      $('rkTitle').textContent = '📊 ' + L('Skor risiko banjir');
      /* rain: the 5 models compared (middle value + spread), the single forecast only when they could not be read */
      var w = snap.weather && snap.weather.summary, rm = snap.rainModels, by = (rm && rm.byModel) || [];
      var vals = by.map(function (x) { return x.h24; }).sort(function (a, b) { return a - b; });
      var rain = vals.length ? vals[Math.floor((vals.length - 1) / 2)] : w && w.next24h !== undefined ? w.next24h : null;
      var rng = vals.length > 1 ? f(vals[0], 0) + '–' + f(vals[vals.length - 1], 0) + ' mm' : '';
      var hist = [], rains = ((snap.jps && snap.jps.rain && snap.jps.rain.stations) || []).filter(function (r) { return !s.waterDistrict || String(r.district).toLowerCase() === String(s.waterDistrict).toLowerCase(); });
      var obs = rains.length ? Math.max.apply(null, rains.map(function (r) { var d = r.daily || []; return (d[d.length - 1] || 0) + (d[d.length - 2] || 0) + (r.today || 0); })) : 0;
      var metW = A.metActive(snap, now, t1, { kind: 'district', name: s.waterDistrict || s.locationName }, true).map(A.metForLand);
      var weather = R.weatherPart({ rain: rain, hours: 24, wet: obs, met: metW, range: rng });
      var names = {}; (A.LAND_MODELS || []).forEach(function (m) { names[m.id] = m.name; });
      var heavy = by.filter(function (x) { return x.h24 >= 30; }).length;
      weather.why.push(by.length ? L('{n} model: {list}. {h} daripada {n} model ramal ≥ 30 mm.', { n: by.length, h: heavy, list: by.map(function (x) { return (names[x.id] || x.id) + ' ' + f(x.h24, 0); }).join(' · ') + ' mm' })
        : L('5 model hujan belum dibaca: guna satu ramalan sahaja.'));
      var gl = Math.max(A.riverRatio(snap, C.dateKey(now)) || 0, A.riverRatio(snap, C.dateKey(now + 86400000)) || 0) || null;
      /* only fresh readings (an old one from a second source must not set the score) */
      var river = R.riverPart({ stations: (snap.stations || []).filter(function (x) { return !x.stale && x.level !== null; }), trends: snap.trends || {}, leadH: 0, glofas: gl });
      var coastal = R.coastalPart(Object.assign({ coastal: s.coastal !== false }, A.coastFor(snap, now, t1)));
      var sc2 = R.landScore(weather, river, coastal), early2 = snap.early || [];
      state.risk = { kind: 'land', score: sc2, weather: weather, river: river, coastal: coastal, early: early2, rain: rain, rainRange: rng, by: by, heavy: heavy, metW: metW, glofas: gl, at: now };
      var tr = snap.trends || {}, sts = (snap.stations || []).filter(function (x) { return !x.stale && tr[x.name]; });
      h = rkHead(sc2, s.locationName + ' · ' + L('24 jam akan datang'), L('Sungai sudah tinggi dan hujan / air pasang juga tinggi: dinaikkan satu tahap.')) + '<div class="rk-parts">' + sc2.parts.map(rkBar).join('') + '</div>' +
        '<div class="rk-cols">' + rkEarly(early2, L('Tiada sungai naik cepat.')) +
        '<div class="rk-win"><h4>' + L('Trend & anggaran sungai (JPS)') + '</h4>' + (sts.length ? '<div class="oc-scroll"><table class="tbl"><thead><tr><th>' + L('Stesen') + '</th><th class="num">m</th><th class="num">' + L('m/jam') + '</th><th class="num">' + L('4 j') + '</th><th class="num">' + L('24 j') + '</th><th class="num">' + L('Keyakinan') + '</th></tr></thead><tbody>' + sts.map(function (st) {
          var t = tr[st.name], p = t.proj || {};
          return '<tr><td>' + esc(st.name) + (t.tidal ? ' <small class="muted">(' + L('pasang surut') + ')</small>' : '') + '</td><td class="num">' + f(t.level, 2) + '</td><td class="num ' + (t.rising ? 'hot' : '') + '">' + (t.rate === null ? '-' : (t.rate > 0 ? '+' : '') + f(t.rate, 2)) + '</td>' +
            '<td class="num' + (p.tier === 4 ? ' hot' : '') + '">' + (p.p4 !== undefined ? f(p.p4, 2) : '-') + '</td><td class="num' + (p.tier === 24 ? ' hot' : '') + '">' + (p.p24 !== undefined ? f(p.p24, 2) : '-') + '</td><td class="num">' + (p.tier ? p.conf + '%' : '-') + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="note">' + (sts.some(function (st) { return tr[st.name].src === 'jps'; }) ? L('Data 5 minit JPS (26 jam terakhir). Anggaran 4 & 24 jam: trend sungai, hujan 5 model; notifikasi hanya bila keyakinan ≥ {k}%.', { k: s.ewConf }) + '<br>' + L('Tahap JPS: Waspada = paras naik ketara atas normal · Amaran = hampir banjir, bersedia berpindah · Bahaya = banjir, pemindahan dimulakan. Stesen dekat laut (pasang surut) hanya dinilai ikut trend 24 jam.') : L('Kadar naik daripada bacaan yang app simpan; lebih tepat bila relay dipasang.')) + '</p>'
          : '<div class="muted">' + L('Belum cukup bacaan untuk kira kadar naik.') + '</div>') + '</div></div>';
      $('rkSub').textContent = L('cuaca · sungai · pantai');
    }
    body.innerHTML = h;
  }
  function renderDashboard() {
    var s = state.snap || {};
    var alerts = activeAlerts(), open = alerts.filter(function (a) { return !a.acked; });
    /* banner */
    if (alerts.length) {
      var top = alerts[0];
      $('dashBanner').innerHTML = '<div class="banner lv-' + top.level + '"><span class="bi">' + LV_ICON[top.level] + '</span><div><b>' + esc(top.title) + '</b><span>' + esc(top.body) +
        (alerts.length > 1 ? ' · +' + (alerts.length - 1) + L(' alert lain') : '') + '</span></div><div class="sp"></div><button class="btn sm" data-go="alerts">' + L('Lihat {n} alert', { n: alerts.length }) + (open.length < alerts.length ? ' (' + open.length + L(' baru)') : '') + '</button></div>';
    } else if (s.at) {
      $('dashBanner').innerHTML = '<div class="banner lv-ok"><span class="bi">✅</span><div><b>Tiada alert aktif</b><span>Semua bacaan di bawah ambang yang ditetapkan.</span></div></div>';
    } else $('dashBanner').innerHTML = '';

    try { renderRiskCard(); } catch (e) { $('rkBody').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }

    /* tiles */
    var w = s.weather, cur = w && w.current, sum = w && w.summary, m = s.marine, sts = s.stations || [];
    var fresh = sts.filter(function (x) { return !x.stale; }), worst = fresh[0];
    var nAbove = fresh.filter(function (x) { return C.STATUS_RANK[x.status] >= 1; }).length;
    var warns = (s.met && s.met.warnings) || [];
    var wc = C.wmo(cur ? cur.code : null);
    var nextTide = m && m.tides && m.tides.filter(function (t) { return t.type === 'high'; })[0];
    var offshore = state.settings.kind === 'offshore';
    var metTile = '<button class="tile" data-go="alerts"><div class="k">Amaran MET</div><div class="v">' + warns.length + '<small>aktif</small></div><div class="s">' + (warns.length ? esc(C.metShort(warns[0], state.settings, Date.now(), true) || metField(warns[0], 'title')) : L('Tiada amaran untuk ') + esc(state.settings.warningKeywords)) + '</div></button>';
    if (offshore) {
      var mc = (m && m.current) || {}, risk = (sum && sum.thunderRisk) || 'rendah';
      $('dashTiles').innerHTML = [
        '<div class="tile"><div class="k">Angin</div><div class="v">' + f(cur && C.kt(cur.wind), 0) + '<small>knot ' + (cur ? C.compass(cur.dir) : '') + '</small></div><div class="s">' + f(cur && cur.wind, 0) + L(' km/j · tiupan ') + f(cur && C.kt(cur.gust), 0) + ' knot</div></div>',
        '<div class="tile"><div class="k">Tiupan maks 6 jam</div><div class="v">' + f(sum && C.kt(sum.maxGust6h), 0) + '<small>knot</small></div><div class="s">' + f(sum && sum.maxGust6h, 0) + L(' km/j · ambang ') + Math.round(C.kt(state.settings.gustKmh)) + ' knot</div></div>',
        '<div class="tile"><div class="k">Ombak</div><div class="v">' + f(mc.wave) + '<small>m</small></div><div class="s">Maks 24 jam <b>' + f(m && m.maxWave24h) + ' m</b>' + L(' · tempoh ') + f(mc.period) + ' s · ' + C.compass(mc.waveDir) + '</div></div>',
        '<div class="tile"><div class="k">Alun (swell)</div><div class="v">' + f(mc.swell) + '<small>m</small></div><div class="s">' + L('Tempoh ') + f(mc.swellPeriod) + L(' s · dari ') + C.compass(mc.swellDir) + L(' · maks 24 jam ') + f(m && m.maxSwell24h) + ' m</div></div>',
        '<div class="tile"><div class="k">Penglihatan min 6 jam</div><div class="v">' + f(sum && sum.minVis6h) + '<small>km</small></div><div class="s">' + esc(wc.text) + ' · ' + f(cur && cur.temp, 0) + '°C</div></div>',
        '<div class="tile"><div class="k">Ribut petir 6 jam</div><div class="v"><span class="riskchip risk-' + risk + '" style="font-size:15px;padding:4px 10px">' + L(risk).toUpperCase() + '</span></div><div class="s">' +
          (sum && sum.thunderAt ? L('Dijangka sekitar ') + C.fmtTime(sum.thunderAt) : L('Tiada ribut petir dalam ramalan')) + (sum && sum.maxCape6h !== null && sum.maxCape6h !== undefined ? ' · CAPE ' + f(sum.maxCape6h, 0) : '') + '</div></div>',
        metTile
      ].join('');
      renderOffshore(s);
      renderOffCmp();
      Off.load();
    } else $('dashTiles').innerHTML = [
      '<div class="tile"><div class="k">Cuaca sekarang</div><div class="v"><span class="emoji">' + wc.icon + '</span>' + f(cur && cur.temp, 0) + '<small>°C</small></div><div class="s">' + esc(wc.text) + (cur ? L(' · Terasa ') + f(cur.feels, 0) + L('° · Lembap ') + f(cur.rh, 0) + '%' : '') + '</div></div>',
      '<div class="tile"><div class="k">Hujan 3 jam akan datang</div><div class="v">' + f(sum && sum.next3h) + '<small>mm</small></div><div class="s">24 jam: <b>' + f(sum && sum.next24h) + ' mm</b>' + L(' · lalu: ') + f(sum && sum.past24h) + ' mm' + (sum && sum.maxProb6h !== null ? L(' · peluang ') + f(sum.maxProb6h, 0) + '%' : '') + '</div></div>',
      '<div class="tile"><div class="k">Angin</div><div class="v">' + f(cur && cur.wind, 0) + '<small>' + L('km/j ') + (cur ? C.compass(cur.dir) : '') + '</small></div><div class="s">' + L('Tiupan ') + f(cur && cur.gust, 0) + L(' km/j · maks 6 jam ') + f(sum && sum.maxGust6h, 0) + '</div></div>',
      worst ? '<button class="tile" data-hist="' + esc(worst.id) + '"><div class="k">' + L('Paras air tertinggi ') + chip(worst.status) + '</div><div class="v">' + f(worst.level, 2) + '<small>m ' + trendHtml(worst.trend) + '</small></div><div class="s">' + esc(worst.name) + ' · ' + fresh.length + L(' stesen, ') + nAbove + L(' atas ambang') + '</div></button>'
        : '<div class="tile"><div class="k">Paras air</div><div class="v">-</div><div class="s">' + (sts.length ? L('Semua data stesen sudah lama') : L('Belum ada data stesen')) + '</div></div>',
      '<div class="tile"><div class="k">Laut</div><div class="v">' + f(m && m.current && m.current.wave) + '<small>m ombak</small></div><div class="s">' + L('Maks 24 jam ') + f(m && m.maxWave24h) + ' m' + (nextTide ? L(' · pasang ') + C.fmtTime(nextTide.t) : '') + '</div></div>',
      metTile
    ].join('');

    /* water stations */
    var stale = sts.filter(function (x) { return x.stale; });
    function rows(list) {
      return '<table class="tbl"><thead><tr><th>Status</th><th>Stesen</th><th class="num">Paras (m)</th><th class="hide-s">Berbanding ambang</th><th class="num hide-s">Waspada / Amaran / Bahaya</th><th class="hide-s">Dikemas kini</th></tr></thead><tbody>' +
        list.map(function (x) {
          return '<tr class="click" data-hist="' + esc(x.id) + '" title="Lihat graf"><td>' + chip(x.status) + '</td><td><div class="st-name">' + esc(x.name) + '</div><div class="st-sub">' + esc([x.basin, x.district].filter(Boolean).join(' · ')) + ' <span class="tag">' + esc(x.source) + '</span></div></td>' +
            '<td class="num"><span class="lvl">' + f(x.level, 2) + '</span> ' + trendHtml(x.trend) + '</td><td class="hide-s">' + gauge(x) + '</td>' +
            '<td class="num hide-s">' + f(x.alert, 2) + ' / ' + f(x.warning, 2) + ' / ' + f(x.danger, 2) + '</td><td class="hide-s"><span title="' + esc(C.fmtDateTime(x.updated)) + '">' + C.timeAgo(x.updated) + '</span>' + (x.stale ? ' <span class="tag old">lama</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    var wb = '';
    if (fresh.length) wb += rows(fresh);
    else wb += '<div class="empty">' + (isDesktop ? L('Tiada bacaan paras air terkini. App membaca jadual dari infobanjir Terengganu setiap kemas kini - jika ia terus kosong, lihat ') + '<a href="#" data-go="settings">Tetapan › Diagnostik</a>' + L(' atau buka laman Water Level.')
      : state.mode === 'direct' ? L('Tiada bacaan paras air terkini dari JPS (mirror GitHub). Semak kad Status sumber, atau buka laman JPS.')
      : L('Paras air dari infobanjir hanya dibaca oleh app desktop. ')) + '</div>';
    if (stale.length) wb += '<details class="old"><summary>' + stale.length + L(' stesen dengan data lama (lebih ') + state.settings.staleHours + L(' jam) - tidak dikira untuk alert') + '</summary>' + rows(stale) + '</details>';
    $('waterBody').innerHTML = wb;

    /* rain chart */
    if (w && w.hourly) {
      var h0 = Math.floor(Date.now() / 3600000) * 3600000;
      CH.bars($('chartRain'), { bars: w.hourly.filter(function (h) { return h.t >= h0 - 24 * 3600000 && h.t < h0 + 24 * 3600000; }).map(function (h) { return { t: h.t, v: h.p, pp: h.pp, future: h.t >= h0 }; }), now: Date.now(), height: 190 });
    } else $('chartRain').innerHTML = '<div class="empty">Tiada data hujan</div>';

    /* rain stations */
    var rs = (s.rainStations || []).filter(function (x) { return !x.stale; });
    $('rainStBody').innerHTML = rs.length ? '<table class="tbl"><thead><tr><th>Stesen</th><th class="num">1 jam</th><th class="num">Hari ini</th><th class="hide-s">Masa</th></tr></thead><tbody>' +
      rs.slice().sort(function (a, b) { return (b.rainToday || 0) - (a.rainToday || 0); }).map(function (x) {
        return '<tr><td class="st-name">' + esc(x.name) + '</td><td class="num">' + f(x.rain1h) + '</td><td class="num"><b>' + f(x.rainToday) + '</b></td><td class="hide-s">' + C.timeAgo(x.updated) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">' + (isDesktop ? L('Belum ada bacaan hujan stesen dari infobanjir.') : state.mode === 'direct' ? L('Tiada bacaan hujan stesen terkini dari JPS (mirror GitHub).') : L('Bacaan hujan stesen hanya dari app desktop.')) + '</div>';
    renderJpsFull(s);

    /* MET forecast */
    var fc = (s.met && s.met.forecast) || [];
    var today = C.dateKey(Date.now());
    $('metSub').textContent = (fc[0] ? fc[0].name + ' · ' : '') + state.settings.metLocationId;
    $('metBody').innerHTML = fc.length ? '<div class="fc">' + fc.slice(0, 7).map(function (d, i) {
      var label = d.date === today ? L('Hari ini') : i === 1 && fc[0].date === today ? L('Esok') : C.fmtDate(C.localMs(d.date) + 12 * 3600000);
      return '<div class="d' + (d.date === today ? ' today' : '') + '"><b>' + label + '</b><div class="e">' + metEmoji(d.summary) + '</div><div class="t">' + f(d.min, 0) + '° / ' + f(d.max, 0) + '°</div><div class="x">' + esc(I18N.met(d.summary)) + '</div></div>';
    }).join('') + '</div>' + (fc[0] ? '<p class="metline"><b>' + (fc[0].date === today ? L('Hari ini') : esc(fc[0].date)) + ':</b>' + L(' Pagi - ') + esc(I18N.met(fc[0].morning)) + L(' · Petang - ') + esc(I18N.met(fc[0].afternoon)) + L(' · Malam - ') + esc(I18N.met(fc[0].night)) + '</p>' : '')
      : '<div class="empty">Tiada ramalan MET.</div>';

    /* MET warnings */
    $('warnSub').textContent = (s.met && s.met.warningsOther ? (s.met.warningsOther === 1 ? L('1 amaran di kawasan lain') : s.met.warningsOther + L(' amaran di kawasan lain')) : '');
    var openFull = {};
    [].forEach.call(document.querySelectorAll('#warnBody details.mfull'), function (d, i) { if (d.open) openFull[i] = 1; });
    $('warnBody').innerHTML = warns.length ? '<div class="wlist">' + warns.map(metCard).join('') + '</div>' : '<div class="empty">' + L('✅ Tiada amaran MET aktif untuk ') + esc(state.settings.warningKeywords) + '.</div>';

    [].forEach.call(document.querySelectorAll('#warnBody details.mfull'), function (d, i) { if (openFull[i]) d.open = true; });

    /* sea */
    if (m && m.hourly) {
      var c = m.current || {};
      $('seaBody').innerHTML = '<div class="kv"><div><span>Ombak sekarang</span><b>' + f(c.wave) + ' m</b></div><div><span>Maks 24 jam</span><b>' + f(m.maxWave24h) + ' m</b></div>' +
        '<div><span>Tempoh ombak</span><b>' + f(c.period) + ' s</b></div><div><span>Paras laut (model)</span><b>' + f(c.sea, 2) + ' m</b></div></div>' +
        '<div class="chartbox" id="chartSea"></div>' + seaTable(m);
      var hs = Math.floor(Date.now() / 3600000) * 3600000, hh = m.hourly.filter(function (h) { return h.t >= hs - 2 * 3600000 && h.t <= hs + 96 * 3600000; });
      window.Charts.chart($('chartSea'), { height: 170, now: Date.now(), yLabel: 'm', ticks: dayTicks(hh), xFormat: tickDay, tipTime: tipTime, series: [
        { name: L('Ombak'), color: '#3987e5', unit: 'm', digits: 1, points: hh.map(function (h) { return [h.t, h.wave]; }) },
        { name: L('Alun (swell)'), color: '#9085e9', unit: 'm', digits: 1, points: hh.map(function (h) { return [h.t, h.swell]; }) },
        { name: L('Ambang alert'), color: '#c98500', dash: '4 4', unit: 'm', digits: 1, points: hh.length ? [[hh[0].t, state.settings.waveM], [hh[hh.length - 1].t, state.settings.waveM]] : [] }] });
    } else $('seaBody').innerHTML = '<div class="empty">Tiada data laut.</div>';

    renderForecast(s); renderTide(s); renderRiver(s);

    /* sources + site health */
    var srcs = s.sources || {}, keys = Object.keys(srcs).filter(function (k) { return !srcs[k].skipped; });
    var okN = keys.filter(function (k) { return srcs[k].ok; }).length;
    $('srcSub').textContent = keys.length ? okN + ' / ' + keys.length + L(' sumber OK') : '';
    var sites = s.sites || {};
    $('srcBody').innerHTML = '<div class="srcs">' + keys.map(function (k) {
      var x = srcs[k];
      return '<div class="r"><span class="dot ' + (x.ok ? 'ok' : 'bad') + '"></span><div class="n">' + esc(x.label) + (x.ok ? '' : '<small title="' + esc(x.error) + '">' + esc(x.error) + (x.fails > 1 ? L(' · gagal ') + x.fails + 'x' : '') + '</small>') + '</div><span class="w">' + (x.at ? C.timeAgo(x.at) : L('belum')) + '</span></div>';
    }).join('') + '</div>' +
      '<div class="sitehealth">' + C.SITES.map(function (x) {
        var h = sites[x.id];
        return '<button class="h" data-open-site="' + x.id + '" title="' + esc(h ? (h.ok ? 'OK · ' + h.ms + ' ms' : L('Gagal: ') + (h.error || 'HTTP ' + h.status)) : L('Belum disemak')) + '">' + siteDot(x.id) + '<span>' + esc(x.title) + '</span></button>';
      }).join('') + '</div>';

    if (EXT.dash) try { EXT.dash(); } catch (e) { console.error(e); }
    /* links */
    if ($('dashLinks')) $('dashLinks').innerHTML = C.SITES.map(function (x) {
      return '<button class="link" data-open-site="' + x.id + '"><span class="ic">' + x.icon + '</span><span style="min-width:0"><b>' + esc(x.title) + '</b><span>' + esc(x.desc) + '</span></span>' + siteDot(x.id) + '</button>';
    }).join('');
  }

  /* ------------------------------------------------------- 7 / 14 / 28 days, tides, full JPS tables */
  function dayTicks(pts) {
    var out = []; if (!pts.length) return out;
    for (var t = C.localMs(C.dateKey(pts[0].t)); t <= pts[pts.length - 1].t; t += 86400000) if (t >= pts[0].t) out.push(t);
    return out;
  }
  function dayName(dateKey, short) {
    var today = C.dateKey(Date.now()), tom = C.dateKey(Date.now() + 86400000);
    if (dateKey === today) return L('Hari ini');
    if (dateKey === tom && !short) return L('Esok');
    return C.fmtDate(C.localMs(dateKey) + 12 * 3600000);
  }
  function tickDay(t) { return dayName(C.dateKey(t + 3600000), true); }
  function tipTime(t) { return (C.dateKey(t) === C.dateKey(Date.now()) ? '' : dayName(C.dateKey(t), true) + ', ') + C.fmtTime(t); }
  function arrow(deg) { return deg === null || deg === undefined ? '' : '<span class="arr" style="display:inline-block;transform:rotate(' + Math.round(deg + 180) + 'deg)">↑</span> '; }
  function seaTable(m) {
    var d = m.daily || [];
    if (!d.length) return '';
    return '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>' + L('Hari') + '</th><th class="num">' + L('Ombak maks') + '</th><th>' + L('Arah') + '</th><th class="num">' + L('Alun (swell)') + '</th><th class="num">' + L('Tempoh') + '</th><th>' + L('Dari') + '</th></tr></thead><tbody>' +
      d.map(function (x) {
        return '<tr><td><b>' + esc(dayName(x.date)) + '</b></td><td class="num' + (x.wave !== null && x.wave >= state.settings.waveM ? ' hot' : '') + '">' + f(x.wave) + ' m</td><td>' + arrow(x.waveDir) + C.compass(x.waveDir) + '</td>' +
          '<td class="num">' + f(x.swell) + ' m</td><td class="num">' + f(x.swellPer, 0) + ' s</td><td>' + arrow(x.swellDir) + C.compass(x.swellDir) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="note">' + L('Ombak & alun dari model Open-Meteo Marine, sehingga ~10 hari.') + '</p>';
  }
  var fcDays = +(load('mc_fc_days', 7)) || 7;
  function renderForecast(s) {
    [].forEach.call(document.querySelectorAll('#fcSeg [data-days]'), function (b) {
      b.setAttribute('aria-selected', String(+b.getAttribute('data-days') === fcDays));
      b.onclick = function () { fcDays = +b.getAttribute('data-days'); save('mc_fc_days', fcDays); renderForecast(state.snap || {}); };
    });
    $('fcSub').textContent = (state.settings.locationName || '') + ' · ' + (fcDays === 28 ? L('trend 31 larian model GFS') : 'Open-Meteo');
    var w = s.weather, body = $('fcBody'), kmh = L('km/j');
    if (fcDays === 28) {
      var o = s.outlook;
      if (!o || !o.days.length) { body.innerHTML = '<div class="empty">' + L('Tiada data 28 hari.') + '</div>'; return; }
      body.innerHTML = '<p class="note" style="margin-top:0">' + L('28 hari: nilai tengah 31 larian model GFS. Minggu 3–4 hanya trend (lebih / kurang hujan & angin), bukan hari tepat.') + '</p>' +
        '<div class="chartbox" id="chartFc"></div><div class="grid2c"><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>' + L('Minggu') + '</th><th class="num">' + L('Hujan') + '</th><th class="num">' + L('Hari basah') + '</th><th class="num">' + L('Angin maks') + '</th></tr></thead><tbody>' +
        o.weeks.map(function (x, i) { return '<tr><td><b>' + (i + 1) + '</b> <small>' + esc(dayName(x.from, true)) + ' – ' + esc(dayName(x.to, true)) + '</small></td><td class="num">' + f(x.rain, 0) + ' mm</td><td class="num">' + x.wetDays + '/7</td><td class="num">' + f(x.wind, 0) + '–' + f(x.windHi, 0) + ' ' + kmh + '</td></tr>'; }).join('') +
        '</tbody></table></div><div style="overflow-x:auto;max-height:340px"><table class="tbl"><thead><tr><th>' + L('Hari') + '</th><th class="num">' + L('Hujan') + '</th><th class="num">' + L('Peluang') + '</th><th class="num">' + L('Angin') + '</th></tr></thead><tbody>' +
        o.days.map(function (x) { return '<tr><td>' + esc(dayName(x.date)) + '</td><td class="num">' + f(x.p) + ' <small>(' + f(x.pLo, 0) + '–' + f(x.pHi, 0) + ')</small></td><td class="num">' + f(x.pChance, 0) + '%</td><td class="num">' + f(x.wind, 0) + ' <small>(' + f(x.windHi, 0) + ')</small></td></tr>'; }).join('') +
        '</tbody></table></div></div>';
      var t12 = function (d) { return C.localMs(d) + 12 * 3600000; };
      window.Charts.chart($('chartFc'), { height: 190, yLabel: 'mm · ' + kmh, ticks: o.days.filter(function (x, i) { return i % 7 === 0; }).map(function (x) { return C.localMs(x.date); }), xFormat: tickDay, tipTime: function (t) { return dayName(C.dateKey(t)); }, series: [
        { name: L('Julat hujan 10–90%'), kind: 'band', color: '#3987e5', unit: 'mm', digits: 0, points: o.days.map(function (x) { return [t12(x.date), x.pLo, x.pHi]; }) },
        { name: L('Hujan'), kind: 'bar', color: '#3987e5', unit: 'mm', digits: 1, points: o.days.map(function (x) { return [t12(x.date), x.p]; }) },
        { name: L('Angin maks'), color: '#d95926', unit: kmh, points: o.days.map(function (x) { return [t12(x.date), x.wind]; }) }] });
      return;
    }
    if (!w || !w.daily) { body.innerHTML = '<div class="empty">' + L('Tiada data ramalan.') + '</div>'; return; }
    var today = C.dateKey(Date.now()), dd = w.daily.filter(function (x) { return x.date >= today; }).slice(0, fcDays);
    body.innerHTML = '<div class="chartbox" id="chartFc"></div><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>' + L('Hari') + '</th><th></th><th class="num">°C</th><th class="num">' + L('Hujan') + '</th><th class="num">' + L('Angin / tiupan') + ' <small>' + kmh + '</small></th><th class="num">knot</th><th>' + L('Arah') + '</th></tr></thead><tbody>' +
      dd.map(function (x) {
        var wc = C.wmo(x.code);
        return '<tr><td><b>' + esc(dayName(x.date)) + '</b></td><td title="' + esc(wc.text) + '"><span class="emoji">' + wc.icon + '</span></td><td class="num">' + f(x.tmin, 0) + '–' + f(x.tmax, 0) + '</td><td class="num">' + f(x.p) + ' mm <small>' + f(x.pp, 0) + '%</small></td>' +
          '<td class="num">' + f(x.wind, 0) + ' / <span class="' + (x.gust !== null && x.gust >= state.settings.gustKmh ? 'hot' : '') + '">' + f(x.gust, 0) + '</span></td><td class="num">' + f(C.kt(x.wind), 0) + ' / ' + f(C.kt(x.gust), 0) + '</td><td>' + arrow(x.dir) + C.compass(x.dir) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var mid = function (d) { return C.localMs(d) + 12 * 3600000; };
    window.Charts.chart($('chartFc'), { height: 180, yLabel: kmh + ' · mm', ticks: dd.filter(function (x, i) { return fcDays === 7 || i % 2 === 0; }).map(function (x) { return C.localMs(x.date); }), xFormat: tickDay, tipTime: function (t) { return dayName(C.dateKey(t)); }, series: [
      { name: L('Hujan'), kind: 'bar', color: '#3987e5', unit: 'mm', digits: 1, points: dd.map(function (x) { return [mid(x.date), x.p]; }) },
      { name: L('Angin maks'), color: '#199e70', unit: kmh, points: dd.map(function (x) { return [mid(x.date), x.wind]; }) },
      { name: L('Tiupan maks'), color: '#d95926', unit: kmh, points: dd.map(function (x) { return [mid(x.date), x.gust]; }) }] });
  }
  function renderTide(s) {
    var m = s.marine, tm = s.tide, now = Date.now();
    var ev = tm && tm.events && tm.events.length ? tm.events : (m && m.tidesAll) || [];
    $('tideSub').textContent = tm ? (tm.live ? L('Cukai · Tide Forecast (terus melalui relay)') : L('Cukai · Tide Forecast (mirror GitHub)')) : L('model di titik laut (anggaran ±1 jam)');
    var next = ev.filter(function (e) { return e.t > now - 3 * 3600000; }).slice(0, 8);
    var html = next.length ? '<table class="tbl"><tbody>' + next.map(function (e) {
      return '<tr' + (e.t < now ? ' style="opacity:.5"' : '') + '><td><b>' + (e.type === 'high' ? L('⬆ Pasang') : L('⬇ Surut')) + '</b></td><td>' + esc(tipTime(e.t)) + '</td><td class="num">' + f(e.sea, 2) + ' m</td></tr>';
    }).join('') + '</tbody></table>' : '<div class="empty">' + L('Tiada data pasang surut.') + '</div>';
    html += '<div class="chartbox" id="chartTide"></div>';
    if (tm && tm.at) html += '<p class="note">' + L('Jadual: Tide Forecast, dibaca ') + C.timeAgo(tm.at) + L('. Graf: paras laut model Open-Meteo.') + '</p>';
    $('tideBody').innerHTML = html;
    if (m && m.hourly) {
      var hs = Math.floor(now / 3600000) * 3600000, pts = m.hourly.filter(function (h) { return h.t >= hs - 6 * 3600000 && h.t <= hs + 48 * 3600000 && h.sea !== null; });
      if (pts.length) window.Charts.chart($('chartTide'), { height: 130, now: now, yLabel: 'm', ticks: dayTicks(pts), xFormat: tickDay, tipTime: tipTime,
        yMin: Math.min.apply(null, pts.map(function (h) { return h.sea; })), series: [{ name: L('Paras laut'), color: '#3987e5', unit: 'm', digits: 2, points: pts.map(function (h) { return [h.t, h.sea]; }) }] });
    }
  }
  /* river discharge forecast (GloFAS) - the app's own view of what Flood Hub shows */
  function renderRiver(s) {
    var r = s.river, body = $('floodBody');
    if (!body) return;
    if (!r) { body.innerHTML = '<div class="empty">' + L('Tiada data aliran sungai.') + '</div>'; return; }
    var lvl = r.ratio === null ? 'normal' : r.ratio >= 3 ? 'danger' : r.ratio >= 2 ? 'warning' : r.ratio >= 1.5 ? 'alert' : 'normal';
    body.innerHTML = '<div class="kv"><div><span>' + L('Aliran sekarang') + '</span><b>' + f(r.now.q, 0) + ' m³/s</b></div>' +
      '<div><span>' + L('Puncak 30 hari') + '</span><b>' + (r.peak ? f(r.peak.q, 0) + ' m³/s' : '-') + '</b></div>' +
      '<div><span>' + L('Bila') + '</span><b>' + (r.peak ? esc(dayName(r.peak.date)) : '-') + '</b></div>' +
      '<div><span>' + L('Berbanding 7 hari lalu') + '</span><b>' + chip(lvl) + ' ' + (r.ratio === null ? '' : '×' + f(r.ratio, 1)) + '</b></div></div>' +
      '<div class="chartbox" id="chartRiver"></div><p class="note">' + L('Model GloFAS (Copernicus), grid ~5 km di lokasi profil. Ini anggaran aliran sungai, bukan paras air stesen JPS - gunakan sebagai amaran awal.') + '</p>';
    var mid = function (d) { return C.localMs(d) + 12 * 3600000; };
    window.Charts.chart($('chartRiver'), { height: 170, now: Date.now(), yLabel: 'm³/s', ticks: r.days.filter(function (x, i) { return i % 7 === 0; }).map(function (x) { return C.localMs(x.date); }), xFormat: tickDay,
      tipTime: function (t) { return dayName(C.dateKey(t)); }, yMin: 0, series: [
        { name: L('Julat 25–75%'), kind: 'band', color: '#3987e5', unit: 'm³/s', digits: 0, points: r.days.map(function (x) { return [mid(x.date), x.lo, x.hi]; }) },
        { name: L('Aliran (tengah)'), color: '#3987e5', unit: 'm³/s', digits: 0, points: r.days.map(function (x) { return [mid(x.date), x.q]; }) },
        { name: L('Larian tertinggi'), color: '#d95926', dash: '4 4', unit: 'm³/s', digits: 0, points: r.days.map(function (x) { return [mid(x.date), x.max]; }) }] });
  }

  /* the full JPS tables, same columns as the JPS pages */
  var jpsOpen = load('mc_jps_full', { water: false, rain: false, all: false });
  function renderJpsFull(s) {
    var J = s.jps, st = state.settings;
    if (!J || state.settings.kind === 'offshore') { $('waterFull').innerHTML = ''; return; }
    if (J.waterUrl) $('waterLink').href = J.waterUrl;
    if (J.rainUrl) $('rainLink').href = J.rainUrl;
    var how = J.live ? L('terus melalui relay ') : L('mirror GitHub ');
    $('waterSub').textContent = 'JPS Public Infobanjir · ' + how + (J.waterAt ? C.timeAgo(J.waterAt) : '');
    $('rainStSub').textContent = 'JPS Public Infobanjir · ' + how + (J.rainAt ? C.timeAgo(J.rainAt) : '');
    var mine = function (r) { return jpsOpen.all || !st.waterDistrict || String(r.district || '').toLowerCase().replace(/[^a-z]/g, '') === String(st.waterDistrict).toLowerCase().replace(/[^a-z]/g, ''); };
    var d8 = function (iso, sec) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) + ' ' + iso.slice(11, sec ? 19 : 16) : '-'; };
    var n2 = function (v) { return v === null || v === undefined ? '-' : (+v).toFixed(2); }, n1 = function (v) { return v === null || v === undefined ? '-' : (+v).toFixed(1); };
    var water = J.water.filter(mine), rain = (J.rain.stations || []).filter(mine), days = (J.rain.days || []).map(function (x) { return x.slice(8, 10) + '/' + x.slice(5, 7) + '/' + x.slice(0, 4); });
    var scope = '<div class="seg sm"><button data-jall="0" aria-selected="' + !jpsOpen.all + '">' + esc(st.waterDistrict || '-') + '</button><button data-jall="1" aria-selected="' + jpsOpen.all + '">' + L('Semua negeri') + '</button></div>';
    var wt = '<details class="jpsd" data-k="water"' + (jpsOpen.water ? ' open' : '') + '><summary>' + L('Jadual penuh JPS (seperti laman asal) · ') + water.length + L(' stesen') + '</summary>' + scope +
      '<div style="overflow-x:auto"><table class="jps"><thead><tr><th>No.</th><th>Station ID</th><th>Station Name</th><th>District</th><th>Main Basin</th><th>Sub River Basin</th><th>Last Updated</th><th>Water Level (m)</th><th class="th-n">Normal</th><th class="th-a">Alert</th><th class="th-w">Warning</th><th class="th-d">Danger</th></tr></thead><tbody>' +
      water.map(function (r) {
        var stt = C.stationStatus({ level: r.level, alert: r.alert, warning: r.warning, danger: r.danger });
        return '<tr class="js-' + stt + '"><td>' + r.no + '</td><td>' + esc(r.id) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.district) + '</td><td>' + esc(r.basin) + '</td><td>' + esc(r.subBasin) + '</td><td>' + d8(r.updated) + '</td><td class="lv">' + n2(r.level) + '</td><td>' + n2(r.normal) + '</td><td>' + n2(r.alert) + '</td><td>' + n2(r.warning) + '</td><td>' + n2(r.danger) + '</td></tr>';
      }).join('') + '</tbody></table></div></details>';
    var rt = '<details class="jpsd" data-k="rain"' + (jpsOpen.rain ? ' open' : '') + '><summary>' + L('Jadual penuh JPS (seperti laman asal) · ') + rain.length + L(' stesen') + '</summary>' + scope +
      '<div style="overflow-x:auto"><table class="jps"><thead><tr><th rowspan="2">No.</th><th rowspan="2">Station ID</th><th rowspan="2">Station</th><th rowspan="2">District</th><th rowspan="2">Last Updated</th><th colspan="' + (days.length || 6) + '">Daily Rainfall (mm)</th><th rowspan="2">Rainfall from Midnight' + (J.rain.today ? ' (' + J.rain.today.slice(8, 10) + '/' + J.rain.today.slice(5, 7) + '/' + J.rain.today.slice(0, 4) + ')' : '') + '</th><th rowspan="2">Total 1 Hour (Now)</th></tr><tr>' +
      days.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rain.map(function (r) {
        return '<tr' + (r.hour !== null && r.hour >= st.rain3hMm ? ' class="js-warning"' : '') + '><td>' + r.no + '</td><td>' + esc(r.id) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.district) + '</td><td>' + d8(r.updated, true) + '</td>' +
          (r.daily || []).map(function (v) { return '<td>' + n1(v) + '</td>'; }).join('') + '<td class="lv">' + n1(r.today) + '</td><td class="lv">' + n1(r.hour) + '</td></tr>';
      }).join('') + '</tbody></table></div></details>';
    $('waterFull').innerHTML = wt;
    var rs = $('rainStBody'); rs.insertAdjacentHTML('beforeend', '<div class="jpsfull">' + rt + '</div>');
    [].forEach.call(document.querySelectorAll('details.jpsd'), function (d) {
      d.addEventListener('toggle', function () { jpsOpen[d.getAttribute('data-k')] = d.open; save('mc_jps_full', jpsOpen); });
    });
    [].forEach.call(document.querySelectorAll('[data-jall]'), function (b) {
      b.onclick = function () { jpsOpen.all = b.getAttribute('data-jall') === '1'; save('mc_jps_full', jpsOpen); renderDashboard(); };
    });
  }

  /* ------------------------------------------------------- status & badges */
  function renderStatus() {
    var s = state.snap;
    var dot = $('statusDot'), txt = $('statusText');
    var running = s && s.running;
    $('btnRefresh').classList.toggle('spin', !!running || state.refreshing);
    if (!s || !s.at) { dot.className = 'dot warn'; txt.textContent = state.mode === 'connecting' ? L('Menyambung…') : L('Menunggu data pertama…'); }
    else {
      var srcs = s.sources || {}, keys = Object.keys(srcs).filter(function (k) { return !srcs[k].skipped; });
      var bad = keys.filter(function (k) { return srcs[k].ok === false; }).length;
      dot.className = 'dot ' + (bad === 0 ? 'ok' : bad >= keys.length ? 'bad' : 'warn');
      txt.innerHTML = L('Kemas kini ') + '<b>' + C.fmtTime(s.at) + '</b> · ' + C.timeAgo(s.at) + (bad ? ' · ' + bad + L(' sumber gagal') : '') + (state.mode === 'direct' ? L(' · mod terus') : '');
    }
    var n = activeAlerts().filter(function (a) { return !a.acked; }).length;
    [$('bellBadge'), $('railBadge')].forEach(function (b) { b.hidden = !n; b.textContent = n; });
    document.title = (n ? '(' + n + ') ' : '') + APPNAME;
  }
  setInterval(function () { renderStatus(); if (state.view === 'dashboard' && state.snap) renderDashboard(); }, 60000); /* keeps "x min lalu" current */

  function renderAll() {
    renderStatus();
    renderSide();
    renderDashboard();
    if (state.view === 'alerts') Alerts.renderView();
    if (state.view === 'settings' && !state.dirty) Settings.fill();
    $('diagBox').textContent = diagText();
  }
  function diagText() {
    var d = (state.snap && state.snap.diag) || {}, out = [];
    ['ibWater', 'ibRain'].forEach(function (k) {
      var src = (state.snap && state.snap.sources || {})[k];
      out.push('== ' + k + ' : ' + (src ? (src.ok ? 'OK, ' + (src.count || 0) + L(' stesen dikenal pasti') : L('GAGAL - ') + src.error) : L('belum dijalankan')));
      (d[k] || []).forEach(function (t, i) { out.push(L('-- jadual ') + (i + 1) + ' (' + t.rows.length + L(' baris)')); t.rows.slice(0, 6).forEach(function (r) { out.push('   ' + r.join(' | ')); }); });
    });
    return out.join('\n');
  }

  /* ------------------------------------------------------------- alerts */
  var Sound = {
    ctx: null,
    /* only the levels chosen in Tetapan › Bunyi untuk (default: critical only); "test" always rings */
    rings: function (level) { var min = { critical: 3, warning: 2, all: 1, none: 99 }[state.settings.soundLevel] || 3; return (C.LEVEL_RANK[level] || 1) >= min; },
    play: function (level, test) {
      if (!state.settings.sound || Date.now() < state.mutedUntil) return;
      if (!test && !this.rings(level)) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        var seq = level === 'critical' ? [988, 740, 988, 740, 988, 740] : level === 'warning' ? [784, 988, 784, 988] : [660, 880];
        var t = this.ctx.currentTime + 0.05, ctx = this.ctx;
        seq.forEach(function (fq, i) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = level === 'critical' ? 'square' : 'sine'; o.frequency.value = fq;
          g.gain.setValueAtTime(0, t + i * 0.24); g.gain.linearRampToValueAtTime(level === 'critical' ? 0.18 : 0.25, t + i * 0.24 + 0.02); g.gain.linearRampToValueAtTime(0, t + i * 0.24 + 0.2);
          o.connect(g); g.connect(ctx.destination); o.start(t + i * 0.24); o.stop(t + i * 0.24 + 0.22);
        });
      } catch (e) { /* no audio */ }
    }
  };
  /* unacknowledged BAHAYA / critical alerts ring again every 15 minutes (was every minute) */
  setInterval(function () { if (activeAlerts().some(function (a) { return a.level === 'critical' && !a.acked; })) Sound.play('critical'); }, 15 * 60000);

  function onAlerts(list) {
    if (!list || !list.length) return;
    var top = list.slice().sort(function (a, b) { return C.LEVEL_RANK[b.level] - C.LEVEL_RANK[a.level]; })[0];
    Sound.play(top.level);
    list.slice(0, 3).forEach(function (a) { toast(LV_ICON[a.level] + ' ' + a.title, a.body, a.level, a.level === 'critical' ? 15000 : 8000); });
    /* phone / browser notification (desktop uses Windows notifications from the main process) */
    if (!isDesktop && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      var opts = { body: top.body, icon: 'assets/icons/icon-192.png', tag: top.key, renotify: true };
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (r) { r.showNotification(top.title, opts); }).catch(function () { try { new Notification(top.title, opts); } catch (e) { /* */ } });
    }
  }

  var Alerts = {
    renderView: function () {
      var list = activeAlerts();
      $('aSub').textContent = list.length ? list.length + L(' aktif · ') + list.filter(function (a) { return !a.acked; }).length + L(' belum diakui') : '';
      $('aActive').innerHTML = list.length ? list.map(function (a) {
        return '<div class="aitem lv-' + a.level + (a.acked ? ' acked' : '') + '"><span class="e">' + LV_ICON[a.level] + '</span><div><span class="lvl-chip lvl-' + a.level + '">' + ({ critical: L('Kritikal'), warning: L('Amaran'), info: L('Makluman') })[a.level] + '</span><b>' + esc(a.title) + '</b><p>' + esc(a.body) + '</p><small>' + L('Sejak ') + C.fmtDateTime(a.since) + (a.acked ? L(' · diakui') : '') + '</small></div>' +
          (a.acked ? '' : '<button class="btn sm" data-ack="' + esc(a.key) + '">Akui</button>') + '</div>';
      }).join('') : '<div class="empty">✅ Tiada alert aktif.</div>';
      $('aMute').textContent = Date.now() < state.mutedUntil ? L('Bunyi disenyapkan hingga ') + C.fmtTime(state.mutedUntil) + L(' (klik untuk buka)') : L('Senyapkan bunyi 1 jam');
      Data.alertLog().then(function (log) {
        $('aLog').innerHTML = log.length ? '<table class="tbl"><thead><tr><th>Masa</th><th>Tahap</th><th>Alert</th></tr></thead><tbody>' + log.map(function (a) {
          return '<tr><td style="white-space:nowrap">' + C.fmtDateTime(a.t) + '</td><td><span class="lvl-chip lvl-' + a.level + '">' + a.level + '</span></td><td><b>' + esc(a.title) + '</b><div class="st-sub">' + esc(a.body) + '</div></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">Log kosong.</div>';
      });
    }
  };

  /* ---------------------------------------------------------------- data */
  var Data = {
    es: null, pcRetry: null,
    start: function () {
      if (state.snap) { renderAll(); }
      if (isDesktop) return this.connectPC();
      if (isWeb) {
        setMode('direct'); return Direct.run();
      }
      /* phone / browser: is the PC there? */
      fetchT('/api/info', 5000).then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function () { Data.connectPC(); }, function () { Data.goDirect(); });
    },
    connectPC: function () {
      var fails = 0;
      if (this.es) this.es.close();
      var es = this.es = new EventSource('/api/events');
      es.addEventListener('snapshot', function (e) { fails = 0; setMode('pc'); onSnap(JSON.parse(e.data)); });
      es.addEventListener('alert', function (e) { onAlerts(JSON.parse(e.data)); });
      es.addEventListener('settings', function (e) { applySettings(C.cleanSettings(JSON.parse(e.data))); if (state.view === 'settings' && !state.dirty) Settings.fill(); });
      es.addEventListener('profiles', function (e) { setProfiles(JSON.parse(e.data)); });
      es.onerror = function () {
        fails++;
        if (!isDesktop && fails >= 3) { es.close(); Data.es = null; Data.goDirect(); }
        else renderStatus();
      };
    },
    goDirect: function () {
      setMode('direct');
      Direct.run();
      clearInterval(this.pcRetry);
      /* keep looking for the PC every 2 minutes */
      this.pcRetry = setInterval(function () {
        fetchT('/api/info', 5000).then(function (r) { if (r.ok) { clearInterval(Data.pcRetry); Direct.stop(); Data.connectPC(); } }).catch(function () { });
      }, 120000);
    },
    refresh: function () {
      Off.load(true);
      if (state.mode === 'direct') return Direct.run();
      state.refreshing = true; renderStatus();
      return apiPost('/api/refresh').then(onSnap).catch(function (e) { toast(L('Gagal kemas kini'), e.message, 'warning'); }).finally(function () { state.refreshing = false; renderStatus(); });
    },
    ack: function (key) {
      if (state.mode === 'direct') return Direct.ack(key);
      return apiPost('/api/alerts/ack', { key: key }).then(function (a) { state.snap.alerts = a; renderAll(); });
    },
    history: function (hours) {
      if (state.mode === 'direct') return Promise.resolve(Direct.history(hours));
      return fetchT('/api/history?hours=' + hours, 20000).then(function (r) { return r.json(); }).then(function (j) { return j.entries || []; }).catch(function () { return []; });
    },
    alertLog: function () {
      if (state.mode === 'direct') return Promise.resolve(load('mc_d_log', []));
      return fetchT('/api/alerts/log?limit=200', 15000).then(function (r) { return r.json(); }).catch(function () { return []; });
    },
    saveSettings: function (s) {
      var before = state.settings;
      var after = function () { if (!isDesktop && (before.relayUrl !== state.settings.relayUrl || before.relayKey !== state.settings.relayKey || before.relayBad !== state.settings.relayBad || before.relayAds !== state.settings.relayAds)) Sites.rebuildBlocked(); };
      if (state.mode === 'direct') {
        state.settings = C.cleanSettings(s);
        if (String(s.profileName || '').trim()) state.settings.locationName = String(s.profileName).trim().slice(0, 60);
        save('mc_settings', state.settings);
        /* this device's copy of the active profile follows (location, sources, thresholds), like config.json on the PC */
        var P = state.profiles, i = (P.profiles || []).map(function (x) { return x.id; }).indexOf(P.active);
        if (i >= 0) {
          var prof = Object.assign({}, P.profiles[i]);
          C.PROFILE_KEYS.forEach(function (k) { prof[k] = state.settings[k]; });
          if (String(state.settings.locationName || '').trim()) prof.name = state.settings.locationName;
          P.profiles[i] = C.cleanProfile(prof, P.profiles[i]); setProfiles(P);
        }
        Direct.schedule(); after(); return Promise.resolve(state.settings);
      }
      return apiPost('/api/settings', s).then(function (r) { state.settings = C.cleanSettings(r); save('mc_settings', state.settings); after(); return r; });
    },
    test: function () {
      if (state.mode === 'direct') { onAlerts([{ key: 'test', level: 'warning', title: L('Ujian alert'), body: L('Ini ujian bunyi dan notifikasi.') }]); return Promise.resolve(); }
      return apiPost('/api/alerts/test');
    },
    /* profiles: on the PC they live in config.json; a phone without the PC switches between the copies it has */
    profile: function (action, body) {
      if (state.mode === 'direct' && isWeb && action !== 'activate') return Promise.resolve(localProfile(action, body));
      if (state.mode === 'direct') {
        if (action !== 'activate') return Promise.reject(new Error(L('Tambah / ubah / padam profil perlu sambungan ke PC')));
        var p = (state.profiles.profiles || []).filter(function (x) { return x.id === body.id; })[0];
        if (!p) return Promise.reject(new Error(L('Profil tiada')));
        state.profiles.active = p.id; save('mc_profiles', state.profiles);
        applySettings(C.profileSettings(state.settings, p));
        state.snap = null; renderAll();
        Direct.run();
        return Promise.resolve(state.profiles);
      }
      return apiPost('/api/profiles', Object.assign({ action: action }, body)).then(function (r) { setProfiles(r); return r; });
    }
  };
  /* web app: profiles live on this device (same rules as the PC's config.json) */
  function localProfile(action, body) {
    var P = { active: state.profiles.active, profiles: (state.profiles.profiles || []).slice() };
    if (action === 'save') {
      var i = -1, clean;
      var bp = Object.assign({}, body.profile);
      if (!bp.id) bp.id = String(bp.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      P.profiles.forEach(function (x, j) { if (body.profile && body.profile.id && x.id === body.profile.id) i = j; });
      clean = C.cleanProfile(bp, i >= 0 ? P.profiles[i] : null);
      if (i >= 0) P.profiles[i] = clean;
      else {
        if (P.profiles.length >= 20) throw new Error(L('Maksimum 20 profil'));
        var id = clean.id, n = 2;
        while (P.profiles.some(function (x) { return x.id === id; })) id = clean.id + '-' + (n++);
        clean.id = id; P.profiles.push(clean);
      }
      setProfiles(P);
      if (body.activate || clean.id === P.active) Data.profile('activate', { id: clean.id });
      return state.profiles;
    }
    if (action === 'delete') {
      if (P.profiles.length <= 1) throw new Error(L('Sekurang-kurangnya satu profil diperlukan'));
      P.profiles = P.profiles.filter(function (x) { return x.id !== body.id; });
      var wasActive = P.active === body.id;
      if (wasActive) P.active = P.profiles[0].id;
      try { localStorage.removeItem('mc_d_hist_' + body.id); } catch (e) { /* */ }
      setProfiles(P);
      if (wasActive) Data.profile('activate', { id: P.active });
      return state.profiles;
    }
    throw new Error(action);
  }
  function setProfiles(p) {
    if (!p || !p.profiles) return;
    state.profiles = p; save('mc_profiles', p);
    renderProfiles();
  }
  /* new settings: may be another profile, so sites that follow the profile move along */
  function applySettings(ns) {
    /* another language was chosen (here, on the PC or on another device): reload once in that language */
    if (ns.lang && ns.lang !== I18N.lang()) { I18N.setLang(ns.lang); save('mc_settings', ns); location.reload(); return; }
    var before = state.settings;
    state.settings = ns; save('mc_settings', ns);
    document.documentElement.setAttribute('data-kind', ns.kind);
    var moved = ['kind', 'lat', 'lon', 'marineLat', 'marineLon'].some(function (k) { return before[k] !== ns[k]; });
    if (moved) Sites.relocate();
    if (!isDesktop && (before.relayUrl !== ns.relayUrl || before.relayKey !== ns.relayKey || before.relayBad !== ns.relayBad || before.relayAds !== ns.relayAds)) Sites.rebuildBlocked();
    if (before.locationName !== ns.locationName || before.kind !== ns.kind) { renderProfiles(); setTitle(); if (state.view === 'history') History.load(); }
  }
  function setMode(m) {
    if (state.mode === m) return;
    state.mode = m;
    $('aboutMode').textContent = m === 'direct' && isWeb ? L('App web (GitHub) - terus ke sumber') : m === 'direct' ? L('Terus ke sumber (tiada PC)') : isDesktop ? L('App desktop (pengumpul data)') : L('Melalui PC');
    renderStatus();
  }
  function onSnap(snap) {
    if (!snap) return;
    if (snap.profiles) setProfiles(snap.profiles);
    if (snap.settings) applySettings(C.cleanSettings(snap.settings));
    state.snap = snap;
    var copy = Object.assign({}, snap); delete copy.diag;
    save('mc_snap', copy);
    renderAll();
  }

  /* early warnings (risk.js): rivers rising fast (5-minute JPS history through the relay, else the app's own readings),
     wind / waves rising offshore; they ring like the other alerts */
  /* Open-Meteo is free for ~10,000 calls a day for one internet address (all devices at home together): this device counts its calls
     and model data (5 rain models, offshore models) comes every omEveryMin minutes, slower near its share of the limit */
  var OM = {
    BUDGET: 4000,
    get: function () { var o = load('mc_om', {}); if (o.day !== C.dateKey(Date.now())) o = { day: C.dateKey(Date.now()), n: 0, block: o.block || 0 }; return o; },
    count: function (url, k) { if (!/open-meteo\.com\//.test(String(url))) return; var o = OM.get(); o.n += k || 1; save('mc_om', o); },
    refused: function () { var o = OM.get(); o.block = Date.now() + 3600000; save('mc_om', o); },
    every: function () { var o = OM.get(); return C.omEvery(o.n, OM.BUDGET, state.settings.omEveryMin, o.block, Date.now()); },
    /* fetch JSON, counting Open-Meteo calls; refused (429) = an hour's pause */
    json: function (u, ms) {
      if (state.mode === 'pc') return pcGet(u, ms);   /* PC app: the page itself reaches only this PC, which fetches (and counts Open-Meteo) */
      var o = OM.get();
      if (/open-meteo\.com\//.test(u) && o.block && Date.now() < o.block) return Promise.reject(new Error(L('Open-Meteo: had percuma harian, cuba semula sejam lagi')));
      OM.count(u, /marine-api/.test(u) ? 1.2 : 1);
      return fetchT(u, ms || 45000).then(function (r) { if (r.status === 429) OM.refused(); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    }
  };
  var Early = {
    cache: {}, rainCache: null,
    offCfg: function (s) { return { windRise: s.ewWindRise, swellTp: s.ewSwellTp, windKt: s.offWindKt, waveM: s.offWaveM, ahead: 24 }; },
    get: function (u) {
      if (state.mode !== 'pc') return OM.json(u, 45000);
      return fetchT('/api/fetch?url=' + encodeURIComponent(u), 45000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    },
    rainDue: function (s, now) { var c = Early.rainCache; return !c || c.key !== s.lat + ',' + s.lon || now - c.at >= OM.every(); },
    /* rain of the 5 models at the profile's place, the next 4 / 24 hours (every omEveryMin minutes) */
    rain: function (s, now) {
      var A = window.MCAdvisor, R = window.MCRisk, key = s.lat + ',' + s.lon, c = Early.rainCache;
      if (!A) return Promise.resolve({});
      if (c && c.key === key && now - c.at < OM.every()) return Promise.resolve(R.rainAhead(c.raw, now));
      return A.collectLand([{ lat: s.lat, lon: s.lon }], Early.get).then(function (raw) { Early.rainCache = { key: key, at: now, raw: raw }; return R.rainAhead(raw, now); }).catch(function () { return {}; });
    },
    add: function (snap, s, hist, now, viaRelay) {
      var R = window.MCRisk, A = window.MCAdvisor;
      if (!R) return Promise.resolve();
      if (s.kind === 'offshore') {
        var rep = Off.report();
        snap.early = rep ? R.earlyOffshore(rep, now, Early.offCfg(s)) : [];
        return Promise.resolve();
      }
      var sts = (snap.stations || []).filter(function (x) { return !x.stale && x.level !== null; });
      var water = (snap.jps && snap.jps.water) || [], rivers = R.parseRivers(s.ewUpstream);
      var gidOf = function (name) { var w = water.filter(function (x) { return x.name === name; })[0]; return w && w.gid; };
      /* 26 hours of each gauge: JPS 5-minute data through the relay, else the app's own readings */
      var series = Promise.all(sts.slice(0, 15).map(function (st) {
        var gid = gidOf(st.name), c = Early.cache[st.name], tidal = R.isTidal(rivers, st);
        var fromHist = function () { return [st.name, R.trend(R.histPoints(hist, st, now), st, now, { stepMin: s.refreshMin, tidal: tidal }), 'app']; };
        if (!gid || !viaRelay || !window.MCParse) return Promise.resolve(fromHist());
        if (c && now - c.at < 3 * 60000) return Promise.resolve([st.name, R.trend(c.pts, st, now, { stepMin: 5, tidal: tidal }), 'jps']);
        return viaRelay(R.seriesUrl(gid, now, 26)).then(function (txt) {
          var pts = window.MCParse.wlSeries(txt);
          if (pts.length < 3) throw new Error('no series');
          Early.cache[st.name] = { at: now, pts: pts };
          return [st.name, R.trend(pts, st, now, { stepMin: 5, tidal: tidal }), 'jps'];
        }).catch(fromHist);
      }));
      return Promise.all([series, Early.rain(s, now)]).then(function (res) {
        var tr = {};
        res[0].forEach(function (x) { if (x[1]) { x[1].src = x[2]; tr[x[0]] = x[1]; } });
        snap.trends = tr;
        snap.rainModels = res[1];
        var gl = A ? Math.max(A.riverRatio(snap, C.dateKey(now)) || 0, A.riverRatio(snap, C.dateKey(now + 86400000)) || 0) || null : null;
        var prevLoud = {};
        (((state.snap && state.snap.early) || [])).forEach(function (e) { if (e.base && !e.quiet) prevLoud[e.base] = true; });
        var rains = (snap.jps && snap.jps.rain && snap.jps.rain.stations) || snap.rainStations || [];
        snap.early = R.earlyFlood(sts, tr, now, { rivers: rivers, rain4: res[1].rain4, rain24: res[1].rain24, glofas: gl, minConf: s.ewConf, prevLoud: prevLoud,
          obs: function (st) { return R.obsRain(rains, st); } });
      });
    }
  };
  /* "Paksa kemas kini": everything read again now, with no cache - weather, models, JPS 5-minute series, the history lists and the
     Kemaman pages in the tabs / wall. The GitHub mirror itself (JPS tables, tides) is read by GitHub every ~15 minutes. */
  function forceUpdate() {
    if (state.refreshing) return Promise.resolve();
    Early.cache = {}; Early.rainCache = null; History.cache = {}; History.jpsList = null; Off.rep = null;
    Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (f) {
      try { if (/kemaman\.html/.test(f.getAttribute('src') || '')) f.contentWindow.postMessage({ kmForce: true }, location.origin); } catch (e) { /* */ }
    });
    var btn = $('btnForce'); btn.classList.add('spin');
    toast(L('Paksa kemas kini…'), L('Membaca semula semua data'));
    var hm = function (t) { var p = C.myt(t); return (p.h < 10 ? '0' : '') + p.h + ':' + (p.mi < 10 ? '0' : '') + p.mi; };
    return Promise.resolve(Data.refresh()).then(function () {
      var j = state.snap && state.snap.jps, at = j && j.at ? Date.parse(j.at) : null;
      toast(L('Data dikemas kini {t}', { t: hm(Date.now()) }), L('Versi {v}', { v: C.VERSION }) + (at ? ' · ' + L('mirror JPS {m}', { m: hm(at) }) : ''));
    }).catch(function () { }).then(function () { btn.classList.remove('spin'); });
  }
  function histKey() { return 'mc_d_hist_' + (state.profiles.active || 'kemaman'); }
  /* phone with no PC: fetch the public APIs directly (they allow it, except where the browser blocks) */
  var Direct = {
    timer: null, busy: false,
    run: function () {
      if (Direct.busy) return Promise.resolve();
      Direct.busy = true; state.refreshing = true; renderStatus();
      var s = state.settings, u = C.urls(s), keys = Object.keys(u), raw = {};
      function why(e) { return e.name === 'AbortError' ? L('Tamat masa') : /fetch|load failed|network/i.test(e.message) ? L('Tiada internet atau disekat pelayar') : e.message; }
      var jobs = keys.map(function (k) {
        var t0 = Date.now();
        OM.count(u[k]);
        return fetchT(u[k], 20000).then(function (r) { if (r.status === 429) OM.refused(); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) { raw[k] = { ok: true, data: d, at: Date.now(), ms: Date.now() - t0 }; },
            function (e) { raw[k] = { ok: false, error: why(e) }; });
      });
      /* JPS water level & rainfall and the Cukai tide table: GitHub mirror (those sites do not let other pages read them) */
      var mu = C.mirrorUrls(s, MIRROR), minute = Math.floor(Date.now() / 60000);
      function getMirror(k) {
        var t0 = Date.now();
        return fetchT(mu[k] + '?m=' + minute, 20000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) { raw[k] = { ok: true, data: d, at: Date.now(), ms: Date.now() - t0 }; }, function (e) { raw[k] = { ok: false, error: why(e), ms: Date.now() - t0 }; });
      }
      /* with the relay: the JPS and Tide Forecast pages are read live, now; the GitHub copy is the fallback */
      var viaRelay = Direct.viaRelay;
      var live = C.relayReady(s) && window.MCParse;
      Object.keys(mu).forEach(function (k) {
        if (!live) { jobs.push(getMirror(k)); return; }
        var t0 = Date.now(), iso = new Date().toISOString(), P = window.MCParse;
        if (k === 'jpsMirror') {
          var wu = 'https://publicinfobanjir.water.gov.my/aras-air/data-paras-air/aras-air-data/?state=' + s.jpsState + '&district=ALL&station=ALL&lang=en';
          var ru = 'https://publicinfobanjir.water.gov.my/wp-content/themes/shapely/agency/searchresultrainfall.php?state=' + s.jpsState + '&district=ALL&station=ALL&language=1&loginStatus=0';
          jobs.push(Promise.all([viaRelay(wu), viaRelay(ru)]).then(function (h) {
            var w = P.jpsWater(h[0]), r = P.jpsRain(h[1]);
            if (!w.length) throw new Error(L('Jadual tiada dalam jawapan'));
            raw[k] = { ok: true, live: true, at: Date.now(), ms: Date.now() - t0,
              data: { state: s.jpsState, at: iso, water: w, rain: r, waterAt: iso, rainAt: r.stations.length ? iso : null, waterUrl: wu, rainUrl: ru, errors: {} } };
            /* read live: the GitHub backup gets the same readings (the relay asks GitHub to run the mirror, at most every 10 minutes) */
            try { C.pokeMirror(s, localStorage); } catch (e) { /* */ }
          }).catch(function () { return getMirror(k); }));
        } else if (k === 'tideMirror') {
          var tu = 'https://www.tide-forecast.com/locations/Cukai/tides/latest';
          jobs.push(viaRelay(tu).then(function (h) {
            var ev = P.tides(h);
            if (ev.length < 4) throw new Error(L('Tiada waktu pasang surut'));
            raw[k] = { ok: true, live: true, at: Date.now(), ms: Date.now() - t0, data: { place: 'cukai', at: iso, url: tu, events: ev, eventsAt: iso, error: null } };
          }).catch(function () { return getMirror(k); }));
        } else jobs.push(getMirror(k));
      });
      return Promise.all(jobs).then(function () {
        var now = Date.now(), prev = state.snap || {};
        var snap = C.assemble(raw, s, prev, now);
        var hist = load(histKey(), []);
        return Early.add(snap, s, hist, now, live ? viaRelay : null).catch(function () { }).then(function () {
        var cur = C.evaluateAlerts(snap, s, hist, now);
        var prevA = (prev.alerts && prev.alerts.active) || [], since = {};
        prevA.forEach(function (a) { since[a.key] = a.since; });
        cur.forEach(function (a) { a.since = since[a.key] || now; });
        var fresh = C.newAlerts(prevA, cur), acked = (prev.alerts && prev.alerts.acked) || {}, keep = {};
        cur.forEach(function (a) { if (acked[a.key] && !fresh.some(function (x) { return x.key === a.key; })) keep[a.key] = acked[a.key]; });
        snap.alerts = { active: cur, acked: keep };
        snap.direct = true;
        var levels = {}; (snap.stations || []).forEach(function (x) { if (!x.stale && x.level !== null) levels[x.id] = x.level; });
        var wc0 = (snap.weather && snap.weather.current) || {}, mc0 = (snap.marine && snap.marine.current) || {};
        hist.push({ t: now, levels: levels, p: wc0.precip, temp: wc0.temp, gust: wc0.gust, wind: wc0.wind, wave: mc0.wave, swell: mc0.swell });
        snap.profile = { id: state.profiles.active, name: s.locationName, kind: s.kind };
        save(histKey(), hist.filter(function (h) { return now - h.t < 7 * 86400000; }).slice(-2000));
        if (fresh.length) { var log = load('mc_d_log', []); fresh.forEach(function (a) { log.unshift(Object.assign({ t: now }, a)); }); save('mc_d_log', log.slice(0, 200)); }
        onSnap(snap);
        onAlerts(fresh);
        });
      }).finally(function () { Direct.busy = false; state.refreshing = false; renderStatus(); Direct.schedule(); });
    },
    viaRelay: function (url) {
      return fetchT(C.relayUrlFor(url, state.settings), 30000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
    },
    /* between the full refreshes: when the model data is due (every omEveryMin minutes), read it again and
       work out the early warnings only; they ring like the other alerts */
    earlyOnly: function () {
      var s = state.settings, now = Date.now(), snap = state.snap;
      if (Direct.busy || Direct.early || !snap || !snap.at || document.visibilityState === 'hidden') return Promise.resolve();
      var due = s.kind === 'offshore' ? !Off.mine() || now - Off.mine().at >= OM.every() : Early.rainDue(s, now);
      if (!due) return Promise.resolve();
      Direct.early = true;
      var first = s.kind === 'offshore' ? Off.load(false) : Promise.resolve();
      return first.then(function () {
        return Early.add(snap, s, load(histKey(), []), now, C.relayReady(s) && window.MCParse ? Direct.viaRelay : null);
      }).then(function () {
        if (state.snap !== snap) return;
        var prevA = (snap.alerts && snap.alerts.active) || [], others = prevA.filter(function (a) { return !/^o?ew:/.test(a.key); });
        var cur = C.evaluateAlerts({ early: snap.early }, s, [], now), since = {};
        prevA.forEach(function (a) { since[a.key] = a.since; });
        cur.forEach(function (a) { a.since = since[a.key] || now; });
        var fresh = C.newAlerts(prevA, cur);
        snap.alerts = { active: others.concat(cur).sort(function (a, b) { return C.LEVEL_RANK[b.level] - C.LEVEL_RANK[a.level]; }), acked: (snap.alerts && snap.alerts.acked) || {} };
        if (fresh.length) { var log = load('mc_d_log', []); fresh.forEach(function (a) { log.unshift(Object.assign({ t: now }, a)); }); save('mc_d_log', log.slice(0, 200)); }
        onSnap(snap);
        onAlerts(fresh);
      }).catch(function () { }).then(function () { Direct.early = false; });
    },
    schedule: function () { clearTimeout(Direct.timer); Direct.timer = setTimeout(Direct.run, state.settings.refreshMin * 60000); },
    stop: function () { clearTimeout(Direct.timer); },
    ack: function (key) {
      var a = state.snap.alerts; a.acked = a.acked || {};
      a.active.forEach(function (x) { if (key === 'all' || x.key === key) a.acked[x.key] = Date.now(); });
      onSnap(state.snap); return Promise.resolve();
    },
    history: function (hours) { var from = Date.now() - hours * 3600000; return load(histKey(), []).filter(function (h) { return h.t >= from; }); }
  };

  /* -------------------------------------------------------------- history */
  /* -------------------------------------------------------------- history
     the full record from the source, not only the readings this app happened to see:
     land: JPS graph data (every 5 minutes, up to 30 days) for the gauge + the rain gauge at the same place (relay on the web, the PC on desktop);
     offshore: Open-Meteo's past days (waves, swell, wind, gusts, temperature). The app's own readings stay as the fallback. */
  var History = {
    entries: [], full: null, cache: {}, jpsList: null,
    load: function () {
      var hours = +$('hHours').value;
      this.stations();
      Data.history(hours).then(function (e) { History.entries = e; History.render(); History.fetchFull(); });
    },
    /* JPS graph data: through the relay (web) or the PC (desktop / phone on the PC) */
    jpsGet: function (url) {
      if (state.mode === 'pc') return fetchT('/api/fetch?url=' + encodeURIComponent(url), 90000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      if (!C.relayReady(state.settings)) return Promise.reject(new Error(L('Pasang relay Cloudflare (Tetapan › Relay laman) untuk data penuh JPS.')));
      return fetchT(C.relayUrlFor(url, state.settings), 90000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
    },
    jsonGet: function (url) {
      if (state.mode !== 'pc') return OM.json(url, 60000);
      return fetchT('/api/fetch?url=' + encodeURIComponent(url), 60000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    },
    /* JPS station lists with their graph ids */
    jps: function () {
      var sn = state.snap || {};
      if (sn.jps && sn.jps.water && sn.jps.water.some(function (x) { return x.gid; })) return Promise.resolve(sn.jps);
      if (this.jpsList && Date.now() - this.jpsList.at < 15 * 60000) return Promise.resolve(this.jpsList.data);
      return this.jsonGet(C.mirrorUrls(state.settings, MIRROR).jpsMirror + '?m=' + Math.floor(Date.now() / 600000)).then(function (j) { History.jpsList = { at: Date.now(), data: j }; return j; });
    },
    fetchFull: function () {
      var id = $('hStation').value, hours = +$('hHours').value, s = state.settings, now = Date.now(), R = window.MCRisk, P = window.MCParse;
      var off = s.kind === 'offshore', key = (off ? 'off|' + s.marineLat + ',' + s.marineLon : 'jps|' + id) + '|' + hours;
      var c = this.cache[key];
      if (c && now - c.at < 10 * 60000) { this.full = c; this.render(); return; }
      if (this.full && this.full.key === key && this.full.busy) return;
      this.full = { key: key, busy: true };
      this.note();
      var job, days = Math.max(1, Math.ceil(hours / 24));
      var tz = '&timezone=Asia%2FKuala_Lumpur&past_days=' + days + '&forecast_days=1';
      var hourly = function (j, k) {
        var H = (j && j.hourly) || {}, off8 = j && j.utc_offset_seconds !== undefined ? j.utc_offset_seconds : 28800;
        return (H.time || []).map(function (t, i) { return { t: Date.parse(t + ':00Z') - off8 * 1000, v: H[k] ? H[k][i] : null }; }).filter(function (p) { return p.v !== null && p.v !== undefined && p.t <= now; });
      };
      var lat = off ? s.marineLat : s.lat, lon = off ? s.marineLon : s.lon;
      var wx = this.jsonGet('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m&wind_speed_unit=kn' + tz);
      if (off) {
        job = Promise.all([wx, this.jsonGet('https://marine-api.open-meteo.com/v1/marine?latitude=' + lat + '&longitude=' + lon + '&hourly=wave_height,swell_wave_height' + tz)]).then(function (r) {
          return { src: 'model', temp: hourly(r[0], 'temperature_2m'), series: { '@wind': hourly(r[0], 'wind_speed_10m'), '@gust': hourly(r[0], 'wind_gusts_10m'), '@wave': hourly(r[1], 'wave_height'), '@swell': hourly(r[1], 'swell_wave_height') } };
        });
      } else {
        var st = ((state.snap && state.snap.stations) || []).filter(function (x) { return x.id === id; })[0];
        if (!st || !R || !P) { this.full = { key: key, err: L('Pilih stesen') }; this.note(); return; }
        job = this.jps().then(function (j) {
          var w = (j.water || []).filter(function (x) { return x.name === st.name; })[0];
          if (!w || !w.gid) throw new Error(L('Stesen ini tiada dalam senarai JPS Public Infobanjir.'));
          var lc = function (x) { return String(x || '').toLowerCase(); }, place = lc(st.name.split(/\s+di\s+/i).pop());
          var rs = (((j.rain && j.rain.stations) || []).filter(function (r) { return r.gid && (lc(r.name) === place || (place.length > 4 && (lc(r.name).indexOf(place) >= 0 || place.indexOf(lc(r.name)) >= 0))); }))[0];
          return Promise.all([History.jpsGet(R.seriesUrl(w.gid, now, hours)), rs ? History.jpsGet(R.rainUrl(rs.gid, now, hours)).catch(function () { return null; }) : null, wx.catch(function () { return null; })]).then(function (r) {
            var lv = P.wlSeries(r[0]);
            if (!lv.length) throw new Error(L('JPS tiada bacaan untuk tempoh ini.'));
            return { src: 'jps', level: lv, rain: r[1] ? P.rfSeries(r[1]) : null, rainName: rs ? rs.name : '', temp: r[2] ? hourly(r[2], 'temperature_2m') : null };
          });
        });
      }
      job.then(function (d) {
        d.key = key; d.at = Date.now();
        History.cache[key] = d;
        if (History.full && History.full.key === key) { History.full = d; History.render(); }
      }).catch(function (e) {
        if (History.full && History.full.key === key) { History.full = { key: key, err: (e && e.message) || String(e) }; History.render(); }
      });
    },
    mine: function () {
      var s = state.settings, id = $('hStation').value, hours = +$('hHours').value;
      var key = (s.kind === 'offshore' ? 'off|' + s.marineLat + ',' + s.marineLon : 'jps|' + id) + '|' + hours;
      return this.full && this.full.key === key ? this.full : null;
    },
    note: function () {
      var f0 = this.mine(), el = $('hNote');
      if (!el) return;
      el.className = 'note';
      el.textContent = !f0 ? '' : f0.busy ? L('Membaca data penuh…') : f0.err ? L('Data penuh tidak dapat dibaca ({e}). Graf guna bacaan yang app simpan.', { e: f0.err })
        : f0.src === 'jps' ? L('Data penuh JPS Public Infobanjir (setiap 5 minit).') : L('Open-Meteo: data model jam-jam untuk hari lepas (bukan bacaan alat).');
    },
    /* the largest reading in each step (floods: the peak matters) */
    thin: function (pts, hours) {
      var step = hours <= 72 ? 0 : hours <= 168 ? 15 : hours <= 336 ? 30 : 60;
      if (!step) return pts;
      var out = [], cur = null;
      pts.forEach(function (p) {
        var b = Math.floor(p.t / (step * 60000));
        if (!cur || cur.b !== b) { cur = { b: b, t: p.t, v: p.v }; out.push(cur); } else if (p.v > cur.v) { cur.v = p.v; cur.t = p.t; }
      });
      return out.map(function (x) { return { t: x.t, v: x.v }; });
    },
    /* offshore profiles have no rivers: the list shows sea & wind readings instead */
    METRICS: { '@wave': [L('Tinggi ombak'), 'm', 1, 'wave'], '@swell': [L('Alun (swell)'), 'm', 1, 'swell'], '@gust': [L('Tiupan angin'), 'knot', 0, 'gust'], '@wind': [L('Kelajuan angin'), 'knot', 0, 'wind'] },
    stations: function () {
      var all = (state.snap && state.snap.stations) || [], sel = $('hStation'), cur = sel.value || state.histStation;
      if (state.settings.kind === 'offshore') {
        var M = this.METRICS;
        sel.innerHTML = Object.keys(M).map(function (k) { return '<option value="' + k + '">' + M[k][0] + '</option>'; }).join('');
        sel.value = M[cur] ? cur : '@wave';
        return;
      }
      var sts = all.filter(function (x) { return !x.stale; }).concat(all.filter(function (x) { return x.stale; }));
      var ids = {};
      sel.innerHTML = sts.map(function (x) { ids[x.id] = 1; return '<option value="' + esc(x.id) + '">' + esc(x.name) + (x.stale ? L(' (data lama)') : '') + '</option>'; }).join('') || '<option value="">Tiada stesen</option>';
      if (cur && ids[cur]) sel.value = cur; else if (sts[0]) sel.value = sts[0].id;
    },
    render: function () {
      var id = $('hStation').value, hours = +$('hHours').value, now = Date.now(), full = this.mine(), ok = full && !full.busy && !full.err;
      state.histStation = id; save('mc_hist_station', id);
      var st = ((state.snap && state.snap.stations) || []).filter(function (x) { return x.id === id; })[0];
      var met = this.METRICS[id], unit = met ? met[1] : 'm', dec = met ? met[2] : 2, pts, from = now - hours * 3600000;
      if (met) {
        var key = met[3], toKt = unit === 'knot';
        if (ok && full.series && full.series[id] && full.series[id].length) pts = full.series[id].filter(function (p) { return p.t >= from; });
        else pts = this.entries.filter(function (e) { return e[key] !== null && e[key] !== undefined; }).map(function (e) { return { t: e.t, v: toKt ? C.kt(e[key]) : e[key] }; });
        $('hTitle').textContent = met[0] + ' · ' + state.settings.locationName;
        $('hSub').textContent = pts.length + (ok ? L(' jam · model Open-Meteo') : L(' bacaan app'));
        var thr = key === 'wave' ? [{ v: state.settings.waveM, label: L('Ambang'), cls: 'warning' }] : key === 'gust' ? [{ v: C.kt(state.settings.gustKmh), label: L('Ambang'), cls: 'warning' }] : [];
        CH.line($('chartLevel'), { points: pts, from: from, to: now, unit: unit, decimals: dec, height: 260, label: met[0], thresholds: thr });
      } else {
        $('hTitle').textContent = st ? L('Paras air · ') + st.name : L('Paras air');
        if (ok && full.level) pts = full.level.filter(function (p) { return p.t >= from; });
        else pts = this.entries.filter(function (e) { return e.levels && e.levels[id] !== undefined; }).map(function (e) { return { t: e.t, v: e.levels[id] }; });
        $('hSub').textContent = pts.length + (ok && full.level ? L(' bacaan JPS (5 minit) · ') : L(' bacaan app · ')) + (st ? C.statusName(st.status) : '');
        CH.line($('chartLevel'), { points: ok && full.level ? this.thin(pts, hours) : pts, from: from, to: now, unit: 'm', height: 260, label: L('Paras air'),
          thresholds: st ? [{ v: st.alert, label: L('Waspada'), cls: 'alert' }, { v: st.warning, label: L('Amaran'), cls: 'warning' }, { v: st.danger, label: L('Bahaya'), cls: 'danger' }] : [] });
      }
      this.note();
      /* rain: the JPS gauge at the same place (past, hourly), else Open-Meteo past + forecast */
      var w = state.snap && state.snap.weather;
      if (ok && full.rain && full.rain.length) {
        var rb = full.rain.filter(function (b) { return b.t >= from; });
        $('hRainTitle').textContent = L('Hujan setiap jam · JPS {n}', { n: full.rainName });
        $('hRainSub').textContent = L('{t} mm dalam tempoh ini', { t: f(rb.reduce(function (a, b) { return a + b.v; }, 0), 1) });
        CH.bars($('chartRainLong'), { bars: rb.map(function (b) { return { t: b.t, v: b.v, future: false }; }), now: now, height: 200 });
      } else {
        $('hRainTitle').textContent = L('Hujan setiap jam');
        $('hRainSub').textContent = L('Open-Meteo · 48 jam lalu + 7 hari ramalan');
        if (w && w.hourly) CH.bars($('chartRainLong'), { bars: w.hourly.map(function (h) { return { t: h.t, v: h.p, pp: h.pp, future: h.t >= Math.floor(now / 3600000) * 3600000 }; }), now: now, height: 200 });
      }
      var tp = ok && full.temp && full.temp.length ? full.temp.filter(function (p) { return p.t >= from; }) : this.entries.map(function (e) { return { t: e.t, v: e.temp }; });
      $('hTempTitle').textContent = ok && full.temp && full.temp.length ? L('Suhu (model Open-Meteo)') : L('Suhu (bacaan app)');
      CH.line($('chartTemp'), { points: tp, from: from, to: now, unit: '°C', decimals: 1, height: 200, label: L('Suhu') });
      var last = pts.slice(-80).reverse();
      $('hCount').textContent = pts.length ? pts.length + L(' bacaan') : '';
      $('hTable').innerHTML = last.length ? '<table class="tbl"><thead><tr><th>Masa</th><th class="num">' + (met ? met[0] + ' (' + unit + ')' : L('Paras (m)')) + '</th><th class="num">Beza</th></tr></thead><tbody>' + last.map(function (p, i) {
        var prev = last[i + 1], dlt = prev ? p.v - prev.v : null;
        return '<tr><td>' + C.fmtDateTime(p.t) + '</td><td class="num">' + f(p.v, dec) + '</td><td class="num ' + (dlt > 0 ? 'tr-rising' : dlt < 0 ? 'tr-falling' : '') + '">' + (dlt === null ? '' : (dlt > 0 ? '+' : '') + f(dlt, dec)) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">Tiada bacaan untuk stesen ini dalam tempoh dipilih.</div>';
    },
    csv: function () {
      var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; }, lines, full = this.mine(), id = $('hStation').value;
      if (full && !full.busy && !full.err) {
        /* the full record of the chosen station / sea point */
        if (full.level) {
          var rain = {}; (full.rain || []).forEach(function (b) { rain[b.t] = b.v; });
          var st = ((state.snap && state.snap.stations) || []).filter(function (x) { return x.id === id; })[0];
          lines = [[L('Masa (MYT)'), q(L('Paras m - ') + (st ? st.name : id)), q(L('Hujan mm/jam - ') + (full.rainName || '-'))].join(',')];
          full.level.forEach(function (p) { var h = Math.floor((p.t - 1) / 3600000) * 3600000; lines.push([q(C.fmtDateTime(p.t)), p.v, p.t % 3600000 === 0 && rain[h] !== undefined ? rain[h] : ''].join(',')); });
        } else {
          var S = full.series, keys = Object.keys(S), times = {};
          keys.forEach(function (k) { S[k].forEach(function (p) { (times[p.t] = times[p.t] || {})[k] = p.v; }); });
          lines = [[L('Masa (MYT)')].concat(keys.map(function (k) { return q(History.METRICS[k][0] + ' (' + History.METRICS[k][1] + ')'); })).join(',')];
          Object.keys(times).map(Number).sort(function (a, b) { return a - b; }).forEach(function (t) { lines.push([q(C.fmtDateTime(t))].concat(keys.map(function (k) { var v = times[t][k]; return v === undefined || v === null ? '' : v; })).join(',')); });
        }
      } else {
        var ids = {}, names = {};
        ((state.snap && state.snap.stations) || []).forEach(function (x) { names[x.id] = x.name; });
        this.entries.forEach(function (e) { Object.keys(e.levels || {}).forEach(function (k) { ids[k] = 1; }); });
        var cols = Object.keys(ids);
        lines = [[L('Masa (MYT)')].concat(cols.map(function (k) { return q(L('Paras m - ') + (names[k] || k)); })).concat([L('Suhu C'), L('Hujan semasa mm'), L('Angin km/j'), L('Tiupan km/j'), L('Ombak m'), L('Alun m')]).join(',')];
        this.entries.forEach(function (e) {
          lines.push([q(C.fmtDateTime(e.t))].concat(cols.map(function (k) { return e.levels && e.levels[k] !== undefined ? e.levels[k] : ''; }))
            .concat([e.temp, e.p, e.wind, e.gust, e.wave, e.swell].map(function (v) { return v === null || v === undefined ? '' : v; })).join(','));
        });
      }
      var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = APPNAME.toLowerCase().replace(/[^a-z0-9]+/g, '-') + L('-sejarah-') + (state.profiles.active || L('profil')) + '-' + C.dateKey(Date.now()) + '.csv'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }
  };

  /* ---- ad blocker button in the site bar (desktop): how many ads were blocked on this page; click = leave this site alone */
  function pageHost(fr) { try { return new URL(fr.url || fr.baseUrl || fr.site.url).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } }
  function hostExcepted(h) { return !!h && C.adHosts(state.settings.adblockExcept).some(function (x) { return h === x || h.slice(-x.length - 1) === '.' + x; }); }
  var Shield = {
    show: function (fr) {
      var b = $('sShield');
      if (!D || !D.adblockInfo || !fr || !fr.view || !state.settings.adblock) { b.hidden = true; return; }
      var h = pageHost(fr), off = hostExcepted(h);
      b.hidden = false;
      b.classList.toggle('off', off);
      var id = 0; try { id = fr.view.getWebContentsId(); } catch (e) { /* not attached yet */ }
      D.adblockInfo(id).then(function (i) {
        if (Sites.cur() !== fr) return;
        $('sShieldN').textContent = off ? L('Off') : String(i.blocked || 0);
        b.title = off ? L('Penyekat iklan dimatikan untuk {h}. Klik untuk hidupkan.', { h: h }) : L('{n} iklan disekat di laman ini. Klik untuk matikan penyekat iklan di {h}.', { n: i.blocked || 0, h: h });
      }).catch(function () { });
    },
    toggle: function () {
      var fr = Sites.cur(); if (!fr) return;
      var h = pageHost(fr); if (!h) return;
      var list = C.adHosts(state.settings.adblockExcept), off = hostExcepted(h);
      list = off ? list.filter(function (x) { return !(h === x || h.slice(-x.length - 1) === '.' + x); }) : list.concat([h]);
      var ns = Object.assign({}, state.settings, { adblockExcept: list.join(', ') });
      Data.saveSettings(ns).then(function () {
        toast(off ? L('Penyekat iklan dihidupkan untuk {h}', { h: h }) : L('Penyekat iklan dimatikan untuk {h}', { h: h }), '');
        fr.reload();
        if (state.view === 'settings') Settings.fill();
      }).catch(function (e) { toast(L('Gagal simpan: ') + e.message, 'err'); });
    }
  };
  $('sShield').onclick = function () { Shield.toggle(); };
  setInterval(function () { if (state.view === 'site' && Sites.cur()) Shield.show(Sites.cur()); }, 2000);
  function adStatus() {
    if (!D || !D.adblockInfo) return;
    D.adblockInfo(0).then(function (i) {
      $('adStatus').textContent = i.updating ? L('Sedang mengemas kini…') :
        (i.source === 'updated' ? L('Dikemas kini {t}', { t: C.fmtDateTime(Date.parse(i.built)) }) : L('Senarai terbina dalam app ({t})', { t: i.built ? C.fmtDate(Date.parse(i.built)) : '-' })) +
        ' · ' + L('{n} senarai', { n: i.lists }) + (i.error ? ' · ' + L('kemas kini terakhir gagal') : '');
    }).catch(function () { });
  }

  /* ------------------------------------------------------------- settings */
  var Settings = {
    fill: function () {
      var s = state.settings;
      Object.keys(C.DEFAULTS).forEach(function (k) {
        var el = $('f_' + k); if (!el) return;
        if (el.type === 'checkbox') el.checked = !!s[k]; else el.value = s[k];
      });
      $('f_theme').value = document.documentElement.getAttribute('data-theme') || 'dark';
      $('f_profileName').value = s.locationName;
      document.documentElement.setAttribute('data-kind', s.kind);
      $('gustKt').textContent = s.gustKmh + L(' km/j = ') + Math.round(C.kt(s.gustKmh)) + ' knot';
      renderProfiles();
      $('aboutVer').textContent = C.VERSION + (D ? ' · Electron' : '');
      relayBadInfo();
      adStatus();
      state.dirty = false;
      $('btnPhoneNotif').textContent = !('Notification' in window) ? L('Tidak disokong') : Notification.permission === 'granted' ? L('Dibenarkan ✓') : L('Benarkan');
    },
    read: function () {
      var out = {};
      Object.keys(C.DEFAULTS).forEach(function (k) {
        var el = $('f_' + k); if (!el) return;
        out[k] = el.type === 'checkbox' ? el.checked : el.value;
      });
      out.profileName = $('f_profileName').value;
      return out;
    },
    save: function () {
      Data.saveSettings(this.read()).then(function () {
        if (state.settings.lang !== I18N.lang()) { I18N.setLang(state.settings.lang); location.reload(); return; }
        state.dirty = false; Settings.fill(); $('setMsg').textContent = L('Disimpan ✓ ') + C.fmtTime(Date.now()); toast(L('Tetapan disimpan'), ''); renderAll(); })
        .catch(function (e) { $('setMsg').textContent = L('Gagal simpan: ') + e.message; });
    }
  };
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('mc_theme', t); } catch (e) { /* */ } renderAll(); if (state.view === 'history') History.render(); }

  /* -------------------------------------------------------------- palette */
  var Pal = {
    items: [], sel: 0,
    actions: function () {
      var a = [
        { e: '🏠', t: 'Dashboard', k: 'Ctrl+H', run: function () { show('dashboard'); } },
        { e: '🔄', t: L('Kemas kini data sekarang'), k: 'F9', run: function () { Data.refresh(); } },
        { e: '🧱', t: L('Mod dinding'), k: 'Ctrl+L', run: function () { show('wall'); } },
        { e: '📈', t: L('Sejarah & graf'), run: function () { show('history'); } },
        { e: '🔔', t: 'Alert', run: function () { show('alerts'); } },
        { e: '✅', t: L('Akui semua alert'), run: function () { Data.ack('all'); } },
        { e: '🔇', t: L('Senyapkan bunyi 1 jam'), run: function () { state.mutedUntil = Date.now() + 3600000; toast(L('Bunyi disenyapkan'), L('Hingga ') + C.fmtTime(state.mutedUntil)); } },
        { e: '⚙️', t: L('Tetapan'), run: function () { show('settings'); } },
        { e: '🌐', t: I18N.lang() === 'en' ? 'Tukar ke Bahasa Melayu' : 'Switch to English', run: function () { setLanguage(I18N.lang() === 'en' ? 'ms' : 'en'); } },
        { e: '🌓', t: L('Tukar tema gelap / cerah'), run: function () { setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); } }
      ];
      if (D && D.openPhoneSetup) a.push({ e: '📱', t: L('Telefon / tablet (QR)'), k: 'Ctrl+P', run: function () { D.openPhoneSetup(); } });
      if (Sites.open.length) a.push({ e: '✖️', t: L('Tutup semua laman (') + Sites.open.length + ')', k: 'Ctrl+Shift+W', run: function () { Sites.closeAll(); } });
      (state.profiles.profiles || []).forEach(function (p) {
        if (p.id !== state.profiles.active) a.push({ e: KIND_ICON[p.kind], t: L('Tukar profil: ') + p.name, run: function () { switchProfile(p.id); } });
      });
      return a;
    },
    open: function () { $('palBg').hidden = false; $('palInput').value = ''; this.filter(''); $('palInput').focus(); },
    close: function () { $('palBg').hidden = true; },
    filter: function (q) {
      q = q.toLowerCase().trim();
      var acts = this.actions().filter(function (x) { return !q || x.t.toLowerCase().indexOf(q) >= 0; });
      var sites = C.SITES.filter(function (x) { return !q || (x.title + ' ' + x.desc + ' ' + x.category + ' ' + L(x.title) + ' ' + L(x.desc)).toLowerCase().indexOf(q) >= 0; })
        .map(function (x) { return { e: x.icon, t: L(x.title), k: L(x.desc), run: function () { Sites.show(x.id, true); } }; });
      this.items = q ? sites.concat(acts) : acts.concat(sites);
      this.sel = 0; this.draw();
    },
    draw: function () {
      $('palList').innerHTML = this.items.map(function (x, i) { return '<li role="option" data-i="' + i + '" aria-selected="' + (i === Pal.sel) + '"><span class="e">' + x.e + '</span>' + esc(x.t) + (x.k ? '<small>' + esc(x.k) + '</small>' : '') + '</li>'; }).join('') || '<li>Tiada padanan</li>';
      var s = $('palList').querySelector('[aria-selected="true"]'); if (s) s.scrollIntoView({ block: 'nearest' });
    },
    go: function (i) { var x = this.items[i]; this.close(); if (x) x.run(); }
  };

  /* ------------------------------------------------------------- shortcuts */
  function shortcut(a) {
    if (a === 'palette') return $('palBg').hidden ? Pal.open() : Pal.close();
    if (a === 'home') return show('dashboard');
    if (a === 'wall') return show('wall');
    if (a === 'refresh-data') return Data.refresh();
    if (a === 'reload') { if (state.view === 'site' && Sites.cur()) return Sites.cur().reload(); if (state.view === 'wall') return Wall.frames.forEach(function (fr) { fr.reload(); }); return Data.refresh(); }
    if (a === 'back' && Sites.cur()) return Sites.cur().back();
    if (a === 'forward' && Sites.cur()) return Sites.cur().fwd();
    if (a === 'close-tab' && state.view === 'site' && Sites.current) return Sites.close(Sites.current);
    if (a === 'close-all') return Sites.closeAll();
  }
  document.addEventListener('keydown', function (e) {
    var ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), a = null;
    if (!$('palBg').hidden) {
      if (k === 'escape') { e.preventDefault(); return Pal.close(); }
      if (k === 'arrowdown') { e.preventDefault(); Pal.sel = Math.min(Pal.items.length - 1, Pal.sel + 1); return Pal.draw(); }
      if (k === 'arrowup') { e.preventDefault(); Pal.sel = Math.max(0, Pal.sel - 1); return Pal.draw(); }
      if (k === 'enter') { e.preventDefault(); return Pal.go(Pal.sel); }
    }
    if (ctrl && k === 'k') a = 'palette'; else if (ctrl && k === 'h') a = 'home'; else if (ctrl && k === 'l') a = 'wall';
    else if ((ctrl && k === 'r') || k === 'f5') a = 'reload'; else if (k === 'f9') a = 'refresh-data';
    else if (e.altKey && k === 'arrowleft') a = 'back'; else if (e.altKey && k === 'arrowright') a = 'forward';
    else if (ctrl && e.shiftKey && k === 'w') a = 'close-all';
    else if (ctrl && k === 'w') a = 'close-tab';
    else if (k === 'escape') { $('app').classList.remove('side-open'); return; }
    if (a) { e.preventDefault(); shortcut(a); }
  });
  if (D) { D.onShortcut(shortcut); D.onNav(function (v) { show(v); }); }

  /* --------------------------------------------------------------- events */
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.prof-wrap')) $('profMenu').hidden = true;
    var t = e.target.closest('[data-prof],[data-prof-del],[data-view],[data-open-site],[data-site],[data-go],[data-hist],[data-tab],[data-close],[data-ack],[data-preload],[data-pmax]');
    if (!t) return;
    if (t.hasAttribute('data-prof')) return switchProfile(t.getAttribute('data-prof'));
    if (t.hasAttribute('data-prof-del')) {
      var pid = t.getAttribute('data-prof-del'), pp = (state.profiles.profiles || []).filter(function (x) { return x.id === pid; })[0];
      if (pp && confirm(L('Padam profil "') + pp.name + '"? Sejarahnya kekal dalam folder data.')) Data.profile('delete', { id: pid }).then(function () { toast(L('Profil dipadam'), pp.name); }).catch(function (er) { toast(L('Gagal padam'), er.message, 'warning'); });
      return;
    }
    if (t.hasAttribute('data-prof-manage')) $('profMenu').hidden = true;
    if (t.hasAttribute('data-close')) { e.stopPropagation(); return Sites.close(t.getAttribute('data-close')); }
    if (t.hasAttribute('data-view')) return show(t.getAttribute('data-view'));
    if (t.hasAttribute('data-open-site')) return Sites.show(t.getAttribute('data-open-site'), true);
    if (t.hasAttribute('data-site')) return Sites.show(t.getAttribute('data-site'), true);
    if (t.hasAttribute('data-tab')) { Sites.activate(t.getAttribute('data-tab')); return show('site'); }
    if (t.hasAttribute('data-go')) { e.preventDefault(); return show(t.getAttribute('data-go')); }
    if (t.hasAttribute('data-hist')) { state.histStation = t.getAttribute('data-hist'); $('hStation').value = state.histStation; return show('history'); }
    if (t.hasAttribute('data-ack')) return Data.ack(t.getAttribute('data-ack'));
    if (t.hasAttribute('data-preload')) { var fr = Wall.frames[+t.getAttribute('data-preload')]; return fr && fr.reload(); }
    if (t.hasAttribute('data-pmax')) return Sites.show(Wall.cfg.panes[+t.getAttribute('data-pmax')] || C.SITES[0].id);
  });
  /* BM / EN: saved with the settings (the PC, and so every phone, follows), then the page reloads in that language */
  function setLanguage(l) {
    var ns = Object.assign({}, state.settings, { lang: l });
    Data.saveSettings(ns).catch(function () { }).then(function () { I18N.setLang(l); save('mc_settings', Object.assign({}, state.settings, { lang: l })); location.reload(); });
  }
  $('langBtn').textContent = I18N.lang() === 'en' ? 'BM' : 'EN';
  $('langBtn').title = I18N.lang() === 'en' ? 'Tukar ke Bahasa Melayu' : 'Switch to English';
  $('langBtn').onclick = function () { setLanguage(I18N.lang() === 'en' ? 'ms' : 'en'); };
  $('profBtn').onclick = function (e) { e.stopPropagation(); renderProfiles(); $('profMenu').hidden = !$('profMenu').hidden; };
  $('closeAllBtn').onclick = function () { Sites.closeAll(); };
  $('f_gustKmh').addEventListener('input', function () { $('gustKt').textContent = this.value + L(' km/j = ') + Math.round(C.kt(+this.value || 0)) + ' knot'; });
  $('f_kind').addEventListener('change', function () { document.documentElement.setAttribute('data-kind', this.value); });
  $('newProfAdd').onclick = function () {
    var name = $('newProfName').value.trim(), lat = parseFloat($('newProfLat').value), lon = parseFloat($('newProfLon').value), kind = $('newProfKind').value;
    if (!name) return toast(L('Isi nama profil'), '', 'warning');
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return toast(L('Koordinat tidak sah'), L('Contoh: 5.5501 dan 104.7745'), 'warning');
    var prof = { name: name, kind: kind, lat: lat, lon: lon, riverLat: lat, riverLon: lon };
    if (kind === 'offshore') { prof.marineLat = lat; prof.marineLon = lon; }
    Data.profile('save', { profile: prof, activate: true }).then(function () {
      ['newProfName', 'newProfLat', 'newProfLon'].forEach(function (i) { $(i).value = ''; });
      state.dirty = false;
      toast(L('Profil ditambah'), name + L(' kini aktif'));
    }).catch(function (er) { toast(L('Gagal tambah profil'), er.message, 'warning'); });
  };
  $('sideSearch').addEventListener('input', renderSide);
  $('sideSearch').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var b = $('sideList').querySelector('[data-site]'); if (b) b.click(); } });
  $('railSide').onclick = function () { toggleSide(); };
  $('topMenu').onclick = function () { toggleSide(); };
  $('railTheme').onclick = function () { setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); };
  $('railPhone').onclick = $('btnSetup').onclick = function () { if (D && D.openPhoneSetup) D.openPhoneSetup(); };
  /* Monsoon EYE / OceanWATCH PC app: no phone sharing (iPad and phone use the web app) */
  if (D && !D.openPhoneSetup) { $('railPhone').hidden = true; var fs0 = $('btnSetup').closest('.fld'); if (fs0) fs0.hidden = true; }
  $('btnDataDir').onclick = function () { if (D) D.openDataDir(); };
  /* ---- relay settings: make a key, copy / download the worker script, test the relay */
  function relayMsg(text, kind) { var m = $('relayMsg'); m.textContent = text; m.className = 'relay-msg muted' + (kind ? ' ' + kind : ''); }
  function newKey() {
    var a = new Uint8Array(18), abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', k = '';
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) k += abc[a[i] % abc.length];
    return k;
  }
  function relayScript() {
    var key = ($('f_relayKey').value || '').trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) { key = newKey(); $('f_relayKey').value = key; state.dirty = true; }
    return fetch('relay-worker.js', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { return C.relayCode(t, key, location.origin + location.pathname.replace(/[^/]*$/, '') + 'relay-tweaks.js'); });
  }
  $('relayNewKey').onclick = function () { $('f_relayKey').value = newKey(); state.dirty = true; relayMsg(L('Kunci baru dibuat. Simpan, kemudian salin & tampal skrip relay sekali lagi di Cloudflare.')); };
  $('relayCopy').onclick = function () {
    relayScript().then(function (code) {
      var done = function () { relayMsg(L('Skrip disalin. Tampal di Cloudflare (Edit code), kemudian tekan Simpan di sini.'), 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(code).then(done);
      var ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
    }).catch(function (e) { relayMsg(L('Tidak dapat salin: ') + e.message + L(' - guna Muat turun skrip.'), 'bad'); });
  };
  $('relayDownload').onclick = function () {
    relayScript().then(function (code) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      a.download = APPNAME.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-relay.js';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      relayMsg(L('Skrip dimuat turun: ') + APPNAME.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-relay.js', 'ok');
    }).catch(function (e) { relayMsg(e.message, 'bad'); });
  };
  /* Test: the relay answers, the key is right, then every blue-dot site through it. Sites the relay cannot fetch are
     remembered (relayBad) and open in the browser instead. Desktop: done by the main process (the app page may only
     talk to this PC). Phone / browser: done here. A test that reached the relay saves the settings by itself. */
  var RELAY_WHY = {
    dns: 'Cloudflare tidak dapat mencari alamat laman ini (DNS)',
    refused: 'laman menolak permintaan dari Cloudflare',
    down: 'laman tidak membalas melalui Cloudflare',
    http: 'laman membalas ralat'
  };
  function relayTargets() {
    var snapSites = (state.snap && state.snap.sites) || {};
    var fresh = Object.assign({}, state.settings, { relayBad: '' });
    return C.SITES.filter(function (x) { return C.siteBlocked(x, snapSites[x.id]) && (!C.relayReady(fresh) || C.relayFor(x, fresh)); })
      .map(function (x) { return { id: x.id, url: C.siteUrl(x, state.settings) }; })
      /* stand-ins on other relayed pages (e.g. JPS rainfall for Rainfall Kemaman) are checked too */
;
  }
  function relayCheck(s, targets) {
    if (!C.relayReady(s)) return Promise.resolve({ code: 'missing', sites: [] });
    if (D && D.relayTest) return D.relayTest(s.relayUrl, s.relayKey, targets);
    return fetch(s.relayUrl + '/', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
      if (!/Relay is running/.test(t)) return { code: 'notrelay', sites: [] };
      var sites = [], stop = null, old = !/relay v(\d+)/i.test(t) || +/relay v(\d+)/i.exec(t)[1] < 3;
      return targets.reduce(function (p, x) {
        return p.then(function () {
          if (stop) return;
          return fetch(C.relayUrlFor(x.url, s), { cache: 'no-store', redirect: 'manual' }).then(function (r) {
            /* the relay's own answers are 404 (key) / 403 (site list); a browser may not see the x-relay mark of older scripts */
            var via = !!r.headers.get('x-relay') || (r.status !== 404 && r.status !== 403);
            var v = r.type === 'opaqueredirect' ? 'ok' : C.relayVerdict(r.status, via);
            if (!/^alt:/.test(x.id) && (v === 'badkey' || v === 'notallowed' || v === 'notrelay')) stop = v;
            else sites.push({ id: x.id, status: r.status, verdict: v });
          }).catch(function () { sites.push({ id: x.id, status: 0, verdict: 'down' }); });
        });
      }, Promise.resolve()).then(function () { return stop ? { code: stop, sites: [] } : { code: 'done', sites: sites, old: old }; });
    }).catch(function () { return { code: 'unreachable', sites: [] }; });
  }
  var RELAY_STOP = {
    missing: 'Isi alamat relay (https://…workers.dev) dan kunci dahulu.',
    unreachable: 'tidak dapat dihubungi - semak alamat relay dan sambungan internet',
    notrelay: 'alamat itu bukan relay Dashboard Cuaca Aziz',
    badkey: 'kunci tidak sepadan dengan skrip di Cloudflare - salin & tampal skrip sekali lagi',
    notallowed: 'laman tidak dibenarkan oleh skrip - salin & tampal skrip terbaru'
  };
  function relayBadInfo() {
    var bad = C.adHosts(state.settings.relayBad), el = $('relayBadInfo');
    el.hidden = !bad.length || !C.relayReady(state.settings);
    var subs = C.SITES.filter(function (x) { return C.siteBlocked(x, ((state.snap && state.snap.sites) || {})[x.id]) && !C.relayFor(x, state.settings) && C.altFor(x, state.settings); })
      .map(function (x) { return L(x.title); });
    el.textContent = (subs.length ? L('Laman ganti dalam app: ') + subs.join(', ') + '. ' : '') + (bad.length ? L('Relay tidak dapat mengambil: ') + bad.join(', ') : '');
  }
  $('relayTest').onclick = function () {
    var s = C.cleanSettings(Object.assign({}, state.settings, { relayUrl: $('f_relayUrl').value, relayKey: $('f_relayKey').value }));
    var targets = relayTargets();
    relayMsg(L('Menguji…'));
    relayCheck(s, targets).then(function (r) {
      if (r.code !== 'done') {
        return relayMsg(r.code === 'missing' ? L(RELAY_STOP.missing) : L('✗ Relay gagal: ') + L(RELAY_STOP[r.code] || RELAY_STOP.unreachable), 'bad');
      }
      var alts = r.sites.filter(function (x) { return /^alt:/.test(x.id); });
      r.sites = r.sites.filter(function (x) { return !/^alt:/.test(x.id); });
      var ok = r.sites.filter(function (x) { return x.verdict === 'ok'; }), bad = r.sites.filter(function (x) { return x.verdict !== 'ok'; });
      var m = $('relayMsg');
      m.className = 'relay-msg ' + (ok.length ? 'ok' : 'bad');
      m.innerHTML = '<b>' + esc(ok.length ? L('✓ Relay berfungsi: {a} daripada {b} laman titik biru dipaparkan di dalam app.', { a: ok.length, b: r.sites.length })
        : L('✗ Relay berjalan, tetapi tiada laman titik biru dapat diambil melaluinya.')) + '</b>' +
        r.sites.map(function (x) {
          var site = C.siteById(x.id);
          return '<div class="rl ' + (x.verdict === 'ok' ? 'y' : 'n') + '">' + (x.verdict === 'ok' ? '✓ ' : '✗ ') + esc(L(site ? site.title : x.id)) +
            (x.verdict === 'ok' ? '' : ' - ' + esc(L(RELAY_WHY[x.verdict] || RELAY_WHY.http)) + (x.status ? ' (HTTP ' + x.status + ')' : '') + esc(L(' → dibuka di pelayar'))) + '</div>';
        }).join('') + alts.map(function (x) {
          var site = C.siteById(x.id.slice(4));
          return '<div class="rl ' + (x.verdict === 'ok' ? 'y' : 'n') + '">' + (x.verdict === 'ok' ? '✓ ' : '✗ ') + esc(x.id === 'alt:jpsdata' ? L('Paras air & hujan JPS untuk dashboard') : L('Laman ganti untuk {s}', { s: L(site ? site.title : x.id) })) +
            (x.verdict === 'ok' ? '' : ' - ' + esc(L(RELAY_WHY[x.verdict] || RELAY_WHY.http)) + (x.status ? ' (HTTP ' + x.status + ')' : '')) + '</div>';
        }).join('') + (r.old ? '<div class="rl n">' + esc(L('⚠ Skrip relay di Cloudflare versi lama. Tekan Salin skrip relay, tampal di Cloudflare (Edit code) dan Deploy sekali lagi.')) + '</div>' : '');
      /* remember the sites the relay cannot fetch, and save what was tested */
      var badHosts = bad.map(function (x) { try { return new URL(C.siteUrl(C.siteById(x.id), s)).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }).filter(Boolean);
      $('f_relayBad').value = badHosts.join(', ');
      $('f_relayAltOff').value = alts.filter(function (x) { return x.verdict !== 'ok'; }).map(function (x) { return x.id.slice(4); }).join(', ');
      Data.saveSettings(Settings.read()).then(function () { state.dirty = false; relayBadInfo(); if (!isDesktop) Sites.rebuildBlocked(); renderSide(); })
        .catch(function (e) { toast(L('Gagal simpan: ') + e.message, 'err'); });
    }).catch(function () { relayMsg(L('✗ Relay gagal: ') + L(RELAY_STOP.unreachable), 'bad'); });
  };
  $('adUpdate').onclick = function () {
    if (!D || !D.adblockUpdate) return;
    var b = $('adUpdate'); b.disabled = true; $('adStatus').textContent = L('Sedang mengemas kini…');
    D.adblockUpdate().then(function (i) {
      b.disabled = false; adStatus();
      toast(i.error ? L('Kemas kini senarai iklan gagal: ') + i.error : L('Senarai iklan dikemas kini'), i.error ? 'err' : '');
    }).catch(function (e) { b.disabled = false; adStatus(); toast(L('Kemas kini senarai iklan gagal: ') + e.message, 'err'); });
  };
  $('btnClearSites').onclick = function () { if (D && confirm(L('Padam semua cookie & cache laman web? Anda akan log keluar dari laman yang memerlukan log masuk.'))) D.clearSiteData().then(function () { toast(L('Data laman dipadam'), ''); }); };
  $('btnRefresh').onclick = function () { Data.refresh(); };
  $('btnForce').onclick = function () { forceUpdate(); };
  $('btnForce2').onclick = function () { forceUpdate(); };
  $('btnBell').onclick = function () { show('alerts'); };
  $('btnPalette').onclick = function () { Pal.open(); };
  $('palBg').addEventListener('mousedown', function (e) { if (e.target === $('palBg')) Pal.close(); });
  $('palInput').addEventListener('input', function () { Pal.filter(this.value); });
  $('palList').addEventListener('click', function (e) { var li = e.target.closest('[data-i]'); if (li) Pal.go(+li.getAttribute('data-i')); });
  $('sBack').onclick = function () { shortcut('back'); };
  $('sFwd').onclick = function () { shortcut('forward'); };
  $('sReload').onclick = function () { var fr = Sites.cur(); if (fr) fr.reload(); };
  $('sHome').onclick = function () { var fr = Sites.cur(); if (fr) fr.home(); };
  $('sExt').onclick = function () { var fr = Sites.cur(); if (fr) openExternal(fr.url || fr.site.url); };
  $('sZoomIn').onclick = function () { var fr = Sites.cur(); if (fr) fr.setZoom(fr.zoom + 0.5); };
  $('sZoomOut').onclick = function () { var fr = Sites.cur(); if (fr) fr.setZoom(fr.zoom - 0.5); };
  $('sAuto').onchange = function () { if (!Sites.current) return; var v = +this.value; if (v) Sites.auto[Sites.current] = v; else delete Sites.auto[Sites.current]; save('mc_auto', Sites.auto); toast(v ? L('Auto muat semula setiap ') + v + ' min' : L('Auto muat semula ditutup'), ''); };
  $('wLayout').onchange = function () { Wall.cfg.layout = this.value; save('mc_wall', Wall.cfg); Wall.render(); };
  $('wAuto').onchange = function () { Wall.cfg.auto = +this.value; save('mc_wall', Wall.cfg); };
  $('wReloadAll').onclick = function () { Wall.frames.forEach(function (fr) { fr.reload(); }); };
  $('wall').addEventListener('change', function (e) { if (e.target.hasAttribute('data-pane')) Wall.setPane(+e.target.getAttribute('data-pane'), e.target.value); });
  $('hStation').onchange = function () { History.render(); History.fetchFull(); };
  $('hHours').onchange = function () { History.load(); };
  $('hCsv').onclick = function () { History.csv(); };
  $('aAckAll').onclick = function () { Data.ack('all'); };
  $('aTest').onclick = function () { Sound.play('warning', true); Data.test(); };
  $('aMute').onclick = function () { state.mutedUntil = Date.now() < state.mutedUntil ? 0 : Date.now() + 3600000; Alerts.renderView(); };
  $('aSettings').onclick = function () { show('settings'); };
  $('setForm').addEventListener('input', function (e) { if (e.target.closest('#distCard, #myJobsCard, #importCard')) return; if (e.target.id !== 'f_theme' && !/^newProf/.test(e.target.id)) { state.dirty = true; $('setMsg').textContent = L('Belum disimpan'); } });
  $('f_theme').onchange = function () { setTheme(this.value); };
  $('setSave').onclick = function () { Settings.save(); };
  $('setReset').onclick = function () { if (confirm(L('Kembalikan semua tetapan kepada asal?'))) { Data.saveSettings(C.DEFAULTS).then(function () { Settings.fill(); toast(L('Tetapan asal dipulihkan'), ''); }); } };
  $('btnPhoneNotif').onclick = function () {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(function () { Settings.fill(); });
  };
  /* first user gesture unlocks audio in browsers */
  document.addEventListener('pointerdown', function unlock() { try { Sound.ctx = Sound.ctx || new (window.AudioContext || window.webkitAudioContext)(); Sound.ctx.resume(); } catch (e) { /* */ } document.removeEventListener('pointerdown', unlock); });

  /* ------------------------------------------------------------------ PWA */
  if (!isDesktop && 'serviceWorker' in navigator && (location.protocol === 'https:' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname))) {
    /* a new version takes over by itself: the page reloads once (no "close and open again") */
    var swReg = null;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (r) { swReg = r; }).catch(function () { });
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) return;
      var k = 'mc_sw_reload', last = 0;
      try { last = +sessionStorage.getItem(k) || 0; sessionStorage.setItem(k, String(Date.now())); } catch (e) { /* */ }
      if (Date.now() - last > 30000) location.reload();
    });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && swReg) swReg.update().catch(function () { }); });
  }

  /* ---------------------------------------------------------------- start */
  /* the saved settings may already ask for the other language */
  if (state.settings.lang && state.settings.lang !== I18N.lang() && load('mc_settings', null)) { I18N.setLang(state.settings.lang); location.reload(); return; }
  if (load('mc_side_off', true) && window.innerWidth > 820) $('app').classList.add('side-off');   /* Monsoon EYE / OceanWATCH: the site list starts hidden (menu Laman opens it) */
  /* "Senyap semua": a reminder each time the app is opened (or comes back after 10 minutes), with a button to turn the sound on */
  var MuteNote = {
    hiddenAt: 0,
    check: function () {
      var old = $('muteNote'); if (old) old.remove();
      if (state.settings.soundLevel !== 'none') return;
      var t = document.createElement('div');
      t.className = 'toast warning mute'; t.id = 'muteNote'; t.setAttribute('role', 'alert');
      t.innerHTML = '<b>🔕 ' + esc(L('Semua bunyi alert disenyapkan')) + '</b>' + esc(L('Alert tetap dipapar, tapi tiada bunyi.')) +
        '<div class="row"><button class="btn sm pri" type="button" data-mute="on">🔔 ' + esc(L('Hidupkan bunyi')) + '</button><button class="btn sm" type="button" data-mute="close">' + esc(L('Biar senyap')) + '</button></div>';
      t.addEventListener('click', function (e) {
        var a = e.target.getAttribute('data-mute'); if (!a) return;
        t.remove();
        if (a === 'on') Data.saveSettings(Object.assign({}, state.settings, { soundLevel: 'critical', profileName: state.settings.locationName })).then(function () {
          if (state.view === 'settings') Settings.fill();
          toast('🔔 ' + L('Bunyi dihidupkan'), L('Kritikal / Bahaya sahaja - tukar di Tetapan'));
        });
      });
      $('toasts').appendChild(t);
      setTimeout(function () { t.remove(); }, 60000);
    }
  };
  setTimeout(MuteNote.check, 2500);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) MuteNote.hiddenAt = Date.now();
    else if (MuteNote.hiddenAt && Date.now() - MuteNote.hiddenAt > 10 * 60000) MuteNote.check();
  });
  $('verFoot').textContent = 'v' + C.VERSION;
  if (isDesktop) { try { var info = D.info(); $('verFoot').textContent = 'v' + (info.version || C.VERSION); } catch (e) { /* */ } }
  document.documentElement.setAttribute('data-kind', state.settings.kind);
  if ($('linksSub')) $('linksSub').textContent = C.SITES.length + L(' laman · klik untuk buka dalam app');
  renderProfiles();
  $('aboutMode').textContent = isDesktop ? L('App desktop (pengumpul data)') : L('Menyambung…');
  Sites.tabs();
  renderSide();
  show('dashboard');
  /* ---- same settings on another device (web app): a link that carries them, no QR, nothing stored anywhere else */
  function b64e(t) { return btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return decodeURIComponent(escape(atob(t))); }
  function moveLink() {
    var s = Object.assign({}, state.settings);
    delete s.relayBad; delete s.relayAltOff;          /* each device tests its own relay */
    var data = { v: 1, s: s, p: state.profiles, theme: document.documentElement.getAttribute('data-theme') || 'dark' };
    return location.origin + location.pathname + location.search + '#setup=' + b64e(JSON.stringify(data));
  }
  function moveMsg(t, kind) { var m = $('moveMsg'); m.textContent = t; m.className = 'relay-msg muted' + (kind ? ' ' + kind : ''); }
  $('moveCopy').onclick = function () {
    var link = moveLink();
    var done = function () { moveMsg(L('Pautan disalin. Hantar kepada diri sendiri, kemudian buka di peranti lain.'), 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { window.prompt(L('Salin pautan ini:'), link); });
    else window.prompt(L('Salin pautan ini:'), link);
  };
  $('moveShare').onclick = function () {
    var link = moveLink();
    if (navigator.share) navigator.share({ title: APPNAME, text: L('Tetapan') + ' ' + APPNAME, url: link }).catch(function () { });
    else $('moveCopy').onclick();
  };
  $('moveShare').hidden = !navigator.share;
  $('movePaste').onclick = function () {
    var t = window.prompt(L('Tampal pautan tetapan di sini:'), '');
    if (!t) return;
    if (!/#setup=[A-Za-z0-9_-]+/.test(t)) { moveMsg(L('Itu bukan pautan tetapan Dashboard Cuaca Aziz.'), 'bad'); return; }
    takeSetupLink(t);
  };
  function takeSetupLink(text) {
    var m = /#setup=([A-Za-z0-9_-]+)/.exec(text || location.hash || '');
    if (!m) return;
    if (!text) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* */ } }
    var data;
    try { data = JSON.parse(b64d(m[1])); } catch (e) { toast(L('Pautan tetapan rosak'), L('Salin pautan sekali lagi dari peranti asal.'), 'warning'); return; }
    if (!data || data.v !== 1 || !data.s) return;
    if (!confirm(L('Guna tetapan dari peranti lain (relay, profil, ambang alert)? Tetapan di peranti ini akan diganti.'))) return;
    var ns = C.cleanSettings(data.s);
    ns.relayBad = ''; ns.relayAltOff = '';
    if (data.p && data.p.profiles && data.p.profiles.length) {
      var profs = data.p.profiles.slice(0, 20).map(function (x) { return C.cleanProfile(x); });
      var act = profs.some(function (x) { return x.id === data.p.active; }) ? data.p.active : profs[0].id;
      state.profiles = { active: act, profiles: profs }; save('mc_profiles', state.profiles);
    }
    save('mc_settings', ns); state.settings = ns; state.snap = null; save('mc_snap', null);
    if (data.theme === 'light' || data.theme === 'dark') { try { localStorage.setItem('mc_theme', data.theme); } catch (e) { /* */ } }
    if (ns.lang !== I18N.lang()) { I18N.setLang(ns.lang); location.reload(); return; }
    document.documentElement.setAttribute('data-theme', data.theme || 'dark');
    toast(L('Tetapan disalin ✓'), L('Uji relay sekali di Tetapan › Relay laman.'), null, 8000);
    if (text) { renderProfiles(); Settings.fill(); Sites.rebuildBlocked(); state.mode === 'direct' ? Direct.run() : Data.saveSettings(ns); }
  }
  if (!isDesktop) takeSetupLink();

  Data.start();
  /* model data while the app is open: every minute check whether it is due (omEveryMin, slower near the free daily limit) */
  setInterval(function () {
    if (document.visibilityState === 'hidden') return;
    if (state.mode === 'direct') Direct.earlyOnly();
    else if (state.settings.kind === 'offshore') Off.load(false);
  }, 60000);
  window.MC = { printHtml: printHtml, state: state, Off: Off, Adv: Adv, renderAll: renderAll, show: show, Sites: Sites, Data: Data, Wall: Wall, History: History, onAlerts: onAlerts, switchProfile: switchProfile, /* for tests / dev tools */
    /* for edition-ui.js (Monsoon EYE / OceanWATCH) */
    EXT: EXT, TITLES: TITLES, toast: toast, esc: esc, f: f, load: load, save: save, fetchT: fetchT, openExternal: openExternal, OM: OM, Early: Early, Settings: Settings,
    setTitle: setTitle, renderProfiles: renderProfiles, setProfiles: setProfiles, applySettings: applySettings, renderRiskCard: renderRiskCard, MIRROR: MIRROR, isWeb: isWeb, chip: chip, trendHtml: trendHtml,
    activeAlerts: activeAlerts, metCard: metCard, toggleSide: toggleSide, Direct: Direct, Native: Native, forceUpdate: forceUpdate,
    isDesktop: isDesktop, desk: D, pcGet: pcGet };
})();
