import { useEffect, useMemo, useState } from 'react'
import { DAYS, getSchedules, parseMinutes, buildTimeSlots, calculateTimetableTracks } from '../lib/schedulingStore'

const DAY_STYLE = {
  Monday: { pill: 'bg-sky-100/15 text-sky-400 border-sky-400/25', bar: 'from-sky-500 to-sky-500/30' },
  Tuesday: { pill: 'bg-violet-100/15 text-violet-400 border-violet-400/25', bar: 'from-violet-500 to-violet-500/30' },
  Wednesday: { pill: 'bg-emerald-100/15 text-emerald-400 border-emerald-400/25', bar: 'from-emerald-500 to-emerald-500/30' },
  Thursday: { pill: 'bg-amber-100/15 text-amber-400 border-amber-400/25', bar: 'from-amber-500 to-amber-500/30' },
  Friday: { pill: 'bg-rose-100/15 text-rose-400 border-rose-400/25', bar: 'from-rose-500 to-rose-500/30' },
  Saturday: { pill: 'bg-cyan-100/15 text-cyan-400 border-cyan-400/25', bar: 'from-cyan-500 to-cyan-500/30' },
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function getStudentAssignmentFromAuth() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    if (!user) {
      return { course: '', yearLevel: '', section: '' }
    }
    const source = user.summary || user.academic_info || user.academicInfo || {}
    
    let courseRaw = source.program || source.course || user.program || user.course || ''
    let yearRaw = source.year_level || source.yearLevel || source.year || user.year_level || user.yearLevel || user.year || ''
    let sectRaw = user.class_section || source.class_section || source.classSection || source.section || user.classSection || ''
    
    let course = String(courseRaw).trim().toLowerCase()
    if (course === 'bsit' || course === 'it' || course.includes('information tech')) course = 'bsit'
    else if (course === 'bscs' || course === 'cs' || course.includes('computer science')) course = 'bscs'

    return {
      course: course,
      yearLevel: String(yearRaw).trim(),
      section: String(sectRaw).trim(),
    }
  } catch {
    return { course: '', yearLevel: '', section: '' }
  }
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

function IconPrint() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
}

