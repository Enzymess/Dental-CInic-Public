/* =========================================================
   APPOINTMENTS MANAGEMENT SYSTEM - REAL-TIME UPDATES
   ========================================================= */
function startAppointmentsRefresh() {
  loadAppointments();
  
  if (appointmentsRefreshInterval) {
    clearInterval(appointmentsRefreshInterval);
  }
  
  appointmentsRefreshInterval = setInterval(() => {
    loadAppointments(true);
  }, 5000);
  
  console.log('/ Real-time appointments refresh started (every 5 seconds)');
}

function stopAppointmentsRefresh() {
  if (appointmentsRefreshInterval) {
    clearInterval(appointmentsRefreshInterval);
    appointmentsRefreshInterval = null;
  }
}

async function loadAppointments(silent = false) {
  if (!appointmentsList) return;

  if (!silent) {
    appointmentsList.innerHTML = `
      <div class="appointments-loading">
        <div class="spinner"></div>
        <p>Loading appointments...</p>
      </div>
    `;
  }

  try {
    const res = await authFetch('/all-treatment-records');
    if (!res.ok) throw new Error('Failed to load');

    const allRecords = await res.json();

    const filtered = filterAppointmentsByDate(allRecords, currentFilter);

    filtered.sort((a, b) => {
      const dateA = new Date(a.date || a._timestamp || 0);
      const dateB = new Date(b.date || b._timestamp || 0);
      if (dateB - dateA !== 0) return dateB - dateA;
      // Same date — sort by time
      const tA = a.apptTime || '99:99';
      const tB = b.apptTime || '99:99';
      return tA.localeCompare(tB);
    });

    renderAppointments(filtered);
    updateStats(filtered);
  } catch (err) {
    console.error(err);
    if (!silent) {
      appointmentsList.innerHTML = `
        <div class="appointments-empty">
          <div class="icon"></div>
          <h4>Failed to load appointments</h4>
          <p>Please try refreshing the page</p>
        </div>
      `;
    }
  }
}

function filterAppointmentsByDate(records, filter) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return records.filter(rec => {
    const recDate = new Date(rec.date || rec._timestamp || 0);
    const recDay = new Date(recDate.getFullYear(), recDate.getMonth(), recDate.getDate());

    switch (filter) {
      case 'all':
        return true;
      case 'today':
        return recDay.getTime() === today.getTime();
      case '3days': {
        const threeDaysLater = new Date(today);
        threeDaysLater.setDate(today.getDate() + 3);
        return recDay >= today && recDay <= threeDaysLater;
      }
      case 'week': {
        const weekLater = new Date(today);
        weekLater.setDate(today.getDate() + 7);
        return recDay >= today && recDay <= weekLater;
      }
      default:
        return true;
    }
  });
}

