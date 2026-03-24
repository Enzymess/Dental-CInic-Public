/* =========================================================
   TEMPORARY PATIENT — Add to Schedule
   ========================================================= */
(function () {

  const modal        = document.getElementById('addTempPatientModal');
  const closeBtn     = document.getElementById('addTempPatientClose');
  const cancelBtn    = document.getElementById('addTempPatientCancel');
  const form         = document.getElementById('addTempPatientForm');
  const openBtn      = document.getElementById('addTempPatientBtn');

  // ── Keep track of which date the day-panel is showing ──
  let _activeDayDate = null;   // ISO date string e.g. "2025-03-13"

  // Intercept openDayPanel to record the currently-open day
  const _prevOpenDay = window.openDayPanel;
  window.openDayPanel = function (day, records) {
    // Reconstruct ISO date from scheduleYear/scheduleMonth
    const y = typeof scheduleYear  !== 'undefined' ? scheduleYear  : new Date().getFullYear();
    const m = typeof scheduleMonth !== 'undefined' ? scheduleMonth : new Date().getMonth();
    const d = String(day).padStart(2, '0');
    const mm = String(m + 1).padStart(2, '0');
    _activeDayDate = `${y}-${mm}-${d}`;
    _prevOpenDay(day, records);
  };

  const _prevCloseDay = window.closeDayPanel;
  window.closeDayPanel = function () {
    _activeDayDate = null;
    _prevCloseDay();
  };

  // ── Open modal ──
  function openModal() {
    form.reset();
    // Pre-fill the date from the currently-open day panel
    const dateInput = form.querySelector('[name="date"]');
    if (dateInput && _activeDayDate) dateInput.value = _activeDayDate;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    form.querySelector('[name="fullName"]')?.focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.querySelector('.overlay')?.addEventListener('click', closeModal);

  // ── Submit: POST to /temp-patient ──
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(form));
    if (!data.fullName?.trim()) return;
    if (!data.apptTime) delete data.apptTime; // keep undefined rather than empty string

    const submitBtn = form.querySelector('[type="submit"]');
    const origText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      const res = await authFetch('/temp-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!res.ok) throw new Error(await res.text());

      showMessage('Temporary patient added to schedule!', true);
      closeModal();

      // Refresh schedule so new entry appears
      if (typeof window.loadSchedule === 'function') {
        await window.loadSchedule();
      }
    } catch (err) {
      console.error('Temp patient error:', err);
      showMessage('Failed to add temporary patient. Please try again.', false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  });

  // ── Patch renderAppointmentCards (TEMP badge now built-in, no extra patch needed) ──


})();