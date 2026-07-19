import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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
import { authorize, PERMISSIONS, ROLES, requireRole, hasPermission } from './security.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const researchUploadDir = path.join(__dirname, 'uploads', 'research')
fs.mkdirSync(researchUploadDir, { recursive: true })

const researchUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, researchUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase()
      const safe = ext === '.pdf' ? ext : '.pdf'
      cb(null, `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safe}`)
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      String(file.originalname || '')
        .toLowerCase()
        .endsWith('.pdf')
    if (!ok) return cb(new Error('Only PDF files are allowed'))
    cb(null, true)
  },
})

const PORT = Number(process.env.PORT || 5000)
const SESSION_TTL_HOURS = 24

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// Provider init is async for MongoDB; keep server startup blocked until the store is ready.
let store
try {
  store = await openStore()
  if (typeof store.backfillPublishedRepositoryRefs === 'function') {
    try {
      const n = await store.backfillPublishedRepositoryRefs()
      if (n > 0) {
        // eslint-disable-next-line no-console
        console.log(`[Research] Assigned repository reference number(s) to ${n} published record(s).`)
      }
      const m = await store.backfillSubmissionRefs()
      if (m > 0) {
        // eslint-disable-next-line no-console
        console.log(`[Research] Assigned submission reference number(s) to ${m} record(s).`)
      }

      const missingStaff = await store.fixMissingFacultyInformation()
      if (missingStaff > 0) {
        console.log(`[Admin] Reconstructed personal records for ${missingStaff} faculty/admin staff.`)
      }
      const normalizedDepartments = await normalizeExistingFacultyDepartments()
      if (normalizedDepartments > 0) {
        console.log(`[Admin] Normalized ${normalizedDepartments} faculty department assignment(s).`)
      }
    } catch (bfErr) {
      // eslint-disable-next-line no-console
      console.warn('[Research] Repository ref backfill:', bfErr?.message || bfErr)
    }
  }
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

/** DB user / profile row: snake_case + personal_information (same shape as getAccountProfile / getUserByIdForAuth). */
function nonStudentNameFieldsFromDbUser(p) {
  const pi = p.personal_information || {}
  const full = String(p.full_name || '').trim()
  const parts = full ? full.split(/\s+/).filter(Boolean) : []
  const firstName = String(p.first_name || pi.first_name || parts[0] || '').trim()
  const lastName = String(p.last_name || pi.last_name || parts[parts.length - 1] || '').trim()
  const middleName = String(
    p.middle_name || pi.middle_name || (parts.length > 2 ? parts.slice(1, -1).join(' ') : ''),
  ).trim()
  return { firstName, middleName, lastName }
}

function adminFacultyAccountProfileForResponse(p) {
  const loginEmail = String(p.email || p.identifier || '').trim()
  const full = String(p.full_name || '').trim()
  const { firstName, middleName, lastName } = nonStudentNameFieldsFromDbUser(p)
  const displayName = [firstName, middleName, lastName].filter(Boolean).join(' ') || full || loginEmail
  return {
    role: p.role,
    id: p.id,
    identifier: p.identifier || '',
    fullName: p.full_name || '',
    displayName,
    firstName,
    middleName,
    lastName,
    email: loginEmail,
    profileImageUrl: p.profile_image_url || null,
    twofaEnabled: !!p.twofa_enabled,
    department: p.department || null,
    specialization: p.specialization || null,
    personal_information: p.personal_information || {},
    bio: p.bio || null,
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
      id: user.id,
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
      academic_info: user.academic_info || {},
      class_section: user.class_section || '',
    }
  }
  const { firstName, middleName, lastName } = nonStudentNameFieldsFromDbUser(user)
  const mi = middleName ? `${middleName.charAt(0).toUpperCase()}.` : ''
  const headerLabel = [firstName, mi, lastName].filter(Boolean).join(' ') || user.full_name || user.identifier || ''
  return {
    id: user.id,
    role: user.role,
    identifier: user.identifier,
    fullName: user.full_name || '',
    displayName: headerLabel,
    firstName,
    middleName,
    lastName,
    profileImageUrl: user.profile_image_url || null,
  }
}

function userNumId(u) {
  const n = Number(u?.id)
  return Number.isFinite(n) ? n : null
}

function researchCreatorLabel(u) {
  if (!u) return ''
  if (u.role === 'student') {
    const pi = normalizedStudentNameParts(u.personal_information, u.full_name, {
      first_name: u.first_name,
      middle_name: u.middle_name,
      last_name: u.last_name,
    })
    return studentDisplayNameFromPi(pi, u.full_name)
  }
  return String(u.full_name || u.identifier || '').trim() || `User ${u.id}`
}

function researchForClient(item) {
  if (!item) return null
  const { file_stored_name: _fs, ...rest } = item
  return { ...rest, has_pdf: Boolean(item.file_stored_name) }
}

/** Published works get a unique CCS-CR-{year}-{seq} once; fills legacy rows missing a ref on any save. */
async function assignRepositoryRefIfPublishing(store, existingItem, patch) {
  const nextStatus = patch.status !== undefined ? patch.status : existingItem.status
  const patchOut = { ...patch }
  const needsRef =
    nextStatus === 'published' && !existingItem.repository_ref && !patch.repository_ref
  if (!needsRef) return patch
  let at = patchOut.published_at || existingItem.published_at
  if (!at) {
    at = new Date().toISOString()
    if (!existingItem.published_at && !patch.published_at) {
      patchOut.published_at = at
    }
  }
  const y = new Date(at).getFullYear()
  patchOut.repository_ref = await store.nextResearchRepositoryRef(y)
  return patchOut
}

function canViewResearchItem(user, item) {
  if (!item || !user) return false
  if (!hasPermission(user.role, PERMISSIONS.COLLEGE_RESEARCH_VIEW)) return false
  if (['admin', 'dean', 'department_chair'].includes(user.role)) return true
  if (user.role === 'secretary') return true
  if (item.status === 'published') return true
  const uid = userNumId(user)
  if (item.created_by_user_id === uid) return true
  if (item.adviser_faculty_id != null && Number(item.adviser_faculty_id) === uid) return true
  const co = Array.isArray(item.co_author_user_ids) ? item.co_author_user_ids.map(Number) : []
  if (uid != null && co.includes(uid)) return true
  return false
}

function canEditResearchItem(user, item) {
  if (!item || !user) return false
  if (user.role === 'admin' || user.role === 'secretary') return true
  const uid = userNumId(user)
  if (item.created_by_user_id !== uid) return false
  return ['draft', 'rejected'].includes(item.status)
}

function deleteResearchStoredFile(storedName) {
  if (!storedName || typeof storedName !== 'string') return
  const base = path.basename(storedName)
  if (base !== storedName || !base.startsWith('r-')) return
  const fp = path.join(researchUploadDir, base)
  try {
    fs.unlinkSync(fp)
  } catch {
    // ignore
  }
}

