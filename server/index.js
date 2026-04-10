import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { openStore } from './store.js'
import {
  generateBackupCode,
  generateToken,
  hashPassword,
  normalizeIdentifier,
  verifyPassword,
} from './auth.js'
import speakeasy from 'speakeasy'
import qrcode from 'qrcode'
import { authorize, PERMISSIONS } from './security.js'

const PORT = Number(process.env.PORT || 5000)
const SESSION_TTL_HOURS = 24

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// Provider init is async for MongoDB; keep server startup blocked until the store is ready.
let store
try {
  store = await openStore()
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Failed to open datastore:', err)
  process.exit(1)
}

const app = express()
app.use(helmet())

const configuredCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const isDev = process.env.NODE_ENV !== 'production'
const isLocalViteOrigin = (origin) =>
  /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(String(origin || ''))

app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser clients (curl/postman) and same-origin requests.
      if (!origin) return cb(null, true)

      if (configuredCorsOrigins.length > 0) {
        return cb(null, configuredCorsOrigins.includes(origin))
      }

      // Dev default: allow Vite on any localhost port (5173, 5174, etc.).
      if (isDev && isLocalViteOrigin(origin)) return cb(null, true)

      return cb(null, false)
    },
    credentials: false,
  })
)

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 2rem; line-height: 1.5;">
        <h2>CCS Profiling System API</h2>
        <p>The backend server is running successfully.</p>
        <p>To access the application, please visit the frontend at:</p>
        <a href="http://localhost:5173" style="font-weight: bold; color: #4f46e5;">http://localhost:5173</a>
      </body>
    </html>
  `)
})

app.use(express.json({ limit: '200kb' }))
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
)

function nowIso() {
  return new Date().toISOString()
}

function addHoursISO(hours) {
  const d = new Date()
  d.setHours(d.getHours() + hours)
  return d.toISOString()
}

async function isLocked(identifier) {
  const row = await store.getLoginAttempt(identifier)
  if (!row?.locked_until) return { locked: false }
  if (new Date(row.locked_until) > new Date()) return { locked: true, lockedUntil: row.locked_until }
  await store.clearLoginAttempt(identifier)
  return { locked: false }
}

async function recordFailed(identifier) {
  const MAX = 5
  const LOCK_MINUTES = 15
  const row = await store.getLoginAttempt(identifier)
  const count = (row?.count || 0) + 1
  if (count >= MAX) {
    const d = new Date()
    d.setMinutes(d.getMinutes() + LOCK_MINUTES)
    await store.upsertLoginAttempt(identifier, 0, d.toISOString())
    return { locked: true, lockedUntil: d.toISOString() }
  }
  await store.upsertLoginAttempt(identifier, count, null)
  return { locked: false }
}

async function findUserByLoginCredential(rawLogin) {
  const key = normalizeIdentifier(rawLogin)
  if (!key) return null
  return await store.findUserByLoginCredential(key)
}

function studentMustChangePassword(u) {
  if (!u || u.role !== 'student') return false
  return u.must_change_password === 1 || u.must_change_password === true
}

function middleInitial(middleName) {
  const s = String(middleName || '').trim()
  if (!s) return ''
  return `${s.charAt(0).toUpperCase()}.`
}

/**
 * Normalize personal_information (snake_case / camelCase / alternate keys) and
 * fill missing parts from full_name so profile UI always has strings to show.
 */
function normalizedStudentNameParts(piRaw, fullName, rootNames) {
  const root = rootNames && typeof rootNames === 'object' ? rootNames : {}
  const raw = piRaw && typeof piRaw === 'object' ? piRaw : {}
  let first = String(
    root.first_name ??
      root.firstName ??
      raw.first_name ??
      raw.firstName ??
      raw.FirstName ??
      raw.given_name ??
      '',
  ).trim()
  let middle = String(
    root.middle_name ??
      root.middleName ??
      raw.middle_name ??
      raw.middleName ??
      raw.MiddleName ??
      raw.middle ??
      '',
  ).trim()
  let last = String(
    root.last_name ??
      root.lastName ??
      raw.last_name ??
      raw.lastName ??
      raw.LastName ??
      raw.family_name ??
      raw.surname ??
      '',
  ).trim()

  const fb = String(fullName || '').trim()
  const tok = fb.split(/\s+/).filter(Boolean)
  if (tok.length >= 2) {
    if (!first) first = tok[0]
    if (!last) last = tok[tok.length - 1]
    if (!middle && tok.length >= 3) middle = tok.slice(1, -1).join(' ')
  } else if (tok.length === 1) {
    if (!first && !last) first = tok[0]
    else if (!first) first = tok[0]
    else if (!last) last = tok[0]
  }

  return { first_name: first, middle_name: middle, last_name: last }
}

function studentDisplayNameFromPi(pi, fullNameFallback) {
  const fn = String(pi?.first_name || '').trim()
  const mn = String(pi?.middle_name || '').trim()
  const ln = String(pi?.last_name || '').trim()
  if (fn || mn || ln) {
    const parts = [fn]
    const mi = middleInitial(mn)
    if (mi) parts.push(mi)
    if (ln) parts.push(ln)
    return parts.join(' ')
  }
  const fb = String(fullNameFallback || '').trim()
  if (!fb) return 'Student'
  const tok = fb.split(/\s+/).filter(Boolean)
  if (tok.length >= 3) {
    return [tok[0], middleInitial(tok[1]), ...tok.slice(2)].filter(Boolean).join(' ')
  }
  return fb
}

function studentAccountProfileForResponse(p) {
  const pi = normalizedStudentNameParts(p.personal_information, p.full_name, {
    first_name: p.first_name,
    middle_name: p.middle_name,
    last_name: p.last_name,
  })
  const ai = p.academic_info || {}
  return {
    role: 'student',
    displayName: studentDisplayNameFromPi(pi, p.full_name),
    firstName: pi.first_name,
    middleName: pi.middle_name,
    lastName: pi.last_name,
    studentId: p.student_id || '',
    email: p.email || '',
    profileImageUrl: p.profile_image_url || null,
    twofaEnabled: !!p.twofa_enabled,
    mustChangePassword: studentMustChangePassword({ ...p, role: 'student' }),
    summary: {
      classSection: p.class_section || '',
      studentType: p.student_type || '',
      program: ai.program || '',
      yearLevel: ai.year_level || '',
      enrollmentStatus: ai.enrollment_status || '',
    },
  }
}

function adminFacultyAccountProfileForResponse(p) {
  const loginEmail = String(p.email || p.identifier || '').trim()
  return {
    role: p.role,
    identifier: p.identifier || '',
    fullName: p.full_name || '',
    email: loginEmail,
    profileImageUrl: p.profile_image_url || null,
    twofaEnabled: !!p.twofa_enabled,
  }
}

function publicAuthUser(user) {
  if (!user) return null
  if (user.role === 'student') {
    const pi = normalizedStudentNameParts(user.personal_information, user.full_name, {
      first_name: user.first_name,
      middle_name: user.middle_name,
      last_name: user.last_name,
    })
    const displayName = studentDisplayNameFromPi(pi, user.full_name)
    return {
      role: user.role,
      identifier: user.identifier,
      studentId: user.student_id || user.identifier,
      email: user.email || '',
      fullName: user.full_name || '',
      displayName,
      firstName: pi.first_name,
      middleName: pi.middle_name,
      lastName: pi.last_name,
      profileImageUrl: user.profile_image_url || null,
      mustChangePassword: studentMustChangePassword(user),
    }
  }
  return {
    role: user.role,
    identifier: user.identifier,
    fullName: user.full_name || '',
    displayName: user.full_name || user.identifier || '',
    profileImageUrl: user.profile_image_url || null,
  }
}

const authMiddleware = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  const session = await store.getSessionByToken(token)
  if (!session) return res.status(401).json({ error: 'Invalid token' })
  if (new Date(session.expires_at) <= new Date()) {
    await store.deleteSessionByToken(token)
    return res.status(401).json({ error: 'Session expired' })
  }
  const user = await store.getUserByIdForAuth(session.user_id)
  if (!user) return res.status(401).json({ error: 'User not found' })
  if (!user.is_active) {
    await store.deleteSessionByToken(token)
    return res.status(401).json({ error: 'Account deactivated' })
  }
  req.user = user
  req.token = token
  next()
})

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const role = String(req.body?.role || '').trim()
  const password = String(req.body?.password || '')
  let fullName = String(req.body?.fullName || '').trim() || null
  const enable2FA = Boolean(req.body?.enable2FA)

  if (!['admin', 'student', 'faculty', 'dean', 'department_chair', 'secretary', 'faculty_professor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  let identifier
  let studentIdStored = null
  let emailStored = null
  let classSection = null
  let studentType = null
  let department = String(req.body?.department || '').trim() || null

  if (role === 'student') {
    const studentIdRaw = String(req.body?.studentId ?? '').trim()
    const emailRaw = String(req.body?.email ?? '').trim()
    const studentIdNorm = normalizeIdentifier(studentIdRaw)
    const emailNorm = normalizeIdentifier(emailRaw)
    if (!studentIdRaw || studentIdNorm.length < 3) {
      return res.status(400).json({ error: 'Student ID must be at least 3 characters' })
    }
    if (!emailRaw || !emailNorm.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required' })
    }
    const dup = await store.findStudentDuplicate(studentIdNorm, emailNorm)
    if (dup) return res.status(409).json({ error: 'Student ID or email is already in use' })

    identifier = studentIdNorm
    studentIdStored = studentIdRaw
    emailStored = emailNorm
    classSection = String(req.body?.classSection || '').trim() || null
    const st = String(req.body?.studentType || 'regular').toLowerCase()
    studentType = st === 'irregular' ? 'irregular' : 'regular'
    const pi = req.body?.personalInformation || {}
    const fn = String(pi.first_name || '').trim()
    const mn = String(pi.middle_name || '').trim()
    const ln = String(pi.last_name || '').trim()
    const composed = [fn, mn, ln].filter(Boolean).join(' ')
    if (composed) fullName = composed
  } else {
    identifier = normalizeIdentifier(req.body?.identifier)
    if (!identifier || identifier.length < 3) {
      return res.status(400).json({ error: 'Invalid identifier' })
    }
    const existing = await store.findUserByIdentifier(identifier)
    if (existing) return res.status(409).json({ error: 'Account already exists' })
    if (identifier.includes('@')) {
      emailStored = identifier
    }
  }

  const passwordHash = hashPassword(password)
  const backupCode = enable2FA ? generateBackupCode() : null

  try {
    await store.createUser({
      role,
      identifier,
      fullName,
      passwordHash,
      enable2FA,
      backupCode,
      createdAtIso: nowIso(),
      classSection,
      studentType,
      studentIdStored,
      emailStored,
      department,
      affiliations: req.body?.affiliations || [],
      academicInfo: req.body?.academicInfo || {},
      personalInformation: req.body?.personalInformation || {},
      academicHistory: req.body?.academicHistory || [],
      nonAcademicActivities: req.body?.nonAcademicActivities || [],
      violations: req.body?.violations || [],
      skills: req.body?.skills || [],
      affiliations: req.body?.affiliations || [],
    })

    const creatorId = req.user?.id || null
    const creatorName = req.user?.full_name || req.user?.identifier || 'System'
    await store.createLog({
      type: 'CREATE',
      action: 'Account Created',
      details: `New ${role} account created: ${fullName || identifier}`,
      userId: creatorId,
      userName: creatorName,
      userIp: req.ip
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  return res.status(201).json({ ok: true, twoFABackupCode: backupCode })
}))

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const identifier = normalizeIdentifier(req.body?.identifier)
  const password = String(req.body?.password || '')
  const twoFACode = String(req.body?.twoFACode || '').trim()

  if (!identifier || !password) return res.status(400).json({ error: 'Missing credentials' })

  const lock = await isLocked(identifier)
  if (lock.locked) return res.status(429).json({ error: 'Locked', lockedUntil: lock.lockedUntil })

  const user = await findUserByLoginCredential(req.body?.identifier)
  if (!user) {
    await recordFailed(identifier)
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'This account has been deactivated' })
  }

  if (!verifyPassword(password, user.password_hash)) {
    const st = await recordFailed(identifier)
    return res.status(st.locked ? 429 : 401).json({
      error: st.locked ? 'Locked' : 'Invalid credentials',
      lockedUntil: st.locked ? st.lockedUntil : undefined,
    })
  }

  if (user.twofa_enabled) {
    if (!twoFACode) return res.status(401).json({ error: 'Two-factor required' })
    
    // Check traditional backup code first
    let isValid = twoFACode === user.twofa_backup_code
    
    // Check TOTP code
    if (!isValid && user.twofa_secret) {
      isValid = speakeasy.totp.verify({
        secret: user.twofa_secret,
        encoding: 'base32',
        token: twoFACode,
      })
    }
    
    if (!isValid) return res.status(401).json({ error: 'Invalid 2FA code' })
  }

  await store.clearLoginAttempt(identifier)

  const token = generateToken()
  await store.createSession({
    token,
    userId: user.id,
    createdAtIso: nowIso(),
    expiresAtIso: addHoursISO(SESSION_TTL_HOURS),
  })

  await store.createLog({
    type: 'ACCESS',
    action: 'User Login',
    details: `${user.full_name || user.identifier} logged in successfully`,
    userId: user.id,
    userName: user.full_name || user.identifier,
    userIp: req.ip
  })
  console.log(`[AUTH] Login successful for ${user.identifier}`)

  return res.json({
    ok: true,
    token,
    user: publicAuthUser(user),
  })
}))

app.post('/api/auth/logout', authMiddleware, asyncHandler(async (req, res) => {
  await store.deleteSessionByToken(req.token)
  res.json({ ok: true })
}))

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ ok: true, user: publicAuthUser(req.user) })
})

app.get('/api/account/profile', authMiddleware, asyncHandler(async (req, res) => {
  const p = await store.getAccountProfile(req.user.id)
  if (!p) return res.status(404).json({ error: 'Profile not found' })
  if (p.role === 'student') {
    return res.json({ ok: true, profile: studentAccountProfileForResponse(p) })
  }
  return res.json({ ok: true, profile: adminFacultyAccountProfileForResponse(p) })
}))

app.patch('/api/account/profile', authMiddleware, asyncHandler(async (req, res) => {
  const body = {}
  if (req.body.profileImageUrl !== undefined) body.profileImageUrl = req.body.profileImageUrl
  if (req.body.fullName !== undefined) body.fullName = req.body.fullName
  if (Object.keys(body).length === 0) {
    return res.status(400).json({ error: 'No updates provided' })
  }
  const p = await store.updateAccountProfile(req.user.id, body)
  if (!p) return res.status(404).json({ error: 'Profile not found' })
  if (p.role === 'student') {
    return res.json({ ok: true, profile: studentAccountProfileForResponse(p) })
  }
  return res.json({ ok: true, profile: adminFacultyAccountProfileForResponse(p) })
}))

app.post('/api/account/change-password', authMiddleware, asyncHandler(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }
  const hash = await store.getPasswordHash(req.user.id)
  if (!hash || !verifyPassword(currentPassword, hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' })
  }
  await store.updatePasswordHash(req.user.id, hashPassword(newPassword))
  res.json({ ok: true })
}))

app.post('/api/auth/2fa/setup', authMiddleware, asyncHandler(async (req, res) => {
  const label = String(req.user.email || req.user.identifier || req.user.id || 'user').trim()
  const secret = speakeasy.generateSecret({ name: `CCSDashboard (${label})` })
  await store.setTwofaSecret(req.user.id, secret.base32)
  
  try {
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url)
    res.json({ ok: true, secret: secret.base32, qrCode: qrCodeUrl })
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' })
  }
}))

app.post('/api/auth/2fa/verify', authMiddleware, asyncHandler(async (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Missing code' })

  const user = await store.getTwofaSecret(req.user.id)
  if (!user || !user.twofa_secret) {
    return res.status(400).json({ error: '2FA not set up' })
  }

  const isValid = speakeasy.totp.verify({
    secret: user.twofa_secret,
    encoding: 'base32',
    token: code,
  })

  if (isValid) {
    await store.enableTwofa(req.user.id)
    res.json({ ok: true })
  } else {
    res.status(401).json({ error: 'Invalid 2FA code' })
  }
}))

app.get('/api/admin/users', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const users = await store.listAdminUsers()
  res.json({ ok: true, users })
}))

app.get('/api/admin/users/:id', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  const user = await store.getAdminUserById(id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ ok: true, user })
}))

app.patch('/api/admin/users/:id', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  const target = await store.getAdminUserById(id)
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (target.role === 'admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can update admin accounts' })
  }
  const updates = {}
  if (req.body.isActive !== undefined) {
    if (typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be boolean' })
    }
    updates.is_active = req.body.isActive
  }
  if (req.body.personalInformation !== undefined) {
    updates.personal_information = req.body.personalInformation
    const pi = updates.personal_information
    const fn = String(pi.first_name || '').trim()
    const mn = String(pi.middle_name || '').trim()
    const ln = String(pi.last_name || '').trim()
    if (fn || ln) {
      updates.full_name = [fn, mn, ln].filter(Boolean).join(' ')
    }
  }
  if (req.body.academicInfo !== undefined) {
    updates.academic_info = req.body.academicInfo
  }
  if (req.body.academicHistory !== undefined) {
    updates.academic_history = req.body.academicHistory
  }
  if (req.body.nonAcademicActivities !== undefined) {
    updates.non_academic_activities = req.body.nonAcademicActivities
  }
  if (req.body.violations !== undefined) {
    updates.violations = req.body.violations
  }
  if (req.body.skills !== undefined) {
    updates.skills = req.body.skills
  }
  if (req.body.affiliations !== undefined) {
    updates.affiliations = req.body.affiliations
  }
  if (req.body.fullName !== undefined && updates.full_name === undefined) {
    updates.full_name = req.body.fullName
  }
  if (req.body.email !== undefined) {
    updates.email = req.body.email
  }
  if (req.body.classSection !== undefined) {
    updates.class_section = req.body.classSection
  }
  if (req.body.studentType !== undefined) {
    updates.student_type = req.body.studentType
  }
  if (req.body.studentId !== undefined) {
    updates.student_id = req.body.studentId
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid updates provided' })
  }
  const user = await store.updateStudentProfile(id, updates)

  // Log the update
  const actingUser = req.user
  let detailMsg = `Updated profile for ${user.full_name}`
  if (req.body.isActive !== undefined) detailMsg = `${req.body.isActive ? 'Activated' : 'Deactivated'} account: ${user.full_name}`
  if (req.body.role !== undefined) detailMsg = `Changed role for ${user.full_name} to ${req.body.role}`

  await store.createLog({
    type: 'UPDATE',
    action: 'Profile Updated',
    details: detailMsg,
    userId: actingUser.id,
    userName: actingUser.full_name || actingUser.identifier,
    userIp: req.ip
  })

  res.json({ ok: true, user })
}))

app.get('/api/admin/students', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const { skill, affiliation } = req.query
  let students = []
  if (skill) {
    students = await store.findStudentsBySkill(skill)
  } else if (affiliation) {
    students = await store.findStudentsByAffiliation(affiliation)
  } else {
    // Default to all students
    const users = await store.listAdminUsers()
    students = users.filter(u => u.role === 'student')
  }
  res.json({ ok: true, students })
}))

app.get('/api/admin/logs', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const list = await store.listLogs(limit)
  console.log(`[ADMIN] Fetched ${list.length} activity logs`)
  res.json({ ok: true, logs: list })
}))

// --- Faculty Module API ---

// Subjects
app.get('/api/subjects', authMiddleware, asyncHandler(async (req, res) => {
  const list = await store.listSubjects()
  res.json({ ok: true, subjects: list })
}))

app.post('/api/subjects', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const { code, name, description, units } = req.body
  if (!code || !name) return res.status(400).json({ error: 'Code and Name are required' })
  const sub = await store.createSubject({ code, name, description, units: Number(units) || 0 })
  res.status(201).json({ ok: true, subject: sub })
}))

app.patch('/api/subjects/:id', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const sub = await store.updateSubject(id, req.body)
  res.json({ ok: true, subject: sub })
}))

app.delete('/api/subjects/:id', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  await store.deleteSubject(id)
  res.json({ ok: true })
}))

// Teaching Loads
app.get('/api/teaching-loads', authMiddleware, asyncHandler(async (req, res) => {
  const facultyId = req.query.facultyId || (req.user.role === 'faculty' ? req.user.id : null)
  const list = await store.listTeachingLoads(facultyId)
  res.json({ ok: true, teachingLoads: list })
}))

app.post('/api/teaching-loads', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const { facultyId, subjectId, sectionId, semester, academicYear } = req.body
  if (!facultyId || !subjectId || !sectionId) return res.status(400).json({ error: 'Faculty, Subject, and Section are required' })
  const load = await store.createTeachingLoad({
    faculty_id: Number(facultyId),
    subject_id: Number(subjectId),
    section_id: sectionId,
    semester,
    academic_year: academicYear
  })
  res.status(201).json({ ok: true, teachingLoad: load })
}))

app.delete('/api/teaching-loads/:id', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  await store.deleteTeachingLoad(id)
  res.json({ ok: true })
}))

// Schedules
app.get('/api/schedules', authMiddleware, asyncHandler(async (req, res) => {
  const loadId = req.query.teachingLoadId
  const list = await store.listSchedules(loadId)
  res.json({ ok: true, schedules: list })
}))

app.post('/api/schedules', authMiddleware, authorize(PERMISSIONS.SCHEDULING_MANAGE), asyncHandler(async (req, res) => {
  const { teachingLoadId, day, startTime, endTime, room } = req.body
  if (!teachingLoadId || !day || !startTime || !endTime) return res.status(400).json({ error: 'Missing schedule details' })
  
  // Conflict detection
  const overlaps = await store.findOverlappingSchedules(day, startTime, endTime, room)
  if (overlaps.length > 0) {
    return res.status(409).json({ error: 'Schedule conflict detected', overlaps })
  }

  const sch = await store.createSchedule({
    teaching_load_id: Number(teachingLoadId),
    day,
    start_time: startTime,
    end_time: endTime,
    room
  })
  res.status(201).json({ ok: true, schedule: sch })
}))

app.delete('/api/schedules/:id', authMiddleware, authorize(PERMISSIONS.SCHEDULING_MANAGE), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  await store.deleteSchedule(id)
  res.json({ ok: true })
}))

// Documents
app.get('/api/documents', authMiddleware, asyncHandler(async (req, res) => {
  const { facultyId, subjectId, status } = req.query
  const list = await store.listDocuments(facultyId, subjectId)
  // Filter by status if provided
  const filtered = status ? list.filter(d => d.status === status) : list
  res.json({ ok: true, documents: filtered })
}))

app.post('/api/documents', authMiddleware, authorize(PERMISSIONS.DOC_CREATE), asyncHandler(async (req, res) => {
  const { subjectId, title, fileUrl, fileType } = req.body
  if (!subjectId || !title) return res.status(400).json({ error: 'Subject ID and title are required' })
  
  // Determine initial status based on role
  let initialStatus = 'pending_faculty'
  if (req.user.role === 'faculty' || req.user.role === 'secretary' || req.user.role === 'faculty_professor') {
    initialStatus = 'pending_chair'
  } else if (req.user.role === 'student') {
    initialStatus = 'pending_faculty'
  }

  const doc = await store.createDocument({
    faculty_id: req.user.role !== 'student' ? req.user.id : null,
    student_id: req.user.role === 'student' ? req.user.id : null,
    subject_id: Number(subjectId),
    title,
    file_url: fileUrl,
    file_type: fileType,
    status: initialStatus
  })
  res.status(201).json({ ok: true, document: doc })
}))

app.patch('/api/documents/:id/approval', authMiddleware, authorize(PERMISSIONS.DOC_APPROVE), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const { action, comments } = req.body // action: 'approve' or 'reject'
  
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' })
  }

  const doc = await store.findDocumentById(id)
  if (!doc) return res.status(404).json({ error: 'Document not found' })

  let nextStatus = 'rejected'
  if (action === 'approve') {
    if (req.user.role === 'faculty' || req.user.role === 'faculty_professor') {
      nextStatus = 'pending_chair'
    } else if (req.user.role === 'department_chair') {
      nextStatus = 'pending_dean'
    } else if (req.user.role === 'dean' || req.user.role === 'admin') {
      nextStatus = 'approved'
    }
  }

  const updated = await store.updateDocumentStatus(id, nextStatus, req.user.id, comments)
  res.json({ ok: true, document: updated })
}))

app.delete('/api/documents/:id', authMiddleware, authorize(PERMISSIONS.DOC_DELETE), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  await store.deleteDocument(id)
  res.json({ ok: true })
}))

// Evaluations
app.get('/api/evaluations', authMiddleware, asyncHandler(async (req, res) => {
  const facultyId = req.query.facultyId || (req.user.role === 'faculty' ? req.user.id : null)
  if (!facultyId) return res.status(400).json({ error: 'Faculty ID required' })
  const list = await store.listEvaluations(facultyId)
  res.json({ ok: true, evaluations: list })
}))

app.post('/api/evaluations', authMiddleware, asyncHandler(async (req, res) => {
  const { facultyId, rating, feedback } = req.body
  if (!facultyId || !rating) return res.status(400).json({ error: 'Faculty ID and rating are required' })
  const ev = await store.createEvaluation({
    faculty_id: Number(facultyId),
    student_id: req.user.id,
    rating: Number(rating),
    feedback
  })
  res.status(201).json({ ok: true, evaluation: ev })
}))

// Faculty Profile update (specialized)
app.patch('/api/faculty/profile', authMiddleware, authorize(PERMISSIONS.FACULTY_MY_PROFILE), asyncHandler(async (req, res) => {
  const p = await store.updateFacultyProfile(req.user.id, req.body)
  res.json({ ok: true, profile: p })
}))

app.use((err, req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled API error:', err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

const MAX_PORT_TRIES = 20

function startListening(port, triesLeft) {
  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API server listening on http://localhost:${port}`)
  })

  server.on('error', (err) => {
    if (err?.code === 'EADDRINUSE' && triesLeft > 0) {
      // eslint-disable-next-line no-console
      console.warn(`Port ${port} is in use. Trying ${port + 1}...`)
      server.close(() => startListening(port + 1, triesLeft - 1))
      return
    }

    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1)
  })
}

startListening(PORT, MAX_PORT_TRIES)

