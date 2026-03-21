/**
 * AUTHENTICATION MIDDLEWARE
 * =========================
 * 
 * This module provides Express middleware to protect routes from unauthorized access.
 * It validates JWT tokens that are passed in the Authorization header.
 * 
 * Usage:
 *   router.get('/protected-route', requireAuth, (req, res) => { ... })
 * 
 * Expected header format:
 *   Authorization: Bearer <token>
 */

'use strict'

const { activeTokens } = require('../config')

/**
 * REQUIRE AUTHENTICATION MIDDLEWARE
 * ==================================
 * 
 * Validates that the request includes a valid Bearer token in the Authorization header.
 * If the token is missing or invalid, returns a 401 Unauthorized response.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @returns Calls next() if token is valid, or sends 401 response if invalid
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }
  next()
}

module.exports = { requireAuth }