const RESEARCH_APPROVAL_SUBJECTS = {
  CS: {
    thesis: [
      { code: 'CSP111', name: 'Thesis 1' },
      { code: 'CSP114', name: 'Thesis 2' },
    ],
  },
  IT: {
    capstone: [
      { code: 'ITP108', name: 'Capstone Project 1' },
      { code: 'ITP112', name: 'Capstone Project 2' },
    ],
  },
}

function normalizeResearchCourse(value) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return ''
  if (raw === 'CS' || raw === 'BSCS') return 'CS'
  if (raw === 'IT' || raw === 'BSIT') return 'IT'
  return raw
}

function normalizeResearchType(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (!raw) return ''
  if (raw.includes('thesis')) return 'thesis'
  if (raw.includes('capstone')) return 'capstone'
  return raw
}

function normalizeResearchApprovalText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function normalizeSectionKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function extractSectionLetter(value) {
  const key = normalizeSectionKey(value)
  if (!key) return ''
  const m = key.match(/([A-Z])$/)
  return m ? m[1] : ''
}

function getResearchApprovalSubjects(itemLike) {
  const course = normalizeResearchCourse(itemLike?.course)
  const researchType = normalizeResearchType(itemLike?.research_type || itemLike?.researchType)
  return RESEARCH_APPROVAL_SUBJECTS[course]?.[researchType] || []
}

function usesAssignedProfessorApproval(itemLike) {
  return getResearchApprovalSubjects(itemLike).length > 0
}

async function canFacultyApproveResearchItem(store, user, item) {
  if (!item || !['faculty', 'faculty_professor'].includes(user?.role)) return false
  const uid = userNumId(user)
  const requiredSubjects = getResearchApprovalSubjects(item)

  if (requiredSubjects.length === 0) {
    return Number(item.adviser_faculty_id) === uid
  }

  const loads = await store.listTeachingLoads(uid)
  if (!Array.isArray(loads) || loads.length === 0) return false

  const allowedCodes = new Set(requiredSubjects.map((s) => normalizeResearchApprovalText(s.code)))
  const allowedNames = new Set(requiredSubjects.map((s) => normalizeResearchApprovalText(s.name)))
  const relevantLoads = loads.filter((load) => {
    const subjectCode = normalizeResearchApprovalText(load?.subject?.code)
    const subjectName = normalizeResearchApprovalText(load?.subject?.name)
    return allowedCodes.has(subjectCode) || allowedNames.has(subjectName)
  })
  if (relevantLoads.length === 0) return false

  let submissionSection = String(item.submission_section || '').trim()
  if (!submissionSection && Number.isFinite(Number(item.created_by_user_id))) {
    const creator = await store.getUserByIdForAuth(Number(item.created_by_user_id))
    submissionSection = String(creator?.class_section || '').trim()
  }
  if (!submissionSection) return false

  const submissionSectionKey = normalizeSectionKey(submissionSection)
  const submissionSectionLetter = extractSectionLetter(submissionSection)

  return relevantLoads.some((load) => {
    const loadSectionRaw = String(load?.section_id || load?.section || '').trim()
    if (!loadSectionRaw) return false
    const loadSectionKey = normalizeSectionKey(loadSectionRaw)
    const loadSectionLetter = extractSectionLetter(loadSectionRaw)

    if (!loadSectionKey) return false
    if (loadSectionKey === submissionSectionKey) return true
    if (submissionSectionKey && (loadSectionKey.endsWith(submissionSectionKey) || submissionSectionKey.endsWith(loadSectionKey))) {
      return true
    }
    return Boolean(loadSectionLetter && submissionSectionLetter && loadSectionLetter === submissionSectionLetter)
  })
}

function getCreatorSubmissionSection(reqUser) {
  return String(reqUser?.class_section || '').trim() || null
}

function resolveNewResearchStatus(body, user) {
  const want = String(body?.status || 'draft').toLowerCase()
  if (want === 'draft') return 'draft'
  if (user.role === 'admin') {
    const direct = String(body?.publishDirect || '').toLowerCase()
    if (direct === 'true' || direct === '1') return 'published'
    return usesAssignedProfessorApproval(body) || body?.adviserFacultyId ? 'under_faculty_review' : 'published'
  }
  if (user.role === 'secretary') {
    const needApproval = String(body?.requireApproval || '').toLowerCase()
    if (needApproval === 'true' || needApproval === '1') {
      return usesAssignedProfessorApproval(body) || body?.adviserFacultyId ? 'under_faculty_review' : 'published'
    }
    return 'published'
  }
  if (user.role === 'student') return 'under_faculty_review'
  if (['faculty', 'faculty_professor', 'dean', 'department_chair'].includes(user.role)) {
    return usesAssignedProfessorApproval(body) || body?.adviserFacultyId ? 'under_faculty_review' : 'published'
  }
  return 'draft'
}

async function buildResearchAuthors(store, creatorUser, coAuthorIds) {
  const raw = Array.isArray(coAuthorIds) ? coAuthorIds : []
  const ids = [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n)))]
  const creatorId = userNumId(creatorUser)
  const authors = [
    {
      display_name: researchCreatorLabel(creatorUser),
      user_id: creatorId,
      user_role: creatorUser.role,
    },
  ]
  for (const id of ids) {
    if (id === creatorId) continue
    const row = await store.getUserByIdForAuth(id)
    if (!row) continue
    authors.push({
      display_name: researchCreatorLabel(row),
      user_id: userNumId(row),
      user_role: row.role,
    })
  }
  return { authors, co_author_user_ids: authors.map((a) => a.user_id).filter((x) => x != null) }
}

const authMiddleware = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || ''
  let token = header.startsWith('Bearer ') ? header.slice(7) : null

  // Fallback to query parameter for direct link downloads (<a> tags)
  if (!token && req.query.token) {
    token = String(req.query.token)
  }

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

const REGISTER_ROLES_PUBLIC = [
  'student',
  'dean',
  'department_chair',
  'secretary',
  'faculty_professor',
]

const FACULTY_SYSTEM_ROLES = ['faculty_professor', 'dean', 'department_chair', 'secretary']

function normalizeFacultyDepartment(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.toLowerCase() === 'computer engineering') return 'Computer Science'
  return raw
}

function enforceFacultyRoleDepartment(role, department) {
  const normalized = normalizeFacultyDepartment(department)
  if (role === 'dean' || role === 'secretary') return 'CCS'
  return normalized
}

function normalizeDepartmentForChair(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'information technology' || raw === 'it') return 'Information Technology'
  if (raw === 'computer science' || raw === 'cs') return 'Computer Science'
  return null
}

