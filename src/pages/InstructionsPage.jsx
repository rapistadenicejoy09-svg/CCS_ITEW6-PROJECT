import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGetInstructions, apiDeleteInstruction } from '../lib/api'

function getRole() {
  try { return JSON.parse(localStorage.getItem('authUser'))?.role } catch { return null }
}

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  )
}

function IconCurriculum() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
      <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
    </svg>
  )
}

function IconSyllabus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  )
}

function IconLesson() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  )
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
  )
}

function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
  )
}

function IconFilter() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
    </svg>
  )
}

export default function InstructionsPage() {
  const [activeTab, setActiveTab] = useState('curriculum')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  
  const [showFilters, setShowFilters] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')

  const [instructions, setInstructions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const isAdmin = getRole() === 'admin'

  const fetchInstructions = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('authToken')
      const res = await apiGetInstructions(token)
      setInstructions(res.instructions || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInstructions()
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to archive this material?')) return
    try {
      const token = localStorage.getItem('authToken')
      await apiDeleteInstruction(token, id)
      fetchInstructions()
    } catch (err) {
      alert(err.message)
    }
  }

  const tabs = [
    { id: 'curriculum', label: 'Curriculums', icon: <IconCurriculum /> },
    { id: 'syllabus', label: 'Course Syllabi', icon: <IconSyllabus /> },
    { id: 'lesson', label: 'Lesson Modules', icon: <IconLesson /> }
  ]

  const uniqueAuthors = useMemo(() => {
    return [...new Set(instructions.filter(item => item.type === activeTab).map(i => i.author))].sort()
  }, [activeTab, instructions])

  const filteredItems = useMemo(() => {
    return instructions.filter((item) => {
      const matchTab = item.type === activeTab
      const matchSearch = item.title.toLowerCase().includes(search.toLowerCase()) || item.description.toLowerCase().includes(search.toLowerCase())
      const matchStatus = filterStatus ? item.status === filterStatus : true
      const matchAuthor = filterAuthor ? item.author === filterAuthor : true
      return matchTab && matchSearch && matchStatus && matchAuthor
    })
  }, [search, activeTab, filterStatus, filterAuthor, instructions])

  return (
    <div className="module-page">
      <div className="w-full space-y-6">
        
        {/* Header Section */}
        <header className="module-header flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">
              Instructions
            </h1>
            <p className="main-description text-[var(--text-muted)] mt-1">
              Browse and manage academic curriculums, course syllabi, and interactive lesson modules.
            </p>
          </div>
          {isAdmin && (
            <Link
              to="/admin/instructions/add"
              className="mt-4 md:mt-0 font-medium transition-all text-sm px-6 py-2.5 rounded-full hover:shadow-lg"
              style={{ background: 'var(--accent)', color: 'white', border: '1px solid var(--accent-soft)' }}
            >
              + Add Material
            </Link>
          )}
        </header>

        {/* Tab & Search Bar Section */}
        <section className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-5 shadow-sm space-y-5 flex flex-col">
          <div className="flex flex-col xl:flex-row gap-4 justify-between xl:items-center">
            
            {/* Tabs */}
            <div className="flex w-full xl:w-auto p-1 bg-[rgba(0,0,0,0.2)] dark:bg-[rgba(255,255,255,0.03)] border border-[var(--border-color)] rounded-lg overflow-x-auto hide-scrollbar shrink-0">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id)
                      setSearch('')
                      setFilterStatus('')
                      setFilterAuthor('')
                    }}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                      isActive 
                        ? 'bg-[var(--accent)] text-white shadow-md' 
                        : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.05)]'
                    }`}
                  >
                    {tab.icon && <span className={isActive ? 'opacity-100' : 'opacity-70'}>{tab.icon}</span>}
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Search Input & View Toggle */}
            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
              <div className="relative flex-1 min-w-[200px] xl:w-[280px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                  <IconSearch />
                </div>
                <input 
                  type="text"
                  placeholder={`Search ${tabs.find(t => t.id === activeTab)?.label.toLowerCase()}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="search-input w-full !pl-10"
                />
              </div>

              {/* View & Filter Toggles */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`btn btn-compact flex items-center justify-center gap-1.5 !px-3 !py-1.5 ${(showFilters || filterStatus || filterAuthor) ? 'btn-primary' : 'btn-secondary'}`}
                  title="Filter Materials"
                >
                  <IconFilter />
                  <span className="text-xs font-semibold hidden md:inline">Filters</span>
                </button>
                <div className="w-[1px] h-6 bg-[rgba(255,255,255,0.1)] mx-1"></div>
                <button
                  onClick={() => setViewMode('list')}
                  className={`btn btn-compact flex items-center justify-center !p-1.5 ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                  title="List View"
                >
                  <IconList />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`btn btn-compact flex items-center justify-center !p-1.5 ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                  title="Grid View"
                >
                  <IconGrid />
                </button>
              </div>
            </div>

          </div>

          {/* Filter Drawer */}
          {showFilters && (
            <div className="pt-5 mt-1 border-t border-[var(--border-color)] flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="flex flex-col gap-1.5 w-full md:w-[200px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Status</span>
                <select
                  className="search-input w-full !rounded-md !py-2"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Draft">Draft</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5 w-full md:w-[200px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Author</span>
                <select
                  className="search-input w-full !rounded-md !py-2"
                  value={filterAuthor}
                  onChange={(e) => setFilterAuthor(e.target.value)}
                >
                  <option value="">All Authors</option>
                  {uniqueAuthors.map(author => (
                    <option key={author} value={author}>{author}</option>
                  ))}
                </select>
              </label>

              {(filterStatus || filterAuthor) && (
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setFilterStatus('')
                      setFilterAuthor('')
                    }}
                    className="px-5 py-2 rounded-full border border-[var(--border-color)] bg-transparent hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text)] text-sm font-medium transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Results */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-16 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)]">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-[var(--accent)]" />
            </div>
          ) : error ? (
            <div className="p-6 text-center bg-rose-500/10 border border-rose-500/20 rounded-[var(--radius-lg)]">
              <p className="text-rose-400 text-sm font-semibold">{error}</p>
              <button onClick={fetchInstructions} className="mt-3 text-xs text-[var(--accent)] hover:underline">Try again</button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center p-12 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)]">
              <p className="text-[var(--text-muted)] text-sm font-semibold">No materials found.</p>
              <p className="text-[var(--text-muted)] text-xs mt-1 opacity-70">
                {instructions.length === 0 ? 'No materials have been added yet.' : 'Try adjusting your search or filters.'}
              </p>
            </div>
          ) : (
             <>
               {/* GRID VIEW */}
               {viewMode === 'grid' && (
                 <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                   {filteredItems.map((item) => (
                     <div key={item.id} className="group relative flex flex-col bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent)] rounded-[var(--radius-md)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_24px_-8px_rgba(229,118,47,0.2)]">
                        
                        {/* Card Top / Banner */}
                        <div className="h-1 bg-[rgba(255,255,255,0.05)] w-full">
                           <div className="h-full bg-gradient-to-r from-[var(--accent)] to-[rgba(229,118,47,0.4)] w-1/3 opacity-0 group-hover:opacity-100 transition-all duration-500 rounded-r-full"></div>
                        </div>

                        <div className="p-5 flex flex-col flex-1 gap-3">
                          <div className="flex justify-between items-start">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                              item.type === 'curriculum' 
                                ? 'bg-blue-100/10 text-blue-400 border border-blue-400/20'
                                : item.type === 'syllabus'
                                ? 'bg-emerald-100/10 text-emerald-400 border border-emerald-400/20'
                                : 'bg-purple-100/10 text-purple-400 border border-purple-400/20'
                            }`}>
                              {item.type}
                            </span>
                            
                            <span className={`text-[10px] font-semibold flex items-center gap-1.5 ${item.status === 'Active' ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'Active' ? 'bg-emerald-500' : 'bg-[var(--text-muted)]'}`}></span>
                              {item.status}
                            </span>
                          </div>

                          <div className="mt-1">
                            <h3 className="text-[var(--text)] font-bold text-lg mb-1.5 leading-snug">{item.title}</h3>
                            <p className="text-[var(--text-muted)] text-xs leading-relaxed line-clamp-2">
                              {item.description}
                            </p>
                          </div>

                          <div className="mt-auto pt-4 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                            <div className="flex flex-col">
                              <span className="uppercase text-[9px] tracking-wider font-semibold opacity-70">Author</span>
                              <span className="font-medium text-[var(--text)]">{item.author}</span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="uppercase text-[9px] tracking-wider font-semibold opacity-70">Last Updated</span>
                              <span className="font-medium">{new Date(item.updated_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Card Actions Footer */}
                        <div className="px-5 py-3 bg-[rgba(0,0,0,0.15)] dark:bg-[rgba(255,255,255,0.02)] border-t border-[var(--border-color)] flex justify-between items-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                           {isAdmin ? (
                             <button onClick={() => handleDelete(item.id)} className="text-[var(--text-muted)] hover:text-rose-400 text-[11px] font-semibold transition-colors">
                               Archive
                             </button>
                           ) : (
                             <div></div>
                           )}
                           <Link to={`/admin/instructions/${item.id}`} className="flex items-center gap-1.5 text-[var(--accent)] hover:text-[var(--text)] bg-[var(--accent-soft)] hover:bg-[var(--accent)] px-3 py-1.5 rounded-md text-[11px] font-bold transition-all">
                             <IconDownload /> View / Download
                           </Link>
                        </div>

                     </div>
                   ))}
                 </div>
               )}

               {/* LIST VIEW */}
               {viewMode === 'list' && (
                 <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm">
                   <div className="overflow-x-auto">
                     <table className="w-full text-left text-sm whitespace-nowrap">
                       <thead className="bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] border-b border-[var(--border-color)] text-[var(--text-muted)] text-[10px] uppercase tracking-widest font-bold">
                         <tr>
                           <th className="px-6 py-4">Title & Description</th>
                           <th className="px-6 py-4">Type</th>
                           <th className="px-6 py-4">Author</th>
                           <th className="px-6 py-4 text-center">Status</th>
                           <th className="px-6 py-4 text-right">Last Updated</th>
                           <th className="px-6 py-4 text-right">Actions</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-[var(--border-color)]">
                         {filteredItems.map((item) => (
                           <tr key={item.id} className="hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.01)] transition-colors">
                             <td className="px-6 py-4">
                               <div className="flex flex-col max-w-[300px]">
                                 <span className="font-bold text-[var(--text)] text-sm truncate">{item.title}</span>
                                 <span className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">{item.description}</span>
                               </div>
                             </td>
                             <td className="px-6 py-4">
                               <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                                 item.type === 'curriculum' 
                                   ? 'bg-blue-100/10 text-blue-400 border border-blue-400/20'
                                   : item.type === 'syllabus'
                                   ? 'bg-emerald-100/10 text-emerald-400 border border-emerald-400/20'
                                   : 'bg-purple-100/10 text-purple-400 border border-purple-400/20'
                               }`}>
                                 {item.type}
                               </span>
                             </td>
                             <td className="px-6 py-4 text-[var(--text)] text-xs font-medium">
                               {item.author}
                             </td>
                             <td className="px-6 py-4 text-center">
                               <span className={`text-[10px] font-semibold flex flex-row items-center justify-center gap-1.5 ${item.status === 'Active' ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                                 <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'Active' ? 'bg-emerald-500' : 'bg-[var(--text-muted)]'}`}></span>
                                 {item.status}
                               </span>
                             </td>
                             <td className="px-6 py-4 text-right text-[11px] text-[var(--text-muted)] font-medium">
                               {new Date(item.updated_at).toLocaleDateString()}
                             </td>
                             <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                                {isAdmin && (
                                  <button onClick={() => handleDelete(item.id)} className="text-[var(--text-muted)] hover:text-rose-400 text-[11px] font-semibold transition-colors">
                                    Archive
                                  </button>
                                )}
                                <Link to={`/admin/instructions/${item.id}`} className="flex items-center w-fit gap-1.5 text-[var(--accent)] hover:text-[var(--text)] bg-[var(--accent-soft)] hover:bg-[var(--accent)] px-3 py-1.5 rounded-md text-[11px] font-bold transition-all">
                                  <IconDownload /> View
                                </Link>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 </div>
               )}
             </>
          )}
        </div>

      </div>
    </div>
  )
}
