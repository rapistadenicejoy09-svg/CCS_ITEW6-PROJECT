import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { ObjectId } from 'mongodb'

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
  console.log('[STARTUP] Opening datastore...')
  store = await openStore()
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Failed to open datastore:', err)
  process.exit(1)
}

const app = express()

// Configure helmet to be more permissive for frames in development, 
// allowing the frontend to embed the PDF viewer.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": ["'self'", "http://localhost:*", "http://127.0.0.1:*"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  frameguard: false, // Allow iframes
}))

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

function publicAuthUser(user) {
  if (!user) return null
  if (user.role === 'student') {
    return {
      role: user.role,
      identifier: user.identifier,
      studentId: user.student_id || user.identifier,
      email: user.email || '',
      fullName: user.full_name || '',
    }
  }
  return {
    role: user.role,
    identifier: user.identifier,
    fullName: user.full_name || '',
  }
}

const authMiddleware = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || ''
  let token = header.startsWith('Bearer ') ? header.slice(7) : null
  
  // Allow token from query string (useful for iframes and direct downloads)
  if (!token && req.query.token) {
    token = req.query.token
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

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const role = String(req.body?.role || '').trim()
  const password = String(req.body?.password || '')
  const fullName = String(req.body?.fullName || '').trim() || null
  const enable2FA = Boolean(req.body?.enable2FA)

  if (!['admin', 'student', 'faculty'].includes(role)) {
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
      academicInfo: req.body?.academicInfo || {},
      personalInformation: req.body?.personalInformation || {},
      academicHistory: req.body?.academicHistory || [],
      nonAcademicActivities: req.body?.nonAcademicActivities || [],
      violations: req.body?.violations || [],
      skills: req.body?.skills || [],
      affiliations: req.body?.affiliations || [],
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
  res.json({ ok: true, user: req.user })
})

app.post('/api/auth/2fa/setup', authMiddleware, asyncHandler(async (req, res) => {
  const secret = speakeasy.generateSecret({ name: `CCSDashboard (${req.user.identifier})` })
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
  if (target.role !== 'student') {
    return res.status(400).json({ error: 'Only student accounts can be updated this way' })
  }
  const updates = {}
  if (req.body.isActive !== undefined) {
    if (typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be boolean' })
    }
    updates.is_active = req.body.isActive
    console.log('[DEBUG] Setting updates.is_active to:', updates.is_active)
  }
  if (req.body.personalInformation !== undefined) {
    updates.personal_information = req.body.personalInformation
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
  if (req.body.fullName !== undefined) {
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

// --- INSTRUCTIONS Endpoints ---

app.get('/api/instructions', authMiddleware, asyncHandler(async (req, res) => {
  const instructions = await store.listInstructions()
  // Ensure id is standard JS property (string/number format from store)
  res.json({ ok: true, instructions })
}))

app.get('/api/instructions/:id', authMiddleware, asyncHandler(async (req, res) => {
  const instruction = await store.getInstructionById(req.params.id)
  if (!instruction) return res.status(404).json({ error: 'Instruction not found' })

  // Enhanced: If it's a GridFS link, include file metadata for smart frontend previews
  if (instruction.link && instruction.link.startsWith('gridfs://') && store.gridFsBucket) {
    try {
      const fileIdString = instruction.link.replace('gridfs://', '')
      const fileId = new ObjectId(fileIdString)
      const files = await store.gridFsBucket.find({ _id: fileId }).toArray()
      
      if (files.length > 0) {
        const file = files[0]
        // GridFS can store type in .contentType or .metadata.contentType depending on driver/version
        instruction.mimeType = file.contentType || (file.metadata && file.metadata.contentType)
        instruction.fileName = file.filename || (file.metadata && file.metadata.originalName)
        
        console.log(`[DATABASE] File found: ${instruction.fileName} (${instruction.mimeType || 'unknown type'})`)
      } else {
        console.warn(`[DATABASE] WARNING: No file found in GridFS for ID: ${fileIdString}`)
      }
    } catch (e) {
      console.error(`[DATABASE] ERROR during file lookup: ${e.message}`)
    }
  }

  res.json({ ok: true, instruction })
}))

app.post('/api/instructions', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_MANAGE), asyncHandler(async (req, res) => {
  if (!req.body.title || !req.body.type) {
    return res.status(400).json({ error: 'Title and Type are required' })
  }
  const id = await store.createInstruction({
    type: String(req.body.type || 'lesson'),
    title: String(req.body.title || ''),
    course: String(req.body.course || ''),
    subject: String(req.body.subject || ''),
    description: String(req.body.description || ''),
    status: String(req.body.status || 'Draft'),
    author: String(req.body.author || req.user.full_name || 'Administrator'),
    link: String(req.body.link || ''),
    created_at: nowIso(),
    updated_at: nowIso()
  })
  res.status(201).json({ ok: true, id })
}))

app.put('/api/instructions/:id', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_MANAGE), asyncHandler(async (req, res) => {
  const existing = await store.getInstructionById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Instruction not found' })
  
  await store.updateInstruction(req.params.id, {
    type: String(req.body.type || existing.type),
    title: String(req.body.title || existing.title),
    course: String(req.body.course || existing.course),
    subject: String(req.body.subject || existing.subject),
    description: String(req.body.description || existing.description),
    status: String(req.body.status || existing.status),
    author: String(req.body.author || existing.author),
    link: String(req.body.link || existing.link),
    updated_at: nowIso()
  })
  res.json({ ok: true })
}))

app.delete('/api/instructions/:id', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_MANAGE), asyncHandler(async (req, res) => {
  await store.deleteInstruction(req.params.id)
  res.json({ ok: true })
}))

// --- FILE UPLOAD (GridFS) ---

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
  fileFilter(_req, file, cb) {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword', 'application/vnd.ms-powerpoint', 'image/jpeg', 'image/png']
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|pptx|doc|ppt|jpg|jpeg|png)$/i)) {
      cb(null, true)
    } else {
      cb(new Error('File type not allowed. Please upload PDF, DOCX, PPTX, or image files.'))
    }
  }
})

