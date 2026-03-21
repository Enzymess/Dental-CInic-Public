'use strict'

const express  = require('express')
const router   = express.Router()
const fsSync   = require('fs')
const { promises: fs } = require('fs')
const path     = require('path')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const { requireAuth } = require('../middleware/auth')
const { patientsDir, filesDir } = require('../config')
const { readAppointments, getPatientInfoFromAppointments } = require('../utils/patient-data')
const { makeId, s, calculateAge, wrapTextRx } = require('../utils/helpers')

const rxPath = (folderName) => path.join(patientsDir, folderName, 'prescriptions.json')

async function readRx(folderName) {
  const p = rxPath(folderName)
  if (!fsSync.existsSync(p)) return []
  return JSON.parse(await fs.readFile(p, 'utf8'))
}

async function writeRx(folderName, list) {
  await fs.writeFile(rxPath(folderName), JSON.stringify(list, null, 2), 'utf8')
}

// GET /prescriptions/:folderName
router.get('/prescriptions/:folderName', requireAuth, async (req, res) => {
  try { res.json(await readRx(req.params.folderName)) }
  catch (err) { console.error('GET /prescriptions error:', err); res.status(500).json({ error: 'Failed to load prescriptions' }) }
})

// POST /prescriptions/:folderName
router.post('/prescriptions/:folderName', requireAuth, async (req, res) => {
  const { folderName } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  if (!fsSync.existsSync(patientFolder)) return res.status(404).json({ error: 'Patient folder not found' })
  try {
    const prescriptions = await readRx(folderName)
    const newRx = { ...req.body, id: makeId(), _timestamp: new Date().toISOString() }
    prescriptions.push(newRx)
    await writeRx(folderName, prescriptions)
    res.json({ ok: true, prescription: newRx })
  } catch (err) { console.error('POST /prescriptions error:', err); res.status(500).json({ error: 'Failed to save prescription' }) }
})

// PUT /prescriptions/:folderName/:rxId
router.put('/prescriptions/:folderName/:rxId', requireAuth, async (req, res) => {
  const { folderName, rxId } = req.params
  try {
    const prescriptions = await readRx(folderName)
    const idx = prescriptions.findIndex(r => String(r.id) === String(rxId))
    if (idx === -1) return res.status(404).json({ error: 'Prescription not found' })
    prescriptions[idx] = { ...prescriptions[idx], ...req.body, id: prescriptions[idx].id, _timestamp: prescriptions[idx]._timestamp, _updated: new Date().toISOString() }
    await writeRx(folderName, prescriptions)
    res.json({ ok: true, prescription: prescriptions[idx] })
  } catch (err) { console.error('PUT /prescriptions error:', err); res.status(500).json({ error: 'Failed to update prescription' }) }
})

// DELETE /prescriptions/:folderName/:rxId
router.delete('/prescriptions/:folderName/:rxId', requireAuth, async (req, res) => {
  const { folderName, rxId } = req.params
  try {
    const prescriptions = await readRx(folderName)
    await writeRx(folderName, prescriptions.filter(r => String(r.id) !== String(rxId)))
    res.json({ ok: true })
  } catch (err) { console.error('DELETE /prescriptions error:', err); res.status(500).json({ error: 'Failed to delete prescription' }) }
})

// GET /prescriptions/:folderName/:rxId/print — generate PDF
router.get('/prescriptions/:folderName/:rxId/print', requireAuth, async (req, res) => {
  const { folderName, rxId } = req.params
  const patientFolder = path.join(patientsDir, folderName)
  try {
    const appointments  = await readAppointments(patientFolder)
    const patientInfo   = getPatientInfoFromAppointments(appointments)
    if (!patientInfo) return res.status(404).send('Patient not found')
    const age    = patientInfo.birthdate ? calculateAge(patientInfo.birthdate) : ''
    const latest = appointments.length > 0 ? appointments[appointments.length - 1] : {}

    const prescriptions = await readRx(folderName)
    const rx = prescriptions.find(r => String(r.id) === String(rxId))
    if (!rx) return res.status(404).send('Prescription not found')

    // Look for optional prescription.pdf template
    const templateCandidates = [
      path.join(__dirname, '../../prescription.pdf'),
      path.join(filesDir, 'prescription.pdf'),
    ]
    let templatePath = null
    for (const p of templateCandidates) { if (fsSync.existsSync(p)) { templatePath = p; break } }

    const pdfDoc  = await PDFDocument.create()
    const helv     = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

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
      } catch {
        page = pdfDoc.addPage([595.28, 841.89])
      }
    } else {
      page = pdfDoc.addPage([595.28, 841.89])
      const pw = page.getWidth(), ph = page.getHeight()
      page.drawRectangle({ x: 20, y: 20, width: pw-40, height: ph-40, borderColor: rgb(0.04,0.37,0.66), borderWidth: 2 })
      page.drawRectangle({ x: 20, y: ph-100, width: pw-40, height: 80, color: rgb(0.04,0.37,0.66) })
      page.drawText('DENTAL PRESCRIPTION', { x: 50, y: ph-65, size: 20, font: helvBold, color: rgb(1,1,1) })
      page.drawText('Philippine Dental Association', { x: 50, y: ph-82, size: 10, font: helv, color: rgb(0.8,0.9,1) })
      page.drawText('Rx', { x: pw-80, y: ph-60, size: 28, font: helvBold, color: rgb(1,1,1) })
      page.drawRectangle({ x: 20, y: 20, width: pw-40, height: 30, color: rgb(0.94,0.97,1) })
    }

    const { width: pageW, height: pageH } = page.getSize()
    const blue  = rgb(0.04,0.37,0.66), dark = rgb(0.07,0.09,0.14), muted = rgb(0.39,0.45,0.55)
    const infoY = pageH - 130, infoX = 50

    page.drawText('PATIENT INFORMATION', { x: infoX, y: infoY, size: 8, font: helvBold, color: muted })
    const fullName = `${s(patientInfo.lastName)}, ${s(patientInfo.firstName)}${patientInfo.middleName ? ' ' + s(patientInfo.middleName) : ''}`
    page.drawText(`Patient: ${fullName}`, { x: infoX, y: infoY-14, size: 11, font: helvBold, color: dark })

    const ageText = age ? `Age: ${age}` : ''
    const sexText = latest.sex ? `  Sex: ${latest.sex === 'M' ? 'Male' : latest.sex === 'F' ? 'Female' : latest.sex}` : ''
    const dobText = patientInfo.birthdate ? `  DOB: ${patientInfo.birthdate}` : ''
    page.drawText(ageText + sexText + dobText, { x: infoX, y: infoY-28, size: 9.5, font: helv, color: dark })

    const rxDate = rx.date
      ? new Date(rx.date).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
      : new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
    page.drawText(`Date: ${rxDate}`, { x: pageW-200, y: infoY-14, size: 10, font: helv, color: dark })
    if (rx.rxNumber) page.drawText(`Rx #: ${rx.rxNumber}`, { x: pageW-200, y: infoY-28, size: 9.5, font: helvBold, color: blue })
    if (rx.diagnosis) page.drawText(`Diagnosis: ${s(rx.diagnosis)}`, { x: infoX, y: infoY-42, size: 9.5, font: helv, color: dark })

    const sepY = infoY - 58
    page.drawLine({ start: {x:infoX,y:sepY}, end: {x:pageW-50,y:sepY}, thickness: 0.8, color: rgb(0.8,0.88,0.96) })
    page.drawText('Rx', { x: infoX, y: sepY-28, size: 20, font: helvBold, color: blue })

    let drugY = sepY - 55
    ;(rx.drugs || []).forEach((drug, i) => {
      if (drugY < 150) return
      page.drawText(`${i+1}.`, { x: infoX, y: drugY, size: 10.5, font: helvBold, color: dark })
      const drugLine = [s(drug.name), s(drug.dosage)].filter(Boolean).join('  ')
      page.drawText(drugLine, { x: infoX+16, y: drugY, size: 11, font: helvBold, color: dark })
      if (drug.quantity) page.drawText(`#${drug.quantity}`, { x: pageW-110, y: drugY, size: 10, font: helvBold, color: blue })
      drugY -= 20
      if (drug.sig) { page.drawText(`Sig: ${s(drug.sig)}`, { x: infoX+16, y: drugY, size: 9.5, font: helv, color: muted }); drugY -= 20 }
      drugY -= 4
    })

    if (rx.instructions) {
      drugY -= 8
      page.drawLine({ start: {x:infoX,y:drugY}, end: {x:pageW-50,y:drugY}, thickness: 0.5, color: rgb(0.88,0.91,0.95) })
      drugY -= 16
      page.drawText('Additional Instructions:', { x: infoX, y: drugY, size: 9, font: helvBold, color: muted })
      drugY -= 14
      wrapTextRx(s(rx.instructions), 85).forEach(line => {
        if (drugY < 120) return
        page.drawText(line, { x: infoX, y: drugY, size: 9.5, font: helv, color: dark })
        drugY -= 13
      })
    }

    const sigY = 110
    page.drawLine({ start: {x:pageW-200,y:sigY+30}, end: {x:pageW-50,y:sigY+30}, thickness: 1, color: dark })
    page.drawText('Signature over Printed Name', { x: pageW-200, y: sigY+18, size: 8, font: helv, color: muted })
    if (rx.dentist) page.drawText(s(rx.dentist), { x: pageW-200, y: sigY+4, size: 9.5, font: helvBold, color: dark })
    page.drawText('License No.: ______________', { x: pageW-200, y: sigY-10, size: 8.5, font: helv, color: muted })
    page.drawText('PTR No.: ______________',     { x: pageW-200, y: sigY-22, size: 8.5, font: helv, color: muted })
    page.drawText(`Generated: ${new Date().toLocaleString()}`, { x: infoX, y: 30, size: 7.5, font: helv, color: rgb(0.6,0.6,0.6) })

    const pdfBytes = await pdfDoc.save()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Rx_${patientInfo.lastName}-${patientInfo.firstName}.pdf"`)
    res.send(Buffer.from(pdfBytes))
    console.log(`Prescription PDF exported for ${patientInfo.lastName}, ${patientInfo.firstName}`)
  } catch (err) {
    console.error('Prescription print error:', err)
    res.status(500).send('Failed to generate prescription PDF: ' + err.message)
  }
})

module.exports = router
