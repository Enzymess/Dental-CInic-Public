/**
 * EVENT LISTENERS & INITIALIZATION
 * ==================================
 * Initializes all UI event listeners on page load.
 * Sets up interactions for:
 * - Admin authentication (login/logout)
 * - Billing management
 * - Appointment scheduling
 * - Patient data modals
 * - Treatment record forms
 * - Form navigation and validation
 */

/**
 * MODAL MANAGEMENT HELPERS
 * ========================
 */
function showLoginModal() {
  if (loginModal) {
    loginModal.classList.remove('hidden');
    loginModal.setAttribute('aria-hidden', 'false');
    const firstInput = loginModal.querySelector('input');
    if (firstInput) firstInput.focus();
  }
}

function hideLoginModal() {
  if (loginModal) {
    loginModal.classList.add('hidden');
    loginModal.setAttribute('aria-hidden', 'true');
    if (adminBtn) adminBtn.focus();
  }
}

/* =========================================================
   DENTIST LOGIN SCREEN
   ========================================================= */
function initDentistLoginScreen() {
  const screen  = document.getElementById('dentistLoginScreen');
  const loginFm = document.getElementById('dentistLoginForm');
  const form    = document.getElementById('dentalForm');
  if (!screen || !loginFm || !form) return;

  form.style.display   = 'none';
  screen.style.display = 'flex';

  loginFm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('dlsError');
    errEl.style.display = 'none';
    errEl.textContent   = '';

    const username = document.getElementById('dlsUsername').value.trim();
    const password = document.getElementById('dlsPassword').value;
    if (!username || !password) {
      errEl.textContent = 'Please enter your username and password.';
      errEl.style.display = 'block';
      return;
    }

    const btn = loginFm.querySelector('.dls-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const res  = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const body = await res.json();

      if (!res.ok || !body.ok) {
        errEl.textContent   = body.error || 'Invalid username or password.';
        errEl.style.display = 'block';
        return;
      }

      selectedDentistId      = body.dentistId   || null;
      selectedDentistName    = body.dentistName || username;
      selectedDentistRole    = body.role        || 'dentist';
      selectedDentistVersion = body.version     || 4;
      adminToken = body.token;
      sessionStorage.setItem('pdaToken',       body.token);
      sessionStorage.setItem('pdaDentistId',   body.dentistId   || '');
      sessionStorage.setItem('pdaDentistName', body.dentistName || '');
      sessionStorage.setItem('pdaRole',        body.role        || 'dentist');
      sessionStorage.setItem('pdaVersion',     body.version     || 4);

      screen.style.display = 'none';
      form.style.display   = '';
      showDentistFormBanner(selectedDentistName || username);

    } catch (err) {
      console.error('Login error:', err);
      errEl.textContent   = 'Login failed. Please try again.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Sign In';
    }
  });
}

function showDentistFormBanner(name) {
  document.getElementById('dentistFormBanner')?.remove();
  const banner = document.createElement('div');
  banner.id        = 'dentistFormBanner';
  banner.className = 'dentist-form-banner';
  banner.innerHTML = `
    <span class="dfb-label">Signed in as:</span>
    <span class="dfb-name">${name}</span>
    <button class="dfb-signout" id="dfbSignout" type="button">Sign Out</button>
  `;
  document.getElementById('dentalForm')?.insertAdjacentElement('beforebegin', banner);
  document.getElementById('dfbSignout')?.addEventListener('click', () => {
    banner.remove();
    selectedDentistId = null; selectedDentistName = null;
    selectedDentistRole = null; selectedDentistVersion = 4;
    adminToken = null;
    sessionStorage.clear();
    const f = document.getElementById('dentalForm');
    const s = document.getElementById('dentistLoginScreen');
    if (f) f.style.display = 'none';
    if (s) s.style.display = 'flex';
    document.getElementById('dlsUsername').value = '';
    document.getElementById('dlsPassword').value = '';
    document.getElementById('dlsError').style.display = 'none';
  });
}

