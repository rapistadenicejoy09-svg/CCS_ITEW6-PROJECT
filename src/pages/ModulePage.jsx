import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

const MODULES = {
  'student-profile': {
    code: '1.1',
    title: 'Student List',
    description: 'Create and manage student login accounts.',
  },
  'faculty-profile': {
    code: '1.2',
    title: 'Faculty Profile',
    description: 'Maintain faculty information, ranks, and loads.',
  },
  events: {
    code: '1.3',
    title: 'Events',
    description: 'Track academic and college events.',
  },
  scheduling: {
    code: '1.4',
    title: 'Scheduling',
    description: 'Manage classes, rooms, and time slots.',
  },
  'college-research': {
    code: '1.5',
    title: 'College Research',
    description: 'Catalog research outputs and projects.',
  },
  instructions: {
    code: '1.6',
    title: 'Instructions',
    description: 'Syllabus, curriculum, and lesson details.',
  },
}

const MOCK_DATA = {
  'student-profile': [
    { id: 1, name: 'Juan Dela Cruz', meta: 'BSCS • 3rd Year • Active' },
    { id: 2, name: 'Maria Santos', meta: 'BSCS • 2nd Year • Active' },
  ],
  'faculty-profile': [
    { id: 1, name: 'Prof. Maria Santos', meta: 'Full-time • CS Dept.' },
  ],
  events: [
    { id: 1, name: 'CCS Research Colloquium', meta: 'Apr 15, 2026 • Auditorium' },
  ],
  scheduling: [
    { id: 1, name: 'CS101 – Intro to Programming', meta: 'MWF 9:00–10:30 • Lab 2' },
  ],
  'college-research': [
    { id: 1, name: 'AI for Campus Analytics', meta: 'Ongoing • College Research' },
  ],
  instructions: [
    { id: 1, name: 'BSCS Curriculum 2026', meta: 'Updated • Effective AY 26–27' },
  ],
}

export default function ModulePage() {
  const { pathname } = useLocation()
  const moduleId = pathname.slice(1).split('/')[0] || null
  const [search, setSearch] = useState('')
  const [role, setRole] = useState(null)
  const module = moduleId ? MODULES[moduleId] : null
  const items = MOCK_DATA[moduleId] ?? []

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q)
    )
  }, [items, search])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('authUser')
      const user = raw ? JSON.parse(raw) : null
      setRole(user?.role || null)
    } catch {
      setRole(null)
    }
  }, [])

  const moduleLabel =
    moduleId === 'student-profile' && role !== 'admin' ? 'Student Profile' : module?.title
  const moduleDescription =
    moduleId === 'student-profile' && role !== 'admin'
      ? 'View and manage comprehensive student records.'
      : module?.description

  if (!module) {
    return (
      <div className="module-page">
        <p className="empty-state">Module not found.</p>
      </div>
    )
  }

  return (
    <div className="module-page">
      <header className="module-header">
        <div>
          <h1 className="main-title">
            {module.code} {moduleLabel}
          </h1>
          <p className="main-description">{moduleDescription}</p>
        </div>
        <div className="header-actions">
          <div className="search-section">
            <input
              className="search-input"
              type="text"
              placeholder={`Search ${moduleLabel}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-primary">+ Add New</button>
        </div>
      </header>

      <section className="content-panel">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name / Title</th>
                <th>Details</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan="4" className="empty-state">
                    No records match your search.
                  </td>
                </tr>
              )}
              {filteredItems.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.name}</td>
                  <td>{item.meta}</td>
                  <td>
                    <span className="status-pill status-active">Active</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
