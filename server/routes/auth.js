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
const { loadCredentials, saveCredentials, activeTokens } = require('../config')
const { requireAuth } = require('../middleware/auth')
const { makeId } = require('../utils/helpers')

/**
 * POST /login - Authenticate user and receive JWT token
 * Request body: { username, password }
 * Response: { ok: true, token } or { ok: false, error }
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  const creds = loadCredentials()
  if (username === creds.username && password === creds.password) {
    const token = makeId()
    activeTokens.set(token, { username, createdAt: Date.now() })
    console.log(`Admin login: ${username}`)
    return res.json({ ok: true, token })
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
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword)
    return res.status(400).json({ ok: false, error: 'Missing required fields.' })
  if (newPassword.length < 8)
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters.' })

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
