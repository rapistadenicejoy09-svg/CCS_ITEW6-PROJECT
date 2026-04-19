import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStore } from '../server/store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function loadEnv() {
  const envPath = path.join(rootDir, '.env')
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    let key, value
    if (trimmed.startsWith('$env:')) {
      const m = trimmed.match(/^\$env:(\w+)=(?:"([^"]*)"|'([^']*)'|(.*))$/)
      if (m) {
        key = m[1]
        value = m[2] ?? m[3] ?? m[4] ?? ''
      }
    } else {
      const idx = trimmed.indexOf('=')
      if (idx !== -1) {
        key = trimmed.slice(0, idx).trim()
        value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
      }
    }
    if (key) process.env[key] = value
  }
}

async function debugAuth() {
  loadEnv()
  try {
    const store = await openStore()
    // Test the specific user that is likely logged in (Admin, say ID 4)
    const userRole3 = await store.getUserByIdForAuth(3)
    const userRole4 = await store.getUserByIdForAuth(4)
    console.log('User 3 Role:', userRole3?.role)
    console.log('User 4 Role:', userRole4?.role)
    console.log('Full User 4:', JSON.stringify(userRole4))
  } catch (err) {
    console.error('Debug failed:', err)
  }
  process.exit(0)
}

debugAuth()
