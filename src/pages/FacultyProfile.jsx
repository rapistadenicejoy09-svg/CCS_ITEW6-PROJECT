import { useCallback, useEffect, useState } from 'react'
import {
  api2faDisable,
  api2faSetup,
  api2faVerify,
  apiChangePassword,
  apiGetAccountProfile,
  apiPatchAccountProfile,
  apiAdminUser,
  apiAdminPatchUser,
} from '../lib/api'
import { useParams } from 'react-router-dom'

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    return raw ? JSON.parse(raw)?.role : null
  } catch {
    return null
  }
}

export default function FacultyProfile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [bioMsg, setBioMsg] = useState('')

  const [roleDraft, setRoleDraft] = useState('')
  const [isActiveDraft, setIsActiveDraft] = useState(true)

  const [twoFAQr, setTwoFAQr] = useState(null)
  const [twoFACode, setTwoFACode] = useState('')
  const [twoFAError, setTwoFAError] = useState('')
  const [twoFAMsg, setTwoFAMsg] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)
  const [disable2FAOpen, setDisable2FAOpen] = useState(false)
  const [disable2FAPassword, setDisable2FAPassword] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  const [bioDraft, setBioDraft] = useState('')

  const currentUserRole = getRole()
  const isAdmin = currentUserRole === 'admin'
  const isMyProfile = !id
  const facultyRoles = new Set(['faculty', 'faculty_professor', 'dean', 'department_chair', 'secretary'])
  const isFaculty = facultyRoles.has(currentUserRole) || isAdmin // Admin can access this page for any id

  const load = useCallback(async () => {
    const token = localStorage.getItem('authToken')
    if (!token) return
    setError('')
    try {
      let p
      if (id && isAdmin) {
        const res = await apiAdminUser(token, id)
        p = res?.user
      } else {
        const res = await apiGetAccountProfile(token)
        p = res?.profile || null
      }
      setProfile(p)
      setImageUrl(p?.profileImageUrl || '')
      setBioDraft(p?.bio || '')
      setRoleDraft(p?.role || '')
      setIsActiveDraft(p?.is_active !== 0)
    } catch (e) {
      setError(e?.message || 'Failed to load profile.')
    }
  }, [id, isAdmin])

  useEffect(() => {
    if (isFaculty) load()
  }, [isFaculty, load, id])

  async function handleSavePhoto(e) {
    e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token) return
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await apiPatchAccountProfile(token, { profileImageUrl: imageUrl.trim() })
      setProfile(res?.profile)
      setSaveMsg('Profile picture updated.')
    } catch (err) {
      setSaveMsg(err?.message || 'Could not save.')
    } finally {
      setSaving(false)
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

  async function handleSaveBio(e) {
    e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token) return
    setSaving(true)
    setBioMsg('')
    try {
      const res = await apiPatchAccountProfile(token, { bio: bioDraft.trim() })
      setProfile(res?.profile)
      setBioMsg('Biography updated successfully.')
    } catch (err) {
      setBioMsg(err?.message || 'Could not save biography.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateAccount(e) {
    e.preventDefault()
    const token = localStorage.getItem('authToken')
    if (!token || !id || !isAdmin) return
    setSaving(true)
    setSaveMsg('')
    try {
      await apiAdminPatchUser(token, id, { role: roleDraft, isActive: isActiveDraft })
      setSaveMsg('Account settings updated.')
      load()
    } catch (err) {
      setSaveMsg(err?.message || 'Update failed.')
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
      setDisable2FAOpen(false)
      setDisable2FAPassword('')
      setTwoFAMsg('Two-factor authentication has been disabled.')
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

  if (!isFaculty) {
    return <div className="p-8 text-center text-[var(--text-muted)]">Access denied.</div>
  }

  const displayName = profile?.displayName || 'Faculty'
  const heroLetter = displayName.charAt(0).toUpperCase()
  const s = profile?.summary || {}
  const firstName = profile?.firstName || profile?.first_name || profile?.personal_information?.first_name || '—'
  const middleName = profile?.middleName || profile?.middle_name || profile?.personal_information?.middle_name || '—'
  const lastName = profile?.lastName || profile?.last_name || profile?.personal_information?.last_name || '—'

  return (
    <div className="profile-page profile-page-faculty">
      <div className="profile-hero profile-hero-faculty">
        <div className="profile-hero-badge">Faculty</div>
        {profile?.profileImageUrl ? (
          <img src={profile.profileImageUrl} alt="" className="profile-avatar profile-avatar-faculty profile-avatar-image" />
        ) : (
          <div className="profile-avatar profile-avatar-faculty">{heroLetter}</div>
        )}
        <h1 className="profile-hero-title">{displayName}</h1>
        <p className="profile-hero-subtitle">
          {profile?.role === 'dean' ? 'College Dean' :
            profile?.role === 'department_chair' ? 'Department Chair' :
              profile?.role === 'secretary' ? 'College Secretary' :
                profile?.role === 'faculty_professor' ? 'Professor' : 'Professional Educator'}
        </p>

        <div className="faculty-stats">
          <div className="faculty-stat">
            <span className="faculty-stat-label">Specialization</span>
            <span className="faculty-stat-value">{profile?.specialization || '—'}</span>
          </div>
          <div className="faculty-stat-divider" />
          <div className="faculty-stat">
            <span className="faculty-stat-label">Status</span>
            <span className="faculty-stat-value" style={{ color: 'var(--accent)' }}>Full-Time</span>
          </div>
          <div className="faculty-stat-divider" />
          <div className="faculty-stat">
            <span className="faculty-stat-label">Department</span>
            <span className="faculty-stat-value">{profile?.department || '—'}</span>
          </div>
        </div>
      </div>

      <div className="profile-grid profile-grid-faculty">
        <div className="profile-card profile-card-faculty">
          <h3 className="profile-card-title">Professional Information</h3>
          <ul className="profile-card-list">
            <li><strong>First name:</strong> {firstName}</li>
            <li><strong>Middle name:</strong> {middleName}</li>
            <li><strong>Last name:</strong> {lastName}</li>
            <li><strong>Email:</strong> {profile?.email || '—'}</li>
            <li><strong>Phone Number:</strong> {profile?.personal_information?.phone_number || '—'}</li>
            <li><strong>Date of Birth:</strong> {profile?.personal_information?.date_of_birth || '—'}</li>
            <li><strong>Gender:</strong> {profile?.personal_information?.gender || '—'}</li>
            <li><strong>Rank:</strong> Assistant Professor</li>
          </ul>
        </div>

        <div className="profile-card profile-card-faculty lg:col-span-1">
          <h3 className="profile-card-title">Biography / Description</h3>
          <p className="text-xs text-[var(--text-muted)] mb-4">Professional background and research interests.</p>
          <form onSubmit={handleSaveBio} className="auth-form">
            <textarea
              className="search-input w-full min-h-[150px] p-3 text-sm mb-3"
              value={bioDraft}
              onChange={e => {
                setBioDraft(e.target.value)
                if (bioMsg) setBioMsg('')
              }}
              placeholder="Enter your biography here..."
              style={{ resize: 'vertical', borderRadius: '12px' }}
            />
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={saving || bioDraft.trim() === (profile?.bio || '').trim()}
            >
              {saving ? 'Saving...' : 'Save Biography'}
            </button>
            {bioMsg && (
              <p style={{
                fontSize: '11px',
                color: bioMsg.includes('successfully') ? '#10b981' : '#ef4444',
                marginTop: '10px',
                textAlign: 'center',
                fontWeight: '500'
              }}>
                {bioMsg}
              </p>
            )}
          </form>
        </div>

        <div className="profile-card profile-card-faculty">
          <h3 className="profile-card-title">Password Management</h3>
          <form onSubmit={handleChangePassword} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Current Password</label>
              <input type="password" className="search-input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            </div>
            <div className="auth-field">
              <label className="auth-label">New Password</label>
              <input type="password" className="search-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="auth-field">
              <label className="auth-label">Confirm New Password</label>
              <input type="password" className="search-input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            {pwdError && <p style={{ fontSize: '11px', color: '#ef4444' }}>{pwdError}</p>}
            {pwdMsg && <p style={{ fontSize: '11px', color: '#10b981' }}>{pwdMsg}</p>}
            <button type="submit" className="btn btn-primary" disabled={pwdSaving}>
              {pwdSaving ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </div>

        <div className="profile-card profile-card-faculty">
          <h3 className="profile-card-title">Profile Picture</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>Enter a public image URL for your profile avatar.</p>
          <form onSubmit={handleSavePhoto} className="auth-form">
            <input className="search-input" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Update Photo'}</button>
            {saveMsg && !id && <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>{saveMsg}</p>}
          </form>
        </div>

        {isMyProfile && (
          <div className="profile-card profile-card-faculty">
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
            {twoFAError ? <p className="text-sm text-rose-400 mt-3">{twoFAError}</p> : null}
            {twoFAMsg ? <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-3">{twoFAMsg}</p> : null}
          </div>
        )}

        {isAdmin && id && (
          <div className="profile-card profile-card-faculty lg:col-span-2">
            <h3 className="profile-card-title">User Role Management</h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">Update this faculty member's system role and account status.</p>
            <form onSubmit={handleUpdateAccount} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">System Role</label>
                <select className="search-input" value={roleDraft} onChange={e => setRoleDraft(e.target.value)}>
                  <option value="faculty">Faculty (Basic)</option>
                  <option value="faculty_professor">Professor</option>
                  <option value="dean">Dean</option>
                  <option value="department_chair">Department Chair</option>
                  <option value="secretary">Secretary</option>
                </select>
              </div>
              <div className="auth-field mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isActiveDraft} onChange={e => setIsActiveDraft(e.target.checked)} />
                  <span className="text-sm">Account Active</span>
                </label>
              </div>
              <button type="submit" className="btn btn-primary mt-4" disabled={saving}>{saving ? 'Saving...' : 'Save Account Changes'}</button>
              {saveMsg && id && <p style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '8px' }}>{saveMsg}</p>}
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
