import { useCallback, useEffect, useState } from 'react'
import {
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
  
  const [roleDraft, setRoleDraft] = useState('')
  const [isActiveDraft, setIsActiveDraft] = useState(true)

  const [twoFAQr, setTwoFAQr] = useState(null)
  const [twoFACode, setTwoFACode] = useState('')
  const [twoFAError, setTwoFAError] = useState('')
  const [twoFAMsg, setTwoFAMsg] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  const currentUserRole = getRole()
  const isAdmin = currentUserRole === 'admin'
  const isMyProfile = !id
  const isFaculty = currentUserRole === 'faculty' || isAdmin // Admin can access this page for any id

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

  if (!isFaculty) {
    return <div className="p-8 text-center text-[var(--text-muted)]">Access denied.</div>
  }

  const displayName = profile?.displayName || 'Faculty'
  const heroLetter = displayName.charAt(0).toUpperCase()
  const s = profile?.summary || {}

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
            <span className="faculty-stat-value">{s.specialization || '—'}</span>
          </div>
          <div className="faculty-stat-divider" />
          <div className="faculty-stat">
            <span className="faculty-stat-label">Status</span>
            <span className="faculty-stat-value" style={{ color: 'var(--accent)' }}>Full-Time</span>
          </div>
          <div className="faculty-stat-divider" />
          <div className="faculty-stat">
            <span className="faculty-stat-label">Department</span>
            <span className="faculty-stat-value">{s.department || '—'}</span>
          </div>
        </div>
      </div>

      <div className="profile-grid profile-grid-faculty">
        <div className="profile-card profile-card-faculty">
          <h3 className="profile-card-title">Professional Information</h3>
          <ul className="profile-card-list">
            <li><strong>First name:</strong> {profile?.firstName || '—'}</li>
            <li><strong>Last name:</strong> {profile?.lastName || '—'}</li>
            <li><strong>Email:</strong> {profile?.email || '—'}</li>
            <li><strong>Rank:</strong> Assistant Professor</li>
          </ul>
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
