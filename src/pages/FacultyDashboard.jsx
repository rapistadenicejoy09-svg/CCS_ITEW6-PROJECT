import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
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

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Dashboard...</div>

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1 className="main-title">Faculty Dashboard</h1>
          <p className="main-description">Welcome back! Here is an overview of your academic activities.</p>
        </div>
      </header>

      <div className="summary-row">
        <SummaryCard 
          label="Teaching Load" 
          value={loads.length} 
          hint={`${loads.reduce((sum, l) => sum + (l.subject?.credits || 0), 0)} total units`}
          link="/faculty/teaching-load"
        />
        <SummaryCard 
          label="Today's Classes" 
          value={schedule.filter(s => s.day === new Date().toLocaleDateString('en-US', { weekday: 'long' })).length} 
          hint="Across all sections"
          link="/faculty/schedule"
        />
        <SummaryCard 
          label="Pending Documents" 
          value="2" 
          hint="Syllabus, Lesson Plan"
          link="/faculty/documents"
        />
        <SummaryCard 
          label="Avg. Evaluation" 
          value="4.8" 
          hint="Based on 24 responses"
          link="/faculty/evaluations"
        />
      </div>

      <div className="summary-row" style={{ marginTop: '16px' }}>
         <div className="content-panel" style={{ flex: '2', minWidth: '0' }}>
            <div className="content-header">
              <div>
                <h3 className="content-title">Weekly Schedule Preview</h3>
                <p className="content-subtitle">Your upcoming classes and room assignments.</p>
              </div>
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
                  {schedule.slice(0, 5).map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{s.day}</td>
                      <td>{s.startTime} - {s.endTime}</td>
                      <td>{s.subject?.name || s.subjectId}</td>
                      <td>{s.section}</td>
                      <td>{s.room}</td>
                    </tr>
                  ))}
                  {schedule.length === 0 && (
                     <tr><td colSpan="5" className="empty-state">No classes scheduled yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
         </div>
         
         <div className="content-panel" style={{ flex: '1', minWidth: '0' }}>
            <div className="content-header">
              <h3 className="content-title">Announcements</h3>
            </div>
            <div className="profile-sections" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
               <div className="profile-section">
                  <div className="content-title" style={{ fontSize: '13px', color: 'var(--accent)' }}>College Meeting</div>
                  <p style={{ fontSize: '12px', opacity: 0.8, margin: '4px 0' }}>Friday, 2:00 PM at Dean's Office</p>
               </div>
               <div className="profile-section">
                  <div className="content-title" style={{ fontSize: '13px', color: 'var(--accent)' }}>Grade Submission</div>
                  <p style={{ fontSize: '12px', opacity: 0.8, margin: '4px 0' }}>Deadline for Midterm: April 15</p>
               </div>
            </div>
         </div>
      </div>
    </div>
  )
}
