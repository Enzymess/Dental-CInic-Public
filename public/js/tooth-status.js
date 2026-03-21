/* =========================================================
   TWO-BOX TOOTH STATUS SYSTEM
   ========================================================= */

// Restoration / Condition options (TOP box)
const RESTORATION_OPTIONS = [
  { code: '/',   label: 'Present',                        state: 'present',  defaultColor: '#059669' },
  { code: 'M',   label: 'Missing due to Caries',                             defaultColor: '#0b5ea8' },
  { code: 'MO',  label: 'Missing due to Other Causes',                       defaultColor: '#0b5ea8' },
  { code: 'Im',  label: 'Impacted Tooth',                                    defaultColor: '#0b5ea8' },
  { code: 'Sp',  label: 'Supernumerary Tooth',                               defaultColor: '#0b5ea8' },
  { code: 'Rf',  label: 'Root Fragment',                                     defaultColor: '#0b5ea8' },
  { code: 'Un',  label: 'Unerupted',                                         defaultColor: '#0b5ea8' },
  { code: 'Am',  label: 'Amalgam Filling',                                   defaultColor: '#0b5ea8' },
  { code: 'Co',  label: 'Composite Filling',                                 defaultColor: '#0b5ea8' },
  { code: 'Jc',  label: 'Jacket Crown',                                      defaultColor: '#0b5ea8' },
  { code: 'Ab',  label: 'Abutment',                                          defaultColor: '#0b5ea8' },
  { code: 'P',   label: 'Pontic',                                            defaultColor: '#0b5ea8' },
  { code: 'In',  label: 'Inlay',                                             defaultColor: '#0b5ea8' },
  { code: 'Imp', label: 'Implant',                                           defaultColor: '#0b5ea8' },
  { code: 'S',   label: 'Sealants',                                          defaultColor: '#0b5ea8' },
  { code: 'Rm',  label: 'Removable Denture',                                 defaultColor: '#0b5ea8' },
];

// Surgery options (BOTTOM box)
const SURGERY_OPTIONS = [
  { code: 'X',  label: 'Extraction due to Caries',        state: 'surgery',  defaultColor: '#dc2626' },
  { code: 'XO', label: 'Extraction due to Other Causes',  state: 'surgery',  defaultColor: '#dc2626' },
  { code: 'D',  label: 'Decayed (Caries Ind. for Filling)',                   defaultColor: '#dc2626' },
];

// Merged lookup: code -> defaultColor
const ALL_CODE_OPTIONS = [...RESTORATION_OPTIONS, ...SURGERY_OPTIONS];
function getDefaultColorForCode(code) {
  const opt = ALL_CODE_OPTIONS.find(o => o.code === code);
  return opt ? opt.defaultColor : '#0b5ea8';
}

// Per-patient custom code colors: { 'Am': '#e11d48', 'X': '#7c3aed', ... }
// Stored inside toothStatusData under reserved key '__codeColors'
let _codeColors = {};

// Per-patient tooth status storage  { toothNum: { top: code|null, bottom: code|null } }
let toothStatusData = {};

// Dropdown state
let _tcdTarget = null;
let _dropdownCreated = false;

// ── Color picker for tooth code labels ──────────────────────────────────────
// Opens a native <input type="color"> anchored near the swatch.
// When a new color is picked it updates _codeColors, refreshes every visible
// box that uses that code, and saves immediately.
function openCodeColorPicker(ev, code) {
  // Remove any leftover picker
  document.getElementById('_tcColorPicker')?.remove();

  const picker = document.createElement('input');
  picker.type  = 'color';
  picker.id    = '_tcColorPicker';
  picker.value = _codeColors[code] || getDefaultColorForCode(code);
  picker.style.cssText = 'position:fixed;opacity:0;width:0;height:0;pointer-events:none;';
  document.body.appendChild(picker);

  // Commit on change (live preview) and on close
  const commit = () => {
    const hex = picker.value;
    _codeColors[code] = hex;

    // Update every visible dc-sbox showing this code
    document.querySelectorAll(`.dc-sbox`).forEach(box => {
      if (box.textContent.trim() === code) applyColorToBox(box, hex);
    });

    // Refresh swatch + code chip in the open dropdown
    const dropdown = document.getElementById('toothCodeDropdown');
    if (dropdown) {
      dropdown.querySelectorAll(`[data-pickcode="${code}"]`).forEach(sw => {
        sw.style.background = hex;
      });
      dropdown.querySelectorAll(`.tcd-item[data-code="${code}"] .tcd-code`).forEach(chip => {
        chip.style.color = hex;
        chip.style.borderColor = hex;
        chip.style.background = hex + '22';
      });
    }

    saveToothStatusData();
  };

  picker.addEventListener('input',  commit);
  picker.addEventListener('change', commit);
  picker.addEventListener('blur',   () => { picker.remove(); });

  picker.click();
}

