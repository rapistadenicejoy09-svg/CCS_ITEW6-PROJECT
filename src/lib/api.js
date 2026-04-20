function normalizeApiBase(base) {
  if (base == null || base === '') return ''
  return String(base).replace(/\/+$/, '')
}

const CONFIGURED_API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE || '')
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

const IS_PROD_BUILD = import.meta.env.PROD

/** True when the UI is opened from a real host (e.g. vercel.app), not local dev. */
function isNonLocalDeployedHost() {
  if (typeof window === 'undefined' || !window.location?.hostname) return false
  const h = window.location.hostname
  return h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]'
}

/** Never use localhost discovery when shipped to a public URL (even if PROD flag were wrong). */
function forbidLocalhostFallback() {
  return IS_PROD_BUILD || isNonLocalDeployedHost()
}

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

async function sameOriginHealthOk() {
  try {
    const res = await fetchWithTimeout('/api/health', { method: 'GET', timeoutMs: 600 })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return Boolean(data && data.ok === true)
  } catch {
    return false
  }
}

function isLocalhostApiUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(String(url || '').trim())
}

async function resolveApiBase() {
  if (CONFIGURED_API_BASE) return CONFIGURED_API_BASE

  const noLocal = forbidLocalhostFallback()

  const cachedRaw =
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ccs_api_base') : null
  if (cachedRaw !== null && cachedRaw !== undefined) {
    if (noLocal && cachedRaw !== '' && isLocalhostApiUrl(cachedRaw)) {
      try {
        sessionStorage.removeItem('ccs_api_base')
      } catch {
        // ignore
      }
    } else if (cachedRaw !== '') {
      return cachedRaw
    }
  }

  // Same-origin API (e.g. reverse proxy). Reject SPA/HTML 200 responses: real server returns { ok: true } JSON.
  if (await sameOriginHealthOk()) {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ccs_api_base', '')
    return ''
  }

  if (noLocal) {
    return null
  }

  // Local dev: detect which localhost backend port is actually alive.
  for (const base of DEFAULT_API_CANDIDATES) {
    try {
      const res = await fetchWithTimeout(`${base}/api/health`, { method: 'GET', timeoutMs: 800 })
      if (!res.ok) continue
      const data = await res.json().catch(() => null)
      if (!data || data.ok !== true) continue
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ccs_api_base', base)
      return base
    } catch {
      // ignore
    }
  }

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
  if (!resolvedApiBasePromise) {
    resolvedApiBasePromise = (async () => {
      const base = await resolveApiBase()
      if (base === null) {
        const err = new Error(
          'API unreachable from this site. On Vercel: add MONGODB_URI (and MONGODB_DB if needed), redeploy, and ensure /api/health returns JSON. Optional: set VITE_API_BASE only if the API is on another origin. For custom domains, add CORS_ORIGINS on the server.',
        )
        err.isConfigError = true
        throw err
      }
      return base
    })()
  }
  return resolvedApiBasePromise
}

function labelApiBaseForError(base) {
  if (base === '' || base == null) {
    return '(same origin — if the API is elsewhere, set VITE_API_BASE on Vercel and redeploy)'
  }
  return base
}

function fallbackBaseForErrorMessage() {
  if (CONFIGURED_API_BASE) return CONFIGURED_API_BASE
  if (forbidLocalhostFallback()) return ''
  return DEFAULT_API_CANDIDATES[0]
}

