import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiAdminUsers, apiCreateAdminAccount } from '../lib/api'

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    return user?.role || null
  } catch {
    return null
  }
}

function getAdminToken() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    const token = localStorage.getItem('authToken')
    if (token && user?.role === 'admin') return token
  } catch {
    /* ignore */
  }
  return null
}

function getCurrentLoginKey() {
  try {
    const raw = localStorage.getItem('authUser')
    const u = raw ? JSON.parse(raw) : null
    return String(u?.identifier || u?.email || '').trim().toLowerCase() || null
  } catch {
    return null
  }
}

function norm(s) {
  return String(s || '').trim().toLowerCase()
}

function isUserActive(u) {
  return u?.is_active !== 0 && u?.is_active !== false
}

function adminNameParts(u) {
  const pi = u.personal_information || {}
  let first = String(u.first_name ?? pi.first_name ?? pi.firstName ?? '').trim()
  let middle = String(u.middle_name ?? pi.middle_name ?? pi.middleName ?? '').trim()
  let last = String(u.last_name ?? pi.last_name ?? pi.lastName ?? '').trim()
  if (!first && !middle && !last) {
    const fb = String(u.full_name || '').trim()
    const tok = fb.split(/\s+/).filter(Boolean)
    if (tok.length >= 3) {
      first = tok[0]
      last = tok[tok.length - 1]
      middle = tok.slice(1, -1).join(' ')
    } else if (tok.length === 2) {
      first = tok[0]
      last = tok[1]
    } else if (tok.length === 1) {
      first = tok[0]
    }
  }
  return { first, middle, last }
}

