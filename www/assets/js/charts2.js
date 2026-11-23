/* Dashboard Cuaca Aziz 4 - small SVG charts (no library): time on x, one y axis, lines / bars / a shaded range,
   recessive grid, legend, and a hover / touch crosshair with a tooltip. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function fmt(v, d) { return v === null || v === undefined ? '-' : (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toString(); }

  /* opts: { series: [{ name, color, unit, digits, kind: 'line'|'bar'|'band', points: [[t, v]] | [[t, lo, hi]] }],
             height, yMin, yLabel, xFormat(t) -> label, tipTime(t) -> text, ticks: [t...], now } */
  function chart(host, opts) {
    host.innerHTML = '';
    var W = Math.max(280, host.clientWidth || 600), H = opts.height || 190, L = 36, R = 10, T = 18, B = 24;
    var all = [], ts = [];
    opts.series.forEach(function (s) { s.points.forEach(function (p) { ts.push(p[0]); for (var i = 1; i < p.length; i++) if (p[i] !== null && p[i] !== undefined) all.push(p[i]); }); });
    if (!ts.length) { host.innerHTML = '<div class="nodata">-</div>'; return; }
    var t0 = Math.min.apply(null, ts), t1 = Math.max.apply(null, ts);
    var bars = opts.series.filter(function (s) { return s.kind === 'bar'; });
    var step = bars.length && bars[0].points.length > 1 ? (bars[0].points[1][0] - bars[0].points[0][0]) : 0;
    if (step) { t0 -= step / 2; t1 += step / 2; }
    var lo = opts.yMin !== undefined ? opts.yMin : Math.min(0, Math.min.apply(null, all.length ? all : [0]));
    var hi = Math.max(opts.yMax || 0, Math.max.apply(null, all.length ? all : [1]));
    var stepY = niceMax((hi - lo) / 4 || 1);
    var yMin = Math.floor(lo / stepY) * stepY, yMax = Math.ceil(hi / stepY) * stepY;
    if (yMax <= yMin) yMax = yMin + stepY;
    var lines = Math.round((yMax - yMin) / stepY);
    var x = function (t) { return L + (t - t0) / Math.max(1, t1 - t0) * (W - L - R); };
    var y = function (v) { return T + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * (H - T - B); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opts.label || '' }, host);
    /* grid + y labels */
    for (var g = 0; g <= lines; g++) {
      var v = yMin + stepY * g, yy = y(v);
      el('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'grid' }, svg);
      var tx = el('text', { x: L - 6, y: yy + 3, class: 'axis', 'text-anchor': 'end' }, svg); tx.textContent = fmt(v, stepY < 1 ? (stepY < 0.1 ? 2 : 1) : 0);
    }
    if (opts.yLabel) { var yl = el('text', { x: L + 2, y: 2, class: 'axis unit', 'dominant-baseline': 'hanging' }, svg); yl.textContent = opts.yLabel; }
    /* x ticks */
    var tk = (opts.ticks || []).filter(function (t) { return t >= t0 && t <= t1; });
    var every = 1;
    if (tk.length > 1) { var gap = x(tk[1]) - x(tk[0]); every = Math.max(1, Math.ceil(52 / Math.max(1, gap))); }
    tk.forEach(function (t, i) {
      if (i % every) return;
      el('line', { x1: x(t), x2: x(t), y1: T, y2: H - B, class: 'grid v' }, svg);
      var lb = el('text', { x: x(t) + 3, y: H - 8, class: 'axis' }, svg); lb.textContent = opts.xFormat ? opts.xFormat(t) : '';
    });
    if (opts.now && opts.now > t0 && opts.now < t1) el('line', { x1: x(opts.now), x2: x(opts.now), y1: T, y2: H - B, class: 'nowline' }, svg);
    /* marks */
    opts.series.forEach(function (s, si) {
      if (s.kind === 'band') {
        var up = s.points.filter(function (p) { return p[1] !== null && p[2] !== null; });
        if (up.length < 2) return;
        var d = up.map(function (p, i) { return (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ',' + y(p[2]).toFixed(1); }).join('') +
          up.slice().reverse().map(function (p) { return 'L' + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1); }).join('') + 'Z';
        el('path', { d: d, fill: s.color, 'fill-opacity': 0.18, stroke: 'none' }, svg);
      } else if (s.kind === 'bar') {
        var bw = Math.max(2, (x(t0 + step) - x(t0)) / Math.max(1, bars.length) - 2), k = bars.indexOf(s);
        s.points.forEach(function (p) {
          if (p[1] === null || p[1] <= 0) return;
          var bx = x(p[0]) - (bw * bars.length) / 2 + k * (bw + 1), top = y(p[1]), base = y(Math.max(0, yMin));
          el('path', { d: 'M' + bx + ',' + base + 'V' + (top + 2) + 'q0,-2 2,-2h' + Math.max(0, bw - 4) + 'q2,0 2,2V' + base + 'Z', fill: s.color }, svg);
        });
      } else {
        var seg = '', pen = false;
        s.points.forEach(function (p) {
          if (p[1] === null || p[1] === undefined) { pen = false; return; }
          seg += (pen ? 'L' : 'M') + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1); pen = true;
        });
        el('path', { d: seg, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash || null }, svg);
      }
      void si;
    });
    /* legend */
    var lg = document.createElement('div'); lg.className = 'legend';
    opts.series.forEach(function (s) { if (s.legend === false) return; lg.insertAdjacentHTML('beforeend', '<span><i style="background:' + s.color + (s.kind === 'band' ? ';opacity:.35' : '') + '"></i>' + s.name + '</span>'); });
    if (opts.series.length > 1) host.appendChild(lg);
    /* hover / touch */
    var cross = el('line', { y1: T, y2: H - B, class: 'cross', visibility: 'hidden' }, svg);
    var tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; host.appendChild(tip);
    var times = []; opts.series.forEach(function (s) { s.points.forEach(function (p) { if (times.indexOf(p[0]) < 0) times.push(p[0]); }); });
    times.sort(function (a, b) { return a - b; });
    function at(px) {
      var t = t0 + (px - L) / (W - L - R) * (t1 - t0), best = times[0];
      times.forEach(function (tt) { if (Math.abs(tt - t) < Math.abs(best - t)) best = tt; });
      return best;
    }
    function show(ev) {
      var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
      if (px < L || px > W - R) { hide(); return; }
      var t = at(px);
      cross.setAttribute('x1', x(t)); cross.setAttribute('x2', x(t)); cross.setAttribute('visibility', 'visible');
      var rows = opts.series.map(function (s) {
        var p = s.points.filter(function (q) { return q[0] === t; })[0];
        if (!p) return '';
        var val = s.kind === 'band' ? fmt(p[1], s.digits) + '–' + fmt(p[2], s.digits) : fmt(p[1], s.digits);
        return '<div><i style="background:' + s.color + '"></i>' + s.name + ' <b>' + val + '</b> ' + (s.unit || '') + '</div>';
      }).join('');
      tip.innerHTML = '<div class="tt">' + (opts.tipTime ? opts.tipTime(t) : '') + '</div>' + rows;
      tip.hidden = false;
      var left = x(t) / W * r.width;
      tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, left + 10)) + 'px';
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; }
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
  }
  root.Charts = { chart: chart };
}(typeof self !== 'undefined' ? self : this));
