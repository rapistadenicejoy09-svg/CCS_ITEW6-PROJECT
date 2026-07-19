import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { hasPermission, PERMISSIONS } from '../lib/security'
import { DAYS, getSchedules, parseMinutes, buildTimeSlots, calculateTimetableTracks, formatCohortLabel } from '../lib/schedulingStore'

const DAY_STYLE = {
  Monday: { pill: 'bg-sky-100/15 text-sky-400 border-sky-400/25', bar: 'from-sky-500 to-sky-500/30' },
  Tuesday: { pill: 'bg-violet-100/15 text-violet-400 border-violet-400/25', bar: 'from-violet-500 to-violet-500/30' },
  Wednesday: { pill: 'bg-emerald-100/15 text-emerald-400 border-emerald-400/25', bar: 'from-emerald-500 to-emerald-500/30' },
  Thursday: { pill: 'bg-amber-100/15 text-amber-400 border-amber-400/25', bar: 'from-amber-500 to-amber-500/30' },
  Friday: { pill: 'bg-rose-100/15 text-rose-400 border-rose-400/25', bar: 'from-rose-500 to-rose-500/30' },
  Saturday: { pill: 'bg-cyan-100/15 text-cyan-400 border-cyan-400/25', bar: 'from-cyan-500 to-cyan-500/30' },
}

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    return user?.role || null
  } catch {
    return null
  }
}

/** Returns the student's course/year/section from their auth profile for auto-filtering */
function getStudentInfo() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    if (!user) return null
    const src = user.summary || user.academic_info || user.academicInfo || {}
    let course = String(src.program || src.course || user.program || user.course || '').trim().toLowerCase()
    if (course === 'bsit' || course === 'it' || course.includes('information tech')) course = 'bsit'
    else if (course === 'bscs' || course === 'cs' || course.includes('computer science')) course = 'bscs'
    const yearLevel = String(src.year_level || src.yearLevel || src.year || user.year_level || user.yearLevel || user.year || '').trim()
    const section = String(user.class_section || src.class_section || src.classSection || src.section || user.classSection || '').trim()
    return { course, yearLevel, section }
  } catch {
    return null
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function formatLabelText(value, fallback) {
  const v = String(value || '').trim()
  return v || fallback
}



function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconFilter() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}

function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

