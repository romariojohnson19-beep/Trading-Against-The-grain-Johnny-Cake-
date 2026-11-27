/* Shared page shell: mobile menu, sign-in / join state, buy + lead buttons, scroll reveal.
   Used by every public page (landing, store, pricing, FAQ, universe, legal, login). */
(function () {
  var C = window.WM_CONFIG || {}, L = C.links || {};
  var BOOK = L.ebook || 'https://buy.stripe.com/28EdR95TD3xz4os4ccgnK04';
  var A = function () { return window.WMAuth; };

  // mobile menu
  var mb = document.getElementById('snav-menu'), sh = document.getElementById('snav-sheet');
  if (mb && sh) {
    mb.addEventListener('click', function () { var o = sh.classList.toggle('open'); mb.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    sh.addEventListener('click', function (e) { if (e.target.tagName === 'A') sh.classList.remove('open'); });
  }

  function home(u) { return u && u.role === 'admin' ? 'admin.html' : 'members.html'; }
  function openAuth(mode) {
    if (!A()) { location.href = 'login.html?mode=' + mode; return; }
    A().openModal({ mode: mode, redirect: 'members.html' });
  }
  document.querySelectorAll('[data-auth]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var u = A() && A().user();
      if (u) { location.href = home(u); return; }
      openAuth(el.getAttribute('data-auth'));
    });
  });

  var BUNDLE = L.bundle || '';
  document.querySelectorAll('[data-buy-bundle]').forEach(function (el) {
    el.setAttribute('href', BUNDLE || 'store.html#book-bundle'); if (BUNDLE) el.setAttribute('rel', 'noopener');
  });
  document.querySelectorAll('[data-buy]').forEach(function (el) {
    el.setAttribute('href', BOOK); el.setAttribute('rel', 'noopener');
  });

  var LEADS = {
    daypass: { type: 'daypass', title: 'Book a Day Pass', sub: 'Leave your details and we will confirm your session slot.', button: 'Request my slot', subject: 'Day Pass Seat' },
    indicators: { type: 'indicators', title: 'Get the indicators', sub: 'The Cake Game and FIBiT Lite for TradingView. Add your TradingView username in the note and we will email access details.', button: 'Request access', subject: 'Indicators Access' },
    liveroom: { type: 'bootcamp', tag: 'Live room waitlist', title: 'Join the live room waitlist', sub: "Seats open once the list can fill a room. We'll email you first. Nothing to pay until then.", button: 'Join the waitlist', subject: 'Live Room Waitlist' },
    bootcamp: { type: 'bootcamp', title: 'Join the mentoring waitlist', sub: "We'll email you when a spot opens.", button: 'Join the waitlist', subject: 'Mentoring Waitlist' }
  };
  document.querySelectorAll('[data-lead]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var t = el.getAttribute('data-lead');
      if (L[t]) { location.href = L[t]; return; }
      var cfg = LEADS[t] || LEADS.bootcamp;
      if (A()) A().openLead(cfg);
      else location.href = 'mailto:' + (C.contactEmail || '') + '?subject=' + encodeURIComponent(cfg.subject);
    });
  });
  document.querySelectorAll('[data-contact]').forEach(function (a) {
    if (C.contactEmail) { a.setAttribute('href', 'mailto:' + C.contactEmail); if (!a.textContent) a.textContent = C.contactEmail; }
  });

  function paint() {
    var u = A() && A().user(); if (!u) return;
    document.querySelectorAll('[data-nav="signin"]').forEach(function (si) {
      si.textContent = 'Sign out'; si.removeAttribute('data-auth');
      si.onclick = function (e) { e.preventDefault(); A().signOut(); location.reload(); };
    });
    document.querySelectorAll('[data-nav="join"]').forEach(function (j) { j.textContent = u.role === 'admin' ? 'Admin' : 'Dashboard'; j.setAttribute('href', home(u)); });
  }
  try { paint(); if (A() && A().ready) A().ready().then(paint); } catch (e) {}

  // scroll reveal (with a failsafe so nothing stays hidden)
  var els = document.querySelectorAll('[data-r]');
  if (!('IntersectionObserver' in window)) els.forEach(function (el) { el.classList.add('on'); });
  else {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('on'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -40px 0px', threshold: .08 });
    els.forEach(function (el) { io.observe(el); });
  }
  setTimeout(function () { els.forEach(function (el) { el.classList.add('on'); }); }, 2200);
})();
