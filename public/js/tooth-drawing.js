/* =========================================================
   TOOTH DRAWING FUNCTIONS
   ========================================================= */
async function openToothDrawing(toothNumber) {
  if (!currentPatientGroup || !currentPatientGroup.folderName) {
    alert('No patient selected');
    return;
  }

  currentToothNumber = toothNumber;
  tmTitle.textContent = `Tooth ${toothNumber}`;
  
  toothCtx = toothCanvas.getContext('2d');
  toothCtx.lineCap = 'round';
  toothCtx.lineJoin = 'round';
  
  drawingHistory = [];
  historyStep = -1;

  // Step 1: White background
  toothCtx.fillStyle = '#FFFFFF';
  toothCtx.fillRect(0, 0, toothCanvas.width, toothCanvas.height);

  // Step 2: Draw base tooth template as background
  // The base image is served as a public static file — no auth required
  const baseToothUrl = `/teeth_base/teeth_base.jpg`;
  await new Promise((resolve) => {
    const baseImg = new Image();
    baseImg.onload = () => {
      // Scale to fit canvas while maintaining aspect ratio
      const scale = Math.min(
        toothCanvas.width  / baseImg.naturalWidth,
        toothCanvas.height / baseImg.naturalHeight
      );
      const drawW = baseImg.naturalWidth  * scale;
      const drawH = baseImg.naturalHeight * scale;
      const offsetX = (toothCanvas.width  - drawW) / 2;
      const offsetY = (toothCanvas.height - drawH) / 2;
      toothCtx.drawImage(baseImg, offsetX, offsetY, drawW, drawH);
      resolve();
    };
    baseImg.onerror = () => {
      // No base template found — blank canvas is fine
      resolve();
    };
    baseImg.src = baseToothUrl;
  });

  // Step 3: Overlay the patient's previously saved tooth drawing (if any)
  // Must use authFetch because /tooth-image/ requires Authorization header
  const patientToothUrl = `/tooth-image/${encodeURIComponent(currentPatientGroup.folderName)}/${toothNumber}?t=${Date.now()}`;

  try {
    const toothRes = await authFetch(patientToothUrl);
    if (toothRes.ok) {
      const blob = await toothRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          toothCtx.drawImage(img, 0, 0, toothCanvas.width, toothCanvas.height);
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(); };
        img.src = blobUrl;
      });
    }
  } catch (e) {
    // No saved drawing yet — base template is already drawn, that's perfect
  }

  // Save initial state to history
  saveToHistory();

  // ── Populate "Code Colors" chips from the current _codeColors / defaultColor map ──
  populateDrawingCodeColors();

  toothDrawModal.classList.remove('hidden');
}