export default function SchedulingPage() {
  const role = getRole()
  const canManage = hasPermission(PERMISSIONS.SCHEDULING_MANAGE)
  const isStudent = role === 'student'

  // For students: pre-populate filters from their profile
  const studentInfo = isStudent ? (getStudentInfo() || {}) : {}

  const [schedules, setSchedules] = useState([])

  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState('timetable')
  const [filterDay, setFilterDay] = useState('')

  const [courseFilter, setCourseFilter] = useState(isStudent ? (studentInfo.course || '') : '')
  const [yearFilter, setYearFilter] = useState(isStudent ? (studentInfo.yearLevel || '') : '')
  const [sectionFilter, setSectionFilter] = useState(isStudent ? (studentInfo.section || '') : '')

  useEffect(() => {
    async function load() {
      const data = await getSchedules()
      setSchedules(data)
    }
    load()
  }, [])

  const uniqueCourses = useMemo(
    () => [...new Set(schedules.map((item) => String(item.course || '').trim()).filter(Boolean))].sort(),
    [schedules],
  )
  const uniqueYears = useMemo(
    () =>
      [...new Set(schedules.map((item) => String(item.yearLevel || '').trim()).filter(Boolean))].sort(),
    [schedules],
  )
  const uniqueSections = useMemo(
    () => [...new Set(schedules.map((item) => String(item.section || '').trim()).filter(Boolean))].sort(),
    [schedules],
  )

  const scopedSchedules = useMemo(() => {
    let c = normalizeText(courseFilter)
    let y = normalizeText(yearFilter)
    let s = normalizeText(sectionFilter)

    return schedules.filter((item) => {

      let itemCourse = normalizeText(item.course)
      if (itemCourse.includes('computer science') || itemCourse === 'cs') itemCourse = 'bscs'
      if (itemCourse.includes('information tech') || itemCourse === 'it') itemCourse = 'bsit'

      if (c && itemCourse !== c) return false
      if (y && normalizeText(item.yearLevel) !== y) return false
      
      // Exact Section Matching
      if (s && normalizeText(item.section) !== s) return false
      
      return true
    })
  }, [courseFilter, yearFilter, schedules, sectionFilter, isStudent])

  const dayScoped = useMemo(() => {
    if (!filterDay) return scopedSchedules
    return scopedSchedules.filter((item) => item.day === filterDay)
  }, [scopedSchedules, filterDay])

  const hourSlots = useMemo(() => buildTimeSlots(6, 22), [])

  const visibleSchedules = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = dayScoped.filter((item) => {
      if (!q) return true
      const hay = [
        item.subjectCode,
        item.subjectTitle,
        item.instructor,
        item.room,
        item.day,
        item.course,
        item.yearLevel,
        item.section,
      ]
        .map((x) => String(x || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
    return filtered.sort((a, b) => {
      const dayCompare = DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
      if (dayCompare !== 0) return dayCompare
      return parseMinutes(a.startTime) - parseMinutes(b.startTime)
    })
  }, [dayScoped, search])

  const timetableData = useMemo(() => calculateTimetableTracks(visibleSchedules), [visibleSchedules])

  const dayTracks = useMemo(() => {
    const counts = {}
    DAYS.forEach((d) => (counts[d] = 1))
    timetableData.forEach((item) => {
      counts[item.day] = Math.max(counts[item.day], item.totalCols || 1)
    })
    return counts
  }, [timetableData])

  const hasActiveFilters = Boolean(
    search.trim() || courseFilter || yearFilter || sectionFilter || filterDay,
  )


  return (
    <div className="module-page">
      <div className="w-full space-y-6">
        <header
          className={`module-header flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 ${canManage ? 'admin-student-list-header-enter' : ''
            }`}
        >
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">Scheduling</h1>
            <p className="main-description text-[var(--text-muted)] mt-1 max-w-2xl">
              {canManage
                ? 'Assign subjects, faculty, sections, and rooms.'
                : 'Browse published class schedules.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            {canManage ? (
              <Link
                to="/scheduling/add"
                className="font-medium transition-all duration-300 text-sm px-6 py-2.5 rounded-full hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                style={{ background: 'var(--accent)', color: 'white', border: '1px solid var(--accent-soft)' }}
              >
                + Add class slot
              </Link>
            ) : null}
          </div>
        </header>

        <section className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-5 md:p-6 shadow-sm space-y-5 flex flex-col admin-student-list-toolbar-enter">
          <div className="flex flex-col xl:flex-row gap-4 xl:items-center">
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
                title="Weekly grid"
              >
                <IconCalendar />
              </button>
            </div>
          </div>

          {showFilters ? (
            <div className="pt-5 mt-1 border-t border-[var(--border-color)] flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="flex flex-col gap-1.5 w-full md:w-[200px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Program</span>
                <select className="search-input w-full !rounded-md !py-2 appearance-none" value={courseFilter} disabled={isStudent} onChange={(e) => setCourseFilter(e.target.value)}>
                  <option value="">All programs</option>
                  {uniqueCourses.map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 w-full md:w-[200px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Year level</span>
                <select className="search-input w-full !rounded-md !py-2 appearance-none" value={yearFilter} disabled={isStudent} onChange={(e) => setYearFilter(e.target.value)}>
                  <option value="">All years</option>
                  {uniqueYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 w-full md:w-[200px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Section</span>
                <select className="search-input w-full !rounded-md !py-2 appearance-none" value={sectionFilter} disabled={isStudent} onChange={(e) => setSectionFilter(e.target.value)}>
                  <option value="">All sections</option>
                  {uniqueSections.map((section) => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 w-full md:w-[180px]">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Day</span>
                <select className="search-input w-full !rounded-md !py-2 appearance-none" value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
                  <option value="">All days</option>
                  {DAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              {hasActiveFilters ? (
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setFilterDay('')
                      setSectionFilter(isStudent ? (studentInfo.section || '') : '')
                      setCourseFilter(isStudent ? (studentInfo.course || '') : '')
                      setYearFilter(isStudent ? (studentInfo.yearLevel || '') : '')
                    }}
                    className="px-5 py-2 rounded-full border border-[var(--border-color)] bg-transparent hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text)] text-sm font-medium transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="space-y-4 admin-student-list-section-enter">
          <h2 className="text-xl font-bold px-1 flex items-center gap-2 text-[var(--text)] flex-wrap">
            <span className="w-6 h-[2px] bg-[var(--accent)]" />
            {viewMode === 'timetable' ? 'Weekly timetable' : 'Class schedules'}
            {visibleSchedules.length > 0 ? (
              <span className="px-2 py-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-full text-xs">
                {visibleSchedules.length}
              </span>
            ) : null}
          </h2>

          {visibleSchedules.length === 0 ? (
            <div className="text-center p-12 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] admin-animate-reveal transition-shadow duration-300 hover:shadow-md">
                <>
                  <p className="text-[var(--text-muted)] text-sm font-semibold">No schedules match the current view.</p>
                  <p className="text-[var(--text-muted)] text-xs mt-1 opacity-80">
                    {schedules.length === 0
                      ? 'No entries yet—add a class slot to seed the grid.'
                      : 'Try clearing filters, another day tab, or a broader search.'}
                  </p>
                </>
            </div>
          ) : (
            <>
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
                          <div
                            className={`h-full bg-gradient-to-r ${ds.bar} w-0 group-hover:w-full transition-all duration-500 rounded-r-full opacity-90`}
                          />
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
                        {canManage ? (
                          <div className="px-5 py-3 bg-[rgba(0,0,0,0.15)] dark:bg-[rgba(255,255,255,0.02)] border-t border-[var(--border-color)] flex justify-end items-center gap-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                            <Link to={`/scheduling/${item.id}`} className="px-3 py-1.5 rounded-md border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]">
                              View
                            </Link>
                            <Link to={`/scheduling/${item.id}/edit`} className="px-3 py-1.5 rounded-md bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white">
                              Edit
                            </Link>
                          </div>
                        ) : (
                          <div className="px-5 py-3 bg-[rgba(0,0,0,0.15)] dark:bg-[rgba(255,255,255,0.02)] border-t border-[var(--border-color)] flex justify-end items-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                            <Link to={`/scheduling/${item.id}`} className="px-3 py-1.5 rounded-md border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]">
                              View
                            </Link>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

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
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${ds.pill}`}>{item.day}</span>
                                <div className="text-[11px] text-[var(--text-muted)] mt-1 font-medium">
                                  {item.startTime} – {item.endTime}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-xs font-semibold text-[var(--text)]">{item.room}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <Link to={`/scheduling/${item.id}`} className="px-3 py-1.5 rounded-md border border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]">
                                    View
                                  </Link>
                                  {canManage ? (
                                    <Link to={`/scheduling/${item.id}/edit`} className="px-3 py-1.5 rounded-md bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white">
                                      Edit
                                    </Link>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewMode === 'timetable' && (
                <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden">
                  <div
                    id="timetable-container"
                    className="overflow-x-auto custom-scrollbar active:cursor-grabbing cursor-grab select-none"
                    onMouseDown={(e) => {
                      const el = e.currentTarget
                      el.dataset.isDragging = 'true'
                      el.dataset.startX = e.pageX - el.offsetLeft
                      el.dataset.scrollLeft = el.scrollLeft
                    }}
                    onMouseMove={(e) => {
                      const el = e.currentTarget
                      if (el.dataset.isDragging !== 'true') return
                      e.preventDefault()
                      const x = e.pageX - el.offsetLeft
                      const walk = (x - Number(el.dataset.startX)) * 2
                      el.scrollLeft = Number(el.dataset.scrollLeft) - walk
                    }}
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
                      {/* Header */}
                      <div className="sticky top-0 z-30 bg-[var(--card-bg)] border-b border-[var(--border-color)] flex items-center justify-center font-bold text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-r">
                        Time
                      </div>
                      {DAYS.map((day) => (
                        <div key={day} className="sticky top-0 z-30 bg-[var(--card-bg)] border-b border-[var(--border-color)] flex items-center justify-center font-bold text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-r border-[var(--border-color)]/30 last:border-r-0">
                          {day}
                        </div>
                      ))}

                      {/* Time Labels & Grid background */}
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

                      {/* Class Blocks */}
                      {timetableData.map((item) => {
                        const dayIdx = DAYS.indexOf(item.day)
                        if (dayIdx === -1) return null

                        const startMin = parseMinutes(item.startTime)
                        const endMin = parseMinutes(item.endTime)
                        const baseMin = 6 * 60 // 360

                        // row 1 is header, so startMin=360 (6:00) maps to row 2
                        const gridStart = Math.floor((startMin - baseMin) / 30) + 2
                        const gridSpan = Math.max(1, Math.ceil((endMin - startMin) / 30))

                        const blockBg = item.day === 'Monday' ? '#1e3a8a' : (item.day === 'Tuesday' ? '#5b21b6' : (item.day === 'Wednesday' ? '#065f46' : (item.day === 'Thursday' ? '#92400e' : (item.day === 'Friday' ? '#9f1239' : '#155e75'))))

                        return (
                          <div
                            key={item.id}
                            style={{
                              gridColumn: dayIdx + 2, // Skip time column
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
                              <p className="text-[10px] font-bold opacity-90 mb-0.5">
                                {formatCohortLabel(item.course, item.yearLevel, item.section)}
                              </p>
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
      </div>
    </div>
  )
}