app.post('/api/instructions/upload', authMiddleware, authorize(PERMISSIONS.INSTRUCTIONS_MANAGE), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' })
  if (!store.gridFsBucket) return res.status(500).json({ error: 'File storage not available (MongoDB only)' })

  const bucket = store.gridFsBucket
  const filename = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  await new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: { originalName: req.file.originalname, uploadedBy: req.user.id }
    })
    uploadStream.on('finish', () => resolve(uploadStream.id))
    uploadStream.on('error', reject)
    uploadStream.end(req.file.buffer)
  }).then((fileId) => {
    res.status(201).json({
      ok: true,
      fileId: fileId.toString(),
      filename: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype
    })
  })
}))

app.get('/api/instructions/file/:fileId', authMiddleware, asyncHandler(async (req, res) => {
  if (!store.gridFsBucket) return res.status(500).json({ error: 'File storage not available' })
  
  let objectId
  try {
    objectId = new ObjectId(req.params.fileId)
  } catch {
    return res.status(400).json({ error: 'Invalid file ID' })
  }

  const bucket = store.gridFsBucket
  const files = await bucket.find({ _id: objectId }).toArray()
  if (!files.length) return res.status(404).json({ error: 'File not found' })

  const file = files[0]
  const isPreview = req.query.preview === '1'
  
  // Robust MIME Type detection: check GridFS fields and map by extension as fallback
  let contentType = file.contentType || (file.metadata && file.metadata.contentType)
  
  if (!contentType || contentType === 'application/octet-stream') {
    const ext = file.filename.split('.').pop().toLowerCase()
    const mimeMap = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'doc': 'application/msword',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'ppt': 'application/vnd.ms-powerpoint',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml'
    }
    if (mimeMap[ext]) contentType = mimeMap[ext]
  }

  res.setHeader('Content-Type', contentType || 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, max-age=3600')
  
  if (isPreview) {
    // For previews, we omit the filename entirely to prevent the browser from auto-downloading.
    res.setHeader('Content-Disposition', 'inline')
  } else {
    // For direct downloads, we include the attachment filename.
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
  }


  const downloadStream = bucket.openDownloadStream(objectId)
  downloadStream.on('error', () => res.status(404).json({ error: 'File not found' }))
  downloadStream.pipe(res)
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

