import { useEffect, useState } from 'react'
import { apiGetDocuments, apiGetTeachingLoads, apiUploadDocument, apiDeleteDocument } from '../lib/api'

export default function FacultyDocuments() {
  const [docs, setDocs] = useState([])
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const token = localStorage.getItem('authToken')

  // Form states
  const [loadId, setLoadId] = useState('')
  const [category, setCategory] = useState('Syllabus')
  const [fileUrl, setFileUrl] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [dRes, lRes] = await Promise.all([
          apiGetDocuments(token),
          apiGetTeachingLoads(token)
        ])
        setDocs(dRes.documents)
        setLoads(lRes.teachingLoads)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleUpload() {
    if (!loadId || !fileUrl) return alert('Subject and URL are required')
    
    // Find the correct subjectId from the teaching load
    const selectedLoad = loads.find(l => String(l.id) === String(loadId))
    if (!selectedLoad) return alert('Invalid subject selected')

    setUploading(true)
    try {
      const res = await apiUploadDocument(token, {
        subjectId: selectedLoad.subject_id,
        title: fileUrl.split('/').pop() || 'Untitled Document',
        fileUrl,
        fileType: category
      })
      setDocs([...docs, res.document])
      setFileUrl('')
    } catch (err) {
      alert(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this document?')) return
    try {
      await apiDeleteDocument(token, id)
      setDocs(docs.filter(d => d.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Documents...</div>

  return (
    <div className="module-page">
      <header className="module-header">
        <div>
          <h1 className="main-title">Document Management</h1>
          <p className="main-description">Upload and organize your teaching materials.</p>
        </div>
      </header>

      <div className="content-panel">
        <div className="content-header">
           <h3 className="content-title">Upload New Material</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '12px' }}>
          <div className="auth-field">
            <label className="auth-label">Subject</label>
            <select className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} value={loadId} onChange={e => setLoadId(e.target.value)}>
              <option value="">Select Subject</option>
              {loads.map(l => <option key={l.id} value={l.id}>{l.subject?.name} ({l.section})</option>)}
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label">Category</label>
            <select className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="Syllabus">Syllabus</option>
              <option value="Lesson Plan">Lesson Plan</option>
              <option value="Material">Class Material</option>
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label">File URL (Simulated)</label>
            <input type="text" className="search-input" style={{ borderRadius: 'var(--radius-md)', padding: '10px' }} placeholder="https://..." value={fileUrl} onChange={e => setFileUrl(e.target.value)} />
          </div>
          <div className="auth-field" style={{ justifyContent: 'flex-end' }}>
            <button onClick={handleUpload} disabled={uploading} className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </div>
      </div>

      <div className="content-panel">
        <div className="content-header">
           <h3 className="content-title">Recently Uploaded Files</h3>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>File Name</th>
                <th>Subject</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td><span className="badge-enrolled" style={{ fontSize: '10px' }}>{d.file_type || d.category}</span></td>
                  <td style={{ fontWeight: 'bold' }}>{d.title || d.file_name}</td>
                  <td style={{ color: 'var(--accent)' }}>{loads.find(l => l.subject_id === d.subject_id)?.subject?.name || 'Subject #' + d.subject_id}</td>
                  <td style={{ opacity: 0.7 }}>{new Date(d.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-compact" style={{ marginRight: '8px', display: 'inline-block' }}>View</a>
                    <button onClick={() => handleDelete(d.id)} className="btn btn-secondary btn-compact" style={{ color: '#ef4444', border: 'none' }}>Delete</button>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr><td colSpan="5" className="empty-state">No documents uploaded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
