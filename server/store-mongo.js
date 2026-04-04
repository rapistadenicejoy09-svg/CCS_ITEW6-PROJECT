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
    throw new Error('Missing MONGODB_URI.')
  }

  const dbName = getMongoDbName(mongoUri)
  if (!dbName) {
    throw new Error('Missing MONGODB_DB (or db name in MONGODB_URI pathname).')
  }

  const client = new MongoClient(mongoUri)
  await client.connect()

  const db = client.db(dbName)
  const users = db.collection('users')
  const loginAttempts = db.collection('login_attempts')
  const sessions = db.collection('sessions')
  const counters = db.collection('counters')

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
  ])

  async function nextUserId() {
    const res = await counters.findOneAndUpdate(
      { _id: 'users' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    )
    return res?.value?.seq
  }

  return {
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
          },
        },
      )
      if (!user) return null
      return { ...user, is_active: user.is_active ?? 1 }
    },
  }
}

