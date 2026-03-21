'use strict'

const functions  = require('firebase-functions')
const express    = require('express')
const fsSync     = require('fs')
const { promises: fs } = require('fs')
const path       = require('path')
const crypto     = require('crypto')
const bcrypt     = require('bcrypt')
const rateLimit  = require('express-rate-limit')
const helmet     = require('helmet')
const cors       = require('cors')
const validator  = require('validator')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const multer     = require('multer')
const archiver   = require('archiver')

// DATA_DIR env var allows Railway/cloud to point to a persistent volume
// Locally it defaults to the project folder so nothing changes
const dataDir     = process.env.DATA_DIR || __dirname
const patientsDir = path.join(dataDir, 'patients')
const filesDir    = path.join(dataDir, 'Files')
const backupDir   = path.join(dataDir, 'Backup')
const codeBackupDir = path.join(dataDir, 'CodeBackup')
const teethBaseDir  = path.join(filesDir, 'teeth_base')
const imagesDir     = path.join(dataDir, 'patient-images')
const credentialsPath = path.join(dataDir, 'credentials.json')
const dentistsPath    = path.join(dataDir, 'dentists.json')

function loadDentists() {
  try { if (fsSync.existsSync(dentistsPath)) return JSON.parse(fsSync.readFileSync(dentistsPath, 'utf8')) }
  catch (e) { console.error('dentists.json error:', e.message) }
  return []
}
function saveDentists(list) {
  fsSync.writeFileSync(dentistsPath, JSON.stringify(list, null, 2), 'utf8')
}

if (!fsSync.existsSync(patientsDir)) fsSync.mkdirSync(patientsDir)
if (!fsSync.existsSync(filesDir)) fsSync.mkdirSync(filesDir)
if (!fsSync.existsSync(backupDir)) fsSync.mkdirSync(backupDir)
if (!fsSync.existsSync(codeBackupDir)) fsSync.mkdirSync(codeBackupDir)
if (!fsSync.existsSync(teethBaseDir)) fsSync.mkdirSync(teethBaseDir, { recursive: true })
if (!fsSync.existsSync(imagesDir)) fsSync.mkdirSync(imagesDir, { recursive: true })

// =====================================================
// CREDENTIALS MANAGEMENT
// =====================================================

const DEFAULT_CREDENTIALS = { username: 'admin', password: 'admin123' }

function loadCredentials() {
  try {
    if (fsSync.existsSync(credentialsPath)) {
      return JSON.parse(fsSync.readFileSync(credentialsPath, 'utf8'))
    }
  } catch (e) {
    console.error('Error loading credentials:', e.message)
  }
  return { ...DEFAULT_CREDENTIALS }
}

function saveCredentials(creds) {
  fsSync.writeFileSync(credentialsPath, JSON.stringify(creds, null, 2), 'utf8')
}

// Initialize credentials file if missing
if (!fsSync.existsSync(credentialsPath)) {
  saveCredentials(DEFAULT_CREDENTIALS)
  console.log(' Default credentials file created (admin / admin123)')
}

// In-memory token store: token -> { username, createdAt }
const activeTokens = new Map()

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function _safePdfText(code) {
  if (!code) return ''
  return String(code)
    .replace(/[\u2713\u2714\u2611\u2705\u2714]/g, 'P')
    .replace(/[^\x20-\x7E]/g, '?')
}

function s(val) {
  if (val === null || val === undefined) return ''
  return String(val)
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return crypto.createHash('sha1').update(Date.now() + Math.random().toString()).digest('hex')
}

function formatDateForFilename(raw) {
  if (!raw) return 'no-date'
  const d = new Date(raw)
  if (isNaN(d)) return String(raw).slice(0, 10).replace(/[:/]/g, '-')
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function calculateAge(birthdate) {
  if (!birthdate) return ''
  const birthDate = new Date(birthdate)
  if (isNaN(birthDate)) return ''
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return String(age)
}

// Sanitize a string — strip HTML, escape dangerous chars, limit length
function sanitizeStr(val, maxLen = 200) {
  if (val === null || val === undefined) return ''
  return validator.escape(String(val).trim()).slice(0, maxLen)
}

// Sanitize all user-supplied string fields before saving
function sanitizeEntry(entry) {
  const FIELDS = [
    'lastName','firstName','middleName','nickname','homeAddress','homeNo','officeNo',
    'faxNo','mobileNo','email','nationality','religion','occupation','dentalInsurance',
    'policyNo','guardianName','guardianOccupation','guardianContact','physicianName',
    'physicianSpecialty','physicianContact','physicianOfficeAddress','bloodType',
    'bloodPressure','previousDentist','visitFrequency','previousTreatments',
    'brushingFrequency','oralHabits','extraoralFindings','intraoralFindings',
    'reasonForConsult','referredBy','consentSignature','attendingDentist',
    'provisionalDiagnosis','plannedTreatment','medicaments'
  ]
  const out = { ...entry }
  FIELDS.forEach(f => { if (out[f]) out[f] = sanitizeStr(out[f]) })
  return out
}

function getPatientKey(entry) {
  const ln = (entry.lastName || '').trim().toLowerCase()
  const fn = (entry.firstName || '').trim().toLowerCase()
  const mn = (entry.middleName || '').trim().toLowerCase()
  const bd = entry.birthdate || ''
  return `${ln}|${fn}|${mn}|${bd}`
}

function sanitizeFolderName(key) {
  const parts = key.split('|')
  const lastName = parts[0] || 'Unknown'
  const firstName = parts[1] || ''
  const middleName = parts[2] || ''
  const birthdate = parts[3] ? formatDateForFilename(parts[3]) : 'no-date'

  let name = `${lastName}-${firstName}`
  if (middleName) name += `-${middleName}`
  name += `-${birthdate}`

  return name.replace(/[/\\<>:|"?*]+/g, '').replace(/\s+/g, '-') // eslint-disable-line no-useless-escape
}

function getPatientFolder(entry) {
  const key    = getPatientKey(entry)
  const prefix = entry.attendingDentistId ? entry.attendingDentistId + '__' : ''
  return path.join(patientsDir, prefix + sanitizeFolderName(key))
}

function parseFormDataFields(body) {
  const parsed = { ...body }
  for (const key of ['allergies', 'conditions', 'periodontalScreening', 'occlusion', 'appliances', 'tmd', 'xrayTaken']) {
    if (parsed[key] && typeof parsed[key] === 'string') {
      try {
        parsed[key] = JSON.parse(parsed[key])
      } catch (e) {
        parsed[key] = parsed[key].split(',').map(s => s.trim()).filter(Boolean)
      }
    }
  }
  return parsed
}

// =====================================================
// AUTH MIDDLEWARE
// =====================================================

const TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000 // 8 hours

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }
  const td = activeTokens.get(token)
  if (Date.now() - td.createdAt > TOKEN_MAX_AGE_MS) {
    activeTokens.delete(token)
    return res.status(401).json({ ok: false, error: 'Session expired. Please log in again.' })
  }
  next()
}

// Admin-only middleware
function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const td = activeTokens.get(token) || {}
  if (td.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin access required.' })
  }
  next()
}

// =====================================================
// PATIENT DATA FUNCTIONS
// =====================================================

async function readAppointments(folderPath) {
  const appointmentsPath = path.join(folderPath, 'appointments.json')
  try {
    const data = await fs.readFile(appointmentsPath, 'utf8')
    return JSON.parse(data)
  } catch (e) {
    return []
  }
}

async function writeAppointments(folderPath, appointments) {
  const appointmentsPath = path.join(folderPath, 'appointments.json')
  await fs.writeFile(appointmentsPath, JSON.stringify(appointments, null, 2), 'utf8')
}

function getPatientInfoFromAppointments(appointments) {
  if (!appointments || appointments.length === 0) return null
  const firstAppt = appointments[0]
  return {
    lastName: firstAppt.lastName,
    firstName: firstAppt.firstName,
    middleName: firstAppt.middleName,
    birthdate: firstAppt.birthdate
  }
}

async function getAllPatients() {
  const folders = await fs.readdir(patientsDir)
  const patients = []

  for (const folder of folders) {
    // Skip legacy TEMP_ folders — temporary patients now live in temp-patients.json
    if (folder.startsWith('TEMP_')) continue

    const folderPath = path.join(patientsDir, folder)
    const stat = await fs.stat(folderPath)

    if (!stat.isDirectory()) continue

    const appointments = await readAppointments(folderPath)
    if (appointments.length === 0) continue

    const patientData = getPatientInfoFromAppointments(appointments)
    if (!patientData) continue

    let photoPath = null
    const photoFiles = ['photo.jpg', 'photo.jpeg', 'photo.png', 'photo.gif', 'photo.webp', 'photo.bmp']
    for (const photoFile of photoFiles) {
      const testPath = path.join(folderPath, photoFile)
      if (fsSync.existsSync(testPath)) {
        photoPath = `/patients/${folder}/${photoFile}`
        break
      }
    }

    patients.push({
      folderName: folder,
      ...patientData,
      photoPath,
      appointments: appointments.map(appt => ({
        ...appt,
        _patientFolder: folder
      }))
    })
  }

  return patients
}

async function getLatestDentalChartInfo(folderPath) {
  const infoPath = path.join(folderPath, 'dental-chart-info.json')
  try {
    if (!fsSync.existsSync(infoPath)) return null
    const fileContent = await fs.readFile(infoPath, 'utf8')
    const data = JSON.parse(fileContent)
    if (!data || data.length === 0) return null
    return data[data.length - 1]
  } catch (e) {
    return null
  }
}

// =====================================================
// BACKUP FUNCTIONS
// =====================================================

async function _createCodeBackup() {
  const timeNow = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0]
  const zipFilename = `code-backup-${timeNow}.zip`
  const zipPath = path.join(codeBackupDir, zipFilename)
  const filesToBackup = ['server.js', 'script.js', 'index.html', 'style.css', 'package.json']

  return new Promise((resolve, reject) => {
    const output = fsSync.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log(` Code backup created: ${zipFilename}`)
      resolve(zipPath)
    })

    archive.on('error', (err) => {
      console.error('Code backup error:', err)
      reject(err)
    })

    archive.pipe(output)

    filesToBackup.forEach(file => {
      const filePath = path.join(__dirname, file)
      if (fsSync.existsSync(filePath)) {
        archive.file(filePath, { name: file })
      }
    })

    const pdfPath = path.join(__dirname, 'Dental Form.pdf')
    if (fsSync.existsSync(pdfPath)) {
      archive.file(pdfPath, { name: 'Dental Form.pdf' })
    }

    archive.finalize()
  })
}

// =====================================================
// TEETH FUNCTIONS
// =====================================================

async function initializePatientTeeth(patientFolder) {
  const teethNumbers = [
    11, 12, 13, 14, 15, 16, 17, 18,
    21, 22, 23, 24, 25, 26, 27, 28,
    31, 32, 33, 34, 35, 36, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48,
    51, 52, 53, 54, 55,
    61, 62, 63, 64, 65,
    71, 72, 73, 74, 75,
    81, 82, 83, 84, 85
  ]

  const possibleBaseFiles = ['teeth_base.png']
  let baseToothPath = null
  for (const fileName of possibleBaseFiles) {
    const testPath = path.join(teethBaseDir, fileName)
    if (fsSync.existsSync(testPath)) {
      baseToothPath = testPath
      break
    }
  }

  if (!baseToothPath) {
    console.warn('No base tooth template found in Files/teeth_base/')
    return
  }

  let copiedCount = 0
  for (const toothNum of teethNumbers) {
    const patientToothPath = path.join(patientFolder, `tooth_${toothNum}.jpg`)
    if (fsSync.existsSync(patientToothPath)) continue
    try {
      await fs.copyFile(baseToothPath, patientToothPath)
      copiedCount++
    } catch (err) {
      console.warn(`Could not copy tooth ${toothNum}:`, err.message)
    }
  }

  console.log(`Copied ${copiedCount} tooth images to patient folder`)
}

// =====================================================
// MULTER STORAGE CONFIGS
// =====================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const entry = req.body
    const patientFolder = getPatientFolder(entry)
    if (!fsSync.existsSync(patientFolder)) {
      fsSync.mkdirSync(patientFolder, { recursive: true })
    }
    cb(null, patientFolder)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `photo${ext}`)
  }
})
const upload = multer({ storage })

const toothStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { folderName } = req.params
    const patientFolder = path.join(patientsDir, folderName)
    if (!fsSync.existsSync(patientFolder)) {
      fsSync.mkdirSync(patientFolder, { recursive: true })
    }
    cb(null, patientFolder)
  },
  filename: (req, file, cb) => {
    const { toothNumber } = req.params
    cb(null, `tooth_${toothNumber}.jpg`)
  }
})
const uploadTooth = multer({ storage: toothStorage })

const patientImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { folderName } = req.params
    const patientImagesFolder = path.join(patientsDir, folderName, 'images')
    if (!fsSync.existsSync(patientImagesFolder)) {
      fsSync.mkdirSync(patientImagesFolder, { recursive: true })
    }
    cb(null, patientImagesFolder)
  },
  filename: (req, file, cb) => {
    const uniqueId = makeId()
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `image_${uniqueId}${ext}`)
  }
})
const uploadPatientImage = multer({
  storage: patientImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }
})

// =====================================================
// PDF HELPER FUNCTIONS
// =====================================================

function drawCheckbox(page, x, y, checked, font, size = 9) {
  page.drawRectangle({ x, y: y - 1, width: 9, height: 9, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 1 })
  if (checked) {
    page.drawText('/', { x: x + 1, y, size, font, color: rgb(0.04, 0.37, 0.66) })
  }
}

function _drawSectionHeader(page, text, x, y, width, font) {
  page.drawRectangle({ x, y: y - 3, width, height: 16, color: rgb(0.9, 0.95, 1) })
  page.drawText(text, { x: x + 4, y, size: 10, font, color: rgb(0.04, 0.37, 0.66) })
  return y - 20
}

// =====================================================
// APP SETUP
// =====================================================

const PORT = process.env.PORT || 3000  // Railway sets PORT automatically
const CLINIC_DENTIST_NAME = 'Dr. Dela Cruz'

// =====================================================
// BILLING - CONFIGURABLE PROCEDURE PRICE LIST
// =====================================================
const procedurePrices = {
  'Extraction':                1500,
  'Simple Extraction':         1500,
  'Surgical Extraction':       3500,
  'Impacted Extraction':       6500,
  'Filling':                   1800,
  'Amalgam Filling':           1500,
  'Composite Filling':         2200,
  'Tooth-Colored Filling':     2200,
  'Inlay':                     4500,
  'Root Canal':                8000,
  'Root Canal Treatment':      8000,
  'Pulp Capping':              2500,
  'Cleaning':                  1200,
  'Prophylaxis':               1200,
  'Oral Prophylaxis':          1200,
  'Scaling':                   1200,
  'Scaling and Polishing':     1500,
  'Fluoride Treatment':         900,
  'Sealant':                   1200,
  'Crown':                    12000,
  'Jacket Crown':             12000,
  'Bridge':                   18000,
  'Denture':                  15000,
  'Partial Denture':          12000,
  'Full Denture':             18000,
  'Implant':                  45000,
  'Braces':                   35000,
  'Retainer':                  5000,
  'Consultation':               500,
  'X-Ray':                      800,
  'Periapical X-Ray':           500,
  'Panoramic X-Ray':           1500,
  'Whitening':                 5000,
  'Bleaching':                 5000,
  'Tooth Whitening':           5000,
}

function lookupProcedurePrice(procedureName) {
  if (!procedureName) return 0
  const name = String(procedureName).trim()

  for (const [key, price] of Object.entries(procedurePrices)) {
    if (key.toLowerCase() === name.toLowerCase()) return price
  }

  for (const [key, price] of Object.entries(procedurePrices)) {
    if (name.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(name.toLowerCase())) {
      return price
    }
  }

  return 0
}

function generateBillingFromRecord(record, existingBilling = null) {
  const procedure = record.procedure || ''
  const toothNumber = record.ToothNo || ''
  const price = lookupProcedurePrice(procedure)

  const charged = parseFloat(record.amountChanged) || 0
  const amountPaid = parseFloat(record.amountPaid) || 0
  const resolvedPrice = charged > 0 ? charged : price

  const items = resolvedPrice > 0
    ? [{ toothNumber, procedure, price: resolvedPrice }]
    : []

  const totalAmount = items.reduce((sum, i) => sum + i.price, 0)
  const expenses = existingBilling ? (parseFloat(existingBilling.expenses) || 0) : 0
  const netProfit = totalAmount - expenses

  const balance = charged - amountPaid
  let paymentStatus
  if (charged <= 0) {
    paymentStatus = existingBilling ? (existingBilling.paymentStatus || 'unpaid') : 'unpaid'
  } else if (balance <= 0) {
    paymentStatus = 'paid'
  } else {
    paymentStatus = 'unpaid'
  }

  let paymentDate = existingBilling ? (existingBilling.paymentDate || null) : null
  if (paymentStatus === 'paid' && !paymentDate) {
    paymentDate = new Date().toISOString()
  }

  return { items, totalAmount, expenses, netProfit, paymentStatus, paymentDate }
}

const app = express()

// Security headers — blocks XSS, clickjacking, MIME sniffing, and more
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))

// CORS — only same-origin requests allowed (blocks other sites hitting your API)
app.use(cors({ origin: false }))

app.use(express.json({ limit: '10mb' }))
app.use(express.static(__dirname))
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.static(path.join(__dirname, 'views')))
app.use('/patients', express.static(patientsDir))
app.use('/teeth_base', express.static(teethBaseDir))

// =====================================================
// AUTH ROUTES
// =====================================================

// Rate limit — 10 attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { ok: false, error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
})

// GET /dentists — public, no passwords
app.get('/dentists', (req, res) => {
  res.json(loadDentists().filter(d => d.role !== 'admin').map(({ id, name, title, specialty }) => ({ id, name, title, specialty })))
})

// POST /login — rate limited + bcrypt
app.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ ok: false, error: 'Missing credentials' })

  const users = loadDentists()
  const user  = users.find(d => d.username === username)

  if (user) {
    const isHashed = user.password.startsWith('$2')
    const match = isHashed ? await bcrypt.compare(password, user.password) : password === user.password

    if (match) {
      // Auto-upgrade plain text to bcrypt on first login
      if (!isHashed) {
        user.password = await bcrypt.hash(password, 12)
        saveDentists(users)
        console.log(` Auto-upgraded password hash for: ${username}`)
      }
      const token   = makeId()
      const isAdmin = user.role === 'admin'
      activeTokens.set(token, { username, dentistId: isAdmin ? null : user.id, dentistName: isAdmin ? null : user.name, role: user.role, version: user.version || 4, createdAt: Date.now() })
      console.log(` Login: ${user.name || username} (${user.role}, v${user.version || 4})`)
      return res.json({ ok: true, token, dentistId: isAdmin ? null : user.id, dentistName: isAdmin ? null : user.name, role: user.role, version: user.version || 4 })
    }
  }
  console.warn(`  Failed login attempt for: "${username}"`)
  return res.status(401).json({ ok: false, error: 'Invalid credentials' })
})

// =====================================================
// CHANGE PASSWORD ROUTE
// =====================================================

app.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword)
    return res.status(400).json({ ok: false, error: 'Missing required fields.' })
  if (newPassword.length < 8)
    return res.status(400).json({ ok: false, error: 'New password must be at least 8 characters.' })

  const authHeader = req.headers['authorization'] || ''
  const tkn = authHeader.replace(/^Bearer /i, '').trim()
  const tokenData = activeTokens.get(tkn) || {}

  const users = loadDentists()
  const idx = users.findIndex(d => d.username === tokenData.username)
  if (idx === -1) return res.status(404).json({ ok: false, error: 'User not found.' })

  const isHashed = users[idx].password.startsWith('$2')
  const match = isHashed ? await bcrypt.compare(currentPassword, users[idx].password) : currentPassword === users[idx].password
  if (!match) return res.status(401).json({ ok: false, error: 'Current password is incorrect.' })

  users[idx].password = await bcrypt.hash(newPassword, 12)
  saveDentists(users)
  activeTokens.clear()
  console.log(' Password changed for:', tokenData.username)
  res.json({ ok: true, message: 'Password changed. Please log in again.' })
})

// =====================================================
// PATIENT ROUTES
// =====================================================

app.get('/patients', requireAuth, async (req, res) => {
  try {
    const patients = await getAllPatients()
    const authHdr = req.headers['authorization'] || ''
    const tkn = authHdr.replace(/^Bearer /i, '').trim()
    const td  = activeTokens.get(tkn) || {}
    const filterDentistId = td.dentistId || null

    const flattened = []
    patients.forEach(patient => {
      patient.appointments.forEach(appt => {
        if (filterDentistId && appt.attendingDentistId !== filterDentistId) return
        flattened.push({
          ...appt,
          lastName: patient.lastName,
          firstName: patient.firstName,
          middleName: patient.middleName,
          birthdate: patient.birthdate,
          photoPath: patient.photoPath,
          _patientFolder: patient.folderName
        })
      })
    })
    res.json(flattened)
  } catch (err) {
    console.error(' Error in /patients endpoint:', err)
    res.status(500).send('Failed to read data')
  }
})

app.post('/submit', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    let entry = req.file ? parseFormDataFields(req.body) : req.body
    if (!entry) return res.status(400).send('No data')
    entry = sanitizeEntry(entry)

    entry._id = makeId()
    if (!entry._submittedAt) entry._submittedAt = new Date().toISOString()
    entry._receivedAt = new Date().toISOString()
    entry._ip = req.ip

    // Stamp dentist from token (server-authoritative, before getPatientFolder)
    const _sa = req.headers['authorization'] || ''
    const _st = _sa.replace(/^Bearer /i, '').trim()
    const _sd = activeTokens.get(_st) || {}
    if (_sd.dentistId) {
      entry.attendingDentistId = _sd.dentistId
      entry.attendingDentist   = _sd.dentistName
    }

    const patientFolder = getPatientFolder(entry)

    if (!fsSync.existsSync(patientFolder)) {
      fsSync.mkdirSync(patientFolder, { recursive: true })
      await initializePatientTeeth(patientFolder)
      console.log(` New patient created: ${path.basename(patientFolder)}`)
    }

    const appointments = await readAppointments(patientFolder)
    appointments.push(entry)
    await writeAppointments(patientFolder, appointments)

    console.log(` Appointment saved for patient: ${path.basename(patientFolder)}`)
    if (req.file) {
      console.log(`Photo saved: ${req.file.filename}`)
    }

    res.json({ ok: true, id: entry._id })
  } catch (err) {
    console.error(err)
    res.status(500).send('Server error')
  }
})

app.put('/update/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  const newData = req.body
  if (!id) return res.status(400).send('Missing id')

  try {
    const patients = await getAllPatients()
    let found = false

    for (const patient of patients) {
      const patientFolder = path.join(patientsDir, patient.folderName)
      const appointments = await readAppointments(patientFolder)
      const idx = appointments.findIndex(x => x._id === id)

      if (idx !== -1) {
        const existing = appointments[idx]
        newData._id = existing._id
        newData._receivedAt = existing._receivedAt || existing._submittedAt || new Date().toISOString()
        newData._submittedAt = new Date().toISOString()
        newData._ip = req.ip

        appointments[idx] = newData
        await writeAppointments(patientFolder, appointments)
        found = true
        res.json({ ok: true })
        break
      }
    }

    if (!found) res.status(404).send('Not found')
  } catch (err) {
    console.error(err)
    res.status(500).send('Server error')
  }
})

app.delete('/delete/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  try {
    const patients = await getAllPatients()
    let found = false

    for (const patient of patients) {
      const patientFolder = path.join(patientsDir, patient.folderName)
      let appointments = await readAppointments(patientFolder)
      const initialLength = appointments.length

      appointments = appointments.filter(x => x._id !== id)

      if (appointments.length < initialLength) {
        await writeAppointments(patientFolder, appointments)
        found = true
        res.json({ ok: true })
        break
      }
    }

    if (!found) res.status(404).send('Not found')
  } catch (err) {
    console.error(err)
    res.status(500).send('Server error')
  }
})

app.post('/update-photo/:folderName', requireAuth, async (req, res) => {
  const folderName = req.params.folderName
  const patientFolder = path.join(patientsDir, folderName)

  try {
    if (!fsSync.existsSync(patientFolder)) {
      return res.status(404).send('Patient not found')
    }

    const photoUpload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, patientFolder),
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname) || '.jpg'
          cb(null, `photo${ext}`)
        }
      }),
      limits: { fileSize: 5 * 1024 * 1024 }
    }).single('photo')

    photoUpload(req, res, async (err) => {
      if (err) {
        console.error('Photo upload error:', err)
        return res.status(400).send('Upload failed: ' + err.message)
      }

      if (!req.file) return res.status(400).send('No photo provided')

      const photoPath = `/patients/${folderName}/${req.file.filename}`

      const appointmentsPath = path.join(patientFolder, 'appointments.json')
      if (fsSync.existsSync(appointmentsPath)) {
        try {
          const data = await fs.readFile(appointmentsPath, 'utf8')
          const appointments = JSON.parse(data)
          appointments.forEach(appt => { appt.photoPath = photoPath })
          await fs.writeFile(appointmentsPath, JSON.stringify(appointments, null, 2), 'utf8')
        } catch (e) {
          console.error('Error updating appointments with photo path:', e)
        }
      }

      res.json({ ok: true, photoPath })
    })
  } catch (err) {
    console.error(err)
    res.status(500).send('Server error')
  }
})

// =====================================================
// TOOTH IMAGE ROUTES
// =====================================================