async function validateFacultyLeadershipQuota({
  targetRole,
  targetDepartment,
  excludeUserId = null,
}) {
  if (!['dean', 'secretary', 'department_chair'].includes(targetRole)) return null

  const users = await store.listAdminUsers()
  const candidates = users.filter((u) => (excludeUserId == null ? true : String(u.id) !== String(excludeUserId)))

  if (targetRole === 'dean') {
    const existingDean = candidates.find((u) => u?.role === 'dean')
    if (existingDean) return 'Only one dean can be assigned in CCS.'
    return null
  }

  if (targetRole === 'secretary') {
    const existingSecretary = candidates.find((u) => u?.role === 'secretary')
    if (existingSecretary) return 'Only one secretary can be assigned in CCS.'
    return null
  }

  const normalizedDepartment = normalizeDepartmentForChair(targetDepartment)
  if (!normalizedDepartment) {
    return 'Department Chair must be assigned to either Information Technology or Computer Science.'
  }

  const existingChair = candidates.find((u) => {
    if (u?.role !== 'department_chair') return false
    const department = u?.department ?? u?.summary?.department ?? u?.personal_information?.department
    return normalizeDepartmentForChair(department) === normalizedDepartment
  })
  if (existingChair) {
    return `Only one Department Chair is allowed for ${normalizedDepartment}.`
  }

  return null
}

async function normalizeExistingFacultyDepartments() {
  const users = await store.listAdminUsers()
  let updatedCount = 0

  for (const u of users) {
    const currentDepartment = u?.department ?? u?.summary?.department ?? u?.personal_information?.department ?? null
    const normalizedDepartment = enforceFacultyRoleDepartment(u?.role, currentDepartment)
    if (normalizedDepartment && normalizedDepartment !== currentDepartment) {
      await store.updateStudentProfile(u.id, { department: normalizedDepartment })
      updatedCount++
    }
  }

  return updatedCount
}

async function registerUserFromRequest(req, res, { role: roleFixed } = {}) {
  const role = roleFixed ?? String(req.body?.role || '').trim()
  const password = String(req.body?.password || '')
  let fullName = String(req.body?.fullName || '').trim() || null
  const enable2FA = Boolean(req.body?.enable2FA)

  const allowedRoles = roleFixed
    ? [roleFixed]
    : [...REGISTER_ROLES_PUBLIC, 'admin']
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  if (role === 'admin' && !roleFixed) {
    const adminCount = await store.countUsersByRole('admin')
    if (adminCount > 0) {
      return res.status(403).json({
        error: 'Admin accounts can only be created by an existing administrator.',
      })
    }
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  let identifier
  let studentIdStored = null
  let emailStored = null
  let classSection = null
  let studentType = null
  let department = String(req.body?.department || req.body?.summary?.department || '').trim() || null
  let specialization = String(req.body?.specialization || req.body?.summary?.specialization || '').trim() || null
  let bio = String(req.body?.bio || '').trim() || null

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
    const piRaw = req.body?.personalInformation || req.body?.personal_information || {}
    const nameFn = String(piRaw.first_name || piRaw.firstName || '').trim()
    const nameMn = String(piRaw.middle_name || piRaw.middleName || '').trim()
    const nameLn = String(piRaw.last_name || piRaw.lastName || '').trim()
    const composedFromPi = [nameFn, nameMn, nameLn].filter(Boolean).join(' ')
    if (composedFromPi) fullName = composedFromPi
  }

  if (role !== 'student') {
    department = enforceFacultyRoleDepartment(role, department)
  }

  const leadershipQuotaError = await validateFacultyLeadershipQuota({
    targetRole: role,
    targetDepartment: department,
  })
  if (leadershipQuotaError) {
    return res.status(409).json({ error: leadershipQuotaError })
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
      specialization,
      bio,
      affiliations: req.body?.affiliations || [],
      academicInfo: req.body?.academicInfo || {},
      personalInformation: req.body?.personalInformation || {},
      academicHistory: req.body?.academicHistory || [],
      nonAcademicActivities: req.body?.nonAcademicActivities || [],
      violations: req.body?.violations || [],
      skills: req.body?.skills || [],
      affiliations: req.body?.affiliations || [],
    })

    const creatorId = req.user?.id ?? null
    const creatorName = req.user?.full_name || req.user?.identifier || 'System'
    const isAdminProvisionedByAdmin = role === 'admin' && creatorId != null

    if (isAdminProvisionedByAdmin) {
      await store.createLog({
        type: 'SECURITY',
        action: 'Admin Account Created',
        details: `New administrator "${fullName || identifier}" (login: ${identifier}) was created by ${creatorName} (admin user ID ${creatorId}).`,
        userId: creatorId,
        userName: creatorName,
        userIp: req.ip,
      })
    } else if (role === 'admin') {
      await store.createLog({
        type: 'SECURITY',
        action: 'Admin Account Created',
        details: `Initial administrator "${fullName || identifier}" (login: ${identifier}) — first-time bootstrap (no prior admin users).`,
        userId: null,
        userName: 'System',
        userIp: req.ip,
      })
    } else {
      await store.createLog({
        type: 'CREATE',
        action: 'Account Created',
        details: `New ${role} account created: ${fullName || identifier}`,
        userId: creatorId,
        userName: creatorName,
        userIp: req.ip,
      })
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  return res.status(201).json({ ok: true, twoFABackupCode: backupCode })
}

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  return registerUserFromRequest(req, res)
}))

/** Admin-only: create additional administrator accounts (authenticated). */
app.post(
  '/api/admin/accounts',
  authMiddleware,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    req.body = { ...req.body, role: 'admin' }
    return registerUserFromRequest(req, res, { role: 'admin' })
  }),
)

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
  if (req.body.personalInformation !== undefined) body.personalInformation = req.body.personalInformation
  if (req.body.bio !== undefined) body.bio = req.body.bio
  if (req.body.department !== undefined) body.department = req.body.department
  if (req.body.specialization !== undefined) body.specialization = req.body.specialization
  if (req.user.role !== 'student' && body.department !== undefined) {
    body.department = enforceFacultyRoleDepartment(req.user.role, body.department)
  }
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

app.post('/api/auth/2fa/disable', authMiddleware, asyncHandler(async (req, res) => {
  const password = String(req.body?.password || '')
  if (!password) return res.status(400).json({ error: 'Password is required' })

  const hash = await store.getPasswordHash(req.user.id)
  if (!hash || !verifyPassword(password, hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' })
  }

  await store.disableTwofa(req.user.id)
  res.json({ ok: true })
}))

app.get('/api/admin/users', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const users = await store.listAdminUsers()
  // Hydrate with teaching loads if applicable (for faculty roles)
  const allLoads = await store.listTeachingLoads(null)
  const hydrated = users.map(u => {
    if (['dean', 'department_chair', 'secretary', 'faculty_professor', 'faculty'].includes(u.role)) {
      u.teaching_loads = allLoads.filter(l => l.faculty_id === u.id)
    }
    return u
  })
  res.json({ ok: true, users: hydrated })
}))