export default function StudentSchedule() {
  const [schedules, setSchedules] = useState([])
  const [viewMode, setViewMode] = useState('timetable')
  const [filterDay, setFilterDay] = useState('')

  useEffect(() => {
    async function load() {
      const data = await getSchedules()
      setSchedules(data)
    }
    load()
  }, [])

  const scopedSchedules = useMemo(() => {
    const fromAuth = getStudentAssignmentFromAuth()
    let c = normalizeText(fromAuth.course)
    let y = normalizeText(fromAuth.yearLevel)
    let s = normalizeText(fromAuth.section)

    if (c.includes('computer science') || c === 'cs') c = 'bscs'
    if (c.includes('information tech') || c === 'it') c = 'bsit'
    if (y === '1' || y === '1st') y = '1st year'
    if (y === '2' || y === '2nd') y = '2nd year'
    if (y === '3' || y === '3rd') y = '3rd year'
    if (y === '4' || y === '4th') y = '4th year'

    return schedules.filter((item) => {
      // STRICT: Hide everything if profile is incomplete
      if (!c || !y || !s) return false 

      let itemCourse = normalizeText(item.course)
      if (itemCourse.includes('computer science') || itemCourse === 'cs') itemCourse = 'bscs'
      if (itemCourse.includes('information tech') || itemCourse === 'it') itemCourse = 'bsit'

      if (itemCourse !== c) return false
      if (normalizeText(item.yearLevel) !== y) return false
      
      if (normalizeText(item.section) !== s) return false
      
      return true
    })
  }, [schedules])

  const dayScoped = useMemo(() => {
    if (!filterDay) return scopedSchedules
    return scopedSchedules.filter((item) => item.day === filterDay)
  }, [scopedSchedules, filterDay])

  const visibleSchedules = useMemo(() => {
    return dayScoped.sort((a, b) => {
      const dayCompare = DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
      if (dayCompare !== 0) return dayCompare
      return parseMinutes(a.startTime) - parseMinutes(b.startTime)
    })
  }, [dayScoped])

  const hourSlots = useMemo(() => buildTimeSlots(6, 22), [])
  const timetableData = useMemo(() => calculateTimetableTracks(visibleSchedules), [visibleSchedules])

  const dayTracks = useMemo(() => {
    const counts = {}
    DAYS.forEach((d) => (counts[d] = 1))
    timetableData.forEach((item) => {
      counts[item.day] = Math.max(counts[item.day], item.totalCols || 1)
    })
    return counts
  }, [timetableData])

  const fromAuth = getStudentAssignmentFromAuth()
  const isProfileIncomplete = !fromAuth.course || !fromAuth.yearLevel || !fromAuth.section

  return (
    <div className="module-page">
      <div className="w-full space-y-6">
        <header className="module-header flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">My Class Schedule</h1>
            <p className="main-description text-[var(--text-muted)] mt-1 max-w-2xl">
              Your weekly class map, locked cleanly to your exact enrolled program, year level, and block section.
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

        <section className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between no-print">
            <div className="flex items-center gap-4">
                <label className="flex flex-col gap-1 w-full md:w-[180px]">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Day</span>
                    <select className="search-input w-full !rounded-md !py-2 appearance-none text-sm" value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
                    <option value="">All days</option>
                    {DAYS.map((day) => (
                        <option key={day} value={day}>{day}</option>
                    ))}
                    </select>
                </label>
                {filterDay && (
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setFilterDay('')}
                      className="px-5 py-2 rounded-full border border-[var(--border-color)] bg-transparent hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text)] text-sm font-medium transition-colors"
                    >
                      Clear Filter
                    </button>
                  </div>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0 justify-end">
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
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold px-1 flex items-center gap-2 text-[var(--text)] flex-wrap">
            <span className="w-6 h-[2px] bg-[var(--accent)]" />
            {viewMode === 'timetable' ? 'Weekly timetable' : 'Class modules'}
          </h2>

          {visibleSchedules.length === 0 ? (
            <div className="text-center p-12 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] transition-shadow duration-300 hover:shadow-md">
              {isProfileIncomplete ? (
                <>
                  <p className="text-amber-500 text-sm font-semibold mb-2">Incomplete Student Profile Detected</p>
                  <p className="text-[var(--text-muted)] text-xs max-w-lg mx-auto">
                    We could not find a valid Program, Year Level, or Section assigned to your account. 
                    Please ask your administrator to update your student profile so your schedules can securely unlock.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[var(--text-muted)] text-sm font-semibold">No schedules match your enrolled section yet.</p>
                  <p className="text-[var(--text-muted)] text-xs mt-1 opacity-80">
                    Your department has not fully mapped out blocks mapping to your section, or you've filtered to a day with no classes.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {visibleSchedules.map((item, idx) => {
                    const ds = DAY_STYLE[item.day] || DAY_STYLE.Monday
                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] overflow-hidden transition-all duration-300 hover:shadow-md"
                      >
                        <div className="h-1 bg-[rgba(255,255,255,0.05)] w-full">
                          <div className={`h-full bg-gradient-to-r ${ds.bar} w-full`} />
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
                          <div className="mt-auto pt-4 flex flex-col gap-2 text-[11px] text-[var(--text-muted)] border-t border-[var(--border-color)]">
                            <div className="flex justify-between items-center gap-2">
                              <span className="flex items-center gap-1">
                                <span className="font-medium text-[var(--text)] px-2 py-1 bg-[var(--background)] rounded-md border border-[var(--border-color)] text-[10px]">Rm: {item.room}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
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
                      <div className="sticky top-0 z-30 bg-[var(--card-bg)] border-b border-[var(--border-color)] flex items-center justify-center font-bold text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-r">
                        Time
                      </div>
                      {DAYS.map((day) => (
                        <div key={day} className="sticky top-0 z-30 bg-[var(--card-bg)] border-b border-[var(--border-color)] flex items-center justify-center font-bold text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-r border-[var(--border-color)]/30 last:border-r-0">
                          {day}
                        </div>
                      ))}

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

                      {timetableData.map((item) => {
                        const dayIdx = DAYS.indexOf(item.day)
                        if (dayIdx === -1) return null

                        const startMin = parseMinutes(item.startTime)
                        const endMin = parseMinutes(item.endTime)
                        const baseMin = 6 * 60

                        const gridStart = Math.floor((startMin - baseMin) / 30) + 2
                        const gridSpan = Math.max(1, Math.ceil((endMin - startMin) / 30))

                        const blockBg = item.day === 'Monday' ? '#1e3a8a' : (item.day === 'Tuesday' ? '#5b21b6' : (item.day === 'Wednesday' ? '#065f46' : (item.day === 'Thursday' ? '#92400e' : (item.day === 'Friday' ? '#9f1239' : '#155e75'))))

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
                            <div
                              className="w-full h-full flex flex-col items-center justify-center p-2 text-center rounded-sm shadow-sm"
                              style={{ background: blockBg, color: 'white' }}
                            >
                              <p className="font-bold text-[12px] leading-tight mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis w-full">{item.subjectCode}</p>
                              <div className="flex flex-col opacity-90 scale-90 origin-top overflow-hidden">
                                <p className="text-[11px] font-bold mt-0.5 truncate">{item.room}</p>
                              </div>
                            </div>
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
