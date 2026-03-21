/* =========================================================
   CHANGE PASSWORD
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const cpModal  = document.getElementById('changePasswordModal')
  const cpForm   = document.getElementById('changePasswordForm')
  const cpError  = document.getElementById('cpError')
  const cpCancel = document.getElementById('cpCancel')
  const cpBtn    = document.getElementById('changePasswordBtn')

  cpBtn?.addEventListener('click', () => {
    cpForm?.reset()
    if (cpError) cpError.textContent = ''
    cpModal?.classList.remove('hidden')
  })

  cpCancel?.addEventListener('click', () => cpModal?.classList.add('hidden'))

  cpForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (cpError) cpError.textContent = ''

    const current = document.getElementById('cpCurrent')?.value
    const newPass = document.getElementById('cpNew')?.value
    const confirm = document.getElementById('cpConfirm')?.value

    if (newPass !== confirm) {
      if (cpError) cpError.textContent = 'New passwords do not match.'
      return
    }
    if (newPass.length < 8) {
      if (cpError) cpError.textContent = 'Password must be at least 8 characters.'
      return
    }

    try {
      const res = await authFetch('/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPass })
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        if (cpError) cpError.textContent = data.error || 'Failed to change password.'
        return
      }
      cpModal.classList.add('hidden')
      showMessage('Password changed successfully.', true)
    } catch (err) {
      if (cpError) cpError.textContent = 'Error: ' + err.message
    }
  })
})
