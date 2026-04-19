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

const Label = ({ children, required }) => (
  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
    {children}
    {required && <span className="text-rose-500 ml-1">*</span>}
  </label>
)

const inputCls = 'search-input w-full disabled:opacity-60 disabled:cursor-not-allowed'
const FInput = ({ className = '', ...props }) => <input className={`${inputCls} ${className}`} {...props} />

const FSelect = ({ children, className = '', ...props }) => (
  <div className="relative">
    <select className={`${inputCls} appearance-none pr-8 ${className}`} {...props}>
      {children}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  </div>
)

const FTextarea = ({ className = '', ...props }) => <textarea className={`${inputCls} resize-none ${className}`} {...props} />

const SectionTitle = ({ children }) => (
  <div className="flex items-center gap-3 mb-5">
    <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] whitespace-nowrap">{children}</span>
    <div className="flex-1 h-px bg-[var(--border-color)]" />
  </div>
)

const Card = ({ children, className = '' }) => (
  <div className={`bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-6 shadow-sm ${className}`}>{children}</div>
)

export default function AdminCreateFaculty() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    dateOfBirth: '',
    gender: 'Prefer not to say',
    password: '',
    confirmPassword: '',
    role: 'faculty_professor',
    department: '',
    specialization: '',
    bio: '',
  })

  const isAdmin = getRole() === 'admin'

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    setError('')
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.confirmPassword || !form.department) {
      setError('Please fill in all required fields.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setCreating(true)
    setError('')
    try {
      await apiRegister({
        role: form.role,
        identifier: form.email.trim(),
        email: form.email.trim(),
        password: form.password,
        fullName: [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' '),
        personalInformation: {
          first_name: form.firstName,
          middle_name: form.middleName,
          last_name: form.lastName,
          phone_number: form.phoneNumber,
          date_of_birth: form.dateOfBirth,
          gender: form.gender,
        },
        summary: {
          department: form.department,
          specialization: form.specialization,
        },
        bio: form.bio,
      })
      navigate('/admin/faculty')
    } catch (err) {
      setError(err?.message || 'Failed to create faculty account.')
    } finally {
      setCreating(false)
    }
  }

  if (!isAdmin) return <div className="p-8 text-center text-[var(--text-muted)]">Administrators only.</div>

  return (
    <div className="module-page">
      <div className="w-full space-y-5">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-reveal">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">Create Faculty Profile</h1>
            <p className="main-description text-[var(--text-muted)] mt-1">Register a new faculty member and assign institutional roles.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin/faculty" className="btn btn-secondary">← Cancel</Link>
            <button onClick={handleCreate} disabled={creating} className="btn btn-primary">
              {creating ? 'Creating Account...' : 'Save Faculty Profile'}
            </button>
          </div>
        </header>

        {error && (
          <div className="p-4 rounded-xl text-rose-400 bg-rose-500/10 border border-rose-500/20 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-reveal" style={{ animationDelay: '0.1s' }}>
          
          <Card>
            <SectionTitle>Identity & Credentials</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label required>First Name</Label>
                <FInput name="firstName" value={form.firstName} onChange={handleChange} placeholder="First name" />
              </div>
              <div>
                <Label>Middle Name</Label>
                <FInput name="middleName" value={form.middleName} onChange={handleChange} placeholder="Middle name" />
              </div>
              <div>
                <Label required>Last Name</Label>
                <FInput name="lastName" value={form.lastName} onChange={handleChange} placeholder="Last name" />
              </div>
              <div>
                <Label>Phone Number</Label>
                <FInput name="phoneNumber" value={form.phoneNumber} onChange={handleChange} placeholder="09XX XXX XXXX" />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <FInput type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleChange} />
              </div>
              <div>
                <Label>Gender</Label>
                <FSelect name="gender" value={form.gender} onChange={handleChange}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </FSelect>
              </div>
              <div className="sm:col-span-2">
                <Label required>Faculty Email</Label>
                <FInput type="email" name="email" value={form.email} onChange={handleChange} placeholder="faculty@university.edu" />
              </div>
              <div>
                <Label required>Password</Label>
                <FInput type="password" name="password" value={form.password} onChange={handleChange} placeholder="Min. 8 characters" />
              </div>
              <div>
                <Label required>Confirm Password</Label>
                <FInput type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="Re-enter password" />
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle>Institutional Assignment</SectionTitle>
            <div className="space-y-4">
              <div>
                <Label required>Academic Role</Label>
                <FSelect name="role" value={form.role} onChange={handleChange}>
                  <option value="faculty_professor">Professor</option>
                  <option value="dean">Dean</option>
                  <option value="department_chair">Department Chair</option>
                  <option value="secretary">Secretary</option>
                </FSelect>
              </div>
              <div>
                <Label required>Department</Label>
                <FSelect name="department" value={form.department} onChange={handleChange}>
                  <option value="">Select Department</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Computer Science">Computer Science</option>
                </FSelect>
              </div>
              <div>
                <Label>Specialization</Label>
                <FInput name="specialization" value={form.specialization} onChange={handleChange} placeholder="e.g. Artificial Intelligence" />
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <SectionTitle>Professional Summary</SectionTitle>
            <div>
              <Label>Biography / Description</Label>
              <FTextarea name="bio" rows={4} value={form.bio} onChange={handleChange} placeholder="Enter a brief professional bio..." />
            </div>
          </Card>

        </div>
      </div>
    </div>
  )
}
