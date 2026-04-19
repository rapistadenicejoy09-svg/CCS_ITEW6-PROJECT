import { useEffect, useState } from 'react'
import { apiLogin } from '../lib/api'

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

/**
 * A performance-optimized, self-contained deletion confirmation modal.
 * Isolates the timer and authentication states to prevent parent re-renders.
 */
export default function ConfirmDeleteModal({
  title = "Confirm Deletion",
  description,
  confirmLabel = "Confirm Deletion",
  adminIdentifier,
  onConfirm,
  onClose
}) {
  const [password, setPassword] = useState('')
  const [twoFACode, setTwoFACode] = useState('')
  const [needs2FA, setNeeds2FA] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(3)

  // Isolated timer state ensures the parent doesn't re-render every second
  useEffect(() => {
    setCooldown(3)
    let remaining = 3
    const timer = setInterval(() => {
      remaining -= 1
      setCooldown(Math.max(0, remaining))
      if (remaining <= 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  async function handleConfirm() {
    if (cooldown > 0 || isSubmitting) return
    if (!password.trim()) {
      setError('Password is required.')
      return
    }
    if (needs2FA && twoFACode.trim().length !== 6) {
      setError('Enter your 6-digit code.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      // 1. Verify administrative credentials locally within the modal
      try {
        await apiLogin({
          identifier: adminIdentifier,
          password: password,
          twoFACode: needs2FA ? twoFACode.trim() : undefined,
        })
      } catch (loginErr) {
        const msg = loginErr?.data?.error || loginErr?.message || ''
        if (msg === 'Two-factor required' && !needs2FA) {
          setNeeds2FA(true)
          setError('Two-factor authentication is enabled. Enter your 6-digit code.')
          setIsSubmitting(false)
          return
        }
        setError(loginErr?.message || 'Password verification failed.')
        setIsSubmitting(false)
        return
      }

      // 2. Report success to parent to perform the actual data deletion
      await onConfirm()
    } catch (err) {
      setError(err?.message || 'Action failed. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Background overlay - Optimized with bg-black/45 and NO blur for maximum performance */}
      <button
        type="button"
        className="absolute inset-0 bg-black/45 cursor-default transition-opacity"
        aria-label="Close dialog"
        onClick={() => !isSubmitting && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="admin-delete-modal-content relative bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-7 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col">
          <div className="flex flex-col items-center text-center mb-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 ring-4 ring-rose-500/10">
              <IconTrash />
            </div>
            <h2 id="confirm-modal-title" className="text-xl font-bold text-[var(--text)] mb-2">
              {title}
            </h2>
            <div className="text-sm text-[var(--text-muted)] leading-relaxed">
              {description}
            </div>
          </div>

          <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 ml-1">
            Your password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="search-input w-full mb-4 focus:ring-rose-500/20"
            placeholder="Administrator password"
            disabled={isSubmitting}
            autoFocus
          />

          {needs2FA && (
            <>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 ml-1">
                Two-factor code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="search-input w-full mb-4 font-mono tracking-widest"
                placeholder="000000"
                disabled={isSubmitting}
              />
            </>
          )}

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400 mb-4 text-center font-medium animate-pulse">
              {error}
            </p>
          )}

          <p className="text-[11px] text-center text-[var(--text-muted)] mb-3 opacity-80">
            {cooldown > 0
              ? `Safety lock: will unlock in ${cooldown}s.`
              : 'Credentials verified per administrative security protocol.'}
          </p>

          <div className="flex w-full gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting || cooldown > 0}
              className={`flex-1 px-4 py-3 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-lg shadow-rose-600/20 transition-all duration-200 disabled:opacity-50 disabled:grayscale-[0.5] ${cooldown > 0 ? 'animate-pulse' : ''}`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing
                </span>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
