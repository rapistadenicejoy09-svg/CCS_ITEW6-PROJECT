import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Environment loading logic
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnvFile() {
  try {
    const envPath = path.join(rootDir, '.env');
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = String(line || '').trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) process.env[key] = value;
    }
  } catch (err) { }
}
loadEnvFile();

async function migrate() {
  const mongoUri = String(process.env.MONGODB_URI || '').trim()
  const dbName = process.env.MONGODB_DB || ''
  
  if (!mongoUri || !dbName) {
      console.error('Missing Mongo details');
      process.exit(1);
  }

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);
  const subjects = db.collection('subjects');

  try {
      const result = await subjects.updateMany(
          { units: { $exists: true } },
          { $rename: { 'units': 'credits' } }
      );
      console.log(`Updated ${result.modifiedCount} subjects to use 'credits' instead of 'units'`);
      process.exit(0);
  } catch (err) {
      console.error(err);
      process.exit(1);
  }
}

migrate();
