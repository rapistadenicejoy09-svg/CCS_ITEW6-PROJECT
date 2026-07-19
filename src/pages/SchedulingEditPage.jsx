import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { hasPermission, PERMISSIONS } from '../lib/security'
import { apiFacultyDirectory, apiGetSubjects, apiGetTeachingLoads } from '../lib/api'
import {
  DAYS,
  getScheduleById,
  getSchedules,
  normalizeScheduleInput,
  updateSchedule,
  validateScheduleConflicts,
  validateScheduleRequiredFields,
  ROOM_OPTIONS,
} from '../lib/schedulingStore'

const inputCls = 'search-input w-full'
const COURSE_OPTIONS = ['BSIT', 'BSCS']
const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
const SEMESTER_OPTIONS = ['1st Semester', '2nd Semester']

const SECTION_BY_YEAR = {
  '1st Year': ['1A', '1B', '1C', '1D', '1E'],
  '2nd Year': ['2A', '2B', '2C', '2D', '2E'],
  '3rd Year': ['3A', '3B', '3C', '3D', '3E'],
  '4th Year': ['4A', '4B', '4C', '4D', '4E'],
}

// Complete Subject Mappings
const SUBJECT_CATALOG = {
  'BSIT': {
    '1st Year': {
      '1st Semester': [
        { code: 'CCS101', name: 'Introduction to Computing' },
        { code: 'CCS102', name: 'Computer Programming 1' },
        { code: 'ETH101', name: 'Ethics' },
        { code: 'MAT101', name: 'Mathematics in the Modern World' },
        { code: 'NSTP1', name: 'National Service Training Program 1' },
        { code: 'PED101', name: 'Physical Education 1' },
        { code: 'PSY100', name: 'Understanding the Self' },
      ],
      '2nd Semester': [
        { code: 'CCS103', name: 'Computer Programming 2' },
        { code: 'CCS104', name: 'Discrete Structures 1' },
        { code: 'CCS105', name: 'Human Computer Interaction 1' },
        { code: 'CCS106', name: 'Social and Professional Issues' },
        { code: 'COM101', name: 'Purposive Communication' },
        { code: 'GAD101', name: 'Gender and Development' },
        { code: 'NSTP2', name: 'National Service Training Program 2' },
        { code: 'PED102', name: 'Physical Education 2' },
      ]
    },
    '2nd Year': {
      '1st Semester': [
        { code: 'ACT101', name: 'Principles of Accounting' },
        { code: 'CCS107', name: 'Data Structures and Algorithms 1' },
        { code: 'CCS108', name: 'Object-Oriented Programming' },
        { code: 'CCS109', name: 'System Analysis and Design' },
        { code: 'ITEW1', name: 'Electronic Commerce' },
        { code: 'PED103', name: 'Physical Education 3' },
        { code: 'STS101', name: 'Science, Technology and Society' },
      ],
      '2nd Semester': [
        { code: 'CCS110', name: 'Information Management 1' },
        { code: 'CCS111', name: 'Networking and Communication 1' },
        { code: 'ENT101', name: 'The Entrepreneurial Mind' },
        { code: 'ITEW2', name: 'Client Side Scripting' },
        { code: 'ITP101', name: 'Quantitative Methods' },
        { code: 'ITP102', name: 'Integrative Programming and Technologies' },
        { code: 'PED104', name: 'Physical Education 4' },
      ]
    },
    '3rd Year': {
      '1st Semester': [
        { code: 'HIS101', name: 'Readings in Philippine History' },
        { code: 'ITEW3', name: 'Server Side Scripting' },
        { code: 'ITP103', name: 'System Integration and Architecture' },
        { code: 'ITP104', name: 'Information Management 2' },
        { code: 'ITP105', name: 'Networking and Communication 2' },
        { code: 'ITP106', name: 'Human Computer Interaction 2' },
        { code: 'SOC101', name: 'The Contemporary World' },
        { code: 'TEC101', name: 'Technopreneurship' },
      ],
      '2nd Semester': [
        { code: 'CCS112', name: 'Applications Development and Emerging Technologies' },
        { code: 'CCS113', name: 'Information Assurance and Security' },
        { code: 'HMN101', name: 'Art Appreciation' },
        { code: 'ITEW4', name: 'Responsive Web Design' },
        { code: 'ITP107', name: 'Mobile Application Development' },
        { code: 'ITP108', name: 'Capstone Project 1' },
      ]
    },
    '4th Year': {
      '1st Semester': [
        { code: 'ENV101', name: 'Environmental Science' },
        { code: 'ITEW5', name: 'Web Security and Optimization' },
        { code: 'ITP110', name: 'Web Technologies' },
        { code: 'ITP111', name: 'System Administration and Maintenance' },
        { code: 'ITP112', name: 'Capstone Project 2' },
        { code: 'RIZ101', name: 'Life and Works of Rizal' },
      ],
      '2nd Semester': [
        { code: 'ITEW6', name: 'Web Development Frameworks' },
        { code: 'ITP113', name: 'IT Practicum (500 hours)' },
      ]
    }
  },
  'BSCS': {
    '1st Year': {
      '1st Semester': [
        { code: 'CCS101', name: 'Introduction to Computing' },
        { code: 'CCS102', name: 'Computer Programming 1' },
        { code: 'ETH101', name: 'Ethics' },
        { code: 'MAT101', name: 'Mathematics in the Modern World' },
        { code: 'NSTP1', name: 'National Service Training Program 1' },
        { code: 'PED101', name: 'Physical Education 1' },
        { code: 'PSY100', name: 'Understanding the Self' },
      ],
      '2nd Semester': [
        { code: 'CCS103', name: 'Computer Programming 2' },
        { code: 'CCS104', name: 'Discrete Structures 1' },
        { code: 'CCS106', name: 'Social and Professional Issues' },
        { code: 'COM101', name: 'Purposive Communication' },
        { code: 'CSP101', name: 'Analytic Geometry' },
        { code: 'GAD101', name: 'Gender and Development' },
        { code: 'NSTP2', name: 'National Service Training Program 2' },
        { code: 'PED102', name: 'Physical Education 2' },
      ]
    },
    '2nd Year': {
      '1st Semester': [
        { code: 'CCS107', name: 'Data Structures and Algorithms 1' },
        { code: 'CCS108', name: 'Object-Oriented Programming' },
        { code: 'CSEG1', name: 'Game Concepts and Productions' },
        { code: 'CSP102', name: 'Discrete Structures 2' },
        { code: 'HIS101', name: 'Readings in Philippine History' },
        { code: 'PED103', name: 'Physical Education 3' },
        { code: 'STS101', name: 'Science, Technology and Society' },
      ],
      '2nd Semester': [
        { code: 'ACT101', name: 'Principles of Accounting' },
        { code: 'CCS110', name: 'Information Management 1' },
        { code: 'CSEG2', name: 'Game Programming 1' },
        { code: 'CSP103', name: 'Data Structures and Algorithms 2' },
        { code: 'CSP104', name: 'Calculus' },
        { code: 'CSP105', name: 'Algorithms and Complexity' },
        { code: 'HMN101', name: 'Art Appreciation' },
        { code: 'PED104', name: 'Physical Education 4' },
      ]
    },
    '3rd Year': {
      '1st Semester': [
        { code: 'CCS109', name: 'System Analysis and Design' },
        { code: 'CCS112', name: 'Applications Development and Emerging Technologies' },
        { code: 'CCS113', name: 'Information Assurance Security' },
        { code: 'CSEG3', name: 'Game Programming 2' },
        { code: 'CSP106', name: 'Automata Theory and Formal Languages' },
        { code: 'CSP107', name: 'Computer Organization and Assembly Language Programming' },
        { code: 'ENT101', name: 'The Entrepreneurial Mind' },
      ],
      '2nd Semester': [
        { code: 'CSEG4', name: 'Game Programming 3 (Pure Labs)' },
        { code: 'CSP108', name: 'Programming Languages' },
        { code: 'CSP109', name: 'Software Engineering 1' },
        { code: 'CSP110', name: 'Numerical Analysis' },
        { code: 'CSP111', name: 'Thesis 1' },
        { code: 'RIZ101', name: 'Life and Works of Rizal' },
        { code: 'SOC101', name: 'The Contemporary World' },
        { code: 'TEC101', name: 'Technopreneurship' },
      ]
    },
    '4th Year': {
      '1st Semester': [
        { code: 'CCS105', name: 'Human Computer Interaction 1' },
        { code: 'CSEG5', name: 'Artificial Intelligence for Games' },
        { code: 'CSP112', name: 'Operating Systems' },
        { code: 'CSP113', name: 'Software Engineering 2' },
        { code: 'CSP114', name: 'Thesis 2' },
        { code: 'ENV101', name: 'Environmental Science' },
      ],
      '2nd Semester': [
        { code: 'CCS111', name: 'Networking and Communication 1' },
        { code: 'CSEG6', name: 'Advance Game Design' },
        { code: 'CSP115', name: 'CS Practicum (300 hours)' },
      ]
    }
  }
}