app.get('/tooth-image/:folderName/:toothNumber', requireAuth, async (req, res) => {
  const { folderName, toothNumber } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const patientToothPathJpg = path.join(patientFolder, `tooth_${toothNumber}.jpg`)
  const patientToothPathPng = path.join(patientFolder, `tooth_${toothNumber}.png`)

  try {
    if (fsSync.existsSync(patientToothPathJpg)) {
      const img = await fs.readFile(patientToothPathJpg)
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'no-cache')
      return res.send(img)
    }

    if (fsSync.existsSync(patientToothPathPng)) {
      const img = await fs.readFile(patientToothPathPng)
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'no-cache')
      return res.send(img)
    }

    if (fsSync.existsSync(patientFolder)) {
      await initializePatientTeeth(patientFolder)
      if (fsSync.existsSync(patientToothPathJpg)) {
        const img = await fs.readFile(patientToothPathJpg)
        res.setHeader('Content-Type', 'image/jpeg')
        res.setHeader('Cache-Control', 'no-cache')
        return res.send(img)
      }
    }

    res.status(404).send('Tooth image not found')
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to load tooth image')
  }
})

app.post('/save-tooth/:folderName/:toothNumber', requireAuth, uploadTooth.single('tooth'), async (req, res) => {
  const { folderName, toothNumber } = req.params
  try {
    if (!req.file) return res.status(400).send('No tooth image provided')
    res.json({ ok: true, path: `/patients/${folderName}/tooth_${toothNumber}.jpg` })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to save tooth')
  }
})

// =====================================================
// TOOTH STATUS ROUTES
// =====================================================

app.get('/get-tooth-status/:folderName', requireAuth, (req, res) => {
  try {
    const folderName = decodeURIComponent(req.params.folderName)
    const toothStatusPath = path.join(patientsDir, folderName, 'tooth-status.json')
    if (!fsSync.existsSync(toothStatusPath)) return res.json({})
    const data = JSON.parse(fsSync.readFileSync(toothStatusPath, 'utf8'))
    res.json(data)
  } catch (err) {
    console.error('GET /get-tooth-status error:', err)
    res.json({})
  }
})

app.post('/save-tooth-status/:folderName', requireAuth, (req, res) => {
  try {
    const folderName = decodeURIComponent(req.params.folderName)
    const patientFolder = path.join(patientsDir, folderName)
    const toothStatusPath = path.join(patientFolder, 'tooth-status.json')
    if (!fsSync.existsSync(patientFolder)) {
      return res.status(404).json({ ok: false, message: 'Patient folder not found' })
    }
    fsSync.writeFileSync(toothStatusPath, JSON.stringify(req.body || {}, null, 2))
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /save-tooth-status error:', err)
    res.status(500).json({ ok: false, message: err.message })
  }
})

// =====================================================
// DENTAL CHART / CLINICAL INFO ROUTES
// =====================================================

app.post('/save-dental-info/:folderName', requireAuth, async (req, res) => {
  const folderName = req.params.folderName
  const patientFolder = path.join(patientsDir, folderName)

  try {
    if (!fsSync.existsSync(patientFolder)) return res.status(404).send('Patient folder not found')

    const clinicalInfo = req.body
    const infoPath = path.join(patientFolder, 'dental-chart-info.json')

    let existingData = []
    if (fsSync.existsSync(infoPath)) {
      const fileContent = await fs.readFile(infoPath, 'utf8')
      existingData = JSON.parse(fileContent)
    }

    existingData.push(clinicalInfo)
    await fs.writeFile(infoPath, JSON.stringify(existingData, null, 2), 'utf8')

    res.json({ ok: true, message: 'Clinical information saved successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to save clinical information')
  }
})

app.get('/get-dental-info/:folderName', requireAuth, async (req, res) => {
  const folderName = req.params.folderName
  const patientFolder = path.join(patientsDir, folderName)
  const infoPath = path.join(patientFolder, 'dental-chart-info.json')

  try {
    if (!fsSync.existsSync(infoPath)) return res.json([])
    const fileContent = await fs.readFile(infoPath, 'utf8')
    res.json(JSON.parse(fileContent))
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to load clinical information')
  }
})

// =====================================================
// APPOINTMENT ROUTES
// =====================================================

app.put('/appointments/:id/complete', requireAuth, async (req, res) => {
  const id = req.params.id
  const { folderName, completed } = req.body

  try {
    const patientFolder = path.join(patientsDir, folderName)
    const appointments = await readAppointments(patientFolder)
    const idx = appointments.findIndex(a => a._id === id)

    if (idx === -1) return res.status(404).send('Appointment not found')

    appointments[idx]._completed = completed
    appointments[idx]._completedAt = completed ? new Date().toISOString() : null

    await writeAppointments(patientFolder, appointments)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to update appointment')
  }
})

app.delete('/appointments/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  const { folderName } = req.query

  try {
    const patientFolder = path.join(patientsDir, folderName)
    let appointments = await readAppointments(patientFolder)
    const initialLength = appointments.length

    appointments = appointments.filter(a => a._id !== id)
    if (appointments.length === initialLength) return res.status(404).send('Appointment not found')

    await writeAppointments(patientFolder, appointments)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to delete appointment')
  }
})

app.put('/appointments/:id/reschedule', requireAuth, async (req, res) => {
  const id = req.params.id
  const { folderName, newDate, newTime, reason } = req.body

  try {
    const patientFolder = path.join(patientsDir, folderName)
    const appointments = await readAppointments(patientFolder)
    const idx = appointments.findIndex(a => a._id === id)

    if (idx === -1) return res.status(404).send('Appointment not found')

    appointments[idx]._rescheduledFrom = appointments[idx]._submittedAt
    appointments[idx]._rescheduledDate = newDate
    appointments[idx]._rescheduledTime = newTime
    appointments[idx]._rescheduleReason = reason || ''
    appointments[idx]._rescheduledAt = new Date().toISOString()
    appointments[idx]._rescheduled = true

    const dateTimeStr = newTime ? `${newDate}T${newTime}:00` : `${newDate}T09:00:00`
    appointments[idx]._submittedAt = new Date(dateTimeStr).toISOString()

    await writeAppointments(patientFolder, appointments)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to reschedule appointment')
  }
})

// =====================================================
// TREATMENT RECORDS ROUTES
// =====================================================

app.get('/treatment-records/:folderName', requireAuth, async (req, res) => {
  const { folderName } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const recordsPath = path.join(patientFolder, 'treatment-records.json')

  try {
    if (!fsSync.existsSync(recordsPath)) return res.json([])
    const data = await fs.readFile(recordsPath, 'utf8')
    res.json(JSON.parse(data))
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to load treatment records')
  }
})

app.post('/treatment-records/:folderName', requireAuth, async (req, res) => {
  const { folderName } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const recordsPath = path.join(patientFolder, 'treatment-records.json')

  try {
    if (!fsSync.existsSync(patientFolder)) return res.status(404).send('Patient folder not found')

    const newRecord = {
      ...req.body,
      id: Date.now(),
      _timestamp: new Date().toISOString()
    }

    newRecord.billing = generateBillingFromRecord(newRecord, null)

    let records = []
    if (fsSync.existsSync(recordsPath)) {
      const data = await fs.readFile(recordsPath, 'utf8')
      records = JSON.parse(data)
    }

    records.push(newRecord)
    await fs.writeFile(recordsPath, JSON.stringify(records, null, 2), 'utf8')
    res.json({ ok: true, record: newRecord })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to save treatment record')
  }
})

app.put('/treatment-records/:folderName/:recordId', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const recordsPath = path.join(patientFolder, 'treatment-records.json')

  try {
    if (!fsSync.existsSync(recordsPath)) return res.status(404).send('No records found')

    const data = await fs.readFile(recordsPath, 'utf8')
    let records = JSON.parse(data)

    const index = records.findIndex(r => r.id === parseInt(recordId))
    if (index === -1) return res.status(404).send('Record not found')

    records[index] = {
      ...records[index],
      ...req.body,
      id: records[index].id,
      _timestamp: records[index]._timestamp,
      _updated: new Date().toISOString()
    }

    records[index].billing = generateBillingFromRecord(
      records[index],
      records[index].billing || null
    )

    await fs.writeFile(recordsPath, JSON.stringify(records, null, 2), 'utf8')
    res.json({ ok: true, record: records[index] })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to update treatment record')
  }
})

