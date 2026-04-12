import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiLogin } from '../lib/api'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', twoFACode: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState('credentials')
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  useEffect(() => {
    document.body.dataset.theme = 'light'
  }, [])

  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const t = setTimeout(() => setLockoutSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [lockoutSeconds])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (step === 'credentials') {
      if (!form.email || !form.password) {
        setError('Please enter both your email and password.')
        return
      }
      setLoading(true)
      setError('')
      try {
        const result = await apiLogin({
          identifier: form.email,
          password: form.password,
        })
        localStorage.setItem('authToken', result.token)
        localStorage.setItem('authUser', JSON.stringify(result.user))
        navigate('/')
      } catch (err) {
        if (err?.data?.error === 'Two-factor required') {
          setStep('2fa')
          setError('')
        } else if (err?.status === 429) {
          const until = err?.data?.lockedUntil
          if (until) {
            const remaining = Math.ceil((new Date(until) - new Date()) / 1000)
            setLockoutSeconds(remaining > 0 ? remaining : 0)
          }
          setError('Account temporarily locked. Try again later.')
        } else {
          setError(err?.message || 'Invalid email or password.')
        }
      } finally {
        setLoading(false)
      }
    } else {
      if (!form.twoFACode || form.twoFACode.length !== 6) {
        setError('Please enter your 6-digit backup code.')
        return
      }
      setLoading(true)
      setError('')
      try {
        const result = await apiLogin({
          identifier: form.email,
          password: form.password,
          twoFACode: form.twoFACode,
        })
        localStorage.setItem('authToken', result.token)
        localStorage.setItem('authUser', JSON.stringify(result.user))
        navigate('/')
      } catch (err) {
        setError(err?.message || 'Invalid backup code.')
      } finally {
        setLoading(false)
      }
    }
  }

  if (step === '2fa') {
    return (
      <div className="auth-page auth-page-admin">
        <div className="auth-card">
          <h1 className="auth-title">Two-Factor Authentication</h1>
          <p className="auth-subtitle">
            Enter the 6-digit backup code you saved when setting up your account.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span className="auth-label">Backup code</span>
              <input
                className="auth-input auth-input-2fa"
                type="text"
                name="twoFACode"
                value={form.twoFACode}
                onChange={handleChange}
                placeholder="000000"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="btn btn-primary auth-submit">
              Verify
            </button>
          </form>

          <button
            type="button"
            className="auth-link auth-link-block"
            onClick={() => {
              setStep('credentials')
              setPendingSession(null)
              setError('')
            }}
          >
            ← Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page auth-page-admin">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/ccs_logo.png" alt="CCS logo" className="auth-logo-image" />
        </div>
        <h1 className="auth-title">Admin Login</h1>

        <form className="auth-form" onSubmit={handleSubmit}>
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
              disabled={lockoutSeconds > 0}
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <div className="password-wrapper">
              <input
                className="auth-input"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                disabled={lockoutSeconds > 0}
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

          {error && <div className="auth-error">{error}</div>}

          {lockoutSeconds > 0 && (
            <p className="auth-lockout">
              Account locked. Retry in {Math.ceil(lockoutSeconds / 60)} min {lockoutSeconds % 60} sec
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading || lockoutSeconds > 0}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-footer-text">
          <span>Need access?</span> Contact your system administrator. Administrator accounts are not created from this login screen.
        </div>
      </div>
    </div>
  )
}
