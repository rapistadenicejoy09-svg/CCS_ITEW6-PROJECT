import { openDb, initDb } from './db.js'

export function openSqliteStore() {
  const db = openDb()
  initDb(db)

  return {
    getLoginAttempt(identifier) {
      return db
        .prepare('SELECT identifier, count, locked_until FROM login_attempts WHERE identifier = ?')
        .get(identifier)
    },

    upsertLoginAttempt(identifier, count, lockedUntil) {
      db.prepare(
        `INSERT INTO login_attempts(identifier, count, locked_until)
         VALUES(?, ?, ?)
         ON CONFLICT(identifier) DO UPDATE SET count = excluded.count, locked_until = excluded.locked_until`,
      ).run(identifier, count, lockedUntil)
    },

    clearLoginAttempt(identifier) {
      db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(identifier)
    },

    /**
     * @param {string} identifier - Normalized login identifier (lowercased, trimmed).
     */
    findUserByLoginCredential(identifier) {
      return db
        .prepare(
          `SELECT id, role, identifier, student_id, email, full_name, password_hash, twofa_enabled, twofa_backup_code, twofa_secret,
                  COALESCE(is_active, 1) AS is_active
           FROM users
           WHERE (role != 'student' AND identifier = ?)
              OR (role = 'student' AND (identifier = ? OR (email IS NOT NULL AND lower(trim(email)) = ?)))`,
        )
        .get(identifier, identifier, identifier)
    },

    getUserByIdForAuth(id) {
      return db
        .prepare(
          `SELECT id, role, identifier, student_id, email, full_name, twofa_enabled, COALESCE(is_active, 1) AS is_active
           FROM users WHERE id = ?`,
        )
        .get(id)
    },

    findUserByIdentifier(identifier) {
      return db.prepare('SELECT id FROM users WHERE identifier = ?').get(identifier)
    },

    findStudentDuplicate(studentIdNorm, emailNorm) {
      return db
        .prepare(
          `SELECT id FROM users WHERE identifier = ?
             OR (email IS NOT NULL AND lower(trim(email)) = ?)
             OR (role = 'student' AND student_id IS NOT NULL AND lower(trim(student_id)) = ?)`,
        )
        .get(studentIdNorm, emailNorm, studentIdNorm)
    },

    createUser({
      role,
      identifier,
      fullName,
      passwordHash,
      enable2FA,
      backupCode,
      createdAtIso,
      classSection,
      studentType,
      studentIdStored,
      emailStored,
    }) {
      db.prepare(
        `INSERT INTO users(role, identifier, full_name, password_hash, twofa_enabled, twofa_backup_code, created_at, class_section, student_type, student_id, email, is_active)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).run(
        role,
        identifier,
        fullName,
        passwordHash,
        enable2FA ? 1 : 0,
        backupCode,
        createdAtIso,
        classSection,
        studentType,
        studentIdStored,
        emailStored,
      )
    },

    createSession({ token, userId, createdAtIso, expiresAtIso }) {
      db.prepare('INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES(?, ?, ?, ?)').run(
        token,
        userId,
        createdAtIso,
        expiresAtIso,
      )
    },

    getSessionByToken(token) {
      return db.prepare('SELECT token, user_id, expires_at FROM sessions WHERE token = ?').get(token)
    },

    deleteSessionByToken(token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    },

    setTwofaSecret(userId, twofaSecretBase32) {
      db.prepare('UPDATE users SET twofa_secret = ? WHERE id = ?').run(twofaSecretBase32, userId)
    },

    getTwofaSecret(userId) {
      return db.prepare('SELECT twofa_secret FROM users WHERE id = ?').get(userId)
    },

    enableTwofa(userId) {
      db.prepare('UPDATE users SET twofa_enabled = 1 WHERE id = ?').run(userId)
    },

    listAdminUsers() {
      return db
        .prepare(
          `SELECT id, role, identifier, student_id, email, full_name, twofa_enabled, created_at,
                  class_section, student_type, COALESCE(is_active, 1) AS is_active
           FROM users`,
        )
        .all()
    },

    getAdminUserById(id) {
      return db
        .prepare(
          `SELECT id, role, identifier, student_id, email, full_name, twofa_enabled, created_at,
                  class_section, student_type, COALESCE(is_active, 1) AS is_active
           FROM users WHERE id = ?`,
        )
        .get(id)
    },

    updateUserIsActive(id, isActive) {
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
      return db
        .prepare(
          `SELECT id, role, identifier, student_id, email, full_name, twofa_enabled, created_at,
                  class_section, student_type, COALESCE(is_active, 1) AS is_active
           FROM users WHERE id = ?`,
        )
        .get(id)
    },

    listInstructions() {
      return db.prepare('SELECT * FROM instructions ORDER BY id DESC').all()
    },

    getInstructionById(id) {
      return db.prepare('SELECT * FROM instructions WHERE id = ?').get(id)
    },

    createInstruction(data) {
      const stmt = db.prepare(`
        INSERT INTO instructions (type, title, course, subject, description, status, author, link, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(data.type, data.title, data.course, data.subject, data.description, data.status, data.author, data.link, data.created_at, data.updated_at)
      return info.lastInsertRowid
    },

    updateInstruction(id, data) {
      const stmt = db.prepare(`
        UPDATE instructions SET type = ?, title = ?, course = ?, subject = ?, description = ?, status = ?, author = ?, link = ?, updated_at = ?
        WHERE id = ?
      `)
      stmt.run(data.type, data.title, data.course, data.subject, data.description, data.status, data.author, data.link, data.updated_at, id)
    },

    deleteInstruction(id) {
      db.prepare('DELETE FROM instructions WHERE id = ?').run(id)
    },
  }
}

