import { useState, useEffect } from 'react'
import { X, Calendar, Clock, MapPin, Users, Type, AlignLeft, Shield, Plus, Edit2 } from './Icons'
import { apiCreateEvent, apiUpdateEvent } from '../lib/api'

export default function AdminEventForm({ event, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Academic',
    start_time: '',
    end_time: '',
    location: '',
    target_audience: 'all',
    department: '',
    visibility: 'public'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const authToken = localStorage.getItem('authToken')

  useEffect(() => {
    if (event) {
      // Format dates for input type="datetime-local"
      const formatLocal = (dt) => {
        if (!dt) return ''
        const d = new Date(dt)
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      }
      setFormData({
        title: event.title || '',
        description: event.description || '',
        type: event.type || 'Academic',
        start_time: formatLocal(event.start_time),
        end_time: formatLocal(event.end_time),
        location: event.location || '',
        target_audience: event.target_audience || 'all',
        department: event.department || '',
        visibility: event.visibility || 'public'
      })
    }
  }, [event])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (event) {
        await apiUpdateEvent(authToken, event.id, formData)
      } else {
        await apiCreateEvent(authToken, formData)
      }
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Optimized overlay with NO blur for maximum performance */}
      <div 
        className="absolute inset-0 bg-black/45 cursor-default transition-opacity" 
        onClick={onClose}
      />
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-lg)] w-full max-w-2xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <header className="p-6 border-b border-[var(--border-color)] flex justify-between items-center" style={{ background: 'var(--bg-main)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--accent-soft)] text-[var(--accent)] rounded-lg">
              {event ? <Edit2 size={20} /> : <Plus size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text)] m-0 leading-tight">
                {event ? 'Update Event Details' : 'Create New Event'}
              </h2>
              <p className="text-[10px] text-[var(--text-muted)] m-0 mt-0.5 uppercase tracking-widest font-semibold">
                {event ? 'Edit established event parameters' : 'Configure a new college activity'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--accent-soft)] rounded-full text-[var(--text-muted)] transition-colors">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-10 overflow-y-auto max-h-[80vh]">
          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-[var(--radius-md)] text-xs font-semibold flex items-center gap-2">
              <Shield size={14} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-2">
                <Type size={14} className="opacity-70" /> Event Title
              </label>
              <input 
                type="text" 
                required
                className="search-input w-full px-4 rounded-[var(--radius-md)] h-10 transition-all focus:ring-2 focus:ring-[var(--accent-soft)]"
                placeholder="e.g. CCS Research Colloquium"
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-2">
                <AlignLeft size={14} className="opacity-70" /> Description
              </label>
              <textarea 
                rows="3"
                className="search-input w-full px-4 py-2.5 rounded-[var(--radius-md)] min-h-[90px] transition-all focus:ring-2 focus:ring-[var(--accent-soft)]"
                placeholder="Details about the event..."
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-2">
                <Calendar size={14} className="opacity-70" /> Event Type
              </label>
              <input 
                list="eventTypes"
                className="search-input w-full px-4 rounded-[var(--radius-md)] h-10 transition-all focus:ring-2 focus:ring-[var(--accent-soft)]"
                placeholder="Type or select..."
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value})}
              />
              <datalist id="eventTypes">
                <option value="Academic">Academic</option>
                <option value="Seminar">Seminar</option>
                <option value="Workshop">Workshop</option>
                <option value="Meeting">Meeting</option>
                <option value="Deadline">Deadline</option>
              </datalist>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-2">
                <MapPin size={14} className="opacity-70" /> Location
              </label>
              <input 
                type="text" 
                required
                className="search-input w-full px-4 rounded-[var(--radius-md)] h-10 transition-all focus:ring-2 focus:ring-[var(--accent-soft)]"
                placeholder="Physical room or Virtual link"
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-2">
                <Clock size={14} className="opacity-70" /> Start Date & Time
              </label>
              <input 
                type="datetime-local" 
                required
                className="search-input w-full px-4 rounded-[var(--radius-md)] h-10 transition-all focus:ring-2 focus:ring-[var(--accent-soft)]"
                value={formData.start_time}
                onChange={e => setFormData({...formData, start_time: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-2">
                <Clock size={14} className="opacity-70" /> End Date & Time
              </label>
              <input 
                type="datetime-local" 
                required
                className="search-input w-full px-4 rounded-[var(--radius-md)] h-10 transition-all focus:ring-2 focus:ring-[var(--accent-soft)]"
                value={formData.end_time}
                onChange={e => setFormData({...formData, end_time: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-2">
                <Users size={14} className="opacity-70" /> Target Audience
              </label>
              <div className="relative">
                <select 
                  className="search-input w-full px-4 rounded-[var(--radius-md)] h-10 appearance-none cursor-pointer pr-10 transition-all focus:ring-2 focus:ring-[var(--accent-soft)]"
                  value={formData.target_audience}
                  onChange={e => setFormData({...formData, target_audience: e.target.value})}
                >
                  <option value="all">All Users</option>
                  <option value="student">Students Only</option>
                  <option value="faculty">Faculty Only</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                  <Plus size={14} className="rotate-45" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2 flex items-center gap-2">
                <Shield size={14} className="opacity-70" /> Visibility
              </label>
              <div className="relative">
                <select 
                  className="search-input w-full px-4 rounded-[var(--radius-md)] h-10 appearance-none cursor-pointer pr-10 transition-all focus:ring-2 focus:ring-[var(--accent-soft)]"
                  value={formData.visibility}
                  onChange={e => setFormData({...formData, visibility: e.target.value})}
                >
                  <option value="public">Public</option>
                  <option value="restricted">Restricted (Roles/Dept)</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                  <Plus size={14} className="rotate-45" />
                </div>
              </div>
            </div>
          </div>

          <footer className="mt-8 flex justify-end gap-3 pt-5 border-t border-[var(--border-color)]">
            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 font-medium text-[11px] text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors rounded-md"
            >
              Discard changes
            </button>
            <button 
              type="submit"
              disabled={loading}
              className="px-5 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:opacity-50 text-white font-medium text-[11px] rounded-md shadow-sm transition-all"
            >
              {loading ? 'Processing...' : event ? 'Update event' : 'Create event'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

