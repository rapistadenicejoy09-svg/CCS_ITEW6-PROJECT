import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function loadUri() {
  const envPath = path.join(rootDir, '.env')
  if (!fs.existsSync(envPath)) return null
  const raw = fs.readFileSync(envPath, 'utf8')
  const m = raw.match(/\$env:MONGODB_URI="([^"]*)"/)
  return m ? m[1] : null
}

async function cleanup() {
  const uri = loadUri()
  if (!uri) { console.error('No URI found'); process.exit(1) }
  
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db('CCSPS_db')
  const users = db.collection('users')
  
  const bad = await users.countDocuments({ id: null })
  console.log(`Found ${bad} records with null ID. Deleting...`)
  
  const res = await users.deleteMany({ id: null })
  console.log(`Deleted ${res.deletedCount} corrupted records.`)
  
  await client.close()
  process.exit(0)
}

cleanup()
