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

    listResearch(query = {}) {
      const { scope, year, course, author, keyword } = query
      let sql = 'SELECT * FROM research'
      const params = []
      const clauses = []

      if (scope === 'repository') clauses.push("status = 'published'")
      else if (scope === 'mine') {
        clauses.push('created_by_user_id = ?')
        params.push(query.userId)
      } else if (scope === 'adviser_review') {
        clauses.push("status = 'under_faculty_review' AND adviser_faculty_id = ?")
        params.push(query.userId)
      } else if (scope === 'pending_approval') clauses.push("status = 'pending_approval'")

      if (year) {
        clauses.push('year = ?')
        params.push(year)
      }
      if (course) {
        clauses.push('course = ?')
        params.push(course)
      }
      if (author) {
        clauses.push('authors LIKE ?')
        params.push(`%${author}%`)
      }
      if (keyword) {
        clauses.push('keywords LIKE ?')
        params.push(`%${keyword}%`)
      }

      if (clauses.length > 0) {
        sql += ' WHERE ' + clauses.join(' AND ')
      }
      sql += ' ORDER BY id DESC'

      const rows = db.prepare(sql).all(...params)
      return rows.map(r => ({
        ...r,
        keywords: JSON.parse(r.keywords || '[]'),
        authors: JSON.parse(r.authors || '[]')
      }))
    },

    getResearchById(id) {
      const row = db.prepare('SELECT * FROM research WHERE id = ?').get(id)
      if (!row) return null
      return {
        ...row,
        keywords: JSON.parse(row.keywords || '[]'),
        authors: JSON.parse(row.authors || '[]')
      }
    },

    createResearch(data) {
      const stmt = db.prepare(`
        INSERT INTO research (title, abstract, year, course, category, research_type, keywords, authors, adviser_faculty_id, status, created_by_user_id, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(
        data.title,
        data.abstract,
        data.year,
        data.course,
        data.category,
        data.researchType,
        JSON.stringify(data.keywords || []),
        JSON.stringify(data.authors || []),
        data.adviser_faculty_id,
        data.status || 'draft',
        data.created_by_user_id,
        data.file_path,
        data.created_at || new Date().toISOString(),
        data.updated_at || new Date().toISOString()
      )
      return info.lastInsertRowid
    },

    updateResearch(id, updates) {
      const fields = []
      const params = []
      for (const [key, val] of Object.entries(updates)) {
        if (key === 'keywords' || key === 'authors') {
          fields.push(`${key} = ?`)
          params.push(JSON.stringify(val))
        } else {
          fields.push(`${key} = ?`)
          params.push(val)
        }
      }
      fields.push('updated_at = ?')
      params.push(new Date().toISOString())
      params.push(id)

      const sql = `UPDATE research SET ${fields.join(', ')} WHERE id = ?`
      db.prepare(sql).run(...params)
    },

    deleteResearch(id) {
      db.prepare('DELETE FROM research WHERE id = ?').run(id)
    },

    getResearchAnalytics() {
      const total = db.prepare("SELECT COUNT(*) as count FROM research WHERE status = 'published'").get().count || 0
      const byType = db.prepare("SELECT research_type as _id, COUNT(*) as count FROM research WHERE status = 'published' GROUP BY research_type").all()
      const byYear = db.prepare("SELECT year as _id, COUNT(*) as count FROM research WHERE status = 'published' GROUP BY year ORDER BY year DESC LIMIT 5").all()
      return { total, byType, byYear }
    },

    listResearchAdvisers() {
      const facultyRoles = ['faculty', 'faculty_professor', 'dean', 'department_chair', 'secretary']
      const placeholders = facultyRoles.map(() => '?').join(',')
      return db.prepare(`SELECT id, full_name, identifier FROM users WHERE role IN (${placeholders})`).all(...facultyRoles)
    },

    suggestResearchAuthors(q, limit = 10, course) {
      let sql = "SELECT id, full_name, identifier, class_section FROM users WHERE role = 'student'"
      const params = []
      if (q) {
        sql += " AND (full_name LIKE ? OR identifier LIKE ?)"
        params.push(`%${q}%`, `%${q}%`)
      }
      if (course) {
        sql += " AND class_section = ?"
        params.push(course)
      }
      sql += " LIMIT ?"
      params.push(limit)
      return db.prepare(sql).all(...params)
    },

    listEvents() {
      return db.prepare("SELECT * FROM events ORDER BY start_time ASC").all()
    },

    createEvent(data) {
      const stmt = db.prepare(`
        INSERT INTO events (title, description, type, start_time, end_time, location, target_audience, status, created_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const res = stmt.run(
        data.title,
        data.description,
        data.type,
        data.start_time,
        data.end_time,
        data.location,
        data.target_audience,
        data.status || 'approved',
        data.created_by_user_id,
        new Date().toISOString(),
        new Date().toISOString()
      )
      return { id: res.lastInsertRowid, ok: true }
    },

    updateEvent(id, updates) {
      const fields = []
      const params = []
      for (const [key, val] of Object.entries(updates)) {
        fields.push(`${key} = ?`)
        params.push(val)
      }
      fields.push('updated_at = ?')
      params.push(new Date().toISOString())
      params.push(id)

      const sql = `UPDATE events SET ${fields.join(', ')} WHERE id = ?`
      db.prepare(sql).run(...params)
      return { ok: true }
    },

    approveEvent(id) {
      db.prepare("UPDATE events SET status = 'approved', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id)
      const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id)
      return { ok: true, event }
    },

    deleteEvent(id) {
      db.prepare("DELETE FROM events WHERE id = ?").run(id)
      return { ok: true }
    },

    // Schedules
    listSchedules(teachingLoadId = null) {
      if (teachingLoadId) {
        return db.prepare('SELECT * FROM schedules WHERE teaching_load_id = ?').all(teachingLoadId)
      }
      return db.prepare('SELECT * FROM schedules ORDER BY id DESC').all()
    },

    getScheduleById(id) {
      return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id)
    },

    createSchedule(data) {
      const stmt = db.prepare(`
        INSERT INTO schedules (
          subjectCode, subjectTitle, instructor, course, yearLevel, semester, section, day, startTime, endTime, room, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const now = new Date().toISOString()
      const res = stmt.run(
        data.subjectCode, data.subjectTitle, data.instructor, data.course, data.yearLevel, data.semester, data.section,
        data.day, data.startTime, data.endTime, data.room, now, now
      )
      return { id: res.lastInsertRowid, ...data, created_at: now, updated_at: now }
    },

    updateSchedule(id, data) {
      const fields = []
      const params = []
      const allowed = [
        'subjectCode', 'subjectTitle', 'instructor', 'course', 'yearLevel', 'semester', 'section',
        'day', 'startTime', 'endTime', 'room', 'instructorId', 'instructorEmail', 'subjectId', 'teaching_load_id'
      ]
      
      for (const [key, val] of Object.entries(data)) {
        if (allowed.includes(key)) {
          fields.push(`${key} = ?`)
          params.push(val)
        }
      }
      fields.push('updated_at = ?')
      params.push(new Date().toISOString())
      params.push(id)

      const sql = `UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`
      db.prepare(sql).run(...params)
      return this.getScheduleById(id)
    },

    deleteSchedule(id) {
      db.prepare('DELETE FROM schedules WHERE id = ?').run(id)
    },

    findOverlappingSchedules(day, startTime, endTime, room) {
      // Basic overlap in SQL
      return db.prepare(`
        SELECT * FROM schedules 
        WHERE day = ? AND room = ? 
        AND ((startTime < ? AND endTime > ?) OR (startTime >= ? AND startTime < ?))
      `).all(day, room, endTime, startTime, startTime, endTime)
    }
  }
}
