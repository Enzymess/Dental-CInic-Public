/* =========================================================
   TREATMENT RECORDS FUNCTIONS
   ========================================================= */
async function loadTreatmentRecords() {
  if (!currentPatientGroup || !currentPatientGroup.folderName) return;
  
  const container = document.getElementById('pmTreatmentRecords');
  if (!container) return;
  
  try {
    const res = await authFetch(`/treatment-records/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) throw new Error('Failed to load');
    
    const records = await res.json();
    renderTreatmentRecords(records, container);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="no-data">Failed to load treatment records</div>';
  }
}

function renderTreatmentRecords(records, container) {
  if (!records || records.length === 0) {
    container.innerHTML = `
      <div class="tr-empty-state">
        <div class="tr-empty-icon"></div>
        <h4>No treatment records yet</h4>
        <p>Add the first record using the button above.</p>
      </div>`;
    return;
  }

  records.sort((a, b) => new Date(b.date || b._timestamp) - new Date(a.date || a._timestamp));

  // ── Summary bar totals ──────────────────────────────────────────────────
  let totalCharged = 0, totalPaid = 0;
  records.forEach(r => {
    totalCharged += parseFloat(r.amountChanged) || 0;
    totalPaid    += parseFloat(r.amountPaid)    || 0;
  });
  const totalBalance = totalCharged - totalPaid;
  const fmt = (n) => n > 0 ? '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—';

  // ── Record cards ────────────────────────────────────────────────────────
  const cards = records.map((r, idx) => {
    const charged  = parseFloat(r.amountChanged) || 0;
    const paid     = parseFloat(r.amountPaid)    || 0;
    const balance  = charged - paid;
    const isPaid   = charged > 0 && balance <= 0;
    const hasBalance = balance > 0;

    const payStatus = charged <= 0
      ? '<span class="tr-badge tr-badge-neutral">No Charge</span>'
      : isPaid
        ? '<span class="tr-badge tr-badge-paid">Paid</span>'
        : '<span class="tr-badge tr-badge-unpaid">Unpaid</span>';

    const nextApptHtml = r.nextApps
      ? `<div class="tr-next-appt">
           <span class="tr-next-icon"></span>
           <span>Next: <strong>${new Date(r.nextApps).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</strong></span>
         </div>`
      : '';

    const notesHtml = r.denticals
      ? `<p class="tr-card-notes">${r.denticals}</p>`
      : '';

    const toothHtml = r.ToothNo
      ? `<span class="tr-tooth-badge">Tooth ${r.ToothNo}</span>`
      : '';

    const dateStr = r.date
      ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'No date';
    const timeStr = r.appointmentTime
      ? (() => { const [h, m] = r.appointmentTime.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`; })()
      : '';

    const rowClass = isPaid ? 'tr-card paid' : hasBalance ? 'tr-card unpaid' : 'tr-card no-charge';

    return `
      <div class="${rowClass}" data-record-id="${r.id}">
        <div class="tr-card-left">
          <div class="tr-card-number">${records.length - idx}</div>
        </div>

        <div class="tr-card-body">
          <div class="tr-card-top">
            <div class="tr-card-meta">
              <span class="tr-card-date">${dateStr}${timeStr ? ' &nbsp;' + timeStr : ''}</span>
              ${toothHtml}
              ${payStatus}
            </div>
            <div class="tr-card-actions">
              <button class="tr-btn-edit"  data-record-id="${r.id}">Edit</button>
              <button class="tr-btn-delete" data-record-id="${r.id}">Delete</button>
            </div>
          </div>

          <div class="tr-card-procedure">${r.procedure || '—'}</div>
          ${notesHtml}

          <div class="tr-card-financials">
            <div class="tr-fin-item">
              <span class="tr-fin-label">Charged</span>
              <span class="tr-fin-value">${fmt(charged)}</span>
            </div>
            <div class="tr-fin-sep">→</div>
            <div class="tr-fin-item">
              <span class="tr-fin-label">Paid</span>
              <span class="tr-fin-value tr-fin-paid">${fmt(paid)}</span>
            </div>
            ${balance > 0 ? `
            <div class="tr-fin-sep"></div>
            <div class="tr-fin-item tr-fin-balance-item">
              <span class="tr-fin-label">Balance</span>
              <span class="tr-fin-value tr-fin-balance">₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>` : ''}
          </div>

          ${nextApptHtml}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="tr-summary-bar">
      <div class="tr-summary-item">
        <span class="tr-summary-label">Records</span>
        <span class="tr-summary-value">${records.length}</span>
      </div>
      <div class="tr-summary-divider"></div>
      <div class="tr-summary-item">
        <span class="tr-summary-label">Total Charged</span>
        <span class="tr-summary-value">${fmt(totalCharged)}</span>
      </div>
      <div class="tr-summary-divider"></div>
      <div class="tr-summary-item">
        <span class="tr-summary-label">Total Paid</span>
        <span class="tr-summary-value tr-summary-paid">${fmt(totalPaid)}</span>
      </div>
      <div class="tr-summary-divider"></div>
      <div class="tr-summary-item">
        <span class="tr-summary-label">Outstanding</span>
        <span class="tr-summary-value ${totalBalance > 0 ? 'tr-summary-balance' : 'tr-summary-clear'}">${totalBalance > 0 ? '₱' + totalBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : 'Clear ✓'}</span>
      </div>
    </div>
    <div class="tr-cards-list">${cards}</div>`;

  // ── Event listeners ─────────────────────────────────────────────────────
  container.querySelectorAll('.tr-btn-edit').forEach(btn => {
    btn.addEventListener('click', () => editTreatmentRecord(parseInt(btn.dataset.recordId)));
  });
  container.querySelectorAll('.tr-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteTreatmentRecord(parseInt(btn.dataset.recordId)));
  });
}

