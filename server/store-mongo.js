import { MongoClient, GridFSBucket, ObjectId } from 'mongodb'
import { Readable } from 'stream'

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

export async function openMongoStore() {
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
  const subjects = db.collection('subjects')
  const teachingLoads = db.collection('teaching_loads')
  const schedules = db.collection('schedules')
  const documents = db.collection('documents')
  const evaluations = db.collection('evaluations')
  const logs = db.collection('logs')
  const notifications = db.collection('notifications')
  const researchPublications = db.collection('research_publications')
  const events = db.collection('events')
  const instructions = db.collection('instructions')
  const officeHours = db.collection('office_hours')
  const bucket = new GridFSBucket(db, { bucketName: 'instruction_files' })

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
    subjects.createIndex({ code: 1 }, { unique: true, name: 'subjects_code_unique' }),
    subjects.createIndex({ id: 1 }, { unique: true, name: 'subjects_id_unique' }),
    teachingLoads.createIndex({ id: 1 }, { unique: true, name: 'teaching_loads_id_unique' }),
    teachingLoads.createIndex({ faculty_id: 1 }),
    schedules.createIndex({ id: 1 }, { unique: true, name: 'schedules_id_unique' }),
    schedules.createIndex({ teaching_load_id: 1 }),
    documents.createIndex({ id: 1 }, { unique: true, name: 'documents_id_unique' }),
    documents.createIndex({ faculty_id: 1, subject_id: 1 }),
    evaluations.createIndex({ id: 1 }, { unique: true, name: 'evaluations_id_unique' }),
    evaluations.createIndex({ faculty_id: 1 }),
    logs.createIndex({ id: 1 }, { unique: true, name: 'logs_id_unique' }),
    logs.createIndex({ created_at: -1 }),
    notifications.createIndex({ id: 1 }, { unique: true, name: 'notifications_id_unique' }),
    notifications.createIndex({ recipient_user_id: 1, is_read: 1, created_at: -1 }),
    notifications.createIndex({ recipient_user_id: 1, created_at: -1 }),
    notifications.createIndex(
      { recipient_user_id: 1, dedupe_key: 1 },
      { unique: true, sparse: true, name: 'notifications_recipient_dedupe_unique' },
    ),
    researchPublications.createIndex({ id: 1 }, { unique: true, name: 'research_publications_id_unique' }),
    researchPublications.createIndex({ status: 1, year: -1 }),
    researchPublications.createIndex({ created_by_user_id: 1 }),
    researchPublications.createIndex({ adviser_faculty_id: 1 }),
    researchPublications.createIndex({ year: -1 }),
    researchPublications.createIndex({ course: 1 }),
    researchPublications.createIndex(
      { repository_ref: 1 },
      { unique: true, sparse: true, name: 'research_publications_repository_ref_unique' },
    ),
    researchPublications.createIndex(
      { submission_ref: 1 },
      { unique: true, sparse: true, name: 'research_publications_submission_ref_unique' },
    ),
    events.createIndex({ id: 1 }, { unique: true, name: 'events_id_unique' }),
    events.createIndex({ type: 1 }),
    events.createIndex({ department: 1 }),
    events.createIndex({ start_time: 1 }),
    instructions.createIndex({ id: 1 }, { unique: true, name: 'instructions_id_unique' }),
    instructions.createIndex({ type: 1 }),
    instructions.createIndex({ course: 1 }),
    instructions.createIndex({ status: 1 }),
    officeHours.createIndex({ id: 1 }, { unique: true, name: 'office_hours_id_unique' }),
    officeHours.createIndex({ user_id: 1 }),
  ])

  // Migration: Convert string IDs to numbers for schedules
  try {
    const stringIdSchedules = await schedules.find({ id: { $type: 'string' } }).toArray()
    if (stringIdSchedules.length > 0) {
      console.log(`[Store] Migrating ${stringIdSchedules.length} schedules with string IDs...`)
      for (const s of stringIdSchedules) {
        const numId = Number(s.id)
        if (!isNaN(numId)) {
          await schedules.updateOne({ _id: s._id }, { $set: { id: numId } })
        }
      }
    }
  } catch (err) {
    console.warn('[Store] Schedule ID migration error:', err.message)
  }

  async function nextId(collectionName) {
    try {
      const res = await counters.findOneAndUpdate(
        { _id: collectionName },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      )
      const seq = res?.value?.seq ?? res?.seq
      if (typeof seq === 'number') return seq

      console.warn(`[DB] Fallback ID generation for ${collectionName}`)
      const collection = db.collection(collectionName)
      const last = await collection.find({ id: { $gt: 0 } }, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray()
      const maxId = last.length > 0 ? (Number(last[0].id) || 0) : 0
      return maxId + 1
    } catch (err) {
      console.error(`[DB] nextId failure for ${collectionName}:`, err)
      throw err
    }
  }

  async function allocateResearchRepositoryRefForYear(publishYear) {
    let y = Number(publishYear)
    if (!Number.isFinite(y) || y < 1970 || y > 2100) {
      y = new Date().getFullYear()
    }
    const counterId = `research_repo_ref_${y}`
    const res = await counters.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    )
    const seq = res?.value?.seq ?? res?.seq
    if (typeof seq !== 'number') {
      throw new Error('Failed to allocate repository reference')
    }
    return `CCS-CR-${y}-${String(seq).padStart(5, '0')}`
  }

  async function allocateResearchSubmissionRefForYear(publishYear) {
    let y = Number(publishYear)
    if (!Number.isFinite(y) || y < 1970 || y > 2100) {
      y = new Date().getFullYear()
    }
    const counterId = `research_sub_ref_${y}`
    const res = await counters.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    )
    const seq = res?.value?.seq ?? res?.seq
    if (typeof seq !== 'number') {
      throw new Error('Failed to allocate submission reference')
    }
    return `CCS-SUB-${y}-${String(seq).padStart(5, '0')}`
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
            academic_info: 1,
            class_section: 1,
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
            academic_info: 1,
            class_section: 1,
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

    async countUsersByRole(role) {
      return await users.countDocuments({ role: String(role || '').trim() })
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
      non_academic_activities,
      violations,
      skills,
      affiliations,
      department,
      specialization,
      bio,
    }) {
      const id = await nextId('users')
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
        department: department || null,
        specialization: specialization || null,
        bio: bio || null,
        is_active: 1,
        profile_image_url: null,
      }

      if (role === 'student') {
        doc.student_id_norm = studentIdStored ? normalizeForMongoIdentifier(studentIdStored) : null
        doc.personal_information = personalInformation || {}
        doc.academic_info = academicInfo || {}
        doc.academic_history = academicHistory || []
        doc.non_academic_activities = non_academic_activities || []
        doc.violations = violations || []
        doc.skills = skills || []
        doc.affiliations = affiliations || []
        const names = deriveStudentRootNames(doc.personal_information, fullName)
        doc.first_name = names.first_name
        doc.middle_name = names.middle_name
        doc.last_name = names.last_name
        if (names.full_name) doc.full_name = names.full_name
        doc.must_change_password = 1
      } else if (role !== 'student') {
        const names = deriveStudentRootNames(personalInformation || {}, fullName)
        doc.personal_information = {
          ...(personalInformation || {}),
          first_name: names.first_name || '',
          middle_name: names.middle_name || '',
          last_name: names.last_name || '',
        }
        doc.first_name = names.first_name
        doc.middle_name = names.middle_name
        doc.last_name = names.last_name
        if (names.full_name) doc.full_name = names.full_name
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

    async disableTwofa(userId) {
      await users.updateOne(
        { $or: [{ id: Number(userId) }, { id: String(userId) }] },
        { $set: { twofa_enabled: 0, twofa_secret: null, twofa_backup_code: null } },
      )
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
              department: 1,
              specialization: 1,
              bio: 1,
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
            department: 1,
            specialization: 1,
            bio: 1,
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
            department: 1,
            specialization: 1,
          },
        },
      )
      if (!user) return null
      return { ...user, is_active: user.is_active ?? 1 }
    },

    async updateStudentProfile(userId, updates) {
      const allowedFields = [
        'role',
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
        'department',
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
            department: 1,
            specialization: 1,
            bio: 1,
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
        first_name: user.first_name ?? null,
        middle_name: user.middle_name ?? null,
        last_name: user.last_name ?? null,
        personal_information: user.personal_information || {},
        twofa_enabled: !!user.twofa_enabled,
        profile_image_url: user.profile_image_url || null,
        department: user.department || null,
        specialization: user.specialization || null,
        bio: user.bio || null,
      }
    },

    async updateAccountProfile(userId, body) {
      const idNum = Number(userId)
      const idQuery = { $or: [{ id: idNum }, { id: String(userId) }] }
      const u = await users.findOne(idQuery, { projection: { _id: 0, role: 1, personal_information: 1 } })
      if (!u) return null

      const set = {}
      if (body.profileImageUrl !== undefined) {
        set.profile_image_url = String(body.profileImageUrl || '').trim() || null
      }
      if (body.bio !== undefined) {
        set.bio = String(body.bio || '').trim() || null
      }
      if (body.department !== undefined && u.role !== 'student') {
        set.department = String(body.department || '').trim() || null
      }
      if (body.specialization !== undefined && u.role !== 'student') {
        set.specialization = String(body.specialization || '').trim() || null
      }

      if (body.personalInformation !== undefined && u.role !== 'student') {
        const piNext = body.personalInformation || {}
        const piCurrent = u.personal_information || {}
        const fn = String(piNext.first_name ?? piNext.firstName ?? piCurrent.first_name ?? '').trim()
        const mn = String(piNext.middle_name ?? piNext.middleName ?? piCurrent.middle_name ?? '').trim()
        const ln = String(piNext.last_name ?? piNext.lastName ?? piCurrent.last_name ?? '').trim()
        set.personal_information = { ...piCurrent, ...piNext, first_name: fn, middle_name: mn, last_name: ln }
        const names = deriveStudentRootNames(set.personal_information, [fn, mn, ln].filter(Boolean).join(' ') || null)
        set.first_name = names.first_name
        set.middle_name = names.middle_name
        set.last_name = names.last_name
        if (names.full_name) set.full_name = names.full_name
      } else if (body.fullName !== undefined && u.role !== 'student') {
        set.full_name = String(body.fullName || '').trim() || null
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

    // Subjects
    async listSubjects() {
      return await subjects.find({}).sort({ code: 1 }).toArray()
    },

    async createSubject(data) {
      const id = await nextId('subjects')
      const doc = { id, ...data, created_at: new Date().toISOString() }
      await subjects.insertOne(doc)
      return doc
    },

    async updateSubject(id, updates) {
      await subjects.updateOne({ id: Number(id) }, { $set: updates })
      return await subjects.findOne({ id: Number(id) })
    },

    async deleteSubject(id) {
      await subjects.deleteOne({ id: Number(id) })
    },

    // Teaching Loads
    async listTeachingLoads(facultyId = null) {
      // 1. Fetch explicit teaching loads
      const match = facultyId ? { faculty_id: Number(facultyId) } : {}
      const pipeline = [
        { $match: match },
        {
          $lookup: {
            from: 'subjects',
            localField: 'subject_id',
            foreignField: 'id',
            as: 'subject_array',
          },
        },
        {
          $addFields: {
            subject: { $arrayElemAt: ['$subject_array', 0] },
          },
        },
        { $project: { subject_array: 0 } },
        { $sort: { created_at: -1 } },
      ]
      const explicitLoads = await teachingLoads.aggregate(pipeline).toArray()

      // 2. Fetch all relevant schedules (filtered by faculty if provided)
      let schedQuery = {}
      if (facultyId) {
        if (String(facultyId).startsWith('legacy-')) {
          const nameFromId = String(facultyId).slice('legacy-'.length)
          schedQuery = { instructor: { $regex: new RegExp(`^${nameFromId}$`, 'i') } }
        } else {
          const f = await users.findOne({ id: Number(facultyId) })
          const fName = f ? (f.full_name || f.displayName || '').trim() : null
          const orConditions = [{ instructorId: Number(facultyId) }]
          if (fName) orConditions.push({ instructor: { $regex: new RegExp(`^${fName}$`, 'i') } })
          schedQuery = { $or: orConditions }
        }
      }
      
      const allSchedules = await schedules.find(schedQuery).toArray()
      const schedByLoadId = new Map()
      const schedByCombo = new Map()
      
      for (const s of allSchedules) {
        if (s.teaching_load_id) schedByLoadId.set(String(s.teaching_load_id), s)
        // Composite key for name-based matching
        const key = `${s.instructorId || s.instructor}-${s.subjectCode}-${s.course} ${s.section}`.trim()
        if (!schedByCombo.has(key)) schedByCombo.set(key, s)
      }

      // 2.5 Fetch all subjects to help with code-based matching for virtual loads
      const allSubjectsItems = await subjects.find({}).toArray()
      const subjectByCode = new Map(allSubjectsItems.map(s => [String(s.code).toUpperCase(), s]))

      // Helper to normalize section strings for comparison (e.g. "BSIT 1A" vs "1A")
      const normalizeSection = (str) => {
        if (!str) return ''
        const s = String(str).trim().toUpperCase()
        // If it starts with a course like BSIT/BSCS followed by space, try matching both versions
        return s.replace(/^(BSIT|BSCS|ACT|BSIS)\s+/i, '')
      }

      // 3. Process explicit loads: Enrich/Overwrite with schedule data
      const enrichedExplicit = explicitLoads.map(l => {
        const lSec = normalizeSection(l.section_id || l.section)
        const match = schedByLoadId.get(String(l.id)) || 
                      allSchedules.find(s => {
                        const sSec = normalizeSection(`${s.course} ${s.section}`)
                        return String(s.instructorId) === String(l.faculty_id) && 
                               String(s.subjectCode).toUpperCase() === String(l.subject?.code).toUpperCase() &&
                               (sSec === lSec || (l.section_id || l.section).includes(s.section))
                      })
        
        if (match) {
          return {
            ...l,
            schedule_info: {
              day: match.day,
              time: `${match.startTime} - ${match.endTime}`,
              room: match.room
            },
            // Prefer subject info from scheduling
            subject: {
              ...(l.subject || {}),
              code: match.subjectCode || l.subject?.code,
              name: match.subjectTitle || l.subject?.name
            }
          }
        }
        return l
      })

      // 4. Process virtual loads for schedules not yet accounted for
      const seenCombinations = new Set()
      enrichedExplicit.forEach(l => {
        const sid = l.faculty_id
        const subjKey = (l.subject?.code || '').toUpperCase()
        const sectionKey = normalizeSection(l.section_id || l.section)
        seenCombinations.add(`${sid}-${subjKey}-${sectionKey}`)
      })

      const virtualLoads = []
      for (const s of allSchedules) {
        const sid = s.instructorId || facultyId
        const subjKey = (s.subjectCode || '').toUpperCase()
        const sectionKey = normalizeSection(`${s.course} ${s.section}`)
        const keyId = `${sid}-${subjKey}-${sectionKey}`

        if (seenCombinations.has(keyId)) continue

        let enrichedSubject = {
          id: s.subjectId || null,
          code: s.subjectCode || '',
          name: s.subjectTitle || '',
          credits: 3
        }
        
        if (!enrichedSubject.id && enrichedSubject.code) {
          const match = subjectByCode.get(String(enrichedSubject.code).toUpperCase())
          if (match) enrichedSubject = { ...match }
        }

        virtualLoads.push({
          id: `v-${s.id}`,
          faculty_id: sid || null,
          faculty_name: s.instructor || '',
          subject_id: enrichedSubject.id,
          subject: enrichedSubject,
          section: `${s.course} ${s.section}`.trim(),
          semester: s.semester || 'Unassigned Semester (From Schedule)',
          academic_year: s.academicYear || 'Unknown',
          units: enrichedSubject.credits || 3,
          is_virtual: true,
          created_at: s.created_at || new Date().toISOString(),
          schedule_info: {
            day: s.day,
            time: `${s.startTime} - ${s.endTime}`,
            room: s.room
          }
        })
        seenCombinations.add(keyId)
      }

      return [...enrichedExplicit, ...virtualLoads].sort((a, b) => 
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      )
    },

    async createTeachingLoad(data) {
      const id = await nextId('teaching_loads')
      const doc = { id, ...data, created_at: new Date().toISOString() }
      await teachingLoads.insertOne(doc)
      
      // Reverse link: Find any schedules that match this new load and link them
      const sub = await subjects.findOne({ id: doc.subject_id })
      if (sub && doc.faculty_id) {
        const section = doc.section_id || doc.section
        await schedules.updateMany(
          { 
            instructorId: Number(doc.faculty_id), 
            subjectCode: { $regex: new RegExp(`^${sub.code}$`, 'i') },
            $or: [{ course: { $exists: true } }] // Generic match for section logic? 
            // Better: parse section into course/section if possible, or just match by the combined string
          },
          [
            { $set: { 
                teaching_load_id: id,
                // If the schedule had a different title, we might want to keep it or update it?
                // User said "use the subject in the scheduling", so we leave titles alone
            } }
          ]
        )
      }
      
      return doc
    },

    async deleteTeachingLoad(id) {
      if (String(id).startsWith('v-')) {
         const scheduleId = String(id).replace('v-', '')
         await schedules.updateOne(
             { $or: [{ id: Number(scheduleId) }, { id: scheduleId }] },
             { $set: { instructorId: null, instructor: 'TBA', instructorEmail: null, teaching_load_id: null, updated_at: new Date().toISOString() } }
         )
         return
      }

      await teachingLoads.deleteOne({ id: Number(id) })
      // Also release associated schedules instead of destructively deleting them
      await schedules.updateMany(
        { teaching_load_id: Number(id) },
        { $set: { instructorId: null, instructor: 'TBA', instructorEmail: null, teaching_load_id: null, updated_at: new Date().toISOString() } }
      )
    },

    // Schedules
    async checkConflicts(data, excludeId = null) {
      const { day, startTime, endTime, room, instructorId, course, section } = data
      if (!day || !startTime || !endTime) return null

      const convertToMinutes = (timeStr) => {
        if (!timeStr) return 0
        const [h, m] = timeStr.split(':').map(Number)
        return h * 60 + m
      }

      const start = convertToMinutes(startTime)
      const end = convertToMinutes(endTime)

      const query = { 
        day, 
        id: { $ne: excludeId ? Number(excludeId) : -1 } 
      }

      const existing = await schedules.find(query).toArray()

      for (const s of existing) {
        const sStart = convertToMinutes(s.startTime)
        const sEnd = convertToMinutes(s.endTime)

        // Overlap detection: (StartA < EndB) and (EndA > StartB)
        if (start < sEnd && end > sStart) {
          if (room && s.room === room && room !== 'TBA') return `Room conflict: Room ${room} is already booked for ${s.subjectCode} (${s.startTime}-${s.endTime})`
          if (instructorId && Number(s.instructorId) === Number(instructorId)) return `Instructor conflict: Professor is already scheduled for ${s.subjectCode} (${s.startTime}-${s.endTime})`
          if (course === s.course && section === s.section) return `Section conflict: ${course} ${section} already has a subject scheduled at this time (${s.subjectCode})`
        }
      }
      return null
    },

    async checkUnitLimit(data, excludeScheduleId = null) {
      if (!data.instructorId || !data.subjectCode || !data.semester) return null

      const subject = await subjects.findOne({ code: { $regex: new RegExp(`^${data.subjectCode}$`, 'i') } })
      const newUnits = Number(subject?.credits || 3)

      const currentLoads = await this.listTeachingLoads(data.instructorId)
      let currentSemLoads = currentLoads.filter(l => (l.semester || 'Unassigned Semester (From Schedule)') === data.semester)

      if (excludeScheduleId) {
         currentSemLoads = currentSemLoads.filter(l => l.id !== `v-${excludeScheduleId}`)
      }

      const targetSection = `${data.course} ${data.section}`.trim().toLowerCase()
      const targetSubj = data.subjectCode.toLowerCase()
      
      const alreadyExists = currentSemLoads.find(l => 
         (l.subject?.code || '').toLowerCase() === targetSubj && 
         (l.section_id || l.section || '').toLowerCase() === targetSection
      )

      let totalUnits = currentSemLoads.reduce((acc, l) => acc + Number(l.subject?.credits || 3), 0)
      
      if (!alreadyExists) {
          totalUnits += newUnits
      }

      if (totalUnits > 18) {
         return `Assignment blocked: Overload.\n\nA professor is only allowed a maximum of 18 units per semester. Adding this subject (${newUnits} units) exceeds the 18 unit limit.`
      }
      return null
    },

    async listSchedules(teachingLoadId = null) {
      const query = {}
      if (teachingLoadId) {
        // Support both number and string IDs for teaching_load_id
        const tid = Number(teachingLoadId)
        if (!Number.isNaN(tid)) {
          query.$or = [{ teaching_load_id: tid }, { teaching_load_id: String(teachingLoadId) }]
        } else {
          query.teaching_load_id = teachingLoadId
        }
      }
      return await schedules.find(query).toArray()
    },

    async createSchedule(data) {
      // Validate conflicts
      const conflictMsg = await this.checkConflicts(data)
      if (conflictMsg) throw new Error(conflictMsg)

      // Validate 18-unit limit
      const overloadMsg = await this.checkUnitLimit(data)
      if (overloadMsg) throw new Error(overloadMsg)

      const id = await nextId('schedules')
      const doc = { 
        id,
        subjectCode: String(data.subjectCode || '').trim().toUpperCase(),
        subjectTitle: String(data.subjectTitle || '').trim(),
        instructor: String(data.instructor || '').trim(),
        instructorId: data.instructorId || null,
        instructorEmail: data.instructorEmail || null,
        course: String(data.course || '').trim().toUpperCase(),
        yearLevel: String(data.yearLevel || '').trim(),
        semester: String(data.semester || '').trim(),
        section: String(data.section || '').trim().toUpperCase(),
        day: String(data.day || 'Monday').trim(),
        startTime: String(data.startTime || '08:00').trim(),
        endTime: String(data.endTime || '09:00').trim(),
        room: String(data.room || '').trim().toUpperCase(),
        teaching_load_id: data.teaching_load_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // Auto-link to teaching load if not provided
      if (!doc.teaching_load_id) {
        const facultyId = doc.instructorId
        const subjectCode = doc.subjectCode
        const section = `${doc.course} ${doc.section}`.trim()
        
        if (facultyId && subjectCode) {
          // Find load by faculty and subject code (requires join with subjects)
          const match = await teachingLoads.aggregate([
            { $lookup: { from: 'subjects', localField: 'subject_id', foreignField: 'id', as: 'sub' } },
            { $unwind: '$sub' },
            { $match: { 
                faculty_id: Number(facultyId), 
                'sub.code': { $regex: new RegExp(`^${subjectCode}$`, 'i') },
                $or: [{ section: section }, { section_id: section }]
            } },
            { $limit: 1 }
          ]).next()
          
          if (match) doc.teaching_load_id = match.id
        }
      }
      
      await schedules.insertOne(doc)
      return doc
    },

    async getScheduleById(id) {
      const query = { $or: [{ id: Number(id) }, { id: String(id) }] }
      return await schedules.findOne(query)
    },

    async updateSchedule(id, data) {
      const idQuery = { $or: [{ id: Number(id) }, { id: String(id) }] }
      
      // Validate conflicts (fetching current values for missing fields in 'data')
      const current = await schedules.findOne(idQuery)
      const merged = { ...current, ...data }
      const conflictMsg = await this.checkConflicts(merged, id)
      if (conflictMsg) throw new Error(conflictMsg)

      // Validate 18-unit limit
      const overloadMsg = await this.checkUnitLimit(merged, id)
      if (overloadMsg) throw new Error(overloadMsg)

      // Build update doc with explicit fields to prevent stripping
      const doc = { updated_at: new Date().toISOString() }
      const fields = [
        'subjectCode', 'subjectTitle', 'instructor', 'instructorId', 'instructorEmail',
        'course', 'yearLevel', 'semester', 'section', 'day', 'startTime', 'endTime', 'room', 'teaching_load_id'
      ]
      for (const f of fields) {
        if (data[f] !== undefined) doc[f] = data[f]
      }

      // Re-verify link if subject/faculty/section changed
      if (doc.instructorId || doc.subjectCode || doc.section || doc.course) {
        const current = await schedules.findOne(idQuery)
        if (current) {
          const sid = doc.instructorId || current.instructorId
          const sCode = doc.subjectCode || current.subjectCode
          const course = doc.course || current.course
          const sectionLine = doc.section || current.section
          const section = `${course} ${sectionLine}`.trim()
        
          if (sid && sCode) {
            const match = await teachingLoads.aggregate([
              { $lookup: { from: 'subjects', localField: 'subject_id', foreignField: 'id', as: 'sub' } },
              { $unwind: '$sub' },
              { $match: { 
                  faculty_id: Number(sid), 
                  'sub.code': { $regex: new RegExp(`^${sCode}$`, 'i') },
                  $or: [{ section: section }, { section_id: section }]
              } },
              { $limit: 1 }
            ]).next()
            if (match) doc.teaching_load_id = match.id
          }
        }
      }
      
      const idQueryFinal = { $or: [{ id: Number(id) }, { id: String(id) }] }
      await schedules.updateOne(idQueryFinal, { $set: doc })
      return await schedules.findOne(idQueryFinal)
    },

    async deleteSchedule(id) {
      const query = { $or: [{ id: Number(id) }, { id: String(id) }] }
      await schedules.deleteOne(query)
    },

    async findOverlappingSchedules(day, startTime, endTime, room) {
      // Very simple overlap check: (StartA < EndB) and (EndA > StartB)
      return await schedules.find({
        day,
        room,
        $or: [
          {
            $and: [
              { start_time: { $lt: endTime } },
              { end_time: { $gt: startTime } }
            ]
          }
        ]
      }).toArray()
    },

    // Instructions (curriculums, syllabi, lesson modules)
    async listInstructions(query = {}) {
      const filter = {}
      if (query.type) filter.type = query.type
      if (query.course) filter.course = query.course
      if (query.status) filter.status = query.status
      return await instructions.find(filter).sort({ updated_at: -1 }).toArray()
    },

    async findInstructionById(id) {
      return await instructions.findOne({ id: Number(id) })
    },

    async createInstruction(data) {
      const id = await nextId('instructions')
      const now = new Date().toISOString()
      const doc = {
        id,
        title: data.title || '',
        type: data.type || 'curriculum',
        course: data.course || '',
        subject: data.subject || '',
        description: data.description || '',
        status: data.status || 'Draft',
        author: data.author || '',
        link: data.link || '',
        created_at: now,
        updated_at: now,
      }
      await instructions.insertOne(doc)
      return doc
    },

    async updateInstruction(id, data) {
      const now = new Date().toISOString()
      const update = { updated_at: now }
      if (data.title !== undefined) update.title = data.title
      if (data.type !== undefined) update.type = data.type
      if (data.course !== undefined) update.course = data.course
      if (data.subject !== undefined) update.subject = data.subject
      if (data.description !== undefined) update.description = data.description
      if (data.status !== undefined) update.status = data.status
      if (data.author !== undefined) update.author = data.author
      if (data.link !== undefined) update.link = data.link
      await instructions.updateOne({ id: Number(id) }, { $set: update })
      return await instructions.findOne({ id: Number(id) })
    },

    async deleteInstruction(id) {
      await instructions.deleteOne({ id: Number(id) })
    },

    // Documents
    async listDocuments(facultyId = null, subjectId = null) {
      const query = {}
      if (facultyId) query.faculty_id = Number(facultyId)
      if (subjectId) query.subject_id = Number(subjectId)
      return await documents.find(query).sort({ created_at: -1 }).toArray()
    },

    async findDocumentById(id) {
      return await documents.findOne({ id: Number(id) })
    },

    async createDocument(data) {
      const id = await nextId('documents')
      const doc = {
        id,
        ...data,
        status: data.status || 'pending_faculty',
        created_at: new Date().toISOString(),
        history: [{ date: new Date().toISOString(), action: 'submitted', by: data.faculty_id || data.student_id }]
      }
      await documents.insertOne(doc)
      return doc
    },

    async updateDocumentStatus(id, status, reviewerId, comments = null) {
      await documents.updateOne(
        { id: Number(id) },
        {
          $set: { status },
          $push: {
            history: {
              date: new Date().toISOString(),
              action: status,
              by: reviewerId,
              comments
            }
          }
        }
      )
      return await documents.findOne({ id: Number(id) })
    },

    async deleteDocument(id) {
      await documents.deleteOne({ id: Number(id) })
    },

    // Evaluations
    async listEvaluations(facultyId) {
      return await evaluations.find({ faculty_id: Number(facultyId) }).sort({ created_at: -1 }).toArray()
    },

    async createEvaluation(data) {
      const id = await nextId('evaluations')
      const doc = { id, ...data, created_at: new Date().toISOString() }
      await evaluations.insertOne(doc)
      return doc
    },

    // Faculty specific user updates
    async updateFacultyProfile(userId, updates) {
      const allowedFields = [
        'specialization',
        'department_role',
        'consultation_hours',
        'full_name',
        'email',
        'profile_image_url'
      ]
      const setUpdates = {}
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setUpdates[field] = updates[field]
        }
      }
      if (Object.keys(setUpdates).length > 0) {
        const idQuery = { $or: [{ id: Number(userId) }, { id: String(userId) }] }
        await users.updateOne(idQuery, { $set: setUpdates })
      }
      return await this.getAccountProfile(userId)
    },

    // Logs
    async listLogs(limit = 100) {
      const logsArray = await logs.find({}).sort({ created_at: -1 }).limit(limit).toArray()
      const userIds = [...new Set(logsArray.map(l => l.user_id).filter(Boolean))]
      const userRows = await users.find({ id: { $in: userIds } }, { projection: { id: 1, role: 1 } }).toArray()
      const roleMap = {}
      for (const u of userRows) {
        roleMap[u.id] = u.role
      }
      return logsArray.map(l => ({ ...l, user_role: l.user_role || roleMap[l.user_id] || 'system' }))
    },

    async listUserLogs(limit = 100, userId) {
      if (!userId) return []
      const logsArray = await logs.find({ user_id: userId }).sort({ created_at: -1 }).limit(limit).toArray()
      const u = await users.findOne({ id: userId }, { projection: { role: 1 } })
      const urole = u ? u.role : 'system'
      return logsArray.map(l => ({ ...l, user_role: l.user_role || urole }))
    },

    async createLog({ type, action, details, userId, userName, userIp }) {
      try {
        const id = await nextId('logs')
        const doc = {
          id,
          type, // ACCESS, CREATE, UPDATE, DELETE
          action,
          details,
          user_id: userId,
          user_name: userName || null,
          user_ip: userIp || null,
          created_at: new Date().toISOString(),
        }
        await logs.insertOne(doc)
        console.log(`[LOG CREATED] ${action} (${type}) for User ${userName || userId}`)
      } catch (err) {
        console.error(`[LOG ERROR] Failed to create log ${action}:`, err)
        return null
      }
    },

    // --- College Research Repository ---
    async listResearchPublications(filter = {}) {
      return await researchPublications.find(filter).sort({ year: -1, updated_at: -1 }).toArray()
    },

    async findResearchPublicationById(id) {
      return await researchPublications.findOne({ id: Number(id) })
    },

    async createResearchPublication(data) {
      const id = await nextId('research_publications')
      const now = new Date().toISOString()
      const doc = {
        id,
        ...data,
        workflow_history: data.workflow_history || [{ at: now, action: 'created', by_user_id: data.created_by_user_id, note: null }],
        created_at: now,
        updated_at: now,
      }
      await researchPublications.insertOne(doc)
      return doc
    },

    async updateResearchPublication(id, patch) {
      const now = new Date().toISOString()
      await researchPublications.updateOne(
        { id: Number(id) },
        { $set: { ...patch, updated_at: now } },
      )
      return await researchPublications.findOne({ id: Number(id) })
    },

    async pushResearchWorkflow(id, entry) {
      await researchPublications.updateOne(
        { id: Number(id) },
        {
          $push: { workflow_history: entry },
          $set: { updated_at: new Date().toISOString() },
        },
      )
      return await researchPublications.findOne({ id: Number(id) })
    },

    async deleteResearchPublication(id) {
      await researchPublications.deleteOne({ id: Number(id) })
    },

    /** Next display ID for published works: CCS-CR-{year}-00001 (per calendar year). */
    async nextResearchRepositoryRef(publishYear) {
      return allocateResearchRepositoryRefForYear(publishYear)
    },

    /** Default ID for submitted works before publication: CCS-SUB-{year}-00001 */
    async nextResearchSubmissionRef(publishYear) {
      return allocateResearchSubmissionRefForYear(publishYear)
    },

    /** Assign CCS-SUB-* IDs to any documents lacking one. */
    async backfillSubmissionRefs() {
      const missing = await researchPublications
        .find({
          $or: [{ submission_ref: { $exists: false } }, { submission_ref: null }, { submission_ref: '' }],
        })
        .sort({ id: 1 })
        .toArray()
      let count = 0
      for (const p of missing) {
        const at = p.created_at || new Date().toISOString()
        const y = new Date(at).getFullYear()
        const ref = await allocateResearchSubmissionRefForYear(y)
        await researchPublications.updateOne(
          { id: p.id },
          { $set: { submission_ref: ref, updated_at: new Date().toISOString() } },
        )
        count += 1
      }
      return count
    },

    /** Assign CCS-CR-* IDs to published documents missing one (startup / migration). */
    async backfillPublishedRepositoryRefs() {
      const missing = await researchPublications
        .find({
          status: 'published',
          $or: [{ repository_ref: { $exists: false } }, { repository_ref: null }, { repository_ref: '' }],
        })
        .sort({ published_at: 1, id: 1 })
        .toArray()
      let count = 0
      for (const p of missing) {
        const at = p.published_at || p.updated_at || p.created_at
        const y = at ? new Date(at).getFullYear() : new Date().getFullYear()
        const ref = await allocateResearchRepositoryRefForYear(y)
        await researchPublications.updateOne(
          { id: p.id },
          { $set: { repository_ref: ref, updated_at: new Date().toISOString() } },
        )
        count += 1
      }
      return count
    },

    async fixMissingFacultyInformation() {
      const missing = await users.find({ role: { $ne: 'student' } }).toArray()
      let count = 0
      for (const u of missing) {
        if (!u.personal_information || Object.keys(u.personal_information).length === 0) {
          if (u.full_name) {
            const names = deriveStudentRootNames({}, u.full_name)
            await users.updateOne(
              { id: u.id },
              {
                $set: {
                  personal_information: {
                    first_name: names.first_name || '',
                    middle_name: names.middle_name || '',
                    last_name: names.last_name || '',
                  },
                  first_name: names.first_name || '',
                  middle_name: names.middle_name || '',
                  last_name: names.last_name || '',
                }
              }
            )
            count++
          }
        }
      }
      return count
    },

    /** Lightweight search for linking co-authors (students + faculty roles). Empty query returns a recent pool for dropdowns.
     * When courseFilter is CS or IT, only students in that program are included; faculty/staff are always included. */
    async searchUsersForResearchAuthors(query, limit = 20, courseFilter = null) {
      const q = String(query || '').trim()
      const roles = ['student', 'faculty', 'dean', 'department_chair', 'secretary', 'faculty_professor']
      const staffRoles = ['faculty', 'dean', 'department_chair', 'secretary', 'faculty_professor']
      const c = String(courseFilter || '').trim().toUpperCase()
      const courseOk = c === 'CS' || c === 'IT'
      const programAliases =
        c === 'CS' ? ['CS', 'cs', 'BSCS', 'bscs'] : c === 'IT' ? ['IT', 'it', 'BSIT', 'bsit'] : []

      const projection = {
        _id: 0,
        id: 1,
        role: 1,
        full_name: 1,
        identifier: 1,
        email: 1,
        student_id: 1,
        personal_information: 1,
      }
      const lim = Math.min(80, Math.max(10, Number(limit) || 20))

      function authorScopeFilter(textSearch = null) {
        const inRoles = { role: { $in: roles } }
        if (!courseOk) {
          return textSearch ? { $and: [inRoles, textSearch] } : inRoles
        }
        const studentMatchesCourse = {
          role: 'student',
          'academic_info.program': { $in: programAliases },
        }
        const courseScope = {
          $or: [{ role: { $in: staffRoles } }, studentMatchesCourse],
        }
        return textSearch ? { $and: [inRoles, courseScope, textSearch] } : { $and: [inRoles, courseScope] }
      }

      let rows
      if (q.length < 2) {
        rows = await users
          .find(authorScopeFilter(), { projection })
          .sort({ full_name: 1 })
          .limit(lim)
          .toArray()
      } else {
        const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(esc, 'i')
        const textSearch = {
          $or: [{ full_name: re }, { identifier: re }, { email: re }, { student_id: re }],
        }
        rows = await users.find(authorScopeFilter(textSearch), { projection }).limit(lim).toArray()
      }
      return rows.map((u) => {
        const pi = u.personal_information || {}
        const dn =
          String(u.full_name || '').trim() ||
          [pi.first_name, pi.middle_name, pi.last_name].filter(Boolean).join(' ') ||
          u.identifier ||
          u.email ||
          `User ${u.id}`
        return {
          id: u.id,
          role: u.role,
          displayName: dn,
          studentId: u.student_id || (u.role === 'student' ? u.identifier : null),
        }
      })
    },

    async listFacultyForResearchAdviser(limit = 200) {
      const roles = ['faculty', 'dean', 'department_chair', 'faculty_professor', 'secretary']
      const rows = await users
        .find(
          { role: { $in: roles } },
          { projection: { _id: 0, id: 1, role: 1, full_name: 1, identifier: 1, email: 1, personal_information: 1 } },
        )
        .limit(Number(limit) || 200)
        .toArray()
      return rows.map((u) => {
        const pi = u.personal_information || {}
        const dn =
          String(u.full_name || '').trim() ||
          [pi.first_name, pi.middle_name, pi.last_name].filter(Boolean).join(' ') ||
          u.identifier ||
          u.email ||
          `User ${u.id}`
        return { id: u.id, role: u.role, displayName: dn }
      })
    },

    async getResearchAnalytics() {
      const published = await researchPublications.find({ status: 'published' }).toArray()
      const byYear = {}
      const byCategory = {}
      const adviserCounts = {}
      const facultyAuthorCounts = {}
      const FACULTY_ROLES = new Set(['faculty', 'dean', 'department_chair', 'faculty_professor', 'secretary'])

      for (const p of published) {
        const y = p.year ?? 'unknown'
        byYear[y] = (byYear[y] || 0) + 1
        const cat = String(p.category || 'Uncategorized').trim() || 'Uncategorized'
        byCategory[cat] = (byCategory[cat] || 0) + 1
        const adv = p.adviser_faculty_id
        if (adv != null) {
          adviserCounts[adv] = (adviserCounts[adv] || 0) + 1
        }
        const authors = Array.isArray(p.authors) ? p.authors : []
        for (const a of authors) {
          if (a?.user_id != null && FACULTY_ROLES.has(String(a.user_role || ''))) {
            const uid = Number(a.user_id)
            facultyAuthorCounts[uid] = (facultyAuthorCounts[uid] || 0) + 1
          }
        }
      }

      const pipeline = await researchPublications
        .aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .toArray()
      const byStatus = Object.fromEntries(pipeline.map((x) => [x._id, x.count]))

      const userIds = new Set([
        ...Object.keys(adviserCounts).map(Number),
        ...Object.keys(facultyAuthorCounts).map(Number),
      ])
      const idToName = {}
      if (userIds.size > 0) {
        const urows = await users
          .find(
            { id: { $in: [...userIds] } },
            { projection: { _id: 0, id: 1, full_name: 1, identifier: 1, personal_information: 1 } },
          )
          .toArray()
        for (const u of urows) {
          const pi = u.personal_information || {}
          idToName[u.id] =
            String(u.full_name || '').trim() ||
            [pi.first_name, pi.middle_name, pi.last_name].filter(Boolean).join(' ') ||
            u.identifier ||
            `User ${u.id}`
        }
      }

      const mergeFacultyActivity = {}
      for (const [idStr, c] of Object.entries(adviserCounts)) {
        const id = Number(idStr)
        mergeFacultyActivity[id] = (mergeFacultyActivity[id] || 0) + c
      }
      for (const [idStr, c] of Object.entries(facultyAuthorCounts)) {
        const id = Number(idStr)
        mergeFacultyActivity[id] = (mergeFacultyActivity[id] || 0) + c
      }
      const mostActiveFaculty = Object.entries(mergeFacultyActivity)
        .map(([userId, count]) => ({
          userId: Number(userId),
          displayName: idToName[userId] || `User ${userId}`,
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)

      return {
        totalPublished: published.length,
        byYear,
        byCategory,
        byStatus,
        mostActiveFaculty,
      }
    },
    // Events
    async listEvents(query = {}) {
      const filter = {}
      if (query.type) filter.type = query.type
      if (query.department) filter.department = query.department
      if (query.status) filter.status = query.status
      if (query.visibility) filter.visibility = query.visibility

      return await events.find(filter).sort({ start_time: 1 }).toArray()
    },

    async getEventById(id) {
      return await events.findOne({ id: Number(id) })
    },

    async createEvent(data) {
      const id = await nextId('events')
      const doc = {
        id,
        ...data,
        status: data.status || 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      await events.insertOne(doc)
      return doc
    },

    async updateEvent(id, updates) {
      const upd = { ...updates, updated_at: new Date().toISOString() }
      await events.updateOne({ id: Number(id) }, { $set: upd })
      return await events.findOne({ id: Number(id) })
    },

    async deleteEvent(id) {
      await events.deleteOne({ id: Number(id) })
    },

    async approveEvent(id, approvedBy) {
      await events.updateOne(
        { id: Number(id) },
        {
          $set: {
            status: 'approved',
            approved_by: approvedBy,
            updated_at: new Date().toISOString()
          }
        }
      )
      return await events.findOne({ id: Number(id) })
    },

    // File Storage (GridFS)
    async uploadFile(filename, mimetype, buffer) {
      console.log(`[STORE] Starting upload for: ${filename} (${mimetype}), size: ${buffer.length} bytes`)
      return new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(filename, {
          metadata: { contentType: mimetype }
        })
        const readable = new Readable()
        readable._read = () => {}
        readable.push(buffer)
        readable.push(null)
        readable.pipe(uploadStream)
          .on('error', (err) => {
            console.error('[STORE] Upload stream error:', err)
            reject(err)
          })
          .on('finish', () => {
            console.log(`[STORE] Upload finished. New fileId: ${uploadStream.id.toString()}`)
            resolve({
              fileId: uploadStream.id.toString(),
              filename: filename
            })
          })
      })
    },

    async downloadFile(fileId) {
      console.log(`[STORE] Requested download for fileId: "${fileId}"`)
      
      // Basic validation to prevent ObjectId constructor from throwing
      if (!fileId || typeof fileId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(fileId)) {
        console.error(`[STORE] Aborting download: Invalid ObjectId format for "${fileId}"`)
        throw new Error(`Invalid file ID format: "${fileId}". Expected a 24-character hex string.`)
      }

      const id = new ObjectId(fileId)
      const files = await db.collection('instruction_files.files').find({ _id: id }).toArray()
      
      if (!files.length) {
        console.error(`[STORE] File NOT found in database: ${fileId}`)
        throw new Error(`File not found in storage: ${fileId}`)
      }
      
      const file = files[0]
      console.log(`[STORE] File located: ${file.filename} (${file.length} bytes)`)
      
      // Smart MIME inference for legacy files missing metadata.contentType
      let contentType = file.metadata?.contentType
      if (!contentType || contentType === 'application/octet-stream') {
        const ext = file.filename.split('.').pop().toLowerCase()
        const mimeMap = {
          'pdf': 'application/pdf',
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'doc': 'application/msword',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'xls': 'application/vnd.ms-excel',
          'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'ppt': 'application/vnd.ms-powerpoint',
          'txt': 'text/plain',
          'csv': 'text/csv'
        }
        if (mimeMap[ext]) {
          contentType = mimeMap[ext]
          console.log(`[STORE] Inferred MIME type for legacy file: ${contentType}`)
        }
      }
      
      const stream = bucket.openDownloadStream(id)
      return {
        stream,
        filename: file.filename,
        contentType: contentType || 'application/octet-stream'
      }
    },
    // Office Hours
    async listOfficeHours(filter = {}) {
      const { userId, professorIds } = filter
      const query = {}
      if (userId) query.user_id = Number(userId)
      if (professorIds && professorIds.length > 0) {
        query.user_id = { $in: professorIds.map(Number) }
      }
      const pipeline = [
        { $match: query },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: 'id',
            as: 'professor_info'
          }
        },
        {
          $addFields: {
            professor_name: { $arrayElemAt: ['$professor_info.full_name', 0] }
          }
        },
        { $project: { professor_info: 0 } },
        { $sort: { id: -1 } }
      ]
      return await officeHours.aggregate(pipeline).toArray()
    },
    async createOfficeHour(data) {
      const id = await nextId('office_hours')
      const doc = {
        id,
        user_id: Number(data.userId),
        day: data.day,
        time: data.time,
        room: data.room,
        notes: data.notes || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      await officeHours.insertOne(doc)
      return doc
    },
    async deleteOfficeHour(id, userId) {
      const query = { id: Number(id) }
      if (userId) query.user_id = Number(userId)
      const res = await officeHours.deleteOne(query)
      return res.deletedCount > 0
    }
  }
}

