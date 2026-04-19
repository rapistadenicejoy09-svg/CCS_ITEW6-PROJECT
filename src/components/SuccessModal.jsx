export default function SuccessModal({ open, title = 'Success', message, onClose, confirmLabel = 'OK' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-modal-title"
        className="relative bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-7 max-w-md w-full shadow-2xl"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 ring-4 ring-emerald-500/10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 id="success-modal-title" className="text-xl font-bold text-[var(--text)] mb-2">
            {title}
          </h2>
          {message && (
            <p className="text-sm text-[var(--text-muted)] mb-8 leading-relaxed">
              {message}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-3 text-sm font-semibold bg-[var(--accent)] text-white rounded-xl hover:brightness-110 shadow-lg shadow-[var(--accent)]/20 transition-all duration-200"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
