import { useEffect, useState } from 'react'
import { apiGetTeachingLoads, apiGetSubjects, apiCreateTeachingLoad, apiDeleteTeachingLoad } from '../lib/api'

export default function FacultyTeachingLoad() {
  const [loads, setLoads] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const token = localStorage.getItem('authToken')

  // Form states
  const [selectedSubject, setSelectedSubject] = useState('')
  const [section, setSection] = useState('')
  const [semester, setSemester] = useState('2nd Semester 2024-2025')

  useEffect(() => {
    async function load() {
      try {
        const [lRes, sRes] = await Promise.all([
          apiGetTeachingLoads(token),
          apiGetSubjects(token)
        ])
        setLoads(lRes.teachingLoads)
        setSubjects(sRes.subjects || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleAdd() {
    if (!selectedSubject || !section) return alert('Subject and Section are required')
    try {
      const res = await apiCreateTeachingLoad(token, {
        subjectId: selectedSubject,
        section,
        semester
      })
      setLoads([...loads, res.teachingLoad])
      setSelectedSubject('')
      setSection('')
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to remove this assignment?')) return
    try {
      await apiDeleteTeachingLoad(token, id)
      setLoads(loads.filter(l => l.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Teaching Load...</div>

  return (
    <div className="module-page">
      <header className="module-header">
        <div>
          <h1 className="main-title">Teaching Load Management</h1>
          <p className="main-description">Oversee subject assignments and class sections.</p>
        </div>
      </header>

      <div className="content-panel">
        <div className="content-header">
          <div>
            <h3 className="content-title">Assign New Subject</h3>
            <p className="content-subtitle">Select a subject from the master list to assign to your load.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '12px' }}>
          <div className="auth-field">
            <label className="auth-label">Subject</label>
            <select className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
              <option value="">Select Subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label">Section</label>
            <input type="text" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} placeholder="e.g. BSCS 3A" value={section} onChange={e => setSection(e.target.value)} />
          </div>
          <div className="auth-field" style={{ justifyContent: 'flex-end' }}>
            <button onClick={handleAdd} className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>Add to Load</button>
          </div>
        </div>
      </div>

      <div className="content-panel">
        <div className="content-header">
          <div>
            <h3 className="content-title">Current Load Assignments</h3>
            <p className="content-subtitle">Manage your existing teaching loads for the current semester.</p>
          </div>
          <span className="badge-enrolled">{loads.length} Active Subjects</span>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Subject Name</th>
                <th>Section</th>
                <th>Units</th>
                <th>Semester</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loads.map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{l.subject?.code}</td>
                  <td>{l.subject?.name}</td>
                  <td>{l.section}</td>
                  <td>{l.subject?.credits}</td>
                  <td className="tag">{l.semester}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => handleDelete(l.id)} className="btn btn-secondary btn-compact" style={{ color: '#ef4444', border: 'none' }}>Remove</button>
                  </td>
                </tr>
              ))}
              {loads.length === 0 && (
                <tr><td colSpan="6" className="empty-state">No subjects assigned yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