document.addEventListener('DOMContentLoaded', () => {

  initDentistLoginScreen();

  showPage(0);
  if (adminPanel) adminPanel.classList.add('hidden');
  if (loginModal) loginModal.classList.add('hidden');

  // Billing Modal events
  document.getElementById('billingModalClose')?.addEventListener('click', closeBillingModal);
  document.getElementById('billingModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBillingModal();
  });
  document.getElementById('saveBillingExpenses')?.addEventListener('click', saveBillingExpenses);
  document.getElementById('billingMarkPaidBtn')?.addEventListener('click', toggleBillingPayment);
  document.getElementById('billingExpenses')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBillingExpenses();
  });

  // Billing view
  document.getElementById('refreshBillingBtn')?.addEventListener('click', loadBillingView);
  document.getElementById('addBillingBtn')?.addEventListener('click', openAddBillingModal);

  document.querySelectorAll('.billing-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.billing-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _billingFilter = btn.dataset.bfilter || 'all';
      renderBillingTable();
    });
  });

  document.getElementById('billingSearch')?.addEventListener('input', (e) => {
    _billingSearch = e.target.value;
    renderBillingTable();
  });

  // Add billing modal
  document.getElementById('addBillingClose')?.addEventListener('click', closeAddBillingModal);
  document.getElementById('addBillingCancel')?.addEventListener('click', closeAddBillingModal);
  document.getElementById('addBillingForm')?.addEventListener('submit', submitAddBillingForm);

  // Edit billing modal
  document.getElementById('editBillingClose')?.addEventListener('click', closeEditBillingModal);
  document.getElementById('editBillingCancel')?.addEventListener('click', closeEditBillingModal);
  document.getElementById('editBillingForm')?.addEventListener('submit', submitEditBillingForm);

  // Financial Summary refresh button
  document.getElementById('refreshFinancial')?.addEventListener('click', loadFinancialSummary);

  // Appointments filter buttons
  document.querySelectorAll('.appointments-filter .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.appointments-filter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      loadAppointments();
    });
  });

  // Reschedule Modal (legacy)
  const rescheduleModal = document.getElementById('rescheduleModal');
  const rescheduleForm = document.getElementById('rescheduleForm');
  const rescheduleCancel = document.getElementById('rescheduleCancel');

  rescheduleForm?.addEventListener('submit', handleRescheduleSubmit);
  rescheduleCancel?.addEventListener('click', closeRescheduleModal);
  rescheduleModal?.querySelector('.modal-inner')?.addEventListener('click', (e) => e.stopPropagation());
  rescheduleModal?.addEventListener('click', (e) => {
    if (e.target === rescheduleModal) closeRescheduleModal();
  });

  // Unfinished Appointments Modal
  const unfinishedModal = document.getElementById('unfinishedModal');
  const unfinishedClose = document.getElementById('unfinishedClose');

  unfinishedClose?.addEventListener('click', closeUnfinishedModal);
  unfinishedModal?.querySelector('.modal-panel')?.addEventListener('click', (e) => e.stopPropagation());
  unfinishedModal?.addEventListener('click', (e) => {
    if (e.target === unfinishedModal || e.target.classList.contains('modal-overlay')) closeUnfinishedModal();
  });

  // Admin Button
  adminBtn?.addEventListener('click', () => {
    if (loginError) loginError.textContent = '';
    showLoginModal();
  });

  loginCancel?.addEventListener('click', () => {
    hideLoginModal();
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.textContent = '';
    
    const formData = new FormData(loginForm);
    const payload = {
      username: formData.get('username'),
      password: formData.get('password')
    };
    
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const body = await res.json();

      if (!res.ok || !body.ok) {
        if (loginError) loginError.textContent = 'Invalid credentials';
        return;
      }

      adminToken = body.token
      sessionStorage.setItem('pdaToken',       body.token)
      sessionStorage.setItem('pdaDentistId',   body.dentistId   || '')
      sessionStorage.setItem('pdaDentistName', body.dentistName || '')
      sessionStorage.setItem('pdaRole',        body.role        || 'admin')
      sessionStorage.setItem('pdaVersion',     body.version     || 4)
      hideLoginModal();
      showAdminPanel();
    } catch (err) {
      console.error(err);
      if (loginError) loginError.textContent = 'Login failed';
    }
  });

  adminLogout?.addEventListener('click', () => {
    adminToken = null
    sessionStorage.removeItem('pdaToken')
    sessionStorage.removeItem('pdaDentistId')
    sessionStorage.removeItem('pdaDentistName')
    sessionStorage.removeItem('pdaRole')
    sessionStorage.removeItem('pdaVersion')
    hideAdminPanel()
  });

  refreshPatients?.addEventListener('click', () => {
    loadPatients();
    loadAppointments(true);
  });

  // Dashboard nav switching
  document.querySelectorAll('.dash-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      document.querySelectorAll('.dash-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
      document.getElementById(targetView)?.classList.add('active');
      if (targetView === 'patientsView') loadPatients();
      if (targetView === 'dashView')     loadAppointments(true);
      if (targetView === 'scheduleView') loadSchedule();
      if (targetView === 'billingView')  loadBillingView();
    });
  });

  // Patient list view refresh & search
  document.getElementById('refreshPatientsBtn2')?.addEventListener('click', loadPatients);

  searchPatients?.addEventListener('input', () => {
    loadPatients();
  });

  createBackup?.addEventListener('click', createBackupArchive);

  // DEBUG BUTTON
  const debugBtn = document.createElement('button');
  debugBtn.textContent = 'Debug Patients';
  debugBtn.className = 'btn small warning';
  debugBtn.style.marginLeft = '10px';
  debugBtn.addEventListener('click', async () => {
    try {
      const res = await authFetch('/debug-patients');
      const data = await res.json();
      console.log('=== DEBUG PATIENTS DATA ===');
      console.log('Total folders:', data.totalFolders);
      console.log('Patients with info:', data.patientsWithInfo);
      console.log('Full debug data:', data.debug);
      alert(`Debug data logged to console!\n\nTotal folders: ${data.totalFolders}\nPatients with info: ${data.patientsWithInfo}\n\nCheck browser console (F12) for details.`);
    } catch (err) {
      console.error('Debug failed:', err);
      alert('Debug failed - check console');
    }
  });
  createBackup?.parentElement?.appendChild(debugBtn);

  // Next/Prev Buttons
  document.addEventListener('click', (e) => {
    if (e.target.closest('.next')) {
      e.preventDefault();
      if (currentPage < pages.length - 1) {
        showPage(currentPage + 1);
      }
    } else if (e.target.closest('.prev')) {
      e.preventDefault();
      if (currentPage > 0) {
        showPage(currentPage - 1);
      }
    }
  });

  // Camera Buttons
  cameraCaptureBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    takePhoto();
  });
  
  cameraRetakeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    retakePhoto();
  });

  // Patient Modal - Close
  pmClose?.addEventListener('click', closePatientModal);
  document.querySelector('#patientModal .pm-overlay')?.addEventListener('click', closePatientModal);
  
  pmBackToList?.addEventListener('click', () => showPmView('list'));
  
  document.getElementById('pmViewInfo')?.addEventListener('click', () => {
    showPmView('list');
  });
  
  document.getElementById('pmViewDentalChart')?.addEventListener('click', () => {
    showPmView('dentalChart');
  });
  
  document.getElementById('pmViewTreatmentRecords')?.addEventListener('click', () => {
    showPmView('treatmentRecords');
  });
  
  document.getElementById('dcBackToList')?.addEventListener('click', () => showPmView('list'));
  document.getElementById('trBackToList')?.addEventListener('click', () => showPmView('list'));
  
  document.getElementById('trAddRecord')?.addEventListener('click', () => openTreatmentRecordForm());
  document.getElementById('pmPrint')?.addEventListener('click', printPatientRecords);

  // Patient Modal - Edit/Save/Cancel/Delete
  pmEdit?.addEventListener('click', () => {
    pmEditing = true;
    enableEditing();
    pmEdit.style.display = 'none';
    pmSave.style.display = 'inline-flex';
    pmCancel.style.display = 'inline-flex';
  });
  
  pmCancel?.addEventListener('click', () => {
    pmEditing = false;
    currentAppointment = JSON.parse(JSON.stringify(pmOriginalData));
    populateDetailContent(currentAppointment);
    pmEdit.style.display = 'inline-flex';
    pmSave.style.display = 'none';
    pmCancel.style.display = 'none';
    pmMessage.textContent = 'Changes discarded';
    setTimeout(() => pmMessage.textContent = '', 2000);
  });
  
  pmSave?.addEventListener('click', async () => {
    if (!currentAppointment) return;
    disableEditing();
    await saveAppointmentChanges();
    pmEditing = false;
    pmEdit.style.display = 'inline-flex';
    pmSave.style.display = 'none';
    pmCancel.style.display = 'none';
  });
  
  pmDelete?.addEventListener('click', () => {
    if (currentAppointment && confirm('Delete this appointment?')) {
      deleteAppointment(currentAppointment._id);
      showPmView('list');
    }
  });

  // Change Photo
  document.addEventListener('click', (e) => {
    if (e.target.closest('#pmPhotoWrapper')) {
      const input = document.getElementById('pmPhotoInput');
      if (input) {
        input.value = '';
        input.click();
      }
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'pmPhotoInput') {
      const file = e.target.files[0];
      if (file) {
        if (pmPhoto) {
          const tempUrl = URL.createObjectURL(file);
          pmPhoto.src = tempUrl;
          pmPhoto.style.display = 'block';
          pmPhoto.style.width = '100%';
          pmPhoto.style.height = '100%';
          pmPhoto.style.objectFit = 'cover';
          pmPhoto.style.borderRadius = '50%';
        }
        changePatientPhoto(file);
      }
    }
  });
  
  document.getElementById('pmAddAppointment')?.addEventListener('click', () => {
    if (currentPatientGroup) {
      const form = document.getElementById('dentalForm');
      form.querySelector('[name="lastName"]').value = currentPatientGroup.lastName;
      form.querySelector('[name="firstName"]').value = currentPatientGroup.firstName;
      form.querySelector('[name="middleName"]').value = currentPatientGroup.middleName || '';
      form.querySelector('[name="birthdate"]').value = currentPatientGroup.birthdate || '';
      
      closePatientModal();
      showPage(0);
      showMessage('Patient info loaded for new appointment', true);
    }
  });

  // Tooth Drawing Events
  tmClose?.addEventListener('click', closeToothDrawModal);
  
  tmBrushSize?.addEventListener('input', (e) => {
    currentBrushSize = parseInt(e.target.value);
    if (tmBrushSizeValue) tmBrushSizeValue.textContent = currentBrushSize;
  });

  tmColors?.forEach(colorBtn => {
    colorBtn.addEventListener('click', () => {
      tmColors.forEach(btn => btn.classList.remove('active'));
      colorBtn.classList.add('active');
      currentColor = colorBtn.dataset.color;
    });
  });

  tmClear?.addEventListener('click', clearToothDrawing);
  tmUndo?.addEventListener('click', undoDrawing);
  tmSave?.addEventListener('click', saveToothDrawing);

  if (toothCanvas) {
    toothCanvas.addEventListener('mousedown', startDrawing);
    toothCanvas.addEventListener('mousemove', draw);
    toothCanvas.addEventListener('mouseup', stopDrawing);
    toothCanvas.addEventListener('mouseout', stopDrawing);
    toothCanvas.addEventListener('touchstart', startDrawingTouch);
    toothCanvas.addEventListener('touchmove', drawTouch);
    toothCanvas.addEventListener('touchend', stopDrawingTouch);
  }

  // Treatment Record Form
  trFormClose?.addEventListener('click', closeTreatmentRecordForm);
  trFormCancel?.addEventListener('click', closeTreatmentRecordForm);
  trForm?.addEventListener('submit', saveTreatmentRecord);
  document.querySelector('#trFormModal .overlay')?.addEventListener('click', closeTreatmentRecordForm);

  // Form Submission
  form?.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    if (!validateForm()) return;

    const payload = collectFormData(form);
    payload._submittedAt = new Date().toISOString();
    if (selectedDentistId)   payload.attendingDentistId = selectedDentistId;
    if (selectedDentistName) payload.attendingDentist   = selectedDentistName;

    const editingId = form.dataset.editingId;
    
    try {
      const formData = new FormData();
      
      for (const [key, val] of Object.entries(payload)) {
        if (Array.isArray(val)) {
          formData.append(key, JSON.stringify(val));
        } else {
          formData.append(key, val ?? '');
        }
      }

      if (capturedPhotoData) {
        const base64Response = await fetch(capturedPhotoData);
        const blob = await base64Response.blob();
        const fileName = `${payload.lastName || 'Patient'}-${payload.firstName || ''}-${new Date().toISOString().split('T')[0]}.jpg`;
        formData.append('photo', blob, fileName);
      }
      
      let res;
      if (editingId) {
        res = await authFetch(`/update/${encodeURIComponent(editingId)}`, {
          method: 'PUT',
          body: capturedPhotoData ? formData : JSON.stringify(payload),
          headers: capturedPhotoData ? {} : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Update failed');
      } else {
        res = await authFetch('/submit', {
          method: 'POST',
          body: capturedPhotoData ? formData : JSON.stringify(payload),
          headers: capturedPhotoData ? {} : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Submit failed');
      }

      const result = await res.json();
      if (editingId) {
        showMessage('Appointment updated!', true);
      } else {
        showMessage('Form submitted successfully!', true);
      }

      if (result.photoPath) {
        if (pmPhoto) {
          pmPhoto.src = result.photoPath + '?t=' + Date.now();
          pmPhoto.style.display = 'block';
          pmPhoto.style.width = '100%';
          pmPhoto.style.height = '100%';
          pmPhoto.style.objectFit = 'cover';
          pmPhoto.style.borderRadius = '50%';
        }

        if (currentPatientGroup) {
          currentPatientGroup.photoPath = result.photoPath;
        }
      }
      
      form.reset();
      capturedPhotoData = null;
      if (cameraOutput) cameraOutput.classList.add('hidden');
      if (cameraView) cameraView.classList.remove('hidden');
      if (cameraCaptureBtn) cameraCaptureBtn.classList.remove('hidden');
      if (cameraRetakeBtn) cameraRetakeBtn.classList.add('hidden');
      if (timerText) timerText.textContent = '';
      
      showPage(0);
      
      if (adminPanel && !adminPanel.classList.contains('hidden')) {
        loadPatients();
        loadAppointments(true);
      }
      
      localStorage.removeItem('dentalFormDraft');
      
    } catch (err) {
      console.error(err);
      showMessage('Failed to submit form. Please try again.', false);
    }
  });

  // Auto-Calculate Age from Birthdate
  const birthdateInput = form?.querySelector('[name="birthdate"]');
  const ageInput = form?.querySelector('[name="age"]');
  
  if (birthdateInput && ageInput) {
    birthdateInput.addEventListener('change', () => {
      const birthDate = new Date(birthdateInput.value);
      const today = new Date();
      
      if (!isNaN(birthDate.getTime())) {
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        
        ageInput.value = age >= 0 ? age : '';
      }
    });
  }

  // Auto-Save Draft
  const saveDraft = () => {
    const formData = collectFormData(form);
    const hasData = Object.values(formData).some(v => 
      v && (Array.isArray(v) ? v.length > 0 : v.toString().trim() !== '')
    );
    
    if (hasData) {
      localStorage.setItem('dentalFormDraft', JSON.stringify(formData));
    }
  };

  const loadDraft = () => {
    const draft = localStorage.getItem('dentalFormDraft');
    if (draft) {
      try {
        const data = JSON.parse(draft);
        for (const [k, v] of Object.entries(data)) {
          const els = form.querySelectorAll(`[name="${k}"]`);
          if (!els || !els.length) continue;

          if (els[0].type === 'checkbox') {
            if (Array.isArray(v)) {
              els.forEach(el => { el.checked = v.includes(el.value); });
            }
          } else if (els[0].type === 'radio') {
            els.forEach(el => { el.checked = (el.value === v); });
          } else {
            els[0].value = v ?? '';
          }
        }
        showMessage('Draft loaded', true);
      } catch (e) {
        console.error('Failed to load draft:', e);
      }
    }
  };

  setTimeout(loadDraft, 1000);
  setInterval(saveDraft, 30000);

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('trRescheduleModal')?.remove();
      document.getElementById('toothCodeDropdown')?.classList.remove('tcd-visible');

      if (toothDrawModal && !toothDrawModal.classList.contains('hidden')) {
        closeToothDrawModal();
      } else if (trFormModal && !trFormModal.classList.contains('hidden')) {
        closeTreatmentRecordForm();
      } else if (patientModal && !patientModal.classList.contains('hidden')) {
        closePatientModal();
      } else if (loginModal && !loginModal.classList.contains('hidden')) {
        hideLoginModal();
      }
    }
  });
});

// Prevent Accidental Page Refresh
window.addEventListener('beforeunload', (e) => {
  const formData = collectFormData(form);
  const hasData = Object.values(formData).some(v => 
    v && (Array.isArray(v) ? v.length > 0 : v.toString().trim() !== '')
  );
  
  if (hasData && !form.dataset.editingId) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

console.log('Dental Chart System Loaded — Two-Box Tooth Status Active (Fixed)');