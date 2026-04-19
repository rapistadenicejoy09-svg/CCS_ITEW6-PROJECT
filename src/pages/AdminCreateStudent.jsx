import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRegister } from '../lib/api'

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    return user?.role || null
  } catch {
    return null
  }
}

/* ─── Reusable field components matching Edit Profile ─── */

const Label = ({ children, required }) => (
  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
    {children}
    {required && <span className="text-rose-500 ml-1">*</span>}
  </label>
)

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

export default function AdminCreateStudent() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [skillInput, setSkillInput] = useState('')

  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    studentId: '',
    email: '',
    password: '',
    confirmPassword: '',
    studentType: 'regular',
    classSection: '',
    personalInformation: {
      phone: '',
      date_of_birth: '',
      gender: '',
      address: '',
    },
    academicInfo: {
      program: '',
      year_level: '',
      gpa: '',
      enrollment_status: 'Enrolled',
    },
    academicHistory: [],
    nonAcademicActivities: [],
    violations: [],
    skills: [],
    affiliations: [],
  })

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

  const handleCreate = async (e) => {
    if (e) e.preventDefault()
    if (!formData.studentId || !formData.password || !formData.confirmPassword || !formData.firstName || !formData.lastName || !formData.email) {
      setError('Required fields (*) are missing.')
      return
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setCreating(true)
    setError('')
    try {
      // Validate dynamic sections for blank fields (Skills is exception)
      const sections = [
        { key: 'academicHistory', fields: ['semester', 'year', 'subjects', 'gpa'], label: 'Academic History' },
        { key: 'nonAcademicActivities', fields: ['activity_name', 'type', 'role', 'year'], label: 'Non-Academic Activities' },
        { key: 'violations', fields: ['description', 'date', 'severity', 'status'], label: 'Violations' },
        { key: 'affiliations', fields: ['organization', 'position', 'role', 'year'], label: 'Affiliations' }
      ]

      for (const section of sections) {
        const rows = formData[section.key]
        for (const [idx, row] of rows.entries()) {
          const isRowEmpty = section.fields.some(f => !String(row[f] || '').trim())
          if (isRowEmpty) {
            setError(`Please fill in all fields in row ${idx + 1} of the ${section.label} section.`)
            setCreating(false)
            return
          }
        }
      }

      await apiRegister({
        role: 'student',
        studentId: formData.studentId.trim(),
        identifier: formData.studentId.trim(),
        email: formData.email.trim(),
        password: formData.password,
        fullName: [formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(' '),
        personalInformation: {
          ...formData.personalInformation,
          first_name: formData.firstName,
          middle_name: formData.middleName.trim() || undefined,
          last_name: formData.lastName,
          gender: formData.personalInformation.gender,
        },
        academicInfo: formData.academicInfo,
        academicHistory: formData.academicHistory,
        nonAcademicActivities: formData.nonAcademicActivities,
        violations: formData.violations,
        skills: formData.skills,
        affiliations: formData.affiliations,
        studentType: formData.studentType,
        classSection: formData.classSection,
      })
      navigate('/student-profile', {
        state: {
          studentCreated: true,
          createdStudentId: formData.studentId.trim(),
        },
      })
    } catch (err) {
      setError(err?.message || 'Failed to create student account.')
    } finally {
      setCreating(false)
    }
  }

  if (!isAdmin) return (
    <div className="p-8 text-center text-[var(--text-muted)]">Administrators only.</div>
  )

  const fd = formData

  return (
    <div className="module-page">
      <div className="w-full space-y-5">

        {/* Header */}
        <header
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 admin-animate-reveal"
          style={{ animationDelay: '0.04s' }}
        >
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">Create Student Profile</h1>
            <p className="main-description text-[var(--text-muted)] mt-1">
              Initialize a new student account with full academic and personal details.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/student-profile" className="btn btn-secondary">
              ← Cancel
            </Link>
            <button type="button" onClick={handleCreate} disabled={creating} className="btn btn-primary">
              {creating ? 'Creating Profile...' : 'Save Profile'}
            </button>
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

        {/* Two-Column Form (same entrance pattern as edit profile) */}
        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-5 admin-animate-reveal"
          style={{ animationDelay: '0.11s' }}
        >

          {/* Personal Info Card */}
          <Card>
            <SectionTitle>Personal Info & Credentials</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label required>First Name</Label>
                <FInput value={fd.firstName} onChange={e => pf({ firstName: e.target.value })} placeholder="First name" />
              </div>
              <div>
                <Label>Middle Name</Label>
                <FInput value={fd.middleName} onChange={e => pf({ middleName: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <Label required>Last Name</Label>
                <FInput value={fd.lastName} onChange={e => pf({ lastName: e.target.value })} placeholder="Last name" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <Label required>Student ID</Label>
                <FInput value={fd.studentId} onChange={e => pf({ studentId: e.target.value })} placeholder="2024-00001" />
              </div>
              <div>
                <Label required>Email</Label>
                <FInput type="email" value={fd.email} onChange={e => pf({ email: e.target.value })} placeholder="email@university.edu" />
              </div>
              <div>
                <Label required>Password</Label>
                <FInput type="password" value={fd.password} onChange={e => pf({ password: e.target.value })} placeholder="Min. 8 characters" />
              </div>
              <div>
                <Label required>Confirm Password</Label>
                <FInput type="password" value={fd.confirmPassword} onChange={e => pf({ confirmPassword: e.target.value })} placeholder="Re-enter password" />
              </div>
              <div>
                <Label>Phone</Label>
                <FInput inputMode="numeric" maxLength={11} value={fd.personalInformation.phone} 
                  onChange={e => pi({ phone: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="09XXXXXXXXX" />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <FInput type="date" value={fd.personalInformation.date_of_birth} onChange={e => pi({ date_of_birth: e.target.value })} />
              </div>
              <div>
                <Label>Gender</Label>
                <FSelect value={fd.personalInformation.gender} onChange={e => pi({ gender: e.target.value })}>
                  <option value="">Select gender</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </FSelect>
              </div>
              <div className="sm:col-span-2">
                <Label>Address</Label>
                <FTextarea rows={3} value={fd.personalInformation.address} onChange={e => pi({ address: e.target.value })} placeholder="Home address" />
              </div>
            </div>
          </Card>

          {/* Academic Info Card */}
          <Card>
            <SectionTitle>Academic Status</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label required>Program / Course</Label>
                <FSelect value={fd.academicInfo.program} onChange={e => ai({ program: e.target.value })}>
                  <option value="">Select program</option>
                  <option value="CS">BS Computer Science (CS)</option>
                  <option value="IT">BS Information Technology (IT)</option>
                </FSelect>
              </div>
              <div>
                <Label required>Year Level</Label>
                <FSelect value={fd.academicInfo.year_level} onChange={e => ai({ year_level: e.target.value })}>
                  <option value="">Select year</option>
                  <option>1st Year</option>
                  <option>2nd Year</option>
                  <option>3rd Year</option>
                  <option>4th Year</option>
                </FSelect>
              </div>
              <div>
                <Label required>Section</Label>
                <FSelect 
                  disabled={!fd.academicInfo.year_level}
                  value={fd.classSection || ''} 
                  onChange={e => pf({ classSection: e.target.value })}>
                  <option value="">{fd.academicInfo.year_level ? 'Select section' : 'Choose year first'}</option>
                  {fd.academicInfo.year_level === '1st Year' && (
                    <optgroup label="1st Year">
                      <option>1A</option><option>1B</option><option>1C</option><option>1D</option><option>1E</option>
                    </optgroup>
                  )}
                  {fd.academicInfo.year_level === '2nd Year' && (
                    <optgroup label="2nd Year">
                      <option>2A</option><option>2B</option><option>2C</option><option>2D</option><option>2E</option>
                    </optgroup>
                  )}
                  {fd.academicInfo.year_level === '3rd Year' && (
                    <optgroup label="3rd Year">
                      <option>3A</option><option>3B</option><option>3C</option><option>3D</option><option>3E</option>
                    </optgroup>
                  )}
                  {fd.academicInfo.year_level === '4th Year' && (
                    <optgroup label="4th Year">
                      <option>4A</option><option>4B</option><option>4C</option><option>4D</option><option>4E</option>
                    </optgroup>
                  )}
                </FSelect>
              </div>
              <div>
                <Label required>Type</Label>
                <FSelect value={fd.studentType || 'regular'} onChange={e => pf({ studentType: e.target.value })}>
                  <option value="regular">Regular</option>
                  <option value="irregular">Irregular</option>
                </FSelect>
              </div>
              <div>
                <Label>Initial GPA</Label>
                <FInput type="number" step="0.01" value={fd.academicInfo.gpa} onChange={e => ai({ gpa: e.target.value })} placeholder="e.g. 1.75" />
              </div>
              <div>
                <Label>Enrollment Status</Label>
                <FSelect value={fd.academicInfo.enrollment_status} onChange={e => ai({ enrollment_status: e.target.value })}>
                  <option value="Enrolled">Enrolled</option>
                  <option value="Not Enrolled">Not Enrolled</option>
                </FSelect>
              </div>
            </div>
          </Card>
        </div>

        {/* Full-Width Sections */}

        {/* Academic History */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.2s' }}>
          <SectionTitle>Academic History</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <TableHead cols={['Semester', 'Year', 'Subjects', 'GPA']} />
              <tbody>
                {fd.academicHistory.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-[var(--text-muted)] text-xs italic">No records added.</td></tr>
                )}
                {fd.academicHistory.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="px-3 py-2.5"><FInput value={row.semester} onChange={e => updateRow('academicHistory', i, { semester: e.target.value })} placeholder="1st Sem" /></td>
                    <td className="px-3 py-2.5 w-32"><FInput value={row.year} onChange={e => updateRow('academicHistory', i, { year: e.target.value })} placeholder="2024" /></td>
                    <td className="px-3 py-2.5"><FInput value={row.subjects} onChange={e => updateRow('academicHistory', i, { subjects: e.target.value })} placeholder="Math, CS" /></td>
                    <td className="px-3 py-2.5 w-28"><FInput type="number" step="0.01" value={row.gpa} onChange={e => updateRow('academicHistory', i, { gpa: e.target.value })} placeholder="1.75" /></td>
                    <td className="px-3 py-2.5 text-center w-10"><RemoveBtn onClick={() => removeRow('academicHistory', i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddRowBtn onClick={() => addRow('academicHistory', { semester: '', year: '', subjects: '', gpa: '' })} label="+ Add Semester Record" />
        </Card>

        {/* Activities */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.26s' }}>
          <SectionTitle>Non-Academic Activities</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <TableHead cols={['Activity Name', 'Type', 'Role', 'Year']} />
              <tbody>
                {fd.nonAcademicActivities.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-[var(--text-muted)] text-xs italic">No activities added.</td></tr>
                )}
                {fd.nonAcademicActivities.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="px-3 py-2.5"><FInput value={row.activity_name} onChange={e => updateRow('nonAcademicActivities', i, { activity_name: e.target.value })} placeholder="Club" /></td>
                    <td className="px-3 py-2.5"><FInput value={row.type} onChange={e => updateRow('nonAcademicActivities', i, { type: e.target.value })} placeholder="Sports" /></td>
                    <td className="px-3 py-2.5"><FInput value={row.role} onChange={e => updateRow('nonAcademicActivities', i, { role: e.target.value })} placeholder="Captain" /></td>
                    <td className="px-3 py-2.5 w-28"><FInput value={row.year} onChange={e => updateRow('nonAcademicActivities', i, { year: e.target.value })} placeholder="2023" /></td>
                    <td className="px-3 py-2.5 text-center w-10"><RemoveBtn onClick={() => removeRow('nonAcademicActivities', i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddRowBtn onClick={() => addRow('nonAcademicActivities', { activity_name: '', type: '', role: '', year: '' })} label="+ Add Activity Record" />
        </Card>

        {/* Skills */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.32s' }}>
          <SectionTitle>Skills</SectionTitle>
          <div className="flex flex-wrap gap-2 mb-4 min-h-[32px]">
            {fd.skills.map((skill, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 bg-[var(--accent-soft)] border border-[var(--accent)]/25 text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full">
                {skill}
                <button type="button" onClick={() => pf({ skills: fd.skills.filter((_, j) => j !== i) })} style={{ background: 'transparent', border: 'none', color: 'var(--accent)' }} className="hover:text-rose-400 transition-colors leading-none">✕</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <FInput value={skillInput} onChange={e => setSkillInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }} placeholder="Add skill..." className="flex-1" />
            <button type="button" onClick={addSkill} style={{ border: '1px solid var(--border-color)', color: 'var(--text)' }} className="px-5 py-2 bg-transparent shrink-0 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-200 hover:bg-[var(--accent-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]">Add</button>
          </div>
        </Card>

        {/* Violations */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.38s' }}>
          <SectionTitle>Violations</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <TableHead cols={['Description', 'Date', 'Severity', 'Status']} />
              <tbody>
                {fd.violations.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-[var(--text-muted)] text-xs italic">No violations on record.</td></tr>
                )}
                {fd.violations.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="px-3 py-2.5 min-w-[200px]"><FInput value={row.description} onChange={e => updateRow('violations', i, { description: e.target.value })} placeholder="Describe violation" /></td>
                    <td className="px-3 py-2.5 w-40"><FInput type="date" value={row.date} onChange={e => updateRow('violations', i, { date: e.target.value })} /></td>
                    <td className="px-3 py-2.5 w-36">
                      <FSelect value={row.severity} onChange={e => updateRow('violations', i, { severity: e.target.value })}>
                        <option value="">Severity</option>
                        <option>Minor</option>
                        <option>Major</option>
                        <option>Critical</option>
                      </FSelect>
                    </td>
                    <td className="px-3 py-2.5 w-36">
                      <FSelect value={row.status} onChange={e => updateRow('violations', i, { status: e.target.value })}>
                        <option value="">Status</option>
                        <option>Pending</option>
                        <option>Resolved</option>
                        <option>Appealed</option>
                      </FSelect>
                    </td>
                    <td className="px-3 py-2.5 text-center w-10"><RemoveBtn onClick={() => removeRow('violations', i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddRowBtn onClick={() => addRow('violations', { description: '', date: '', severity: '', status: '' })} label="+ Add Violation Record" />
        </Card>

        {/* Affiliations */}
        <Card className="admin-profile-block-enter" style={{ animationDelay: '0.44s' }}>
          <SectionTitle>Affiliations</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <TableHead cols={['Organization', 'Position', 'Year']} />
              <tbody>
                {fd.affiliations.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-[var(--text-muted)] text-xs italic">No affiliations yet.</td></tr>
                )}
                {fd.affiliations.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="px-3 py-2.5"><FInput value={row.organization} onChange={e => updateRow('affiliations', i, { organization: e.target.value })} placeholder="Organization" /></td>
                    <td className="px-3 py-2.5"><FInput value={row.position || row.role || ''} onChange={e => updateRow('affiliations', i, { position: e.target.value, role: e.target.value })} placeholder="Role" /></td>
                    <td className="px-3 py-2.5 w-28"><FInput value={row.year} onChange={e => updateRow('affiliations', i, { year: e.target.value })} placeholder="2023" /></td>
                    <td className="px-3 py-2.5 text-center w-10"><RemoveBtn onClick={() => removeRow('affiliations', i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddRowBtn onClick={() => addRow('affiliations', { organization: '', position: '', role: '', year: '' })} label="+ Add Affiliation Record" />
        </Card>

      </div>
    </div>
  )
}
