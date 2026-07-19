import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function bridge() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const schedules = await db.collection('schedules').find({}).toArray();
  const loads = await db.collection('teaching_loads').find({}).toArray();
  const subjects = await db.collection('subjects').find({}).toArray();
  const subjectByCode = new Map(subjects.map(s => [String(s.code).toUpperCase(), s]));

  console.log(`Processing ${schedules.length} schedules and ${loads.length} loads...`);

  let count = 0;
  for (const s of schedules) {
    if (s.teaching_load_id) continue;

    // Find match by FacultyID, SubjectCode/ID, and Section
    const match = loads.find(l => {
        // Faculty Match
        const fMatch = String(l.faculty_id) === String(s.instructorId);
        if (!fMatch) return false;

        // Subject Match
        const sMatch = (String(l.subject_id) === String(s.subjectId)) || 
                      (String(s.subjectCode).toUpperCase() === (subjectByCode.get(String(s.subjectCode).toUpperCase())?.code || '').toUpperCase());
        
        // Wait, if subjectCode in schedule matches subject code in load's subject
        // Let's get the subject for the load
        const loadSubject = subjects.find(sub => sub.id === l.subject_id);
        const subMatch = (String(s.subjectCode).toUpperCase() === String(loadSubject?.code).toUpperCase());

        // Section Match
        const sectionMatch = (l.section === `${s.course} ${s.section}`.trim()) || (l.section_id === `${s.course} ${s.section}`.trim());

        return subMatch && sectionMatch;
    });

    if (match) {
      await db.collection('schedules').updateOne({ _id: s._id }, { $set: { teaching_load_id: match.id } });
      count++;
    }
  }

  console.log(`Successfully bridged ${count} schedules to teaching loads.`);
  await client.close();
}

bridge().catch(console.error);
