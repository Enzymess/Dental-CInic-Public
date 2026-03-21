/* =========================================================
   CLINIC CONFIG — loads clinic-config.json and exposes
   window.clinicConfig globally. Used by all print/export
   flows (treatment records, prescriptions, patient records).
   ========================================================= */

window.clinicConfig = null;

/* ── Apply branding to topbar + sidebar ──────────────────── */
function applyClinicBranding(cfg) {
  if (!cfg) return;
  const c = cfg.clinic;

  function set(selector, value, fallback) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value || fallback;
  }

  // Use scoped selectors to avoid hitting form .sub labels
  set('.brand .logo',        c.logoLetters, 'PDA');
  set('.brand .org',         c.name,        'PHILIPPINE DENTAL ASSOCIATION');
  set('.brand-text .sub',    c.tagline,     'Patient Information & Consent Form System');
  set('.dash-sidebar-logo',  c.logoLetters, 'PDA');
}

async function loadClinicConfig() {
  try {
    // Use plain fetch (no auth) so branding loads on page open before login
    // Falls back to authFetch in case the server requires auth
    let res = await fetch('/clinic-config');
    if (res.status === 401 || res.status === 403) {
      const token = sessionStorage.getItem('pdaToken');
      res = await fetch('/clinic-config', {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
      });
    }
    if (!res.ok) throw new Error('Failed to load clinic config');
    window.clinicConfig = await res.json();
  } catch (err) {
    console.warn('Could not load clinic config, using defaults:', err);
    window.clinicConfig = {
      clinic: {
        name: 'Dental Clinic',
        logoLetters: 'DC',
        tagline: '',
        address: '',
        phone: '',
        mobile: '',
        email: '',
        website: ''
      },
      doctor: {
        name: 'Dr. ',
        title: 'DMD',
        licenseNo: '',
        ptrNo: '',
        specialization: 'General Dentistry',
        schedule: ''
      },
      print: {
        footerNote: '',
        showLogo: true,
        showDoctorSignatureLine: true,
        showClinicStampBox: true,
        primaryColor: '#0b5ea8',
        accentColor: '#0b9adf'
      }
    };
  }

  // Apply after DOM is ready (script has defer but call may come before paint)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyClinicBranding(window.clinicConfig));
  } else {
    applyClinicBranding(window.clinicConfig);
  }
}

// Load branding immediately on script parse — no need to wait for login
loadClinicConfig();

/* ── Clinic Config Editor Modal ───────────────────────────── */

