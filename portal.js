/* Members portal: dashboard "continue learning" + course path, and the phone tab bar.
   Reads lesson progress from the same place lessons.js saves it. */
(function () {
  function $(id) { return document.getElementById(id); }
  function user() { try { return window.WMAuth && WMAuth.user(); } catch (e) { return null; } }
  function seen() { var u = user(); try { return JSON.parse(localStorage.getItem('wm_lessons_seen_' + (u && (u.id || u.email) || 'anon')) || '{}'); } catch (e) { return {}; } }
  function seat() { try { var s = typeof ROSTER_ME !== 'undefined' && ROSTER_ME ? ROSTER_ME.status : null; return s === 'active' || s === 'trial' || (user() && user().role === 'admin'); } catch (e) { return false; } }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function openLesson(i) {
    showPage('lessons');
    setTimeout(function () { var c = document.querySelector('.ls-card[data-i="' + i + '"]'); if (c) c.click(); }, 60);
  }

  function render() {
    var L = window.WM_LESSONS || [], s = seen();
    var d = $('db-date'); if (d) d.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    var chip = $('db-chip'); if (chip) { chip.innerHTML = ''; chip.appendChild(document.createTextNode(seat() ? 'Live room seat ' : 'Free member ')); chip.appendChild(el('b', '', seat() ? 'active' : '· lessons + store')); }

    // levels: first half of the library = basics, second half = setups, then the live room
    var half = Math.ceil(L.length / 2), lv = [L.slice(0, half), L.slice(half)];
    var done = lv.map(function (g) { return g.filter(function (x) { return s[x.id]; }).length; });
    var nextIdx = L.findIndex(function (x) { return !s[x.id]; });

    var box = $('db-learn'); if (!box) return; box.innerHTML = '';
    var up = el('div', 'card up-next');
    if (nextIdx < 0) {
      up.appendChild(el('img')).src = 'media/jc-sofa-cheer.webp';
      var w = el('div'); w.appendChild(el('div', 'k', 'All caught up')); w.appendChild(el('h3', '', "You've watched every lesson.")); w.appendChild(el('p', '', 'New ones land every week. The live room is where it all comes together.'));
      var b0 = el('button', 'btn btn-accent btn-sm', 'Go to the live room'); b0.onclick = function () { showPage('live'); }; w.appendChild(b0); up.appendChild(w);
    } else {
      var x = L[nextIdx], im = el('img'); im.src = x.poster; im.alt = ''; im.loading = 'lazy'; up.appendChild(im);
      var t = el('div'); t.appendChild(el('div', 'k', Object.keys(s).length ? 'Up next · lesson ' + x.n : 'Start here · lesson 1'));
      t.appendChild(el('h3', '', x.title)); t.appendChild(el('p', '', x.summary));
      var b = el('button', 'btn btn-accent btn-sm', 'Play · ' + x.secs + 's'); b.onclick = function () { openLesson(nextIdx); }; t.appendChild(b);
      up.appendChild(t);
    }
    box.appendChild(up);

    var pc = el('div', 'card path-card');
    var rows = [
      { t: 'The basics', sub: done[0] + ' of ' + lv[0].length + ' watched', pct: lv[0].length ? done[0] / lv[0].length : 0, ok: done[0] === lv[0].length },
      { t: 'The setups', sub: done[1] + ' of ' + lv[1].length + ' watched', pct: lv[1].length ? done[1] / lv[1].length : 0, ok: lv[1].length && done[1] === lv[1].length },
      { t: 'Trade live', sub: seat() ? 'Your seat is active' : 'Needs a live room seat', pct: seat() ? 1 : 0, ok: seat(), live: true }
    ];
    var curSet = false;
    rows.forEach(function (r, i) {
      var row = el('div', 'pc-row' + (r.ok ? ' done' : (!curSet ? ' cur' : '')));
      if (!r.ok) curSet = true;
      row.appendChild(el('div', 'pc-n', r.ok ? '✓' : String(i + 1)));
      var mid = el('div'); mid.appendChild(el('div', 'pc-t', r.t)); mid.appendChild(el('div', 'pc-s', r.sub));
      if (!r.live) { var bar = el('div', 'pc-bar'), f = el('i'); f.style.width = Math.round(r.pct * 100) + '%'; bar.appendChild(f); mid.appendChild(bar); }
      row.appendChild(mid);
      var go;
      if (r.live) { go = el('button', 'pc-go', seat() ? 'Open →' : 'Get a seat →'); go.onclick = function () { if (seat()) showPage('live'); else location.href = 'store.html'; }; }
      else { go = el('button', 'pc-go', r.ok ? 'Review' : 'Continue →'); go.onclick = function () { var g = lv[i], k = g.findIndex(function (x) { return !s[x.id]; }); openLesson(L.indexOf(g[k < 0 ? 0 : k])); }; }
      row.appendChild(go); pc.appendChild(row);
    });
    box.appendChild(pc);
    var sc = {}; try { sc = JSON.parse(localStorage.getItem('wm_sim_score') || '{}'); } catch (e) {}
    var simc = el('div', 'card sim-card'), st = el('div');
    st.appendChild(el('div', 'k', 'Trade Sim'));
    st.appendChild(el('h3', '', sc.n ? sc.right + ' good calls in ' + sc.n + ' setups' : 'Would you have taken it?'));
    st.appendChild(el('p', '', 'Trade it like Dæv, like Johnny, skip it, or place your own entry. Then watch it play out.'));
    simc.appendChild(st);
    var crew = el('img', 'sim-crew'); crew.src = 'media/world/market-makers.webp'; crew.alt = 'The market makers watching'; crew.loading = 'lazy'; simc.appendChild(crew);
    var sb = el('button', 'btn btn-accent btn-sm', sc.n ? 'Keep playing' : 'Play a setup'); sb.onclick = function () { showPage('sim'); }; simc.appendChild(sb);
    box.appendChild(simc);
    if (window.WMCake) WMCake.get().then(function (url) {
      if (!url || document.getElementById('cake-card')) return;
      var u = user(), cc = el('div', 'card cake-card'); cc.id = 'cake-card';
      var im = el('img'); im.src = 'media/jc-desk-coffee.webp'; im.alt = ''; cc.appendChild(im);
      var t = el('div'); t.appendChild(el('b', '', 'Enjoying the free stuff?'));
      t.appendChild(el('span', '', 'Lessons and the Trade Sim are free. If they helped, you can buy Johnny a cake. Totally optional.'));
      cc.appendChild(t);
      var a = el('a', 'btn btn-ghost btn-sm', 'Buy Johnny a cake 🍰');
      a.href = url + (url.indexOf('?') < 0 ? '?' : '&') + (u && u.email ? 'prefilled_email=' + encodeURIComponent(u.email) + '&' : '') + 'client_reference_id=' + encodeURIComponent((u && u.id) || 'guest');
      a.target = '_blank'; a.rel = 'noopener'; cc.appendChild(a);
      var dash = document.getElementById('page-dashboard'), floor = document.getElementById('world-floor');
      if (floor && floor.parentNode === dash) dash.insertBefore(cc, floor); else dash.appendChild(cc);
    });
  }

  // phone tab bar mirrors the sidebar
  function tabs() {
    var bar = el('nav', 'tabbar'); bar.setAttribute('aria-label', 'Portal');
    var I = {
      dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
      live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/></svg>',
      lessons: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="currentColor"/></svg>',
      sim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18l5-6 4 3 8-9"/><circle cx="20" cy="6" r="1.6" fill="currentColor"/></svg>',
      more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
    };
    [['dashboard', 'Home'], ['live', 'Live'], ['lessons', 'Lessons'], ['sim', 'Sim'], ['more', 'More']].forEach(function (t) {
      var b = el('button'); b.type = 'button'; b.setAttribute('data-t', t[0]); b.innerHTML = I[t[0]];
      b.appendChild(el('span', '', t[1]));
      if (t[0] === 'live') { var dt = el('i', 'tdot'); dt.id = 'tab-live-dot'; b.appendChild(dt); }
      b.onclick = function () { if (t[0] === 'more') openSidebar(); else showPage(t[0]); };
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }
  function mark(name) {
    document.querySelectorAll('.tabbar button').forEach(function (b) {
      var t = b.getAttribute('data-t');
      b.classList.toggle('on', t === name || (t === 'more' && ['library', 'schedule', 'messages', 'plan', 'downloads'].indexOf(name) >= 0));
    });
    var ld = $('live-dot'), td = $('tab-live-dot'); if (td) td.style.display = ld && ld.style.display !== 'none' ? 'block' : 'none';
  }

  function thanks() {
    if (!/[?&]cake=thanks/.test(location.search)) return;
    var t = el('div', 'cake-thanks'); t.setAttribute('role', 'status');
    var im = el('img'); im.src = 'media/jc-wave.webp'; im.alt = ''; t.appendChild(im);
    t.appendChild(el('div', '', 'Johnny’s eating good tonight. Thank you. 🍰'));
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 6000);
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }
  function init() {
    tabs(); thanks();
    if (typeof window.showPage === 'function') {
      var orig = window.showPage;
      window.showPage = function (n) { orig(n); mark(n); if (n === 'dashboard') render(); };
    }
    if (location.hash === '#sim') { window.showPage('sim'); } else { mark('dashboard'); }
    window.addEventListener('hashchange', function () { if (location.hash === '#sim') window.showPage('sim'); });
    render();
    setTimeout(render, 900); // roster status can arrive after first paint
    setInterval(function () { var cur = document.querySelector('.tabbar button.on'); mark(cur ? cur.getAttribute('data-t') : 'dashboard'); }, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
