// Static pages (universities, demo): apply the colour theme the visitor chose anywhere on the site (gcm:theme, the
// same key the app uses), wire the theme buttons and the phone menu, and hide platform-only links on the static copy.
(function () {
  var root = document.documentElement;
  function apply(m) { if (m === 'light' || m === 'dark') root.setAttribute('data-theme', m); else root.removeAttribute('data-theme'); }
  function read() { try { return localStorage.getItem('gcm:theme') || 'system'; } catch (e) { return 'system'; } }
  apply(read());
  document.addEventListener('DOMContentLoaded', function () {
    var buttons = document.querySelectorAll('[data-theme-mode]');
    function mark(m) { buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-mode') === m)); }); }
    mark(read());
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { var m = b.getAttribute('data-theme-mode'); apply(m); try { localStorage.setItem('gcm:theme', m); } catch (e) {} mark(m); });
    });
    var nav = document.querySelector('.site-nav'), burger = document.querySelector('.site-burger');
    if (nav && burger) burger.addEventListener('click', function () { var open = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', String(open)); });
    // Sign-in and the legal pages only exist on the platform server, not on the GitHub Pages copy.
    if (/github\.io$/.test(location.hostname)) document.querySelectorAll('[data-platform]').forEach(function (el) { el.remove(); });
  });
})();
