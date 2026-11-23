/* Dashboard Cuaca Aziz - small fixes for sites shown inside the app (loaded by the relay v3, and by the PC app).
   Each fix only touches its own site. Kept in the web app on GitHub, so it can change without a new relay script. */
(function () {
  'use strict';
  var parts = location.pathname.split('/');
  /* through the relay the address is /<key>/<proto>/<host>/<path>; on the PC app it is the site itself */
  var host = /^https?$/.test(parts[2] || '') && parts[3] ? parts[3] : location.hostname;
  var hash = {};
  String(location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
    var i = kv.indexOf('=');
    if (i > 0) hash[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
  });
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  /* JPS Public Infobanjir (water level / rainfall): open with the profile's district chosen, like picking it by hand */
  if (/publicinfobanjir\.water\.gov\.my$/.test(host) && hash.dcdistrict && hash.dcdistrict !== 'ALL') {
    ready(function () {
      var tries = 0;
      (function pick() {
        var d = document.getElementById('district');
        var has = d && [].some.call(d.options, function (o) { return o.value.toLowerCase() === hash.dcdistrict.toLowerCase(); });
        if (!has) { if (++tries < 40) setTimeout(pick, 250); return; }
        [].forEach.call(d.options, function (o) { if (o.value.toLowerCase() === hash.dcdistrict.toLowerCase()) d.value = o.value; });
        if (typeof window.searchStation === 'function') window.searchStation();
        else d.dispatchEvent(new Event('change', { bubbles: true }));
      })();
    });
  }
}());
