// Home page variants (/homepage/): the phone menu, the Products and Use cases menus,
// and (variant 3) the enlarged-screenshot dialog.
(function () {
  'use strict';

  var burger = document.querySelector('.v-burger');
  var menu = document.getElementById('v-menu');
  var subs = document.querySelectorAll('.v-sub');

  function closeMenu() {
    if (!burger) return;
    burger.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
  }

  function closeSubsExcept(keep) {
    for (var i = 0; i < subs.length; i++) {
      if (subs[i] !== keep) subs[i].open = false;
    }
  }

  if (burger) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') !== 'true';
      burger.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
    });
  }

  for (var i = 0; i < subs.length; i++) {
    subs[i].addEventListener('toggle', function (event) {
      if (event.target.open) closeSubsExcept(event.target);
    });
  }

  // A link in the menu was followed: close the open lists and the phone menu.
  menu.addEventListener('click', function (event) {
    if (event.target.closest('a')) {
      closeSubsExcept(null);
      closeMenu();
    }
  });

  document.addEventListener('click', function (event) {
    if (!event.target.closest('.v-sub')) closeSubsExcept(null);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var open = document.querySelector('.v-sub[open]');
    if (open) {
      open.open = false;
      open.querySelector('summary').focus();
    }
  });

  // First panel: one screenshot visible; the view slides to the next on a timer.
  // The timer waits while the pointer or keyboard focus is on the screenshots. It stops
  // for good once the visitor picks a screenshot with a dot, and it never starts for
  // visitors who have asked their system to reduce motion.
  function Slider(root) {
    var track = root.querySelector('.v-slider-track');
    var slides = track.children;
    var dots = root.querySelectorAll('.v-slider-dot');
    var interval = Number(root.getAttribute('data-interval'));
    var current = 0;
    var timer = null;
    var stopped = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var attended = false;

    function show(index) {
      current = (index + slides.length) % slides.length;
      track.style.transform = 'translateX(-' + (current * 100) + '%)';
      for (var i = 0; i < slides.length; i++) {
        slides[i].setAttribute('aria-hidden', String(i !== current));
        slides[i].querySelector('a').tabIndex = i === current ? 0 : -1;
        dots[i].setAttribute('aria-current', String(i === current));
      }
    }

    // The view stays put while a screenshot is open at full size.
    function advance() {
      if (document.querySelector('dialog[open]')) return;
      show(current + 1);
    }

    function schedule() {
      window.clearInterval(timer);
      timer = null;
      if (stopped || attended) return;
      timer = window.setInterval(advance, interval);
    }

    function attend(value) {
      return function () { attended = value; schedule(); };
    }

    function pick(index) {
      return function () { stopped = true; show(index); schedule(); };
    }

    for (var i = 0; i < dots.length; i++) {
      dots[i].addEventListener('click', pick(i));
    }
    root.addEventListener('mouseenter', attend(true));
    root.addEventListener('mouseleave', attend(false));
    root.addEventListener('focusin', attend(true));
    root.addEventListener('focusout', attend(false));

    show(0);
    schedule();
  }

  var sliderRoot = document.querySelector('.v-slider');
  if (sliderRoot) new Slider(sliderRoot);

  // Variant 3: open a screenshot at full size. Without the dialog, the link opens the image.
  var lightbox = document.getElementById('v-lightbox');
  if (!lightbox || typeof lightbox.showModal !== 'function') return;
  var lightboxImg = lightbox.querySelector('.v-lightbox-img');

  document.addEventListener('click', function (event) {
    var zoom = event.target.closest('.v-zoom');
    if (!zoom) return;
    event.preventDefault();
    lightboxImg.src = zoom.getAttribute('href');
    lightboxImg.alt = zoom.getAttribute('data-alt');
    lightbox.showModal();
  });

  // A click on the backdrop (outside the dialog's box) closes it.
  lightbox.addEventListener('click', function (event) {
    if (event.target !== lightbox) return;
    var box = lightbox.getBoundingClientRect();
    var inside = event.clientX >= box.left && event.clientX <= box.right &&
                 event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) lightbox.close();
  });
})();
