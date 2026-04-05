import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  const client = await MongoClient.connect(process.env.MONGODB_URI)
  const db = client.db('ccs-dashboard')
  const users = db.collection('users')
  
  const student = await users.findOne({ id: 9876543 }) // From user's screenshot
  console.log('Student Info:', JSON.stringify(student, null, 2))
  
  await client.close()
}
main()
