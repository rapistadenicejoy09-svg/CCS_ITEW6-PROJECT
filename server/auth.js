import crypto from 'node:crypto'
import bcrypt from 'bcrypt'

const BCRYPT_ROUNDS = 10

export function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS)
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false
  // For backwards compatibility with PBKDF2 we could handle 'pbkdf2:' but as stated in plan we will invalidate them.
  if (storedHash.startsWith('pbkdf2:')) return false
  try {
    return bcrypt.compareSync(password, storedHash)
  } catch {
    return false
  }
}

export function generateBackupCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

