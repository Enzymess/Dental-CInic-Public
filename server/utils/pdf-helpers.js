'use strict'

const { rgb } = require('pdf-lib')

function drawCheckbox(page, x, y, checked, font, size = 9) {
  page.drawRectangle({ x, y: y - 1, width: 9, height: 9, borderColor: rgb(0.3,0.3,0.3), borderWidth: 1 })
  if (checked) {
    page.drawText('/', { x: x + 1, y, size, font, color: rgb(0.04,0.37,0.66) })
  }
}

function drawSectionHeader(page, text, x, y, width, font) {
  page.drawRectangle({ x, y: y - 3, width, height: 16, color: rgb(0.9,0.95,1) })
  page.drawText(text, { x: x + 4, y, size: 10, font, color: rgb(0.04,0.37,0.66) })
  return y - 20
}

module.exports = { drawCheckbox, drawSectionHeader }
