/**
 * AUTHENTICATION MIDDLEWARE
 * =========================
 * Provides requireAuth middleware to protect routes.
 * Usage: router.get('/protected', requireAuth, handler)
 */

'use strict'

const { activeTokens } = require('../config')

const TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000 // 8 hours

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  // Token expiry check
  const td = activeTokens.get(token)
  if (Date.now() - td.createdAt > TOKEN_MAX_AGE_MS) {
    activeTokens.delete(token)
    return res.status(401).json({ ok: false, error: 'Session expired. Please log in again.' })
  }

  next()
}

module.exports = { requireAuth }
