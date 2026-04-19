import { useEffect, useState } from 'react'
import { apiGetSchedules, apiGetTeachingLoads, apiCreateSchedule, apiDeleteSchedule } from '../lib/api'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function FacultySchedule() {
  const [schedules, setSchedules] = useState([])
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const token = localStorage.getItem('authToken')

  // Form states
  const [loadId, setLoadId] = useState('')
  const [day, setDay] = useState('Monday')
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('10:00')
  const [room, setRoom] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [sRes, lRes] = await Promise.all([
          apiGetSchedules(token),
          apiGetTeachingLoads(token)
        ])
        setSchedules(sRes.schedules)
        setLoads(lRes.teachingLoads)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleAdd() {
    if (!loadId || !day || !start || !end || !room) return alert('All fields are required')
    try {
      const res = await apiCreateSchedule(token, {
        teachingLoadId: loadId,
        day,
        startTime: start,
        endTime: end,
        room
      })
      setSchedules([...schedules, res.schedule])
      setLoadId('')
      setRoom('')
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this schedule slot?')) return
    try {
      await apiDeleteSchedule(token, id)
      setSchedules(schedules.filter(s => s.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Schedule...</div>

  return (
    <div className="module-page">
      <header className="module-header">
        <div>
          <h1 className="main-title">Weekly Schedule</h1>
          <p className="main-description">Manage your class times and room allocations.</p>
        </div>
      </header>

      <div className="content-panel">
        <div className="content-header">
          <div>
            <h3 className="content-title">Add Schedule Slot</h3>
            <p className="content-subtitle">Define when and where a subject assignment takes place.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '12px' }}>
          <div className="auth-field">
            <label className="auth-label">Assignment</label>
            <select className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} value={loadId} onChange={e => setLoadId(e.target.value)}>
              <option value="">Select Load</option>
              {loads.map(l => <option key={l.id} value={l.id}>{l.subject?.code} - {l.section}</option>)}
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label">Day</label>
            <select className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} value={day} onChange={e => setDay(e.target.value)}>
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label">Start</label>
            <input type="time" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div className="auth-field">
            <label className="auth-label">End</label>
            <input type="time" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} value={end} onChange={e => setEnd(e.target.value)} />
          </div>
          <div className="auth-field">
            <label className="auth-label">Room</label>
            <input type="text" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} placeholder="Room #" value={room} onChange={e => setRoom(e.target.value)} />
          </div>
          <div className="auth-field" style={{ justifyContent: 'flex-end' }}>
            <button onClick={handleAdd} className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>Add Slot</button>
          </div>
        </div>
      </div>

      <div className="content-panel">
        <div className="content-header">
           <h3 className="content-title">Class Schedule Grid</h3>
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
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map(d => {
                const daySchedules = schedules.filter(s => s.day === d)
                if (daySchedules.length === 0) return null
                return daySchedules.map((s, idx) => (
                  <tr key={s.id}>
                    {idx === 0 ? <td rowSpan={daySchedules.length} style={{ fontWeight: 'bold', borderRight: '1px solid rgba(255,255,255,0.05)', color: 'var(--accent)' }}>{d}</td> : null}
                    <td>{s.startTime} - {s.endTime}</td>
                    <td>{s.subject?.name || s.subjectId}</td>
                    <td>{s.section}</td>
                    <td className="tag">{s.room}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => handleDelete(s.id)} className="btn btn-secondary btn-compact" style={{ color: '#ef4444', border: 'none' }}>Remove</button>
                    </td>
                  </tr>
                ))
              })}
              {schedules.length === 0 && (
                <tr><td colSpan="6" className="empty-state">No class slots scheduled yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