app.get(
  '/api/faculty/directory',
  authMiddleware,
  authorize(PERMISSIONS.FACULTY_DIRECTORY_VIEW),
  asyncHandler(async (_req, res) => {
    const users = await store.listAdminUsers()
    const facultyOnly = users.filter((u) =>
      ['dean', 'department_chair', 'secretary', 'faculty_professor', 'faculty'].includes(u.role),
    )
    const activeOnly = facultyOnly.filter((u) => u?.is_active !== 0 && u?.is_active !== false)
    
    // Hydrate
    const [allLoads, allSchedules] = await Promise.all([
      store.listTeachingLoads(null),
      store.listSchedules(null)
    ])

    const facultyList = [...activeOnly]
    
    // Distill unique instructors from schedules that aren't in activeOnly
    const knownEmails = new Set(activeOnly.map(u => String(u.email || '').toLowerCase()).filter(e => e !== ''))
    const knownIds = new Set(activeOnly.map(u => String(u.id)).filter(id => id !== ''))
    const knownNames = new Set(activeOnly.map(u => String(u.full_name || u.displayName || '').toLowerCase().trim()).filter(n => n !== ''))
    
    const legacyFaculty = []
    const processedKeys = new Set()

    for (const s of allSchedules) {
      if (!s.instructor) continue
      const email = String(s.instructorEmail || '').toLowerCase().trim()
      const sid = String(s.instructorId || '').trim()
      const name = String(s.instructor).trim()
      const nameLower = name.toLowerCase()
      
      const isKnown = (email !== '' && knownEmails.has(email)) || 
                      (sid !== '' && knownIds.has(sid)) || 
                      (nameLower !== '' && knownNames.has(nameLower))
      
      if (isKnown) continue
      
      const key = `${name}-${email}`
      if (processedKeys.has(key)) continue
      
      legacyFaculty.push({
        id: sid || `legacy-${name}`,
        full_name: name,
        displayName: name,
        email: s.instructorEmail || '',
        role: 'faculty',
        is_active: true,
        is_legacy: true,
        teaching_loads: []
      })
      processedKeys.add(key)
    }
    
    const combined = [...facultyList, ...legacyFaculty]

    combined.forEach(f => {
      f.teaching_loads = allLoads.filter(l => {
        // Match by precise ID
        if (String(l.faculty_id) === String(f.id)) return true
        
        // Match by name for legacy/virtual loads if IDs don't match
        if (l.is_virtual && l.faculty_name && f.full_name) {
          return l.faculty_name.trim().toLowerCase() === f.full_name.trim().toLowerCase()
        }
        
        return false
      })
    })

    res.json({ ok: true, faculty: combined })
  }),
)

app.get('/api/admin/users/:id', authMiddleware, authorize(PERMISSIONS.MANAGE_USERS), asyncHandler(async (req, res) => {
  const rawId = req.params.id
  let user
  
  if (String(rawId).startsWith('legacy-')) {
    const name = String(rawId).slice('legacy-'.length)
    user = {
      id: rawId,
      full_name: name,
      displayName: name,
      role: 'faculty',
      is_active: true,
      is_legacy: true,
      email: '',
      personal_information: { fullName: name },
      summary: { department: 'Legacy Records' }
    }
  } else {
    const id = Number(rawId)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
    user = await store.getAdminUserById(id)
  }

  if (!user) return res.status(404).json({ error: 'User not found' })
  
  // Hydrate with loads
  if (['dean', 'department_chair', 'secretary', 'faculty_professor', 'faculty'].includes(user.role)) {
    user.teaching_loads = await store.listTeachingLoads(user.id)
  }
  
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
  const requestedRole = req.body.role !== undefined ? String(req.body.role || '').trim() : target.role
  const hasRoleUpdate = req.body.role !== undefined
  if (hasRoleUpdate) {
    if (!FACULTY_SYSTEM_ROLES.includes(requestedRole)) {
      return res.status(400).json({ error: 'Invalid role' })
    }
    const targetDepartment =
      req.body.department ??
      req.body.summary?.department ??
      target.department ??
      target.summary?.department
    const leadershipQuotaError = await validateFacultyLeadershipQuota({
      targetRole: requestedRole,
      targetDepartment,
      excludeUserId: id,
    })
    if (leadershipQuotaError) {
      return res.status(409).json({ error: leadershipQuotaError })
    }
    updates.role = requestedRole
  }
  const hasDepartmentUpdate = req.body.department !== undefined || req.body.summary?.department !== undefined
  if (hasDepartmentUpdate || hasRoleUpdate) {
    const requestedDepartmentRaw =
      req.body.department ??
      req.body.summary?.department ??
      target.department ??
      target.summary?.department ??
      null
    updates.department = enforceFacultyRoleDepartment(requestedRole, requestedDepartmentRaw)
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

  // Safety check: never report success if role did not persist.
  if (updates.role !== undefined && user?.role !== updates.role) {
    return res.status(500).json({ error: 'Role update did not persist. Please try again.' })
  }

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

app.get('/api/me/logs', authMiddleware, asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const list = await store.listUserLogs(limit, req.user.id)
  res.json({ ok: true, logs: list })
}))

// --- Faculty Module API ---

// Subjects
app.get('/api/subjects', authMiddleware, asyncHandler(async (req, res) => {
  const [list, allSchedules] = await Promise.all([
    store.listSubjects(),
    store.listSchedules(null)
  ])

  // Extract unique subjects from schedules not in the master list
  const knownCodes = new Set(list.map(s => String(s.code).toUpperCase()))
  const virtualSubjects = []
  
  for (const s of allSchedules) {
    if (!s.subjectCode) continue
    const code = String(s.subjectCode).toUpperCase()
    if (knownCodes.has(code)) continue
    
    if (!virtualSubjects.find(vs => vs.code === code)) {
      virtualSubjects.push({
        id: s.subjectId || `vsub-${code}`,
        code: s.subjectCode,
        name: s.subjectTitle || s.subjectCode,
        description: 'Synthesized from Schedule',
        units: 3,
        is_virtual: true
      })
    }
  }

  res.json({ ok: true, subjects: [...list, ...virtualSubjects] })
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
  const qId = req.query.facultyId
  const facultyId = (qId && qId !== '') ? qId : (req.user.role === 'faculty' ? req.user.id : null)
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

app.get('/api/schedules/:id', authMiddleware, asyncHandler(async (req, res) => {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: 'Missing schedule ID' })
  const schedule = await store.getScheduleById(id)
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' })
  res.json({ ok: true, schedule })
}))

app.post('/api/schedules', authMiddleware, authorize(PERMISSIONS.SCHEDULING_MANAGE), asyncHandler(async (req, res) => {
  const data = req.body || {}
  if (!data.subjectCode || !data.day || !data.startTime || !data.endTime) {
    return res.status(400).json({ error: 'Missing schedule details' })
  }

  // Conflict detection
  const overlaps = await store.findOverlappingSchedules(data.day, data.startTime, data.endTime, data.room)
  if (overlaps.length > 0) {
    return res.status(409).json({ error: 'Schedule conflict detected', overlaps })
  }

  const sch = await store.createSchedule(data)
  res.status(201).json({ ok: true, schedule: sch })
}))

app.put('/api/schedules/:id', authMiddleware, authorize(PERMISSIONS.SCHEDULING_MANAGE), asyncHandler(async (req, res) => {
  const id = req.params.id
  const data = req.body || {}
  if (!id) return res.status(400).json({ error: 'Missing schedule ID' })
  
  // Minimal overlap detection (ignoring self)
  const overlaps = await store.findOverlappingSchedules(data.day, data.startTime, data.endTime, data.room)
  const otherOverlaps = overlaps.filter(o => String(o.id) !== String(id))
  if (otherOverlaps.length > 0) {
    return res.status(409).json({ error: 'Schedule conflict detected', overlaps: otherOverlaps })
  }

  const sch = await store.updateSchedule(id, data)
  if (!sch) return res.status(404).json({ error: 'Schedule not found or update failed' })
  res.json({ ok: true, schedule: sch })
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

// --- Instructions Module ---
// IMPORTANT: Specific paths (/upload, /file/:fileId) MUST come before parameterized (:id) routes

// Instructions file upload — must be before /:id
app.post('/api/instructions/upload', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_MANAGE), asyncHandler(async (req, res) => {
  if (typeof store.uploadFile === 'function') {
    const multer = (await import('multer')).default
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }).single('file')
    await new Promise((resolve, reject) => upload(req, res, (err) => (err ? reject(err) : resolve())))
    if (!req.file) return res.status(400).json({ error: 'No file provided' })
    const result = await store.uploadFile(req.file.originalname, req.file.mimetype, req.file.buffer)
    return res.json({ ok: true, fileId: result.fileId, filename: result.filename, size: req.file.size })
  }
  res.json({ ok: true, fileId: String(Date.now()), filename: 'uploaded', size: 0 })
}))

// Instructions file download/preview — must be before /:id
app.get('/api/instructions/file/:fileId', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_VIEW), asyncHandler(async (req, res) => {
  const fileId = req.params.fileId
  if (typeof store.downloadFile === 'function') {
    try {
      const { stream, contentType, filename } = await store.downloadFile(fileId)
      res.set('Content-Type', contentType || 'application/octet-stream')
      if (!req.query.preview) {
        res.set('Content-Disposition', `attachment; filename="${filename}"`)
      }
      stream.pipe(res)
      return
    } catch (err) {
      console.error('[DOWNLOAD_FILE_ERROR]', err)
      return res.status(404).json({ error: 'File not found', message: err.message })
    }
  }
  res.status(404).json({ error: 'File storage not configured' })
}))

// List instructions
app.get('/api/instructions', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_VIEW), asyncHandler(async (req, res) => {
  const role = req.user?.role
  const query = {}
  if (req.query.type) query.type = req.query.type
  if (req.query.course) query.course = req.query.course
  // Students only see Active materials
  if (role === 'student') query.status = 'Active'
  else if (req.query.status) query.status = req.query.status
  const list = await store.listInstructions(query)
  res.json({ ok: true, instructions: list })
}))

// Create instruction
app.post('/api/instructions', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_MANAGE), asyncHandler(async (req, res) => {
  const { title, type, course, subject, description, status, author, link } = req.body
  if (!title || !type || !course) return res.status(400).json({ error: 'Title, type, and course are required' })
  const item = await store.createInstruction({ title, type, course, subject, description, status, author, link })
  await store.createLog({
    type: 'CREATE',
    action: 'Instruction Created',
    details: `Material "${title}" (${type}) created by ${req.user.full_name || req.user.identifier}`,
    userId: req.user.id,
    userName: req.user.full_name || req.user.identifier,
    userIp: req.ip
  })
  res.status(201).json({ ok: true, instruction: item })
}))

