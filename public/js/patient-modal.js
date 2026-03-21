/* =========================================================
   PATIENT MODAL FUNCTIONS
   ========================================================= */

async function showPmView(viewName) {
  pmListView.style.display = 'none';
  pmDetailView.style.display = 'none';
  pmDentalChartView.style.display = 'none';
  pmTreatmentRecordsView.style.display = 'none';

  const tabs = document.querySelectorAll('.pm-tab');
  tabs.forEach(tab => tab.classList.remove('active'));

  switch(viewName) {
    case 'list':
      pmListView.style.display = 'flex';
      document.getElementById('pmViewInfo')?.classList.add('active');
      break;
    case 'detail':
      pmDetailView.style.display = 'flex';
      break;
    case 'dentalChart':
      pmDentalChartView.style.display = 'flex';
      document.getElementById('pmViewDentalChart')?.classList.add('active');
      await renderDentalChartInterface();
      break;
    case 'treatmentRecords':
      pmTreatmentRecordsView.style.display = 'flex';
      document.getElementById('pmViewTreatmentRecords')?.classList.add('active');
      loadTreatmentRecords();
      break;
  }
}

function openPatientModal(group) {
  currentPatientGroup = group;

  pmName.textContent = `${group.lastName}, ${group.firstName}${group.middleName ? ' ' + group.middleName : ''}`;
  pmSub.textContent = `Born: ${group.birthdate || 'Unknown'}  ${group.appointments.length} visit${group.appointments.length !== 1 ? 's' : ''}`;

  if (group.photoPath) {
    pmPhoto.src = group.photoPath;
    pmPhoto.style.display = 'block';
    pmPhoto.style.width = '100%';
    pmPhoto.style.height = '100%';
    pmPhoto.style.objectFit = 'cover';
    pmPhoto.style.borderRadius = '50%';
  } else {
    pmPhoto.src = '';
    pmPhoto.style.display = 'none';
  }

  populatePatientInfo(group);
  patientModal.classList.remove('hidden');
  showPmView('list');
}

// ── Section definitions: icon, accent colour, field keys ─────────────────
const PI_SECTIONS = [
  {
    key: 'reason',
    title: 'Reason for Visit',
    icon: '',
    color: '#7c3aed',
    bg: '#faf5ff',
    border: '#e9d5ff',
    fields: ['reasonForConsult', 'referredBy'],
    wide: ['reasonForConsult']
  },
  {
    key: 'personal',
    title: 'Personal Information',
    icon: '',
    color: '#0b5ea8',
    bg: '#f0f7ff',
    border: '#bfdbfe',
    fields: ['lastName', 'firstName', 'middleName', 'nickname', 'birthdate', 'age', 'sex', 'nationality', 'religion', 'occupation']
  },
  {
    key: 'contact',
    title: 'Contact Details',
    icon: '',
    color: '#0891b2',
    bg: '#f0fdfe',
    border: '#a5f3fc',
    fields: ['mobileNo', 'email', 'homeAddress', 'homeNo', 'officeNo', 'faxNo'],
    wide: ['homeAddress', 'email']
  },
  {
    key: 'insurance',
    title: 'Insurance',
    icon: '',
    color: '#059669',
    bg: '#f0fdf4',
    border: '#a7f3d0',
    fields: ['dentalInsurance', 'insuranceEffectiveDate', 'policyNo']
  },
  {
    key: 'guardian',
    title: 'Guardian / Emergency Contact',
    icon: '',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    fields: ['guardianName', 'guardianOccupation', 'guardianContact']
  },
  {
    key: 'medical',
    title: 'Medical Information',
    icon: '',
    color: '#dc2626',
    bg: '#fff5f5',
    border: '#fecaca',
    fields: ['physicianName', 'physicianSpecialty', 'physicianContact', 'physicianOfficeAddress',
             'bloodType', 'bloodPressure', 'allergies', 'conditions',
             'q1_goodHealth', 'q2_underTreatment', 'q2_conditionBeingTreated',
             'q3_seriousIllness', 'q3_illnessOperation', 'q4_hospitalized', 'q4_whenWhy',
             'q5_takingMed', 'q5_whatMedications', 'q6_tobacco', 'q7_drugs',
             'q10_pregnant', 'q10_nursing', 'q10_birthControl', 'q9_bleedingTime'],
    wide: ['physicianOfficeAddress', 'allergies', 'conditions', 'q5_whatMedications']
  },
  {
    key: 'dental',
    title: 'Dental History',
    icon: '',
    color: '#0b5ea8',
    bg: '#f0f7ff',
    border: '#bfdbfe',
    fields: ['previousDentist', 'lastDentalVisit', 'visitFrequency', 'previousTreatments',
             'brushingFrequency', 'flossUse', 'oralHabits'],
    wide: ['previousTreatments']
  },
  {
    key: 'consent',
    title: 'Consent & Signature',
    icon: '',
    color: '#7c3aed',
    bg: '#faf5ff',
    border: '#e9d5ff',
    fields: ['consent_treatment', 'consent_drugs', 'consent_changes', 'consent_xray',
             'consent_extraction', 'consent_crowns', 'consent_rootcanal', 'consent_periodontal',
             'consent_fillings', 'consent_dentures', 'consentSignature', 'consentSignedDate'],
    wide: ['consentSignature']
  }
];

