/**
 * TOOTH TEMPLATE INITIALIZATION
 * ==============================
 * Manages tooth drawing templates for patient records.
 * Copies base tooth template image to each patient folder for all tooth positions.
 * Supports FDI tooth numbering system (1-48 permanent, 51-85 deciduous/temporary).
 */

'use strict'

const fsSync = require('fs')
const { promises: fs } = require('fs')
const path = require('path')
const { teethBaseDir } = require('../config')

/**
 * FDI TOOTH NUMBERING SYSTEM
 * ==========================
 * International standard for identifying individual teeth:
 * - Permanent:  11-18 (upper right), 21-28 (upper left),
 *               31-38 (lower left), 41-48 (lower right)
 * - Deciduous:  51-55 (upper right), 61-65 (upper left),
 *               71-75 (lower left), 81-85 (lower right)
 */
const TOOTH_NUMBERS = [
  11,12,13,14,15,16,17,18,
  21,22,23,24,25,26,27,28,
  31,32,33,34,35,36,37,38,
  41,42,43,44,45,46,47,48,
  51,52,53,54,55,
  61,62,63,64,65,
  71,72,73,74,75,
  81,82,83,84,85
]

/**
 * Initialize patient tooth drawing templates
 * Copies base tooth template to patient folder for all tooth positions
 * Warns if base template not found but continues gracefully
 * @param {string} patientFolder - Path to patient's folder
 * @returns {Promise<void>}
 */
async function initializePatientTeeth(patientFolder) {
  const possibleBaseFiles = ['teeth_base.png']
  let baseToothPath = null
  for (const fn of possibleBaseFiles) {
    const testPath = path.join(teethBaseDir, fn)
    if (fsSync.existsSync(testPath)) { baseToothPath = testPath; break }
  }

  if (!baseToothPath) {
    console.warn('No base tooth template found in Files/teeth_base/')
    return
  }

  let copied = 0
  for (const num of TOOTH_NUMBERS) {
    const dest = path.join(patientFolder, `tooth_${num}.jpg`)
    if (fsSync.existsSync(dest)) continue
    try { await fs.copyFile(baseToothPath, dest); copied++ }
    catch (err) { console.warn(`Could not copy tooth ${num}:`, err.message) }
  }
  console.log(`Copied ${copied} tooth images to patient folder`)
}

module.exports = { initializePatientTeeth, TOOTH_NUMBERS }
