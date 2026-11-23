/* Sentinel OceanWATCH - Settings › My jobs: the user's own jobs (e.g. "Wellwork - HWU") with their stop limits, the caution limits
   (80% of stop unless changed), daylight only, thunder, and how long demob takes and how people leave (boat / helicopter / tow).
   Kept in the same setting as the job limits (advLimits, "_my"), so they show in the Jobs table (★), the dashboard and Ask AI › Continue or demob. */
(function () {
  'use strict';
  var MC = window.MC, C = window.MCCore, ED = window.EDITION || {}, I18N = window.MCI18n;
  if (!MC || ED.kind !== 'offshore' || !document.getElementById('myJobsBody')) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = MC.esc, state = MC.state;
  var T = function (bm, en) { return I18N.lang() === 'en' ? en : bm; };
  var A = function () { return window.MCAdvisor; };
  var edit = null;   /* the job being edited (copy), or null */
  var F = [['w', T('Angin', 'Wind'), 'kt'], ['g', T('Tiupan', 'Gusts'), 'kt'], ['h', 'Hs', 'm'], ['sw', T('Alun', 'Swell'), 'm'], ['tp', T('Tempoh alun', 'Swell period'), 's'], ['vis', T('Penglihatan (kurang dari)', 'Visibility (below)'), 'km']];
  function mine() { return A().limits(state.settings.advLimits).acts.filter(function (a) { return a.mine; }); }
  function num(v) { var x = parseFloat(String(v === undefined ? '' : v).replace(',', '.')); return isFinite(x) ? x : null; }
  function render(force) {
    var body = $('myJobsBody'), list = mine();
    if (!body || (!force && edit && body.contains(document.activeElement))) return;
    var via = { boat: T('bot', 'boat'), heli: T('helikopter', 'helicopter'), tow: T('tunda barge', 'tow barge') };
    var h = '<div class="mj-list">' + (list.length ? list.map(function (a) {
      var lim = F.filter(function (p) { return a[p[0]]; }).map(function (p) { return p[1] + ' ' + a[p[0]][1] + ' ' + p[2]; }).join(' · ');
      return '<div class="mj-row"><span>★</span><b>' + esc(a.name) + '<br><small>' + esc(lim || '-') + ' · ' + T('demob {d} j + {s} j, dengan {v}', 'demob {d} h + {s} h, by {v}').replace('{d}', a.demobH).replace('{s}', a.safeH).replace('{v}', via[a.via] || a.via) + (a.on === false ? ' · ' + T('dimatikan', 'off') : '') + '</small></b>' +
        '<button type="button" class="btn sm" data-mj-edit="' + esc(a.id) + '">' + T('Ubah', 'Edit') + '</button><button type="button" class="btn sm warn" data-mj-del="' + esc(a.id) + '">' + T('Padam', 'Delete') + '</button></div>';
    }).join('') : '<p class="muted">' + T('Belum ada kerja sendiri. Contoh: "Wellwork - HWU", henti bila angin 20 kt / tiupan 28 kt / Hs 1.8 m, demob 6 jam dengan bot.', 'No own jobs yet. Example: "Wellwork - HWU", stop at wind 20 kt / gusts 28 kt / Hs 1.8 m, demob 6 hours by boat.') + '</p>') + '</div>';
    if (!edit) h += '<button type="button" class="btn pri" id="mjAdd">➕ ' + T('Tambah kerja saya', 'Add my job') + '</button>';
    else h += form(edit);
    body.innerHTML = h;
    if ($('mjAdd')) $('mjAdd').onclick = function () { edit = { id: '', name: '', w: [16, 20], g: [22, 28], h: [1.4, 1.8], day: false, lt: 's', on: true, demobH: 6, safeH: 1, via: 'boat' }; render(true); };
    if ($('mjSave')) $('mjSave').onclick = save;
    if ($('mjCancel')) $('mjCancel').onclick = function () { edit = null; render(true); };
  }
  function form(a) {
    var row = function (p) { var v = a[p[0]] || ['', '']; return '<tr><td>' + p[1] + ' (' + p[2] + ')</td><td><input class="inp" inputmode="decimal" data-mj="' + p[0] + '1" value="' + esc(v[1]) + '" placeholder="-"></td><td><input class="inp" inputmode="decimal" data-mj="' + p[0] + '0" value="' + esc(v[0]) + '" placeholder="' + T('auto 80%', 'auto 80%') + '"></td></tr>'; };
    return '<div class="dz-grid" style="margin-top:6px">' +
      '<div class="dz-f"><label>' + T('Nama kerja', 'Job name') + '</label><input class="inp" id="mjName" value="' + esc(a.name) + '" placeholder="' + T('cth Wellwork - HWU', 'e.g. Wellwork - HWU') + '" maxlength="60"></div>' +
      '<div class="dz-f"><label>' + T('Demob ambil (jam)', 'Demob takes (hours)') + '</label><input class="inp" id="mjDemob" inputmode="decimal" value="' + esc(a.demobH) + '"><div class="dz-ex">' + T('Rig down + kemas + naik bot / heli. Contoh: 6.', 'Rig down + pack + board the boat / heli. Example: 6.') + '</div></div>' +
      '<div class="dz-f"><label>' + T('Masa selamat tambahan (jam)', 'Extra safety time (hours)') + '</label><input class="inp" id="mjSafe" inputmode="decimal" value="' + esc(a.safeH) + '"></div>' +
      '<div class="dz-f"><label>' + T('Demob dengan', 'Demob by') + '</label><select class="sel" id="mjVia"><option value="boat"' + (a.via === 'boat' ? ' selected' : '') + '>' + T('Bot (had baris Crew boat / FCB)', 'Boat (Crew boat / FCB limits)') + '</option><option value="heli"' + (a.via === 'heli' ? ' selected' : '') + '>' + T('Helikopter (had baris Helikopter)', 'Helicopter (Helicopter limits)') + '</option><option value="tow"' + (a.via === 'tow' ? ' selected' : '') + '>' + T('Tunda barge (had Vesel bekalan)', 'Tow barge (Supply vessel limits)') + '</option></select></div>' +
      '<div class="dz-f"><label>' + T('Siang sahaja (07–19)', 'Daylight only (07–19)') + '</label><select class="sel" id="mjDay"><option value="0"' + (!a.day ? ' selected' : '') + '>' + T('Tidak', 'No') + '</option><option value="1"' + (a.day ? ' selected' : '') + '>' + T('Ya', 'Yes') + '</option></select></div>' +
      '<div class="dz-f"><label>' + T('Ribut petir', 'Thunderstorm') + '</label><select class="sel" id="mjLt"><option value="s"' + (a.lt !== 'c' ? ' selected' : '') + '>' + T('Henti kerja', 'Stop work') + '</option><option value="c"' + (a.lt === 'c' ? ' selected' : '') + '>' + T('Berhati-hati sahaja', 'Caution only') + '</option></select></div>' +
      '</div><div class="oc-scroll" style="margin-top:10px"><table class="tbl dz-tbl"><thead><tr><th>' + T('Had', 'Limit') + '</th><th>' + T('Henti (No-Go)', 'Stop (No-Go)') + '</th><th>' + T('Berhati-hati', 'Caution') + '</th></tr></thead><tbody>' + F.map(row).join('') + '</tbody></table></div>' +
      '<p class="note">' + T('Kosongkan "Henti" untuk had yang tidak dipakai. Penglihatan: henti bila KURANG dari nilai. Tempoh alun dikira bila alun ≥ 0.8 m.', 'Leave "Stop" empty for limits not used. Visibility: stop when BELOW the value. Swell period counts when the swell is ≥ 0.8 m.') + '</p>' +
      '<div class="dz-nav"><span class="muted" id="mjMsg" style="margin-right:auto"></span><button type="button" class="btn" id="mjCancel">' + T('Batal', 'Cancel') + '</button><button type="button" class="btn pri" id="mjSave">' + T('Simpan kerja', 'Save job') + '</button></div>';
  }
  function save() {
    var a = Object.assign({}, edit), name = $('mjName').value.trim();
    if (!name) { $('mjMsg').textContent = T('Beri nama kerja.', 'Give the job a name.'); return; }
    a.name = name.slice(0, 60);
    a.demobH = Math.max(0, Math.min(72, num($('mjDemob').value) === null ? 6 : num($('mjDemob').value)));
    a.safeH = Math.max(0, Math.min(24, num($('mjSafe').value) === null ? 1 : num($('mjSafe').value)));
    a.via = $('mjVia').value; a.day = $('mjDay').value === '1'; a.lt = $('mjLt').value;
    var any = false;
    F.forEach(function (p) {
      var st = num(document.querySelector('[data-mj="' + p[0] + '1"]').value), c = num(document.querySelector('[data-mj="' + p[0] + '0"]').value);
      if (st === null) { delete a[p[0]]; return; }
      if (c === null) c = p[0] === 'vis' ? Math.round(st * 1.25 * 10) / 10 : Math.round(st * 0.8 * 10) / 10;
      a[p[0]] = [c, st]; any = true;
    });
    if (!any) { $('mjMsg').textContent = T('Isi sekurang-kurangnya satu had henti.', 'Fill in at least one stop limit.'); return; }
    if (!a.id) {
      var base = 'my-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'my-job', id = base, n = 2;
      while (mine().some(function (x) { return x.id === id; })) id = base + '-' + (n++);
      a.id = id;
    }
    var list = mine().filter(function (x) { return x.id !== a.id; }).concat([a]);
    store(list).then(function () { edit = null; render(true); MC.toast(T('Kerja disimpan ✓', 'Job saved ✓'), a.name); });
  }
  /* the job limits text keeps the user's changes to the 10 jobs and the "_my" list */
  function store(list) {
    var M = A(), lim = M.limits(state.settings.advLimits);
    var acts = lim.acts.filter(function (x) { return !x.mine; }).concat(list.map(function (x) { return Object.assign({ mine: true }, x); }));
    var text = M.limitsText(acts, lim.overall, '');
    return MC.Data.saveSettings(Object.assign({}, state.settings, { advLimits: text, profileName: state.settings.locationName })).then(function () {
      if (MC.EXT.Jobs) MC.EXT.Jobs.res = null; MC.Adv.result = null; try { MC.renderAll(); } catch (e) { /* */ }
    });
  }
  $('myJobsBody').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-mj-edit]'), del = e.target.closest('[data-mj-del]');
    if (ed) { edit = Object.assign({}, mine().filter(function (x) { return x.id === ed.getAttribute('data-mj-edit'); })[0]); render(true); }
    if (del) {
      var id = del.getAttribute('data-mj-del'), a = mine().filter(function (x) { return x.id === id; })[0];
      if (a && confirm(T('Padam kerja "{n}"?', 'Delete the job "{n}"?').replace('{n}', a.name))) store(mine().filter(function (x) { return x.id !== id; })).then(render);
    }
  });
  MC.EXT.views = MC.EXT.views || {};
  var prev = MC.EXT.views.settings;
  MC.EXT.views.settings = function () { if (prev) prev(); render(); };
  render();
})();
