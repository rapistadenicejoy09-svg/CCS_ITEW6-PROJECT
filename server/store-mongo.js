import { MongoClient } from 'mongodb'

function normalizeForMongoIdentifier(value) {
  // Must match `normalizeIdentifier()` from `server/auth.js`: trim + lowercase.
  return String(value || '').trim().toLowerCase()
}

function getMongoDbName(mongoUri) {
  const explicit = String(process.env.MONGODB_DB || '').trim()
  if (explicit) return explicit

  // mongodb+srv://host/.../dbname
  try {
    const u = new URL(mongoUri)
    const pathname = u.pathname || ''
    const maybeName = pathname.replace(/^\//, '').trim()
    if (maybeName) return maybeName
  } catch {
    // ignore
  }

  return null
}

export async function openMongoStore() {
  const mongoUri = String(process.env.MONGODB_URI || '').trim()
  if (!mongoUri) {
    throw new Error('Missing MONGODB_URI. Set it when DB_PROVIDER=mongodb.')
  }

  const dbName = getMongoDbName(mongoUri)
  if (!dbName) {
    throw new Error('Missing MONGODB_DB (or db name in MONGODB_URI pathname).')
  }

  const client = new MongoClient(mongoUri)
  console.log(`[MONGODB] Connecting to ${dbName}...`)
  await client.connect()

  const db = client.db(dbName)
  const users = db.collection('users')
  const loginAttempts = db.collection('login_attempts')
  const sessions = db.collection('sessions')
  const counters = db.collection('counters')
  const instructions = db.collection('instructions')

  // Ensure uniqueness constraints similar to SQLite tables.
  await Promise.all([
    users.createIndex({ identifier: 1 }, { unique: true, name: 'users_identifier_unique' }),
    users.createIndex({ id: 1 }, { unique: true, name: 'users_id_unique' }),
    // Prevent duplicate emails for accounts that actually have an email set.
    users.createIndex(
      { email: 1 },
      {
        unique: true,
        name: 'users_email_unique',
        partialFilterExpression: { email: { $type: 'string' } },
      },
    ),
    loginAttempts.createIndex({ identifier: 1 }, { unique: true, name: 'login_attempts_identifier_unique' }),
    sessions.createIndex({ token: 1 }, { unique: true, name: 'sessions_token_unique' }),
    instructions.createIndex({ id: 1 }, { unique: true, name: 'instructions_id_unique' }),
  ])

  async function nextUserId() {
    const res = await counters.findOneAndUpdate(
      { _id: 'users' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    )
    // Support both res.value (old) and res (new) driver formats
    const seq = res?.value?.seq ?? res?.seq
    if (typeof seq === 'number') return seq
    
    // Fallback: search for the highest numeric ID, ignoring null or invalid values
    const last = await users.find({ id: { $gt: 0 } }, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray()
    const maxId = last.length > 0 ? (Number(last[0].id) || 0) : 0
    return maxId + 1
  }

  async function nextInstructionId() {
    const res = await counters.findOneAndUpdate(
      { _id: 'instructions' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    )
    const seq = res?.value?.seq ?? res?.seq
    if (typeof seq === 'number') return seq
    
    const last = await instructions.find({ id: { $gt: 0 } }, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray()
    const maxId = last.length > 0 ? (Number(last[0].id) || 0) : 0
    return maxId + 1
  }



  const gridFsBucket = new (await import('mongodb')).GridFSBucket(db, { bucketName: 'instruction_files' })

  return {
    /** Expose raw db handle and GridFS bucket for file operations */
    db,
    gridFsBucket,
    async getLoginAttempt(identifier) {
      return await loginAttempts.findOne(
        { identifier },
        { projection: { _id: 0, identifier: 1, count: 1, locked_until: 1 } },
      )
    },

    async upsertLoginAttempt(identifier, count, lockedUntil) {
      await loginAttempts.updateOne(
        { identifier },
        { $set: { count, locked_until: lockedUntil } },
        { upsert: true },
      )
    },

    async clearLoginAttempt(identifier) {
      await loginAttempts.deleteOne({ identifier })
    },

    /**
     * @param {string} identifier - Normalized login identifier (lowercased, trimmed).
     */
    async findUserByLoginCredential(identifier) {
      const user = await users.findOne(
        {
          $or: [
            { role: { $ne: 'student' }, identifier },
            { role: 'student', $or: [{ identifier }, { email: identifier }] },
          ],
        },
        {
          projection: {
            _id: 0,
            id: 1,
            role: 1,
            identifier: 1,
            student_id: 1,
            email: 1,
            full_name: 1,
            password_hash: 1,
            twofa_enabled: 1,
            twofa_backup_code: 1,
            twofa_secret: 1,
            is_active: 1,
          },
        },
      )
      if (!user) return null
      return { ...user, is_active: user.is_active ?? 1 }
    },

    async getUserByIdForAuth(id) {
      const user = await users.findOne(
        { id },
        {
          projection: {
            _id: 0,
            id: 1,
            role: 1,
            identifier: 1,
            student_id: 1,
            email: 1,
            full_name: 1,
            twofa_enabled: 1,
            is_active: 1,
          },
        },
      )
      if (!user) return null
      return { ...user, is_active: user.is_active ?? 1 }
    },

    async findUserByIdentifier(identifier) {
      return await users.findOne({ identifier }, { projection: { _id: 0, id: 1 } })
    },

    async findStudentDuplicate(studentIdNorm, emailNorm) {
      return await users.findOne(
        {
          $or: [{ identifier: studentIdNorm }, { email: emailNorm }, { role: 'student', student_id_norm: studentIdNorm }],
        },
        { projection: { _id: 0, id: 1 } },
      )
    },

    async createUser({
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
      personalInformation,
      academicInfo,
      academicHistory,
      nonAcademicActivities,
      violations,
      skills,
      affiliations,
    }) {
      const id = await nextUserId()
      const doc = {
        id,
        role,
        identifier,
        full_name: fullName,
        password_hash: passwordHash,
        twofa_enabled: enable2FA ? 1 : 0,
        twofa_backup_code: backupCode,
        twofa_secret: null,
        created_at: createdAtIso,
        class_section: classSection,
        student_type: studentType,
        student_id: studentIdStored,
        email: emailStored,
        is_active: 1,
      }

      if (role === 'student') {
        doc.student_id_norm = studentIdStored ? normalizeForMongoIdentifier(studentIdStored) : null
        doc.personal_information = personalInformation || {}
        doc.academic_info = academicInfo || {}
        doc.academic_history = academicHistory || []
        doc.non_academic_activities = nonAcademicActivities || []
        doc.violations = violations || []
        doc.skills = skills || []
        doc.affiliations = affiliations || []
      }

      await users.insertOne(doc)
    },

    async createSession({ token, userId, createdAtIso, expiresAtIso }) {
      await sessions.insertOne({
        token,
        user_id: userId,
        created_at: createdAtIso,
        expires_at: expiresAtIso,
      })
    },

    async getSessionByToken(token) {
      return await sessions.findOne(
        { token },
        { projection: { _id: 0, token: 1, user_id: 1, expires_at: 1 } },
      )
    },

    async deleteSessionByToken(token) {
      await sessions.deleteOne({ token })
    },

    async setTwofaSecret(userId, twofaSecretBase32) {
      await users.updateOne({ id: userId }, { $set: { twofa_secret: twofaSecretBase32 } })
    },

    async getTwofaSecret(userId) {
      return await users.findOne({ id: userId }, { projection: { _id: 0, twofa_secret: 1 } })
    },

    async enableTwofa(userId) {
      await users.updateOne({ id: userId }, { $set: { twofa_enabled: 1 } })
    },

    async listAdminUsers() {
      return await users
        .find(
          {},
          {
            projection: {
              _id: 0,
              id: 1,
              role: 1,
              identifier: 1,
              student_id: 1,
              email: 1,
              full_name: 1,
              twofa_enabled: 1,
              created_at: 1,
              class_section: 1,
              student_type: 1,
              is_active: 1,
              personal_information: 1,
              academic_info: 1,
              academic_history: 1,
              non_academic_activities: 1,
              violations: 1,
              skills: 1,
              affiliations: 1,
            },
          },
        )
        .sort({ id: 1 })
        .toArray()
    },

    async getAdminUserById(id) {
      const user = await users.findOne(
        { id },
        {
          projection: {
            _id: 0,
            id: 1,
            role: 1,
            identifier: 1,
            student_id: 1,
            email: 1,
            full_name: 1,
            twofa_enabled: 1,
            created_at: 1,
            class_section: 1,
            student_type: 1,
            is_active: 1,
            personal_information: 1,
            academic_info: 1,
            academic_history: 1,
            non_academic_activities: 1,
            violations: 1,
            skills: 1,
            affiliations: 1,
          },
        },
      )
      if (!user) return null
      return { ...user, is_active: user.is_active ?? 1 }
    },

    async updateUserIsActive(id, isActive) {
      await users.updateOne({ id }, { $set: { is_active: isActive ? 1 : 0 } })
      const user = await users.findOne(
        { id },
        {
          projection: {
            _id: 0,
            id: 1,
            role: 1,
            identifier: 1,
            student_id: 1,
            email: 1,
            full_name: 1,
            twofa_enabled: 1,
            created_at: 1,
            class_section: 1,
            student_type: 1,
            is_active: 1,
            personal_information: 1,
            academic_info: 1,
            academic_history: 1,
            non_academic_activities: 1,
            violations: 1,
            skills: 1,
            affiliations: 1,
          },
        },
      )
      if (!user) return null
      return { ...user, is_active: user.is_active ?? 1 }
    },

    async updateStudentProfile(userId, updates) {
      const allowedFields = [
        'personal_information',
        'academic_info',
        'academic_history',
        'non_academic_activities',
        'violations',
        'skills',
        'affiliations',
        'full_name',
        'email',
        'class_section',
        'student_type',
        'student_id',
        'is_active',
      ]
      const setUpdates = {}
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          if (field === 'is_active') {
             setUpdates[field] = updates[field] ? 1 : 0
          } else {
             setUpdates[field] = updates[field]
          }
        }
      }

      if (Object.keys(setUpdates).length > 0) {
        // Try matching both as number and string for robustness
        const idQuery = { $or: [{ id: Number(userId) }, { id: String(userId) }] }
        const result = await users.updateOne(idQuery, { $set: setUpdates })
        
        console.log(`[DEBUG] store: profile update for ID ${userId}:`, {
           modifiedCount: result.modifiedCount,
           matchedCount: result.matchedCount,
           activeStatus: setUpdates.is_active !== undefined ? setUpdates.is_active : 'no-change'
        })
      }
      return await this.getAdminUserById(userId)
    },

    async findStudentsBySkill(skill) {
      return await users
        .find(
          { role: 'student', skills: { $regex: skill, $options: 'i' } },
          {
            projection: {
              _id: 0,
              id: 1,
              full_name: 1,
              student_id: 1,
              email: 1,
              skills: 1,
            },
          },
        )
        .toArray()
    },

    async findStudentsByAffiliation(organization) {
      return await users
        .find(
          { role: 'student', 'affiliations.organization': { $regex: organization, $options: 'i' } },
          {
            projection: {
              _id: 0,
              id: 1,
              full_name: 1,
              student_id: 1,
              email: 1,
              affiliations: 1,
            },
          },
        )
        .toArray()
    },

    async listInstructions() {
      return await instructions.find({}, { projection: { _id: 0 } }).sort({ id: -1 }).toArray()
    },

    async getInstructionById(id) {
      return await instructions.findOne({ id: Number(id) }, { projection: { _id: 0 } })
    },

    async createInstruction(data) {
      const id = await nextInstructionId()
      const doc = {
        id,
        type: data.type,
        title: data.title,
        course: data.course,
        subject: data.subject,
        description: data.description,
        status: data.status,
        author: data.author,
        link: data.link,
        created_at: data.created_at,
        updated_at: data.updated_at
      }
      await instructions.insertOne(doc)
      return id
    },

    async updateInstruction(id, data) {
      const setUpdates = {
        type: data.type,
        title: data.title,
        course: data.course,
        subject: data.subject,
        description: data.description,
        status: data.status,
        author: data.author,
        link: data.link,
        updated_at: data.updated_at
      }
      await instructions.updateOne({ id: Number(id) }, { $set: setUpdates })
    },

    async deleteInstruction(id) {
      await instructions.deleteOne({ id: Number(id) })
    },
  }
}


