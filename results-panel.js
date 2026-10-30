/* Public results panel. Fills #wingman-results; the section stays hidden until at least one result is logged. */
(function () {
  var R = window.WingmanResults, sec = document.getElementById('results');
  if (!R || !sec) return;
  var statsEl = document.getElementById('wr-stats'), galEl = document.getElementById('wr-gallery'), footEl = document.getElementById('wr-foot'), lb = document.getElementById('wr-lightbox');
  var rows = [], filter = 'all';
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtDate(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function statCard(label, s) {
    var card = el('div', 'wr-card'), total = s.pass + s.fail;
    card.appendChild(el('h3', null, label));
    var big = el('div', 'wr-attempts'); big.appendChild(el('b', null, String(total))); big.appendChild(el('span', null, 'attempted')); card.appendChild(big);
    var split = el('div', 'wr-split'); split.appendChild(el('span', 'pass', s.pass + ' passed')); split.appendChild(el('span', 'dot', '·')); split.appendChild(el('span', 'fail', s.fail + ' failed')); card.appendChild(split);
    var rate = el('div', 'wr-rate', total ? 'Pass rate ' + Math.round(s.pass / total * 100) + '%' : 'No results yet');
    if (total) { var bar = el('div', 'wr-bar'), fill = el('i'); fill.style.width = Math.round(s.pass / total * 100) + '%'; bar.appendChild(fill); rate.appendChild(bar); }
    card.appendChild(rate); return card;
  }
  function render() {
    var sum = R.summarize(rows);
    statsEl.replaceChildren(statCard('This week', sum.week), statCard('This month', sum.month), statCard('Lifetime', sum.all));
    var shots = rows.filter(function (r) { return r.image_url && (filter === 'all' || r.result === filter); });
    galEl.replaceChildren();
    if (!shots.length) galEl.appendChild(el('div', 'wr-empty', 'No screenshots here yet.'));
    shots.forEach(function (r) {
      var b = el('button', 'wr-shot'); b.type = 'button';
      var img = el('img'); img.src = r.image_url; img.loading = 'lazy';
      img.alt = (r.result === 'pass' ? 'Passed' : 'Failed') + ' evaluation screenshot, ' + fmtDate(r.occurred_on); b.appendChild(img);
      var meta = el('div', 'meta'); meta.appendChild(el('span', 'wr-badge ' + r.result, r.result === 'pass' ? 'PASSED' : 'FAILED'));
      meta.appendChild(el('div', null, [r.firm, fmtDate(r.occurred_on)].filter(Boolean).join(' · ')));
      if (r.note) meta.appendChild(el('div', null, r.note)); b.appendChild(meta);
      b.addEventListener('click', function () {
        document.getElementById('wr-lb-img').src = r.image_url; document.getElementById('wr-lb-img').alt = img.alt;
        document.getElementById('wr-lb-cap').textContent = [r.firm, fmtDate(r.occurred_on), r.note].filter(Boolean).join(' · ');
        lb.showModal();
      });
      galEl.appendChild(b);
    });
    footEl.textContent = 'Weeks run Monday to Sunday. Last result logged ' + fmtDate(rows[0].occurred_on) + '. These are individual results on my own accounts, not typical results and not a promise of yours. Trading involves substantial risk of loss.';
  }
  document.querySelectorAll('.wr-chip').forEach(function (c) {
    c.addEventListener('click', function () { filter = c.dataset.f; document.querySelectorAll('.wr-chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); }); render(); });
  });
  document.getElementById('wr-lb-close').addEventListener('click', function () { lb.close(); });
  lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
  R.list().then(function (r) { rows = r; if (!rows.length) return; sec.hidden = false; render(); }).catch(function () { /* stay hidden */ });
})();
