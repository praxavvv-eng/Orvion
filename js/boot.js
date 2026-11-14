// js/boot.js – appearance engine for Orvion (classic script, loaded in <head> on every page)
//
// Runs before first paint so the saved look (mode, accent, glass, density, motion) never flashes.
// It is also the single source of truth for appearance: js/appearance.js only builds the settings UI
// on top of window.OrvionTheme. Old preference keys ("orvion-theme", "orvion-color") are still honoured.
(function () {
  'use strict';

  var root = document.documentElement;
  var KEYS = {
    theme: 'orvion-theme',
    color: 'orvion-color',
    custom: 'orvion-custom',
    density: 'orvion-density',
    cards: 'orvion-cards',
    glass: 'orvion-glass',
    motion: 'orvion-motion'
  };
  var DEFAULTS = { theme: 'dark', color: 'purple', custom: '#7c3aed', density: 'comfortable', cards: 'rounded', glass: '55', motion: 'auto' };

  var ACCENTS = [
    { value: 'purple', label: 'Violet', swatch: '#7c3aed' },
    { value: 'blue', label: 'Blue', swatch: '#3b82f6' },
    { value: 'teal', label: 'Teal', swatch: '#14b8a6' },
    { value: 'green', label: 'Green', swatch: '#10b981' },
    { value: 'orange', label: 'Orange', swatch: '#f97316' },
    { value: 'rose', label: 'Rose', swatch: '#f43f5e' },
    { value: 'red', label: 'Red', swatch: '#ef4444' }
  ];

  var PRESETS = [
    { id: 'orvion', label: 'Orvion', note: 'Violet glass', theme: 'dark', color: 'purple', glass: '55', cards: 'rounded', density: 'comfortable', motion: 'auto', preview: ['#0b0b0f', '#7c3aed'] },
    { id: 'noir', label: 'Noir', note: 'True black', theme: 'amoled', color: 'purple', glass: '40', cards: 'rounded', density: 'comfortable', motion: 'auto', preview: ['#000000', '#8b5cf6'] },
    { id: 'ocean', label: 'Ocean', note: 'Deep teal', theme: 'amoled', color: 'teal', glass: '60', cards: 'rounded', density: 'comfortable', motion: 'auto', preview: ['#000000', '#14b8a6'] },
    { id: 'sunset', label: 'Sunset', note: 'Warm orange', theme: 'dark', color: 'orange', glass: '65', cards: 'rounded', density: 'comfortable', motion: 'auto', preview: ['#0b0b0f', '#f97316'] },
    { id: 'daylight', label: 'Daylight', note: 'Clean light', theme: 'light', color: 'purple', glass: '55', cards: 'rounded', density: 'comfortable', motion: 'auto', preview: ['#f4f3f8', '#7c3aed'] },
    { id: 'minimal', label: 'Minimal', note: 'Flat and calm', theme: 'amoled', color: 'blue', glass: '15', cards: 'sharp', density: 'compact', motion: 'subtle', preview: ['#000000', '#3b82f6'] }
  ];

  var THEME_COLORS = { dark: '#0b0b0f', light: '#f4f3f8', amoled: '#000000' };
  var THEMES = ['dark', 'light', 'system', 'amoled'];
  var DENSITIES = ['comfortable', 'compact'];
  var CARDS = ['rounded', 'classic', 'sharp'];
  var MOTIONS = ['auto', 'full', 'subtle', 'off'];

  function get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function set(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) { /* storage unavailable – setting lasts for this visit only */ }
  }

  var memory = {};
  function read() {
    var theme = memory.theme || get(KEYS.theme) || DEFAULTS.theme;
    var color = memory.color || get(KEYS.color) || DEFAULTS.color;
    var custom = memory.custom || get(KEYS.custom) || DEFAULTS.custom;
    var density = memory.density || get(KEYS.density) || DEFAULTS.density;
    var cards = memory.cards || get(KEYS.cards) || DEFAULTS.cards;
    var glass = memory.glass || get(KEYS.glass) || DEFAULTS.glass;
    var motion = memory.motion || get(KEYS.motion) || DEFAULTS.motion;
    glass = Number(glass);
    return {
      theme: THEMES.indexOf(theme) === -1 ? DEFAULTS.theme : theme,
      color: color === 'custom' || ACCENTS.some(function (a) { return a.value === color; }) ? color : DEFAULTS.color,
      custom: /^#[0-9a-f]{6}$/i.test(custom) ? custom : DEFAULTS.custom,
      density: DENSITIES.indexOf(density) === -1 ? DEFAULTS.density : density,
      cards: CARDS.indexOf(cards) === -1 ? DEFAULTS.cards : cards,
      glass: isFinite(glass) ? Math.max(0, Math.min(100, glass)) : Number(DEFAULTS.glass),
      motion: MOTIONS.indexOf(motion) === -1 ? DEFAULTS.motion : motion
    };
  }

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return [124, 58, 237];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }
  function mix(rgb, target, amount) {
    return rgb.map(function (c, i) { return Math.round(c + (target[i] - c) * amount); });
  }
  function luminance(rgb) {
    var v = rgb.map(function (c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }

  var systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var systemReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function apply() {
    var s = read();
    var resolved = s.theme === 'system' ? (systemDark && systemDark.matches ? 'dark' : 'light') : s.theme;
    var light = resolved === 'light';
    var amoled = resolved === 'amoled';

    root.setAttribute('data-theme', light ? 'light' : 'dark');
    root.setAttribute('data-surface', amoled ? 'amoled' : 'default');
    root.setAttribute('data-color', s.color);
    root.setAttribute('data-density', s.density);
    root.setAttribute('data-cards', s.cards);

    var motion = s.motion === 'auto' ? (systemReduce && systemReduce.matches ? 'off' : 'full') : s.motion;
    root.setAttribute('data-motion', motion);

    // Accent: a preset name or a custom hex; the lighter/darker partner colour is derived so contrast stays readable.
    var swatch = s.color === 'custom' ? s.custom : (ACCENTS.filter(function (a) { return a.value === s.color; })[0] || ACCENTS[0]).swatch;
    var rgb = hexToRgb(swatch);
    var partner = light ? mix(rgb, [0, 0, 0], 0.28) : mix(rgb, [255, 255, 255], 0.42);
    var style = root.style;
    style.setProperty('--accent-rgb', rgb.join(' '));
    style.setProperty('--accent-2', 'rgb(' + partner.join(' ') + ')');
    style.setProperty('--on-accent', luminance(rgb) > 0.55 ? '#16151d' : '#ffffff');

    // Glass: 0 = solid & flat, 100 = strongest blur and most transparent.
    style.setProperty('--glass-px', (s.glass * 0.4).toFixed(1) + 'px');
    style.setProperty('--glass-a', (0.8 - s.glass * 0.0048).toFixed(3));

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', amoled ? THEME_COLORS.amoled : (light ? THEME_COLORS.light : THEME_COLORS.dark));

    try { window.dispatchEvent(new CustomEvent('orvion:appearance', { detail: s })); } catch (e) { /* very old browsers */ }
    return s;
  }

  function save(partial) {
    Object.keys(partial).forEach(function (name) {
      if (!KEYS[name]) return;
      memory[name] = String(partial[name]);
      set(KEYS[name], partial[name]);
    });
    return apply();
  }

  function applyPreset(id) {
    var preset = PRESETS.filter(function (p) { return p.id === id; })[0];
    if (!preset) return null;
    return save({ theme: preset.theme, color: preset.color, glass: preset.glass, cards: preset.cards, density: preset.density, motion: preset.motion });
  }

  function reset() {
    Object.keys(KEYS).forEach(function (name) {
      delete memory[name];
      try { localStorage.removeItem(KEYS[name]); } catch (e) { /* ignore */ }
    });
    return apply();
  }

  function onSystemChange() {
    var s = read();
    if (s.theme === 'system' || s.motion === 'auto') apply();
  }
  if (systemDark && systemDark.addEventListener) systemDark.addEventListener('change', onSystemChange);
  if (systemReduce && systemReduce.addEventListener) systemReduce.addEventListener('change', onSystemChange);

  window.OrvionTheme = {
    KEYS: KEYS, DEFAULTS: DEFAULTS, ACCENTS: ACCENTS, PRESETS: PRESETS,
    read: read, save: save, apply: apply, applyPreset: applyPreset, reset: reset, hexToRgb: hexToRgb
  };

  try { apply(); } catch (e) { /* never block the page on an appearance error */ }

  // Keep the install prompt so the Install button can use it later (handled in js/app.js).
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__orvionInstallEvent = e; });
})();
