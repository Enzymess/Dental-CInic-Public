/* =========================================================
   ADMIN PANEL FUNCTIONS
   ========================================================= */
async function showAdminPanel() {
  // Restore token from session if page was refreshed
  if (!adminToken) adminToken = sessionStorage.getItem('pdaToken')
  adminPanel.classList.remove('hidden');
  adminPanel.setAttribute('aria-hidden', 'false');
  form.style.display = 'none';

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
      // Always take the most recent non-null photoPath (not just when currently null)
      if (e.photoPath) {
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
    // Cache-bust the thumbnail so the latest photo always shows in the list
    const photoSrc = group.photoPath ? group.photoPath + '?t=' + Date.now() : '';
    
    div.innerHTML = `
      <div class="patient-head">
        <img class="patient-photo ${hasPhoto}" src="${photoSrc}" alt="Patient photo" />
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