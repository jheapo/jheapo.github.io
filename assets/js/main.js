// Close the mobile nav after a link is tapped.
(function () {
  var toggle = document.getElementById('nav-toggle');
  if (!toggle) return;
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    a.addEventListener('click', function () { toggle.checked = false; });
  });
})();
