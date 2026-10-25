export type EntityId = string

export interface GroupRequirement {
  subjectId: EntityId
  sessions: number
}

export interface StudentGroup {
  id: EntityId
  name: string
  department: string
  year: string
  section: string
  students: number
  requirements: GroupRequirement[]
}

export interface Subject {
  id: EntityId
  name: string
  code: string
  department: string
  semester: string
  facultyIds: EntityId[]
  groupIds: EntityId[]
  sessionsPerWeek: number
  duration: number
  practical: boolean
}

export interface Faculty {
  id: EntityId
  name: string
  facultyCode: string
  department: string
  subjectIds: EntityId[]
  availableDays: string[]
  availableSlotIds: EntityId[]
  unavailableSlotIds: EntityId[]
  maxPerDay: number
  maxPerWeek: number
}

export interface Classroom {
  id: EntityId
  name: string
  building: string
  type: string
  capacity: number
  equipment: string
  availableDays: string[]
  availableSlotIds: EntityId[]
}

export interface TimeWindow {
  id: EntityId
  day: string
  start: string
  end: string
  isBreak: boolean
  label: string
}

export interface ScheduleEntry {
  id: EntityId
  sessionKey: string
  groupId: EntityId
  subjectId: EntityId
  facultyId: EntityId
  roomId: EntityId
  windowId: EntityId
  day: string
  start: string
  end: string
  durationOverride?: number
  manual?: boolean
}

export interface Preferences {
  avoidFacultyBackToBack: boolean
  spreadSubjects: boolean
  maxSearchNodes: number
}

export interface PlannerData {
  groups: StudentGroup[]
  subjects: Subject[]
  faculty: Faculty[]
  rooms: Classroom[]
  windows: TimeWindow[]
  schedule: ScheduleEntry[]
  preferences: Preferences
}

export interface Conflict {
  type: string
  message: string
  resolution: string
  entryIds: string[]
  day?: string
  start?: string
  end?: string
}

export interface RequiredSession {
  key: string
  groupId: EntityId
  subjectId: EntityId
  index: number
}

