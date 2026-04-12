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

  // In dev, prefer same-origin /api (Vite proxy → this project’s API). Ignore sessionStorage here: it often
  // caches http://localhost:5000 while the real server is on another port, or points at a different app on 5000.
  if (import.meta.env.DEV) {
    try {
      const res = await fetchWithTimeout('/api/health', { method: 'GET', timeoutMs: 800 })
      if (res.ok) {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ccs_api_base', '')
        return ''
      }
    } catch {
      // fall through
    }
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('ccs_api_base')
    } catch {
      // ignore
    }
  } else {
    const cached =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ccs_api_base') : null
    if (cached) return cached
  }

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
  department,
  summary,
  specialization,
  bio,
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
      department,
      summary,
      specialization,
      bio,
    }),
  })
}

/** Create an administrator account (requires an authenticated admin session). */
export async function apiCreateAdminAccount(token, { identifier, password, fullName, enable2FA, personalInformation }) {
  return request('/api/admin/accounts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ identifier, password, fullName, enable2FA, personalInformation }),
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

export async function api2faDisable(token, password) {
  return request('/api/auth/2fa/disable', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
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

export async function apiMeLogs(token, limit = 100) {
  return request(`/api/me/logs?limit=${limit}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// --- College Research (multipart + JSON) ---
async function fetchAuthNoJsonContentType(path, token, init = {}) {
  let API_BASE = await getApiBase()
  const doFetch = (base) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    })
  let res = await doFetch(API_BASE)
  if (!res.ok && res.status !== 400 && res.status !== 403 && res.status !== 404) {
    clearCachedApiBase()
    API_BASE = await getApiBase()
    res = await doFetch(API_BASE)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export async function apiResearchList(token, query = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length) params.set(k, String(v))
  })
  const qs = params.toString()
  // Use /api/college-research (not /api/research) for listing — some environments return 404 on the bare /api/research path.
  return request(`/api/college-research${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiResearchGet(token, id) {
  return request(`/api/research/${id}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiResearchAnalytics(token) {
  return request('/api/research/analytics', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiResearchAuthorSuggestions(token, q, limit = 55, course = '') {
  const params = new URLSearchParams()
  params.set('q', q ?? '')
  if (limit) params.set('limit', String(limit))
  if (course && ['CS', 'IT'].includes(String(course).toUpperCase())) {
    params.set('course', String(course).toUpperCase())
  }
  return request(`/api/research/author-suggestions?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiResearchAdvisers(token) {
  return request('/api/research/advisers', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiResearchCreate(token, formData) {
  return fetchAuthNoJsonContentType('/api/research', token, { method: 'POST', body: formData })
}

export async function apiResearchPatch(token, id, body) {
  return request(`/api/research/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiResearchUploadPdf(token, id, formData) {
  return fetchAuthNoJsonContentType(`/api/research/${id}/pdf`, token, { method: 'POST', body: formData })
}

export async function apiResearchFacultyReview(token, id, body) {
  return request(`/api/research/${id}/faculty-review`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiResearchFinalApproval(token, id, body) {
  return request(`/api/research/${id}/final-approval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiResearchDelete(token, id) {
  return request(`/api/research/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiResearchDownloadBlob(token, id) {
  let API_BASE = await getApiBase()
  const headers = { Authorization: `Bearer ${token}` }
  let res = await fetch(`${API_BASE}/api/research/${id}/file`, { headers })
  if (!res.ok) {
    clearCachedApiBase()
    API_BASE = await getApiBase()
    res = await fetch(`${API_BASE}/api/research/${id}/file`, { headers })
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data?.error || 'Download failed')
    err.status = res.status
    throw err
  }
  return await res.blob()
}
