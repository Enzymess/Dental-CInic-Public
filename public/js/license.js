/* =========================================================
   LICENSE / FEATURE GATING
   Reads /license from the server (written by setup.js) and
   shows or hides UI elements based on the purchased version.
   ========================================================= */

window.pdaFeatures = null;

/* ── Feature → DOM element map ──────────────────────────── */
// Each entry: { feature: 'flagName', selectors: ['#id', ...] }
const FEATURE_GATE = [
  // Dashboard nav + view
  {
    feature: 'dashboard',
    selectors: ['#navDashboard', '#dashView']
  },
  // Scheduling nav + view
  {
    feature: 'scheduling',
    selectors: ['#navSchedule', '#scheduleView']
  },
  // Billing nav + view
  {
    feature: 'billing',
    selectors: ['#navBilling', '#billingView']
  },
  // Patient images button inside patient modal
  {
    feature: 'patientImages',
    selectors: ['#pmViewPatientImages', '#pmPatientImagesView']
  },
  // Prescriptions button + view inside patient modal
  {
    feature: 'prescriptions',
    selectors: ['#pmViewPrescriptions', '#pmPrescriptionsView', '#rxFormModal']
  },
  // Print button inside patient modal
  {
    feature: 'print',
    selectors: ['#pmPrint']
  },
  // Dental chart button + view
  {
    feature: 'dentalChart',
    selectors: ['#pmViewDentalChart', '#pmDentalChartView', '#toothDrawModal']
  },
  // Treatment / dental records button + view
  {
    feature: 'dentalRecords',
    selectors: ['#pmViewTreatmentRecords', '#pmTreatmentRecordsView', '#trFormModal']
  }
];

async function loadLicense() {
  try {
    const res = await fetch('/license');
    if (!res.ok) throw new Error('No license endpoint');
    const data = await res.json();
    window.pdaFeatures = data.features;
    console.log(`PDA License: v${data.version} — ${data.label}`);
  } catch (err) {
    console.warn('Could not load license, enabling all features:', err);
    // Safe fallback — show everything
    window.pdaFeatures = {
      patientForm: true, patientList: true, dentalChart: true,
      dentalRecords: true, print: true, dashboard: true,
      billing: true, scheduling: true, patientImages: true,
      prescriptions: true
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyFeatureGates);
  } else {
    applyFeatureGates();
  }
}

function applyFeatureGates() {
  const f = window.pdaFeatures;
  if (!f) return;

  FEATURE_GATE.forEach(({ feature, selectors }) => {
    const enabled = !!f[feature];
    selectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (!enabled) {
        el.style.display = 'none';
        el.setAttribute('data-feature-hidden', feature);
      }
    });
  });

  // If dashboard is disabled, activate the first visible nav view instead
  if (!f.dashboard) {
    const firstNav = document.querySelector('.dash-nav-btn:not([style*="display: none"])');
    if (firstNav) {
      document.querySelectorAll('.dash-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
      firstNav.classList.add('active');
      const targetView = firstNav.dataset.view;
      document.getElementById(targetView)?.classList.add('active');
    }
  }

  // Hide billing badge if billing is off
  if (!f.billing) {
    document.getElementById('billingUnpaidCount')?.style && (
      document.getElementById('billingUnpaidCount').style.display = 'none'
    );
  }
}

// Run immediately on script load
loadLicense();
