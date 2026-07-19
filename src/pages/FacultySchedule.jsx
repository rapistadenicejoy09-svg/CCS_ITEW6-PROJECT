import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSchedules, DAYS, parseMinutes, buildTimeSlots, calculateTimetableTracks, formatCohortLabel } from '../lib/schedulingStore'

const DAY_STYLE = {
  Monday: { pill: 'bg-sky-100/15 text-sky-400 border-sky-400/25', bar: 'from-sky-500 to-sky-500/30', bg: '#1e3a8a' },
  Tuesday: { pill: 'bg-violet-100/15 text-violet-400 border-violet-400/25', bar: 'from-violet-500 to-violet-500/30', bg: '#5b21b6' },
  Wednesday: { pill: 'bg-emerald-100/15 text-emerald-400 border-emerald-400/25', bar: 'from-emerald-500 to-emerald-500/30', bg: '#065f46' },
  Thursday: { pill: 'bg-amber-100/15 text-amber-400 border-amber-400/25', bar: 'from-amber-500 to-amber-500/30', bg: '#92400e' },
  Friday: { pill: 'bg-rose-100/15 text-rose-400 border-rose-400/25', bar: 'from-rose-500 to-rose-500/30', bg: '#9f1239' },
  Saturday: { pill: 'bg-cyan-100/15 text-cyan-400 border-cyan-400/25', bar: 'from-cyan-500 to-cyan-500/30', bg: '#155e75' },
}

function normalizeText(v) { return String(v || '').trim().toLowerCase() }

function IconSearch() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
}
function IconFilter() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
}
function IconGrid() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
}
function IconList() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
}
function IconCalendar() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
}

function IconPrint() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
}

