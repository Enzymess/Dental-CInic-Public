/* =========================================================
   PATIENT IMAGES MANAGEMENT
   ========================================================= */

// DOM Elements - Patient Images
const pmPatientImagesView = document.getElementById('pmPatientImagesView');
const piBackToList = document.getElementById('piBackToList');
const piUploadBtn = document.getElementById('piUploadBtn');
const piUploadModal = document.getElementById('piUploadModal');
const piUploadForm = document.getElementById('piUploadForm');
const piUploadCancel = document.getElementById('piUploadCancel');
const piImageFile = document.getElementById('piImageFile');
const piImagePreview = document.getElementById('piImagePreview');
const piImageTag = document.getElementById('piImageTag');
const piImageNotes = document.getElementById('piImageNotes');
const piBeforeAfterGroup = document.getElementById('piBeforeAfterGroup');
const piIsBeforeImage = document.getElementById('piIsBeforeImage');
const piAfterImageSelect = document.getElementById('piAfterImageSelect');
const piAfterImageId = document.getElementById('piAfterImageId');
const piTagFilter = document.getElementById('piTagFilter');
const piGridView = document.getElementById('piGridView');
const piListView = document.getElementById('piListView');
const piImagesGrid = document.getElementById('piImagesGrid');
const piImagesList = document.getElementById('piImagesList');
const piNoImages = document.getElementById('piNoImages');
const piCompareModal = document.getElementById('piCompareModal');
const piCompareClose = document.getElementById('piCompareClose');
const piViewerModal = document.getElementById('piViewerModal');
const piViewerClose = document.getElementById('piViewerClose');
const piViewerDelete = document.getElementById('piViewerDelete');
const piViewerEdit = document.getElementById('piViewerEdit');

// State
let patientImages = [];
let currentImageView = 'grid';
let currentImageFilter = 'all';
let currentViewingImage = null;
let currentCompareImages = { before: null, after: null };

// Initialize Patient Images functionality
function initPatientImages() {
  // View toggle buttons
  document.getElementById('pmViewPatientImages')?.addEventListener('click', () => {
    showPmView('patientImages');
    loadPatientImages();
  });

  piBackToList?.addEventListener('click', () => {
    showPmView('list');
  });

  // Upload functionality
  piUploadBtn?.addEventListener('click', openImageUploadModal);
  piUploadCancel?.addEventListener('click', closeImageUploadModal);
  piUploadForm?.addEventListener('submit', handleImageUpload);

  // Image preview
  piImageFile?.addEventListener('change', handleImagePreview);
  document.getElementById('piBeforeImageFile')?.addEventListener('change', handleImagePreview);
  document.getElementById('piAfterImageFile')?.addEventListener('change', handleImagePreview);

  // Before/after toggle
  piImageTag?.addEventListener('change', handleTagChange);
  piIsBeforeImage?.addEventListener('change', handleBeforeToggle);

  // Filter and view controls
  piTagFilter?.addEventListener('change', handleFilterChange);
  piGridView?.addEventListener('click', () => setImageViewMode('grid'));
  piListView?.addEventListener('click', () => setImageViewMode('list'));

  // Modal close buttons
  piCompareClose?.addEventListener('click', closeCompareModal);
  piViewerClose?.addEventListener('click', closeViewerModal);
  piViewerDelete?.addEventListener('click', deleteCurrentImage);
  piViewerEdit?.addEventListener('click', editCurrentImageNotes);

  // Inline note edit buttons
  document.getElementById('piViewerEditSave')?.addEventListener('click', saveEditNotes);
  document.getElementById('piViewerEditCancel')?.addEventListener('click', cancelEditNotes);

  // Close modals by clicking overlay
  document.querySelector('.pi-compare-overlay')?.addEventListener('click', closeCompareModal);
  document.querySelector('.pi-viewer-overlay')?.addEventListener('click', closeViewerModal);

  // Close on Escape is handled by the existing keydown listener
}

