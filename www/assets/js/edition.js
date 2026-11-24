/* Sentinel OceanWATCH 1.3.0 - which app this is. Made by tools/build-edition.js from tools/editions.js; do not edit by hand. */
(function (ALL, FIXED) {
  /* the edition this copy of the app is */
  var id = FIXED;
  if (!id) {
    var q = /[?&]ed=(me|ow|monsoon-eye|oceanwatch)\b/.exec(location.search || ''), keep = null;
    try { keep = sessionStorage.getItem('dev_edition'); } catch (e) { /* */ }
    id = q ? (q[1] === 'ow' || q[1] === 'oceanwatch' ? 'oceanwatch' : 'monsoon-eye') : keep || 'monsoon-eye';
    try { sessionStorage.setItem('dev_edition', id); } catch (e) { /* */ }
  }
  var E = ALL[id];
  /* storage: the three apps (Dashboard Cuaca, Monsoon EYE, OceanWATCH) live on the same address (azizdigital.github.io), so the
     browser gives them ONE localStorage. The code still says 'mc_...'; here every 'mc_' key becomes this app's own prefix.
     E.rawGet reads the real key (used once, to import the settings of the original Dashboard Cuaca). */
  try {
    var S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
    var k = function (x) { x = String(x); return x.indexOf('mc_') === 0 ? E.prefix + x.slice(3) : x; };
    E.rawGet = function (x) { try { return g.call(localStorage, String(x)); } catch (e) { return null; } };
    if (!S.__edition) {
      S.getItem = function (x) { return g.call(this, k(x)); };
      S.setItem = function (x, v) { return s.call(this, k(x), v); };
      S.removeItem = function (x) { return r.call(this, k(x)); };
      S.__edition = id;
    }
  } catch (e) { /* no storage */ }
  try { document.documentElement.setAttribute('data-edition', E.short); } catch (e) { /* worker */ }
  self.EDITION = E;
})({"oceanwatch":{"id":"oceanwatch","short":"ow","kind":"offshore","version":"1.3.0","pc":{"port":30060,"appId":"local.oceanwatch.aziz","exe":"Sentinel OceanWATCH"},"name":"Sentinel OceanWATCH","nameHtml":"SENTINEL Ocean<em>WATCH</em>","tagline":"Offshore Weather Guideline & Monitoring","repo":"azizdigital/oceanwatch","url":"https://azizdigital.github.io/oceanwatch/","prefix":"ow_","cache":"oceanwatch-","themeColor":"#030c1c","defaults":{"lang":"en","relayUrl":"","kind":"offshore","tidePlace":"model","scrapeInfobanjir":false,"useDataGovFlood":false,"metLocationId":"","waterDistrict":"","warningKeywords":"Terengganu, Condore, Reef North","locationName":"Irong Barat","lat":5.5501,"lon":104.7745,"marineLat":5.5501,"marineLon":104.7745},"profiles":["irong-barat"],"activeProfile":"irong-barat","sites":["zoomearth","rainviewer","metradar","himawari","metmarine","windywave","windywind","nullschool","windyswell","blitzortung","vesselfinder","marinetraffic","storms"],"wall":["dashboard","windywave","windywind","nullschool","vesselfinder","metradar"]}}, "oceanwatch");
