/* =========================================================
   FORM HELPERS
   ========================================================= */
function collectFormData(formElement) {
  const fd = new FormData(formElement);
  const data = {};

  for (const [k, v] of fd) {
    if (!(k in data)) {
      data[k] = v;
    } else {
      if (!Array.isArray(data[k])) data[k] = [data[k]];
      data[k].push(v);
    }
  }

  ['allergies', 'conditions', 'periodontalScreening', 'occlusion', 'appliances', 'tmd', 'xrayTaken'].forEach(name => {
    const els = Array.from(formElement.querySelectorAll(`input[name="${name}"]`));
    if (els.length && !(name in data)) data[name] = [];
    if (name in data && !Array.isArray(data[name])) data[name] = [data[name]];
  });

  Object.keys(data).forEach(k => {
    if (typeof data[k] === 'string' && data[k].trim() === '') data[k] = null;
  });

  return data;
}

function showMessage(text, success = true) {
  if (!message) return;
  message.textContent = text;
  message.classList.remove('error');
  if (!success) message.classList.add('error');
  message.classList.add('show');
  
  setTimeout(() => {
    message.classList.remove('show');
  }, 5000);
}

function validateForm() {
  const requiredInputs = form.querySelectorAll('[required]');
  const missingFields = [];
  
  for (const inp of requiredInputs) {
    if (!inp.value || (inp.type === 'checkbox' && !inp.checked)) {
      missingFields.push(inp);
    }
  }
  
  if (missingFields.length > 0) {
    const firstMissing = missingFields[0];
    const pageEl = firstMissing.closest('.form-page');
    if (pageEl) {
      const idx = pages.indexOf(pageEl);
      if (idx >= 0) showPage(idx);
    }
    
    firstMissing.focus();
    firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    showMessage(`Please fill out all required fields (${missingFields.length} missing)`, false);
    return false;
  }
  
  return true;
}