// Get single instruction (parameterized — AFTER static paths)
app.get('/api/instructions/:id', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_VIEW), asyncHandler(async (req, res) => {
  const item = await store.findInstructionById(Number(req.params.id))
  if (!item) return res.status(404).json({ error: 'Material not found' })
  const role = req.user?.role
  if (role === 'student' && item.status !== 'Active') return res.status(403).json({ error: 'Not available' })
  res.json({ ok: true, instruction: item })
}))

// Update instruction
app.put('/api/instructions/:id', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_MANAGE), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const existing = await store.findInstructionById(id)
  if (!existing) return res.status(404).json({ error: 'Material not found' })
  const { title, type, course, subject, description, status, author, link } = req.body
  const updated = await store.updateInstruction(id, { title, type, course, subject, description, status, author, link })
  res.json({ ok: true, instruction: updated })
}))

// Delete instruction
app.delete('/api/instructions/:id', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_MANAGE), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const existing = await store.findInstructionById(id)
  if (!existing) return res.status(404).json({ error: 'Material not found' })
  await store.deleteInstruction(id)
  await store.createLog({
    type: 'DELETE',
    action: 'Instruction Deleted',
    details: `Material "${existing.title}" deleted by ${req.user.full_name || req.user.identifier}`,
    userId: req.user.id,
    userName: req.user.full_name || req.user.identifier,
    userIp: req.ip
  })
  res.json({ ok: true })
}))

async function handleResearchList(req, res) {
  const scope = String(req.query.scope || 'repository').toLowerCase()
  const year = req.query.year ? Number(req.query.year) : null
  const course = String(req.query.course || '').trim()
  const keyword = String(req.query.keyword || '').trim()
  const author = String(req.query.author || '').trim()
  const statusFilter = String(req.query.status || '').trim()

  let filter = {}
  if (scope === 'repository') {
    filter.status = 'published'
  } else if (scope === 'mine') {
    filter.created_by_user_id = userNumId(req.user)
  } else if (scope === 'adviser_review') {
    filter = {}
  } else if (scope === 'pending_approval') {
    filter.status = 'pending_approval'
  } else if (scope === 'all' && (req.user.role === 'admin' || req.user.role === 'secretary')) {
    filter = {}
  } else {
    filter.status = 'published'
  }

  if (statusFilter && (scope === 'all' || scope === 'mine')) {
    filter = { ...filter, status: statusFilter }
  }

  if (year && Number.isFinite(year)) filter.year = year
  if (course && ['CS', 'IT'].includes(course)) filter.course = course

  let list = await store.listResearchPublications(filter)

  if (keyword) {
    const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    list = list.filter(
      (p) =>
        re.test(p.title || '') ||
        re.test(p.abstract || '') ||
        (Array.isArray(p.keywords) && p.keywords.some((k) => re.test(String(k)))),
    )
  }
  if (author) {
    const re = new RegExp(author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    list = list.filter((p) => {
      if (re.test(p.adviser_name || '')) return true
      const authors = Array.isArray(p.authors) ? p.authors : []
      return authors.some((a) => re.test(String(a.display_name || '')))
    })
  }

  if (scope === 'repository' || scope === 'mine') {
    list = list.filter((item) => canViewResearchItem(req.user, item))
  } else if (scope === 'adviser_review') {
    if (!['faculty', 'faculty_professor'].includes(req.user.role)) {
      list = []
    } else {
      const reviewable = list.filter((item) =>
        ['under_faculty_review', 'pending_approval'].includes(String(item.status || '').toLowerCase()),
      )
      const allowed = await Promise.all(
        reviewable.map(async (item) => ((await canFacultyApproveResearchItem(store, req.user, item)) ? item : null)),
      )
      list = allowed.filter(Boolean)
    }
  } else if (scope === 'pending_approval') {
    if (!['dean', 'department_chair', 'admin'].includes(req.user.role)) {
      list = []
    }
  }

  res.json({ ok: true, items: list.map(researchForClient) })
}

// --- College Research Repository ---
app.get(
  '/api/research/author-suggestions',
  authMiddleware,
  authorize(PERMISSIONS.COLLEGE_RESEARCH_VIEW),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim()
    const lim = Math.min(80, Math.max(5, Number(req.query.limit) || 55))
    const course = String(req.query.course || '').trim()
    const list = await store.searchUsersForResearchAuthors(q, lim, course)
    res.json({ ok: true, users: list })
  }),
)

