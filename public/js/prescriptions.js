/* =========================================================
   PRESCRIPTIONS MODULE
   ========================================================= */

// State
let _rxDrugCount = 0;
let _currentEditRxId = null;
let _currentRxPatientFolder = null;

// ── Initialize on DOMContentLoaded ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Nav button in patient modal list view
  document.getElementById('pmViewPrescriptions')?.addEventListener('click', () => {
    showPmView('prescriptions');
  });

  // Back button
  document.getElementById('rxBackToList')?.addEventListener('click', () => {
    showPmView('list');
  });

  // New prescription button
  document.getElementById('rxAddBtn')?.addEventListener('click', () => {
    openRxForm(null);
  });

  // Add drug row
  document.getElementById('rxAddDrug')?.addEventListener('click', () => {
    addRxDrugRow();
  });

  // Form close / cancel
  document.getElementById('rxFormClose')?.addEventListener('click', closeRxForm);
  document.getElementById('rxFormCancel')?.addEventListener('click', closeRxForm);

  // Form submit
  document.getElementById('rxForm')?.addEventListener('submit', saveRxForm);

  // Overlay click closes form
  document.querySelector('#rxFormModal .overlay')?.addEventListener('click', closeRxForm);
});

// ── Override showPmView to include prescriptions ──────────────────────────
// (Stored as a patch on top of the existing override chain)
(function () {
  const _prevShowPmView = showPmView;
  showPmView = async function (viewName) {
    // Hide prescriptions view before delegating to previous handler
    const rxView = document.getElementById('pmPrescriptionsView');
    if (rxView) rxView.style.display = 'none';

    if (viewName === 'prescriptions') {
      // Hide all other views
      ['pmListView', 'pmDetailView', 'pmDentalChartView', 'pmTreatmentRecordsView', 'pmPatientImagesView']
        .forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });

      if (rxView) rxView.style.display = 'flex';

      // Load prescriptions
      await loadPrescriptions();
    } else {
      await _prevShowPmView(viewName);
    }
  };
})();

