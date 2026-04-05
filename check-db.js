const { MongoClient } = require('mongodb');
require('dotenv').config();

async function main() {
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    const db = client.db('ccs-dashboard');
    const users = db.collection('users');
    
    // Find the user by the student ID from the user's screenshot
    const user = await users.findOne({ student_id: "9876543" });
    console.log('Database Check:', JSON.stringify({
        id: user.id,
        idType: typeof user.id,
        is_active: user.is_active,
        is_activeType: typeof user.is_active
    }, null, 2));
    
    await client.close();
}
main().catch(console.error);
