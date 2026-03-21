/* =========================================================
   DENTAL CHART FUNCTIONS - WITH TWO-BOX TOOTH STATUS
   ========================================================= */
async function renderDentalChartInterface() {
  // Try pmDentalChart first, then fall back to pmDentalChartView itself
  let container = document.getElementById('pmDentalChart');
  if (!container) {
    // pmDentalChart div may not exist in this HTML version — use the view container
    container = document.getElementById('pmDentalChartView');
  }
  if (!container) return;

  // Load saved tooth status first
  await loadToothStatusData();

  container.innerHTML = '';

  container.innerHTML = `
    <div class="dental-chart-controls">
      <span id="dcAutoSaveStatus" style="font-size:12px;color:#64748b;margin-left:6px;"></span>
    </div>

    <!-- Box legend -->
    <div class="dc-box-legend" style="padding:0 4px 6px; gap:6px 14px;">
      <div style="width:100%;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px;">
        ▲ Top box = Restoration/Condition &nbsp;|&nbsp; ▼ Bottom box = Surgery
      </div>
      ${ALL_CODE_OPTIONS.map(opt => {
        const color = _codeColors[opt.code] || opt.defaultColor;
        return `<div class="dc-box-legend-item" style="color:${color};font-weight:600;">
          <span style="display:inline-block;min-width:28px;padding:1px 4px;border-radius:3px;border:1.5px solid ${color};background:${color}18;text-align:center;font-size:10px;font-weight:700;">${opt.code}</span>
          <span style="color:#475569;font-weight:400;">${opt.label}</span>
        </div>`;
      }).join('')}
    </div>

    <!-- Scrollable wrapper keeps chart intact on any screen width -->
    <div class="dental-chart-wrap">
      <div class="dental-chart-container">

        <!-- TEMPORARY UPPER TEETH (55-51 | 61-65) -->
        <div class="dc-arch-row">
          <div class="dc-side-label">TEMPORARY<br>UPPER</div>
          <div class="dc-half dc-half-right">
            ${[55,54,53,52,51].map(n => buildToothCol(n, true, 'upper')).join('')}
          </div>
          <div class="dc-midline"></div>
          <div class="dc-half dc-half-left">
            ${[61,62,63,64,65].map(n => buildToothCol(n, true, 'upper')).join('')}
          </div>
          <div class="dc-side-label-right"></div>
        </div>

        <!-- PERMANENT UPPER TEETH (18-11 | 21-28) -->
        <div class="dc-arch-row">
          <div class="dc-side-label">PERMANENT<br>UPPER</div>
          <div class="dc-half dc-half-right">
            ${[18,17,16,15,14,13,12,11].map(n => buildToothCol(n, false, 'upper')).join('')}
          </div>
          <div class="dc-midline"></div>
          <div class="dc-half dc-half-left">
            ${[21,22,23,24,25,26,27,28].map(n => buildToothCol(n, false, 'upper')).join('')}
          </div>
          <div class="dc-side-label-right"></div>
        </div>

        <!-- BOLD HORIZONTAL MIDLINE SEPARATOR -->
        <div class="dc-horizontal-midline"></div>

        <!-- PERMANENT LOWER TEETH (48-41 | 31-38) -->
        <div class="dc-arch-row">
          <div class="dc-side-label">PERMANENT<br>LOWER</div>
          <div class="dc-half dc-half-right">
            ${[48,47,46,45,44,43,42,41].map(n => buildToothCol(n, false, 'lower')).join('')}
          </div>
          <div class="dc-midline"></div>
          <div class="dc-half dc-half-left">
            ${[31,32,33,34,35,36,37,38].map(n => buildToothCol(n, false, 'lower')).join('')}
          </div>
          <div class="dc-side-label-right"></div>
        </div>

        <!-- TEMPORARY LOWER TEETH (85-81 | 71-75) -->
        <div class="dc-arch-row">
          <div class="dc-side-label">TEMPORARY<br>LOWER</div>
          <div class="dc-half dc-half-right">
            ${[85,84,83,82,81].map(n => buildToothCol(n, true, 'lower')).join('')}
          </div>
          <div class="dc-midline"></div>
          <div class="dc-half dc-half-left">
            ${[71,72,73,74,75].map(n => buildToothCol(n, true, 'lower')).join('')}
          </div>
          <div class="dc-side-label-right"></div>
        </div>

      <div class="dc-section dc-clinical-section">
        <h4>Periodontal Screening</h4>
        <div class="dc-clinical-grid">
          <label class="dc-check-label"><input type="checkbox" id="dc_perio_gingivitis" value="Gingivitis" /><span>Gingivitis</span></label>
          <label class="dc-check-label"><input type="checkbox" id="dc_perio_early" value="Early Periodontitis" /><span>Early Periodontitis</span></label>
          <label class="dc-check-label"><input type="checkbox" id="dc_perio_moderate" value="Moderate Periodontitis" /><span>Moderate Periodontitis</span></label>
          <label class="dc-check-label"><input type="checkbox" id="dc_perio_advanced" value="Advanced Periodontitis" /><span>Advanced Periodontitis</span></label>
        </div>
      </div>

      <div class="dc-section dc-clinical-section">
        <h4>Occlusion</h4>
        <div class="dc-clinical-grid dc-occlusion-grid">
          <div class="dc-occlusion-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_occ_class" value="Class (Molar)" /><span>Class (Molar)</span></label>
            <div class="dc-class-options" id="dc_class_options" style="display:none;">
              <label class="dc-radio-label"><input type="radio" name="dc_molar_class" value="I" /> <span>Class I</span></label>
              <label class="dc-radio-label"><input type="radio" name="dc_molar_class" value="II" /> <span>Class II</span></label>
              <label class="dc-radio-label"><input type="radio" name="dc_molar_class" value="III" /> <span>Class III</span></label>
            </div>
          </div>
          <div class="dc-measurement-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_occ_overjet" value="Overjet" /><span>Overjet</span></label>
            <div class="dc-mm-input"><input type="number" id="dc_overjet_mm" min="0" step="0.1" placeholder="0" class="dc-num-input" /><span class="dc-mm-unit">mm</span></div>
          </div>
          <div class="dc-measurement-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_occ_overbite" value="Overbite" /><span>Overbite</span></label>
            <div class="dc-mm-input"><input type="number" id="dc_overbite_mm" min="0" step="0.1" placeholder="0" class="dc-num-input" /><span class="dc-mm-unit">mm</span></div>
          </div>
          <div class="dc-measurement-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_occ_midline" value="Midline Deviation" /><span>Midline Deviation</span></label>
            <div class="dc-mm-input"><input type="number" id="dc_midline_mm" min="0" step="0.1" placeholder="0" class="dc-num-input" /><span class="dc-mm-unit">mm</span></div>
          </div>
          <label class="dc-check-label"><input type="checkbox" id="dc_occ_crossbite" value="Crossbite" /><span>Crossbite</span></label>
        </div>
      </div>

      <div class="dc-section dc-clinical-section">
        <h4>Appliances</h4>
        <div class="dc-clinical-grid">
          <label class="dc-check-label"><input type="checkbox" id="dc_app_ortho" value="Orthodontic" /><span>Orthodontic</span></label>
          <label class="dc-check-label"><input type="checkbox" id="dc_app_stayplate" value="Stayplate" /><span>Stayplate</span></label>
          <div class="dc-other-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_app_other_chk" value="Other" /><span>Other</span></label>
            <input type="text" id="dc_app_other_text" placeholder="Specify other appliance..." class="dc-other-input" />
          </div>
        </div>
      </div>

      <div class="dc-section dc-clinical-section">
        <h4>TMD (Temporomandibular Disorders)</h4>
        <div class="dc-clinical-grid">
          <label class="dc-check-label"><input type="checkbox" id="dc_tmd_clenching" value="Clenching" /><span>Clenching</span></label>
          <label class="dc-check-label"><input type="checkbox" id="dc_tmd_clicking" value="Clicking" /><span>Clicking</span></label>
          <label class="dc-check-label"><input type="checkbox" id="dc_tmd_trismus" value="Trismus" /><span>Trismus</span></label>
          <label class="dc-check-label"><input type="checkbox" id="dc_tmd_spasm" value="Muscle Spasm" /><span>Muscle Spasm</span></label>
        </div>
      </div>

      <div class="dc-section dc-clinical-section">
        <h4>X-ray Taken</h4>
        <div class="dc-clinical-grid">
          <div class="dc-xray-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_xray_periapical" value="Periapical" /><span>Periapical</span></label>
            <span class="dc-xray-sublabel">(Tth No.:</span>
            <input type="text" id="dc_xray_periapical_teeth" placeholder="e.g. 11, 12, 21" class="dc-other-input dc-xray-input" />
            <span class="dc-xray-sublabel">)</span>
          </div>
          <div class="dc-xray-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_xray_panoramic" value="Panoramic" /><span>Panoramic</span></label>
          </div>
          <div class="dc-xray-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_xray_cephalometric" value="Cephalometric" /><span>Cephalometric</span></label>
          </div>
          <div class="dc-xray-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_xray_occlusal" value="Occlusal (Upper/Lower)" /><span>Occlusal (Upper/Lower)</span></label>
          </div>
          <div class="dc-xray-row dc-other-row">
            <label class="dc-check-label"><input type="checkbox" id="dc_xray_others_chk" value="Others" /><span>Others:</span></label>
            <input type="text" id="dc_xray_others_text" placeholder="Specify other x-rays..." class="dc-other-input" />
          </div>
        </div>
      </div>
    </div>
    </div>
  `;

  // Use event delegation on the container for .dc-sbox clicks
  container.addEventListener('click', (e) => {
    const sbox = e.target.closest('.dc-sbox');
    if (!sbox) return;
    e.stopPropagation();
    const toothNum = parseInt(sbox.dataset.tooth);
    const boxType = sbox.dataset.boxtype;
    const isTemp = sbox.dataset.istemp === 'true';
    // Pass the actual sbox element so dropdown positions correctly beside it
    openToothCodeDropdown(e, toothNum, boxType, isTemp, sbox);
  });

  // Tooth drawing click handlers
  container.querySelectorAll('.dc-tooth').forEach(tooth => {
    tooth.addEventListener('click', () => {
      openToothDrawing(tooth.dataset.tooth);
    });
  });

  // Color palette for drawing
  container.querySelectorAll('.dc-color').forEach(color => {
    color.addEventListener('click', () => {
      container.querySelectorAll('.dc-color').forEach(c => c.classList.remove('active'));
      color.classList.add('active');
      currentColor = color.dataset.color;
    });
  });

  const classChk = document.getElementById('dc_occ_class');
  const classOptions = document.getElementById('dc_class_options');
  classChk?.addEventListener('change', () => {
    classOptions.style.display = classChk.checked ? 'flex' : 'none';
  });

  // Auto-save clinical data
  let _dcSaveTimer = null;
  function scheduleDcAutoSave() {
    clearTimeout(_dcSaveTimer);
    const statusEl = document.getElementById('dcAutoSaveStatus');
    if (statusEl) statusEl.textContent = 'Saving…';
    _dcSaveTimer = setTimeout(async () => {
      await saveDentalChartClinicalData(true);
    }, 800);
  }

  // auto-save listeners use the resolved container variable (already correct above)
  container.addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"], input[type="radio"]')) scheduleDcAutoSave();
  });
  container.addEventListener('input', (e) => {
    if (e.target.matches('input[type="number"], input[type="text"]')) scheduleDcAutoSave();
  });

  loadDentalChartClinicalData();
}

