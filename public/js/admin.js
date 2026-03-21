/* =========================================================
   ADMIN PANEL FUNCTIONS
   ========================================================= */
/* =========================================================
   VERSION FEATURE MAP
   ========================================================= */
const VERSION_FEATURES = {
  1: { nav: ['navPatients'],                                          modal: ['pmViewDentalChart','pmViewTreatmentRecords','pmPrint'],                                              hide: ['dashFinRow'] },
  2: { nav: ['navDashboard','navPatients','navBilling'],               modal: ['pmViewDentalChart','pmViewTreatmentRecords','pmPrint','pmViewPrescriptions','pmViewPatientImages'], hide: [] },
  3: { nav: ['navDashboard','navSchedule','navPatients'],              modal: ['pmViewDentalChart','pmViewTreatmentRecords','pmPrint','pmViewPrescriptions','pmViewPatientImages'], hide: ['dashFinRow'] },
  4: { nav: ['navDashboard','navSchedule','navPatients','navBilling'], modal: ['pmViewDentalChart','pmViewTreatmentRecords','pmPrint','pmViewPrescriptions','pmViewPatientImages'], hide: [] },
};

function applyVersionFeatures(version) {
  const v = parseInt(version) || 4;
  const features = VERSION_FEATURES[v] || VERSION_FEATURES[4];

  // Nav buttons — show only allowed ones
  const allNav = ['navDashboard','navSchedule','navPatients','navBilling'];
  allNav.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = features.nav.includes(id) ? '' : 'none';
  });

  // Patient modal buttons — show only allowed ones
  const allModal = ['pmViewDentalChart','pmViewTreatmentRecords','pmPrint','pmViewPrescriptions','pmViewPatientImages'];
  allModal.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = features.modal.includes(id) ? '' : 'none';
  });

  // Hide/show extra dashboard elements (e.g. financial summary)
  const allHideable = ['dashFinRow'];
  allHideable.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = features.hide.includes(id) ? 'none' : '';
  });

  // If current active nav is hidden, switch to first visible one
  const activeNav = document.querySelector('.dash-nav-btn.active');
  if (activeNav && activeNav.style.display === 'none') {
    const firstVisible = document.querySelector('.dash-nav-btn:not([style*="display: none"])');
    firstVisible?.click();
  }
}

async function showAdminPanel() {
  // Restore token from session if page was refreshed
  if (!adminToken) adminToken = sessionStorage.getItem('pdaToken')
  adminPanel.classList.remove('hidden');
  adminPanel.setAttribute('aria-hidden', 'false');
  form.style.display = 'none';

  // Show logged-in dentist name
  const dn = sessionStorage.getItem('pdaDentistName') || '';
  const rl = sessionStorage.getItem('pdaRole') || 'admin';
  const vr = parseInt(sessionStorage.getItem('pdaVersion')) || 4;
  const banner = document.getElementById('adminLoggedInAs');
  if (banner) {
    banner.textContent = dn ? `Logged in as: ${dn}` : 'Logged in as: Admin';
    banner.className   = `admin-logged-as ${rl}`;
  }

  // Apply version-based feature visibility
  applyVersionFeatures(vr);

  await loadPatients();
  startAppointmentsRefresh();
  loadFinancialSummary();
  await showUnfinishedAppointmentsPopup();
}

function hideAdminPanel() {
  adminPanel.classList.add('hidden');
  adminPanel.setAttribute('aria-hidden', 'true');
  form.style.display = '';
  stopAppointmentsRefresh();
}

async function fetchPatients() {
  const res = await authFetch('/patients');
  if (!res.ok) throw new Error('Failed to load patients');
  const arr = await res.json();
  return Array.isArray(arr) ? arr : [];
}

