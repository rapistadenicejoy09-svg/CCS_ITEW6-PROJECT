import { useState, useMemo, useEffect, useCallback } from 'react'
import { apiAdminLogs, apiMeLogs } from '../lib/api'

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    return user?.role || null
  } catch {
    return null
  }
}

function IconActivity() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function IconFilter() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}
function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function getTimeAgo(dateString) {
  const now = new Date()
  const date = new Date(dateString)
  const diffInSeconds = Math.floor((now - date) / 1000)

  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return date.toLocaleDateString()
}

function getLogIcon(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'create') return <IconUser />
  if (t === 'access') return <IconShield />
  if (t === 'security') return <IconShield />
  return <IconActivity />
}

export default function ActivityLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const isAdmin = getRole() === 'admin'

  const loadLogs = useCallback(async () => {
    const token = localStorage.getItem('authToken')
    if (!token) return
    try {
      const res = isAdmin ? await apiAdminLogs(token) : await apiMeLogs(token)
      if (res.ok) {
        setLogs(res.logs || [])
        setError(null)
        setLastUpdate(new Date())
      } else {
        setError(res.error || 'Failed to fetch logs')
      }
    } catch (err) {
      setError(err.message || 'Connection error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLogs()
    const interval = setInterval(loadLogs, 5000) // Poll every 5s
    return () => clearInterval(interval)
  }, [loadLogs])

  const filteredLogs = useMemo(() => {
    let result = logs
    if (filter !== 'all') {
      result = result.filter(log => String(log.type).toLowerCase() === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(log =>
        String(log.action || '').toLowerCase().includes(q) ||
        String(log.details || '').toLowerCase().includes(q) ||
        String(log.user_id || '').toLowerCase().includes(q) ||
        String(log.user_name || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [logs, filter, search])



  return (
    <div className="module-page">
      <div className="w-full space-y-6">

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center animate-reveal">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)] flex items-center gap-3">
              <IconActivity /> {isAdmin ? 'System Activity Log' : 'My Activity Log'}
            </h1>
            <p className="main-description text-[var(--text-muted)] mt-1">
              {isAdmin ? 'Audit trail of administrative actions and system events.' : 'View your recent actions and system events securely.'}
            </p>
          </div>
        </header>

        <section className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-5 md:p-6 shadow-sm animate-reveal" style={{ animationDelay: '0.1s' }}>
          <div className="flex flex-col lg:flex-row gap-5 items-end">
            <div className="flex-1 w-full relative">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 block ml-1">Search Audit Trail</label>
              <div className="relative group cursor-text">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-[var(--accent)] transition-transform group-focus-within:scale-110">
                  <IconSearch />
                </div>
                <input
                  type="text"
                  placeholder="Search by user, action, or details..."
                  className="search-input w-full pl-14 h-14 text-base bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.03)] border-[var(--border-color)] hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10 transition-all rounded-2xl outline-none"
                  style={{ paddingLeft: '3.75rem' }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="w-full lg:w-64 relative">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 block ml-1">Category Filter</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-[var(--text-muted)]">
                  <IconFilter />
                </div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="w-full pl-12 pr-4 h-12 text-sm bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.03)] border-[var(--border-color)] hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10 transition-all rounded-xl appearance-none cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  <option value="create">New Records</option>
                  <option value="update">Modifications</option>
                  <option value="delete">Deletions</option>
                  <option value="access">Access Logs</option>
                  <option value="security">Security / Admin provisioning</option>
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-[var(--text-muted)]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-between items-center px-2 animate-reveal" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-500/80">Live Activity Feed</span>
            <span className="h-4 w-[1px] bg-[var(--border-color)] mx-1"></span>
            <span className="text-[10px] font-medium text-[var(--text-muted)]">{filteredLogs.length} Events matches</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)] italic">
            <IconRefresh />
            Updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>

        <section className="animate-reveal" style={{ animationDelay: '0.2s' }}>
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.03)] border-b border-[var(--border-color)]">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">User</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Role</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Activity</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Category</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Date & Time</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Details & Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {error ? (
                    <tr>
                      <td colSpan="5" className="p-12">
                        <div className="text-center">
                          <p className="text-rose-500 text-sm font-medium">Error: {error}</p>
                          <button onClick={loadLogs} className="mt-4 text-xs font-bold uppercase tracking-widest text-[var(--accent)] hover:underline">Retry Connection</button>
                        </div>
                      </td>
                    </tr>
                  ) : loading && logs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
                          <p className="text-xs text-[var(--text-muted)] font-medium">Synchronizing audit trail...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-12 text-center text-[var(--text-muted)] italic text-sm">
                        No activities match your current search or filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[rgba(0,0,0,0.01)] dark:hover:bg-[rgba(255,255,255,0.01)] transition-colors group">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] font-bold text-xs">
                              {(log.user_name || 'S')[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-[var(--text)]">{log.user_name || 'System'}</div>
                              <div className="text-[10px] text-[var(--text-muted)] font-mono opacity-60">ID: {log.user_id || 'AUTO'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                            log.user_role === 'admin' ? 'bg-amber-500/10 text-amber-500' :
                            log.user_role === 'dean' ? 'bg-fuchsia-500/10 text-fuchsia-500' :
                            log.user_role === 'student' ? 'bg-sky-500/10 text-sky-500' :
                            log.user_role === 'faculty_professor' ? 'bg-indigo-500/10 text-indigo-500' :
                            log.user_role === 'secretary' ? 'bg-teal-500/10 text-teal-500' :
                            log.user_role === 'department_chair' ? 'bg-orange-500/10 text-orange-500' :
                            'bg-slate-500/10 text-slate-500'
                          }`}>
                            {log.user_role === 'faculty_professor' ? 'Professor' :
                             log.user_role === 'department_chair' ? 'Chair' :
                             log.user_role || 'System'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-sm font-semibold text-[var(--text)]">
                          {log.action}
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${String(log.type).toLowerCase() === 'create' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                            String(log.type).toLowerCase() === 'update' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                              String(log.type).toLowerCase() === 'delete' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                                String(log.type).toLowerCase() === 'security' ? 'bg-violet-500/10 text-violet-600 border border-violet-500/25' :
                                'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                            }`}>
                            {log.type}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-medium text-[var(--text)]">{getTimeAgo(log.created_at)}</div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(log.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col gap-1 max-w-md">
                            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                              {log.details}
                            </p>
                            {log.user_ip && (
                              <span className="text-[9px] text-[var(--text-muted)] opacity-40 font-mono italic">Client IP: {log.user_ip}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t border-[var(--border-color)] bg-[rgba(0,0,0,0.01)] dark:bg-[rgba(255,255,255,0.01)] text-center">
              <p className="text-[11px] text-[var(--text-muted)]">
                Secure immutable audit trail. All administrative actions are recorded with high-precision timestamps.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
