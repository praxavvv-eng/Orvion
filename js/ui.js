// js/ui.js – shared UI toolkit for Orvion (classic script, loaded after api.js)
//
// Everything that renders API/Firestore data uses DOM APIs (textContent / attributes),
// never string-built HTML, so titles and names cannot inject markup.
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reducedMotion = () => document.documentElement.getAttribute('data-motion') === 'off' ||
    (!document.documentElement.hasAttribute('data-motion') && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------------------------------------------------------------------------
  // Tiny DOM helper
  // ---------------------------------------------------------------------------
  /**
   * el('button', { class: 'btn', text: 'Save', attrs: { type: 'button' }, on: { click: fn } }, child1, child2)
   */
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    const p = props || {};
    if (p.class) node.className = p.class;
    if (p.text != null) node.textContent = p.text;
    if (p.attrs) {
      Object.keys(p.attrs).forEach((name) => {
        const value = p.attrs[name];
        if (value !== false && value != null) node.setAttribute(name, value === true ? '' : String(value));
      });
    }
    if (p.data) Object.keys(p.data).forEach((k) => { node.dataset[k] = String(p.data[k]); });
    if (p.on) Object.keys(p.on).forEach((evt) => node.addEventListener(evt, p.on[evt]));
    children.flat().forEach((child) => {
      if (child == null || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  // ---------------------------------------------------------------------------
  // Icons – one consistent 1.75px rounded stroke set (static, trusted markup)
  // ---------------------------------------------------------------------------
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    star: '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
    play: '<path d="M8.5 5.8v12.4L18.5 12z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    home: '<path d="M4.5 10.5L12 4.5l7.5 6V19a1 1 0 0 1-1 1H14v-5.5h-4V20H5.5a1 1 0 0 1-1-1z"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
    bookmark: '<path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    chevL: '<path d="M14.5 6l-6 6 6 6"/>',
    chevR: '<path d="M9.5 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5"/>',
    sliders: '<path d="M4 7h8M18 7h2M4 17h2M12 17h8"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
    download: '<path d="M12 4v11M7.5 11L12 15.5 16.5 11M5 19.5h14"/>',
    wifiOff: '<path d="M4 4l16 16M3 9.5a14 14 0 0 1 4.2-2.4M21 9.5a14 14 0 0 0-8.2-3.4M6.5 13.2a8.5 8.5 0 0 1 3.4-1.9M17.5 13.2a8.5 8.5 0 0 0-2.3-1.6M10 16.8a4 4 0 0 1 4 0M12 20h.01"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v5M12 16.2h.01"/>',
    film: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M8.5 5v14M15.5 5v14M4 9.5h4.5M4 14.5h4.5M15.5 9.5H20M15.5 14.5H20"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4M4 5v4h4M4 13a8 8 0 0 0 14.3 4M20 19v-4h-4"/>',
    list: '<path d="M8 6.5h11M8 12h11M8 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
    chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
    tv: '<rect x="3.5" y="6" width="17" height="11.5" rx="2.5"/><path d="M8.5 20.5h7M12 17.5v3M9 3l3 3 3-3"/>',
    trophy: '<path d="M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H5v1.5a3 3 0 0 0 3 3M16 6.5h3v1.5a3 3 0 0 1-3 3M12 13.5V17M8.5 20h7M10 17h4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
    undo: '<path d="M9 8H5V4M5.5 8A8 8 0 1 1 4 13"/>',
    sparkle: '<path d="M12 3.5l1.9 5.2 5.1 1.8-5.1 1.8L12 17.5l-1.9-5.2L5 10.5l5.1-1.8zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.2-.9-1.5-.9-2.6 0-1 .8-1.6 1.8-1.6H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.7 16.7 3.5 12 3.5zM7.5 12h.01M9.5 8h.01M14 7.5h.01"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    flag: '<path d="M6 20.5V4M6 5h11l-2 3.5L17 12H6"/>'
  };

  function icon(name, size) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 22));
    svg.setAttribute('height', String(size || 22));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('icon', 'icon-' + name);
    svg.innerHTML = ICONS[name] || ''; // static, trusted strings only
    return svg;
  }

  // ---------------------------------------------------------------------------
  // Category suggestion: TMDB only knows movie/tv, Orvion has movie/series/anime/kdrama.
  // ---------------------------------------------------------------------------
  function suggestCategory(type, lang, genres) {
    if (type !== 'tv') return 'movie';
    const ids = (Array.isArray(genres) ? genres : []).map((g) => (g && typeof g === 'object' ? g.id : g));
    if (lang === 'ko') return 'kdrama';
    if (lang === 'ja' && ids.indexOf(16) !== -1) return 'anime';
    return 'series';
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------------
  function formatNumber(value) {
    try { return new Intl.NumberFormat().format(Math.round(Number(value) || 0)); } catch (e) { return String(Math.round(Number(value) || 0)); }
  }
  function yearOf(item) {
    const date = (item && (item.release_date || item.first_air_date)) || '';
    const year = String(date).slice(0, 4);
    return /^\d{4}$/.test(year) ? year : '';
  }

  function ratingOf(item) {
    const value = Number(item && item.vote_average);
    return value > 0 ? value.toFixed(1) : '';
  }

  function typeOf(item, explicitType) {
    if (explicitType === 'movie' || explicitType === 'tv') return explicitType;
    if (item && item.media_type === 'tv') return 'tv';
    if (item && item.media_type === 'movie') return 'movie';
    return item && item.title ? 'movie' : 'tv';
  }

  function titleOf(item) {
    return String((item && (item.title || item.name)) || 'Untitled');
  }

  /** Poster URL as stored in Firestore (w500, same as the previous version). */
  function storedPoster(item) {
    return item && item.poster_path ? window.IMG_BASE + item.poster_path : '';
  }

  // ---------------------------------------------------------------------------
  // Progress visuals
  // ---------------------------------------------------------------------------
  /** <div class="bar-track"><i style="--p:42%"></i></div> */
  function progressBar(pct, options) {
    const value = Math.max(0, Math.min(100, Number(pct) || 0));
    const track = el('div', { class: 'bar-track' + (options && options.done ? ' done' : ''), attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(value) } });
    const fill = document.createElement('i');
    fill.style.setProperty('--p', value + '%');
    track.appendChild(fill);
    return track;
  }

  /** Circular progress. Returns { node, set(pct, done) }. */
  function ring(pct, size, labelText) {
    const C = 2 * Math.PI * 26;
    const node = el('div', { class: 'ring' });
    node.style.setProperty('--s', (size || 56) + 'px');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<circle class="ring-bg" cx="32" cy="32" r="26"/><circle class="ring-fg" cx="32" cy="32" r="26"/>';
    const label = el('span', { class: 'ring-label' });
    node.append(svg, label);
    function set(value, done, text) {
      const v = Math.max(0, Math.min(100, Number(value) || 0));
      node.classList.toggle('done', !!done);
      label.textContent = text != null ? text : Math.round(v) + '%';
      requestAnimationFrame(() => node.style.setProperty('--c', ((v / 100) * C).toFixed(2)));
    }
    set(pct, false, labelText);
    return { node, set };
  }

  // ---------------------------------------------------------------------------
  // Toast (single, polite live region). Optional action button.
  // ---------------------------------------------------------------------------
  let toastRegion = null;
  let toastTimer = null;
  let toastNode = null;

  function ensureToastRegion() {
    if (toastRegion && document.body.contains(toastRegion)) return toastRegion;
    toastRegion = el('div', { class: 'toast-region', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    document.body.appendChild(toastRegion);
    return toastRegion;
  }

  function dismissToast(node) {
    if (!node) return;
    node.classList.remove('show');
    setTimeout(() => { if (node.parentNode) node.remove(); }, 320);
    if (toastNode === node) toastNode = null;
  }

  /**
   * showToast('Saved', 'success' | 'error' | 'info', { duration, actionLabel, onAction })
   */
  function showToast(message, type, options) {
    const opts = options || {};
    const region = ensureToastRegion();
    clearTimeout(toastTimer);
    if (toastNode) dismissToast(toastNode);

    const toast = el('div', { class: 'toast ' + (type || 'success') });
    toast.appendChild(el('span', { class: 'toast-text', text: message }));
    if (opts.actionLabel && typeof opts.onAction === 'function') {
      toast.appendChild(el('button', {
        class: 'toast-action',
        text: opts.actionLabel,
        attrs: { type: 'button' },
        on: { click: () => { dismissToast(toast); opts.onAction(); } }
      }));
    }
    region.appendChild(toast);
    toastNode = toast;
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
    toastTimer = setTimeout(() => dismissToast(toast), opts.duration || (type === 'error' ? 4200 : 2400));
  }

  // ---------------------------------------------------------------------------
  // Modal manager – focus trap, Escape, backdrop click, scroll lock, focus restore
  // ---------------------------------------------------------------------------
  const modalStack = [];

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusableIn(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter((node) => node.offsetParent !== null || node === document.activeElement);
  }

  function syncBodyLock() {
    document.body.classList.toggle('modal-open', modalStack.length > 0);
  }

  function openModal(modal, options) {
    if (!modal) return;
    const opts = options || {};
    if (modalStack.some((entry) => entry.modal === modal)) return;
    modalStack.push({ modal, opener: document.activeElement, onClose: opts.onClose });
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('show');
    syncBodyLock();
    const target = (opts.initialFocus && modal.querySelector(opts.initialFocus)) || focusableIn(modal)[0] || modal;
    if (target === modal) modal.setAttribute('tabindex', '-1');
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  function closeModal(modal) {
    const index = modalStack.findIndex((entry) => entry.modal === modal);
    if (index === -1) return;
    const entry = modalStack.splice(index, 1)[0];
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    syncBodyLock();
    if (typeof entry.onClose === 'function') entry.onClose();
    const opener = entry.opener;
    if (opener && document.body.contains(opener) && typeof opener.focus === 'function') {
      opener.focus({ preventScroll: true }); // synchronous: focus never lingers on the hidden sheet
    }
  }

  function topModal() {
    return modalStack.length ? modalStack[modalStack.length - 1].modal : null;
  }

  /** Wire a modal root once: backdrop click closes it. */
  function bindModal(modal) {
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    modal.setAttribute('aria-hidden', 'true');
    let downOnBackdrop = false;
    modal.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === modal; });
    modal.addEventListener('click', (e) => {
      if (e.target === modal && downOnBackdrop) closeModal(modal);
      downOnBackdrop = false;
    });
  }

  document.addEventListener('keydown', (e) => {
    const modal = topModal();
    if (!modal) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(modal);
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusableIn(modal);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  });

  // ---------------------------------------------------------------------------
  // Bottom-sheet helpers shared by every module
  // ---------------------------------------------------------------------------
  let choiceSeq = 0;

  /** Accessible radio group rendered as tappable chips. */
  function choiceGroup(config) {
    const name = 'choice-' + (++choiceSeq);
    const fieldset = el('fieldset', { class: 'field' }, el('legend', { class: 'field-label', text: config.legend }));
    const grid = el('div', { class: 'choice-grid cols-' + (config.columns || 2) });
    const inputs = [];

    config.options.forEach((opt) => {
      const input = el('input', { attrs: { type: 'radio', name: name, value: opt.value } });
      input.checked = opt.value === config.value;
      input.addEventListener('change', () => { if (input.checked && config.onChange) config.onChange(opt.value); });
      inputs.push(input);

      const face = el('span', { class: 'choice-face' });
      if (opt.swatch) {
        const dot = el('span', { class: 'choice-swatch', attrs: { 'aria-hidden': 'true' } });
        dot.style.background = opt.swatch;
        face.appendChild(dot);
      }
      face.appendChild(el('span', { text: opt.label }));
      grid.appendChild(el('label', { class: 'choice' }, input, face));
    });

    fieldset.appendChild(grid);
    if (config.hint) fieldset.appendChild(el('p', { class: 'field-hint', text: config.hint }));
    return {
      node: fieldset,
      get value() {
        const checked = inputs.find((input) => input.checked);
        return checked ? checked.value : null;
      },
      set(value) {
        inputs.forEach((input) => { input.checked = input.value === value; });
      }
    };
  }

  /** Slider with a live value. config: { label, min, max, step, value, format(v), onInput(v), hint } */
  function rangeField(config) {
    const id = 'range-' + (++choiceSeq);
    const valueNode = el('span', { class: 'range-value' });
    const input = el('input', { class: 'range', attrs: { type: 'range', id: id, min: config.min, max: config.max, step: config.step || 1 } });
    const fmt = config.format || ((v) => String(v));
    function paint() {
      const pct = ((Number(input.value) - Number(config.min)) / (Number(config.max) - Number(config.min))) * 100;
      input.style.setProperty('--fill', pct + '%');
      valueNode.textContent = fmt(Number(input.value));
    }
    input.value = config.value;
    input.addEventListener('input', () => { paint(); if (config.onInput) config.onInput(Number(input.value)); });
    paint();
    const node = el('div', { class: 'range-field' },
      el('div', { class: 'range-head' }, el('label', { text: config.label, attrs: { for: id } }), valueNode),
      input,
      config.hint ? el('p', { class: 'field-hint', text: config.hint }) : null
    );
    return { node, set(value) { input.value = value; paint(); } };
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  /** Swipe the handle down to dismiss a bottom sheet (phones only; desktop sheets are centred dialogs). */
  function enableSheetDrag(root, sheet, handle) {
    let startY = 0;
    let dy = 0;
    let t0 = 0;
    let pid = null;
    let dragging = false;
    const phone = () => window.matchMedia('(max-width: 719px)').matches;

    handle.addEventListener('pointerdown', (e) => {
      if (!phone() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      dragging = true;
      pid = e.pointerId;
      startY = e.clientY;
      dy = 0;
      t0 = performance.now();
      try { handle.setPointerCapture(pid); } catch (err) { /* ignore */ }
      sheet.classList.add('dragging');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pid) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('dragging');
      const velocity = dy / Math.max(1, performance.now() - t0);
      if (dy > 120 || (velocity > 0.6 && dy > 40)) {
        closeModal(root);
        setTimeout(() => { sheet.style.transform = ''; }, 360);
      } else {
        sheet.style.transform = '';
      }
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** Create a modal root + sheet, attached to <body>. extraClass e.g. "details", "tracker", "settings". */
  function createSheetRoot(id, titleId, extraClass) {
    const root = el('div', { class: 'modal', attrs: { id: id, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId } });
    const sheet = el('div', { class: 'sheet ' + (extraClass || '') });
    const grab = el('span', { class: 'sheet-grab', attrs: { 'aria-hidden': 'true' } });
    sheet.appendChild(grab);
    root.appendChild(sheet);
    document.body.appendChild(root);
    bindModal(root);
    enableSheetDrag(root, sheet, grab);
    return { root, sheet };
  }

  // ---------------------------------------------------------------------------
  // "Already in your list" badges. The library snapshot is cached by js/watchlist.js; this only reads it.
  // ---------------------------------------------------------------------------
  const LIB_KEY = 'orvion:lib:v1';
  let savedIndex = null;

  function buildSavedIndex() {
    savedIndex = new Map();
    try {
      const cached = JSON.parse(localStorage.getItem(LIB_KEY) || 'null');
      if (cached && Array.isArray(cached.items)) {
        cached.items.forEach((entry) => {
          const type = entry.category === 'movie' ? 'movie' : 'tv';
          const key = type + ':' + entry.id;
          const raw = String(entry.status || '').toLowerCase();
          const status = raw === 'completed' ? 'watched' : (['plan', 'watching', 'watched', 'dropped'].indexOf(raw) !== -1 ? raw : 'plan');
          if (!savedIndex.has(key)) savedIndex.set(key, status);
        });
      }
    } catch (e) { /* corrupt or unavailable – badges simply don't show */ }
  }

  function savedStatus(id, type) {
    if (!savedIndex) buildSavedIndex();
    return savedIndex.get(type + ':' + id) || '';
  }

  const STATUS_ICON = { plan: 'bookmark', watching: 'play', watched: 'check', dropped: 'close' };
  const STATUS_TEXT = { plan: 'Plan to watch', watching: 'Watching', watched: 'Watched', dropped: 'Dropped' };

  function applySavedBadge(card) {
    const poster = card.querySelector('.card-poster');
    if (!poster) return;
    const status = savedStatus(card.dataset.id, card.dataset.type);
    let badge = poster.querySelector('.saved-badge');
    if (!status) { if (badge) badge.remove(); return; }
    if (badge && badge.dataset.status === status) return;
    if (badge) badge.remove();
    badge = el('span', { class: 'saved-badge', data: { status: status }, attrs: { role: 'img', 'aria-label': 'In your list: ' + STATUS_TEXT[status] } }, icon(STATUS_ICON[status], 15));
    poster.appendChild(badge);
  }

  function decorateSaved(scope) {
    (scope || document).querySelectorAll('.card[data-id][data-type]:not(.card-saved)').forEach(applySavedBadge);
  }

  window.addEventListener('orvion:library-updated', () => { savedIndex = null; decorateSaved(); });

  // ---------------------------------------------------------------------------
  // Segmented control with a sliding "glass lens" indicator
  //   <div class="segmented" role="tablist"> <button role="tab" data-value="x">…</button> … </div>
  // ---------------------------------------------------------------------------
  function segmented(container, options) {
    const opts = options || {};
    let indicator = container.querySelector('.seg-indicator');
    if (!indicator) {
      indicator = el('span', { class: 'seg-indicator', attrs: { 'aria-hidden': 'true' } });
      container.insertBefore(indicator, container.firstChild);
    }
    const tabs = () => Array.from(container.querySelectorAll('[role="tab"]'));

    function place(animate) {
      const active = container.querySelector('[role="tab"][aria-selected="true"]');
      if (!active) return;
      if (!animate) indicator.style.transition = 'none';
      indicator.style.width = active.offsetWidth + 'px';
      indicator.style.transform = 'translateX(' + active.offsetLeft + 'px)';
      indicator.classList.add('ready');
      if (!animate) {
        void indicator.offsetWidth; // flush so the next change animates
        indicator.style.transition = '';
      }
      active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }

    function setValue(value, silent) {
      const list = tabs();
      const target = list.find((tab) => tab.dataset.value === value);
      if (!target) return;
      list.forEach((tab) => {
        const selected = tab === target;
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
      });
      place(!silent);
      if (!silent && typeof opts.onChange === 'function') opts.onChange(value);
    }

    container.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (!tab || !container.contains(tab) || tab.getAttribute('aria-selected') === 'true') return;
      setValue(tab.dataset.value, false);
    });

    container.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
      if (!(e.key in keys)) return;
      const list = tabs();
      const current = list.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
      let next = current;
      if (keys[e.key] === 'first') next = 0;
      else if (keys[e.key] === 'last') next = list.length - 1;
      else next = (current + keys[e.key] + list.length) % list.length;
      e.preventDefault();
      list[next].focus();
      setValue(list[next].dataset.value, false);
    });

    if ('ResizeObserver' in window) new ResizeObserver(() => place(false)).observe(container);
    window.addEventListener('resize', () => place(false));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place(false));

    const initial = container.querySelector('[role="tab"][aria-selected="true"]') || tabs()[0];
    if (initial) setValue(initial.dataset.value, true);

    return {
      setValue,
      refresh: () => place(false),
      getValue: () => {
        const active = container.querySelector('[role="tab"][aria-selected="true"]');
        return active ? active.dataset.value : null;
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Empty / error / offline states
  // ---------------------------------------------------------------------------
  /**
   * createState({ icon, title, text, actionLabel, onAction, secondaryHref, secondaryLabel, compact })
   */
  function createState(opts) {
    const o = opts || {};
    const node = el('div', { class: 'state' + (o.compact ? ' state-compact' : ''), attrs: { role: o.kind === 'error' ? 'alert' : null } });
    node.appendChild(el('div', { class: 'state-icon' }, icon(o.icon || 'film', 28)));
    node.appendChild(el('h3', { class: 'state-title', text: o.title || '' }));
    if (o.text) node.appendChild(el('p', { class: 'state-text', text: o.text }));
    const actions = el('div', { class: 'state-actions' });
    if (o.actionLabel && typeof o.onAction === 'function') {
      actions.appendChild(el('button', {
        class: 'btn btn-glass',
        attrs: { type: 'button' },
        on: { click: o.onAction }
      }, o.actionIcon ? icon(o.actionIcon, 18) : null, o.actionLabel));
    }
    if (o.secondaryHref && o.secondaryLabel) {
      actions.appendChild(el('a', { class: 'btn btn-primary', text: o.secondaryLabel, attrs: { href: o.secondaryHref } }));
    }
    if (actions.childNodes.length) node.appendChild(actions);
    return node;
  }

  // ---------------------------------------------------------------------------
  // Skeletons
  // ---------------------------------------------------------------------------
  function skeletonCards(count) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      fragment.appendChild(el('div', { class: 'card skeleton', attrs: { 'aria-hidden': 'true' } },
        el('div', { class: 'card-poster' }),
        el('div', { class: 'skeleton-line' }),
        el('div', { class: 'skeleton-line short' })
      ));
    }
    return fragment;
  }

  // ---------------------------------------------------------------------------
  // Images
  // ---------------------------------------------------------------------------
  /** Build a poster <img> that fades in and removes itself on error (the placeholder stays visible). */
  function posterImage(url, alt, options) {
    const opts = options || {};
    const img = document.createElement('img');
    img.className = 'card-img';
    img.alt = alt || '';
    img.decoding = 'async';
    img.loading = opts.eager ? 'eager' : 'lazy';
    img.draggable = false;
    img.width = 342;
    img.height = 513;
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.remove());
    img.src = url;
    if (opts.srcset) {
      img.srcset = opts.srcset;
      img.sizes = opts.sizes || '(max-width: 599px) 45vw, 200px';
    }
    if (img.complete && img.naturalWidth > 0) img.classList.add('loaded');
    return img;
  }

  function posterFallback() {
    return el('span', { class: 'card-fallback', attrs: { 'aria-hidden': 'true' } }, icon('film', 30));
  }

  // ---------------------------------------------------------------------------
  // Long press (touch / pen only) – opens the quick-add sheet. Suppresses the click that follows.
  // ---------------------------------------------------------------------------
  function attachLongPress(target, onLongPress) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    let fired = false;

    const cancel = () => { clearTimeout(timer); timer = null; };

    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      fired = false;
      startX = e.clientX;
      startY = e.clientY;
      cancel();
      timer = setTimeout(() => {
        fired = true;
        if (navigator.vibrate) navigator.vibrate(25);
        onLongPress();
      }, 520);
    });
    target.addEventListener('pointermove', (e) => {
      if (timer && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => target.addEventListener(evt, cancel));
    target.addEventListener('contextmenu', (e) => { if (fired || timer) e.preventDefault(); });
    // Capture phase so we beat the card's own click handler.
    target.addEventListener('click', (e) => {
      if (fired) {
        fired = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------
  function typeLabel(type) {
    return type === 'tv' ? 'TV' : 'Movie';
  }

  /** Poster card for TMDB results (home rows, discover and search grids). */
  function createSmallCard(item, explicitType) {
    const type = typeOf(item, explicitType);
    const title = titleOf(item);
    const year = yearOf(item);
    const rating = ratingOf(item);
    const id = Number(item.id);

    const card = el('article', { class: 'card', data: { id: id, type: type } });
    const open = el('button', { class: 'card-open', attrs: { type: 'button', 'aria-label': 'Open details: ' + title } });
    const poster = el('span', { class: 'card-poster' });
    poster.appendChild(posterFallback());
    if (item.poster_path) {
      poster.appendChild(posterImage(window.tmdbImage(item.poster_path, 'w342'), '', {
        srcset: window.tmdbImage(item.poster_path, 'w185') + ' 185w, ' + window.tmdbImage(item.poster_path, 'w342') + ' 342w, ' + window.tmdbImage(item.poster_path, 'w500') + ' 500w'
      }));
    }
    if (rating) {
      poster.appendChild(el('span', { class: 'card-rating' }, icon('star', 12), el('span', { text: rating })));
    }
    open.appendChild(poster);
    open.appendChild(el('span', { class: 'card-title', text: title }));
    open.appendChild(el('span', { class: 'card-sub', text: [year, typeLabel(type)].filter(Boolean).join(' · ') }));
    card.appendChild(open);

    const addPayload = () => ({ id: id, title: title, poster: storedPoster(item), type: type, category: suggestCategory(type, item.original_language, item.genre_ids) });
    applySavedBadge(card);
    card.appendChild(el('button', {
      class: 'card-add',
      attrs: { type: 'button', 'aria-label': 'Add ' + title + ' to watchlist' },
      on: { click: (e) => { e.stopPropagation(); if (window.showAddModal) window.showAddModal(addPayload()); } }
    }, icon('plus', 18)));

    open.addEventListener('click', () => { if (window.showItemDetails) window.showItemDetails(id, type); });
    attachLongPress(open, () => { if (window.showAddModal) window.showAddModal(addPayload()); });
    return card;
  }

  /**
   * Card for a saved watchlist entry.
   * opts: { statusLabel, categoryLabel, subText, status, onOpen(entry), onManage(entry) }
   */
  function createWatchlistCard(entry, opts) {
    const o = opts || {};
    const title = String(entry.title || 'Untitled');
    const type = entry.category === 'movie' ? 'movie' : 'tv';

    const card = el('article', { class: 'card card-saved', data: { id: entry.id, type: type, docid: entry.docId } });
    const open = el('button', { class: 'card-open', attrs: { type: 'button', 'aria-label': 'Open details: ' + title } });
    const poster = el('span', { class: 'card-poster' });
    poster.appendChild(posterFallback());

    let posterUrl = typeof entry.poster === 'string' ? entry.poster : '';
    if (!/^https:\/\//i.test(posterUrl) || /dummyimage\.com/i.test(posterUrl)) posterUrl = '';
    if (posterUrl) {
      // Smaller rendition of the same TMDB image; the stored value is not touched.
      poster.appendChild(posterImage(posterUrl.replace('/t/p/w500/', '/t/p/w342/'), ''));
    }
    if (o.progress) {
      const bar = el('span', { class: 'card-progress' + (o.progress.done ? ' done' : ''), attrs: { 'aria-hidden': 'true' } });
      const fill = document.createElement('i');
      fill.style.setProperty('--p', Math.max(0, Math.min(100, o.progress.pct || 0)) + '%');
      bar.appendChild(fill);
      poster.appendChild(bar);
    }
    open.appendChild(poster);
    open.appendChild(el('span', { class: 'card-title', text: title }));
    open.appendChild(el('span', { class: 'card-sub' },
      el('span', { class: 'status-dot', attrs: { 'data-status': o.status || '', 'aria-hidden': 'true' } }),
      el('span', { class: 'sr-only', text: o.statusLabel ? 'Status: ' + o.statusLabel + '. ' : '' }),
      el('span', { class: o.subAccent ? 'card-next' : '', text: o.subText || o.categoryLabel || '' })
    ));
    card.appendChild(open);

    if (o.quick && typeof o.quick.onClick === 'function') {
      const quick = el('button', {
        class: 'card-quick',
        attrs: { type: 'button', 'aria-label': o.quick.label || 'Mark next episode watched' },
        on: {
          click: async (e) => {
            e.stopPropagation();
            if (quick.classList.contains('is-busy')) return;
            quick.classList.add('is-busy');
            try { await o.quick.onClick(entry, card); } finally { quick.classList.remove('is-busy'); }
          }
        }
      }, icon('check', 20));
      card.appendChild(quick);
    }

    if (typeof o.onManage === 'function') {
      card.appendChild(el('button', {
        class: 'card-manage',
        attrs: { type: 'button', 'aria-label': 'Manage ' + title, 'aria-haspopup': 'dialog' },
        on: { click: (e) => { e.stopPropagation(); o.onManage(entry); } }
      }, icon('more', 20)));
    }

    open.addEventListener('click', () => {
      if (typeof o.onOpen === 'function') o.onOpen(entry);
      else if (window.showItemDetails) window.showItemDetails(entry.id, type);
    });
    attachLongPress(open, () => { if (typeof o.onManage === 'function') o.onManage(entry); });
    return card;
  }

  /** Full-bleed featured slide for the home hero. */
  function createHeroSlide(item, options) {
    const o = options || {};
    const title = titleOf(item);
    const year = yearOf(item);
    const rating = ratingOf(item);
    const id = Number(item.id);
    const type = typeOf(item, o.type);

    const slide = el('article', {
      class: 'hero-slide',
      data: { id: id, type: type },
      attrs: { role: 'group', 'aria-roledescription': 'slide', 'aria-label': o.label || title }
    });

    if (item.backdrop_path) {
      const img = el('img', { class: 'hero-backdrop', attrs: { alt: '', decoding: 'async', draggable: 'false' } });
      img.loading = o.eager ? 'eager' : 'lazy';
      if (o.eager) img.setAttribute('fetchpriority', 'high');
      img.addEventListener('load', () => img.classList.add('loaded'));
      img.addEventListener('error', () => img.remove());
      img.srcset = window.tmdbImage(item.backdrop_path, 'w780') + ' 780w, ' + window.tmdbImage(item.backdrop_path, 'w1280') + ' 1280w';
      img.sizes = '100vw';
      img.src = window.tmdbImage(item.backdrop_path, 'w780');
      slide.appendChild(img);
    }
    slide.appendChild(el('div', { class: 'hero-scrim', attrs: { 'aria-hidden': 'true' } }));

    const metaParts = [year, typeLabel(type)];
    const meta = el('p', { class: 'hero-meta' });
    if (rating) meta.appendChild(el('span', { class: 'hero-rating' }, icon('star', 14), el('span', { text: rating })));
    meta.appendChild(el('span', { text: metaParts.filter(Boolean).join(' · ') }));

    const body = el('div', { class: 'hero-body' },
      el('p', { class: 'hero-eyebrow', text: o.eyebrow || 'Trending this week' }),
      el('h2', { class: 'hero-title', text: title }),
      meta
    );
    if (item.overview) body.appendChild(el('p', { class: 'hero-overview', text: item.overview }));

    body.appendChild(el('div', { class: 'hero-actions' },
      el('button', {
        class: 'btn btn-primary',
        attrs: { type: 'button' },
        on: { click: () => { if (window.showItemDetails) window.showItemDetails(id, type); } }
      }, 'Details'),
      el('button', {
        class: 'btn btn-glass',
        attrs: { type: 'button', 'aria-label': 'Add ' + title + ' to watchlist' },
        on: { click: () => { if (window.showAddModal) window.showAddModal({ id: id, title: title, poster: storedPoster(item), type: type, category: suggestCategory(type, item.original_language, item.genre_ids) }); } }
      }, icon('plus', 18), 'Watchlist')
    ));
    slide.appendChild(body);
    return slide;
  }

  // ---------------------------------------------------------------------------
  // Horizontal rows: mouse drag-scroll (touch already scrolls natively)
  // ---------------------------------------------------------------------------
  function enableDragScroll(container) {
    if (!container || container.dataset.drag === '1') return;
    container.dataset.drag = '1';
    let down = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;

    container.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true;
      moved = false;
      startX = e.clientX;
      startScroll = container.scrollLeft;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const delta = e.clientX - startX;
      if (!moved && Math.abs(delta) > 6) {
        moved = true;
        container.classList.add('dragging');
      }
      if (moved) container.scrollLeft = startScroll - delta;
    });
    const end = () => {
      if (!down) return;
      down = false;
      container.classList.remove('dragging');
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // A drag must not count as a click on the card underneath.
    container.addEventListener('click', (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    }, true);
  }

  // ---------------------------------------------------------------------------
  // Staggered entrance for freshly rendered cards (transform/opacity only)
  // ---------------------------------------------------------------------------
  function stagger(nodes) {
    if (reducedMotion()) return;
    Array.from(nodes).slice(0, 14).forEach((node, i) => {
      node.style.setProperty('--i', String(i));
      node.classList.add('reveal');
    });
  }

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------
  window.OrvionUI = {
    el, icon, showToast, openModal, closeModal, bindModal, segmented, createState, skeletonCards,
    enableDragScroll, stagger, attachLongPress, posterImage, posterFallback, typeLabel,
    yearOf, ratingOf, typeOf, titleOf, storedPoster, reducedMotion,
    choiceGroup, rangeField, setBusy, createSheetRoot, enableSheetDrag, progressBar, ring,
    suggestCategory, formatNumber, savedStatus, decorateSaved
  };
  window.createSmallCard = createSmallCard;
  window.createWatchlistCard = createWatchlistCard;
  window.createHeroSlide = createHeroSlide;
  window.enableDragScroll = enableDragScroll;
  window.showToast = showToast;
})();
