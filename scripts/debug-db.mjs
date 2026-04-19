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

async function debug() {
  console.log('--- Starting DB Debug ---')
  loadEnv()
  
  try {
    const store = await openStore()
    console.log('✅ Connected to MongoDB')
    
    // Test fetch all (projections test)
    try {
      const users = await store.listAdminUsers()
      console.log(`✅ Fetched ${users.length} users`)
      const ids = users.map(u => u.id)
      console.log('Existing IDs:', ids)
      
      const nullIds = users.filter(u => u.id === null || u.id === undefined)
      if (nullIds.length > 1) {
        console.error(`❌ FOUND CORRUPTED DATA: ${nullIds.length} users have NULL/UNDEFINED IDs. This will cause duplicate key errors.`)
      }
    } catch (e) {
      console.error('❌ Failed to list users:', e.message)
    }

    // Test Creation logic
    console.log('--- Testing Create User Logic ---')
    const testEmail = `test_${Date.now()}@example.com`
    const testId = `TEST_${Date.now()}`
    
    try {
      await store.createUser({
        role: 'student',
        identifier: testId,
        fullName: 'Test User',
        passwordHash: 'fake_hash',
        enable2FA: false,
        createdAtIso: new Date().toISOString(),
        studentIdStored: testId,
        emailStored: testEmail,
        academicInfo: { program: 'CS', year_level: '1st Year' }
      })
      console.log('✅ Successfully created test user')
      
      // Cleanup
      // Since there is no store.deleteUser, we can't easily clean up via store
      // but we know creation works if it gets here.
    } catch (e) {
      console.error('❌ CREATE USER FAILED:', e)
    }

  } catch (err) {
    console.error('❌ FAILED TO CONNECT:', err)
  }
  process.exit(0)
}

debug()
