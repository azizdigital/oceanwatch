/* Writes www/assets/js/edition.js for one app:  node tools/build-edition.js monsoon-eye | oceanwatch | dev
   dev = both editions in one file; pick with ?ed=me / ?ed=ow (kept in sessionStorage) - for working on both apps from one folder. */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./editions');

const which = process.argv[2] || 'dev';
const out = path.join(__dirname, '..', 'www', 'assets', 'js', 'edition.js');
const pick = which === 'dev' ? null : E[which];
if (which !== 'dev' && !pick) { console.error('unknown edition: ' + which); process.exit(1); }
const data = pick ? { [pick.id]: pick } : E;

const runtime = function (ALL, FIXED) {
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
};

const src = '/* ' + (pick ? pick.name + ' ' + pick.version : 'DEVELOPMENT: both apps (?ed=me / ?ed=ow)') + ' - which app this is. Made by tools/build-edition.js from tools/editions.js; do not edit by hand. */\n' +
  '(' + runtime.toString() + ')(' + JSON.stringify(data) + ', ' + JSON.stringify(pick ? pick.id : null) + ');\n';
fs.writeFileSync(out, src);
console.log('edition.js: ' + (pick ? pick.id : 'dev (both)'));