app.put('/treatment-records/:folderName/:recordId/complete', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const { completed } = req.body
  const patientFolder = path.join(patientsDir, folderName)
  const recordsPath = path.join(patientFolder, 'treatment-records.json')

  try {
    if (!fsSync.existsSync(recordsPath)) return res.status(404).send('No records found')

    const data = await fs.readFile(recordsPath, 'utf8')
    const records = JSON.parse(data)
    const idx = records.findIndex(r => r.id === parseInt(recordId))
    if (idx === -1) return res.status(404).send('Record not found')

    records[idx]._completed = completed
    records[idx]._completedAt = completed ? new Date().toISOString() : null

    await fs.writeFile(recordsPath, JSON.stringify(records, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to update record')
  }
})

app.put('/treatment-records/:folderName/:recordId/reschedule', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const { newDate } = req.body
  const patientFolder = path.join(patientsDir, folderName)
  const recordsPath = path.join(patientFolder, 'treatment-records.json')

  try {
    if (!newDate) return res.status(400).send('newDate is required')
    if (!fsSync.existsSync(recordsPath)) return res.status(404).send('No records found')

    const data = await fs.readFile(recordsPath, 'utf8')
    const records = JSON.parse(data)
    const idx = records.findIndex(r => r.id === parseInt(recordId))
    if (idx === -1) return res.status(404).send('Record not found')

    records[idx].date = newDate
    records[idx]._rescheduledAt = new Date().toISOString()
    records[idx]._completed = false
    records[idx]._completedAt = null

    await fs.writeFile(recordsPath, JSON.stringify(records, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to reschedule record')
  }
})

app.delete('/treatment-records/:folderName/:recordId', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const recordsPath = path.join(patientFolder, 'treatment-records.json')

  try {
    if (!fsSync.existsSync(recordsPath)) return res.status(404).send('No records found')

    const data = await fs.readFile(recordsPath, 'utf8')
    let records = JSON.parse(data)
    records = records.filter(r => r.id !== parseInt(recordId))

    await fs.writeFile(recordsPath, JSON.stringify(records, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to delete treatment record')
  }
})

app.get('/all-treatment-records', requireAuth, async (req, res) => {
  try {
    const patients = await getAllPatients()
    const allRecords = []

    for (const patient of patients) {
      const patientFolder = path.join(patientsDir, patient.folderName)
      const recordsPath = path.join(patientFolder, 'treatment-records.json')

      if (fsSync.existsSync(recordsPath)) {
        const data = await fs.readFile(recordsPath, 'utf8')
        const records = JSON.parse(data)

        records.forEach(record => {
          // Skip old-style TEMP_ folder records that may still exist on disk —
          // they are superseded by temp-patients.json
          if (record._isTemp && patient.folderName.startsWith('TEMP_')) return

          allRecords.push({
            ...record,
            _patientFolder: patient.folderName,
            _patientName: `${patient.lastName}, ${patient.firstName}`,
            _firstName: patient.firstName,
            _lastName: patient.lastName,
            _photoPath: patient.photoPath,
            _mobileNo: (patient.appointments[0] ? patient.appointments[0].mobileNo : '') || '',
            _email: (patient.appointments[0] ? patient.appointments[0].email : '') || ''
          })
        })
      }
    }

    // Merge temporary patients from the dedicated temp-patients.json file.
    // These appear on the calendar/schedule but NOT in the Patient List.
    const tempPatients = await readTempPatients()
    tempPatients.forEach(rec => {
      allRecords.push({
        ...rec,
        _isTemp: true,
        _patientFolder: null
      })
    })

    res.json(allRecords)
  } catch (err) {
    console.error('Error loading all treatment records:', err)
    res.status(500).json({ error: 'Failed to load treatment records' })
  }
})

// =====================================================
// PATIENT IMAGES ROUTES
// =====================================================

app.get('/patient-images/:folderName', requireAuth, async (req, res) => {
  try {
    const { folderName } = req.params
    const patientImagesFolder = path.join(patientsDir, folderName, 'images')
    const metadataPath = path.join(patientImagesFolder, 'metadata.json')

    if (!fsSync.existsSync(metadataPath)) return res.json([])

    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
    const imagesWithPaths = metadata.map(img => ({
      ...img,
      path: `/patients/${folderName}/images/${img.filename}`,
      thumbnailPath: img.thumbnailFilename
        ? `/patients/${folderName}/images/${img.thumbnailFilename}`
        : null
    }))

    res.json(imagesWithPaths)
  } catch (err) {
    console.error('Error loading patient images:', err)
    res.status(500).json({ error: 'Failed to load images' })
  }
})

app.post('/patient-images/:folderName', requireAuth, uploadPatientImage.single('image'), async (req, res) => {
  try {
    const { folderName } = req.params
    const { tag, notes, isBefore, pairedImageId } = req.body

    if (!req.file) return res.status(400).json({ error: 'No image file provided' })

    const patientImagesFolder = path.join(patientsDir, folderName, 'images')
    const metadataPath = path.join(patientImagesFolder, 'metadata.json')

    let metadata = []
    if (fsSync.existsSync(metadataPath)) {
      metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
    }

    const thumbnailFilename = `thumb_${req.file.filename}`
    const isBeforeBool = isBefore === 'true'

    const imageEntry = {
      id: makeId(),
      filename: req.file.filename,
      thumbnailFilename,
      tag: tag || 'other',
      notes: notes || '',
      isBefore: isBeforeBool,
      isAfter: tag === 'before-after' && !isBeforeBool,
      pairedImageId: pairedImageId || null,
      uploadedAt: new Date().toISOString()
    }

    const originalPath = path.join(patientImagesFolder, req.file.filename)
    const thumbnailPath = path.join(patientImagesFolder, thumbnailFilename)
    await fs.copyFile(originalPath, thumbnailPath)

    if (pairedImageId) {
      const pairedImage = metadata.find(img => img.id === pairedImageId)
      if (pairedImage) pairedImage.pairedImageId = imageEntry.id
    }

    metadata.push(imageEntry)
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8')

    res.json({
      ok: true,
      id: imageEntry.id,
      image: {
        ...imageEntry,
        path: `/patients/${folderName}/images/${imageEntry.filename}`,
        thumbnailPath: `/patients/${folderName}/images/${imageEntry.thumbnailFilename}`
      }
    })
  } catch (err) {
    console.error('Error uploading image:', err)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

app.delete('/patient-images/:folderName/:imageId', requireAuth, async (req, res) => {
  try {
    const { folderName, imageId } = req.params
    const patientImagesFolder = path.join(patientsDir, folderName, 'images')
    const metadataPath = path.join(patientImagesFolder, 'metadata.json')

    if (!fsSync.existsSync(metadataPath)) return res.status(404).json({ error: 'Image not found' })

    let metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
    const imageIndex = metadata.findIndex(img => img.id === imageId)

    if (imageIndex === -1) return res.status(404).json({ error: 'Image not found' })

    const image = metadata[imageIndex]
    const imagePath = path.join(patientImagesFolder, image.filename)
    const thumbnailPath = path.join(patientImagesFolder, image.thumbnailFilename)

    if (fsSync.existsSync(imagePath)) fsSync.unlinkSync(imagePath)
    if (fsSync.existsSync(thumbnailPath)) fsSync.unlinkSync(thumbnailPath)

    if (image.pairedImageId) {
      const pairedImage = metadata.find(img => img.id === image.pairedImageId)
      if (pairedImage) pairedImage.pairedImageId = null
    }

    metadata.splice(imageIndex, 1)
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting image:', err)
    res.status(500).json({ error: 'Failed to delete image' })
  }
})

app.put('/patient-images/:folderName/:imageId/notes', requireAuth, async (req, res) => {
  try {
    const { folderName, imageId } = req.params
    const { notes, pairedImageId } = req.body
    const patientImagesFolder = path.join(patientsDir, folderName, 'images')
    const metadataPath = path.join(patientImagesFolder, 'metadata.json')

    if (!fsSync.existsSync(metadataPath)) return res.status(404).json({ error: 'Image not found' })

    let metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
    const image = metadata.find(img => img.id === imageId)

    if (!image) return res.status(404).json({ error: 'Image not found' })

    image.notes = notes
    if (pairedImageId !== undefined) image.pairedImageId = pairedImageId

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (err) {
    console.error('Error updating image notes:', err)
    res.status(500).json({ error: 'Failed to update notes' })
  }
})

// =====================================================
// BACKUP ROUTES
// =====================================================

app.post('/backup', requireAuth, requireAdmin, async (req, res) => {
  try {
    const timeNow = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0]

    const patientsZipFilename = `patients-backup-${timeNow}.zip`
    const patientsZipPath = path.join(backupDir, patientsZipFilename)

    if (!fsSync.existsSync(patientsDir) || fsSync.readdirSync(patientsDir).length === 0) {
      return res.status(400).json({ ok: false, message: 'No patients to backup' })
    }

    await new Promise((resolve, reject) => {
      const output = fsSync.createWriteStream(patientsZipPath)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', () => resolve())
      archive.on('error', (err) => reject(err))
      archive.pipe(output)
      archive.directory(patientsDir, 'patients')
      archive.finalize()
    })

    res.json({
      ok: true,
      message: 'Backup created successfully',
      patientsBackup: patientsZipFilename
    })
  } catch (err) {
    console.error('Backup error:', err)
    res.status(500).json({ ok: false, message: 'Backup failed: ' + err.message })
  }
})

app.get('/download-backup/:filename', requireAuth, requireAdmin, async (req, res) => {
  const filename = req.params.filename
  const filePath = path.join(backupDir, filename)

  if (!filePath.startsWith(path.resolve(backupDir))) return res.status(403).send('Invalid filename')
  if (!fsSync.existsSync(filePath)) return res.status(404).send('Backup file not found')

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  fsSync.createReadStream(filePath).pipe(res)
})

app.get('/backups', requireAuth, requireAdmin, async (req, res) => {
  try {
    const files = await fs.readdir(backupDir)
    const backups = files
      .filter(f => f.endsWith('.zip'))
      .map(f => {
        const stat = fsSync.statSync(path.join(backupDir, f))
        return { filename: f, size: stat.size, created: stat.birthtime }
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created))
    res.json(backups)
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to list backups')
  }
})

// =====================================================
// DEBUG ROUTE
// =====================================================

app.get('/debug-patients', requireAuth, async (req, res) => {
  try {
    const folders = await fs.readdir(patientsDir)
    const debug = []

    for (const folder of folders) {
      const folderPath = path.join(patientsDir, folder)
      const stat = await fs.stat(folderPath)
      if (!stat.isDirectory()) continue

      const appointments = await readAppointments(folderPath)
      let patientData = null
      if (appointments.length > 0) {
        patientData = getPatientInfoFromAppointments(appointments)
      }

      debug.push({
        folderName: folder,
        hasAppointments: appointments.length > 0,
        appointmentCount: appointments.length,
        patientDataFromAppointments: patientData,
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
      patientsWithInfo: debug.filter(d => d.patientDataFromAppointments).length,
      debug
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// =====================================================
// EXPORT ALL RECORDS (PDF)
// =====================================================

app.get('/export-all-records/:patientFolder', requireAuth, async (req, res) => {
  const { patientFolder } = req.params

  try {
    const folderPath = path.join(patientsDir, patientFolder)
    if (!fsSync.existsSync(folderPath)) return res.status(404).send('Patient not found')

    const appointments = await readAppointments(folderPath)
    const patientInfo = getPatientInfoFromAppointments(appointments)
    if (!patientInfo) return res.status(404).send('Patient info not found - no appointments available')

    const recordsPath = path.join(folderPath, 'treatment-records.json')
    let treatmentRecords = []
    if (fsSync.existsSync(recordsPath)) {
      const content = await fs.readFile(recordsPath, 'utf8')
      treatmentRecords = JSON.parse(content)
    }

    const latest = appointments.length > 0 ? appointments[appointments.length - 1] : {}
    const clinicalData = await getLatestDentalChartInfo(folderPath)

    const toothStatusPath = path.join(folderPath, 'tooth-status.json')
    let toothStatus = {}
    let codeColors  = {}
    if (fsSync.existsSync(toothStatusPath)) {
      try {
        const raw = JSON.parse(fsSync.readFileSync(toothStatusPath, 'utf8'))
        codeColors  = raw.__codeColors || {}
        const statusOnly = Object.assign({}, raw); delete statusOnly.__codeColors
        toothStatus = statusOnly
      } catch (_err) { /* intentionally empty */ }
    }

    // Default colors matching the frontend defaults
    const CODE_DEFAULT_COLORS = {
      '/': '#059669',
      'X': '#dc2626', 'XO': '#dc2626', 'D': '#dc2626'
    }
    const getCodeColor = (code) => {
      if (codeColors[code]) return codeColors[code]
      if (CODE_DEFAULT_COLORS[code]) return CODE_DEFAULT_COLORS[code]
      return '#0b5ea8'  // default condition blue
    }

    // Convert #rrggbb hex to pdf-lib rgb(r,g,b) where values are 0-1
    const hexToRgb = (hex) => {
      const h = hex.replace('#', '')
      const r = parseInt(h.substring(0,2), 16) / 255
      const g = parseInt(h.substring(2,4), 16) / 255
      const b = parseInt(h.substring(4,6), 16) / 255
      return rgb(r, g, b)
    }

    const possiblePdfPaths = [
      path.join(__dirname, 'Dental Form.pdf'),
      path.join(__dirname, 'Files', 'Dental Form.pdf'),
      path.join(__dirname, 'templates', 'Dental Form.pdf'),
      path.join(filesDir, 'Dental Form.pdf')
    ]

    let formPdfPath = null
    for (const testPath of possiblePdfPaths) {
      if (fsSync.existsSync(testPath)) { formPdfPath = testPath; break }
    }

    let pdfDoc
    let bgPages = []

    if (formPdfPath) {
      try {
        const formPdfBytes = await fs.readFile(formPdfPath)
        const templatePdfDoc = await PDFDocument.load(formPdfBytes)
        pdfDoc = await PDFDocument.create()
        const templatePages = templatePdfDoc.getPages()
        for (let i = 0; i < templatePages.length; i++) {
          const [embeddedPage] = await pdfDoc.embedPdf(templatePdfDoc, [i])
          bgPages.push(embeddedPage)
        }
      } catch (err) {
        console.error('Error loading PDF template:', err.message)
        pdfDoc = await PDFDocument.create()
      }
    } else {
      pdfDoc = await PDFDocument.create()
    }

    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const formatDateMMDDYY = (dateStr) => {
      if (!dateStr) return { mm: '', dd: '', yy: '' }
      const d = new Date(dateStr)
      if (isNaN(d)) return { mm: '', dd: '', yy: '' }
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const yy = String(d.getFullYear()).slice(-2)
      return { mm, dd, yy }
    }

    const birthdate = formatDateMMDDYY(patientInfo.birthdate)
    const age = patientInfo.birthdate ? calculateAge(patientInfo.birthdate) : ''
    const sex = (latest.sex || '').toLowerCase()

    // ===== PAGE 1: PATIENT INFORMATION =====
    let page1
    if (bgPages.length > 0) {
      page1 = pdfDoc.addPage([595.28, 841.89])
      page1.drawPage(bgPages[0], { x: 0, y: 0, width: 595.28, height: 841.89 })
    } else {
      page1 = pdfDoc.addPage([595.28, 841.89])
    }
    const { height: h1 } = page1.getSize()

    page1.drawText(s(patientInfo.lastName), { x: 95, y: h1 - 165, size: 10, font: helv })
    page1.drawText(s(patientInfo.firstName), { x: 270, y: h1 - 165, size: 10, font: helv })
    page1.drawText(s(patientInfo.middleName), { x: 440, y: h1 - 165, size: 10, font: helv })
    page1.drawText(s(birthdate.mm), { x: 145, y: h1 - 188, size: 10, font: helv })
    page1.drawText(s(birthdate.dd), { x: 200, y: h1 - 188, size: 10, font: helv })
    page1.drawText(s(birthdate.yy), { x: 255, y: h1 - 188, size: 10, font: helv })
    page1.drawText(s(age), { x: 335, y: h1 - 188, size: 10, font: helv })
    page1.drawText(s(latest.religion), { x: 70, y: h1 - 200, size: 10, font: helv })
    page1.drawText(s(latest.nationality), { x: 280, y: h1 - 200, size: 10, font: helv })
    page1.drawText(String(latest.homeAddress || '').substring(0, 50), { x: 100, y: h1 - 212, size: 9, font: helv })
    page1.drawText(s(latest.occupation), { x: 85, y: h1 - 226, size: 10, font: helv })
    page1.drawText(s(latest.dentalInsurance), { x: 108, y: h1 - 237, size: 10, font: helv })
    const insDate = formatDateMMDDYY(latest.insuranceEffectiveDate)
    page1.drawText(s(`${insDate.mm || ''}/${insDate.dd || ''}/${insDate.yy || ''}`), { x: 100, y: h1 - 248, size: 9, font: helv })
    page1.drawText(s(latest.guardianName), { x: 145, y: h1 - 272, size: 10, font: helv })
    page1.drawText(s(latest.guardianOccupation), { x: 85, y: h1 - 284, size: 10, font: helv })
    page1.drawText(s(latest.referredBy), { x: 215, y: h1 - 295, size: 10, font: helv })
    page1.drawText(String(latest.reasonForConsult || '').substring(0, 45), { x: 240, y: h1 - 307, size: 9, font: helv })

    if (sex === 'male' || sex === 'm') {
      page1.drawText('Male', { x: 460, y: h1 - 196, size: 12, font: helvBold })
    } else if (sex === 'female' || sex === 'f') {
      page1.drawText('Female', { x: 460, y: h1 - 196, size: 12, font: helvBold })
    }

    page1.drawText(s(latest.nickname), { x: 465, y: h1 - 207, size: 10, font: helv })
    page1.drawText(s(latest.homeNo), { x: 464, y: h1 - 220, size: 10, font: helv })
    page1.drawText(s(latest.officeNo), { x: 464, y: h1 - 232, size: 10, font: helv })
    page1.drawText(s(latest.faxNo), { x: 454, y: h1 - 244, size: 10, font: helv })
    page1.drawText(s(latest.mobileNo), { x: 487, y: h1 - 255, size: 10, font: helv })
    page1.drawText(s(latest.email), { x: 465, y: h1 - 267, size: 9, font: helv })
    page1.drawText(s(latest.previousDentist), { x: 125, y: h1 - 341, size: 10, font: helv })
    page1.drawText(s(latest.lastDentalVisit), { x: 106, y: h1 - 353, size: 10, font: helv })
    page1.drawText(s(latest.physicianName), { x: 129, y: h1 - 382, size: 10, font: helv })
    page1.drawText(s(latest.physicianSpecialty), { x: 420, y: h1 - 382, size: 10, font: helv })
    page1.drawText(String(latest.physicianOfficeAddress || '').substring(0, 35), { x: 120, y: h1 - 395, size: 9, font: helv })
    page1.drawText(s(latest.physicianContact), { x: 380, y: h1 - 395, size: 10, font: helv })

    const yesNoFields = [
      ['q1_goodHealth', h1 - 411], ['q2_underTreatment', h1 - 422],
      ['q3_seriousIllness', h1 - 445], ['q4_hospitalized', h1 - 470],
      ['q5_takingMed', h1 - 494], ['q6_tobacco', h1 - 520], ['q7_drugs', h1 - 543]
    ]
    yesNoFields.forEach(([key, y]) => {
      const val = (latest[key] || '').toLowerCase()
      if (val === 'yes') page1.drawText('(    )', { x: 419, y, size: 12, font: helvBold })
      else if (val === 'no') page1.drawText('(   )', { x: 450, y, size: 12, font: helvBold })
    })

    page1.drawText(String(latest.q2_conditionBeingTreated || '').substring(0, 30), { x: 256, y: h1 - 434, size: 9, font: helv })
    page1.drawText(String(latest.q3_illnessOperation || '').substring(0, 30), { x: 218, y: h1 - 457.5, size: 9, font: helv })
    page1.drawText(String(latest.q4_whenWhy || '').substring(0, 35), { x: 180, y: h1 - 482, size: 9, font: helv })
    page1.drawText(String(latest.q5_whatMedications || '').substring(0, 35), { x: 180, y: h1 - 506, size: 9, font: helv })

    const allergies = latest.allergies || []
    if (allergies.includes('Local Anesthetic (ex. Lidocaine)')) page1.drawText('X', { x: 61, y: h1 - 555, size: 12, font: helv })
    if (allergies.includes('Penicillin / Antibiotics')) page1.drawText('X', { x: 237, y: h1 - 555, size: 12, font: helv })
    if (allergies.includes('Sulfa drugs')) page1.drawText('X', { x: 62, y: h1 - 567, size: 12, font: helv })
    if (allergies.includes('Aspirin')) page1.drawText('X', { x: 165, y: h1 - 567, size: 12, font: helv })
    if (allergies.includes('Latex')) page1.drawText('X', { x: 262, y: h1 - 567, size: 12, font: helv })
    page1.drawText(String(latest.allergies_other || '').substring(0, 15), { x: 390, y: h1 - 567, size: 9, font: helv })
    page1.drawText(s(latest.q9_bleedingTime), { x: 130, y: h1 - 580, size: 10, font: helv })

    ;[['q10_pregnant', h1 - 589], ['q10_nursing', h1 - 603], ['q10_birthControl', h1 - 614]].forEach(([key, y]) => {
      const val = (latest[key] || '').toLowerCase()
      if (val === 'yes') page1.drawText('(    )', { x: 419, y, size: 12, font: helvBold })
      else if (val === 'no') page1.drawText('(   )', { x: 452, y, size: 12, font: helvBold })
    })

    page1.drawText(s(latest.bloodType), { x: 100, y: h1 - 625, size: 10, font: helv })
    page1.drawText(s(latest.bloodPressure), { x: 120, y: h1 - 637, size: 10, font: helv })

    const conditions = latest.conditions || []
    const conditionMap = {
      'High Blood Pressure': [57, h1 - 669], 'Low Blood Pressure': [57, h1 - 681],
      'Seizure / Epilepsy': [57, h1 - 693], 'AIDS or HIV Infection': [57, h1 - 705],
      'Sexually Transmitted disease': [57, h1 - 717], 'Stomach troubles / Ulcers': [57, h1 - 729],
      'Fainting / Syncope': [57, h1 - 741], 'Rapid weight Loss': [57, h1 - 753],
      'Radiation Therapy': [57, h1 - 765], 'Joint Replacement / Implant': [57, h1 - 777],
      'Heart Surgery': [57, h1 - 789], 'Heart Attack': [57, h1 - 801], 'Thyroid Problem': [57, h1 - 813],
      'Heart Disease': [237, h1 - 669], 'Heart Murmur': [237, h1 - 681],
      'Hepatitis / Liver Disease': [237, h1 - 693], 'Rheumatic Fever': [237, h1 - 705],
      'Hay Fever / Allergies': [237, h1 - 717], 'Respiratory Problems': [237, h1 - 729],
      'Hepatitis / Jaundice': [237, h1 - 741], 'Tuberculosis': [237, h1 - 753],
      'Swollen ankles': [237, h1 - 765], 'Kidney disease': [237, h1 - 777],
      'Diabetes': [237, h1 - 789], 'Chest pain': [237, h1 - 801], 'Stroke': [237, h1 - 813],
      'Cancer / Tumors': [417, h1 - 669], 'Angina': [417, h1 - 681],
      'Anemia': [417, h1 - 693], 'Bleeding Problems': [417, h1 - 705],
      'Blood Diseases': [417, h1 - 717], 'Asthma': [417, h1 - 729],
      'Emphysema': [417, h1 - 741], 'Head Injuries': [417, h1 - 753],
      'Arthritis / Rheumatism': [417, h1 - 765],
    }
    conditions.forEach(condition => {
      const pos = conditionMap[condition]
      if (pos) page1.drawText('X', { x: pos[0], y: pos[1], size: 12, font: helvBold })
    })
    page1.drawText(String(latest.conditions_other || '').substring(0, 25), { x: 465, y: h1 - 777, size: 9, font: helv })
    page1.drawText(s(latest.signature), { x: 450, y: h1 - 801, size: 10, font: helv })
    const formDate = formatDateMMDDYY(latest.formDate)
    page1.drawText(s(`${formDate.mm || ''}/${formDate.dd || ''}/${formDate.yy || ''}`), { x: 450, y: h1 - 789, size: 10, font: helv })

    // ===== PATIENT PHOTO ON PAGE 1 =====
    try {
      const photoExtensions = ['.jpg', '.jpeg', '.png']
      let photoFile = null
      for (const ext of photoExtensions) {
        const testPath = path.join(folderPath, `photo${ext}`)
        if (fsSync.existsSync(testPath)) { photoFile = testPath; break }
      }

      if (photoFile) {
        const photoBytes = fsSync.readFileSync(photoFile)
        let embeddedPhoto = null

        if (photoFile.endsWith('.png')) {
          try { embeddedPhoto = await pdfDoc.embedPng(photoBytes) } catch (e) {
            try { embeddedPhoto = await pdfDoc.embedJpg(photoBytes) } catch (_err) { /* intentionally empty */ }
          }
        } else {
          try { embeddedPhoto = await pdfDoc.embedJpg(photoBytes) } catch (e) {
            try { embeddedPhoto = await pdfDoc.embedPng(photoBytes) } catch (_err) { /* intentionally empty */ }
          }
        }

        if (embeddedPhoto) {
          const photoWidth = 60, photoHeight = 60, photoX = 450, photoY = h1 - 125
          page1.drawImage(embeddedPhoto, { x: photoX, y: photoY, width: photoWidth, height: photoHeight })
          page1.drawRectangle({
            x: photoX - 2, y: photoY - 2,
            width: photoWidth + 4, height: photoHeight + 4,
            borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1
          })
        }
      }
    } catch (photoErr) {
      console.error('Error adding patient photo to PDF:', photoErr.message)
    }

    // ===== PAGE 2: CONSENT =====
    let page2
    if (bgPages.length > 1) {
      page2 = pdfDoc.addPage([595.28, 841.89])
      page2.drawPage(bgPages[1], { x: 0, y: 0, width: 595.28, height: 841.89 })
    } else {
      page2 = pdfDoc.addPage([595.28, 841.89])
    }
    const { height: h2 } = page2.getSize()

    const consentFields = [
      { key: 'consent_treatment', x: 373, y: h2 - 153 },
      { key: 'consent_drugs', x: 275, y: h2 - 179 },
      { key: 'consent_changes', x: 162, y: h2 - 229 },
      { key: 'consent_xray', x: 105, y: h2 - 278 },
      { key: 'consent_extraction', x: 362, y: h2 - 347 },
      { key: 'consent_crowns', x: 263, y: h2 - 438 },
      { key: 'consent_rootcanal', x: 345, y: h2 - 508 },
      { key: 'consent_periodontal', x: 162, y: h2 - 558 },
      { key: 'consent_fillings', x: 522, y: h2 - 605 },
      { key: 'consent_dentures', x: 177, y: h2 - 675 }
    ]
    consentFields.forEach(field => {
      const value = latest[field.key]
      if (value && String(value).trim()) {
        page2.drawText(String(value), { x: field.x, y: field.y, size: 10, font: helvBold })
      }
    })
    page2.drawText(s(latest.consentSignature), { x: 180, y: h2 - 723, size: 10, font: helv })
    const consentDate = formatDateMMDDYY(latest.consentSignedDate)
    page2.drawText(s(`${consentDate.mm || ''}/${consentDate.dd || ''}/${consentDate.yy || ''}`), { x: 450, y: h2 - 723, size: 10, font: helv })

    // ===== PAGE 3: DENTAL CHART =====
    let page3
    if (bgPages.length > 2) {
      page3 = pdfDoc.addPage([595.28, 841.89])
      page3.drawPage(bgPages[2], { x: 0, y: 0, width: 595.28, height: 841.89 })
    } else {
      page3 = pdfDoc.addPage([595.28, 841.89])
    }
    const { height: h3 } = page3.getSize()

    page3.drawText(s(patientInfo.lastName) + ' ' + s(patientInfo.firstName) + ' ' + s(patientInfo.middleName), { x: 300, y: h3 - 170, size: 14, font: helvBold })
    page3.drawText(s(age), { x: 300, y: h3 - 188, size: 14, font: helv })
    if (sex === 'male' || sex === 'm') {
      page3.drawText('M', { x: 430, y: h3 - 188, size: 14, font: helvBold })
    } else if (sex === 'female' || sex === 'f') {
      page3.drawText('F', { x: 430, y: h3 - 188, size: 14, font: helvBold })
    }

    {
      const rawDate = latest.formDate || latest._submittedAt || latest._receivedAt || null
      if (rawDate) {
        const fd = new Date(rawDate)
        const fdStr = !isNaN(fd)
          ? fd.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
          : String(rawDate).slice(0, 10)
        page3.drawText(fdStr, { x: 505, y: h3 - 188, size: 10, font: helvBold})
      }
    }

    let baseToothEmbedded = null
    const baseImgPath = path.join(teethBaseDir, 'teeth_base.jpg')
    if (fsSync.existsSync(baseImgPath)) {
      try { baseToothEmbedded = await pdfDoc.embedJpg(fsSync.readFileSync(baseImgPath)) } catch (_err) { /* intentionally empty */ }
    }

    const allToothNums3 = [
      11,12,13,14,15,16,17,18,
      21,22,23,24,25,26,27,28,
      31,32,33,34,35,36,37,38,
      41,42,43,44,45,46,47,48,
      51,52,53,54,55,
      61,62,63,64,65,
      71,72,73,74,75,
      81,82,83,84,85
    ]
    const toothImgMap3 = new Map()
    for (const tNum of allToothNums3) {
      const tPath = path.join(folderPath, `tooth_${tNum}.jpg`)
      if (fsSync.existsSync(tPath)) {
        try { toothImgMap3.set(tNum, await pdfDoc.embedJpg(fsSync.readFileSync(tPath))) }
        catch (e) { if (baseToothEmbedded) toothImgMap3.set(tNum, baseToothEmbedded) }
      } else if (baseToothEmbedded) {
        toothImgMap3.set(tNum, baseToothEmbedded)
      }
    }

    const TOOTH_SCALE = 0.85
    const BOX_W3 = 22 * TOOTH_SCALE
    const BOX_H3 = 9  * TOOTH_SCALE
    const GAP3   = 1  * TOOTH_SCALE
    const IMG_H3 = 20 * TOOTH_SCALE

    const drawToothCell3 = (x, y, toothNum, statusOnTop = false) => {
      const safePdfTextLocal = (str) => {
        if (!str) return ''
        return String(str)
          .replace(/[\u2713\u2714\u2611\u2705\u2714]/g, 'P')
          .replace(/[^\x20-\x7E]/g, '?')
      }

      const status  = toothStatus[String(toothNum)] || toothStatus[toothNum] || { top: null, bottom: null }
      const topCode = safePdfTextLocal(status.top   || '')
      const botCode = safePdfTextLocal(status.bottom || '')
      const img = toothImgMap3.get(toothNum)

      if (statusOnTop) {
        const imgY    = y
        const botBoxY = y + IMG_H3 + GAP3
        const topBoxY = y + IMG_H3 + GAP3 + BOX_H3 + GAP3

        if (img) {
          page3.drawImage(img, { x: x + 1, y: imgY, width: BOX_W3, height: IMG_H3 })
        } else {
          page3.drawRectangle({
            x: x + 1, y: imgY, width: BOX_W3, height: IMG_H3,
            color: rgb(0.96, 0.96, 0.96), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0
          })
        }
        if (botCode) page3.drawText(botCode, { x: x + 4.5, y: botBoxY + 18, size: 8, font: helvBold, color: hexToRgb(getCodeColor(botCode)) })
        if (topCode) page3.drawText(topCode, { x: x + 4.5, y: topBoxY + 25, size: 8, font: helvBold, color: hexToRgb(getCodeColor(topCode)) })

      } else {
        const botBoxY = y
        const topBoxY = y + BOX_H3 + GAP3
        const imgY    = y + BOX_H3 * 2 + GAP3 * 2

        if (img) {
          page3.drawImage(img, { x: x + 1, y: imgY, width: BOX_W3, height: IMG_H3 })
        } else {
          page3.drawRectangle({
            x: x + 1, y: imgY, width: BOX_W3, height: IMG_H3,
            color: rgb(0.96, 0.96, 0.96), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.4
          })
        }
        if (topCode) page3.drawText(topCode, { x: x + 4.5, y: topBoxY - 15, size: 8, font: helvBold, color: hexToRgb(getCodeColor(topCode)) })
        if (botCode) page3.drawText(botCode, { x: x + 4.5, y: botBoxY - 22, size: 8, font: helvBold, color: hexToRgb(getCodeColor(botCode)) })
      }
    }

    // Row 1: Deciduous Upper
    drawToothCell3(220.2, h3 - 283, 55, true); drawToothCell3(239.7, h3 - 283, 54, true)
    drawToothCell3(259.9, h3 - 283, 53, true); drawToothCell3(278.9, h3 - 283, 52, true)
    drawToothCell3(296.7, h3 - 283, 51, true); drawToothCell3(321.5, h3 - 283, 61, true)
    drawToothCell3(340.7, h3 - 283, 62, true); drawToothCell3(359.2, h3 - 283, 63, true)
    drawToothCell3(377.7, h3 - 283, 64, true); drawToothCell3(397.2, h3 - 283, 65, true)

    // Row 2: Adult Upper
    drawToothCell3(163.5, h3 - 356, 18, true); drawToothCell3(181.5, h3 - 356, 17, true)
    drawToothCell3(200.7, h3 - 356, 16, true); drawToothCell3(220.2, h3 - 356, 15, true)
    drawToothCell3(239.7, h3 - 356, 14, true); drawToothCell3(259.9, h3 - 356, 13, true)
    drawToothCell3(278.9, h3 - 356, 12, true); drawToothCell3(296.7, h3 - 356, 11, true)
    drawToothCell3(321.5, h3 - 356, 21, true); drawToothCell3(340.7, h3 - 356, 22, true)
    drawToothCell3(359.2, h3 - 356, 23, true); drawToothCell3(377.7, h3 - 356, 24, true)
    drawToothCell3(397.2, h3 - 356, 25, true); drawToothCell3(415.5, h3 - 356, 26, true)
    drawToothCell3(435.5, h3 - 356, 27, true); drawToothCell3(454.5, h3 - 356, 28, true)

    // Row 3: Adult Lower
    drawToothCell3(163.5, h3 - 410, 48); drawToothCell3(181.5, h3 - 410, 47)
    drawToothCell3(200.7, h3 - 410, 46); drawToothCell3(220.2, h3 - 410, 45)
    drawToothCell3(239.7, h3 - 410, 44); drawToothCell3(259.9, h3 - 410, 43)
    drawToothCell3(278.9, h3 - 410, 42); drawToothCell3(296.7, h3 - 410, 41)
    drawToothCell3(321.5, h3 - 410, 31); drawToothCell3(340.7, h3 - 410, 32)
    drawToothCell3(359.2, h3 - 410, 33); drawToothCell3(377.7, h3 - 410, 34)
    drawToothCell3(397.2, h3 - 410, 35); drawToothCell3(415.5, h3 - 410, 36)
    drawToothCell3(435.5, h3 - 410, 37); drawToothCell3(454.5, h3 - 410, 38)

    // Row 4: Deciduous Lower
    drawToothCell3(220.2, h3 - 484, 85); drawToothCell3(239.7, h3 - 484, 84)
    drawToothCell3(259.9, h3 - 484, 83); drawToothCell3(278.9, h3 - 484, 82)
    drawToothCell3(296.7, h3 - 484, 81); drawToothCell3(321.5, h3 - 484, 71)
    drawToothCell3(340.7, h3 - 484, 72); drawToothCell3(359.2, h3 - 484, 73)
    drawToothCell3(377.7, h3 - 484, 74); drawToothCell3(397.2, h3 - 484, 75)

    // ===== COLOR-CODED LEGEND =====
    {
      const ALL_CODES = [
        { code: '/',   label: 'Present',              defaultColor: '#059669' },
        { code: 'M',   label: 'Missing (Caries)',      defaultColor: '#0b5ea8' },
        { code: 'MO',  label: 'Missing (Other)',       defaultColor: '#0b5ea8' },
        { code: 'Im',  label: 'Impacted',              defaultColor: '#0b5ea8' },
        { code: 'Sp',  label: 'Supernumerary',         defaultColor: '#0b5ea8' },
        { code: 'Rf',  label: 'Root Fragment',         defaultColor: '#0b5ea8' },
        { code: 'Un',  label: 'Unerupted',             defaultColor: '#0b5ea8' },
        { code: 'Am',  label: 'Amalgam Filling',       defaultColor: '#0b5ea8' },
        { code: 'Co',  label: 'Composite Filling',     defaultColor: '#0b5ea8' },
        { code: 'Jc',  label: 'Jacket Crown',          defaultColor: '#0b5ea8' },
        { code: 'Ab',  label: 'Abutment',              defaultColor: '#0b5ea8' },
        { code: 'P',   label: 'Pontic',                defaultColor: '#0b5ea8' },
        { code: 'In',  label: 'Inlay',                 defaultColor: '#0b5ea8' },
        { code: 'Imp', label: 'Implant',               defaultColor: '#0b5ea8' },
        { code: 'S',   label: 'Sealants',              defaultColor: '#0b5ea8' },
        { code: 'Rm',  label: 'Removable Denture',     defaultColor: '#0b5ea8' },
        { code: 'X',   label: 'Extraction (Caries)',   defaultColor: '#dc2626' },
        { code: 'XO',  label: 'Extraction (Other)',    defaultColor: '#dc2626' },
        { code: 'D',   label: 'Decayed',               defaultColor: '#dc2626' },
      ]

      const legendBaseY = h3 - 497
      const legendX = 40
      const legendW = 515
      const rowH = 14
      const itemsPerRow = 10
      const colW = legendW / itemsPerRow
      const rows = Math.ceil(ALL_CODES.length / itemsPerRow)
      const boxH = rows * rowH + 18

      // Background box
      page3.drawRectangle({
        x: legendX, y: legendBaseY - boxH + 12, width: legendW, height: boxH,
        color: rgb(0.97, 0.98, 1), borderColor: rgb(0.78, 0.86, 0.95), borderWidth: 0.7
      })

      // Header line
      page3.drawText('DENTAL CODE LEGEND', {
        x: legendX + 4, y: legendBaseY, size: 7, font: helvBold, color: rgb(0.25, 0.35, 0.55)
      })
      page3.drawText('Top Box = Condition/Restoration   |   Bottom Box = Surgery', {
        x: legendX + 116, y: legendBaseY, size: 6.5, font: helv, color: rgb(0.42, 0.50, 0.62)
      })

      ALL_CODES.forEach((item, i) => {
        const col = i % itemsPerRow
        const row = Math.floor(i / itemsPerRow)
        const ix = legendX + col * colW + 2
        const iy = legendBaseY - 11 - row * rowH

        const itemColor = codeColors[item.code]
          ? hexToRgb(codeColors[item.code])
          : hexToRgb(item.defaultColor)

        page3.drawText(item.code, {
          x: ix, y: iy, size: 7, font: helvBold, color: itemColor
        })
        page3.drawText(item.label, {
          x: ix, y: iy - 7, size: 5, font: helv, color: rgb(0.35, 0.40, 0.50)
        })
      })
    }

    // Clinical data checkboxes
    if (clinicalData) {
      drawCheckbox(page3, 40, h3 - 701, (clinicalData.periodontalScreening || []).includes('Gingivitis'), helv)
      drawCheckbox(page3, 40, h3 - 712, (clinicalData.periodontalScreening || []).includes('Early Periodontitis'), helv)
      drawCheckbox(page3, 40, h3 - 724, (clinicalData.periodontalScreening || []).includes('Moderate Periodontitis'), helv)
      drawCheckbox(page3, 40, h3 - 736, (clinicalData.periodontalScreening || []).includes('Advanced Periodontitis'), helv)

      drawCheckbox(page3, 210, h3 - 701, (clinicalData.occlusion || []).includes('Class (Molar)'), helv)
      drawCheckbox(page3, 210, h3 - 712, (clinicalData.occlusion || []).includes('Overjet'), helv)
      drawCheckbox(page3, 210, h3 - 724, (clinicalData.occlusion || []).includes('Overbite'), helv)
      drawCheckbox(page3, 210, h3 - 736, (clinicalData.occlusion || []).includes('Midline Deviation'), helv)
      drawCheckbox(page3, 210, h3 - 748, (clinicalData.occlusion || []).includes('Crossbite'), helv)

      drawCheckbox(page3, 340, h3 - 701, (clinicalData.appliances || []).includes('Orthodontic'), helv)
      drawCheckbox(page3, 340, h3 - 712, (clinicalData.appliances || []).includes('Stayplate'), helv)
      drawCheckbox(page3, 340, h3 - 724, (clinicalData.appliances || []).includes('Other'), helv)

      {
        const appOtherVal = clinicalData.appliancesOther || clinicalData.appliances_other || ''
        if (appOtherVal) {
          page3.drawRectangle({ x: 350, y: h3 - 728, width: 115, height: 12, color: rgb(1, 1, 1) })
          page3.drawText('Other: ' + String(appOtherVal).substring(0, 18), {
            x: 352, y: h3 - 724, size: 9, font: helvBold
          })
        }
      }

      drawCheckbox(page3, 470, h3 - 701, (clinicalData.tmd || []).includes('Clenching'), helv)
      drawCheckbox(page3, 470, h3 - 712, (clinicalData.tmd || []).includes('Clicking'), helv)
      drawCheckbox(page3, 470, h3 - 724, (clinicalData.tmd || []).includes('Trismus'), helv)
      drawCheckbox(page3, 470, h3 - 736, (clinicalData.tmd || []).includes('Muscle Spasm'), helv)

      drawCheckbox(page3, 410, h3 - 601, (clinicalData.xrayTaken || []).includes('Periapical'), helv)
      drawCheckbox(page3, 410, h3 - 612, (clinicalData.xrayTaken || []).includes('Panoramic'), helv)
      drawCheckbox(page3, 410, h3 - 623, (clinicalData.xrayTaken || []).includes('Cephalometric'), helv)
      drawCheckbox(page3, 410, h3 - 634, (clinicalData.xrayTaken || []).includes('Occlusal (Upper/Lower)'), helv)

      if (clinicalData.periapicalTeethNo) {
        page3.drawText(String(clinicalData.periapicalTeethNo), { x: 495, y: h3 - 601, size: 9, font: helv })
      }
      if ((clinicalData.xrayTaken || []).includes('Others')) {
        drawCheckbox(page3, 410, h3 - 645, true, helv)
        const othersText = clinicalData.xrayTaken_other ? `${clinicalData.xrayTaken_other}` : 'Others'
        page3.drawText(othersText, { x: 465, y: h3 - 645, size: 9, font: helv })
      }
    }

    // ===== PAGE 4: TREATMENT RECORDS =====
    let page4
    if (bgPages.length > 3) {
      page4 = pdfDoc.addPage([595.28, 841.89])
      page4.drawPage(bgPages[3], { x: 0, y: 0, width: 595.28, height: 841.89 })
    } else {
      page4 = pdfDoc.addPage([595.28, 841.89])
    }
    const { height: h4 } = page4.getSize()

    if (treatmentRecords.length > 0) {
      const colX4  = [12, 76, 124, 290, 367, 427, 487, 543]
      const ROW_H4 = 17
      const TXT_SZ4 = 9
      const TXT_OFF = 0
      let yPos4 = h4 - 158

      page4.drawText(s(patientInfo.lastName) + ' ' + s(patientInfo.firstName) + ' ' + s(patientInfo.middleName), { x: 70, y: h4 - 62, size: 14, font: helvBold })
      page4.drawText(s(age), { x: 370, y: h4 - 62, size: 14, font: helv })
      if (sex === 'male' || sex === 'm') {
        page4.drawText('Male', { x: 530, y: h4 - 62, size: 14, font: helvBold })
      } else if (sex === 'female' || sex === 'f') {
        page4.drawText('Female', { x: 530, y: h4 - 62, size: 14, font: helvBold })
      }

      treatmentRecords.sort((a, b) => new Date(b.date || b._timestamp) - new Date(a.date || a._timestamp))

      for (const r of treatmentRecords) {
        if (yPos4 < 60) {
          page4 = pdfDoc.addPage([595.28, 841.89])
          yPos4 = h4 - 50
        }

        const charged = parseFloat(r.amountChanged)
        const paid    = parseFloat(r.amountPaid)
        const balanceStr = (!isNaN(charged) && !isNaN(paid))
          ? String((charged - paid).toFixed(2).replace(/\.00$/, ''))
          : '-'

        const ty = yPos4 + TXT_OFF

        page4.drawText(r.date ? new Date(r.date).toLocaleDateString() : 'N/A', { x: colX4[0], y: ty, size: TXT_SZ4, font: helv })
        page4.drawText(String(r.ToothNo || '-'), { x: colX4[1], y: ty, size: TXT_SZ4, font: helv })
        page4.drawText(String(r.procedure || '-').substring(0, 20), { x: colX4[2], y: ty, size: TXT_SZ4, font: helv })
        page4.drawText(CLINIC_DENTIST_NAME, { x: colX4[3], y: ty, size: TXT_SZ4, font: helv })
        page4.drawText(isNaN(charged) ? '-' : String(r.amountChanged), { x: colX4[4], y: ty, size: TXT_SZ4, font: helv })
        page4.drawText(isNaN(paid) ? '-' : String(r.amountPaid), { x: colX4[5], y: ty, size: TXT_SZ4, font: helv })
        page4.drawText(balanceStr, { x: colX4[6], y: ty, size: TXT_SZ4, font: helv })
        page4.drawText(r.nextApps ? new Date(r.nextApps).toLocaleDateString() : '-', { x: colX4[7], y: ty, size: TXT_SZ4, font: helv })

        yPos4 -= ROW_H4
      }
    }

    const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1]
    lastPage.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: 50, y: 30, size: 8, font: helv, color: rgb(0.5, 0.5, 0.5)
    })

    const pdfBytes = await pdfDoc.save()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="CompleteRecords_${patientInfo.lastName}-${patientInfo.firstName}.pdf"`)
    res.send(Buffer.from(pdfBytes))

    console.log(` Exported complete records for ${patientInfo.lastName}, ${patientInfo.firstName}`)
  } catch (err) {
    console.error(' export-all-records error:', err)
    res.status(500).send(`Failed to export complete records: ${err.message}`)
  }
})

// =====================================================
// TEMPORARY PATIENT ROUTE
// =====================================================

// Path to the standalone temporary-patients JSON file (never mixed with real patient folders)
const tempPatientsFile = path.join(__dirname, 'temp-patients.json')

async function readTempPatients() {
  if (!fsSync.existsSync(tempPatientsFile)) return []
  try {
    const raw = await fs.readFile(tempPatientsFile, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function writeTempPatients(list) {
  await fs.writeFile(tempPatientsFile, JSON.stringify(list, null, 2), 'utf8')
}

// POST /temp-patient — add a new temporary (walk-in / unregistered) patient to the schedule.
// Data is stored ONLY in temp-patients.json and never appears in the Patient List.
app.post('/temp-patient', requireAuth, async (req, res) => {
  try {
    const { fullName, mobileNo, date, appointmentTime, procedure, amountChanged, denticals } = req.body

    if (!fullName || !fullName.trim()) return res.status(400).send('Full name is required')
    if (!date) return res.status(400).send('Date is required')

    const newRecord = {
      id: `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      _timestamp: new Date().toISOString(),
      date: date,
      appointmentTime: appointmentTime || '',
      procedure: procedure || 'Walk-in',
      amountChanged: parseFloat(amountChanged) || 0,
      amountPaid: 0,
      denticals: denticals || '',
      _isTemp: true,
      _completed: false,
      _patientName: fullName.trim(),
      _firstName: fullName.trim().split(' ')[0],
      _lastName: fullName.trim().split(' ').slice(1).join(' ') || '',
      _mobileNo: mobileNo || '',
      _patientFolder: null   // no folder — temp only
    }

    const list = await readTempPatients()
    list.push(newRecord)
    await writeTempPatients(list)

    console.log(` Temporary patient added: ${fullName.trim()} on ${date}`)
    res.json({ ok: true, record: newRecord })
  } catch (err) {
    console.error('Temp patient error:', err)
    res.status(500).send('Failed to create temporary patient')
  }
})

// GET /temp-patients — return all temporary patient records
app.get('/temp-patients', requireAuth, async (req, res) => {
  try {
    const list = await readTempPatients()
    res.json(list)
  } catch (err) {
    console.error('Error reading temp patients:', err)
    res.status(500).json({ error: 'Failed to read temporary patients' })
  }
})

// DELETE /temp-patient/:id — remove a temporary patient entry
app.delete('/temp-patient/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    let list = await readTempPatients()
    const before = list.length
    list = list.filter(r => r.id !== id)
    if (list.length === before) return res.status(404).send('Temp patient not found')
    await writeTempPatients(list)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error deleting temp patient:', err)
    res.status(500).send('Failed to delete temporary patient')
  }
})

// PATCH /temp-patient/:id/complete — mark a temporary patient appointment as done
app.patch('/temp-patient/:id/complete', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const list = await readTempPatients()
    const idx = list.findIndex(r => r.id === id)
    if (idx === -1) return res.status(404).send('Temp patient not found')
    list[idx]._completed = !list[idx]._completed
    await writeTempPatients(list)
    res.json({ ok: true, record: list[idx] })
  } catch (err) {
    console.error('Error updating temp patient:', err)
    res.status(500).send('Failed to update temporary patient')
  }
})

// BILLING ROUTES
// =====================================================

app.get('/patients-list', requireAuth, async (req, res) => {
  try {
    const patients = await getAllPatients()
    const list = patients.map(p => ({
      folderName: p.folderName,
      displayName: `${p.lastName}, ${p.firstName}${p.middleName ? ' ' + p.middleName : ''}`
    }))
    list.sort((a, b) => a.displayName.localeCompare(b.displayName))
    res.json(list)
  } catch (err) {
    console.error('patients-list error:', err)
    res.status(500).json({ error: 'Failed' })
  }
})

app.get('/financial-summary', requireAuth, async (req, res) => {
  try {
    const folders = await fs.readdir(patientsDir)
    const today = new Date()
    const todayKey  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    const monthKey  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

    let dailyRevenue   = 0
    let monthlyRevenue = 0
    let totalRevenue   = 0
    let totalExpenses  = 0

    for (const folder of folders) {
      const folderPath   = path.join(patientsDir, folder)
      const stat = await fs.stat(folderPath).catch(() => null)
      if (!stat || !stat.isDirectory()) continue

      const recordsPath = path.join(folderPath, 'treatment-records.json')
      if (!fsSync.existsSync(recordsPath)) continue

      const data    = await fs.readFile(recordsPath, 'utf8')
      const records = JSON.parse(data)

      for (const rec of records) {
        const billing = rec.billing
        if (!billing) continue

        totalExpenses += parseFloat(billing.expenses) || 0

        if (billing.paymentStatus !== 'paid') continue

        const amount = parseFloat(billing.totalAmount) || 0
        totalRevenue += amount

        const payDate = billing.paymentDate || rec.date || rec._timestamp
        if (payDate) {
          const d = new Date(payDate)
          const dKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          const mKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
          if (dKey === todayKey)  dailyRevenue   += amount
          if (mKey === monthKey)  monthlyRevenue += amount
        }
      }
    }

    const totalNetProfit = totalRevenue - totalExpenses

    res.json({
      dailyRevenue,
      monthlyRevenue,
      totalRevenue,
      totalExpenses,
      totalNetProfit
    })
  } catch (err) {
    console.error(' /financial-summary error:', err)
    res.status(500).json({ error: 'Failed to compute financial summary' })
  }
})

app.put('/update-expenses/:folderName/:recordId', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const { expenses } = req.body
  const patientFolder = path.join(patientsDir, folderName)
  const recordsPath   = path.join(patientFolder, 'treatment-records.json')

  try {
    if (!fsSync.existsSync(recordsPath)) return res.status(404).send('No records found')

    const data    = await fs.readFile(recordsPath, 'utf8')
    const records = JSON.parse(data)
    const idx     = records.findIndex(r => r.id === parseInt(recordId))
    if (idx === -1) return res.status(404).send('Record not found')

    const exp = parseFloat(expenses) || 0
    if (!records[idx].billing) {
      records[idx].billing = generateBillingFromRecord(records[idx], null)
    }
    records[idx].billing.expenses  = exp
    records[idx].billing.netProfit = (parseFloat(records[idx].billing.totalAmount) || 0) - exp

    await fs.writeFile(recordsPath, JSON.stringify(records, null, 2), 'utf8')
    res.json({ ok: true, billing: records[idx].billing })
  } catch (err) {
    console.error(' /update-expenses error:', err)
    res.status(500).send('Server error')
  }
})

app.put('/mark-paid/:folderName/:recordId', requireAuth, async (req, res) => {
  const { folderName, recordId } = req.params
  const { paid } = req.body
  const patientFolder = path.join(patientsDir, folderName)
  const recordsPath   = path.join(patientFolder, 'treatment-records.json')

  try {
    if (!fsSync.existsSync(recordsPath)) return res.status(404).send('No records found')

    const data    = await fs.readFile(recordsPath, 'utf8')
    const records = JSON.parse(data)
    const idx     = records.findIndex(r => r.id === parseInt(recordId))
    if (idx === -1) return res.status(404).send('Record not found')

    if (!records[idx].billing) {
      records[idx].billing = generateBillingFromRecord(records[idx], null)
    }

    if (paid) {
      const charged = parseFloat(records[idx].amountChanged) || 0
      if (charged > 0) records[idx].amountPaid = charged
    } else {
      records[idx].amountPaid = 0
    }

    records[idx].billing = generateBillingFromRecord(records[idx], records[idx].billing)
    records[idx].billing.paymentDate = paid ? new Date().toISOString() : null

    await fs.writeFile(recordsPath, JSON.stringify(records, null, 2), 'utf8')
    res.json({ ok: true, billing: records[idx].billing, record: records[idx] })
  } catch (err) {
    console.error('mark-paid error:', err)
    res.status(500).send('Server error')
  }
})

// =====================================================
// PRESCRIPTION ROUTES
// =====================================================

app.get('/prescriptions/:folderName', requireAuth, async (req, res) => {
  const { folderName } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const rxPath = path.join(patientFolder, 'prescriptions.json')

  try {
    if (!fsSync.existsSync(rxPath)) return res.json([])
    const data = await fs.readFile(rxPath, 'utf8')
    res.json(JSON.parse(data))
  } catch (err) {
    console.error('GET /prescriptions error:', err)
    res.status(500).json({ error: 'Failed to load prescriptions' })
  }
})

app.post('/prescriptions/:folderName', requireAuth, async (req, res) => {
  const { folderName } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const rxPath = path.join(patientFolder, 'prescriptions.json')

  try {
    if (!fsSync.existsSync(patientFolder)) return res.status(404).json({ error: 'Patient folder not found' })

    let prescriptions = []
    if (fsSync.existsSync(rxPath)) {
      prescriptions = JSON.parse(await fs.readFile(rxPath, 'utf8'))
    }

    const newRx = {
      ...req.body,
      id: makeId(),
      _timestamp: new Date().toISOString()
    }

    prescriptions.push(newRx)
    await fs.writeFile(rxPath, JSON.stringify(prescriptions, null, 2), 'utf8')
    res.json({ ok: true, prescription: newRx })
  } catch (err) {
    console.error('POST /prescriptions error:', err)
    res.status(500).json({ error: 'Failed to save prescription' })
  }
})

app.put('/prescriptions/:folderName/:rxId', requireAuth, async (req, res) => {
  const { folderName, rxId } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const rxPath = path.join(patientFolder, 'prescriptions.json')

  try {
    if (!fsSync.existsSync(rxPath)) return res.status(404).json({ error: 'No prescriptions found' })

    let prescriptions = JSON.parse(await fs.readFile(rxPath, 'utf8'))
    const idx = prescriptions.findIndex(r => String(r.id) === String(rxId))
    if (idx === -1) return res.status(404).json({ error: 'Prescription not found' })

    prescriptions[idx] = {
      ...prescriptions[idx],
      ...req.body,
      id: prescriptions[idx].id,
      _timestamp: prescriptions[idx]._timestamp,
      _updated: new Date().toISOString()
    }

    await fs.writeFile(rxPath, JSON.stringify(prescriptions, null, 2), 'utf8')
    res.json({ ok: true, prescription: prescriptions[idx] })
  } catch (err) {
    console.error('PUT /prescriptions error:', err)
    res.status(500).json({ error: 'Failed to update prescription' })
  }
})

app.delete('/prescriptions/:folderName/:rxId', requireAuth, async (req, res) => {
  const { folderName, rxId } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const rxPath = path.join(patientFolder, 'prescriptions.json')

  try {
    if (!fsSync.existsSync(rxPath)) return res.status(404).json({ error: 'No prescriptions found' })

    let prescriptions = JSON.parse(await fs.readFile(rxPath, 'utf8'))
    prescriptions = prescriptions.filter(r => String(r.id) !== String(rxId))
    await fs.writeFile(rxPath, JSON.stringify(prescriptions, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /prescriptions error:', err)
    res.status(500).json({ error: 'Failed to delete prescription' })
  }
})

// ── PRESCRIPTION PRINT (PDF) ──────────────────────────────────────────────
// FIX: Replaced the Unicode prescription symbol (℞ = U+211E) with plain
// ASCII 'Rx'. pdf-lib's built-in Helvetica font only supports Latin-1
// (ISO-8859-1). The special character caused a crash → 500 error.
app.get('/prescriptions/:folderName/:rxId/print', requireAuth, async (req, res) => {
  const { folderName, rxId } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  const rxPath = path.join(patientFolder, 'prescriptions.json')

  try {
    // Load patient info
    const appointments = await readAppointments(patientFolder)
    const patientInfo = getPatientInfoFromAppointments(appointments)
    if (!patientInfo) return res.status(404).send('Patient not found')

    const age = patientInfo.birthdate ? calculateAge(patientInfo.birthdate) : ''
    const latest = appointments.length > 0 ? appointments[appointments.length - 1] : {}

    // Load prescription
    if (!fsSync.existsSync(rxPath)) return res.status(404).send('No prescriptions found')
    const prescriptions = JSON.parse(await fs.readFile(rxPath, 'utf8'))
    const rx = prescriptions.find(r => String(r.id) === String(rxId))
    if (!rx) return res.status(404).send('Prescription not found')

    // Look for prescription.pdf background template
    const possibleTemplatePaths = [
      path.join(__dirname, 'prescription.pdf'),
      path.join(filesDir, 'prescription.pdf'),
      path.join(__dirname, 'Files', 'prescription.pdf'),
    ]

    let templatePath = null
    for (const p of possibleTemplatePaths) {
      if (fsSync.existsSync(p)) { templatePath = p; break }
    }

    // Create PDF
    const pdfDoc = await PDFDocument.create()
    const helv     = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Page setup — use prescription.pdf template if available
    let page
    if (templatePath) {
      try {
        const templateBytes = await fs.readFile(templatePath)
        const templateDoc   = await PDFDocument.load(templateBytes)
        const [embeddedBg]  = await pdfDoc.embedPdf(templateDoc, [0])
        const tplPage       = templateDoc.getPages()[0]
        const { width: tW, height: tH } = tplPage.getSize()
        page = pdfDoc.addPage([tW, tH])
        page.drawPage(embeddedBg, { x: 0, y: 0, width: tW, height: tH })
      } catch (e) {
        console.warn('Could not embed prescription.pdf background:', e.message)
        page = pdfDoc.addPage([595.28, 841.89])
      }
    } else {
      // Fallback: blank page with a styled border
      page = pdfDoc.addPage([595.28, 841.89])

      const pw = page.getWidth()
      const ph = page.getHeight()

      // Outer border
      page.drawRectangle({
        x: 20, y: 20,
        width: pw - 40, height: ph - 40,
        borderColor: rgb(0.04, 0.37, 0.66),
        borderWidth: 2
      })

      // Header band
      page.drawRectangle({
        x: 20, y: ph - 100,
        width: pw - 40, height: 80,
        color: rgb(0.04, 0.37, 0.66)
      })

      page.drawText('DENTAL PRESCRIPTION', {
        x: 50, y: ph - 65,
        size: 20, font: helvBold,
        color: rgb(1, 1, 1)
      })

      page.drawText('Philippine Dental Association', {
        x: 50, y: ph - 82,
        size: 10, font: helv,
        color: rgb(0.8, 0.9, 1)
      })

      // FIX: Use plain 'Rx' — the Unicode symbol ℞ (U+211E) is not in
      // Helvetica's Latin-1 charset and causes pdf-lib to throw a crash.
      page.drawText('Rx', {
        x: pw - 80, y: ph - 60,
        size: 28, font: helvBold,
        color: rgb(1, 1, 1)
      })

      // Bottom footer band
      page.drawRectangle({
        x: 20, y: 20,
        width: pw - 40, height: 30,
        color: rgb(0.94, 0.97, 1)
      })
    }

    const { width: pageW, height: pageH } = page.getSize()

    // ─── Overlay patient + prescription data ─────────────────────────
    const blue  = rgb(0.04, 0.37, 0.66)
    const dark  = rgb(0.07, 0.09, 0.14)
    const muted = rgb(0.39, 0.45, 0.55)

    const infoY = pageH - 130
    const infoX = 50

    page.drawText('PATIENT INFORMATION', {
      x: infoX, y: infoY,
      size: 8, font: helvBold,
      color: muted
    })

    const fullName = `${s(patientInfo.lastName)}, ${s(patientInfo.firstName)}${patientInfo.middleName ? ' ' + s(patientInfo.middleName) : ''}`
    page.drawText(`Patient: ${fullName}`, {
      x: infoX, y: infoY - 14,
      size: 11, font: helvBold,
      color: dark
    })

    const ageText  = age ? `Age: ${age}` : ''
    const sexText  = latest.sex ? `  Sex: ${latest.sex === 'M' ? 'Male' : latest.sex === 'F' ? 'Female' : latest.sex}` : ''
    const dobText  = patientInfo.birthdate ? `  DOB: ${patientInfo.birthdate}` : ''
    page.drawText(ageText + sexText + dobText, {
      x: infoX, y: infoY - 28,
      size: 9.5, font: helv,
      color: dark
    })

    const rxDate = rx.date
      ? new Date(rx.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    page.drawText(`Date: ${rxDate}`, {
      x: pageW - 200, y: infoY - 14,
      size: 10, font: helv, color: dark
    })

    if (rx.rxNumber) {
      page.drawText(`Rx #: ${rx.rxNumber}`, {
        x: pageW - 200, y: infoY - 28,
        size: 9.5, font: helvBold, color: blue
      })
    }

    if (rx.diagnosis) {
      page.drawText(`Diagnosis: ${s(rx.diagnosis)}`, {
        x: infoX, y: infoY - 42,
        size: 9.5, font: helv, color: dark
      })
    }

    // Separator line
    const sepY = infoY - 58
    page.drawLine({
      start: { x: infoX, y: sepY },
      end:   { x: pageW - 50, y: sepY },
      thickness: 0.8,
      color: rgb(0.8, 0.88, 0.96)
    })

    // FIX: 'Rx' label — plain ASCII, replaces the crashing ℞ Unicode symbol
    page.drawText('Rx', {
      x: infoX, y: sepY - 28,
      size: 20, font: helvBold,
      color: blue
    })

    // Drugs
    let drugY = sepY - 55
    const lineSpacing = 20

    ;(rx.drugs || []).forEach((drug, i) => {
      if (drugY < 150) return

      page.drawText(`${i + 1}.`, {
        x: infoX, y: drugY,
        size: 10.5, font: helvBold, color: dark
      })

      const drugLine = [s(drug.name), s(drug.dosage)].filter(Boolean).join('  ')
      page.drawText(drugLine, {
        x: infoX + 16, y: drugY,
        size: 11, font: helvBold, color: dark
      })

      if (drug.quantity) {
        const dispQ = `#${drug.quantity}`
        const qWidth = 60
        page.drawText(dispQ, {
          x: pageW - 50 - qWidth, y: drugY,
          size: 10, font: helvBold, color: blue
        })
      }

      drugY -= lineSpacing

      if (drug.sig) {
        page.drawText(`Sig: ${s(drug.sig)}`, {
          x: infoX + 16, y: drugY,
          size: 9.5, font: helv, color: muted
        })
        drugY -= lineSpacing
      }

      drugY -= 4
    })

    // Additional instructions
    if (rx.instructions) {
      drugY -= 8
      page.drawLine({
        start: { x: infoX, y: drugY },
        end:   { x: pageW - 50, y: drugY },
        thickness: 0.5,
        color: rgb(0.88, 0.91, 0.95)
      })
      drugY -= 16

      page.drawText('Additional Instructions:', {
        x: infoX, y: drugY,
        size: 9, font: helvBold, color: muted
      })
      drugY -= 14

      const instrLines = wrapTextRx(s(rx.instructions), 85)
      instrLines.forEach(line => {
        if (drugY < 120) return
        page.drawText(line, { x: infoX, y: drugY, size: 9.5, font: helv, color: dark })
        drugY -= 13
      })
    }

    // Signature area
    const sigY = 110
    page.drawLine({
      start: { x: pageW - 200, y: sigY + 30 },
      end:   { x: pageW - 50, y: sigY + 30 },
      thickness: 1,
      color: dark
    })

    page.drawText('Signature over Printed Name', {
      x: pageW - 200, y: sigY + 18,
      size: 8, font: helv, color: muted
    })

    if (rx.dentist) {
      page.drawText(s(rx.dentist), {
        x: pageW - 200, y: sigY + 4,
        size: 9.5, font: helvBold, color: dark
      })
    }

    page.drawText('License No.: ______________', {
      x: pageW - 200, y: sigY - 10,
      size: 8.5, font: helv, color: muted
    })

    page.drawText('PTR No.: ______________', {
      x: pageW - 200, y: sigY - 22,
      size: 8.5, font: helv, color: muted
    })

    // Footer
    page.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: infoX, y: 30,
      size: 7.5, font: helv,
      color: rgb(0.6, 0.6, 0.6)
    })

    const pdfBytes = await pdfDoc.save()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Rx_${patientInfo.lastName}-${patientInfo.firstName}.pdf"`)
    res.send(Buffer.from(pdfBytes))

    console.log(` Prescription PDF exported for ${patientInfo.lastName}, ${patientInfo.firstName}`)
  } catch (err) {
    console.error('Prescription print error:', err)
    res.status(500).send('Failed to generate prescription PDF: ' + err.message)
  }
})

// Helper: simple word wrap for prescription text
function wrapTextRx(text, maxChars) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  words.forEach(word => {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  })
  if (current) lines.push(current)
  return lines
}


// =====================================================
// START SERVER
// =====================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'main.html'))
})

// Export for Firebase Cloud Functions
exports.server = functions.https.onRequest(app)

// Also allow running locally with: node server.js
// Global error handler — full stack logged server-side, generic message to client
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message || err)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: 'An internal error occurred.' })
})

