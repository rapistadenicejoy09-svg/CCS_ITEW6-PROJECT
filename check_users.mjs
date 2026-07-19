import { MongoClient } from 'mongodb';

async function run() {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  const res = await c.db().collection('users').find({}).toArray();
  for(const u of res) {
     console.log(u.email, u.role, u.is_legacy);
  }
  await c.close();
}
run();
