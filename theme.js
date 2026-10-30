/* Light / dark theme. Follows the device setting until the visitor picks one with the toggle. */
(function () {
  var KEY = 'wm_theme', root = document.documentElement, mq = null;
  function stored() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch (e) { return null; } }
  function system() { try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; } }
  function apply(t) {
    root.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; (document.head || root).appendChild(m); }
    m.content = t === 'light' ? '#F6F5EF' : '#0E1210';
    var b = document.getElementById('wm-theme');
    if (b) { b.setAttribute('aria-label', t === 'light' ? 'Switch to dark mode' : 'Switch to light mode'); b.innerHTML = icon(t); }
  }
  function icon(t) {
    return t === 'light'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  }
  apply(stored() || system());
  try { mq = window.matchMedia('(prefers-color-scheme: light)'); var h = function () { if (!stored()) apply(system()); }; mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h); } catch (e) {}

  function mount() {
    if (document.getElementById('wm-theme')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'wm-theme'; b.className = 'wm-theme';
    b.onclick = function () { var n = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; try { localStorage.setItem(KEY, n); } catch (e) {} apply(n); };
    var host = document.querySelector('.nav-actions') || document.querySelector('.pnav-links') || document.querySelector('.topbar-right');
    if (host) host.insertBefore(b, host.firstChild); else { b.className += ' floating'; document.body.appendChild(b); }
    apply(root.getAttribute('data-theme'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
