/* =========================================================
   SCHEDULE MODULE
   ========================================================= */

let scheduleYear  = new Date().getFullYear();
let scheduleMonth = new Date().getMonth(); // 0-indexed
let scheduleAllRecords = [];
let scheduleFilter = 'all'; // 'all' | 'pending' | 'finished'

async function loadSchedule() {
  try {
    const res = await authFetch('/all-treatment-records');
    if (!res.ok) throw new Error('Failed to load');
    scheduleAllRecords = await res.json();
  } catch (err) {
    console.error('Schedule load error:', err);
    scheduleAllRecords = [];
  }
  renderScheduleCalendar();
  renderScheduleList();
  // Init controls (safe to call multiple times)
  initScheduleControls();
}

function initScheduleControls() {
  // Prevent duplicate listeners with a flag
  if (document._scheduleControlsInit) return;
  document._scheduleControlsInit = true;

  document.getElementById('schedPrevMonth')?.addEventListener('click', () => {
    scheduleMonth--;
    if (scheduleMonth < 0) { scheduleMonth = 11; scheduleYear--; }
    renderScheduleCalendar();
    renderScheduleList();
    closeDayPanel();
  });

  document.getElementById('schedNextMonth')?.addEventListener('click', () => {
    scheduleMonth++;
    if (scheduleMonth > 11) { scheduleMonth = 0; scheduleYear++; }
    renderScheduleCalendar();
    renderScheduleList();
    closeDayPanel();
  });

  document.getElementById('schedTodayBtn')?.addEventListener('click', () => {
    const now = new Date();
    scheduleYear  = now.getFullYear();
    scheduleMonth = now.getMonth();
    renderScheduleCalendar();
    renderScheduleList();
    closeDayPanel();
  });

  document.getElementById('refreshSchedule')?.addEventListener('click', async () => {
    document._scheduleControlsInit = false; // allow re-init after refresh
    await loadSchedule();
  });

  document.getElementById('schedDayClose')?.addEventListener('click', closeDayPanel);

  // Month-list filter buttons
  document.querySelectorAll('#schedFilter .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#schedFilter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scheduleFilter = btn.dataset.filter;
      renderScheduleList();
    });
  });
}

function getMonthRecords() {
  return scheduleAllRecords.filter(rec => {
    const d = new Date(rec.date || rec._timestamp || 0);
    return d.getFullYear() === scheduleYear && d.getMonth() === scheduleMonth;
  });
}

