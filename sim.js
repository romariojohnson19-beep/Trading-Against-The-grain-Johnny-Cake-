/* Trade Sim: same look as the Johnny Crow video engine.
   A setup appears, you pick: trade with Dæv, trade with Johnny, skip, or place your own entry.
   Price plays out candle by candle, then you see who was right.
   Usage: WMSim.mount(el, { scenarios: 'all' | [ids], free: true|false })
   Practice charts with illustrative prices. Education only. */
(function () {
  var C = { bg: '#111614', grid: '#202623', line: '#2C322F', fg: '#ECEEE6', muted: '#969C96', lime: '#B9D77A', red: '#E5675F', gold: '#E8C547', you: '#7FB8E8', ink: '#181A18' };

  // Realistic price path: a noisy tick walk pinned to the scenario's waypoints (a Brownian bridge),
  // with volatility that clusters, occasional wick spikes, and candles cut from the ticks.
  // Each candle keeps its ticks, so the live candle replays the real path inside it.
  var K = 12, F = 2.4, TICK = 0.025;
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function q(p) { return Math.round(p / TICK) * TICK; }
  function gen(s) {
    var r = rng(s.seed), p = s.start, ticks = [], vol = 1, sig = s.sig || 0.3;
    s.segs.forEach(function (sg) {
      var T = Math.max(K, Math.round(sg[0] * F) * K), tgt = sg[1], w = [0], i;
      for (i = 1; i <= T; i++) {
        vol = Math.min(2.4, Math.max(0.45, vol * Math.exp(gauss(r) * 0.12) + (1 - vol) * 0.04));
        w.push(w[i - 1] + gauss(r) * sig * vol);
      }
      for (i = 1; i <= T; i++) ticks.push(p + (tgt - p) * i / T + (w[i] - w[T] * i / T));
      p = tgt;
    });
    // occasional stop-run spikes: a quick poke out and back inside one candle
    for (var j = K; j < ticks.length - 2; j++) if (r() < 0.012) { var d = (r() < 0.5 ? -1 : 1) * (0.6 + r() * 1.2); ticks[j] += d; ticks[j + 1] += d * 0.35; }
    var c = [], prev = ticks[0];
    for (var k = 0; k + K <= ticks.length; k += K) {
      var tk = [prev].concat(ticks.slice(k, k + K)).map(q), hi = Math.max.apply(null, tk), lo = Math.min.apply(null, tk);
      c.push([tk[0], hi, lo, tk[tk.length - 1], tk, Math.round((hi - lo) * (40 + r() * 60) + 15)]);
      prev = tk[tk.length - 1];
    }
    s.c = c; s.n0 = Math.round(s.n0r * F);
    var z = s.zone; s.zoneFrom = Math.round((s.zf || 6) * F);
  }

  // Scenarios. side: 1 = long setup (a level below price), -1 = short. n0 = candles shown at decision time.
  var S = [
    { id: 'pullback-fakeout', mkt: 'Futures index · 5m', side: 1, seed: 3, start: 100, segs: [[6, 90], [8, 116], [7, 104], [4, 99], [3, 103], [7, 128]], n0: 17, zone: [99.5, 104] },
    { id: 'clean-bounce', mkt: 'Gold · 15m', side: 1, seed: 2, start: 100, segs: [[6, 92], [8, 118], [8, 107], [1, 105.5], [8, 126]], n0: 18, zone: [103, 107.5] },
    { id: 'level-breaks', mkt: 'EUR/USD · 15m', side: -1, seed: 6, start: 120, segs: [[6, 128], [8, 104], [7, 116], [2, 117.5], [6, 130], [3, 134]], n0: 17, zone: [115, 119] },
    { id: 'short-rejection', mkt: 'Futures index · 5m', side: -1, seed: 3, start: 120, segs: [[6, 129], [8, 103], [7, 114], [2, 117], [3, 112], [6, 96]], n0: 17, zone: [114, 118.5] },
    { id: 'confirm-then-fail', mkt: 'GBP/USD · 15m', side: 1, seed: 1, start: 100, segs: [[6, 92], [8, 116], [7, 104], [2, 101.5], [3, 107], [5, 92]], n0: 17, zone: [100.5, 104.5] },
    { id: 'deep-sweep', mkt: 'Gold · 5m', side: 1, seed: 2, start: 100, segs: [[6, 91], [8, 117], [6, 104], [2, 97.5], [3, 106], [6, 124]], n0: 17, zone: [100, 104.5] },
    { id: 'never-comes-back', mkt: 'Crude oil · 5m', side: 1, seed: 1, start: 100, segs: [[6, 91], [8, 117], [5, 111], [8, 128]], n0: 16, zone: [100, 104] },
    { id: 'slow-grind', mkt: 'Futures index · 15m', side: -1, seed: 3, start: 118, segs: [[6, 126], [8, 104], [7, 114.5], [6, 112], [6, 99]], n0: 17, zone: [113, 117.5] }
  ];
  // more setups, built from shape templates; short ones are mirror images of the long shapes
  var TPL = {
    fake: { start: 100, segs: [[6, 90], [8, 116], [7, 104], [4, 99], [3, 103], [7, 128]], n0: 17, zone: [99.5, 104] },
    bounce: { start: 100, segs: [[6, 92], [8, 118], [8, 107], [1, 105.5], [8, 126]], n0: 18, zone: [103, 107.5] },
    breaks: { start: 100, segs: [[6, 92], [8, 116], [7, 104], [2, 102.5], [6, 90], [3, 86]], n0: 17, zone: [101, 105] },
    fail: { start: 100, segs: [[6, 92], [8, 116], [7, 104], [2, 101.5], [3, 107], [5, 92]], n0: 17, zone: [100.5, 104.5] },
    never: { start: 100, segs: [[6, 91], [8, 117], [5, 111], [8, 128]], n0: 16, zone: [100, 104] },
    sweep: { start: 100, segs: [[6, 91], [8, 117], [6, 104], [2, 97.5], [3, 106], [6, 124]], n0: 17, zone: [100, 104.5] },
    tap: { start: 100, segs: [[6, 92], [8, 118], [8, 107.6], [1, 107.2], [8, 126]], n0: 18, zone: [103, 107.5] },
    grind: { start: 100, segs: [[6, 92], [8, 116], [7, 105.5], [6, 108], [6, 121]], n0: 17, zone: [102.5, 107] }
  };
  function mk(id, mkt, t, short, seed) {
    var T = TPL[t], m = function (p) { return short ? 220 - p : p; };
    return { id: id, mkt: mkt, side: short ? -1 : 1, seed: seed, start: m(T.start), segs: T.segs.map(function (g) { return [g[0], m(g[1])]; }), n0: T.n0, zone: short ? [m(T.zone[1]), m(T.zone[0])] : T.zone.slice() };
  }
  S.push(
    mk('index-fakeout-short', 'Futures index · 15m', 'fake', true, 1415),
    mk('gold-tap-and-go', 'Gold · 5m', 'tap', false, 1574),
    mk('oil-clean-bounce', 'Crude oil · 15m', 'bounce', false, 1729),
    mk('jpy-level-breaks', 'USD/JPY · 15m', 'breaks', true, 1885),
    mk('eur-deep-sweep', 'EUR/USD · 5m', 'sweep', false, 2041),
    mk('index-confirm-fail', 'Futures index · 5m', 'fail', true, 2198),
    mk('gbp-never-back', 'GBP/USD · 5m', 'never', true, 2355),
    mk('gold-grind', 'Gold · 15m', 'grind', false, 2513),
    mk('oil-fakeout', 'Crude oil · 5m', 'fake', false, 2676),
    mk('index-tap-short', 'Futures index · 5m', 'tap', true, 2830),
    mk('eur-level-breaks', 'EUR/USD · 15m', 'breaks', false, 2984),
    mk('jpy-bounce', 'USD/JPY · 5m', 'bounce', false, 3140),
    mk('gold-confirm-fail', 'Gold · 5m', 'fail', false, 3297),
    mk('index-sweep-short', 'Futures index · 15m', 'sweep', true, 3457),
    mk('gbp-bounce-short', 'GBP/USD · 15m', 'bounce', true, 3612),
    mk('oil-never-short', 'Crude oil · 15m', 'never', true, 3768)
  );
  S.forEach(function (s) { s.n0r = s.n0; gen(s); });

  // ── trade plans ──
  function plans(s) {
    var z = s.zone, w = z[1] - z[0], L = s.side === 1;
    var dav = L ? { entry: z[1] - w * 0.3, stop: z[0] - w * 0.12 } : { entry: z[0] + w * 0.3, stop: z[1] + w * 0.12 };
    dav.target = L ? dav.entry + 3 * (dav.entry - dav.stop) : dav.entry - 3 * (dav.stop - dav.entry);
    dav.type = 'limit';
    return { dav: dav, johnny: { type: 'confirm' } };
  }

  // walk a plan through the candles after n0; returns {filled, i, entry, stop, target, result R, exit index}
  function run(s, p) {
    var L = s.side === 1, c = s.c, z = s.zone, entry = p.entry, stop = p.stop, target = p.target, fillAt = -1, touched = false, low = Infinity, high = -Infinity;
    for (var i = s.n0; i < c.length; i++) {
      var k = c[i];
      if (fillAt < 0) {
        if (p.type === 'confirm') {
          // waits for price to reach the level, then a candle that closes back out of it in the trade's direction
          if (L ? k[2] <= z[1] : k[1] >= z[0]) touched = true;
          if (touched) { low = Math.min(low, k[2]); high = Math.max(high, k[1]); }
          if (touched && (L ? k[3] > z[1] && k[3] > k[0] : k[3] < z[0] && k[3] < k[0])) {
            entry = k[3]; stop = L ? Math.min(low, z[0]) - (z[1] - z[0]) * 0.1 : Math.max(high, z[1]) + (z[1] - z[0]) * 0.1;
            target = L ? entry + 2 * (entry - stop) : entry - 2 * (stop - entry);
            fillAt = i; continue;
          }
          if (L ? k[3] < z[0] - (z[1] - z[0]) * 0.6 : k[3] > z[1] + (z[1] - z[0]) * 0.6) return { filled: false, why: 'broke' };
          continue;
        }
        var hit = p.type === 'stop' ? (L ? k[1] >= entry : k[2] <= entry) : (L ? k[2] <= entry : k[1] >= entry);
        if (!hit) continue;
        fillAt = i;
        // same candle: if the stop is also inside this candle, count it as stopped (worst case)
        if (L ? k[2] <= stop : k[1] >= stop) return done(i, -1);
        continue;
      }
      var sl = L ? k[2] <= stop : k[1] >= stop, tp = L ? k[1] >= target : k[2] <= target;
      if (sl) return done(i, -1);
      if (tp) return done(i, Math.abs(target - entry) / Math.abs(entry - stop));
    }
    if (fillAt < 0) return { filled: false, why: 'never' };
    var last = c[c.length - 1][3];
    return done(c.length - 1, (L ? last - entry : entry - last) / Math.abs(entry - stop), true);
    function done(ex, r, open) { return { filled: true, fillAt: fillAt, exitAt: ex, entry: entry, stop: stop, target: target, r: Math.round(r * 10) / 10, open: !!open }; }
  }

  function outcome(s) {
    var p = plans(s);
    return { dav: run(s, p.dav), johnny: run(s, p.johnny) };
  }

  // ── drawing (engine style) ──
  function makeChart(cv, s) {
    // centre on what's visible at decision time and pad evenly, so the empty space never hints at the outcome
    var vlo = Infinity, vhi = -Infinity, half = 0;
    s.c.slice(0, s.n0).forEach(function (k) { vlo = Math.min(vlo, k[2]); vhi = Math.max(vhi, k[1]); });
    vlo = Math.min(vlo, s.zone[0]); vhi = Math.max(vhi, s.zone[1]);
    var mid = (vlo + vhi) / 2;
    s.c.forEach(function (k) { half = Math.max(half, Math.abs(k[1] - mid), Math.abs(k[2] - mid)); });
    half *= 1.1;
    return { lo: mid - half, hi: mid + half, n: s.c.length };
  }

  // how each market's prices look: base + p × mult, shown with its usual decimals
  var DSP = { idx: [24000, 10, 2], gold: [2600, 1.2, 2], oil: [70, 0.08, 2], eur: [1.06, 0.0006, 5], gbp: [1.24, 0.0007, 5], jpy: [146, 0.06, 3] }, CUR = DSP.idx;
  function dspOf(s) { var m = s.mkt; return /Gold/.test(m) ? DSP.gold : /oil/i.test(m) ? DSP.oil : /EUR/.test(m) ? DSP.eur : /GBP/.test(m) ? DSP.gbp : /JPY/.test(m) ? DSP.jpy : DSP.idx; }
  function niceStep(range, n) { var raw = range / n, m = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / m; return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * m; }
  function draw(st) {
    var cv = st.cv, s = st.s, d = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
    var W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    CUR = dspOf(s);
    var ax = 66, tAx = 20, x0 = 4, x1 = W - ax, y0 = 12, y1 = H - tAx - 6, step = (x1 - x0) / (st.ch.n + 3);
    var X = function (i) { return x0 + step * (i + 0.5); }, Y = function (p) { return y1 - (p - st.ch.lo) / (st.ch.hi - st.ch.lo) * (y1 - y0); };
    st.Y = Y; st.Yinv = function (y) { return st.ch.lo + (y1 - y) / (y1 - y0) * (st.ch.hi - st.ch.lo); };
    var px = function (v) { return Math.round(v) + 0.5; };
    d.fillStyle = C.bg; d.fillRect(0, 0, W, H);
    // watermark, like a charting app
    d.fillStyle = 'rgba(236,238,230,.028)'; d.font = '700 ' + Math.round(Math.min(44, W / 11)) + 'px Inter, sans-serif'; d.textAlign = 'center';
    d.fillText(s.mkt.split(' · ')[0].toUpperCase(), (x0 + x1) / 2, y0 + (y1 - y0) * 0.22);
    // price grid at round numbers (display units)
    var dlo = CUR[0] + st.ch.lo * CUR[1], dhi = CUR[0] + st.ch.hi * CUR[1], ps = niceStep(dhi - dlo, Math.max(4, Math.round((y1 - y0) / 52)));
    d.lineWidth = 1; d.font = '500 10px JetBrains Mono, monospace'; d.textAlign = 'left';
    for (var v = Math.ceil(dlo / ps) * ps; v < dhi; v += ps) {
      var gy = px(Y((v - CUR[0]) / CUR[1])); d.strokeStyle = C.grid; d.beginPath(); d.moveTo(0, gy); d.lineTo(x1, gy); d.stroke();
      d.fillStyle = C.muted; d.fillText(v.toLocaleString('en-US', { minimumFractionDigits: CUR[2], maximumFractionDigits: CUR[2] }), x1 + 6, gy + 3.5);
    }
    // time axis
    var tf = /15m/.test(s.mkt) ? 15 : 5, every = Math.max(1, Math.round((60 / tf) * Math.max(1, Math.round(st.ch.n * tf / 60 / 5))));
    d.strokeStyle = C.line; d.beginPath(); d.moveTo(0, px(y1 + 6)); d.lineTo(W, px(y1 + 6)); d.stroke();
    d.beginPath(); d.moveTo(px(x1), 0); d.lineTo(px(x1), y1 + 6); d.stroke();
    d.textAlign = 'center'; d.fillStyle = C.muted;
    for (var ti = 0; ti < st.ch.n; ti++) {
      var mins = 8 * 60 + ti * tf; if (mins % (every * tf) !== 0) continue;
      var tx = px(X(ti)); if (tx < 22) continue; d.strokeStyle = 'rgba(255,255,255,.035)'; d.beginPath(); d.moveTo(tx, y0); d.lineTo(tx, y1 + 6); d.stroke();
      var hh = Math.floor(mins / 60) % 24, mm = mins % 60; d.fillText((hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm, tx, H - 7);
    }
    // level band
    var z = s.zone, zc = s.side === 1 ? C.lime : C.red, zx = X(st.zoneFrom || 6) - step / 2;
    d.fillStyle = hexA(zc, 0.11); d.fillRect(zx, Y(z[1]), x1 - zx, Y(z[0]) - Y(z[1]));
    d.strokeStyle = hexA(zc, 0.35); d.beginPath(); d.moveTo(zx, px(Y(z[1]))); d.lineTo(x1, px(Y(z[1]))); d.moveTo(zx, px(Y(z[0]))); d.lineTo(x1, px(Y(z[0]))); d.stroke();
    d.fillStyle = hexA(zc, 0.85); d.font = '600 9.5px JetBrains Mono, monospace'; d.textAlign = 'right'; d.fillText('THE LEVEL', x1 - 6, s.side === 1 ? Y(z[0]) + 12 : Y(z[1]) - 5);
    // volume pane (faint, bottom 14%)
    var n = st.n, full = Math.floor(n), fr = n - full, last = Math.min(s.c.length, full + (fr > 0 ? 1 : 0)), vmax = 1;
    s.c.forEach(function (k) { vmax = Math.max(vmax, k[5]); });
    var vh = (y1 - y0) * 0.14, bw = Math.max(1, Math.floor(step * 0.72)), cand = [];
    for (var i = 0; i < last; i++) {
      var k = s.c[i], o = k[0], h = k[1], l = k[2], cl = k[3], vol = k[5];
      if (i === full) { var t = tick(k, fr); cl = t[0]; h = t[1]; l = t[2]; vol = Math.round(vol * Math.max(0.08, fr)); }
      cand.push([o, h, l, cl, vol]);
      var up = cl >= o; d.fillStyle = hexA(up ? C.lime : C.red, 0.2);
      var vx = Math.round(X(i) - bw / 2), vy = y1 - vol / vmax * vh; d.fillRect(vx, vy, bw, y1 - vy);
    }
    // plan lines (under the candles)
    st.lines.forEach(function (ln) { hline(d, Y(ln.p), X(ln.from || st.s.n0) - step / 2, x1, ln.col, ln.label, ln.dash, ln.left); });
    // candles: 1px wicks, crisp bodies
    cand.forEach(function (c, i) {
      var o = c[0], h = c[1], l = c[2], cl = c[3], up = cl >= o, col = up ? C.lime : C.red, x = Math.round(X(i));
      d.fillStyle = col; d.fillRect(x, Math.round(Y(h)), 1, Math.max(1, Math.round(Y(l)) - Math.round(Y(h))));
      var yt = Math.round(Math.min(Y(o), Y(cl))), yb = Math.round(Math.max(Y(o), Y(cl)));
      d.fillRect(x - Math.floor(bw / 2) + (bw % 2 ? 0 : 1), yt, bw, Math.max(1, yb - yt));
      if (i === cand.length - 1) { st.last = cl; st.lastUp = up; }
    });
    // markers
    st.marks.forEach(function (m) { if (st.n >= m.i + 1) dot(d, X(m.i), Y(m.p), m.col, m.label, m.below, W); });
    // live price line + tag on the axis
    if (st.last != null) {
      var ly = px(Y(st.last)), tc = st.lastUp ? C.lime : C.red;
      d.strokeStyle = hexA(tc, 0.55); d.setLineDash([1, 3]); d.beginPath(); d.moveTo(x0, ly); d.lineTo(x1, ly); d.stroke(); d.setLineDash([]);
      d.fillStyle = tc; d.fillRect(x1 + 1, ly - 9.5, ax - 2, 19); d.fillStyle = st.lastUp ? C.ink : '#fff'; d.font = '600 10px JetBrains Mono, monospace'; d.textAlign = 'left'; d.fillText(price(st.last), x1 + 6, ly + 3.5);
    }
    // where you made your call
    if (st.n > s.n0 + 0.01) { var dx = px(X(s.n0) - step / 2); d.strokeStyle = hexA(C.fg, 0.16); d.setLineDash([2, 4]); d.beginPath(); d.moveTo(dx, y0); d.lineTo(dx, y1); d.stroke(); d.setLineDash([]); }
    st.X = X; st.step = step; st.x1 = x1;
  }
  function price(p) { var v = CUR[0] + p * CUR[1]; if (CUR === DSP.idx) v = Math.round(v * 4) / 4; return v.toLocaleString('en-US', { minimumFractionDigits: CUR[2], maximumFractionDigits: CUR[2] }); }
  function hexA(h, a) { var n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function rrect(d, x, y, w, h, r, fill, stroke) { d.beginPath(); d.moveTo(x + r, y); d.arcTo(x + w, y, x + w, y + h, r); d.arcTo(x + w, y + h, x, y + h, r); d.arcTo(x, y + h, x, y, r); d.arcTo(x, y, x + w, y, r); d.closePath(); if (fill) { d.fillStyle = fill; d.fill(); } if (stroke) { d.strokeStyle = stroke; d.lineWidth = 1.5; d.stroke(); } }
  function hline(d, y, xa, xb, col, label, dash, left) {
    d.strokeStyle = col; d.lineWidth = 1.6; if (dash) d.setLineDash([7, 6]); d.beginPath(); d.moveTo(xa, y); d.lineTo(xb, y); d.stroke(); d.setLineDash([]);
    if (!label) return;
    d.font = '600 10px JetBrains Mono, monospace'; var tw = d.measureText(label).width, lx = left ? xa + 4 : xb - tw - 18;
    rrect(d, lx, y - 9, tw + 12, 18, 5, '#0C100E', col); d.fillStyle = col; d.textAlign = 'left'; d.fillText(label, lx + 6, y + 3.5);
  }
  function dot(d, x, y, col, label, below, W) {
    d.beginPath(); d.arc(x, y, 5.5, 0, Math.PI * 2); d.fillStyle = col; d.fill(); d.lineWidth = 2; d.strokeStyle = '#0C100E'; d.stroke();
    if (!label) return;
    d.font = '700 10.5px Inter, sans-serif'; var tw = d.measureText(label).width + 16, bx = Math.max(4, Math.min(x - tw / 2, W - 70 - tw)), by = below ? y + 12 : y - 30;
    rrect(d, bx, by, tw, 19, 9.5, col); d.fillStyle = col === C.red ? '#fff' : C.ink; d.textAlign = 'center'; d.fillText(label, bx + tw / 2, by + 13);
  }
  // live forming candle: replays the real ticks inside it
  function tick(k, f) {
    var tk = k[4], pos = f * (tk.length - 1), j = Math.floor(pos), u = pos - j;
    var now = j + 1 < tk.length ? tk[j] + (tk[j + 1] - tk[j]) * u : tk[tk.length - 1], hi = now, lo = now;
    for (var i = 0; i <= j; i++) { hi = Math.max(hi, tk[i]); lo = Math.min(lo, tk[i]); }
    return [now, hi, lo];
  }

  // ── score (per browser) ──
  var KEY = 'wm_sim_score';
  function score() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(sc) { try { localStorage.setItem(KEY, JSON.stringify(sc)); } catch (e) {} }

  // ── UI ──
  var CSS = '.sim{background:#111614;border:1px solid rgba(255,255,255,.09);border-radius:20px;overflow:hidden;color:#ECEEE6;font-family:Inter,system-ui,sans-serif}' +
    '.sim-top{display:flex;justify-content:space-between;align-items:center;gap:.6rem;padding:.8rem 1rem;border-bottom:1px solid rgba(255,255,255,.07)}' +
    '.sim-top b{font:600 .7rem JetBrains Mono,monospace;letter-spacing:.12em;text-transform:uppercase;color:#B9D77A}' +
    '.sim-top span{font:500 .68rem JetBrains Mono,monospace;letter-spacing:.04em;color:#969C96;white-space:nowrap}' +
    '.sim canvas{display:block;width:100%;height:330px;touch-action:manipulation}' +
    '.sim.picking canvas{cursor:crosshair}' +
    '.sim-q{padding:1rem 1rem .4rem;font-weight:600;font-size:1rem}.sim-q small{display:block;color:#969C96;font-weight:400;font-size:.84rem;margin-top:.2rem}' +
    '.sim-opts{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;padding:.6rem 1rem 1rem}' +
    '.sim-opt{display:flex;align-items:center;gap:.6rem;text-align:left;padding:.55rem .7rem;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:#161C19;color:#ECEEE6;cursor:pointer;font:inherit;min-height:58px}' +
    '.sim-opt:hover{border-color:rgba(255,255,255,.28)}.sim-opt[disabled]{opacity:.45;cursor:default}' +
    '.sim-opt img{width:40px;height:40px;border-radius:50%;object-fit:cover;object-position:50% 8%;background:#0C100E;flex:none}' +
    '.sim-opt i{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none;font-style:normal;font-size:1.1rem;background:#0C100E;border:1px solid rgba(255,255,255,.14)}' +
    '.sim-opt b{display:block;font-size:.9rem}.sim-opt span{display:block;font-size:.74rem;color:#969C96;line-height:1.3}' +
    '.sim-opt.dav{border-color:rgba(229,103,95,.45)}.sim-opt.jc{border-color:rgba(185,215,122,.45)}' +
    '.sim-bar{display:flex;gap:.5rem;align-items:center;justify-content:space-between;padding:.2rem 1rem 1rem;flex-wrap:wrap}' +
    '.sim-btn{min-height:42px;padding:0 1rem;border-radius:11px;border:0;background:#B9D77A;color:#101A08;font:600 .9rem Inter,sans-serif;cursor:pointer}.sim-btn.g{background:transparent;color:#ECEEE6;border:1px solid rgba(255,255,255,.18)}' +
    '.sim-res{padding:0 1rem 1rem;display:grid;gap:.45rem}' +
    '.sim-row{display:grid;grid-template-columns:40px 1fr auto;gap:.65rem;align-items:center;padding:.55rem .7rem;border-radius:12px;background:#161C19;border:1px solid rgba(255,255,255,.07)}' +
    '.sim-row img,.sim-row i{width:40px;height:40px;border-radius:50%;object-fit:cover;object-position:50% 8%;display:grid;place-items:center;font-style:normal;background:#0C100E}' +
    '.sim-row b{font-size:.88rem}.sim-row span{display:block;font-size:.76rem;color:#969C96}.sim-row em{font:700 .9rem JetBrains Mono,monospace;font-style:normal;white-space:nowrap}' +
    '.sim-row.win em{color:#B9D77A}.sim-row.loss em{color:#E5675F}.sim-row.flat em{color:#969C96}.sim-row.me{border-color:rgba(127,184,232,.5)}' +
    '.sim-verdict{padding:.9rem 1rem;margin:0 1rem 1rem;border-radius:14px;background:rgba(185,215,122,.08);border:1px solid rgba(185,215,122,.3);font-size:.92rem;line-height:1.5}' +
    '.sim-verdict b{display:block;font-family:Bricolage Grotesque,Inter,sans-serif;font-size:1.15rem;margin-bottom:.2rem}' +
    '.sim-score{font:500 .7rem JetBrains Mono,monospace;color:#969C96;letter-spacing:.06em}' +
    '.sim-fine{padding:0 1rem .9rem;font-size:.72rem;color:#969C96}' +
    '.sim-lock{padding:1.2rem 1rem;text-align:center;color:#C9CFC7;font-size:.92rem}' +
    '@media(min-width:700px){.sim canvas{height:400px}.sim-opts{grid-template-columns:repeat(4,1fr)}}';
  function css() { if (document.getElementById('sim-css')) return; var s = document.createElement('style'); s.id = 'sim-css'; s.textContent = CSS; document.head.appendChild(s); }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

  var LINES = {
    dav: { win: ['Hot entry, hot cake. Told you.', 'Cheap entry, big slice.'], loss: ['The market cheated. Again.', "That stop was a suggestion."], none: ["Price never came to me. Rude."] },
    johnny: { win: ['Waited. Got paid.', 'Price proved it. Then I went.'], loss: ['Confirmed and still wrong. It happens. Small loss.'], none: ['Never got my signal. No trade is a position.'] }
  };
  function pick(a, seed) { return a[seed % a.length]; }

  function mount(root, opts) {
    css(); opts = opts || {};
    var list = S.filter(function (s) { return !opts.only || opts.only.indexOf(s.id) >= 0; });
    var idx = 0, sc = score(), keep = !opts.only;
    function saved() { try { var v = parseInt(localStorage.getItem('wm_sim_idx') || '0', 10); return v >= 0 && v < list.length ? v : 0; } catch (e) { return 0; } }
    root.innerHTML = '';
    var box = el('div', 'sim'), top = el('div', 'sim-top'), cv = el('canvas'), body = el('div');
    var tl = el('b', '', 'Trade Sim'), mk = el('span'); top.appendChild(tl); top.appendChild(mk);
    box.appendChild(top); box.appendChild(cv); box.appendChild(body); root.appendChild(box);
    var fine = el('div', 'sim-fine', 'Practice charts with illustrative prices, not real quotes. Educational only. Not financial advice.');
    var st;

    function load(i) {
      var s = list[i]; idx = i;
      if (keep) try { localStorage.setItem('wm_sim_idx', String(i)); } catch (e) {}
      st = { cv: cv, s: s, ch: makeChart(cv, s), n: s.n0, lines: [], marks: [], zoneFrom: s.zoneFrom };
      mk.textContent = (i + 1) + '/' + list.length + ' · ' + s.mkt;
      box.classList.remove('picking');
      draw(st); ask();
    }

    function ask() {
      body.innerHTML = '';
      var q = el('div', 'sim-q', 'Price is coming back to the level. What do you do?');
      q.appendChild(el('small', '', st.s.side === 1 ? 'The level is below price. Buyers held it last time.' : 'The level is above price. Sellers held it last time.'));
      body.appendChild(q);
      var g = el('div', 'sim-opts');
      g.appendChild(opt('dav', 'Trade with Dæv', 'The hot entry, right at the level', 'media/dv-point.webp', function () { choose('dav'); }));
      g.appendChild(opt('jc', 'Trade with Johnny', 'Wait for proof, then go', 'media/jc-point.webp', function () { choose('johnny'); }));
      g.appendChild(opt('', 'Skip it', 'No trade is a position', null, function () { choose('skip'); }, '⏸'));
      g.appendChild(opt('', 'My own entry', 'Tap the chart to set it', null, function () { own(); }, '✎'));
      body.appendChild(g);
      var bar = el('div', 'sim-bar'); var t = sc.n ? sc.n + ' played · ' + (sc.right || 0) + ' good calls · ' + (sc.r >= 0 ? '+' : '') + (Math.round((sc.r || 0) * 10) / 10) + 'R' : 'Your score shows here';
      bar.appendChild(el('span', 'sim-score', t)); body.appendChild(bar); body.appendChild(fine);
    }
    function opt(cls, title, sub, img, fn, icon) {
      var b = el('button', 'sim-opt ' + cls); b.type = 'button';
      if (img) { var im = el('img'); im.src = img; im.alt = ''; b.appendChild(im); } else b.appendChild(el('i', '', icon));
      var t = el('div'); t.appendChild(el('b', '', title)); t.appendChild(el('span', '', sub)); b.appendChild(t);
      b.onclick = fn; return b;
    }

    // own entry: tap once for entry, once for stop; target = 2R
    function own() {
      body.innerHTML = '';
      var q = el('div', 'sim-q', 'Tap the chart where you want in.'); var sm = el('small', '', 'Then tap again for your stop. Your target is set at twice your risk.'); q.appendChild(sm); body.appendChild(q);
      var bar = el('div', 'sim-bar'), back = el('button', 'sim-btn g', 'Back'); back.type = 'button'; back.onclick = function () { st.lines = []; draw(st); box.classList.remove('picking'); cv.onclick = null; ask(); };
      var go = el('button', 'sim-btn', 'Play it out'); go.type = 'button'; go.disabled = true; go.style.opacity = .5;
      bar.appendChild(back); bar.appendChild(go); body.appendChild(bar);
      box.classList.add('picking');
      var mine = {};
      cv.onclick = function (e) {
        var r = cv.getBoundingClientRect(), p = st.Yinv(e.clientY - r.top);
        if (mine.entry == null || mine.stop != null) { mine = { entry: p }; sm.textContent = 'Now tap where your stop goes.'; }
        else {
          var L = st.s.side === 1;
          var dir = p < mine.entry ? 1 : -1; // stop below entry = long
          mine.stop = p; mine.side = dir;
          mine.target = dir === 1 ? mine.entry + 2 * (mine.entry - p) : mine.entry - 2 * (p - mine.entry);
          sm.textContent = (dir === 1 ? 'Long' : 'Short') + ' · risk ' + (Math.abs(mine.entry - p) * CUR[1]).toFixed(CUR[2] > 2 ? 4 : 2) + ' · target 2R. Tap again to start over.';
          go.disabled = false; go.style.opacity = 1;
        }
        st.lines = [];
        if (mine.entry != null) st.lines.push({ p: mine.entry, col: C.you, label: 'YOU · ENTRY' });
        if (mine.stop != null) { st.lines.push({ p: mine.stop, col: C.red, label: 'YOUR STOP', dash: true }); st.lines.push({ p: mine.target, col: C.lime, label: 'YOUR TARGET', dash: true }); }
        draw(st);
      };
      go.onclick = function () {
        cv.onclick = null; box.classList.remove('picking');
        var last = st.s.c[st.s.n0 - 1][3], L = mine.side === 1;
        var p = { entry: mine.entry, stop: mine.stop, target: mine.target, type: (L ? mine.entry > last : mine.entry < last) ? 'stop' : 'limit' };
        var sim = { side: mine.side, c: st.s.c, n0: st.s.n0, zone: st.s.zone };
        choose('own', run(sim, p));
      };
    }

    function choose(who, mineRes) {
      var out = outcome(st.s), pl = plans(st.s);
      var mineLines = st.lines.slice();
      st.lines = mineLines;
      if (who === 'dav') st.lines = [{ p: pl.dav.entry, col: C.red, label: 'DÆV · ENTRY' }, { p: pl.dav.stop, col: C.red, label: 'STOP', dash: true }, { p: pl.dav.target, col: C.lime, label: 'TARGET', dash: true }];
      if (who === 'johnny') st.lines = [];
      body.innerHTML = '';
      var q = el('div', 'sim-q', who === 'johnny' ? 'Johnny is waiting for proof…' : who === 'skip' ? 'Sitting this one out…' : who === 'dav' ? 'Dæv is in the zone, waiting to get filled…' : 'Your order is set…');
      var fb = el('div', 'sim-bar'), ff = el('button', 'sim-btn g', 'Speed up ⏩'); ff.type = 'button'; ff.onclick = function () { st.fast = !st.fast; ff.textContent = st.fast ? 'Normal speed' : 'Speed up ⏩'; };
      fb.appendChild(el('span', 'sim-score', 'Watching it play out…')); fb.appendChild(ff);
      body.appendChild(q); body.appendChild(fb); body.appendChild(fine);
      play(function () { reveal(who, out, pl, mineRes); });
    }

    function play(done) {
      var end = st.s.c.length, last = null;
      st.fast = false;
      function f(ts) {
        if (last == null) last = ts;
        st.n = Math.min(end, st.n + (ts - last) / (st.fast ? 55 : 230)); last = ts; draw(st);
        if (st.n < end) requestAnimationFrame(f); else done();
      }
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { st.n = end; draw(st); done(); return; }
      requestAnimationFrame(f);
    }

    function label(r) { if (!r.filled) return r.why === 'broke' ? 'No trade' : 'No fill'; return (r.r > 0 ? '+' : '') + r.r + 'R' + (r.open ? ' (still open)' : ''); }
    function cls(r) { return !r.filled ? 'flat' : r.r > 0 ? 'win' : 'loss'; }

    function reveal(who, out, pl, mineRes) {
      // draw everyone's trades on the chart
      st.lines = []; st.marks = [];
      [['dav', C.red, 'Dæv', true], ['johnny', C.lime, 'Johnny', false]].forEach(function (a) {
        var r = out[a[0]]; if (!r.filled) return;
        var low = st.s.side === 1 ? a[3] : !a[3]; // Dæv's tags sit on one side of the price, Johnny's on the other
        st.marks.push({ i: r.fillAt, p: r.entry, col: a[1], label: '', below: low });
        st.marks.push({ i: r.exitAt, p: r.r > 0 ? r.target : r.stop, col: r.r > 0 ? C.lime : C.red, label: a[2] + ' ' + (r.r > 0 ? '+' : '') + r.r + 'R', below: low });
      });
      if (mineRes && mineRes.filled) {
        st.lines.push({ p: mineRes.entry, col: C.you, label: 'YOU', from: mineRes.fillAt });
        st.marks.push({ i: mineRes.exitAt, p: mineRes.r > 0 ? mineRes.target : mineRes.stop, col: C.you, label: 'You ' + (mineRes.r > 0 ? '+' : '') + mineRes.r + 'R' });
      }
      draw(st);

      var d = out.dav, j = out.johnny, best = Math.max(d.filled ? d.r : 0, j.filled ? j.r : 0, 0);
      body.innerHTML = '';
      var res = el('div', 'sim-res');
      res.appendChild(row('media/dv-point.webp', 'Dæv', d.filled ? pick(d.r > 0 ? LINES.dav.win : LINES.dav.loss, st.s.seed) : pick(LINES.dav.none, 0), label(d), cls(d), who === 'dav'));
      res.appendChild(row('media/jc-point.webp', 'Johnny', j.filled ? pick(j.r > 0 ? LINES.johnny.win : LINES.johnny.loss, st.s.seed) : pick(LINES.johnny.none, st.s.seed), label(j), cls(j), who === 'johnny'));
      var skipGood = best <= 0;
      res.appendChild(row(null, 'Skip', skipGood ? 'Nobody made money here. Skipping was right.' : 'Kept you safe, but missed the move.', '0R', 'flat', who === 'skip', '⏸'));
      if (who === 'own') res.appendChild(row(null, 'You', mineRes.filled ? (mineRes.r > 0 ? 'Your plan worked.' : 'Stopped out. Check where you put the stop.') : 'Your order never filled.', label(mineRes), cls(mineRes), true, '✎'));
      body.appendChild(res);

      // verdict + score
      var yourR = who === 'dav' ? (d.filled ? d.r : 0) : who === 'johnny' ? (j.filled ? j.r : 0) : who === 'own' ? (mineRes.filled ? mineRes.r : 0) : 0;
      var good = who === 'skip' ? skipGood : yourR > 0;
      var v = el('div', 'sim-verdict'), vt = el('b', '', good ? 'Good call.' : 'Not this time.');
      v.appendChild(vt);
      v.appendChild(document.createTextNode(verdict(d, j)));
      body.appendChild(v);
      sc.n = (sc.n || 0) + 1; sc.right = (sc.right || 0) + (good ? 1 : 0); sc.r = (sc.r || 0) + yourR; save(sc);

      var bar = el('div', 'sim-bar');
      bar.appendChild(el('span', 'sim-score', sc.n + ' played · ' + sc.right + ' good calls · ' + (sc.r >= 0 ? '+' : '') + (Math.round(sc.r * 10) / 10) + 'R'));
      var again = el('button', 'sim-btn g', 'Replay'); again.type = 'button'; again.onclick = function () { load(idx); };
      var next = el('button', 'sim-btn', idx + 1 < list.length ? 'Next setup' : (opts.more ? (typeof opts.more.label === 'function' ? opts.more.label() : opts.more.label) : 'Start over'));
      next.type = 'button';
      next.onclick = function () { if (idx + 1 < list.length) load(idx + 1); else if (opts.more) opts.more.go(); else load(0); };
      var w = el('div'); w.style.display = 'flex'; w.style.gap = '.5rem'; w.appendChild(again); w.appendChild(next);
      bar.appendChild(w); body.appendChild(bar); body.appendChild(fine);
    }
    function verdict(d, j) {
      var dw = d.filled && d.r > 0, jw = j.filled && j.r > 0;
      if (dw && jw) return d.r > j.r ? 'Both got paid. Dæv got more with the hot entry, but he had less room if it had failed.' : 'Both got paid. Johnny waited and still caught most of it.';
      if (dw) return 'Dæv was right this time. The hot entry pays when the level holds right away.';
      if (jw) return d.filled ? 'Johnny was right. Dæv\'s hot entry got shaken out before the real move; waiting for proof kept Johnny out of it.' : 'Johnny was right. Price only gave a trade to whoever waited.';
      if (d.filled || j.filled) return 'Nobody won this one. The level failed, and the only good trade was no trade.';
      return 'No one got a trade. Price never gave a clean entry, and that is a fine result too.';
    }
    function row(img, name, line, r, c, me, icon) {
      var x = el('div', 'sim-row ' + c + (me ? ' me' : ''));
      if (img) { var im = el('img'); im.src = img; im.alt = ''; x.appendChild(im); } else x.appendChild(el('i', '', icon));
      var t = el('div'); t.appendChild(el('b', '', name + (me ? ' · your pick' : ''))); t.appendChild(el('span', '', line)); x.appendChild(t);
      x.appendChild(el('em', '', r)); return x;
    }

    var ro = window.ResizeObserver ? new ResizeObserver(function () { if (st) draw(st); }) : null;
    if (ro) ro.observe(cv); else window.addEventListener('resize', function () { if (st) draw(st); });
    load(keep ? saved() : 0);
    return { load: load };
  }

  window.WMSim = { mount: mount, scenarios: S, outcome: outcome, _run: run, _plans: plans, _gen: gen };
})();
