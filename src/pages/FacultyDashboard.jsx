import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGetTeachingLoads, apiGetSchedules } from '../lib/api'

function SummaryCard({ label, value, hint, link }) {
  return (
    <Link to={link} className="summary-card summary-card-link">
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
      {hint ? <div className="summary-hint">{hint}</div> : null}
    </Link>
  )
}

export default function FacultyDashboard() {
  const [loads, setLoads] = useState([])
  const [schedule, setSchedule] = useState([])
  const [loading, setLoading] = useState(true)
  const token = localStorage.getItem('authToken')
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [lRes, sRes] = await Promise.all([
          apiGetTeachingLoads(token),
          apiGetSchedules(token)
        ])
        setLoads(lRes.teachingLoads)
        setSchedule(sRes.schedules)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

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

  const today = useMemo(() => {
    const now = new Date()
    return {
      day: now.getDate(),
      weekday: now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      monthYear: `${now.toLocaleDateString('en-US', { month: 'short' })} ${now.getFullYear()}`.toUpperCase(),
      longWeekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
    }
  }, [])

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Dashboard...</div>

  const todaysCount = schedule.filter((s) => s.day === today.longWeekday).length
  const totalUnits = loads.reduce((sum, l) => sum + (l.subject?.credits || 0), 0)

  return (
    <div className="dashboard-page">
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
                Faculty dashboard — quick access to teaching load, schedules, and faculty resources
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
                Faculty portal overview
              </h4>
              <p className="announcement-text">
                Use the Faculty Module for teaching load, schedules, evaluations, office hours, and master subjects.
              </p>
              <p className="announcement-text" style={{ marginBottom: 0 }}>
                The <strong>Faculty List</strong> is available as a view-only directory for collaboration.
              </p>
            </div>
          </div>

          <section className="summary-row" style={{ marginTop: '24px' }}>
            <SummaryCard
              label="Teaching Load"
              value={loads.length}
              hint={`${totalUnits} total units`}
              link="/faculty/teaching-load"
            />
            <SummaryCard
              label="Today's Classes"
              value={todaysCount}
              hint="Across all sections"
              link="/faculty/schedule"
            />
            <SummaryCard label="Faculty List" value="View" hint="Directory access" link="/faculty/faculty-list" />
            <SummaryCard label="Office Hours" value="Manage" hint="Office hours schedule" link="/faculty/office-hours" />
          </section>

          <section className="content-panel" style={{ marginTop: '24px' }}>
            <div className="content-header">
              <div>
                <h2 className="content-title">Weekly Schedule Preview</h2>
                <p className="content-subtitle">Your upcoming classes and room assignments.</p>
              </div>
              <Link to="/faculty/schedule" className="btn btn-secondary">
                View full schedule
              </Link>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Subject</th>
                    <th>Section</th>
                    <th>Room</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.slice(0, 6).map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{s.day}</td>
                      <td>
                        {s.startTime} - {s.endTime}
                      </td>
                      <td>{s.subject?.name || s.subjectId}</td>
                      <td>{s.section}</td>
                      <td className="tag">{s.room}</td>
                    </tr>
                  ))}
                  {schedule.length === 0 && (
                    <tr>
                      <td colSpan="5" className="empty-state">
                        No classes scheduled yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
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
              <div className="date-widget-item">You have {todaysCount} class slot(s) today.</div>
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
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 2v8" />
                        <path d="m4.93 10.93 1.41 1.41" />
                        <path d="M2 18h2" />
                        <path d="M20 18h2" />
                        <path d="m19.07 10.93-1.41 1.41" />
                        <path d="M22 22H2" />
                        <path d="m8 6 4-4 4 4" />
                        <path d="M16 18a4 4 0 0 0-8 0" />
                      </svg>
                      Sunrise
                    </span>
                    <span className="sun-val">{weather.sunrise}</span>
                  </div>
                  <div className="sun-time">
                    <span className="sun-icon" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 10V2" />
                        <path d="m4.93 10.93 1.41 1.41" />
                        <path d="M2 18h2" />
                        <path d="M20 18h2" />
                        <path d="m19.07 10.93-1.41 1.41" />
                        <path d="M22 22H2" />
                        <path d="m16 5-4 4-4-4" />
                        <path d="M16 18a4 4 0 0 0-8 0" />
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