function renderScheduleCalendar() {
  const grid = document.getElementById('schedCalendarGrid');
  const label = document.getElementById('scheduleMonthLabel');
  if (!grid) return;

  const monthName = new Date(scheduleYear, scheduleMonth, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (label) label.textContent = monthName;

  const monthRecords = getMonthRecords();

  // Build a map: dateKey -> { pending, finished }
  const dayMap = {};
  monthRecords.forEach(rec => {
    const d = new Date(rec.date || rec._timestamp || 0);
    const key = d.getDate();
    if (!dayMap[key]) dayMap[key] = { pending: 0, finished: 0, records: [] };
    if (rec._completed) dayMap[key].finished++;
    else dayMap[key].pending++;
    dayMap[key].records.push(rec);
  });

  const firstDay = new Date(scheduleYear, scheduleMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(scheduleYear, scheduleMonth + 1, 0).getDate();
  const today = new Date();

  grid.innerHTML = '';

  // Leading empty cells
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'sched-day empty';
    grid.appendChild(empty);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    const info = dayMap[d];
    const isToday = today.getFullYear() === scheduleYear &&
                    today.getMonth() === scheduleMonth &&
                    today.getDate() === d;

    let dotClass = '';
    if (info) {
      if (info.finished > 0 && info.pending > 0) dotClass = 'mixed';
      else if (info.finished > 0) dotClass = 'finished';
      else dotClass = 'pending';
    }

    cell.className = `sched-day${isToday ? ' today' : ''}${info ? ' has-appts' : ''}`;
    cell.innerHTML = `
      <div class="sched-day-num">${d}</div>
      ${info ? `
        <div class="sched-day-dots">
          ${info.pending  > 0 ? `<span class="sched-dot pending"  title="${info.pending} pending"></span>`  : ''}
          ${info.finished > 0 ? `<span class="sched-dot finished" title="${info.finished} finished"></span>` : ''}
        </div>
        <div class="sched-day-count ${dotClass}">${info.pending + info.finished} appt${info.pending + info.finished !== 1 ? 's' : ''}</div>
      ` : ''}
    `;

    if (info) {
      cell.addEventListener('click', () => openDayPanel(d, info.records));
    }

    grid.appendChild(cell);
  }
}

function openDayPanel(day, records) {
  const section = document.getElementById('schedDaySection');
  const title   = document.getElementById('schedDayTitle');
  const list    = document.getElementById('schedDayList');
  if (!section || !list) return;

  const dateLabel = new Date(scheduleYear, scheduleMonth, day)
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  title.textContent = dateLabel;
  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Re-use the same appt card renderer but target schedDayList
  renderAppointmentCards(records, list);
}

function closeDayPanel() {
  const section = document.getElementById('schedDaySection');
  if (section) section.style.display = 'none';
}

function renderScheduleList() {
  const container = document.getElementById('schedAppointmentsList');
  if (!container) return;

  let records = getMonthRecords();

  if (scheduleFilter === 'pending')  records = records.filter(r => !r._completed);
  if (scheduleFilter === 'finished') records = records.filter(r =>  r._completed);

  records.sort((a, b) => {
    const da = new Date(a.date || a._timestamp || 0);
    const db = new Date(b.date || b._timestamp || 0);
    if (da - db !== 0) return da - db;
    // Same date — sort by appointmentTime
    const ta = a.appointmentTime || '99:99';
    const tb = b.appointmentTime || '99:99';
    return ta.localeCompare(tb);
  });

  renderAppointmentCards(records, container);
}

// Shared card renderer — renders appointment cards into any container element
function renderAppointmentCards(records, container) {
  if (!records.length) {
    container.innerHTML = `
      <div class="appointments-empty">
        <div class="icon"></div>
        <h4>No appointments found</h4>
        <p>Nothing to show for this period</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  records.forEach(rec => {
    const apptDate    = rec.date ? new Date(rec.date) : new Date(rec._timestamp || 0);
    const dateStr     = apptDate.toLocaleDateString();
    const isCompleted = rec._completed || false;
    const isFollowUp  = !!(rec.denticals && rec.denticals.startsWith('Follow-up from'));
    const isTemp      = !!rec._isTemp;
    const statusClass = isCompleted ? 'finished' : 'pending';

    const photoHtml = rec._photoPath
      ? `<img class="appt-patient-photo" src="${rec._photoPath}" alt="" />`
      : isTemp
        ? `<div class="appt-patient-photo appt-photo-placeholder appt-photo-temp">${(rec._firstName || '?')[0].toUpperCase()}</div>`
        : `<div class="appt-patient-photo appt-photo-placeholder">${(rec._firstName || '?')[0].toUpperCase()}</div>`;

    const procedure = rec.procedure || 'No procedure noted';
    const toothNo   = rec.ToothNo ? `Tooth ${rec.ToothNo}` : '';
    const contact   = rec._mobileNo || rec._email || 'No contact info';

    const followUpBadge = isFollowUp
      ? `<span style="display:inline-block;margin-left:6px;padding:1px 8px;background:#dcfce7;color:#16a34a;border-radius:20px;font-size:11px;font-weight:600;">Follow-up</span>`
      : '';

    const tempBadge = isTemp
      ? `<span class="appt-temp-badge">TEMP</span>`
      : '';

    const recEl = document.createElement('div');
    recEl.className = `appt-item ${statusClass}${isTemp ? ' appt-item-temp' : ''}`;
    recEl.dataset.recId = rec.id;
    recEl.innerHTML = `
      <div class="appt-time">
        <span class="date">${dateStr}</span>
        ${rec.appointmentTime ? `<span class="appt-clock">${(h => `${h % 12 || 12}:${rec.appointmentTime.split(':')[1]} ${h < 12 ? 'AM' : 'PM'}`)(parseInt(rec.appointmentTime.split(':')[0]))}</span>` : ''}
        ${toothNo ? `<span class="appt-tooth">${toothNo}</span>` : ''}
      </div>
      <div class="appt-patient-col">${photoHtml}</div>
      <div class="appt-info">
        <h4>${rec._patientName || 'Unknown Patient'}${followUpBadge}${tempBadge}</h4>
        <p>${isTemp && rec.attendingDentist ? '<span class="appt-dentist">Dr: ' + rec.attendingDentist + '</span>' : contact}</p>
        <div class="reason">${procedure}</div>
        ${rec.nextApps && rec._completed
          ? `<div class="appt-next">Next appt: ${new Date(rec.nextApps).toLocaleDateString()}</div>`
          : rec.nextApps && !rec._completed
          ? `<div class="appt-next-pending">Scheduled next: ${new Date(rec.nextApps).toLocaleDateString()}</div>`
          : ''}
      </div>
      <div class="appt-actions">
        <span class="appt-status ${statusClass}">${isCompleted ? 'completed' : 'pending'}</span>
        <button class="btn-status ${isCompleted ? 'undo' : 'complete'}">${isCompleted ? 'Undo' : 'Done'}</button>
        ${!isTemp ? `<button class="btn-reschedule-tr">Reschedule</button>` : ''}
        <button class="btn-delete">Delete</button>
      </div>
    `;

    // Temp patients have no patient profile to open
    recEl.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      if (isTemp) return;
      openPatientFromTreatmentRecord(rec);
    });
    if (isTemp) recEl.style.cursor = 'default';

    recEl.querySelector('.btn-status').addEventListener('click', async e => {
      e.stopPropagation();
      await toggleTreatmentRecordCompletion(rec, !isCompleted);
      await loadSchedule();
    });

    if (!isTemp) {
      recEl.querySelector('.btn-reschedule-tr')?.addEventListener('click', e => {
        e.stopPropagation();
        if (!rec.id) { showMessage('Cannot reschedule: record has no ID', false); return; }
        openTreatmentRescheduleModal(rec);
      });
    }

    recEl.querySelector('.btn-delete').addEventListener('click', async e => {
      e.stopPropagation();
      if (!rec.id) { showMessage('Cannot delete: record has no ID', false); return; }
      if (confirm(`Delete this appointment for ${rec._patientName}?`)) {
        await deleteTreatmentRecordFromList(rec.id, rec._patientFolder, isTemp);
        await loadSchedule();
      }
    });

    container.appendChild(recEl);
  });
}