// ── Load and render prescriptions ────────────────────────────────────────
async function loadPrescriptions() {
  if (!currentPatientGroup?.folderName) return;
  _currentRxPatientFolder = currentPatientGroup.folderName;

  const container = document.getElementById('pmPrescriptionsContent');
  if (!container) return;
  container.innerHTML = '<div class="no-data">Loading...</div>';

  try {
    const res = await authFetch(`/prescriptions/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) throw new Error('Failed to load');
    const prescriptions = await res.json();
    renderPrescriptions(prescriptions, container);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="no-data">Failed to load prescriptions</div>';
  }
}

function renderPrescriptions(prescriptions, container) {
  if (!prescriptions || prescriptions.length === 0) {
    container.innerHTML = `
      <div class="rx-empty">
        <div class="rx-empty-icon">Rx</div>
        <h4>No prescriptions yet</h4>
        <p>Click "+ New Prescription" to write one</p>
      </div>
    `;
    return;
  }

  // Newest first
  const sorted = [...prescriptions].sort((a, b) => new Date(b.date || b._timestamp) - new Date(a.date || a._timestamp));

  container.innerHTML = sorted.map(rx => {
    const dateStr = rx.date ? new Date(rx.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'No date';
    const rxNum = rx.rxNumber ? `<span class="rx-card-num">${escapeHtmlRx(rx.rxNumber)}</span>` : '';

    const drugsRows = (rx.drugs || []).map(d => `
      <tr>
        <td class="rx-drug-name">${escapeHtmlRx(d.name || '')}</td>
        <td>${escapeHtmlRx(d.dosage || '')}</td>
        <td>${escapeHtmlRx(d.quantity || '')}</td>
        <td style="white-space:pre-line">${escapeHtmlRx(d.sig || '')}</td>
      </tr>
    `).join('');

    const diagHtml = rx.diagnosis ? `<div class="rx-meta-item"><span class="rx-meta-label">Diagnosis:</span><span class="rx-meta-value">${escapeHtmlRx(rx.diagnosis)}</span></div>` : '';
    const instrHtml = rx.instructions ? `<div class="rx-meta-item"><span class="rx-meta-label">Instructions:</span><span class="rx-meta-value">${escapeHtmlRx(rx.instructions)}</span></div>` : '';

    return `
      <div class="rx-card" data-rx-id="${rx.id}">
        <div class="rx-card-header">
          <div class="rx-card-header-left">
            <span class="rx-card-date">${dateStr}</span>
            ${rxNum}
          </div>
          <div class="rx-card-actions">
            <button class="rx-print-btn" onclick="printRxPDF('${rx.id}')">Print</button>
            <button class="rx-edit-btn"  onclick="editRx('${rx.id}')">Edit</button>
            <button class="rx-delete-btn" onclick="deleteRx('${rx.id}')">Delete</button>
          </div>
        </div>
        <div class="rx-card-body">
          <table class="rx-drug-table">
            <thead>
              <tr>
                <th>Drug / Generic Name</th>
                <th>Dosage / Strength</th>
                <th>Quantity</th>
                <th>Sig (Instructions)</th>
              </tr>
            </thead>
            <tbody>
              ${drugsRows || '<tr><td colspan="4" style="color:#94a3b8;font-size:12px;padding:8px 10px;">No drugs listed</td></tr>'}
            </tbody>
          </table>
          ${diagHtml || instrHtml ? `<div class="rx-card-meta">${diagHtml}${instrHtml}</div>` : ''}
        </div>
        ${rx.dentist ? `<div class="rx-card-dentist">${escapeHtmlRx(rx.dentist)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function escapeHtmlRx(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Open / Close RX Form ─────────────────────────────────────────────────
function openRxForm(existingRx) {
  _currentEditRxId = existingRx ? existingRx.id : null;

  const titleEl = document.getElementById('rxFormTitle');
  if (titleEl) titleEl.textContent = existingRx ? 'Edit Prescription' : 'New Prescription';

  const form = document.getElementById('rxForm');
  if (!form) return;
  form.reset();

  // Pre-fill date with today
  const dateInput = form.querySelector('[name="date"]');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  // Clear and rebuild drug list
  _rxDrugCount = 0;
  const drugsList = document.getElementById('rxDrugsList');
  if (drugsList) drugsList.innerHTML = '';

  if (existingRx) {
    if (dateInput) dateInput.value = existingRx.date || '';
    form.querySelector('[name="rxNumber"]').value   = existingRx.rxNumber   || '';
    form.querySelector('[name="diagnosis"]').value  = existingRx.diagnosis  || '';
    form.querySelector('[name="instructions"]').value = existingRx.instructions || '';
    form.querySelector('[name="dentist"]').value    = existingRx.dentist    || '';

    (existingRx.drugs || []).forEach(d => addRxDrugRow(d));
  }

  // Always at least one drug row
  if (!existingRx || !(existingRx.drugs || []).length) {
    addRxDrugRow();
  }

  document.getElementById('rxFormModal').classList.remove('hidden');
}

function closeRxForm() {
  document.getElementById('rxFormModal').classList.add('hidden');
  _currentEditRxId = null;
}

// ── Drug Rows ─────────────────────────────────────────────────────────────
function addRxDrugRow(prefill = null) {
  _rxDrugCount++;
  const idx = _rxDrugCount;
  const list = document.getElementById('rxDrugsList');
  if (!list) return;

  const row = document.createElement('div');
  row.className = 'rx-drug-row';
  row.dataset.drugIdx = idx;

  row.innerHTML = `
    <label>Drug / Generic Name
      <input type="text" data-drug-field="name" placeholder="e.g. Amoxicillin" value="${escapeHtmlRx(prefill?.name || '')}" />
    </label>
    <label>Dosage / Strength
      <input type="text" data-drug-field="dosage" placeholder="e.g. 500mg" value="${escapeHtmlRx(prefill?.dosage || '')}" />
    </label>
    <label>Qty
      <input type="text" data-drug-field="quantity" placeholder="e.g. 21 caps" value="${escapeHtmlRx(prefill?.quantity || '')}" />
    </label>
    <label>Sig (Directions)
      <input type="text" data-drug-field="sig" placeholder="e.g. 1 cap TID x 7 days" value="${escapeHtmlRx(prefill?.sig || '')}" />
    </label>
    <button type="button" class="rx-drug-row-delete" title="Remove" onclick="this.closest('.rx-drug-row').remove()">×</button>
  `;

  list.appendChild(row);
}

function collectRxDrugs() {
  const rows = document.querySelectorAll('#rxDrugsList .rx-drug-row');
  const drugs = [];
  rows.forEach(row => {
    const name     = row.querySelector('[data-drug-field="name"]')?.value.trim()     || '';
    const dosage   = row.querySelector('[data-drug-field="dosage"]')?.value.trim()   || '';
    const quantity = row.querySelector('[data-drug-field="quantity"]')?.value.trim() || '';
    const sig      = row.querySelector('[data-drug-field="sig"]')?.value.trim()      || '';
    if (name || dosage || quantity || sig) {
      drugs.push({ name, dosage, quantity, sig });
    }
  });
  return drugs;
}

// ── Save RX ───────────────────────────────────────────────────────────────
async function saveRxForm(e) {
  e.preventDefault();
  if (!currentPatientGroup?.folderName) return;

  const form = document.getElementById('rxForm');
  const data = {
    date:         form.querySelector('[name="date"]').value,
    rxNumber:     form.querySelector('[name="rxNumber"]').value.trim(),
    diagnosis:    form.querySelector('[name="diagnosis"]').value.trim(),
    instructions: form.querySelector('[name="instructions"]').value.trim(),
    dentist:      form.querySelector('[name="dentist"]').value.trim(),
    drugs:        collectRxDrugs()
  };

  try {
    let res;
    if (_currentEditRxId) {
      res = await authFetch(
        `/prescriptions/${encodeURIComponent(currentPatientGroup.folderName)}/${_currentEditRxId}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      );
    } else {
      res = await authFetch(
        `/prescriptions/${encodeURIComponent(currentPatientGroup.folderName)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      );
    }

    if (!res.ok) throw new Error('Save failed');

    closeRxForm();
    if (typeof pmMessage !== 'undefined' && pmMessage) {
      pmMessage.textContent = _currentEditRxId ? 'Prescription updated!' : 'Prescription saved!';
      setTimeout(() => pmMessage.textContent = '', 3000);
    }
    await loadPrescriptions();
  } catch (err) {
    console.error(err);
    alert('Failed to save prescription');
  }
}

// ── Edit RX ───────────────────────────────────────────────────────────────
async function editRx(rxId) {
  if (!currentPatientGroup?.folderName) return;
  try {
    const res = await authFetch(`/prescriptions/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) throw new Error('Failed to load');
    const all = await res.json();
    const rx = all.find(r => String(r.id) === String(rxId));
    if (rx) openRxForm(rx);
  } catch (err) {
    alert('Failed to load prescription');
  }
}

// ── Delete RX ─────────────────────────────────────────────────────────────
async function deleteRx(rxId) {
  if (!confirm('Delete this prescription?')) return;
  if (!currentPatientGroup?.folderName) return;
  try {
    const res = await authFetch(
      `/prescriptions/${encodeURIComponent(currentPatientGroup.folderName)}/${rxId}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error('Delete failed');
    await loadPrescriptions();
  } catch (err) {
    alert('Failed to delete prescription');
  }
}

// ── Print Prescription PDF ────────────────────────────────────────────────
async function printRxPDF(rxId) {
  if (!currentPatientGroup?.folderName) return;

  try {
    if (typeof pmMessage !== 'undefined' && pmMessage) pmMessage.textContent = 'Generating prescription PDF...';

    const res = await authFetch(
      `/prescriptions/${encodeURIComponent(currentPatientGroup.folderName)}/${rxId}/print`
    );
    if (!res.ok) throw new Error('Export failed');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rx_${currentPatientGroup.lastName}-${currentPatientGroup.firstName}_${rxId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    if (typeof pmMessage !== 'undefined' && pmMessage) {
      pmMessage.textContent = 'Prescription PDF exported!';
      setTimeout(() => pmMessage.textContent = '', 3000);
    }
  } catch (err) {
    console.error(err);
    alert('Failed to generate prescription PDF');
  }
}

/* ── 1. Patch addRxDrugRow to stamp data-index on each row ── */
(function () {
  const _origAdd = window.addRxDrugRow || addRxDrugRow;

  function _patchedAddRxDrugRow(prefill = null) {
    _origAdd(prefill);

    // After the row is appended, number every row in sequence
    document.querySelectorAll('#rxDrugsList .rx-drug-row').forEach((row, i) => {
      row.dataset.index = 'Rx ' + (i + 1);
    });
  }

  // Expose globally so the existing event listener still calls the right fn
  window.addRxDrugRow = _patchedAddRxDrugRow;

  // Re-number rows whenever one is deleted
  document.getElementById('rxDrugsList')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('rx-drug-row-delete')) {
      // Wait a tick for the row to be removed first
      setTimeout(() => {
        document.querySelectorAll('#rxDrugsList .rx-drug-row').forEach((row, i) => {
          row.dataset.index = 'Rx ' + (i + 1);
        });
      }, 0);
    }
  });
})();


/* ── 2. Patch renderPrescriptions to make cards clickable ── */
(function () {
  const _origRender = window.renderPrescriptions || renderPrescriptions;

  function _patchedRenderPrescriptions(prescriptions, container) {
    // Call the original renderer
    _origRender(prescriptions, container);

    // After rendering, attach click handlers to every card
    container.querySelectorAll('.rx-card').forEach(card => {
      const rxId = card.dataset.rxId;
      if (!rxId) return;

      card.addEventListener('click', (e) => {
        // Don't fire if a button inside the card was clicked
        if (e.target.closest('button')) return;
        editRx(rxId);
      });
    });
  }

  window.renderPrescriptions = _patchedRenderPrescriptions;
})();

(function () {
  const _origToggle = toggleTreatmentRecordCompletion;

  async function _patchedToggle(rec, completed) {
    // Run the original (marks complete + calls loadAppointments)
    await _origToggle(rec, completed);

    // If the schedule view is currently visible, refresh it too
    const scheduleView = document.getElementById('scheduleView');
    const isScheduleVisible =
      scheduleView &&
      (scheduleView.classList.contains('active') ||
       scheduleView.style.display === 'block' ||
       scheduleView.style.display === 'flex');

    // Always refresh schedule data so it's up-to-date when user
    // switches to it — but only re-render calendar/list if visible
    if (typeof loadSchedule === 'function') {
      if (isScheduleVisible) {
        await loadSchedule();
      } else {
        // Silent background refresh: just update the data store
        try {
          const res = await authFetch('/all-treatment-records');
          if (res.ok) {
            scheduleAllRecords = await res.json();
          }
        } catch (e) {
          // Non-critical — schedule will reload fresh when user opens it
        }
      }
    }
  }

  // Expose globally so all callers (Done button, unfinished modal, etc.)
  // automatically use the patched version
  window.toggleTreatmentRecordCompletion = _patchedToggle;
})();
(function () {
  const _origRenderBilling = window.renderBillingTable || renderBillingTable;

  window.renderBillingTable = function () {
    // Run original renderer first
    _origRenderBilling();

    // Find the table that contains #billingTableBody
    const tbody = document.getElementById('billingTableBody');
    if (!tbody) return;

    const table = tbody.closest('table');
    if (!table) return;

    // If already wrapped, do nothing
    if (table.parentElement && table.parentElement.classList.contains('bv-table-wrapper')) return;

    // Wrap the table in a scrollable div
    const wrapper = document.createElement('div');
    wrapper.className = 'bv-table-wrapper';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  };
})();
(function () {

  /* ── Track which day panel is currently open ── */
  let _openDayNumber = null;   // e.g. 1

  /* ── Patch openDayPanel to remember the open day ── */
  const _origOpenDay = window.openDayPanel || openDayPanel;
  window.openDayPanel = function (day, records) {
    _openDayNumber = day;
    _origOpenDay(day, records);
  };

  /* ── Patch closeDayPanel to clear tracking ── */
  const _origCloseDay = window.closeDayPanel || closeDayPanel;
  window.closeDayPanel = function () {
    _openDayNumber = null;
    _origCloseDay();
  };

  /* ── Patch loadSchedule to reopen the day panel after reload ── */
  const _origLoadSchedule = window.loadSchedule || loadSchedule;
  window.loadSchedule = async function () {
    const dayToReopen = _openDayNumber;   // snapshot before async
    await _origLoadSchedule();

    if (dayToReopen !== null) {
      // Find fresh records for that day from the newly loaded data
      const freshRecords = scheduleAllRecords.filter(rec => {
        const d = new Date(rec.date || rec._timestamp || 0);
        return (
          d.getFullYear() === scheduleYear &&
          d.getMonth()    === scheduleMonth &&
          d.getDate()     === dayToReopen
        );
      });

      if (freshRecords.length > 0) {
        // Re-open panel with updated records (sets _openDayNumber again)
        window.openDayPanel(dayToReopen, freshRecords);
      } else {
        // All records deleted — close the panel cleanly
        window.closeDayPanel();
      }
    }
  };

  /* ── Also patch toggleTreatmentRecordCompletion so that
        clicking Done/Undo from the Appointments tab also
        refreshes schedule data in the background ── */
  const _origToggle = window.toggleTreatmentRecordCompletion || toggleTreatmentRecordCompletion;
  window.toggleTreatmentRecordCompletion = async function (rec, completed) {
    await _origToggle(rec, completed);

    // Refresh schedule data silently; if schedule view is active,
    // loadSchedule will also re-render (and reopen the day panel
    // via the patch above).
    const schedView = document.getElementById('scheduleView');
    const isVisible = schedView &&
      (schedView.classList.contains('active') ||
       getComputedStyle(schedView).display !== 'none');

    if (isVisible && typeof window.loadSchedule === 'function') {
      await window.loadSchedule();
    } else {
      // Background update only
      try {
        const res = await authFetch('/all-treatment-records');
        if (res.ok) scheduleAllRecords = await res.json();
      } catch (_) {}
    }
  };

})();
