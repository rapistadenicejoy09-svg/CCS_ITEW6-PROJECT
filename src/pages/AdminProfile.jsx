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

/** First name, middle initial, last name (matches admin header). */
function adminFormattedDisplayName(profile) {
  if (!profile) return 'Administrator'
  const fn = String(profile.firstName || '').trim()
  const mn = String(profile.middleName || '').trim()
  const ln = String(profile.lastName || '').trim()
  const mi = mn ? `${mn.charAt(0).toUpperCase()}.` : ''
  const built = [fn, mi, ln].filter(Boolean).join(' ')
  if (built) return built
  return (
    String(profile.fullName || profile.displayName || profile.identifier || '').trim() || 'Administrator'
  )
}

function mergeAuthUserFromProfile(profile) {
  try {
    const raw = localStorage.getItem('authUser')
    const u = raw ? JSON.parse(raw) : {}
    const next = {
      ...u,
      fullName: profile.fullName ?? u.fullName,
      profileImageUrl: profile.profileImageUrl ?? u.profileImageUrl,
      displayName: profile.displayName ?? profile.fullName ?? u.displayName,
      firstName: profile.firstName ?? u.firstName,
      middleName: profile.middleName ?? u.middleName,
      lastName: profile.lastName ?? u.lastName,
    }
    localStorage.setItem('authUser', JSON.stringify(next))
    window.dispatchEvent(new Event('ccs-auth-user-updated'))
  } catch {
    // ignore
  }
}

