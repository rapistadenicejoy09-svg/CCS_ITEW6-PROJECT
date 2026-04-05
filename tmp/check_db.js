import { openStore } from '../server/store.js'

async function checkDb() {
  try {
    const store = await openStore()
    console.log('Store opened.')
    
    // Check users
    const users = await store.listAdminUsers()
    console.log(`Current user count: ${users.length}`)
    console.log('User IDs in DB:', users.map(u => u.id))
    
    process.exit(0)
  } catch (err) {
    console.error('Error checking DB:', err)
    process.exit(1)
  }
}

checkDb()
