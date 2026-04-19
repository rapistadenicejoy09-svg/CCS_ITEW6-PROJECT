import { MongoClient } from 'mongodb'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function loadUri() {
  const envPath = path.join(rootDir, '.env')
  if (!fs.existsSync(envPath)) return null
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('$env:MONGODB_URI=')) {
      let v = trimmed.slice(17).trim()
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      return v
    }
  }
  return null
}

async function test() {
  const uri = loadUri()
  console.log('Testing URI:', uri)
  if (!uri) throw new Error('No URI')
  
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })
  console.log('Connecting...')
  await client.connect()
  console.log('Connected!')
  const db = client.db('CCSPS_db')
  console.log('Ping...')
  await db.command({ ping: 1 })
  console.log('Pong!')
  
  const users = db.collection('users')
  console.log('Checking for duplicates...')
  const docs = await users.find({}).toArray()
  console.log(`Found ${docs.length} users.`)
  
  await client.close()
  process.exit(0)
}

test().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