/* =========================================================
   DENTAL CHART CLINICAL DATA - SAVE / LOAD
   ========================================================= */
function collectDentalChartClinicalData() {
  const data = {};

  const perioFields = ['dc_perio_gingivitis', 'dc_perio_early', 'dc_perio_moderate', 'dc_perio_advanced'];
  data.periodontalScreening = perioFields
    .filter(id => document.getElementById(id)?.checked)
    .map(id => document.getElementById(id).value);

  const occFields = ['dc_occ_class', 'dc_occ_overjet', 'dc_occ_overbite', 'dc_occ_midline', 'dc_occ_crossbite'];
  data.occlusion = occFields
    .filter(id => document.getElementById(id)?.checked)
    .map(id => document.getElementById(id).value);

  const molarClassEl = document.querySelector('input[name="dc_molar_class"]:checked');
  data.molarClass = molarClassEl ? molarClassEl.value : '';

  data.overjetMm = document.getElementById('dc_overjet_mm')?.value || '';
  data.overbitemm = document.getElementById('dc_overbite_mm')?.value || '';
  data.midlineDeviationMm = document.getElementById('dc_midline_mm')?.value || '';

  const appFields = ['dc_app_ortho', 'dc_app_stayplate', 'dc_app_other_chk'];
  data.appliances = appFields
    .filter(id => document.getElementById(id)?.checked)
    .map(id => document.getElementById(id).value);
  data.appliancesOther = document.getElementById('dc_app_other_text')?.value || '';

  const tmdFields = ['dc_tmd_clenching', 'dc_tmd_clicking', 'dc_tmd_trismus', 'dc_tmd_spasm'];
  data.tmd = tmdFields
    .filter(id => document.getElementById(id)?.checked)
    .map(id => document.getElementById(id).value);

  const xrayFields = ['dc_xray_periapical', 'dc_xray_panoramic', 'dc_xray_cephalometric', 'dc_xray_occlusal', 'dc_xray_others_chk'];
  data.xrayTaken = xrayFields
    .filter(id => document.getElementById(id)?.checked)
    .map(id => document.getElementById(id).value);
  data.periapicalTeethNo = document.getElementById('dc_xray_periapical_teeth')?.value || '';
  data.xrayTaken_other   = document.getElementById('dc_xray_others_text')?.value || '';

  data._savedAt = new Date().toISOString();

  return data;
}

