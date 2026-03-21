'use strict'

const express  = require('express')
const router   = express.Router()
const fsSync   = require('fs')
const { promises: fs } = require('fs')
const path     = require('path')
const { requireAuth } = require('../middleware/auth')
const { patientsDir } = require('../config')
const { getAllPatients, readAppointments } = require('../utils/patient-data')
const { generateBillingFromRecord } = require('../config/billing')
const { makeId } = require('../utils/helpers')
const { readTempPatients } = require('./temp-patients')

const recordsPath = (folder) => path.join(patientsDir, folder, 'treatment-records.json')

async function readRecords(folderName) {
  const p = recordsPath(folderName)
  if (!fsSync.existsSync(p)) return []
  return JSON.parse(await fs.readFile(p, 'utf8'))
}

async function writeRecords(folderName, records) {
  await fs.writeFile(recordsPath(folderName), JSON.stringify(records, null, 2), 'utf8')
}

// GET /treatment-records/:folderName
router.get('/treatment-records/:folderName', requireAuth, async (req, res) => {
  try {
    res.json(await readRecords(req.params.folderName))
  } catch (err) {
    console.error('GET /treatment-records error:', err)
    res.status(500).send('Failed to load treatment records')
  }
})

// POST /treatment-records/:folderName
router.post('/treatment-records/:folderName', requireAuth, async (req, res) => {
  const { folderName } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  if (!fsSync.existsSync(patientFolder)) return res.status(404).send('Patient folder not found')
  try {
    const newRecord = { ...req.body, id: Date.now(), _timestamp: new Date().toISOString() }
    newRecord.billing = generateBillingFromRecord(newRecord, null)
    const records = await readRecords(folderName)
    records.push(newRecord)
    await writeRecords(folderName, records)
    res.json({ ok: true, record: newRecord })
  } catch (err) {
    console.error('POST /treatment-records error:', err)
    res.status(500).send('Failed to save treatment record')
  }
})

// PUT /treatment-records/:folderName/:recordId
router.put('/treatment-records/:folderName/:recordId', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  try {
    const records = await readRecords(folderName)
    const idx = records.findIndex(r => r.id === parseInt(recordId))
    if (idx === -1) return res.status(404).send('Record not found')
    records[idx] = { ...records[idx], ...req.body, id: records[idx].id, _timestamp: records[idx]._timestamp, _updated: new Date().toISOString() }
    records[idx].billing = generateBillingFromRecord(records[idx], records[idx].billing || null)
    await writeRecords(folderName, records)
    res.json({ ok: true, record: records[idx] })
  } catch (err) {
    console.error('PUT /treatment-records error:', err)
    res.status(500).send('Failed to update treatment record')
  }
})

// PUT /treatment-records/:folderName/:recordId/complete
router.put('/treatment-records/:folderName/:recordId/complete', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const { completed } = req.body
  try {
    const records = await readRecords(folderName)
    const idx = records.findIndex(r => r.id === parseInt(recordId))
    if (idx === -1) return res.status(404).send('Record not found')
    records[idx]._completed   = completed
    records[idx]._completedAt = completed ? new Date().toISOString() : null
    await writeRecords(folderName, records)
    res.json({ ok: true })
  } catch (err) {
    console.error('PUT /treatment-records complete error:', err)
    res.status(500).send('Failed to update record')
  }
})

// PUT /treatment-records/:folderName/:recordId/reschedule
router.put('/treatment-records/:folderName/:recordId/reschedule', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const { newDate } = req.body
  if (!newDate) return res.status(400).send('newDate is required')
  try {
    const records = await readRecords(folderName)
    const idx = records.findIndex(r => r.id === parseInt(recordId))
    if (idx === -1) return res.status(404).send('Record not found')
    records[idx].date          = newDate
    records[idx]._rescheduledAt = new Date().toISOString()
    records[idx]._completed     = false
    records[idx]._completedAt   = null
    await writeRecords(folderName, records)
    res.json({ ok: true })
  } catch (err) {
    console.error('PUT /treatment-records reschedule error:', err)
    res.status(500).send('Failed to reschedule record')
  }
})

// DELETE /treatment-records/:folderName/:recordId
router.delete('/treatment-records/:folderName/:recordId', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  try {
    const records = await readRecords(folderName)
    await writeRecords(folderName, records.filter(r => r.id !== parseInt(recordId)))
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /treatment-records error:', err)
    res.status(500).send('Failed to delete treatment record')
  }
})