function openTreatmentRecordForm(record = null) {
  currentTreatmentRecord = record;
  
  if (record) {
    trFormTitle.textContent = 'Edit Treatment Record';
    trForm.querySelector('[name="date"]').value = record.date || '';
    trForm.querySelector('[name="appointmentTime"]').value = record.appointmentTime || '';
    trForm.querySelector('[name="ToothNo"]').value = record.ToothNo || '';
    trForm.querySelector('[name="procedure"]').value = record.procedure || '';
    trForm.querySelector('[name="denticals"]').value = record.denticals || '';
    trForm.querySelector('[name="amountChanged"]').value = record.amountChanged || '';
    trForm.querySelector('[name="amountPaid"]').value = record.amountPaid || '';
    trForm.querySelector('[name="nextApps"]').value = record.nextApps || '';
  } else {
    trFormTitle.textContent = 'Add Treatment Record';
    trForm.reset();
    trForm.querySelector('[name="date"]').value = new Date().toISOString().split('T')[0];
  }
  
  trFormModal.classList.remove('hidden');
}

function closeTreatmentRecordForm() {
  trFormModal.classList.add('hidden');
  currentTreatmentRecord = null;
  trForm.reset();
}

async function saveTreatmentRecord(e) {
  e.preventDefault();
  
  if (!currentPatientGroup) return;

  const formData = new FormData(trForm);
  const recordData = {
    date:            formData.get('date'),
    appointmentTime: formData.get('appointmentTime') || '',
    ToothNo:         formData.get('ToothNo'),
    procedure:       formData.get('procedure'),
    denticals:       formData.get('denticals'),
    amountChanged:   formData.get('amountChanged'),
    amountPaid:      formData.get('amountPaid'),
    nextApps:        formData.get('nextApps')
  };

  try {
    const url = currentTreatmentRecord 
      ? `/treatment-records/${encodeURIComponent(currentPatientGroup.folderName)}/${currentTreatmentRecord.id}`
      : `/treatment-records/${encodeURIComponent(currentPatientGroup.folderName)}`;
      
    const method = currentTreatmentRecord ? 'PUT' : 'POST';
    
    const res = await authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recordData)
    });

    if (!res.ok) throw new Error('Save failed');

    pmMessage.textContent = currentTreatmentRecord ? 'Record updated!' : 'Record added!';
    setTimeout(() => pmMessage.textContent = '', 3000);

    closeTreatmentRecordForm();
    loadTreatmentRecords();
    loadAppointments(true);
    loadFinancialSummary();
  } catch (err) {
    console.error(err);
    alert('Failed to save treatment record');
  }
}

async function editTreatmentRecord(recordId) {
  try {
    const res = await authFetch(`/treatment-records/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) throw new Error('Failed to load');
    
    const records = await res.json();
    const record = records.find(r => r.id === recordId);
    
    if (record) openTreatmentRecordForm(record);
  } catch (err) {
    console.error(err);
    alert('Failed to load record');
  }
}

async function deleteTreatmentRecord(recordId) {
  if (!confirm('Delete this treatment record?')) return;
  
  try {
    const res = await authFetch(`/treatment-records/${encodeURIComponent(currentPatientGroup.folderName)}/${recordId}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Delete failed');

    pmMessage.textContent = 'Record deleted!';
    setTimeout(() => pmMessage.textContent = '', 3000);

    loadTreatmentRecords();
  } catch (err) {
    console.error(err);
    alert('Failed to delete record');
  }
}

async function exportTreatmentRecordsPDF() {
  if (!currentPatientGroup) {
    alert('No patient selected');
    return;
  }

  try {
    pmMessage.textContent = 'Generating PDF...';
    const res = await authFetch(`/export-treatment-records/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) throw new Error('Export failed');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TreatmentRecords_${currentPatientGroup.lastName}-${currentPatientGroup.firstName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    pmMessage.textContent = 'PDF Exported!';
    setTimeout(() => pmMessage.textContent = '', 3000);
  } catch (err) {
    console.error(err);
    pmMessage.textContent = 'Export failed';
  }
}

/* =========================================================
   PRINT PATIENT RECORDS - COMBINED PDF EXPORT
   ========================================================= */
async function printPatientRecords() {
  if (!currentPatientGroup) {
    alert('No patient selected');
    return;
  }

  try {
    pmMessage.textContent = 'Generating complete patient records PDF...';
    const res = await authFetch(`/export-all-records/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Export failed: ${errorText}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CompleteRecords_${currentPatientGroup.lastName}-${currentPatientGroup.firstName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    pmMessage.textContent = 'Complete Records PDF Exported!';
    setTimeout(() => pmMessage.textContent = '', 3000);
  } catch (err) {
    console.error(err);
    pmMessage.textContent = 'Export failed: ' + err.message;
  }
}