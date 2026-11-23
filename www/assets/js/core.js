/* Dashboard Cuaca Aziz - shared core.
   One file used by BOTH the desktop main process (require) and the page (script tag):
   - the list of 16 web sites (sidebar, wall, palette, health check, certificate allow-list)
   - default settings
   - data source URLs and the parsers that turn each API / scraped table into one "snapshot"
   - alert rules (thresholds) and the "what is new since last time" check
   Nothing in here touches the network or the disk, so it can be unit-tested with fixtures. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./i18n'));
  else root.MCCore = factory(root.MCI18n);
})(typeof self !== 'undefined' ? self : this, function (I18N) {
  'use strict';
  /* L(text in BM) -> English when the language is EN (see i18n.js). Texts are written in BM here and translated on use. */
  function L(s, vars) { return I18N ? I18N.L(s, vars) : s; }

  /* which app this copy is (Monsoon EYE = land, OceanWATCH = offshore): edition.js, loaded first; none = the original combined app (tests) */
  var ED = (typeof self !== 'undefined' && self.EDITION) || (typeof global !== 'undefined' && global.EDITION) || null;
  var VERSION = ED ? ED.version : '4.6.0';
  var TZ_OFFSET_MIN = 480; /* Malaysia, UTC+8, no daylight saving */

  /* ------------------------------------------------------------------ sites
     url may hold {lat} / {lon}: those sites follow the active profile's location (marked "ikut profil").
     Every site added in 3.1 was checked first: free, no account needed. */
  var CATEGORIES = [
    { id: 'banjir', name: 'Banjir & Paras Air', icon: '🌊', items: [
      { id: 'waterlevel', title: 'Water Level Kemaman', desc: 'Paras air Daerah Kemaman', icon: '📊', url: 'https://infobanjir.terengganu.gov.my/WaterLevel/District/4' },
      { id: 'rainfall', title: 'Rainfall Kemaman', desc: 'Data hujan real-time', icon: '🌧️', url: 'https://infobanjir.terengganu.gov.my/Rainfall/District/4' },
      { id: 'floodhub', title: 'Flood Hub Chukai', desc: 'Aliran sungai & ramalan 30 hari (GloFAS)', icon: '💧', url: 'https://sites.research.google/floods/l/4.226693947058215/103.41916850003622/13.39981973087496/p/ChIJYVEG9-SGyDERjwlnnLGhe5E?layers=1' },
      { id: 'infobanjir', title: 'Info Banjir Terengganu', desc: 'Portal banjir Terengganu', icon: '🌊', url: 'https://infobanjir.terengganu.gov.my/' },
      { id: 'jpsaras', title: 'JPS Aras Air Terengganu', desc: 'Public Infobanjir (JPS Malaysia) · daerah profil', icon: '📏', profile: true, url: 'https://publicinfobanjir.water.gov.my/aras-air/data-paras-air/?state=TRG&type=NEGERI&lang=en#dcdistrict={district}', added: true },
      { id: 'jpspeta', title: 'JPS Peta Infobanjir', desc: 'Peta hujan & aras air seluruh negara', icon: '🗺️', url: 'https://publicinfobanjir.water.gov.my/main/', added: true }
    ] },
    { id: 'cuaca', name: 'Cuaca & Radar', icon: '🌧️', items: [
      { id: 'zoomearth', title: 'Zoom Earth Chukai', desc: 'Radar & satelit', icon: '🛰️', url: 'https://zoom.earth/places/malaysia/chukai/#map=radar' },
      { id: 'windy', title: 'Windy Kemaman', desc: 'Ramalan cuaca interaktif', icon: '🌪️', url: 'https://www.windy.com/4.245/103.408?rain,3.494,103.409,8' },
      { id: 'ventusky', title: 'Ventusky', desc: 'Peta hujan', icon: '⛈️', url: 'https://www.ventusky.com/precipitation-map/from#p=4.12;103.13;8' },
      { id: 'rainviewer', title: 'Rain Radar', desc: 'Radar hujan langsung', icon: '📡', url: 'https://www.rainviewer.com/map.html?loc=4.245,103.408,8' },
      { id: 'metmalaysia', title: 'Met Malaysia', desc: 'Ramalan rasmi Kemaman', icon: '🌤️', url: 'https://www.met.gov.my/en/forecast/weather/district/Ds065/' },
      { id: 'metradar', title: 'Radar MET Semenanjung', desc: 'Imej radar rasmi MET Malaysia', icon: '🎯', url: 'https://www.met.gov.my/en/pencerapan/radar-semenanjung/', added: true },
      { id: 'meteoblue', title: 'Meteoblue 7 hari', desc: 'Ramalan harian kedua (model lain) · ikut lokasi profil', icon: '📅', url: 'https://www.meteoblue.com/en/weather/widget/daily/{mb}?geoloc=fixed&days=7&tempunit=CELSIUS&windunit=KILOMETER_PER_HOUR&precipunit=MILLIMETER&coloured=coloured&pictoicon=1&maxtemperature=1&mintemperature=1&windspeed=1&windgust=1&winddirection=1&uv=0&humidity=0&precipitation=1&precipitationprobability=1&spot=0&pressure=0&layout=dark', profile: true, added: true },
      { id: 'himawari', title: 'Satelit Himawari', desc: 'Imej satelit terkini (CIRA SLIDER)', icon: '🌏', url: 'https://slider.cira.colostate.edu/?sat=himawari&sec=full_disk', added: true }
    ] },
    { id: 'offshore', name: 'Offshore & Laut', icon: '🛢️', items: [
      { id: 'windywave', title: 'Windy Ombak', desc: 'Peta ombak · ikut lokasi profil', icon: '🌊', url: 'https://www.windy.com/{lat}/{lon}?waves,{lat},{lon},8', profile: true, added: true },
      { id: 'windywind', title: 'Windy Angin', desc: 'Peta angin · ikut lokasi profil', icon: '💨', url: 'https://www.windy.com/{lat}/{lon}?wind,{lat},{lon},8', profile: true, added: true },
      { id: 'nullschool', title: 'Earth Nullschool Ombak', desc: 'Tinggi ombak animasi · ikut lokasi profil', icon: '🌐', url: 'https://earth.nullschool.net/#current/ocean/primary/waves/overlay=significant_wave_height/orthographic={lon},{lat},3000', profile: true, added: true },
      { id: 'windyswell', title: 'Windy Swell', desc: 'Alun: tinggi, tempoh, arah · ikut lokasi profil', icon: '〰️', url: 'https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km%2Fh&product=ecmwf&level=surface&detail=true&marker=true&zoom=7&overlay=swell1&lat={lat}&lon={lon}&detailLat={lat}&detailLon={lon}', profile: true, added: true, sea: true },
      { id: 'blitzortung', title: 'Peta Kilat Blitzortung', desc: 'Panahan kilat langsung · ikut lokasi profil', icon: '⚡', url: 'https://map.blitzortung.org/#7/{lat}/{lon}', profile: true, added: true,
        note: 'Untuk rujukan sahaja: laman ini menyatakan datanya bukan untuk melindungi orang atau peralatan.' },
      { id: 'metmarine', title: 'Ramalan Marin MET', desc: 'Ramalan & amaran laut rasmi MET Malaysia', icon: '⚓', url: 'https://www.met.gov.my/en/forecast/marine/', added: true },
      { id: 'vesselfinder', title: 'VesselFinder', desc: 'Kedudukan kapal (AIS)', icon: '🚢', url: 'https://www.vesselfinder.com/', added: true },
      { id: 'marinetraffic', title: 'MarineTraffic', desc: 'Peta kapal (AIS) · ikut lokasi profil', icon: '⚓', url: 'https://www.marinetraffic.com/en/ais/embed/zoom:9/centery:{lat}/centerx:{lon}/maptype:4/shownames:false/mmsi:0/shipid:0/fleet:/fleet_id:/vtypes:/showmenu:/remember:false', profile: true, sea: true, added: true }
    ] },
    { id: 'marine', name: 'Pasang Surut', icon: '⚓', items: [
      { id: 'tideforecast', title: 'Tide Forecast', desc: 'Pasang surut 30 hari', icon: '🌊', url: 'https://www.tide-forecast.com/locations/Cukai/tides/latest', ads: true },
      { id: 'tideschart', title: 'Tides Chart', desc: 'Carta pasang surut', icon: '📈', url: 'https://www.tideschart.com/Malaysia/Terengganu/Cukai/', ads: true },
      { id: 'tides4fishing', title: 'Tides 4 Fishing', desc: 'Aktiviti solunar', icon: '🎣', url: 'https://tides4fishing.com/my/terengganu/chukai', ads: true }
    ] },
    { id: 'kamera', name: 'Kamera & Visual', icon: '📹', items: [
      { id: 'camera', title: 'Info Banjir Camera', desc: 'CCTV banjir seluruh Terengganu', icon: '📷', url: 'https://infobanjir.terengganu.gov.my/Camera' },
      { id: 'webcam', title: 'Webcam Teladas', desc: 'Jambatan Lama Teladas', icon: '🎥', url: 'https://www.windy.com/-Webcams-Kemaman-District:-Jambatan-Lama-Teladas/webcams/1733738208?4.734,103.299,9' },
      { id: 'jalanow', title: 'JalaNow Traffic Cams', desc: 'Kamera trafik lebuh raya', icon: '🚗', url: 'https://jalanow.com/malaysia-highways-live-traffic-cameras.htm', ads: true }
    ] },
    { id: 'kecemasan', name: 'Amaran & Kecemasan', icon: '🚨', items: [
      { id: 'nadma', title: 'Portal NADMA', desc: 'Maklumat PPS & bantuan', icon: '🏕️', url: 'https://portalbencana.nadma.gov.my/ms/' },
      { id: 'storms', title: 'Ribut Tropika', desc: 'Penjejak taufan & ribut (Zoom Earth)', icon: '🌀', url: 'https://zoom.earth/storms/', added: true }
    ] }
  ];
  /* each app shows only its own sites (tools/editions.js) */
  if (ED && ED.sites) {
    CATEGORIES.forEach(function (c) { c.items = c.items.filter(function (s) { return ED.sites.indexOf(s.id) >= 0; }); });
    CATEGORIES = CATEGORIES.filter(function (c) { return c.items.length; });
  }
  var SITES = [];
  CATEGORIES.forEach(function (c) { c.items.forEach(function (s) { s.category = c.id; SITES.push(s); }); });
  /* sites known to refuse being shown inside another app (seen 19-20 Nov 2026). The web app and the phone without the PC use
     this list; with the PC, its live check decides (snapshot sites[id].frameable). */
  ['waterlevel', 'rainfall', 'floodhub', 'infobanjir', 'jpsaras', 'jpspeta', 'zoomearth', 'storms', 'metradar', 'metmalaysia', 'vesselfinder',
    'windy', 'windywave', 'windywind', 'webcam', 'camera', 'himawari', 'tideforecast', 'tideschart', 'tides4fishing', 'nadma', 'metmarine'].forEach(function (id) {
    SITES.forEach(function (s) { if (s.id === id) s.noFrame = true; });
  });
  /* iPad / phone: a stand-in for a site that refuses framing and that the relay cannot fetch (or with no relay).
     Same source of data, shown inside the app. "relay": needs the relay (another site that refuses framing). */
  var WINDY = 'https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km%2Fh&product=ecmwf&level=surface&detail=true&marker=true';
  var ALT = {
    waterlevel: { prefer: true, url: 'kemaman.html?tab=water', local: true, page: true, title: 'Paras Air Kemaman (data JPS 5 minit, mirror GitHub)' },
    jpsaras: { view: 'dashboard', anchor: 'cardWater', title: 'Paras air JPS di Dashboard (mirror GitHub)' },
    infobanjir: { view: 'dashboard', anchor: 'cardWater', title: 'Paras air JPS di Dashboard (mirror GitHub)' },
    rainfall: { prefer: true, url: 'kemaman.html?tab=rain', local: true, page: true, title: 'Hujan Kemaman (data JPS 5 minit, mirror GitHub)' },
    tideforecast: { view: 'dashboard', anchor: 'cardTide', title: 'Pasang surut Cukai di Dashboard (mirror GitHub Tide Forecast)' },
    tideschart: { view: 'dashboard', anchor: 'cardTide', title: 'Pasang surut Cukai di Dashboard' },
    tides4fishing: { view: 'dashboard', anchor: 'cardTide', title: 'Pasang surut Cukai di Dashboard' },
    metmalaysia: { view: 'dashboard', anchor: 'cardMet', title: 'Ramalan & amaran MET di Dashboard (data rasmi MET)' },
    metmarine: { view: 'dashboard', anchor: 'cardWarn', title: 'Amaran laut MET di Dashboard (data rasmi MET)' },
    floodhub: { prefer: true, url: 'kemaman.html?tab=flow', local: true, page: true, title: 'Aliran Sungai Kemaman (GloFAS, ramalan 30 hari)' },
    jpspeta: { view: 'dashboard', anchor: 'cardWater', title: 'Paras air JPS di Dashboard (mirror GitHub)' },
    himawari: { prefer: true, url: 'https://www.ventusky.com/?p={lat};{lon};5&l=satellite', title: 'Ventusky - satelit (imej Himawari) - CIRA SLIDER hanya boleh dilihat di lamannya sendiri' },
    windy: { prefer: true, url: WINDY + '&zoom=8&overlay=rain&lat={lat}&lon={lon}&detailLat={lat}&detailLon={lon}', title: 'Windy (versi embed) - hujan & ribut petir' },
    windywave: { prefer: true, url: WINDY + '&zoom=7&overlay=waves&lat={mlat}&lon={mlon}&detailLat={mlat}&detailLon={mlon}', title: 'Windy (versi embed) - ombak' },
    windywind: { prefer: true, url: WINDY + '&zoom=7&overlay=wind&lat={mlat}&lon={mlon}&detailLat={mlat}&detailLon={mlon}', title: 'Windy (versi embed) - angin' },
    metradar: { url: 'https://www.rainviewer.com/map.html?loc={lat},{lon},7&oFa=0&oC=1&oU=0&oCS=1&oF=0&oAP=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1', title: 'RainViewer - radar hujan langsung' },
    zoomearth: { prefer: true, url: 'https://www.ventusky.com/?p={lat};{lon};6&l=satellite', title: 'Ventusky - satelit (imej Himawari) - Zoom Earth sering gagal melalui relay' },
    storms: { url: WINDY + '&zoom=4&overlay=wind&lat={lat}&lon={lon}&detailLat={lat}&detailLon={lon}', title: 'Windy (versi embed) - angin & ribut tropika' },
    webcam: { prefer: true, url: 'https://webcams.windy.com/webcams/public/embed/player/1733738208/day', title: 'Webcam Jambatan Lama Teladas (Windy Webcams embed)' },
    vesselfinder: { prefer: true, url: 'embed/vessels.html?lat={mlat}&lon={mlon}&zoom=8', local: true, title: 'VesselFinder - peta kapal (versi embed rasmi)' }
  };

  /* -> { kind: 'url' | 'view', url, viaRelay, title, view, anchor } or null when no stand-in can be shown here */
  function altFor(site, s) {
    var a = site && ALT[site.id];
    if (!a) return null;
    if (String((s && s.relayAltOff) || '').split(/[\s,]+/).indexOf(site.id) >= 0) return null;
    if (a.view) return { kind: 'view', view: a.view, anchor: a.anchor, title: a.title };
    var fill = function (u) {
      var g = function (k) { return (+((s && s[k]) || DEFAULTS[k])).toFixed(4); };
      return u.replace(/\{lat\}/g, g('lat')).replace(/\{lon\}/g, g('lon')).replace(/\{mlat\}/g, g('marineLat')).replace(/\{mlon\}/g, g('marineLon'));
    };
    if (a.site) {
      var other = siteById(a.site);
      if (!other || !relayFor(other, s)) return null;
      return { kind: 'url', url: siteUrl(other, s), viaRelay: true, title: a.title, altSite: other.id };
    }
    if (a.relay) {
      if (!relayFor({ id: site.id, url: a.url }, s)) return null;
      return { kind: 'url', url: a.url, viaRelay: true, title: a.title };
    }
    return { kind: 'url', url: fill(a.url), viaRelay: false, local: !!a.local, page: !!a.page, title: a.title };
  }
  function siteBlocked(site, health) { return health && typeof health.frameable === 'boolean' ? !health.frameable : !!(site && site.noFrame); }
  function siteById(id) { for (var i = 0; i < SITES.length; i++) if (SITES[i].id === id) return SITES[i]; return null; }
  function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; } }
  /* the address of a site for a profile: {lat} / {lon} filled in from the profile's sea point (or its location) */
  function siteUrl(site, s) {
    if (!site || !site.profile) return site ? site.url : '';
    s = s || DEFAULTS;
    var sea = s.kind === 'offshore' || site.sea;
    var lat = sea ? s.marineLat : s.lat, lon = sea ? s.marineLon : s.lon;
    var mb = Math.abs(lat).toFixed(3) + (lat >= 0 ? 'N' : 'S') + Math.abs(lon).toFixed(3) + (lon >= 0 ? 'E' : 'W');
    return site.url.replace(/\{lat\}/g, (+lat).toFixed(3)).replace(/\{lon\}/g, (+lon).toFixed(3)).replace('{mb}', mb)
      .replace('{district}', encodeURIComponent(s.waterDistrict || 'ALL'));
  }

  /* a MET warning about the sea (strong winds & rough seas, waves, swell, sea level) - not rain / floods / thunderstorms on land */
  function metIsSea(w) {
    var t = String([w && w.title_bm, w && w.title_en].join(' ')).toLowerCase();
    return /laut|sea\b|seas\b|ombak|wave|swell|perairan|waters|angin kencang|strong wind/.test(t) && !/hujan|rain|banjir|flood/.test(t);
  }
  /* government sites whose certificate chain is often incomplete: accepted anyway, and ONLY these */
  var CERT_ALLOW = ['infobanjir.terengganu.gov.my', 'terengganu.gov.my', 'met.gov.my', 'nadma.gov.my', 'water.gov.my'];
  function certAllowed(host) {
    host = String(host || '').toLowerCase();
    return CERT_ALLOW.some(function (d) { return host === d || host.slice(-(d.length + 1)) === '.' + d; });
  }

  /* --------------------------------------------------------------- settings
     Settings = global (refresh, sound, tray...) + the ACTIVE profile (location, sources, thresholds).
     PROFILE_KEYS are kept per profile; everything else is shared. */
  var DEFAULTS = {
    locationName: 'Kemaman', kind: 'land', lat: 4.2324, lon: 103.4229,
    marineLat: 4.26, marineLon: 103.52,
    riverLat: 4.225, riverLon: 103.375,  /* GloFAS cell on the main Sungai Kemaman below the Cherul junction (4.25, 103.40 fell on a side stream) */
    metLocationId: 'Ds065',
    warningKeywords: 'Terengganu, Kemaman',
    waterDistrict: 'Kemaman',
    refreshMin: 10,
    waterAlertLevel: 'alert',        /* alert = Waspada, warning = Amaran, danger = Bahaya */
    waterRiseM: 0.5,                 /* naik >= x m dalam ~1 jam */
    rain3hMm: 20, rain24hMm: 60, gustKmh: 50, waveM: 2.5,
    offWindKt: 15, offWaveM: 1.5,
    advLimits: '',                   /* AI suggestion: the user's changes to the offshore job limits (short JSON, see advisor.js) */
    advPlaces: '',                   /* AI suggestion: own places for the flood check, one per line "Name; lat; lon; JPS station; pantai" */
    advShift: '07-19',               /* AI suggestion: day shift hours (the night shift is the rest) */
    coastal: true,                   /* land: the place is by the sea (Coastal Risk: tide, waves at the coast) */
    advWindowH: 4,                   /* AI suggestion: shortest weather window worth showing (hours) */
    ewConf: 85,                      /* Early Flood Warning: rings only at this confidence (%) or more; below, shown quietly */
    /* river layout for the early warning (upstream gauges) and the villages at risk: "Station < upstream, ... | village, ..."; ~ = river mouth */
    ewUpstream: 'Sg. Mas | Kg. Sg. Mas, Kg. Padang Kubu\nBan Ho < Sg. Mas\nAir Putih | Kg. Teladas, Kg. Dadong\n' +
      'Rantau Panjang < Air Putih | Kg. Batu 16, Kg. Seberang Tayor, Kg. Batu 14, Kg. Pasir Gajah\n' +
      '~Paya Paman < Rantau Panjang, Ban Ho, Air Putih, Sg. Mas | Kg. Sungai Pinang, Kg. Pasir Minal, Kg. Bukit Mentok, Pengkalan Pandan\n' +
      '~Yak Yah | Kg. Yak Yah, Kg. Padang Kemunting\n~Tumpat | Kg. Baru Kemasik\n~Geliga < Paya Paman, Yak Yah, Rantau Panjang, Ban Ho | Bandar Chukai, Kg. Geliga, Kg. Bukit Mentok',
    omEveryMin: 3,                   /* model data (5 rain models, offshore models): every this many minutes, slower near the free daily limit */
    ewWindRise: 8, ewSwellTp: 9,     /* offshore early warning: wind rising kt in 6 h; long swell period s */    /* offshore model comparison: limits for the % chance (knots, significant wave height m) */
    visKm: 2, thunderAlert: true,
    staleHours: 6,
    soundLevel: 'critical',          /* sound for: critical = Bahaya / critical alerts only, warning = Amaran & up, all = every alert, none = silent (reminder on opening) */
    sound: true, notify: true, keepInTray: false, startWithWindows: false,   /* keepInTray off: closing the window quits the app (3.3.1) */
    scrapeInfobanjir: true, useDataGovFlood: true,
    siteCheck: true,
    lang: 'en',                      /* en | ms */
    adblock: true,                   /* desktop: block ads, ad pop-ups and cookie notices inside the sites */
    adblockExcept: '',               /* sites left alone, host names separated by commas */
    relayUrl: 'https://dashboardcuaca.aziz-mohamad-ai.workers.dev',   /* Aziz's own relay; the key is set on each device */
    relayKey: '',                    /* its secret key (letters, numbers, - and _) */
    relayBad: '',                    /* sites the relay could not fetch at the last test (opened in the browser instead) */
    relayAltOff: '',                 /* stand-ins that failed the last relay test (site ids) */
    relayAds: true,                  /* web app: ad-heavy sites (tides, traffic) open through the relay, which removes the ads */
    tidePlace: 'cukai',              /* tide times: 'cukai' = Tide Forecast table (GitHub mirror), 'model' = Open-Meteo sea level */
    jpsState: 'TRG',                 /* web app: JPS Public Infobanjir state code for water level & rainfall (read through the relay) */
    district: ''                     /* Monsoon EYE: a district added with the form (JSON: name, stations, rain gauges, river layout...); '' = Kemaman */
  };
  if (ED && ED.defaults) Object.keys(ED.defaults).forEach(function (k) { DEFAULTS[k] = ED.defaults[k]; });
  var PROFILE_KEYS = ['kind', 'lat', 'lon', 'marineLat', 'marineLon', 'riverLat', 'riverLon', 'metLocationId', 'warningKeywords', 'waterDistrict', 'waterAlertLevel', 'waterRiseM',
    'rain3hMm', 'rain24hMm', 'gustKmh', 'waveM', 'visKm', 'thunderAlert', 'scrapeInfobanjir', 'useDataGovFlood', 'jpsState', 'tidePlace',
    'offWindKt', 'offWaveM', 'coastal', 'ewUpstream', 'district'];
  var OLD_UPSTREAM = [
    'Sg. Mas | Kg. Sg. Mas, Kg. Padang Kubu\nTebak < Sg. Mas | Kg. Padang Kubu\nAir Putih | Kg. Teladas, Kg. Dadong\nRantau Panjang < Air Putih, Tebak, Sg. Mas | Kg. Batu 16, Kg. Seberang Tayor, Kg. Batu 14, Kg. Pasir Gajah\nBan Ho\n' +
      'Paya Paman < Rantau Panjang, Ban Ho, Air Putih, Tebak, Sg. Mas | Kg. Sungai Pinang, Kg. Pasir Minal, Kg. Bukit Mentok, Pengkalan Pandan\n~Yak Yah | Kg. Yak Yah, Kg. Padang Kemunting\n~Geliga < Paya Paman, Yak Yah, Rantau Panjang, Ban Ho | Bandar Chukai, Kg. Geliga, Kg. Bukit Mentok',
    'Sg. Mas | Kg. Sg. Mas, Kg. Padang Kubu\nTebak < Sg. Mas | Kg. Padang Kubu\nAir Putih | Kg. Teladas, Kg. Dadong\nRantau Panjang < Air Putih, Tebak, Sg. Mas | Kg. Batu 16, Kg. Seberang Tayor, Kg. Batu 14, Kg. Pasir Gajah\nBan Ho\n' +
      '~Paya Paman < Rantau Panjang, Ban Ho, Air Putih, Tebak, Sg. Mas | Kg. Sungai Pinang, Kg. Pasir Minal, Kg. Bukit Mentok, Pengkalan Pandan\n~Yak Yah | Kg. Yak Yah, Kg. Padang Kemunting\n~Tumpat | Kg. Baru Kemasik\n~Geliga < Paya Paman, Yak Yah, Rantau Panjang, Ban Ho | Bandar Chukai, Kg. Geliga, Kg. Bukit Mentok'
  ];
  var CAN_BE_EMPTY = ['district', 'ewUpstream', 'advLimits', 'advPlaces', 'adblockExcept', 'relayUrl', 'relayKey', 'relayBad', 'relayAltOff', 'metLocationId', 'waterDistrict', 'warningKeywords'];
  var REFRESH_CHOICES = [5, 10, 15, 30, 60];
  var JPS_STATES = ['PLS', 'KDH', 'PNG', 'PRK', 'SEL', 'WLH', 'PTJ', 'NSN', 'MLK', 'JHR', 'PHG', 'TRG', 'KEL', 'SRK', 'SAB', 'WLP'];
  /* ---- site relay (iPad / phone): sites that refuse to be shown inside another app go through the user's relay */
  function relayHosts() {
    var seen = {}, out = [];
    SITES.forEach(function (s) {
      var h = '';
      try { h = new URL(siteUrl(s, DEFAULTS)).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { /* */ }
      if (h && !seen[h]) { seen[h] = 1; out.push(h); }
    });
    return out;
  }
  function relayReady(s) { return !!(s && s.relayUrl && s.relayKey); }
  /* can this site be shown through the relay? (relay set up, and the site did not fail the last relay test) */
  function relayFor(site, s) {
    if (!relayReady(s) || !site) return false;
    /* the site's own embed is better than the relayed page (Windy shows a red "www.windy.com" screen when relayed) */
    if (ALT[site.id] && ALT[site.id].prefer) return false;
    var h = '';
    try { h = new URL(siteUrl(site, s)).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return false; }
    return !adHosts(s.relayBad).concat(RELAY_NEVER).some(function (x) { return h === x || h.slice(-x.length - 1) === '.' + x; });
  }
  /* these only answer connections from Malaysia: Cloudflare gets HTTP 522, so never send them through the relay */
  var RELAY_NEVER = ['infobanjir.terengganu.gov.my', 'met.gov.my'];
  function malaysiaOnly(site, s) {
    var h = '';
    try { h = new URL(siteUrl(site, s)).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return false; }
    return RELAY_NEVER.some(function (x) { return h === x || h.slice(-x.length - 1) === '.' + x; });
  }
  /* web / phone: ad-heavy sites go through the relay too (it removes the ads), when the user wants that */
  function relayAdsFor(site, s) { return !!(site && site.ads && s && s.relayAds && relayFor(site, s)); }
  /* what a relay test answer means, from the relay's reply to one site */
  function relayVerdict(status, viaRelay) {
    /* answers made by the relay itself (no x-relay mark in scripts before 3.4.2): wrong key, site not in its list, site down */
    if (!viaRelay) return status === 404 ? 'badkey' : status === 403 ? 'notallowed' : status === 502 ? 'down' : 'notrelay';
    if (status >= 200 && status < 400) return 'ok';
    if (status === 530) return 'dns';
    if (status === 403 || status === 401 || status === 429) return 'refused';
    if (status === 502 || status === 504 || status === 522 || status === 524) return 'down';
    return 'http';
  }
  /* https://zoom.earth/places/x/#map=radar -> https://relay/KEY/https/zoom.earth/places/x/#map=radar */
  /* GitHub backup through the relay (v4): the relay asks GitHub to run the mirror now, at most every 10 minutes.
     The app asks at most every 10 minutes too, after reading JPS live; the answer is kept in localStorage "mc_poke". */
  function relayMirrorUrl(s) { return relayReady(s) ? s.relayUrl + '/' + s.relayKey + '/mirror' : ''; }
  function pokeMirror(s, store) {
    var u = relayMirrorUrl(s), now = Date.now(), last = null;
    try { last = JSON.parse(store.getItem('mc_poke') || 'null'); } catch (e) { last = null; }
    if (!u || (last && now - last.at < 10 * 60000)) return Promise.resolve(last);
    var keep = function (r) { r.at = now; try { store.setItem('mc_poke', JSON.stringify(r)); } catch (e) { /* */ } return r; };
    return fetch(u, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(keep, function () { return keep({ ok: false, reason: 'relay' }); });
  }
  function relayUrlFor(url, s) {
    if (!relayReady(s)) return '';
    try {
      var u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) return '';
      return s.relayUrl + '/' + s.relayKey + '/' + u.protocol.replace(':', '') + '/' + u.host + u.pathname + u.search + u.hash;
    } catch (e) { return ''; }
  }
  function relayCode(template, key, tweaksUrl) {
    return String(template).replace("'__KEY__'", JSON.stringify(key)).replace('__HOSTS__', JSON.stringify(relayHosts()))
      .replace("'__TWEAKS__'", JSON.stringify(tweaksUrl || ''));
  }

  /* "https://www.tide-forecast.com/x, vesselfinder.com" -> ["tide-forecast.com", "vesselfinder.com"] */
  function adHosts(text) {
    var seen = {}, out = [];
    String(text || '').split(/[\s,;]+/).forEach(function (h) {
      h = h.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[\/?#:].*$/, '').replace(/^www\./, '');
      if ((/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) && !seen[h]) { seen[h] = 1; out.push(h); }
    });
    return out;
  }
  function cleanSettings(s) {
    var out = {}, k;
    s = s || {};
    for (k in DEFAULTS) {
      var d = DEFAULTS[k], v = s[k];
      if (v === '' && CAN_BE_EMPTY.indexOf(k) >= 0) { out[k] = ''; continue; }
      if (v === undefined || v === null || v === '') { out[k] = d; continue; }
      if (typeof d === 'number') { v = Number(v); out[k] = isFinite(v) ? v : d; }
      else if (typeof d === 'boolean') out[k] = v === true || v === 'true' || v === 1 || v === 'on';
      else out[k] = String(v).slice(0, k === 'district' ? 30000 : k === 'adblockExcept' ? 2000 : k === 'advLimits' || k === 'advPlaces' || k === 'ewUpstream' ? 4000 : 200);
    }
    /* the river layout of 4.4.1 - 4.4.3 had Sg. Mas above Rantau Panjang (it flows into Sg. Cherul at Ban Ho): an unchanged old default becomes the new one */
    if (OLD_UPSTREAM.indexOf(String(out.ewUpstream).replace(/\r/g, '').trim()) >= 0) out.ewUpstream = DEFAULTS.ewUpstream;
    if (REFRESH_CHOICES.indexOf(out.refreshMin) < 0) out.refreshMin = DEFAULTS.refreshMin;
    if (['alert', 'warning', 'danger'].indexOf(out.waterAlertLevel) < 0) out.waterAlertLevel = 'alert';
    if (['critical', 'warning', 'all', 'none'].indexOf(out.soundLevel) < 0) out.soundLevel = DEFAULTS.soundLevel;
    if (['land', 'offshore'].indexOf(out.kind) < 0) out.kind = 'land';
    if (['en', 'ms'].indexOf(out.lang) < 0) out.lang = 'en';
    out.adblockExcept = adHosts(out.adblockExcept).join(', ');
    out.relayUrl = /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(String(out.relayUrl).trim().replace(/\/+$/, '')) ? String(out.relayUrl).trim().replace(/\/+$/, '') : '';
    out.relayBad = adHosts(out.relayBad).join(', ');
    out.relayAltOff = String(out.relayAltOff || '').split(/[\s,]+/).filter(function (x) { return /^[a-z0-9]{2,20}$/.test(x); }).join(', ');
    out.relayKey = /^[A-Za-z0-9_-]{8,64}$/.test(String(out.relayKey).trim()) ? String(out.relayKey).trim() : '';
    ['lat', 'marineLat'].forEach(function (k2) { if (out[k2] < -90 || out[k2] > 90) out[k2] = DEFAULTS[k2]; });
    ['lon', 'marineLon'].forEach(function (k2) { if (out[k2] < -180 || out[k2] > 180) out[k2] = DEFAULTS[k2]; });
    if (out.metLocationId !== '' && !/^[A-Za-z]{2}\d{3}$/.test(out.metLocationId)) out.metLocationId = DEFAULTS.metLocationId;
    ['riverLat', 'riverLon'].forEach(function (k) {
      var v = out[k] === '' || out[k] === null || out[k] === undefined ? NaN : +out[k];
      out[k] = isFinite(v) && Math.abs(v) <= (k === 'riverLat' ? 90 : 180) ? v : (k === 'riverLat' ? out.lat : out.lon);
    });
    /* up to 4.5.x the Kemaman river point was 4.25, 103.40 - GloFAS takes a small side stream there; move it to the main river */
    if (+out.riverLat === 4.25 && +out.riverLon === 103.4) { out.riverLat = 4.225; out.riverLon = 103.375; }
    out.tidePlace = out.tidePlace === 'model' || out.kind === 'offshore' ? 'model' : 'cukai';
    try { if (out.advLimits) { var al = JSON.parse(out.advLimits); if (!al || typeof al !== 'object' || Array.isArray(al)) out.advLimits = ''; } } catch (e) { out.advLimits = ''; }
    if (!/^\s*\d{1,2}\s*[-–:]\s*\d{1,2}\s*$/.test(out.advShift)) out.advShift = DEFAULTS.advShift;
    [['advWindowH', 1, 24], ['omEveryMin', 3, 60], ['ewConf', 50, 99], ['ewWindRise', 2, 30], ['ewSwellTp', 5, 20]].forEach(function (r) {
      if (!(out[r[0]] >= r[1] && out[r[0]] <= r[2])) out[r[0]] = DEFAULTS[r[0]];
    });
    if (!(out.offWindKt >= 1 && out.offWindKt <= 80)) out.offWindKt = DEFAULTS.offWindKt;
    if (!(out.offWaveM >= 0.1 && out.offWaveM <= 15)) out.offWaveM = DEFAULTS.offWaveM;
    out.jpsState = String(out.jpsState).toUpperCase();
    if (JPS_STATES.indexOf(out.jpsState) < 0) out.jpsState = DEFAULTS.jpsState;
    return out;
  }

  /* ---------------------------------------------------------------- profiles */
  var OFFSHORE_BASE = { kind: 'offshore', metLocationId: '', warningKeywords: 'Terengganu, Condore, Reef North', waterDistrict: '', tidePlace: 'model',
    scrapeInfobanjir: false, useDataGovFlood: false, rain3hMm: 30, rain24hMm: 80, gustKmh: 50, waveM: 2.5, visKm: 2, thunderAlert: true };
  var DEFAULT_PROFILES = [
    { id: 'kemaman', name: 'Kemaman', kind: 'land', lat: 4.2324, lon: 103.4229, marineLat: 4.26, marineLon: 103.52, riverLat: 4.225, riverLon: 103.375, metLocationId: 'Ds065',
      warningKeywords: 'Terengganu, Kemaman', waterDistrict: 'Kemaman', scrapeInfobanjir: true, useDataGovFlood: true },
    Object.assign({ id: 'irong-barat', name: 'Irong Barat (offshore)', lat: 5.5501, lon: 104.7745, marineLat: 5.5501, marineLon: 104.7745 }, OFFSHORE_BASE)
  ];
  if (ED && ED.profiles) DEFAULT_PROFILES = DEFAULT_PROFILES.filter(function (p) { return ED.profiles.indexOf(p.id) >= 0; }).map(function (p) {
    return p.id === 'irong-barat' ? Object.assign({}, p, { name: 'Irong Barat' }) : p;   /* OceanWATCH: every place is offshore, no need to say it */
  });
  function cleanProfile(p, fallback) {
    p = p || {};
    if (ED && ED.kind) p = Object.assign({}, p, { kind: ED.kind });   /* Monsoon EYE: land only, OceanWATCH: offshore only */
    var base = p.kind === 'offshore' ? Object.assign({}, DEFAULTS, OFFSHORE_BASE) : DEFAULTS;
    var merged = cleanSettings(Object.assign({}, base, fallback || {}, p));
    var out = { id: String(p.id || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40).toLowerCase() || 'p' + Date.now().toString(36),
      name: String(p.name || 'Profil').trim().slice(0, 60) || 'Profil' };
    PROFILE_KEYS.forEach(function (k) { out[k] = merged[k]; });
    if (out.kind === 'offshore' && (p.marineLat === undefined || p.marineLat === '')) { out.marineLat = out.lat; out.marineLon = out.lon; }
    return out;
  }
  /* effective settings = shared settings + the active profile on top */
  function profileSettings(global, profile) {
    var s = Object.assign({}, global || {});
    if (profile) { PROFILE_KEYS.forEach(function (k) { if (profile[k] !== undefined) s[k] = profile[k]; }); s.locationName = profile.name; }
    return cleanSettings(s);
  }

  /* ------------------------------------------------------------ data URLs */
  function urls(s) {
    s = cleanSettings(s);
    var om = 'https://api.open-meteo.com/v1/forecast?latitude=' + s.lat + '&longitude=' + s.lon +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&hourly=precipitation,precipitation_probability,temperature_2m,weather_code,wind_gusts_10m,wind_speed_10m,wind_direction_10m,visibility,cape' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant' +
      '&timezone=Asia%2FKuala_Lumpur&past_days=2&forecast_days=16';
    var marine = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + s.marineLat + '&longitude=' + s.marineLon +
      '&hourly=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_level_height_msl' +
      '&daily=wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max' +
      '&timezone=Asia%2FKuala_Lumpur&forecast_days=16';
    /* 28 days: GFS ensemble (31 runs), the only free model that goes past 16 days day by day */
    var outlook = 'https://ensemble-api.open-meteo.com/v1/ensemble?latitude=' + s.lat + '&longitude=' + s.lon + '&models=gfs05&wind_speed_unit=kmh' +
      '&daily=precipitation_sum,wind_speed_10m_max,temperature_2m_max,temperature_2m_min&timezone=Asia%2FKuala_Lumpur&forecast_days=35';
    /* river discharge (GloFAS, the global flood model): 7 days back, 30 days ahead */
    var flood = 'https://flood-api.open-meteo.com/v1/flood?latitude=' + (s.riverLat === '' ? s.lat : s.riverLat) + '&longitude=' + (s.riverLon === '' ? s.lon : s.riverLon) +
      '&daily=river_discharge,river_discharge_median,river_discharge_max,river_discharge_min,river_discharge_p25,river_discharge_p75&past_days=7&forecast_days=30';
    var out = {
      openMeteo: om,
      marine: marine,
      outlook: outlook,
      metWarning: 'https://api.data.gov.my/weather/warning?limit=60&sort=-warning_issue__issued'
    };
    if (s.kind !== 'offshore') out.river = flood;
    if (s.metLocationId) out.metForecast = 'https://api.data.gov.my/weather/forecast?contains=' + encodeURIComponent(s.metLocationId) + '@location__location_id';
    if (s.useDataGovFlood && s.waterDistrict) out.flood = 'https://api.data.gov.my/flood-warning?limit=200&contains=' + encodeURIComponent(s.waterDistrict) + '@district';
    return out;
  }
  /* pages read by the desktop app in a hidden window (water level + rainfall tables of Kemaman) */
  var SCRAPE = [
    { key: 'ibWater', kind: 'water', url: 'https://infobanjir.terengganu.gov.my/WaterLevel/District/4' },
    { key: 'ibRain', kind: 'rain', url: 'https://infobanjir.terengganu.gov.my/Rainfall/District/4' }
  ];

  /* web app: JPS water level & rainfall and the Cukai tide table, read by GitHub every ~15 min (mirror/ in the repo,
     branch "data") - those sites do not let other web pages read them */
  function mirrorBase(loc) {
    loc = loc || {};
    var m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc.hostname || ''), part = String(loc.pathname || '').split('/').filter(Boolean)[0];
    return 'https://raw.githubusercontent.com/' + (m && part ? m[1] + '/' + part : (ED && ED.repo) || 'azizdigital/dashboard-cuaca') + '/data/';
  }
  function mirrorUrls(s, base) {
    s = cleanSettings(s);
    var out = {};
    if (s.scrapeInfobanjir && s.waterDistrict && (s.jpsState === 'TRG' || (ED && ED.kind === 'land'))) out.jpsMirror = base + 'jps-' + s.jpsState + '.json';   /* Monsoon EYE: the states in mirror/districts.json are mirrored too */
    if (s.tidePlace === 'cukai') out.tideMirror = base + 'tide-cukai.json';
    return out;
  }
  /* mirror file -> the same station objects as the other readers */
  function fromMirror(j, kind, district, now) {
    var iso = function (x) { return x ? Date.parse(x) : null; };
    if (kind === 'water') return (j.water || []).filter(function (r) { return !district || sameDistrict(r.district, district); }).map(function (r) {
      var st = { id: norm(r.id || r.name), name: r.name, district: r.district, basin: r.subBasin || r.basin || '', level: r.level, normal: r.normal, alert: r.alert, warning: r.warning, danger: r.danger,
        indicator: '', trend: '', updated: iso(r.updated), source: 'JPS' };
      st.status = stationStatus(st);
      return st;
    }).filter(function (st) { return st.level !== null && st.level !== undefined; });
    return ((j.rain || {}).stations || []).filter(function (r) { return !district || sameDistrict(r.district, district); }).map(function (r) {
      return { id: norm(r.id || r.name), name: r.name, district: r.district, rain1h: r.hour, rainToday: r.today, days: r.daily, updated: iso(r.updated), source: 'JPS' };
    }).filter(function (x) { return x.rain1h !== null || x.rainToday !== null; });
  }
  function jpsUrls(s) {
    s = cleanSettings(s);
    if (!s.scrapeInfobanjir || !s.waterDistrict) return {};
    return {
      jpsWater: 'https://publicinfobanjir.water.gov.my/aras-air/data-paras-air/aras-air-data/?state=' + s.jpsState + '&district=ALL&station=ALL&lang=en',
      jpsRain: 'https://publicinfobanjir.water.gov.my/wp-content/themes/shapely/agency/searchresultrainfall.php?state=' + s.jpsState + '&district=ALL&station=ALL&language=1&loginStatus=0'
    };
  }
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
  function htmlText(h) {
    return String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, function (all, e) {
        if (ENT[e.toLowerCase()] !== undefined) return ENT[e.toLowerCase()];
        if (e[0] === '#') { var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1); return n ? String.fromCharCode(n) : ''; }
        return all;
      }).replace(/\s+/g, ' ').trim();
  }
  /* every <tr> of an HTML page -> array of cell texts (works in the browser and in node) */
  function htmlRows(html) {
    var rows = [], m, re = /<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/tbody|<\/table|$)/gi;
    html = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
    while ((m = re.exec(html))) {
      var cells = [], c, cre = /<t[dh]\b[^>]*>([\s\S]*?)(?=<t[dh]\b|<\/tr|$)/gi;
      while ((c = cre.exec(m[1]))) cells.push(htmlText(c[1].replace(/<\/t[dh]>[\s\S]*$/i, '')));
      if (cells.length) rows.push(cells);
    }
    return rows;
  }
  function jpsNum(v) {
    var m = /-?\d+(?:\.\d+)?/.exec(String(v || ''));
    if (!m) return null;
    var n = +m[0];
    return n <= -999 ? null : n;            /* -9999 = no reading */
  }
  function sameDistrict(a, b) { return norm(a).replace(/[^a-z]/g, '') === norm(b).replace(/[^a-z]/g, ''); }
  /* JPS water level rows: No | Station ID | Station Name | District | Main Basin | Sub River Basin | Last Updated | Water Level | Normal | Alert | Warning | Danger
     JPS rainfall rows:    No | Station ID | Station | District | Last Updated | 6 x daily | Rainfall from Midnight | Total 1 Hour */
  function parseJps(html, kind, district, now) {
    var out = [], seen = {};
    htmlRows(html).forEach(function (r) {
      if (!/^\d+$/.test(r[0] || '')) return;
      if (kind === 'water' ? r.length < 12 : r.length < 13) return;
      if (district && !sameDistrict(r[3], district)) return;
      var id = norm(r[1] || r[2]);
      if (!r[2] || seen[id]) return;
      seen[id] = 1;
      if (kind === 'water') {
        var st = { id: id, name: r[2], district: r[3], basin: r[5] || r[4] || '', level: jpsNum(r[7]), normal: jpsNum(r[8]), alert: jpsNum(r[9]), warning: jpsNum(r[10]), danger: jpsNum(r[11]),
          indicator: '', trend: '', updated: flexTime(r[6], now), source: 'JPS' };
        if (st.level === null) return;
        st.status = stationStatus(st);
        out.push(st);
      } else {
        var days = r.slice(5, 11).map(jpsNum);
        var rs = { id: id, name: r[2], district: r[3], rain1h: jpsNum(r[12]), rainToday: jpsNum(r[11]), days: days, updated: flexTime(r[4], now), source: 'JPS' };
        if (rs.rain1h === null && rs.rainToday === null) return;
        out.push(rs);
      }
    });
    return out;
  }

  /* ---------------------------------------------------------------- helpers */
  function num(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) && v > -9000 ? v : null;   /* -9999 = sensor fault */
    var m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    return isFinite(n) && n > -9000 ? n : null;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* "2026-11-17T20:00" or "2026-11-17 20:00:00" in Malaysia time -> epoch ms */
  function localMs(s, offsetMin) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    var off = offsetMin === undefined ? TZ_OFFSET_MIN : offsetMin;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - off * 60000;
  }
  /* parts of a moment in Malaysia time, independent of the computer's time zone */
  function myt(ms) {
    var d = new Date(ms + TZ_OFFSET_MIN * 60000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
  }
  function dateKey(ms) { var p = myt(ms); return p.y + '-' + pad(p.mo) + '-' + pad(p.d); }
  /* free-form times found in web tables: 17/11/2026 8:15 PM, 2026-11-17 20:15, 20:15 */
  function flexTime(s, now) {
    if (!s) return null;
    s = String(s).trim();
    var ap = /\b(am|pm|pg|ptg|mlm)\b/i.exec(s), m, y, mo, d, h = 0, mi = 0, sec = 0;
    if ((m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ ,T]+(\d{1,2})[:.](\d{2})(?::(\d{2}))?)?/))) { d = +m[1]; mo = +m[2]; y = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); sec = +(m[6] || 0); }
    else if ((m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) { y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); sec = +(m[6] || 0); }
    else if ((m = s.match(/^(\d{1,2})[:.](\d{2})(?::(\d{2}))?/))) { var p = myt(now || Date.now()); y = p.y; mo = p.mo; d = p.d; h = +m[1]; mi = +m[2]; sec = +(m[3] || 0); }
    else return null;
    if (ap) { var t = ap[1].toLowerCase(); if ((t === 'pm' || t === 'ptg' || t === 'mlm') && h < 12) h += 12; if ((t === 'am' || t === 'pg') && h === 12) h = 0; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    return Date.UTC(y, mo - 1, d, h, mi, sec) - TZ_OFFSET_MIN * 60000;
  }
  function hashStr(s) { var h = 5381; s = String(s || ''); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  /* -------------------------------------------------------- weather codes */
  var WMO = {
    0: ['Cerah', '☀️'], 1: ['Kebanyakan cerah', '🌤️'], 2: ['Separa berawan', '⛅'], 3: ['Mendung', '☁️'],
    45: ['Berkabus', '🌫️'], 48: ['Berkabus', '🌫️'], 51: ['Gerimis ringan', '🌦️'], 53: ['Gerimis', '🌦️'], 55: ['Gerimis lebat', '🌧️'],
    56: ['Gerimis', '🌧️'], 57: ['Gerimis', '🌧️'], 61: ['Hujan renyai', '🌦️'], 63: ['Hujan sederhana', '🌧️'], 65: ['Hujan lebat', '🌧️'],
    66: ['Hujan', '🌧️'], 67: ['Hujan lebat', '🌧️'], 80: ['Hujan pancuran ringan', '🌦️'], 81: ['Hujan pancuran', '🌧️'],
    82: ['Hujan pancuran lebat', '⛈️'], 95: ['Ribut petir', '⛈️'], 96: ['Ribut petir & hujan batu', '⛈️'], 99: ['Ribut petir & hujan batu', '⛈️']
  };
  function wmo(code) { var w = WMO[code]; return w ? { text: L(w[0]), icon: w[1] } : { text: code === null || code === undefined ? '-' : L('Kod ') + code, icon: '🌡️' }; }
  function compass(deg) {
    if (deg === null || deg === undefined || !isFinite(deg)) return '-';
    var i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
    return (I18N && I18N.lang() === 'ms' ? ['U', 'TL', 'T', 'Tg', 'S', 'BD', 'B', 'BL'] : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])[i];
  }

  /* ---------------------------------------------------------------- parsers */
  function parseOpenMeteo(j, now) {
    now = now || Date.now();
    if (!j || !j.hourly || !j.hourly.time) throw new Error(L('Format Open-Meteo tidak dikenali'));
    var off = (j.utc_offset_seconds || TZ_OFFSET_MIN * 60) / 60, H = j.hourly, D = j.daily || {}, C = j.current || {};
    var hourly = H.time.map(function (t, i) {
      return { t: localMs(t, off), p: num((H.precipitation || [])[i]), pp: num((H.precipitation_probability || [])[i]),
        temp: num((H.temperature_2m || [])[i]), code: num((H.weather_code || [])[i]), gust: num((H.wind_gusts_10m || [])[i]),
        wind: num((H.wind_speed_10m || [])[i]), dir: num((H.wind_direction_10m || [])[i]),
        vis: (H.visibility || [])[i] === null || (H.visibility || [])[i] === undefined ? null : Math.round(num(H.visibility[i]) / 100) / 10,   /* m -> km */
        cape: num((H.cape || [])[i]) };
    });
    var daily = (D.time || []).map(function (t, i) {
      return { date: t, code: num((D.weather_code || [])[i]), tmax: num((D.temperature_2m_max || [])[i]), tmin: num((D.temperature_2m_min || [])[i]),
        p: num((D.precipitation_sum || [])[i]), pp: num((D.precipitation_probability_max || [])[i]), gust: num((D.wind_gusts_10m_max || [])[i]),
        wind: num((D.wind_speed_10m_max || [])[i]), dir: num((D.wind_direction_10m_dominant || [])[i]) };
    });
    var hourStart = Math.floor(now / 3600000) * 3600000;
    function sumRange(a, b) { var s = 0, n = 0; hourly.forEach(function (h) { if (h.t >= a && h.t < b && h.p !== null) { s += h.p; n++; } }); return n ? Math.round(s * 10) / 10 : null; }
    function maxRange(k, a, b) { var m = null; hourly.forEach(function (h) { if (h.t >= a && h.t < b && h[k] !== null && h[k] !== undefined && (m === null || h[k] > m)) m = h[k]; }); return m; }
    function minRange(k, a, b) { var m = null; hourly.forEach(function (h) { if (h.t >= a && h.t < b && h[k] !== null && h[k] !== undefined && (m === null || h[k] < m)) m = h[k]; }); return m; }
    var h6 = hourStart + 6 * 3600000;
    var thunderAt = null;
    hourly.forEach(function (h) { if (thunderAt === null && h.t >= hourStart && h.t < h6 && h.code !== null && h.code >= 95) thunderAt = h.t; });
    var maxCape6h = maxRange('cape', hourStart, h6), maxProb6 = maxRange('pp', hourStart, h6);
    /* ribut petir: forecast code 95-99 = tinggi; lots of instability with rain likely = sederhana */
    var thunderRisk = thunderAt !== null ? 'tinggi' : (maxCape6h !== null && maxCape6h >= 1000 && (maxProb6 || 0) >= 50) ? 'sederhana' : 'rendah';
    var current = { time: localMs(C.time, off), temp: num(C.temperature_2m), feels: num(C.apparent_temperature), rh: num(C.relative_humidity_2m),
      precip: num(C.precipitation), code: num(C.weather_code), wind: num(C.wind_speed_10m), gust: num(C.wind_gusts_10m), dir: num(C.wind_direction_10m) };
    return {
      current: current, hourly: hourly, daily: daily,
      summary: {
        next3h: sumRange(hourStart, hourStart + 3 * 3600000), next24h: sumRange(hourStart, hourStart + 24 * 3600000),
        past24h: sumRange(hourStart - 24 * 3600000, hourStart), maxProb6h: maxRange('pp', hourStart, hourStart + 6 * 3600000),
        maxGust6h: maxRange('gust', hourStart, hourStart + 6 * 3600000), maxWind6h: maxRange('wind', hourStart, h6),
        minVis6h: minRange('vis', hourStart, h6), maxCape6h: maxCape6h, thunderAt: thunderAt, thunderRisk: thunderRisk
      }
    };
  }

  function parseMarine(j, now) {
    now = now || Date.now();
    if (!j || !j.hourly || !j.hourly.time) throw new Error(L('Format data laut tidak dikenali'));
    var off = (j.utc_offset_seconds || TZ_OFFSET_MIN * 60) / 60, H = j.hourly;
    var hourly = H.time.map(function (t, i) {
      return { t: localMs(t, off), wave: num((H.wave_height || [])[i]), period: num((H.wave_period || [])[i]), sea: num((H.sea_level_height_msl || [])[i]),
        waveDir: num((H.wave_direction || [])[i]), windWave: num((H.wind_wave_height || [])[i]),
        swell: num((H.swell_wave_height || [])[i]), swellPeriod: num((H.swell_wave_period || [])[i]), swellDir: num((H.swell_wave_direction || [])[i]) };
    });
    var hourStart = Math.floor(now / 3600000) * 3600000, cur = null, maxWave = null, maxSwell = null;
    hourly.forEach(function (h) {
      if (h.t === hourStart) cur = h;
      if (h.t >= hourStart && h.t < hourStart + 24 * 3600000) {
        if (h.wave !== null && (maxWave === null || h.wave > maxWave)) maxWave = h.wave;
        if (h.swell !== null && (maxSwell === null || h.swell > maxSwell)) maxSwell = h.swell;
      }
    });
    /* next high and low tide from the sea level curve (local maxima / minima) */
    var tides = [];
    for (var i = 1; i < hourly.length - 1; i++) {
      var a = hourly[i - 1].sea, b = hourly[i].sea, c = hourly[i + 1].sea;
      if (a === null || b === null || c === null || hourly[i].t < hourStart) continue;
      if (b > a && b >= c) tides.push({ t: hourly[i].t, type: 'high', sea: b });
      if (b < a && b <= c) tides.push({ t: hourly[i].t, type: 'low', sea: b });
    }
    var D = j.daily || {};
    var daily = (D.time || []).map(function (t, i) {
      return { date: t, wave: num((D.wave_height_max || [])[i]), waveDir: num((D.wave_direction_dominant || [])[i]), wavePer: num((D.wave_period_max || [])[i]),
        swell: num((D.swell_wave_height_max || [])[i]), swellDir: num((D.swell_wave_direction_dominant || [])[i]), swellPer: num((D.swell_wave_period_max || [])[i]) };
    }).filter(function (d) { return d.wave !== null || d.swell !== null; });
    while (hourly.length && hourly[hourly.length - 1].wave === null && hourly[hourly.length - 1].sea === null) hourly.pop();
    return { current: cur || hourly[0] || null, hourly: hourly, daily: daily, maxWave24h: maxWave, maxSwell24h: maxSwell, tides: tides.slice(0, 4), tidesAll: tides };
  }

  function quantile(a, q) {
    var x = a.filter(function (v) { return v !== null && v !== undefined; }).sort(function (p, r) { return p - r; });
    if (!x.length) return null;
    var pos = (x.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return x[lo] + (x[hi] - x[lo]) * (pos - lo);
  }
  function r1(v, d) { if (v === null || v === undefined) return null; var f = Math.pow(10, d || 0); return Math.round(v * f) / f; }
  /* 28-day outlook: middle and 10-90 % range of the ensemble runs, day by day, and per week */
  function parseOutlook(j) {
    if (!j || !j.daily || !j.daily.time) throw new Error(L('Format data 28 hari tidak dikenali'));
    var D = j.daily, keys = Object.keys(D);
    function members(base, i) { return keys.filter(function (k) { return k === base || k.indexOf(base + '_member') === 0; }).map(function (k) { return num(D[k][i]); }); }
    var days = D.time.map(function (t, i) {
      var p = members('precipitation_sum', i), w = members('wind_speed_10m_max', i), tx = members('temperature_2m_max', i), tn = members('temperature_2m_min', i);
      var got = p.filter(function (v) { return v !== null; });
      return { date: t, p: r1(quantile(p, 0.5), 1), pLo: r1(quantile(p, 0.1), 1), pHi: r1(quantile(p, 0.9), 1),
        pChance: got.length ? Math.round(100 * got.filter(function (v) { return v >= 1; }).length / got.length) : null,
        wind: r1(quantile(w, 0.5), 0), windHi: r1(quantile(w, 0.9), 0), tmax: r1(quantile(tx, 0.5), 0), tmin: r1(quantile(tn, 0.5), 0) };
    }).filter(function (d) { return d.p !== null || d.wind !== null; }).slice(0, 28);
    var weeks = [];
    for (var w = 0; w < 4 && w * 7 < days.length; w++) {
      var part = days.slice(w * 7, w * 7 + 7);
      weeks.push({ from: part[0].date, to: part[part.length - 1].date, rain: r1(part.reduce(function (a, d) { return a + (d.p || 0); }, 0), 0),
        wetDays: part.filter(function (d) { return d.pChance !== null && d.pChance >= 50; }).length,
        wind: Math.max.apply(null, part.map(function (d) { return d.wind || 0; })), windHi: Math.max.apply(null, part.map(function (d) { return d.windHi || 0; })) });
    }
    return { days: days, weeks: weeks };
  }
  /* GloFAS river discharge -> days with the middle forecast, its 25-75 % range and the highest run */
  function parseRiver(j, now) {
    if (!j || !j.daily || !j.daily.time) throw new Error(L('Format data aliran sungai tidak dikenali'));
    var D = j.daily, today = dateKey(now || Date.now());
    var days = D.time.map(function (t, i) {
      var g = function (k) { return num((D[k] || [])[i]); };
      var mid = g('river_discharge_median'); if (mid === null) mid = g('river_discharge');
      return { date: t, past: t < today, q: mid, lo: g('river_discharge_p25'), hi: g('river_discharge_p75'), max: g('river_discharge_max'), min: g('river_discharge_min') };
    }).filter(function (d) { return d.q !== null; });
    if (!days.length) throw new Error(L('Tiada sungai di titik ini - tetapkan titik sungai di Tetapan'));
    var ahead = days.filter(function (d) { return !d.past; }), now0 = ahead[0] || days[days.length - 1];
    var peak = ahead.reduce(function (a, d) { return !a || d.q > a.q ? d : a; }, null);
    var past = days.filter(function (d) { return d.past; }).map(function (d) { return d.q; });
    var base = past.length ? past.reduce(function (a, b) { return a + b; }, 0) / past.length : now0.q;
    return { days: days, now: now0, peak: peak, ratio: base > 0 && peak ? r1(peak.q / base, 1) : null };
  }
  function parseTideMirror(j) {
    if (!j || !j.events) throw new Error(L('Tiada waktu pasang surut'));
    return { url: j.url, at: j.eventsAt ? Date.parse(j.eventsAt) : null, events: j.events.map(function (e) { return { t: Date.parse(e.time), type: e.type, sea: e.m }; }) };
  }

  function rows(j) { return Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : []); }

  function parseMetForecast(j, locId, now) {
    var today = dateKey(now || Date.now());
    var list = rows(j).filter(function (r) { return r && r.location && r.location.location_id === locId && String(r.date) >= today; })
      .map(function (r) {
        return { date: r.date, name: r.location.location_name, morning: r.morning_forecast || '', afternoon: r.afternoon_forecast || '',
          night: r.night_forecast || '', summary: r.summary_forecast || '', when: r.summary_when || '', min: num(r.min_temp), max: num(r.max_temp) };
      });
    list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return list;
  }

  function warningSeverity(w) {
    var t = (w.title_en + ' ' + w.title_bm + ' ' + w.heading_en + ' ' + w.heading_bm).toLowerCase();
    if (/bahaya|danger|third category|kategori ketiga|merah|red/.test(t)) return 'critical';
    if (/buruk|severe|second category|kategori kedua|jingga|orange/.test(t)) return 'warning';
    return 'info';
  }
  function parseMetWarnings(j, keywords, now) {
    now = now || Date.now();
    var keys = String(keywords || '').split(/[,;]/).map(function (k) { return k.trim().toLowerCase(); }).filter(Boolean);
    var all = rows(j).map(function (r) {
      var wi = r.warning_issue || {};
      var w = { issued: localMs(wi.issued), title_bm: wi.title_bm || '', title_en: wi.title_en || '',
        from: localMs(r.valid_from), to: localMs(r.valid_to), heading_bm: r.heading_bm || '', heading_en: r.heading_en || '',
        text_bm: r.text_bm || '', text_en: r.text_en || '', instruction_bm: r.instruction_bm || '', instruction_en: r.instruction_en || '' };
      w.severity = warningSeverity(w);
      w.active = w.to ? w.to > now : (w.issued ? now - w.issued < 24 * 3600000 : false);
      var hay = (w.title_bm + ' ' + w.title_en + ' ' + w.heading_bm + ' ' + w.heading_en + ' ' + w.text_bm + ' ' + w.text_en).toLowerCase();
      w.relevant = !keys.length || keys.some(function (k) { return hay.indexOf(k) >= 0; });
      w.id = norm(w.title_en || w.title_bm).slice(0, 40) + ':' + hashStr(norm(w.heading_en + ' ' + w.text_en + ' ' + w.heading_bm + ' ' + w.text_bm));
      return w;
    }).filter(function (w) { return w.active; });
    /* MET often re-sends the same warning with different validity windows: keep one, with the widest window */
    var seen = {}, out = [];
    all.forEach(function (w) {
      var o = seen[w.id];
      if (!o) { seen[w.id] = w; out.push(w); return; }
      if (w.from && (!o.from || w.from < o.from)) o.from = w.from;
      if (w.to && (!o.to || w.to > o.to)) o.to = w.to;
      if (w.issued && (!o.issued || w.issued > o.issued)) o.issued = w.issued;
    });
    return { relevant: out.filter(function (w) { return w.relevant; }), otherCount: out.filter(function (w) { return !w.relevant; }).length };
  }


  /* ---------------------------------------------------- MET warning text
     MET sends one long block: "SECTION A: ... 1) THUNDERSTORMS WARNING Thunderstorms ... over the waters of Perak • Terengganu
     until 2:00 PM; Wednesday, 18 November 2026. ... SECTION B: ..." (BM: SEKSYEN, AMARAN RIBUT PETIR, perairan, sehingga, kmsj).
     parseMetText() splits it into sections and items, and reads areas, times, wind and waves from each item.
     Anything it cannot read stays as plain text, so nothing is ever lost. */
  var MON_ALL = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    januari: 0, februari: 1, mac: 2, mei: 4, jun: 5, julai: 6, ogos: 7, oktober: 9, disember: 11 };
  function metDate(s, endOfDay) {
    s = String(s || '');
    var d = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
    if (!d || MON_ALL[d[2].toLowerCase()] === undefined) return null;
    var h = endOfDay ? 23 : 0, mi = endOfDay ? 59 : 0, hasTime = false;
    var t = /(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?|pagi|tengah\s*hari|tengahari|petang|tengah\s*malam|malam)/i.exec(s);
    if (t) {
      var p = t[3].toLowerCase().replace(/[\s.]/g, '');
      h = +t[1] % 12; mi = +t[2]; hasTime = true;
      if (p === 'pm' || p === 'petang' || p === 'malam' || p === 'tengahhari' || p === 'tengahari') h += 12;
      if ((p === 'tengahhari' || p === 'tengahari') && +t[1] === 12) h = 12;
    }
    var ms = localMs(d[3] + '-' + pad(MON_ALL[d[2].toLowerCase()] + 1) + '-' + pad(+d[1]) + 'T' + pad(h) + ':' + pad(mi) + ':00');
    return ms === null ? null : { ms: ms, hasTime: hasTime };
  }
  var MET_SEC_RE = /(?:^|\s)((?:SECTION|SEKSYEN|BAHAGIAN)\s+[A-Z]\s*:)/g;
  var MET_ITEM_RE = /(?:^|\s)(\d{1,2})\)\s+/g;
  var MET_LABEL_RE = /^((?:[A-Z0-9][A-Z0-9'’&\/.,-]*|\([^)a-z]*\)|\[[^\]a-z]*\])(?:\s+(?:[A-Z0-9][A-Z0-9'’&\/.,-]*|\([^)a-z]*\)|\[[^\]a-z]*\]))*)\s+(?=[A-Z][a-z])/;
  var MET_STOP = '(?=\\s+(?:until|within the period|from \\w+day|sehingga \\d|dalam tempoh|mulai|bermula)\\b|[.;]|$)';
  function metType(s) {
    s = String(s || '').toLowerCase();
    if (/strong wind|rough sea|angin kencang|laut bergelora/.test(s)) return 'wind';
    if (/thunder|ribut petir/.test(s)) return 'thunder';
    if (/tropical|siklon|ribut tropika|typhoon|taufan/.test(s)) return 'cyclone';
    if (/rain|hujan/.test(s)) return 'rain';
    return 'other';
  }
  function metItem(n, s) {
    var it = { n: n, label: '', body: s, type: 'other', areas: [], until: null, from: null, to: null, phrases: [], wind: null, wave: null, dir: '' };
    var m = MET_LABEL_RE.exec(s);
    if (m && /[A-Z]{3}/.test(m[1]) && m[1].length >= 6) { it.label = m[1]; it.body = s.slice(m[0].length); }
    var b = it.body;
    it.type = metType(it.label) !== 'other' ? metType(it.label) : metType(b);
    /* areas: the "•" list after "waters of" / "perairan" / "over" */
    var am = new RegExp('(?:waters? (?:of|off)|perairan|\\bover)\\s+(.+?)' + MET_STOP, 'i').exec(b);
    var list = am ? am[1] : '';
    if (!/•/.test(list)) { var bm2 = /((?:[^•.;]+•\s*)+[^•.;]+?)(?=\s+(?:until|within|sehingga|dalam tempoh)\b|[.;]|$)/.exec(b); if (bm2) list = bm2[1].replace(/^.*\b(?:of|off|perairan|over|di)\s+/i, ''); }
    if (list) it.areas = list.split(/\s*•\s*|\s*,\s*(?=[A-Z])/).map(function (x) { return x.replace(/^(?:the\s+)?waters?\s+(?:of|off)\s+|^(?:di\s+)?(?:kawasan\s+)?perairan\s+/i, '').trim(); }).filter(function (x) { return x && x.length < 60; });
    /* times */
    var per = /(?:within the period of|from)\s+(.+?\d{4})\s+until\s+(.+?\d{4})/i.exec(b) || /dalam tempoh\s+(.+?\d{4})\s+(?:sehingga|hingga)\s+(.+?\d{4})/i.exec(b);
    if (per) { it.from = metDate(per[1], false); it.to = metDate(per[2], true); it.phrases.push(per[0]); }
    var un = /\buntil\s+(\d{1,2}[:.]\d{2}\s*[ap]\.?m\.?[^.]*?\d{4})/i.exec(b) || /\bsehingga\s+(\d{1,2}[:.]\d{2}\s*[A-Za-z ]+?;[^.]*?\d{4})/i.exec(b);
    if (un && (!per || per[0].indexOf(un[0]) < 0)) { it.until = metDate(un[1], true); it.phrases.push(un[0]); }
    /* numbers */
    var w = /(\d{2,3})\s*(?:-|–|to|hingga)\s*(\d{2,3})\s*(kmph|km\/h|km\/j|kmsj|km sejam)/i.exec(b);
    if (w) { it.wind = [+w[1], +w[2]]; it.phrases.push(w[0]); }
    else if ((w = /(?:up to|sehingga|mencapai)\s*(\d{2,3})\s*(kmph|km\/h|km\/j|kmsj|km sejam)/i.exec(b))) { it.wind = [null, +w[1]]; it.phrases.push(w[0]); }
    var v = /(\d+(?:\.\d+)?)\s*(?:-|–|hingga)\s*(\d+(?:\.\d+)?)\s*(?:metres|meters|metre|meter|m)\b/i.exec(b);
    if (v) { it.wave = +v[2]; it.phrases.push(v[0]); }
    else if ((v = /(?:up to|sehingga|mencapai)\s*(\d+(?:\.\d+)?)\s*(?:metres|meters|metre|meter|m)\b/i.exec(b))) { it.wave = +v[1]; it.phrases.push(v[0]); }
    var d = /\b(northeasterly|northwesterly|southeasterly|southwesterly|northerly|southerly|easterly|westerly)\b/i.exec(b) ||
      /angin kencang\s+(timur laut|barat daya|barat laut|tenggara|utara|selatan|timur|barat)\b/i.exec(b);
    if (d) it.dir = d[1].toLowerCase();
    return it;
  }
  function parseMetText(heading, text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    var out = { intro: String(heading || '').replace(/\s+/g, ' ').trim(), sections: [] };
    var cuts = [], m;
    MET_SEC_RE.lastIndex = 0;
    while ((m = MET_SEC_RE.exec(t))) cuts.push(m.index + m[0].length - m[1].length);
    if (!cuts.length) cuts = [0];
    else if (cuts[0] > 0) { var pre = t.slice(0, cuts[0]).trim(); if (pre) out.intro = out.intro ? out.intro + ' ' + pre : pre; }
    cuts.forEach(function (at, i) {
      var part = t.slice(at, i + 1 < cuts.length ? cuts[i + 1] : t.length).trim();
      var sec = { title: '', items: [] };
      var marks = [];
      MET_ITEM_RE.lastIndex = 0;
      while ((m = MET_ITEM_RE.exec(part))) marks.push({ at: m.index, end: m.index + m[0].length, n: +m[1] });
      /* only a 1), 2), 3) ... run counts as items (so "(1)" or numbers inside sentences are left alone) */
      marks = marks.filter(function (x, k) { return k === 0 ? x.n === 1 : true; });
      var run = [];
      marks.forEach(function (x) { if (x.n === run.length + 1) run.push(x); });
      if (/^(?:SECTION|SEKSYEN|BAHAGIAN)\s/.test(part)) sec.title = (run.length ? part.slice(0, run[0].at) : part.split(/\s(?=[A-Z][a-z])/)[0]).trim();
      if (run.length) run.forEach(function (x, k) { sec.items.push(metItem(x.n, part.slice(x.end, k + 1 < run.length ? run[k + 1].at : part.length).trim())); });
      else { var rest = part.slice(sec.title.length).trim(); if (rest) sec.items.push(metItem(0, rest)); }
      if (sec.title || sec.items.length) out.sections.push(sec);
    });
    return out;
  }
  /* what matters for the reader: biggest numbers, when, and which of *their* areas are hit */
  function metSummary(p, keywords) {
    var keys = String(keywords || '').split(/[,;]/).map(function (k) { return k.trim(); }).filter(Boolean);
    var items = [];
    (p.sections || []).forEach(function (s) { s.items.forEach(function (i) { items.push(i); }); });
    var sum = { wind: null, dir: '', wave: null, thunderUntil: null, from: null, to: null, mine: [], others: [], items: items };
    items.forEach(function (i) {
      if (i.wind && (!sum.wind || i.wind[1] > sum.wind[1] || (i.wind[1] === sum.wind[1] && i.wind[0] && !sum.wind[0]))) { sum.wind = i.wind; if (i.dir) sum.dir = i.dir; }
      if (i.wave !== null && (sum.wave === null || i.wave > sum.wave)) sum.wave = i.wave;
      if (i.type === 'thunder' && i.until && (!sum.thunderUntil || i.until.ms > sum.thunderUntil.ms)) sum.thunderUntil = i.until;
      if (i.from && (!sum.from || i.from.ms < sum.from.ms)) sum.from = i.from;
      var end = i.to || i.until;
      if (end && (!sum.to || end.ms > sum.to.ms)) sum.to = end;
    });
    var seenOther = {};
    keys.forEach(function (k) {
      var kl = k.toLowerCase(), hits = [];
      items.forEach(function (i) {
        var a = null;
        i.areas.forEach(function (x) { if (!a && x.toLowerCase().indexOf(kl) >= 0) a = x; });
        if (!a && !i.areas.length && i.body.toLowerCase().indexOf(kl) >= 0) a = k;
        if (!a) return;
        var note = a.replace(new RegExp('\\s*' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), ' ').replace(/\bof\b/gi, ' ').replace(/\s+/g, ' ').trim();
        hits.push({ item: i, note: note.toLowerCase() });
      });
      if (hits.length) sum.mine.push({ area: k, hits: hits });
    });
    items.forEach(function (i) {
      i.areas.forEach(function (x) {
        var xl = x.toLowerCase();
        if (keys.some(function (k) { return xl.indexOf(k.toLowerCase()) >= 0; }) || seenOther[xl]) return;
        seenOther[xl] = 1; sum.others.push(x);
      });
    });
    return sum;
  }
  /* "until 14:00 today", "Thu 19 – Mon 23 Nov" */
  function metWhen(d, now) {
    if (!d) return '';
    var same = dateKey(d.ms) === dateKey(now || Date.now()), tomorrow = dateKey(d.ms) === dateKey((now || Date.now()) + 86400000);
    if (d.hasTime) return fmtTime(d.ms) + ' ' + (same ? L('hari ini') : tomorrow ? L('esok') : fmtDate(d.ms));
    return fmtDate(d.ms);
  }
  function metRange(a, b) {
    if (!a || !b) return b ? fmtDate(b.ms) : a ? fmtDate(a.ms) : '';
    var pa = myt(a.ms), pb = myt(b.ms);
    if (pa.y === pb.y && pa.mo === pb.mo) return DAYS[lg()][pa.wd] + ' ' + pa.d + ' – ' + fmtDate(b.ms);
    return fmtDate(a.ms) + ' – ' + fmtDate(b.ms);
  }
  function windText(w, paren) {
    if (!w) return '';
    var lo = w[0], hi = w[1], k = function (x) { return Math.round(kt(x)); };
    var knots = (lo ? k(lo) + '–' + k(hi) : k(hi)) + ' ' + L('knot');
    return (lo ? lo + '–' + hi : hi) + ' ' + L('km/j') + (paren ? ' (' + knots + ')' : ' · ' + knots);
  }
  /* one short line for notifications, the alert list and the dashboard tile */
  function metShort(wn, settings, now, compact) {
    var en = !(I18N && I18N.lang() === 'ms');
    var p = parseMetText(en ? (wn.heading_en || wn.heading_bm) : (wn.heading_bm || wn.heading_en), en ? (wn.text_en || wn.text_bm) : (wn.text_bm || wn.text_en));
    var sm = metSummary(p, (settings || {}).warningKeywords);
    var parts = [];
    if (sm.thunderUntil) parts.push(compact ? L('ribut petir hingga {t}', { t: fmtTime(sm.thunderUntil.ms) }) : L('Ribut petir sehingga {t}', { t: metWhen(sm.thunderUntil, now) }));
    var windy = sm.items.filter(function (i) { return i.type === 'wind' && (i.wind || i.wave !== null); })[0];
    if (windy) {
      var end = windy.to || windy.until || sm.to;
      if (compact) parts.unshift(L('Angin & laut hingga {d}', { d: end ? fmtDate(end.ms) : '-' }));
      else parts.push((windy.wind ? L('angin {w}', { w: windText(windy.wind, true) }) : '') + (windy.wave !== null ? (windy.wind ? ', ' : '') + L('ombak {v} m', { v: windy.wave }) : '') +
        (windy.from || windy.to ? ' ' + metRange(windy.from, windy.to) : ''));
    }
    if (!compact && sm.mine.length) parts.push(sm.mine.map(function (x) { return x.area; }).join(', '));
    if (!parts.length) return '';
    var s = parts.join(' · ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* water level station status from its thresholds (or the indicator word when it has none) */
  var STATUS_RANK = { unknown: -1, normal: 0, alert: 1, warning: 2, danger: 3 };
  var STATUS_BM = { unknown: 'Tiada data', normal: 'Normal', alert: 'Waspada', warning: 'Amaran', danger: 'Bahaya' };
  function statusName(st) { return L(STATUS_BM[st] || st); }
  function stationStatus(st) {
    if (st.level === null || st.level === undefined) return 'unknown';
    if (st.danger !== null && st.danger !== undefined && st.level >= st.danger) return 'danger';
    if (st.warning !== null && st.warning !== undefined && st.level >= st.warning) return 'warning';
    if (st.alert !== null && st.alert !== undefined && st.level >= st.alert) return 'alert';
    if (st.alert === null && st.warning === null && st.danger === null) {
      var w = String(st.indicator || '').toLowerCase();
      if (/danger|bahaya/.test(w)) return 'danger';
      if (/warning|amaran/.test(w)) return 'warning';
      if (/alert|waspada/.test(w)) return 'alert';
    }
    return 'normal';
  }
  function trendWord(t) {
    t = String(t || '').toLowerCase();
    if (/ris|naik|up|↑|▲/.test(t)) return 'rising';
    if (/fall|reced|turun|down|↓|▼/.test(t)) return 'falling';
    if (/steady|static|no change|sama|tiada perubahan|→/.test(t)) return 'steady';
    return '';
  }

  function parseFloodWarning(j, district) {
    var d = String(district || '').toLowerCase();
    return rows(j).filter(function (r) { return r && (!d || String(r.district || '').toLowerCase().indexOf(d) >= 0); })
      .filter(function (r) { return num(r.water_level_current) !== null || r.water_level_status === 'ON'; })
      .map(function (r) {
        var st = {
          id: String(r.station_id || r.station_code || r.station_name), name: r.station_name || '-', district: r.district || '', basin: r.main_basin || r.sub_basin || '',
          level: num(r.water_level_current), normal: num(r.water_level_normal_level), alert: num(r.water_level_alert_level),
          warning: num(r.water_level_warning_level), danger: num(r.water_level_danger_level), indicator: r.water_level_indicator || '',
          trend: trendWord(r.water_level_trend), increment: num(r.water_level_increment), updated: localMs(r.water_level_update_datetime),
          rain1h: num(r.rainfall_latest_1hr), rainToday: num(r.rainfall_total_today), lat: num(r.latitude), lon: num(r.longitude), source: 'data.gov.my'
        };
        st.status = stationStatus(st);
        return st;
      });
  }

  /* ---- tables read from infobanjir pages. The scraper hands over every <table> as rows of cell texts
     (colspan already expanded). Columns are recognised by their header words in Malay or English. */
  var COL = {
    name: /nama|name|stesen|station|lokasi|location/, id: /^(id|no\.? ?stesen|station ?id|kod|code)\b/,
    district: /daerah|district/, basin: /sungai|lembangan|basin|river/, time: /masa|tarikh|kemaskini|kemas kini|update|time|date|waktu/,
    normal: /normal|biasa/, alert: /waspada|alert/, warning: /amaran|warning/, danger: /bahaya|danger/,
    level: /paras|level|aras/, trend: /trend|aliran|arah/,
    rain1h: /1 ?(jam|hr|hour)|sejam|hourly|setiap jam/, rainToday: /hari ini|today|harian|daily|semasa|current|sejak|jumlah|total/, rain: /hujan|rain|mm/
  };
  function headerInfo(table) {
    var trs = table.rows || [], hdrIdx = -1;
    for (var i = 0; i < Math.min(trs.length, 6); i++) {
      var joined = trs[i].join(' ').toLowerCase();
      if (/stesen|station|nama|name|lokasi/.test(joined) && !trs[i].some(function (c) { return num(c) !== null && /^\s*-?\d+(\.\d+)?\s*$/.test(c); })) hdrIdx = i;
      else if (hdrIdx >= 0) break;
    }
    if (hdrIdx < 0) return null;
    var width = 0; for (i = 0; i <= hdrIdx; i++) width = Math.max(width, trs[i].length);
    var labels = [];
    for (var c = 0; c < width; c++) {
      var parts = [];
      for (i = 0; i <= hdrIdx; i++) { var t = (trs[i][c] || '').trim(); if (t && parts.indexOf(t) < 0) parts.push(t); }
      labels.push(parts.join(' ').toLowerCase());
    }
    return { start: hdrIdx + 1, labels: labels };
  }
  function findCol(labels, re, not) {
    for (var i = 0; i < labels.length; i++) if (re.test(labels[i]) && !(not && not.test(labels[i]))) return i;
    return -1;
  }
  function parseTables(tables, kind, now) {
    var out = [];
    (tables || []).forEach(function (table) {
      var h = headerInfo(table);
      if (!h) return;
      var L = h.labels, thresholds = /normal|biasa|waspada|alert|amaran|warning|bahaya|danger/;
      var ci = {
        name: findCol(L, /nama|name/) >= 0 ? findCol(L, /nama|name/) : findCol(L, COL.name, /^(no|bil)\b/),
        id: findCol(L, COL.id), district: findCol(L, COL.district), basin: findCol(L, COL.basin, /nama|name|stesen|station/), time: findCol(L, COL.time),
        normal: findCol(L, COL.normal), alert: findCol(L, COL.alert), warning: findCol(L, COL.warning), danger: findCol(L, COL.danger),
        level: findCol(L, COL.level, thresholds), trend: findCol(L, COL.trend),
        rain1h: findCol(L, COL.rain1h), rainToday: findCol(L, COL.rainToday, /tarikh|date|masa|time/)
      };
      if (ci.name < 0) return;
      var isWater = ci.level >= 0 && (kind === 'water' || ci.danger >= 0 || ci.warning >= 0);
      var isRain = !isWater && (kind === 'rain' || L.some(function (l) { return COL.rain.test(l); }));
      if (!isWater && !isRain) return;
      if (isRain && ci.rainToday < 0 && ci.rain1h < 0) {
        /* no clear "today" column: use the last column that holds numbers */
        for (var k = L.length - 1; k > ci.name; k--) {
          if (k === ci.time || k === ci.district || k === ci.id || k === ci.basin) continue;
          if (COL.rain.test(L[k]) || /\d/.test(L[k])) { ci.rainToday = k; break; }
        }
      }
      table.rows.slice(h.start).forEach(function (r) {
        var name = (r[ci.name] || '').replace(/\s+/g, ' ').trim();
        if (!name || /^(jumlah|total|tiada|no data)/i.test(name)) return;
        var cell = function (i) { return i >= 0 ? r[i] : null; };
        if (isWater) {
          var st = { id: norm(cell(ci.id) || name), name: name, district: cell(ci.district) || '', basin: cell(ci.basin) || '',
            level: num(cell(ci.level)), normal: num(cell(ci.normal)), alert: num(cell(ci.alert)), warning: num(cell(ci.warning)), danger: num(cell(ci.danger)),
            indicator: '', trend: trendWord(cell(ci.trend) || cell(ci.level)), updated: flexTime(cell(ci.time), now), source: 'infobanjir' };
          if (st.level === null) return;
          st.status = stationStatus(st);
          out.push(st);
        } else {
          var rs = { id: norm(cell(ci.id) || name), name: name, district: cell(ci.district) || '', rain1h: num(cell(ci.rain1h)), rainToday: num(cell(ci.rainToday)),
            updated: flexTime(cell(ci.time), now), source: 'infobanjir' };
          if (rs.rain1h === null && rs.rainToday === null) return;
          out.push(rs);
        }
      });
    });
    return out;
  }

  /* infobanjir first; data.gov.my stations only when infobanjir does not have them */
  function mergeStations(primary, extra) {
    var byName = {};
    var out = (primary || []).slice();
    out.forEach(function (s) { byName[norm(s.name)] = s; });
    (extra || []).forEach(function (s) {
      var k = norm(s.name), have = byName[k];
      if (!have) { byName[k] = s; out.push(s); return; }
      if (s.updated && (!have.updated || s.updated > have.updated)) { var i = out.indexOf(have); out[i] = s; byName[k] = s; }
      else { ['alert', 'warning', 'danger', 'normal', 'lat', 'lon'].forEach(function (f) { if (have[f] === null || have[f] === undefined) have[f] = s[f]; }); have.status = stationStatus(have); }
    });
    out.sort(function (a, b) { return (STATUS_RANK[b.status] - STATUS_RANK[a.status]) || String(a.name).localeCompare(b.name); });
    return out;
  }

  /* ------------------------------------------------------------- snapshot */
  /* raw = { openMeteo:{ok,data,at,error}, marine:{...}, metForecast, metWarning, flood, ibWater:{ok,tables}, ibRain:{ok,tables} } */
  function assemble(raw, settings, prev, now) {
    var s = cleanSettings(settings);
    now = now || Date.now();
    prev = prev || {};
    var snap = { version: 1, at: now, kind: s.kind, location: { name: s.locationName, kind: s.kind, lat: s.lat, lon: s.lon, marineLat: s.marineLat, marineLon: s.marineLon },
      sources: {}, sites: prev.sites || {}, diag: {} };
    /* sources this profile does not use are left out entirely (an offshore point has no river stations) */
    var off = { metForecast: !s.metLocationId, flood: !(s.useDataGovFlood && s.waterDistrict), ibWater: !s.scrapeInfobanjir, ibRain: !s.scrapeInfobanjir };
    function src(key, label, fn, keepPrev) {
      if (off[key]) return null;
      var r = raw[key];
      var p = (prev.sources || {})[key] || {};
      if (!r) { snap.sources[key] = p.label ? p : { label: label, ok: null, skipped: true }; return keepPrev; }
      if (r.ok) {
        try {
          var v = fn(r);
          snap.sources[key] = { label: label, ok: true, at: r.at || now, ms: r.ms || null, count: Array.isArray(v) ? v.length : undefined };
          return v;
        } catch (e) { r = { ok: false, error: e.message }; }
      }
      snap.sources[key] = { label: label, ok: false, error: String(r.error || L('Gagal')), at: p.at || null, failedAt: now, fails: (p.fails || 0) + 1, ms: r.ms || null };
      return keepPrev;
    }
    snap.weather = src('openMeteo', L('Open-Meteo (cuaca & hujan)'), function (r) { return parseOpenMeteo(r.data, now); }, prev.weather || null);
    snap.marine = src('marine', L('Open-Meteo Marine (ombak & paras laut)'), function (r) { return parseMarine(r.data, now); }, prev.marine || null);
    off.river = s.kind === 'offshore';
    snap.river = off.river ? null : src('river', L('Open-Meteo Flood (GloFAS, aliran sungai)'), function (r) { return parseRiver(r.data, now); }, prev.river || null);
    snap.outlook = src('outlook', L('Open-Meteo Ensemble (28 hari)'), function (r) { return parseOutlook(r.data); }, prev.outlook || null);
    off.tideMirror = s.tidePlace !== 'cukai';
    snap.tide = off.tideMirror ? null : src('tideMirror', L('Tide Forecast - Cukai (mirror GitHub)'), function (r) { var t = parseTideMirror(r.data); t.live = !!r.live; return t; }, prev.tide || null);
    var fc = src('metForecast', L('MET Malaysia - ramalan'), function (r) { return parseMetForecast(r.data, s.metLocationId, now); }, (prev.met || {}).forecast || []);
    var wr = src('metWarning', L('MET Malaysia - amaran'), function (r) { return parseMetWarnings(r.data, s.warningKeywords, now); }, null);
    if (!wr) wr = prev.met ? { relevant: (prev.met.warnings || []).filter(function (w) { return w.to ? w.to > now : true; }), otherCount: prev.met.warningsOther || 0 } : { relevant: [], otherCount: 0 };
    /* Monsoon EYE: land warnings only (rain, floods, thunderstorms); OceanWATCH: sea warnings only (strong winds & rough seas) */
    var wl = wr.relevant, skipped = 0;
    if (ED && ED.kind) { wl = wl.filter(function (w) { var keep = ED.kind === 'offshore' ? metIsSea(w) : !metIsSea(w); if (!keep) skipped++; return keep; }); }
    snap.met = { forecast: off.metForecast ? [] : (fc || []), warnings: wl, warningsOther: wr.otherCount + skipped };

    /* the web app reads the same stations from JPS Public Infobanjir (through the relay) instead */
    off.jpsWater = off.ibWater; off.jpsRain = off.ibRain; off.jpsMirror = off.ibWater;
    /* GitHub mirror of JPS (web app): water level + rainfall in one file; the whole state is kept for the full JPS tables */
    var mir = raw.jpsMirror ? src('jpsMirror', raw.jpsMirror.live ? L('JPS Public Infobanjir (terus melalui relay)') : L('JPS Public Infobanjir (mirror GitHub ~15 min)'), function (r) {
      if (!r.data || !r.data.water) throw new Error(L('Fail mirror kosong'));
      return r.data;
    }, null) : null;
    if (mir) snap.jps = { live: !!raw.jpsMirror.live, state: mir.state, water: mir.water || [], rain: mir.rain || { days: [], stations: [] }, waterAt: mir.waterAt ? Date.parse(mir.waterAt) : null,
      rainAt: mir.rainAt ? Date.parse(mir.rainAt) : null, waterUrl: mir.waterUrl, rainUrl: mir.rainUrl, errors: mir.errors || {} };
    else if (!off.jpsMirror && prev.jps) snap.jps = prev.jps;
    var ib = mir ? fromMirror(mir, 'water', s.waterDistrict, now) : raw.jpsWater ? src('jpsWater', L('JPS Public Infobanjir - paras air'), function (r) { return parseJps(r.html, 'water', s.waterDistrict, now); }, null)
      : src('ibWater', L('infobanjir Terengganu - paras air'), function (r) { snap.diag.ibWater = (r.tables || []).slice(0, 4); return parseTables(r.tables, 'water', now); }, null);
    var gov = src('flood', L('data.gov.my - paras air'), function (r) { return parseFloodWarning(r.data, s.waterDistrict); }, null);
    var ibr = mir ? fromMirror(mir, 'rain', s.waterDistrict, now) : raw.jpsRain ? src('jpsRain', L('JPS Public Infobanjir - hujan'), function (r) { return parseJps(r.html, 'rain', s.waterDistrict, now); }, null)
      : src('ibRain', L('infobanjir Terengganu - hujan'), function (r) { snap.diag.ibRain = (r.tables || []).slice(0, 4); return parseTables(r.tables, 'rain', now); }, null);
    var prevSt = prev.stations || [];
    var stations;
    if (off.ibWater && off.flood) stations = [];
    else if (ib === null && gov === null) stations = prevSt;
    else stations = mergeStations(ib || prevSt.filter(function (x) { return x.source !== 'data.gov.my'; }), gov || prevSt.filter(function (x) { return x.source === 'data.gov.my'; }));
    var staleMs = s.staleHours * 3600000;
    stations.forEach(function (st) { st.stale = !st.updated || now - st.updated > staleMs; });
    snap.stations = stations;
    snap.rainStations = off.ibRain ? [] : (ibr || prev.rainStations || []);
    snap.rainStations.forEach(function (st) { st.stale = !st.updated || now - st.updated > staleMs; });
    snap.diag = Object.keys(snap.diag).length ? snap.diag : (prev.diag || {});
    return snap;
  }

  /* --------------------------------------------------------------- alerts */
  var LEVEL_RANK = { info: 1, warning: 2, critical: 3 };
  function kt(kmh) { return kmh === null || kmh === undefined ? null : kmh / 1.852; }
  function f1(n) { return n === null || n === undefined ? '-' : (Math.round(n * 100) / 100).toString(); }
  function evaluateAlerts(snap, settings, history, now) {
    var s = cleanSettings(settings);
    now = now || Date.now();
    var out = [];
    var minRank = STATUS_RANK[s.waterAlertLevel];
    (snap.stations || []).forEach(function (st) {
      if (st.stale) return;
      var r = STATUS_RANK[st.status];
      if (r >= minRank && r >= 1) {
        out.push({ key: 'water:' + st.id + ':' + st.status, cat: 'water', level: st.status === 'danger' ? 'critical' : st.status === 'warning' ? 'warning' : 'info',
          title: L('Paras air {s}: {n}', { s: statusName(st.status).toUpperCase(), n: st.name }),
          body: f1(st.level) + ' m' + (st.trend === 'rising' ? L(' (naik)') : '') + ' · ' + L('Waspada') + ' ' + f1(st.alert) + ' · ' + L('Amaran') + ' ' + f1(st.warning) + ' · ' + L('Bahaya') + ' ' + f1(st.danger) });
      }
    });
    /* fast rise: compare with the reading closest to 1 hour ago in the history */
    if (s.waterRiseM > 0 && history && history.length) {
      (snap.stations || []).forEach(function (st) {
        if (st.stale || st.level === null) return;
        var best = null;
        history.forEach(function (h) {
          var age = now - h.t;
          if (age >= 45 * 60000 && age <= 90 * 60000 && h.levels && h.levels[st.id] !== undefined && h.levels[st.id] !== null) {
            if (!best || Math.abs(age - 3600000) < Math.abs(now - best.t - 3600000)) best = h;
          }
        });
        if (best && st.level - best.levels[st.id] >= s.waterRiseM) {
          out.push({ key: 'rise:' + st.id + ':' + dateKey(now) + ':' + myt(now).h, cat: 'water', level: 'warning', title: L('Paras air naik cepat: {n}', { n: st.name }),
            body: L('Naik {d} m dalam ~{m} minit (kini {v} m)', { d: f1(st.level - best.levels[st.id]), m: Math.round((now - best.t) / 60000), v: f1(st.level) }) });
        }
      });
    }
    var w = snap.weather;
    if (w && w.summary) {
      if (w.summary.next3h !== null && w.summary.next3h >= s.rain3hMm)
        out.push({ key: 'rain3h:' + dateKey(now), cat: 'rain', level: 'warning', title: L('Hujan lebat dijangka (3 jam)'), body: L('Ramalan {v} mm dalam 3 jam akan datang (ambang {t} mm)', { v: f1(w.summary.next3h), t: s.rain3hMm }) });
      if (w.summary.next24h !== null && w.summary.next24h >= s.rain24hMm)
        out.push({ key: 'rain24h:' + dateKey(now), cat: 'rain', level: 'warning', title: L('Hujan banyak dijangka (24 jam)'), body: L('Ramalan {v} mm dalam 24 jam (ambang {t} mm)', { v: f1(w.summary.next24h), t: s.rain24hMm }) });
      var g = Math.max(w.current && w.current.gust !== null ? w.current.gust : 0, w.summary.maxGust6h || 0);
      if (g >= s.gustKmh)
        out.push({ key: 'gust:' + dateKey(now), cat: 'wind', level: 'warning', title: L('Angin kencang'), body: L('Tiupan sehingga {v} km/j ({k} knot) dalam 6 jam (ambang {t} km/j)', { v: Math.round(g), k: Math.round(kt(g)), t: s.gustKmh }) });
      if (s.visKm > 0 && w.summary.minVis6h !== null && w.summary.minVis6h !== undefined && w.summary.minVis6h < s.visKm)
        out.push({ key: 'vis:' + dateKey(now), cat: 'wind', level: 'warning', title: L('Penglihatan rendah'), body: L('Jarak penglihatan serendah {v} km dalam 6 jam (ambang {t} km)', { v: f1(w.summary.minVis6h), t: s.visKm }) });
      if (s.thunderAlert && w.summary.thunderAt)
        out.push({ key: 'thunder:' + dateKey(now) + ':' + Math.floor(myt(now).h / 6), cat: 'wind', level: 'warning', title: L('Ribut petir dijangka'),
          body: L('Ramalan ribut petir sekitar {t} (dalam 6 jam) di {p}', { t: fmtTime(w.summary.thunderAt), p: s.locationName }) });
    }
    var m = snap.marine;
    if (m && m.maxWave24h !== null && m.maxWave24h !== undefined && m.maxWave24h >= s.waveM)
      out.push({ key: 'wave:' + dateKey(now), cat: 'sea', level: 'warning', title: L('Ombak tinggi'), body: L('Sehingga {v} m dalam 24 jam', { v: f1(m.maxWave24h) }) + (m.maxSwell24h ? L(', alun {s} m', { s: f1(m.maxSwell24h) }) : '') + L(' (ambang {t} m)', { t: s.waveM }) });
    /* early warnings worked out by the page / the PC (risk.js): river rising fast, wind / waves rising offshore */
    (snap.early || []).forEach(function (e) { if (e && e.key && e.title) out.push({ key: e.key, cat: e.cat || 'water', level: e.level || 'info', title: e.title, body: e.body || '', quiet: !!e.quiet }); });
    ((snap.met || {}).warnings || []).forEach(function (wn) {
      var en = I18N && I18N.lang() !== 'ms';
      out.push({ key: 'met:' + wn.id, cat: 'met', level: wn.severity, title: 'MET: ' + (en ? (wn.title_en || wn.title_bm) : (wn.title_bm || wn.title_en)),
        body: metShort(wn, s, now) || (en ? (wn.heading_en || wn.text_en || wn.heading_bm || wn.text_bm) : (wn.heading_bm || wn.text_bm || wn.heading_en || wn.text_en) || '').slice(0, 220) });
    });
    out.sort(function (a, b) { return LEVEL_RANK[b.level] - LEVEL_RANK[a.level]; });
    return out;
  }
  /* Open-Meteo is free for ~10,000 calls a day for one internet address. How long to wait between model fetches (ms):
     the chosen minutes under half of the budget, then 10, 30, 60 minutes; nothing while refused (HTTP 429) */
  function omEvery(count, budget, everyMin, blockedUntil, now) {
    if (blockedUntil && now < blockedUntil) return Infinity;
    var r = (count || 0) / (budget || 1), e = Math.max(3, everyMin || 3);
    return (r < 0.5 ? e : r < 0.75 ? Math.max(e, 10) : r < 0.9 ? Math.max(e, 30) : 60) * 60000;
  }
  /* alerts that should ring now: new keys, or the same subject at a higher level */
  function newAlerts(prevActive, current) {
    var prev = {};
    (prevActive || []).forEach(function (a) { prev[a.key] = a; });
    /* quiet alerts (an early warning below the confidence needed) are listed but never ring */
    return (current || []).filter(function (a) { var p = prev[a.key]; return !a.quiet && (!p || LEVEL_RANK[a.level] > LEVEL_RANK[p.level]); });
  }

  /* ------------------------------------------------- dates written in a page
     Used to warn when a page (often a camera) only shows old dates, e.g. its newest date is from 2025.
     Full dates only (a bare year such as "© 2025" is ignored). Returns the newest date not in the future. */
  var MON = { jan: 1, feb: 2, mar: 3, mac: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogo: 8, ogos: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12 };
  function newestDate(text, now) {
    now = now || Date.now();
    text = String(text || '').slice(0, 200000);
    var best = null, m, re;
    function take(ms) { if (ms && ms <= now + 36 * 3600000 && ms > Date.UTC(2000, 0, 1) && (best === null || ms > best)) best = ms; }
    re = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})(?:[ ,T]+(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm|AM|PM)?)?/g;
    while ((m = re.exec(text))) take(flexTime(m[0], now));
    re = /\b(20\d{2})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?/g;
    while ((m = re.exec(text))) take(flexTime(m[0], now));
    re = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|mac|apr|may|mei|jun|jul|aug|ogos?|sep|oct|okt|nov|dec|dis)[a-z]*\.?,?\s+(20\d{2})(?:,?\s+(\d{1,2})[:.](\d{2}))?/gi;
    while ((m = re.exec(text))) { var mo = MON[m[2].toLowerCase()]; if (mo) take(Date.UTC(+m[3], mo - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) - TZ_OFFSET_MIN * 60000); }
    re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})(?:,?\s+(\d{1,2}):(\d{2}))?/gi;
    while ((m = re.exec(text))) { var mo2 = MON[m[1].toLowerCase()]; if (mo2) take(Date.UTC(+m[3], mo2 - 1, +m[2], +(m[4] || 0), +(m[5] || 0)) - TZ_OFFSET_MIN * 60000); }
    return best;
  }

  /* ---------------------------------------------------------- formatting */
  function fmtTime(ms) { if (!ms) return '-'; var p = myt(ms); return pad(p.h) + ':' + pad(p.mi); }
  var DAYS = { ms: ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
  var MONTHS = { ms: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
  function lg() { return I18N && I18N.lang() === 'ms' ? 'ms' : 'en'; }
  function fmtDate(ms) { if (!ms) return '-'; var p = myt(ms); return DAYS[lg()][p.wd] + ' ' + p.d + ' ' + MONTHS[lg()][p.mo - 1]; }
  function fmtDateTime(ms) { if (!ms) return '-'; var p = myt(ms); return p.d + ' ' + MONTHS[lg()][p.mo - 1] + ' ' + p.y + ', ' + fmtTime(ms); }
  function timeAgo(ms, now) {
    if (!ms) return '-';
    var s = Math.round(((now || Date.now()) - ms) / 1000);
    if (s < 60) return L('baru tadi');
    if (s < 3600) return L('{n} min lalu', { n: Math.round(s / 60) });
    if (s < 86400) return L('{n} jam lalu', { n: Math.round(s / 3600) });
    return L('{n} hari lalu', { n: Math.round(s / 86400) });
  }

  return {
    siteBlocked: siteBlocked, altFor: altFor, ALT: ALT, adHosts: adHosts, relayHosts: relayHosts, relayReady: relayReady, relayFor: relayFor, malaysiaOnly: malaysiaOnly, relayAdsFor: relayAdsFor, relayVerdict: relayVerdict, relayUrlFor: relayUrlFor, relayMirrorUrl: relayMirrorUrl, pokeMirror: pokeMirror, relayCode: relayCode, parseMetText: parseMetText, metType: metType, metSummary: metSummary, metShort: metShort, metWhen: metWhen, metRange: metRange, windText: windText, metDate: metDate,
    VERSION: VERSION, ED: ED, metIsSea: metIsSea, CATEGORIES: CATEGORIES, SITES: SITES, siteById: siteById, siteUrl: siteUrl, hostOf: hostOf, certAllowed: certAllowed, CERT_ALLOW: CERT_ALLOW,
    DEFAULTS: DEFAULTS, REFRESH_CHOICES: REFRESH_CHOICES, cleanSettings: cleanSettings, urls: urls, SCRAPE: SCRAPE, jpsUrls: jpsUrls, mirrorBase: mirrorBase, mirrorUrls: mirrorUrls, fromMirror: fromMirror, parseOutlook: parseOutlook, parseTideMirror: parseTideMirror, parseRiver: parseRiver, parseJps: parseJps, htmlRows: htmlRows, htmlText: htmlText, JPS_STATES: JPS_STATES,
    PROFILE_KEYS: PROFILE_KEYS, DEFAULT_PROFILES: DEFAULT_PROFILES, OFFSHORE_BASE: OFFSHORE_BASE, cleanProfile: cleanProfile, profileSettings: profileSettings,
    newestDate: newestDate, kt: kt,
    omEvery: omEvery, num: num, localMs: localMs, flexTime: flexTime, myt: myt, dateKey: dateKey, wmo: wmo, compass: compass,
    parseOpenMeteo: parseOpenMeteo, parseMarine: parseMarine, parseMetForecast: parseMetForecast, parseMetWarnings: parseMetWarnings,
    parseFloodWarning: parseFloodWarning, parseTables: parseTables, mergeStations: mergeStations, stationStatus: stationStatus,
    STATUS_RANK: STATUS_RANK, STATUS_BM: STATUS_BM, statusName: statusName, L: L, LEVEL_RANK: LEVEL_RANK, assemble: assemble, evaluateAlerts: evaluateAlerts, newAlerts: newAlerts,
    fmtTime: fmtTime, fmtDate: fmtDate, fmtDateTime: fmtDateTime, timeAgo: timeAgo
  };
});
