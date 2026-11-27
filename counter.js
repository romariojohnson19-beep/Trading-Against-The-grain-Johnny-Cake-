/* Public eval scoreboard: passed, failed and testing-now counts, set by the admin.
   Stored in Supabase settings (key 'eval_counter', public) or this browser in demo mode.
   Optionally adds the results logged in Admin → Results, for the chosen period. */
(function () {
  var KEY = 'eval_counter', LS = 'wm_eval_counter';
  var DEF = { show: true, mode: 'lifetime', pass: 0, fail: 0, testing: 0, addLog: true };
  function client() { var C = window.WMCloud; return (C && C.enabled && C.client) ? C.client : null; }
  function clean(v) {
    v = Object.assign({}, DEF, v || {});
    ['pass', 'fail', 'testing'].forEach(function (k) { v[k] = Math.max(0, parseInt(v[k], 10) || 0); });
    v.mode = v.mode === 'week' ? 'week' : 'lifetime'; v.show = v.show !== false; v.addLog = v.addLog !== false;
    return v;
  }
  function get() {
    var c = client();
    if (!c) { try { return Promise.resolve(clean(JSON.parse(localStorage.getItem(LS) || 'null'))); } catch (e) { return Promise.resolve(clean()); } }
    return c.from('settings').select('value').eq('key', KEY).maybeSingle().then(function (r) { return clean(r && r.data && r.data.value); }, function () { return clean(); });
  }
  function set(v) {
    v = clean(v); var c = client();
    if (!c) { localStorage.setItem(LS, JSON.stringify(v)); return Promise.resolve(v); }
    return c.from('settings').upsert([{ key: KEY, value: v, visibility: 'public' }]).then(function (r) { if (r.error) throw new Error('Could not save the counter. Are you signed in as admin?'); return v; });
  }
  // final numbers to show: admin numbers + (optionally) logged results for the period
  function compute(cfg, rows) {
    var out = { pass: cfg.pass, fail: cfg.fail, testing: cfg.testing };
    if (cfg.addLog && rows && rows.length && window.WingmanResults) {
      var s = WingmanResults.summarize(rows), p = cfg.mode === 'week' ? s.week : s.all;
      out.pass += p.pass; out.fail += p.fail;
    }
    out.total = out.pass + out.fail + out.testing;
    return out;
  }
  function load() {
    var R = window.WingmanResults;
    return Promise.all([get(), R ? R.list().catch(function () { return []; }) : Promise.resolve([])]).then(function (a) { return { cfg: a[0], rows: a[1], n: compute(a[0], a[1]) }; });
  }

  // public strip: fills #scoreboard if present
  function mountPublic(el) {
    if (!el) return;
    load().then(function (d) {
      if (!d.cfg.show || !d.n.total) { el.hidden = true; return; }
      el.hidden = false;
      var per = d.cfg.mode === 'week' ? 'This week' : 'Lifetime';
      el.querySelector('[data-sb="period"]').textContent = per;
      [['total', d.n.total], ['pass', d.n.pass], ['fail', d.n.fail], ['testing', d.n.testing]].forEach(function (p) {
        var b = el.querySelector('[data-sb="' + p[0] + '"]'); if (!b) return;
        if (p[0] === 'testing' && !p[1]) { b.closest('.sb-cell').hidden = true; return; }
        countUp(b, p[1]);
      });
      var rs = document.getElementById('results'), lk = el.querySelector('[data-sb="link"]');
      if (lk) lk.hidden = !(rs && !rs.hidden);
    });
  }
  function countUp(b, to) {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { b.textContent = to; return; }
    b.textContent = '0';
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; io.disconnect();
      var t0 = null, dur = 900;
      function f(ts) { if (!t0) t0 = ts; var u = Math.min(1, (ts - t0) / dur); b.textContent = Math.round(to * (1 - Math.pow(1 - u, 3))); if (u < 1) requestAnimationFrame(f); }
      requestAnimationFrame(f);
    });
    io.observe(b);
  }

  window.WMCounter = { get: get, set: set, compute: compute, load: load, mountPublic: mountPublic };
  document.addEventListener('DOMContentLoaded', function () { mountPublic(document.getElementById('scoreboard')); });
  if (document.readyState !== 'loading') mountPublic(document.getElementById('scoreboard'));
})();
