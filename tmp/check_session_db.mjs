import { MongoClient } from 'mongodb'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function loadEnv() {
  const env = {}
  try {
    const raw = fs.readFileSync(path.join(rootDir, '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      if (trimmed.startsWith('$env:')) {
        const m = trimmed.match(/^\$env:(\w+)=(?:"([^"]*)"|'([^']*)'|(.*))$/)
        if (m) env[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
      } else {
        const idx = trimmed.indexOf('=')
        if (idx !== -1) {
          env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
        }
      }
    }
  } catch {}
  return env
}

async function checkSessions() {
  const env = loadEnv()
  const uri = env.MONGODB_URI
  const dbName = env.MONGODB_DB || (new URL(uri).pathname.slice(1))
  
  const client = new MongoClient(uri)
  try {
    await client.connect()
    console.log(`Connected to ${dbName}`)
    const db = client.db(dbName)
    const sessions = await db.collection('sessions').find({}).toArray()
    console.log(`Total sessions: ${sessions.length}`)
    sessions.forEach(s => {
      console.log(`Token: ${s.token.slice(0, 8)}... UserID: ${s.user_id} Expires: ${s.expires_at}`)
    })
    
    const users = await db.collection('users').find({}).toArray()
    console.log(`Total users: ${users.length}`)
    users.forEach(u => {
      console.log(`User: ${u.identifier} Role: ${u.role}`)
    })
  } catch (err) {
    console.error(err)
  } finally {
    await client.close()
  }
}

checkSessions()