app.get(
  '/api/research/advisers',
  authMiddleware,
  authorize(PERMISSIONS.COLLEGE_RESEARCH_VIEW),
  asyncHandler(async (req, res) => {
    const list = await store.listFacultyForResearchAdviser(300)
    res.json({ ok: true, advisers: list })
  }),
)

app.get(
  '/api/research/analytics',
  authMiddleware,
  authorize(PERMISSIONS.COLLEGE_RESEARCH_VIEW),
  asyncHandler(async (req, res) => {
    const elevated = hasPermission(req.user.role, PERMISSIONS.VIEW_REPORTS) || req.user.role === 'admin'
    if (!elevated) {
      const pub = await store.listResearchPublications({ status: 'published' })
      const byYear = {}
      for (const p of pub) {
        const y = p.year ?? 'unknown'
        byYear[y] = (byYear[y] || 0) + 1
      }
      return res.json({
        ok: true,
        scope: 'public',
        analytics: { totalPublished: pub.length, byYear },
      })
    }
    const analytics = await store.getResearchAnalytics()
    res.json({ ok: true, scope: 'full', analytics })
  }),
)

// Primary list URL (avoids rare proxy / tooling issues with exact path "/api/research").
app.get(
  '/api/college-research',
  authMiddleware,
  authorize(PERMISSIONS.COLLEGE_RESEARCH_VIEW),
  asyncHandler(handleResearchList),
)

app.get(
  '/api/research',
  authMiddleware,
  authorize(PERMISSIONS.COLLEGE_RESEARCH_VIEW),
  asyncHandler(handleResearchList),
)

// More specific routes must be registered before /api/research/:id
app.get(
  '/api/research/:id/file',
  authMiddleware,
  authorize(PERMISSIONS.COLLEGE_RESEARCH_VIEW),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const item = await store.findResearchPublicationById(id)
    if (!item || !item.file_stored_name) return res.status(404).json({ error: 'File not found' })
    if (!canViewResearchItem(req.user, item)) return res.status(403).json({ error: 'Forbidden' })
    const base = path.basename(item.file_stored_name)
    if (base !== item.file_stored_name || !base.startsWith('r-')) return res.status(400).json({ error: 'Invalid file' })
    const fp = path.join(researchUploadDir, base)
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing on server' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.file_original_name || 'research.pdf')}"`)
    fs.createReadStream(fp).pipe(res)
  }),
)

app.get(
  '/api/research/:id',
  authMiddleware,
  authorize(PERMISSIONS.COLLEGE_RESEARCH_VIEW),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Invalid id' })
    const item = await store.findResearchPublicationById(id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    if (!canViewResearchItem(req.user, item)) return res.status(403).json({ error: 'Forbidden' })
    res.json({ ok: true, item: researchForClient(item) })
  }),
)

app.post(
  '/api/research',
  authMiddleware,
  authorize(PERMISSIONS.DOC_CREATE),
  (req, res, next) => {
    researchUpload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' })
      next()
    })
  },
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can create new college research records' })
    }
    const body = req.body || {}
    const title = String(body.title || '').trim()
    const abstract = String(body.abstract || '').trim()
    const adviserName = String(body.adviserName || '').trim()
    const adviserFacultyId = body.adviserFacultyId ? Number(body.adviserFacultyId) : null
    const year = body.year != null ? Number(body.year) : NaN
    const course = String(body.course || '').trim()
    const category = String(body.category || '').trim()
    const researchType = String(body.researchType || 'capstone').trim()
    let keywords = []
    try {
      keywords = body.keywords ? JSON.parse(body.keywords) : []
    } catch {
      keywords = String(body.keywords || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    let coAuthorIds = []
    try {
      coAuthorIds = body.coAuthorUserIds ? JSON.parse(body.coAuthorUserIds) : []
    } catch {
      coAuthorIds = []
    }
    if (!Array.isArray(coAuthorIds)) coAuthorIds = []

    const status = resolveNewResearchStatus(body, req.user)
    if (status !== 'draft' && !title) return res.status(400).json({ error: 'Title is required' })
    if (status !== 'draft' && !abstract) return res.status(400).json({ error: 'Abstract is required' })
    if (!Number.isFinite(year) || year < 1970 || year > 2100) {
      return res.status(400).json({ error: 'Valid year is required' })
    }
    if (!['CS', 'IT'].includes(course)) return res.status(400).json({ error: 'Course must be CS or IT' })
    if (req.user.role === 'student' && status === 'under_faculty_review') {
      if (!adviserFacultyId) return res.status(400).json({ error: 'Adviser is required for student submissions' })
    }
    if (status !== 'draft' && !req.file) {
      return res.status(400).json({ error: 'PDF file is required for submission' })
    }

    const { authors, co_author_user_ids } = await buildResearchAuthors(store, req.user, coAuthorIds)
    let advName = adviserName
    if (adviserFacultyId) {
      const adv = await store.getUserByIdForAuth(adviserFacultyId)
      if (adv) advName = researchCreatorLabel(adv)
    }

    const now = new Date().toISOString()
    let repository_ref
    const yNow = new Date(now).getFullYear()
    if (status === 'published') {
      repository_ref = await store.nextResearchRepositoryRef(yNow)
    }
    const submission_ref = await store.nextResearchSubmissionRef(yNow)

    const doc = await store.createResearchPublication({
      title,
      abstract,
      adviser_name: advName || null,
      adviser_faculty_id: adviserFacultyId || null,
      submission_section: getCreatorSubmissionSection(req.user),
      year,
      course,
      category: category || 'General',
      research_type: researchType,
      keywords,
      authors,
      co_author_user_ids,
      file_stored_name: req.file ? req.file.filename : null,
      file_original_name: req.file ? req.file.originalname : null,
      status,
      created_by_user_id: userNumId(req.user),
      created_by_role: req.user.role,
      reviewed_by_faculty_id: null,
      review_comments: null,
      approved_by_user_id: null,
      approval_comments: null,
      published_at: status === 'published' ? now : null,
      submission_ref,
      ...(repository_ref ? { repository_ref } : {}),
    })

    await store.createLog({
      type: 'CREATE',
      action: 'Research record created',
      details: `Research "${title}" (${status}) id ${doc.id}`,
      userId: userNumId(req.user),
      userName: researchCreatorLabel(req.user),
      userIp: req.ip,
    })

    res.status(201).json({ ok: true, item: researchForClient(doc) })
  }),
)

