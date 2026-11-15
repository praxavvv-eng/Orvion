// js/nav.js – bottom navigation engine (classic script, loaded right after the <nav class="dock"> markup)
//
// One navigation component, four visual styles. Styles are pure CSS keyed on `data-nav` (native | liquid |
// floating | cinematic); this script only
//   • applies the saved style to the real dock before first paint,
//   • positions the sliding active indicator (CSS variables, so every style can shape it differently),
//   • animates style switches (the indicator is re-measured every frame while the dock morphs),
//   • builds small interactive previews for Settings.
// Routing is untouched: the dock items stay ordinary links.
(function () {
  'use strict';
  var root = document.documentElement;
  var docks = [];

  var STYLES = [
    { value: 'native', label: 'Native', note: 'Classic tab bar' },
    { value: 'liquid', label: 'Liquid Glass', note: 'Floating glass' },
    { value: 'floating', label: 'Minimal', note: 'Compact floating' },
    { value: 'cinematic', label: 'Cinematic', note: 'Wide glass' }
  ];

  function currentStyle() {
    return root.getAttribute('data-nav') || 'liquid';
  }

  function mount(nav, options) {
    if (!nav || nav.__orvionNav) return nav && nav.__orvionNav;
    var opts = options || {};
    var indicator = document.createElement('span');
    indicator.className = 'dock-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    nav.insertBefore(indicator, nav.firstChild);
    nav.classList.add('no-anim');
    if (!opts.fixedStyle) nav.setAttribute('data-nav', currentStyle());

    var raf = 0;
    var until = 0;

    function active() {
      return nav.querySelector('.dock-item[aria-current="page"]');
    }

    function place() {
      var item = active();
      if (!item) { indicator.style.opacity = '0'; return; }
      var n = nav.getBoundingClientRect();
      var r = item.getBoundingClientRect();
      if (!n.width) return;
      indicator.style.setProperty('--cx', (r.left - n.left + r.width / 2).toFixed(1) + 'px');
      indicator.style.setProperty('--cy', (r.top - n.top + r.height / 2).toFixed(1) + 'px');
      indicator.style.setProperty('--iw', r.width.toFixed(1) + 'px');
      indicator.style.setProperty('--ih', r.height.toFixed(1) + 'px');
      indicator.style.opacity = '';
    }

    // Keep measuring while the dock morphs (CSS transitions) so the indicator never lags behind its item.
    function track(ms) {
      until = performance.now() + ms;
      if (raf) return;
      (function frame() {
        place();
        raf = performance.now() < until ? requestAnimationFrame(frame) : 0;
      })();
    }

    var api = { nav: nav, place: place, track: track };
    nav.__orvionNav = api;
    place();
    requestAnimationFrame(function () { place(); requestAnimationFrame(function () { nav.classList.remove('no-anim'); }); });
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(nav);
    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);
    if (!opts.preview) docks.push(api);
    return api;
  }

  /** Apply a style to every real dock (and remember it). Animated by CSS; the indicator follows. */
  function setStyle(name) {
    if (window.OrvionTheme) window.OrvionTheme.save({ nav: name });
    else root.setAttribute('data-nav', name);
  }

  window.addEventListener('orvion:appearance', function (e) {
    var style = (e.detail && e.detail.nav) || currentStyle();
    docks.forEach(function (d) {
      if (d.nav.getAttribute('data-nav') !== style) {
        d.nav.setAttribute('data-nav', style);
        d.track(900);
      }
    });
  });

  /** A small working dock for the Settings preview: same markup + CSS as the real one, tappable. */
  function createPreview(styleName) {
    var real = document.querySelector('nav.dock:not(.dock-preview)');
    var nav = document.createElement('nav');
    nav.className = 'dock dock-preview';
    nav.setAttribute('aria-hidden', 'true');
    nav.setAttribute('data-nav', styleName || currentStyle());
    var source = real ? Array.prototype.slice.call(real.querySelectorAll('.dock-item')) : [];
    source.forEach(function (item, i) {
      var clone = document.createElement('span');
      clone.className = 'dock-item';
      clone.innerHTML = item.innerHTML;
      if (i === 0) clone.setAttribute('aria-current', 'page');
      nav.appendChild(clone);
    });
    var api = null;
    nav.addEventListener('click', function (e) {
      var item = e.target.closest('.dock-item');
      if (!item || !nav.contains(item)) return;
      nav.querySelectorAll('.dock-item').forEach(function (n) { n.removeAttribute('aria-current'); });
      item.setAttribute('aria-current', 'page');
      if (api) api.track(700);
    });
    return {
      node: nav,
      mount: function () { api = mount(nav, { preview: true, fixedStyle: true }); return api; },
      setStyle: function (name) { nav.setAttribute('data-nav', name); if (api) api.track(900); }
    };
  }

  // Top bar gets a material background once the page scrolls.
  function watchScroll() {
    var bar = document.querySelector('.topbar');
    if (!bar) return;
    var queued = false;
    function update() { queued = false; bar.classList.toggle('scrolled', window.scrollY > 12); }
    window.addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  // Leaving a page: fade the content out first (the dock stays), then follow the link. Keyboard/modified clicks are untouched.
  function bindLeave(nav) {
    nav.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a.dock-item');
      if (!link || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.getAttribute('aria-current') === 'page') { e.preventDefault(); window.scrollTo({ top: 0, behavior: root.getAttribute('data-motion') === 'off' ? 'auto' : 'smooth' }); return; }
      if (root.getAttribute('data-motion') === 'off') return;
      e.preventDefault();
      document.body.classList.add('is-leaving');
      setTimeout(function () { window.location.href = link.href; }, 130);
    });
  }
  window.addEventListener('pageshow', function (e) { if (e.persisted) document.body.classList.remove('is-leaving'); });

  var real = document.querySelector('nav.dock');
  if (real) { mount(real); bindLeave(real); }
  watchScroll();

  window.OrvionNav = { STYLES: STYLES, mount: mount, setStyle: setStyle, current: currentStyle, createPreview: createPreview };
})();