function ensureToothDropdown() {
  if (_dropdownCreated && document.getElementById('toothCodeDropdown')) return;
  
  // Remove old one if exists
  const old = document.getElementById('toothCodeDropdown');
  if (old) old.remove();
  
  const el = document.createElement('div');
  el.id = 'toothCodeDropdown';
  el.className = 'tooth-code-dropdown';
  document.body.appendChild(el);
  _dropdownCreated = true;
  
  // BUG FIX: Use mousedown (not click) in bubble phase (not capture)
  // This way it fires after the box's click opens the dropdown,
  // and mousedown on the dropdown items still works.
  document.addEventListener('mousedown', (e) => {
    const dropdown = document.getElementById('toothCodeDropdown');
    if (!dropdown) return;
    if (!dropdown.contains(e.target) && !e.target.classList.contains('dc-sbox')) {
      dropdown.classList.remove('tcd-visible');
    }
  });
}
function openToothCodeDropdown(e, toothNum, boxType, isTemp, targetEl) {
  e.stopPropagation();
  e.preventDefault();

  ensureToothDropdown();

  const sboxEl = targetEl || e.target.closest('.dc-sbox') || e.target;
  _tcdTarget = { toothNum, boxType, el: sboxEl, isTemp };

  const dropdown = document.getElementById('toothCodeDropdown');
  const options  = boxType === 'top' ? RESTORATION_OPTIONS : SURGERY_OPTIONS;
  const current  = (toothStatusData[toothNum] || {})[boxType];
  const label    = boxType === 'top' ? 'Restoration / Condition' : 'Surgery';

  let html = `<div class="tcd-header">Tooth ${toothNum} &mdash; ${label}</div><div class="tcd-section">`;

  options.forEach(opt => {
    const isPresent = opt.state === 'present';
    const isSurg    = opt.state === 'surgery';
    const sel       = current === opt.code ? ' tcd-selected' : '';
    const cls       = isSurg ? ' tcd-surg' : isPresent ? ' tcd-pres' : '';
    const color     = _codeColors[opt.code] || opt.defaultColor;
    html += `<div class="tcd-item${cls}${sel}" data-code="${opt.code}" data-state="${opt.state||'condition'}">
      <span class="tcd-code" style="color:${color};border-color:${color};background:${color}22;">${opt.code}</span>
      <span class="tcd-item-label">${opt.label}</span>
      <span class="tcd-color-swatch" data-pickcode="${opt.code}" title="Change color for ${opt.code}" style="background:${color};"></span>
    </div>`;
  });

  html += `</div><div class="tcd-section"><div class="tcd-item tcd-clear" data-code="__clear__">
    <span class="tcd-code">X</span><span>Clear</span>
  </div></div>`;

  dropdown.innerHTML = html;

  // Color swatch click — open native color picker without closing the dropdown
  dropdown.querySelectorAll('.tcd-color-swatch').forEach(swatch => {
    swatch.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const code = swatch.dataset.pickcode;
      openCodeColorPicker(ev, code);
    });
  });

  dropdown.querySelectorAll('.tcd-item').forEach(item => {
    item.addEventListener('mousedown', (ev) => {
      // Ignore clicks that originated from the swatch
      if (ev.target.classList.contains('tcd-color-swatch')) return;
      ev.stopPropagation();
      ev.preventDefault();
      const code  = item.dataset.code;
      const state = item.dataset.state || '';
      applyToothCode(code, state);
      dropdown.classList.remove('tcd-visible');
    });
  });

  // THE FIX: position:fixed + getBoundingClientRect = both viewport-relative
  const rect   = sboxEl.getBoundingClientRect();
  const dropW  = 232;
  const dropH  = 310;
  const margin = 4;

  let top  = rect.bottom + margin;
  let left = rect.left;

  if (top + dropH > window.innerHeight - 10) {
    top = rect.top - dropH - margin;
  }
  if (left + dropW > window.innerWidth - 10) {
    left = rect.right - dropW;
  }
  if (left < 6) left = 6;
  if (top  < 6) top  = 6;

  dropdown.style.position = 'fixed';   // ← KEY FIX
  dropdown.style.top  = top  + 'px';
  dropdown.style.left = left + 'px';
  dropdown.classList.add('tcd-visible');
}

