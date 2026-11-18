// The contact page of the new site (/homepage/contact/).
// With contact_form_url set in _config.yml the form posts to that URL and this script only writes the
// subject of the email from the About list and the company.
// Without it the form sends nothing itself: the fields are written into a mailto: link, the visitor's
// mail program opens with the message filled in, and the visitor sends it. The same text is shown on
// the page with a Copy button, for a visitor whose browser has no mail program to open.
(function () {
  'use strict';

  var form = document.getElementById('contact-form');
  if (!form) { return; }

  var about = form.elements.about;

  // /homepage/contact/?about=Demo selects that entry of the About list.
  var requested = new URLSearchParams(window.location.search).get('about');
  for (var i = 0; i < about.options.length; i++) {
    if (about.options[i].text === requested) { about.selectedIndex = i; }
  }

  function subject() {
    var company = form.elements.company.value.trim();
    return company ? about.value + ': ' + company : about.value;
  }

  if (form.elements._subject) {
    form.addEventListener('submit', function () { form.elements._subject.value = subject(); });
    return;
  }

  var error = document.getElementById('contact-error');
  var result = document.getElementById('contact-result');
  var text = document.getElementById('contact-text');
  var status = document.getElementById('contact-status');

  function body() {
    var lines = ['Name: ' + form.elements.name.value.trim()];
    var company = form.elements.company.value.trim();
    if (company) { lines.push('Company: ' + company); }
    lines.push('About: ' + about.value, '', form.elements.message.value.trim().replace(/\r?\n/g, '\r\n'));
    return lines.join('\r\n');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!form.checkValidity()) {
      error.hidden = false;
      form.querySelector(':invalid').focus();
      return;
    }
    error.hidden = true;
    text.textContent = 'Subject: ' + subject() + '\r\n\r\n' + body();
    status.textContent = '';
    result.hidden = false;
    window.location.href = 'mailto:' + form.dataset.to +
        '?subject=' + encodeURIComponent(subject()) + '&body=' + encodeURIComponent(body());
  });

  document.getElementById('contact-copy').addEventListener('click', function () {
    navigator.clipboard.writeText(text.textContent).then(
        function () { status.textContent = 'Copied.'; },
        function () { status.textContent = 'The browser did not allow the copy. Select the text and copy it.'; });
  });
})();
