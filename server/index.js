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

// MongoDB connection is async; keep server startup blocked until the store is ready.
const store = await openStore()

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
  }

  const passwordHash = hashPassword(password)
  const backupCode = enable2FA ? generateBackupCode() : null

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
  })

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
  if (typeof req.body?.isActive !== 'boolean') {
    return res.status(400).json({ error: 'Expected isActive boolean' })
  }
  const user = await store.updateUserIsActive(id, req.body.isActive)
  res.json({ ok: true, user })
}))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled API error:', err)
  res.status(500).json({ error: 'Internal server error' })
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