function applyToothCode(code, state) {
  if (!_tcdTarget) return;
  const { toothNum, boxType, el } = _tcdTarget;

  if (!toothStatusData[toothNum]) toothStatusData[toothNum] = { top: null, bottom: null };

  if (code === '__clear__') {
    toothStatusData[toothNum][boxType] = null;
    el.textContent = '';
    el.style.color = '';
    el.style.borderColor = '';
    el.style.backgroundColor = '';
    el.className = el.className.replace(/state-\w+/g, '').trim();
    if (boxType === 'bottom') {
      el.className = el.className.includes('dc-sbox-temp')
        ? 'dc-sbox dc-sbox-bottom dc-sbox-temp'
        : 'dc-sbox dc-sbox-bottom';
    } else {
      el.className = el.className.includes('dc-sbox-temp')
        ? 'dc-sbox dc-sbox-top dc-sbox-temp'
        : 'dc-sbox dc-sbox-top';
    }
    saveToothStatusData();
    return;
  }

  toothStatusData[toothNum][boxType] = code;

  // Clear old state classes
  el.className = el.className.replace(/state-\w+/g, '').trim();

  if (state === 'present') {
    el.classList.add('state-present');
  } else if (state === 'surgery' || boxType === 'bottom') {
    el.classList.add('state-surgery');
  } else {
    el.classList.add('state-condition');
  }

  el.textContent = code;

  // Apply custom color (overrides CSS class color)
  const customColor = _codeColors[code] || getDefaultColorForCode(code);
  applyColorToBox(el, customColor);

  saveToothStatusData();
}

// Apply a hex color to a status box as inline style (font + border tint)
function applyColorToBox(el, hex) {
  if (!el || !hex) return;
  el.style.color = hex;
  el.style.borderColor = hex;
  el.style.backgroundColor = hex + '18'; // ~10% opacity tint
}

