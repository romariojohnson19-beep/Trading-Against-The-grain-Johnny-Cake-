/* WMStore: storefront data for store.html, members.html (Library) and admin.html (Storefront).
   Cloud mode talks to Supabase tables products / product_delivery / purchases (supabase/store.sql).
   Demo mode (no Supabase keys) keeps everything in this browser only. */
(function () {
  var C = window.WM_CONFIG || {};
  function cloud() { return !!(window.WMCloud && WMCloud.enabled && WMCloud.client); }
  function sb() { return WMCloud.client; }
  function ls(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lw(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ok(r) { if (r && r.error) throw new Error(r.error.message || 'Database error'); return r ? r.data : null; }
  function user() { return window.WMAuth ? WMAuth.user() : null; }
  function clean(p) {
    return { id: String(p.id || '').trim(), kind: p.kind || 'other', title: String(p.title || '').trim().slice(0, 120), blurb: String(p.blurb || '').slice(0, 600),
      price_label: String(p.price_label || '').slice(0, 40), badge: String(p.badge || '').slice(0, 30), buy_url: String(p.buy_url || '').trim().slice(0, 400),
      payment_link: String(p.payment_link || '').trim().slice(0, 80), sort: parseInt(p.sort, 10) || 100, active: p.active !== false };
  }
  function slug(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || ('item-' + Date.now()); }

  var S = {
    cloud: cloud, slug: slug,
    ready: function () { return window.WMAuth ? WMAuth.ready() : Promise.resolve(); },

    /* Public catalog (active products only). The book falls back to config.js links.ebook until you set its link in Admin. */
    list: function () {
      var p = cloud() ? sb().from('products').select('*').eq('active', true).order('sort').then(ok) : Promise.resolve((ls('wm_products', []) || []).filter(function (x) { return x.active !== false; }));
      return p.then(function (rows) {
        rows = (rows || []).slice().sort(function (a, b) { return (a.sort || 100) - (b.sort || 100); });
        rows.forEach(function (r) { if (!r.buy_url && r.id === 'book' && C.links && C.links.ebook) r.buy_url = C.links.ebook; if (!r.buy_url && r.id === 'book-bundle' && C.links && C.links.bundle) r.buy_url = C.links.bundle; });
        return rows;
      });
    },
    listAll: function () {
      return cloud() ? sb().from('products').select('*').order('sort').then(ok) : Promise.resolve(ls('wm_products', []));
    },
    save: function (p) {
      p = clean(p); if (!p.title) return Promise.reject(new Error('Give the product a title.'));
      if (!p.id) p.id = slug(p.title);
      if (cloud()) return sb().from('products').upsert(p).then(ok).then(function () { return p; });
      var all = ls('wm_products', []), i = all.findIndex(function (x) { return x.id === p.id; });
      if (i < 0) all.push(p); else all[i] = p; lw('wm_products', all); return Promise.resolve(p);
    },
    remove: function (id) {
      if (cloud()) return sb().from('products').delete().eq('id', id).then(ok);
      lw('wm_products', ls('wm_products', []).filter(function (x) { return x.id !== id; })); return Promise.resolve();
    },
    getDelivery: function (id) {
      if (cloud()) return sb().from('product_delivery').select('url,note').eq('product_id', id).maybeSingle().then(ok).then(function (r) { return r || { url: '', note: '' }; });
      return Promise.resolve(ls('wm_delivery', {})[id] || { url: '', note: '' });
    },
    saveDelivery: function (id, url, note) {
      if (cloud()) return sb().from('product_delivery').upsert({ product_id: id, url: String(url || '').slice(0, 600), note: String(note || '').slice(0, 1500) }).then(ok);
      var d = ls('wm_delivery', {}); d[id] = { url: url || '', note: note || '' }; lw('wm_delivery', d); return Promise.resolve();
    },

    /* What the signed-in member owns, with delivery details. */
    mine: function () {
      var u = user(); if (!u) return Promise.resolve([]);
      if (cloud()) {
        return sb().from('purchases').select('product_id,created_at,source,products(id,kind,title,blurb,badge)').eq('user_id', u.id).order('created_at', { ascending: false }).then(ok).then(function (rows) {
          rows = rows || [];
          return sb().from('product_delivery').select('product_id,url,note').in('product_id', rows.map(function (r) { return r.product_id; })).then(ok).then(function (dl) {
            var m = {}; (dl || []).forEach(function (d) { m[d.product_id] = d; });
            return rows.map(function (r) { var p = r.products || { id: r.product_id, title: r.product_id }; return { product: p, when: r.created_at, source: r.source, delivery: m[r.product_id] || { url: '', note: '' } }; });
          });
        });
      }
      var owned = ls('wm_purchases', []).filter(function (x) { return x.user_id === u.id; }), prods = ls('wm_products', []), del = ls('wm_delivery', {});
      return Promise.resolve(owned.map(function (o) { var p = prods.filter(function (x) { return x.id === o.product_id; })[0] || { id: o.product_id, title: o.product_id };
        return { product: p, when: o.created_at, source: o.source, delivery: del[o.product_id] || { url: '', note: '' } }; }));
    },
    ownedIds: function () { return S.mine().then(function (r) { return r.map(function (x) { return x.product.id; }); }); },

    /* Buy link tied to the signed-in account (Stripe returns client_reference_id to the webhook). */
    buyUrl: function (p) {
      var u = user(); if (!p.buy_url) return '';
      var sep = p.buy_url.indexOf('?') < 0 ? '?' : '&';
      return p.buy_url + (u ? sep + 'client_reference_id=' + encodeURIComponent(u.id) + '&prefilled_email=' + encodeURIComponent(u.email || '') : '');
    },

    /* Admin */
    purchases: function () {
      if (cloud()) return sb().from('purchases').select('id,created_at,source,product_id,user_id,products(title),profiles(name,email)').order('created_at', { ascending: false }).limit(300).then(ok);
      var us = (WMAuth.users && WMAuth.users()) || [];
      return Promise.resolve(ls('wm_purchases', []).map(function (o) { var u = us.filter(function (x) { return x.id === o.user_id; })[0] || {}; return { id: o.id, created_at: o.created_at, source: o.source, product_id: o.product_id, products: { title: o.product_id }, profiles: { name: u.name, email: u.email } }; }));
    },
    grant: function (email, productId) {
      email = String(email || '').trim().toLowerCase(); if (!email || !productId) return Promise.reject(new Error('Pick a product and enter the member email.'));
      if (cloud()) {
        return sb().from('profiles').select('id').eq('email', email).maybeSingle().then(ok).then(function (p) {
          if (!p) throw new Error('No account with that email yet. They need to sign up first.');
          return sb().from('purchases').upsert({ user_id: p.id, product_id: productId, source: 'admin' }, { onConflict: 'user_id,product_id' }).then(ok);
        });
      }
      var us = (WMAuth.users && WMAuth.users()) || [], u = us.filter(function (x) { return x.email === email; })[0];
      if (!u) return Promise.reject(new Error('No account with that email in this browser.'));
      var all = ls('wm_purchases', []); if (!all.some(function (x) { return x.user_id === u.id && x.product_id === productId; })) all.push({ id: 'p' + Date.now(), user_id: u.id, product_id: productId, source: 'admin', created_at: new Date().toISOString() });
      lw('wm_purchases', all); return Promise.resolve();
    },
    revoke: function (id) {
      if (cloud()) return sb().from('purchases').delete().eq('id', id).then(ok);
      lw('wm_purchases', ls('wm_purchases', []).filter(function (x) { return x.id !== id; })); return Promise.resolve();
    }
  };
  window.WMStore = S;
})();
