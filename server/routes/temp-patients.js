'use strict'

const express  = require('express')
const router   = express.Router()
const fsSync   = require('fs')
const { promises: fs } = require('fs')
const path     = require('path')
const { requireAuth } = require('../middleware/auth')

const tempFile = path.join(__dirname, '../../temp-patients.json')

async function readTempPatients() {
  if (!fsSync.existsSync(tempFile)) return []
  try { return JSON.parse(await fs.readFile(tempFile, 'utf8')) }
  catch { return [] }
}

async function writeTempPatients(list) {
  await fs.writeFile(tempFile, JSON.stringify(list, null, 2), 'utf8')
}

// POST /temp-patient
router.post('/temp-patient', requireAuth, async (req, res) => {
  try {
    const { fullName, mobileNo, date, appointmentTime, procedure, amountChanged, denticals } = req.body
    if (!fullName || !fullName.trim()) return res.status(400).send('Full name is required')
    if (!date) return res.status(400).send('Date is required')

    const newRecord = {
      id: `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      _timestamp:      new Date().toISOString(),
      date,
      appointmentTime: appointmentTime || '',
      procedure:       procedure || 'Walk-in',
      amountChanged:   parseFloat(amountChanged) || 0,
      amountPaid:      0,
      denticals:       denticals || '',
      _isTemp:         true,
      _completed:      false,
      _patientName:    fullName.trim(),
      _firstName:      fullName.trim().split(' ')[0],
      _lastName:       fullName.trim().split(' ').slice(1).join(' ') || '',
      _mobileNo:       mobileNo || '',
      _patientFolder:  null
    }

    const list = await readTempPatients()
    list.push(newRecord)
    await writeTempPatients(list)
    console.log(`Temporary patient added: ${fullName.trim()} on ${date}`)
    res.json({ ok: true, record: newRecord })
  } catch (err) {
    console.error('POST /temp-patient error:', err)
    res.status(500).send('Failed to create temporary patient')
  }
})

// GET /temp-patients
router.get('/temp-patients', requireAuth, async (req, res) => {
  try { res.json(await readTempPatients()) }
  catch (err) {
    console.error('GET /temp-patients error:', err)
    res.status(500).json({ error: 'Failed to read temporary patients' })
  }
})

// DELETE /temp-patient/:id
router.delete('/temp-patient/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    let list = await readTempPatients()
    const before = list.length
    list = list.filter(r => r.id !== id)
    if (list.length === before) return res.status(404).send('Temp patient not found')
    await writeTempPatients(list)
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /temp-patient error:', err)
    res.status(500).send('Failed to delete temporary patient')
  }
})

// PATCH /temp-patient/:id/complete
router.patch('/temp-patient/:id/complete', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const list = await readTempPatients()
    const idx  = list.findIndex(r => r.id === id)
    if (idx === -1) return res.status(404).send('Temp patient not found')
    list[idx]._completed = !list[idx]._completed
    await writeTempPatients(list)
    res.json({ ok: true, record: list[idx] })
  } catch (err) {
    console.error('PATCH /temp-patient complete error:', err)
    res.status(500).send('Failed to update temporary patient')
  }
})

module.exports = router
module.exports.readTempPatients = readTempPatients
