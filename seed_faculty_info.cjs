const { MongoClient } = require('mongodb');
require('dotenv').config();

const bios = [
  "Passionate about teaching algorithms and data structures.",
  "Experienced educator with a focus on web development technologies.",
  "Dedicated to fostering research and innovation in computer science.",
  "Specializes in software engineering principles and design patterns.",
  "A technology enthusiast aiming to bridge academia and industry.",
  "Currently researching advanced database optimization techniques.",
  "Bringing real-world tech industry experience into the classroom.",
  "Advocate for inclusive and accessible tech education."
];

const specializations = [
  "Software Engineering",
  "Data Science",
  "Web Technologies",
  "Cybersecurity",
  "Artificial Intelligence",
  "Information Systems",
  "Networking",
];

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const faculty = await db.collection('users').find({ role: 'faculty_professor' }).toArray();
  
  console.log(`Found ${faculty.length} faculty members.`);
  
  for (let i = 0; i < faculty.length; i++) {
    const f = faculty[i];
    
    // Check if missing info
    const updatePayload = { $set: {} };
    let hasChanges = false;
    
    if (!f.bio) {
      updatePayload.$set.bio = bios[i % bios.length];
      hasChanges = true;
    }
    if (!f.department || !f.summary?.department) {
      updatePayload.$set.department = "Information Technology";
      if (!updatePayload.$set.summary) updatePayload.$set.summary = f.summary || {};
      updatePayload.$set.summary.department = "Information Technology";
      hasChanges = true;
    }
    if (!f.specialization || !f.summary?.specialization) {
      updatePayload.$set.specialization = specializations[i % specializations.length];
      if (!updatePayload.$set.summary) updatePayload.$set.summary = f.summary || {};
      updatePayload.$set.summary.specialization = specializations[i % specializations.length];
      hasChanges = true;
    }
    
    // Make sure personal_information is somewhat filled
    if (!f.personal_information) {
       updatePayload.$set.personal_information = {
           first_name: "Prof.",
           last_name: f.full_name?.split(' ').pop() || "Faculty",
           phone: "0912-345-" + Math.floor(1000 + Math.random() * 9000)
       };
       hasChanges = true;
    } else if (!f.personal_information.phone) {
       updatePayload.$set["personal_information.phone"] = "0912-345-" + Math.floor(1000 + Math.random() * 9000);
       hasChanges = true;
    }
    
    if (hasChanges) {
       await db.collection('users').updateOne({ _id: f._id }, updatePayload);
       console.log(`Updated faculty: ${f.full_name}`);
    } else {
       console.log(`Skipped faculty: ${f.full_name} (already has info)`);
    }
  }

  await client.close();
  console.log('Done mapping faculty info.');
}

seed().catch(console.error);
