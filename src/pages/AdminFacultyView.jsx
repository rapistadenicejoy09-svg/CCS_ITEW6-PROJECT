import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiAdminUser, apiAdminPatchUser } from '../lib/api'

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    return user?.role || null
  } catch {
    return null
  }
}

/* ─── Reusable field components ─── */

const Label = ({ children }) => (
  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
    {children}
  </label>
)

const SectionTitle = ({ children }) => (
  <div className="flex items-center gap-3 mb-5">
    <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] whitespace-nowrap">
      {children}
    </span>
    <div className="flex-1 h-px bg-[var(--border-color)]" />
  </div>
)

const Card = ({ children, className = '' }) => (
  <div className={`bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-6 shadow-sm ${className}`}>
    {children}
  </div>
)

function ViewValue({ children, multiline }) {
  const text = typeof children === 'string' ? children.trim() : children
  const empty = text == null || text === ''
  return (
    <div
      className={`rounded-xl border border-dashed border-[var(--border-color)] bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text)] transition-all duration-300 hover:border-[var(--accent)]/40 hover:bg-[rgba(229,118,47,0.07)] ${
        multiline ? 'min-h-[5.5rem] whitespace-pre-wrap' : 'min-h-[44px] flex items-center'
      }`}
    >
      {empty ? <span className="text-[var(--text-muted)] italic">—</span> : children}
    </div>
  )
}

function formatFacultyRole(role) {
  if (role === 'dean') return 'College Dean'
  if (role === 'department_chair') return 'Department Chair'
  if (role === 'secretary') return 'College Secretary'
  if (role === 'faculty_professor') return 'Professor'
  if (role === 'faculty') return 'Faculty (Basic)'
  return 'Faculty'
}

function getFacultyName(f) {
  if (!f) return ''
  return (
    String(f.displayName || f.fullName || f.full_name || '').trim() ||
    String(f.personal_information?.fullName || f.personal_information?.full_name || '').trim() ||
    [f.personal_information?.first_name, f.personal_information?.last_name].filter(Boolean).join(' ') ||
    'Unnamed Faculty'
  )
}

