/* HTML for one app: the __APP_...__ words filled in, and the <!--ED:me--> ... <!--/ED--> parts of the other app taken out.
   Used by tools/serve.js (development, both apps from one folder) and tools/export.js (the two repos). */
'use strict';
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function transform(html, ed) {
  html = html.replace(/<!--ED:(me|ow)-->\r?\n?([\s\S]*?)<!--\/ED-->\r?\n?/g, function (m, who, body) { return who === ed.short ? body : ''; });
  const words = {
    __APP_NAME_HTML__: ed.nameHtml, __APP_NAME__: escHtml(ed.name), __APP_SHORT__: escHtml(ed.short === 'ow' ? 'OceanWATCH' : 'Monsoon EYE'),
    __APP_TAGLINE__: escHtml(ed.tagline), __APP_VERSION__: ed.version, __THEME_COLOR__: ed.themeColor, __APP_KIND__: ed.kind,
    __ED_IMG__: ed.exported ? 'assets/icons' : 'assets/ed/' + ed.short, __ED_MANIFEST__: ed.exported ? 'manifest.webmanifest' : 'assets/ed/' + ed.short + '/manifest.webmanifest'
  };
  return html.replace(/__APP_[A-Z_]+__|__THEME_COLOR__|__ED_[A-Z]+__/g, function (w) { return words[w] !== undefined ? words[w] : w; });
}
module.exports = { transform };
