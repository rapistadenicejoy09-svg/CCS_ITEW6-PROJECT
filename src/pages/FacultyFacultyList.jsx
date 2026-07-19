import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFacultyDirectory } from '../lib/api'

function getFacultyName(f) {
  return (
    String(f.displayName || f.fullName || f.full_name || '').trim() ||
    String(f.personal_information?.fullName || f.personal_information?.full_name || '').trim() ||
    [f.personal_information?.first_name, f.personal_information?.last_name].filter(Boolean).join(' ') ||
    'Unnamed Faculty'
  )
}

function getFacultyDept(f) {
  return (f.summary?.department || f.department || 'General').trim()
}

function getFacultySpec(f) {
  return (f.summary?.specialization || f.specialization || '').trim()
}

function formatFacultyRole(role) {
  if (role === 'dean') return 'College Dean'
  if (role === 'department_chair') return 'Department Chair'
  if (role === 'secretary') return 'College Secretary'
  if (role === 'faculty_professor') return 'Professor'
  if (role === 'faculty') return 'Faculty (Basic)'
  return 'Faculty'
}

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    return user?.role || null
  } catch {
    return null
  }
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

export default function FacultyFacultyList() {
  const role = getRole()
  const isFacultyRole = ['faculty', 'dean', 'department_chair', 'secretary', 'faculty_professor', 'admin'].includes(role)

  const [faculty, setFaculty] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('active')
  const [sortOrder, setSortOrder] = useState('asc')

  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState('grid')

  const [selectedFaculty, setSelectedFaculty] = useState(null)

  const loadFaculty = useCallback(async () => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setError('Missing auth token.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await apiFacultyDirectory(token)
      setFaculty(Array.isArray(res?.faculty) ? res.faculty : [])
    } catch (e) {
      setError(e?.message || 'Failed to load faculty list.')
      setFaculty([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isFacultyRole) {
      setLoading(false)
      return
    }
    loadFaculty()
  }, [isFacultyRole, loadFaculty])

  const deptOptions = useMemo(() => {
    const set = new Set()
    for (const f of faculty) {
      const d = (f.summary?.department || f.department || '').trim()
      if (d) set.add(d)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [faculty])

  const itemsPerPage = viewMode === 'grid' ? 9 : 10
  const [currentPage, setCurrentPage] = useState(1)

  const filteredFaculty = useMemo(() => {
    const q = search.trim().toLowerCase()

    const filtered = faculty.filter((f) => {
      if (q) {
        const mail = String(f.email || '').toLowerCase()
        const fullName = getFacultyName(f).toLowerCase()
        if (!mail.includes(q) && !fullName.includes(q)) return false
      }
      if (filterRole && f.role !== filterRole) return false
      if (filterDept && getFacultyDept(f) !== filterDept) return false

      const isActive = f.is_active !== false && f.is_active !== 0
      if (filterStatus === 'active' && !isActive) return false
      if (filterStatus === 'inactive' && isActive) return false

      return true
    })

    return filtered.sort((a, b) => {
      const nameA = getFacultyName(a).toLowerCase()
      const nameB = getFacultyName(b).toLowerCase()
      if (sortOrder === 'asc') return nameA.localeCompare(nameB)
      return nameB.localeCompare(nameA)
    })
  }, [faculty, search, filterRole, filterDept, filterStatus, sortOrder])

  // Reset page when filtering/sorting or changing view mode
  useEffect(() => {
    setCurrentPage(1)
  }, [search, filterRole, filterDept, filterStatus, sortOrder, viewMode])

  const totalPages = Math.ceil(filteredFaculty.length / itemsPerPage)
  const paginatedFaculty = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredFaculty.slice(start, start + itemsPerPage)
  }, [filteredFaculty, currentPage, itemsPerPage])

  const hasActiveFilters = Boolean(search.trim() || filterRole || filterDept || filterStatus !== 'active' || sortOrder !== 'asc')

  if (!isFacultyRole) {
    return <div className="p-8 text-center text-[var(--text-muted)]">Not available for your role.</div>
  }

  return (
    <div className="module-page">
      <div className="w-full space-y-6">
        <header className="module-header flex flex-col md:flex-row justify-between items-start md:items-center admin-student-list-header-enter">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">Faculty List</h1>
            <p className="main-description text-[var(--text-muted)] mt-1">
              View-only directory for collaboration across professors and academic staff.
            </p>
          </div>
        </header>

        {error && (
          <div
            className="p-4 rounded-xl text-rose-600 bg-rose-50 border border-rose-200 admin-animate-reveal"
            style={{ animationDelay: '0.06s' }}
          >
            {error}
          </div>
        )}

        <section className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-5 md:p-6 shadow-sm admin-student-list-toolbar-enter">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full relative">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input w-full"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`btn flex items-center gap-2 ${showFilters || hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
              >
                <IconFilter /> Filters
                {hasActiveFilters && (
                  <span className={`w-1.5 h-1.5 rounded-full ${showFilters || hasActiveFilters ? 'bg-[#1a0d05]' : 'bg-[var(--accent)]'}`} />
                )}
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`btn btn-compact flex items-center justify-center !p-1.5 ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                  title="List View"
                >
                  <IconList />
                </button>
                <button
                  type="button"
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
            <div className="mt-5 pt-5 border-t border-[var(--border-color)] animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold ml-1">Sort By</label>
                  <select
                    className="search-input appearance-none w-full"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                  >
                    <option value="asc">Name (A-Z)</option>
                    <option value="desc">Name (Z-A)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold ml-1">Status</label>
                  <select
                    className="search-input appearance-none w-full"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold ml-1">System Role</label>
                  <select
                    className="search-input appearance-none w-full"
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                  >
                    <option value="">All Roles</option>
                    <option value="dean">Dean</option>
                    <option value="department_chair">Department Chair</option>
                    <option value="secretary">Secretary</option>
                    <option value="faculty_professor">Professor</option>
                    <option value="faculty">Faculty (Basic)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold ml-1">Department</label>
                  <select
                    className="search-input appearance-none w-full"
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                  >
                    <option value="">All Departments</option>
                    {deptOptions.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setFilterRole(''); setFilterDept(''); setFilterStatus('active'); setSortOrder('asc'); }}
                    className="px-5 py-2 rounded-full border border-[var(--border-color)] bg-transparent hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text)] text-sm font-medium transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-4 admin-student-list-section-enter">
          <h2 className="text-xl font-bold px-1 flex items-center gap-2 text-[var(--text)]">
            <span className="w-6 h-[2px] bg-[var(--accent)]"></span>
            Faculty Members
            {filteredFaculty.length > 0 && (
              <span className="px-2 py-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-full text-xs ml-2">
                {filteredFaculty.length}
              </span>
            )}
          </h2>

          {loading ? (
            <div className="flex justify-center p-12 text-[var(--accent)]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current" />
            </div>
          ) : filteredFaculty.length === 0 ? (
            <div className="text-center p-12 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)]">
              <p className="text-[var(--text-muted)] text-sm">No faculty members found.</p>
            </div>
          ) : (
            <>
              {viewMode === 'grid' && (
                <div className="admin-student-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {paginatedFaculty.map((f, idx) => {
                    const isActive = f.is_active !== false && f.is_active !== 0;
                    return (
                      <div
                        key={f.id}
                        className="admin-student-card group flex flex-col bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent)] rounded-[var(--radius-md)] overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all admin-student-card-animate"
                        style={{ animationDelay: `${Math.min(idx, 14) * 0.055}s` }}
                        onClick={() => setSelectedFaculty(f)}
                      >
                        <div className="p-5 pb-3 border-b border-[var(--border-color)] flex justify-between items-start">
                          <div>
                            <h3 className="text-base font-bold text-[var(--text)] mb-0.5 leading-tight">{getFacultyName(f)}</h3>
                            <p className="text-[var(--accent)] font-mono text-xs">{f.email || '—'}</p>
                          </div>
                          {f.is_legacy ? (
                            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Schedule Only
                            </span>
                          ) : isActive ? (
                            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              Active
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                              Inactive
                            </span>
                          )}
                        </div>

                        <div className="p-5 flex-1 flex flex-col gap-4 text-sm">
                          <div className="flex justify-between gap-4">
                            <div>
                              <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1 tracking-wider">Academic Role</p>
                              <p className="text-[var(--text)] text-sm font-bold">{formatFacultyRole(f.role)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1 tracking-wider">Teaching Units</p>
                              <p className="text-[var(--text)] text-sm font-bold">
                                {f.teaching_loads?.reduce((acc, l) => acc + Number(l.subject?.credits || 0), 0) || 0} Units
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1 tracking-wider">Department &amp; Specialization</p>
                            <p className="text-[var(--text)] text-sm font-semibold">{getFacultyDept(f)}</p>
                            {getFacultySpec(f) ? (
                              <p className="text-[var(--accent)] text-[11px] mt-0.5 italic">{getFacultySpec(f)}</p>
                            ) : null}
                          </div>

                          <div className="pt-2">
                            <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1 tracking-wider">Assigned Subjects</p>
                            <div className="flex gap-2 flex-wrap text-xs font-medium">
                              {f.teaching_loads && f.teaching_loads.length > 0 ? (
                                f.teaching_loads.map(l => (
                                  <span key={l.id} className="px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] border border-[rgba(229,118,47,0.15)]">
                                    {l.subject?.code || 'Subj'}
                                  </span>
                                ))
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-[var(--background)] text-[var(--text-muted)] border border-[var(--border-color)]">No assignment</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="p-3 bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] flex justify-end gap-2 border-t border-[var(--border-color)]">
                          <span className="text-[11px] text-[var(--accent)] font-semibold px-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            View Full Profile
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {viewMode === 'list' && (
                <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm transition-shadow duration-300 hover:shadow-md">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] border-b border-[var(--border-color)] text-[var(--text-muted)] text-[10px] uppercase tracking-widest font-bold">
                        <tr>
                          <th className="px-6 py-4">Name &amp; Email</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">System Role</th>
                          <th className="px-6 py-4">Department</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)]">
                        {paginatedFaculty.map((f, idx) => {
                          const isActive = f.is_active !== false && f.is_active !== 0;
                          return (
                            <tr
                              key={f.id}
                              className="admin-student-list-row admin-student-table-row-enter hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.01)] cursor-pointer"
                              style={{ '--row-enter-delay': `${Math.min(idx, 16) * 0.035}s` }}
                              onClick={() => setSelectedFaculty(f)}
                            >
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-bold text-[var(--text)]">{getFacultyName(f)}</span>
                                  <span className="text-xs text-[var(--accent)] font-mono">{f.email || '—'}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {f.is_legacy ? (
                                  <span className="text-amber-600 text-xs font-bold uppercase">Schedule Only</span>
                                ) : isActive ? (
                                  <span className="text-emerald-600 text-xs font-bold uppercase">Active</span>
                                ) : (
                                  <span className="text-rose-600 text-xs font-bold uppercase">Inactive</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-[var(--text)] font-semibold">{formatFacultyRole(f.role)}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-[var(--text)]">{getFacultyDept(f)}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button className="text-xs font-semibold text-[var(--accent)] hover:underline">View Profile</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8 pb-4 admin-animate-reveal">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage(p => Math.max(1, p - 1))
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    disabled={currentPage === 1}
                    className="btn btn-secondary !rounded-full px-4 py-2 disabled:opacity-50 transition-all hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-1.5 mx-4">
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setCurrentPage(i + 1)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        className={`w-9 h-9 flex items-center justify-center rounded-full text-xs font-bold transition-all ${currentPage === i + 1
                            ? 'bg-[var(--accent)] text-white shadow-lg scale-110'
                            : 'bg-[var(--card-bg)] text-[var(--text-muted)] border border-[var(--border-color)] hover:border-[var(--accent)]'
                          }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage(p => Math.min(totalPages, p + 1))
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    disabled={currentPage === totalPages}
                    className="btn btn-secondary !rounded-full px-4 py-2 disabled:opacity-50 transition-all hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Faculty Modal */}
      {selectedFaculty && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 animate-fade-in" onClick={() => setSelectedFaculty(null)}>
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-extrabold text-[var(--text)]">{getFacultyName(selectedFaculty)}</h2>
                <p className="text-[var(--text-muted)] text-sm font-medium mt-1">{selectedFaculty.email || 'No email provided'}</p>
              </div>
              <button onClick={() => setSelectedFaculty(null)} className="p-2 -mr-2 text-[var(--text-muted)] hover:text-[var(--text)] rounded-full hover:bg-[var(--border-color)] transition-all">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">Role</label>
                  <p className="text-[var(--text)] font-semibold text-sm">{formatFacultyRole(selectedFaculty.role)}</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">Status</label>
                  <p className="text-[var(--text)] font-semibold text-sm">
                    {selectedFaculty.is_active !== false && selectedFaculty.is_active !== 0 ? 'Active' : 'Inactive'}
                  </p>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">Department</label>
                  <p className="text-[var(--text)] font-semibold text-sm">{getFacultyDept(selectedFaculty)}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">Specialization</label>
                  <p className="text-[var(--text)] font-semibold text-sm">{getFacultySpec(selectedFaculty) || '—'}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">Bio</label>
                  <p className="text-[var(--text-muted)] italic text-sm">{selectedFaculty.bio || 'No biography provided.'}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-[rgba(0,0,0,0.02)] border-t border-[var(--border-color)] flex justify-end">
              <button onClick={() => setSelectedFaculty(null)} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
