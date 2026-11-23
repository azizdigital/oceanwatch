/* Dashboard Cuaca Aziz - service worker (phones and browsers; the desktop app does not use it).
   Keeps the app itself on the phone, so it opens without the PC. Data (/api, and the public APIs) always
   comes from the network; the last data is kept by the page in localStorage.
   The cache name comes from precache-manifest.js (content hash), so every change makes a new version. */
importScripts('./precache-manifest.js', './assets/js/edition.js');
/* Monsoon EYE / OceanWATCH / Dashboard Cuaca share one address (azizdigital.github.io), so they share the browser's caches:
   each app only ever creates and deletes caches with its own name */
var PREFIX = (self.EDITION && self.EDITION.cache) || 'dashboard-cuaca-';
var CACHE = PREFIX + (self.APP_VERSION || 'dev');

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    var all = (self.APP_CORE || []).concat(self.APP_ASSETS || []);
    return Promise.all(all.map(function (u) { return c.add(new Request(u, { cache: 'no-cache' })).catch(function () { /* keep going */ }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf(PREFIX) === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;                       /* public APIs and web sites: straight to the network */
  if (url.pathname.indexOf('/api/') === 0 || url.pathname === '/dashboard-cuaca-ca.crt') return;
  var isPage = req.mode === 'navigate';
  /* network first (a few seconds), the copy kept on the device when offline or slow. Network first for every file, not only
     the page: a new page with the old scripts from the device's copy stopped the app after an update (4.6.1 / 1.1.1). */
  e.respondWith(caches.open(CACHE).then(function (c) {
    /* the app's start page under './index.html'; another page (kemaman.html, splash.html, also inside a frame) under its own address */
    var key = isPage ? (/\/$/.test(url.pathname) ? './index.html' : url.origin + url.pathname) : req;
    var kept = function () { return c.match(key, { ignoreSearch: true }); };
    var net = fetch(isPage ? req.url : req, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      if (r && r.ok && r.type === 'basic') c.put(key, r.clone());
      return r;
    });
    var slow = new Promise(function (res) { setTimeout(function () { res(null); }, 4000); });
    return Promise.race([net.catch(function () { return null; }), slow]).then(function (r) {
      if (r) return r;
      return kept().then(function (h) { return h || net; });
    }).catch(function () {
      return kept().then(function (h) { return h || (isPage ? new Response('Offline', { status: 503 }) : Response.error()); });
    });
  }));
});

/* tapping a phone notification opens the app on the Alert page */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].focus();
    return self.clients.openWindow('./');
  }));
});
