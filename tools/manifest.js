/* the web app manifest of one app (name, colours, icons): node tools/manifest.js writes the development copies in www/assets/ed/<app>/ */
'use strict';
const E = require('./editions');
function manifest(ed, exported) {
  const img = exported ? 'assets/icons/' : '';
  return JSON.stringify({
    name: ed.name, short_name: ed.short === 'ow' ? 'OceanWATCH' : 'Monsoon EYE', description: ed.tagline, lang: ed.defaults.lang,
    id: ed.url, start_url: exported ? './' : '../../../', scope: exported ? './' : '../../../', display: 'standalone', orientation: 'any',
    background_color: ed.themeColor, theme_color: ed.themeColor,
    icons: [
      { src: img + 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: img + 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: img + 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }, null, 2) + '\n';
}
module.exports = { manifest };
if (require.main === module) {
  const fs = require('fs'), path = require('path');
  Object.keys(E).forEach(id => fs.writeFileSync(path.join(__dirname, '..', 'www', 'assets', 'ed', E[id].short, 'manifest.webmanifest'), manifest(E[id], false)));
  console.log('manifests written');
}
