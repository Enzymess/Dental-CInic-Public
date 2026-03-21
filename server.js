/**
 * PDA DENTAL CLINIC MANAGEMENT SYSTEM - MAIN SERVER FILE
 * =====================================================
 *
 * Run setup first:  node setup.js admin:admin123:4
 *
 * This is the main entry point for the application. It initializes the Express
 * server, configures routing, and exports Firebase Cloud Functions for deployment.
 *
 * The application can run in two modes:
 * 1. Node.js local development (npm start)
 * 2. Firebase Cloud Functions (production)
 */

'use strict'

const express   = require('express')
const path      = require('path')
const fsSync    = require('fs')
const os        = require('os')

/**
 * CONFIGURATION & SETUP
 * =====================
 */
const { app, patientsDir, teethBaseDir } = require('./server/config')

/**
 * LICENSE / VERSION
 * =================
 * Read license.json written by setup.js.
 * Provides feature flags and host binding to the rest of the app.
 */
const LICENSE_PATH = path.join(__dirname, 'license.json')
let license = {
  version:  4,
  label:    'Pro (Full)',
  host:     '0.0.0.0',
  network:  'home network',
  features: {
    patientForm:   true, patientList:   true, dentalChart:  true,
    dentalRecords: true, print:         true, dashboard:    true,
    billing:       true, scheduling:    true, patientImages:true,
    prescriptions: true
  }
}

if (fsSync.existsSync(LICENSE_PATH)) {
  try {
    license = JSON.parse(fsSync.readFileSync(LICENSE_PATH, 'utf8'))
  } catch (e) {
    console.warn('Could not read license.json, using defaults.')
  }
} else {
  // Auto-create on Railway or fresh deploy — no setup.js needed
  try {
    fsSync.writeFileSync(LICENSE_PATH, JSON.stringify(license, null, 2), 'utf8')
    console.log('Created default license.json (version 4, all features)')
  } catch (e) {
    console.warn('Could not write license.json:', e.message)
  }
}

// Expose license globally so route files can read feature flags if needed
global.pdaLicense = license

/**
 * LICENSE ENDPOINT — frontend reads this to show/hide UI features
 */
app.get('/license', (req, res) => {
  // Only expose features + version, never host/network internals
  res.json({
    version:  license.version,
    label:    license.label,
    features: license.features
  })
})

/**
 * APPLICATION ROUTING
 * ===================
 */
app.use('/', require('./server/routes/auth'))
app.use('/', require('./server/routes/patients'))
app.use('/', require('./server/routes/teeth'))
app.use('/', require('./server/routes/dental-chart'))
app.use('/', require('./server/routes/treatment-records'))
app.use('/', require('./server/routes/patient-images'))
app.use('/', require('./server/routes/backup'))
app.use('/', require('./server/routes/export'))
app.use('/', require('./server/routes/temp-patients'))
app.use('/', require('./server/routes/prescriptions'))
app.use('/', require('./server/routes/clinic-config'))

/**
 * PRIMARY APPLICATION ENTRY POINT
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'main.html'))
})

/**
 * LOCAL DEVELOPMENT SERVER
 * =========================
 * Version 1–3: binds to 127.0.0.1 (localhost only)
 * Version 4:   binds to 0.0.0.0  (home network accessible)
 */
if (require.main === module) {
  const PORT = process.env.PORT || 3000
  const HOST = process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : (license.host || '0.0.0.0')

  app.listen(PORT, HOST, () => {
    console.log('\n' + '═'.repeat(55))
    console.log('  PDA Dental Clinic System')
    console.log('═'.repeat(55))
    console.log(`  Version   : ${license.version} — ${license.label}`)
    console.log(`  Network   : ${license.network}`)
    console.log(`  Local     : http://localhost:${PORT}`)

    if (HOST === '0.0.0.0') {
      // Find and print the LAN IP so the dentist knows the address
      const ifaces = os.networkInterfaces()
      for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`  Network   : http://${iface.address}:${PORT}  ← share this with devices on your WiFi`)
          }
        }
      }
    }

    console.log('─'.repeat(55))
    console.log(`  Patients  : ${patientsDir}`)
    console.log(`  Teeth     : ${teethBaseDir}`)
    console.log('═'.repeat(55) + '\n')
  })
}