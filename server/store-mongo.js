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

/** Root-level student name fields on user documents (separate from full_name / personal_information). */
function deriveStudentRootNames(personalInformation, fullNameFallback) {
  const pi = personalInformation && typeof personalInformation === 'object' ? personalInformation : {}
  let fn = String(pi.first_name ?? pi.firstName ?? '').trim()
  let mn = String(pi.middle_name ?? pi.middleName ?? '').trim()
  let ln = String(pi.last_name ?? pi.lastName ?? '').trim()
  const fb = String(fullNameFallback || '').trim()
  const tok = fb.split(/\s+/).filter(Boolean)
  if (tok.length >= 2) {
    if (!fn) fn = tok[0]
    if (!ln) ln = tok[tok.length - 1]
    if (!mn && tok.length >= 3) mn = tok.slice(1, -1).join(' ')
  } else if (tok.length === 1) {
    if (!fn && !ln) fn = tok[0]
    else if (!fn) fn = tok[0]
    else if (!ln) ln = tok[0]
  }
  const composed = [fn, mn, ln].filter(Boolean).join(' ')
  return {
    first_name: fn || null,
    middle_name: mn || null,
    last_name: ln || null,
    full_name: composed || (fb || null),
  }
}

let mongoStoreInitPromise = null

/**
 * Reuse one Mongo store (and underlying client) per serverless isolate to avoid connection storms on Vercel.
 */
export async function openMongoStore() {
  if (globalThis.__ccs_mongo_store) {
    return globalThis.__ccs_mongo_store
  }
  if (!mongoStoreInitPromise) {
    mongoStoreInitPromise = createMongoStore()
      .then((store) => {
        globalThis.__ccs_mongo_store = store
        return store
      })
      .catch((err) => {
        mongoStoreInitPromise = null
        throw err
      })
  }
  return mongoStoreInitPromise
}

async function createMongoStore() {
  const mongoUri = String(process.env.MONGODB_URI || '').trim()
  if (!mongoUri) {
    throw new Error('Missing MONGODB_URI. This project uses MongoDB only; set MONGODB_URI (and optional MONGODB_DB).')
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

  // Ensure uniqueness constraints for user identity and sessions.
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
    // Support both res.value (old) and res (new) driver formats
    const seq = res?.value?.seq ?? res?.seq
    if (typeof seq === 'number') return seq
    
    // Fallback: search for the highest numeric ID, ignoring null or invalid values
    const last = await users.find({ id: { $gt: 0 } }, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray()
    const maxId = last.length > 0 ? (Number(last[0].id) || 0) : 0
    return maxId + 1
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
            personal_information: 1,
            profile_image_url: 1,
            first_name: 1,
            middle_name: 1,
            last_name: 1,
            must_change_password: 1,
          },
        },
      )
      if (!user) return null
      return { ...user, is_active: user.is_active ?? 1 }
    },

    async getUserByIdForAuth(id) {
      const user = await users.findOne(
        { $or: [{ id: Number(id) }, { id: String(id) }] },
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
            personal_information: 1,
            profile_image_url: 1,
            first_name: 1,
            middle_name: 1,
            last_name: 1,
            must_change_password: 1,
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
        profile_image_url: null,
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
        const names = deriveStudentRootNames(doc.personal_information, fullName)
        doc.first_name = names.first_name
        doc.middle_name = names.middle_name
        doc.last_name = names.last_name
        if (names.full_name) doc.full_name = names.full_name
        doc.must_change_password = 1
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
              profile_image_url: 1,
              first_name: 1,
              middle_name: 1,
              last_name: 1,
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
            profile_image_url: 1,
            first_name: 1,
            middle_name: 1,
            last_name: 1,
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
            profile_image_url: 1,
            first_name: 1,
            middle_name: 1,
            last_name: 1,
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
        'profile_image_url',
        'first_name',
        'middle_name',
        'last_name',
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

      if (setUpdates.personal_information !== undefined) {
        const names = deriveStudentRootNames(setUpdates.personal_information, setUpdates.full_name)
        setUpdates.first_name = names.first_name
        setUpdates.middle_name = names.middle_name
        setUpdates.last_name = names.last_name
        if (names.full_name) setUpdates.full_name = names.full_name
      } else if (setUpdates.full_name !== undefined) {
        const names = deriveStudentRootNames({}, setUpdates.full_name)
        setUpdates.first_name = names.first_name
        setUpdates.middle_name = names.middle_name
        setUpdates.last_name = names.last_name
      }

      if (setUpdates.student_id !== undefined) {
        setUpdates.student_id_norm = setUpdates.student_id
          ? normalizeForMongoIdentifier(setUpdates.student_id)
          : null
      }

      if (Object.keys(setUpdates).length > 0) {
        const idQuery = { $or: [{ id: Number(userId) }, { id: String(userId) }] }
        await users.updateOne(idQuery, { $set: setUpdates })
      }
      return await this.getAdminUserById(userId)
    },

    async getPasswordHash(userId) {
      const u = await users.findOne(
        { $or: [{ id: Number(userId) }, { id: String(userId) }] },
        { projection: { _id: 0, password_hash: 1 } },
      )
      return u?.password_hash ?? null
    },

    async updatePasswordHash(userId, passwordHash) {
      await users.updateOne(
        { $or: [{ id: Number(userId) }, { id: String(userId) }] },
        { $set: { password_hash: passwordHash, must_change_password: 0 } },
      )
    },

    async getAccountProfile(userId) {
      const idNum = Number(userId)
      const user = await users.findOne(
        { $or: [{ id: idNum }, { id: String(userId) }] },
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
            profile_image_url: 1,
            personal_information: 1,
            academic_info: 1,
            class_section: 1,
            student_type: 1,
            first_name: 1,
            middle_name: 1,
            last_name: 1,
            must_change_password: 1,
          },
        },
      )
      if (!user) return null
      const isActive = user.is_active ?? 1
      if (user.role === 'student') {
        return {
          role: 'student',
          id: user.id,
          email: user.email,
          student_id: user.student_id,
          full_name: user.full_name,
          first_name: user.first_name ?? null,
          middle_name: user.middle_name ?? null,
          last_name: user.last_name ?? null,
          twofa_enabled: !!user.twofa_enabled,
          is_active: isActive,
          profile_image_url: user.profile_image_url || null,
          personal_information: user.personal_information || {},
          academic_info: user.academic_info || {},
          class_section: user.class_section,
          student_type: user.student_type,
          must_change_password: user.must_change_password ?? 0,
        }
      }
      return {
        role: user.role,
        id: user.id,
        identifier: user.identifier,
        email: user.email,
        full_name: user.full_name,
        twofa_enabled: !!user.twofa_enabled,
        profile_image_url: user.profile_image_url || null,
      }
    },

    async updateAccountProfile(userId, body) {
      const idNum = Number(userId)
      const idQuery = { $or: [{ id: idNum }, { id: String(userId) }] }
      const set = {}
      if (body.profileImageUrl !== undefined) {
        set.profile_image_url = String(body.profileImageUrl || '').trim() || null
      }
      if (body.fullName !== undefined) {
        const u = await users.findOne(idQuery, { projection: { _id: 0, role: 1 } })
        if (u && u.role !== 'student') {
          set.full_name = String(body.fullName || '').trim() || null
        }
      }
      if (Object.keys(set).length > 0) {
        await users.updateOne(idQuery, { $set: set })
      }
      return await this.getAccountProfile(userId)
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

  }
}