export default function AdminFacultyView() {
  const { id } = useParams()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  
  const [roleDraft, setRoleDraft] = useState('')
  const [isActiveDraft, setIsActiveDraft] = useState(true)

  const isAdmin = getRole() === 'admin'

  const load = useCallback(async () => {
    const token = localStorage.getItem('authToken')
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const res = await apiAdminUser(token, id)
      const u = res?.user
      setUser(u)
      setRoleDraft(u?.role || '')
      setIsActiveDraft(u?.is_active !== 0)
    } catch (e) {
      setError(e?.message || 'Failed to load faculty profile.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  async function handleUpdateAccount(e) {
    e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token || !isAdmin) return
    setSaving(true)
    setSaveMsg('')
    try {
      await apiAdminPatchUser(token, id, { role: roleDraft, isActive: isActiveDraft })
      setSaveMsg('Account settings updated successfully.')
      load()
    } catch (err) {
      setSaveMsg(err?.message || 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) return <div className="p-8 text-center text-[var(--text-muted)]">Administrators only.</div>
  if (loading) return (
    <div className="flex items-center justify-center p-16">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-[var(--accent)]" />
    </div>
  )

  const u = user || {}
  const summary = u.summary || {}

  return (
    <div className="module-page">
      <div className="w-full space-y-5">
        
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 admin-animate-reveal">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)] flex items-center gap-3">
              Faculty Profile
              <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/25 px-2.5 py-1 rounded-full">
                View Only
              </span>
            </h1>
            <p className="main-description mt-1 text-[var(--text-muted)]">
              Institutional record for <span className="text-[var(--text)] font-semibold">{getFacultyName(u)}</span>
            </p>
          </div>
          <Link to="/admin/faculty" className="btn btn-secondary">← Back to List</Link>
        </header>

        {error && (
          <div className="p-4 rounded-xl text-rose-400 bg-rose-500/10 border border-rose-500/20 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 admin-animate-reveal" style={{ animationDelay: '0.1s' }}>
          
          {/* Personal & Professional Info */}
          <Card>
            <SectionTitle>Professional Identity</SectionTitle>
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-20 h-20 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/20 flex items-center justify-center text-3xl font-bold text-[var(--accent)]">
                  {getFacultyName(u).charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[var(--text)]">{getFacultyName(u)}</h2>
                  <p className="text-[var(--accent)] font-medium">{formatFacultyRole(u.role)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Email Address</Label>
                  <ViewValue>{u.email}</ViewValue>
                </div>
                <div>
                  <Label>Department</Label>
                  <ViewValue>{summary.department || u.department}</ViewValue>
                </div>
                <div>
                  <Label>Specialization</Label>
                  <ViewValue>{summary.specialization || u.specialization}</ViewValue>
                </div>
                <div>
                  <Label>Account Status</Label>
                  <ViewValue>{u.is_active !== 0 ? 'Active' : 'Inactive'}</ViewValue>
                </div>
              </div>
            </div>
          </Card>

          {/* Account Management (Admin Edits This) */}
          <Card>
            <SectionTitle>User Role Management</SectionTitle>
            <p className="text-xs text-[var(--text-muted)] mb-6">Administrators can adjust system access and institutional roles here.</p>
            
            <form onSubmit={handleUpdateAccount} className="space-y-6">
              <div className="auth-field">
                <Label>System Role</Label>
                <div className="relative">
                  <select 
                    className="search-input w-full appearance-none pr-10"
                    value={roleDraft}
                    onChange={e => setRoleDraft(e.target.value)}
                  >
                    <option value="faculty">Faculty (Basic)</option>
                    <option value="faculty_professor">Professor</option>
                    <option value="dean">Dean</option>
                    <option value="department_chair">Department Chair</option>
                    <option value="secretary">Secretary</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] bg-[rgba(255,255,255,0.02)]">
                <input 
                  id="isActive" 
                  type="checkbox"
                  checked={isActiveDraft}
                  onChange={e => setIsActiveDraft(e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent)] cursor-pointer" 
                />
                <label htmlFor="isActive" className="text-sm text-[var(--text)] font-medium select-none cursor-pointer">
                  Account is currently Active
                </label>
              </div>

              {saveMsg && (
                <p className={`text-sm ${saveMsg.includes('successfully') ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {saveMsg}
                </p>
              )}

              <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                {saving ? 'Processing...' : 'Apply Account Changes'}
              </button>
            </form>
          </Card>

          {/* Personal Information (As requested) */}
          <Card>
            <SectionTitle>Personal Information</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <ViewValue>{u.personal_information?.first_name}</ViewValue>
              </div>
              <div>
                <Label>Middle Name</Label>
                <ViewValue>{u.personal_information?.middle_name}</ViewValue>
              </div>
              <div>
                <Label>Last Name</Label>
                <ViewValue>{u.personal_information?.last_name}</ViewValue>
              </div>
              <div>
                <Label>Phone Number</Label>
                <ViewValue>{u.personal_information?.phone || u.personal_information?.phone_number}</ViewValue>
              </div>
              <div>
                <Label>Date of Birth</Label>
                <ViewValue>{u.personal_information?.date_of_birth}</ViewValue>
              </div>
              <div>
                <Label>Gender</Label>
                <ViewValue>{u.personal_information?.gender}</ViewValue>
              </div>
            </div>
          </Card>

        </div>

        {/* Professional Summary Section */}
        <Card className="admin-animate-reveal" style={{ animationDelay: '0.2s' }}>
          <SectionTitle>Professional Summary</SectionTitle>
          <div className="space-y-4">
             <Label>Biography / Description</Label>
             <ViewValue multiline>{u.bio || 'No biography provided.'}</ViewValue>
          </div>
        </Card>

      </div>
    </div>
  )
}
