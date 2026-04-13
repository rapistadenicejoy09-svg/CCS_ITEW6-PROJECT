import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRegister } from '../lib/api'

function getLoggedInAdminToken() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    const token = localStorage.getItem('authToken')
    if (token && user?.role === 'admin') return token
  } catch {
    /* ignore */
  }
  return null
}

/**
 * One-time first administrator setup (no admins in the database yet).
 * Signed-in admins are redirected to the in-app provision page.
 */
export default function AdminBootstrapAccount() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    enable2FA: false,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [twoFACode, setTwoFACode] = useState(null)

  useEffect(() => {
    document.body.dataset.theme = 'light'
  }, [])

  useEffect(() => {
    if (getLoggedInAdminToken()) {
      navigate('/admin/admins', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('authUser')
      const user = raw ? JSON.parse(raw) : null
      if (user?.role && user.role !== 'admin') {
        navigate('/', { replace: true })
      }
    } catch {
      /* ignore */
    }
  }, [navigate])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!form.fullName || !form.email || !form.password || !form.confirmPassword) {
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
      const result = await apiRegister({
        role: 'admin',
        identifier: form.email,
        password: form.password,
        fullName: form.fullName,
        enable2FA: form.enable2FA,
      })
      if (result?.twoFABackupCode) setTwoFACode(result.twoFABackupCode)
      if (!form.enable2FA) navigate('/admin/login')
    } catch (err) {
      setError(err?.message || 'Failed to create account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleFinish2FA = () => {
    navigate('/admin/login')
  }

  if (twoFACode) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Two-Factor Authentication</h1>
          <p className="auth-subtitle">
            Save this backup code in a secure place. You will need it to sign in if 2FA is required.
          </p>
          <div className="auth-2fa-code">{twoFACode}</div>
          <p className="auth-2fa-hint">Do not share this code with anyone.</p>
          <button type="button" className="btn btn-primary auth-submit" onClick={handleFinish2FA}>
            I have saved my code
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">First administrator</h1>
        <p className="auth-subtitle">
          Use this page only when the system has no administrators yet. After that, add admins from the dashboard
          (New administrator).
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-label">Full name</span>
            <input
              className="auth-input"
              type="text"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              placeholder="e.g. Juan Dela Cruz"
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input
              className="auth-input"
              type="email"
              name="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              placeholder="admin@example.edu"
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
                title={showPassword ? 'Hide Password' : 'Show Password'}
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
                title={showConfirmPassword ? 'Hide Password' : 'Show Password'}
              >
                {showConfirmPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </label>

          <label className="auth-field auth-field-checkbox">
            <input type="checkbox" name="enable2FA" checked={form.enable2FA} onChange={handleChange} />
            <span>Enable two-factor authentication (backup code)</span>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create first administrator'}
          </button>
        </form>

        <div className="auth-footer-text">
          <span>Already have an account?</span>{' '}
          <Link to="/admin/login" className="auth-link">
            Go to login
          </Link>
        </div>
      </div>
    </div>
  )
}
