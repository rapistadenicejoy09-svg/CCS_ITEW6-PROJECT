import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'app.sqlite')

export function openDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('admin','student','faculty')),
      identifier TEXT NOT NULL UNIQUE, -- email or idOrEmail (normalized lower)
      full_name TEXT,
      password_hash TEXT NOT NULL,
      twofa_enabled INTEGER NOT NULL DEFAULT 0,
      twofa_backup_code TEXT,
      twofa_secret TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      identifier TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS instructions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      course TEXT,
      subject TEXT,
      description TEXT,
      status TEXT NOT NULL,
      author TEXT,
      link TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // Apply schema migrations
  try {
    db.exec(`ALTER TABLE users ADD COLUMN twofa_secret TEXT;`);
  } catch (e) {
    // Ignore if column already exists
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN class_section TEXT;`);
  } catch (e) {
    // ignore
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN student_type TEXT DEFAULT 'regular';`);
  } catch (e) {
    // ignore
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
  } catch (e) {
    // ignore
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN student_id TEXT;`);
  } catch (e) {
    // ignore
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN email TEXT;`);
  } catch (e) {
    // ignore
  }

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (key TEXT PRIMARY KEY)`)
  const migrated = db.prepare(`SELECT 1 FROM schema_migrations WHERE key = ?`).get('student_id_email_v1')
  if (!migrated) {
    migrateLegacyStudentIdentifier(db)
    db.prepare(`INSERT INTO schema_migrations (key) VALUES (?)`).run('student_id_email_v1')
  }
}

/**
 * Split legacy student rows where `identifier` held either a student ID or an email.
 * New logins for migrated email-only rows: use email; student_id is shown as STU-{id} until edited in DB.
 */
function migrateLegacyStudentIdentifier(db) {
  const hasCol = db.prepare(`PRAGMA table_info(users)`).all().some((c) => c.name === 'student_id')
  if (!hasCol) return

  const students = db.prepare(`SELECT id, identifier FROM users WHERE role = 'student'`).all()
  for (const row of students) {
    const raw = String(row.identifier || '').trim()
    const lower = raw.toLowerCase()
    if (lower.includes('@')) {
      const newIdent = `stu-${row.id}`
      const normIdent = newIdent.toLowerCase().replace(/\s+/g, '')
      db.prepare(
        `UPDATE users SET email = ?, student_id = ?, identifier = ? WHERE id = ?`,
      ).run(lower, `STU-${row.id}`, normIdent, row.id)
    } else {
      db.prepare(`UPDATE users SET student_id = ?, email = NULL WHERE id = ?`).run(raw, row.id)
    }
  }
}

