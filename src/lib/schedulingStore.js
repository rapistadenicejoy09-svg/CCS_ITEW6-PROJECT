export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
import { request } from './api'

const API_BASE = '/api/schedules'

export async function getSchedules() {
  try {
    const data = await request(API_BASE, { method: 'GET' })
    return data.schedules || []
  } catch (err) {
    console.error('[SchedulingStore] Fetch error:', err)
    return []
  }
}

export async function getScheduleById(id) {
  try {
    const data = await request(`${API_BASE}/${id}`, { method: 'GET' })
    return data.schedule || null
  } catch {
    return null
  }
}

export async function createSchedule(data) {
  return await request(API_BASE, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateSchedule(id, data) {
  return await request(`${API_BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteSchedule(id) {
  return await request(`${API_BASE}/${id}`, {
    method: 'DELETE',
  })
}

export function parseMinutes(value) {
  const [h, m] = String(value || '')
    .split(':')
    .map((v) => Number(v))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeId(value) {
  const v = String(value || '').trim()
  return v ? v : ''
}

export function buildTimeSlots(startHour = 6, endHour = 22) {
  const slots = []
  for (let hour = startHour; hour < endHour; hour += 1) {
    const from1 = `${String(hour).padStart(2, '0')}:00`
    const to1 = `${String(hour).padStart(2, '0')}:30`
    slots.push({ key: `${from1}-${to1}`, from: from1, to: to1 })

    const from2 = `${String(hour).padStart(2, '0')}:30`
    const to2 = `${String(hour + 1).padStart(2, '0')}:00`
    slots.push({ key: `${from2}-${to2}`, from: from2, to: to2 })
  }
  return slots
}

export function calculateTimetableTracks(schedules) {
  const byDay = {}
  schedules.forEach((s) => {
    if (!byDay[s.day]) byDay[s.day] = []
    byDay[s.day].push({
      ...s,
      _start: parseMinutes(s.startTime),
      _end: parseMinutes(s.endTime),
    })
  })

  const results = []

  Object.values(byDay).forEach((daySchedules) => {
    // Sort by start time, then duration
    daySchedules.sort((a, b) => a._start - b._start || b._end - a._end)

    const columns = [] // Each column stores the end time of its last assigned schedule

    daySchedules.forEach((s) => {
      let colIdx = columns.findIndex((lastEnd) => lastEnd <= s._start)
      if (colIdx === -1) {
        colIdx = columns.length
        columns.push(s._end)
      } else {
        columns[colIdx] = s._end
      }
      s.colIdx = colIdx
    })

    // Now we need to know the total columns needed for each cluster of overlaps
    // For simplicity in this UI, we'll just use the total number of columns used in that day
    // to determine the width, or we can calculate it per cluster.
    // Let's calculate per cluster for better space usage.
    daySchedules.forEach((s) => {
      // Find max colIdx among all overlapping schedules for this one
      let maxCols = 0
      daySchedules.forEach((other) => {
        const overlaps = s._start < other._end && other._start < s._end
        if (overlaps) {
          maxCols = Math.max(maxCols, other.colIdx + 1)
        }
      })
      results.push({ ...s, totalCols: maxCols })
    })
  })

  return results
}

export function formatCohortLabel(course, yearLevel, section) {
  const courseRaw = String(course || '').trim().toUpperCase()
  const courseShort = courseRaw.startsWith('BS') ? courseRaw.slice(2) : courseRaw

  const yearRaw = String(yearLevel || '').trim()
  const yearDigit = (yearRaw.match(/\d/) || [''])[0]

  const sectionRaw = String(section || '').trim().toUpperCase()
  const sectionLetter = (sectionRaw.match(/[A-Z]+/g) || []).join('') || sectionRaw

  const left = `${yearDigit}${courseShort}`.trim()
  const right = sectionLetter.trim()
  if (left && right) return `${left}-${right}`
  return left || right || ''
}

export function normalizeScheduleInput(input) {
  const instructorId = normalizeId(input?.instructorId)
  const instructorEmail = String(input?.instructorEmail || '').trim().toLowerCase()
  return {
    subjectCode: String(input?.subjectCode || '').trim().toUpperCase(),
    subjectTitle: String(input?.subjectTitle || '').trim(),
    instructor: String(input?.instructor || '').trim(),
    instructorId,
    instructorEmail,
    course: String(input?.course || '').trim().toUpperCase(),
    yearLevel: String(input?.yearLevel || '').trim(),
    semester: String(input?.semester || '').trim(),
    section: String(input?.section || '').trim().toUpperCase(),
    day: String(input?.day || 'Monday').trim(),
    startTime: String(input?.startTime || '08:00').trim(),
    endTime: String(input?.endTime || '09:00').trim(),
    room: String(input?.room || '').trim().toUpperCase(),
  }
}

export function validateScheduleRequiredFields(input) {
  if (
    !input.subjectCode ||
    !input.subjectTitle ||
    (!input.instructor && !input.instructorId) ||
    !input.course ||
    !input.yearLevel ||
    !input.semester ||
    !input.section ||
    !input.room ||
    !input.day ||
    !input.startTime ||
    !input.endTime
  ) {
    return 'Please complete all fields before saving.'
  }
  return ''
}

export function validateScheduleConflicts(nextSchedule, allSchedules, excludeId = null) {
  const nextStart = parseMinutes(nextSchedule.startTime)
  const nextEnd = parseMinutes(nextSchedule.endTime)
  if (nextStart == null || nextEnd == null || nextEnd <= nextStart) {
    return 'End time must be later than start time.'
  }

  const conflicts = []
  allSchedules.forEach((item) => {
    if (excludeId != null && String(item.id) === String(excludeId)) return
    if (item.day !== nextSchedule.day) return
    const start = parseMinutes(item.startTime)
    const end = parseMinutes(item.endTime)
    if (start == null || end == null) return
    if (!overlaps(nextStart, nextEnd, start, end)) return

    const nextInstructorId = normalizeId(nextSchedule.instructorId)
    const itemInstructorId = normalizeId(item.instructorId)
    const sameInstructor =
      (nextInstructorId && itemInstructorId && nextInstructorId === itemInstructorId) ||
      (!nextInstructorId && !itemInstructorId && normalizeText(item.instructor) === normalizeText(nextSchedule.instructor))
    const sameRoom = normalizeText(item.room) === normalizeText(nextSchedule.room)
    const sameSection =
      normalizeText(item.course) === normalizeText(nextSchedule.course) &&
      normalizeText(item.yearLevel) === normalizeText(nextSchedule.yearLevel) &&
      normalizeText(item.section) === normalizeText(nextSchedule.section)

    if (sameInstructor) conflicts.push(`Instructor conflict with ${item.subjectCode} (${item.startTime}-${item.endTime})`)
    if (sameRoom) conflicts.push(`Room conflict in ${item.room} (${item.startTime}-${item.endTime})`)
    if (sameSection) conflicts.push(`Section conflict for ${item.course} ${item.yearLevel} - ${item.section}`)
  })

  if (conflicts.length > 0) return conflicts.join('. ')
  return ''
}

export const ROOM_OPTIONS = [
  ...Array.from({ length: 10 }, (_, i) => `BCH ${101 + i}`),
  ...Array.from({ length: 10 }, (_, i) => `BCH ${201 + i}`),
  ...Array.from({ length: 10 }, (_, i) => `BCH ${301 + i}`),
  ...Array.from({ length: 10 }, (_, i) => `BCH ${401 + i}`),
  ...Array.from({ length: 10 }, (_, i) => `BCH ${501 + i}`),
  ...Array.from({ length: 6 }, (_, i) => `COMLAB ${1 + i}`),
  'VRCCS-1',
  'VRCCS-2',
  '305',
  '306',
  '307',
  '308',
  '309',
  '310',
  '312',
  '314',
]
