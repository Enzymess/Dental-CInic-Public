/**
 * FILE UPLOAD & STORAGE CONFIGURATION
 * ====================================
 * Configures Multer storage handlers for different file upload types:
 * - Patient profile photos (form submission)
 * - Tooth drawing images (canvas exports)
 * - Clinical patient images (documentation)
 */

'use strict'

const multer  = require('multer')
const fsSync  = require('fs')
const path    = require('path')
const { patientsDir } = require('./index')
const { getPatientFolder } = require('../utils/patient-data')
const { makeId } = require('../utils/helpers')

/**
 * Patient profile photo upload storage
 * Saves to patient folder as photo.[ext]
 */
const formPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const patientFolder = getPatientFolder(req.body)
    if (!fsSync.existsSync(patientFolder)) fsSync.mkdirSync(patientFolder, { recursive: true })
    cb(null, patientFolder)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `photo${ext}`)
  }
})
const uploadFormPhoto = multer({ storage: formPhotoStorage })

/**
 * Tooth diagram drawing image storage
 * Names files as tooth_[number].jpg
 */
const toothStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = path.join(patientsDir, req.params.folderName)
    if (!fsSync.existsSync(folder)) fsSync.mkdirSync(folder, { recursive: true })
    cb(null, folder)
  },
  filename: (req, file, cb) => {
    cb(null, `tooth_${req.params.toothNumber}.jpg`)
  }
})
const uploadTooth = multer({ storage: toothStorage })

/**
 * Clinical patient image upload storage
 * Stores in patient /images folder with unique IDs (max 10MB)
 */
const patientImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const imgFolder = path.join(patientsDir, req.params.folderName, 'images')
    if (!fsSync.existsSync(imgFolder)) fsSync.mkdirSync(imgFolder, { recursive: true })
    cb(null, imgFolder)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `image_${makeId()}${ext}`)
  }
})
const uploadPatientImage = multer({
  storage: patientImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }
})

module.exports = { uploadFormPhoto, uploadTooth, uploadPatientImage }
