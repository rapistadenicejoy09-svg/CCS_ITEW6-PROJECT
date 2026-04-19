import { useCallback, useEffect, useState } from 'react'
import {
  api2faDisable,
  api2faSetup,
  api2faVerify,
  apiChangePassword,
  apiGetAccountProfile,
  apiPatchAccountProfile,
} from '../lib/api'

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    return raw ? JSON.parse(raw)?.role : null
  } catch {
    return null
  }
}

function normalizeMustChangePassword(value, fallback) {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  return fallback === true || fallback === 1
}

function mergeStudentAuthUser(profile) {
  try {
    const raw = localStorage.getItem('authUser')
    const u = raw ? JSON.parse(raw) : {}
    const next = {
      ...u,
      displayName: profile.displayName ?? u.displayName,
      fullName: profile.displayName ?? u.fullName,
      firstName: profile.firstName ?? u.firstName,
      middleName: profile.middleName ?? u.middleName,
      lastName: profile.lastName ?? u.lastName,
      studentId: profile.studentId ?? u.studentId,
      profileImageUrl: profile.profileImageUrl ?? u.profileImageUrl,
      mustChangePassword: normalizeMustChangePassword(profile.mustChangePassword, u.mustChangePassword),
    }
    localStorage.setItem('authUser', JSON.stringify(next))
    window.dispatchEvent(new Event('ccs-auth-user-updated'))
  } catch {
    // ignore
  }
}

