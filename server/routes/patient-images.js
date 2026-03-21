'use strict'

const express  = require('express')
const router   = express.Router()
const fsSync   = require('fs')
const { promises: fs } = require('fs')
const path     = require('path')
const { requireAuth } = require('../middleware/auth')
const { patientsDir } = require('../config')
const { uploadPatientImage } = require('../config/storage')
const { makeId } = require('../utils/helpers')

const metaPath = (folderName) => path.join(patientsDir, folderName, 'images', 'metadata.json')

async function readMeta(folderName) {
  const p = metaPath(folderName)
  if (!fsSync.existsSync(p)) return []
  return JSON.parse(await fs.readFile(p, 'utf8'))
}

async function writeMeta(folderName, meta) {
  await fs.writeFile(metaPath(folderName), JSON.stringify(meta, null, 2), 'utf8')
}

// GET /patient-images/:folderName
router.get('/patient-images/:folderName', requireAuth, async (req, res) => {
  try {
    const { folderName } = req.params
    const metadata = await readMeta(folderName)
    res.json(metadata.map(img => ({
      ...img,
      path:          `/patients/${folderName}/images/${img.filename}`,
      thumbnailPath: img.thumbnailFilename ? `/patients/${folderName}/images/${img.thumbnailFilename}` : null
    })))
  } catch (err) {
    console.error('GET /patient-images error:', err)
    res.status(500).json({ error: 'Failed to load images' })
  }
})

// POST /patient-images/:folderName
router.post('/patient-images/:folderName', requireAuth, uploadPatientImage.single('image'), async (req, res) => {
  try {
    const { folderName } = req.params
    const { tag, notes, isBefore, pairedImageId } = req.body
    if (!req.file) return res.status(400).json({ error: 'No image file provided' })

    const thumbFilename = `thumb_${req.file.filename}`
    const isBeforeBool  = isBefore === 'true'
    const entry = {
      id: makeId(), filename: req.file.filename, thumbnailFilename: thumbFilename,
      tag: tag || 'other', notes: notes || '',
      isBefore: isBeforeBool, isAfter: tag === 'before-after' && !isBeforeBool,
      pairedImageId: pairedImageId || null, uploadedAt: new Date().toISOString()
    }

    const imgFolder = path.join(patientsDir, folderName, 'images')
    await fs.copyFile(path.join(imgFolder, req.file.filename), path.join(imgFolder, thumbFilename))

    const metadata = await readMeta(folderName)
    if (pairedImageId) {
      const paired = metadata.find(i => i.id === pairedImageId)
      if (paired) paired.pairedImageId = entry.id
    }
    metadata.push(entry)
    await writeMeta(folderName, metadata)

    res.json({
      ok: true, id: entry.id,
      image: { ...entry, path: `/patients/${folderName}/images/${entry.filename}`, thumbnailPath: `/patients/${folderName}/images/${entry.thumbnailFilename}` }
    })
  } catch (err) {
    console.error('POST /patient-images error:', err)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

// DELETE /patient-images/:folderName/:imageId
router.delete('/patient-images/:folderName/:imageId', requireAuth, async (req, res) => {
  try {
    const { folderName, imageId } = req.params
    const metadata = await readMeta(folderName)
    const idx = metadata.findIndex(i => i.id === imageId)
    if (idx === -1) return res.status(404).json({ error: 'Image not found' })

    const img = metadata[idx]
    const imgFolder = path.join(patientsDir, folderName, 'images')
    ;[img.filename, img.thumbnailFilename].forEach(fn => {
      const p = path.join(imgFolder, fn)
      if (fn && fsSync.existsSync(p)) fsSync.unlinkSync(p)
    })
    if (img.pairedImageId) {
      const paired = metadata.find(i => i.id === img.pairedImageId)
      if (paired) paired.pairedImageId = null
    }
    metadata.splice(idx, 1)
    await writeMeta(folderName, metadata)
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /patient-images error:', err)
    res.status(500).json({ error: 'Failed to delete image' })
  }
})

// PUT /patient-images/:folderName/:imageId/notes
router.put('/patient-images/:folderName/:imageId/notes', requireAuth, async (req, res) => {
  try {
    const { folderName, imageId } = req.params
    const { notes, pairedImageId } = req.body
    const metadata = await readMeta(folderName)
    const img = metadata.find(i => i.id === imageId)
    if (!img) return res.status(404).json({ error: 'Image not found' })
    img.notes = notes
    if (pairedImageId !== undefined) img.pairedImageId = pairedImageId
    await writeMeta(folderName, metadata)
    res.json({ ok: true })
  } catch (err) {
    console.error('PUT /patient-images notes error:', err)
    res.status(500).json({ error: 'Failed to update notes' })
  }
})

module.exports = router