async function saveDentalChartClinicalData(silent = false) {
  if (!currentPatientGroup?.folderName) return;

  const data = collectDentalChartClinicalData();
  const statusEl = document.getElementById('dcAutoSaveStatus');

  try {
    const res = await authFetch(`/save-dental-info/${encodeURIComponent(currentPatientGroup.folderName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error('Save failed');

    dentalChartClinicalData = data;

    if (statusEl) {
      statusEl.textContent = '/ Saved';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    }
    if (!silent && pmMessage) {
      pmMessage.textContent = '/ Clinical data saved!';
      pmMessage.className = 'pm-message';
      setTimeout(() => { pmMessage.textContent = ''; }, 3000);
    }
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = 'Save failed';
    if (!silent && pmMessage) {
      pmMessage.textContent = 'Failed to save clinical data';
      pmMessage.className = 'pm-message error';
    }
  }
}

async function loadDentalChartClinicalData() {
  if (!currentPatientGroup?.folderName) return;

  try {
    const res = await authFetch(`/get-dental-info/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) return;

    const records = await res.json();
    if (!records || records.length === 0) return;

    const latest = records[records.length - 1];
    dentalChartClinicalData = latest;

    applyDentalChartClinicalData(latest);
  } catch (err) {
    console.error('Failed to load dental chart clinical data:', err);
  }
}