function getFacultyName(f) {
  return (
    String(f.displayName || f.fullName || f.full_name || '').trim() ||
    String(f.personal_information?.fullName || f.personal_information?.full_name || '').trim() ||
    [f.personal_information?.first_name, f.personal_information?.last_name].filter(Boolean).join(' ') ||
    String(f.email || '').trim() ||
    'Unnamed Faculty'
  )
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export default function SchedulingEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canManage = hasPermission(PERMISSIONS.SCHEDULING_MANAGE)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [facultyLoading, setFacultyLoading] = useState(true)
  const [facultyError, setFacultyError] = useState('')
  const [faculty, setFaculty] = useState([])
  const [instructorOpen, setInstructorOpen] = useState(false)
  const [instructorQuery, setInstructorQuery] = useState('')
  const instructorWrapRef = useRef(null)
  const instructorQueryRef = useRef(null)
  const startTimeRef = useRef(null)
  const endTimeRef = useRef(null)

  const [form, setForm] = useState({
    subjectCode: '',
    subjectTitle: '',
    subjectId: '',
    instructor: '',
    instructorId: '',
    instructorEmail: '',
    course: '',
    yearLevel: '',
    semester: '',
    section: '',
    day: 'Monday',
    startTime: '08:00',
    endTime: '09:00',
    room: '',
  })

  const [dbSubjects, setDbSubjects] = useState([])
  const [loads, setLoads] = useState([])
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [subjectQuery, setSubjectQuery] = useState('')
  const subjectWrapRef = useRef(null)
  const subjectQueryRef = useRef(null)

  if (!canManage) {
    return <div className="p-8 text-center text-[var(--text-muted)]">You do not have access to edit schedules.</div>
  }

  useEffect(() => {
    async function loadResources() {
      setLoading(true)
      setFacultyLoading(true)
      setFacultyError('')
      try {
        const token = localStorage.getItem('authToken')
        if (!token) throw new Error('Missing auth token.')

        const [fRes, sRes, lRes, existing] = await Promise.all([
          apiFacultyDirectory(token),
          apiGetSubjects(token),
          apiGetTeachingLoads(token),
          getScheduleById(id)
        ])

        const fList = Array.isArray(fRes?.faculty) ? fRes.faculty : []
        const sList = Array.isArray(sRes?.subjects) ? sRes.subjects : []
        setFaculty(fList)
        setDbSubjects(sList)
        setLoads(Array.isArray(lRes?.teachingLoads) ? lRes.teachingLoads : [])

        if (existing) {
          const dbMatch = sList.find(s => s.code === existing.subjectCode)
          setForm({
            subjectCode: existing.subjectCode || '',
            subjectTitle: existing.subjectTitle || '',
            subjectId: dbMatch?.id || '',
            instructor: existing.instructor || '',
            instructorId: existing.instructorId || '',
            instructorEmail: existing.instructorEmail || '',
            course: existing.course || '',
            yearLevel: existing.yearLevel || '',
            semester: existing.semester || '',
            section: existing.section || '',
            day: existing.day || 'Monday',
            startTime: existing.startTime || '08:00',
            endTime: existing.endTime || '09:00',
            room: existing.room || '',
          })
        } else {
          setError('Schedule not found.')
        }
      } catch (e) {
        setFaculty([])
        setFacultyError(e?.message || 'Failed to load resources.')
      } finally {
        setFacultyLoading(false)
        setLoading(false)
      }
    }
    loadResources()
  }, [id])

  const facultyOptions = useMemo(() => {
    const cleaned = (faculty || [])
      .filter((f) => f && (f.role === 'faculty' || f.role === 'dean' || f.role === 'department_chair' || f.role === 'secretary' || f.role === 'faculty_professor'))
      .map((f) => ({
        id: String(f.id ?? '').trim(),
        email: String(f.email ?? '').trim().toLowerCase(),
        name: getFacultyName(f),
        isActive: f.is_active !== false && f.is_active !== 0,
        raw: f,
      }))
      .filter((f) => f.id || f.email)
    cleaned.sort((a, b) => a.name.localeCompare(b.name))
    return cleaned
  }, [faculty])

  const filteredFacultyOptions = useMemo(() => {
    const q = instructorQuery.trim().toLowerCase()
    if (!q) return facultyOptions
    return facultyOptions.filter((f) => {
      const hay = `${f.name} ${f.email}`.toLowerCase()
      return hay.includes(q)
    })
  }, [facultyOptions, instructorQuery])

  const patchForm = (patch) => setForm((prev) => ({ ...prev, ...patch }))

  const instructorSelectedLabel = useMemo(() => {
    if (form.instructor) return form.instructor
    if (form.instructorId) {
      const hit = facultyOptions.find((f) => String(f.id) === String(form.instructorId))
      if (hit) return hit.name
    }
    return ''
  }, [facultyOptions, form.instructor, form.instructorId])

  // Dynamic subjects based on Course, Year, Semester
  const availableCatalogSubjects = useMemo(() => {
    if (!form.course || !form.yearLevel || !form.semester) return []
    const courseKey = form.course === 'BSIT' ? 'BSIT' : 'BSCS'
    return SUBJECT_CATALOG[courseKey]?.[form.yearLevel]?.[form.semester] || []
  }, [form.course, form.yearLevel, form.semester])

  const filteredSubjects = useMemo(() => {
    const q = subjectQuery.toLowerCase()
    if (!q) return availableCatalogSubjects
    return availableCatalogSubjects.filter(s =>
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q)
    )
  }, [availableCatalogSubjects, subjectQuery])

  const subjectLabel = useMemo(() => {
    if (form.subjectCode && form.subjectTitle) {
      return `${form.subjectCode} - ${form.subjectTitle}`
    }
    return ''
  }, [form.subjectCode, form.subjectTitle])

  // Suggest instructor based on Teaching Load
  useEffect(() => {
    if (!form.subjectId || !form.course || !form.section) return

    const fullSection = `${form.course} ${form.section}`
    const match = loads.find(l =>
      String(l.subject_id) === String(form.subjectId) &&
      (l.section === fullSection || l.section_id === fullSection)
    )

    if (match) {
      const f = facultyOptions.find(opt => String(opt.id) === String(match.faculty_id))
      if (f) {
        patchForm({
          instructorId: f.id,
          instructorEmail: f.email,
          instructor: f.name
        })
      }
    }
  }, [form.subjectId, form.course, form.section, loads, facultyOptions])

  useEffect(() => {
    if (!subjectOpen) return
    const t = setTimeout(() => subjectQueryRef.current?.focus(), 0)
    const onDocMouseDown = (e) => {
      if (subjectWrapRef.current && !subjectWrapRef.current.contains(e.target)) setSubjectOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [subjectOpen])

  useEffect(() => {
    if (!instructorOpen) return
    const t = setTimeout(() => instructorQueryRef.current?.focus(), 0)

    function onDocMouseDown(e) {
      const wrap = instructorWrapRef.current
      if (!wrap) return
      if (wrap.contains(e.target)) return
      setInstructorOpen(false)
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') setInstructorOpen(false)
    }

    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [instructorOpen])

  function openTimePicker(ref) {
    const input = ref?.current
    if (!input) return
    input.focus()
    if (typeof input.showPicker === 'function') input.showPicker()
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault()
    setError('')
    const updated = normalizeScheduleInput({ ...form, id })
    const requiredError = validateScheduleRequiredFields(updated)
    if (requiredError) {
      setError(requiredError)
      return
    }

    setSaving(true)
    try {
      const all = await getSchedules()
      const conflictError = validateScheduleConflicts(updated, all, id)
      if (conflictError) {
        setError(conflictError)
        return
      }
      await updateSchedule(id, updated)
      navigate(`/scheduling/${id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 module-page">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-[var(--accent)]" />
      </div>
    )
  }

  const isSubjectEnabled = form.course && form.yearLevel && form.semester

  return (
    <div className="module-page max-w-5xl mx-auto w-full">
      <div className="w-full space-y-6">
        <header className="module-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">Edit Schedule</h1>
            <p className="main-description text-[var(--text-muted)] mt-1">
              Update class assignment details and keep the timetable conflict-free.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/scheduling/${id}`} className="btn btn-secondary">← Cancel</Link>
            <button onClick={handleSubmit} disabled={saving} className="btn btn-primary">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </header>

        {(error || facultyError) ? (
          <div className="p-4 rounded-xl text-rose-400 bg-rose-500/10 border border-rose-500/20 text-sm font-semibold">
            {error || facultyError}
          </div>
        ) : null}

        <section className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] shadow-sm overflow-visible">
          <div className="p-6 md:p-7 border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)]">
            <h2 className="text-sm font-extrabold uppercase tracking-widest text-[var(--text)]">Scheduling Form</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6 md:p-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            
            {/* Prerequisites */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)]">Select Course</span>
              <select
                className={inputCls}
                value={form.course}
                onChange={(e) => patchForm({ course: e.target.value, subjectCode: '', subjectTitle: '', subjectId: '' })}
              >
                <option value="">Select course</option>
                {COURSE_OPTIONS.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)]">Year level</span>
              <select
                className={inputCls}
                value={form.yearLevel}
                disabled={!form.course}
                onChange={(e) => patchForm({ yearLevel: e.target.value, section: '', subjectCode: '', subjectTitle: '', subjectId: '' })}
              >
                <option value="">Select year level</option>
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--accent)]">Semester</span>
              <select
                className={inputCls}
                value={form.semester}
                disabled={!form.yearLevel}
                onChange={(e) => patchForm({ semester: e.target.value, subjectCode: '', subjectTitle: '', subjectId: '' })}
              >
                <option value="">Select semester</option>
                {SEMESTER_OPTIONS.map((sem) => (
                  <option key={sem} value={sem}>
                    {sem}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Section</span>
              <select
                className={inputCls}
                value={form.section}
                disabled={!form.yearLevel}
                onChange={(e) => patchForm({ section: e.target.value })}
              >
                <option value="">{form.yearLevel ? 'Select section' : 'Select year level first'}</option>
                {(SECTION_BY_YEAR[form.yearLevel] || []).map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </label>

            {/* Subject Dropdown */}
            <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3 xl:col-span-3">
              <span className={`text-[11px] font-black uppercase tracking-wider ${isSubjectEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                Select Subject
              </span>
              <div className="relative" ref={subjectWrapRef}>
                <button
                  type="button"
                  disabled={!isSubjectEnabled}
                  onClick={() => setSubjectOpen(!subjectOpen)}
                  className={`${inputCls} flex items-center justify-between gap-2 text-left ${!isSubjectEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className={`truncate ${subjectLabel ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                    {subjectLabel || (isSubjectEnabled ? 'Choose subject...' : 'Choose course, year, and semester first...')}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </button>

                {subjectOpen && (
                  <div className="absolute z-[100] mt-2 w-full md:w-[680px] left-0 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-2xl overflow-hidden animate-reveal">
                    <div className="p-3 border-b border-[var(--border-color)] bg-[rgba(255,255,255,0.02)]">
                      <input
                        ref={subjectQueryRef}
                        className="search-input w-full !rounded-xl"
                        value={subjectQuery}
                        onChange={(e) => setSubjectQuery(e.target.value)}
                        placeholder="Search for subject code or name..."
                      />
                    </div>
                    <div className="max-h-80 overflow-auto py-1 no-scrollbar">
                      {filteredSubjects.length > 0 ? (
                        filteredSubjects.map(s => {
                          const dbMatch = dbSubjects.find(dbS => dbS.code === s.code)
                          return (
                            <button
                              key={s.code}
                              type="button"
                              onClick={() => {
                                patchForm({
                                  subjectId: dbMatch ? dbMatch.id : '',
                                  subjectCode: s.code,
                                  subjectTitle: s.name
                                })
                                setSubjectOpen(false)
                                setSubjectQuery('')
                              }}
                              className="w-full px-5 py-4 text-left hover:bg-[rgba(var(--accent-rgb),0.05)] border-b border-[var(--border-color)] last:border-0 transition-all flex flex-col gap-1"
                            >
                              <div className="flex justify-between items-center">
                                <span className="block font-black text-[var(--accent)] text-xs tracking-wider">{s.code}</span>
                                {dbMatch && <span className="text-[9px] font-black uppercase text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Linked to Master</span>}
                              </div>
                              <span className="block text-sm font-bold text-[var(--text)]">{s.name}</span>
                            </button>
                          )
                        })
                      ) : (
                        <div className="p-10 text-center text-xs text-[var(--text-muted)] italic opacity-50">No matching subjects found in this curriculum.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Room</span>
              <select className={inputCls} value={form.room} onChange={(e) => patchForm({ room: e.target.value })}>
                <option value="">Select room</option>
                {ROOM_OPTIONS.map((room) => <option key={room} value={room}>{room}</option>)}
              </select>
            </label>

            {/* Rest of the fields */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Instructor</span>
              <div className="relative" ref={instructorWrapRef}>
                <button
                  type="button"
                  disabled={facultyLoading || facultyOptions.length === 0}
                  onClick={() => setInstructorOpen((v) => !v)}
                  className={`${inputCls} flex items-center justify-between gap-2 !text-left ${facultyLoading || facultyOptions.length === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <span className={`truncate ${instructorSelectedLabel ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                    {facultyLoading ? 'Loading faculty...' : (instructorSelectedLabel || 'Select faculty')}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {instructorOpen && (
                  <div className="absolute z-50 mt-2 w-full rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.02)]">
                      <input
                        ref={instructorQueryRef}
                        className="search-input w-full !rounded-lg"
                        value={instructorQuery}
                        onChange={(e) => setInstructorQuery(e.target.value)}
                        placeholder="Search faculty..."
                      />
                    </div>
                    <div className="max-h-56 overflow-auto py-1">
                      {filteredFacultyOptions.length ? (
                        filteredFacultyOptions.map((f) => (
                          <button
                            key={f.id || f.email}
                            type="button"
                            disabled={!f.isActive}
                            onClick={() => {
                              patchForm({
                                instructorId: f.id || '',
                                instructorEmail: f.email || '',
                                instructor: f.name || '',
                              })
                              setInstructorOpen(false)
                              setInstructorQuery('')
                            }}
                            className={`w-full px-3 py-2 text-left flex justify-between items-center hover:bg-[rgba(0,0,0,0.04)] ${!f.isActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <div>
                              <span className="block font-bold text-sm text-[var(--text)]">{f.name}</span>
                              <span className="block text-[10px] text-[var(--text-muted)]">{f.email}</span>
                            </div>
                            {!f.isActive && <span className="text-[9px] font-black text-rose-500 uppercase">Inactive</span>}
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-[var(--text-muted)]">No faculty found.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Day</span>
              <select className={inputCls} value={form.day} onChange={(e) => patchForm({ day: e.target.value })}>
                {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Start time</span>
              <div className="relative">
                <input
                  ref={startTimeRef}
                  type="time"
                  className={`${inputCls} pr-10`}
                  value={form.startTime}
                  onChange={(e) => patchForm({ startTime: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => openTimePicker(startTimeRef)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--accent)] p-1"
                >
                  <IconClock />
                </button>
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">End time</span>
              <div className="relative">
                <input
                  ref={endTimeRef}
                  type="time"
                  className={`${inputCls} pr-10`}
                  value={form.endTime}
                  onChange={(e) => patchForm({ endTime: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => openTimePicker(endTimeRef)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--accent)] p-1"
                >
                  <IconClock />
                </button>
              </div>
            </label>
          </form>

          <div className="px-6 md:px-7 pb-6 md:pb-7">
            <div className="rounded-2xl border border-[var(--border-color)] bg-[rgba(0,0,0,0.01)] p-5">
              <div className="flex gap-4 items-center">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                </div>
                <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                  <p><span className="font-black text-[var(--text)] uppercase tracking-tight">Pro-Tips:</span> Always verify faculty and room availability to avoid scheduling overlaps. Ensure the curriculum selection is correct so that only valid subjects are displayed for the chosen year and semester.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
