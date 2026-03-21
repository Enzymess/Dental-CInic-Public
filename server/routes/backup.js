'use strict'

const express  = require('express')
const router   = express.Router()
const fsSync   = require('fs')
const { promises: fs } = require('fs')
const path     = require('path')
const archiver = require('archiver')
const { requireAuth } = require('../middleware/auth')
const { patientsDir, backupDir } = require('../config')

// POST /backup
router.post('/backup', requireAuth, async (req, res) => {
  try {
    if (!fsSync.existsSync(patientsDir) || fsSync.readdirSync(patientsDir).length === 0)
      return res.status(400).json({ ok: false, message: 'No patients to backup' })

    const timeNow = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0]
    const zipFilename = `patients-backup-${timeNow}.zip`
    const zipPath = path.join(backupDir, zipFilename)

    await new Promise((resolve, reject) => {
      const output  = fsSync.createWriteStream(zipPath)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', resolve)
      archive.on('error', reject)
      archive.pipe(output)
      archive.directory(patientsDir, 'patients')
      archive.finalize()
    })

    res.json({ ok: true, message: 'Backup created', patientsBackup: zipFilename })
  } catch (err) {
    console.error('Backup error:', err)
    res.status(500).json({ ok: false, message: 'Backup failed: ' + err.message })
  }
})

// GET /download-backup/:filename
router.get('/download-backup/:filename', requireAuth, async (req, res) => {
  const filename = req.params.filename
  const filePath = path.join(backupDir, filename)
  if (!filePath.startsWith(path.resolve(backupDir))) return res.status(403).send('Invalid filename')
  if (!fsSync.existsSync(filePath)) return res.status(404).send('Backup file not found')
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  fsSync.createReadStream(filePath).pipe(res)
})

// GET /backups
router.get('/backups', requireAuth, async (req, res) => {
  try {
    const files = await fs.readdir(backupDir)
    const backups = files
      .filter(f => f.endsWith('.zip'))
      .map(f => { const stat = fsSync.statSync(path.join(backupDir, f)); return { filename: f, size: stat.size, created: stat.birthtime } })
      .sort((a, b) => new Date(b.created) - new Date(a.created))
    res.json(backups)
  } catch (err) {
    console.error('GET /backups error:', err)
    res.status(500).send('Failed to list backups')
  }
})

module.exports = router
