import { useEffect, useState } from 'react'
import { apiGetSchedules } from '../lib/api'

export default function FacultyConsultation() {
  const [loading, setLoading] = useState(true)
  const [consultations, setConsultations] = useState([
    { id: 1, day: 'Monday', time: '1:00 PM - 3:00 PM', room: 'Consultation Room A' },
    { id: 2, day: 'Wednesday', time: '10:00 AM - 12:00 PM', room: 'Faculty Office' }
  ])

  useEffect(() => {
    // Simulated fetch
    setTimeout(() => setLoading(false), 500)
  }, [])

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Office Hours...</div>

  return (
    <div className="module-page">
      <header className="module-header">
        <div>
          <h1 className="main-title">Consultation Hours</h1>
          <p className="main-description">Manage and display your availability for student consultations.</p>
        </div>
      </header>

      <div className="content-panel">
        <div className="content-header">
           <h3 className="content-title">Set Consultation Schedule</h3>
           <p className="content-subtitle">Students will see these times as available for meetings.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '12px' }}>
          <div className="auth-field">
            <label className="auth-label">Day</label>
            <select className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }}>
              <option>Monday</option>
              <option>Tuesday</option>
              <option>Wednesday</option>
              <option>Thursday</option>
              <option>Friday</option>
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label">Time Slot</label>
            <input type="text" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} placeholder="e.g. 1:00 PM - 3:00 PM" />
          </div>
          <div className="auth-field">
            <label className="auth-label">Room/Location</label>
            <input type="text" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} placeholder="e.g. Faculty Office" />
          </div>
          <div className="auth-field" style={{ justifyContent: 'flex-end' }}>
             <button className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>Save Slot</button>
          </div>
        </div>
      </div>

      <div className="content-panel">
        <div className="content-header">
           <h3 className="content-title">Active Consultation Hours</h3>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Time</th>
                <th>Location</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {consultations.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{c.day}</td>
                  <td>{c.time}</td>
                  <td className="tag">{c.room}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-secondary btn-compact" style={{ color: '#ef4444', border: 'none' }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
