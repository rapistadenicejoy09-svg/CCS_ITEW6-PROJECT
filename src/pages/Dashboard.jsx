import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  apiAdminUsers,
  apiFacultyDirectory,
  apiGetSubjects,
  apiGetTeachingLoads
} from '../lib/api'

const MODULES = [
  { id: 'student-profile', code: '1.1', title: 'Student List', path: '/student-profile' },
  { id: 'faculty-profile', code: '1.2', title: 'Faculty List', path: '/admin/faculty' },
  { id: 'events', code: '1.3', title: 'Events', path: '/events' },
  { id: 'scheduling', code: '1.4', title: 'Scheduling', path: '/scheduling' },
  { id: 'college-research', code: '1.5', title: 'College Research', path: '/college-research' },
  { id: 'instructions', code: '1.6', title: 'Instructions', path: '/instructions' },
]

const FACULTY_ROLES = ['faculty', 'faculty_professor', 'dean', 'department_chair', 'secretary']

function dashboardStudentDisplayName(u) {
  const fn = String(u.first_name || u.personal_information?.first_name || '').trim()
  const ln = String(u.last_name || u.personal_information?.last_name || '').trim()
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ')
  const fb = String(u.full_name || '').trim()
  if (fb) return fb
  return String(u.student_id || u.email || `Student #${u.id}`)
}

function dashboardStudentMeta(u) {
  const ai = u.academic_info || {}
  const parts = [
    ai.program || u.class_section || '',
    ai.year_level || '',
    u.student_type || '',
    u.is_active === 0 ? 'Inactive' : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' • ') : '—'
}

function dashboardFacultyDisplayName(u) {
  const fn = String(u.first_name || u.personal_information?.first_name || '').trim()
  const ln = String(u.last_name || u.personal_information?.last_name || '').trim()
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ')
  const fb = String(u.full_name || u.personal_information?.full_name || '').trim()
  if (fb) return fb
  return String(u.email || `Faculty #${u.id}`)
}

function dashboardFacultyMeta(u) {
  const parts = [
    String(u.department || u.summary?.department || '').trim(),
    String(u.specialization || '').trim(),
    u.is_active === 0 ? 'Inactive' : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' • ') : '—'
}

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    return raw ? JSON.parse(raw)?.role : null
  } catch {
    return null
  }
}

function SummaryCard({ label, value, hint, link }) {
  return (
    <Link to={link} className="summary-card summary-card-link">
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
      {hint ? <div className="summary-hint">{hint}</div> : null}
    </Link>
  )
}

function useTodayParts() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return {
    day: now.getDate(),
    weekday: now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    monthYear: `${now.toLocaleDateString('en-US', { month: 'short' })} ${now.getFullYear()}`.toUpperCase(),
  }
}