export default function AdminProfile() {
  const [profile, setProfile] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  const [firstNameInput, setFirstNameInput] = useState('')
  const [middleNameInput, setMiddleNameInput] = useState('')
  const [lastNameInput, setLastNameInput] = useState('')
  const [profileImageUrlInput, setProfileImageUrlInput] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  const [twoFAQr, setTwoFAQr] = useState(null)
  const [twoFACode, setTwoFACode] = useState('')
  const [twoFAError, setTwoFAError] = useState('')
  const [twoFAMsg, setTwoFAMsg] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)
  const [disable2FAPassword, setDisable2FAPassword] = useState('')
  const [disable2FAOpen, setDisable2FAOpen] = useState(false)

  const isAdmin = getRole() === 'admin'

  const loadProfile = useCallback(async () => {
    const token = localStorage.getItem('authToken')
    if (!token) return
    setLoadError('')
    try {
      const res = await apiGetAccountProfile(token)
      const p = res?.profile
      setProfile(p)
      setFirstNameInput(p?.firstName || '')
      setMiddleNameInput(p?.middleName || '')
      setLastNameInput(p?.lastName || '')
      setProfileImageUrlInput(p?.profileImageUrl || '')
      if (p?.twofaEnabled) setTwoFAQr(null)
    } catch (e) {
      setLoadError(e?.message || 'Failed to load profile.')
    }
  }, [])

  useEffect(() => {
    if (isAdmin) loadProfile()
  }, [isAdmin, loadProfile])

  async function handleSaveProfile(e) {
    e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token) return
    const fn = firstNameInput.trim()
    const mn = middleNameInput.trim()
    const ln = lastNameInput.trim()
    if (!fn || !ln) {
      setProfileMsg('First name and last name are required.')
      return
    }
    setSavingProfile(true)
    setProfileMsg('')
    try {
      const fullName = [fn, mn, ln].filter(Boolean).join(' ')
      const res = await apiPatchAccountProfile(token, {
        fullName,
        personalInformation: {
          first_name: fn,
          middle_name: mn,
          last_name: ln,
        },
        profileImageUrl: profileImageUrlInput.trim(),
      })
      const p = res?.profile
      setProfile(p)
      mergeAuthUserFromProfile(p)
      setProfileMsg('Profile updated.')
    } catch (err) {
      setProfileMsg(err?.message || 'Could not save profile.')
    } finally {
      setSavingProfile(false)
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
    } catch (err) {
      setPwdError(err?.message || 'Could not change password.')
    } finally {
      setPwdSaving(false)
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

  async function handleVerify2FA(e) {
    e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token) return
    setTwoFAError('')
    setTwoFAMsg('')
    setTwoFALoading(true)
    try {
      await api2faVerify(token, twoFACode.trim())
      setTwoFAMsg('Two-factor authentication is now enabled.')
      setTwoFAQr(null)
      setTwoFACode('')
      await loadProfile()
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
      setTwoFAMsg('Two-factor authentication has been disabled.')
      await loadProfile()
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

  if (!isAdmin) {
    return <div className="p-8 text-center text-[var(--text-muted)]">Administrators only.</div>
  }

  const displayName = adminFormattedDisplayName(profile)
  const heroLetter = (String(profile?.firstName || '').trim() || displayName).charAt(0).toUpperCase() || '?'

  return (
    <div className="profile-page profile-page-admin">
      <div className="profile-hero profile-hero-admin admin-student-list-header-enter">
        <div className="profile-hero-badge">Admin</div>
        {profile?.profileImageUrl ? (
          <img
            src={profile.profileImageUrl}
            alt=""
            className="profile-avatar profile-avatar-admin profile-avatar-image"
          />
        ) : (
          <div className="profile-avatar profile-avatar-admin">{heroLetter}</div>
        )}
        <h1 className="profile-hero-title">{displayName}</h1>
        <p className="profile-hero-subtitle">System Administrator</p>
      </div>

      {loadError && (
        <div
          className="mb-4 p-4 rounded-xl text-rose-400 bg-rose-500/10 border border-rose-500/20 text-sm admin-animate-reveal"
          style={{ animationDelay: '0.06s' }}
        >
          {loadError}
        </div>
      )}

      <div className="profile-grid admin-student-list-section-enter">
        <div
          className="profile-card profile-card-admin admin-student-card-animate"
          style={{ animationDelay: '0s' }}
        >
          <h3 className="profile-card-title">Account information</h3>
          <form onSubmit={handleSaveProfile} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Login email
              </label>
              <div className="search-input w-full opacity-80 cursor-not-allowed">
                {profile?.email || profile?.identifier || '—'}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">Administrators sign in with this email address.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  First name <span className="text-rose-500">*</span>
                </label>
                <input
                  className="search-input w-full"
                  value={firstNameInput}
                  onChange={(e) => setFirstNameInput(e.target.value)}
                  placeholder="Given name"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Middle name
                </label>
                <input
                  className="search-input w-full"
                  value={middleNameInput}
                  onChange={(e) => setMiddleNameInput(e.target.value)}
                  placeholder="Optional"
                  autoComplete="additional-name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Last name <span className="text-rose-500">*</span>
                </label>
                <input
                  className="search-input w-full"
                  value={lastNameInput}
                  onChange={(e) => setLastNameInput(e.target.value)}
                  placeholder="Family name"
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Profile picture URL
              </label>
              <input
                className="search-input w-full"
                value={profileImageUrlInput}
                onChange={(e) => setProfileImageUrlInput(e.target.value)}
                placeholder="https://…"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">Paste a direct image link (optional).</p>
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save account'}
            </button>
            {profileMsg ? <p className="text-sm text-[var(--text-muted)]">{profileMsg}</p> : null}
          </form>
        </div>

        <div
          className="profile-card profile-card-admin admin-student-card-animate"
          style={{ animationDelay: `${1 * 0.055}s` }}
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
          className="profile-card profile-card-admin admin-student-card-animate"
          style={{ animationDelay: `${2 * 0.055}s` }}
        >
          <h3 className="profile-card-title">Two-factor authentication</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
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
              <p className="text-sm text-[var(--text-muted)]">Your account is protected with an authenticator app.</p>
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
                    className="search-input w-full"
                    value={disable2FAPassword}
                    onChange={(e) => setDisable2FAPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Current password"
                  />
                  <div className="flex gap-2">
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
