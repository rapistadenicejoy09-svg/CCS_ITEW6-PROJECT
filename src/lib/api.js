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

export async function apiGetDocuments(token, query = {}) {
  const params = new URLSearchParams()
  if (query.facultyId) params.set('facultyId', query.facultyId)
  if (query.subjectId) params.set('subjectId', query.subjectId)
  if (query.status) params.set('status', query.status)
  return request(`/api/documents?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiUploadDocument(token, body) {
  return request('/api/documents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiApproveDocument(token, id, body) {
  return request(`/api/documents/${id}/approval`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiGetReports(token) {
  return request('/api/reports', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiGetAccountProfile(token) {
  return request('/api/account/profile', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiPatchAccountProfile(token, body) {
  return request('/api/account/profile', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiChangePassword(token, body) {
  return request('/api/account/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function api2faSetup(token) {
  return request('/api/auth/2fa/setup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function api2faVerify(token, code) {
  return request('/api/auth/2fa/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  })
}

// --- Faculty Module API ---

export async function apiGetSubjects(token) {
  return request('/api/subjects', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiCreateSubject(token, body) {
  return request('/api/subjects', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiUpdateSubject(token, id, body) {
  return request(`/api/subjects/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiDeleteSubject(token, id) {
  return request(`/api/subjects/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiGetTeachingLoads(token, facultyId = null) {
  const url = `/api/teaching-loads${facultyId ? '?facultyId=' + facultyId : ''}`
  return request(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiCreateTeachingLoad(token, body) {
  return request('/api/teaching-loads', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiDeleteTeachingLoad(token, id) {
  return request(`/api/teaching-loads/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiGetSchedules(token, teachingLoadId = null) {
  const url = `/api/schedules${teachingLoadId ? '?teachingLoadId=' + teachingLoadId : ''}`
  return request(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiCreateSchedule(token, body) {
  return request('/api/schedules', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiDeleteSchedule(token, id) {
  return request(`/api/schedules/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}


export async function apiDeleteDocument(token, id) {
  return request(`/api/documents/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiGetEvaluations(token, facultyId = null) {
  const url = `/api/evaluations${facultyId ? '?facultyId=' + facultyId : ''}`
  return request(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiCreateEvaluation(token, body) {
  return request('/api/evaluations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiUpdateFacultyProfile(token, body) {
  return request('/api/faculty/profile', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiAdminLogs(token, limit = 100) {
  return request(`/api/admin/logs?limit=${limit}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}