async function loadPatientImages() {
  if (!currentPatientGroup?.folderName) return;

  try {
    const res = await authFetch(`/patient-images/${encodeURIComponent(currentPatientGroup.folderName)}`);
    if (!res.ok) throw new Error('Failed to load images');

    patientImages = await res.json();
    renderPatientImages();
  } catch (err) {
    console.error(err);
    piImagesGrid.innerHTML = '<div class="no-data">Failed to load images</div>';
  }
}

function renderPatientImages() {
  const filtered = currentImageFilter === 'all'
    ? patientImages
    : patientImages.filter(img => img.tag === currentImageFilter);

  // Update count badge
  const badge = document.getElementById('piCountBadge');
  if (badge) badge.textContent = `${patientImages.length} image${patientImages.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    piImagesGrid.style.display = 'none';
    piImagesList.style.display = 'none';
    piNoImages.style.display = 'flex';
    return;
  }

  piNoImages.style.display = 'none';

  if (currentImageView === 'grid') {
    piImagesGrid.style.display = 'grid';
    piImagesList.style.display = 'none';
    renderImageGrid(filtered);
  } else {
    piImagesGrid.style.display = 'none';
    piImagesList.style.display = 'flex';
    renderImageList(filtered);
  }
}

function renderImageGrid(images) {
  piImagesGrid.innerHTML = images.map(img => {
    const hasPair = !!img.pairedImageId;
    const compareBtn = hasPair
      ? `<button class="ov-compare" onclick="event.stopPropagation();compareImages('${img.id}')">⇄ Compare</button>`
      : '';
    return `
    <div class="image-card ${img.isBefore ? 'is-before' : ''} ${img.isAfter ? 'is-after' : ''} ${hasPair ? 'has-pair' : ''}"
         data-image-id="${img.id}">
      <div class="image-card-thumb-wrap">
        <img class="image-card-thumbnail" src="${img.thumbnailPath || img.path}" alt="${img.tag}" loading="lazy" />
        <div class="image-card-overlay">
          <button class="ov-view" onclick="event.stopPropagation();viewImage('${img.id}')">View</button>
          ${compareBtn}
        </div>
        <button class="image-card-delete-btn" title="Delete image" onclick="event.stopPropagation();deleteImageById('${img.id}')">Delete</button>
      </div>
      <div class="image-card-info">
        <span class="image-card-tag ${img.tag}">${formatTagLabel(img.tag)}</span>
        <div class="image-card-date">${new Date(img.uploadedAt).toLocaleDateString()}</div>
        <div class="image-card-notes">${img.notes || ''}</div>
      </div>
    </div>`;
  }).join('');

  piImagesGrid.querySelectorAll('.image-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('button')) viewImage(card.dataset.imageId);
    });
  });
}

function renderImageList(images) {
  piImagesList.innerHTML = images.map(img => `
    <div class="image-list-item" data-image-id="${img.id}" onclick="viewImage('${img.id}')">
      <img class="image-list-thumb" src="${img.thumbnailPath || img.path}" alt="${img.tag}" />
      <div class="image-list-info">
        <h4>${formatTagLabel(img.tag)}${img.isBefore ? ' <span style="font-size:10px;color:#d97706">· BEFORE</span>' : img.isAfter ? ' <span style="font-size:10px;color:#059669">· AFTER</span>' : ''}</h4>
        <p>${new Date(img.uploadedAt).toLocaleDateString()}${img.notes ? ' · ' + img.notes : ''}</p>
      </div>
      <div class="image-card-actions" onclick="event.stopPropagation()">
        <button class="btn small" onclick="viewImage('${img.id}')">View</button>
        ${img.pairedImageId ? `<button class="btn small success" onclick="compareImages('${img.id}')">⇄</button>` : ''}
        <button class="btn small danger" onclick="deleteImageById('${img.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function formatTagLabel(tag) {
  const labels = {
    'x-ray': 'X-Ray',
    'intraoral': 'Intraoral Photo',
    'extraoral': 'Extraoral Photo',
    'imaging': 'Imaging',
    'before-after': 'Before/After',
    'other': 'Other'
  };
  return labels[tag] || tag;
}