// GET /all-treatment-records
router.get('/all-treatment-records', requireAuth, async (req, res) => {
  try {
    const patients   = await getAllPatients()
    const allRecords = []

    for (const patient of patients) {
      const rPath = recordsPath(patient.folderName)
      if (!fsSync.existsSync(rPath)) continue
      const records = JSON.parse(await fs.readFile(rPath, 'utf8'))
      records.forEach(record => {
        if (record._isTemp && patient.folderName.startsWith('TEMP_')) return
        allRecords.push({
          ...record,
          _patientFolder: patient.folderName,
          _patientName:   `${patient.lastName}, ${patient.firstName}`,
          _firstName:     patient.firstName,
          _lastName:      patient.lastName,
          _photoPath:     patient.photoPath,
          _mobileNo:      (patient.appointments[0] || {}).mobileNo || '',
          _email:         (patient.appointments[0] || {}).email    || ''
        })
      })
    }

    const tempPatients = await readTempPatients()
    tempPatients.forEach(rec => allRecords.push({ ...rec, _isTemp: true, _patientFolder: null }))

    res.json(allRecords)
  } catch (err) {
    console.error('GET /all-treatment-records error:', err)
    res.status(500).json({ error: 'Failed to load treatment records' })
  }
})

// ── Billing endpoints ────────────────────────────────────────────────────────

// GET /financial-summary
router.get('/financial-summary', requireAuth, async (req, res) => {
  try {
    const folders = await fs.readdir(patientsDir)
    const today    = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    const monthKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

    let dailyRevenue = 0, monthlyRevenue = 0, totalRevenue = 0, totalExpenses = 0

    for (const folder of folders) {
      const stat = await fs.stat(path.join(patientsDir, folder)).catch(() => null)
      if (!stat || !stat.isDirectory()) continue
      const rPath = recordsPath(folder)
      if (!fsSync.existsSync(rPath)) continue
      const records = JSON.parse(await fs.readFile(rPath, 'utf8'))
      for (const rec of records) {
        const b = rec.billing
        if (!b) continue
        totalExpenses += parseFloat(b.expenses) || 0
        if (b.paymentStatus !== 'paid') continue
        const amount = parseFloat(b.totalAmount) || 0
        totalRevenue += amount
        const payDate = b.paymentDate || rec.date || rec._timestamp
        if (payDate) {
          const d = new Date(payDate)
          const dKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          const mKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
          if (dKey === todayKey) dailyRevenue   += amount
          if (mKey === monthKey) monthlyRevenue += amount
        }
      }
    }
    res.json({ dailyRevenue, monthlyRevenue, totalRevenue, totalExpenses, totalNetProfit: totalRevenue - totalExpenses })
  } catch (err) {
    console.error('/financial-summary error:', err)
    res.status(500).json({ error: 'Failed to compute financial summary' })
  }
})

// PUT /update-expenses/:folderName/:recordId
router.put('/update-expenses/:folderName/:recordId', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const { expenses } = req.body
  try {
    const records = await readRecords(folderName)
    const idx = records.findIndex(r => r.id === parseInt(recordId))
    if (idx === -1) return res.status(404).send('Record not found')
    const exp = parseFloat(expenses) || 0
    if (!records[idx].billing) records[idx].billing = generateBillingFromRecord(records[idx], null)
    records[idx].billing.expenses  = exp
    records[idx].billing.netProfit = (parseFloat(records[idx].billing.totalAmount) || 0) - exp
    await writeRecords(folderName, records)
    res.json({ ok: true, billing: records[idx].billing })
  } catch (err) {
    console.error('/update-expenses error:', err)
    res.status(500).send('Server error')
  }
})

// PUT /mark-paid/:folderName/:recordId
router.put('/mark-paid/:folderName/:recordId', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const { paid } = req.body
  try {
    const records = await readRecords(folderName)
    const idx = records.findIndex(r => r.id === parseInt(recordId))
    if (idx === -1) return res.status(404).send('Record not found')
    if (!records[idx].billing) records[idx].billing = generateBillingFromRecord(records[idx], null)
    if (paid) {
      const charged = parseFloat(records[idx].amountChanged) || 0
      if (charged > 0) records[idx].amountPaid = charged
    } else {
      records[idx].amountPaid = 0
    }
    records[idx].billing = generateBillingFromRecord(records[idx], records[idx].billing)
    records[idx].billing.paymentDate = paid ? new Date().toISOString() : null
    await writeRecords(folderName, records)
    res.json({ ok: true, billing: records[idx].billing, record: records[idx] })
  } catch (err) {
    console.error('mark-paid error:', err)
    res.status(500).send('Server error')
  }
})

module.exports = router
