import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' }); // Root is above server

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const faculty = await db.collection('users').find({ role: 'faculty_professor' }).toArray();
  const bios = ['Passionate about teaching algorithms and data structures.', 'Experienced educator with a focus on web development technologies.', 'Dedicated to fostering research and innovation in computer science.'];
  const specs = ['Software Engineering', 'Data Science', 'Web Technologies', 'Cybersecurity'];
  
  for(let i=0; i<faculty.length; i++){
    const u = faculty[i];
    await db.collection('users').updateOne({ _id: u._id }, { $set: { bio: bios[i % bios.length], department: 'Information Technology', specialization: specs[i % specs.length], 'personal_information.phone': '0912-345-' + Math.floor(1000 + Math.random() * 9000) } });
  }
  
  console.log('Updated ' + faculty.length);
  await client.close();
}

seed().catch(console.error);
