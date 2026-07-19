import { useEffect, useState, useMemo } from 'react'
import { apiGetSubjects, apiCreateSubject, apiDeleteSubject } from '../lib/api'

import { COURSE_OPTIONS, YEAR_OPTIONS, SEMESTER_OPTIONS, getExpectedCodes } from '../lib/curriculum'

const FILTER_COURSE_OPTIONS = ['All', ...COURSE_OPTIONS]
const FILTER_YEAR_OPTIONS = ['All', ...YEAR_OPTIONS]
const FILTER_SEMESTER_OPTIONS = ['All', ...SEMESTER_OPTIONS]

export default function FacultySubjects() {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const token = localStorage.getItem('authToken')

  // Form states
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [credits, setCredits] = useState(3)
  
  // Search & Filter states
  const [search, setSearch] = useState('')
  const [filterCourse, setFilterCourse] = useState('All')
  const [filterYear, setFilterYear] = useState('All')
  const [filterSemester, setFilterSemester] = useState('All')

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
    const trimmedCode = code.trim()
    const trimmedName = name.trim()
    const parsedCredits = Number(credits)

    if (!trimmedCode || !trimmedName) return alert('Code and Name are required.')
    if (parsedCredits <= 0 || isNaN(parsedCredits)) return alert('Credits must be a positive number.')
    
    // Prevent exactly identical code on frontend to avoid user confusion
    if (subjects.some(s => s.code.toLowerCase() === trimmedCode.toLowerCase())) {
        return alert(`Subject with code ${trimmedCode} already exists in the list!`)
    }

    try {
      const res = await apiCreateSubject(token, { code: trimmedCode, name: trimmedName, credits: parsedCredits })
      setSubjects([...subjects, res.subject])
      setCode('')
      setName('')
      setCredits(3)
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(id) {
    const subjectToDelete = subjects.find(s => s.id === id)
    if (!confirm(`Delete subject ${subjectToDelete?.code || ''} from the master list? This may affect assigned teaching loads.`)) return
    try {
      await apiDeleteSubject(token, id)
      setSubjects(subjects.filter(s => s.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  const filteredSubjects = useMemo(() => {
      let result = subjects;

      // Filter by curriculum dropdowns
      if (filterCourse !== 'All' || filterYear !== 'All' || filterSemester !== 'All') {
         const allowedCodes = getExpectedCodes(filterCourse, filterYear, filterSemester);
         result = result.filter(s => allowedCodes.has(s.code.toLowerCase()));
      }

      // Filter by text search
      if (search.trim()) {
        const q = search.toLowerCase();
        result = result.filter(s => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
      }
      return result;
  }, [subjects, search, filterCourse, filterYear, filterSemester])

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Master Subjects...</div>

  return (
    <div className="module-page">
      <header className="module-header flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h1 className="main-title font-extrabold text-[var(--text)]">Master Subjects</h1>
          <p className="main-description text-[var(--text-muted)] mt-1">Admin-only: Create and manage the college curriculum reference list.</p>
        </div>
        <div className="badge-enrolled mt-4 md:mt-0">
           {subjects.length} Total Subjects
        </div>
      </header>

      <div className="content-panel shadow-sm">
        <div className="content-header !pb-2 border-b-0">
          <h3 className="content-title text-lg">Register New Subject</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4 mt-4 bg-[rgba(0,0,0,0.01)] p-4 rounded-xl border border-[var(--border-color)]">
          <div className="lg:col-span-2">
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-1 block ml-1">Subject Code</label>
            <input type="text" className="search-input w-full bg-white dark:bg-[#111] !rounded-lg" placeholder="e.g. COMS 101" value={code} onChange={e => setCode(e.target.value)} />
          </div>
          <div className="lg:col-span-3">
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-1 block ml-1">Descriptive Title</label>
            <input type="text" className="search-input w-full bg-white dark:bg-[#111] !rounded-lg" placeholder="Full Subject Name" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="lg:col-span-1">
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-1 block ml-1">Units</label>
            <input type="number" min="1" max="10" className="search-input w-full bg-white dark:bg-[#111] !rounded-lg" value={credits} onChange={e => setCredits(e.target.value)} />
          </div>
          <div className="lg:col-span-1 flex items-end">
            <button onClick={handleAdd} className="btn btn-primary w-full shadow-sm !rounded-lg py-2">Register</button>
          </div>
        </div>
      </div>

      <div className="content-panel mt-6 shadow-sm">
        <div className="content-header flex flex-col items-start gap-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center w-full gap-4">
            <h3 className="content-title whitespace-nowrap">Curriculum Subjects</h3>
            <div className="w-full md:w-64 relative">
               <input
                 type="text"
                 placeholder="Search by code or title..."
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 className="search-input w-full text-sm"
                 style={{ paddingLeft: '32px' }}
               />
               <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full bg-[rgba(0,0,0,0.01)] p-3 rounded-lg border border-[var(--border-color)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Course:</span>
              <select className="search-input text-sm py-1 !rounded-md" value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
                {FILTER_COURSE_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'All Courses' : o}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Year:</span>
              <select className="search-input text-sm py-1 !rounded-md" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
                {FILTER_YEAR_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'All Years' : o}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Sem:</span>
              <select className="search-input text-sm py-1 !rounded-md" value={filterSemester} onChange={e => setFilterSemester(e.target.value)}>
                {FILTER_SEMESTER_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'All Semesters' : o}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm transition-shadow duration-300 hover:shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] border-b border-[var(--border-color)] text-[var(--text-muted)] text-[10px] uppercase tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-4 w-1/4">Subject Code</th>
                  <th className="px-6 py-4 w-1/2">Descriptive Title</th>
                  <th className="px-6 py-4 w-1/6 text-center">Units</th>
                  <th className="px-6 py-4 w-1/6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
              {filteredSubjects.map(s => (
                <tr key={s.id} className="admin-student-list-row hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.01)] transition-colors">
                  <td className="px-6 py-4" style={{ fontWeight: 'bold' }}>
                     <span className="px-2 py-1 bg-[var(--accent-soft)] text-[var(--accent)] rounded border border-[var(--accent)]/10 text-xs">
                        {s.code}
                     </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-sm text-[var(--text)]">{s.name}</td>
                  <td className="px-6 py-4 text-center font-mono text-sm text-[var(--text-muted)] bg-[rgba(0,0,0,0.01)] dark:bg-[rgba(255,255,255,0.01)]">{s.credits}</td>
                  <td className="px-6 py-4 text-right align-middle">
                    <button onClick={() => handleDelete(s.id)} className="btn btn-danger btn-sm">Delete</button>
                  </td>
                </tr>
              ))}
              {filteredSubjects.length === 0 && (
                <tr><td colSpan="4" className="px-6 py-12 text-center text-[var(--text-muted)] text-sm">No subjects found matching your criteria.</td></tr>
              )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
