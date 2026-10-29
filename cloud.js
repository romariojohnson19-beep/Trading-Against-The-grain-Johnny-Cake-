/* Wingman cloud layer — Supabase auth + data sync.
   Loaded after config.js and the supabase-js bundle. If config.js has no Supabase keys this file does
   nothing and the site runs in browser-only demo mode (auth.js local accounts).

   Design: the pages keep reading/writing their familiar localStorage keys (wm_events, wm_files, …).
   After sign-in, pull() fills those keys from the database; when the admin page writes one of them,
   the write is mirrored to the database. Row-level security in supabase/schema.sql is the real gatekeeper. */
(function () {
  var C = window.WM_CONFIG || {};
  var Cloud = { enabled: false };
  window.WMCloud = Cloud;
  if (!(C.supabaseUrl && C.supabaseAnonKey && window.supabase && window.supabase.createClient)) {
    Cloud.ready = Promise.resolve(null);
    // keys are set but the supabase library did not load (blocked/offline): never silently fall back to demo accounts
    if (C.supabaseUrl && C.supabaseAnonKey) Cloud.broken = true;
    return;
  }
  Cloud.enabled = true;

  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  Cloud.client = sb;
  Cloud.recovering = false;
  try {
    if (sb.auth.onAuthStateChange) sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'PASSWORD_RECOVERY') { Cloud.recovering = true; try { window.dispatchEvent(new Event('wm-recovery')); } catch (e) {} }
    });
  } catch (e) {}

  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  var suppress = false, profile = null, known = { events: {}, files: {}, history: {}, roster: {}, requests: {} };
  var ADMIN_KEYS = ['wm_days_this', 'wm_days_next', 'wm_next_week', 'wm_dayslots', 'wm_schedule', 'wm_latest_msg'];
  var SYNCED = ['wm_events', 'wm_files', 'wm_sent_history', 'wm_settings', 'mario_status', 'wm_seats', 'wm_members', 'wm_requests', 'wm_profile'].concat(ADMIN_KEYS);

  function jget(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function put(k, v) { suppress = true; try { rawSet.call(localStorage, k, JSON.stringify(v)); } catch (e) {} suppress = false; }
  function putRaw(k, v) { suppress = true; try { rawSet.call(localStorage, k, String(v)); } catch (e) {} suppress = false; }
  function fail(msg) { try { if (window.showToast) window.showToast('⚠ ' + msg); } catch (e) {} if (window.console) console.warn('[cloud]', msg); }
  function friendly(m) {
    m = String(m || '');
    if (/invalid login/i.test(m)) return 'Email or password is incorrect.';
    if (/already registered|already been registered/i.test(m)) return 'That email already has an account. Sign in instead.';
    if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return 'Password must be at least 8 characters.';
    if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first (check your inbox), then sign in.';
    return m || 'Something went wrong. Try again.';
  }
  function idx(arr, keyFn) { var o = {}; arr.forEach(function (x) { o[keyFn(x)] = JSON.stringify(x); }); return o; }
  function rows(p) { return p.then(function (r) { return r && !r.error ? (r.data || []) : null; }, function () { return null; }); }

  profile = jget('wm_profile', null);
  Cloud.profile = function () { return profile; };

  function clearCaches() {
    SYNCED.forEach(function (k) { try { rawRemove.call(localStorage, k); } catch (e) {} });
    known = { events: {}, files: {}, history: {}, roster: {}, requests: {} };
  }

  function loadProfile(uid) {
    return sb.from('profiles').select('id,name,email,discord,role,created_at').eq('id', uid).maybeSingle().then(function (r) {
      if (r.data) {
        profile = { id: r.data.id, name: r.data.name, email: r.data.email, discord: r.data.discord, role: r.data.role, created: r.data.created_at, points: 0 };
        put('wm_profile', profile);
      }
      return profile;
    });
  }

  Cloud.ready = sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s) { profile = null; clearCaches(); return null; }
    if (profile && profile.id !== s.user.id) clearCaches();
    return loadProfile(s.user.id);
  }).catch(function () { return profile; });

  /* ── auth ── */
  Cloud.signUp = function (o) {
    return sb.auth.signUp({ email: o.email, password: o.password, options: { data: { name: o.name, discord: o.discord || '' } } }).then(function (r) {
      if (r.error) return { ok: false, error: friendly(r.error.message) };
      if (!r.data.session) return { ok: true, confirm: true };
      clearCaches();
      return loadProfile(r.data.user.id).then(function (p) { return { ok: true, user: p }; });
    }, function (e) { return { ok: false, error: friendly(e && e.message) }; });
  };
  Cloud.signIn = function (email, pw, role) {
    return sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
      if (r.error) return { ok: false, error: friendly(r.error.message) };
      clearCaches();
      return loadProfile(r.data.user.id).then(function (p) {
        if (role === 'admin' && (!p || p.role !== 'admin')) { Cloud.signOut(); return { ok: false, error: 'This account does not have admin access.' }; }
        return { ok: true, user: p };
      });
    }, function (e) { return { ok: false, error: friendly(e && e.message) }; });
  };
  Cloud.requestReset = function (email) {
    return sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' }).then(function (r) {
      return r && r.error ? { ok: false, error: friendly(r.error.message) } : { ok: true };
    }, function (e) { return { ok: false, error: friendly(e && e.message) }; });
  };
  Cloud.setPassword = function (pw) {
    return sb.auth.updateUser({ password: pw }).then(function (r) {
      if (r && r.error) return { ok: false, error: friendly(r.error.message) };
      Cloud.recovering = false; return { ok: true };
    }, function (e) { return { ok: false, error: friendly(e && e.message) }; });
  };
  Cloud.signOut = function () {
    try { Object.keys(localStorage).filter(function (k) { return /^sb-/.test(k); }).forEach(function (k) { rawRemove.call(localStorage, k); }); } catch (e) {}
    clearCaches(); profile = null;
    try { sb.auth.signOut({ scope: 'local' }); } catch (e) {}
  };

  /* ── pull: database → localStorage ── */
  Cloud.pull = function () {
    if (!profile) return Promise.resolve();
    var admin = profile.role === 'admin';
    var jobs = [];

    jobs.push(rows(sb.from('events').select('*')).then(function (r) {
      if (!r) return;
      var ev = r.map(function (e) { return { id: e.id, date: e.date, sessType: e.sess_type, sessTypeLabel: e.label, instruments: e.instruments || [], start: e.start_time, end: e.end_time, notes: e.notes }; });
      put('wm_events', ev); known.events = idx(ev, function (x) { return x.id; });
    }));

    jobs.push(rows(sb.from('files').select('*').order('created_at', { ascending: true })).then(function (r) {
      if (!r) return;
      var f = r.map(function (x) { return { id: x.id, label: x.label, desc: x.descr, name: x.name, type: x.kind, size: x.size, date: x.file_date, url: x.url || undefined, path: x.path || undefined }; });
      put('wm_files', f); known.files = idx(f, function (x) { return x.id; });
    }));

    jobs.push(rows(sb.from('messages').select('*').order('created_at', { ascending: false }).limit(50)).then(function (r) {
      if (!r) return;
      var h = r.map(function (m) { return { id: m.id, type: m.type, audience: m.audience, msg: m.body, time: new Date(m.created_at).toLocaleString(), attachments: m.attachments || [] }; });
      put('wm_sent_history', h); known.history = idx(h, function (x) { return x.id; });
    }));

    jobs.push(rows(sb.from('settings').select('key,value')).then(function (r) {
      if (!r) return;
      var s = {}, map = {};
      r.forEach(function (x) { map[x.key] = x.value; });
      if (map.discord !== undefined) s.discord = map.discord || '';
      if (map.billing !== undefined) s.billing = map.billing || '';
      put('wm_settings', s);
      if (admin) ADMIN_KEYS.forEach(function (k) { if (map['ls:' + k] !== undefined && map['ls:' + k] !== null) put(k, map['ls:' + k]); });
      if (map.status !== undefined && map.status !== null) putRaw('mario_status', map.status);
      if (map.seats !== undefined && map.seats !== null) putRaw('wm_seats', map.seats);
    }));

    jobs.push(rows(sb.from('roster').select('user_id,week,status,points,cancel_requested,joined,profiles(name,email,discord,role)')).then(function (r) {
      if (!r) return;
      var m = r.filter(function (x) { return admin ? (x.profiles && x.profiles.role === 'member') : x.user_id === profile.id; }).map(function (x) {
        var p = x.profiles || {};
        return { userId: x.user_id, name: p.name || '', email: p.email || '', discord: p.discord || '', week: x.week, status: x.status, points: x.points, joined: x.joined, cancel: x.cancel_requested };
      });
      put('wm_members', m);
      known.roster = idx(m, function (x) { return x.userId; });
      known.rosterCmp = {}; m.forEach(function (x) { known.rosterCmp[x.userId] = x.status + '|' + x.week + '|' + x.points; });
    }));

    if (admin) {
      jobs.push(rows(sb.from('requests').select('*').order('created_at', { ascending: false }).limit(200)).then(function (r) {
        if (!r) return;
        var q = r.map(function (x) { return { id: x.id, type: x.type, detail: x.detail, name: x.name, email: x.email, discord: '', time: new Date(x.created_at).toLocaleString(), done: x.done }; });
        put('wm_requests', q); known.requests = {}; q.forEach(function (x) { known.requests[x.id] = x.done; });
      }));
    }
    return Promise.all(jobs).then(function () { try { window.dispatchEvent(new Event('wm-synced')); } catch (e) {} });
  };

  Cloud.poll = function (fn, ms) {
    function tick() { if (document.hidden) return; Cloud.pull().then(function () { try { fn(); } catch (e) { console.warn(e); } }); }
    setInterval(tick, ms || 20000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  };

  /* ── push: admin localStorage writes → database ── */
  function ev2row(e) { return { id: e.id, date: e.date, sess_type: e.sessType, label: e.sessTypeLabel || '', instruments: e.instruments || [], start_time: e.start || '', end_time: e.end || '', notes: e.notes || '' }; }

  var HANDLERS = {
    wm_events: function (v) {
      var arr = JSON.parse(v), cur = idx(arr, function (x) { return x.id; });
      var up = arr.filter(function (x) { return known.events[x.id] !== cur[x.id]; }).map(ev2row);
      var del = Object.keys(known.events).filter(function (id) { return !(id in cur); });
      var jobs = [];
      if (up.length) jobs.push(sb.from('events').upsert(up));
      if (del.length) jobs.push(sb.from('events').delete().in('id', del));
      return Promise.all(jobs).then(function (rs) { if (rs.some(function (r) { return r.error; })) throw new Error('events'); known.events = cur; });
    },
    wm_files: function (v) {
      var arr = JSON.parse(v), cur = idx(arr, function (x) { return x.id; });
      var added = arr.filter(function (x) { return !(x.id in known.files) && !x.data; });
      var gone = Object.keys(known.files).filter(function (id) { return !(id in cur); });
      var jobs = [];
      if (added.length) jobs.push(sb.from('files').insert(added.map(function (x) { return { id: x.id, label: x.label || '', descr: x.desc || '', name: x.name || '', kind: x.type || 'file', size: x.size || '', file_date: x.date, url: x.url || null, path: x.path || null }; })));
      if (gone.length) {
        var paths = gone.map(function (id) { return JSON.parse(known.files[id]).path; }).filter(Boolean);
        jobs.push(sb.from('files').delete().in('id', gone));
        if (paths.length) jobs.push(sb.storage.from('member-files').remove(paths));
      }
      return Promise.all(jobs).then(function (rs) { if (rs.some(function (r) { return r && r.error; })) throw new Error('files'); known.files = cur; });
    },
    wm_sent_history: function (v) {
      var arr = JSON.parse(v);
      var added = arr.filter(function (x) { return x.id && !(x.id in known.history); });
      if (!added.length) return Promise.resolve();
      return sb.from('messages').insert(added.map(function (x) { return { id: x.id, type: x.type, audience: x.audience, body: x.msg, attachments: (x.attachments || []).map(function (a) { return { name: a.name, size: a.size, path: a.path }; }) }; }))
        .then(function (r) { if (r.error) throw new Error('messages'); added.forEach(function (x) { known.history[x.id] = JSON.stringify(x); }); });
    },
    wm_settings: function (v) {
      var s = JSON.parse(v);
      return sb.from('settings').upsert([{ key: 'discord', value: s.discord || '', visibility: 'members' }, { key: 'billing', value: s.billing || '', visibility: 'members' }])
        .then(function (r) { if (r.error) throw new Error('settings'); });
    },
    mario_status: function (v) {
      return sb.from('settings').upsert([{ key: 'status', value: v === 'offline' ? 'offline' : 'live', visibility: 'public' }]).then(function (r) { if (r.error) throw new Error('status'); });
    },
    wm_seats: function (v) {
      return sb.from('settings').upsert([{ key: 'seats', value: parseInt(v, 10) || 12, visibility: 'public' }]).then(function (r) { if (r.error) throw new Error('seats'); });
    },
    wm_members: function (v) {
      var arr = JSON.parse(v), seen = {}, jobs = [];
      arr.forEach(function (m) {
        if (!m.userId) return; seen[m.userId] = 1;
        var cmp = m.status + '|' + m.week + '|' + m.points;
        if (known.rosterCmp && known.rosterCmp[m.userId] !== cmp) {
          jobs.push(sb.from('roster').update({ status: m.status, week: m.week, points: m.points }).eq('user_id', m.userId).then(function (r) { if (r.error) throw new Error('roster'); known.rosterCmp[m.userId] = cmp; }));
        }
      });
      Object.keys(known.rosterCmp || {}).forEach(function (id) {
        if (!seen[id]) jobs.push(sb.from('roster').delete().eq('user_id', id).then(function (r) { if (r.error) throw new Error('roster'); delete known.rosterCmp[id]; }));
      });
      return Promise.all(jobs);
    },
    wm_requests: function (v) {
      var arr = JSON.parse(v), jobs = [];
      arr.forEach(function (q) {
        if (q.done && known.requests[q.id] === false) jobs.push(sb.from('requests').update({ done: true }).eq('id', q.id).then(function (r) { if (r.error) throw new Error('requests'); known.requests[q.id] = true; }));
      });
      return Promise.all(jobs);
    }
  };

  ADMIN_KEYS.forEach(function (k) {
    HANDLERS[k] = function (v) {
      var val; try { val = JSON.parse(v); } catch (e) { return Promise.resolve(); }
      return sb.from('settings').upsert([{ key: 'ls:' + k, value: val, visibility: 'members' }]).then(function (r) { if (r.error) throw new Error(k); });
    };
  });

  var timers = {};
  Storage.prototype.setItem = function (k, v) {
    rawSet.apply(this, arguments);
    if (suppress || this !== window.localStorage || !profile || profile.role !== 'admin' || !HANDLERS[k]) return;
    clearTimeout(timers[k]);
    timers[k] = setTimeout(function () {
      var val = localStorage.getItem(k);
      Promise.resolve().then(function () { return HANDLERS[k](val); }).catch(function (e) { fail('Could not save ' + (e && e.message || k) + ' to the server. Check your connection and try again.'); });
    }, 250);
  };

  /* ── helpers used by pages ── */
  Cloud.rpc = function (name, args) { return sb.rpc(name, args || {}); };
  Cloud.submitLead = function (o) {
    return sb.from('requests').insert({ type: o.type, name: (o.name || '').slice(0, 100), email: (o.email || '').slice(0, 200), detail: (o.detail || '').slice(0, 500) })
      .then(function (r) { return r.error ? { ok: false, error: 'Could not send. Please try again.' } : { ok: true }; }, function () { return { ok: false, error: 'Could not send. Please try again.' }; });
  };
  Cloud.upload = function (file) {
    var safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80), path = Date.now() + '-' + safe;
    return sb.storage.from('member-files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }).then(function (r) {
      return r.error ? { ok: false, error: r.error.message } : { ok: true, path: path };
    });
  };
  Cloud.openFile = function (path) {
    var w = window.open('', '_blank');
    return sb.storage.from('member-files').createSignedUrl(path, 300).then(function (r) {
      if (r.error || !r.data) { if (w) w.close(); fail('Could not open that file.'); return; }
      if (w) w.location.href = r.data.signedUrl; else window.location.href = r.data.signedUrl;
    });
  };
})();