// Open a floating color picker anchored to the swatch element.
// Saves the chosen color to _codeColors, refreshes all matching boxes on screen,
// and updates the dropdown swatches live.
function openCodeColorPicker(ev, code) {
  // Remove any existing picker
  document.getElementById('_codeColorPicker')?.remove();

  const swatch = ev.currentTarget || ev.target;
  const currentColor = _codeColors[code] || getDefaultColorForCode(code);

  // Build floating picker panel
  const panel = document.createElement('div');
  panel.id = '_codeColorPicker';
  panel.style.cssText = `
    position:fixed; z-index:999999;
    background:#fff; border:1.5px solid #c8dff6; border-radius:10px;
    box-shadow:0 8px 28px rgba(11,94,168,0.22);
    padding:12px 14px; min-width:200px;
    display:flex; flex-direction:column; gap:10px;
  `;

  // Preset palette
  const presets = [
    '#0b5ea8','#059669','#dc2626','#d97706','#7c3aed',
    '#db2777','#0891b2','#65a30d','#ea580c','#334155'
  ];

  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  presets.forEach(hex => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.title = hex;
    dot.style.cssText = `
      width:22px;height:22px;border-radius:50%;background:${hex};
      border:2px solid ${hex === currentColor ? '#1e293b' : 'transparent'};
      cursor:pointer;flex-shrink:0;transition:transform .1s;
    `;
    dot.addEventListener('mousedown', ev2 => {
      ev2.stopPropagation(); ev2.preventDefault();
      applyCodeColor(code, hex);
      panel.remove();
    });
    presetRow.appendChild(dot);
  });

  // Custom hex input + native color input
  const row2 = document.createElement('div');
  row2.style.cssText = 'display:flex;gap:6px;align-items:center;';

  const nativePicker = document.createElement('input');
  nativePicker.type = 'color';
  nativePicker.value = currentColor;
  nativePicker.title = 'Pick any color';
  nativePicker.style.cssText = 'width:34px;height:28px;border:none;padding:0;cursor:pointer;border-radius:4px;';

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.value = currentColor;
  hexInput.maxLength = 7;
  hexInput.placeholder = '#000000';
  hexInput.style.cssText = `
    flex:1;padding:5px 8px;border:1.5px solid #cbd5e1;border-radius:6px;
    font-size:12px;font-family:monospace;outline:none;
  `;

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.textContent = 'Apply';
  applyBtn.style.cssText = `
    padding:5px 10px;background:#0b5ea8;color:#fff;border:none;
    border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;
  `;

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset';
  resetBtn.style.cssText = `
    padding:5px 8px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;
    border-radius:6px;font-size:12px;cursor:pointer;
  `;

  nativePicker.addEventListener('input', () => { hexInput.value = nativePicker.value; });
  hexInput.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) nativePicker.value = hexInput.value;
  });

  applyBtn.addEventListener('mousedown', ev2 => {
    ev2.stopPropagation(); ev2.preventDefault();
    const hex = hexInput.value;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) { applyCodeColor(code, hex); panel.remove(); }
  });

  resetBtn.addEventListener('mousedown', ev2 => {
    ev2.stopPropagation(); ev2.preventDefault();
    const def = getDefaultColorForCode(code);
    delete _codeColors[code];
    applyCodeColor(code, def, true); // true = skip storing (already deleted)
    panel.remove();
  });

  row2.append(nativePicker, hexInput, applyBtn, resetBtn);
  panel.append(
    Object.assign(document.createElement('div'), {
      textContent: `Color for "${code}"`,
      style: 'font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;'
    }),
    presetRow,
    row2
  );
  document.body.appendChild(panel);

  // Position near swatch
  const r = swatch.getBoundingClientRect ? swatch.getBoundingClientRect() : { bottom: ev.clientY, left: ev.clientX, right: ev.clientX };
  let top  = r.bottom + 4;
  let left = r.left;
  const pw = 214, ph = 130;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 4;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  panel.style.top  = Math.max(6, top)  + 'px';
  panel.style.left = Math.max(6, left) + 'px';

  // Close when clicking outside
  setTimeout(() => {
    document.addEventListener('mousedown', function outsideClick(e) {
      if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('mousedown', outsideClick); }
    });
  }, 50);
}

// Apply a color to a code globally: update _codeColors, refresh all matching boxes,
// and refresh the dropdown swatches if it's still open.
function applyCodeColor(code, hex, skipStore = false) {
  if (!skipStore) _codeColors[code] = hex;

  // Refresh every on-screen sbox that currently shows this code
  document.querySelectorAll(`.dc-sbox[data-tooth]`).forEach(box => {
    if (box.textContent.trim() === code) applyColorToBox(box, hex);
  });

  // Refresh swatches in the open dropdown
  document.querySelectorAll(`#toothCodeDropdown .tcd-color-swatch[data-pickcode="${code}"]`).forEach(sw => {
    sw.style.background = hex;
  });
  document.querySelectorAll(`#toothCodeDropdown .tcd-code`).forEach(codeEl => {
    if (codeEl.textContent.trim() === code) {
      codeEl.style.color = hex;
      codeEl.style.borderColor = hex;
      codeEl.style.background = hex + '22';
    }
  });

  // Refresh the code-color chips inside the tooth drawing modal (if open)
  if (toothDrawModal && !toothDrawModal.classList.contains('hidden')) {
    const chip = document.querySelector(`#tmCodeColors .tm-code-chip[data-code="${code}"]`);
    if (chip) {
      chip.dataset.color = hex;
      chip.style.border = `1.5px solid ${hex}`;
      chip.style.background = `${hex}18`;
      chip.style.color = hex;
      const dot = chip.querySelector('span');
      if (dot) dot.style.background = hex;
      // If this chip is the active brush, update currentColor too
      if (chip.style.outline && chip.style.outline !== 'none') {
        currentColor = hex;
      }
    }
  }

  saveToothStatusData();
}