function openClinicConfigModal() {
  // Remove any existing instance
  document.getElementById('clinicConfigModal')?.remove();

  if (!window.clinicConfig) {
    showMessage('Clinic config not loaded yet.', false);
    return;
  }

  const cfg = window.clinicConfig;
  const c   = cfg.clinic;
  const d   = cfg.doctor;
  const p   = cfg.print;

  const modal = document.createElement('div');
  modal.id = 'clinicConfigModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:100050;display:flex;align-items:center;
    justify-content:center;padding:20px;
    background:rgba(15,23,42,0.75);backdrop-filter:blur(8px);
  `;

  modal.innerHTML = `
    <div style="
      background:#fff;border-radius:16px;width:100%;max-width:560px;
      max-height:90vh;display:flex;flex-direction:column;
      box-shadow:0 25px 80px rgba(0,0,0,0.35);overflow:hidden;
    ">
      <!-- Header -->
      <div style="
        padding:18px 24px;border-bottom:1px solid #e2e8f0;flex-shrink:0;
        background:linear-gradient(90deg,rgba(11,94,168,.06),transparent);
        display:flex;align-items:center;justify-content:space-between;
      ">
        <div>
          <h3 style="margin:0;color:#0b5ea8;font-size:16px;font-weight:700;">Clinic Configuration</h3>
          <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Used on all printed records &amp; PDFs</p>
        </div>
        <button id="ccmClose" style="
          background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;
          padding:6px 12px;font-size:13px;cursor:pointer;font-weight:600;color:#334155;
        ">Close</button>
      </div>

      <!-- Body -->
      <div style="padding:20px 24px;overflow-y:auto;flex:1;scrollbar-gutter:stable;">
        <form id="ccmForm" autocomplete="off">

          <!-- Clinic -->
          <div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;">Clinic Info</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            ${ccmField('clinic.name',       'Clinic Name',         c.name)}
            ${ccmField('clinic.logoLetters','Logo Letters (abbr.)', c.logoLetters, 'e.g. PDA')}
            ${ccmField('clinic.tagline',    'Tagline / Sub-name',  c.tagline)}
            ${ccmField('clinic.phone',      'Phone',               c.phone)}
            ${ccmField('clinic.mobile',     'Mobile',              c.mobile)}
            ${ccmField('clinic.email',      'Email',               c.email)}
          </div>
          <div style="margin-bottom:16px;">
            ${ccmField('clinic.address',    'Full Address',        c.address, '', true)}
            ${ccmField('clinic.website',    'Website',             c.website)}
          </div>

          <div style="height:1px;background:#f0f4f9;margin:4px 0 16px;"></div>

          <!-- Doctor -->
          <div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;">Doctor Info</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            ${ccmField('doctor.name',           'Doctor Full Name',    d.name)}
            ${ccmField('doctor.title',          'Title / Degree',      d.title, 'e.g. DMD, DDS')}
            ${ccmField('doctor.licenseNo',      'PRC License No.',     d.licenseNo)}
            ${ccmField('doctor.ptrNo',          'PTR No.',             d.ptrNo)}
            ${ccmField('doctor.specialization', 'Specialization',      d.specialization)}
            ${ccmField('doctor.schedule',       'Clinic Schedule',     d.schedule)}
          </div>

          <div style="height:1px;background:#f0f4f9;margin:4px 0 16px;"></div>

          <!-- Print options -->
          <div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;">Print / PDF Options</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            ${ccmField('print.primaryColor', 'Primary Color', p.primaryColor, '#0b5ea8')}
            ${ccmField('print.accentColor',  'Accent Color',  p.accentColor,  '#0b9adf')}
          </div>
          <div style="margin-bottom:16px;">
            ${ccmField('print.footerNote', 'Footer Note (on PDFs)', p.footerNote, 'e.g. For medical records use only', true)}
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;">
            ${ccmCheck('print.showLogo',                'Show logo on printed documents',        p.showLogo)}
            ${ccmCheck('print.showDoctorSignatureLine', 'Show doctor signature line on PDFs',    p.showDoctorSignatureLine)}
            ${ccmCheck('print.showClinicStampBox',      'Show clinic stamp box on PDFs',         p.showClinicStampBox)}
          </div>

          <div id="ccmError" style="color:#dc2626;font-size:13px;min-height:18px;margin-top:4px;"></div>

          <div style="display:flex;justify-content:flex-end;gap:10px;padding-top:16px;border-top:1px solid #f0f4f9;margin-top:8px;">
            <button type="button" id="ccmCancel" style="
              padding:10px 20px;border-radius:8px;border:2px solid #e2e8f0;
              background:#f8fafc;color:#334155;font-size:14px;font-weight:600;cursor:pointer;
            ">Cancel</button>
            <button type="submit" style="
              padding:10px 24px;border-radius:8px;border:none;
              background:linear-gradient(135deg,#0b5ea8,#0b9adf);
              color:#fff;font-size:14px;font-weight:600;cursor:pointer;
              box-shadow:0 4px 12px rgba(11,94,168,0.3);
            ">Save Config</button>
          </div>

        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('ccmClose').addEventListener('click', close);
  document.getElementById('ccmCancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  document.getElementById('ccmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('ccmError');
    errEl.textContent = '';

    // Collect all fields from the form
    const updated = {
      clinic: {
        name:        ccmGet('clinic.name'),
        logoLetters: ccmGet('clinic.logoLetters'),
        tagline:     ccmGet('clinic.tagline'),
        address:     ccmGet('clinic.address'),
        phone:       ccmGet('clinic.phone'),
        mobile:      ccmGet('clinic.mobile'),
        email:       ccmGet('clinic.email'),
        website:     ccmGet('clinic.website')
      },
      doctor: {
        name:           ccmGet('doctor.name'),
        title:          ccmGet('doctor.title'),
        licenseNo:      ccmGet('doctor.licenseNo'),
        ptrNo:          ccmGet('doctor.ptrNo'),
        specialization: ccmGet('doctor.specialization'),
        schedule:       ccmGet('doctor.schedule')
      },
      print: {
        footerNote:               ccmGet('print.footerNote'),
        showLogo:                 ccmGetBool('print.showLogo'),
        showDoctorSignatureLine:  ccmGetBool('print.showDoctorSignatureLine'),
        showClinicStampBox:       ccmGetBool('print.showClinicStampBox'),
        primaryColor:             ccmGet('print.primaryColor'),
        accentColor:              ccmGet('print.accentColor')
      }
    };

    if (!updated.clinic.name.trim()) {
      errEl.textContent = 'Clinic name is required.';
      return;
    }
    if (!updated.doctor.name.trim()) {
      errEl.textContent = 'Doctor name is required.';
      return;
    }

    const submitBtn = e.target.querySelector('[type="submit"]');
    submitBtn.textContent = 'Saving…';
    submitBtn.disabled = true;

    try {
      const res = await authFetch('/clinic-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (!res.ok) throw new Error(await res.text());

      window.clinicConfig = updated;
      applyClinicBranding(updated);
      showMessage('Clinic configuration saved!', true);
      close();
    } catch (err) {
      errEl.textContent = 'Failed to save: ' + err.message;
      submitBtn.textContent = 'Save Config';
      submitBtn.disabled = false;
    }
  });
}

/* ── Helpers for modal field generation ──────────────────── */
function ccmField(key, label, value = '', placeholder = '', isTextarea = false) {
  const id = `ccm_${key.replace('.', '_')}`;
  const val = (value || '').toString().replace(/"/g, '&quot;');
  const ph  = placeholder || '';
  const inputStyle = `
    width:100%;box-sizing:border-box;margin-top:5px;
    padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:7px;
    font-size:13px;font-family:inherit;color:#0f172a;outline:none;
    transition:border-color .15s;
  `;
  const input = isTextarea
    ? `<textarea id="${id}" name="${key}" rows="2" placeholder="${ph}" style="${inputStyle}resize:vertical;">${val}</textarea>`
    : `<input id="${id}" name="${key}" type="text" value="${val}" placeholder="${ph}" style="${inputStyle}" />`;
  return `
    <label style="display:block;font-size:12px;font-weight:600;color:#475569;">
      ${label}
      ${input}
    </label>`;
}

function ccmCheck(key, label, checked) {
  const id = `ccm_${key.replace('.', '_')}`;
  return `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#334155;cursor:pointer;">
      <input type="checkbox" id="${id}" name="${key}" ${checked ? 'checked' : ''}
        style="width:15px;height:15px;accent-color:#0b5ea8;cursor:pointer;" />
      ${label}
    </label>`;
}

function ccmGet(key) {
  const el = document.querySelector(`#ccmForm [name="${key}"]`);
  return el ? el.value.trim() : '';
}

function ccmGetBool(key) {
  const el = document.querySelector(`#ccmForm [name="${key}"]`);
  return el ? el.checked : false;
}