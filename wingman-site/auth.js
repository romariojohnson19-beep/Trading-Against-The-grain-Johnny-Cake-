/* Wingman account module — shared by index.html, members.html, admin.html.
   Interim, browser-local accounts (localStorage). Passwords are salted + hashed
   (PBKDF2-SHA256) and never leave this browser. Swap for Clerk/Supabase later:
   keep the WMAuth API, replace the storage calls. */
(function () {
  var USERS = 'wm_users', SESSION = 'wm_session', ROSTER = 'wm_members', ITER = 150000;

  function read(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function unhex(s) { var a = new Uint8Array(s.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function hash(pw, saltHex) {
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('Secure context required'));
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (key) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(saltHex), iterations: ITER, hash: 'SHA-256' }, key, 256);
    }).then(hex);
  }
  function newSalt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
  function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  function cloud() { return !!(window.WMCloud && window.WMCloud.enabled); }
  var CFG = window.WM_CONFIG || {};

  var Auth = {
    cloud: cloud,
    cfg: CFG,
    ready: function () { return cloud() ? window.WMCloud.ready : Promise.resolve(); },
    users: function () { return read(USERS, []); },
    hasAdmin: function () { if (cloud()) return true; return Auth.users().some(function (u) { return u.role === 'admin'; }); },
    user: function () {
      if (cloud()) return window.WMCloud.profile();
      var s = read(SESSION, null); if (!s) return null;
      var u = Auth.users().filter(function (x) { return x.id === s.id; })[0];
      return u || null;
    },
    saveUser: function (u) {
      var all = Auth.users();
      for (var i = 0; i < all.length; i++) if (all[i].id === u.id) { all[i] = u; write(USERS, all); return; }
    },

    signUp: function (o) {
      if (cloud()) {
        var nm = (o.name || '').trim(), em = (o.email || '').trim().toLowerCase();
        if (!nm) return Promise.resolve({ ok: false, error: 'Enter your name.' });
        if (!validEmail(em)) return Promise.resolve({ ok: false, error: 'Enter a valid email.' });
        if ((o.password || '').length < 8) return Promise.resolve({ ok: false, error: 'Password must be at least 8 characters.' });
        return window.WMCloud.signUp({ name: nm, email: em, discord: (o.discord || '').trim(), password: o.password });
      }
      var name = (o.name || '').trim(), email = (o.email || '').trim().toLowerCase(), pw = o.password || '', role = o.role || 'member';
      if (!name) return Promise.resolve({ ok: false, error: 'Enter your name.' });
      if (!validEmail(email)) return Promise.resolve({ ok: false, error: 'Enter a valid email.' });
      if (pw.length < 8) return Promise.resolve({ ok: false, error: 'Password must be at least 8 characters.' });
      if (role === 'admin' && Auth.hasAdmin()) return Promise.resolve({ ok: false, error: 'An admin account already exists. Sign in instead.' });
      if (Auth.users().some(function (u) { return u.email === email; })) return Promise.resolve({ ok: false, error: 'That email already has an account. Sign in instead.' });
      var salt = newSalt();
      return hash(pw, salt).then(function (h) {
        var u = { id: uid(), name: name, email: email, discord: (o.discord || '').trim(), role: role, salt: salt, hash: h, created: new Date().toISOString(), points: 0 };
        var all = Auth.users(); all.push(u);
        if (!write(USERS, all)) return { ok: false, error: 'Could not save the account (browser storage is blocked).' };
        if (role === 'member') {
          var roster = read(ROSTER, []);
          roster.push({ name: u.name, discord: u.discord, email: u.email, userId: u.id, week: 1, status: 'pending', points: 0, joined: u.created });
          write(ROSTER, roster);
        }
        write(SESSION, { id: u.id, role: role });
        return { ok: true, user: u };
      }, function (e) { return { ok: false, error: e.message }; });
    },

    signIn: function (email, pw, role) {
      if (cloud()) return window.WMCloud.signIn((email || '').trim().toLowerCase(), pw || '', role);
      email = (email || '').trim().toLowerCase();
      var u = Auth.users().filter(function (x) { return x.email === email; })[0];
      var bad = { ok: false, error: 'Email or password is incorrect.' };
      if (!u) return Promise.resolve(bad);
      if (role === 'admin' && u.role !== 'admin') return Promise.resolve(bad);
      return hash(pw || '', u.salt).then(function (h) {
        if (h !== u.hash) return bad;
        write(SESSION, { id: u.id, role: u.role });
        return { ok: true, user: u };
      }, function (e) { return { ok: false, error: e.message }; });
    },

    signOut: function () { if (cloud()) { window.WMCloud.signOut(); return; } try { localStorage.removeItem(SESSION); } catch (e) {} },

    /* roster entry for the signed-in member (links by userId) */
    rosterEntry: function () {
      var u = Auth.user(); if (!u) return null;
      return read(ROSTER, []).filter(function (m) { return m.userId === u.id; })[0] || null;
    },

    /* ── modal UI ── */
    css: false,
    injectCss: function () {
      if (Auth.css) return; Auth.css = true;
      var s = document.createElement('style');
      s.textContent =
        '.wma-back{position:fixed;inset:0;z-index:2000;background:rgba(6,9,7,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}' +
        '.wma-card{width:100%;max-width:400px;background:#151B18;border:1px solid #26302B;border-radius:20px;padding:28px 26px;box-shadow:0 30px 90px rgba(0,0,0,.6);font-family:Inter,system-ui,sans-serif;color:#E6E9E2;position:relative}' +
        '.wma-x{position:absolute;top:14px;right:16px;background:none;border:none;color:#8D978F;font-size:22px;cursor:pointer;line-height:1}' +
        '.wma-x:hover{color:#E6E9E2}' +
        '.wma-h{font-family:"Bricolage Grotesque","Space Grotesk",sans-serif;font-weight:800;font-size:1.55rem;letter-spacing:-.03em;margin:0 0 4px}' +
        '.wma-sub{color:#9AA39C;font-size:.88rem;margin:0 0 18px;line-height:1.5}' +
        '.wma-tabs{display:flex;gap:4px;background:#0E1210;border:1px solid #26302B;border-radius:10px;padding:3px;margin-bottom:18px}' +
        '.wma-tab{flex:1;background:none;border:none;color:#9AA39C;font:600 .84rem Inter,sans-serif;padding:8px;border-radius:8px;cursor:pointer}' +
        '.wma-tab.on{background:#26302B;color:#E6E9E2}' +
        '.wma-f{display:block;margin-bottom:12px}' +
        '.wma-f span{display:block;font:500 .64rem "JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:#8D978F;margin-bottom:5px}' +
        '.wma-f input{width:100%;background:#0E1210;border:1px solid #26302B;border-radius:10px;color:#E6E9E2;font:400 .95rem Inter,sans-serif;padding:11px 13px;outline:none;transition:border-color .15s}' +
        '.wma-f input:focus{border-color:#B9D77A}' +
        '.wma-err{min-height:1.1em;color:#FF6B6B;font-size:.82rem;margin:2px 0 10px}' +
        '.wma-go{width:100%;background:#B9D77A;color:#101A08;border:none;border-radius:11px;font:700 .98rem Inter,sans-serif;padding:13px;cursor:pointer;min-height:48px;transition:opacity .15s}' +
        '.wma-go:hover{opacity:.9}.wma-go:disabled{opacity:.5;cursor:default}' +
        '.wma-fine{color:#8D978F;font-size:.76rem;margin-top:12px;line-height:1.5;text-align:center}';
      document.head.appendChild(s);
    },

    /* opts: {mode:'signup'|'signin'|'admin-setup'|'admin-signin', dismissible:bool, redirect:url, onDone:fn} */
    brokenCard: function () {
      Auth.injectCss();
      var old = document.getElementById('wma-root'); if (old) old.remove();
      var d = document.createElement('div'); d.id = 'wma-root'; d.className = 'wma-back';
      d.innerHTML = '<div class="wma-card"><h2 class="wma-h">Sign-in unavailable</h2><p class="wma-sub">The sign-in service could not load. Check your connection and reload the page.</p><button class="wma-go" id="wma-rl">Reload</button></div>';
      document.body.appendChild(d); d.querySelector('#wma-rl').onclick = function () { location.reload(); };
    },

    openModal: function (opts) {
      if (window.WMCloud && window.WMCloud.broken) { Auth.brokenCard(); return; }
      opts = opts || {};
      Auth.injectCss();
      var old = document.getElementById('wma-root'); if (old) old.remove();
      var mode = opts.mode || 'signup';
      var admin = mode.indexOf('admin') === 0;
      var root = document.createElement('div'); root.id = 'wma-root'; root.className = 'wma-back';
      function render() {
        if (mode === 'forgot' || mode === 'reset') { renderReset(); return; }
        var signup = mode === 'signup' || mode === 'admin-setup';
        var title = mode === 'admin-setup' ? 'Create admin account' : admin ? 'Admin sign in' : signup ? 'Create your account' : 'Welcome back';
        var sub = mode === 'admin-setup' ? 'First-time setup for the trade room host.' : admin ? 'Trade room host access.' : signup ? 'Request your seat in the room. Mario confirms it after you sign up.' : 'Sign in to your member portal.';
        root.innerHTML =
          '<div class="wma-card" role="dialog" aria-modal="true" aria-labelledby="wma-t">' +
          (opts.dismissible === false ? '' : '<button class="wma-x" aria-label="Close" data-x>&times;</button>') +
          '<h2 class="wma-h" id="wma-t">' + title + '</h2><p class="wma-sub">' + sub + '</p>' +
          (admin ? '' : '<div class="wma-tabs"><button class="wma-tab' + (signup ? ' on' : '') + '" data-m="signup">Create account</button><button class="wma-tab' + (!signup ? ' on' : '') + '" data-m="signin">Sign in</button></div>') +
          '<form novalidate>' +
          (signup ? '<label class="wma-f"><span>Name</span><input name="name" autocomplete="name" maxlength="60"></label>' : '') +
          '<label class="wma-f"><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="120"></label>' +
          (signup && !admin ? '<label class="wma-f"><span>Discord handle (optional)</span><input name="discord" placeholder="@handle" maxlength="40"></label>' : '') +
          '<label class="wma-f"><span>Password</span><input name="password" type="password" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" maxlength="128"></label>' +
          '<div class="wma-err" role="alert"></div>' +
          '<button class="wma-go" type="submit">' + (mode === 'admin-setup' ? 'Create admin account' : signup ? 'Create account' : 'Sign in') + '</button></form>' +
          (!signup && cloud() ? '<p class="wma-fine"><a href="#" data-forgot style="color:#B9D77A">Forgot password?</a></p>' : '') +
          (signup && !admin && !cloud() ? '<p class="wma-fine">Passwords are hashed and stored only in this browser until the full member backend goes live.</p>' : '') +
          '</div>';
        var x = root.querySelector('[data-x]'); if (x) x.onclick = function () { root.remove(); };
        var fg = root.querySelector('[data-forgot]'); if (fg) fg.onclick = function (e) { e.preventDefault(); mode = 'forgot'; render(); };
        root.querySelectorAll('.wma-tab').forEach(function (t) { t.onclick = function () { mode = t.getAttribute('data-m'); render(); }; });
        var form = root.querySelector('form'), err = root.querySelector('.wma-err'), btn = root.querySelector('.wma-go');
        form.onsubmit = function (ev) {
          ev.preventDefault(); err.textContent = ''; btn.disabled = true;
          var f = form.elements, p;
          if (signup) p = Auth.signUp({ name: f.name.value, email: f.email.value, discord: f.discord ? f.discord.value : '', password: f.password.value, role: admin ? 'admin' : 'member' });
          else p = Auth.signIn(f.email.value, f.password.value, admin ? 'admin' : null);
          p.then(function (r) {
            if (!r.ok) { err.textContent = r.error; btn.disabled = false; return; }
            if (r.confirm) { err.style.color = '#B9D77A'; err.textContent = 'Check your email to confirm your account, then sign in.'; btn.disabled = false; return; }
            root.remove();
            if (opts.onDone) opts.onDone(r.user);
            else if (opts.redirect) location.href = (r.user.role === 'admin' ? 'admin.html' : opts.redirect);
          });
        };
        var first = form.querySelector('input'); if (first) setTimeout(function () { first.focus(); }, 30);
      }
      function renderReset() {
        var isReset = mode === 'reset';
        root.innerHTML =
          '<div class="wma-card" role="dialog" aria-modal="true" aria-labelledby="wma-t">' +
          (opts.dismissible === false ? '' : '<button class="wma-x" aria-label="Close" data-x>&times;</button>') +
          '<h2 class="wma-h" id="wma-t">' + (isReset ? 'Set a new password' : 'Reset your password') + '</h2>' +
          '<p class="wma-sub">' + (isReset ? 'Choose a new password for your account.' : 'Enter your email and we will send you a link to set a new one.') + '</p><form novalidate>' +
          (isReset
            ? '<label class="wma-f"><span>New password</span><input name="password" type="password" autocomplete="new-password" maxlength="128"></label><label class="wma-f"><span>Confirm password</span><input name="confirm" type="password" autocomplete="new-password" maxlength="128"></label>'
            : '<label class="wma-f"><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="120"></label>') +
          '<div class="wma-err" role="alert"></div><button class="wma-go" type="submit">' + (isReset ? 'Save password' : 'Send reset link') + '</button></form>' +
          (isReset ? '' : '<p class="wma-fine"><a href="#" data-back style="color:#B9D77A">Back to sign in</a></p>') + '</div>';
        var x = root.querySelector('[data-x]'); if (x) x.onclick = function () { root.remove(); };
        var back = root.querySelector('[data-back]'); if (back) back.onclick = function (e) { e.preventDefault(); mode = 'signin'; render(); };
        var form = root.querySelector('form'), err = root.querySelector('.wma-err'), btn = root.querySelector('.wma-go');
        form.onsubmit = function (ev) {
          ev.preventDefault(); err.style.color = ''; err.textContent = '';
          var f = form.elements;
          if (!isReset) {
            if (!validEmail(f.email.value.trim())) { err.textContent = 'Enter a valid email.'; return; }
            btn.disabled = true;
            window.WMCloud.requestReset(f.email.value.trim()).then(function (r) {
              btn.disabled = false;
              if (!r.ok) { err.textContent = r.error; return; }
              err.style.color = '#B9D77A'; err.textContent = 'If that email has an account, a reset link is on its way. Check your inbox.';
            });
            return;
          }
          if (f.password.value.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
          if (f.password.value !== f.confirm.value) { err.textContent = 'Passwords do not match.'; return; }
          btn.disabled = true;
          window.WMCloud.setPassword(f.password.value).then(function (r) {
            if (!r.ok) { err.textContent = r.error; btn.disabled = false; return; }
            root.querySelector('.wma-card').innerHTML = '<h2 class="wma-h">Password updated</h2><p class="wma-sub">You are signed in.</p><button class="wma-go" id="wma-ok">Continue</button>';
            root.querySelector('#wma-ok').onclick = function () {
              window.WMCloud.ready.then(function () { var u = Auth.user(); location.href = (u && u.role === 'admin') ? 'admin.html' : 'members.html'; });
            };
          });
        };
        var first = form.querySelector('input'); if (first) setTimeout(function () { first.focus(); }, 30);
      }
      render();
      if (opts.dismissible !== false) root.addEventListener('mousedown', function (e) { if (e.target === root) root.remove(); });
      document.body.appendChild(root);
    },

    /* Gate a page. role: 'member' | 'admin'. onReady(user) runs once signed in (and, in cloud mode, after the first data pull).
       onRefresh runs every ~20s in cloud mode so open pages pick up changes made elsewhere. */
    guard: function (role, onReady, onRefresh) {
      if (window.WMCloud && window.WMCloud.broken) { document.documentElement.style.visibility = 'visible'; Array.prototype.forEach.call(document.body.children, function (c) { if (c.tagName !== 'SCRIPT') c.style.visibility = 'hidden'; }); Auth.brokenCard(); return; }
      function run() {
        var u = Auth.user();
        var ok = u && (role === 'admin' ? u.role === 'admin' : true);
        if (ok) {
          document.documentElement.style.visibility = '';
          if (cloud()) {
            window.WMCloud.pull().then(function () {
              if (onReady) onReady(u);
              if (onRefresh) window.WMCloud.poll(onRefresh, 20000);
            });
          } else if (onReady) onReady(u);
          return;
        }
        document.documentElement.style.visibility = 'visible';
        Array.prototype.forEach.call(document.body.children, function (c) { if (c.id !== 'wma-root' && c.tagName !== 'SCRIPT') c.style.visibility = 'hidden'; });
        if (u && role === 'admin' && cloud()) {
          location.replace('members.html'); return;
          Auth.injectCss();
          var d = document.createElement('div'); d.id = 'wma-root'; d.className = 'wma-back';
          d.innerHTML = '<div class="wma-card"><h2 class="wma-h">No admin access</h2><p class="wma-sub">You are signed in as ' + esc(u.email) + ', which is not an admin account.</p><button class="wma-go" id="wma-out">Sign out</button><p class="wma-sub" style="margin-top:14px">Signed in with the wrong account? Sign out, then sign in with your admin email.</p></div>';
          document.body.appendChild(d);
          d.querySelector('#wma-out').onclick = function () { Auth.signOut(); location.reload(); };
          return;
        }
        var mode = role === 'admin' ? (Auth.hasAdmin() ? 'admin-signin' : 'admin-setup') : 'signin';
        Auth.openModal({ mode: mode, dismissible: false, onDone: function () { location.reload(); } });
      }
      if (cloud()) window.WMCloud.ready.then(run); else run();
    },

    /* Lead capture (Day Pass / Bootcamp waitlist). Cloud: stored for admin Inbox. Demo mode: opens an email to Mario. */
    openLead: function (o) {
      var to = CFG.contactEmail || '';
      if (window.WMCloud && window.WMCloud.broken) { Auth.brokenCard(); return; }
      if (!cloud()) {
        location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(o.subject || 'Wingman request');
        return;
      }
      Auth.injectCss();
      var old = document.getElementById('wma-root'); if (old) old.remove();
      var root = document.createElement('div'); root.id = 'wma-root'; root.className = 'wma-back';
      root.innerHTML = '<div class="wma-card" role="dialog" aria-modal="true"><button class="wma-x" aria-label="Close" data-x>&times;</button>' +
        '<h2 class="wma-h">' + esc(o.title) + '</h2><p class="wma-sub">' + esc(o.sub) + '</p><form novalidate>' +
        '<label class="wma-f"><span>Name</span><input name="name" autocomplete="name" maxlength="100"></label>' +
        '<label class="wma-f"><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="200"></label>' +
        '<label class="wma-f"><span>Discord or note (optional)</span><input name="detail" maxlength="300"></label>' +
        '<div class="wma-err" role="alert"></div><button class="wma-go" type="submit">' + esc(o.button || 'Send') + '</button></form></div>';
      document.body.appendChild(root);
      root.querySelector('[data-x]').onclick = function () { root.remove(); };
      root.addEventListener('mousedown', function (e) { if (e.target === root) root.remove(); });
      var form = root.querySelector('form'), err = root.querySelector('.wma-err'), btn = root.querySelector('.wma-go');
      form.onsubmit = function (ev) {
        ev.preventDefault(); err.textContent = '';
        var f = form.elements;
        if (!f.name.value.trim()) { err.textContent = 'Enter your name.'; return; }
        if (!validEmail(f.email.value.trim())) { err.textContent = 'Enter a valid email.'; return; }
        btn.disabled = true;
        window.WMCloud.submitLead({ type: o.type, name: f.name.value.trim(), email: f.email.value.trim(), detail: f.detail.value.trim() }).then(function (r) {
          if (!r.ok) { err.textContent = r.error; btn.disabled = false; return; }
          root.querySelector('.wma-card').innerHTML = '<h2 class="wma-h">You\'re in.</h2><p class="wma-sub">Mario will reach out by email shortly.</p><button class="wma-go" id="wma-ok">Done</button>';
          root.querySelector('#wma-ok').onclick = function () { root.remove(); };
        });
      };
      setTimeout(function () { form.querySelector('input').focus(); }, 30);
    }
  };
  Auth.esc = esc;
  window.WMAuth = Auth;
  /* password-recovery link: Supabase signs the visitor in with a temporary session, then we ask for a new password */
  if (cloud()) {
    var openReset = function () { Auth.openModal({ mode: 'reset', dismissible: false }); };
    window.addEventListener('wm-recovery', openReset);
    if (window.WMCloud.recovering) openReset();
  }
})();
