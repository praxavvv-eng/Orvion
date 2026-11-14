// js/appearance.js – Appearance settings sheet (ES module)
//
// The engine lives in js/boot.js (window.OrvionTheme) so it can run before first paint.
// This module only builds the settings UI on top of it. Every change is applied instantly and saved.
const UI = window.OrvionUI;
const Theme = window.OrvionTheme;
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

function buildSheet() {
  const { root, sheet } = UI.createSheetRoot('themeSettingsModal', 'appearanceTitle', 'settings');
  let syncing = false;

  // ----- Presets -----
  const presetInputs = [];
  const presetGrid = el('div', { class: 'preset-grid' });
  Theme.PRESETS.forEach((preset) => {
    const input = el('input', { attrs: { type: 'radio', name: 'preset', value: preset.id, 'aria-label': preset.label + ' – ' + preset.note } });
    input.addEventListener('change', () => {
      if (!input.checked || syncing) return;
      Theme.applyPreset(preset.id);
      sync();
    });
    presetInputs.push({ input, preset });
    const dot = el('span', { class: 'preset-dot', attrs: { 'aria-hidden': 'true' } });
    dot.style.setProperty('--p1', preset.preview[0]);
    dot.style.setProperty('--p2', preset.preview[1]);
    presetGrid.appendChild(el('label', { class: 'preset' },
      input,
      el('span', { class: 'preset-face' }, dot, el('span', { class: 'preset-name', text: preset.label }), el('span', { class: 'preset-note', text: preset.note }))
    ));
  });
  const presetsField = el('fieldset', { class: 'field' }, el('legend', { class: 'field-label', text: 'Presets' }), presetGrid);

  // ----- Mode -----
  const modeGroup = UI.choiceGroup({
    legend: 'Mode',
    columns: 4,
    value: Theme.read().theme,
    options: [
      { value: 'dark', label: 'Dark' },
      { value: 'light', label: 'Light' },
      { value: 'system', label: 'System' },
      { value: 'amoled', label: 'AMOLED' }
    ],
    hint: 'AMOLED uses pure black, which saves battery on OLED screens.',
    onChange: (value) => { if (!syncing) { Theme.save({ theme: value }); sync(); } }
  });

  // ----- Accent -----
  const accentRadios = [];
  const swatchRow = el('div', { class: 'swatch-row' });
  Theme.ACCENTS.forEach((accent) => {
    const input = el('input', { attrs: { type: 'radio', name: 'accent', value: accent.value, 'aria-label': accent.label } });
    input.addEventListener('change', () => {
      if (!input.checked || syncing) return;
      Theme.save({ color: accent.value });
      sync();
    });
    accentRadios.push(input);
    const face = el('span', { class: 'swatch-face' });
    face.style.setProperty('--sw', accent.swatch);
    swatchRow.appendChild(el('label', { class: 'swatch', attrs: { title: accent.label } }, input, face));
  });
  const colorInput = el('input', { attrs: { type: 'color', 'aria-label': 'Custom accent color', value: Theme.read().custom } });
  const customFace = el('span', { class: 'swatch-face' });
  const customLabel = el('label', { class: 'swatch swatch-custom', attrs: { title: 'Custom color' } }, colorInput, customFace);
  colorInput.addEventListener('input', () => {
    Theme.save({ color: 'custom', custom: colorInput.value });
    sync();
  });
  swatchRow.appendChild(customLabel);
  const accentField = el('fieldset', { class: 'field' },
    el('legend', { class: 'field-label', text: 'Accent color' }),
    swatchRow
  );

  // ----- Glass -----
  const glass = UI.rangeField({
    label: 'Glass & blur',
    min: 0,
    max: 100,
    step: 5,
    value: Theme.read().glass,
    format: (v) => (v === 0 ? 'Off' : v + '%'),
    hint: 'Lower values are flatter and faster on older phones.',
    onInput: (value) => { if (!syncing) { Theme.save({ glass: value }); updatePresetSelection(); } }
  });

  // ----- Density / cards / motion -----
  const densityGroup = UI.choiceGroup({
    legend: 'Density',
    columns: 2,
    value: Theme.read().density,
    options: [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }],
    onChange: (value) => { if (!syncing) { Theme.save({ density: value }); updatePresetSelection(); } }
  });
  const cardsGroup = UI.choiceGroup({
    legend: 'Card style',
    columns: 3,
    value: Theme.read().cards,
    options: [{ value: 'rounded', label: 'Rounded' }, { value: 'classic', label: 'Classic' }, { value: 'sharp', label: 'Sharp' }],
    onChange: (value) => { if (!syncing) { Theme.save({ cards: value }); updatePresetSelection(); } }
  });
  const motionGroup = UI.choiceGroup({
    legend: 'Animations',
    columns: 4,
    value: Theme.read().motion,
    options: [{ value: 'auto', label: 'Auto' }, { value: 'full', label: 'Full' }, { value: 'subtle', label: 'Subtle' }, { value: 'off', label: 'None' }],
    hint: 'Auto follows your device’s reduced-motion setting.',
    onChange: (value) => { if (!syncing) { Theme.save({ motion: value }); updatePresetSelection(); } }
  });

  const resetBtn = el('button', { class: 'link-btn', text: 'Reset', attrs: { type: 'button', 'aria-label': 'Reset appearance to defaults' }, on: { click: () => { Theme.reset(); sync(); UI.showToast('Appearance reset', 'info'); } } });
  const doneBtn = el('button', { class: 'btn btn-primary btn-block', text: 'Done', attrs: { type: 'button' }, on: { click: () => closeModal(root) } });

  sheet.append(
    el('div', { class: 'sheet-head', attrs: { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px' } },
      el('h3', { class: 'sheet-title', text: 'Appearance', attrs: { id: 'appearanceTitle' } }),
      resetBtn
    ),
    el('div', { class: 'sheet-body' }, presetsField, modeGroup.node, accentField, glass.node, densityGroup.node, cardsGroup.node, motionGroup.node),
    el('div', { class: 'sheet-actions' }, doneBtn)
  );

  function updatePresetSelection() {
    const current = Theme.read();
    presetInputs.forEach(({ input, preset }) => { input.checked = matchesPreset(current, preset); });
  }

  function sync() {
    syncing = true;
    const current = Theme.read();
    modeGroup.set(current.theme);
    densityGroup.set(current.density);
    cardsGroup.set(current.cards);
    motionGroup.set(current.motion);
    glass.set(current.glass);
    accentRadios.forEach((input) => { input.checked = current.color !== 'custom' && input.value === current.color; });
    colorInput.value = current.custom;
    customFace.style.setProperty('--sw', current.custom);
    customLabel.classList.toggle('selected', current.color === 'custom');
    updatePresetSelection();
    syncing = false;
  }

  sync();
  return { root, sync };
}

export function showAppearance() {
  if (!sheetRef) sheetRef = buildSheet();
  sheetRef.sync();
  openModal(sheetRef.root);
}

export function initAppearance() {
  const button = document.getElementById('themeToggleBtn');
  if (button) button.addEventListener('click', showAppearance);
  // Re-apply if another tab changes the preferences.
  window.addEventListener('storage', (event) => {
    if (event.key && event.key.indexOf('orvion-') === 0) Theme.apply();
  });
}

