/**
 * UTILITY HELPER FUNCTIONS
 * ========================
 * 
 * This module contains general-purpose utility functions used throughout the
 * application for data formatting, transformation, and validation.
 */

'use strict'

const crypto = require('crypto')

/**
 * SAFE PDF TEXT
 * ==============
 * Sanitizes text for safe inclusion in PDF files by replacing special Unicode
 * characters (checkmarks, bullets, etc.) with ASCII equivalents
 * 
 * @param {string} code - The text to sanitize
 * @returns {string} Sanitized text safe for PDF rendering
 */
function _safePdfText(code) {
  if (!code) return ''
  return String(code)
    .replace(/[\u2713\u2714\u2611\u2705\u2714]/g, 'P')
    .replace(/[^\x20-\x7E]/g, '?')
}

/**
 * STRING COERCION WITH NULL HANDLING
 * ===================================
 * Safely converts any value to string, returning empty string for null/undefined
 * 
 * @param {*} val - Value to convert
 * @returns {string} String representation or empty string
 */
function s(val) {
  if (val === null || val === undefined) return ''
  return String(val)
}

/**
 * GENERATE UNIQUE IDENTIFIER
 * ==========================
 * Creates a cryptographically random ID using Node's crypto module.
 * Falls back to SHA1 hash if crypto.randomUUID is unavailable.
 * 
 * @returns {string} Unique identifier
 */
function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return crypto.createHash('sha1').update(Date.now() + Math.random().toString()).digest('hex')
}

/**
 * FORMAT DATE FOR FILENAME
 * ========================
 * Converts a date string into a filename-safe format (YYYY-MM-DD)
 * with special handling for invalid dates
 * 
 * @param {string} raw - Input date string (any format)
 * @returns {string} Formatted date string suitable for filenames
 */
function formatDateForFilename(raw) {
  if (!raw) return 'no-date'
  const d = new Date(raw)
  if (isNaN(d)) return String(raw).slice(0, 10).replace(/[:/]/g, '-')
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * CALCULATE AGE FROM BIRTHDATE
 * =============================
 * Computes patient age based on birthdate, accounting for the current month/day
 * 
 * @param {string} birthdate - ISO date string of birth
 * @returns {string} Age as a string, or empty string if date is invalid
 */
function calculateAge(birthdate) {
  if (!birthdate) return ''
  const birthDate = new Date(birthdate)
  if (isNaN(birthDate)) return ''
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--
  return String(age)
}

/**
 * GENERATE PATIENT LOOKUP KEY
 * =============================
 * Creates a normalized key to group appointments by patient identity
 * Uses: lastName | firstName | middleName | birthdate
 * All components are lowercase for case-insensitive matching
 * 
 * @param {Object} entry - Patient record object
 * @returns {string} Normalized patient key for grouping
 */
function getPatientKey(entry) {
  const ln = (entry.lastName  || '').trim().toLowerCase()
  const fn = (entry.firstName || '').trim().toLowerCase()
  const mn = (entry.middleName || '').trim().toLowerCase()
  const bd = entry.birthdate || ''
  return `${ln}|${fn}|${mn}|${bd}`
}

/**
 * SANITIZE PATIENT FOLDER NAME
 * =============================
 * Generates a filesystem-safe folder name from patient information.
 * Removes special characters and formats as: LastName-FirstName-MiddleName-YYYY-MM-DD
 * 
 * @param {string} key - Patient key from getPatientKey()
 * @returns {string} Filesystem-safe folder name
 */
function sanitizeFolderName(key) {
  const parts = key.split('|')
  const lastName  = parts[0] || 'Unknown'
  const firstName = parts[1] || ''
  const middleName = parts[2] || ''
  const birthdate = parts[3] ? formatDateForFilename(parts[3]) : 'no-date'
  let name = `${lastName}-${firstName}`
  if (middleName) name += `-${middleName}`
  name += `-${birthdate}`
  return name.replace(/[/\\<>:|"?*]+/g, '').replace(/\s+/g, '-')
}

/**
 * PARSE FORM DATA FIELDS
 * =======================
 * Converts string representations of arrays (from form submission) back to
 * proper JS arrays for multi-select fields like allergies, conditions, etc.
 * 
 * @param {Object} body - Raw request body object
 * @returns {Object} Parsed object with array fields properly reconstructed
 */
function parseFormDataFields(body) {
  const parsed = { ...body }
  for (const key of ['allergies','conditions','periodontalScreening','occlusion','appliances','tmd','xrayTaken']) {
    if (parsed[key] && typeof parsed[key] === 'string') {
      try { parsed[key] = JSON.parse(parsed[key]) }
      catch { parsed[key] = parsed[key].split(',').map(s => s.trim()).filter(Boolean) }
    }
  }
  return parsed
}

/**
 * WORD WRAP FOR PRESCRIPTION PDF
 * ===============================
 * Breaks long prescription text strings into multiple lines for proper
 * PDF display without horizontal scrolling
 * 
 * @param {string} text - Text to wrap
 * @param {number} maxChars - Maximum characters per line
 * @returns {Array<string>} Array of wrapped lines
 */
function wrapTextRx(text, maxChars) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  words.forEach(word => {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  })
  if (current) lines.push(current)
  return lines
}

/**
 * MODULE EXPORTS
 * ==============
 */
module.exports = {
  _safePdfText, s, makeId, formatDateForFilename,
  calculateAge, getPatientKey, sanitizeFolderName,
  parseFormDataFields, wrapTextRx
}