export default function StudentProfile() {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [twoFAQr, setTwoFAQr] = useState(null)
  const [twoFACode, setTwoFACode] = useState('')
  const [twoFAError, setTwoFAError] = useState('')
  const [twoFAMsg, setTwoFAMsg] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)
  const [disable2FAPassword, setDisable2FAPassword] = useState('')
  const [disable2FAOpen, setDisable2FAOpen] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  const isStudent = getRole() === 'student'

  const load = useCallback(async () => {
    const token = localStorage.getItem('authToken')
    if (!token) return
    setError('')
    try {
      const res = await apiGetAccountProfile(token)
      const p = res?.profile || null
      setProfile(p)
      setImageUrl(p?.profileImageUrl || '')
      if (p?.twofaEnabled) setTwoFAQr(null)
      if (p) mergeStudentAuthUser(p)
    } catch (e) {
      setError(e?.message || 'Failed to load your profile.')
    }
  }, [])

  useEffect(() => {
    if (isStudent) load()
  }, [isStudent, load])

  async function handleSavePhoto(e) {
    e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token) return
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await apiPatchAccountProfile(token, { profileImageUrl: imageUrl.trim() })
      const p = res?.profile
      setProfile(p)
      setImageUrl(p?.profileImageUrl || '')
      mergeStudentAuthUser(p)
      setSaveMsg('Profile picture updated.')
    } catch (err) {
      setSaveMsg(err?.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStart2FA() {
    const token = localStorage.getItem('authToken')
    if (!token) return
    setTwoFAError('')
    setTwoFAMsg('')
    setTwoFALoading(true)
    try {
      const res = await api2faSetup(token)
      setTwoFAQr(res?.qrCode || null)
      setTwoFACode('')
    } catch (err) {
      setTwoFAError(err?.message || 'Could not start 2FA setup.')
    } finally {
      setTwoFALoading(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwdError('')
    setPwdMsg('')
    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.')
      return
    }
    const token = localStorage.getItem('authToken')
    if (!token) return
    setPwdSaving(true)
    try {
      await apiChangePassword(token, { currentPassword, newPassword })
      setPwdMsg('Password changed successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      await load()
    } catch (err) {
      setPwdError(err?.message || 'Could not change password.')
    } finally {
      setPwdSaving(false)
    }
  }

  async function handleVerify2FA(e) {
    e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token) return
    setTwoFAError('')
    setTwoFAMsg('')
    setTwoFALoading(true)
    try {
      await api2faVerify(token, twoFACode.trim())
      setTwoFAMsg('Two-factor authentication is now enabled on your account.')
      setTwoFAQr(null)
      setTwoFACode('')
      await load()
    } catch (err) {
      setTwoFAError(err?.message || 'Invalid code.')
    } finally {
      setTwoFALoading(false)
    }
  }

  async function handleDisable2FA(e) {
    e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token) return
    if (!disable2FAPassword.trim()) {
      setTwoFAError('Enter your password to disable two-factor authentication.')
      return
    }
    setTwoFAError('')
    setTwoFAMsg('')
    setTwoFALoading(true)
    try {
      await api2faDisable(token, disable2FAPassword)
      setDisable2FAPassword('')
      setDisable2FAOpen(false)
      setTwoFAMsg('Two-factor authentication has been disabled on your account.')
      await load()
    } catch (err) {
      if (err?.message === 'Current password is incorrect') {
        setTwoFAError('Incorrect password. Please enter your current password to disable two-factor authentication.')
      } else {
        setTwoFAError(err?.message || 'Could not disable 2FA.')
      }
    } finally {
      setTwoFALoading(false)
    }
  }

  if (!isStudent) {
    return <div className="p-8 text-center text-[var(--text-muted)]">This page is for signed-in students.</div>
  }

  const displayName = profile?.displayName || 'Student'
  const heroLetter = displayName.charAt(0).toUpperCase()
  const s = profile?.summary || {}
  const mn = profile?.middleName
  const middleDisplay = mn ? mn : '—'
  const showPasswordReminder =
    profile && (profile.mustChangePassword === true || profile.mustChangePassword === 1)

  return (
    <div className="profile-page profile-page-student">
      <div className="profile-hero profile-hero-student admin-student-list-header-enter">
        <div className="profile-hero-badge">Student</div>
        {profile?.profileImageUrl ? (
          <img
            src={profile.profileImageUrl}
            alt=""
            className="profile-avatar profile-avatar-student profile-avatar-image"
          />
        ) : (
          <div className="profile-avatar profile-avatar-student">{heroLetter}</div>
        )}
        <h1 className="profile-hero-title">{displayName}</h1>
        <p className="profile-hero-subtitle">Enrolled Student</p>

        <div className="student-stats">
          <div className="student-stat">
            <span className="student-stat-label">Section</span>
            <span className="student-stat-value">{s.classSection || '—'}</span>
          </div>
          <div className="student-stat-divider" />
          <div className="student-stat">
            <span className="student-stat-label">Type</span>
            <span className="student-stat-value">{s.studentType || '—'}</span>
          </div>
          <div className="student-stat-divider" />
          <div className="student-stat">
            <span className="student-stat-label">Program</span>
            <span className="student-stat-value">{s.program || '—'}</span>
          </div>
        </div>
      </div>

      {showPasswordReminder ? (
        <div className="student-profile-password-alert admin-student-list-toolbar-enter" role="status">
          <strong>Change your password</strong>
          <p>
            Your login password was set by an administrator. Update it below so only you know it.
          </p>
        </div>
      ) : null}

      {error && (
        <div
          className="mb-4 p-4 rounded-xl text-rose-400 bg-rose-500/10 border border-rose-500/20 text-sm admin-animate-reveal"
          style={{ animationDelay: '0.06s' }}
        >
          {error}
        </div>
      )}

      <div className="profile-grid profile-grid-student admin-student-list-section-enter">
        <div
          className="profile-card profile-card-student admin-student-card-animate"
          style={{ animationDelay: '0s' }}
        >
          <h3 className="profile-card-title">Student information</h3>
          <ul className="profile-card-list">
            <li>
              <strong>First name:</strong> {profile?.firstName || '—'}
            </li>
            <li>
              <strong>Middle name:</strong> {middleDisplay}
            </li>
            <li>
              <strong>Last name:</strong> {profile?.lastName || '—'}
            </li>
            <li>
              <strong>Student number:</strong> {profile?.studentId || '—'}
            </li>
            <li>
              <strong>School email:</strong> {profile?.email || '—'}
            </li>
          </ul>
        </div>

        <div
          className="profile-card profile-card-student admin-student-card-animate"
          style={{ animationDelay: `${1 * 0.055}s` }}
        >
          <h3 className="profile-card-title">Academic summary</h3>
          <ul className="profile-card-list">
            <li>
              <strong>Year level:</strong> {s.yearLevel || '—'}
            </li>
            <li>
              <strong>Enrollment:</strong> {s.enrollmentStatus || '—'}
            </li>
          </ul>
        </div>

        <div
          className="profile-card profile-card-student admin-student-card-animate"
          style={{ animationDelay: `${2 * 0.055}s` }}
        >
          <h3 className="profile-card-title">Password</h3>
          <form onSubmit={handleChangePassword} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Current password
              </label>
              <input
                type="password"
                className="search-input w-full"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                New password
              </label>
              <input
                type="password"
                className="search-input w-full"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Confirm new password
              </label>
              <input
                type="password"
                className="search-input w-full"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {pwdError ? <p className="text-sm text-rose-400">{pwdError}</p> : null}
            {pwdMsg ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{pwdMsg}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={pwdSaving}>
              {pwdSaving ? 'Updating…' : 'Change password'}
            </button>
          </form>
        </div>

        <div
          className="profile-card profile-card-student admin-student-card-animate"
          style={{ animationDelay: `${3 * 0.055}s` }}
        >
          <h3 className="profile-card-title">Profile picture</h3>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            Optional image URL for your avatar in the header.
          </p>
          <form onSubmit={handleSavePhoto} className="space-y-3">
            <input
              className="search-input w-full"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save picture'}
            </button>
            {saveMsg ? <p className="text-sm text-[var(--text-muted)]">{saveMsg}</p> : null}
          </form>
        </div>

        <div
          className="profile-card profile-card-student admin-student-card-animate"
          style={{ animationDelay: `${4 * 0.055}s` }}
        >
          <h3 className="profile-card-title">Two-factor authentication</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Add an extra layer of security to your login. Scan the QR code with an authenticator app (Google Authenticator,
            Authy, etc.), then enter the 6-digit code. Admins cannot turn this on for you—you enable it here on your own
            account.
          </p>
          <p className="text-sm mb-4">
            Status:{' '}
            <strong className="text-[var(--text)]">{profile?.twofaEnabled ? 'Enabled' : 'Not enabled'}</strong>
          </p>
          {!profile?.twofaEnabled && (
            <>
              <button type="button" className="btn btn-secondary mb-4" onClick={handleStart2FA} disabled={twoFALoading}>
                {twoFALoading && !twoFAQr ? 'Preparing…' : 'Set up authenticator app'}
              </button>
              {twoFAQr && (
                <form onSubmit={handleVerify2FA} className="space-y-4">
                  <img src={twoFAQr} alt="2FA QR" className="max-w-[200px] rounded-lg border border-[var(--border-color)]" />
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                      6-digit code
                    </label>
                    <input
                      className="search-input w-full max-w-xs"
                      value={twoFACode}
                      onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="000000"
                      inputMode="numeric"
                    />
                  </div>
                  {twoFAError ? <p className="text-sm text-rose-400">{twoFAError}</p> : null}
                  {twoFAMsg ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{twoFAMsg}</p> : null}
                  <button type="submit" className="btn btn-primary" disabled={twoFALoading || twoFACode.length < 6}>
                    Verify and enable
                  </button>
                </form>
              )}
            </>
          )}
          {profile?.twofaEnabled && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">
                Your account is protected with an authenticator app. Use your app code or backup code at login.
              </p>
              {!disable2FAOpen ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDisable2FAOpen(true)
                    setTwoFAError('')
                    setTwoFAMsg('')
                  }}
                  disabled={twoFALoading}
                >
                  Disable two-factor authentication
                </button>
              ) : (
                <form onSubmit={handleDisable2FA} className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Confirm with password
                  </label>
                  <input
                    type="password"
                    className="search-input w-full max-w-xs"
                    value={disable2FAPassword}
                    onChange={(e) => setDisable2FAPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Current password"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className="btn btn-primary" disabled={twoFALoading}>
                      {twoFALoading ? 'Disabling…' : 'Confirm disable'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setDisable2FAOpen(false)
                        setDisable2FAPassword('')
                        setTwoFAError('')
                      }}
                      disabled={twoFALoading}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
