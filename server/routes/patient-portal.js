/**
 * PATIENT PORTAL ROUTES
 * ======================
 * POST /patient-login                  — patient logs in with name + birthdate
 * PUT  /patient-update-self/:folder    — patient updates their own personal info
 *
 * Add to server.js routes list:
 *   './server/routes/patient-portal'
 *
 * Password = birthdate in YYYY-MM-DD format (e.g. 1990-05-15)
 * Reads directly from the appointments.json in each patient folder.
 */

'use strict'

const express = require('express')
const router  = express.Router()
const fs      = require('fs')
const path    = require('path')
const crypto  = require('crypto')

// Resolve patients directory the same way the rest of the server does
let PATIENTS_DIR
try {
  PATIENTS_DIR = require('../config').patientsDir
} catch (_) {
  PATIENTS_DIR = path.join(__dirname, '../../patients')
}

/* ── Session store ───────────────────────────────────────── */
const _sessions = new Map()
const TTL_MS    = 2 * 60 * 60 * 1000  // 2 hours

function issueToken (folderName) {
  const token = crypto.randomBytes(32).toString('hex')
  _sessions.set(token, { folderName, expires: Date.now() + TTL_MS })
  return token
}

function verifyToken (req) {
  const header = req.headers['authorization'] || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const s = _sessions.get(token)
  if (!s) return null
  if (Date.now() > s.expires) { _sessions.delete(token); return null }
  return s
}

/* ── Read patient data from their folder ─────────────────────
   Tries appointments.json first (what the server writes on form submit),
   then patient-info.json as a fallback.
   appointments.json may be a single object or an array — handles both.
─────────────────────────────────────────────────────────────── */
function readPatientFile (folderPath) {
  const candidates = ['appointments.json', 'patient-info.json', 'info.json']
  for (const filename of candidates) {
    const fp = path.join(folderPath, filename)
    if (!fs.existsSync(fp)) continue
    try {
      const raw  = fs.readFileSync(fp, 'utf8')
      const parsed = JSON.parse(raw)
      // If array, the first entry is the registration data
      const data = Array.isArray(parsed) ? parsed[0] : parsed
      if (data && (data.lastName || data.firstName)) {
        return { filename, data, raw: parsed, isArray: Array.isArray(parsed) }
      }
    } catch (_) {}
  }
  return null
}

/* ── Find patient by name across all patient folders ─────── */
function findPatient (lastName, firstName) {
  if (!fs.existsSync(PATIENTS_DIR)) return null

  let folders
  try { folders = fs.readdirSync(PATIENTS_DIR) } catch (_) { return null }

  for (const folder of folders) {
    const folderPath = path.join(PATIENTS_DIR, folder)
    try { if (!fs.statSync(folderPath).isDirectory()) continue }
    catch (_) { continue }

    const result = readPatientFile(folderPath)
    if (!result) continue

    const lnMatch = (result.data.lastName  || '').trim().toLowerCase() === lastName.trim().toLowerCase()
    const fnMatch = (result.data.firstName || '').trim().toLowerCase() === firstName.trim().toLowerCase()
    if (lnMatch && fnMatch) return { folder, folderPath, ...result }
  }
  return null
}

/* ── Write changes back to the same file ────────────────── */
function savePatientFile (folderPath, filename, data, isArray, rawOriginal) {
  const fp      = path.join(folderPath, filename)
  const content = isArray ? [data, ...rawOriginal.slice(1)] : data
  fs.writeFileSync(fp, JSON.stringify(content, null, 2), 'utf8')
}

/* ── Strip sensitive fields before sending to patient ─────── */
function sanitise (data, folder) {
  return {
    folderName:          folder,
    lastName:            data.lastName           || '',
    firstName:           data.firstName          || '',
    middleName:          data.middleName         || '',
    nickname:            data.nickname           || '',
    birthdate:           data.birthdate          || '',
    age:                 data.age                || '',
    sex:                 data.sex                || '',
    nationality:         data.nationality        || '',
    religion:            data.religion           || '',
    occupation:          data.occupation         || '',
    homeAddress:         data.homeAddress        || '',
    mobileNo:            data.mobileNo           || '',
    email:               data.email              || '',
    homeNo:              data.homeNo             || '',
    officeNo:            data.officeNo           || '',
    guardianName:        data.guardianName       || '',
    guardianContact:     data.guardianContact    || '',
    guardianOccupation:  data.guardianOccupation || '',
  }
}

/* ── POST /patient-login ─────────────────────────────────── */
router.post('/patient-login', (req, res) => {
  const { lastName, firstName, password } = req.body || {}

  if (!lastName?.trim() || !firstName?.trim() || !password?.trim()) {
    return res.status(400).json({ ok: false, error: 'All fields are required.' })
  }

  const match = findPatient(lastName, firstName)
  if (!match) {
    return res.status(401).json({ ok: false, error: 'Name or password is incorrect.' })
  }

  // Password must equal the birthdate string exactly (YYYY-MM-DD)
  const birthdate = (match.data.birthdate || '').trim()
  if (!birthdate || password.trim() !== birthdate) {
    return res.status(401).json({ ok: false, error: 'Name or password is incorrect.' })
  }

  const token = issueToken(match.folder)

  return res.json({
    ok:         true,
    token,
    folderName: match.folder,
    patient:    sanitise(match.data, match.folder),
  })
})

/* ── PUT /patient-update-self/:folder ────────────────────── */
router.put('/patient-update-self/:folder', (req, res) => {
  const session = verifyToken(req)
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Session expired. Please log in again.' })
  }

  const { folder } = req.params
  if (session.folderName !== folder) {
    return res.status(403).json({ ok: false, error: 'Unauthorized.' })
  }

  const folderPath = path.join(PATIENTS_DIR, folder)
  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ ok: false, error: 'Patient not found.' })
  }

  const result = readPatientFile(folderPath)
  if (!result) {
    return res.status(404).json({ ok: false, error: 'Patient data file not found.' })
  }

  const { filename, data, isArray, raw } = result
  const updates = req.body || {}

  // Only these fields are patient-editable
  const EDITABLE = [
    'lastName', 'firstName', 'middleName', 'nickname',
    'birthdate', 'age', 'sex', 'nationality', 'religion', 'occupation',
    'homeAddress', 'mobileNo', 'email', 'homeNo', 'officeNo',
    'guardianName', 'guardianContact', 'guardianOccupation',
  ]

  EDITABLE.forEach(key => {
    if (updates[key] !== undefined) data[key] = String(updates[key] || '').trim()
  })

  data._lastPatientEdit = new Date().toISOString()

  try {
    savePatientFile(folderPath, filename, data, isArray, raw)
    return res.json({ ok: true })
  } catch (err) {
    console.error('patient-update-self error:', err)
    return res.status(500).json({ ok: false, error: 'Failed to save.' })
  }
})

module.exports = router