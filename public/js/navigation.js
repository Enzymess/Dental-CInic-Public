/* =========================================================
   PAGE NAVIGATION
   ========================================================= */
function showPage(index) {
  if (index < 0 || index >= pages.length) return;

  pages.forEach((p, i) => {
    p.classList.toggle('active', i === index);
    p.setAttribute('aria-hidden', i === index ? 'false' : 'true');
  });

  currentPage = index;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const activePage = pages[index];
  if (activePage && activePage.id === 'photoPage') {
    startCamera();
  } else {
    stopCamera();
  }

  updateNavButtons();
}

function updateNavButtons() {
  const nextBtns = document.querySelectorAll('.next');
  const prevBtns = document.querySelectorAll('.prev');
  nextBtns.forEach(btn => btn.disabled = currentPage === pages.length - 1);
  prevBtns.forEach(btn => btn.disabled = currentPage === 0);
}