function openImageUploadModal() {
  piUploadForm.reset();
  piImagePreview.innerHTML = '';
  const baPrev = document.getElementById('piBeforeImagePreview');
  const aaPrev = document.getElementById('piAfterImagePreview');
  if (baPrev) baPrev.innerHTML = '';
  if (aaPrev) aaPrev.innerHTML = '';
  // Reset dual upload visibility
  const singleGroup = document.getElementById('piSingleUploadGroup');
  const baGroup = document.getElementById('piBeforeAfterUploadGroup');
  const title = document.getElementById('piUploadModalTitle');
  if (singleGroup) singleGroup.style.display = 'block';
  if (baGroup) baGroup.style.display = 'none';
  if (title) title.textContent = 'Upload Patient Image';
  piBeforeAfterGroup.style.display = 'none';
  piAfterImageSelect.style.display = 'none';
  loadAfterImageOptions();
  piUploadModal.classList.remove('hidden');
}

function closeImageUploadModal() {
  piUploadModal.classList.add('hidden');
}

function handleImagePreview(e) {
  const file = e.target.files[0];
  if (!file) return;

  let previewEl;
  if (e.target.id === 'piBeforeImageFile') previewEl = document.getElementById('piBeforeImagePreview');
  else if (e.target.id === 'piAfterImageFile') previewEl = document.getElementById('piAfterImagePreview');
  else previewEl = piImagePreview;

  const reader = new FileReader();
  reader.onload = (event) => {
    if (previewEl) previewEl.innerHTML = `<img src="${event.target.result}" alt="Preview" />`;
  };
  reader.readAsDataURL(file);
}

function handleTagChange(e) {
  const tag = e.target.value;
  const isBA = tag === 'before-after';
  const singleGroup = document.getElementById('piSingleUploadGroup');
  const baGroup = document.getElementById('piBeforeAfterUploadGroup');
  const title = document.getElementById('piUploadModalTitle');

  if (singleGroup) singleGroup.style.display = isBA ? 'none' : 'block';
  if (baGroup) baGroup.style.display = isBA ? 'block' : 'none';
  if (title) title.textContent = isBA ? 'Upload Before & After Images' : 'Upload Patient Image';

  // Update required attributes
  const singleInput = document.getElementById('piImageFile');
  const beforeInput = document.getElementById('piBeforeImageFile');
  const afterInput = document.getElementById('piAfterImageFile');
  if (singleInput) singleInput.required = !isBA;
  if (beforeInput) beforeInput.required = isBA;
  if (afterInput) afterInput.required = isBA;
}

function handleBeforeToggle(e) {
  // Legacy - no longer used with new dual-upload UI
}

async function loadAfterImageOptions() {
  // Load existing "after" images for pairing
  const afterImages = patientImages.filter(img => img.isAfter);
  piAfterImageId.innerHTML = '<option value="">Select after image...</option>' + 
    afterImages.map(img => `<option value="${img.id}">${formatTagLabel(img.tag)} - ${new Date(img.uploadedAt).toLocaleDateString()}</option>`).join('');
}

