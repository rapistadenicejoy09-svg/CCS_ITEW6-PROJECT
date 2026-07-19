import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import { getAllowedModules } from './lib/security'
import { apiMe } from './lib/api'

function studentHeaderPrimaryName(parsed) {
  const fn = String(parsed?.firstName || '').trim()
  const mn = String(parsed?.middleName || '').trim()
  const ln = String(parsed?.lastName || '').trim()
  const mi = mn ? `${mn.charAt(0).toUpperCase()}.` : ''
  const built = [fn, mi, ln].filter(Boolean).join(' ')
  if (built) return built
  return (
    String(parsed?.displayName || parsed?.fullName || parsed?.studentId || parsed?.identifier || '').trim() || 'Student'
  )
}

/** First name, middle initial, last name — used in header for faculty and admin. */
function staffHeaderPrimaryName(parsed, whenEmptyLabel) {
  const fn = String(parsed?.firstName || parsed?.first_name || parsed?.personal_information?.first_name || '').trim()
  const mn = String(parsed?.middleName || parsed?.middle_name || parsed?.personal_information?.middle_name || '').trim()
  const ln = String(parsed?.lastName || parsed?.last_name || parsed?.personal_information?.last_name || '').trim()
  const mi = mn ? `${mn.charAt(0).toUpperCase()}.` : ''
  const built = [fn, mi, ln].filter(Boolean).join(' ')
  if (built) return built

  const full = String(parsed?.displayName || parsed?.fullName || parsed?.full_name || parsed?.identifier || '').trim()
  if (!full) return whenEmptyLabel
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0]
    const last = parts[parts.length - 1]
    const middleParts = parts.slice(1, -1).join(' ')
    const middleInitial = middleParts ? `${middleParts.charAt(0).toUpperCase()}.` : ''
    return [first, middleInitial, last].filter(Boolean).join(' ')
  }
  return full
}

function facultyHeaderPrimaryName(parsed) {
  return staffHeaderPrimaryName(parsed, 'Staff')
}

function adminHeaderPrimaryName(parsed) {
  return staffHeaderPrimaryName(parsed, 'Administrator')
}

