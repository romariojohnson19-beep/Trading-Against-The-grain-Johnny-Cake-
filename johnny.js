/* Johnny Crow: small animation layer for the mascot. Decorative only.
   - [data-jc] blocks pop in when they scroll into view.
   - img.jc-bob / img.jc-sway idle gently while on screen.
   - img[data-jc-frames="a.webp,b.webp"] steps between poses like a flipbook, only while visible.
     Every frame is drawn at the same scale inside a fixed-size stage, so Johnny never changes size
     and nothing around him moves when the pose changes.
   Respects prefers-reduced-motion: no motion, the first pose simply shows. */
(function () {
  var root = document.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (!reduce) root.classList.add('jc-js');
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  function loaded(p) { return new Promise(function (r) { if (p.complete && p.naturalWidth) r(); else { p.onload = r; p.onerror = r; } }); }

  function flipbook(img) {
    var srcs = img.getAttribute('data-jc-frames').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (srcs.length < 2) return;
    var every = Math.max(2600, parseInt(img.getAttribute('data-jc-every'), 10) || 3000);
    var frames = srcs.map(function (s) { var p = new Image(); p.src = s; return p; });
    var host = img.closest('[data-jc]') || img;
    var i = 0, k = 0, stage = null;
    Promise.all(frames.map(loaded)).then(function () {
      if (frames.some(function (p) { return !p.naturalWidth; })) return;
      stage = document.createElement('span');
      stage.className = 'jc-stage';
      img.parentNode.insertBefore(stage, img);
      stage.appendChild(img);
      layout();
      window.addEventListener('resize', layout);
      setInterval(function () {
        if (document.hidden || !host.classList.contains('jc-on')) return;
        i = (i + 1) % frames.length;
        img.src = srcs[i];
        size();
      }, every);
    });
    function size() {
      var p = frames[i];
      img.style.width = (p.naturalWidth * k) + 'px';
      img.style.height = (p.naturalHeight * k) + 'px';
    }
    function layout() {
      // let the page's CSS size the first pose, then use that scale for every pose
      var keep = i; i = 0; img.src = srcs[0];
      img.style.width = ''; img.style.height = '';
      stage.style.width = ''; stage.style.height = '';
      img.classList.add('jc-measure');
      var h = img.getBoundingClientRect().height;
      img.classList.remove('jc-measure');
      if (!h) { i = keep; return; }
      k = h / frames[0].naturalHeight;
      var W = 0, H = 0;
      frames.forEach(function (p) { W = Math.max(W, p.naturalWidth * k); H = Math.max(H, p.naturalHeight * k); });
      stage.style.width = W + 'px';
      stage.style.height = H + 'px';
      i = keep; img.src = srcs[i]; size();
    }
  }

  function init() {
    var io = (!reduce && 'IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        e.target.classList.toggle('jc-on', e.isIntersecting);
        if (e.isIntersecting) e.target.classList.add('jc-in');
      });
    }, { threshold: 0.2 }) : null;
    each('[data-jc]', function (el) { if (io) io.observe(el); else el.classList.add('jc-in', 'jc-on'); });
    if (reduce) return;
    each('img[data-jc-frames]', flipbook);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