export default function FacultySchedule() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('timetable')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterDay, setFilterDay] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')

  const [me] = useState(() => {
    try {
      const raw = localStorage.getItem('authUser')
      if (!raw) return { id: '', email: '', name: '' }
      const user = JSON.parse(raw)
      const id = String(user?.id ?? user?._id ?? '').trim()
      const email = String(user?.email ?? user?.identifier ?? '').trim().toLowerCase()
      const first = String(user.personal_information?.first_name || user.first_name || '')
      const last = String(user.personal_information?.last_name || user.last_name || '')
      const name = (first || last ? `${first} ${last}`.trim() : '') || String(user.full_name || user.fullName || '').trim()
      return { id, email, name }
    } catch { return { id: '', email: '', name: '' } }
  })
  const instructorName = me?.name || ''

  useEffect(() => {
    async function load() {
      try { setSchedules((await getSchedules()) || []) }
      catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  /* ── Only my schedules ──────────────────────────────────────── */
  const mySchedules = useMemo(() => {
    const myId = String(me?.id || '').trim()
    const myEmail = String(me?.email || '').trim().toLowerCase()
    const idMatch = (s) => myId && String(s.instructorId || '').trim() === myId
    const emailMatch = (s) => myEmail && String(s.instructorEmail || '').trim().toLowerCase() === myEmail
    const nameMatch = (s) => {
      if (!instructorName) return false
      const q1 = instructorName.toLowerCase().replace(/[^a-z0-9]/g, '')
      const chunks = instructorName.toLowerCase().split(' ').filter((c) => c.length > 2)
      const inst = String(s.instructor || '').toLowerCase()
      const clean = inst.replace(/[^a-z0-9]/g, '')
      if (clean.includes(q1) || q1.includes(clean)) return true
      return chunks.some((c) => inst.includes(c))
    }
    return schedules.filter((s) => idMatch(s) || emailMatch(s) || nameMatch(s))
  }, [schedules, instructorName, me?.email, me?.id])

  /* ── Unique filter options ─────────────────────────────────── */
  const uniqueCourses = useMemo(() => [...new Set(mySchedules.map((i) => String(i.course || '').trim()).filter(Boolean))].sort(), [mySchedules])
  const uniqueYears = useMemo(() => [...new Set(mySchedules.map((i) => String(i.yearLevel || '').trim()).filter(Boolean))].sort(), [mySchedules])
  const uniqueSections = useMemo(() => {
    const s = new Set()
    mySchedules.forEach((i) => { 
      const val = String(i.section || '').trim().toUpperCase()
      if (val) s.add(val) 
    })
    return Array.from(s).sort()
  }, [mySchedules])

  /* ── Filtered list ─────────────────────────────────────────── */
  const scopedSchedules = useMemo(() => {
    const c = normalizeText(courseFilter)
    const y = normalizeText(yearFilter)
    const s = normalizeText(sectionFilter)
    return mySchedules.filter((item) => {
      let ic = normalizeText(item.course)
      if (ic.includes('computer science') || ic === 'cs') ic = 'bscs'
      if (ic.includes('information tech') || ic === 'it') ic = 'bsit'
      if (c && ic !== c) return false
      if (y && normalizeText(item.yearLevel) !== y) return false
      if (s && normalizeText(item.section) !== s) return false
      return true
    })
  }, [courseFilter, mySchedules, sectionFilter, yearFilter])

  const dayScoped = useMemo(() =>
    filterDay ? scopedSchedules.filter((i) => i.day === filterDay) : scopedSchedules,
    [filterDay, scopedSchedules])

  const visibleSchedules = useMemo(() => {
    const q = search.trim().toLowerCase()
    return dayScoped
      .filter((item) => {
        if (!q) return true
        return [item.subjectCode, item.subjectTitle, item.instructor, item.room, item.day, item.course, item.yearLevel, item.section]
          .map((x) => String(x || '').toLowerCase()).join(' ').includes(q)
      })
      .sort((a, b) => {
        const d = DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
        return d !== 0 ? d : parseMinutes(a.startTime) - parseMinutes(b.startTime)
      })
  }, [dayScoped, search])

  const hasActiveFilters = Boolean(search.trim() || courseFilter || yearFilter || sectionFilter || filterDay)

  /* ── Timetable ─────────────────────────────────────────────── */
  const hourSlots = useMemo(() => buildTimeSlots(6, 22), [])
  const timetableData = useMemo(() => calculateTimetableTracks(visibleSchedules), [visibleSchedules])
  const dayTracks = useMemo(() => {
    const counts = {}
    DAYS.forEach((d) => (counts[d] = 1))
    timetableData.forEach((item) => { counts[item.day] = Math.max(counts[item.day], item.totalCols || 1) })
    return counts
  }, [timetableData])

  if (loading) {
    return (
      <div className="module-page">
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
            <span className="text-sm font-medium">Loading schedule…</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="module-page">
      <div className="w-full space-y-6">

        {/* Header */}
        <header className="module-header flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 admin-student-list-header-enter">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">My Assigned Schedule</h1>
            <p className="main-description text-[var(--text-muted)] mt-1 max-w-2xl">
              Your official weekly class schedule assigned by the administrator.{' '}
              Showing classes for{' '}
              <strong className="text-[var(--text)]">{instructorName || me?.email || 'Unknown Faculty'}</strong>.
            </p>
          </div>
          <button 
            onClick={() => window.print()} 
            className="btn btn-secondary flex items-center gap-2 no-print shadow-sm"
          >
            <IconPrint />
            Print Schedule
          </button>
        </header>

        {/* Toolbar */}
        <section className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-5 md:p-6 shadow-sm space-y-5 flex flex-col admin-student-list-toolbar-enter no-print">
          <div className="flex flex-col xl:flex-row gap-4 xl:items-center">
            {/* Search */}
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                <IconSearch />
              </div>
              <input
                type="text"
                placeholder="Search code, title, instructor, room…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input w-full !pl-10"
              />
            </div>

            {/* View + Filter controls */}
            <div className="flex items-center gap-1 shrink-0 justify-end">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`btn btn-compact flex items-center justify-center gap-1.5 !px-3 !py-1.5 ${showFilters || hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
                title="Filters"
              >
                <IconFilter />
                <span className="text-xs font-semibold hidden md:inline">Filters</span>
              </button>
              <div className="w-[1px] h-6 bg-[rgba(255,255,255,0.1)] mx-1" />
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`btn btn-compact flex items-center justify-center !p-1.5 ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                title="List view"
              >
                <IconList />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`btn btn-compact flex items-center justify-center !p-1.5 ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                title="Grid view"
              >
                <IconGrid />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('timetable')}
                className={`btn btn-compact flex items-center justify-center !p-1.5 ${viewMode === 'timetable' ? 'btn-primary' : 'btn-secondary'}`}
                title="Weekly timetable"
              >
                <IconCalendar />
              </button>
            </div>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="pt-5 mt-1 border-t border-[var(--border-color)] flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="flex flex-col gap-1.5 w-full md:w-[200px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Program</span>
                <select className="search-input w-full !rounded-md !py-2 appearance-none" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                  <option value="">All programs</option>
                  {uniqueCourses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 w-full md:w-[200px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Year level</span>
                <select className="search-input w-full !rounded-md !py-2 appearance-none" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                  <option value="">All years</option>
                  {uniqueYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 w-full md:w-[200px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Section</span>
                <select className="search-input w-full !rounded-md !py-2 appearance-none" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
                  <option value="">All sections</option>
                  {uniqueSections.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 w-full md:w-[180px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Day</span>
                <select className="search-input w-full !rounded-md !py-2 appearance-none" value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
                  <option value="">All days</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              {hasActiveFilters && (
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setCourseFilter(''); setYearFilter(''); setSectionFilter(''); setFilterDay('') }}
                    className="px-5 py-2 rounded-full border border-[var(--border-color)] bg-transparent hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text)] text-sm font-medium transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Content */}
        <section className="space-y-4 admin-student-list-section-enter print:hidden">
          <h2 className="text-xl font-bold px-1 flex items-center gap-2 text-[var(--text)] flex-wrap">
            <span className="w-6 h-[2px] bg-[var(--accent)]" />
            {viewMode === 'timetable' ? 'Weekly timetable' : 'Class schedules'}
            {visibleSchedules.length > 0 && (
              <span className="px-2 py-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-full text-xs">
                {visibleSchedules.length}
              </span>
            )}
          </h2>

          {visibleSchedules.length === 0 ? (
            <div className="text-center p-12 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] admin-animate-reveal transition-shadow duration-300 hover:shadow-md">
              <p className="text-[var(--text-muted)] text-sm font-semibold">No schedules match the current view.</p>
              <p className="text-[var(--text-muted)] text-xs mt-1 opacity-80">
                {mySchedules.length === 0
                  ? 'No classes have been assigned to you yet.'
                  : 'Try clearing filters or using a broader search.'}
              </p>
            </div>
          ) : (
            <>
              {/* GRID view */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                  {visibleSchedules.map((item, idx) => {
                    const ds = DAY_STYLE[item.day] || DAY_STYLE.Monday
                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent)] rounded-[var(--radius-md)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_24px_-8px_rgba(229,118,47,0.2)] admin-student-card-animate"
                        style={{ animationDelay: `${Math.min(idx, 14) * 0.055}s` }}
                      >
                        <div className="h-1 bg-[rgba(255,255,255,0.05)] w-full">
                          <div className={`h-full bg-gradient-to-r ${ds.bar} w-0 group-hover:w-full transition-all duration-500 rounded-r-full opacity-90`} />
                        </div>
                        <div className="p-5 flex flex-col flex-1 gap-3">
                          <div className="flex justify-between items-start gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${ds.pill}`}>
                              {item.day}
                            </span>
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                              {item.startTime} – {item.endTime}
                            </span>
                          </div>
                          <div>
                            <h3 className="text-[var(--text)] font-bold text-lg leading-snug">{item.subjectCode}</h3>
                            <p className="text-[var(--text-muted)] text-xs mt-1 line-clamp-2">{item.subjectTitle}</p>
                          </div>
                          <div className="mt-auto pt-2 flex flex-col gap-2 text-[11px] text-[var(--text-muted)]">
                            <div className="flex justify-between gap-2">
                              <span>
                                <span className="uppercase text-[9px] tracking-wider font-semibold opacity-70 block">Faculty</span>
                                <span className="font-medium text-[var(--text)]">{item.instructor}</span>
                              </span>
                              <span className="text-right">
                                <span className="uppercase text-[9px] tracking-wider font-semibold opacity-70 block">Room</span>
                                <span className="font-medium text-[var(--text)]">{item.room}</span>
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent-soft)] text-[var(--accent)] border border-[rgba(229,118,47,0.15)]">
                                {item.course}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium border border-[var(--border-color)] text-[var(--text)]">
                                {item.yearLevel}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium border border-[var(--border-color)] text-[var(--text)]">
                                {item.semester}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium border border-[var(--border-color)] text-[var(--text)]">
                                Sec {item.section}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="px-5 py-3 bg-[rgba(0,0,0,0.15)] dark:bg-[rgba(255,255,255,0.02)] border-t border-[var(--border-color)] flex justify-end items-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                          <Link
                            to={`/scheduling/${item.id}`}
                            className="px-3 py-1.5 rounded-md border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* LIST view */}
              {viewMode === 'list' && (
                <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm transition-shadow duration-300 hover:shadow-md">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] border-b border-[var(--border-color)] text-[var(--text-muted)] text-[10px] uppercase tracking-widest font-bold">
                        <tr>
                          <th className="px-6 py-4">Subject</th>
                          <th className="px-6 py-4">Faculty</th>
                          <th className="px-6 py-4">Cohort</th>
                          <th className="px-6 py-4">When</th>
                          <th className="px-6 py-4">Room</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)]">
                        {visibleSchedules.map((item, idx) => {
                          const ds = DAY_STYLE[item.day] || DAY_STYLE.Monday
                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.01)] transition-colors admin-student-table-row-enter"
                              style={{ '--row-enter-delay': `${Math.min(idx, 16) * 0.035}s` }}
                            >
                              <td className="px-6 py-4">
                                <div className="flex flex-col max-w-[220px]">
                                  <span className="font-bold text-[var(--text)] text-sm">{item.subjectCode}</span>
                                  <span className="text-[11px] text-[var(--text-muted)] truncate">{item.subjectTitle}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-[var(--text)] text-xs font-medium">{item.instructor}</td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <span className="text-[var(--text)] text-xs font-bold">{item.course}</span>
                                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                    <span>{item.yearLevel}</span>
                                    <span className="w-1 h-1 rounded-full bg-[var(--border-color)]" />
                                    <span>{item.semester}</span>
                                    <span className="w-1 h-1 rounded-full bg-[var(--border-color)]" />
                                    <span className="font-semibold text-[var(--accent)]">Sec {item.section}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${ds.pill}`}>
                                  {item.day}
                                </span>
                                <div className="text-[11px] text-[var(--text-muted)] mt-1 font-medium">
                                  {item.startTime} – {item.endTime}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-xs font-semibold text-[var(--text)]">{item.room}</td>
                              <td className="px-6 py-4 text-right">
                                <Link
                                  to={`/scheduling/${item.id}`}
                                  className="px-3 py-1.5 rounded-md border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:border(--accent)]"
                                >
                                  View
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TIMETABLE view */}
              {viewMode === 'timetable' && (
                <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden">
                  <div
                    id="timetable-container"
                    className="overflow-x-auto custom-scrollbar active:cursor-grabbing cursor-grab select-none"
                    onMouseDown={(e) => { const el = e.currentTarget; el.dataset.isDragging = 'true'; el.dataset.startX = e.pageX - el.offsetLeft; el.dataset.scrollLeft = el.scrollLeft }}
                    onMouseMove={(e) => { const el = e.currentTarget; if (el.dataset.isDragging !== 'true') return; e.preventDefault(); el.scrollLeft = Number(el.dataset.scrollLeft) - (e.pageX - el.offsetLeft - Number(el.dataset.startX)) * 2 }}
                    onMouseUp={(e) => (e.currentTarget.dataset.isDragging = 'false')}
                    onMouseLeave={(e) => (e.currentTarget.dataset.isDragging = 'false')}
                  >
                    <div
                      className="relative grid"
                      style={{
                        gridTemplateColumns: `80px ${DAYS.map((d) => `minmax(${dayTracks[d] * 66}px, 1fr)`).join(' ')}`,
                        gridTemplateRows: `40px repeat(${hourSlots.length}, 48px)`,
                        width: 'max-content',
                        minWidth: '100%',
                      }}
                    >
                      {/* Headers */}
                      <div className="sticky top-0 z-30 bg-[var(--card-bg)] border-b border-[var(--border-color)] flex items-center justify-center font-bold text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-r">Time</div>
                      {DAYS.map((day) => (
                        <div key={day} className="sticky top-0 z-30 bg-[var(--card-bg)] border-b border-[var(--border-color)] flex items-center justify-center font-bold text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-r border-[var(--border-color)]/30 last:border-r-0">{day}</div>
                      ))}

                      {/* Grid background */}
                      {hourSlots.map((slot, sIdx) => (
                        <div key={`row-${slot.key}`} className="contents">
                          <div
                            style={{ gridRow: sIdx + 2, gridColumn: 1 }}
                            className="sticky left-0 z-20 bg-[var(--card-bg)] border-r border-[var(--border-color)] flex items-center justify-center text-[9px] font-bold text-[var(--text-muted)] border-b border-[var(--border-color)]/30 px-1 whitespace-nowrap"
                          >
                            {slot.from}-{slot.to}
                          </div>
                          {DAYS.map((day, dIdx) => (
                            <div
                              key={`${day}-${slot.key}`}
                              style={{ gridRow: sIdx + 2, gridColumn: dIdx + 2 }}
                              className="border-b border-[var(--border-color)]/30 border-r border-[var(--border-color)]/30 last:border-r-0"
                            />
                          ))}
                        </div>
                      ))}

                      {/* Blocks */}
                      {timetableData.map((item) => {
                        const dayIdx = DAYS.indexOf(item.day)
                        if (dayIdx === -1) return null
                        const startMin = parseMinutes(item.startTime)
                        const endMin = parseMinutes(item.endTime)
                        const gridStart = Math.floor((startMin - (6 * 60)) / 30) + 2
                        const gridSpan = Math.max(1, Math.ceil((endMin - startMin) / 30))
                        const blockBg = (DAY_STYLE[item.day] || DAY_STYLE.Monday).bg

                        return (
                          <div
                            key={item.id}
                            style={{
                              gridColumn: dayIdx + 2,
                              gridRow: `${gridStart} / span ${gridSpan}`,
                              marginLeft: `${(item.colIdx / item.totalCols) * 100}%`,
                              width: `${(1 / item.totalCols) * 100}%`,
                              zIndex: 10,
                            }}
                            className="p-[1px] h-full"
                          >
                            <Link
                              to={`/scheduling/${item.id}`}
                              className="w-full h-full flex flex-col items-center justify-center p-2 text-center transition-all hover:brightness-110 active:scale-[0.98] border border-white/10 rounded-sm shadow-sm"
                              style={{ background: blockBg, color: 'white' }}
                            >
                              <p className="font-bold text-[12px] leading-tight mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis w-full">{item.subjectCode}</p>
                              <p className="text-[10px] font-bold opacity-90 mb-0.5">{formatCohortLabel(item.course, item.yearLevel, item.section)}</p>
                              <div className="flex flex-col opacity-90 scale-90 origin-top overflow-hidden">
                                <p className="text-[11px] font-bold mt-0.5 truncate">{item.room}</p>
                                <p className="text-[10px] truncate max-w-full opacity-80">{item.instructor}</p>
                              </div>
                            </Link>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* PRINT ONLY VIEW */}
        <div className="hidden print:block w-full text-black bg-white">
          <div className="mb-4 text-center border-b pb-4 border-gray-300">
            <h1 className="text-2xl font-bold uppercase tracking-widest">Pnc Faculty Schedule</h1>
            <p className="text-sm mt-1">{instructorName || me?.email || 'Unknown Faculty'}</p>
          </div>
          <table className="w-full text-left text-sm border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 p-2 font-bold uppercase tracking-wider">Subject</th>
                <th className="border border-gray-400 p-2 font-bold uppercase tracking-wider">Schedule</th>
                <th className="border border-gray-400 p-2 font-bold uppercase tracking-wider">Room</th>
                <th className="border border-gray-400 p-2 font-bold uppercase tracking-wider">Cohort</th>
              </tr>
            </thead>
            <tbody>
              {visibleSchedules.map(item => (
                <tr key={`print-${item.id}`}>
                  <td className="border border-gray-400 p-2">
                    <div className="font-bold">{item.subjectCode}</div>
                    <div className="text-xs text-gray-700">{item.subjectTitle}</div>
                  </td>
                  <td className="border border-gray-400 p-2">
                    <div className="font-bold">{item.day}</div>
                    <div className="text-xs">{item.startTime} - {item.endTime}</div>
                  </td>
                  <td className="border border-gray-400 p-2 font-semibold">
                    {item.room}
                  </td>
                  <td className="border border-gray-400 p-2">
                    <div className="font-bold">{item.course} {item.yearLevel}</div>
                    <div className="text-xs">Sec {item.section} &bull; {item.semester}</div>
                  </td>
                </tr>
              ))}
              {visibleSchedules.length === 0 && (
                <tr>
                  <td colSpan="4" className="border border-gray-400 p-4 text-center italic text-gray-500">
                    No schedules match the current view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
