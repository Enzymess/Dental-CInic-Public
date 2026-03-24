/* =========================================================
   PATIENT PORTAL
   =========================================================
   Allows patients to log in using their name + birthdate
   (formatted as YYYY-MM-DD) and edit their own personal
   and contact information.

   Password = birthdate in YYYY-MM-DD format
   e.g. born May 15, 1990 → password: 1990-05-15
   ========================================================= */

(function () {

  /* ── State ─────────────────────────────────────────────── */
  let _patientToken  = null;   // JWT returned from /patient-login
  let _patientFolder = null;   // folder name for update calls
  let _patientData   = null;   // current patient record

  /* ── DOM refs ──────────────────────────────────────────── */
  const portalBtn      = document.getElementById('patientPortalBtn');
  const loginModal     = document.getElementById('patientLoginModal');
  const loginForm      = document.getElementById('patientLoginForm');
  const loginError     = document.getElementById('patientLoginError');
  const loginCancel    = document.getElementById('patientLoginCancel');

  const portalPanel    = document.getElementById('patientPortalPanel');
  const ppClose        = document.getElementById('ppClose');
  const ppCancelBtn    = document.getElementById('ppCancelBtn');
  const ppEditForm     = document.getElementById('ppEditForm');
  const ppMessage      = document.getElementById('ppMessage');
  const ppPatientName  = document.getElementById('ppPatientName');
  const ppPatientSub   = document.getElementById('ppPatientSub');
  const ppAvatar       = document.getElementById('ppAvatar');

  /* ── Open / close login modal ──────────────────────────── */
  portalBtn?.addEventListener('click', () => {
    // If already logged in, go straight to portal
    if (_patientToken) { openPortalPanel(); return; }
    loginForm?.reset();
    if (loginError) loginError.textContent = '';
    loginModal?.classList.remove('hidden');
    loginModal?.setAttribute('aria-hidden', 'false');
    loginForm?.querySelector('[name="lastName"]')?.focus();
  });

  loginCancel?.addEventListener('click', closeLoginModal);
  loginModal?.querySelector('.modal-inner')?.addEventListener('click', e => e.stopPropagation());
  loginModal?.addEventListener('click', closeLoginModal);

  function closeLoginModal() {
    loginModal?.classList.add('hidden');
    loginModal?.setAttribute('aria-hidden', 'true');
  }

  /* ── Patient Login ─────────────────────────────────────── */
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.textContent = '';

    const lastName  = loginForm.querySelector('[name="lastName"]').value.trim();
    const firstName = loginForm.querySelector('[name="firstName"]').value.trim();
    const password  = loginForm.querySelector('[name="password"]').value.trim();

    if (!lastName || !firstName || !password) {
      loginError.textContent = 'Please fill in all fields.';
      return;
    }

    const submitBtn = loginForm.querySelector('[type="submit"]');
    const orig = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';

    try {
      const res = await fetch('/patient-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastName, firstName, password })
      });

      const body = await res.json();

      if (!res.ok || !body.ok) {
        loginError.textContent = body.error || 'Name or password is incorrect.';
        return;
      }

      _patientToken  = body.token;
      _patientFolder = body.folderName;
      _patientData   = body.patient;

      closeLoginModal();
      openPortalPanel();

    } catch (err) {
      loginError.textContent = 'Login failed. Please try again.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = orig;
    }
  });

  /* ── Open patient portal panel ─────────────────────────── */
  function openPortalPanel() {
    if (!_patientData) return;

    const p = _patientData;
    const fullName = `${p.lastName || ''}, ${p.firstName || ''} ${p.middleName || ''}`.trim();

    ppPatientName.textContent = fullName;
    ppPatientSub.textContent  = `Birthdate: ${p.birthdate || '—'}`;
    ppAvatar.textContent      = (p.firstName || '?')[0].toUpperCase();

    // Fill form with current values
    const fields = [
      'lastName','firstName','middleName','nickname','birthdate','age','sex',
      'nationality','religion','occupation','homeAddress','mobileNo','email',
      'homeNo','officeNo','guardianName','guardianContact','guardianOccupation'
    ];
    fields.forEach(f => {
      const el = ppEditForm.querySelector(`[name="${f}"]`);
      if (el) el.value = p[f] || '';
    });

    if (ppMessage) ppMessage.textContent = '';

    portalPanel?.classList.remove('hidden');
    portalPanel?.setAttribute('aria-hidden', 'false');
    portalPanel?.querySelector('.pp-body')?.scrollTo(0, 0);
  }

  /* ── Close patient portal ──────────────────────────────── */
  function closePortalPanel() {
    portalPanel?.classList.add('hidden');
    portalPanel?.setAttribute('aria-hidden', 'true');
  }

  ppClose?.addEventListener('click', closePortalPanel);
  ppCancelBtn?.addEventListener('click', closePortalPanel);
  portalPanel?.querySelector('.pp-overlay')?.addEventListener('click', closePortalPanel);

  /* ── Save patient changes ──────────────────────────────── */
  ppEditForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!_patientToken || !_patientFolder) return;

    const data = Object.fromEntries(new FormData(ppEditForm));

    const submitBtn = ppEditForm.querySelector('[type="submit"]');
    const orig = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    if (ppMessage) { ppMessage.textContent = ''; ppMessage.className = 'pp-message'; }

    try {
      const res = await fetch(`/patient-update-self/${encodeURIComponent(_patientFolder)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + _patientToken
        },
        body: JSON.stringify(data)
      });

      const body = await res.json();

      if (!res.ok || !body.ok) {
        throw new Error(body.error || 'Save failed');
      }

      // Update local data
      Object.assign(_patientData, data);

      // Refresh name display
      const fullName = `${data.lastName || ''}, ${data.firstName || ''} ${data.middleName || ''}`.trim();
      ppPatientName.textContent = fullName;
      ppAvatar.textContent = (data.firstName || '?')[0].toUpperCase();

      ppMessage.textContent = 'Your information has been updated successfully.';
      ppMessage.className = 'pp-message pp-message-success';
      setTimeout(() => { if (ppMessage) ppMessage.textContent = ''; }, 4000);

    } catch (err) {
      ppMessage.textContent = err.message || 'Failed to save changes. Please try again.';
      ppMessage.className = 'pp-message pp-message-error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = orig;
    }
  });

  /* ── Logout when admin logs out (clear patient session too) */
  document.getElementById('adminLogout')?.addEventListener('click', () => {
    _patientToken  = null;
    _patientFolder = null;
    _patientData   = null;
  }, true);

})();