function adminDisplayName(u) {
  const { first, middle, last } = adminNameParts(u)
  const composed = [first, middle, last].filter(Boolean).join(' ')
  if (composed) return composed
  return (
    String(u.full_name || '').trim() ||
    String(u.personal_information?.full_name || '').trim() ||
    [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
    String(u.identifier || u.email || '').trim() ||
    'Administrator'
  )
}

/** Table column: First name, middle initial with period if present, last name. */
function adminFullNameListDisplay(u) {
  const { first, middle, last } = adminNameParts(u)
  const m = String(middle || '').trim()
  const mid = m ? `${m.charAt(0).toUpperCase()}.` : ''
  const parts = [first, mid, last].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  return adminDisplayName(u)
}

function adminLoginLabel(u) {
  return String(u.email || u.identifier || '').trim() || '—'
}

const Label = ({ children, required }) => (
  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
    {children}
    {required && <span className="text-rose-500 ml-1">*</span>}
  </label>
)

const inputCls = 'search-input w-full disabled:opacity-60 disabled:cursor-not-allowed'

function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export default function AdminAdminsPage() {
  const navigate = useNavigate()
  const [admins, setAdmins] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [search, setSearch] = useState('')
  const [showAddPanel, setShowAddPanel] = useState(true)

  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    enable2FA: false,
  })
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formSuccess, setFormSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [twoFACode, setTwoFACode] = useState(null)

  const isAdmin = getRole() === 'admin'
  const currentLogin = getCurrentLoginKey()

  const loadAdmins = useCallback(async () => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setListError('Missing auth token.')
      setListLoading(false)
      return
    }
    setListLoading(true)
    setListError('')
    try {
      const result = await apiAdminUsers(token)
      const users = Array.isArray(result?.users) ? result.users : []
      setAdmins(users.filter((u) => u.role === 'admin'))
    } catch (err) {
      setListError(err?.message || 'Failed to load administrators.')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      navigate('/', { replace: true })
      return
    }
    loadAdmins()
  }, [isAdmin, navigate, loadAdmins])

  const filteredAdmins = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return admins
    return admins.filter((u) => {
      const parts = adminNameParts(u)
      const blob = [
        parts.first,
        parts.middle,
        parts.last,
        adminDisplayName(u),
        adminLoginLabel(u),
        String(u.id),
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [admins, search])

  const stats = useMemo(() => {
    const active = admins.filter(isUserActive).length
    const twofa = admins.filter((u) => u.twofa_enabled).length
    return { total: admins.length, active, twofa }
  }, [admins])

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setFormError('')
    setFormSuccess('')
  }

  const resetForm = () => {
    setForm({
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      enable2FA: false,
    })
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    const token = getAdminToken()
    if (!token) {
      navigate('/admin/login', { replace: true })
      return
    }
    const fn = form.firstName.trim()
    const ln = form.lastName.trim()
    if (!fn || !ln || !form.email || !form.password || !form.confirmPassword) {
      setFormError('Please fill in first name, last name, email, and both password fields.')
      return
    }
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters long.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }

    setFormLoading(true)
    setFormError('')
    setFormSuccess('')
    try {
      const fullName = [fn, form.middleName.trim(), ln].filter(Boolean).join(' ')
      const result = await apiCreateAdminAccount(token, {
        identifier: form.email,
        password: form.password,
        fullName,
        enable2FA: form.enable2FA,
        personalInformation: {
          first_name: fn,
          middle_name: form.middleName.trim(),
          last_name: ln,
        },
      })
      if (result?.twoFABackupCode) {
        setTwoFACode(result.twoFABackupCode)
      } else {
        setFormSuccess('Administrator account created successfully.')
        resetForm()
        await loadAdmins()
      }
    } catch (err) {
      setFormError(err?.message || 'Failed to create administrator.')
    } finally {
      setFormLoading(false)
    }
  }

  const handleFinish2FA = async () => {
    setTwoFACode(null)
    resetForm()
    setFormSuccess('Administrator account created. Share the backup code securely.')
    await loadAdmins()
  }

  const isYou = (u) => {
    const key = currentLogin
    if (!key) return false
    return norm(u.identifier) === key || norm(u.email) === key
  }

  if (twoFACode) {
    return (
      <div className="module-page admin-admins-page">
        <div className="admin-admins-modal-overlay admin-admins-fade-in" role="dialog" aria-modal="true" aria-labelledby="admins-2fa-title">
          <div className="admin-admins-modal-card admin-admins-modal-pop">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <IconShield />
              </span>
              <div>
                <h2 id="admins-2fa-title" className="text-lg font-extrabold text-[var(--text)]">
                  Backup code generated
                </h2>
                <p className="text-sm text-[var(--text-muted)]">Transmit this value to the new administrator through a secure channel.</p>
              </div>
            </div>
            <div className="font-mono text-base sm:text-lg tracking-wide break-all p-4 rounded-xl bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)] border border-[var(--border-color)] text-[var(--text)] mb-4">
              {twoFACode}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={handleFinish2FA}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="module-page admin-admins-page">
      <div className="w-full space-y-6">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 admin-admins-hero-enter">
          <div className="flex items-start gap-4">
            <span className="admin-admins-icon-ring hidden sm:flex">
              <IconUsers />
            </span>
            <div>
              <h1 className="main-title font-extrabold text-[var(--text)] tracking-tight">Administrators</h1>
              <p className="main-description text-[var(--text-muted)] mt-1 max-w-2xl">
                Manage system administrators: review who has access and provision new accounts. All creations are audited on the activity log.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              className="btn btn-primary lg:hidden"
              onClick={() => setShowAddPanel((v) => !v)}
            >
              {showAddPanel ? 'Hide form' : 'Add administrator'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 admin-admins-stats-enter">
          <div className="admin-admins-stat-card admin-admins-stat-enter" style={{ animationDelay: '0.02s' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Total</p>
            <p className="text-2xl font-extrabold text-[var(--text)] mt-1 tabular-nums">{stats.total}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Admin accounts</p>
          </div>
          <div className="admin-admins-stat-card admin-admins-stat-enter" style={{ animationDelay: '0.08s' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Active</p>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">{stats.active}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Can sign in</p>
          </div>
          <div className="admin-admins-stat-card admin-admins-stat-enter" style={{ animationDelay: '0.14s' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">2FA enabled</p>
            <p className="text-2xl font-extrabold text-violet-600 dark:text-violet-400 mt-1 tabular-nums">{stats.twofa}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Extra verification</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start admin-admins-layout-enter">
          <div className="xl:col-span-7 space-y-4">
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-4 md:p-5 shadow-sm admin-profile-card-surface">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 block ml-1">Search directory</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-[var(--accent)]">
                  <IconSearch />
                </div>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, email, or ID…"
                  className="search-input w-full h-12 rounded-xl border-[var(--border-color)]"
                  style={{ paddingLeft: '3rem', paddingRight: '12px' }}
                />
              </div>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden admin-profile-card-surface">
              {listError && (
                <div className="p-4 m-4 rounded-xl text-sm text-rose-600 bg-rose-500/10 border border-rose-500/20">{listError}</div>
              )}
              {listLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="h-9 w-9 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                  <p className="text-sm text-[var(--text-muted)]">Loading administrators…</p>
                </div>
              ) : filteredAdmins.length === 0 ? (
                <div className="text-center py-16 px-4 text-[var(--text-muted)] text-sm">No administrators match your search.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[520px]">
                    <thead>
                      <tr className="bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.03)] border-b border-[var(--border-color)]">
                        <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Full name</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Login</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Status</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Security</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {filteredAdmins.map((u, i) => {
                        const parts = adminNameParts(u)
                        const listName = adminFullNameListDisplay(u)
                        const initial = (parts.first || parts.last || listName).charAt(0).toUpperCase() || '?'
                        return (
                        <tr
                          key={u.id}
                          className="admin-student-table-row-enter admin-admins-table-row hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                          style={{ '--row-enter-delay': `${Math.min(i, 12) * 0.04}s` }}
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] font-bold text-sm shrink-0">
                                {initial}
                              </div>
                              <div>
                                <div className="font-semibold text-[var(--text)] flex flex-wrap items-center gap-2">
                                  {listName}
                                  {isYou(u) && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/25">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">ID {u.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-[var(--text-muted)]">{adminLoginLabel(u)}</td>
                          <td className="px-5 py-4">
                            {isUserActive(u) ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                Active
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {u.twofa_enabled ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-600 border border-violet-500/20 inline-flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                </svg>
                                2FA
                              </span>
                            ) : (
                              <span className="text-[10px] text-[var(--text-muted)]">Standard</span>
                            )}
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className={`xl:col-span-5 ${showAddPanel ? '' : 'hidden lg:block'}`}>
            <div className="xl:sticky xl:top-6 space-y-4 admin-admins-form-enter">
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-6 md:p-7 shadow-sm admin-profile-card-surface admin-admins-form-card">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[var(--accent)]">
                    <IconShield />
                  </span>
                  <h2 className="text-base font-extrabold text-[var(--text)]">Add administrator</h2>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-6 leading-relaxed">
                  Creates a new admin login. The action is attributed to you in the security audit trail.
                </p>
                <form className="space-y-4" onSubmit={handleCreateSubmit}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <Label required>First name</Label>
                      <input
                        className={inputCls}
                        type="text"
                        name="firstName"
                        value={form.firstName}
                        onChange={handleFormChange}
                        placeholder="Given name"
                        autoComplete="given-name"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Label>Middle name</Label>
                      <input
                        className={inputCls}
                        type="text"
                        name="middleName"
                        value={form.middleName}
                        onChange={handleFormChange}
                        placeholder="Optional"
                        autoComplete="additional-name"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Label required>Last name</Label>
                      <input
                        className={inputCls}
                        type="text"
                        name="lastName"
                        value={form.lastName}
                        onChange={handleFormChange}
                        placeholder="Family name"
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                  <div>
                    <Label required>Email (login)</Label>
                    <input
                      className={inputCls}
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleFormChange}
                      placeholder="admin@example.edu"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <Label required>Password</Label>
                    <div className="relative">
                      <input
                        className={`${inputCls} pr-11`}
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={form.password}
                        onChange={handleFormChange}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="admin-admins-password-toggle absolute inset-y-0 right-0 rounded-lg"
                        onClick={() => setShowPassword(!showPassword)}
                        title={showPassword ? 'Hide password' : 'Show password'}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <IconEyeOff /> : <IconEye />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label required>Confirm password</Label>
                    <div className="relative">
                      <input
                        className={`${inputCls} pr-11`}
                        type={showConfirmPassword ? 'text' : 'password'}
                        name="confirmPassword"
                        value={form.confirmPassword}
                        onChange={handleFormChange}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="admin-admins-password-toggle absolute inset-y-0 right-0 rounded-lg"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <IconEyeOff /> : <IconEye />}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer text-sm text-[var(--text)]">
                    <input
                      type="checkbox"
                      name="enable2FA"
                      checked={form.enable2FA}
                      onChange={handleFormChange}
                      className="mt-1 rounded border-[var(--border-color)]"
                    />
                    <span>Enable two-factor authentication (backup code after submit)</span>
                  </label>
                  {formError && <div className="text-sm text-rose-500 font-medium">{formError}</div>}
                  {formSuccess && <div className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{formSuccess}</div>}
                  <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={formLoading}>
                    {formLoading ? 'Creating…' : 'Create administrator'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