// ── Build / refresh the "Code Colors" chip row inside the tooth drawing modal ──
// Each chip shows the code label using its currently-assigned color.
// Clicking a chip sets that color as the active drawing brush.
function populateDrawingCodeColors() {
  const container = document.getElementById('tmCodeColors');
  if (!container) return;
  container.innerHTML = '';

  function makeChipRow(opts) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';

    opts.forEach(opt => {
      const color = _codeColors[opt.code] || opt.defaultColor;

      // Chip wrapper (chip + picker dot)
      const chipWrap = document.createElement('div');
      chipWrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;';

      // Main chip
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tm-code-chip';
      chip.title = `${opt.label} — click to use as brush`;
      chip.dataset.color = color;
      chip.dataset.code  = opt.code;
      chip.style.cssText = `
        border:1.5px solid ${color};
        background:${color}18;
        color:${color};
      `;
      chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${opt.code}`;

      chip.addEventListener('click', () => {
        const activeColor = chip.dataset.color;
        currentColor = activeColor;
        document.querySelectorAll('.tm-color').forEach(b => b.classList.remove('active'));
        container.querySelectorAll('.tm-code-chip').forEach(c => {
          c.style.outline = 'none';
          c.style.boxShadow = 'none';
        });
        chip.style.outline = `2px solid ${activeColor}`;
        chip.style.boxShadow = `0 0 0 3px ${activeColor}44`;
      });

      // Color picker dot
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.title = `Change color for ${opt.code}`;
      dot.dataset.code = opt.code;
      dot.style.cssText = `
        width:11px;height:11px;border-radius:50%;
        background:${color};border:1.5px solid rgba(0,0,0,.18);
        cursor:pointer;flex-shrink:0;padding:0;
        transition:transform .12s;
      `;
      dot.addEventListener('mouseenter', () => { dot.style.transform = 'scale(1.5)'; });
      dot.addEventListener('mouseleave', () => { dot.style.transform = ''; });
      dot.addEventListener('click', ev => { ev.stopPropagation(); openCodeColorPicker(ev, opt.code); });

      chipWrap.appendChild(chip);
      chipWrap.appendChild(dot);
      wrap.appendChild(chipWrap);
    });

    return wrap;
  }

  // Restoration section header
  const restHeader = document.createElement('div');
  restHeader.style.cssText = 'font-size:9px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8;margin-bottom:5px;';
  restHeader.textContent = 'Restoration / Condition';
  container.appendChild(restHeader);
  container.appendChild(makeChipRow(RESTORATION_OPTIONS));

  // Surgery section header
  const surgDivider = document.createElement('div');
  surgDivider.style.cssText = 'height:1px;background:#f0f4f9;margin:8px 0 6px;';
  container.appendChild(surgDivider);

  const surgHeader = document.createElement('div');
  surgHeader.style.cssText = 'font-size:9px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8;margin-bottom:5px;';
  surgHeader.textContent = 'Surgery';
  container.appendChild(surgHeader);
  container.appendChild(makeChipRow(SURGERY_OPTIONS));
}

function closeToothDrawModal() {
  toothDrawModal.classList.add('hidden');
  currentToothNumber = null;
  isDrawing = false;
}

async function saveToothDrawing() {
  if (!currentToothNumber || !currentPatientGroup) return;

  try {
    const blob = await new Promise(resolve => toothCanvas.toBlob(resolve, 'image/jpeg', 0.95));
    const formData = new FormData();
    formData.append('tooth', blob, `tooth_${currentToothNumber}.jpg`);

    const res = await authFetch(`/save-tooth/${encodeURIComponent(currentPatientGroup.folderName)}/${currentToothNumber}`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error('Save failed');

    closeToothDrawModal();
    showToothSaveSuccessPopup();
  } catch (err) {
    console.error(err);
    alert('Failed to save tooth drawing');
  }
}

function showToothSaveSuccessPopup() {
  const existingPopup = document.getElementById('toothSaveSuccessPopup');
  if (existingPopup) existingPopup.remove();

  const popup = document.createElement('div');
  popup.id = 'toothSaveSuccessPopup';
  popup.className = 'tooth-success-popup';
  popup.innerHTML = `
    <div class="popup-overlay"></div>
    <div class="popup-content">
      <div class="popup-icon">/</div>
      <h3>Tooth Saved Successfully!</h3>
      <p>The dental chart has been updated.</p>
      <button id="toothSaveBackBtn" class="btn success">Back to Patient Info</button>
    </div>
  `;

  document.body.appendChild(popup);

  document.getElementById('toothSaveBackBtn').addEventListener('click', () => {
    popup.remove();
    showPmView('list');
  });
}

function clearToothDrawing() {
  if (!confirm('Clear all drawings and reset to blank?')) return;
  toothCtx.fillStyle = '#FFFFFF';
  toothCtx.fillRect(0, 0, toothCanvas.width, toothCanvas.height);
  drawingHistory = [];
  historyStep = -1;
  saveToHistory();
}

function saveToHistory() {
  historyStep++;
  drawingHistory = drawingHistory.slice(0, historyStep);
  drawingHistory.push(toothCanvas.toDataURL());
  if (drawingHistory.length > 50) {
    drawingHistory.shift();
    historyStep--;
  }
  if (tmUndo) tmUndo.disabled = historyStep <= 0;
}

function undoDrawing() {
  if (historyStep > 0) {
    historyStep--;
    const img = new Image();
    img.onload = () => {
      toothCtx.clearRect(0, 0, toothCanvas.width, toothCanvas.height);
      toothCtx.drawImage(img, 0, 0);
    };
    img.src = drawingHistory[historyStep];
    if (tmUndo) tmUndo.disabled = historyStep <= 0;
  }
}

function startDrawing(e) {
  isDrawing = true;
  const rect = toothCanvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
}

function draw(e) {
  if (!isDrawing) return;
  const rect = toothCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  toothCtx.strokeStyle = currentColor;
  toothCtx.lineWidth = currentBrushSize;
  toothCtx.beginPath();
  toothCtx.moveTo(lastX, lastY);
  toothCtx.lineTo(x, y);
  toothCtx.stroke();
  
  lastX = x;
  lastY = y;
}

function stopDrawing() {
  if (isDrawing) {
    isDrawing = false;
    saveToHistory();
  }
}

function startDrawingTouch(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = toothCanvas.getBoundingClientRect();
  lastX = touch.clientX - rect.left;
  lastY = touch.clientY - rect.top;
  isDrawing = true;
}

function drawTouch(e) {
  if (!isDrawing) return;
  e.preventDefault();
  const touch = e.touches[0];
  const rect = toothCanvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  
  toothCtx.strokeStyle = currentColor;
  toothCtx.lineWidth = currentBrushSize;
  toothCtx.beginPath();
  toothCtx.moveTo(lastX, lastY);
  toothCtx.lineTo(x, y);
  toothCtx.stroke();
  
  lastX = x;
  lastY = y;
}

function stopDrawingTouch(e) {
  if (isDrawing) {
    e.preventDefault();
    isDrawing = false;
    saveToHistory();
  }
}