export default function Dashboard() {
  const [role, setRole] = useState(() => getRole())
  
  // Faculty roles redirect to their own dashboard
  if (['faculty', 'faculty_professor', 'dean', 'department_chair', 'secretary'].includes(role)) {
    return <Navigate to="/faculty-dashboard" replace />
  }

  const [modules, setModules] = useState(MODULES)

  const [studentCount, setStudentCount] = useState(0)
  const [facultyCount, setFacultyCount] = useState(0)
  const [subjectCount, setSubjectCount] = useState(0)
  const [coveragePercent, setCoveragePercent] = useState(0)
  const [quickRows, setQuickRows] = useState([])
  
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')

  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(true)

  const today = useTodayParts()

  const isAdmin = role === 'admin'
  const isStudent = role === 'student'
  const isFaculty = ['faculty', 'faculty_professor', 'dean', 'department_chair', 'secretary'].includes(role)

  useEffect(() => {
    const r = getRole()
    setRole(r)
    setModules(
      MODULES.map((m) => {
        if (m.id === 'student-profile') {
          return { ...m, title: r === 'admin' ? 'Student List' : 'Student Profile' }
        }
        if (m.id === 'scheduling' && r === 'student') {
          return { ...m, path: '/student/schedule' }
        }
        return m
      }),
    )
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    const token = localStorage.getItem('authToken')
    if (!token) return
    
    setStatsError('')
    setStatsLoading(true)
    
    Promise.all([
      apiAdminUsers(token),
      apiFacultyDirectory(token),
      apiGetSubjects(token),
      apiGetTeachingLoads(token)
    ]).then(([uRes, fRes, sRes, tRes]) => {
      const users = Array.isArray(uRes.users) ? uRes.users : []
      const students = users.filter(u => u.role === 'student')
      setStudentCount(students.length)
      const facultyUsers = users.filter((u) => FACULTY_ROLES.includes(u.role))
      const recentUsers = [...students, ...facultyUsers]
        .sort((a, b) => {
          const aTime = new Date(a.created_at || 0).getTime()
          const bTime = new Date(b.created_at || 0).getTime()
          if (aTime !== bTime) return bTime - aTime
          return Number(b.id || 0) - Number(a.id || 0)
        })
        .slice(0, 5)
      setQuickRows(recentUsers.map((u) => {
        const isFacultyUser = FACULTY_ROLES.includes(u.role)
        return {
          id: u.id,
          type: isFacultyUser ? 'faculty' : 'student',
          module: isFacultyUser ? 'faculty-profile' : 'student-profile',
          detailPath: isFacultyUser ? `/admin/faculty/${u.id}` : `/admin/student/${u.id}`,
          name: isFacultyUser ? dashboardFacultyDisplayName(u) : dashboardStudentDisplayName(u),
          meta: isFacultyUser ? dashboardFacultyMeta(u) : dashboardStudentMeta(u),
        }
      }))

      const facList = fRes.faculty || []
      setFacultyCount(facList.length)

      const subList = sRes.subjects || []
      setSubjectCount(subList.length)

      const loads = tRes.teachingLoads || []
      const assignedSubjectIds = new Set(loads.map(l => l.subject_id))
      const coverage = subList.length > 0 ? (assignedSubjectIds.size / subList.length) * 100 : 0
      setCoveragePercent(Math.round(coverage))
    }).catch(e => {
      setStatsError(e?.message || 'Could not load dashboard stats.')
    }).finally(() => setStatsLoading(false))
  }, [isAdmin])

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=14.2766&longitude=121.1215&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=Asia%2FSingapore',
        )
        const data = await res.json()

        const code = data.current.weather_code
        let icon = '☁️'
        let desc = 'Cloudy'

        if (code === 0) {
          icon = '☀️'
          desc = 'Clear sky'
        } else if (code === 1 || code === 2 || code === 3) {
          icon = '🌤️'
          desc = 'Partly cloudy'
        } else if (code >= 45 && code <= 48) {
          icon = '🌫️'
          desc = 'Fog'
        } else if (code >= 51 && code <= 67) {
          icon = '🌧️'
          desc = 'Rain'
        } else if (code >= 71 && code <= 77) {
          icon = '❄️'
          desc = 'Snow'
        } else if (code >= 80 && code <= 82) {
          icon = '🌦️'
          desc = 'Rain showers'
        } else if (code >= 95) {
          icon = '⛈️'
          desc = 'Thunderstorm'
        }

        const formatTime = (timeStr) => {
          const d = new Date(timeStr)
          return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        }

        const deg = data.current.wind_direction_10m
        const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
        const windDir = dirs[Math.round(deg / 22.5) % 16]

        setWeather({
          temp: Math.round(data.current.temperature_2m),
          feelsLike: Math.round(data.current.apparent_temperature),
          humidity: data.current.relative_humidity_2m,
          wind: `${data.current.wind_speed_10m} km/h ${windDir}`,
          pressure: Math.round(data.current.surface_pressure),
          desc,
          icon,
          sunrise: formatTime(data.daily.sunrise[0]),
          sunset: formatTime(data.daily.sunset[0]),
          time: formatTime(data.current.time),
        })
      } catch (err) {
        console.error('Failed to fetch weather:', err)
      } finally {
        setWeatherLoading(false)
      }
    }
    fetchWeather()
  }, [])

  const dashboardClass =
    'dashboard-page' +
    (isAdmin ? ' dashboard-page--admin' : '') +
    (isStudent ? ' dashboard-page--student' : '') +
    (isFaculty ? ' dashboard-page--faculty' : '')

  return (
    <div className={dashboardClass}>
      <div className="dashboard-grid">
        <div className="dashboard-main-col">
          <div className="welcome-banner">
            <div className="welcome-banner-inner">
              <div className="welcome-logo-container">
                <img src="/ccs_logo.png" alt="Dashboard Logo" className="welcome-logo" />
              </div>
              <div className="welcome-text-container">
                <div className="welcome-uni-header">College of Computing Studies</div>
              </div>
            </div>
            <div className="welcome-banner-bottom">
              <div>
                Welcome to <span className="pinnacle-logo-text-banner">CCS Department&apos;s CPS</span>
              </div>
              <div className="welcome-banner-subtitle">
                {isAdmin && 'Administrator dashboard — overview of records and quick access'}
                {isStudent && 'Student dashboard — your portal to profile and college information'}
                {isFaculty && 'Faculty dashboard — teaching and college resources'}
                {!isAdmin && !isStudent && !isFaculty && 'Comprehensive Profiling System'}
              </div>
            </div>
          </div>

          <div className="announcements-section">
            <div className="section-header">
              <div className="section-icon-box bg-blue">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </div>
              <h3>Announcements</h3>
            </div>

            <div className="announcement-card bg-green-light">
              <h4 className="announcement-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                Welcome to the CCS Profiling System
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
                  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
                  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
                </svg>
              </h4>
              <p className="announcement-text">
                Manage your profile and keep your records up to date.
              </p>
            </div>
          </div>

          {isAdmin && statsError && (
            <div
              className="announcement-card"
              style={{ marginTop: 16, borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)' }}
            >
              <p className="announcement-text" style={{ margin: 0, color: 'var(--text)' }}>
                {statsError}
              </p>
            </div>
          )}

          {isAdmin && (
            <section className="summary-row" style={{ marginTop: '24px' }}>
              {statsLoading ? (
                <>
                  <div className="summary-card" style={{ opacity: 0.7 }}><div className="summary-label">Students</div><div className="summary-value">…</div></div>
                  <div className="summary-card" style={{ opacity: 0.7 }}><div className="summary-label">Faculty</div><div className="summary-value">…</div></div>
                  <div className="summary-card" style={{ opacity: 0.7 }}><div className="summary-label">Subjects</div><div className="summary-value">…</div></div>
                  <div className="summary-card" style={{ opacity: 0.7 }}><div className="summary-label">Subject Coverage</div><div className="summary-value">…</div></div>
                </>
              ) : (
                <>
                  <SummaryCard label="Total Students" value={studentCount} hint="Registered profiles" link="/student-profile" />
                  <SummaryCard label="Active Faculty" value={facultyCount} hint="Registered faculty" link="/admin/faculty" />
                  <SummaryCard label="Master Subjects" value={subjectCount} hint="Curriculum entries" link="/instructions" />
                  <SummaryCard 
                    label="Subject Coverage" 
                    value={`${coveragePercent}%`} 
                    hint={`${Math.round(subjectCount * coveragePercent / 100)} Assigned Subjects`} 
                    link="/scheduling" 
                  />
                </>
              )}
            </section>
          )}

          {isAdmin && (
            <section className="content-panel" style={{ marginTop: '24px' }}>
              <div className="content-header">
                <div>
                  <h2 className="content-title">Quick View</h2>
                  <p className="content-subtitle">
                    Top 5 recently added users (students and faculty). Open a row to view or edit a profile.
                  </p>
                </div>
              </div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name / Title</th>
                      <th>Details</th>
                      <th>Module</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quickRows.length === 0 && (
                      <tr>
                        <td colSpan="4" className="empty-state">
                          No student or faculty records found in the database yet.
                        </td>
                      </tr>
                    )}
                    {quickRows.map((item, index) => (
                      <tr key={`${item.type}-${item.id}`}>
                        <td>{index + 1}</td>
                        <td>
                          <Link to={item.detailPath}>{item.name}</Link>
                        </td>
                        <td>{item.meta}</td>
                        <td className="tag">
                          <Link to={modules.find((m) => m.id === item.module)?.path || '/'}>
                            {modules.find((m) => m.id === item.module)?.title ?? item.module}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {isFaculty && (
            <section className="dashboard-role-card" style={{ marginTop: 24 }}>
              <h3 className="content-title" style={{ fontSize: '1.1rem', marginBottom: 8 }}>
                Faculty home
              </h3>
              <p className="content-subtitle" style={{ margin: 0, lineHeight: 1.5 }}>
                Open modules from the left navigation to work with profiles, events, and schedules.
              </p>
            </section>
          )}
        </div>

        <div className="dashboard-widgets-col">
          <div className="widget-card date-widget">
            <div className="date-widget-top">
              <span className="date-day-large">{today.day}</span>
              <div className="date-month-year">
                <span className="date-weekday">{today.weekday}</span>
                <span className="date-month">{today.monthYear}</span>
              </div>
            </div>
            <div className="date-widget-list">
              <div className="date-widget-item">No upcoming events today.</div>
            </div>
          </div>

          <div className="widget-card weather-widget">
            <div className="widget-header-title">Weather Forecast</div>
            <div className="widget-header-sub">as of {weatherLoading ? '...' : weather?.time || 'N/A'}</div>

            {weatherLoading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.5 }}>Loading weather...</div>
            ) : weather ? (
              <>
                <div className="weather-main">
                  <div className="weather-icon">{weather.icon}</div>
                  <div className="weather-temp">{weather.temp}°C</div>
                </div>
                <div className="weather-desc">{weather.desc}</div>
                <div className="weather-loc">City of Cabuyao, PH</div>

                <div className="weather-details">
                  <div className="weather-detail-row">
                    <span className="weather-detail-label">Feels like</span>
                    <span className="weather-detail-val">{weather.feelsLike}°C</span>
                  </div>
                  <div className="weather-detail-row">
                    <span className="weather-detail-label">Wind</span>
                    <span className="weather-detail-val">{weather.wind}</span>
                  </div>
                  <div className="weather-detail-row">
                    <span className="weather-detail-label">Humidity</span>
                    <span className="weather-detail-val">{weather.humidity}%</span>
                  </div>
                  <div className="weather-detail-row">
                    <span className="weather-detail-label">Pressure</span>
                    <span className="weather-detail-val">{weather.pressure} hPa</span>
                  </div>
                </div>

                <div className="weather-sun-times">
                  <div className="sun-time">
                    <span className="sun-icon" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v8" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" /><path d="m8 6 4-4 4 4" /><path d="M16 18a4 4 0 0 0-8 0" />
                      </svg>
                      Sunrise
                    </span>
                    <span className="sun-val">{weather.sunrise}</span>
                  </div>
                  <div className="sun-time">
                    <span className="sun-icon" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 10V2" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" /><path d="m16 5-4 4-4-4" /><path d="M16 18a4 4 0 0 0-8 0" />
                      </svg>
                      Sunset
                    </span>
                    <span className="sun-val">{weather.sunset}</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: '20px 0', color: '#ef4444' }}>Unable to load weather.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
