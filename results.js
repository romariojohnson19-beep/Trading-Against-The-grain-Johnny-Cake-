/* Challenge results: data layer.
 * One row per evaluation outcome (pass or fail, date, optional edited screenshot).
 * Week / month / lifetime counters are computed from the rows, so they roll over by themselves.
 * Live mode uses the site's own Supabase project (via WMCloud). Without it, demo mode keeps data in this browser only.
 */
(function () {
  var TABLE = 'eval_results', BUCKET = 'result-shots', LS_KEY = 'wingman_results_demo_v1';
  function client() { var C = window.WMCloud; return (C && C.enabled && C.client) ? C.client : null; }
  function live() { return !!client(); }

  function imageUrl(path) {
    if (!path) return null;
    var c = client();
    if (!c) return path; // demo mode stores a data URL directly
    return c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  function normalize(row) {
    return { id: row.id, result: row.result === 'pass' ? 'pass' : 'fail', firm: row.firm || '', occurred_on: row.occurred_on,
      note: row.note || '', image_path: row.image_path || null, image_url: imageUrl(row.image_path) };
  }
  function demoRows() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; } }

  // Shrink screenshots in demo mode so localStorage does not fill up.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { reject(new Error('Could not read that image')); };
      img.src = url;
    });
  }

  function list() {
    var c = client();
    if (!c) return Promise.resolve(demoRows().map(normalize));
    return c.from(TABLE).select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).then(function (r) {
      if (r.error) throw new Error('Could not load results. Has results.sql been run in Supabase?');
      return (r.data || []).map(normalize);
    });
  }

  function add(entry, file) {
    var c = client();
    var row = { result: entry.result === 'pass' ? 'pass' : 'fail', firm: entry.firm || null, occurred_on: entry.occurred_on, note: entry.note || null, image_path: null };
    if (!c) {
      return (file ? shrink(file) : Promise.resolve(null)).then(function (data) {
        row.image_path = data; row.id = String(Date.now()) + Math.random().toString(36).slice(2, 6); row.created_at = new Date().toISOString();
        var rows = demoRows(); rows.push(row); localStorage.setItem(LS_KEY, JSON.stringify(rows));
      });
    }
    var up = Promise.resolve();
    if (file) {
      var path = entry.occurred_on + '/' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '.jpg';
      up = c.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false }).then(function (r) {
        if (r.error) throw new Error('Screenshot upload failed. Are you signed in as admin?');
        row.image_path = path;
      });
    }
    return up.then(function () { return c.from(TABLE).insert(row); }).then(function (r) {
      if (r && r.error) throw new Error('Could not save the result. Are you signed in as admin?');
    });
  }

  function remove(item) {
    var c = client();
    if (!c) { localStorage.setItem(LS_KEY, JSON.stringify(demoRows().filter(function (x) { return x.id !== item.id; }))); return Promise.resolve(); }
    return c.from(TABLE).delete().eq('id', item.id).then(function (r) {
      if (r.error) throw new Error('Could not delete. Are you signed in as admin?');
      if (item.image_path) c.storage.from(BUCKET).remove([item.image_path]).then(function () {}, function () {});
    });
  }

  function parseDay(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  // Weeks start Monday (matches the Mon to Thu session schedule).
  function summarize(rows, now) {
    now = now || new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    var monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    var out = { week: { pass: 0, fail: 0 }, month: { pass: 0, fail: 0 }, all: { pass: 0, fail: 0 } };
    rows.forEach(function (r) {
      var d = parseDay(r.occurred_on), k = r.result === 'pass' ? 'pass' : 'fail';
      out.all[k]++; if (d >= monthStart) out.month[k]++; if (d >= weekStart) out.week[k]++;
    });
    return out;
  }
  function todayISO() { var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }

  window.WingmanResults = { get live() { return live(); }, list: list, add: add, remove: remove, summarize: summarize, todayISO: todayISO };
})();
