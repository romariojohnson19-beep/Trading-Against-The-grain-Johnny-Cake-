/* Admin results form: log a pass or fail, edit the screenshot, see counters, delete entries. */
(function () {
  var R = window.WingmanResults, form = document.getElementById('wra-form');
  if (!R || !form) return;
  var msg = document.getElementById('wra-msg'), rowsEl = document.getElementById('wra-rows'), statsEl = document.getElementById('wra-stats'),
    preview = document.getElementById('wra-preview'), reedit = document.getElementById('wra-reedit'), original = null, chosen = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function say(t, ok) { msg.textContent = t; msg.className = 'wr-msg ' + (ok ? 'ok' : 'err'); }
  function banner() {
    var b = document.getElementById('wra-mode'); b.textContent = R.live ? 'Live: saving to your database. Only admin accounts can add or delete results.' : 'Demo mode: nothing is shared. Results stay in this browser only.';
    b.classList.toggle('demo', !R.live);
  }
  form.occurred_on.value = R.todayISO(); banner();
  function clearShot() { if (preview.src) URL.revokeObjectURL(preview.src); original = null; chosen = null; form.shot.value = ''; preview.removeAttribute('src'); preview.hidden = true; reedit.hidden = true; }
  function edit(file) {
    return window.WingmanEditor.open(file).then(function (out) {
      if (!out) { clearShot(); return; }
      if (preview.src) URL.revokeObjectURL(preview.src);
      original = file; chosen = out; preview.src = URL.createObjectURL(out); preview.hidden = false; reedit.hidden = false;
    }).catch(function (err) { clearShot(); say(err.message, false); });
  }
  form.shot.addEventListener('change', function () { var f = form.shot.files[0]; if (f) edit(f); else clearShot(); });
  reedit.addEventListener('click', function () { if (original) edit(original); });
  function refresh() {
    return R.list().then(function (rows) {
      var s = R.summarize(rows); statsEl.replaceChildren();
      [['This week', s.week], ['This month', s.month]].forEach(function (p) { var c = el('div', 'wr-card'); c.appendChild(el('h3', null, p[0])); c.appendChild(el('div', null, p[1].pass + ' passed · ' + p[1].fail + ' failed')); statsEl.appendChild(c); });
      rowsEl.replaceChildren();
      if (!rows.length) rowsEl.appendChild(el('p', 'wr-sub', 'Nothing logged yet. The public Results section stays hidden until you add one.'));
      rows.forEach(function (r) {
        var row = el('div', 'wr-row');
        if (r.image_url) { var i = el('img'); i.src = r.image_url; i.alt = ''; row.appendChild(i); }
        row.appendChild(el('span', 'wr-badge ' + r.result, r.result === 'pass' ? 'PASSED' : 'FAILED'));
        row.appendChild(el('div', 'grow', [r.firm, r.occurred_on, r.note].filter(Boolean).join(' · ')));
        var del = el('button', 'wr-btn danger', 'Delete'); del.type = 'button';
        del.addEventListener('click', function () {
          if (!confirm('Delete this result? Counters will update.')) return;
          R.remove(r).then(refresh).then(function () { say('Deleted.', true); }, function (e) { say(e.message, false); });
        });
        row.appendChild(del); rowsEl.appendChild(row);
      });
    });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault(); var btn = document.getElementById('wra-save'); btn.disabled = true; say('Saving…', true);
    var fd = new FormData(form);
    R.add({ result: fd.get('result'), firm: String(fd.get('firm') || '').trim(), occurred_on: fd.get('occurred_on'), note: String(fd.get('note') || '').trim() }, chosen)
      .then(function () { form.note.value = ''; clearShot(); return refresh(); })
      .then(function () { say('Saved. The public counters have updated.', true); })
      .catch(function (err) { say(err.message, false); })
      .then(function () { btn.disabled = false; });
  });
  window.WMResultsAdminRefresh = function () { banner(); return refresh().catch(function (e) { say(e.message, false); }); };
  refresh().catch(function (e) { say(e.message, false); });
})();
