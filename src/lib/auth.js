/**
 * Secure authentication utilities
 * - Password hashing (PBKDF2 via Web Crypto API)
 * - Login attempt limits
 * - Two-factor authentication (backup code)
 */

const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16
const HASH_LENGTH = 32
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15
const LOGIN_ATTEMPTS_KEY = 'auth_login_attempts'
const TWO_FACTOR_KEY = 'auth_2fa'

/**
 * Hash a password using PBKDF2 (Web Crypto API)
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_LENGTH * 8
  )
  const saltB64 = btoa(String.fromCharCode(...salt))
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
  return `pbkdf2:${saltB64}:${hashB64}`
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false
  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':')
    if (parts.length !== 3) return false
    const salt = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0))
    const expectedHash = atob(parts[2])
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    )
    const hash = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      HASH_LENGTH * 8
    )
    const actualHash = String.fromCharCode(...new Uint8Array(hash))
    return actualHash === expectedHash
  }
  return false
}

/**
 * Get login attempts for an identifier (email or idOrEmail)
 */
function getLoginAttempts(identifier) {
  try {
    const data = localStorage.getItem(LOGIN_ATTEMPTS_KEY)
    if (!data) return { count: 0, lockedUntil: null }
    const all = JSON.parse(data)
    const entry = all[identifier] || { count: 0, lockedUntil: null }
    return entry
  } catch {
    return { count: 0, lockedUntil: null }
  }
}

/**
 * Check if account is locked due to too many failed attempts
 */
export function isAccountLocked(identifier) {
  const { lockedUntil } = getLoginAttempts(identifier)
  if (!lockedUntil) return false
  if (new Date(lockedUntil) > new Date()) return true
  clearLoginAttempts(identifier)
  return false
}

/**
 * Get remaining lockout time in seconds
 */
export function getLockoutRemaining(identifier) {
  const { lockedUntil } = getLoginAttempts(identifier)
  if (!lockedUntil) return 0
  const remaining = Math.ceil((new Date(lockedUntil) - new Date()) / 1000)
  return remaining > 0 ? remaining : 0
}

/**
 * Record a failed login attempt
 */
export function recordFailedAttempt(identifier) {
  const data = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || '{}')
  const entry = data[identifier] || { count: 0, lockedUntil: null }
  entry.count += 1

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    const lockUntil = new Date()
    lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_MINUTES)
    entry.lockedUntil = lockUntil.toISOString()
    entry.count = 0
  }

  data[identifier] = entry
  localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(data))
}

/**
 * Clear login attempts on successful login
 */
export function clearLoginAttempts(identifier) {
  const data = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || '{}')
  delete data[identifier]
  localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(data))
}

/**
 * Generate a 6-digit backup code for 2FA
 */
export function generate2FACode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/**
 * Store 2FA backup code for an identifier
 */
export function set2FACode(identifier, code) {
  const data = JSON.parse(localStorage.getItem(TWO_FACTOR_KEY) || '{}')
  data[identifier] = { code, enabled: true }
  localStorage.setItem(TWO_FACTOR_KEY, JSON.stringify(data))
}

/**
 * Verify 2FA code
 */
export function verify2FACode(identifier, inputCode) {
  const data = JSON.parse(localStorage.getItem(TWO_FACTOR_KEY) || '{}')
  const entry = data[identifier]
  if (!entry?.enabled) return true
  return entry.code === String(inputCode).trim()
}

/**
 * Check if 2FA is enabled for identifier
 */
export function is2FAEnabled(identifier) {
  const data = JSON.parse(localStorage.getItem(TWO_FACTOR_KEY) || '{}')
  return !!data[identifier]?.enabled
}