/* =========================================================
   CLI — add-dentist
   Usage: node server.js --add-dentist username:password:version
   ========================================================= */
if (process.argv[2] === '--add-dentist') {
  const parts = (process.argv[3] || '').split(':')
  if (parts.length < 3) { console.error('Usage: node server.js --add-dentist username:password:version'); process.exit(1) }
  const [uname, pass, ver] = parts
  const version = parseInt(ver)
  if (![1,2,3,4].includes(version)) { console.error('Version must be 1-4'); process.exit(1) }
  const list = loadDentists()
  if (list.find(d => d.username === uname)) { console.error(`Username "${uname}" already exists.`); process.exit(1) }
  bcrypt.hash(pass, 12).then(hashed => {
    list.push({ id: uname.toLowerCase().replace(/[^a-z0-9]/g,''), name: `Dr. ${uname}`, title: 'DMD', specialty: 'General Dentistry', username: uname, password: hashed, role: 'dentist', version })
    saveDentists(list)
    console.log(`\n✓ Dentist added: ${uname} (version ${version}) — password hashed`)
    console.log('Restart the server for changes to take effect.\n')
    process.exit(0)
  })
} else

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🦷 Enzymess Dental — Server running on http://localhost:${PORT}`)
    console.log(`📁 Data directory:    ${dataDir}`)
    console.log(`👥 Patients:          ${patientsDir}`)
    console.log(`🦷 Teeth base:        ${teethBaseDir}`)
    console.log(`💾 Backups:           ${backupDir}\n`)
  })
}