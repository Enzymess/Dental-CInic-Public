'use strict'

const express  = require('express')
const router   = express.Router()
const fsSync   = require('fs')
const { promises: fs } = require('fs')
const path     = require('path')
const { requireAuth } = require('../middleware/auth')
const { patientsDir } = require('../config')

// POST /save-dental-info/:folderName
router.post('/save-dental-info/:folderName', requireAuth, async (req, res) => {
  const { folderName } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  if (!fsSync.existsSync(patientFolder)) return res.status(404).send('Patient folder not found')
  try {
    const infoPath = path.join(patientFolder, 'dental-chart-info.json')
    let existing = []
    if (fsSync.existsSync(infoPath)) {
      existing = JSON.parse(await fs.readFile(infoPath, 'utf8'))
    }
    existing.push(req.body)
    await fs.writeFile(infoPath, JSON.stringify(existing, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /save-dental-info error:', err)
    res.status(500).send('Failed to save clinical information')
  }
})

// GET /get-dental-info/:folderName
router.get('/get-dental-info/:folderName', requireAuth, async (req, res) => {
  const { folderName } = req.params
  const infoPath = path.join(patientsDir, folderName, 'dental-chart-info.json')
  try {
    if (!fsSync.existsSync(infoPath)) return res.json([])
    res.json(JSON.parse(await fs.readFile(infoPath, 'utf8')))
  } catch (err) {
    console.error('GET /get-dental-info error:', err)
    res.status(500).send('Failed to load clinical information')
  }
})

// PUT /appointments/:id/complete
router.put('/appointments/:id/complete', requireAuth, async (req, res) => {
  const { id } = req.params
  const { folderName, completed } = req.body
  try {
    const { readAppointments, writeAppointments } = require('../utils/patient-data')
    const patientFolder = path.join(patientsDir, folderName)
    const appointments  = await readAppointments(patientFolder)
    const idx = appointments.findIndex(a => a._id === id)
    if (idx === -1) return res.status(404).send('Appointment not found')
    appointments[idx]._completed   = completed
    appointments[idx]._completedAt = completed ? new Date().toISOString() : null
    await writeAppointments(patientFolder, appointments)
    res.json({ ok: true })
  } catch (err) {
    console.error('PUT /appointments complete error:', err)
    res.status(500).send('Failed to update appointment')
  }
})

// DELETE /appointments/:id
router.delete('/appointments/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { folderName } = req.query
  try {
    const { readAppointments, writeAppointments } = require('../utils/patient-data')
    const patientFolder = path.join(patientsDir, folderName)
    let appointments = await readAppointments(patientFolder)
    const before = appointments.length
    appointments = appointments.filter(a => a._id !== id)
    if (appointments.length === before) return res.status(404).send('Appointment not found')
    await writeAppointments(patientFolder, appointments)
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /appointments error:', err)
    res.status(500).send('Failed to delete appointment')
  }
})

// PUT /appointments/:id/reschedule
router.put('/appointments/:id/reschedule', requireAuth, async (req, res) => {
  const { id } = req.params
  const { folderName, newDate, newTime, reason } = req.body
  try {
    const { readAppointments, writeAppointments } = require('../utils/patient-data')
    const patientFolder = path.join(patientsDir, folderName)
    const appointments  = await readAppointments(patientFolder)
    const idx = appointments.findIndex(a => a._id === id)
    if (idx === -1) return res.status(404).send('Appointment not found')
    const a = appointments[idx]
    a._rescheduledFrom = a._submittedAt
    a._rescheduledDate = newDate
    a._rescheduledTime = newTime
    a._rescheduleReason = reason || ''
    a._rescheduledAt = new Date().toISOString()
    a._rescheduled   = true
    const dtStr = newTime ? `${newDate}T${newTime}:00` : `${newDate}T09:00:00`
    a._submittedAt = new Date(dtStr).toISOString()
    await writeAppointments(patientFolder, appointments)
    res.json({ ok: true })
  } catch (err) {
    console.error('PUT /appointments reschedule error:', err)
    res.status(500).send('Failed to reschedule appointment')
  }
})

module.exports = router
