// js/appearance.js – Settings sheet (ES module)
//
// Settings › Appearance: Navigation style (with a live, tappable preview), theme (mode, presets, accent) and display
// (glass, density, cards, motion). The engines live in js/boot.js (window.OrvionTheme) and js/nav.js
// (window.OrvionNav); this file only builds the interface. Every change applies instantly and is saved.
const UI = window.OrvionUI;
const Theme = window.OrvionTheme;
const Nav = window.OrvionNav;
const { el, openModal, closeModal } = UI;

let sheetRef = null;

function matchesPreset(settings, preset) {
  return settings.theme === preset.theme &&
    settings.color === preset.color &&
    String(settings.glass) === String(preset.glass) &&
    settings.cards === preset.cards &&
    settings.density === preset.density &&
    settings.motion === preset.motion;
}

function group(title, ...children) {
  return el('section', { class: 'settings-group' }, el('h3', { class: 'settings-heading', text: title }), ...children);
}

function buildSheet() {
  const { root, sheet } = UI.createSheetRoot('themeSettingsModal', 'settingsTitle', 'settings');
  let syncing = false;
  const current = () => Theme.read();

  // ---------- Navigation style: live preview + four options ----------
  const preview = Nav ? Nav.createPreview(current().nav) : null;
  const stage = el('div', { class: 'nav-stage', attrs: { 'aria-hidden': 'true' } },
    el('div', { class: 'faux' }, el('i'), el('i'), el('i')),
    preview ? preview.node : null
  );
  const navButtons = [];
  const navList = el('div', { class: 'nav-options', attrs: { role: 'radiogroup', 'aria-label': 'Navigation style' } });
  (Nav ? Nav.STYLES : []).forEach((style) => {
    const button = el('button', {
      class: 'nav-opt',
      attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' },
      on: {
        click: () => {
          if (syncing) return;
          Nav.setStyle(style.value);
          if (preview) preview.setStyle(style.value);
          syncNav();
        }
      }
    }, el('span', { class: 'nav-glyph', data: { g: style.value }, attrs: { 'aria-hidden': 'true' } }), el('span', { class: 'nav-name', text: style.label }), el('span', { class: 'nav-note', text: style.note }));
    button.dataset.value = style.value;
    navButtons.push(button);
    navList.appendChild(button);
  });
  const navGroup = group('Navigation style',
    el('div', { class: 'settings-card' }, stage, navList),
    el('p', { class: 'field-hint', text: 'Applies instantly to the bar at the bottom of the screen. Tap the preview icons to try the indicator.' })
  );

  // ---------- Theme ----------
  const modeGroup = UI.choiceGroup({
    legend: 'Mode',
    columns: 4,
    value: current().theme,
    options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Auto' }, { value: 'amoled', label: 'Black' }],
    hint: 'Black is a true AMOLED theme (pure #000) that saves battery on OLED screens.',
    onChange: (value) => { if (!syncing) { Theme.save({ theme: value }); sync(); } }
  });

  const presetInputs = [];
  const presetRow = el('div', { class: 'preset-row' });
  Theme.PRESETS.forEach((preset) => {
    const input = el('input', { attrs: { type: 'radio', name: 'preset', value: preset.id, 'aria-label': preset.label + ' – ' + preset.note } });
    input.addEventListener('change', () => { if (input.checked && !syncing) { Theme.applyPreset(preset.id); sync(); } });
    presetInputs.push({ input, preset });
    const dot = el('span', { class: 'preset-dot', attrs: { 'aria-hidden': 'true' } });
    dot.style.setProperty('--p1', preset.preview[0]);
    dot.style.setProperty('--p2', preset.preview[1]);
    presetRow.appendChild(el('label', { class: 'preset' }, input, dot, el('span', { class: 'preset-name', text: preset.label })));
  });
  const presetsField = el('fieldset', { class: 'field' }, el('legend', { class: 'field-label', text: 'Presets' }), presetRow);

  const accentRadios = [];
  const swatchRow = el('div', { class: 'swatch-row' });
  Theme.ACCENTS.forEach((accent) => {
    const input = el('input', { attrs: { type: 'radio', name: 'accent', value: accent.value, 'aria-label': accent.label } });
    input.addEventListener('change', () => { if (input.checked && !syncing) { Theme.save({ color: accent.value }); sync(); } });
    accentRadios.push(input);
    const face = el('span', { class: 'swatch-face' });
    face.style.setProperty('--sw', accent.swatch);
    swatchRow.appendChild(el('label', { class: 'swatch', attrs: { title: accent.label } }, input, face));
  });
  const colorInput = el('input', { attrs: { type: 'color', 'aria-label': 'Custom accent color', value: current().custom } });
  const customFace = el('span', { class: 'swatch-face' });
  const customLabel = el('label', { class: 'swatch swatch-custom', attrs: { title: 'Custom color' } }, colorInput, customFace);
  colorInput.addEventListener('input', () => { Theme.save({ color: 'custom', custom: colorInput.value }); sync(); });
  swatchRow.appendChild(customLabel);
  const accentField = el('fieldset', { class: 'field' }, el('legend', { class: 'field-label', text: 'Accent' }), swatchRow);

  const themeGroup = group('Theme', el('div', { class: 'settings-card' }, modeGroup.node, presetsField, accentField));

  // ---------- Display ----------
  const glass = UI.rangeField({
    label: 'Glass & blur',
    min: 0,
    max: 100,
    step: 5,
    value: current().glass,
    format: (v) => (v === 0 ? 'Off' : v + '%'),
    hint: 'Lower is flatter and lighter on older phones.',
    onInput: (value) => { if (!syncing) { Theme.save({ glass: value }); updatePresetSelection(); } }
  });
  const densityGroup = UI.choiceGroup({
    legend: 'Density',
    columns: 3,
    value: current().density,
    options: [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }],
    onChange: (value) => { if (!syncing) { Theme.save({ density: value }); updatePresetSelection(); } }
  });
  const cardsGroup = UI.choiceGroup({
    legend: 'Poster corners',
    columns: 3,
    value: current().cards,
    options: [{ value: 'rounded', label: 'Rounded' }, { value: 'classic', label: 'Classic' }, { value: 'sharp', label: 'Sharp' }],
    onChange: (value) => { if (!syncing) { Theme.save({ cards: value }); updatePresetSelection(); } }
  });
  const motionGroup = UI.choiceGroup({
    legend: 'Animations',
    columns: 4,
    value: current().motion,
    options: [{ value: 'auto', label: 'Auto' }, { value: 'full', label: 'Full' }, { value: 'subtle', label: 'Subtle' }, { value: 'off', label: 'None' }],
    hint: 'Auto follows your device’s reduced-motion setting.',
    onChange: (value) => { if (!syncing) { Theme.save({ motion: value }); updatePresetSelection(); } }
  });
  const displayGroup = group('Display', el('div', { class: 'settings-card' },
    el('div', { class: 'field' }, glass.node), densityGroup.node, cardsGroup.node, motionGroup.node));

  const resetBtn = el('button', { class: 'link-btn', text: 'Reset', attrs: { type: 'button', 'aria-label': 'Reset all appearance settings' }, on: { click: () => { Theme.reset(); sync(); UI.showToast('Appearance reset', 'info'); } } });
  const doneBtn = el('button', { class: 'btn btn-primary btn-block', text: 'Done', attrs: { type: 'button' }, on: { click: () => closeModal(root) } });

  sheet.append(
    el('div', { class: 'sheet-head', attrs: { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px' } },
      el('div', {}, el('h2', { class: 'sheet-title', text: 'Settings', attrs: { id: 'settingsTitle' } }), el('p', { class: 'sheet-sub', text: 'Appearance' })),
      resetBtn
    ),
    el('div', { class: 'sheet-body' }, navGroup, themeGroup, displayGroup),
    el('div', { class: 'sheet-actions' }, doneBtn)
  );

  function syncNav() {
    const style = current().nav;
    navButtons.forEach((b) => b.setAttribute('aria-checked', b.dataset.value === style ? 'true' : 'false'));
  }
  function updatePresetSelection() {
    const s = current();
    presetInputs.forEach(({ input, preset }) => { input.checked = matchesPreset(s, preset); });
  }
  function sync() {
    syncing = true;
    const s = current();
    modeGroup.set(s.theme);
    densityGroup.set(s.density);
    cardsGroup.set(s.cards);
    motionGroup.set(s.motion);
    glass.set(s.glass);
    accentRadios.forEach((input) => { input.checked = s.color !== 'custom' && input.value === s.color; });
    colorInput.value = s.custom;
    customFace.style.setProperty('--sw', s.custom);
    customLabel.classList.toggle('selected', s.color === 'custom');
    updatePresetSelection();
    syncNav();
    if (preview) preview.setStyle(s.nav);
    syncing = false;
  }

  sync();
  let mounted = false;
  return { root, sync, mountPreview: () => { if (preview && !mounted) { preview.mount(); mounted = true; } } };
}

export function showAppearance() {
  if (!sheetRef) sheetRef = buildSheet();
  sheetRef.sync();
  openModal(sheetRef.root);
  requestAnimationFrame(() => requestAnimationFrame(sheetRef.mountPreview));
}

export function initAppearance() {
  const button = document.getElementById('themeToggleBtn');
  if (button) {
    button.setAttribute('aria-label', 'Settings');
    button.addEventListener('click', showAppearance);
  }
  // Re-apply if another tab changes the preferences.
  window.addEventListener('storage', (event) => {
    if (event.key && event.key.indexOf('orvion-') === 0) Theme.apply();
  });
}
