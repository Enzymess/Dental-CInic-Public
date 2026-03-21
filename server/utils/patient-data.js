/**
 * PATIENT DATA UTILITIES
 * ======================
 * Core utilities for reading and managing patient appointment data.
 * Handles file I/O for patient JSON files and data transformation.
 */

'use strict'

const fsSync = require('fs')
const { promises: fs } = require('fs')
const path = require('path')
const { patientsDir } = require('../config')
const { getPatientKey, sanitizeFolderName } = require('./helpers')

/**
 * Read appointment records from patient folder
 * @returns {Promise<Array>} Appointment objects or empty array if file missing
 */
async function readAppointments(folderPath) {
  const appointmentsPath = path.join(folderPath, 'appointments.json')
  try {
    const data = await fs.readFile(appointmentsPath, 'utf8')
    return JSON.parse(data)
  } catch { return [] }
}

/**
 * Write appointment records to patient folder as formatted JSON
 * @param {string} folderPath - Patient folder path
 * @param {Array} appointments - Array of appointment objects to save
 */
async function writeAppointments(folderPath, appointments) {
  const appointmentsPath = path.join(folderPath, 'appointments.json')
  await fs.writeFile(appointmentsPath, JSON.stringify(appointments, null, 2), 'utf8')
}

/**
 * Extract patient demographic info from first appointment record
 * @returns {Object|null} Patient info or null if no appointments
 */
function getPatientInfoFromAppointments(appointments) {
  if (!appointments || appointments.length === 0) return null
  const first = appointments[0]
  return {
    lastName:   first.lastName,
    firstName:  first.firstName,
    middleName: first.middleName,
    birthdate:  first.birthdate
  }
}

/**
 * Generate filesystem path for patient folder based on patient info
 * Uses sanitized folder name from patient key
 */
function getPatientFolder(entry) {
  const key = getPatientKey(entry)
  return path.join(patientsDir, sanitizeFolderName(key))
}

/**
 * Load all patients from directory with appointments and photos
 * Excludes TEMP_ prefixed folders
 * @returns {Promise<Array>} Patient objects with appointments and photoPath
 */
async function getAllPatients() {
  const folders = await fs.readdir(patientsDir)
  const patients = []

  for (const folder of folders) {
    if (folder.startsWith('TEMP_')) continue

    const folderPath = path.join(patientsDir, folder)
    const stat = await fs.stat(folderPath)
    if (!stat.isDirectory()) continue

    const appointments = await readAppointments(folderPath)
    if (appointments.length === 0) continue

    const patientData = getPatientInfoFromAppointments(appointments)
    if (!patientData) continue

    let photoPath = null
    for (const ext of ['photo.jpg','photo.jpeg','photo.png','photo.gif','photo.webp','photo.bmp']) {
      if (fsSync.existsSync(path.join(folderPath, ext))) {
        photoPath = `/patients/${folder}/${ext}`
        break
      }
    }

    patients.push({
      folderName: folder,
      ...patientData,
      photoPath,
      appointments: appointments.map(a => ({ ...a, _patientFolder: folder }))
    })
  }
  return patients
}

/**
 * Retrieve most recent dental examination data from patient folder
 * Includes periodontal, occlusion, TMD, x-ray findings, etc.
 * @returns {Promise<Object|null>} Latest dental chart data or null
 */
async function getLatestDentalChartInfo(folderPath) {
  const infoPath = path.join(folderPath, 'dental-chart-info.json')
  try {
    if (!fsSync.existsSync(infoPath)) return null
    const data = JSON.parse(await fs.readFile(infoPath, 'utf8'))
    if (!data || data.length === 0) return null
    return data[data.length - 1]
  } catch { return null }
}

module.exports = {
  readAppointments,
  writeAppointments,
  getPatientInfoFromAppointments,
  getPatientFolder,
  getAllPatients,
  getLatestDentalChartInfo
}
