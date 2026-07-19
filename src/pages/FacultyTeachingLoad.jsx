import { useEffect, useState, useMemo } from 'react'
import { apiGetTeachingLoads, apiDeleteTeachingLoad, apiFacultyDirectory } from '../lib/api'

export default function FacultyTeachingLoad() {
  const token = localStorage.getItem('authToken')
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewingFacultyId, setViewingFacultyId] = useState(null)

  const [allFaculty, setAllFaculty] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const authRaw = localStorage.getItem('authUser')
        const user = authRaw ? JSON.parse(authRaw) : null
        const isAdmin = ['admin', 'dean', 'department_chair', 'secretary'].includes(user?.role)

        const [lRes, fRes] = await Promise.all([
          apiGetTeachingLoads(token),
          isAdmin ? apiFacultyDirectory(token) : Promise.resolve({ faculty: [] })
        ])
        setLoads(lRes.teachingLoads)
        if (isAdmin) {
          setAllFaculty(fRes.faculty || [])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleDropSubject(id) {
    if (!confirm('Are you sure you want to drop this subject? It will set the schedule\'s instructor to TBA.')) return
    try {
      await apiDeleteTeachingLoad(token, id)
      // Re-fetch loads to reflect the dropped subject
      const lRes = await apiGetTeachingLoads(token)
      setLoads(lRes.teachingLoads)
    } catch (err) {
      alert(err.message)
    }
  }

  const facultyGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const filtered = loads.filter(l => {
        if (!q) return true
        const fac = allFaculty.find(f => String(f.id) === String(l.faculty_id))
        const facultyName = (fac ? (fac.full_name || fac.displayName) : (l.faculty_name || '')).toLowerCase()
        const subjectCode = (l.subject?.code || '').toLowerCase()
        const subjectName = (l.subject?.name || '').toLowerCase()
        return facultyName.includes(q) || subjectCode.includes(q) || subjectName.includes(q)
    })

    const groups = {}
    filtered.forEach(l => {
      const facId = String(l.faculty_id || 'unknown')
      if (!groups[facId]) {
         groups[facId] = {
            faculty_id: facId,
            faculty_name: l.faculty_name || `ID: ${facId}`,
            subjects: [],
            totalUnits: 0
         }
      }
      groups[facId].subjects.push(l)
      groups[facId].totalUnits += Number(l.subject?.credits || 0)
    })
    Object.values(groups).forEach(g => {
       const fac = allFaculty.find(f => String(f.id) === String(g.faculty_id))
       if (fac) g.faculty_name = fac.full_name || fac.displayName || g.faculty_name
    })

    return Object.values(groups).sort((a,b) => a.faculty_name.localeCompare(b.faculty_name))
  }, [loads, searchQuery, allFaculty])

  const activeFacultyGroup = useMemo(() => {
     if (!viewingFacultyId) return null
     return facultyGroups.find(g => String(g.faculty_id) === String(viewingFacultyId)) || null
  }, [viewingFacultyId, facultyGroups])

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading Teaching Load...</div>

  return (
    <div className="module-page">
      <style>{`
        @media print {
          .no-print, header, .sidebar, .top-nav, .btn, .assign-form-container, .auth-field, select, button { display: none !important; }
          .content-area { margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
          .data-table { border-collapse: collapse !important; width: 100% !important; border: 1px solid #ddd !important; }
          .data-table th, .data-table td { border: 1px solid #ddd !important; padding: 8px !important; text-align: left !important; }
          .content-panel { border: none !important; margin-bottom: 20px !important; box-shadow: none !important; }
          body { background: white !important; font-size: 11pt !important; }
          .main-title { font-size: 18pt !important; margin-bottom: 5px !important; }
          .status-badge { border: 1px solid #999 !important; color: black !important; }
        }
      `}</style>

      <header className="module-header flex flex-wrap justify-between items-center gap-4 no-print">
        <div>
          <h1 className="main-title font-extrabold text-[var(--text)]">Teaching Load View</h1>
          <p className="main-description text-[var(--text-muted)] mt-1">View teaching load assignments auto-generated from schedules.</p>
        </div>
        <div className="flex items-center gap-4">
           <div className="relative">
             <input 
               type="text" 
               placeholder="Search faculty or subject..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="search-input !w-[300px] !pl-10"
               style={{ borderRadius: 'var(--radius-lg)' }}
             />
             <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
             </svg>
             </div>
          </div>
        </header>

        <div className="mt-8">
          {facultyGroups.length === 0 ? (
          <div className="content-panel text-center p-12">
            <p className="text-[var(--text-muted)] text-sm">No teaching loads assigned yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
             {facultyGroups.map(fg => (
                 <div key={fg.faculty_id} className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                     <div className="flex items-center gap-4 mb-4">
                         <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-xl font-bold text-[var(--accent)] border border-[var(--accent)]/20 uppercase">
                             {fg.faculty_name.charAt(0)}
                         </div>
                         <div>
                             <h3 className="font-bold text-[var(--text)]">{fg.faculty_name}</h3>
                             <p className={`text-xs font-semibold ${fg.totalUnits > 18 ? 'text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full inline-flex mt-1 animate-pulse' : 'text-[var(--accent)]'}`}>
                               {fg.totalUnits} Units Total
                               {fg.totalUnits > 18 && <span className="ml-1 font-bold">— OVERLOADED</span>}
                             </p>
                         </div>
                     </div>
                     <div className="flex justify-between items-center mt-6 pt-4 border-t border-[var(--border-color)]">
                         <span className="text-xs font-bold text-[var(--text-muted)] bg-[rgba(0,0,0,0.03)] px-3 py-1 rounded-full border border-black/5 dark:border-white/5">{fg.subjects.length} Subjects</span>
                         <button onClick={() => setViewingFacultyId(fg.faculty_id)} className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] px-3 py-1.5 rounded-lg transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            View Load
                         </button>
                     </div>
                 </div>
             ))}
          </div>
        )}
      </div>

      {activeFacultyGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center bg-[rgba(0,0,0,0.02)]">
               <div>
                  <h2 className="text-xl font-extrabold text-[var(--text)] tracking-tight flex items-center gap-2">
                     Teaching Load
                     {activeFacultyGroup.totalUnits > 18 && (
                        <span className="text-[10px] bg-rose-100 text-rose-700 uppercase tracking-widest font-black px-2 py-0.5 rounded-full border border-rose-200 shadow-sm animate-pulse">Overload Detected</span>
                     )}
                  </h2>
                  <p className={`text-sm font-semibold mt-0.5 ${activeFacultyGroup.totalUnits > 18 ? 'text-rose-600' : 'text-[var(--accent)]'}`}>
                     {activeFacultyGroup.faculty_name} &bull; {activeFacultyGroup.totalUnits} Units
                  </p>
               </div>
               <button onClick={() => setViewingFacultyId(null)} className="p-2 hover:bg-[rgba(0,0,0,0.05)] rounded-full text-[var(--text-muted)] transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
               </button>
            </div>
            
            <div className="overflow-y-auto w-full">
               <div className="p-0 table-wrapper border-0 pb-12">
                 <table className="data-table w-full">
                   <thead className="bg-[rgba(0,0,0,0.02)] sticky top-0 z-10 backdrop-blur-md">
                     <tr>
                       <th className="py-3">Code</th>
                       <th>Subject Name</th>
                       <th>Section</th>
                       <th>Semester</th>
                       <th>Schedule</th>
                       <th>Units</th>
                       <th style={{ textAlign: 'right' }}>Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-[var(--border-color)]">
                     {activeFacultyGroup.subjects.map(l => (
                       <tr key={l.id} className={`hover:bg-[rgba(0,0,0,0.01)] transition-colors ${l.is_virtual ? 'opacity-80' : ''}`}>
                         <td style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                           <span className="px-2 py-1 bg-[var(--accent-soft)] text-[var(--accent)] rounded border border-[var(--accent)]/10 text-xs">
                             {l.subject?.code}
                           </span>
                           {l.is_virtual && <span className="ml-2 px-1.5 py-0.5 bg-[var(--background)] border border-[var(--border-color)] rounded-[4px] text-[10px] uppercase tracking-tighter opacity-70">Schedule Only</span>}
                         </td>
                         <td className="font-medium">{l.subject?.name}</td>
                         <td>
                           <span className="px-2 py-0.5 bg-[var(--background)] border border-[var(--border-color)] rounded text-xs font-semibold">
                             {l.section_id || l.section}
                           </span>
                         </td>
                         <td className="text-xs font-semibold text-[var(--text-muted)]">
                            {l.semester || 'Unassigned'}
                         </td>
                         <td className="text-xs">
                           {l.schedule_info ? (
                             <div className="flex flex-col">
                               <span className="font-bold text-[var(--accent)]">{l.schedule_info.day}</span>
                               <span className="text-[var(--text-muted)] text-[10px]">{l.schedule_info.time}</span>
                               <span className="text-[var(--text-muted)] text-[10px] italic">{l.schedule_info.room}</span>
                             </div>
                           ) : (
                             <span className="text-[var(--text-muted)] italic">No schedule linked</span>
                           )}
                         </td>
                         <td className="text-[var(--text-muted)] font-mono">{l.subject?.credits || 0}</td>
                         <td style={{ textAlign: 'right' }}>
                           <button onClick={() => handleDropSubject(l.id)} className="text-xs px-3 py-1.5 rounded transition border bg-rose-50/50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 border-rose-200">Drop</button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
