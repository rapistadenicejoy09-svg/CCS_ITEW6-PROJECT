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

async function sanitize() {
  const uri = loadUri()
  if (!uri) throw new Error('No URI')
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db('CCSPS_db')
  const users = db.collection('users')
  
  const docs = await users.find({}).toArray()
  console.log(`Initial User Count: ${docs.length}`)
  
  const seenIds = new Set()
  const seenIdentifiers = new Set()
  const toDelete = []
  
  for (const doc of docs) {
    if (doc.id === null || typeof doc.id !== 'number' || seenIds.has(doc.id)) {
      console.log(`Marking Duplicate ID for deletion: ID=${doc.id}, Name=${doc.full_name}`)
      toDelete.push(doc._id)
      continue
    }
    if (!doc.identifier || seenIdentifiers.has(doc.identifier)) {
      console.log(`Marking Duplicate Identifier for deletion: ID=${doc.id}, Identifier=${doc.identifier}`)
      toDelete.push(doc._id)
      continue
    }
    seenIds.add(doc.id)
    seenIdentifiers.add(doc.identifier)
  }
  
  if (toDelete.length > 0) {
    const res = await users.deleteMany({ _id: { $in: toDelete } })
    console.log(`Deleted ${res.deletedCount} problematic records.`)
  } else {
    console.log('No duplicates found.')
  }
  
  await client.close()
}

sanitize().catch(console.error)
