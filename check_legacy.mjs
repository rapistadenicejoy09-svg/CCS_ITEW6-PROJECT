import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const schedules = await db.collection('schedules').find({}).toArray();
  const loads = await db.collection('teaching_loads').find({}).toArray();
  const users = await db.collection('users').find({ role: { $ne: 'student' } }).toArray();
  
  console.log(`Total Schedules: ${schedules.length}`);
  console.log(`Schedules without instructorId: ${schedules.filter(s => !s.instructorId).length}`);
  console.log(`Schedules without subjectId: ${schedules.filter(s => !s.subjectId).length}`);
  
  console.log('\n--- SAMPLE NAME-ONLY sCHEDULES ---');
  schedules.filter(s => !s.instructorId).slice(0, 10).forEach(s => {
    console.log(JSON.stringify({ id: s.id, instructor: s.instructor, subject: s.subjectCode, course: s.course }));
  });

  console.log('\n--- FACULTY RECORDS ---');
  users.forEach(u => {
    console.log(JSON.stringify({ id: u.id, name: u.full_name, email: u.email }));
  });

  await client.close();
}

check().catch(console.error);
