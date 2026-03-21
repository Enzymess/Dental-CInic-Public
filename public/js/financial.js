/* =========================================================
   FINANCIAL SUMMARY
   ========================================================= */
async function loadFinancialSummary() {
  try {
    const res = await authFetch('/financial-summary');
    if (!res.ok) return;
    const data = await res.json();
    renderFinancialSummary(data);
  } catch (err) {
    console.error('Failed to load financial summary:', err);
  }
}

function formatPeso(amount) {
  const n = parseFloat(amount) || 0;
  return '₱ ' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderFinancialSummary(data) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatPeso(val);
  };
  set('finDailyRevenue',   data.dailyRevenue   || 0);
  set('finMonthlyRevenue', data.monthlyRevenue || 0);
  set('finTotalRevenue',   data.totalRevenue   || 0);
  set('finTotalExpenses',  data.totalExpenses  || 0);

  const profitEl = document.getElementById('finNetProfit');
  if (profitEl) {
    const profit = parseFloat(data.totalNetProfit) || 0;
    profitEl.textContent = formatPeso(profit);
    // Toggle negative class on the parent card element
    const card = profitEl.closest('.dash-fin-card') || profitEl.closest('.fin-card');
    if (card) card.classList.toggle('negative', profit < 0);
  }
}

