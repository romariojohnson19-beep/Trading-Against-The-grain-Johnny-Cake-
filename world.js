/* Builds the backdrop and the character floor. <div id="world-floor" data-cast="floor-boss,eddie,grumble" data-thief="1"></div> */
(function () {
  var NAMES = { 'floor-boss': 'big', stomper: 'big', grumble: 'big', boss: 'big', 'boss-tray': 'big', penny: '', 'penny-tray': '', eddie: '', blaze: '', chomp: 'sm', pip: 'sm', professor: '', rusty: '' };
  function add() {
    if (!document.querySelector('.w-bg')) { var b = document.createElement('div'); b.className = 'w-bg'; b.setAttribute('aria-hidden', 'true'); document.body.insertBefore(b, document.body.firstChild); }
    document.querySelectorAll('#world-floor,#world-floor2').forEach(build);
  }
  function build(f) {
    f.className = 'w-floor'; f.setAttribute('aria-hidden', 'true');
    var cast = (f.getAttribute('data-cast') || '').split(',').filter(Boolean), html = '<div class="w-row">';
    cast.forEach(function (n, i) { n = n.trim(); html += '<img class="w-c ' + (NAMES[n] || '') + '" src="media/world/' + n + '.webp" alt="" loading="lazy" decoding="async">'; });
    html += '</div>';
    if (f.getAttribute('data-thief')) html += '<img class="w-thief" src="media/world/thief-run.webp" alt="" loading="lazy" decoding="async">';
    f.innerHTML = html;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
