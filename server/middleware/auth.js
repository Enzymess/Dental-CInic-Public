/**
 * AUTHENTICATION ROUTES
 * =====================
 * Manages admin login and credential management:
 * - User authentication with username/password
 * - JWT token generation for authenticated requests
 * - Password changing with validation
 * 
 * Routes:
 *   POST /login              - Authenticate user and receive JWT token
 *   POST /change-password    - Update admin password (requires auth)
 */

'use strict'

const express = require('express')
const router  = express.Router()
const { loadCredentials, saveCredentials, activeTokens, loadDentists, saveDentists } = require('../config')
const { requireAuth } = require('../middleware/auth')
const { makeId } = require('../utils/helpers')

/**
 * POST /login - Authenticate user and receive JWT token
 * Request body: { username, password }
 * Response: { ok: true, token } or { ok: false, error }
 */
// GET /dentists — public, returns display fields only (no passwords)
router.get('/dentists', (req, res) => {
  const list = loadDentists().filter(d => d.role !== 'admin')
  res.json(list.map(({ id, name, title, specialty }) => ({ id, name, title, specialty })))
})

// POST /login — dentists.json is the single source of truth
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password)
    return res.status(400).json({ ok: false, error: 'Missing credentials' })

  const users   = loadDentists()
  const user    = users.find(d => d.username === username && d.password === password)

  if (user) {
    const token   = makeId()
    const isAdmin = user.role === 'admin'
    activeTokens.set(token, {
      username,
      dentistId:   isAdmin ? null : user.id,
      dentistName: isAdmin ? null : user.name,
      role:        user.role,
      version:     user.version || 4,
      createdAt:   Date.now()
    })
    console.log(`Login: ${user.name || username} (${user.role})`)
    return res.json({
      ok:          true,
      token,
      dentistId:   isAdmin ? null : user.id,
      dentistName: isAdmin ? null : user.name,
      role:        user.role,
      version:     user.version || 4
    })
  }

  // Fallback: check legacy credentials.json for admin
  const creds = loadCredentials()
  if (username === creds.username && password === creds.password) {
    const token = makeId()
    activeTokens.set(token, { username, dentistId: null, dentistName: null, role: 'admin', version: 4, createdAt: Date.now() })
    console.log(`Admin login (legacy): ${username}`)
    return res.json({ ok: true, token, dentistId: null, dentistName: null, role: 'admin', version: 4 })
  }

  console.warn(`Failed login attempt for: "${username}"`)
  return res.status(401).json({ ok: false, error: 'Invalid credentials' })
})

/**
 * POST /change-password - Update admin password
 * Authorization: Required (Bearer token)
 * Request body: { currentPassword, newPassword }
 * Validates current password and enforces minimum 8-character requirement
 * Clears all active tokens to force re-authentication
 */
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword)
    return res.status(400).json({ ok: false, error: 'Missing required fields.' })
  if (newPassword.length < 8)
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters.' })

  const authHeader  = req.headers['authorization'] || ''
  const tkn         = authHeader.replace(/^Bearer /i, '').trim()
  const tokenData   = activeTokens.get(tkn) || {}

  const users = loadDentists()
  const idx   = users.findIndex(d => d.username === tokenData.username)

  if (idx !== -1) {
    if (currentPassword !== users[idx].password)
      return res.status(401).json({ ok: false, error: 'Current password is incorrect.' })
    users[idx].password = newPassword
    saveDentists(users)
    activeTokens.clear()
    console.log('Password changed for:', tokenData.username)
    return res.json({ ok: true, message: 'Password changed. Please log in again.' })
  }

  // Fallback: legacy credentials.json
  const creds = loadCredentials()
  if (currentPassword !== creds.password)
    return res.status(401).json({ ok: false, error: 'Current password is incorrect.' })
  creds.password = newPassword
  saveCredentials(creds)
  activeTokens.clear()
  console.log('Password changed successfully')
  res.json({ ok: true, message: 'Password changed. Please log in again.' })
})

module.exports = router