// Friendly labels for all known fields
const PI_LABELS = {
  reasonForConsult: 'Reason for Visit', referredBy: 'Referred By',
  lastName: 'Last Name', firstName: 'First Name', middleName: 'Middle Name',
  nickname: 'Nickname', birthdate: 'Date of Birth', age: 'Age', sex: 'Sex',
  nationality: 'Nationality', religion: 'Religion', occupation: 'Occupation',
  mobileNo: 'Mobile', email: 'Email', homeAddress: 'Home Address',
  homeNo: 'Home Phone', officeNo: 'Office Phone', faxNo: 'Fax',
  dentalInsurance: 'Insurance Provider', insuranceEffectiveDate: 'Effective Date', policyNo: 'Policy No.',
  guardianName: 'Guardian Name', guardianOccupation: 'Occupation', guardianContact: 'Contact No.',
  physicianName: 'Physician', physicianSpecialty: 'Specialty',
  physicianContact: 'Physician Contact', physicianOfficeAddress: 'Physician Address',
  bloodType: 'Blood Type', bloodPressure: 'Blood Pressure',
  allergies: 'Allergies', conditions: 'Health Conditions',
  q1_goodHealth: 'In Good Health?', q2_underTreatment: 'Under Treatment?',
  q2_conditionBeingTreated: 'Condition Being Treated', q3_seriousIllness: 'Serious Illness/Surgery?',
  q3_illnessOperation: 'Illness/Operation Details', q4_hospitalized: 'Ever Hospitalized?',
  q4_whenWhy: 'When/Why Hospitalized', q5_takingMed: 'Taking Medications?',
  q5_whatMedications: 'Medications', q6_tobacco: 'Uses Tobacco?',
  q7_drugs: 'Uses Alcohol/Drugs?', q9_bleedingTime: 'Bleeding Time',
  q10_pregnant: 'Pregnant?', q10_nursing: 'Nursing?', q10_birthControl: 'Birth Control?',
  previousDentist: 'Previous Dentist', lastDentalVisit: 'Last Visit',
  visitFrequency: 'Visit Frequency', previousTreatments: 'Previous Treatments',
  brushingFrequency: 'Brushing Frequency', flossUse: 'Floss Use', oralHabits: 'Oral Habits',
  consent_treatment: 'Treatment', consent_drugs: 'Drugs & Medications',
  consent_changes: 'Treatment Changes', consent_xray: 'X-Ray',
  consent_extraction: 'Extraction', consent_crowns: 'Crowns & Bridges',
  consent_rootcanal: 'Root Canal', consent_periodontal: 'Periodontal',
  consent_fillings: 'Fillings', consent_dentures: 'Dentures',
  consentSignature: 'Signed By', consentSignedDate: 'Date Signed'
};

// ── Predefined option sets for every multi-value field ──────────────────────
const TAG_OPTIONS = {
  allergies: [
    'Local Anesthetic (ex. Lidocaine)', 'Penicillin / Antibiotics',
    'Sulfa drugs', 'Aspirin', 'Latex'
  ],
  conditions: [
    'High Blood Pressure', 'Low Blood Pressure', 'Heart Disease', 'Heart Murmur',
    'Heart Attack', 'Heart Surgery', 'Angina', 'Rheumatic Fever', 'Stroke',
    'Anemia', 'Bleeding Problems', 'Blood Diseases', 'Diabetes', 'Cancer / Tumors',
    'Hepatitis / Liver Disease', 'Hepatitis / Jaundice', 'Tuberculosis',
    'AIDS or HIV Infection', 'Sexually Transmitted disease', 'Asthma', 'Emphysema',
    'Respiratory Problems', 'Hay Fever / Allergies', 'Kidney disease',
    'Thyroid Problem', 'Arthritis / Rheumatism', 'Joint Replacement / Implant',
    'Head Injuries', 'Seizure / Epilepsy', 'Fainting / Syncope', 'Swollen ankles',
    'Rapid weight Loss', 'Radiation Therapy', 'Chest pain', 'Stomach troubles / Ulcers'
  ],
  periodontalScreening: [
    'Gingivitis', 'Early Periodontitis', 'Moderate Periodontitis', 'Advanced Periodontitis'
  ],
  occlusion: [
    'Class (Molar)', 'Overjet', 'Overbite', 'Midline Deviation', 'Crossbite'
  ],
  appliances: ['Orthodontic', 'Stayplate', 'Other'],
  tmd: ['Clenching', 'Clicking', 'Trismus', 'Muscle Spasm'],
  xrayTaken: ['Periapical', 'Panoramic', 'Cephalometric', 'Occlusal (Upper/Lower)', 'Others']
};

// Colour themes per field type
const TAG_COLORS = {
  allergies:            { tag: '#fef3c7', tagText: '#92400e', tagBorder: '#fde68a', pill: '#fbbf24', pillText: '#78350f', add: '#f59e0b' },
  conditions:           { tag: '#fee2e2', tagText: '#991b1b', tagBorder: '#fecaca', pill: '#ef4444', pillText: '#7f1d1d', add: '#dc2626' },
  periodontalScreening: { tag: '#f0fdf4', tagText: '#166534', tagBorder: '#bbf7d0', pill: '#10b981', pillText: '#064e3b', add: '#059669' },
  occlusion:            { tag: '#eff6ff', tagText: '#1e40af', tagBorder: '#bfdbfe', pill: '#3b82f6', pillText: '#1e3a8a', add: '#2563eb' },
  appliances:           { tag: '#faf5ff', tagText: '#6b21a8', tagBorder: '#e9d5ff', pill: '#8b5cf6', pillText: '#4c1d95', add: '#7c3aed' },
  tmd:                  { tag: '#fff7ed', tagText: '#9a3412', tagBorder: '#fed7aa', pill: '#f97316', pillText: '#7c2d12', add: '#ea580c' },
  xrayTaken:            { tag: '#f0f9ff', tagText: '#0c4a6e', tagBorder: '#bae6fd', pill: '#0891b2', pillText: '#083344', add: '#0284c7' }
};

