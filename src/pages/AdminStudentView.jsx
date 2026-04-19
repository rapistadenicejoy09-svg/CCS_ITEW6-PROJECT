import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SuccessModal from '../components/SuccessModal'
import { apiAdminUser, apiAdminPatchUser } from '../lib/api'

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    return user?.role || null
  } catch {
    return null
  }
}

/* ─── Reusable field components using existing project CSS ─── */

const Label = ({ children, required }) => (
  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
    {children}
    {required && <span className="text-rose-500 ml-1">*</span>}
  </label>
)

// Reuses the project's .search-input class from App.css
const inputCls = 'search-input w-full disabled:opacity-60 disabled:cursor-not-allowed'

const FInput = ({ className = '', ...props }) => (
  <input className={`${inputCls} ${className}`} {...props} />
)

const FSelect = ({ children, className = '', ...props }) => (
  <div className="relative">
    <select className={`${inputCls} appearance-none pr-8 ${className}`} {...props}>
      {children}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1L5 5L9 1" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  </div>
)

const FTextarea = ({ className = '', ...props }) => (
  <textarea className={`${inputCls} resize-none ${className}`} {...props} />
)

const SectionTitle = ({ children }) => (
  <div className="flex items-center gap-3 mb-5">
    <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] whitespace-nowrap">
      {children}
    </span>
    <div className="flex-1 h-px bg-[var(--border-color)]" />
  </div>
)

const Card = ({ children, className = '', style }) => (
  <div
    className={`bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-6 shadow-sm admin-profile-card-surface ${className}`}
    style={style}
  >
    {children}
  </div>
)

/** Read-only display cell: dashed border reads as “record”, not an empty form field */
function ViewValue({ children, multiline }) {
  const text = typeof children === 'string' ? children.trim() : children
  const empty =
    text == null ||
    text === '' ||
    (Array.isArray(text) && text.length === 0)
  return (
    <div
      className={`rounded-xl border border-dashed border-[var(--border-color)] bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text)] transition-all duration-300 hover:border-[var(--accent)]/40 hover:bg-[rgba(229,118,47,0.07)] ${
        multiline ? 'min-h-[5.5rem] whitespace-pre-wrap' : 'min-h-[44px] flex items-center'
      }`}
    >
      {empty ? <span className="text-[var(--text-muted)] italic">—</span> : children}
    </div>
  )
}

const IconTrash = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

const IconAlert = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const AddRowBtn = ({ onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    style={{ border: '1px solid var(--border-color)', color: 'var(--text)' }}
    className="mt-4 w-full py-2 text-xs font-semibold bg-transparent rounded-xl hover:bg-[var(--accent-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all duration-200"
  >
    {label}
  </button>
)

const RemoveBtn = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
    className="w-7 h-7 flex items-center justify-center hover:text-rose-400 rounded-lg transition-all duration-200 text-sm font-bold flex-shrink-0"
  >
    ✕
  </button>
)

const TableHead = ({ cols }) => (
  <thead>
    <tr className="border-b border-[var(--border-color)]">
      {cols.map((c, i) => (
        <th key={i} className="text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] px-3 py-3">
          {c}
        </th>
      ))}
      <th className="w-10" />
    </tr>
  </thead>
)

/* ════════════════════════════════════════════════════════════════ */

