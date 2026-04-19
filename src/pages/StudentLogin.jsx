import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiLogin } from '../lib/api'

export default function StudentLogin() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ idOrEmail: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
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

    if (!form.idOrEmail || !form.password) {
      setError('Please enter your ID / email and password.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await apiLogin({
        identifier: form.idOrEmail,
        password: form.password,
      })
      localStorage.setItem('authToken', result.token)
      localStorage.setItem('authUser', JSON.stringify(result.user))
      navigate('/')
    } catch (err) {
      if (err?.status === 429) {
        const until = err?.data?.lockedUntil
        if (until) {
          const remaining = Math.ceil((new Date(until) - new Date()) / 1000)
          setLockoutSeconds(remaining > 0 ? remaining : 0)
        }
        setError('Account temporarily locked. Try again later.')
      } else {
        setError(err?.message || 'Invalid ID / email or password.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page auth-page-split auth-page-split-right">
      <div className="auth-card auth-card-tall">
        <div className="auth-logo">
          <img src="/ccs_logo.png" alt="CCS logo" className="auth-logo-image" />
        </div>
        <h1 className="auth-title">Student Login</h1>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-label">Student ID or Email</span>
            <input
              className="auth-input"
              type="text"
              name="idOrEmail"
              value={form.idOrEmail}
              onChange={handleChange}
              placeholder="e.g. 2026-00001 or student@example.edu"
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

      </div>
    </div>
  )
}