/**
 * Build a tag-picker widget for a multi-value field.
 * Returns an HTML string. The widget is self-contained via delegated events.
 */
function buildTagPicker(key, currentValues) {
  const options  = TAG_OPTIONS[key] || [];
  const selected = Array.isArray(currentValues) ? [...currentValues] : 
    (currentValues ? String(currentValues).split(',').map(s => s.trim()).filter(Boolean) : []);
  const colors   = TAG_COLORS[key] || TAG_COLORS.conditions;

  const uniqueId = 'tp_' + key + '_' + Date.now();

  // Selected tags row
  const tagsHtml = selected.map(val => `
    <span class="pi-tag" data-tag-picker="${uniqueId}" data-value="${val.replace(/"/g,'&quot;')}"
          style="background:${colors.tag};color:${colors.tagText};border-color:${colors.tagBorder}">
      ${val}
      <button class="pi-tag-remove" type="button" title="Remove"
              data-tag-picker="${uniqueId}" data-value="${val.replace(/"/g,'&quot;')}"
              style="color:${colors.tagText}">×</button>
    </span>`).join('');

  // Available option pills (not yet selected)
  const available = options.filter(o => !selected.includes(o));
  const pillsHtml = available.map(opt => `
    <button class="pi-tag-option" type="button"
            data-tag-picker="${uniqueId}" data-value="${opt.replace(/"/g,'&quot;')}"
            style="background:#f8fafc;color:#475569;border-color:#e2e8f0">
      + ${opt}
    </button>`).join('');

  // Custom input for values not in the predefined list
  const hasCustom = selected.filter(v => !options.includes(v));

  return `
    <div class="pi-tag-picker" id="${uniqueId}"
         data-field="${key}"
         data-selected='${JSON.stringify(selected).replace(/'/g,'&#39;')}'>
      <div class="pi-tag-selected">
        ${tagsHtml}
        <span class="pi-tag-empty" style="${selected.length ? 'display:none' : ''}">None selected</span>
      </div>
      ${available.length ? `
      <div class="pi-tag-dropdown">
        <div class="pi-tag-dropdown-label">Add:</div>
        <div class="pi-tag-pills">${pillsHtml}</div>
      </div>` : ''}
      <div class="pi-tag-custom-row">
        <input class="pi-tag-custom-input" type="text" placeholder="Type custom value + Enter"
               data-tag-picker="${uniqueId}" />
        <button class="pi-tag-custom-add" type="button"
                data-tag-picker="${uniqueId}"
                style="background:${colors.add};color:#fff">Add</button>
      </div>
    </div>`;
}

/**
 * Attach tag-picker event delegation on a container element.
 * Call once after the editing UI is rendered.
 */
function attachTagPickerEvents(container) {
  container.addEventListener('click', function handleTagClick(e) {
    // Remove tag
    if (e.target.classList.contains('pi-tag-remove')) {
      const pickerId = e.target.dataset.tagPicker;
      const value    = e.target.dataset.value;
      const picker   = container.querySelector('#' + pickerId);
      if (!picker) return;
      removeTag(picker, value, container);
      return;
    }
    // Add predefined option
    if (e.target.classList.contains('pi-tag-option')) {
      const pickerId = e.target.dataset.tagPicker;
      const value    = e.target.dataset.value;
      const picker   = container.querySelector('#' + pickerId);
      if (!picker) return;
      addTag(picker, value, container);
      return;
    }
    // Add custom value
    if (e.target.classList.contains('pi-tag-custom-add')) {
      const pickerId = e.target.dataset.tagPicker;
      const picker   = container.querySelector('#' + pickerId);
      const input    = picker?.querySelector('.pi-tag-custom-input');
      if (!picker || !input) return;
      const val = input.value.trim();
      if (val) { addTag(picker, val, container); input.value = ''; }
      return;
    }
  });

  container.addEventListener('keydown', function handleTagKeydown(e) {
    if (e.key === 'Enter' && e.target.classList.contains('pi-tag-custom-input')) {
      e.preventDefault();
      const pickerId = e.target.dataset.tagPicker;
      const picker   = container.querySelector('#' + pickerId);
      const val = e.target.value.trim();
      if (picker && val) { addTag(picker, val, container); e.target.value = ''; }
    }
  });
}

