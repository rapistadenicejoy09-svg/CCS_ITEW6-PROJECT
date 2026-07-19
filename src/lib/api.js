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
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?\/?$/i.test(String(url || '').trim())
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

// --- Helper: fetch without forcing Content-Type (for multipart) ---
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

// --- Auth ---

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

// --- Account ---

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

// --- Admin ---

/** Create an administrator account (requires an authenticated admin session). */
export async function apiCreateAdminAccount(token, { identifier, password, fullName, enable2FA, personalInformation }) {
  return request('/api/admin/accounts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ identifier, password, fullName, enable2FA, personalInformation }),
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

export async function apiFacultyDirectory(token) {
  return request('/api/faculty/directory', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
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



// --- Faculty Module ---

export async function apiUpdateFacultyProfile(token, body) {
  return request('/api/faculty/profile', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

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

// --- Documents ---

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

export async function apiDeleteDocument(token, id) {
  return request(`/api/documents/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// --- Instructions Module ---

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

// --- College Research ---

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

// --- Office Hours ---

export async function apiGetOfficeHours(token) {
  return request('/api/office-hours', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiCreateOfficeHour(token, body) {
  return request('/api/office-hours', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiDeleteOfficeHour(token, id) {
  return request(`/api/office-hours/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// --- Events Module ---

export async function apiGetEvents(token, query = {}) {
  const params = new URLSearchParams()
  if (query.type) params.set('type', query.type)
  if (query.department) params.set('department', query.department)
  if (query.status) params.set('status', query.status)
  if (query.visibility) params.set('visibility', query.visibility)

  return request(`/api/events?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiGetEvent(token, id) {
  return request(`/api/events/${id}`, {
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
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

export async function apiDeleteEvent(token, id) {
  return request(`/api/events/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiApproveEvent(token, id) {
  return request(`/api/events/${id}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
}
