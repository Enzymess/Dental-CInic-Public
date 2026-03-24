/**
 * PATIENTS MANAGEMENT ROUTES
 * ==========================
 * 
 * This module defines all HTTP endpoints for managing patient data:
 * - Retrieving patient lists
 * - Creating new patient records
 * - Updating patient information
 * - Deleting patient records
 * - Uploading and updating patient photos
 * 
 * Routes:
 *   GET  /patients           - Get all appointments (flattened)
 *   GET  /patients-list      - Get slim list for dropdowns
 *   POST /submit             - Create new patient from form submission
 *   PUT  /update/:id         - Update appointment/patient record
 *   DELETE /delete/:id       - Delete appointment record
 *   POST /update-photo/:folderName - Upload new patient photo
 *   GET  /debug-patients     - Debug endpoint to inspect patient folders
 */

'use strict'

const express  = require('express')
const router   = express.Router()
const fsSync   = require('fs')
const { promises: fs } = require('fs')
const path     = require('path')
const multer   = require('multer')
const { requireAuth } = require('../middleware/auth')
const { patientsDir } = require('../config')
const { getAllPatients, readAppointments, writeAppointments, getPatientFolder } = require('../utils/patient-data')
const { initializePatientTeeth } = require('../utils/teeth')
const { uploadFormPhoto } = require('../config/storage')
const { makeId, parseFormDataFields } = require('../utils/helpers')

/**
 * GET /patients
 * ==============
 * Returns a flattened list of all appointments across all patients.
 * Each appointment includes patient metadata (name, birthdate, folder location).
 * 
 * Authorization: Required (Bearer token)
 * Response: JSON array of appointment objects
 */
router.get('/patients', requireAuth, async (req, res) => {
  try {
    const patients = await getAllPatients()
    const flattened = []
    patients.forEach(patient => {
      patient.appointments.forEach(appt => {
        flattened.push({
          ...appt,
          lastName:       patient.lastName,
          firstName:      patient.firstName,
          middleName:     patient.middleName,
          birthdate:      patient.birthdate,
          photoPath:      patient.photoPath,
          _patientFolder: patient.folderName
        })
      })
    })
    res.json(flattened)
  } catch (err) {
    console.error('GET /patients error:', err)
    res.status(500).send('Failed to read data')
  }
})

/**
 * GET /patients-list
 * ===================
 * Returns a minimal patient list for UI dropdowns.
 * Only includes folder name and display name, sorted alphabetically.
 * 
 * Authorization: Required (Bearer token)
 * Response: JSON array with { folderName, displayName }
 */
router.get('/patients-list', requireAuth, async (req, res) => {
  try {
    const patients = await getAllPatients()
    const list = patients
      .map(p => ({
        folderName:  p.folderName,
        displayName: `${p.lastName}, ${p.firstName}${p.middleName ? ' ' + p.middleName : ''}`
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    res.json(list)
  } catch (err) {
    console.error('patients-list error:', err)
    res.status(500).json({ error: 'Failed' })
  }
})

/**
 * POST /submit
 * =============
 * Creates a new patient record from form submission data.
 * - Generates unique ID for the appointment
 * - Creates patient folder if it doesn't exist
 * - Initializes tooth status data
 * - Stores the appointment record
 * - Handles file uploads (patient photo if provided)
 * 
 * Request body: Form data with patient/appointment information
 * Optional file: Patient photo (multipart/form-data)
 * Response: JSON { ok: true, id: appointmentId }
 */
router.post('/submit', uploadFormPhoto.single('photo'), async (req, res) => {
  try {
    const entry = req.file ? parseFormDataFields(req.body) : req.body
    if (!entry) return res.status(400).send('No data')

    entry._id          = makeId()
    entry._submittedAt = entry._submittedAt || new Date().toISOString()
    entry._receivedAt  = new Date().toISOString()
    entry._ip          = req.ip

    const patientFolder = getPatientFolder(entry)
    if (!fsSync.existsSync(patientFolder)) {
      fsSync.mkdirSync(patientFolder, { recursive: true })
      await initializePatientTeeth(patientFolder)
      console.log(`New patient created: ${path.basename(patientFolder)}`)
    }

    const appointments = await readAppointments(patientFolder)
    appointments.push(entry)
    await writeAppointments(patientFolder, appointments)

    if (req.file) console.log(`Photo saved: ${req.file.filename}`)
    res.json({ ok: true, id: entry._id })
  } catch (err) {
    console.error('POST /submit error:', err)
    res.status(500).send('Server error')
  }
})

/**
 * PUT /update/:id
 * ================
 * Updates an existing appointment record identified by ID.
 * Maintains audit fields: _id, _receivedAt (original), _submittedAt (update time)
 * 
 * Authorization: Required (Bearer token)
 * Route param:   id - Appointment ID to update
 * Request body:  Updated appointment data
 * Response:      JSON { ok: true } on success
 * Error:         404 Not found, 500 Server error
 */
router.put('/update/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  const newData = req.body
  if (!id) return res.status(400).send('Missing id')
  try {
    const patients = await getAllPatients()
    let found = false
    for (const patient of patients) {
      const patientFolder = path.join(patientsDir, patient.folderName)
      const appointments  = await readAppointments(patientFolder)
      const idx = appointments.findIndex(x => x._id === id)
      if (idx !== -1) {
        const existing = appointments[idx]
        newData._id          = existing._id
        newData._receivedAt  = existing._receivedAt || existing._submittedAt || new Date().toISOString()
        newData._submittedAt = new Date().toISOString()
        newData._ip          = req.ip
        appointments[idx] = newData
        await writeAppointments(patientFolder, appointments)
        found = true
        res.json({ ok: true })
        break
      }
    }
    if (!found) res.status(404).send('Not found')
  } catch (err) {
    console.error('PUT /update error:', err)
    res.status(500).send('Server error')
  }
})

/**
 * DELETE /delete/:id
 * ===================
 * Removes an appointment record by ID.
 * Searches across all patients for the record with matching ID.
 * 
 * Authorization: Required (Bearer token)
 * Route param:   id - Appointment ID to delete
 * Response:      JSON { ok: true } on success
 * Error:         404 Not found, 500 Server error
 */
router.delete('/delete/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  try {
    const patients = await getAllPatients()
    let found = false
    for (const patient of patients) {
      const patientFolder = path.join(patientsDir, patient.folderName)
      let appointments = await readAppointments(patientFolder)
      const before = appointments.length
      appointments = appointments.filter(x => x._id !== id)
      if (appointments.length < before) {
        await writeAppointments(patientFolder, appointments)
        found = true
        res.json({ ok: true })
        break
      }
    }
    if (!found) res.status(404).send('Not found')
  } catch (err) {
    console.error('DELETE /delete error:', err)
    res.status(500).send('Server error')
  }
})

/**
 * POST /update-photo/:folderName
 * ===============================
 * Uploads a new patient photo and updates all associated appointments
 * with the new photo path.
 * 
 * Authorization: Required (Bearer token)
 * Route param:   folderName - Patient folder name
 * File upload:   photo (multipart/form-data, max 5MB)
 * Response:      JSON { ok: true, photoPath: '/patients/...' }
 * Error:         404 Not found, 400 Bad upload request
 */
router.post('/update-photo/:folderName', requireAuth, async (req, res) => {
  const { folderName } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  if (!fsSync.existsSync(patientFolder)) return res.status(404).send('Patient not found')

  const photoUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, patientFolder),
      // Always save as photo.jpg — replaces any previous photo regardless of extension
      filename: (req, file, cb) => cb(null, 'photo.jpg')
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      // Accept jpg/jpeg only
      const ok = /^image\/jpe?g$/i.test(file.mimetype)
      cb(ok ? null : new Error('Only JPG files are allowed'), ok)
    }
  }).single('photo')

  photoUpload(req, res, async (err) => {
    if (err) return res.status(400).send(err.message || 'Upload failed')
    if (!req.file) return res.status(400).send('No photo provided')

    // Delete any old photo files with different extensions so only photo.jpg remains
    for (const oldExt of ['photo.jpeg', 'photo.png', 'photo.gif', 'photo.webp', 'photo.bmp']) {
      const oldPath = path.join(patientFolder, oldExt)
      if (fsSync.existsSync(oldPath)) {
        try { fsSync.unlinkSync(oldPath) } catch (e) { /* ignore */ }
      }
    }

    const photoPath = `/patients/${folderName}/photo.jpg`
    const apptPath = path.join(patientFolder, 'appointments.json')
    if (fsSync.existsSync(apptPath)) {
      try {
        const data = await fs.readFile(apptPath, 'utf8')
        const appts = JSON.parse(data)
        appts.forEach(a => { a.photoPath = photoPath })
        await fs.writeFile(apptPath, JSON.stringify(appts, null, 2), 'utf8')
      } catch (e) { console.error('Error updating appointments with photo:', e) }
    }
    res.json({ ok: true, photoPath })
  })
})

/**
 * GET /debug-patients
 * ====================
 * Debug endpoint for inspecting the patient data structure.
 * Returns metadata about all patient folders and their appointments.
 * Useful for troubleshooting data integrity issues.
 * 
 * Authorization: Required (Bearer token)
 * Response: JSON with folder summaries and appointment counts
 */
router.get('/debug-patients', requireAuth, async (req, res) => {
  try {
    const folders = await fs.readdir(patientsDir)
    const debug = []
    for (const folder of folders) {
      const folderPath = path.join(patientsDir, folder)
      const stat = await fs.stat(folderPath)
      if (!stat.isDirectory()) continue
      const appointments = await readAppointments(folderPath)
      debug.push({
        folderName: folder,
        hasAppointments: appointments.length > 0,
        appointmentCount: appointments.length,
        firstAppointment: appointments.length > 0 ? {
          id: appointments[0]._id,
          lastName: appointments[0].lastName,
          firstName: appointments[0].firstName,
          submittedAt: appointments[0]._submittedAt
        } : null
      })
    }
    res.json({
      totalFolders: folders.length,
      foldersWithAppointments: debug.filter(d => d.hasAppointments).length,
      debug
    })
  } catch (err) {
    console.error('debug-patients error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router