function groupPatients(entries) {
  console.log(`Grouping ${entries.length} appointments...`);
  
  const map = new Map();
  
  entries.forEach((e, index) => {
    const ln = (e.lastName || '').trim();
    const fn = (e.firstName || '').trim();
    const mn = (e.middleName || '').trim();
    const bd = e.birthdate || '';
    const key = `${ln.toLowerCase()}|${fn.toLowerCase()}|${mn.toLowerCase()}|${bd}`;
    
    if (!map.has(key)) {
      map.set(key, { 
        key, 
        lastName: ln, 
        firstName: fn, 
        middleName: mn, 
        birthdate: bd, 
        appointments: [],
        photoPath: e.photoPath || null,
        folderName: e._patientFolder || null
      });
    } else {
      const existing = map.get(key);
      if (!existing.folderName && e._patientFolder) {
        existing.folderName = e._patientFolder;
      }
      if (!existing.photoPath && e.photoPath) {
        existing.photoPath = e.photoPath;
      }
    }
    
    map.get(key).appointments.push(e);
  });
  
  const grouped = Array.from(map.values());
  const valid = grouped.filter(p => p.folderName);
  
  console.log(`Final result: ${valid.length} valid patients`);
  
  return valid.sort((a, b) => {
    if (a.lastName === b.lastName) return a.firstName.localeCompare(b.firstName);
    return a.lastName.localeCompare(b.lastName);
  });
}

function renderPatients(groups) {
  patientsList.innerHTML = '';
  
  const countBadge = document.getElementById('patientsCount');
  if (countBadge) countBadge.textContent = groups.length;

  // Update dashboard total patients stat card
  const totalPatientsEl = document.getElementById('totalPatientsCount');
  if (totalPatientsEl) animateNumber(totalPatientsEl, groups.length);
  
  if (!groups.length) {
    patientsList.innerHTML = '<div class="muted">No patients found.</div>';
    return;
  }

  groups.forEach(group => {
    const div = document.createElement('div');
    div.className = 'patient-item';
    
    const hasPhoto = group.photoPath ? '' : 'hidden';
    const fullName = `${group.lastName}, ${group.firstName}${group.middleName ? ' ' + group.middleName : ''}`;
    
    div.innerHTML = `
      <div class="patient-head">
        <img class="patient-photo ${hasPhoto}" src="${group.photoPath || ''}" alt="Patient photo" />
        <div class="patient-meta">${fullName} — ${group.birthdate || 'No birthdate'} (${group.appointments.length} visit${group.appointments.length !== 1 ? 's' : ''})</div>
      </div>
    `;

    div.addEventListener('click', () => {
      openPatientModal(group);
    });

    patientsList.appendChild(div);
  });
}

async function loadPatients() {
  try {
    const all = await fetchPatients();
    const q = (searchPatients.value || '').trim().toLowerCase();
    let filtered = all;
    
    if (q) {
      filtered = all.filter(e => {
        const name = `${e.lastName || ''} ${e.firstName || ''} ${e.middleName || ''}`.toLowerCase();
        const bd = (e.birthdate || '').toLowerCase();
        return name.includes(q) || bd.includes(q);
      });
    }
    
    const grouped = groupPatients(filtered);
    renderPatients(grouped);
  } catch (err) {
    console.error('Failed to load patients:', err);
    patientsList.innerHTML = '<div class="muted">Failed to load patients.</div>';
  }
}

async function openEditAppointment(appt) {
  if (!confirm('Load this appointment into the form for editing?')) return;
  
  for (const [k, v] of Object.entries(appt)) {
    if (k.startsWith('_')) continue;
    
    const els = form.querySelectorAll(`[name="${k}"]`);
    if (!els || !els.length) continue;

    if (els[0].type === 'checkbox') {
      if (Array.isArray(v)) {
        els.forEach(el => { el.checked = v.includes(el.value); });
      } else {
        els.forEach(el => { el.checked = (el.value === v); });
      }
    } else if (els[0].type === 'radio') {
      els.forEach(el => { el.checked = (el.value === v); });
    } else {
      els[0].value = v ?? '';
    }
  }

  form.dataset.editingId = appt._id;
  showMessage('Appointment loaded for editing. Submit to save changes.', true);
  hideAdminPanel();
  showPage(0);
}