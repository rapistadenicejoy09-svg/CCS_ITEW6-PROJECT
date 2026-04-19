import { useState, useEffect, useMemo } from 'react'
import { apiGetEvents, apiDeleteEvent, apiApproveEvent } from '../lib/api'
import SuccessModal from '../components/SuccessModal'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
import AdminEventForm from '../components/AdminEventForm'
import EventCalendar from '../components/EventCalendar'
import { hasPermission, PERMISSIONS } from '../lib/security'
import { Calendar, List, Search, Filter, Plus, Edit2, Trash2, CheckCircle, Clock, MapPin, Users } from '../components/Icons'

export default function AdminEventList() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('list') // list or calendar
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const authToken = localStorage.getItem('authToken')

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const res = await apiGetEvents(authToken)
      if (res.ok) setEvents(res.events)
    } catch (err) {
      console.error('Failed to fetch events:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesSearch = e.title.toLowerCase().includes(search.toLowerCase()) || 
                           e.description?.toLowerCase().includes(search.toLowerCase())
      const matchesType = filterType === 'all' || e.type === filterType
      const matchesStatus = filterStatus === 'all' || e.status === filterStatus
      return matchesSearch && matchesType && matchesStatus
    })
  }, [events, search, filterType, filterStatus])

  const stats = useMemo(() => {
    const now = new Date()
    return {
      total: events.length,
      upcoming: events.filter(e => new Date(e.start_time) > now).length,
      ongoing: events.filter(e => {
        const start = new Date(e.start_time)
        const end = new Date(e.end_time)
        return start <= now && end >= now
      }).length,
      completed: events.filter(e => new Date(e.end_time) < now).length
    }
  }, [events])

  function getAuthUser() {
    try {
      const raw = localStorage.getItem('authUser')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  const authUser = getAuthUser()
  const isAdmin = authUser?.role === 'admin'
  const canManage = isAdmin || hasPermission(PERMISSIONS.EVENTS_MANAGE)

  function getAdminLoginIdentifier() {
    return authUser?.identifier || authUser?.email || null
  }

  const handleDelete = (event) => {
    setDeleteTarget(event)
  }

  const verifyPasswordAndDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await apiDeleteEvent(authToken, deleteTarget.id)
      if (res.ok) {
        setEvents(events.filter(e => e.id !== deleteTarget.id))
        setSuccessMsg('Event deleted successfully')
        setShowSuccess(true)
        setDeleteTarget(null)
      }
    } catch (err) {
      throw new Error(err.message)
    }
  }

  const handleApprove = async (id) => {
    try {
      const res = await apiApproveEvent(authToken, id)
      if (res.ok) {
        setEvents(events.map(e => e.id === id ? res.event : e))
        setSuccessMsg('Event approved successfully')
        setShowSuccess(true)
      }
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="module-page">
      <div className="w-full space-y-6">
        {/* Header Section */}
        <header className="module-header flex flex-col md:flex-row justify-between items-start md:items-center admin-student-list-header-enter">
          <div>
            <h1 className="main-title font-extrabold text-[var(--text)]">
              Events
            </h1>
            <p className="main-description text-[var(--text-muted)] mt-1">
              Manage academic and college events
            </p>
          </div>
          {canManage && (
            <button 
              className="mt-4 md:mt-0 font-medium transition-all duration-300 text-sm px-6 py-2.5 rounded-full hover:shadow-lg hover:scale-[1.03] active:scale-[0.98]"
              style={{ 
                background: 'var(--accent)', 
                color: 'white', 
                border: '1px solid var(--accent-soft)',
                borderRadius: '9999px'
              }}
              onClick={() => { setEditingEvent(null); setShowForm(true); }}
            >
              + Create New Event
            </button>
          )}
        </header>

        {/* Dashboard Summary Cards */}
        <div className="summary-row grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2 w-full mx-auto">
          <div className="summary-card">
            <div className="flex items-center justify-between mb-2">
              <span className="summary-label">Total Events</span>
              <div className="p-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg">
                <Calendar size={18} />
              </div>
            </div>
            <div className="summary-value text-[var(--text)]">{stats.total}</div>
          </div>

          <div className="summary-card">
            <div className="flex items-center justify-between mb-2">
              <span className="summary-label text-emerald-500">Upcoming</span>
              <div className="p-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg">
                <Clock size={18} />
              </div>
            </div>
            <div className="summary-value text-emerald-500">{stats.upcoming}</div>
          </div>

          <div className="summary-card">
            <div className="flex items-center justify-between mb-2">
              <span className="summary-label text-amber-500">Ongoing</span>
              <div className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg">
                <Clock size={18} />
              </div>
            </div>
            <div className="summary-value text-amber-500">{stats.ongoing}</div>
          </div>

          <div className="summary-card">
            <div className="flex items-center justify-between mb-2">
              <span className="summary-label text-[var(--text-muted)]">Completed</span>
              <div className="p-1.5 bg-gray-500/10 text-gray-400 rounded-lg">
                <CheckCircle size={18} />
              </div>
            </div>
            <div className="summary-value text-[var(--text-muted)]">{stats.completed}</div>
          </div>
        </div>

      {/* Actions Bar */}
      <section className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] p-5 shadow-sm mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row flex-1 gap-3 w-full">
            <div className="relative flex-[2] min-w-0">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-[var(--text-muted)] transition-colors focus-within:text-[var(--accent)]">
                <Search size={16} />
              </div>
              <input 
                type="text" 
                placeholder="Search events by title..."
                className="search-input w-full h-10 pr-4 text-xs"
                style={{ paddingLeft: '2.75rem' }}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-1 gap-3 w-full sm:w-auto">
              <div className="relative flex-1 min-w-0">
                <select 
                  className="search-input w-full h-10 px-4 appearance-none cursor-pointer text-xs"
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                >
                  <option value="all">All Types</option>
                  <option value="Academic">Academic</option>
                  <option value="Seminar">Seminar</option>
                  <option value="Workshop">Workshop</option>
                  <option value="Meeting">Meeting</option>
                  <option value="Deadline">Deadline</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
                  <Filter size={12} />
                </div>
              </div>
              <div className="relative flex-1 min-w-0">
                <select 
                  className="search-input w-full h-10 px-4 appearance-none cursor-pointer text-[11px]"
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
                  <Filter size={12} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-1 bg-[rgba(0,0,0,0.05)] p-1 rounded-lg border border-[var(--border-color)]">
            <button 
              className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <List size={18} />
            </button>
            <button 
              className={`p-2 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
              onClick={() => setViewMode('calendar')}
              title="Calendar View"
            >
              <Calendar size={18} />
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center p-12 text-[var(--accent)]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current" />
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] border border-[var(--border-color)] overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] border-b border-[var(--border-color)]">
              <tr>
                <th className="p-4 font-bold text-[var(--text-muted)] text-[10px] uppercase tracking-widest">Event Title</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-[10px] uppercase tracking-widest">Type</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-[10px] uppercase tracking-widest">Date & Time</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-[10px] uppercase tracking-widest">Location</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-[10px] uppercase tracking-widest">Audience</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-[10px] uppercase tracking-widest">Status</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-[10px] uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-[var(--text-muted)] text-sm italic">No events found matching your criteria.</td>
                </tr>
              ) : filteredEvents.map(event => (
                <tr key={event.id} className="hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.01)] transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-[var(--text)]">{event.title}</div>
                    <div className="text-xs text-[var(--text-muted)] truncate max-w-xs">{event.description}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider
                      ${event.type === 'Academic' ? 'bg-blue-500/10 text-blue-500' : 
                        event.type === 'Seminar' ? 'bg-purple-500/10 text-purple-500' : 
                        event.type === 'Workshop' ? 'bg-amber-500/10 text-amber-500' : 
                        'bg-[var(--border-color)] text-[var(--text-muted)]'}`}>
                      {event.type}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-[var(--text)]">
                    <div className="font-semibold">{new Date(event.start_time).toLocaleDateString()}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="p-4 text-sm">
                    <div className="flex items-center gap-1.5 text-[var(--text)]">
                      <MapPin size={14} className="text-[var(--text-muted)]" />
                      {event.location}
                    </div>
                  </td>
                  <td className="p-4 text-[10px] font-bold uppercase tracking-tight text-[var(--text-muted)]">
                    <div className="flex items-center gap-1.5">
                      <Users size={14} />
                      {event.target_audience}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                      ${event.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 
                        event.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 
                        'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                      {event.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isAdmin && event.status === 'pending' && (
                        <button 
                          className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all"
                          title="Approve"
                          onClick={() => handleApprove(event.id)}
                        >
                          <CheckCircle size={18} />
                        </button>
                      )}
                      {(isAdmin || event.created_by === authUser?.id) && (
                        <>
                          <button 
                            className="p-2 text-[var(--accent)] hover:bg-[var(--accent-soft)] rounded-lg transition-all"
                            title="Edit"
                            onClick={() => { setEditingEvent(event); setShowForm(true); }}
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                            title="Delete"
                            onClick={() => handleDelete(event)}
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-animate-reveal">
          <EventCalendar events={filteredEvents} />
        </div>
      )}

      {showForm && (
        <AdminEventForm 
          event={editingEvent} 
          onClose={() => setShowForm(false)} 
          onSuccess={() => {
            setShowForm(false);
            fetchEvents();
            setSuccessMsg(editingEvent ? 'Event updated successfully' : 'Event created successfully');
            setShowSuccess(true);
          }}
        />
      )}

      {showSuccess && (
        <SuccessModal 
          message={successMsg} 
          onClose={() => setShowSuccess(false)} 
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          title="Delete Event?"
          description={
            <p>
              Are you sure you want to delete <span className="font-bold text-[var(--text)]">{deleteTarget.title}</span>? 
              This action cannot be undone. Enter your administrator password to confirm.
            </p>
          }
          confirmLabel="Confirm Deletion"
          adminIdentifier={getAdminLoginIdentifier()}
          onConfirm={verifyPasswordAndDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
    </div>
  )
}