function renderAppointments(records) {
  if (!records.length) {
    appointmentsList.innerHTML = `
      <div class="appointments-empty">
        <div class="icon"></div>
        <h4>No appointments found</h4>
        <p>No treatment records for the selected period</p>
      </div>
    `;
    return;
  }

  const scrollPosition = appointmentsList.scrollTop;
  appointmentsList.innerHTML = '';

  records.forEach(rec => {
    const apptDate = rec.date ? new Date(rec.date) : new Date(rec._timestamp || 0);
    const dateStr = apptDate.toLocaleDateString();
    const timeStr = rec.apptTime
      ? (() => {
          const [h, m] = rec.apptTime.split(':');
          const hr = parseInt(h, 10);
          return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
        })()
      : '';
    const isCompleted = rec._completed || false;
    const isFollowUp = !!(rec.denticals && rec.denticals.startsWith('Follow-up from'));
    const statusClass = isCompleted ? 'finished' : 'pending';

    const photoHtml = rec._photoPath
      ? `<img class="appt-patient-photo" src="${rec._photoPath}" alt="" />`
      : `<div class="appt-patient-photo appt-photo-placeholder">${(rec._firstName || '?')[0].toUpperCase()}</div>`;

    const procedure = rec.procedure || 'No procedure noted';
    const toothNo = rec.ToothNo ? `Tooth ${rec.ToothNo}` : '';
    const contact = rec._mobileNo || rec._email || 'No contact info';

    const followUpBadge = isFollowUp
      ? `<span style="display:inline-block;margin-left:6px;padding:1px 8px;background:#dcfce7;color:#16a34a;border-radius:20px;font-size:11px;font-weight:600;">Follow-up</span>`
      : '';

    const recEl = document.createElement('div');
    recEl.className = `appt-item ${statusClass}`;
    recEl.dataset.recId = rec.id;
    recEl.dataset.folderName = rec._patientFolder;

    const billingPaidBadge = rec.billing && rec.billing.paymentStatus === 'paid'
      ? `<span class="billing-paid-badge">Paid</span>`
      : '';

    recEl.innerHTML = `
      <div class="appt-time">
        ${timeStr
          ? `<span class="time">${timeStr}</span><span class="date">${dateStr}</span>`
          : `<span class="time-no-appt">No time</span><span class="date">${dateStr}</span>`
        }
        ${toothNo ? `<span class="appt-tooth">${toothNo}</span>` : ''}
      </div>
      <div class="appt-patient-col">
        ${photoHtml}
      </div>
      <div class="appt-info">
        <h4>${rec._patientName || 'Unknown Patient'}${followUpBadge}${billingPaidBadge}</h4>
        <p>${contact}</p>
        <div class="reason">${procedure}</div>
        ${rec.nextApps && rec._completed
          ? `<div class="appt-next">Next appt: ${new Date(rec.nextApps).toLocaleDateString()}</div>`
          : rec.nextApps && !rec._completed
          ? `<div class="appt-next-pending">Scheduled next: ${new Date(rec.nextApps).toLocaleDateString()}</div>`
          : ''}
      </div>
      <div class="appt-actions">
        <span class="appt-status ${statusClass}">${isCompleted ? 'completed' : 'pending'}</span>
        <button class="btn-billing">Billing</button>
        <button class="btn-status ${isCompleted ? 'undo' : 'complete'}">
          ${isCompleted ? 'Undo' : 'Done'}
        </button>
        <button class="btn-reschedule-tr">Reschedule</button>
        <button class="btn-delete">Delete</button>
      </div>
    `;

    recEl.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openPatientFromTreatmentRecord(rec);
    });

    recEl.querySelector('.btn-billing').addEventListener('click', (e) => {
      e.stopPropagation();
      openBillingModal(rec);
    });

    recEl.querySelector('.btn-status').addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleTreatmentRecordCompletion(rec, !isCompleted);
    });

    recEl.querySelector('.btn-reschedule-tr').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!rec.id) {
        showMessage('Cannot reschedule: record has no ID', false);
        return;
      }
      openTreatmentRescheduleModal(rec);
    });

    recEl.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!rec.id) {
        showMessage('Cannot delete: record has no ID', false);
        return;
      }
      if (confirm(`Delete this appointment for ${rec._patientName}?`)) {
        await deleteTreatmentRecordFromList(rec.id, rec._patientFolder, rec._isTemp);
      }
    });

    appointmentsList.appendChild(recEl);
  });

  appointmentsList.scrollTop = scrollPosition;
}

async function openPatientFromTreatmentRecord(rec) {
  try {
    const res = await authFetch('/patients');
    if (!res.ok) throw new Error('Failed to load patients');
    const allAppointments = await res.json();
    const grouped = groupPatients(allAppointments);
    const patientGroup = grouped.find(g => g.folderName === rec._patientFolder);
    if (patientGroup) {
      openPatientModal(patientGroup);
    } else {
      showMessage('Patient not found', false);
    }
  } catch (err) {
    console.error(err);
    showMessage('Failed to open patient record', false);
  }
}

