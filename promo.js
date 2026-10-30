/* Wingman promotions: reads the promo list the host edits in Admin → Promotions and shows
   (a) an occasional pop-up card and (b) a promo strip on the pricing page.
   Promo shape: {id, code, title, detail, applies:'all'|'wingman'|'book', active:bool, featured:bool, ends:'YYYY-MM-DD'|''}
   Everything is rendered with textContent, never innerHTML, so promo text can never inject markup. */
(function () {
  var DEFAULTS = [
    { id: 'p1', code: 'CAKE20', title: '$20 off any product', detail: 'Use code CAKE20 at checkout.', applies: 'all', active: true, featured: true, ends: '' },
    { id: 'p2', code: 'WINGMAN', title: '20% off Wingman', detail: 'Use code WINGMAN at checkout on a Wingman seat.', applies: 'wingman', active: true, featured: false, ends: '' }
  ];
  var SEEN_KEY = 'wm_promo_seen', GAP_MS = 24 * 3600 * 1000, DELAY_MS = 9000;

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function clean(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (p) { return p && typeof p === 'object' && /^[A-Za-z0-9_-]{2,24}$/.test(String(p.code || '')); }).map(function (p) {
      return { id: String(p.id || p.code).slice(0, 40), code: String(p.code).toUpperCase(), title: String(p.title || '').slice(0, 80), detail: String(p.detail || '').slice(0, 200),
        applies: ['all', 'wingman', 'book'].indexOf(p.applies) >= 0 ? p.applies : 'all', active: p.active !== false, featured: !!p.featured, ends: /^\d{4}-\d{2}-\d{2}$/.test(p.ends || '') ? p.ends : '' };
    });
  }
  function live(p) {
    if (!p.active) return false;
    if (p.ends) { var end = new Date(p.ends + 'T23:59:59'); if (!isNaN(end) && end < new Date()) return false; }
    return true;
  }
  function load() {
    var C = window.WMCloud;
    if (C && C.enabled && C.getPromos) return C.getPromos().then(function (v) { return v === null ? [] : clean(v); });
    var raw = ls('wm_promos'); if (raw) { try { return Promise.resolve(clean(JSON.parse(raw))); } catch (e) {} }
    return Promise.resolve(clean(DEFAULTS));
  }
  function endsText(p) { if (!p.ends) return ''; var d = new Date(p.ends + 'T12:00:00'); return isNaN(d) ? '' : 'Ends ' + d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }); }
  function copy(code, btn) {
    function done() { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1500); }
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(code).then(done, done); return; } } catch (e) {}
    var t = document.createElement('textarea'); t.value = code; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) {} t.remove(); done();
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }

  /* ── pricing-page strip ── */
  function renderStrip(list) {
    var host = document.getElementById('promo-strip'); if (!host) return;
    host.textContent = '';
    list.forEach(function (p) {
      var row = el('div', 'promo-row'), left = el('div'), b = el('b', '', p.title || p.code), d = el('span', 'd', (p.detail || '') + (endsText(p) ? ' · ' + endsText(p) : ''));
      left.appendChild(b); left.appendChild(d);
      var pill = el('button', 'code-pill', p.code); pill.type = 'button'; pill.setAttribute('aria-label', 'Copy code ' + p.code);
      pill.onclick = function () { copy(p.code, pill); };
      row.appendChild(left); row.appendChild(pill); host.appendChild(row);
    });
    host.parentNode.hidden = list.length === 0;
  }

  /* ── pop-up ── */
  function showPopup(p) {
    if (document.getElementById('wm-promo')) return;
    var box = el('div', 'wm-promo'); box.id = 'wm-promo'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'wm-promo-t'); box.setAttribute('aria-live', 'polite');
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close promotion');
    var t = el('div', 't', p.title || ('Use code ' + p.code)); t.id = 'wm-promo-t';
    box.appendChild(x); box.appendChild(el('div', 'k', 'Current promotion')); box.appendChild(t);
    if (p.detail) box.appendChild(el('div', 'd', p.detail));
    var row = el('div', 'row'), pill = el('button', 'code-pill', p.code); pill.type = 'button'; pill.setAttribute('aria-label', 'Copy code ' + p.code); pill.onclick = function () { copy(p.code, pill); };
    var go = el('a', 'go', 'See pricing'); go.href = 'pricing.html';
    row.appendChild(pill); row.appendChild(go); box.appendChild(row);
    if (endsText(p)) box.appendChild(el('div', 'ends', endsText(p)));
    function close() { lsSet(SEEN_KEY, JSON.stringify({ id: p.id, t: Date.now() })); box.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    x.onclick = close; go.addEventListener('click', function () { lsSet(SEEN_KEY, JSON.stringify({ id: p.id, t: Date.now() })); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    lsSet(SEEN_KEY, JSON.stringify({ id: p.id, t: Date.now() }));
  }
  function pickFeatured(list) {
    var l = list.filter(live); if (!l.length) return null;
    return l.filter(function (p) { return p.featured; })[0] || l[0];
  }
  function maybePopup(list) {
    if (document.body.hasAttribute('data-no-promo') || /[?&]nopromo\b/.test(location.search)) return;
    var p = pickFeatured(list); if (!p) return;
    var seen = null; try { seen = JSON.parse(ls(SEEN_KEY) || 'null'); } catch (e) {}
    if (seen && seen.id === p.id && Date.now() - seen.t < GAP_MS) return;
    setTimeout(function () { showPopup(p); }, DELAY_MS);
  }

  function init() {
    var go = function () { load().then(function (all) { var l = all.filter(live); renderStrip(l); maybePopup(all); }); };
    if (window.WMCloud && window.WMCloud.ready) window.WMCloud.ready.then(go, go); else go();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