function applyDentalChartClinicalData(data) {
  if (!data) return;

  const perioMap = {
    'Gingivitis': 'dc_perio_gingivitis',
    'Early Periodontitis': 'dc_perio_early',
    'Moderate Periodontitis': 'dc_perio_moderate',
    'Advanced Periodontitis': 'dc_perio_advanced'
  };
  (data.periodontalScreening || []).forEach(val => {
    const el = document.getElementById(perioMap[val]);
    if (el) el.checked = true;
  });

  const occMap = {
    'Class (Molar)': 'dc_occ_class',
    'Overjet': 'dc_occ_overjet',
    'Overbite': 'dc_occ_overbite',
    'Midline Deviation': 'dc_occ_midline',
    'Crossbite': 'dc_occ_crossbite'
  };
  (data.occlusion || []).forEach(val => {
    const el = document.getElementById(occMap[val]);
    if (el) el.checked = true;
  });

  const classChk = document.getElementById('dc_occ_class');
  const classOptions = document.getElementById('dc_class_options');
  if (classChk?.checked && classOptions) {
    classOptions.style.display = 'flex';
  }

  if (data.molarClass) {
    const radioEl = document.querySelector(`input[name="dc_molar_class"][value="${data.molarClass}"]`);
    if (radioEl) radioEl.checked = true;
  }

  if (data.overjetMm) { const el = document.getElementById('dc_overjet_mm'); if (el) el.value = data.overjetMm; }
  if (data.overbitemm) { const el = document.getElementById('dc_overbite_mm'); if (el) el.value = data.overbitemm; }
  if (data.midlineDeviationMm) { const el = document.getElementById('dc_midline_mm'); if (el) el.value = data.midlineDeviationMm; }

  const appMap = {
    'Orthodontic': 'dc_app_ortho',
    'Stayplate': 'dc_app_stayplate',
    'Other': 'dc_app_other_chk'
  };
  (data.appliances || []).forEach(val => {
    const el = document.getElementById(appMap[val]);
    if (el) el.checked = true;
  });
  if (data.appliancesOther) {
    const el = document.getElementById('dc_app_other_text');
    if (el) el.value = data.appliancesOther;
  }

  const tmdMap = {
    'Clenching': 'dc_tmd_clenching',
    'Clicking': 'dc_tmd_clicking',
    'Trismus': 'dc_tmd_trismus',
    'Muscle Spasm': 'dc_tmd_spasm'
  };
  (data.tmd || []).forEach(val => {
    const el = document.getElementById(tmdMap[val]);
    if (el) el.checked = true;
  });

  const xrayMap = {
    'Periapical':          'dc_xray_periapical',
    'Panoramic':           'dc_xray_panoramic',
    'Cephalometric':       'dc_xray_cephalometric',
    'Occlusal (Upper/Lower)': 'dc_xray_occlusal',
    'Others':              'dc_xray_others_chk'
  };
  (data.xrayTaken || []).forEach(val => {
    const el = document.getElementById(xrayMap[val]);
    if (el) el.checked = true;
  });
  if (data.periapicalTeethNo) {
    const el = document.getElementById('dc_xray_periapical_teeth');
    if (el) el.value = data.periapicalTeethNo;
  }
  if (data.xrayTaken_other) {
    const el = document.getElementById('dc_xray_others_text');
    if (el) el.value = data.xrayTaken_other;
  }
}

async function exportDentalChartPDF() {
  if (!currentPatientGroup) {
    alert('No patient selected');
    return;
  }

  await saveDentalChartClinicalData(true);

  try {
    if (pmMessage) pmMessage.textContent = 'Generating PDF...';
    const res = await authFetch(`/export-dental-chart/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) throw new Error('Export failed');
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DentalChart_${currentPatientGroup.lastName}-${currentPatientGroup.firstName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    
    if (pmMessage) {
      pmMessage.textContent = 'PDF Exported!';
      setTimeout(() => pmMessage.textContent = '', 3000);
    }
  } catch (err) {
    console.error(err);
    if (pmMessage) pmMessage.textContent = 'Export failed';
  }
}

