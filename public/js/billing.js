/* =========================================================
   BILLING MODAL
   ========================================================= */
let _billingCurrentRec = null;

function openBillingModal(rec) {
  _billingCurrentRec = rec;

  const modal  = document.getElementById('billingModal');
  const nameEl = document.getElementById('billingPatientName');
  const infoEl = document.getElementById('billingRecordInfo');
  const itemsEl = document.getElementById('billingItemsTable');
  const noItemsEl = document.getElementById('billingNoItems');
  const totalEl = document.getElementById('billingTotal');
  const expInput = document.getElementById('billingExpenses');
  const netEl   = document.getElementById('billingNetProfit');
  const badge   = document.getElementById('billingPaymentBadge');
  const markBtn = document.getElementById('billingMarkPaidBtn');

  // Patient name
  if (nameEl) nameEl.textContent = rec._patientName || 'Patient';

  // Record info
  const dateStr = rec.date ? new Date(rec.date).toLocaleDateString() : '—';
  if (infoEl) infoEl.textContent = `${rec.procedure || 'No procedure'} · Tooth ${rec.ToothNo || '—'} · ${dateStr}`;

  // Billing data
  const billing = rec.billing || {
    items: [], totalAmount: 0, expenses: 0, netProfit: 0,
    paymentStatus: 'unpaid', paymentDate: null
  };

  // Items table
  if (billing.items && billing.items.length > 0) {
    if (noItemsEl) noItemsEl.style.display = 'none';
    if (itemsEl) {
      itemsEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Procedure</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Tooth</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${billing.items.map(item => `
              <tr>
                <td style="padding:9px 12px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${item.procedure}</td>
                <td style="padding:9px 12px;text-align:center;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">${item.toothNumber || '—'}</td>
                <td style="padding:9px 12px;text-align:right;font-size:13px;font-weight:600;color:#0b5ea8;border-bottom:1px solid #f1f5f9;">${formatPeso(item.price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    }
  } else {
    if (itemsEl) itemsEl.innerHTML = '';
    if (noItemsEl) noItemsEl.style.display = 'block';
  }

  // Totals
  if (totalEl) totalEl.textContent = formatPeso(billing.totalAmount);
  if (expInput) expInput.value = parseFloat(billing.expenses) || '';
  const profit = (parseFloat(billing.totalAmount) || 0) - (parseFloat(billing.expenses) || 0);
  if (netEl) {
    netEl.textContent = formatPeso(profit);
    netEl.style.color = profit < 0 ? '#dc2626' : '#0369a1';
  }

  // Payment badge
  const isPaid = billing.paymentStatus === 'paid';
  if (badge) {
    badge.textContent = isPaid ? 'Paid' : 'Unpaid';
    badge.style.background = isPaid ? '#d1fae5' : '#fee2e2';
    badge.style.color       = isPaid ? '#065f46' : '#be123c';
  }
  if (markBtn) {
    markBtn.textContent = isPaid ? 'Mark as Unpaid' : 'Mark as Paid';
    markBtn.style.background = isPaid
      ? 'linear-gradient(135deg,#ef4444,#dc2626)'
      : 'linear-gradient(135deg,#10b981,#059669)';
    markBtn.style.color = '#fff';
  }

  // Show modal
  if (modal) modal.style.display = 'flex';
}

function closeBillingModal() {
  const modal = document.getElementById('billingModal');
  if (modal) modal.style.display = 'none';
  _billingCurrentRec = null;
}

async function saveBillingExpenses() {
  if (!_billingCurrentRec) return;
  const expInput = document.getElementById('billingExpenses');
  const expenses = parseFloat(expInput?.value) || 0;

  try {
    const res = await authFetch(
      `/update-expenses/${encodeURIComponent(_billingCurrentRec._patientFolder)}/${_billingCurrentRec.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenses })
      }
    );
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    _billingCurrentRec.billing = data.billing;

    // Update net profit display
    const profit = (parseFloat(data.billing.totalAmount) || 0) - expenses;
    const netEl = document.getElementById('billingNetProfit');
    if (netEl) {
      netEl.textContent = formatPeso(profit);
      netEl.style.color = profit < 0 ? '#dc2626' : '#0369a1';
    }

    showMessage('Expenses saved!', true);
    loadFinancialSummary();
    loadAppointments(true);
  } catch (err) {
    console.error(err);
    showMessage('Failed to save expenses', false);
  }
}

