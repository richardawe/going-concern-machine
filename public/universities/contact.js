// The contact form on /universities/: sends to the platform's /api/contact, which emails it to us. On the static
// GitHub Pages copy there is no server, so the form is removed there (data-platform) and the email address stays.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('contact-form');
    if (!form) return;
    var status = form.querySelector('.form-status'), button = form.querySelector('button[type=submit]');
    function say(text, kind) { status.textContent = text; status.className = 'form-status' + (kind ? ' ' + kind : ''); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {};
      Array.prototype.forEach.call(form.elements, function (el) { if (el.name) data[el.name] = el.value; });
      var missing = Array.prototype.find.call(form.elements, function (el) { return el.required && !el.value.trim(); });
      if (missing) { say('Fill in every field, so we can reply.', 'bad'); missing.focus(); return; }
      button.disabled = true; say('Sending…');
      fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gcm': '1' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          if (r.ok) { form.reset(); say('Thanks. Your message is on its way, and we’ll reply soon.', 'good'); }
          else say(r.j.error || 'Your message couldn’t be sent. Email us at Richard.Awe@3d7tech.com instead.', 'bad');
        })
        .catch(function () { say('Your message couldn’t be sent. Email us at Richard.Awe@3d7tech.com instead.', 'bad'); })
        .then(function () { button.disabled = false; });
    });
  });
})();