async function handleImageUpload(e) {
  e.preventDefault();

  if (!currentPatientGroup?.folderName) return;

  const tag = piImageTag.value;
  const isBeforeAfter = tag === 'before-after';

  if (isBeforeAfter) {
    // Dual upload: upload BEFORE then AFTER and pair them
    const beforeFile = document.getElementById('piBeforeImageFile')?.files[0];
    const afterFile  = document.getElementById('piAfterImageFile')?.files[0];

    if (!beforeFile || !afterFile) {
      alert('Please select both a BEFORE and an AFTER image.');
      return;
    }

    try {
      // Upload BEFORE image
      const beforeForm = new FormData();
      beforeForm.append('image', beforeFile);
      beforeForm.append('tag', 'before-after');
      beforeForm.append('notes', piImageNotes.value);
      beforeForm.append('isBefore', 'true');
      beforeForm.append('isAfter', 'false');

      const beforeRes = await authFetch(`/patient-images/${encodeURIComponent(currentPatientGroup.folderName)}`, {
        method: 'POST', body: beforeForm
      });
      if (!beforeRes.ok) throw new Error('Before image upload failed');
      const beforeResult = await beforeRes.json();

      // Upload AFTER image, pairing it with the BEFORE
      const afterForm = new FormData();
      afterForm.append('image', afterFile);
      afterForm.append('tag', 'before-after');
      afterForm.append('notes', piImageNotes.value);
      afterForm.append('isBefore', 'false');
      afterForm.append('isAfter', 'true');
      afterForm.append('pairedImageId', beforeResult.id || beforeResult.image?.id || '');

      const afterRes = await authFetch(`/patient-images/${encodeURIComponent(currentPatientGroup.folderName)}`, {
        method: 'POST', body: afterForm
      });
      if (!afterRes.ok) throw new Error('After image upload failed');
      const afterResult = await afterRes.json();

      // Now update the BEFORE image to point to the AFTER image as its pair
      const beforeId = beforeResult.id || beforeResult.image?.id;
      const afterId  = afterResult.id  || afterResult.image?.id;
      if (beforeId && afterId) {
        await authFetch(`/patient-images/${encodeURIComponent(currentPatientGroup.folderName)}/${beforeId}/notes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: piImageNotes.value, pairedImageId: afterId })
        }).catch(() => {}); // Best-effort pairing update
      }

      pmMessage.textContent = 'Before & After images uploaded!';
      setTimeout(() => pmMessage.textContent = '', 3000);
      closeImageUploadModal();
      loadPatientImages();
    } catch (err) {
      console.error(err);
      alert('Failed to upload Before/After images: ' + err.message);
    }
    return;
  }

  // Single image upload
  const file = piImageFile.files[0];
  if (!file) {
    alert('Please select an image file');
    return;
  }

  const formData = new FormData();
  formData.append('image', file);
  formData.append('tag', tag);
  formData.append('notes', piImageNotes.value);
  formData.append('isBefore', 'false');
  formData.append('pairedImageId', '');

  try {
    const res = await authFetch(`/patient-images/${encodeURIComponent(currentPatientGroup.folderName)}`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error('Upload failed');

    pmMessage.textContent = 'Image uploaded successfully!';
    setTimeout(() => pmMessage.textContent = '', 3000);

    closeImageUploadModal();
    loadPatientImages();
  } catch (err) {
    console.error(err);
    alert('Failed to upload image');
  }
}

function handleFilterChange(e) {
  currentImageFilter = e.target.value;
  renderPatientImages();
}

function setImageViewMode(mode) {
  currentImageView = mode;
  piGridView.classList.toggle('active', mode === 'grid');
  piListView.classList.toggle('active', mode === 'list');
  renderPatientImages();
}

function viewImage(imageId) {
  const image = patientImages.find(img => img.id === imageId);
  if (!image) return;

  // Before/after with pair → open compare view
  if (image.tag === 'before-after' && image.pairedImageId) {
    compareImages(imageId);
    return;
  }

  currentViewingImage = image;

  // Tag badge
  const badge = document.getElementById('piViewerTagBadge');
  if (badge) {
    let label = formatTagLabel(image.tag);
    if (image.isBefore) label += ' · BEFORE';
    else if (image.isAfter) label += ' · AFTER';
    badge.textContent = label;
  }

  // Date
  const dateEl = document.getElementById('piViewerTitle');
  if (dateEl) dateEl.textContent = new Date(image.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  document.getElementById('piViewerImage').src = image.path;

  const notesText = document.getElementById('piViewerNotes');
  if (notesText) notesText.textContent = image.notes || '';

  // Make sure display mode is shown
  const display = document.getElementById('piViewerNotesDisplay');
  const editEl  = document.getElementById('piViewerNotesEdit');
  if (display) display.style.display = 'block';
  if (editEl)  editEl.style.display  = 'none';

  piViewerModal.classList.remove('hidden');
}

function closeViewerModal() {
  piViewerModal.classList.add('hidden');
  currentViewingImage = null;
}

function compareImages(imageId) {
  const image = patientImages.find(img => img.id === imageId);
  if (!image || !image.pairedImageId) return;

  const pairedImage = patientImages.find(img => img.id === image.pairedImageId);
  if (!pairedImage) return;

  const beforeImage = image.isBefore ? image : pairedImage;
  const afterImage  = image.isBefore ? pairedImage : image;

  currentCompareImages.before = beforeImage;
  currentCompareImages.after  = afterImage;

  document.getElementById('piCompareBefore').src = beforeImage.path;
  document.getElementById('piCompareAfter').src  = afterImage.path;
  document.getElementById('piCompareBeforeNotes').textContent = beforeImage.notes || '';
  document.getElementById('piCompareAfterNotes').textContent  = afterImage.notes  || '';

  // Reset edit panels to display mode
  ['Before', 'After'].forEach(cap => {
    const display = document.getElementById(`piCompare${cap}Display`);
    const editEl  = document.getElementById(`piCompare${cap}Edit`);
    if (display) display.style.display = 'flex';
    if (editEl)  editEl.style.display  = 'none';
  });

  piCompareModal.classList.remove('hidden');
}

function closeCompareModal() {
  piCompareModal.classList.add('hidden');
}

async function deleteCompareSideImage(side) {
  const img = currentCompareImages[side];
  if (!img || !currentPatientGroup?.folderName) return;

  if (!confirm('Delete both the BEFORE and AFTER images? This cannot be undone.')) return;

  const folder = encodeURIComponent(currentPatientGroup.folderName);
  const otherSide = side === 'before' ? 'after' : 'before';
  const pairedImg = currentCompareImages[otherSide];

  try {
    // Delete both images
    const deletes = [
      authFetch(`/patient-images/${folder}/${img.id}`, { method: 'DELETE' })
    ];
    if (pairedImg) {
      deletes.push(authFetch(`/patient-images/${folder}/${pairedImg.id}`, { method: 'DELETE' }));
    }

    const results = await Promise.all(deletes);
    if (results.some(r => !r.ok)) throw new Error('Delete failed');

    closeCompareModal();
    loadPatientImages();
    pmMessage.textContent = 'Before & After images deleted';
    setTimeout(() => pmMessage.textContent = '', 3000);
  } catch (err) {
    console.error(err);
    alert('Failed to delete images');
  }
}

function openCompareNoteEdit(side) {
  const cap   = side === 'before' ? 'Before' : 'After';
  const img   = currentCompareImages[side];
  const input = document.getElementById(`piCompare${cap}Input`);
  if (!input || !img) return;
  input.value = img.notes || '';
  document.getElementById(`piCompare${cap}Display`).style.display = 'none';
  document.getElementById(`piCompare${cap}Edit`).style.display    = 'block';
  input.focus();
}

function cancelCompareNoteEdit(side) {
  const cap = side === 'before' ? 'Before' : 'After';
  document.getElementById(`piCompare${cap}Display`).style.display = 'flex';
  document.getElementById(`piCompare${cap}Edit`).style.display    = 'none';
}

async function saveCompareNote(side) {
  const cap   = side === 'before' ? 'Before' : 'After';
  const img   = currentCompareImages[side];
  const input = document.getElementById(`piCompare${cap}Input`);
  if (!img || !input || !currentPatientGroup?.folderName) return;

  const notes = input.value.trim();
  try {
    const res = await authFetch(
      `/patient-images/${encodeURIComponent(currentPatientGroup.folderName)}/${img.id}/notes`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) }
    );
    if (!res.ok) throw new Error('Save failed');

    img.notes = notes;
    const stored = patientImages.find(i => i.id === img.id);
    if (stored) stored.notes = notes;

    document.getElementById(`piCompare${cap}Notes`).textContent = notes;
    cancelCompareNoteEdit(side);
    loadPatientImages();

    pmMessage.textContent = 'Notes saved';
    setTimeout(() => pmMessage.textContent = '', 3000);
  } catch (err) {
    console.error(err);
    alert('Failed to save notes');
  }
}

async function deleteCurrentImage() {
  if (!currentViewingImage) return;
  if (!confirm('Delete this image? This cannot be undone.')) return;

  try {
    const res = await authFetch(`/patient-images/${encodeURIComponent(currentPatientGroup.folderName)}/${currentViewingImage.id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Delete failed');

    closeViewerModal();
    loadPatientImages();
    pmMessage.textContent = 'Image deleted';
    setTimeout(() => pmMessage.textContent = '', 3000);
  } catch (err) {
    console.error(err);
    alert('Failed to delete image');
  }
}

async function deleteImageById(imageId) {
  if (!imageId || !currentPatientGroup?.folderName) return;
  if (!confirm('Delete this image? This cannot be undone.')) return;

  try {
    const res = await authFetch(`/patient-images/${encodeURIComponent(currentPatientGroup.folderName)}/${imageId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Delete failed');

    loadPatientImages();
    pmMessage.textContent = 'Image deleted';
    setTimeout(() => pmMessage.textContent = '', 3000);
  } catch (err) {
    console.error(err);
    alert('Failed to delete image');
  }
}

function editCurrentImageNotes() {
  if (!currentViewingImage) return;
  const input = document.getElementById('piViewerNotesInput');
  const display = document.getElementById('piViewerNotesDisplay');
  const editEl  = document.getElementById('piViewerNotesEdit');
  if (!input || !display || !editEl) return;

  input.value = currentViewingImage.notes || '';
  display.style.display = 'none';
  editEl.style.display  = 'block';
  input.focus();
}

function cancelEditNotes() {
  const display = document.getElementById('piViewerNotesDisplay');
  const editEl  = document.getElementById('piViewerNotesEdit');
  if (display) display.style.display = 'block';
  if (editEl)  editEl.style.display  = 'none';
}

async function saveEditNotes() {
  if (!currentViewingImage) return;
  const input = document.getElementById('piViewerNotesInput');
  const notes = input ? input.value.trim() : '';
  await updateImageNotes(currentViewingImage.id, notes);
  cancelEditNotes();
}

async function updateImageNotes(imageId, notes) {
  try {
    const res = await authFetch(`/patient-images/${encodeURIComponent(currentPatientGroup.folderName)}/${imageId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    if (!res.ok) throw new Error('Update failed');

    // Update local state
    const img = patientImages.find(i => i.id === imageId);
    if (img) img.notes = notes;
    if (currentViewingImage && currentViewingImage.id === imageId) currentViewingImage.notes = notes;

    const notesText = document.getElementById('piViewerNotes');
    if (notesText) notesText.textContent = notes || '';

    loadPatientImages();
    pmMessage.textContent = 'Notes saved';
    setTimeout(() => pmMessage.textContent = '', 3000);
  } catch (err) {
    console.error(err);
    alert('Failed to save notes');
  }
}

// Extend showPmView to handle patientImages
const _origShowPmView = showPmView;
showPmView = async function(viewName) {
  pmListView.style.display = 'none';
  pmDetailView.style.display = 'none';
  pmDentalChartView.style.display = 'none';
  pmTreatmentRecordsView.style.display = 'none';
  if (pmPatientImagesView) pmPatientImagesView.style.display = 'none';

  const tabs = document.querySelectorAll('.pm-tab');
  tabs.forEach(t => t.classList.remove('active'));

  switch(viewName) {
    case 'list':
      pmListView.style.display = 'flex';
      document.getElementById('pmViewInfo')?.classList.add('active');
      break;
    case 'detail':
      pmDetailView.style.display = 'flex';
      break;
    case 'dentalChart':
      pmDentalChartView.style.display = 'flex';
      document.getElementById('pmViewDentalChart')?.classList.add('active');
      await renderDentalChartInterface();
      break;
    case 'treatmentRecords':
      pmTreatmentRecordsView.style.display = 'flex';
      document.getElementById('pmViewTreatmentRecords')?.classList.add('active');
      loadTreatmentRecords();
      break;
    case 'patientImages':
      if (pmPatientImagesView) pmPatientImagesView.style.display = 'flex';
      document.getElementById('pmViewPatientImages')?.classList.add('active');
      break;
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initPatientImages);