const ALL_MODULES = [
  { id: 'student-profile', code: '1.1', title: 'Student List', path: '/student-profile', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 1-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> },
  { id: 'faculty-profile', code: '1.2', title: 'Faculty List', path: '/admin/faculty', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> },
  { id: 'faculty-directory', code: '1.2', title: 'Faculty List', path: '/faculty/faculty-list', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> },
  { id: 'teaching-load', code: '1.2.1', title: 'Teaching Load', path: '/faculty/teaching-load', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg> },
  { id: 'faculty-schedule', code: '1.2.2', title: 'My Assigned Schedule', path: '/faculty/schedule', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> },
  { id: 'faculty-evals', code: '1.2.4', title: 'Evaluations', path: '/faculty/evaluations', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> },
  { id: 'faculty-hours', code: '1.2.5', title: 'Office Hours', path: '/faculty/office-hours', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> },
  { id: 'admin-subjects', code: '1.2.6', title: 'Master Subjects', path: '/faculty/subjects', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a4 4 0 0 1 4-4h6z"></path></svg> },
  { id: 'events', code: '1.3', title: 'Events', path: '/events', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> },
  { id: 'scheduling', code: '1.4', title: 'Scheduling', path: '/scheduling', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> },
  { id: 'college-research', code: '1.5', title: 'College Research', path: '/college-research', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> },
  { id: 'instructions', code: '1.6', title: 'Instructions', path: '/instructions', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a4 4 0 0 1 4-4h6z"></path></svg> },
  { id: 'admin-admins-list', code: '1.8', title: 'Admin List', path: '/admin/admins', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> },
  { id: 'activity-log', code: '1.7', title: 'Activity Log', path: '/activity-log', icon: <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> },
]

export default function Layout() {
  const [modules, setModules] = useState([])
  const [theme, setTheme] = useState('light')
  const [primaryLabel, setPrimaryLabel] = useState('')
  const [secondaryLabel, setSecondaryLabel] = useState('')
  const [headerRoleLabel, setHeaderRoleLabel] = useState('')
  const [profilePath, setProfilePath] = useState(null)
  const [headerProfileImageUrl, setHeaderProfileImageUrl] = useState(null)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const navigate = useNavigate()

  const [isFacultyExpanded, setIsFacultyExpanded] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('authUser'))
      return ['faculty', 'faculty_professor', 'dean', 'department_chair', 'secretary'].includes(u?.role)
    } catch {
      return false
    }
  })

  const refreshHeaderFromStorage = useCallback(() => {
    let role = null
    let path = null
    try {
      const raw = localStorage.getItem('authUser')
      const parsed = raw ? JSON.parse(raw) : null
      role = parsed?.role || null
      setHeaderProfileImageUrl(parsed?.profileImageUrl || null)
      setMustChangePassword(
        parsed?.role === 'student' && (parsed?.mustChangePassword === true || parsed?.mustChangePassword === 1),
      )
      if (parsed?.role === 'admin') {
        setPrimaryLabel(adminHeaderPrimaryName(parsed))
        setSecondaryLabel('')
        path = '/admin-profile'
        setHeaderRoleLabel('Admin')
      } else if (parsed?.role === 'student') {
        setPrimaryLabel(studentHeaderPrimaryName(parsed))
        setSecondaryLabel(String(parsed.studentId || parsed.identifier || '').trim())
        path = '/student-profile'
        setHeaderRoleLabel('Student')
      } else if (['faculty', 'dean', 'department_chair', 'secretary', 'faculty_professor'].includes(parsed?.role)) {
        setPrimaryLabel(facultyHeaderPrimaryName(parsed))
        setSecondaryLabel('')
        path = '/faculty-my-profile'

        let label = 'Faculty'
        if (parsed.role === 'dean') label = 'Dean'
        else if (parsed.role === 'department_chair') label = 'Chair'
        else if (parsed.role === 'secretary') label = 'Secretary'
        else if (parsed.role === 'faculty_professor') label = 'Professor'

        setHeaderRoleLabel(label)
      } else {
        setPrimaryLabel('')
        setSecondaryLabel('')
        setHeaderRoleLabel('')
        setHeaderProfileImageUrl(null)
        setMustChangePassword(false)
        path = null
      }
    } catch {
      setPrimaryLabel('')
      setSecondaryLabel('')
      setHeaderRoleLabel('')
      setHeaderProfileImageUrl(null)
      setMustChangePassword(false)
      path = null
    }
    setProfilePath(path)
    const roleAwareModules = ALL_MODULES.map((m) => {
      if (m.id === 'student-profile') {
        return { ...m, title: role === 'admin' ? 'Student List' : 'Student Profile' }
      }
      return m
    })
    const allowed = getAllowedModules(roleAwareModules)

    const studentHidden = new Set([
      'student-profile',
      'faculty-profile',
      'faculty-directory',
      'teaching-load',
      'faculty-schedule',
      'faculty-evals',
      'faculty-hours',
      'admin-subjects',
    ])

    if (role === 'student') {
      setModules(allowed.filter((m) => !studentHidden.has(m.id)))
    } else if (role === 'admin') {
      // Avoid duplicate "Faculty List" entries on admin sidebar:
      // admins use the management list at /admin/faculty, not the view-only faculty directory.
      setModules(allowed.filter((m) => m.id !== 'faculty-directory'))
    } else {
      setModules(allowed)
    }
  }, [])

  useEffect(() => {
    document.body.dataset.theme = theme
    refreshHeaderFromStorage()
    function onAuthUpdated() {
      refreshHeaderFromStorage()
    }
    window.addEventListener('ccs-auth-user-updated', onAuthUpdated)
    return () => window.removeEventListener('ccs-auth-user-updated', onAuthUpdated)
  }, [theme, refreshHeaderFromStorage])

  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) return
    let cancelled = false
      ; (async () => {
        try {
          const res = await apiMe(token)
          if (cancelled || !res?.user) return
          localStorage.setItem('authUser', JSON.stringify(res.user))
          refreshHeaderFromStorage()
        } catch {
          // ignore (e.g. expired session)
        }
      })()
    return () => {
      cancelled = true
    }
  }, [refreshHeaderFromStorage])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-branding-grid">
            <img src="/ccs_logo.png" alt="Logo" className="sidebar-main-logo" />
            <div className="sidebar-titles">
              <h1 className="sidebar-main-title">CCS <span className="pinnacle-accent">Profiling</span></h1>
              <h2 className="sidebar-sub-title">College of Computing Studies</h2>
              <p className="sidebar-tag-title">Comprehensive Profiling System</p>
            </div>
          </div>
        </div>

        <div className="sidebar-semester-wrapper">
          {(() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth(); // 0 is Jan, 11 is Dec
            const isSecondSemester = month >= 1 && month <= 6; // roughly Feb-July
            const academicYear = isSecondSemester ? `${year - 1}-${year}` : `${year}-${year + 1}`;
            const currentTerm = isSecondSemester ? "Second Semester" : "First Semester";

            return (
              <div className="sidebar-semester-card">
                <div className="semester-text">{currentTerm}</div>
                <div className="ay-text">A.Y. {academicYear}</div>
              </div>
            );
          })()}
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to={(() => {
              try {
                const u = JSON.parse(localStorage.getItem('authUser'))
                return ['faculty', 'dean', 'department_chair', 'secretary', 'faculty_professor'].includes(u?.role) ? '/faculty-dashboard' : '/'
              } catch {
                return '/'
              }
            })()}
            end
            className={({ isActive }) => 'nav-item' + (isActive ? ' nav-item-active' : '')}
          >
            <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            My Dashboard
          </NavLink>

          {(() => {
            const facultyGroup = modules.filter(
              (m) =>
                m.id.startsWith('faculty-') ||
                m.id === 'teaching-load' ||
                m.id === 'admin-subjects' ||
                m.id === 'faculty-directory',
            )
            const facultyIds = new Set(facultyGroup.map(m => m.id))
            const isChildActive = facultyGroup.some((m) => window.location.pathname === m.path)
            let renderedFacultyGroup = false

            return modules.map((m) => {
              if (facultyIds.has(m.id)) {
                if (renderedFacultyGroup) return null
                renderedFacultyGroup = true
                return (
                  facultyGroup.length > 0 && (
                    <div className="nav-group" key="faculty-module-group">
                      <div
                        className={`nav-item nav-group-header ${isFacultyExpanded || isChildActive ? 'expanded' : ''} ${isChildActive ? 'nav-group-header-active' : ''
                          }`}
                        onClick={() => setIsFacultyExpanded(!isFacultyExpanded)}
                        role="button"
                        tabIndex={0}
                      >
                        <svg
                          className="nav-icon"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 3h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H2z"></path>
                          <path d="M22 3h-6a4 4 0 0 0-4 4v14a4 4 0 0 1 4-4h6z"></path>
                        </svg>
                        Faculty Module
                        <svg
                          className="nav-chevron"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </div>
                      {(isFacultyExpanded || isChildActive) && (
                        <div className="nav-group-children">
                          {facultyGroup.map((gm) => (
                            <NavLink
                              key={gm.id}
                              to={gm.path}
                              className={({ isActive }) => 'nav-item' + (isActive ? ' nav-item-active' : '')}
                            >
                              {gm.icon}
                              {gm.title}
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )
              }
              return (
                <NavLink
                  key={m.id}
                  to={m.path}
                  className={({ isActive }) => 'nav-item' + (isActive ? ' nav-item-active' : '')}
                >
                  {m.icon}
                  {m.title}
                </NavLink>
              )
            })
          })()}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-divider"></div>
          <div
            className="nav-item nav-item-logout"
            onClick={() => setShowLogoutModal(true)}
            role="button"
            tabIndex={0}
          >
            <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="main-top-bar">
          <div className="top-bar-user-info">
            <span className="top-bar-name">{primaryLabel || 'User'}</span>
            {secondaryLabel ? (
              <span className="top-bar-id" title="Student number">
                {secondaryLabel}
              </span>
            ) : null}
            {headerRoleLabel ? (
              <span className="top-bar-role badge-enrolled">{headerRoleLabel}</span>
            ) : null}
          </div>
          <div className="top-bar-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              className="notification-icon-btn"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              title="Toggle Theme"
            >
              {theme === 'light' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              )}
            </button>
            {profilePath ? (
              <Link to={profilePath} className="top-bar-avatar" title="Go to Profile">
                {headerProfileImageUrl ? (
                  <img src={headerProfileImageUrl} alt="" className="avatar-img" />
                ) : (
                  <div className="avatar-placeholder">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  </div>
                )}
              </Link>
            ) : (
              <div className="top-bar-avatar">
                <div className="avatar-placeholder">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </div>
              </div>
            )}
          </div>
        </div>

        {mustChangePassword ? (
          <div className="student-password-reminder" role="status">
            <div className="student-password-reminder-inner">
              <strong>Update your password</strong>
              <span>
                Your account was created by an administrator. Please change your password to one only you know — open{' '}
                <Link to="/student-profile" className="student-password-reminder-link">
                  Student Profile
                </Link>{' '}
                and use the Password section.
              </span>
            </div>
          </div>
        ) : null}

        <div className="main-content-scrollable">
          <Outlet />
        </div>
      </main>

      {showLogoutModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-title">Confirm Logout</h3>
            <p className="modal-text">Are you sure you want to log out of your account?</p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-logout-confirm"
                onClick={() => {
                  let loginPath = '/admin/login'
                  try {
                    const raw = localStorage.getItem('authUser')
                    const u = raw ? JSON.parse(raw) : null
                    if (u?.role === 'student') loginPath = '/student/login'
                    else if (['faculty', 'dean', 'department_chair', 'secretary', 'faculty_professor'].includes(u?.role)) loginPath = '/faculty/login'
                    else if (u?.role === 'admin') loginPath = '/admin/login'
                  } catch {
                    // keep default
                  }
                  localStorage.removeItem('authToken')
                  localStorage.removeItem('authUser')
                  navigate(loginPath, { replace: true })
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
