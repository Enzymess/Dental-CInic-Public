/* fix photo circle + dental chart unified column layout */
;(function injectPhotoStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── Photo circle ── */
    .pm-photo-wrapper { overflow: hidden !important; border-radius: 50% !important; flex-shrink: 0; }
    #pmPhoto { width: 100% !important; height: 100% !important; object-fit: cover !important; border-radius: 50% !important; display: block; }

    /* ══════════════════════════════════════════════════
       DENTAL CHART  –  Unified-column layout
       Each tooth column holds: num + top-box + bot-box + tooth-btn  (upper)
                            or: tooth-btn + top-box + bot-box + num  (lower)
       This guarantees top & bottom boxes ALWAYS align with their tooth.
       ══════════════════════════════════════════════════ */

    /* Scrollable wrapper so chart never breaks on narrow screens */
    .dental-chart-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 4px;
    }

    .dental-chart-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 4px;
    }

    /* ── Arch row: side-label | half-row | midline | half-row | side-label ── */
    .dc-arch-row {
      display: flex;
      align-items: stretch;
      gap: 0;
      flex-wrap: nowrap;
      justify-content: center;
    }

    .dc-side-label {
      width: 66px;
      font-size: 8.5px;
      font-weight: 700;
      color: #334155;
      text-align: center;
      line-height: 1.35;
      flex-shrink: 0;
      padding: 2px 1px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dc-side-label-right { width: 66px; flex-shrink: 0; }

    /* Half-rows — NO flex:1, just natural size hugging the midline */
    .dc-half {
      display: flex;
      align-items: stretch;
      gap: 2px;
      flex-wrap: nowrap;
    }
    .dc-half-right { justify-content: flex-end; }
    .dc-half-left  { justify-content: flex-start; }

    /* Vertical midline bar */
    .dc-midline {
      width: 3px;
      background: #1e293b;
      flex-shrink: 0;
      margin: 0 4px;
      border-radius: 2px;
    }

    /* ── Unified tooth column ── */
    .dc-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      flex-shrink: 0;
    }

    /* Tooth number label */
    .dc-tooth-num {
      width: 28px;
      font-size: 8px;
      font-weight: 700;
      color: #64748b;
      line-height: 1.2;
      text-align: center;
      flex-shrink: 0;
    }

    /* ── Status boxes (top = condition, bottom = surgery) ── */
    .dc-sbox {
      width: 28px;
      height: 14px;
      border: 1px solid #94a3b8;
      background: #fff;
      flex-shrink: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 7.5px;
      font-weight: 700;
      color: #0b5ea8;
      transition: border-color .15s, background .15s;
      border-radius: 2px;
      user-select: none;
      position: relative;
      z-index: 1;
      white-space: nowrap;
      overflow: hidden;
    }
    .dc-sbox:hover { border-color: #0b5ea8; background: #e8f2ff; }

    .dc-sbox-top    { border-bottom-style: dashed; }
    .dc-sbox-bottom { border-color: #fca5a5; background: #fff5f5; }
    .dc-sbox-bottom:hover { border-color: #ef4444; background: #fee2e2; }

    /* Status states */
    .dc-sbox.state-present   { background: #d1fae5 !important; border-color: #10b981 !important; color: #059669 !important; }
    .dc-sbox.state-condition { background: #dbeafe !important; border-color: #0b5ea8 !important; color: #0b5ea8 !important; }
    .dc-sbox.state-surgery   { background: #fee2e2 !important; border-color: #ef4444 !important; color: #dc2626 !important; }

    /* Temp tooth variants */
    .dc-sbox-temp { border-color: #c084fc; background: #fdf4ff; }
    .dc-sbox-temp.state-present   { background: #d1fae5 !important; border-color: #10b981 !important; color: #059669 !important; }
    .dc-sbox-temp.state-condition { background: #f5f3ff !important; border-color: #7c3aed !important; color: #7c3aed !important; }
    .dc-sbox-temp.state-surgery   { background: #fee2e2 !important; border-color: #ef4444 !important; color: #dc2626 !important; }

    /* ── Tooth drawing buttons ── */
    .dc-tooth {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid #94a3b8;
      background: #fff;
      font-size: 8px;
      font-weight: 600;
      color: #334155;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color .15s, background .15s;
      flex-shrink: 0;
      padding: 0;
    }
    .dc-tooth:hover       { border-color: #3b82f6; background: #eff6ff; }
    .dc-tooth.dc-tooth-temp {
      border-color: #c084fc;
      color: #7e22ce;
    }
    .dc-tooth.dc-tooth-temp:hover { border-color: #a855f7; background: #faf5ff; }
    .dc-tooth.has-drawing { border-color: #ef4444; background: #fef2f2; }

    /* ── Bold horizontal midline bar between upper & lower permanent teeth ── */
    .dc-horizontal-midline {
      height: 5px;
      background: #1e293b;
      border-radius: 2px;
      margin: 2px 66px;   /* aligns with the side labels so it doesn't stretch full width */
    }

    /* ── Box legend ── */
    .dc-box-legend {
      display: flex; gap: 5px 14px; margin: 0 0 8px 0;
      font-size: 10px; color: #64748b; flex-wrap: wrap;
      background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 8px;
    }
    .dc-box-legend-item { display: flex; align-items: center; gap: 5px; }

    /* ── Tooth-code dropdown ── */
    .tooth-code-dropdown {
      position: fixed; z-index: 99999;
      background: #fff; border: 1.5px solid #c8dff6;
      border-radius: 10px; box-shadow: 0 8px 32px rgba(11,94,168,0.18);
      width: 260px; padding: 0;
      display: none;
    }
    .tooth-code-dropdown.tcd-visible { display: block; animation: tcdFade .15s ease; }
    @keyframes tcdFade { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
    .tcd-header {
      padding: 7px 12px 6px; font-size: 10px; font-weight: 700;
      letter-spacing: 1px; text-transform: uppercase; color: #94a3b8;
      border-bottom: 1px solid #f0f6ff;
    }
    .tcd-section { padding: 4px 0; border-bottom: 1px solid #f0f6ff; max-height: 200px; overflow-y: auto; }
    .tcd-section:last-child { border-bottom: none; }
    .tcd-item {
      display: flex; align-items: center; gap: 7px;
      padding: 5px 10px 5px 12px; cursor: pointer; font-size: 11.5px; color: #334155;
      transition: background .12s;
    }
    .tcd-item:hover { background: #f0f6ff; }
    .tcd-item.tcd-selected { background: #e8f2ff; }
    .tcd-item-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tcd-code {
      font-weight: 700; font-size: 11px; min-width: 30px;
      padding: 2px 5px; border-radius: 4px; text-align: center;
      border: 1px solid currentColor;
      /* color is set inline per-item based on _codeColors */
    }
    .tcd-color-swatch {
      flex-shrink: 0; width: 14px; height: 14px; border-radius: 50%;
      border: 1.5px solid rgba(0,0,0,.15); cursor: pointer;
      transition: transform .12s, box-shadow .12s; margin-left: 2px;
    }
    .tcd-color-swatch:hover { transform: scale(1.4); box-shadow: 0 2px 6px rgba(0,0,0,.25); }
    .tcd-item.tcd-clear .tcd-code { background: #f1f5f9; color: #64748b !important; border-color: #cbd5e1 !important; }

    /* ── Close button on tooth modal ── */
    #tmClose {
      color: #1e293b !important; background: #f1f5f9 !important;
      border: 1px solid #cbd5e1 !important; font-size: 18px !important;
      line-height: 1 !important; min-width: 32px; height: 32px;
      display: flex !important; align-items: center !important; justify-content: center !important;
      border-radius: 6px; cursor: pointer; padding: 0 8px;
    }
    #tmClose:hover { background: #e2e8f0 !important; }

    /* ── X-ray row ── */
    .dc-xray-row {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 2px;
    }
    .dc-xray-row .dc-check-label { flex-shrink: 0; }
    .dc-xray-input { width: 130px !important; }
    .dc-xray-sublabel { font-size: 11px; color: #64748b; flex-shrink: 0; }
  `;
  document.head.appendChild(style);
})();



/* =========================================================
   DENTAL CHART PATIENT FORM - COMPLETE SCRIPT
   ========================================================= */

// DOM Elements - Form
const form = document.getElementById('dentalForm');
const pages = Array.from(document.querySelectorAll('.form-page'));
const message = document.getElementById('message');

// DOM Elements - Admin
const adminBtn = document.getElementById('adminBtn');
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginCancel = document.getElementById('loginCancel');
const adminPanel = document.getElementById('adminPanel');
const adminLogout = document.getElementById('adminLogout');
const patientsList = document.getElementById('patientsList');
const refreshPatients = document.getElementById('refreshPatients');
const searchPatients = document.getElementById('searchPatients');
const createBackup = document.getElementById('createBackup');

// DOM Elements - Patient Modal
const patientModal = document.getElementById('patientModal');
const pmName = document.getElementById('pmName');
const pmSub = document.getElementById('pmSub');
const pmPhoto = document.getElementById('pmPhoto');
const pmClose = document.getElementById('pmClose');
const pmListView = document.getElementById('pmListView');
const pmDetailView = document.getElementById('pmDetailView');
const pmDentalChartView = document.getElementById('pmDentalChartView');
const pmTreatmentRecordsView = document.getElementById('pmTreatmentRecordsView');
const pmAppointments = document.getElementById('pmAppointments');
const pmContent = document.getElementById('pmContent');
const pmBackToList = document.getElementById('pmBackToList');
const pmEdit = document.getElementById('pmEdit');
const pmSave = document.getElementById('pmSave');
const pmCancel = document.getElementById('pmCancel');
const pmDelete = document.getElementById('pmDelete');
const pmMessage = document.getElementById('pmMessage');

// DOM Elements - Camera
const cameraView = document.getElementById('cameraView');
const cameraOutput = document.getElementById('cameraOutput');
const cameraCaptureBtn = document.getElementById('cameraCapture');
const cameraRetakeBtn = document.getElementById('cameraRetake');
const timerText = document.getElementById('timerText');

// DOM Elements - Tooth Drawing Modal
const toothDrawModal = document.getElementById('toothDrawModal');
const tmTitle = document.getElementById('tmTitle');
const tmClose = document.getElementById('tmClose');
const tmBrushSize = document.getElementById('tmBrushSize');
const tmBrushSizeValue = document.getElementById('tmBrushSizeValue');
const tmColors = document.querySelectorAll('.tm-color');
const tmClear = document.getElementById('tmClear');
const tmUndo = document.getElementById('tmUndo');
const tmSave = document.getElementById('tmSave');
const toothCanvas = document.getElementById('toothCanvas');

// DOM Elements - Treatment Records
const trFormModal = document.getElementById('trFormModal');
const trFormTitle = document.getElementById('trFormTitle');
const trFormClose = document.getElementById('trFormClose');
const trForm = document.getElementById('trForm');
const trFormCancel = document.getElementById('trFormCancel');

// DOM Elements - Appointments
const appointmentsList = document.getElementById('appointmentsList');
const totalAppointmentsEl = document.getElementById('totalAppointments');
const pendingAppointmentsEl = document.getElementById('pendingAppointments');
const finishedAppointmentsEl = document.getElementById('finishedAppointments');

// State Variables
let currentPage = 0;
let adminToken = null;

// Authenticated fetch — automatically adds JWT Bearer token to every request
async function authFetch(url, options = {}) {
  const token = adminToken || sessionStorage.getItem('pdaToken')
  const headers = {
    ...(options.headers || {}),
    ...(token ? { 'Authorization': 'Bearer ' + token } : {})
  }
  const res = await fetch(url, { ...options, headers })
  if (res.status === 401 || res.status === 403) {
    // Token expired or invalid — force re-login
    adminToken = null
    sessionStorage.removeItem('pdaToken')
    hideAdminPanel()
    showMessage('Session expired. Please log in again.', false)
    throw new Error('Session expired')
  }
  return res
}
let currentPatientGroup = null;
let currentAppointment = null;
let currentTreatmentRecord = null;
let pmEditing = false;
let pmOriginalData = null;
let currentStream = null;
let capturedPhotoData = null;

// Tooth Drawing State
let currentToothNumber = null;
let toothCtx = null;
let isDrawing = false;
let currentColor = '#FF0000';
let currentBrushSize = 5;
let lastX = 0;
let lastY = 0;
let drawingHistory = [];
let historyStep = -1;

// Appointments State
let currentFilter = 'today';
let appointmentsRefreshInterval = null;

// Dental Chart Clinical State
let dentalChartClinicalData = {};

// Dentist session
let selectedDentistId = null;
let selectedDentistName = null;
let selectedDentistRole = null;
let selectedDentistVersion = 4;