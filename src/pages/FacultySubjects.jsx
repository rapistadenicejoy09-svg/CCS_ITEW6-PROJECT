import { useEffect, useState } from 'react'
import { apiGetSubjects, apiCreateSubject, apiDeleteSubject } from '../lib/api'

export default function FacultySubjects() {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const token = localStorage.getItem('authToken')

  // Form states
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [credits, setCredits] = useState(3)

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGetSubjects(token)
        setSubjects(res.subjects || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleAdd() {
    if (!code || !name) return alert('Code and Name are required')
    try {
      const res = await apiCreateSubject(token, { code, name, credits: Number(credits) })
      setSubjects([...subjects, res.subject])
      setCode('')
      setName('')
      setCredits(3)
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this subject from master list?')) return
    try {
      await apiDeleteSubject(token, id)
      setSubjects(subjects.filter(s => s.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Master Subjects...</div>

  return (
    <div className="module-page">
      <header className="module-header">
        <div>
          <h1 className="main-title">Master Subjects Management</h1>
          <p className="main-description">Admin-only: Create and manage the college curriculum.</p>
        </div>
      </header>

      <div className="content-panel">
        <div className="content-header">
           <h3 className="content-title">Register New Subject</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '12px' }}>
          <div className="auth-field">
            <label className="auth-label">Code</label>
            <input type="text" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} placeholder="e.g. COMS 101" value={code} onChange={e => setCode(e.target.value)} />
          </div>
          <div className="auth-field">
            <label className="auth-label">Subject Name</label>
            <input type="text" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} placeholder="Full Descriptive Title" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="auth-field">
            <label className="auth-label">Credits / Units</label>
            <input type="number" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} value={credits} onChange={e => setCredits(e.target.value)} />
          </div>
          <div className="auth-field" style={{ justifyContent: 'flex-end' }}>
             <button onClick={handleAdd} className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>Register</button>
          </div>
        </div>
      </div>

      <div className="content-panel">
        <div className="content-header">
           <h3 className="content-title">Curriculum Subjects</h3>
           <span className="badge-enrolled">{subjects.length} Registered</span>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Descriptive Title</th>
                <th>Units</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.credits} Units</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => handleDelete(s.id)} className="btn btn-secondary btn-compact" style={{ color: '#ef4444', border: 'none' }}>Delete</button>
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr><td colSpan="4" className="empty-state">No subjects in the curriculum.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