async function toggleBillingPayment() {
  if (!_billingCurrentRec) return;
  const currentPaid = _billingCurrentRec.billing?.paymentStatus === 'paid';
  const newPaid     = !currentPaid;

  try {
    const res = await authFetch(
      `/mark-paid/${encodeURIComponent(_billingCurrentRec._patientFolder)}/${_billingCurrentRec.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: newPaid })
      }
    );
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    _billingCurrentRec.billing = data.billing;

    // Update badge & button
    const badge   = document.getElementById('billingPaymentBadge');
    const markBtn = document.getElementById('billingMarkPaidBtn');
    if (badge) {
      badge.textContent  = newPaid ? 'Paid' : 'Unpaid';
      badge.style.background = newPaid ? '#d1fae5' : '#fee2e2';
      badge.style.color       = newPaid ? '#065f46' : '#be123c';
    }
    if (markBtn) {
      markBtn.textContent = newPaid ? 'Mark as Unpaid' : 'Mark as Paid';
      markBtn.style.background = newPaid
        ? 'linear-gradient(135deg,#ef4444,#dc2626)'
        : 'linear-gradient(135deg,#10b981,#059669)';
    }

    showMessage(newPaid ? 'Marked as Paid' : 'Marked as Unpaid', true);
    loadFinancialSummary();
    loadAppointments(true);
  } catch (err) {
    console.error(err);
    showMessage('Failed to update payment status', false);
  }
}

/* =========================================================
   BILLING VIEW
   ========================================================= */
let _allBillingRecords = [];
let _billingFilter = 'all';
let _billingSearch = '';

function getBillingStatus(rec) {
  const charged = parseFloat(rec.amountChanged) || 0;
  const paid    = parseFloat(rec.amountPaid)    || 0;
  if (charged <= 0) return 'no-charge';
  const balance = charged - paid;
  return balance <= 0 ? 'paid' : 'unpaid';
}

async function loadBillingView() {
  try {
    const res = await authFetch('/all-treatment-records');
    if (!res.ok) throw new Error('Failed');
    _allBillingRecords = await res.json();
    renderBillingTable();
    updateBillingTotals();
    updateBillingBadge();
  } catch (err) {
    console.error('loadBillingView error:', err);
    const tbody = document.getElementById('billingTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="billing-empty">Failed to load billing records.</td></tr>';
  }
}

function getBillingFiltered() {
  const q = _billingSearch.toLowerCase().trim();
  return _allBillingRecords.filter(rec => {
    const status = getBillingStatus(rec);
    if (_billingFilter === 'paid'   && status !== 'paid')   return false;
    if (_billingFilter === 'unpaid' && status !== 'unpaid') return false;
    if (q) {
      const name = (rec._patientName || '').toLowerCase();
      const proc = (rec.procedure || '').toLowerCase();
      if (!name.includes(q) && !proc.includes(q)) return false;
    }
    return true;
  });
}

function updateBillingTotals() {
  let totalCharged = 0, totalPaid = 0, unpaidCount = 0;
  for (const rec of _allBillingRecords) {
    const charged = parseFloat(rec.amountChanged) || 0;
    const paid    = parseFloat(rec.amountPaid)    || 0;
    totalCharged += charged;
    totalPaid    += paid;
    if (getBillingStatus(rec) === 'unpaid') unpaidCount++;
  }
  const balance = totalCharged - totalPaid;

  const el = id => document.getElementById(id);
  if (el('bvTotalCharged'))  el('bvTotalCharged').textContent  = formatPeso(totalCharged);
  if (el('bvTotalPaid'))     el('bvTotalPaid').textContent     = formatPeso(totalPaid);
  if (el('bvTotalBalance'))  el('bvTotalBalance').textContent  = formatPeso(balance);
  if (el('bvUnpaidCount'))   el('bvUnpaidCount').textContent   = unpaidCount;
}

function updateBillingBadge() {
  const unpaid = _allBillingRecords.filter(r => getBillingStatus(r) === 'unpaid').length;
  const badge = document.getElementById('billingUnpaidCount');
  if (!badge) return;
  badge.textContent = unpaid > 0 ? unpaid : '0';
  badge.style.display = unpaid > 0 ? '' : 'none';
}

function renderBillingTable() {
  const tbody = document.getElementById('billingTableBody');
  if (!tbody) return;

  const records = getBillingFiltered();
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="billing-empty">No billing records found.</td></tr>';
    return;
  }

  // Sort newest first
  records.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Store references keyed by unique row key so onclick can reference safely
  if (!window._billingRowMap) window._billingRowMap = {};
  window._billingRowMap = {};

  tbody.innerHTML = records.map((rec, i) => {
    const rowKey = `${rec._patientFolder}_${rec.id}_${i}`;
    window._billingRowMap[rowKey] = rec;

    const status   = getBillingStatus(rec);
    const charged  = parseFloat(rec.amountChanged) || 0;
    const paid     = parseFloat(rec.amountPaid)    || 0;
    const balance  = charged - paid;
    const dateStr  = rec.date ? new Date(rec.date).toLocaleDateString('en-PH') : '-';
    const name     = rec._patientName || '-';
    const proc     = rec.procedure    || '-';
    const tooth    = rec.ToothNo      || '-';

    let badgeHtml;
    if (status === 'paid') {
      badgeHtml = '<span class="bv-badge paid">Paid</span>';
    } else if (status === 'unpaid') {
      badgeHtml = '<span class="bv-badge unpaid">Unpaid</span>';
    } else {
      badgeHtml = '<span class="bv-badge no-charge">No Charge</span>';
    }

    const toggleLabel = status === 'paid' ? 'Mark Unpaid' : 'Mark Paid';
    const toggleClass = status === 'paid' ? 'bv-btn bv-btn-unpaid' : 'bv-btn bv-btn-paid';
    const rk = escHtml(rowKey);

    return `<tr>
      <td>${dateStr}</td>
      <td>${escHtml(name)}</td>
      <td>${escHtml(proc)}</td>
      <td>${escHtml(tooth)}</td>
      <td>${formatPeso(charged)}</td>
      <td>${formatPeso(paid)}</td>
      <td>${formatPeso(balance)}</td>
      <td>${badgeHtml}</td>
      <td>
        <div class="bv-actions">
          <button class="bv-btn bv-btn-edit"
            onclick="openEditBillingModal(window._billingRowMap['${rk}'])">Edit</button>
          <button class="${toggleClass}"
            onclick="toggleBillingRowStatus(window._billingRowMap['${rk}'])">${escHtml(toggleLabel)}</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Toggle paid/unpaid from billing view row ──
async function toggleBillingRowStatus(rec) {
  if (!rec) return;

  const currentStatus = getBillingStatus(rec);
  const markPaid = currentStatus !== 'paid';

  try {
    const res = await authFetch(
      `/mark-paid/${encodeURIComponent(rec._patientFolder)}/${rec.id}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: markPaid }) }
    );
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();

    // Update local record
    const idx = _allBillingRecords.findIndex(r => r.id === rec.id && r._patientFolder === rec._patientFolder);
    if (idx !== -1) {
      if (data.record) {
        _allBillingRecords[idx] = { ..._allBillingRecords[idx], ...data.record };
      } else {
        _allBillingRecords[idx].amountPaid    = markPaid ? (_allBillingRecords[idx].amountChanged || 0) : 0;
        _allBillingRecords[idx].billing       = data.billing;
      }
    }

    renderBillingTable();
    updateBillingTotals();
    updateBillingBadge();
    loadFinancialSummary();
  } catch (err) {
    console.error(err);
    alert('Failed to update payment status');
  }
}

// ── Add Billing Record ──
async function openAddBillingModal() {
  const modal = document.getElementById('addBillingModal');
  const select = document.getElementById('addBillingPatient');
  const form = document.getElementById('addBillingForm');
  if (!modal || !select || !form) return;

  // Reset form
  form.reset();

  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  form.elements['date'].value = today;

  // Load patient list
  select.innerHTML = '<option value="">Loading...</option>';
  try {
    const res = await authFetch('/patients-list');
    const patients = await res.json();
    select.innerHTML = '<option value="">Select a patient...</option>' +
      patients.map(p => `<option value="${escHtml(p.folderName)}">${escHtml(p.displayName)}</option>`).join('');
  } catch {
    select.innerHTML = '<option value="">Failed to load patients</option>';
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

async function submitAddBillingForm(e) {
  e.preventDefault();
  const form = document.getElementById('addBillingForm');
  const folderName = document.getElementById('addBillingPatient').value;
  if (!folderName) { alert('Please select a patient.'); return; }

  const data = {
    date:          form.elements['date'].value,
    ToothNo:       form.elements['ToothNo'].value,
    procedure:     form.elements['procedure'].value,
    amountChanged: parseFloat(form.elements['amountChanged'].value) || 0,
    amountPaid:    parseFloat(form.elements['amountPaid'].value)    || 0,
    nextApps:      form.elements['nextApps'].value,
    denticals:     form.elements['denticals'].value
  };

  try {
    const res = await authFetch(
      `/treatment-records/${encodeURIComponent(folderName)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data) }
    );
    if (!res.ok) throw new Error('Save failed');
    closeAddBillingModal();
    loadBillingView();
    loadFinancialSummary();
  } catch (err) {
    console.error(err);
    alert('Failed to save billing record.');
  }
}

function closeAddBillingModal() {
  const modal = document.getElementById('addBillingModal');
  if (modal) { modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true'); }
}

// ── Edit Billing Record ──
function openEditBillingModal(rec) {
  if (!rec) return;

  const modal = document.getElementById('editBillingModal');
  const form  = document.getElementById('editBillingForm');
  if (!modal || !form) return;

  document.getElementById('editBillingRecordId').value   = rec.id;
  document.getElementById('editBillingFolderName').value = rec._patientFolder;

  form.elements['date'].value          = rec.date       || '';
  form.elements['ToothNo'].value       = rec.ToothNo    || '';
  form.elements['procedure'].value     = rec.procedure  || '';
  form.elements['amountChanged'].value = rec.amountChanged != null ? rec.amountChanged : '';
  form.elements['amountPaid'].value    = rec.amountPaid    != null ? rec.amountPaid    : '';
  form.elements['nextApps'].value      = rec.nextApps   || '';
  form.elements['denticals'].value     = rec.denticals  || '';

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

async function submitEditBillingForm(e) {
  e.preventDefault();
  const form       = document.getElementById('editBillingForm');
  const recordId   = document.getElementById('editBillingRecordId').value;
  const folderName = document.getElementById('editBillingFolderName').value;

  const data = {
    date:          form.elements['date'].value,
    ToothNo:       form.elements['ToothNo'].value,
    procedure:     form.elements['procedure'].value,
    amountChanged: parseFloat(form.elements['amountChanged'].value) || 0,
    amountPaid:    parseFloat(form.elements['amountPaid'].value)    || 0,
    nextApps:      form.elements['nextApps'].value,
    denticals:     form.elements['denticals'].value
  };

  try {
    const res = await authFetch(
      `/treatment-records/${encodeURIComponent(folderName)}/${recordId}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data) }
    );
    if (!res.ok) throw new Error('Save failed');
    closeEditBillingModal();
    loadBillingView();
    loadFinancialSummary();
    loadAppointments(true);
  } catch (err) {
    console.error(err);
    alert('Failed to update billing record.');
  }
}

function closeEditBillingModal() {
  const modal = document.getElementById('editBillingModal');
  if (modal) { modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true'); }
}