function getTagPickerValues(picker) {
  try {
    return JSON.parse(picker.dataset.selected.replace(/&#39;/g, "'"));
  } catch { return []; }
}

function addTag(picker, value, container) {
  const key      = picker.dataset.field;
  const colors   = TAG_COLORS[key] || TAG_COLORS.conditions;
  const selected = getTagPickerValues(picker);
  if (selected.includes(value)) return;
  selected.push(value);
  picker.dataset.selected = JSON.stringify(selected).replace(/'/g, '&#39;');
  rebuildTagPicker(picker, key, selected, colors, container);
}

function removeTag(picker, value, container) {
  const key      = picker.dataset.field;
  const colors   = TAG_COLORS[key] || TAG_COLORS.conditions;
  const selected = getTagPickerValues(picker).filter(v => v !== value);
  picker.dataset.selected = JSON.stringify(selected).replace(/'/g, '&#39;');
  rebuildTagPicker(picker, key, selected, colors, container);
}

function rebuildTagPicker(picker, key, selected, colors, container) {
  const options   = TAG_OPTIONS[key] || [];
  const available = options.filter(o => !selected.includes(o));

  // Rebuild selected tags
  const selectedZone = picker.querySelector('.pi-tag-selected');
  if (selectedZone) {
    const emptyMsg = picker.querySelector('.pi-tag-empty');
    // Remove old tags (keep empty msg)
    selectedZone.querySelectorAll('.pi-tag').forEach(t => t.remove());
    selected.forEach(val => {
      const tag = document.createElement('span');
      tag.className = 'pi-tag';
      tag.dataset.tagPicker = picker.id;
      tag.dataset.value = val;
      tag.style.cssText = `background:${colors.tag};color:${colors.tagText};border-color:${colors.tagBorder}`;
      tag.innerHTML = `${val}<button class="pi-tag-remove" type="button" title="Remove"
        data-tag-picker="${picker.id}" data-value="${val.replace(/"/g,'&quot;')}"
        style="color:${colors.tagText}">×</button>`;
      selectedZone.insertBefore(tag, emptyMsg);
    });
    if (emptyMsg) emptyMsg.style.display = selected.length ? 'none' : '';
  }

  // Rebuild available pills
  let dropdown = picker.querySelector('.pi-tag-dropdown');
  if (available.length) {
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'pi-tag-dropdown';
      dropdown.innerHTML = '<div class="pi-tag-dropdown-label">Add:</div><div class="pi-tag-pills"></div>';
      const customRow = picker.querySelector('.pi-tag-custom-row');
      picker.insertBefore(dropdown, customRow);
    }
    const pillsDiv = dropdown.querySelector('.pi-tag-pills');
    if (pillsDiv) {
      pillsDiv.innerHTML = available.map(opt => `
        <button class="pi-tag-option" type="button"
                data-tag-picker="${picker.id}" data-value="${opt.replace(/"/g,'&quot;')}"
                style="background:#f8fafc;color:#475569;border-color:#e2e8f0">
          + ${opt}
        </button>`).join('');
    }
  } else if (dropdown) {
    dropdown.remove();
  }
}

function getFieldLabel(key) {
  return PI_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).replace(/_/g, ' ').trim();
}

function formatFieldValue(key, raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  // Array values: render as tag pills in view mode
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    const colors = TAG_COLORS[key] || TAG_COLORS.conditions;
    const tags = raw.map(v =>
      `<span class="pi-tag-view" style="background:${colors.tag};color:${colors.tagText};border-color:${colors.tagBorder}">${v}</span>`
    ).join('');
    return `<div class="pi-tags-view">${tags}</div>`;
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Format dates nicely
  if ((key.toLowerCase().includes('date') || key === 'birthdate') && /\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str + 'T00:00:00');
    if (!isNaN(d)) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // Sex display
  if (key === 'sex') return str === 'M' ? 'Male' : str === 'F' ? 'Female' : str;

  return str;
}

// Completion score helpers
function calcCompletion(appt, fields) {
  let filled = 0;
  fields.forEach(f => {
    const v = appt[f];
    if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) filled++;
  });
  return fields.length > 0 ? Math.round((filled / fields.length) * 100) : 100;
}

function populatePatientInfo(group) {
  const container = document.getElementById('pmContent');
  if (!container) return;

  const latestAppt = group.appointments && group.appointments.length > 0
    ? group.appointments[group.appointments.length - 1]
    : {};

  container.dataset.patientData = JSON.stringify(latestAppt);
  container.dataset.folderName  = group.folderName;

  // ── Build each section ──────────────────────────────────────────────────
  const sectionsHtml = PI_SECTIONS.map(sec => {
    // Gather fields that exist in this appointment
    const fieldItems = sec.fields
      .map(key => ({
        key,
        label: getFieldLabel(key),
        value: formatFieldValue(key, latestAppt[key]),
        wide:  (sec.wide || []).includes(key)
      }));

    // Count filled
    const filled = fieldItems.filter(f => f.value !== null).length;
    const total  = fieldItems.length;
    const pct    = total > 0 ? Math.round((filled / total) * 100) : 100;
    const allEmpty = filled === 0;

    // Don't render sections where nothing was filled and it's optional data
    if (allEmpty && ['insurance', 'guardian', 'consent'].includes(sec.key)) return '';

    const fieldsHtml = fieldItems.map(f => {
      const hasValue = f.value !== null;
      const isYesNo  = ['Yes','No'].includes(f.value);
      const yesNoCls = isYesNo ? (f.value === 'Yes' ? 'pi-yesno pi-yes' : 'pi-yesno pi-no') : '';

      return `<div class="pi-field ${f.wide ? 'pi-field-wide' : ''} ${hasValue ? 'pi-has-value' : 'pi-empty-field'}" data-field-key="${f.key}">
        <div class="pi-label">${f.label}</div>
        <div class="pi-value ${yesNoCls}">${hasValue ? f.value : '<span class="pi-not-provided">—</span>'}</div>
      </div>`;
    }).join('');

    return `
      <div class="pi-section" data-section="${sec.key}">
        <div class="pi-section-header" style="--sec-color:${sec.color};--sec-bg:${sec.bg};--sec-border:${sec.border}">
          <span class="pi-section-icon">${sec.icon}</span>
          <span class="pi-section-title">${sec.title}</span>
          <div class="pi-completion">
            <div class="pi-completion-bar">
              <div class="pi-completion-fill" style="width:${pct}%;background:${sec.color}"></div>
            </div>
            <span class="pi-completion-text" style="color:${sec.color}">${filled}/${total}</span>
          </div>
        </div>
        <div class="pi-section-body">
          <div class="pi-fields-grid">${fieldsHtml}</div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="pi-toolbar">
      <button id="pmEditPatientBtn" class="pi-edit-btn">
        Edit Information
      </button>
    </div>
    <div class="pi-sections">${sectionsHtml}</div>`;

  document.getElementById('pmEditPatientBtn')?.addEventListener('click', () => {
    enablePatientEditing(container, group);
  });
}

function formatFieldLabel(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

function enablePatientEditing(container, group) {
  const latestAppt = group.appointments && group.appointments.length > 0
    ? group.appointments[group.appointments.length - 1]
    : {};

  // ── Swap toolbar buttons ──────────────────────────────────────────────
  const toolbar = container.querySelector('.pi-toolbar');
  if (toolbar) toolbar.innerHTML = `
    <button id="pmSavePatientBtn" class="pi-save-btn">
      Save Changes
    </button>
    <button id="pmCancelEditBtn" class="pi-cancel-btn">Cancel</button>
  `;

  // ── Convert every pi-field into an editable control ──────────────────
  container.querySelectorAll('.pi-field').forEach(fieldEl => {
    const key = fieldEl.dataset.fieldKey;
    if (!key) return;

    // Raw value from the appointment record
    let raw = latestAppt[key];

    // Normalise: if a TAG_OPTIONS field came back as a string, split it back
    if (TAG_OPTIONS[key]) {
      if (!raw || (typeof raw === 'string' && !raw.trim())) raw = [];
      else if (typeof raw === 'string') raw = raw.split(',').map(s => s.trim()).filter(Boolean);
      else if (!Array.isArray(raw)) raw = [String(raw)];
    }

    const currentValue = (raw === null || raw === undefined) ? '' : raw;

    // Mark field as editing — hides .pi-value, shows .pi-edit-control
    fieldEl.classList.add('editing');

    // Remove any stale edit control from a previous edit session
    fieldEl.querySelector('.pi-edit-control')?.remove();

    // Build the right control
    let controlHtml = '';

    if (TAG_OPTIONS[key]) {
      // ── Tag picker ───────────────────────────────────────────────────
      controlHtml = `<div class="pi-edit-control">${buildTagPicker(key, currentValue)}</div>`;

    } else if (key === 'sex') {
      const v = String(currentValue);
      controlHtml = `<div class="pi-edit-control">
        <select data-field="${key}">
          <option value=""  ${!v          ? 'selected' : ''}>Select</option>
          <option value="M" ${v === 'M'   ? 'selected' : ''}>Male</option>
          <option value="F" ${v === 'F'   ? 'selected' : ''}>Female</option>
        </select></div>`;

    } else if (key === 'visitFrequency') {
      const v = String(currentValue);
      controlHtml = `<div class="pi-edit-control">
        <select data-field="${key}">
          <option value="">Select</option>
          <option value="Regular" ${v === 'Regular' ? 'selected':''}>Regular (Every 6 months)</option>
          <option value="Only when needed" ${v === 'Only when needed' ? 'selected':''}>Only when needed</option>
          <option value="First visit" ${v === 'First visit' ? 'selected':''}>First visit</option>
        </select></div>`;

    } else if (['q10_pregnant','q10_nursing','q10_birthControl'].includes(key)) {
      const v = String(currentValue);
      controlHtml = `<div class="pi-edit-control">
        <select data-field="${key}">
          <option value="">Select</option>
          <option value="Yes" ${v === 'Yes' ? 'selected':''}>Yes</option>
          <option value="No"  ${v === 'No'  ? 'selected':''}>No</option>
          <option value="N/A" ${v === 'N/A' ? 'selected':''}>N/A</option>
        </select></div>`;

    } else if (/q\d+_/.test(key) && !['q2_conditionBeingTreated','q3_illnessOperation',
               'q4_whenWhy','q5_whatMedications','q9_bleedingTime'].includes(key)) {
      // Yes/No health questions
      const v = String(currentValue);
      controlHtml = `<div class="pi-edit-control">
        <select data-field="${key}">
          <option value="">Select</option>
          <option value="Yes" ${v === 'Yes' ? 'selected':''}>Yes</option>
          <option value="No"  ${v === 'No'  ? 'selected':''}>No</option>
        </select></div>`;

    } else if (key === 'age') {
      controlHtml = `<div class="pi-edit-control">
        <input type="number" data-field="${key}" value="${String(currentValue)}" min="0" max="150" /></div>`;

    } else if (key.toLowerCase().includes('date') || key === 'birthdate'
               || key === 'lastDentalVisit' || key === 'formDate'
               || key === 'consentSignedDate' || key === 'insuranceEffectiveDate') {
      controlHtml = `<div class="pi-edit-control">
        <input type="date" data-field="${key}" value="${String(currentValue)}" /></div>`;

    } else if (key === 'homeAddress' || key === 'physicianOfficeAddress'
               || key === 'previousTreatments' || key === 'reasonForConsult'
               || key === 'q5_whatMedications') {
      const safe = String(currentValue).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      controlHtml = `<div class="pi-edit-control">
        <textarea data-field="${key}" rows="3">${safe}</textarea></div>`;

    } else {
      const safe = String(currentValue).replace(/"/g,'&quot;').replace(/</g,'&lt;');
      controlHtml = `<div class="pi-edit-control">
        <input type="text" data-field="${key}" value="${safe}" /></div>`;
    }

    fieldEl.insertAdjacentHTML('beforeend', controlHtml);
  });

  // Attach tag-picker events once on the container
  attachTagPickerEvents(container);

  document.getElementById('pmSavePatientBtn')?.addEventListener('click', () => {
    savePatientChanges(container, group);
  });

  document.getElementById('pmCancelEditBtn')?.addEventListener('click', () => {
    populatePatientInfo(group);
    pmMessage.textContent = 'Changes cancelled';
    setTimeout(() => pmMessage.textContent = '', 2000);
  });
}

async function savePatientChanges(container, group) {
  const latestAppt = group.appointments[group.appointments.length - 1];
  if (!latestAppt || !latestAppt._id) return;

  const updatedData = { ...latestAppt };

  // Collect tag-picker values
  container.querySelectorAll('.pi-tag-picker').forEach(picker => {
    updatedData[picker.dataset.field] = getTagPickerValues(picker);
  });

  // Collect all other inputs / selects / textareas from edit controls
  container.querySelectorAll('.pi-edit-control [data-field]').forEach(input => {
    if (input.closest('.pi-tag-picker')) return;
    updatedData[input.dataset.field] = input.value.trim();
  });

  try {
    const res = await authFetch(`/update/${encodeURIComponent(latestAppt._id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });

    if (!res.ok) throw new Error('Save failed');

    const idx = group.appointments.findIndex(a => a._id === latestAppt._id);
    if (idx !== -1) {
      group.appointments[idx] = updatedData;
    }

    // saved silently

    populatePatientInfo(group);

    if (adminPanel && !adminPanel.classList.contains('hidden')) {
      await loadPatients();
    }
  } catch (err) {
    console.error(err);
    pmMessage.textContent = 'Failed to save changes';
    pmMessage.className = 'pm-message error';
    setTimeout(() => {
      pmMessage.textContent = '';
      pmMessage.className = 'pm-message';
    }, 3000);
  }
}

function renderPatientAppointments(group) {
  if (pmAppointments) {
    pmAppointments.innerHTML = '<div class="no-data">Appointments are now managed in the Admin Panel.</div>';
  }
}

function openAppointmentDetail(appt) {
  currentAppointment = JSON.parse(JSON.stringify(appt));
  pmOriginalData = JSON.parse(JSON.stringify(appt));
  pmMessage.textContent = '';

  populateDetailContent(currentAppointment);
  showPmView('detail');

  pmEdit.style.display = 'inline-flex';
  pmSave.style.display = 'none';
  pmCancel.style.display = 'none';
}

const ALL_FORM_FIELDS = [
  { key: 'lastName', label: 'Last Name', section: 'Patient Information' },
  { key: 'firstName', label: 'First Name', section: 'Patient Information' },
  { key: 'middleName', label: 'Middle Name', section: 'Patient Information' },
  { key: 'nickname', label: 'Nickname', section: 'Patient Information' },
  { key: 'religion', label: 'Religion', section: 'Patient Information' },
  { key: 'nationality', label: 'Nationality', section: 'Patient Information' },
  { key: 'birthdate', label: 'Birthdate', section: 'Patient Information' },
  { key: 'age', label: 'Age', section: 'Patient Information' },
  { key: 'sex', label: 'Sex', section: 'Patient Information' },
  { key: 'homeAddress', label: 'Home Address', section: 'Patient Information' },
  { key: 'homeNo', label: 'Home Phone', section: 'Patient Information' },
  { key: 'officeNo', label: 'Office Phone', section: 'Patient Information' },
  { key: 'faxNo', label: 'Fax Number', section: 'Patient Information' },
  { key: 'mobileNo', label: 'Mobile Number', section: 'Patient Information' },
  { key: 'email', label: 'Email Address', section: 'Patient Information' },
  { key: 'occupation', label: 'Occupation', section: 'Patient Information' },
  { key: 'dentalInsurance', label: 'Dental Insurance', section: 'Patient Information' },
  { key: 'insuranceEffectiveDate', label: 'Insurance Effective Date', section: 'Patient Information' },
  { key: 'policyNo', label: 'Policy Number', section: 'Patient Information' },
  { key: 'guardianName', label: 'Guardian Name', section: 'Patient Information' },
  { key: 'guardianOccupation', label: 'Guardian Occupation', section: 'Patient Information' },
  { key: 'guardianContact', label: 'Guardian Contact', section: 'Patient Information' },
  { key: 'referredBy', label: 'Referred By', section: 'Patient Information' },
  { key: 'reasonForConsult', label: 'Reason for Consultation', section: 'Patient Information' },
  { key: 'previousDentist', label: 'Previous Dentist', section: 'Dental History' },
  { key: 'lastDentalVisit', label: 'Last Dental Visit', section: 'Dental History' },
  { key: 'visitFrequency', label: 'Visit Frequency', section: 'Dental History' },
  { key: 'previousTreatments', label: 'Previous Treatments', section: 'Dental History' },
  { key: 'brushingFrequency', label: 'Brushing Frequency', section: 'Dental History' },
  { key: 'flossUse', label: 'Floss Use', section: 'Dental History' },
  { key: 'oralHabits', label: 'Oral Habits', section: 'Dental History' },
  { key: 'physicianName', label: 'Physician Name', section: 'Medical History' },
  { key: 'physicianSpecialty', label: 'Physician Specialty', section: 'Medical History' },
  { key: 'physicianContact', label: 'Physician Contact', section: 'Medical History' },
  { key: 'physicianOfficeAddress', label: 'Physician Office Address', section: 'Medical History' },
  { key: 'q1_goodHealth', label: 'In Good Health?', section: 'Medical History' },
  { key: 'q2_underTreatment', label: 'Under Medical Treatment?', section: 'Medical History' },
  { key: 'q2_conditionBeingTreated', label: 'Condition Being Treated', section: 'Medical History' },
  { key: 'q3_seriousIllness', label: 'Had Serious Illness/Surgery?', section: 'Medical History' },
  { key: 'q3_illnessOperation', label: 'Illness/Surgery Details', section: 'Medical History' },
  { key: 'q4_hospitalized', label: 'Ever Hospitalized?', section: 'Medical History' },
  { key: 'q4_whenWhy', label: 'When/Why Hospitalized', section: 'Medical History' },
  { key: 'q5_takingMed', label: 'Taking Medications?', section: 'Medical History' },
  { key: 'q5_whatMedications', label: 'Medications List', section: 'Medical History' },
  { key: 'q6_tobacco', label: 'Use Tobacco?', section: 'Medical History' },
  { key: 'q7_drugs', label: 'Use Alcohol/Drugs?', section: 'Medical History' },
  { key: 'allergies', label: 'Allergies', section: 'Medical History', isArray: true },
  { key: 'allergies_other', label: 'Other Allergies', section: 'Medical History' },
  { key: 'q9_bleedingTime', label: 'Bleeding Time', section: 'Medical History' },
  { key: 'q10_pregnant', label: 'Pregnant?', section: 'Medical History' },
  { key: 'q10_nursing', label: 'Nursing?', section: 'Medical History' },
  { key: 'q10_birthControl', label: 'Taking Birth Control?', section: 'Medical History' },
  { key: 'bloodType', label: 'Blood Type', section: 'Medical History' },
  { key: 'bloodPressure', label: 'Blood Pressure', section: 'Medical History' },
  { key: 'conditions', label: 'Health Conditions', section: 'Health Conditions', isArray: true },
  { key: 'conditions_other', label: 'Other Conditions', section: 'Health Conditions' },
  { key: 'extraoralFindings', label: 'Extraoral Exam Findings', section: 'Oral Habits & Exam' },
  { key: 'intraoralFindings', label: 'Intraoral Exam Findings', section: 'Oral Habits & Exam' },
  { key: 'periodontalScreening', label: 'Periodontal Screening', section: 'Oral Habits & Exam', isArray: true },
  { key: 'occlusion', label: 'Occlusion', section: 'Oral Habits & Exam', isArray: true },
  { key: 'appliances', label: 'Appliances', section: 'Oral Habits & Exam', isArray: true },
  { key: 'appliances_other', label: 'Other Appliances', section: 'Oral Habits & Exam' },
  { key: 'tmd', label: 'TMD Conditions', section: 'Oral Habits & Exam', isArray: true },
  { key: 'xrayTaken', label: 'X-rays Taken', section: 'Oral Habits & Exam', isArray: true },
  { key: 'periapicalTeethNo', label: 'Periapical Tooth Numbers', section: 'Oral Habits & Exam' },
  { key: 'xrayTaken_other', label: 'Other X-rays', section: 'Oral Habits & Exam' },
  { key: 'consent_treatment', label: 'Treatment Consent Initials', section: 'Consent Form' },
  { key: 'consent_drugs', label: 'Drugs Consent Initials', section: 'Consent Form' },
  { key: 'consent_changes', label: 'Changes Consent Initials', section: 'Consent Form' },
  { key: 'consent_xray', label: 'X-ray Consent Initials', section: 'Consent Form' },
  { key: 'consent_extraction', label: 'Extraction Consent Initials', section: 'Consent Form' },
  { key: 'consent_crowns', label: 'Crowns Consent Initials', section: 'Consent Form' },
  { key: 'consent_rootcanal', label: 'Root Canal Consent Initials', section: 'Consent Form' },
  { key: 'consent_periodontal', label: 'Periodontal Consent Initials', section: 'Consent Form' },
  { key: 'consent_fillings', label: 'Fillings Consent Initials', section: 'Consent Form' },
  { key: 'consent_dentures', label: 'Dentures Consent Initials', section: 'Consent Form' },
  { key: 'consentSignature', label: 'Consent Signature', section: 'Consent Form' },
  { key: 'consentSignedDate', label: 'Consent Date Signed', section: 'Consent Form' },
  { key: 'provisionalDiagnosis', label: 'Provisional Diagnosis', section: 'Treatment Plan' },
  { key: 'plannedTreatment', label: 'Planned Treatment', section: 'Treatment Plan' },
  { key: 'medicaments', label: 'Medicaments/Prescriptions', section: 'Treatment Plan' },
  { key: 'signature', label: 'Form Signature', section: 'Treatment Plan' },
  { key: 'formDate', label: 'Form Date', section: 'Treatment Plan' },
  { key: 'attendingDentist', label: 'Attending Dentist', section: 'Treatment Plan' }
];

function populateDetailContent(appt) {
  const container = document.getElementById('pmDetailContent');
  if (!container) return;
  container.innerHTML = '';

  const sections = {};
  ALL_FORM_FIELDS.forEach(field => {
    if (!sections[field.section]) {
      sections[field.section] = [];
    }
    sections[field.section].push(field);
  });

  let sectionIndex = 0;
  for (const [sectionName, fields] of Object.entries(sections)) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'pm-section';
    sectionEl.dataset.section = sectionName;
    sectionEl.style.animationDelay = `${sectionIndex * 0.05}s`;

    sectionEl.innerHTML = `
      <h4>${sectionName}</h4>
      <div class="pm-section-content">
        <div class="pm-row"></div>
      </div>
    `;

    const row = sectionEl.querySelector('.pm-row');

    fields.forEach(field => {
      const value = appt[field.key];
      const fieldEl = document.createElement('div');
      fieldEl.className = 'pm-field';
      fieldEl.dataset.key = field.key;

      const displayValue = (field.isArray && Array.isArray(value)) 
        ? value.join(', ') 
        : (value || '');

      fieldEl.innerHTML = `
        <label>${field.label}</label>
        <div class="value">${displayValue || '<em style="color:#94a3b8">Not provided</em>'}</div>
      `;

      row.appendChild(fieldEl);
    });

    container.appendChild(sectionEl);
    sectionIndex++;
  }
}

function enableEditing() {
  const fields = document.querySelectorAll('#pmDetailContent .pm-field');

  fields.forEach(fieldEl => {
    const key = fieldEl.dataset.key;
    const fieldDef = ALL_FORM_FIELDS.find(f => f.key === key);
    const valueDiv = fieldEl.querySelector('.value');
    const currentValue = currentAppointment[key] || '';

    fieldEl.classList.add('editing');

    if (fieldDef && fieldDef.isArray) {
      const arrayValue = Array.isArray(currentValue) ? currentValue.join(', ') : '';
      valueDiv.innerHTML = `<textarea rows="2" data-key="${key}">${arrayValue}</textarea>`;
    } else if (key.startsWith('q') && (key.includes('goodHealth') || key.includes('underTreatment') || key.includes('seriousIllness') || key.includes('hospitalized') || key.includes('takingMed') || key.includes('tobacco') || key.includes('drugs'))) {
      valueDiv.innerHTML = `
        <select data-key="${key}">
          <option value="" ${!currentValue ? 'selected' : ''}>Select</option>
          <option value="Yes" ${currentValue === 'Yes' ? 'selected' : ''}>Yes</option>
          <option value="No" ${currentValue === 'No' ? 'selected' : ''}>No</option>
        </select>
      `;
    } else if (key.includes('Date') || key === 'birthdate' || key === 'lastDentalVisit' || key === 'formDate' || key === 'consentSignedDate' || key === 'nextApps') {
      valueDiv.innerHTML = `<input type="date" data-key="${key}" value="${currentValue || ''}">`;
    } else if (key === 'age') {
      valueDiv.innerHTML = `<input type="number" data-key="${key}" value="${currentValue || ''}">`;
    } else {
      valueDiv.innerHTML = `<input type="text" data-key="${key}" value="${currentValue}">`;
    }
  });
}

function disableEditing() {
  const fields = document.querySelectorAll('#pmDetailContent .pm-field');

  fields.forEach(fieldEl => {
    const key = fieldEl.dataset.key;
    const fieldDef = ALL_FORM_FIELDS.find(f => f.key === key);
    const valueDiv = fieldEl.querySelector('.value');
    const input = valueDiv.querySelector('input, textarea, select');

    fieldEl.classList.remove('editing');

    if (input) {
      let value = input.value.trim();

      if (fieldDef && fieldDef.isArray) {
        currentAppointment[key] = value ? value.split(',').map(v => v.trim()).filter(Boolean) : [];
      } else {
        currentAppointment[key] = value || null;
      }

      const displayValue = (fieldDef && fieldDef.isArray && Array.isArray(currentAppointment[key])) 
        ? currentAppointment[key].join(', ') 
        : (currentAppointment[key] || '');

      valueDiv.innerHTML = displayValue || '<em style="color:#94a3b8">Not provided</em>';
    }
  });
}

async function saveAppointmentChanges() {
  if (!currentAppointment || !currentAppointment._id) return;

  try {
    const res = await authFetch(`/update/${encodeURIComponent(currentAppointment._id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentAppointment)
    });

    if (!res.ok) throw new Error('Save failed');

    // saved silently
    pmOriginalData = JSON.parse(JSON.stringify(currentAppointment));

    await loadPatients();

    if (currentPatientGroup) {
      const idx = currentPatientGroup.appointments.findIndex(a => a._id === currentAppointment._id);
      if (idx !== -1) {
        currentPatientGroup.appointments[idx] = { ...currentAppointment };
      }
    }

    setTimeout(() => pmMessage.textContent = '', 3000);
  } catch (err) {
    console.error(err);
    pmMessage.textContent = 'Failed to save changes';
    pmMessage.className = 'pm-message error';
  }
}

function closePatientModal() {
  // Hide dropdown when closing modal
  const dropdown = document.getElementById('toothCodeDropdown');
  if (dropdown) dropdown.classList.remove('tcd-visible');
  
  patientModal.classList.add('hidden');
  currentPatientGroup = null;
  currentAppointment = null;
  pmEditing = false;
  pmOriginalData = null;
  toothStatusData = {};
}

async function deleteAppointment(id) {
  try {
    const res = await authFetch(`/delete/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) throw new Error('Delete failed');

    showMessage('Appointment deleted', true);
    await loadPatients();
    await loadAppointments(true);

    if (currentPatientGroup) {
      currentPatientGroup.appointments = currentPatientGroup.appointments.filter(a => a._id !== id);
      renderPatientAppointments(currentPatientGroup);
      pmSub.textContent = `Born: ${currentPatientGroup.birthdate || 'Unknown'}  ${currentPatientGroup.appointments.length} visits`;
    }
  } catch (err) {
    console.error(err);
    showMessage('Failed to delete', false);
  }
}

async function changePatientPhoto(file) {
  if (!currentPatientGroup || !currentPatientGroup.folderName) {
    pmMessage.textContent = 'Error: No patient selected';
    pmMessage.className = 'pm-message error';
    return;
  }

  const formData = new FormData();
  formData.append('photo', file);

  try {
    pmMessage.textContent = 'Uploading...';
    pmMessage.className = 'pm-message';

    const res = await authFetch(`/update-photo/${encodeURIComponent(currentPatientGroup.folderName)}`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error('Upload failed');

    const result = await res.json();

    if (result.photoPath) {
      pmPhoto.src = result.photoPath + '?t=' + Date.now();
      pmPhoto.style.display = 'block';
      pmPhoto.style.width = '100%';
      pmPhoto.style.height = '100%';
      pmPhoto.style.objectFit = 'cover';
      pmPhoto.style.borderRadius = '50%';
    }

    currentPatientGroup.photoPath = result.photoPath;

    pmMessage.textContent = 'Photo updated!';
    setTimeout(() => pmMessage.textContent = '', 3000);

    await loadPatients();
  } catch (err) {
    console.error(err);
    pmMessage.textContent = 'Failed to update photo';
    pmMessage.className = 'pm-message error';
  }
}