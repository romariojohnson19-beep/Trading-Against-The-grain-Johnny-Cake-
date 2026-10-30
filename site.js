/* Wiring shared by the pricing, FAQ and legal pages: sign-in / join buttons, buy buttons, contact links. */
(function () {
  var C = window.WM_CONFIG || {}, L = C.links || {};
  function go(mode) {
    if (!window.WMAuth) { location.href = 'index.html'; return; }
    window.WMAuth.openModal({ mode: mode, redirect: 'members.html' });
  }
  document.querySelectorAll('[data-auth]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var u = window.WMAuth && window.WMAuth.user();
      if (u) { location.href = u.role === 'admin' ? 'admin.html' : 'members.html'; return; }
      go(a.getAttribute('data-auth'));
    });
  });
  document.querySelectorAll('[data-buy]').forEach(function (a) {
    a.setAttribute('href', L.ebook || ('mailto:' + (C.contactEmail || '')));
    a.setAttribute('rel', 'noopener');
  });
  document.querySelectorAll('[data-lead]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var t = a.getAttribute('data-lead');
      if (t === 'daypass' && L.daypass) { location.href = L.daypass; return; }
      if (!window.WMAuth) { location.href = 'mailto:' + (C.contactEmail || ''); return; }
      window.WMAuth.openLead(t === 'bootcamp'
        ? { type: 'bootcamp', title: 'Join the Bootcamp waitlist', sub: "We'll email you when a spot opens.", button: 'Join the waitlist', subject: 'Bootcamp Waitlist' }
        : { type: 'daypass', title: 'Book a Day Pass', sub: 'Leave your details and Mario will confirm your session slot.', button: 'Request my slot', subject: 'Day Pass Seat' });
    });
  });
  document.querySelectorAll('[data-contact]').forEach(function (a) {
    if (C.contactEmail) { a.setAttribute('href', 'mailto:' + C.contactEmail); a.textContent = a.textContent || C.contactEmail; }
  });
  try {
    var u = window.WMAuth && window.WMAuth.user(), si = document.getElementById('nav-signin'), jn = document.getElementById('nav-join');
    if (u && si) { si.textContent = 'Sign out'; si.removeAttribute('data-auth'); si.onclick = function (e) { e.preventDefault(); window.WMAuth.signOut(); location.reload(); }; }
    if (u && jn) jn.textContent = u.role === 'admin' ? 'Admin panel' : 'Dashboard';
  } catch (e) {}
})();
