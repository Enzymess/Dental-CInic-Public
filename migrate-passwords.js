/**
 * migrate-passwords.js — run ONCE to hash all plain-text passwords
 * Usage: node migrate-passwords.js
 */
'use strict'
const bcrypt = require('bcrypt')
const fsSync = require('fs')
const path   = require('path')
const dentistsPath = path.join(__dirname, 'dentists.json')

if (!fsSync.existsSync(dentistsPath)) {
  console.error('dentists.json not found in project root.')
  process.exit(1)
}

const users = JSON.parse(fsSync.readFileSync(dentistsPath, 'utf8'))
let upgraded = 0

async function run() {
  for (const user of users) {
    if (user.password.startsWith('$2')) {
      console.log(`  ⊙ ${user.username} — already hashed, skipped`)
      continue
    }
    const plain = user.password
    user.password = await bcrypt.hash(plain, 12)
    upgraded++
    console.log(`  ✓ ${user.username} — hashed (was: ${plain})`)
  }
  fsSync.writeFileSync(dentistsPath, JSON.stringify(users, null, 2), 'utf8')
  console.log(`\nDone — ${upgraded} password(s) hashed. Your original passwords still work.\n`)
}
run().catch(console.error)