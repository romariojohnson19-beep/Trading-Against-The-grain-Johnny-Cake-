/* WMLive: on-site live room (stream embed + per-session chat).
   Cloud mode: Supabase (settings key 'live_stream', table live_messages from supabase/live.sql). Demo mode: this browser only. */
(function () {
  function cloud() { return !!(window.WMCloud && WMCloud.enabled && WMCloud.client); }
  function sb() { return WMCloud.client; }
  function ls(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lw(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ok(r) { if (r && r.error) throw new Error(r.error.message || 'Database error'); return r ? r.data : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function me() { return window.WMAuth ? WMAuth.user() : null; }
  var EMPTY = { live: false, id: '', title: '', url: '', started: '' };

  function ytEmbed(u) {
    u = String(u || '').trim(); var m;
    if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/))) return 'https://www.youtube-nocookie.com/embed/' + m[1] + '?autoplay=1&rel=0&modestbranding=1';
    return '';
  }

  var L = {
    ytEmbed: ytEmbed,
    canChat: function () {
      var u = me(); if (!u) return false; if (u.role === 'admin') return true;
      var r = WMAuth.rosterEntry ? WMAuth.rosterEntry() : null; return !!(r && (r.status === 'active' || r.status === 'trial'));
    },
    getStream: function () {
      if (cloud()) return sb().from('settings').select('value').eq('key', 'live_stream').maybeSingle().then(ok).then(function (r) { return Object.assign({}, EMPTY, r && r.value); });
      return Promise.resolve(Object.assign({}, EMPTY, ls('wm_live_stream', {})));
    },
    setStream: function (o) {
      o = Object.assign({}, EMPTY, o);
      if (cloud()) return sb().from('settings').upsert({ key: 'live_stream', value: o, visibility: 'members' }).then(ok).then(function () { return o; });
      lw('wm_live_stream', o); return Promise.resolve(o);
    },
    goLive: function (title, url) {
      return L.setStream({ live: true, id: 'L' + Date.now().toString(36), title: String(title || 'Live session').slice(0, 80), url: String(url || '').trim().slice(0, 300), started: new Date().toISOString() });
    },
    endLive: function () { return L.getStream().then(function (s) { s.live = false; return L.setStream(s); }); },

    messages: function (sid) {
      if (!sid) return Promise.resolve([]);
      if (cloud()) return sb().from('live_messages').select('id,author_name,body,is_host,pinned,created_at').eq('session_id', sid).order('created_at', { ascending: true }).limit(200).then(ok);
      return Promise.resolve(ls('wm_live_msgs', []).filter(function (m) { return m.session_id === sid; }));
    },
    post: function (sid, body) {
      var u = me(); body = String(body || '').trim().slice(0, 500);
      if (!u || !body || !sid) return Promise.reject(new Error('Nothing to send.'));
      if (!L.canChat()) return Promise.reject(new Error('Chat is for seat holders.'));
      var row = { session_id: sid, user_id: u.id, author_name: (u.name || 'Member').slice(0, 100), body: body, is_host: u.role === 'admin' };
      if (cloud()) return sb().from('live_messages').insert(row).then(ok);
      var all = ls('wm_live_msgs', []); row.id = 'm' + Date.now() + Math.random().toString(36).slice(2, 5); row.pinned = false; row.created_at = new Date().toISOString(); all.push(row); lw('wm_live_msgs', all.slice(-300)); return Promise.resolve();
    },
    pin: function (id, v) {
      if (cloud()) return sb().from('live_messages').update({ pinned: !!v }).eq('id', id).then(ok);
      lw('wm_live_msgs', ls('wm_live_msgs', []).map(function (m) { if (m.id === id) m.pinned = !!v; return m; })); return Promise.resolve();
    },
    del: function (id) {
      if (cloud()) return sb().from('live_messages').delete().eq('id', id).then(ok);
      lw('wm_live_msgs', ls('wm_live_msgs', []).filter(function (m) { return m.id !== id; })); return Promise.resolve();
    },

    /* Chat widget. opts: {admin:bool, getSession:fn->id, seatUrl:string} */
    mountChat: function (root, opts) {
      opts = opts || {}; var last = '', timer = null, sid = '';
      root.innerHTML = '<div class="lc-pins"></div><div class="lc-list" role="log" aria-live="polite"></div><form class="lc-form"><input class="lc-in" maxlength="500" autocomplete="off" placeholder="Say something about this live…"><button class="lc-send" type="submit">Send</button></form><div class="lc-note"></div>';
      var pins = root.querySelector('.lc-pins'), list = root.querySelector('.lc-list'), form = root.querySelector('.lc-form'), inp = root.querySelector('.lc-in'), note = root.querySelector('.lc-note');
      function time(t) { try { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
      function row(m) {
        return '<div class="lc-m' + (m.is_host ? ' host' : '') + '"><div class="lc-h"><b>' + esc(m.author_name || 'Member') + '</b>' + (m.is_host ? '<span class="lc-tag">HOST</span>' : '') + '<span class="lc-t">' + time(m.created_at) + '</span>' +
          (opts.admin ? '<span class="lc-adm"><button type="button" data-pin="' + esc(m.id) + '" data-v="' + (m.pinned ? 0 : 1) + '">' + (m.pinned ? 'Unpin' : 'Pin') + '</button><button type="button" data-del="' + esc(m.id) + '">Delete</button></span>' : '') + '</div><div class="lc-b">' + esc(m.body) + '</div></div>';
      }
      function draw(msgs) {
        var sig = msgs.map(function (m) { return m.id + (m.pinned ? 'p' : ''); }).join(',') + '|' + sid; if (sig === last) return; last = sig;
        var atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        var pinned = msgs.filter(function (m) { return m.pinned; });
        pins.innerHTML = pinned.length ? pinned.map(function (m) { return '<div class="lc-pin">📌 ' + row(m).replace('class="lc-m', 'class="lc-m') + '</div>'; }).join('') : '';
        list.innerHTML = msgs.length ? msgs.map(row).join('') : '<div class="lc-empty">No comments yet. Be the first.</div>';
        if (atEnd) list.scrollTop = list.scrollHeight;
      }
      function tick() {
        sid = (opts.getSession && opts.getSession()) || '';
        var can = L.canChat() && !!sid;
        form.style.display = can ? 'flex' : 'none';
        note.innerHTML = !sid ? 'Chat opens when the live starts.' : !L.canChat() ? 'You can watch and read along. Commenting is for seat holders.' + (opts.seatUrl ? ' <a href="' + esc(opts.seatUrl) + '" target="_blank" rel="noopener">Get a seat</a>' : '') : '';
        return L.messages(sid).then(draw).catch(function () {});
      }
      form.addEventListener('submit', function (e) { e.preventDefault(); var v = inp.value; if (!v.trim()) return; inp.value = ''; L.post(sid, v).then(tick).catch(function (er) { note.textContent = er.message; }); });
      root.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.pin) L.pin(b.dataset.pin, b.dataset.v === '1').then(tick);
        if (b.dataset.del && confirm('Delete this comment?')) L.del(b.dataset.del).then(tick);
      });
      tick(); timer = setInterval(tick, 4000);
      return { refresh: tick, stop: function () { clearInterval(timer); } };
    },
    css: '.lc-wrap{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:14px;background:var(--panel);overflow:hidden}.lc-list{height:340px;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px}.lc-m{font-size:13.5px;line-height:1.45}.lc-h{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.lc-h b{font-weight:600}.lc-t{color:var(--muted);font-size:11px}.lc-tag{font-size:9px;font-weight:700;letter-spacing:.08em;padding:2px 6px;border-radius:99px;background:var(--accent);color:var(--on-accent,#06130C)}.lc-m.host .lc-b{color:var(--fg)}.lc-b{color:var(--fg);word-break:break-word}.lc-empty,.lc-note{color:var(--muted);font-size:12.5px;padding:8px 12px}.lc-note a{color:var(--accent)}.lc-form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}.lc-in{flex:1;min-width:0;background:var(--panel2,var(--bg));border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:var(--fg);font:inherit;font-size:14px}.lc-send{background:var(--accent);color:var(--on-accent,#06130C);border:0;border-radius:10px;padding:0 16px;font-weight:600;cursor:pointer}.lc-pins{border-bottom:1px solid var(--line)}.lc-pin{padding:8px 12px;background:var(--accent-dim,rgba(110,231,168,.08))}.lc-adm{margin-left:auto;display:flex;gap:6px}.lc-adm button{background:none;border:1px solid var(--line);color:var(--muted);border-radius:6px;font-size:11px;padding:1px 7px;cursor:pointer}'
  };
  var st = document.createElement('style'); st.textContent = L.css; document.head.appendChild(st);
  window.WMLive = L;
})();
