/**
 * SERVER CONFIGURATION & INITIALIZATION
 * ======================================
 * 
 * This module initializes the Express application and sets up core configuration:
 * - Directory structures for patient data, backups, and files
 * - Middleware for JSON parsing and static file serving
 * - Authentication token management
 * - Credential management for admin authentication
 */

'use strict'

const express   = require('express')
const fsSync    = require('fs')
const path      = require('path')

/**
 * DIRECTORY CONFIGURATION
 * =======================
 * Define absolute paths to all persistent data directories used by the application
 */
const patientsDir    = path.resolve(__dirname, '../../patients')
const filesDir       = path.resolve(__dirname, '../../Files')
const backupDir      = path.resolve(__dirname, '../../Backup')
const codeBackupDir  = path.resolve(__dirname, '../../CodeBackup')
const teethBaseDir   = path.join(filesDir, 'teeth_base')
const imagesDir      = path.join(__dirname, '../../patient-images')
const credentialsPath = path.join(__dirname, '../../credentials.json')
const dentistsPath    = path.join(__dirname, '../../dentists.json')

function loadDentists() {
  try {
    if (fsSync.existsSync(dentistsPath))
      return JSON.parse(fsSync.readFileSync(dentistsPath, 'utf8'))
  } catch (e) { console.error('dentists.json error:', e.message) }
  return []
}

function saveDentists(list) {
  fsSync.writeFileSync(dentistsPath, JSON.stringify(list, null, 2), 'utf8')
}

/**
 * ENSURE DIRECTORY STRUCTURE
 * ===========================
 * Create any missing directories on startup. This ensures the application
 * can immediately persist data without manual directory creation.
 */
;[patientsDir, filesDir, backupDir, codeBackupDir, imagesDir].forEach(d => {
  if (!fsSync.existsSync(d)) fsSync.mkdirSync(d, { recursive: true })
})
if (!fsSync.existsSync(teethBaseDir)) fsSync.mkdirSync(teethBaseDir, { recursive: true })

/**
 * CREDENTIAL MANAGEMENT
 * =====================
 * Handles admin login credentials stored in JSON file. Provides fallback
 * default credentials for initial setup.
 */
const DEFAULT_CREDENTIALS = { username: 'admin', password: 'admin123' }

/**
 * Load credentials from file, or return defaults if file doesn't exist
 * @returns {Object} Credentials object with username and password
 */
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

/**
 * Save credentials to file system
 * @param {Object} creds - Credentials object to persist
 */
function saveCredentials(creds) {
  fsSync.writeFileSync(credentialsPath, JSON.stringify(creds, null, 2), 'utf8')
}

/**
 * Initialize credentials file with defaults if it doesn't exist
 */
if (!fsSync.existsSync(credentialsPath)) {
  saveCredentials(DEFAULT_CREDENTIALS)
  console.log('Default credentials created (admin / admin123)')
}

/**
 * AUTHENTICATION TOKEN MANAGEMENT
 * ================================
 * In-memory store for valid JWT tokens. Tokens are added on successful login
 * and removed on logout. This is reset when the server restarts.
 * 
 * Note: For production, consider using a persistent session store or database.
 */
const activeTokens = new Map() // token -> { username, dentistId, dentistName, role, version, createdAt }

/**
 * EXPRESS APPLICATION INITIALIZATION
 * ====================================
 * Configure Express with middleware for parsing JSON, serving static files,
 * and accessing patient data directories through HTTP
 */
const app = express()
app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, '../../public')))
app.use('/patients', express.static(patientsDir))
app.use('/teeth_base', express.static(teethBaseDir))


/**
 * MODULE EXPORTS
 * ==============
 * Export all configuration objects and functions for use by route handlers
 * and other server modules
 */
module.exports = {
  app,
  patientsDir,
  filesDir,
  backupDir,
  codeBackupDir,
  teethBaseDir,
  imagesDir,
  credentialsPath,
  loadCredentials,
  saveCredentials,
  activeTokens,
  dentistsPath,
  loadDentists,
  saveDentists
}