app.patch(
  '/api/research/:id',
  authMiddleware,
  authorize(PERMISSIONS.COLLEGE_RESEARCH_VIEW),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const item = await store.findResearchPublicationById(id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    if (!canEditResearchItem(req.user, item)) return res.status(403).json({ error: 'Forbidden' })

    const patch = {}
    if (req.body.title !== undefined) patch.title = String(req.body.title || '').trim()
    if (req.body.abstract !== undefined) patch.abstract = String(req.body.abstract || '').trim()
    if (req.body.adviserName !== undefined) patch.adviser_name = String(req.body.adviserName || '').trim() || null
    if (req.body.adviserFacultyId !== undefined) {
      const af = req.body.adviserFacultyId ? Number(req.body.adviserFacultyId) : null
      patch.adviser_faculty_id = af
      if (af) {
        const adv = await store.getUserByIdForAuth(af)
        if (adv) patch.adviser_name = researchCreatorLabel(adv)
      }
    }
    if (req.body.year !== undefined) {
      const y = Number(req.body.year)
      if (Number.isFinite(y)) patch.year = y
    }
    if (req.body.course !== undefined && ['CS', 'IT'].includes(String(req.body.course))) patch.course = String(req.body.course)
    if (req.body.category !== undefined) patch.category = String(req.body.category || '').trim()
    if (req.body.researchType !== undefined) patch.research_type = String(req.body.researchType || '').trim()
    if (req.body.keywords !== undefined) {
      if (Array.isArray(req.body.keywords)) patch.keywords = req.body.keywords.map((k) => String(k).trim()).filter(Boolean)
    }
    if (req.body.coAuthorUserIds !== undefined && Array.isArray(req.body.coAuthorUserIds)) {
      const creatorRow = await store.getUserByIdForAuth(item.created_by_user_id)
      if (!creatorRow) return res.status(400).json({ error: 'Primary author not found' })
      const built = await buildResearchAuthors(store, creatorRow, req.body.coAuthorUserIds)
      patch.authors = built.authors
      patch.co_author_user_ids = built.co_author_user_ids
    }
    if (req.body.status !== undefined) {
      const next = String(req.body.status || '').toLowerCase()
      if (next === 'submitted' && item.status === 'draft') {
        if (!item.file_stored_name) return res.status(400).json({ error: 'Upload a PDF before submitting' })
        if (item.created_by_role === 'student') {
          const adv = patch.adviser_faculty_id ?? item.adviser_faculty_id
          if (!adv) return res.status(400).json({ error: 'Assign an adviser before submitting' })
          patch.status = 'under_faculty_review'
        }
        else if (['secretary', 'admin'].includes(req.user.role)) {
          patch.status = resolveNewResearchStatus(
            {
              status: 'submitted',
              course: item.course,
              researchType: item.research_type,
              adviserFacultyId: patch.adviser_faculty_id ?? item.adviser_faculty_id,
              requireApproval: req.body.requireApproval,
              publishDirect: req.body.publishDirect,
            },
            req.user,
          )
        } else patch.status = usesAssignedProfessorApproval(item) || item.adviser_faculty_id ? 'under_faculty_review' : 'published'
      }
      if (next === 'draft' && ['draft', 'rejected'].includes(item.status)) patch.status = 'draft'
      if (
        next === 'resubmit' &&
        item.status === 'rejected' &&
        item.created_by_user_id === userNumId(req.user)
      ) {
        if (!item.file_stored_name) return res.status(400).json({ error: 'PDF required to resubmit' })
        patch.status =
          item.created_by_role === 'student'
            ? 'under_faculty_review'
            : usesAssignedProfessorApproval(item) || item.adviser_faculty_id
              ? 'under_faculty_review'
              : 'published'
      }
    }

    const patchWithRef = await assignRepositoryRefIfPublishing(store, item, patch)
    const updated = await store.updateResearchPublication(id, patchWithRef)
    res.json({ ok: true, item: researchForClient(updated) })
  }),
)

app.post(
  '/api/research/:id/pdf',
  authMiddleware,
  authorize(PERMISSIONS.COLLEGE_RESEARCH_VIEW),
  (req, res, next) => {
    researchUpload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' })
      next()
    })
  },
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const item = await store.findResearchPublicationById(id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    if (!canEditResearchItem(req.user, item)) return res.status(403).json({ error: 'Forbidden' })
    if (!req.file) return res.status(400).json({ error: 'PDF required' })
    if (item.file_stored_name) deleteResearchStoredFile(item.file_stored_name)
    const updated = await store.updateResearchPublication(id, {
      file_stored_name: req.file.filename,
      file_original_name: req.file.originalname,
    })
    res.json({ ok: true, item: researchForClient(updated) })
  }),
)

app.post(
  '/api/research/:id/faculty-review',
  authMiddleware,
  authorize(PERMISSIONS.DOC_APPROVE),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const item = await store.findResearchPublicationById(id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    if (!['under_faculty_review', 'pending_approval'].includes(String(item.status || '').toLowerCase())) {
      return res.status(400).json({ error: 'Not awaiting faculty review' })
    }
    const uid = userNumId(req.user)
    if (!(await canFacultyApproveResearchItem(store, req.user, item))) {
      return res.status(403).json({
        error: 'Only the assigned Thesis/Capstone professor for the submission section can review this request',
      })
    }
    const action = String(req.body?.action || '').toLowerCase()
    const comments = String(req.body?.comments || '').trim() || null
    if (action === 'reject') {
      const updated = await store.updateResearchPublication(id, {
        status: 'rejected',
        reviewed_by_faculty_id: uid,
        review_comments: comments,
      })
      await store.pushResearchWorkflow(id, {
        at: new Date().toISOString(),
        action: 'rejected_by_assigned_professor',
        by_user_id: uid,
        note: comments,
      })
      return res.json({ ok: true, item: researchForClient(updated) })
    }
    if (action === 'approve') {
      const now = new Date().toISOString()
      const patchWithRef = await assignRepositoryRefIfPublishing(store, item, {
        status: 'published',
        reviewed_by_faculty_id: uid,
        review_comments: comments,
        approved_by_user_id: uid,
        approval_comments: comments,
        published_at: now,
      })
      const updated = await store.updateResearchPublication(id, patchWithRef)
      await store.pushResearchWorkflow(id, {
        at: now,
        action: 'published_by_assigned_professor',
        by_user_id: uid,
        note: comments,
      })
      return res.json({ ok: true, item: researchForClient(updated) })
    }
    return res.status(400).json({ error: 'Invalid action' })
  }),
)

