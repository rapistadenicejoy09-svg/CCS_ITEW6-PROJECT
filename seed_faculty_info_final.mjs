import { MongoClient } from 'mongodb';

async function seed() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;
  
  console.log('Connecting to DB:', dbName);
  
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  
  const faculty = await db.collection('users').find({ 
    role: { $in: ['dean', 'department_chair', 'secretary', 'faculty_professor', 'faculty'] }
  }).toArray();
  
  console.log('Found faculty:', faculty.length);
  
  const bios = [
   'Passionate about teaching algorithms and data structures.', 
   'Experienced educator with a focus on web development technologies.', 
   'Dedicated to fostering research and innovation in computer science.',
   'Focused on providing a strong foundation for computing students.',
   'Helping bridge the gap between abstract theory and real-world application.',
   'Specializes in curriculum development for modern technology programs.'
  ];
  const specs = ['Software Engineering', 'Data Science', 'Web Technologies', 'Cybersecurity', 'Database Administration'];
  const depts = ['Computer Science', 'Information Technology', 'Computer Engineering'];
  
  let count = 0;
  for(let i = 0; i < faculty.length; i++){
    const u = faculty[i];
    if (u.is_legacy) continue;
    
    const patch = {};
    if (!u.bio) patch.bio = bios[i % bios.length];
    if (!u.department) patch.department = depts[i % depts.length];
    if (!u.specialization) patch.specialization = specs[i % specs.length];
    if (!u.personal_information?.phone) {
      patch['personal_information.phone'] = '0912-345-' + Math.floor(1000 + Math.random() * 9000);
    }
    
    if (Object.keys(patch).length > 0) {
      await db.collection('users').updateOne({ _id: u._id }, { $set: patch });
      console.log('Updated:', u.full_name || u.email);
      count++;
    } else {
      console.log('Skipped (already complete):', u.full_name || u.email);
    }
  }
  
  console.log('\nDone! Updated', count, 'records.');
  await client.close();
}

seed().catch(err => { console.error(err); process.exit(1); });
