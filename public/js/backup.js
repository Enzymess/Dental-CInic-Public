/* =========================================================
   BACKUP SYSTEM
   ========================================================= */
async function createBackupArchive() {
  try {
    showMessage('Creating backup...', true);

    const res = await authFetch('/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await res.json();

    if (!res.ok || !result.ok) {
      throw new Error(result.message || 'Backup failed');
    }

    showMessage('Backup created successfully! Downloading...', true);

    if (result.patientsBackup) {
      const downloadRes = await authFetch(`/download-backup/${encodeURIComponent(result.patientsBackup)}`);
      if (downloadRes.ok) {
        const blob = await downloadRes.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.patientsBackup;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    }
  } catch (err) {
    console.error(err);
    showMessage('Failed to create backup: ' + err.message, false);
  }
}

