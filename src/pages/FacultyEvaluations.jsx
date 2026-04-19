import { useEffect, useState } from 'react'
import { apiGetEvaluations } from '../lib/api'

export default function FacultyEvaluations() {
  const [evals, setEvals] = useState([])
  const [loading, setLoading] = useState(true)
  const token = localStorage.getItem('authToken')

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGetEvaluations(token)
        setEvals(res.evaluations)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const averageRating = evals.length > 0 
    ? (evals.reduce((sum, e) => sum + e.rating, 0) / evals.length).toFixed(1)
    : 'N/A'

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Evaluations...</div>

  return (
    <div className="module-page">
      <header className="module-header">
        <div>
          <h1 className="main-title">Performance & Evaluations</h1>
          <p className="main-description">View student feedback and teaching performance metrics.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="summary-value" style={{ color: 'var(--accent)', fontSize: '32px' }}>{averageRating}</div>
          <div className="summary-label">Average Rating</div>
        </div>
      </header>

      <div className="summary-row">
        <div className="summary-card">
          <div className="summary-label">Total Responses</div>
          <div className="summary-value">{evals.length}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Term</div>
          <div className="summary-value" style={{ fontSize: '14px', marginTop: '10px' }}>2nd Sem 2024-25</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Pass Rate</div>
          <div className="summary-value">98%</div>
        </div>
      </div>

      <div className="content-panel" style={{ marginTop: '16px' }}>
        <div className="content-header">
           <h3 className="content-title">Student Feedback</h3>
        </div>
        <div className="profile-sections" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {evals.map(e => (
            <div key={e.id} className="profile-section" style={{ borderLeft: '3px solid var(--accent)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>Anonymous Student</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{'★'.repeat(e.rating)}{'☆'.repeat(5-e.rating)}</span>
               </div>
               <p style={{ fontSize: '12px', fontStyle: 'italic', opacity: 0.9 }}>&quot;{e.comments}&quot;</p>
               <div style={{ marginTop: '8px', fontSize: '10px', opacity: 0.5, textTransform: 'uppercase' }}>{new Date(e.created_at).toLocaleDateString()}</div>
            </div>
          ))}
          {evals.length === 0 && <div className="empty-state">No evaluations received yet.</div>}
        </div>
      </div>
    </div>
  )
}
