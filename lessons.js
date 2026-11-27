/* Lessons library for the members portal. Data lives in lessons-data.js. */
(function () {
  var built = false, cur = 0, filter = 'all';
  var KINDS = { all: 'All', lesson: 'Johnny lessons', meme: 'POV memes', duo: 'Johnny vs Dæv', dav: 'Dæv solo' };
  var KIND_LABEL = { lesson: 'Johnny lesson', meme: 'POV meme', duo: 'Johnny vs Dæv', dav: 'Dæv solo' };
  var NARR = { johnny: 'Johnny narrates', dav: 'Dæv narrates', both: 'Johnny and Dæv' };
  var CAST = [
    { cls: 'jc', img: 'media/jc-point.webp', nm: 'Johnny Crow', rl: 'The teacher', tx: 'A Jamaican John Crow in a green hoodie. Patient. Waits for the confirmed entry and for the cake to come back to market.' },
    { cls: 'dv', img: 'media/dv-point.webp', nm: 'Dæv', rl: 'The devil on your shoulder', tx: 'Hot entries inside the zone, no confirmation. Wins sometimes, loses sometimes, always has an excuse. Higher risk, never stupid.' },
    { cls: '', img: 'media/npc-bull-cake.webp', nm: 'The bull bakers', rl: 'Demand', tx: 'They bake cakes: leave orders at levels they plan to come back to.' },
    { cls: '', img: 'media/npc-bear-cake.webp', nm: 'The bear bakers', rl: 'Supply', tx: 'Same idea from the other side. Red plaid, same aprons.' }
  ];
  var GLOSS = [
    ['Bull cake / bear cake', 'Demand / supply zone: unfilled orders left behind'],
    ['The launch', 'The impulse move away from a zone. No launch, no cake.'],
    ['Hot / cold cake', 'Fresh / used-up zone. Each return takes a bite.'],
    ['Eaten', 'A candle closed through the zone, so the idea is over'],
    ['Golden window', '61.8 to 78.6% retracement of the big move'],
    ['Stops below equal lows', 'Liquidity. Price sweeps it, then makes the real move.']
  ];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function data() { return window.WM_LESSONS || []; }
  function key() { var u = null; try { u = window.WMAuth && WMAuth.user(); } catch (e) {} return 'wm_lessons_seen_' + (u && (u.id || u.email) || 'anon'); }
  function seen() { try { return JSON.parse(localStorage.getItem(key()) || '{}'); } catch (e) { return {}; } }
  function mark(id, on) { var s = seen(); if (on) s[id] = 1; else delete s[id]; try { localStorage.setItem(key(), JSON.stringify(s)); } catch (e) {} }
  function mmss(n) { return Math.floor(n / 60) + ':' + ('0' + (n % 60)).slice(-2); }
  function visible() { return data().filter(function (l) { return filter === 'all' || l.kind === filter; }); }

  function build() {
    var root = $('lessons-root'); if (!root || built) return; built = true;
    var cast = CAST.map(function (c) {
      return '<div class="ls-char ' + c.cls + '"><img src="' + c.img + '" alt="' + esc(c.nm) + '" loading="lazy"><div class="nm">' + esc(c.nm) + '</div><div class="rl">' + esc(c.rl) + '</div><p>' + esc(c.tx) + '</p></div>';
    }).join('');
    var gloss = GLOSS.map(function (g) { return '<div class="ls-gr"><b>' + esc(g[0]) + '</b><span>' + esc(g[1]) + '</span></div>'; }).join('');
    root.innerHTML =
      '<div class="ls-note"><img src="media/jc-wave.webp" alt="Johnny Crow waving" width="110"><div class="ls-bubble">Pick a lesson. Watch it twice. Then draw it on your own chart tonight.<b>Johnny Crow</b></div></div>' +
      '<div class="ls-h"><h2>Now playing</h2><span id="ls-count"></span></div>' +
      '<div class="ls-player"><div class="ls-phone"><video id="ls-video" controls playsinline preload="metadata"></video></div>' +
      '<div class="ls-info"><div class="ls-kind"><span class="ls-dot" id="ls-dot"></span><span id="ls-kind"></span></div><h3 id="ls-title"></h3><p id="ls-sum"></p><div class="ls-terms" id="ls-terms"></div>' +
      '<div class="ls-actions"><button id="ls-prev" type="button">&larr; Prev</button><button id="ls-next" type="button">Next &rarr;</button><button id="ls-seen" type="button"></button></div>' +
      '<div class="ls-fine">Educational only. Not financial advice.</div></div></div>' +
      '<div class="ls-h"><h2>Library</h2><span id="ls-shown"></span></div><div class="ls-chips" id="ls-chips"></div><div class="ls-grid" id="ls-grid"></div>' +
      '<div class="ls-h"><h2>Meet the cast</h2></div><div class="ls-cast">' + cast + '</div>' +
      '<div class="ls-h"><h2>The Cake Market, translated</h2></div><div class="ls-gloss">' + gloss + '</div>' +
      '<div class="ls-disc">Educational only. Not financial advice. Examples are illustrations, not signals.</div>';
    $('ls-chips').innerHTML = Object.keys(KINDS).map(function (k) { return '<button type="button" class="ls-chip' + (k === 'all' ? ' on' : '') + '" data-k="' + k + '">' + KINDS[k] + '</button>'; }).join('');
    $('ls-chips').onclick = function (e) { var b = e.target.closest('.ls-chip'); if (!b) return; filter = b.getAttribute('data-k'); Array.prototype.forEach.call(document.querySelectorAll('.ls-chip'), function (c) { c.classList.toggle('on', c === b); }); grid(); };
    $('ls-grid').onclick = function (e) { var c = e.target.closest('.ls-card'); if (!c) return; select(+c.getAttribute('data-i'), true); };
    $('ls-prev').onclick = function () { step(-1); };
    $('ls-next').onclick = function () { step(1); };
    $('ls-seen').onclick = function () { var l = data()[cur]; mark(l.id, !seen()[l.id]); paint(); grid(); };
    $('ls-video').addEventListener('ended', function () { var l = data()[cur]; mark(l.id, true); paint(); grid(); });
    grid(); select(0, false);
  }

  function grid() {
    var s = seen(), idx = data(), html = '';
    idx.forEach(function (l, i) {
      if (filter !== 'all' && l.kind !== filter) return;
      html += '<button type="button" class="ls-card' + (i === cur ? ' cur' : '') + (s[l.id] ? ' seen' : '') + '" data-i="' + i + '">' +
        '<div class="pz"><img src="' + esc(l.poster) + '" alt="" loading="lazy"><span class="pl ls-dot ' + esc(l.narrator) + '"></span><span class="ok">&#10003;</span><span class="tm">' + mmss(l.secs) + '</span></div>' +
        '<div class="tt"><small>' + esc(KIND_LABEL[l.kind] || '') + '</small>' + esc(l.title) + '</div></button>';
    });
    $('ls-grid').innerHTML = html || '<div style="color:var(--muted);padding:1rem">Nothing here yet.</div>';
    $('ls-shown').textContent = visible().length + ' videos';
  }

  function paint() {
    var l = data()[cur], s = seen(), n = Object.keys(s).length;
    $('ls-kind').textContent = (KIND_LABEL[l.kind] || '') + '  ·  ' + (NARR[l.narrator] || '') + '  ·  ' + mmss(l.secs);
    $('ls-dot').className = 'ls-dot ' + l.narrator;
    $('ls-title').textContent = l.title; $('ls-sum').textContent = l.summary;
    $('ls-terms').innerHTML = (l.terms || []).map(function (t) { return '<div class="ls-term"><span class="ck">' + esc(t.cake) + '</span><span class="eq">=</span><span class="rt">' + esc(t.real) + '</span></div>'; }).join('');
    var b = $('ls-seen'); b.textContent = s[l.id] ? 'Watched ✓' : 'Mark as watched'; b.className = s[l.id] ? 'on' : '';
    $('ls-count').textContent = n + ' of ' + data().length + ' watched';
  }

  function select(i, play) {
    var l = data()[i]; if (!l) return; cur = i; var v = $('ls-video');
    v.pause(); v.poster = l.poster; v.src = l.video; v.load();
    paint(); grid();
    if (play) { var p = v.play(); if (p && p.catch) p.catch(function () {}); var box = document.querySelector('.ls-player'); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function step(d) { var vis = visible(), pos = vis.indexOf(data()[cur]); var nx = vis[(pos + d + vis.length) % vis.length]; if (nx) select(data().indexOf(nx), true); }

  window.WMLessons = {
    show: function () { build(); },
    pause: function () { var v = $('ls-video'); if (v) v.pause(); }
  };
})();
