const CONFIGURED_API_BASE = import.meta.env.VITE_API_BASE || ''
const DEFAULT_API_START_PORT = 5000
const DEFAULT_API_PORT_SCAN = 25 // 5000-5024

function buildDefaultCandidates() {
  const out = []
  for (let p = DEFAULT_API_START_PORT; p < DEFAULT_API_START_PORT + DEFAULT_API_PORT_SCAN; p++) {
    out.push(`http://localhost:${p}`)
  }
  return out
}

const DEFAULT_API_CANDIDATES = buildDefaultCandidates()

let resolvedApiBasePromise = null

async function fetchWithTimeout(url, { timeoutMs = 800, ...options } = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

async function resolveApiBase() {
  if (CONFIGURED_API_BASE) return CONFIGURED_API_BASE

  // Persist across reloads for a smoother dev experience.
  const cached =
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ccs_api_base') : null
  if (cached) return cached

  // Prefer same-origin (works in prod if frontend is served by backend or a reverse proxy).
  try {
    const res = await fetchWithTimeout('/api/health', { method: 'GET', timeoutMs: 600 })
    if (res.ok) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ccs_api_base', '')
      return ''
    }
  } catch {
    // ignore
  }

  // Dev fallback: detect which localhost backend port is actually alive.
  for (const base of DEFAULT_API_CANDIDATES) {
    try {
      const res = await fetchWithTimeout(`${base}/api/health`, { method: 'GET', timeoutMs: 800 })
      if (res.ok) {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ccs_api_base', base)
        return base
      }
    } catch {
      // ignore
    }
  }

  // Last resort.
  return DEFAULT_API_CANDIDATES[0]
}

function clearCachedApiBase() {
  resolvedApiBasePromise = null
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('ccs_api_base')
  } catch {
    // ignore
  }
}

async function getApiBase() {
  if (!resolvedApiBasePromise) resolvedApiBasePromise = resolveApiBase()
  return resolvedApiBasePromise
}

async function request(path, options = {}) {
  const { headers: optionHeaders, ...rest } = options
  let res
  try {
    let API_BASE = await getApiBase()
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: {
          'Content-Type': 'application/json',
          ...(optionHeaders || {}),
        },
      })
    } catch {
      // If the cached/resolved base is stale (e.g. backend moved from 5001 -> 5003),
      // clear it and retry resolution once.
      clearCachedApiBase()
      API_BASE = await getApiBase()
      res = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: {
          'Content-Type': 'application/json',
          ...(optionHeaders || {}),
        },
      })
    }
  } catch (e) {
    const API_BASE = await getApiBase().catch(() => CONFIGURED_API_BASE || DEFAULT_API_CANDIDATES[0])
    const shown = API_BASE ? API_BASE : '(same origin)'
    const err = new Error(
      `Unable to reach API server at ${shown}. Is the backend running?`,
    )
    err.cause = e
    throw err
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error || 'Request failed'
    const err = new Error(msg)
    err.status = res.status
    err.data = data

    if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/register')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('authToken')
        localStorage.removeItem('authUser')
        window.location.href = '/'
      }
    }

    throw err
  }
  return data
}

export async function apiRegister({
  role,
  identifier,
  password,
  fullName,
  enable2FA,
  classSection,
  studentType,
  studentId,
  email,
  academicInfo,
  personalInformation,
  academicHistory,
  nonAcademicActivities,
  violations,
  skills,
  affiliations,
}) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      role,
      identifier,
      password,
      fullName,
      enable2FA,
      classSection,
      studentType,
      studentId,
      email,
      academicInfo,
      personalInformation,
      academicHistory,
      nonAcademicActivities,
      violations,
      skills,
      affiliations,
    }),
  })
}

export async function apiLogin({ identifier, password, twoFACode }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password, twoFACode }),
  })
}

export async function apiLogout(token) {
  return request('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiMe(token) {
  return request('/api/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiAdminUsers(token) {
  return request('/api/admin/users', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiAdminUser(token, id) {
  return request(`/api/admin/users/${id}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiAdminPatchUser(token, id, body) {
  return request(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiAdminStudents(token, query = {}) {
  const params = new URLSearchParams()
  if (query.skill) params.append('skill', query.skill)
  if (query.affiliation) params.append('affiliation', query.affiliation)
  const url = `/api/admin/students${params.toString() ? '?' + params.toString() : ''}`
  return request(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// --- Instructions API ---

export async function apiGetInstructions(token) {
  return request('/api/instructions', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiGetInstruction(token, id) {
  return request(`/api/instructions/${id}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiCreateInstruction(token, body) {
  return request('/api/instructions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiUpdateInstruction(token, id, body) {
  return request(`/api/instructions/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiDeleteInstruction(token, id) {
  return request(`/api/instructions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiUploadInstructionFile(token, file) {
  const resolvedBase = await getApiBase()
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${resolvedBase}/api/instructions/upload`, {
    method: 'POST',
    // DO NOT set Content-Type here — browser must set it to include the boundary for multipart
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || 'Upload failed')
  }
  return data
}

export async function apiGetInstructionFileUrl() {
  return await getApiBase()
}