// Build a unified tooth column: num + status boxes + tooth button (all in one flex column).
// position='upper': number on top, boxes in middle, tooth button at bottom (nearest midline).
// position='lower': tooth button on top (nearest midline), boxes in middle, number at bottom.
// This guarantees perfect alignment - no cross-row positioning needed.
function buildToothCol(num, isTemp, position) {
  const data     = toothStatusData[num] || { top: null, bottom: null };
  const tempCls  = isTemp ? ' dc-sbox-temp' : '';
  const topState = data.top    ? ` state-${getBoxState(data.top,  'top')}`    : '';
  const botState = data.bottom ? ` state-${getBoxState(data.bottom,'bottom')}` : '';

  // Inline color styles so custom colors survive re-renders
  const topColor = data.top    ? (_codeColors[data.top]    || getDefaultColorForCode(data.top))    : null;
  const botColor = data.bottom ? (_codeColors[data.bottom] || getDefaultColorForCode(data.bottom)) : null;
  const topStyle = topColor ? ` style="color:${topColor};border-color:${topColor};background-color:${topColor}18;"` : '';
  const botStyle = botColor ? ` style="color:${botColor};border-color:${botColor};background-color:${botColor}18;"` : '';

  const numLabel = `<div class="dc-tooth-num">${num}</div>`;
  const topBox   = `<div class="dc-sbox dc-sbox-top${tempCls}${topState}" data-tooth="${num}" data-boxtype="top" data-istemp="${isTemp}" title="Restoration/Condition - Tooth ${num}"${topStyle}>${data.top || ''}</div>`;
  const botBox   = `<div class="dc-sbox dc-sbox-bottom${tempCls}${botState}" data-tooth="${num}" data-boxtype="bottom" data-istemp="${isTemp}" title="Surgery - Tooth ${num}"${botStyle}>${data.bottom || ''}</div>`;
  const toothBtn = `<button class="dc-tooth${isTemp ? ' dc-tooth-temp' : ''}" data-tooth="${num}">${num}</button>`;

  return position === 'lower'
    ? `<div class="dc-col">${toothBtn}${topBox}${botBox}${numLabel}</div>`
    : `<div class="dc-col">${numLabel}${topBox}${botBox}${toothBtn}</div>`;
}

function getBoxState(code, boxType) {
  if (code === '/')  return 'present';
  if (boxType === 'bottom') return 'surgery';
  return 'condition';
}

async function saveToothStatusData() {
  if (!currentPatientGroup?.folderName) return;
  try {
    const payload = { ...toothStatusData, __codeColors: _codeColors };
    const res = await authFetch(`/save-tooth-status/${encodeURIComponent(currentPatientGroup.folderName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const statusEl = document.getElementById('dcAutoSaveStatus');
      if (statusEl) {
        statusEl.textContent = 'Saved';
        statusEl.style.color = '#059669';
        clearTimeout(statusEl._clearTimer);
        statusEl._clearTimer = setTimeout(() => { statusEl.textContent = ''; }, 2000);
      }
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('Failed to save tooth status:', err);
    const statusEl = document.getElementById('dcAutoSaveStatus');
    if (statusEl) {
      statusEl.textContent = 'Save failed';
      statusEl.style.color = '#dc2626';
    }
  }
}

async function loadToothStatusData() {
  if (!currentPatientGroup?.folderName) return;
  try {
    const res = await authFetch(`/get-tooth-status/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) { toothStatusData = {}; _codeColors = {}; return; }
    const raw = await res.json();
    _codeColors = raw.__codeColors || {};
    // Strip the reserved key so it doesn't pollute tooth status
    const { __codeColors: _, ...statusOnly } = raw;
    toothStatusData = statusOnly;
  } catch {
    toothStatusData = {};
    _codeColors = {};
  }
}