export interface GenerateResult {
  schedule: ScheduleEntry[] | null
  nodes: number
  limited: boolean
  reason: string
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DEFAULT_PREFERENCES: Preferences = {
  avoidFacultyBackToBack: false,
  spreadSubjects: true,
  maxSearchNodes: 50000,
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function blankData(): PlannerData {
  return { groups: [], subjects: [], faculty: [], rooms: [], windows: [], schedule: [], preferences: { ...DEFAULT_PREFERENCES } }
}

export function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function overlaps(a: Pick<ScheduleEntry, 'day' | 'start' | 'end'>, b: Pick<ScheduleEntry, 'day' | 'start' | 'end'>): boolean {
  return a.day === b.day && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end)
}

export function timeLabel(time: string): string {
  const [hour, minute] = time.split(':').map(Number)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function requiredSessions(data: PlannerData): RequiredSession[] {
  return data.groups.flatMap(group => group.requirements.flatMap(requirement =>
    Array.from({ length: Math.max(0, requirement.sessions) }, (_, index) => ({
      key: `${group.id}:${requirement.subjectId}:${index + 1}`,
      groupId: group.id,
      subjectId: requirement.subjectId,
      index: index + 1,
    })),
  ))
}

function eligibleFaculty(subject: Subject, data: PlannerData): Faculty[] {
  return data.faculty.filter(person =>
    (!subject.facultyIds.length || subject.facultyIds.includes(person.id)) &&
    person.subjectIds.includes(subject.id),
  )
}

function windowEligible(window: TimeWindow, availabilityDays: string[], availableSlots: string[], unavailableSlots: string[]): boolean {
  return (!availabilityDays.length || availabilityDays.includes(window.day)) &&
    (!availableSlots.length || availableSlots.includes(window.id)) &&
    !unavailableSlots.includes(window.id)
}

function candidates(session: RequiredSession, data: PlannerData): Array<{ faculty: Faculty; room: Classroom; window: TimeWindow }> {
  const group = data.groups.find(item => item.id === session.groupId)
  const subject = data.subjects.find(item => item.id === session.subjectId)
  if (!group || !subject) return []
  const faculty = eligibleFaculty(subject, data)
  const rooms = data.rooms.filter(room =>
    room.capacity >= group.students &&
    (!subject.practical || room.type.toLowerCase().includes('lab')),
  )
  const windows = data.windows.filter(window =>
    !window.isBreak &&
    minutes(window.end) - minutes(window.start) >= subject.duration &&
    !data.windows.some(breakWindow =>
      breakWindow.isBreak && breakWindow.day === window.day &&
      minutes(window.start) < minutes(breakWindow.end) &&
      minutes(breakWindow.start) < minutes(window.start) + subject.duration,
    ),
  )
  return faculty.flatMap(person => rooms.flatMap(room => windows
    .filter(window =>
      windowEligible(window, person.availableDays, person.availableSlotIds, person.unavailableSlotIds) &&
      windowEligible(window, room.availableDays, room.availableSlotIds, []),
    )
    .map(window => ({ faculty: person, room, window })),
  ))
}

function toEntry(session: RequiredSession, candidate: ReturnType<typeof candidates>[number], subject: Subject): ScheduleEntry {
  return {
    id: newId(),
    sessionKey: session.key,
    groupId: session.groupId,
    subjectId: session.subjectId,
    facultyId: candidate.faculty.id,
    roomId: candidate.room.id,
    windowId: candidate.window.id,
    day: candidate.window.day,
    start: candidate.window.start,
    end: toTime(minutes(candidate.window.start) + subject.duration),
  }
}

function toTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function hasMandatoryConflict(entry: ScheduleEntry, placed: ScheduleEntry[], data: PlannerData): boolean {
  const group = data.groups.find(item => item.id === entry.groupId)
  const subject = data.subjects.find(item => item.id === entry.subjectId)
  const faculty = data.faculty.find(item => item.id === entry.facultyId)
  const room = data.rooms.find(item => item.id === entry.roomId)
  const window = data.windows.find(item => item.id === entry.windowId)
  if (!group || !subject || !faculty || !room || !window) return true
  if (window.isBreak || entry.day !== window.day || minutes(entry.start) < minutes(window.start) ||
      minutes(entry.end) > minutes(window.end) || minutes(entry.end) - minutes(entry.start) !== (entry.durationOverride ?? subject.duration) ||
      data.windows.some(breakWindow => breakWindow.isBreak && breakWindow.day === entry.day &&
        minutes(entry.start) < minutes(breakWindow.end) && minutes(breakWindow.start) < minutes(entry.end))) return true
  if (!eligibleFaculty(subject, data).some(item => item.id === faculty.id)) return true
  if (room.capacity < group.students || (subject.practical && !room.type.toLowerCase().includes('lab'))) return true
  if (!windowEligible(window, faculty.availableDays, faculty.availableSlotIds, faculty.unavailableSlotIds)) return true
  if (!windowEligible(window, room.availableDays, room.availableSlotIds, [])) return true
  const facultyDayCount = placed.filter(item => item.facultyId === faculty.id && item.day === entry.day).length
  const facultyWeekCount = placed.filter(item => item.facultyId === faculty.id).length
  if (facultyDayCount >= faculty.maxPerDay || facultyWeekCount >= faculty.maxPerWeek) return true
  return placed.some(item => overlaps(item, entry) && (
    item.groupId === entry.groupId || item.facultyId === entry.facultyId || item.roomId === entry.roomId
  ))
}

export function generateSchedule(data: PlannerData): GenerateResult {
  const sessions = requiredSessions(data)
  if (!sessions.length) return { schedule: null, nodes: 0, limited: false, reason: 'Add at least one student group and a required subject session before generating.' }
  if (!data.windows.some(window => !window.isBreak)) return { schedule: null, nodes: 0, limited: false, reason: 'Add at least one non-break time window.' }
  const options = new Map(sessions.map(session => [session.key, candidates(session, data)]))
  const impossible = sessions.filter(session => !options.get(session.key)?.length)
  if (impossible.length) {
    const examples = impossible.slice(0, 3).map(session => {
      const group = data.groups.find(item => item.id === session.groupId)?.name ?? 'Unknown group'
      const subject = data.subjects.find(item => item.id === session.subjectId)?.name ?? 'Unknown subject'
      return `${subject} for ${group}`
    })
    return {
      schedule: null,
      nodes: 0,
      limited: false,
      reason: `No eligible faculty, room, and available time window combination exists for ${examples.join('; ')}${impossible.length > 3 ? ` and ${impossible.length - 3} more` : ''}. Check qualifications, room capacity/type, and availability.`,
    }
  }

  let nodes = 0
  let limited = false
  const limit = Math.max(100, data.preferences.maxSearchNodes)
  const placed: ScheduleEntry[] = []
  const remaining = [...sessions]
  const search = (): boolean => {
    if (!remaining.length) return true
    let bestIndex = -1
    let bestOptions: ScheduleEntry[] | null = null
    for (let index = 0; index < remaining.length; index += 1) {
      const session = remaining[index]
      const subject = data.subjects.find(item => item.id === session.subjectId)!
      const validOptions = (options.get(session.key) ?? [])
        .map(candidate => toEntry(session, candidate, subject))
        .filter(entry => !hasMandatoryConflict(entry, placed, data))
      if (!bestOptions || validOptions.length < bestOptions.length) {
        bestIndex = index
        bestOptions = validOptions
      }
      if (!validOptions.length) break
    }
    if (bestIndex < 0 || !bestOptions?.length) return false
    const [session] = remaining.splice(bestIndex, 1)
    const preferred = bestOptions.sort((a, b) => {
      if (data.preferences.avoidFacultyBackToBack) {
        const backToBack = (entry: ScheduleEntry) => placed.filter(item =>
          item.facultyId === entry.facultyId && item.day === entry.day &&
          (minutes(item.end) === minutes(entry.start) || minutes(entry.end) === minutes(item.start)),
        ).length
        const difference = backToBack(a) - backToBack(b)
        if (difference) return difference
      }
      if (data.preferences.spreadSubjects) {
        const aSame = placed.filter(item => item.groupId === a.groupId && item.subjectId === a.subjectId && item.day === a.day).length
        const bSame = placed.filter(item => item.groupId === b.groupId && item.subjectId === b.subjectId && item.day === b.day).length
        return aSame - bSame
      }
      return 0
    })
    for (const entry of preferred) {
      nodes += 1
      if (nodes > limit) {
        limited = true
        remaining.splice(bestIndex, 0, session)
        return false
      }
      placed.push(entry)
      if (search()) return true
      placed.pop()
      if (limited) {
        remaining.splice(bestIndex, 0, session)
        return false
      }
    }
    remaining.splice(bestIndex, 0, session)
    return false
  }

  if (search()) return { schedule: placed, nodes, limited: false, reason: '' }
  return {
    schedule: null,
    nodes,
    limited,
    reason: limited
      ? `Search reached the ${limit.toLocaleString()}-node limit after ${nodes.toLocaleString()} attempts. Add availability or time windows, reduce requirements, or retry with a larger search limit.`
      : `No complete conflict-free assignment was found after ${nodes.toLocaleString()} assignment attempts. The combined room, faculty, availability, workload, and group constraints may be too restrictive.`,
  }
}

export function validateSchedule(schedule: ScheduleEntry[], data: PlannerData): Conflict[] {
  const conflicts: Conflict[] = []
  const push = (conflict: Conflict) => conflicts.push(conflict)
  for (const entry of schedule) {
    const group = data.groups.find(item => item.id === entry.groupId)
    const subject = data.subjects.find(item => item.id === entry.subjectId)
    const faculty = data.faculty.find(item => item.id === entry.facultyId)
    const room = data.rooms.find(item => item.id === entry.roomId)
    const window = data.windows.find(item => item.id === entry.windowId)
    const details = `${subject?.name ?? 'Unknown subject'} for ${group?.name ?? 'unknown group'}`
    if (!group || !subject || !faculty || !room || !window) {
      push({ type: 'Invalid assignment', message: `${details} refers to a record that no longer exists.`, resolution: 'Select existing records or remove this schedule entry.', entryIds: [entry.id], day: entry.day, start: entry.start, end: entry.end })
      continue
    }
    const overlapsBreak = data.windows.some(breakWindow => breakWindow.isBreak && breakWindow.day === entry.day &&
      minutes(entry.start) < minutes(breakWindow.end) && minutes(breakWindow.start) < minutes(entry.end))
    if (window.isBreak || overlapsBreak || entry.day !== window.day || minutes(entry.start) < minutes(window.start) || minutes(entry.end) > minutes(window.end)) {
      push({ type: window.isBreak || overlapsBreak ? 'Break-time violation' : 'Working-window violation', message: `${details} is outside its selected working window or overlaps a configured break.`, resolution: 'Move the session into a non-break time window that contains its full duration.', entryIds: [entry.id], day: entry.day, start: entry.start, end: entry.end })
    }
    const expectedDuration = entry.durationOverride ?? subject.duration
    if (minutes(entry.end) <= minutes(entry.start) || minutes(entry.end) - minutes(entry.start) !== expectedDuration) {
      push({ type: 'Session duration', message: `${details} does not match its configured ${expectedDuration}-minute duration.`, resolution: 'Adjust the session duration or update the subject duration.', entryIds: [entry.id], day: entry.day, start: entry.start, end: entry.end })
    }
    if (!eligibleFaculty(subject, data).some(person => person.id === faculty.id)) {
      push({ type: 'Faculty qualification', message: `${faculty.name} is not listed as eligible to teach ${subject.name}.`, resolution: 'Assign an eligible faculty member or update the faculty-subject relation.', entryIds: [entry.id], day: entry.day, start: entry.start, end: entry.end })
    }
    if (room.capacity < group.students) {
      push({ type: 'Room capacity', message: `${room.name} seats ${room.capacity}, fewer than ${group.name}'s ${group.students} students.`, resolution: 'Choose a room with sufficient capacity.', entryIds: [entry.id], day: entry.day, start: entry.start, end: entry.end })
    }
    if (subject.practical && !room.type.toLowerCase().includes('lab')) {
      push({ type: 'Practical room', message: `${subject.name} requires a lab, but ${room.name} is a ${room.type}.`, resolution: 'Choose a room whose type includes "lab".', entryIds: [entry.id], day: entry.day, start: entry.start, end: entry.end })
    }
    if (!windowEligible(window, faculty.availableDays, faculty.availableSlotIds, faculty.unavailableSlotIds)) {
      push({ type: 'Faculty availability', message: `${faculty.name} is unavailable for this day or time window.`, resolution: 'Choose an available day and time window or update faculty availability.', entryIds: [entry.id], day: entry.day, start: entry.start, end: entry.end })
    }
    if (!windowEligible(window, room.availableDays, room.availableSlotIds, [])) {
      push({ type: 'Room availability', message: `${room.name} is unavailable for this day or time window.`, resolution: 'Choose an available room window or update room availability.', entryIds: [entry.id], day: entry.day, start: entry.start, end: entry.end })
    }
  }
  for (let i = 0; i < schedule.length; i += 1) {
    for (let j = i + 1; j < schedule.length; j += 1) {
      const first = schedule[i]
      const second = schedule[j]
      if (!overlaps(first, second)) continue
      const sameResources = [
        ['Faculty conflict', first.facultyId === second.facultyId, 'Assign a different available faculty member or time.'],
        ['Classroom conflict', first.roomId === second.roomId, 'Assign a different available classroom or time.'],
        ['Student-group conflict', first.groupId === second.groupId, 'Move one of the group sessions to a non-overlapping time.'],
      ] as const
      for (const [type, matches, resolution] of sameResources) {
        if (!matches) continue
        push({
          type,
          message: `${type === 'Faculty conflict' ? 'The faculty member' : type === 'Classroom conflict' ? 'The classroom' : 'The student group'} is assigned to overlapping sessions (${timeLabel(first.start)}–${timeLabel(first.end)} and ${timeLabel(second.start)}–${timeLabel(second.end)}).`,
          resolution,
          entryIds: [first.id, second.id],
          day: first.day,
          start: first.start,
          end: first.end,
        })
      }
    }
  }
  const required = requiredSessions(data)
  for (const session of required) {
    if (!schedule.some(entry => entry.sessionKey === session.key)) {
      const group = data.groups.find(item => item.id === session.groupId)
      const subject = data.subjects.find(item => item.id === session.subjectId)
      push({
        type: 'Unscheduled session',
        message: `${subject?.name ?? 'Subject'} for ${group?.name ?? 'group'} (session ${session.index}) has not been scheduled.`,
        resolution: 'Generate a timetable or add a valid session for this requirement.',
        entryIds: [],
      })
    }
  }
  for (const entry of schedule) {
    const requested = required.filter(session => session.groupId === entry.groupId && session.subjectId === entry.subjectId).length
    const scheduled = schedule.filter(item => item.groupId === entry.groupId && item.subjectId === entry.subjectId).length
    if (scheduled > requested) {
      push({
        type: 'Extra session',
        message: `${data.subjects.find(item => item.id === entry.subjectId)?.name ?? 'Subject'} for ${data.groups.find(item => item.id === entry.groupId)?.name ?? 'group'} has more scheduled sessions than required.`,
        resolution: 'Adjust the group requirement or remove the extra session.',
        entryIds: [entry.id],
        day: entry.day,
        start: entry.start,
        end: entry.end,
      })
      break
    }
  }
  for (const entry of schedule) {
    const faculty = data.faculty.find(item => item.id === entry.facultyId)
    if (!faculty) continue
    const dayCount = schedule.filter(item => item.facultyId === faculty.id && item.day === entry.day).length
    const weekCount = schedule.filter(item => item.facultyId === faculty.id).length
    if (dayCount > faculty.maxPerDay || weekCount > faculty.maxPerWeek) {
      push({
        type: 'Faculty workload',
        message: `${faculty.name} exceeds their configured daily or weekly teaching-session limit.`,
        resolution: 'Redistribute sessions or increase the faculty workload limit.',
        entryIds: [entry.id],
        day: entry.day,
        start: entry.start,
        end: entry.end,
      })
      break
    }
  }
  return conflicts
}

export function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