app.post(
  '/api/research/:id/final-approval',
  authMiddleware,
  authorize(PERMISSIONS.DOC_APPROVE),
  asyncHandler(async (req, res) => {
    return res.status(410).json({
      error: 'Final approval is no longer used. Assigned Thesis/Capstone professors now publish requests directly.',
    })
  }),
)

app.delete(
  '/api/research/:id',
  authMiddleware,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const item = await store.findResearchPublicationById(id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    if (item.file_stored_name) deleteResearchStoredFile(item.file_stored_name)
    await store.deleteResearchPublication(id)
    res.json({ ok: true })
  }),
)

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

// --- Events Module API ---

app.get('/api/events', authMiddleware, authorize(PERMISSIONS.EVENTS_VIEW), asyncHandler(async (req, res) => {
  const query = req.query || {}
  const list = await store.listEvents(query)

  // Apply visibility filters based on user role/dept if not admin
  const filtered = list.filter(event => {
    if (req.user.role === 'admin') return true
    if (event.created_by === req.user.id) return true // Creator can always see their own event
    if (event.status !== 'approved') return false // Hide pending/cancelled events from others
    if (event.visibility === 'public') return true
    if (event.target_audience === 'all') return true
    if (event.target_audience === req.user.role) return true
    if (event.department && event.department === req.user.department) return true
    return false
  })

  res.json({ ok: true, events: filtered })
}))

app.get('/api/events/:id', authMiddleware, authorize(PERMISSIONS.EVENTS_VIEW), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const event = await store.getEventById(id)
  if (!event) return res.status(404).json({ error: 'Event not found' })
  res.json({ ok: true, event })
}))

app.post('/api/events', authMiddleware, authorize(PERMISSIONS.EVENTS_MANAGE), asyncHandler(async (req, res) => {
  const { title, date_time } = req.body
  if (!title) return res.status(400).json({ error: 'Event title is required' })

  const event = await store.createEvent({
    ...req.body,
    created_by: req.user.id,
    status: req.user.role === 'admin' ? 'approved' : 'pending'
  })

  await store.createLog({
    type: 'CREATE',
    action: 'Event Created',
    details: `Event "${title}" created by ${req.user.full_name || req.user.identifier}`,
    userId: req.user.id,
    userName: req.user.full_name || req.user.identifier,
    userIp: req.ip
  })

  res.status(201).json({ ok: true, event })
}))

app.patch('/api/events/:id', authMiddleware, authorize(PERMISSIONS.EVENTS_MANAGE), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const target = await store.getEventById(id)
  if (!target) return res.status(404).json({ error: 'Event not found' })

  // Ownership check
  if (req.user.role !== 'admin' && target.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: You can only edit your own events' })
  }

  const updated = await store.updateEvent(id, req.body)

  await store.createLog({
    type: 'UPDATE',
    action: 'Event Updated',
    details: `Event "${target.title}" updated by ${req.user.full_name || req.user.identifier}`,
    userId: req.user.id,
    userName: req.user.full_name || req.user.identifier,
    userIp: req.ip
  })

  res.json({ ok: true, event: updated })
}))

app.delete('/api/events/:id', authMiddleware, authorize(PERMISSIONS.EVENTS_MANAGE), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const target = await store.getEventById(id)
  if (!target) return res.status(404).json({ error: 'Event not found' })

  // Ownership check
  if (req.user.role !== 'admin' && target.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own events' })
  }

  await store.deleteEvent(id)

  await store.createLog({
    type: 'DELETE',
    action: 'Event Deleted',
    details: `Event "${target.title}" deleted by ${req.user.full_name || req.user.identifier}`,
    userId: req.user.id,
    userName: req.user.full_name || req.user.identifier,
    userIp: req.ip
  })

  res.json({ ok: true })
}))

app.patch('/api/events/:id/approve', authMiddleware, authorize(PERMISSIONS.EVENTS_MANAGE), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const target = await store.getEventById(id)
  if (!target) return res.status(404).json({ error: 'Event not found' })

  const updated = await store.approveEvent(id, req.user.id)

  await store.createLog({
    type: 'UPDATE',
    action: 'Event Approved',
    details: `Event "${target.title}" approved by ${req.user.full_name || req.user.identifier}`,
    userId: req.user.id,
    userName: req.user.full_name || req.user.identifier,
    userIp: req.ip
  })

  res.json({ ok: true, event: updated })
}))

app.use((err, req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled API error:', err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

const MAX_PORT_TRIES = 20


// --- Office Hours ---

app.get('/api/office-hours', authMiddleware, authorize(PERMISSIONS.OFFICE_HOURS_VIEW), asyncHandler(async (req, res) => {
  const filter = {}
  if (req.user.role === 'student') {
    const student = await store.getAccountProfile(req.user.id)
    const section = student?.class_section
    if (!section) return res.json({ ok: true, officeHours: [] })
    const loads = await store.listTeachingLoads()
    const professorIds = [...new Set(loads
      .filter(l => {
        const lSec = String(l.section_id || l.section || '').trim().toUpperCase()
        const sSec = String(section).trim().toUpperCase()
        return lSec === sSec || lSec.includes(sSec) || sSec.includes(lSec)
      })
      .map(l => l.faculty_id)
      .filter(Boolean)
    )]
    if (professorIds.length === 0) return res.json({ ok: true, officeHours: [] })
    filter.professorIds = professorIds
  }
  const list = await store.listOfficeHours(filter)
  res.json({ ok: true, officeHours: list })
}))

app.post('/api/office-hours', authMiddleware, authorize(PERMISSIONS.OFFICE_HOURS_MANAGE), asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Admins cannot create office hours' })
  const data = {
    userId: req.user.id,
    day: req.body.day,
    time: req.body.time,
    room: req.body.room,
    notes: req.body.notes
  }
  const ok = await store.createOfficeHour(data)
  res.json({ ok: true, officeHour: ok })
}))

app.delete('/api/office-hours/:id', authMiddleware, authorize(PERMISSIONS.OFFICE_HOURS_MANAGE), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' })
  const success = await store.deleteOfficeHour(id, req.user.role === 'admin' ? null : req.user.id)
  if (!success) return res.status(404).json({ error: 'Office hour not found or unauthorized' })
  res.json({ ok: true })
}))

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

