'use strict'

const express  = require('express')
const router   = express.Router()
const fsSync   = require('fs')
const { promises: fs } = require('fs')
const path     = require('path')
const { requireAuth } = require('../middleware/auth')
const { patientsDir } = require('../config')
const { initializePatientTeeth } = require('../utils/teeth')
const { uploadTooth } = require('../config/storage')

// GET /tooth-image/:folderName/:toothNumber
router.get('/tooth-image/:folderName/:toothNumber', requireAuth, async (req, res) => {
  const { folderName, toothNumber } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const jpgPath = path.join(patientFolder, `tooth_${toothNumber}.jpg`)
  const pngPath = path.join(patientFolder, `tooth_${toothNumber}.png`)
  try {
    if (fsSync.existsSync(jpgPath)) {
      const img = await fs.readFile(jpgPath)
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'no-cache')
      return res.send(img)
    }
    if (fsSync.existsSync(pngPath)) {
      const img = await fs.readFile(pngPath)
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'no-cache')
      return res.send(img)
    }
    if (fsSync.existsSync(patientFolder)) {
      await initializePatientTeeth(patientFolder)
      if (fsSync.existsSync(jpgPath)) {
        const img = await fs.readFile(jpgPath)
        res.setHeader('Content-Type', 'image/jpeg')
        res.setHeader('Cache-Control', 'no-cache')
        return res.send(img)
      }
    }
    res.status(404).send('Tooth image not found')
  } catch (err) {
    console.error('GET /tooth-image error:', err)
    res.status(500).send('Failed to load tooth image')
  }
})

// POST /save-tooth/:folderName/:toothNumber
router.post('/save-tooth/:folderName/:toothNumber', requireAuth, uploadTooth.single('tooth'), async (req, res) => {
  const { folderName, toothNumber } = req.params
  try {
    if (!req.file) return res.status(400).send('No tooth image provided')
    res.json({ ok: true, path: `/patients/${folderName}/tooth_${toothNumber}.jpg` })
  } catch (err) {
    console.error('POST /save-tooth error:', err)
    res.status(500).send('Failed to save tooth')
  }
})

// GET /get-tooth-status/:folderName
router.get('/get-tooth-status/:folderName', requireAuth, (req, res) => {
  try {
    const folderName = decodeURIComponent(req.params.folderName)
    const statusPath = path.join(patientsDir, folderName, 'tooth-status.json')
    if (!fsSync.existsSync(statusPath)) return res.json({})
    res.json(JSON.parse(fsSync.readFileSync(statusPath, 'utf8')))
  } catch (err) {
    console.error('GET /get-tooth-status error:', err)
    res.json({})
  }
})

// POST /save-tooth-status/:folderName
router.post('/save-tooth-status/:folderName', requireAuth, (req, res) => {
  try {
    const folderName = decodeURIComponent(req.params.folderName)
    const patientFolder = path.join(patientsDir, folderName)
    if (!fsSync.existsSync(patientFolder))
      return res.status(404).json({ ok: false, message: 'Patient folder not found' })
    fsSync.writeFileSync(
      path.join(patientFolder, 'tooth-status.json'),
      JSON.stringify(req.body || {}, null, 2)
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /save-tooth-status error:', err)
    res.status(500).json({ ok: false, message: err.message })
  }
})

module.exports = router