async function toggleTreatmentRecordCompletion(rec, completed) {
  const recordId = rec.id;
  const folderName = rec._patientFolder;

  if (!recordId) {
    showMessage('Cannot update: record has no ID', false);
    return;
  }

  try {
    // Temp patients (no folderName) use the dedicated temp endpoint
    if (rec._isTemp || !folderName) {
      const res = await authFetch(`/temp-patient/${encodeURIComponent(recordId)}/complete`, {
        method: 'PATCH'
      });
      if (!res.ok) throw new Error('Failed to update temp patient');
      showMessage(completed ? 'Marked as complete' : 'Marked as pending', true);
      await loadAppointments(true);
      return;
    }

    const res = await authFetch(`/treatment-records/${encodeURIComponent(folderName)}/${recordId}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });
    if (!res.ok) throw new Error('Failed to update');

    if (completed && rec.nextApps) {
      await autoCreateNextAppointment(rec);
    }

    showMessage(completed ? 'Marked as complete' : 'Marked as pending', true);
    await loadAppointments(true);
    loadFinancialSummary();
  } catch (err) {
    console.error(err);
    showMessage('Failed to update', false);
  }
}

async function autoCreateNextAppointment(rec) {
  try {
    const existingRes = await authFetch(`/treatment-records/${encodeURIComponent(rec._patientFolder)}`);
    if (existingRes.ok) {
      const existing = await existingRes.json();
      const duplicate = existing.find(r =>
        r.date === rec.nextApps &&
        r.denticals && r.denticals.includes(new Date(rec.date).toLocaleDateString())
      );
      if (duplicate) {
        console.log('Follow-up record already exists, skipping auto-create');
        return;
      }
    }
  } catch (e) {}

  const newRecord = {
    date: rec.nextApps,
    ToothNo: rec.ToothNo || '',
    procedure: rec.procedure || 'Follow-up appointment',
    denticals: `Follow-up from appointment on ${new Date(rec.date).toLocaleDateString()}`,
    amountChanged: '',
    amountPaid: '',
    nextApps: ''
  };

  try {
    const res = await authFetch(`/treatment-records/${encodeURIComponent(rec._patientFolder)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecord)
    });
    if (!res.ok) throw new Error('Failed to create follow-up record');
    console.log(`Auto-created follow-up record for ${rec._patientName} on ${rec.nextApps}`);
  } catch (err) {
    console.error('Failed to auto-create next appointment:', err);
    showMessage('Follow-up appointment could not be auto-created', false);
  }
}

async function deleteTreatmentRecordFromList(recordId, folderName, isTemp) {
  try {
    // Temp-only records (no folderName or explicitly flagged) use the temp endpoint
    if (isTemp || !folderName) {
      const res = await authFetch(`/temp-patient/${encodeURIComponent(recordId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete temp patient');
      showMessage('Temporary appointment deleted', true);
      await loadAppointments(true);
      return;
    }

    const res = await authFetch(`/treatment-records/${encodeURIComponent(folderName)}/${recordId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete');
    showMessage('Appointment deleted', true);
    await loadAppointments(true);
  } catch (err) {
    console.error(err);
    showMessage('Failed to delete', false);
  }
}

function openTreatmentRescheduleModal(rec) {
  if (!rec || !rec.id) {
    showMessage('Cannot reschedule: record has no ID', false);
    return;
  }

  document.getElementById('trRescheduleModal')?.remove();

  const todayStr = new Date().toISOString().split('T')[0];
  const existingDate = rec.date ? rec.date.split('T')[0] : todayStr;
  const existingTime = rec.apptTime || '';

  const modal = document.createElement('div');
  modal.id = 'trRescheduleModal';
  modal.style.cssText = `
    position: fixed; inset: 0; display: flex; align-items: center;
    justify-content: center; z-index: 100010; padding: 20px;
    background: rgba(15,23,42,0.75); backdrop-filter: blur(8px);
  `;
  modal.innerHTML = `
    <div style="
      background: #fff; border-radius: 16px; padding: 28px;
      box-shadow: 0 25px 80px rgba(0,0,0,0.35); width: 100%;
      max-width: 420px; animation: slideUp 0.3s ease;
    ">
      <h3 style="margin:0 0 6px;color:#0b5ea8;font-size:18px;font-weight:700;">
        Reschedule Appointment
      </h3>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b;line-height:1.5;">
        <strong>${rec._patientName || 'Patient'}</strong><br/>
        ${rec.procedure || 'No procedure noted'}
      </p>

      <label style="display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:6px;">
        New Appointment Date *
      </label>
      <input
        type="date"
        id="trRescheduleDate"
        value="${existingDate}"
        style="width:100%;padding:10px 14px;border:2px solid #cbd5e1;border-radius:8px;
               font-size:14px;box-sizing:border-box;margin-bottom:14px;outline:none;
               font-family:inherit;color:#0f1724;"
      />

      <label style="display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:6px;">
        Appointment Time
      </label>
      <input
        type="time"
        id="trRescheduleTime"
        value="${existingTime}"
        style="width:100%;padding:10px 14px;border:2px solid #cbd5e1;border-radius:8px;
               font-size:14px;box-sizing:border-box;margin-bottom:8px;outline:none;
               font-family:inherit;color:#0f1724;"
      />
      <div id="trRescheduleErr" style="color:#dc2626;font-size:13px;min-height:18px;margin-bottom:12px;"></div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button id="trRescancel" style="
          padding:10px 20px;border-radius:8px;border:2px solid #e2e8f0;
          background:#f8fafc;color:#334155;font-size:14px;font-weight:600;cursor:pointer;
        ">Cancel</button>
        <button id="trResconfirm" style="
          padding:10px 24px;border-radius:8px;border:none;
          background:linear-gradient(135deg,#0b5ea8,#0b9adf);
          color:#fff;font-size:14px;font-weight:600;cursor:pointer;
          box-shadow:0 4px 12px rgba(11,94,168,0.3);
        ">Confirm</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('trRescheduleDate')?.focus(), 50);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById('trRescancel').addEventListener('click', () => modal.remove());

  document.getElementById('trResconfirm').addEventListener('click', async () => {
    const newDate = document.getElementById('trRescheduleDate').value;
    const newTime = document.getElementById('trRescheduleTime').value;
    const errEl = document.getElementById('trRescheduleErr');

    if (!newDate) {
      errEl.textContent = 'Please select a new date.';
      return;
    }

    const confirmBtn = document.getElementById('trResconfirm');
    confirmBtn.textContent = 'Saving…';
    confirmBtn.disabled = true;
    errEl.textContent = '';

    try {
      const res = await authFetch(
        `/treatment-records/${encodeURIComponent(rec._patientFolder)}/${rec.id}/reschedule`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newDate, newTime })
        }
      );

      if (!res.ok) throw new Error(`Server responded with ${res.status}`);

      modal.remove();
      showMessage('Appointment rescheduled!', true);
      await loadAppointments(true);
    } catch (err) {
      console.error('Reschedule error:', err);
      errEl.textContent = 'Failed to reschedule. Please try again.';
      confirmBtn.textContent = 'Confirm';
      confirmBtn.disabled = false;
    }
  });
}

async function openPatientFromAppointment(appt) {
  try {
    const res = await authFetch('/patients');
    if (!res.ok) throw new Error('Failed to load patients');
    
    const allAppointments = await res.json();
    const grouped = groupPatients(allAppointments);
    
    const patientGroup = grouped.find(g => 
      g.lastName.toLowerCase() === (appt.lastName || '').toLowerCase() &&
      g.firstName.toLowerCase() === (appt.firstName || '').toLowerCase() &&
      g.birthdate === appt.birthdate
    );
    
    if (patientGroup) {
      openPatientModal(patientGroup);
    } else {
      showMessage('Patient not found', false);
    }
  } catch (err) {
    console.error(err);
    showMessage('Failed to open patient record', false);
  }
}

async function toggleAppointmentCompletion(apptId, folderName, completed) {
  try {
    const res = await authFetch(`/appointments/${encodeURIComponent(apptId)}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName, completed })
    });

    if (!res.ok) throw new Error('Failed to update');

    showMessage(completed ? 'Appointment marked as complete' : '↩ Appointment marked as pending', true);
    
    await loadAppointments(true);
    
    if (adminPanel && !adminPanel.classList.contains('hidden')) {
      await loadPatients();
    }
  } catch (err) {
    console.error(err);
    showMessage('Failed to update appointment', false);
  }
}