export default function AdminStudentView() {
  const { id } = useParams()
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData]   = useState({})
  const [skillInput, setSkillInput] = useState('')
  const [showDeactivateModal, setShowDeactivateModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  const isAdmin = getRole() === 'admin'

  const pf = (patch) => setFormData(prev => ({ ...prev, ...patch }))
  const pi = (patch) => setFormData(prev => ({
    ...prev,
    personalInformation: { ...prev.personalInformation, ...patch }
  }))
  const ai = (patch) => setFormData(prev => ({
    ...prev,
    academicInfo: { ...prev.academicInfo, ...patch }
  }))

  function buildForm(u) {
    return {
      firstName:  u.personal_information?.first_name || (u.full_name?.split(' ')[0] ?? ''),
      middleName: u.personal_information?.middle_name || '',
      lastName:   u.personal_information?.last_name  || (u.full_name?.split(' ').slice(1).join(' ') ?? ''),
      studentId:  u.student_id || '',
      email:      u.email || '',
      isActive:   u.is_active === 1 || u.is_active === true,
      personalInformation: {
        phone:         u.personal_information?.phone || u.personal_information?.phone_number || '',
        date_of_birth: u.personal_information?.date_of_birth || '',
        gender:        u.personal_information?.gender || '',
        address:       u.personal_information?.address || '',
      },
      academicInfo: {
        program:           u.academic_info?.program || u.class_section || '',
        year_level:        u.academic_info?.year_level || '',
        gpa:               u.academic_info?.gpa ?? '',
        enrollment_status: u.academic_info?.enrollment_status || 'Enrolled',
      },
      academicHistory:       u.academic_history        || [],
      nonAcademicActivities: u.non_academic_activities || [],
      violations:            u.violations              || [],
      skills:                u.skills                  || [],
      affiliations:          u.affiliations            || [],
      studentType:           u.student_type            || 'regular',
      classSection:          u.class_section           || '',
    }
  }

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    const token = localStorage.getItem('authToken')
    if (!token) { setError('Missing auth token.'); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true); setError('')
      try {
        const res = await apiAdminUser(token, id)
        const u   = res?.user
        if (!u || u.role !== 'student') throw new Error('Student not found.')
        if (!cancelled) { setUser(u); setFormData(buildForm(u)) }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load student.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, isAdmin])

  async function handleSubmit(e) {
    if (e) e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token) return
    setSaving(true); setError('')

    // Validate dynamic sections for blank fields (Skills is exception)
    const sections = [
      { key: 'academicHistory', fields: ['semester', 'year', 'subjects', 'gpa'], label: 'Academic History' },
      { key: 'nonAcademicActivities', fields: ['activity_name', 'type', 'role', 'year'], label: 'Non-Academic Activities' },
      { key: 'violations', fields: ['description', 'date', 'severity', 'status'], label: 'Violations' },
      { key: 'affiliations', fields: ['organization', 'position', 'role', 'year'], label: 'Affiliations' }
    ]

    for (const section of sections) {
      const rows = formData[section.key] || []
      for (const [idx, row] of rows.entries()) {
        const isRowEmpty = section.fields.some(f => !String(row[f] || '').trim())
        if (isRowEmpty) {
          setError(`Please fill in all fields in row ${idx + 1} of the ${section.label} section.`)
          setSaving(false)
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
      }
    }

    try {
      await apiAdminPatchUser(token, id, {
        fullName: [formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(' '),
        email:    formData.email,
        studentId: formData.studentId,
        isActive:  formData.isActive,
        studentType: formData.studentType,
        classSection: formData.classSection,
        personalInformation: {
          ...formData.personalInformation,
          first_name: formData.firstName,
          middle_name: formData.middleName,
          last_name:  formData.lastName,
        },
        academicInfo:          formData.academicInfo,
        academicHistory:       formData.academicHistory,
        nonAcademicActivities: formData.nonAcademicActivities,
        violations:            formData.violations,
        skills:                formData.skills,
        affiliations:          formData.affiliations,
      })
      const res = await apiAdminUser(token, id)
      setUser(res.user)
      setFormData(buildForm(res.user))
      setIsEditing(false)
      setShowSuccessModal(true)
    } catch (err) {
      setError(err?.message || 'Failed to update student.')
    } finally {
      setSaving(false)
    }
  }

  function handleCancelEdit() {
    setIsEditing(false)
    if (user) setFormData(buildForm(user))
  }

  function updateRow(key, index, patch) {
    setFormData(prev => ({
      ...prev,
      [key]: prev[key].map((item, i) => i === index ? { ...item, ...patch } : item)
    }))
  }
  function removeRow(key, index) {
    setFormData(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }))
  }
  function addRow(key, template) {
    setFormData(prev => ({ ...prev, [key]: [...prev[key], template] }))
  }
  function addSkill() {
    const s = skillInput.trim()
    if (!s || formData.skills.includes(s)) { setSkillInput(''); return }
    pf({ skills: [...formData.skills, s] })
    setSkillInput('')
  }

  /* ── Guards ── */
  if (!isAdmin) return (
    <div className="p-8 text-center text-[var(--text-muted)]">Administrators only.</div>
  )
  if (loading) return (
    <div className="flex items-center justify-center p-16">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-[var(--accent)]" />
    </div>
  )
  if (error && !user) return (
    <div className="flex items-center justify-center p-8">
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 max-w-sm text-center">
        <p className="text-rose-400 text-sm mb-4">{error}</p>
        <Link to="/student-profile" className="text-[var(--accent)] hover:underline text-sm">← Return to Directory</Link>
      </div>
    </div>
  )

  const fd = formData

  return (
    <div className={`module-page ${!isEditing ? 'student-profile-view-mode' : 'student-profile-edit-mode'}`}>
      <div className="w-full space-y-5">

        {/* ── PAGE HEADER ── */}
        <header
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 admin-animate-reveal"
          style={{ animationDelay: '0.04s' }}
        >
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)] flex items-center gap-3 flex-wrap">
              {isEditing ? 'Edit Student Profile' : 'Student Profile'}
              {!isEditing && (
                <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/25 px-2.5 py-1 rounded-full">
                  View only
                </span>
              )}
            </h1>
            {!isEditing && (
              <p className="text-xs text-[var(--text-muted)] mt-2 max-w-xl">
                You are viewing this record. Select Edit profile to make changes.
              </p>
            )}
            <p className="main-description mt-1 flex items-center gap-2 text-[var(--text-muted)] flex-wrap">
              ID:&nbsp;
              <code className="text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded text-xs font-mono">
                {user?.student_id}
              </code>
              <span className={`text-xs font-semibold ${user?.is_active ? 'text-emerald-400' : 'text-rose-400'}`}>
                · {user?.is_active ? 'Active' : 'Inactive'}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/student-profile" className="btn btn-secondary">
              ← Back
            </Link>
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} className="btn btn-primary">
                Edit Profile
              </button>
            ) : (
              <>
                <button onClick={handleCancelEdit} disabled={saving} className="btn btn-secondary">
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            )}
          </div>
        </header>

        {error && (
          <div
            className="p-4 rounded-xl text-rose-400 bg-rose-500/10 border border-rose-500/20 text-sm admin-animate-reveal"
            style={{ animationDelay: '0.08s' }}
          >
            {error}
          </div>
        )}

        {/* ══════════════════════════════════════════
            TWO-COLUMN: Personal Info + Academic Info
        ══════════════════════════════════════════ */}
        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-5 admin-animate-reveal"
          style={{ animationDelay: '0.11s' }}
        >

          {/* LEFT — Personal Info */}
          <Card className={!isEditing ? 'border-[var(--border-color)]/80' : ''}>
            <SectionTitle>Personal Info</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              <div>
                <Label required={isEditing}>First Name</Label>
                {isEditing ? (
                  <FInput type="text" value={fd.firstName || ''} placeholder="First name"
                    onChange={e => pf({ firstName: e.target.value })} />
                ) : (
                  <ViewValue>{fd.firstName}</ViewValue>
                )}
              </div>

              <div>
                <Label>Middle Name</Label>
                {isEditing ? (
                  <FInput type="text" value={fd.middleName || ''} placeholder="Optional"
                    onChange={e => pf({ middleName: e.target.value })} />
                ) : (
                  <ViewValue>{fd.middleName}</ViewValue>
                )}
              </div>

              <div>
                <Label required={isEditing}>Last Name</Label>
                {isEditing ? (
                  <FInput type="text" value={fd.lastName || ''} placeholder="Last name"
                    onChange={e => pf({ lastName: e.target.value })} />
                ) : (
                  <ViewValue>{fd.lastName}</ViewValue>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">

              <div>
                <Label required={isEditing}>Student ID</Label>
                {isEditing ? (
                  <FInput type="text" value={fd.studentId || ''} placeholder="2024-00001"
                    onChange={e => pf({ studentId: e.target.value })} />
                ) : (
                  <ViewValue>{fd.studentId}</ViewValue>
                )}
              </div>

              <div>
                <Label required={isEditing}>Email</Label>
                {isEditing ? (
                  <FInput type="email" value={fd.email || ''} placeholder="email@example.com"
                    onChange={e => pf({ email: e.target.value })} />
                ) : (
                  <ViewValue>{fd.email}</ViewValue>
                )}
              </div>

              <div>
                <Label>Phone</Label>
                {isEditing ? (
                  <FInput type="text" inputMode="numeric"
                    value={fd.personalInformation?.phone || ''} placeholder="09XXXXXXXXX"
                    maxLength={11}
                    onChange={e => pi({ phone: e.target.value.replace(/\D/g, '').slice(0, 11) })} />
                ) : (
                  <ViewValue>{fd.personalInformation?.phone}</ViewValue>
                )}
              </div>

              <div>
                <Label>Date of Birth</Label>
                {isEditing ? (
                  <FInput type="date"
                    value={fd.personalInformation?.date_of_birth || ''}
                    onChange={e => pi({ date_of_birth: e.target.value })} />
                ) : (
                  <ViewValue>{fd.personalInformation?.date_of_birth}</ViewValue>
                )}
              </div>

              <div>
                <Label>Gender</Label>
                {isEditing ? (
                  <FSelect
                    value={fd.personalInformation?.gender || ''}
                    onChange={e => pi({ gender: e.target.value })}>
                    <option value="">Select gender</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Non-binary</option>
                    <option>Prefer not to say</option>
                  </FSelect>
                ) : (
                  <ViewValue>{fd.personalInformation?.gender}</ViewValue>
                )}
              </div>

              <div className="sm:col-span-2">
                <Label>Address</Label>
                {isEditing ? (
                  <FTextarea rows={3}
                    value={fd.personalInformation?.address || ''} placeholder="Full home address"
                    onChange={e => pi({ address: e.target.value })} />
                ) : (
                  <ViewValue multiline>{fd.personalInformation?.address}</ViewValue>
                )}
              </div>

            </div>
          </Card>

          {/* RIGHT — Academic Info */}
          <Card className={!isEditing ? 'border-[var(--border-color)]/80' : ''}>
            <SectionTitle>Academic Info</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div className="sm:col-span-2">
                <Label required={isEditing}>Program / Course</Label>
                {isEditing ? (
                  <FSelect
                    value={fd.academicInfo?.program || ''}
                    onChange={e => ai({ program: e.target.value })}>
                    <option value="">Select program</option>
                    <option value="CS">BS Computer Science (CS)</option>
                    <option value="IT">BS Information Technology (IT)</option>
                  </FSelect>
                ) : (
                  <ViewValue>
                    {fd.academicInfo?.program === 'CS'
                      ? 'BS Computer Science (CS)'
                      : fd.academicInfo?.program === 'IT'
                        ? 'BS Information Technology (IT)'
                        : fd.academicInfo?.program}
                  </ViewValue>
                )}
              </div>

              <div>
                <Label required={isEditing}>Year Level</Label>
                {isEditing ? (
                  <FSelect
                    value={fd.academicInfo?.year_level || ''}
                    onChange={e => ai({ year_level: e.target.value })}>
                    <option value="">Select year</option>
                    <option>1st Year</option>
                    <option>2nd Year</option>
                    <option>3rd Year</option>
                    <option>4th Year</option>
                  </FSelect>
                ) : (
                  <ViewValue>{fd.academicInfo?.year_level}</ViewValue>
                )}
              </div>

              <div>
                <Label required={isEditing}>Section</Label>
                {isEditing ? (
                  <FSelect
                    disabled={!fd.academicInfo?.year_level}
                    value={fd.classSection || ''}
                    onChange={e => pf({ classSection: e.target.value })}>
                    <option value="">{fd.academicInfo?.year_level ? 'Select section' : 'Choose year first'}</option>
                    {fd.academicInfo?.year_level === '1st Year' && (
                      <optgroup label="1st Year">
                        <option>1A</option><option>1B</option><option>1C</option><option>1D</option><option>1E</option>
                      </optgroup>
                    )}
                    {fd.academicInfo?.year_level === '2nd Year' && (
                      <optgroup label="2nd Year">
                        <option>2A</option><option>2B</option><option>2C</option><option>2D</option><option>2E</option>
                      </optgroup>
                    )}
                    {fd.academicInfo?.year_level === '3rd Year' && (
                      <optgroup label="3rd Year">
                        <option>3A</option><option>3B</option><option>3C</option><option>3D</option><option>3E</option>
                      </optgroup>
                    )}
                    {fd.academicInfo?.year_level === '4th Year' && (
                      <optgroup label="4th Year">
                        <option>4A</option><option>4B</option><option>4C</option><option>4D</option><option>4E</option>
                      </optgroup>
                    )}
                  </FSelect>
                ) : (
                  <ViewValue>{fd.classSection}</ViewValue>
                )}
              </div>

              <div>
                <Label required={isEditing}>Type</Label>
                {isEditing ? (
                  <FSelect
                    value={fd.studentType || 'regular'}
                    onChange={e => pf({ studentType: e.target.value })}>
                    <option value="regular">Regular</option>
                    <option value="irregular">Irregular</option>
                  </FSelect>
                ) : (
                  <ViewValue>{fd.studentType === 'irregular' ? 'Irregular' : 'Regular'}</ViewValue>
                )}
              </div>

              <div>
                <Label>GPA</Label>
                {isEditing ? (
                  <FInput type="number" step="0.01" min="1" max="5"
                    value={fd.academicInfo?.gpa ?? ''} placeholder="e.g. 1.75"
                    onChange={e => ai({ gpa: e.target.value })} />
                ) : (
                  <ViewValue>{fd.academicInfo?.gpa != null && fd.academicInfo?.gpa !== '' ? String(fd.academicInfo.gpa) : ''}</ViewValue>
                )}
              </div>

              <div className="sm:col-span-2">
                <Label>Enrollment Status</Label>
                {isEditing ? (
                  <FSelect
                    value={fd.academicInfo?.enrollment_status || ''}
                    onChange={e => ai({ enrollment_status: e.target.value })}>
                    <option value="Enrolled">Enrolled</option>
                    <option value="Not Enrolled">Not Enrolled</option>
                  </FSelect>
                ) : (
                  <div className="min-h-[44px] flex items-center">
                    <span
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider inline-flex ${
                        fd.academicInfo?.enrollment_status === 'Enrolled'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25'
                          : fd.academicInfo?.enrollment_status === 'Not Enrolled'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/25'
                            : 'bg-[var(--border-color)]/40 text-[var(--text-muted)] border border-[var(--border-color)]'
                      }`}
                    >
                      {fd.academicInfo?.enrollment_status || '—'}
                    </span>
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                {isEditing ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-color)] bg-[rgba(255,255,255,0.02)]">
                    <input id="isActive" type="checkbox"
                      checked={fd.isActive ?? true}
                      onChange={e => {
                        if (!e.target.checked) {
                          setShowDeactivateModal(true)
                        } else {
                          pf({ isActive: true })
                        }
                      }}
                      className="w-4 h-4 accent-[var(--accent)] cursor-pointer" />
                    <label htmlFor="isActive" className="text-sm text-[var(--text)] select-none cursor-pointer">
                      Account is Active
                    </label>
                  </div>
                ) : (
                  <div>
                    <Label>Account status</Label>
                    <div className="min-h-[44px] flex items-center">
                      <span
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                          fd.isActive
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/25'
                        }`}
                      >
                        {fd.isActive ? 'Active account' : 'Inactive account'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </Card>
        </div>

        {/* ══════════════════════════════════════════
            FULL-WIDTH SECTIONS
        ══════════════════════════════════════════ */}

        {/* Academic History */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.2s' }}>
          <SectionTitle>Academic History</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <TableHead cols={['Semester', 'Year', 'Subjects', 'GPA']} />
              <tbody>
                {fd.academicHistory?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-muted)] text-xs italic">
                      No records yet.
                    </td>
                  </tr>
                )}
                {fd.academicHistory?.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="px-3 py-2.5 align-top">
                      {isEditing ? (
                        <FInput placeholder="e.g. 1st Sem"
                          value={row.semester || ''} onChange={e => updateRow('academicHistory', i, { semester: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.semester || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 w-32 align-top">
                      {isEditing ? (
                        <FInput placeholder="2024"
                          value={row.year || ''} onChange={e => updateRow('academicHistory', i, { year: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.year || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {isEditing ? (
                        <FInput placeholder="e.g. Math, English"
                          value={row.subjects || ''} onChange={e => updateRow('academicHistory', i, { subjects: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.subjects || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 w-28 align-top">
                      {isEditing ? (
                        <FInput type="number" step="0.01" placeholder="1.75"
                          value={row.gpa || ''} onChange={e => updateRow('academicHistory', i, { gpa: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.gpa || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center w-10 align-top">
                      {isEditing && <RemoveBtn onClick={() => removeRow('academicHistory', i)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isEditing && (
            <AddRowBtn
              onClick={() => addRow('academicHistory', { semester: '', year: '', subjects: '', gpa: '' })}
              label="+ Add Semester"
            />
          )}
        </Card>

        {/* Non-Academic Activities */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.26s' }}>
          <SectionTitle>Non-Academic Activities</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <TableHead cols={['Activity Name', 'Type', 'Role', 'Year']} />
              <tbody>
                {fd.nonAcademicActivities?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-muted)] text-xs italic">
                      No records yet.
                    </td>
                  </tr>
                )}
                {fd.nonAcademicActivities?.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="px-3 py-2.5 align-top">
                      {isEditing ? (
                        <FInput placeholder="Activity name"
                          value={row.activity_name || ''} onChange={e => updateRow('nonAcademicActivities', i, { activity_name: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.activity_name || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {isEditing ? (
                        <FInput placeholder="e.g. Sports"
                          value={row.type || ''} onChange={e => updateRow('nonAcademicActivities', i, { type: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.type || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {isEditing ? (
                        <FInput placeholder="e.g. Captain"
                          value={row.role || ''} onChange={e => updateRow('nonAcademicActivities', i, { role: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.role || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 w-28 align-top">
                      {isEditing ? (
                        <FInput placeholder="2023"
                          value={row.year || ''} onChange={e => updateRow('nonAcademicActivities', i, { year: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.year || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center w-10 align-top">
                      {isEditing && <RemoveBtn onClick={() => removeRow('nonAcademicActivities', i)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isEditing && (
            <AddRowBtn
              onClick={() => addRow('nonAcademicActivities', { activity_name: '', type: '', role: '', year: '' })}
              label="+ Add Activity"
            />
          )}
        </Card>

        {/* Violations */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.32s' }}>
          <SectionTitle>Violations</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <TableHead cols={['Description', 'Date', 'Severity', 'Status']} />
              <tbody>
                {fd.violations?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-muted)] text-xs italic">
                      No violations on record.
                    </td>
                  </tr>
                )}
                {fd.violations?.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="px-3 py-2.5 min-w-[200px] align-top">
                      {isEditing ? (
                        <FInput placeholder="Describe violation"
                          value={row.description || ''} onChange={e => updateRow('violations', i, { description: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.description || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 w-40 align-top">
                      {isEditing ? (
                        <FInput type="date"
                          value={row.date || ''} onChange={e => updateRow('violations', i, { date: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.date || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 w-36 align-top">
                      {isEditing ? (
                        <FSelect
                          value={row.severity || ''} onChange={e => updateRow('violations', i, { severity: e.target.value })}>
                          <option value="">Severity</option>
                          <option>Minor</option>
                          <option>Major</option>
                          <option>Critical</option>
                        </FSelect>
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.severity || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 w-36 align-top">
                      {isEditing ? (
                        <FSelect
                          value={row.status || ''} onChange={e => updateRow('violations', i, { status: e.target.value })}>
                          <option value="">Status</option>
                          <option>Pending</option>
                          <option>Resolved</option>
                          <option>Appealed</option>
                        </FSelect>
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.status || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center w-10 align-top">
                      {isEditing && <RemoveBtn onClick={() => removeRow('violations', i)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isEditing && (
            <AddRowBtn
              onClick={() => addRow('violations', { description: '', date: '', severity: '', status: '' })}
              label="+ Add Violation"
            />
          )}
        </Card>

        {/* Skills */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.38s' }}>
          <SectionTitle>Skills</SectionTitle>
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {fd.skills?.length === 0 && !isEditing && (
              <p className="text-[var(--text-muted)] text-xs italic">No skills listed.</p>
            )}
            {fd.skills?.map((skill, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full"
              >
                {skill}
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => pf({ skills: fd.skills.filter((_, j) => j !== i) })}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent)' }}
                    className="hover:text-rose-400 transition-colors leading-none"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
          {isEditing && (
            <div className="flex gap-2 mt-4">
              <FInput
                type="text"
                placeholder="Add a skill…"
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
                className="flex-1"
              />
              <button
                type="button"
                onClick={addSkill}
                style={{ border: '1px solid var(--border-color)', color: 'var(--text)' }}
                className="px-5 py-2 bg-transparent shrink-0 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-200 hover:bg-[var(--accent-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Add
              </button>
            </div>
          )}
        </Card>

        {/* Affiliations */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.44s' }}>
          <SectionTitle>Affiliations</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <TableHead cols={['Organization', 'Position', 'Year']} />
              <tbody>
                {fd.affiliations?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[var(--text-muted)] text-xs italic">
                      No affiliations yet.
                    </td>
                  </tr>
                )}
                {fd.affiliations?.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="px-3 py-2.5 align-top">
                      {isEditing ? (
                        <FInput placeholder="Organization name"
                          value={row.organization || ''} onChange={e => updateRow('affiliations', i, { organization: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.organization || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {isEditing ? (
                        <FInput placeholder="e.g. President"
                          value={row.position || row.role || ''} onChange={e => updateRow('affiliations', i, { position: e.target.value, role: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.position || row.role || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 w-28 align-top">
                      {isEditing ? (
                        <FInput placeholder="2023"
                          value={row.year || ''} onChange={e => updateRow('affiliations', i, { year: e.target.value })} />
                      ) : (
                        <span className="block text-sm text-[var(--text)] py-2">{row.year || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center w-10 align-top">
                      {isEditing && <RemoveBtn onClick={() => removeRow('affiliations', i)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isEditing && (
            <AddRowBtn
              onClick={() => addRow('affiliations', { organization: '', position: '', role: '', year: '' })}
              label="+ Add Affiliation"
            />
          )}
        </Card>

      </div>

      <SuccessModal
        open={showSuccessModal}
        title="Profile updated"
        message="The student profile was saved successfully."
        onClose={() => setShowSuccessModal(false)}
      />

      {/* ── DEACTIVATE CONFIRMATION MODAL ── */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/5 backdrop-blur-[1.5px]" onClick={() => setShowDeactivateModal(false)} />
          <div className="relative bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--border-color)] rounded-[var(--radius-lg)] p-7 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-[var(--accent-soft)] text-[var(--accent)] rounded-full flex items-center justify-center mb-5 ring-4 ring-[var(--accent-soft)]">
                <IconAlert />
              </div>
              <h3 className="text-xl font-bold text-[var(--text)] mb-3">Deactivate Profile?</h3>
              <p className="text-sm text-[var(--text-muted)] mb-8 leading-relaxed">
                This student will be barred from logging in and accessing any portal features. You can reactivate this profile at any time.
              </p>
              <div className="flex w-full gap-3">
                <button 
                  onClick={() => setShowDeactivateModal(false)}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all duration-200"
                  type="button"
                >
                  Keep Active
                </button>
                <button 
                  onClick={() => {
                    pf({ isActive: false })
                    setShowDeactivateModal(false)
                  }}
                  className="flex-1 px-4 py-3 text-sm font-semibold bg-[var(--accent)] text-white rounded-xl hover:brightness-110 shadow-lg shadow-[var(--accent)]/20 transition-all duration-200"
                  type="button"
                >
                  Deactivate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