export async function request(path, options = {}) {
  const { headers: optionHeaders, ...rest } = options

  // Automatically inject Authorization header if not explicitly provided
  const authHeaders = {}
  if (!optionHeaders?.Authorization && typeof localStorage !== 'undefined') {
    const token = localStorage.getItem('authToken')
    if (token) authHeaders.Authorization = `Bearer ${token}`
  }

  let res
  try {
    let API_BASE = await getApiBase()
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...(optionHeaders || {}),
        },
      })
    } catch {
      clearCachedApiBase()
      API_BASE = await getApiBase()
      res = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...(optionHeaders || {}),
        },
      })
    }
  } catch (e) {
    if (e && e.isConfigError) throw e
    const API_BASE = await getApiBase().catch(() => fallbackBaseForErrorMessage())
    const shown = labelApiBaseForError(API_BASE)
    const err = new Error(`Unable to reach API server at ${shown}. Is the backend running?`)
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

export async function apiFetchInstructionFileBlob(token, fileId, { preview = false } = {}) {
  const encodedId = encodeURIComponent(String(fileId || '').trim())
  if (!encodedId) throw new Error('Invalid file id')
  const query = preview ? '?preview=1' : ''
  const path = `/api/instructions/file/${encodedId}${query}`
  const withTokenPath = token
    ? `${path}${query ? '&' : '?'}token=${encodeURIComponent(token)}`
    : path

  const doFetch = async (base) =>
    await fetch(`${base}${path}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
  const doFetchWithQueryToken = async (base) =>
    await fetch(`${base}${withTokenPath}`, {
      method: 'GET',
    })

  let res
  try {
    let base = await getApiBase()
    try {
      res = await doFetch(base)
    } catch {
      clearCachedApiBase()
      base = await getApiBase()
      res = await doFetch(base)
    }
    if ((res.status === 401 || res.status === 403) && token) {
      // Fallback for environments where auth headers are stripped on streamed responses.
      res = await doFetchWithQueryToken(base)
    }

    // In local dev, multiple backend instances may be running on different ports.
    // If the currently resolved base still fails, probe other localhost API candidates.
    if ((!res || !res.ok) && !forbidLocalhostFallback()) {
      for (const candidate of DEFAULT_API_CANDIDATES) {
        try {
          let candidateRes = await doFetch(candidate)
          if ((candidateRes.status === 401 || candidateRes.status === 403) && token) {
            candidateRes = await doFetchWithQueryToken(candidate)
          }
          if (candidateRes.ok) {
            try {
              if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ccs_api_base', candidate)
            } catch {
              // ignore cache write errors
            }
            res = candidateRes
            break
          }
        } catch {
          // try next candidate
        }
      }
    }
  } catch (e) {
    const shown = labelApiBaseForError(await getApiBase().catch(() => fallbackBaseForErrorMessage()))
    throw new Error(`Unable to reach API server at ${shown}. Is the backend running?`, { cause: e })
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || `Request failed (${res.status})`)
  }

  const blob = await res.blob()
  const contentType = res.headers.get('Content-Type') || ''
  return { blob, contentType }
}

// --- Research API ---

export async function apiResearchList(token, query = {}) {
  const params = new URLSearchParams()
  if (query.scope) params.append('scope', query.scope)
  if (query.year) params.append('year', query.year)
  if (query.course) params.append('course', query.course)
  if (query.author) params.append('author', query.author)
  if (query.keyword) params.append('keyword', query.keyword)
  const url = `/api/research${params.toString() ? '?' + params.toString() : ''}`
  return request(url, {
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

export async function apiResearchAdvisers(token) {
  return request('/api/research/advisers', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiResearchAuthorSuggestions(token, query = {}) {
  const params = new URLSearchParams()
  if (query.q) params.append('q', query.q)
  if (query.course) params.append('course', query.course)
  if (query.limit) params.append('limit', String(query.limit))
  const url = `/api/research/authors/suggestions${params.toString() ? '?' + params.toString() : ''}`
  return request(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiResearchCreate(token, body) {
  return request('/api/research', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiResearchPatch(token, id, body) {
  return request(`/api/research/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiResearchUploadPdf(token, file) {
  const resolvedBase = await getApiBase()
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${resolvedBase}/api/research/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Upload failed')
  return data
}

export async function apiResearchDownloadBlob(token, fileId) {
  const resolvedBase = await getApiBase()
  const res = await fetch(`${resolvedBase}/api/research/file/${fileId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  return { blob, contentType: res.headers.get('Content-Type') }
}

export async function apiResearchDelete(token, id) {
  return request(`/api/research/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiResearchFacultyReview(token, id, adviserId) {
  return apiResearchPatch(token, id, {
    status: 'under_faculty_review',
    adviser_faculty_id: adviserId,
  })
}

export async function apiResearchFinalApproval(token, id, status = 'published') {
  return apiResearchPatch(token, id, { status })
}

// --- Events API ---

export async function apiGetEvents(token) {
  return request('/api/events', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiCreateEvent(token, body) {
  return request('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiUpdateEvent(token, id, body) {
  return request(`/api/events/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiApproveEvent(token, id) {
  return request(`/api/events/${id}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiDeleteEvent(token, id) {
  return request(`/api/events/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// --- MISSING ENDPOINTS (MOCKED FOR DEPENDENCY RESOLUTION) ---
export async function apiAdminLogs(token) { return request('/api/admin/logs', { headers: { Authorization: `Bearer ${token}` } }) }
export async function apiMeLogs(token) { return request('/api/logs', { headers: { Authorization: `Bearer ${token}` } }) }

export async function apiGetTeachingLoads(token) { return request('/api/faculty/teaching-loads', { headers: { Authorization: `Bearer ${token}` } }) }
export async function apiCreateTeachingLoad(token, body) { return request('/api/faculty/teaching-loads', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
export async function apiDeleteTeachingLoad(token, id) { return request(`/api/faculty/teaching-loads/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }) }

export async function apiGetSubjects(token) { return request('/api/faculty/subjects', { headers: { Authorization: `Bearer ${token}` } }) }
export async function apiCreateSubject(token, body) { return request('/api/faculty/subjects', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
export async function apiDeleteSubject(token, id) { return request(`/api/faculty/subjects/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }) }

export async function apiGetEvaluations(token) { return request('/api/faculty/evaluations', { headers: { Authorization: `Bearer ${token}` } }) }

export async function apiGetDocuments(token) { return request('/api/faculty/documents', { headers: { Authorization: `Bearer ${token}` } }) }
export async function apiUploadDocument(token, body) { return request('/api/faculty/documents/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }) }
export async function apiDeleteDocument(token, id) { return request(`/api/faculty/documents/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }) }

export async function apiGetSchedules(token) { return request('/api/faculty/schedules', { headers: { Authorization: `Bearer ${token}` } }) }
export async function apiCreateSchedule(token, body) { return request('/api/faculty/schedules', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
export async function apiDeleteSchedule(token, id) { return request(`/api/faculty/schedules/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }) }

export async function apiCreateAdminAccount(token, body) { return request('/api/admin/users', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }


