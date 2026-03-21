/**
 * CLINIC CONFIG ROUTE
 * ===================
 * Drop this file into: server/routes/clinic-config.js
 * Then add ONE line to server.js with the other app.use() calls:
 *
 *   app.use('/', require('./server/routes/clinic-config'))
 *
 * No other changes needed anywhere.
 */

'use strict'

const express = require('express')
const router  = express.Router()
const fs      = require('fs')
const path    = require('path')

const CONFIG_PATH = path.join(__dirname, '../../clinic-config.json')

/* ── Simple inline auth check — no external middleware dependency ── */
function isAuthed (req) {
  try {
    const header = req.headers['authorization'] || ''
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return false
    // The app signs tokens as base64 JSON; if yours uses jsonwebtoken swap this
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    return !!payload && !!payload.username
  } catch {
    return false
  }
}

/* ── GET /clinic-config — no auth, must load before login for branding ── */
router.get('/clinic-config', (req, res) => {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return res.json(defaultConfig())
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    res.json(JSON.parse(raw))
  } catch (err) {
    console.error('clinic-config GET error:', err)
    res.status(500).json({ error: 'Failed to read clinic config' })
  }
})

/* ── POST /clinic-config — requires auth ── */
router.post('/clinic-config', (req, res) => {
  if (!isAuthed(req)) return res.status(403).json({ error: 'Unauthorized' })

  try {
    const body = req.body
    if (!body || !body.clinic || !body.doctor || !body.print)
      return res.status(400).json({ error: 'Invalid config payload' })

    const safe = {
      clinic: {
        name:        String(body.clinic.name        || '').trim(),
        logoLetters: String(body.clinic.logoLetters || '').trim().slice(0, 6),
        tagline:     String(body.clinic.tagline     || '').trim(),
        address:     String(body.clinic.address     || '').trim(),
        phone:       String(body.clinic.phone       || '').trim(),
        mobile:      String(body.clinic.mobile      || '').trim(),
        email:       String(body.clinic.email       || '').trim(),
        website:     String(body.clinic.website     || '').trim()
      },
      doctor: {
        name:           String(body.doctor.name           || '').trim(),
        title:          String(body.doctor.title          || '').trim(),
        licenseNo:      String(body.doctor.licenseNo      || '').trim(),
        ptrNo:          String(body.doctor.ptrNo          || '').trim(),
        specialization: String(body.doctor.specialization || '').trim(),
        schedule:       String(body.doctor.schedule       || '').trim()
      },
      print: {
        footerNote:              String(body.print.footerNote || '').trim(),
        showLogo:                !!body.print.showLogo,
        showDoctorSignatureLine: !!body.print.showDoctorSignatureLine,
        showClinicStampBox:      !!body.print.showClinicStampBox,
        primaryColor:            String(body.print.primaryColor || '#0b5ea8').trim(),
        accentColor:             String(body.print.accentColor  || '#0b9adf').trim()
      }
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(safe, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (err) {
    console.error('clinic-config POST error:', err)
    res.status(500).json({ error: 'Failed to save clinic config' })
  }
})

function defaultConfig () {
  return {
    clinic: { name: 'PDA Dental Clinic', logoLetters: 'PDA', tagline: 'Philippine Dental Association', address: '', phone: '', mobile: '', email: '', website: '' },
    doctor: { name: 'Dr. ', title: 'DMD', licenseNo: '', ptrNo: '', specialization: 'General Dentistry', schedule: '' },
    print:  { footerNote: 'This document is for medical records purposes only.', showLogo: true, showDoctorSignatureLine: true, showClinicStampBox: true, primaryColor: '#0b5ea8', accentColor: '#0b9adf' }
  }
}

module.exports = router