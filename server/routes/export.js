/**
 * RECORD EXPORT & PDF GENERATION ROUTES
 * ======================================
 * 
 * This module handles exporting patient records and treatment data to PDF format.
 * It generates comprehensive patient documents including:
 * - Complete patient information forms
 * - Dental charts with tooth status
 * - Treatment records and financial history
 * - Clinical examination data
 * 
 * Routes:
 *   GET /export-all-records/:patientFolder   - Export complete patient PDF
 *   GET /export-dental-chart/:patientFolder  - Export dental chart PDF
 *   GET /export-treatment-records/:patientFolder - Export treatment history PDF
 */

'use strict'

const fsSync   = require('fs')
const { promises: fs } = require('fs')
const path     = require('path')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const { patientsDir, teethBaseDir, filesDir } = require('../config')
const { getAllPatients, readAppointments, getPatientInfoFromAppointments, getLatestDentalChartInfo } = require('../utils/patient-data')
const { s, calculateAge } = require('../utils/helpers')
const { drawCheckbox } = require('../utils/pdf-helpers')
const { CLINIC_DENTIST_NAME } = require('../config/billing')
const express  = require('express')
const router   = express.Router()
const { requireAuth } = require('../middleware/auth')

/**
 * GET /export-all-records/:patientFolder
 * ========================================
 * Generates a comprehensive PDF containing all patient records:
 * - Patient information and medical history
 * - Dental chart with tooth status indicators
 * - All treatment records and appointments
 * - Clinical examination findings
 * - Financial summary
 * 
 * Authorization: Required (Bearer token)
 * Route param:   patientFolder - Patient's folder name
 * Response:      PDF file as application/pdf binary
 */
router.get('/export-all-records/:patientFolder', requireAuth, async (req, res) => {
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


module.exports = router