async function deleteAppointmentFromList(apptId, folderName) {
  try {
    const res = await authFetch(`/appointments/${encodeURIComponent(apptId)}?folderName=${encodeURIComponent(folderName)}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Failed to delete');

    showMessage('Appointment deleted', true);
    
    await loadAppointments(true);
    
    if (adminPanel && !adminPanel.classList.contains('hidden')) {
      await loadPatients();
    }
  } catch (err) {
    console.error(err);
    showMessage('Failed to delete appointment', false);
  }
}

function updateStats(appointments) {
  const now = new Date();
  const total    = appointments.length;
  const finished = appointments.filter(a => a._completed).length;
  const ongoing  = appointments.filter(a => a._ongoing || false).length;
  const pending  = Math.max(0, total - finished - ongoing);

  animateNumber(totalAppointmentsEl,   total);
  animateNumber(pendingAppointmentsEl, pending);
  animateNumber(document.getElementById('ongoingAppointments'), ongoing);
  animateNumber(finishedAppointmentsEl, finished);

  // Update the date label to reflect the active filter
  const dateEl = document.getElementById('dashTodayDate');
  if (dateEl) {
    const labels = {
      'all':    'All appointments',
      'today':  'Today — ' + now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      '3days':  'Next 3 days',
      'week':   'This week',
    };
    dateEl.textContent = labels[currentFilter] || '';
  }
}

function animateNumber(element, newValue) {
  if (!element) return;

  const currentValue = parseInt(element.textContent) || 0;

  if (currentValue !== newValue) {
    element.style.transform = 'scale(1.2)';
    element.style.color = 'var(--primary)';

    setTimeout(() => {
      element.textContent = newValue;
      element.style.transform = 'scale(1)';
    }, 150);

    setTimeout(() => {
      element.style.color = '';
    }, 300);
  } else {
    element.textContent = newValue;
  }
}

/* =========================================================
   RESCHEDULE MODAL FUNCTIONS (legacy)
   ========================================================= */
function openRescheduleModal(appt) {
  const modal = document.getElementById('rescheduleModal');
  const form = document.getElementById('rescheduleForm');
  const apptIdInput = document.getElementById('rescheduleApptId');
  const folderInput = document.getElementById('reschedulePatientFolder');
  const dateInput = document.getElementById('rescheduleDate');
  const timeInput = document.getElementById('rescheduleTime');

  if (!modal || !form) return;

  apptIdInput.value = appt._id;
  folderInput.value = appt._patientFolder;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.value = tomorrow.toISOString().split('T')[0];
  timeInput.value = '09:00';

  modal.classList.remove('hidden');
}

function closeRescheduleModal() {
  const modal = document.getElementById('rescheduleModal');
  if (modal) modal.classList.add('hidden');
}

async function handleRescheduleSubmit(e) {
  e.preventDefault();

  const apptId = document.getElementById('rescheduleApptId').value;
  const folderName = document.getElementById('reschedulePatientFolder').value;
  const newDate = document.getElementById('rescheduleDate').value;
  const newTime = document.getElementById('rescheduleTime').value;
  const reason = document.getElementById('rescheduleReason').value;

  if (!newDate) {
    showMessage('Please select a new date', false);
    return;
  }

  try {
    const res = await authFetch(`/appointments/${encodeURIComponent(apptId)}/reschedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName, newDate, newTime, reason })
    });

    if (!res.ok) throw new Error('Reschedule failed');

    showMessage('Appointment rescheduled successfully!', true);
    closeRescheduleModal();

    await loadAppointments(true);

    if (adminPanel && !adminPanel.classList.contains('hidden')) {
      await loadPatients();
    }
  } catch (err) {
    console.error(err);
    showMessage('Failed to reschedule appointment', false);
  }
}

