import { openMongoStore } from './store-mongo.js'

export async function openStore() {
  return await openMongoStore()
}
