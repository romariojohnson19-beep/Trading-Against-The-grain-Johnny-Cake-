/* "Buy Johnny a cake": an optional tip link, shown only in the member portal.
   The admin pastes a Stripe "customer chooses what to pay" link; the card stays hidden until one is set. */
(function () {
  var KEY = 'cake_link', LS = 'wm_cake_link';
  function client() { var C = window.WMCloud; return (C && C.enabled && C.client) ? C.client : null; }
  function get() {
    var c = client();
    if (!c) { try { return Promise.resolve(localStorage.getItem(LS) || ''); } catch (e) { return Promise.resolve(''); } }
    return c.from('settings').select('value').eq('key', KEY).maybeSingle().then(function (r) { var v = r && r.data && r.data.value; return typeof v === 'string' ? v : ''; }, function () { return ''; });
  }
  function set(url) {
    url = (url || '').trim();
    if (url && !/^https:\/\/(buy|checkout|donate)\.stripe\.com\//.test(url)) return Promise.reject(new Error('Paste a Stripe payment link (https://buy.stripe.com/…).'));
    var c = client();
    if (!c) { localStorage.setItem(LS, url); return Promise.resolve(url); }
    return c.from('settings').upsert([{ key: KEY, value: url, visibility: 'public' }]).then(function (r) { if (r.error) throw new Error('Could not save. Are you signed in as admin?'); return url; });
  }
  window.WMCake = { get: get, set: set };
})();