/* =========================================================
   UNFINISHED APPOINTMENTS POPUP MODAL
   ========================================================= */
async function showUnfinishedAppointmentsPopup() {
  try {
    const res = await authFetch('/all-treatment-records');
    if (!res.ok) return;

    const allRecords = await res.json();
    const now = new Date();
    const unfinished = allRecords
      .filter(r => !r._completed && new Date(r.date || r._timestamp || 0) <= now)
      .sort((a, b) => new Date(b.date || b._timestamp || 0) - new Date(a.date || a._timestamp || 0));

    if (unfinished.length === 0) return;

    const modal = document.getElementById('unfinishedModal');
    const list = document.getElementById('unfinishedList');
    if (!modal || !list) return;

    list.innerHTML = unfinished.map(rec => {
      const apptDate = rec.date ? new Date(rec.date) : new Date(rec._timestamp || 0);
      const dateStr = apptDate.toLocaleDateString();
      const procedure = rec.procedure || 'No procedure noted';

      return `
        <div class="unfinished-item" data-rec-id="${rec.id}" data-folder="${rec._patientFolder}">
          <div class="unfinished-info">
            <h4>${rec._patientName || 'Unknown Patient'}</h4>
            <p class="unfinished-date">${dateStr}</p>
            <p class="unfinished-reason">${procedure}</p>
          </div>
          <div class="unfinished-actions">
            <button class="btn-finish" data-action="finish" title="Mark as Done">/ Done</button>
            <button class="btn-delete-small" data-action="delete" title="Delete">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.unfinished-item').forEach(item => {
      const recId = parseInt(item.dataset.recId);
      const folderName = item.dataset.folder;
      const rec = unfinished.find(r => r.id === recId);

      item.querySelector('[data-action="finish"]').addEventListener('click', async () => {
        if (rec) {
          await toggleTreatmentRecordCompletion(rec, true);
        }
        item.remove();
        if (list.children.length === 0) closeUnfinishedModal();
        await loadAppointments(true);
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (confirm('Delete this appointment?')) {
          await deleteTreatmentRecordFromList(recId, folderName);
          item.remove();
          if (list.children.length === 0) closeUnfinishedModal();
        }
      });
    });

    modal.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to show unfinished appointments:', err);
  }
}

function closeUnfinishedModal() {
  const modal = document.getElementById('unfinishedModal');
  if (modal) modal.classList.add('hidden');
}