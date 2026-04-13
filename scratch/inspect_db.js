import { MongoClient } from 'mongodb'

const MONGO_URI = 'mongodb+srv://rapistadenicejoy09_db_user:Password123@cluster0.wdjruwj.mongodb.net/?appName=Cluster0'
const DB_NAME = 'CCSPS_db'

async function run() {
  const client = new MongoClient(MONGO_URI)
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    
    console.log('--- Random Student ---')
    const student = await db.collection('users').findOne({ role: 'student' })
    console.log(JSON.stringify(student, null, 2))
    
    console.log('\n--- Random Instruction ---')
    const instruction = await db.collection('instructions').findOne({})
    console.log(JSON.stringify(instruction, null, 2))
    
  } catch (err) {
    console.error(err)
  } finally {
    await client.close()
  }
}

run()
