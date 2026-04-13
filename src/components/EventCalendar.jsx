import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Clock } from './Icons'

export default function EventCalendar({ events }) {
  const [currentDate, setCurrentDate] = useState(new Date())

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const days = new Date(year, month + 1, 0).getDate()
    
    const arr = []
    // Padding for previous month
    for (let i = 0; i < firstDay; i++) {
      arr.push({ day: null, date: null })
    }
    // Current month days
    for (let i = 1; i <= days; i++) {
      arr.push({ 
        day: i, 
        date: new Date(year, month, i) 
      })
    }
    return arr
  }, [currentDate])

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

  const monthName = currentDate.toLocaleString('default', { month: 'long' })
  const year = currentDate.getFullYear()

  const getEventsForDay = (date) => {
    if (!date) return []
    return events.filter(e => {
      const start = new Date(e.start_time)
      return start.getDate() === date.getDate() && 
             start.getMonth() === date.getMonth() && 
             start.getFullYear() === date.getFullYear()
    })
  }

  return (
    <div className="event-calendar bg-[var(--card-bg)] rounded-[var(--radius-lg)] border border-[var(--border-color)] overflow-hidden shadow-sm admin-animate-reveal">
      <header className="p-3 border-b border-[var(--border-color)] flex justify-between items-center bg-[rgba(0,0,0,0.02)]">
        <h2 className="font-bold text-[var(--text)] m-0" style={{ fontSize: '15px' }}>
          {monthName} <span className="text-[var(--text-muted)] font-normal ml-1">{year}</span>
        </h2>
        <div className="flex gap-1.5 align-middle">
          <button onClick={prevMonth} className="px-1.5 py-1 hover:bg-[var(--accent-soft)] rounded text-[var(--text-muted)] transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button 
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 font-bold uppercase tracking-wider bg-[var(--accent)] hover:scale-[1.03] active:scale-[0.98] text-white rounded-full shadow-sm transition-all"
            style={{ fontSize: '10px' }}
          >
            Today
          </button>
          <button onClick={nextMonth} className="px-1.5 py-1 hover:bg-[var(--accent-soft)] rounded text-[var(--text-muted)] transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 bg-[rgba(0,0,0,0.01)] border-b border-[var(--border-color)]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="p-1.5 text-center text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 min-h-[300px] divide-x divide-y divide-[var(--border-color)]">
        {daysInMonth.map((item, idx) => {
          const dayEvents = getEventsForDay(item.date)
          const isToday = item.date && item.date.toDateString() === new Date().toDateString()
          
          return (
            <div 
              key={idx} 
              className={`min-h-[70px] p-1.5 relative group transition-colors
                ${!item.day ? 'bg-[rgba(0,0,0,0.03)]' : 'bg-transparent hover:bg-[rgba(0,0,0,0.01)]'}`}
            >
              {item.day && (
                <>
                  <span className={`text-xs font-bold ${isToday ? 'bg-[var(--accent)] text-white w-6 h-6 flex items-center justify-center rounded-full shadow-md shadow-[var(--accent-soft)]' : 'text-[var(--text-muted)]'}`}>
                    {item.day}
                  </span>
                  <div className="mt-2 space-y-1">
                    {dayEvents.map(e => (
                      <div 
                        key={e.id} 
                        className={`text-[9px] p-1.5 rounded border truncate cursor-pointer transition-all hover:translate-x-1
                          ${e.type === 'Academic' ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400' : 
                            e.type === 'Seminar' ? 'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400' : 
                            e.type === 'Workshop' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400' : 
                            'bg-[var(--border-color)] border-transparent text-[var(--text-muted)]'}`}
                        title={`${e.title}\n${new Date(e.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`}
                      >
                        <div className="flex items-center gap-1">
                          <Clock size={8} />
                          <span className="font-semibold uppercase tracking-tight">{e.title}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
