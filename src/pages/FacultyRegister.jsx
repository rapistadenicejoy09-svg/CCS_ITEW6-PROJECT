import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SuccessModal from '../components/SuccessModal'
import { apiRegister } from '../lib/api'

export default function FacultyRegister() {
  const navigate = useNavigate()
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
    department: 'Information Technology',
    specialization: '',
  })
  const [error, setError] = useState('')
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    document.body.dataset.theme = 'light'
  }, [])

  useEffect(() => {
    if (form.role === 'dean' || form.role === 'secretary') {
      setForm(prev => ({ ...prev, department: 'CCS' }))
    } else if (form.department === 'CCS') {
      setForm(prev => ({ ...prev, department: 'Information Technology' }))
    }
  }, [form.role])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.confirmPassword || !form.department) {
      setError('Please fill in all fields.')
      return
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
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
        department: form.department,
        specialization: form.specialization,
        summary: {
          department: form.department,
          specialization: form.specialization,
        },
      })
      setSuccessModalOpen(true)
    } catch {
      setError('Failed to create account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page auth-page-split auth-page-split-left faculty-register-page">
      <div className="auth-card auth-card-tall faculty-register-card">
        <h1 className="auth-title">Faculty Registration</h1>
        <p className="auth-subtitle">
          Create an account to access the faculty portal.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <section className="faculty-register-section">
            <h2 className="faculty-register-section-title">Personal Information</h2>
            <div className="faculty-register-grid">
              <label className="auth-field">
                <span className="auth-label">First Name</span>
                <input
                  className="auth-input"
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  placeholder="First name"
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">Middle Name</span>
                <input
                  className="auth-input"
                  type="text"
                  name="middleName"
                  value={form.middleName}
                  onChange={handleChange}
                  placeholder="Middle name"
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">Last Name</span>
                <input
                  className="auth-input"
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  placeholder="Last name"
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">Phone Number</span>
                <input
                  className="auth-input"
                  type="tel"
                  name="phoneNumber"
                  value={form.phoneNumber}
                  onChange={handleChange}
                  placeholder="09XX XXX XXXX"
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">Date of Birth</span>
                <input
                  className="auth-input"
                  type="date"
                  name="dateOfBirth"
                  value={form.dateOfBirth}
                  onChange={handleChange}
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">Gender</span>
                <select
                  className="auth-input"
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </label>
            </div>
          </section>

          <section className="faculty-register-section">
            <h2 className="faculty-register-section-title">Institutional Assignment</h2>
            <div className="faculty-register-grid">
              <label className="auth-field">
                <span className="auth-label">Academic Role</span>
                <select
                  className="auth-input"
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                >
                  <option value="faculty_professor">Professor</option>
                  <option value="dean">Dean</option>
                  <option value="department_chair">Department Chair</option>
                  <option value="secretary">Secretary</option>
                </select>
              </label>

              <label className="auth-field">
                <span className="auth-label">Department</span>
                <select
                  className="auth-input"
                  name="department"
                  value={form.department}
                  onChange={handleChange}
                  required
                  disabled={form.role === 'dean' || form.role === 'secretary'}
                >
                  <option value="Information Technology">Information Technology</option>
                  <option value="Computer Science">Computer Science</option>
                  <option value="CCS" disabled hidden>CCS Department</option>
                </select>
              </label>

              <label className="auth-field faculty-register-field-full">
                <span className="auth-label">Specialization</span>
                <input
                  className="auth-input"
                  type="text"
                  name="specialization"
                  value={form.specialization}
                  onChange={handleChange}
                  placeholder="e.g. Software Engineering"
                />
              </label>
            </div>
          </section>

          <section className="faculty-register-section">
            <h2 className="faculty-register-section-title">Account Credentials</h2>
            <div className="faculty-register-grid">
              <label className="auth-field faculty-register-field-full">
                <span className="auth-label">Faculty Email</span>
                <input
                  className="auth-input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="faculty@example.edu"
                />
              </label>

              <label className="auth-field">
                <span className="auth-label">Password</span>
                <div className="password-wrapper">
                  <input
                    className="auth-input"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Hide Password" : "Show Password"}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    )}
                  </button>
                </div>
              </label>

              <label className="auth-field">
                <span className="auth-label">Confirm password</span>
                <div className="password-wrapper">
                  <input
                    className="auth-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    placeholder="Re-enter your password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    title={showConfirmPassword ? "Hide Password" : "Show Password"}
                  >
                    {showConfirmPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    )}
                  </button>
                </div>
              </label>
            </div>
          </section>

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading}
          >
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <div className="auth-footer-text">
          <span>Already have an account?</span>{' '}
          <Link to="/faculty/login" className="auth-link">
            Sign in
          </Link>
        </div>
      </div>

      <SuccessModal
        open={successModalOpen}
        title="Faculty account created"
        message="Your faculty account has been created successfully. You can now sign in."
        confirmLabel="Go to sign in"
        onClose={() => {
          setSuccessModalOpen(false)
          navigate('/faculty/login')
        }}
      />
    </div>
  )
}
