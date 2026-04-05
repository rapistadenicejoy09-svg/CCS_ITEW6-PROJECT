import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SuccessModal from '../components/SuccessModal'
import { apiAdminPatchUser, apiAdminStudents, apiLogin } from '../lib/api'

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    return user?.role || null
  } catch {
    return null
  }
}

function isUserActive(u) {
  return u?.is_active !== 0 && u?.is_active !== false
}

function formatStudentType(t) {
  if (t === 'irregular') return 'Irregular'
  return 'Regular'
}

function displayStudentId(s) {
  const sid = (s.student_id || '').trim()
  if (sid) return sid
  const legacy = (s.identifier || '').trim()
  if (legacy && !legacy.includes('@')) return legacy
  return '—'
}

function getAdminLoginIdentifier() {
  try {
    const raw = localStorage.getItem('authUser')
    const u = raw ? JSON.parse(raw) : null
    return (u?.identifier || '').trim() || null
  } catch {
    return null
  }
}

function IconEye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function IconFilter() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
  )
}

function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
  )
}

export default function AdminStudentList() {
  const location = useLocation()
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successModal, setSuccessModal] = useState({ open: false, message: '' })
  
  const [search, setSearch] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSkill, setFilterSkill] = useState('')
  const [filterAffiliation, setFilterAffiliation] = useState('')
  
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState('grid')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteTwoFACode, setDeleteTwoFACode] = useState('')
  const [deleteNeeds2FA, setDeleteNeeds2FA] = useState(false)
  const [deleteModalError, setDeleteModalError] = useState('')
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteRemoveCooldown, setDeleteRemoveCooldown] = useState(0)

  const isAdmin = getRole() === 'admin'

  useEffect(() => {
    if (!deleteTarget) {
      setDeleteRemoveCooldown(0)
      return
    }
    setDeleteRemoveCooldown(3)
    let remaining = 3
    const id = setInterval(() => {
      remaining -= 1
      setDeleteRemoveCooldown(Math.max(0, remaining))
      if (remaining <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [deleteTarget])

  const loadStudents = useCallback(async () => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setError('Missing auth token.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const query = {}
      if (filterSkill.trim()) query.skill = filterSkill.trim()
      if (filterAffiliation.trim()) query.affiliation = filterAffiliation.trim()
      const result = await apiAdminStudents(token, query)
      const rawStudents = Array.isArray(result?.students) ? result.students : []
      // Filter out soft-deleted students for UI parity with Delete Action
      setStudents(rawStudents.filter(isUserActive))
    } catch (err) {
      setError(err?.message || 'Failed to load students.')
    } finally {
      setLoading(false)
    }
  }, [filterSkill, filterAffiliation])

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    loadStudents()
  }, [isAdmin, loadStudents])

  useEffect(() => {
    if (!location.state?.studentCreated) return
    const id = location.state.createdStudentId
    setSuccessModal({
      open: true,
      message: id
        ? `Student account created successfully. Student ID: ${id}.`
        : 'Student account created successfully.',
    })
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state?.studentCreated, location.state?.createdStudentId, location.pathname, navigate])

  function closeDeleteModal() {
    setDeleteTarget(null)
    setDeletePassword('')
    setDeleteTwoFACode('')
    setDeleteNeeds2FA(false)
    setDeleteModalError('')
  }

  async function verifyPasswordAndDelete() {
    const student = deleteTarget
    if (!student || !isUserActive(student)) {
      closeDeleteModal()
      return
    }
    const adminId = getAdminLoginIdentifier()
    if (!adminId) {
      setDeleteModalError('Could not determine your account. Sign in again.')
      return
    }
    if (!deletePassword.trim()) {
      setDeleteModalError('Enter your password to confirm.')
      return
    }
    if (deleteNeeds2FA && deleteTwoFACode.trim().length !== 6) {
      setDeleteModalError('Enter your 6-digit authenticator or backup code.')
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setDeleteModalError('Missing auth token.')
      return
    }

    setDeleteModalError('')
    setDeleteSubmitting(true)
    try {
      try {
        await apiLogin({
          identifier: adminId,
          password: deletePassword,
          twoFACode: deleteNeeds2FA ? deleteTwoFACode.trim() : undefined,
        })
      } catch (loginErr) {
        const msg = loginErr?.data?.error || loginErr?.message || ''
        if (msg === 'Two-factor required' && !deleteNeeds2FA) {
          setDeleteNeeds2FA(true)
          setDeleteModalError('Two-factor authentication is enabled. Enter your 6-digit code from your authenticator app or your backup code.')
          return
        }
        setDeleteModalError(
          loginErr?.message || 'Password verification failed. Check your credentials and try again.',
        )
        return
      }

      await apiAdminPatchUser(token, student.id, { isActive: false })
      closeDeleteModal()
      await loadStudents()
    } catch (err) {
      setError(err?.message || 'Failed to delete student.')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  const sectionOptions = useMemo(() => {
    const set = new Set()
    for (const s of students) {
      const sec = (s.class_section || '').trim()
      if (sec) set.add(sec)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [students])

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => {
      if (q) {
        const sid = String(displayStudentId(s)).toLowerCase()
        const mail = String(s.email || '').toLowerCase()
        const legacyId = String(s.identifier || '').toLowerCase()
        const fullName = String(s.full_name || '').toLowerCase()
        if (!sid.includes(q) && !mail.includes(q) && !legacyId.includes(q) && !fullName.includes(q)) {
          return false
        }
      }
      if (filterSection === '__none__') {
        if ((s.class_section || '').trim()) return false
      } else if (filterSection) {
        if ((s.class_section || '').trim() !== filterSection) return false
      }
      if (filterType === 'regular' || filterType === 'irregular') {
        const t = (s.student_type || 'regular').toLowerCase()
        if (t !== filterType) return false
      }
      return true
    })
  }, [students, search, filterSection, filterType])

  const hasActiveFilters = Boolean(
    search.trim() || filterSection || filterType || filterSkill.trim() || filterAffiliation.trim()
  )

  if (!isAdmin) {
    return <div className="p-8 text-center text-[var(--text-muted)]">Administrators only.</div>
  }

  return (
    <div className="module-page">
      <div className="w-full space-y-6">
        
        {/* Header Section */}
        <header className="module-header flex flex-col md:flex-row justify-between items-start md:items-center admin-student-list-header-enter">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">
              Student List
            </h1>
            <p className="main-description text-[var(--text-muted)] mt-1">
              Manage profiles, filter by dynamic skills, and oversee academic records.
            </p>
          </div>
          <Link
            to="/admin/create-student"
            className="mt-4 md:mt-0 font-medium transition-all duration-300 text-sm px-6 py-2.5 rounded-full hover:shadow-lg hover:scale-[1.03] active:scale-[0.98]"
            style={{ background: 'var(--accent)', color: 'white', border: '1px solid var(--accent-soft)' }}
          >
            + Create Student Profile
          </Link>
        </header>

        {error && (
          <div
            className="p-4 rounded-xl text-rose-600 bg-rose-50 border border-rose-200 admin-animate-reveal"
            style={{ animationDelay: '0.06s' }}
          >
            {error}
          </div>
        )}

        {/* Filters and Search Bar Section */}
        <section className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-5 md:p-6 shadow-sm admin-student-list-toolbar-enter">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            
            <div className="flex-1 w-full relative">
              <input 
                type="text"
                placeholder="Search by name, ID, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input w-full"
              />
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              {/* Filter Display Toggle */}
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`btn flex items-center gap-2 ${showFilters || hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
              >
                <IconFilter /> Filters 
                {(filterSection || filterType || filterSkill || filterAffiliation) && (
                  <span className={`w-1.5 h-1.5 rounded-full ${showFilters || hasActiveFilters ? 'bg-[#1a0d05]' : 'bg-[var(--accent)]'}`} />
                )}
              </button>
              
              {/* View Toggle */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`btn btn-compact flex items-center justify-center !p-1.5 ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                  title="List View"
                >
                  <IconList />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`btn btn-compact flex items-center justify-center !p-1.5 ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                  title="Grid View"
                >
                  <IconGrid />
                </button>
              </div>
            </div>

          </div>

          {showFilters && (
            <div className="mt-5 md:mt-6 pt-5 md:pt-6 border-t border-[var(--border-color)] animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold ml-1">Section</label>
                  <select
                    className="search-input appearance-none w-full"
                    value={filterSection}
                    onChange={(e) => setFilterSection(e.target.value)}
                  >
                    <option value="">All sections</option>
                    <option value="__none__">No section</option>
                    {sectionOptions.map((sec) => (
                      <option key={sec} value={sec}>{sec}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold ml-1">Type</label>
                  <select
                    className="search-input appearance-none w-full"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="">All types</option>
                    <option value="regular">Regular</option>
                    <option value="irregular">Irregular</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold ml-1">Skill</label>
                  <input
                    type="text"
                    placeholder="e.g. Basketball, Programming"
                    value={filterSkill}
                    onChange={(e) => setFilterSkill(e.target.value)}
                    className="search-input w-full"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold ml-1">Affiliation</label>
                  <input
                    type="text"
                    placeholder="e.g. Debate Club"
                    value={filterAffiliation}
                    onChange={(e) => setFilterAffiliation(e.target.value)}
                    className="search-input w-full"
                  />
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={() => {
                      setSearch(''); setFilterSection(''); setFilterType(''); setFilterSkill(''); setFilterAffiliation('');
                    }}
                    className="px-5 py-2 rounded-full border border-[var(--border-color)] bg-transparent hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text)] text-sm font-medium transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Results */}
        <section className="space-y-4 admin-student-list-section-enter">
          <h2 className="text-xl font-bold px-1 flex items-center gap-2 text-[var(--text)]">
            <span className="w-6 h-[2px] bg-[var(--accent)]"></span>
            Profiles 
            {filteredStudents.length > 0 && (
              <span className="px-2 py-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-full text-xs ml-2">
                {filteredStudents.length}
              </span>
            )}
          </h2>

          {loading ? (
            <div className="flex justify-center p-12 text-[var(--accent)] admin-animate-reveal">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current motion-safe:transition-opacity" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center p-12 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] admin-animate-reveal transition-shadow duration-300 hover:shadow-md">
              <p className="text-[var(--text-muted)] text-sm">No student profiles match the current query.</p>
            </div>
          ) : (
            <>
              {/* GRID VIEW */}
              {viewMode === 'grid' && (
                <div className="admin-student-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredStudents.map((student, idx) => {
                    const active = isUserActive(student)
                    const busy = deleteSubmitting && deleteTarget?.id === student.id
                    return (
                      <div
                        key={student.id}
                        className="admin-student-card group flex flex-col bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent)] rounded-[var(--radius-md)] overflow-hidden admin-student-card-animate"
                        style={{ animationDelay: `${Math.min(idx, 14) * 0.055}s` }}
                      >
                        {/* Card Header */}
                        <div className="p-5 pb-3 border-b border-[var(--border-color)] flex justify-between items-start">
                          <div>
                            <h3 className="text-base font-bold text-[var(--text)] mb-0.5 leading-tight">{student.full_name || 'Unnamed Student'}</h3>
                            <p className="text-[var(--accent)] font-mono text-xs">{displayStudentId(student)}</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${active ? 'tag-active' : 'tag-inactive'}`}>
                            {active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        {/* Card Body */}
                        <div className="p-5 flex-1 flex flex-col gap-5 text-sm">
                          <div className="flex flex-col gap-4">
                            {/* Academic Details Snippet */}
                            <div className="flex flex-col">
                              <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1 tracking-wider">Academic Info</p>
                              <p className="text-[var(--text)] text-sm font-bold leading-snug">{student.academic_info?.program || '—'}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-muted)]">
                                <span>{student.academic_info?.year_level || '—'}</span>
                                {student.class_section && (
                                  <>
                                    <span className="w-1 h-1 rounded-full bg-[var(--border-color)]"></span>
                                    <span className="font-semibold text-[var(--accent)]">Sec {student.class_section}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Enrollment Status */}
                            <div>
                               <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1 tracking-wider">Enrollment</p>
                               <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider inline-block ${
                                 student.academic_info?.enrollment_status === 'Enrolled'
                                   ? 'tag-enrolled'
                                   : student.academic_info?.enrollment_status === 'Not Enrolled'
                                   ? 'tag-not-enrolled'
                                   : 'tag-unknown'
                               }`}>
                                 {student.academic_info?.enrollment_status || 'Unknown'}
                               </span>
                            </div>

                            {/* Affiliations Snippet */}
                            <div>
                              <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1 tracking-wider">Top Affiliation</p>
                              {student.affiliations && student.affiliations.length > 0 ? (
                                <div className="flex flex-col">
                                  <p className="text-[var(--text)] text-xs font-semibold truncate leading-tight">
                                    {student.affiliations[0].organization || '—'}
                                  </p>
                                  <p className="text-[10px] text-[var(--text-muted)] truncate">
                                    {student.affiliations[0].position || student.affiliations[0].role || 'Member'}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-[var(--text-muted)] text-[11px] italic">No affiliations listed</p>
                              )}
                            </div>
                          </div>

                          {/* Skills Tags */}
                          {student.skills && Array.isArray(student.skills) && student.skills.length > 0 && (
                            <div className="mt-auto pt-4 border-t border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)]">
                              <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-2 tracking-wider">Skills</p>
                              <div className="flex flex-wrap gap-1.5">
                                {student.skills.slice(0, 3).map((sk, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-[var(--accent-soft)] border border-[rgba(229,118,47,0.15)] rounded text-[10px] text-[var(--accent)] font-medium">
                                    {sk}
                                  </span>
                                ))}
                                {student.skills.length > 3 && (
                                   <span className="px-2 py-0.5 rounded text-[10px] text-[var(--text-muted)] font-medium">+{student.skills.length - 3}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="p-3 bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] flex justify-end gap-2 border-t border-[var(--border-color)]">
                          <button
                            type="button"
                            className="flex items-center justify-center px-3 py-1.5 bg-rose-50/50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded-lg border border-rose-200 hover:border-rose-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Delete Student"
                            disabled={!active || busy}
                            onClick={() => {
                              setDeleteTarget(student)
                              setDeletePassword('')
                              setDeleteTwoFACode('')
                              setDeleteNeeds2FA(false)
                              setDeleteModalError('')
                            }}
                          >
                             <IconTrash />
                          </button>
                          <Link
                            to={`/admin/student/${student.id}`}
                            className="px-4 py-1.5 bg-transparent hover:bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-color)] hover:border-[var(--accent)] rounded text-xs font-semibold transition-all duration-300 flex items-center gap-1.5 group-hover:translate-x-0.5"
                          >
                            <IconEye /> View Profile
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* LIST VIEW */}
              {viewMode === 'list' && (
                <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm transition-shadow duration-300 hover:shadow-md">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] border-b border-[var(--border-color)] text-[var(--text-muted)] text-[10px] uppercase tracking-widest font-bold">
                        <tr>
                          <th className="px-6 py-4">Student Name &amp; ID</th>
                          <th className="px-6 py-4">Academic Details</th>
                          <th className="px-6 py-4">Skills</th>
                          <th className="px-6 py-4">Affiliations</th>
                          <th className="px-6 py-4 text-center">Enrollment</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)]">
                        {filteredStudents.map((student, idx) => {
                          const active = isUserActive(student)
                          const busy = deleteSubmitting && deleteTarget?.id === student.id
                          return (
                            <tr
                              key={student.id}
                              className="admin-student-list-row admin-student-table-row-enter hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.01)]"
                              style={{ '--row-enter-delay': `${Math.min(idx, 16) * 0.035}s` }}
                            >
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-bold text-[var(--text)] text-sm">{student.full_name || 'Unnamed Student'}</span>
                                  <span className="text-xs text-[var(--accent)] font-mono mt-0.5">{displayStudentId(student)}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <span className="text-[var(--text)] text-xs font-bold">{student.academic_info?.program || '—'}</span>
                                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                    <span>{student.academic_info?.year_level || '—'}</span>
                                    {student.class_section && (
                                      <>
                                        <span className="w-1 h-1 rounded-full bg-[var(--border-color)]"></span>
                                        <span className="font-semibold text-[var(--accent)]">Section {student.class_section}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                  {student.skills && student.skills.length > 0 ? (
                                    student.skills.slice(0, 2).map((sk, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-[4px] text-[10px] font-medium border border-[rgba(229,118,47,0.15)]">
                                        {sk}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[var(--text-muted)] text-[10px] italic">No skills</span>
                                  )}
                                  {student.skills?.length > 2 && (
                                    <span className="text-[var(--text-muted)] text-[10px]">+{student.skills.length - 2}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1 max-w-[180px]">
                                  {student.affiliations && student.affiliations.length > 0 ? (
                                    student.affiliations.slice(0, 1).map((af, i) => (
                                      <div key={i} className="flex flex-col">
                                        <span className="text-[var(--text)] text-[11px] font-semibold truncate">
                                          {af.organization || '—'}
                                        </span>
                                        <span className="text-[10px] text-[var(--text-muted)] truncate">
                                          {af.position || af.role || 'Member'}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <span className="text-[var(--text-muted)] text-[10px] italic">No affiliations</span>
                                  )}
                                  {student.affiliations?.length > 1 && (
                                    <span className="text-[var(--accent)] text-[10px] font-medium">
                                      +{student.affiliations.length - 1} more
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider inline-block ${
                                  student.academic_info?.enrollment_status === 'Enrolled'
                                    ? 'tag-enrolled'
                                    : student.academic_info?.enrollment_status === 'Not Enrolled'
                                    ? 'tag-not-enrolled'
                                    : 'tag-unknown'
                                }`}>
                                  {student.academic_info?.enrollment_status || 'Unknown'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                 <div className="flex items-center justify-end gap-3">
                                   <button
                                      type="button"
                                      className="flex items-center justify-center px-4 py-2 bg-rose-50/50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded-lg border border-rose-200 hover:border-rose-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                      title="Delete Student"
                                      disabled={!active || busy}
                                      onClick={() => {
                                        setDeleteTarget(student)
                                        setDeletePassword('')
                                        setDeleteTwoFACode('')
                                        setDeleteNeeds2FA(false)
                                        setDeleteModalError('')
                                      }}
                                    >
                                       <IconTrash />
                                    </button>
                                    <Link
                                      to={`/admin/student/${student.id}`}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-soft)] hover:bg-[var(--accent)] text-[var(--accent)] hover:text-white rounded border border-transparent hover:border-[var(--accent)] transition-colors font-medium text-xs text-center"
                                      title="View Profile"
                                    >
                                      <IconEye /> View
                                    </Link>
                                 </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <SuccessModal
        open={successModal.open}
        title="Student created"
        message={successModal.message}
        onClose={() => setSuccessModal({ open: false, message: '' })}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            aria-label="Close dialog"
            onClick={() => !deleteSubmitting && closeDeleteModal()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-student-title"
            className="admin-delete-modal-content relative bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-7 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col">
              <div className="flex flex-col items-center text-center mb-4">
                <div className="w-14 h-14 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 ring-4 ring-rose-500/10">
                  <IconTrash />
                </div>
                <h2 id="delete-student-title" className="text-xl font-bold text-[var(--text)] mb-2">
                  Remove student profile?
                </h2>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  This deactivates{' '}
                  <span className="font-semibold text-[var(--text)]">
                    {deleteTarget.full_name || displayStudentId(deleteTarget)}
                  </span>
                  . They will no longer be able to sign in. Enter your administrator password to confirm.
                </p>
              </div>

              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                Your password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="search-input w-full mb-4"
                placeholder="Administrator password"
                disabled={deleteSubmitting}
              />

              {deleteNeeds2FA && (
                <>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Two-factor code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={deleteTwoFACode}
                    onChange={(e) => setDeleteTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="search-input w-full mb-4 font-mono tracking-widest"
                    placeholder="000000"
                    disabled={deleteSubmitting}
                  />
                </>
              )}

              {deleteModalError && (
                <p className="text-sm text-rose-600 dark:text-rose-400 mb-4 text-center">{deleteModalError}</p>
              )}

              <p className="text-[11px] text-center text-[var(--text-muted)] mb-3">
                {deleteRemoveCooldown > 0
                  ? `The remove action unlocks in ${deleteRemoveCooldown}s so you can review the details above.`
                  : 'You can confirm removal when your password (and 2FA, if required) are entered.'}
              </p>

              <div className="flex w-full gap-3 mt-2">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deleteSubmitting}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] rounded-xl transition-all duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={verifyPasswordAndDelete}
                  disabled={deleteSubmitting || deleteRemoveCooldown > 0}
                  className="flex-1 px-4 py-3 text-sm font-semibold bg-rose-600 text-white rounded-xl hover:bg-rose-700 shadow-lg shadow-rose-600/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-rose-600"
                >
                  {deleteSubmitting
                    ? 'Working…'
                    : deleteRemoveCooldown > 0
                      ? `Remove student (${deleteRemoveCooldown}s)`
                      : 'Remove student'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
