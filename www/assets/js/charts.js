/* Dashboard Cuaca Aziz - small SVG charts, no library.
   MCCharts.bars(el, { bars:[{t,v,future}], now, unit })                 hourly rain: past (muted) vs forecast (blue)
   MCCharts.line(el, { points:[{t,v}], thresholds:[{v,label,cls}], unit, decimals })   water level / temperature
   Both redraw on resize and show a tooltip on hover (crosshair for lines, per bar for bars). */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var C = root.MCCore;
  var L = root.MCI18n ? root.MCI18n.L : function (s) { return s; };

  function niceStep(range, ticks) {
    var raw = range / Math.max(1, ticks), p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function fmt(v, d) { return v === null || v === undefined || !isFinite(v) ? '-' : (+v).toFixed(d === undefined ? 1 : d); }
  function xTicks(t0, t1) {
    var span = t1 - t0, H = 3600000, step = span <= 30 * H ? 6 * H : span <= 80 * H ? 12 * H : span <= 8 * 24 * H ? 24 * H : span <= 16 * 24 * H ? 48 * H : 5 * 24 * H;
    var out = [], off = 8 * H; /* align to Malaysia midnight / 06:00 etc. */
    var first = Math.ceil((t0 + off) / step) * step - off;
    for (var t = first; t <= t1; t += step) out.push(t);
    return { ticks: out, daily: step >= 24 * H };
  }
  function tickLabel(t, daily) {
    var p = C.myt(t);
    if (daily || (p.h === 0 && p.mi === 0)) return C.fmtDate(t).replace(/^\S+ /, '');
    return C.fmtTime(t);
  }
  function tipEl(host) {
    var t = host.querySelector('.ctip');
    if (!t) { t = document.createElement('div'); t.className = 'ctip'; t.hidden = true; host.appendChild(t); }
    return t;
  }
  function observe(host, draw) {
    host.__draw = draw;
    if (host.__ro || !root.ResizeObserver) return;
    var w = host.clientWidth;
    host.__ro = new ResizeObserver(function () { if (Math.abs(host.clientWidth - w) > 4) { w = host.clientWidth; host.__draw && host.__draw(); } });
    host.__ro.observe(host);
  }
  function empty(host, msg) { host.innerHTML = '<div class="empty">' + msg + '</div>'; }

  function bars(host, o) {
    observe(host, function () { bars(host, o); });
    var data = (o.bars || []).filter(function (b) { return b.v !== null && b.v !== undefined; });
    if (!data.length) return empty(host, o.empty || L('Tiada data'));
    var W = Math.max(280, host.clientWidth || 600), Hh = o.height || 200, m = { l: 36, r: 8, t: 22, b: 22 };
    var iw = W - m.l - m.r, ih = Hh - m.t - m.b;
    var t0 = data[0].t, t1 = data[data.length - 1].t + 3600000;
    var max = 0; data.forEach(function (b) { if (b.v > max) max = b.v; });
    var step = niceStep(Math.max(max, 2), 4), ymax = Math.ceil(Math.max(max, 2) / step) * step;
    var x = function (t) { return m.l + (t - t0) / (t1 - t0) * iw; }, y = function (v) { return m.t + ih - v / ymax * ih; };
    host.innerHTML = '';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + Hh, height: Hh, role: 'img', 'aria-label': o.label || L('Carta hujan') }, host);
    for (var v = 0; v <= ymax + 1e-9; v += step) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), 'class': 'gl' }, svg);
      el('text', { x: m.l - 6, y: y(v) + 3.5, 'text-anchor': 'end', 'class': 'ax' }, svg).textContent = fmt(v, step < 1 ? 1 : 0);
    }
    el('text', { x: 2, y: 10, 'class': 'ax' }, svg).textContent = o.unit || 'mm';
    var xt = xTicks(t0, t1);
    xt.ticks.forEach(function (t) { el('text', { x: x(t), y: Hh - 6, 'text-anchor': 'middle', 'class': 'ax' }, svg).textContent = tickLabel(t, xt.daily); });
    var bw = Math.max(1, iw / ((t1 - t0) / 3600000) - 2);
    var tip = tipEl(host);
    data.forEach(function (b) {
      var bx = x(b.t) + 1, by = y(b.v), bh = m.t + ih - by;
      if (bh > 0.5) {
        var r = Math.min(3, bw / 2, bh);
        /* rounded top, square base */
        el('path', { d: 'M' + bx + ',' + (m.t + ih) + 'V' + (by + r) + 'Q' + bx + ',' + by + ' ' + (bx + r) + ',' + by + 'H' + (bx + bw - r) + 'Q' + (bx + bw) + ',' + by + ' ' + (bx + bw) + ',' + (by + r) + 'V' + (m.t + ih) + 'Z',
          'class': b.future ? 'bar-f' : 'bar-p' }, svg);
      }
      var hit = el('rect', { x: bx - 1, y: m.t, width: bw + 2, height: ih, 'class': 'hit' }, svg);
      hit.addEventListener('mouseenter', function () {
        tip.innerHTML = C.fmtDate(b.t) + ' ' + C.fmtTime(b.t) + ' · <b>' + fmt(b.v) + ' mm</b>' + (b.pp !== null && b.pp !== undefined ? ' · ' + Math.round(b.pp) + '%' : '') + (b.future ? L(' (ramalan)') : '');
        tip.style.left = (x(b.t) + bw / 2) / W * 100 + '%'; tip.style.top = (by / Hh * 100) + '%'; tip.hidden = false;
      });
      hit.addEventListener('mouseleave', function () { tip.hidden = true; });
    });
    if (o.now && o.now > t0 && o.now < t1) {
      el('line', { x1: x(o.now), x2: x(o.now), y1: m.t, y2: m.t + ih, 'class': 'now' }, svg);
      el('text', { x: x(o.now) + 4, y: 10, 'class': 'ax' }, svg).textContent = L('sekarang');
    }
    el('line', { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, stroke: 'var(--line-2)' }, svg);
  }

  function line(host, o) {
    observe(host, function () { line(host, o); });
    var pts = (o.points || []).filter(function (p) { return p.v !== null && p.v !== undefined && isFinite(p.v); });
    if (pts.length < 2) return empty(host, o.empty || L('Belum cukup data untuk graf. Sejarah dikumpul setiap kali app kemas kini.'));
    var d = o.decimals === undefined ? 2 : o.decimals;
    var W = Math.max(280, host.clientWidth || 600), Hh = o.height || 240, m = { l: 44, r: W < 520 ? 40 : 84, t: 22, b: 22 };
    var iw = W - m.l - m.r, ih = Hh - m.t - m.b;
    var t0 = o.from || pts[0].t, t1 = o.to || pts[pts.length - 1].t;
    if (t1 <= t0) t1 = t0 + 3600000;
    var lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
    var span = Math.max(hi - lo, 0.5, Math.abs(hi) * 0.25);
    var ths = (o.thresholds || []).filter(function (t) { return t.v !== null && t.v !== undefined && isFinite(t.v) && t.v <= hi + span * 2 && t.v >= lo - span * 2; });
    ths.forEach(function (t) { if (t.v > hi) hi = t.v; if (t.v < lo) lo = t.v; });
    var step = niceStep(hi - lo || 1, 5);
    var ymin = Math.floor((lo - step * 0.3) / step) * step, ymax = Math.ceil((hi + step * 0.3) / step) * step;
    var x = function (t) { return m.l + (t - t0) / (t1 - t0) * iw; }, y = function (v) { return m.t + ih - (v - ymin) / (ymax - ymin) * ih; };
    host.innerHTML = '';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + Hh, height: Hh, role: 'img', 'aria-label': o.label || L('Graf') }, host);
    for (var v = ymin; v <= ymax + 1e-9; v += step) {
      el('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), 'class': 'gl' }, svg);
      el('text', { x: m.l - 6, y: y(v) + 3.5, 'text-anchor': 'end', 'class': 'ax' }, svg).textContent = fmt(v, step < 1 ? 1 : 0);
    }
    el('text', { x: 2, y: 10, 'class': 'ax' }, svg).textContent = o.unit || '';
    var xt = xTicks(t0, t1);
    xt.ticks.forEach(function (t) { el('text', { x: x(t), y: Hh - 6, 'text-anchor': 'middle', 'class': 'ax' }, svg).textContent = tickLabel(t, xt.daily); });
    ths.forEach(function (t) {
      el('line', { x1: m.l, x2: m.l + iw, y1: y(t.v), y2: y(t.v), 'class': 'th ' + t.cls }, svg);
      el('text', { x: m.l + iw + 6, y: y(t.v) + 3.5, 'class': 'thl ' + t.cls }, svg).textContent = (W < 520 ? '' : t.label + ' ') + fmt(t.v, o.decimals === undefined ? 2 : Math.max(1, o.decimals));
    });
    /* break the line where readings are missing for > 3x the usual gap */
    var gaps = []; for (var i = 1; i < pts.length; i++) gaps.push(pts[i].t - pts[i - 1].t);
    var med = gaps.slice().sort(function (a, b) { return a - b; })[Math.floor(gaps.length / 2)] || 600000;
    var dpath = '', area = '', segStart = 0;
    pts.forEach(function (p, i) {
      var brk = i > 0 && p.t - pts[i - 1].t > med * 3 + 60000;
      dpath += (i === 0 || brk ? 'M' : 'L') + x(p.t).toFixed(1) + ',' + y(p.v).toFixed(1);
    });
    if (o.area) { area = 'M' + x(pts[0].t) + ',' + (m.t + ih) + pts.map(function (p) { return 'L' + x(p.t).toFixed(1) + ',' + y(p.v).toFixed(1); }).join('') + 'L' + x(pts[pts.length - 1].t) + ',' + (m.t + ih) + 'Z'; el('path', { d: area, 'class': 'area' }, svg); }
    el('path', { d: dpath, 'class': 'ln' }, svg);
    var last = pts[pts.length - 1];
    el('circle', { cx: x(last.t), cy: y(last.v), r: 4.5, 'class': 'pt' }, svg);
    el('text', { x: x(last.t) - 8, y: y(last.v) - 9, 'text-anchor': 'end', 'class': 'ax', style: 'font-weight:700;fill:var(--ink)' }, svg).textContent = fmt(last.v, d);
    /* hover crosshair */
    var cross = el('line', { y1: m.t, y2: m.t + ih, 'class': 'cross', visibility: 'hidden' }, svg);
    var dot = el('circle', { r: 5, 'class': 'pt', visibility: 'hidden' }, svg);
    var hit = el('rect', { x: m.l, y: m.t, width: iw, height: ih, 'class': 'hit' }, svg);
    var tip = tipEl(host);
    function move(ev) {
      var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
      var t = t0 + (px - m.l) / iw * (t1 - t0), best = pts[0];
      pts.forEach(function (p) { if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p; });
      var cx = x(best.t), cy = y(best.v);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
      tip.innerHTML = C.fmtDate(best.t) + ' ' + C.fmtTime(best.t) + ' · <b>' + fmt(best.v, d) + ' ' + (o.unit || '') + '</b>';
      tip.style.left = cx / W * 100 + '%'; tip.style.top = cy / Hh * 100 + '%'; tip.hidden = false;
    }
    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', function () { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
  }

  root.MCCharts = { bars: bars, line: line };
})(this);
