'use strict'

const CLINIC_DENTIST_NAME = 'Dr. Dela Cruz'

const procedurePrices = {
  'Extraction': 1500, 'Simple Extraction': 1500, 'Surgical Extraction': 3500,
  'Impacted Extraction': 6500, 'Filling': 1800, 'Amalgam Filling': 1500,
  'Composite Filling': 2200, 'Tooth-Colored Filling': 2200, 'Inlay': 4500,
  'Root Canal': 8000, 'Root Canal Treatment': 8000, 'Pulp Capping': 2500,
  'Cleaning': 1200, 'Prophylaxis': 1200, 'Oral Prophylaxis': 1200,
  'Scaling': 1200, 'Scaling and Polishing': 1500, 'Fluoride Treatment': 900,
  'Sealant': 1200, 'Crown': 12000, 'Jacket Crown': 12000, 'Bridge': 18000,
  'Denture': 15000, 'Partial Denture': 12000, 'Full Denture': 18000,
  'Implant': 45000, 'Braces': 35000, 'Retainer': 5000,
  'Consultation': 500, 'X-Ray': 800, 'Periapical X-Ray': 500,
  'Panoramic X-Ray': 1500, 'Whitening': 5000, 'Bleaching': 5000,
  'Tooth Whitening': 5000,
}

function lookupProcedurePrice(procedureName) {
  if (!procedureName) return 0
  const name = String(procedureName).trim()
  for (const [key, price] of Object.entries(procedurePrices)) {
    if (key.toLowerCase() === name.toLowerCase()) return price
  }
  for (const [key, price] of Object.entries(procedurePrices)) {
    if (name.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(name.toLowerCase())) return price
  }
  return 0
}

function generateBillingFromRecord(record, existingBilling = null) {
  const procedure   = record.procedure || ''
  const toothNumber = record.ToothNo   || ''
  const price       = lookupProcedurePrice(procedure)
  const charged     = parseFloat(record.amountChanged) || 0
  const amountPaid  = parseFloat(record.amountPaid)    || 0
  const resolvedPrice = charged > 0 ? charged : price
  const items = resolvedPrice > 0 ? [{ toothNumber, procedure, price: resolvedPrice }] : []
  const totalAmount = items.reduce((sum, i) => sum + i.price, 0)
  const expenses    = existingBilling ? (parseFloat(existingBilling.expenses) || 0) : 0
  const netProfit   = totalAmount - expenses
  const balance     = charged - amountPaid

  let paymentStatus
  if (charged <= 0) {
    paymentStatus = existingBilling ? (existingBilling.paymentStatus || 'unpaid') : 'unpaid'
  } else {
    paymentStatus = balance <= 0 ? 'paid' : 'unpaid'
  }

  let paymentDate = existingBilling ? (existingBilling.paymentDate || null) : null
  if (paymentStatus === 'paid' && !paymentDate) paymentDate = new Date().toISOString()

  return { items, totalAmount, expenses, netProfit, paymentStatus, paymentDate }
}

module.exports = { CLINIC_DENTIST_NAME, procedurePrices, lookupProcedurePrice, generateBillingFromRecord }
