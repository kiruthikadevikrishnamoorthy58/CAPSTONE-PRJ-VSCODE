import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowLeftRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown,
  CircleAlert, Clock3, DoorOpen, Download, FileDown, GraduationCap, Info, Layers3, LayoutDashboard,
  LoaderCircle, Menu, Pencil, Plus, Printer, RotateCcw, Search, Settings2, Sparkles, Trash2, Upload, Users,
  UserRound, X,
} from 'lucide-react'
import {
  blankData, csvCell, DAYS, DEFAULT_PREFERENCES, generateSchedule, minutes, newId, requiredSessions,
  timeLabel, validateSchedule,
  type Classroom, type Conflict, type Faculty, type GroupRequirement, type PlannerData,
  type ScheduleEntry, type StudentGroup, type Subject, type TimeWindow,
} from './domain'

type Page = 'dashboard' | 'groups' | 'faculty' | 'subjects' | 'rooms' | 'windows' | 'constraints' | 'generate' | 'timetable' | 'conflicts' | 'math' | 'about'
type Entity = StudentGroup | Subject | Faculty | Classroom | TimeWindow
type EntityKind = 'group' | 'faculty' | 'subject' | 'room' | 'window'
type Draft = {
  id: string; name: string; code: string; department: string; year: string; section: string
  students: number; requirements: GroupRequirement[]; semester: string; facultyIds: string[]; groupIds: string[]
  sessionsPerWeek: number; duration: number; practical: boolean; facultyCode: string; subjectIds: string[]
  availableDays: string[]; availableSlotIds: string[]; unavailableSlotIds: string[]; maxPerDay: number; maxPerWeek: number
  building: string; type: string; capacity: number; equipment: string
  day: string; start: string; end: string; isBreak: boolean; label: string
}
type ScheduleFilters = { groupId: string; facultyId: string; subjectId: string; roomId: string; day: string; department: string; year: string }
type TimetableSnapshot = { schedule: ScheduleEntry[]; groups: StudentGroup[] }

const PAGE_LABELS: Record<Page, string> = {
  dashboard: 'Dashboard', groups: 'Manage Classes', faculty: 'Manage Faculty', subjects: 'Manage Subjects',
  rooms: 'Manage Classrooms', windows: 'Manage Time Slots', constraints: 'Scheduling Constraints',
  generate: 'Generate Timetable', timetable: 'View & Edit Timetable', conflicts: 'Conflict Report',
  math: 'Discrete Mathematics', about: 'About the Project',
}
const NAV_ITEMS: Array<{ id: Page; icon: typeof LayoutDashboard; group: string }> = [
  { id: 'dashboard', icon: LayoutDashboard, group: 'Workspace' },
  { id: 'groups', icon: Users, group: 'Workspace' },
  { id: 'faculty', icon: UserRound, group: 'Workspace' },
  { id: 'subjects', icon: BookOpen, group: 'Workspace' },
  { id: 'rooms', icon: DoorOpen, group: 'Workspace' },
  { id: 'windows', icon: Clock3, group: 'Workspace' },
  { id: 'constraints', icon: Settings2, group: 'Planning' },
  { id: 'generate', icon: Sparkles, group: 'Planning' },
  { id: 'timetable', icon: CalendarDays, group: 'Planning' },
  { id: 'conflicts', icon: CircleAlert, group: 'Planning' },
  { id: 'math', icon: Layers3, group: 'Learn' },
  { id: 'about', icon: Info, group: 'Learn' },
]
const KINDS: Record<Exclude<Page, 'dashboard' | 'constraints' | 'generate' | 'timetable' | 'conflicts' | 'math' | 'about'>, EntityKind> = {
  groups: 'group', faculty: 'faculty', subjects: 'subject', rooms: 'room', windows: 'window',
}
const kindTitles: Record<EntityKind, string> = { group: 'Class or student group', faculty: 'Faculty member', subject: 'Subject', room: 'Classroom', window: 'Time window' }

function emptyDraft(_kind: EntityKind, data: PlannerData): Draft {
  const day = data.windows[0]?.day ?? 'Monday'
  return {
    id: newId(), name: '', code: '', department: '', year: '', section: '', students: 30, requirements: [],
    semester: '', facultyIds: [], groupIds: [], sessionsPerWeek: 3, duration: 60, practical: false, facultyCode: '',
    subjectIds: [], availableDays: [], availableSlotIds: [], unavailableSlotIds: [], maxPerDay: 5, maxPerWeek: 25,
    building: '', type: 'Lecture room', capacity: 40, equipment: '', day, start: '09:00', end: '10:00',
    isBreak: false, label: '',
  }
}

function draftFrom(kind: EntityKind, entity: Entity): Draft {
  const draft = emptyDraft(kind, blankData())
  if (kind === 'group') return { ...draft, ...(entity as StudentGroup), requirements: [...(entity as StudentGroup).requirements] }
  if (kind === 'subject') return { ...draft, ...(entity as Subject), facultyIds: [...(entity as Subject).facultyIds], groupIds: [...(entity as Subject).groupIds] }
  if (kind === 'faculty') return {
    ...draft, ...(entity as Faculty), subjectIds: [...(entity as Faculty).subjectIds], availableDays: [...(entity as Faculty).availableDays],
    availableSlotIds: [...(entity as Faculty).availableSlotIds], unavailableSlotIds: [...(entity as Faculty).unavailableSlotIds],
  }
  if (kind === 'room') return { ...draft, ...(entity as Classroom), availableDays: [...(entity as Classroom).availableDays], availableSlotIds: [...(entity as Classroom).availableSlotIds] }
  return { ...draft, ...(entity as TimeWindow) }
}

function labelFor(kind: EntityKind, value: Entity, _data: PlannerData): string {
  if (kind === 'group') {
    const item = value as StudentGroup
    return [item.name, item.department, item.year, item.section].filter(Boolean).join(' · ')
  }
  if (kind === 'faculty') return (value as Faculty).name
  if (kind === 'subject') return `${(value as Subject).name} · ${(value as Subject).code}`
  if (kind === 'room') return `${(value as Classroom).name} · ${(value as Classroom).type}`
  const item = value as TimeWindow
  return `${item.day} · ${timeLabel(item.start)}–${timeLabel(item.end)}${item.isBreak ? ' · Break' : ''}`
}

function displayName(id: string, values: Array<{ id: string; name: string }>, fallback = 'Not selected'): string {
  return values.find(value => value.id === id)?.name ?? fallback
}

function exportFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function Button({ children, onClick, variant = 'secondary', disabled = false, title, className = '', type = 'button' }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; title?: string; className?: string; type?: 'button' | 'submit'
}) {
  return <button type={type} className={`button button-${variant} ${className}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>
}

function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function EntityEditor({ kind, draft: initial, data, isEditing, onSave, onClose }: {
  kind: EntityKind; draft: Draft; data: PlannerData; isEditing: boolean; onSave: (draft: Draft) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }))
  const toggle = (key: 'facultyIds' | 'groupIds' | 'subjectIds' | 'availableDays' | 'availableSlotIds' | 'unavailableSlotIds', id: string) => {
    const current = draft[key]
    update(key, (current.includes(id) ? current.filter(item => item !== id) : [...current, id]) as Draft[typeof key])
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const name = kind === 'window' ? draft.label || draft.day : draft.name
    if (!name.trim()) return setError('Enter a name to continue.')
    if (kind === 'window' && minutes(draft.end) <= minutes(draft.start)) return setError('The end time must be after the start time.')
    if (kind === 'group' && draft.students < 1) return setError('Student count must be at least 1.')
    if (kind === 'room' && draft.capacity < 1) return setError('Room capacity must be at least 1.')
    if (kind === 'subject' && (draft.sessionsPerWeek < 1 || draft.duration < 1)) return setError('Sessions and duration must be at least 1.')
    setError('')
    onSave(draft)
  }
  const options = (items: Array<{ id: string; name: string }>, key: 'facultyIds' | 'groupIds' | 'subjectIds' | 'availableSlotIds' | 'unavailableSlotIds', current: string[]) =>
    <div className="check-list">{items.length ? items.map(item => <label key={item.id} className="check-row"><input type="checkbox" checked={current.includes(item.id)} onChange={() => toggle(key, item.id)} />{item.name}</label>) : <span className="muted">Add records first to link them here.</span>}</div>
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <form className="modal entity-modal" onSubmit={submit}>
      <div className="modal-heading"><div><span className="eyebrow">Manage your data</span><h2>{isEditing ? 'Edit' : 'Add'} {kindTitles[kind]}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      <div className="form-grid">
        {kind === 'group' && <>
          <FormField label="Group name"><input value={draft.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Group A" required /></FormField>
          <FormField label="Department"><input value={draft.department} onChange={e => update('department', e.target.value)} placeholder="Department" /></FormField>
          <FormField label="Year or semester"><input value={draft.year} onChange={e => update('year', e.target.value)} placeholder="e.g. Year 2" /></FormField>
          <FormField label="Section"><input value={draft.section} onChange={e => update('section', e.target.value)} placeholder="Optional" /></FormField>
          <FormField label="Number of students"><input type="number" min="1" value={draft.students} onChange={e => update('students', Number(e.target.value))} /></FormField>
          <div className="wide-field"><span className="field-title">Required subjects and weekly sessions</span>
            {data.subjects.length ? <div className="requirement-list">{data.subjects.map(subject => {
              const requirement = draft.requirements.find(item => item.subjectId === subject.id)
              return <div className="requirement-row" key={subject.id}><label><input type="checkbox" checked={Boolean(requirement)} onChange={event => update('requirements', event.target.checked ? [...draft.requirements, { subjectId: subject.id, sessions: subject.sessionsPerWeek }] : draft.requirements.filter(item => item.subjectId !== subject.id))} />{subject.name}</label>{requirement && <input aria-label={`Sessions of ${subject.name}`} type="number" min="1" value={requirement.sessions} onChange={event => update('requirements', draft.requirements.map(item => item.subjectId === subject.id ? { ...item, sessions: Math.max(1, Number(event.target.value)) } : item))} />}</div>
            })}</div> : <p className="muted">Create subjects first, then add them to this group.</p>}
          </div>
        </>}
        {kind === 'faculty' && <>
          <FormField label="Faculty name"><input value={draft.name} onChange={e => update('name', e.target.value)} required /></FormField>
          <FormField label="Faculty ID"><input value={draft.facultyCode} onChange={e => update('facultyCode', e.target.value)} placeholder="Optional" /></FormField>
          <FormField label="Department"><input value={draft.department} onChange={e => update('department', e.target.value)} /></FormField>
          <div className="wide-field"><span className="field-title">Qualified subjects</span>{options(data.subjects, 'subjectIds', draft.subjectIds)}</div>
          <div className="wide-field"><span className="field-title">Available days <small>(none selected means any configured day)</small></span><div className="check-list check-inline">{DAYS.map(day => <label className="check-row" key={day}><input type="checkbox" checked={draft.availableDays.includes(day)} onChange={() => toggle('availableDays', day)} />{day.slice(0, 3)}</label>)}</div></div>
          <FormField label="Max sessions per day"><input type="number" min="1" value={draft.maxPerDay} onChange={e => update('maxPerDay', Number(e.target.value))} /></FormField>
          <FormField label="Max sessions per week"><input type="number" min="1" value={draft.maxPerWeek} onChange={e => update('maxPerWeek', Number(e.target.value))} /></FormField>
          <div className="wide-field"><span className="field-title">Available time windows <small>(none selected means all non-break windows)</small></span>{options(data.windows.filter(window => !window.isBreak).map(window => ({ id: window.id, name: `${window.day} ${window.start}–${window.end}` })), 'availableSlotIds', draft.availableSlotIds)}</div>
          <div className="wide-field"><span className="field-title">Unavailable time windows</span>{options(data.windows.filter(window => !window.isBreak).map(window => ({ id: window.id, name: `${window.day} ${window.start}–${window.end}` })), 'unavailableSlotIds', draft.unavailableSlotIds)}</div>
        </>}
        {kind === 'subject' && <>
          <FormField label="Subject name"><input value={draft.name} onChange={e => update('name', e.target.value)} required /></FormField>
          <FormField label="Subject code"><input value={draft.code} onChange={e => update('code', e.target.value)} placeholder="Optional" /></FormField>
          <FormField label="Department"><input value={draft.department} onChange={e => update('department', e.target.value)} /></FormField>
          <FormField label="Semester"><input value={draft.semester} onChange={e => update('semester', e.target.value)} /></FormField>
          <FormField label="Sessions per week"><input type="number" min="1" value={draft.sessionsPerWeek} onChange={e => update('sessionsPerWeek', Number(e.target.value))} /></FormField>
          <FormField label="Duration (minutes)"><input type="number" min="1" value={draft.duration} onChange={e => update('duration', Number(e.target.value))} /></FormField>
          <label className="check-row wide-field"><input type="checkbox" checked={draft.practical} onChange={e => update('practical', e.target.checked)} />Requires a laboratory room</label>
          <div className="wide-field"><span className="field-title">Eligible faculty</span>{options(data.faculty, 'facultyIds', draft.facultyIds)}</div>
          <div className="wide-field"><span className="field-title">Student groups studying this subject</span>{options(data.groups, 'groupIds', draft.groupIds)}</div>
        </>}
        {kind === 'room' && <>
          <FormField label="Room name or number"><input value={draft.name} onChange={e => update('name', e.target.value)} required /></FormField>
          <FormField label="Building or department"><input value={draft.building} onChange={e => update('building', e.target.value)} /></FormField>
          <FormField label="Room type"><select value={draft.type} onChange={e => update('type', e.target.value)}><option>Lecture room</option><option>Laboratory</option><option>Seminar room</option><option>Other</option></select></FormField>
          <FormField label="Seating capacity"><input type="number" min="1" value={draft.capacity} onChange={e => update('capacity', Number(e.target.value))} /></FormField>
          <FormField label="Equipment or facilities"><input value={draft.equipment} onChange={e => update('equipment', e.target.value)} placeholder="Optional" /></FormField>
          <div className="wide-field"><span className="field-title">Available days <small>(none selected means any configured day)</small></span><div className="check-list check-inline">{DAYS.map(day => <label className="check-row" key={day}><input type="checkbox" checked={draft.availableDays.includes(day)} onChange={() => toggle('availableDays', day)} />{day.slice(0, 3)}</label>)}</div></div>
          <div className="wide-field"><span className="field-title">Available time windows <small>(none selected means all non-break windows)</small></span>{options(data.windows.filter(window => !window.isBreak).map(window => ({ id: window.id, name: `${window.day} ${window.start}–${window.end}` })), 'availableSlotIds', draft.availableSlotIds)}</div>
        </>}
        {kind === 'window' && <>
          <FormField label="Working day"><select value={draft.day} onChange={e => update('day', e.target.value)}>{DAYS.map(day => <option key={day}>{day}</option>)}</select></FormField>
          <FormField label="Label"><input value={draft.label} onChange={e => update('label', e.target.value)} placeholder="e.g. Morning period" /></FormField>
          <FormField label="Start time"><input type="time" value={draft.start} onChange={e => update('start', e.target.value)} required /></FormField>
          <FormField label="End time"><input type="time" value={draft.end} onChange={e => update('end', e.target.value)} required /></FormField>
          <label className="check-row wide-field"><input type="checkbox" checked={draft.isBreak} onChange={e => update('isBreak', e.target.checked)} />Break or lunch (never scheduled)</label>
          <p className="wide-field subtle-note">Each time window is a user-configured scheduling period. A session must fit fully inside its window; break windows are excluded.</p>
        </>}
      </div>
      {error && <div className="form-error"><CircleAlert size={16} />{error}</div>}
      <div className="modal-actions"><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit">{isEditing ? 'Save changes' : 'Add record'}</Button></div>
    </form>
  </div>
}

function EntryEditor({ entry, data, onClose, onSave }: {
  entry: ScheduleEntry; data: PlannerData; onClose: () => void; onSave: (entry: ScheduleEntry, keepDraft: boolean) => void
}) {
  const [draft, setDraft] = useState(entry)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [forceDraft, setForceDraft] = useState(false)
  const change = <K extends keyof ScheduleEntry>(key: K, value: ScheduleEntry[K]) => setDraft(current => ({ ...current, [key]: value }))
  const subject = data.subjects.find(item => item.id === draft.subjectId)
  const group = data.groups.find(item => item.id === draft.groupId)
  const duration = draft.durationOverride ?? subject?.duration ?? 0
  const windows = data.windows.filter(window => !window.isBreak && window.day === draft.day && minutes(window.end) - minutes(window.start) >= duration)
  const faculty = data.faculty.filter(person => subject && (!subject.facultyIds.length || subject.facultyIds.includes(person.id)) && person.subjectIds.includes(subject.id))
  const rooms = data.rooms.filter(room => group && subject && room.capacity >= group.students && (!subject.practical || room.type.toLowerCase().includes('lab')))
  const issueKey = (issue: Conflict) => `${issue.type}|${issue.message}|${issue.day ?? ''}|${issue.start ?? ''}|${issue.end ?? ''}`
  const baselineIssues = validateSchedule(data.schedule, data)
  const alternatives = conflicts.length && subject
    ? data.windows.filter(window => !window.isBreak && minutes(window.end) - minutes(window.start) >= duration)
      .map(window => {
        const endMinutes = minutes(window.start) + duration
        return {
          ...draft,
          windowId: window.id,
          day: window.day,
          start: window.start,
          end: `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`,
        }
      })
      .filter(candidate => candidate.windowId !== draft.windowId || candidate.day !== draft.day)
      .filter(candidate => {
        const validation = validateSchedule(data.schedule.map(item => item.id === entry.id ? candidate : item), data)
        return !validation.some(issue =>
          issue.entryIds.includes(entry.id) || !baselineIssues.some(existing => issueKey(existing) === issueKey(issue)),
        )
      })
      .slice(0, 3)
    : []
  const save = (event: React.FormEvent) => {
    event.preventDefault()
    const selectedWindow = data.windows.find(window => window.id === draft.windowId)
    const start = selectedWindow?.start ?? draft.start
    const selectedDuration = draft.durationOverride ?? subject?.duration ?? 0
    const end = `${String(Math.floor((minutes(start) + selectedDuration) / 60)).padStart(2, '0')}:${String((minutes(start) + selectedDuration) % 60).padStart(2, '0')}`
    const changed = { ...draft, day: selectedWindow?.day ?? draft.day, start, end, durationOverride: draft.durationOverride === subject?.duration ? undefined : draft.durationOverride }
    const nextSchedule = data.schedule.map(item => item.id === entry.id ? changed : item)
    const nextConflicts = validateSchedule(nextSchedule, data).filter(conflict =>
      conflict.entryIds.includes(entry.id) || !baselineIssues.some(existing => issueKey(existing) === issueKey(conflict)),
    )
    setConflicts(nextConflicts)
    if (!nextConflicts.length || forceDraft) onSave(changed, nextConflicts.length > 0)
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <form className="modal" onSubmit={save}>
      <div className="modal-heading"><div><span className="eyebrow">Timetable session</span><h2>Edit session</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      <div className="form-grid">
        <FormField label="Student group"><select value={draft.groupId} onChange={event => change('groupId', event.target.value)}>{data.groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
        <FormField label="Subject"><select value={draft.subjectId} onChange={event => change('subjectId', event.target.value)}>{data.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
        <FormField label="Faculty"><select value={draft.facultyId} onChange={event => change('facultyId', event.target.value)}>{faculty.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
        <FormField label="Classroom"><select value={draft.roomId} onChange={event => change('roomId', event.target.value)}>{rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
        <FormField label="Day"><select value={draft.day} onChange={event => { const day = event.target.value; change('day', day); const first = data.windows.find(window => window.day === day && !window.isBreak && minutes(window.end) - minutes(window.start) >= duration); if (first) change('windowId', first.id) }}>{DAYS.filter(day => data.windows.some(window => window.day === day && !window.isBreak)).map(day => <option key={day}>{day}</option>)}</select></FormField>
        <FormField label="Time window"><select value={draft.windowId} onChange={event => change('windowId', event.target.value)}>{windows.map(item => <option key={item.id} value={item.id}>{item.label || `${item.start}–${item.end}`}</option>)}</select></FormField>
        <FormField label="Session duration (minutes)"><input type="number" min="1" value={duration} onChange={event => change('durationOverride', Math.max(1, Number(event.target.value)))} /></FormField>
      </div>
      {subject && <p className="subtle-note">Session duration follows the subject requirement: {subject.duration} minutes.</p>}
      {conflicts.length > 0 && <div className="form-error conflict-list"><strong>This change has {conflicts.length} conflict(s).</strong>{conflicts.map((item, index) => <p key={`${item.type}-${index}`}>{item.type}: {item.message}</p>)}{alternatives.length ? <div className="alternative-list"><b>Available alternatives</b>{alternatives.map(option => <Button key={option.windowId} variant="secondary" onClick={() => { setDraft(option); setConflicts([]); setForceDraft(false) }}>{option.day} · {timeLabel(option.start)}–{timeLabel(option.end)}</Button>)}</div> : <p>No conflict-free alternative time windows are currently available.</p>}<p>Cancel to discard the change, or keep it explicitly as a conflicting draft.</p></div>}
      {conflicts.length > 0 && <label className="check-row"><input type="checkbox" checked={forceDraft} onChange={event => setForceDraft(event.target.checked)} />Keep this change as a conflicting draft</label>}
      <div className="modal-actions"><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit">Validate & save</Button></div>
    </form>
  </div>
}

function App() {
  const [data, setData] = useState<PlannerData>(() => blankData())
  const [page, setPage] = useState<Page>('dashboard')
  const [editing, setEditing] = useState<{ kind: EntityKind; draft: Draft } | null>(null)
  const [entryEditing, setEntryEditing] = useState<ScheduleEntry | null>(null)
  const [addSession, setAddSession] = useState(false)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [undoStack, setUndoStack] = useState<TimetableSnapshot[]>([])
  const [filters, setFilters] = useState<ScheduleFilters>({ groupId: '', facultyId: '', subjectId: '', roomId: '', day: '', department: '', year: '' })
  const [viewMode, setViewMode] = useState<'weekly' | 'daily' | 'class' | 'faculty' | 'room' | 'department'>('weekly')
  const importRef = useRef<HTMLInputElement>(null)
  const dataRef = useRef(data)

  useEffect(() => { dataRef.current = data }, [data])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('relations-timetable-data-v1')
      if (saved) {
        const parsed = JSON.parse(saved) as PlannerData
        if (Array.isArray(parsed.groups) && Array.isArray(parsed.subjects) && Array.isArray(parsed.faculty) &&
            Array.isArray(parsed.rooms) && Array.isArray(parsed.windows) && Array.isArray(parsed.schedule)) setData(parsed)
        else setError('Saved browser data could not be recognized. It has not been replaced.')
      }
    } catch {
      setError('Saved browser data could not be read. Exported backups are not affected.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem('relations-timetable-data-v1', JSON.stringify(data))
    } catch {
      setError('Could not save to this browser. Export a JSON backup and check available browser storage.')
    }
  }, [data, loaded])

  const conflicts = useMemo(() => validateSchedule(data.schedule, data), [data.schedule, data])
  const mandatoryConflicts = conflicts.length
  const sessions = requiredSessions(data)
  const scheduledSessions = new Set(data.schedule.map(entry => entry.sessionKey)).size
  const unscheduledCount = Math.max(0, sessions.length - scheduledSessions)
  const stats = [
    { label: 'Student groups', value: data.groups.length, icon: Users, color: 'lavender' },
    { label: 'Faculty members', value: data.faculty.length, icon: UserRound, color: 'blue' },
    { label: 'Subjects', value: data.subjects.length, icon: BookOpen, color: 'pink' },
    { label: 'Classrooms', value: data.rooms.length, icon: DoorOpen, color: 'mint' },
    { label: 'Time windows', value: data.windows.filter(item => !item.isBreak).length, icon: Clock3, color: 'peach' },
    { label: 'Scheduled sessions', value: scheduledSessions, icon: CalendarDays, color: 'blue' },
    { label: 'Unscheduled sessions', value: unscheduledCount, icon: ArrowLeftRight, color: unscheduledCount ? 'peach' : 'mint' },
    { label: 'Detected conflicts', value: mandatoryConflicts, icon: CircleAlert, color: mandatoryConflicts ? 'pink' : 'mint' },
  ]

  const itemsForPage = (selectedPage: Page): Entity[] => {
    if (selectedPage === 'groups') return data.groups
    if (selectedPage === 'faculty') return data.faculty
    if (selectedPage === 'subjects') return data.subjects
    if (selectedPage === 'rooms') return data.rooms
    if (selectedPage === 'windows') return data.windows
    return []
  }
  const saveEntity = (kind: EntityKind, draft: Draft) => {
    const existing = itemsForPage(({ group: 'groups', faculty: 'faculty', subject: 'subjects', room: 'rooms', window: 'windows' } as const)[kind]).some(item => item.id === draft.id)
    setData(current => {
      let next: PlannerData
      if (kind === 'group') {
        const value: StudentGroup = { id: draft.id, name: draft.name.trim(), department: draft.department.trim(), year: draft.year.trim(), section: draft.section.trim(), students: draft.students, requirements: draft.requirements.filter(item => item.sessions > 0) }
        next = { ...current, groups: existing ? current.groups.map(item => item.id === value.id ? value : item) : [...current.groups, value] }
        next = { ...next, subjects: next.subjects.map(subject => ({ ...subject, groupIds: value.requirements.some(req => req.subjectId === subject.id) ? [...new Set([...subject.groupIds, value.id])] : subject.groupIds.filter(id => id !== value.id) })) }
      } else if (kind === 'subject') {
        const value: Subject = { id: draft.id, name: draft.name.trim(), code: draft.code.trim(), department: draft.department.trim(), semester: draft.semester.trim(), facultyIds: draft.facultyIds, groupIds: draft.groupIds, sessionsPerWeek: draft.sessionsPerWeek, duration: draft.duration, practical: draft.practical }
        next = { ...current, subjects: existing ? current.subjects.map(item => item.id === value.id ? value : item) : [...current.subjects, value] }
        next = { ...next, faculty: next.faculty.map(person => ({ ...person, subjectIds: value.facultyIds.includes(person.id) ? [...new Set([...person.subjectIds, value.id])] : person.subjectIds.filter(id => id !== value.id) })) }
        next = { ...next, groups: next.groups.map(group => {
          const requirement = group.requirements.find(item => item.subjectId === value.id)
          if (value.groupIds.includes(group.id) && !requirement) return { ...group, requirements: [...group.requirements, { subjectId: value.id, sessions: value.sessionsPerWeek }] }
          if (!value.groupIds.includes(group.id) && requirement) return { ...group, requirements: group.requirements.filter(item => item.subjectId !== value.id) }
          return group
        }) }
      } else if (kind === 'faculty') {
        const value: Faculty = { id: draft.id, name: draft.name.trim(), facultyCode: draft.facultyCode.trim(), department: draft.department.trim(), subjectIds: draft.subjectIds, availableDays: draft.availableDays, availableSlotIds: draft.availableSlotIds, unavailableSlotIds: draft.unavailableSlotIds, maxPerDay: draft.maxPerDay, maxPerWeek: draft.maxPerWeek }
        next = { ...current, faculty: existing ? current.faculty.map(item => item.id === value.id ? value : item) : [...current.faculty, value] }
        next = { ...next, subjects: next.subjects.map(subject => ({ ...subject, facultyIds: value.subjectIds.includes(subject.id) ? [...new Set([...subject.facultyIds, value.id])] : subject.facultyIds.filter(id => id !== value.id) })) }
      } else if (kind === 'room') {
        const value: Classroom = { id: draft.id, name: draft.name.trim(), building: draft.building.trim(), type: draft.type, capacity: draft.capacity, equipment: draft.equipment.trim(), availableDays: draft.availableDays, availableSlotIds: draft.availableSlotIds }
        next = { ...current, rooms: existing ? current.rooms.map(item => item.id === value.id ? value : item) : [...current.rooms, value] }
      } else {
        const value: TimeWindow = { id: draft.id, day: draft.day, start: draft.start, end: draft.end, isBreak: draft.isBreak, label: draft.label.trim() }
        next = { ...current, windows: existing ? current.windows.map(item => item.id === value.id ? value : item) : [...current.windows, value] }
      }
      return next
    })
    setUndoStack([])
    setEditing(null)
    setMessage(`${kindTitles[kind]} ${existing ? 'updated' : 'added'}.`)
  }

  const deleteEntity = (kind: EntityKind, id: string) => {
    if (!window.confirm('Delete this record? Linked schedule entries may become invalid.')) return
    setData(current => {
      if (kind === 'group') return { ...current, groups: current.groups.filter(item => item.id !== id), subjects: current.subjects.map(item => ({ ...item, groupIds: item.groupIds.filter(groupId => groupId !== id) })) }
      if (kind === 'subject') return { ...current, subjects: current.subjects.filter(item => item.id !== id), groups: current.groups.map(item => ({ ...item, requirements: item.requirements.filter(req => req.subjectId !== id) })), faculty: current.faculty.map(item => ({ ...item, subjectIds: item.subjectIds.filter(subjectId => subjectId !== id) })) }
      if (kind === 'faculty') return { ...current, faculty: current.faculty.filter(item => item.id !== id), subjects: current.subjects.map(item => ({ ...item, facultyIds: item.facultyIds.filter(facultyId => facultyId !== id) })) }
      if (kind === 'room') return { ...current, rooms: current.rooms.filter(item => item.id !== id) }
      return { ...current, windows: current.windows.filter(item => item.id !== id), faculty: current.faculty.map(item => ({ ...item, availableSlotIds: item.availableSlotIds.filter(slotId => slotId !== id), unavailableSlotIds: item.unavailableSlotIds.filter(slotId => slotId !== id) })), rooms: current.rooms.map(item => ({ ...item, availableSlotIds: item.availableSlotIds.filter(slotId => slotId !== id) })) }
    })
    setUndoStack([])
    setMessage('Record deleted. Recheck the timetable for affected assignments.')
  }

  const addOrUpdateEntry = (entry: ScheduleEntry, keepDraft: boolean) => {
    setUndoStack(stack => [...stack, { schedule: data.schedule, groups: data.groups }])
    setData(current => ({ ...current, schedule: current.schedule.map(item => item.id === entry.id ? entry : item) }))
    setEntryEditing(null)
    setMessage(keepDraft ? 'Conflicting draft retained. Resolve the reported conflicts before treating the timetable as valid.' : 'Session updated and validated.')
  }
  const removeEntry = (entry: ScheduleEntry) => {
    if (!window.confirm('Remove this scheduled session? Its requirement will appear as unscheduled.')) return
    setUndoStack(stack => [...stack, { schedule: data.schedule, groups: data.groups }])
    setData(current => ({ ...current, schedule: current.schedule.filter(item => item.id !== entry.id) }))
    setMessage('Session removed. The requirement is now listed as unscheduled.')
  }
  const undo = () => {
    const previous = undoStack[undoStack.length - 1]
    if (!previous) return
    setData(current => ({ ...current, schedule: previous.schedule, groups: previous.groups }))
    setUndoStack(stack => stack.slice(0, -1))
    setMessage('Last timetable edit undone.')
  }
  const runGeneration = () => {
    if (isGenerating) return
    setError('')
    setMessage('')
    setIsGenerating(true)
    window.setTimeout(() => {
      const currentData = dataRef.current
      const result = generateSchedule(currentData)
      if (!result.schedule) {
        setError(`Could not generate a complete timetable. ${result.reason}`)
        setIsGenerating(false)
        return
      }
      const found = validateSchedule(result.schedule, currentData)
      if (found.length) {
        setError(`The scheduler produced assignments that did not pass validation (${found.length} issue(s)). The previous timetable was kept.`)
        setIsGenerating(false)
        return
      }
      setUndoStack(stack => [...stack, { schedule: currentData.schedule, groups: currentData.groups }])
      setData(current => ({ ...current, schedule: result.schedule! }))
      setMessage(`Timetable generated and validated: ${result.schedule.length} required sessions placed in ${result.nodes.toLocaleString()} search steps.`)
      setPage('timetable')
      setIsGenerating(false)
    }, 80)
  }
  const saveEntryAddition = (groupId: string, subjectId: string, facultyId: string, roomId: string, windowId: string) => {
    const group = data.groups.find(item => item.id === groupId)
    const subject = data.subjects.find(item => item.id === subjectId)
    const faculty = data.faculty.find(item => item.id === facultyId)
    const room = data.rooms.find(item => item.id === roomId)
    const timeWindow = data.windows.find(item => item.id === windowId)
    if (!group || !subject || !faculty || !room || !timeWindow) return setError('Choose an existing group, subject, faculty member, room, and time window.')
    const sessions = group.requirements.find(item => item.subjectId === subject.id)?.sessions ?? 0
    const key = `${group.id}:${subject.id}:${sessions + 1}`
    const endMinutes = minutes(timeWindow.start) + subject.duration
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
    const entry: ScheduleEntry = { id: newId(), sessionKey: key, groupId, subjectId, facultyId, roomId, windowId, day: timeWindow.day, start: timeWindow.start, end, manual: true }
    const nextData = { ...data, groups: data.groups.map(item => item.id === groupId ? { ...item, requirements: [...item.requirements.filter(req => req.subjectId !== subjectId), { subjectId, sessions: sessions + 1 }] } : item), schedule: [...data.schedule, entry] }
    const issues = validateSchedule(nextData.schedule, nextData)
    if (issues.length) return setError(`Session was not added: ${issues[0].type}. ${issues[0].message}`)
    setUndoStack(stack => [...stack, { schedule: data.schedule, groups: data.groups }])
    setData(nextData)
    setAddSession(false)
    setError('')
    setMessage("New session added and validated; the group's weekly requirement was increased.")
  }

  const exportCsv = () => {
    const rows = [['Day', 'Start', 'End', 'Group', 'Department', 'Subject', 'Faculty', 'Classroom']]
    for (const entry of data.schedule) {
      const group = data.groups.find(item => item.id === entry.groupId)
      rows.push([entry.day, entry.start, entry.end, group?.name ?? '', group?.department ?? '', displayName(entry.subjectId, data.subjects), displayName(entry.facultyId, data.faculty), displayName(entry.roomId, data.rooms)])
    }
    exportFile('timetable.csv', rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8')
  }
  const exportConflicts = () => {
    const rows = [['Conflict type', 'Day', 'Start', 'End', 'Details', 'Suggested resolution'], ...conflicts.map(item => [item.type, item.day ?? '', item.start ?? '', item.end ?? '', item.message, item.resolution])]
    exportFile('conflict-report.csv', rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8')
  }
  const exportSummary = () => {
    const complete = data.schedule.length > 0 && conflicts.length === 0 && data.schedule.length === sessions.length
    const content = [
      'Conflict-Free College Timetable Generator Using Relations',
      'Scheduling summary',
      '',
      `Validation status: ${complete ? 'All required sessions scheduled; no mandatory conflicts detected.' : `${conflicts.length} validation issue(s) detected; no conflict-free completion is claimed.`}`,
      `Required sessions: ${sessions.length}`,
      `Scheduled entries: ${data.schedule.length}`,
      `Unscheduled requirements: ${unscheduledCount}`,
      `Detected conflicts: ${conflicts.length}`,
      `Student groups: ${data.groups.length}`,
      `Faculty members: ${data.faculty.length}`,
      `Subjects: ${data.subjects.length}`,
      `Classrooms: ${data.rooms.length}`,
      `Available time windows: ${data.windows.filter(item => !item.isBreak).length}`,
      '',
      'This summary reflects only the data saved in this browser at the time of export.',
    ].join('\r\n')
    exportFile('scheduling-summary.txt', content, 'text/plain;charset=utf-8')
  }
  const saveNow = () => {
    try {
      localStorage.setItem('relations-timetable-data-v1', JSON.stringify(data))
      setError('')
      setMessage('Changes saved in this browser.')
    } catch {
      setError('Could not save to this browser. Export a JSON backup and check available browser storage.')
    }
  }
  const importData = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object') throw new Error('The file is not a data object.')
      const candidate = parsed as Partial<PlannerData>
      if (!Array.isArray(candidate.groups) || !Array.isArray(candidate.subjects) || !Array.isArray(candidate.faculty) ||
          !Array.isArray(candidate.rooms) || !Array.isArray(candidate.windows) || !Array.isArray(candidate.schedule)) {
        throw new Error('The file is missing one or more required timetable data lists.')
      }
      setData({ ...blankData(), ...candidate, preferences: { ...DEFAULT_PREFERENCES, ...candidate.preferences } })
      setUndoStack([])
      setError('')
      setMessage('Data imported. Review the timetable and recheck its conflicts.')
    } catch (reason) {
      setError(`Import failed: ${reason instanceof Error ? reason.message : 'Invalid JSON data.'}`)
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }
  const reset = () => {
    if (!window.confirm('Permanently reset all data saved in this browser? Export a backup first if you need it.')) return
    setData(blankData())
    setUndoStack([])
    setError('')
    setMessage('Project data reset in this browser.')
  }

  const openEditor = (kind: EntityKind, value?: Entity) => setEditing({ kind, draft: value ? draftFrom(kind, value) : emptyDraft(kind, data) })
  const titleCasePage = PAGE_LABELS[page]
  const values = itemsForPage(page)
  const kind = page in KINDS ? KINDS[page as keyof typeof KINDS] : null
  const filteredValues = values.filter(item => labelFor(kind!, item, data).toLowerCase().includes(search.toLowerCase()))
  const filteredSchedule = data.schedule.filter(entry => {
    const group = data.groups.find(item => item.id === entry.groupId)
    return (!filters.groupId || entry.groupId === filters.groupId) &&
      (!filters.facultyId || entry.facultyId === filters.facultyId) &&
      (!filters.subjectId || entry.subjectId === filters.subjectId) &&
      (!filters.roomId || entry.roomId === filters.roomId) &&
      (!filters.day || entry.day === filters.day) &&
      (!filters.department || group?.department === filters.department) &&
      (!filters.year || group?.year === filters.year) &&
      (viewMode !== 'class' || Boolean(filters.groupId && entry.groupId === filters.groupId)) &&
      (viewMode !== 'faculty' || Boolean(filters.facultyId && entry.facultyId === filters.facultyId)) &&
      (viewMode !== 'room' || Boolean(filters.roomId && entry.roomId === filters.roomId)) &&
      (viewMode !== 'department' || Boolean(filters.department && group?.department === filters.department))
  })
  const entityInfo = (entity: Entity) => {
    if (kind === 'group') {
      const value = entity as StudentGroup
      return `${value.department || 'Department not set'} · ${value.year || 'Year not set'}${value.section ? ` · Section ${value.section}` : ''} · ${value.students} students · ${value.requirements.length} subjects`
    }
    if (kind === 'faculty') {
      const value = entity as Faculty
      return `${value.department || 'Department not set'} · ${value.subjectIds.map(id => displayName(id, data.subjects)).join(', ') || 'No qualified subjects linked'}`
    }
    if (kind === 'subject') {
      const value = entity as Subject
      return `${value.code || 'No code'} · ${value.department || 'Department not set'} · ${value.sessionsPerWeek} sessions/week · ${value.duration} min${value.practical ? ' · Lab required' : ''}`
    }
    if (kind === 'room') {
      const value = entity as Classroom
      return `${value.building || 'Building not set'} · ${value.type} · ${value.capacity} seats${value.equipment ? ` · ${value.equipment}` : ''}`
    }
    const value = entity as TimeWindow
    return `${value.label || 'Custom time window'} · ${timeLabel(value.start)}–${timeLabel(value.end)} · ${value.isBreak ? 'Break / lunch' : 'Available period'}`
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><CalendarDays size={21} /></div><div><strong>Relations</strong><small>Timetable Studio</small></div><button className="icon-button nav-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="workspace-badge"><span className="status-dot" />Personal workspace</div>
      {['Workspace', 'Planning', 'Learn'].map(group => <nav className="nav-group" key={group} aria-label={group}>
        <p className="nav-label">{group}</p>
        {NAV_ITEMS.filter(item => item.group === group).map(item => {
          const Icon = item.icon
          return <button key={item.id} className={`nav-item ${page === item.id ? 'nav-active' : ''}`} onClick={() => { setPage(item.id); setSearch(''); setMobileNav(false) }}><Icon size={17} strokeWidth={1.8} /><span>{PAGE_LABELS[item.id]}</span>{item.id === 'conflicts' && conflicts.length > 0 && <span className="nav-count">{conflicts.length}</span>}</button>
        })}
      </nav>)}
      <div className="sidebar-bottom"><div className="browser-note"><span className="mini-icon"><Check size={15} /></span><div><b>Saved in this browser</b><small>Your data stays on this device</small></div></div><button className="nav-item" onClick={() => setPage('about')}><Info size={17} />About this project</button></div>
    </aside>
    {mobileNav && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNav(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>Relations Studio</span><ChevronDown size={14} /><strong>{titleCasePage}</strong></div><div className="topbar-actions"><span className="autosave"><span className="status-dot" />Local autosave</span><Button variant="quiet" onClick={() => importRef.current?.click()}><Upload size={16} />Import data</Button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => void importData(event.target.files?.[0])} /></div></header>
      <div className="page-wrap">
        {error && <div className="alert alert-error"><CircleAlert size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={17} /></button></div>}
        {message && <div className="alert alert-success"><CheckCircle2 size={18} /><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss"><X size={17} /></button></div>}
        {page === 'dashboard' && <Dashboard data={data} stats={stats} conflicts={conflicts} onGo={setPage} onGenerate={runGeneration} />}
        {kind && <section>
          <div className="page-heading"><div><span className="eyebrow">Workspace data</span><h1>{titleCasePage}</h1><p>{kind === 'group' ? 'Define student groups and the subjects they need each week.' : kind === 'faculty' ? 'Add teaching qualifications, availability, and workload limits.' : kind === 'subject' ? 'Set each subject’s duration, weekly sessions, and resource needs.' : kind === 'room' ? 'Manage room types, seating capacity, facilities, and availability.' : 'Configure your own days, periods, and protected break times.'}</p></div><Button variant="primary" onClick={() => openEditor(kind)}><Plus size={17} />Add {kindTitles[kind]}</Button></div>
          {kind === 'subject' && <div className="inline-tip"><Info size={16} />Link both a faculty member to their qualified subjects and a subject to eligible faculty. Class requirements are configured on each group.</div>}
          <div className="list-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${titleCasePage.toLowerCase()}...`} /></div><span>{filteredValues.length} {filteredValues.length === 1 ? 'record' : 'records'}</span></div>
          {filteredValues.length ? <div className={`entity-grid entity-${kind}`}>{filteredValues.map(entity => <article className="entity-card" key={entity.id}><div className={`entity-symbol ${kind}`}><EntityIcon kind={kind} /></div><div className="entity-card-copy"><h3>{labelFor(kind, entity, data)}</h3><p>{entityInfo(entity)}</p></div><div className="entity-actions"><button className="icon-button" onClick={() => openEditor(kind, entity)} aria-label={`Edit ${labelFor(kind, entity, data)}`}><Pencil size={16} /></button><button className="icon-button delete-icon" onClick={() => deleteEntity(kind, entity.id)} aria-label={`Delete ${labelFor(kind, entity, data)}`}><Trash2 size={16} /></button></div></article>)}</div> : <EmptyState icon={<EntityIcon kind={kind} />} title={search ? 'No matching records' : `No ${titleCasePage.toLowerCase()} yet`} text={search ? 'Try another search term.' : 'Add your first record to start building a timetable from your own data.'} action={!search ? <Button variant="primary" onClick={() => openEditor(kind)}><Plus size={16} />Add {kindTitles[kind]}</Button> : undefined} />}
        </section>}
        {page === 'constraints' && <ConstraintsPage data={data} onChange={preferences => setData(current => ({ ...current, preferences }))} />}
        {page === 'generate' && <GeneratePage data={data} conflicts={conflicts} onGenerate={runGeneration} onGo={setPage} isGenerating={isGenerating} />}
        {page === 'timetable' && <TimetablePage data={data} filters={filters} setFilters={setFilters} viewMode={viewMode} setViewMode={setViewMode} entries={filteredSchedule} conflicts={conflicts} onEdit={setEntryEditing} onDelete={removeEntry} onAdd={() => setAddSession(true)} onUndo={undo} canUndo={undoStack.length > 0} onExport={exportCsv} onSummary={exportSummary} onSave={saveNow} onPrint={() => window.print()} />}
        {page === 'conflicts' && <ConflictsPage conflicts={conflicts} data={data} onRecheck={() => { setMessage(conflicts.length ? `Recheck complete: ${conflicts.length} issue(s) detected.` : 'Timetable Successfully Generated — No Mandatory Scheduling Conflicts Detected.'); setError('') }} onExport={exportConflicts} onGo={setPage} />}
        {page === 'math' && <MathPage data={data} />}
        {page === 'about' && <AboutPage data={data} onExport={() => exportFile('timetable-project-data.json', JSON.stringify(data, null, 2), 'application/json')} onImport={() => importRef.current?.click()} onReset={reset} />}
      </div>
      <footer className="app-footer"><span>Conflict-Free College Timetable Generator Using Relations</span><span>Discrete Mathematics · Browser-based workspace</span></footer>
    </main>
    {editing && <EntityEditor kind={editing.kind} draft={editing.draft} data={data} isEditing={Boolean(itemsForPage(({ group: 'groups', faculty: 'faculty', subject: 'subjects', room: 'rooms', window: 'windows' } as const)[editing.kind]).some(item => item.id === editing.draft.id))} onSave={draft => saveEntity(editing.kind, draft)} onClose={() => setEditing(null)} />}
    {entryEditing && <EntryEditor entry={entryEditing} data={data} onClose={() => setEntryEditing(null)} onSave={addOrUpdateEntry} />}
    {addSession && <AddSessionModal data={data} onClose={() => setAddSession(false)} onAdd={saveEntryAddition} />}
  </div>
}

function EntityIcon({ kind }: { kind: EntityKind }) {
  const Icon = kind === 'group' ? Users : kind === 'faculty' ? UserRound : kind === 'subject' ? BookOpen : kind === 'room' ? DoorOpen : Clock3
  return <Icon size={19} />
}

function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>
}

function Dashboard({ data, stats, conflicts, onGo, onGenerate }: {
  data: PlannerData; stats: Array<{ label: string; value: number; icon: typeof Users; color: string }>; conflicts: Conflict[]; onGo: (page: Page) => void; onGenerate: () => void
}) {
  const recent = [...data.schedule].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start)).slice(0, 4)
  const validated = data.schedule.length > 0 && conflicts.length === 0 && data.schedule.length === requiredSessions(data).length
  return <>
    <section className="welcome-panel"><div className="welcome-orb orb-one" /><div className="welcome-orb orb-two" /><div className="welcome-content"><span className="eyebrow">YOUR ACADEMIC PLANNER</span><h1>Plan a better week,<br /><span>one relation at a time.</span></h1><p>Bring your classes, faculty, rooms, and availability together in one thoughtfully designed workspace.</p><div className="welcome-actions"><Button variant="primary" onClick={onGenerate}><Sparkles size={16} />Generate timetable</Button><Button className="welcome-secondary" onClick={() => onGo('timetable')}><CalendarDays size={16} />View timetable</Button></div></div><div className="welcome-illustration"><div className="illustration-sheet"><div className="sheet-heading"><span /><span /><span /></div><div className="sheet-line" /><div className="sheet-row"><i /><i /><i /></div><div className="sheet-row"><i /><i /><i /></div><div className="sheet-row"><i /><i /><i /></div><div className="sheet-row"><i /><i /><i /></div></div><span className="float-tag tag-mint"><CheckCircle2 size={15} />{validated ? 'Validated' : 'Ready to plan'}</span><span className="float-tag tag-peach"><Sparkles size={14} />Constraint-aware</span></div></section>
    <div className="section-title-row"><div><span className="eyebrow">AT A GLANCE</span><h2>Your planning overview</h2></div><button className="text-link" onClick={() => onGo('groups')}>Manage data <ArrowDownToLine size={15} /></button></div>
    <div className="stats-grid">{stats.map(item => { const Icon = item.icon; return <div className="stat-card" key={item.label}><span className={`stat-icon ${item.color}`}><Icon size={18} /></span><span className="stat-label">{item.label}</span><strong>{item.value}</strong></div> })}</div>
    <div className="dashboard-lower"><section className="panel quick-panel"><div className="panel-heading"><div><span className="eyebrow">QUICK ACTIONS</span><h2>Pick up where you left off</h2></div><Sparkles size={18} className="heading-icon" /></div><div className="quick-grid">{[
      ['Add New Class', 'groups', Users], ['Add Faculty', 'faculty', UserRound], ['Add Subject', 'subjects', BookOpen],
      ['Configure Time Slots', 'windows', Clock3], ['Generate Timetable', 'generate', Sparkles], ['Check Conflicts', 'conflicts', CircleAlert],
    ].map(([label, target, Icon]) => <button key={String(target)} className="quick-action" onClick={() => onGo(target as Page)}><span><Icon size={17} /></span><b>{String(label)}</b><ArrowDownToLine size={14} className="quick-arrow" /></button>)}</div></section>
      <section className="panel preview-panel"><div className="panel-heading"><div><span className="eyebrow">SCHEDULE SNAPSHOT</span><h2>This week</h2></div><button className="icon-button" aria-label="View timetable" onClick={() => onGo('timetable')}><ArrowLeftRight size={17} /></button></div>
        {recent.length ? <div className="preview-list">{recent.map(entry => <div className="preview-entry" key={entry.id}><div className="preview-day"><b>{entry.day.slice(0, 3)}</b><small>{entry.start}</small></div><span className="preview-mark" /><div className="preview-info"><b>{displayName(entry.subjectId, data.subjects)}</b><small>{displayName(entry.groupId, data.groups)} · {displayName(entry.roomId, data.rooms)}</small></div><span className="preview-time">{timeLabel(entry.start)}</span></div>)}</div> : <div className="preview-empty"><div className="preview-placeholder"><span /><span /><span /></div><b>Your timetable starts here</b><p>Add your scheduling details, then generate your first timetable.</p><Button variant="quiet" onClick={() => onGo(data.groups.length ? 'generate' : 'groups')}>{data.groups.length ? 'Open generator' : 'Add your first class'}<ChevronDown size={15} /></Button></div>}
        <div className={`status-strip ${validated ? 'status-good' : conflicts.length ? 'status-bad' : 'status-idle'}`}><span className="status-dot" />{validated ? 'All mandatory checks passed' : conflicts.length ? `${conflicts.length} issue(s) need attention` : 'Waiting for a complete schedule'}</div>
      </section></div>
  </>
}

function ConstraintsPage({ data, onChange }: { data: PlannerData; onChange: (preferences: PlannerData['preferences']) => void }) {
  const rules = [
    ['Faculty availability', 'A faculty member cannot teach overlapping sessions or during unavailable windows.'],
    ['Room availability', 'A classroom cannot host overlapping sessions and must meet the group capacity.'],
    ['Student-group availability', 'A group cannot attend overlapping subjects.'],
    ['Working periods & breaks', 'Sessions fit inside configured periods and never use a marked break window.'],
    ['Qualifications & practicals', 'Faculty must be qualified; practical subjects require a lab room.'],
    ['Required sessions & durations', 'Every group-subject requirement is scheduled at its specified duration.'],
    ['Faculty workload', 'Daily and weekly faculty session limits are respected.'],
  ]
  return <section><div className="page-heading"><div><span className="eyebrow">RULES & PREFERENCES</span><h1>Scheduling Constraints</h1><p>Mandatory rules protect timetable validity. Optional preferences guide choices but are not conflict violations.</p></div><span className="soft-pill"><Settings2 size={15} /> Constraint settings</span></div>
    <div className="constraint-layout"><div className="panel constraint-panel"><div className="panel-heading"><div><span className="eyebrow">ALWAYS ENFORCED</span><h2>Mandatory constraints</h2></div><span className="rule-count">{rules.length} rules</span></div>{rules.map((rule, index) => <div className="rule-row" key={rule[0]}><span className="rule-number">0{index + 1}</span><div><b>{rule[0]}</b><p>{rule[1]}</p></div><span className="required-badge"><Check size={13} />Required</span></div>)}</div>
      <div className="panel preference-panel"><div className="panel-heading"><div><span className="eyebrow">OPTIONAL</span><h2>Planning preferences</h2></div><Sparkles size={17} className="heading-icon" /></div><Toggle title="Spread subjects across days" text="Prefer placing sessions for the same subject on different days." checked={data.preferences.spreadSubjects} onChange={value => onChange({ ...data.preferences, spreadSubjects: value })} /><Toggle title="Avoid back-to-back faculty sessions" text="Preference is advisory; the current scheduler prioritizes subject spreading." checked={data.preferences.avoidFacultyBackToBack} onChange={value => onChange({ ...data.preferences, avoidFacultyBackToBack: value })} /><FormField label="Maximum search nodes"><input type="number" min="100" max="250000" step="1000" value={data.preferences.maxSearchNodes} onChange={event => onChange({ ...data.preferences, maxSearchNodes: Math.max(100, Number(event.target.value)) })} /><small>Stops long searches and reports when the limit is reached. Default: 50,000.</small></FormField></div></div>
    <div className="inline-tip"><Info size={16} />Faculty/room day and period availability is configured on the corresponding records. Break windows are never eligible for scheduling.</div>
  </section>
}

function Toggle({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="toggle-row"><div><b>{title}</b><p>{text}</p></div><button className={`toggle ${checked ? 'toggle-on' : ''}`} onClick={() => onChange(!checked)} type="button" role="switch" aria-checked={checked} aria-label={title}><span /></button></div>
}

function GeneratePage({ data, conflicts, onGenerate, onGo, isGenerating }: { data: PlannerData; conflicts: Conflict[]; onGenerate: () => void; onGo: (page: Page) => void; isGenerating: boolean }) {
  const missing: string[] = []
  if (!data.groups.length) missing.push('student groups')
  if (!data.subjects.length) missing.push('subjects')
  if (!data.faculty.length) missing.push('faculty members')
  if (!data.rooms.length) missing.push('classrooms')
  if (!data.windows.some(window => !window.isBreak)) missing.push('non-break time windows')
  return <section><div className="page-heading"><div><span className="eyebrow">CONSTRAINT SATISFACTION</span><h1>Generate Timetable</h1><p>Build a weekly plan from your data using prioritized backtracking and mandatory-rule validation.</p></div><div className="algorithm-badge"><span className="algorithm-icon"><Sparkles size={18} /></span><span><b>Backtracking search</b><small>Most constrained sessions first</small></span></div></div>
    <div className="generation-grid"><div className="panel generation-panel"><span className="eyebrow">BEFORE YOU BEGIN</span><h2>Ready your scheduling data</h2><p>The generator creates one assignment for each required group-subject session, and checks every assignment against the constraints.</p>
      <div className="readiness-list">{[
        ['Student groups', data.groups.length, 'groups'], ['Subjects', data.subjects.length, 'subjects'], ['Faculty qualifications', data.faculty.filter(person => person.subjectIds.length).length, 'qualified faculty'], ['Classrooms', data.rooms.length, 'rooms'], ['Available time windows', data.windows.filter(item => !item.isBreak).length, 'periods'],
      ].map(([label, value, noun]) => <div className="readiness-row" key={String(label)}><span className={Number(value) > 0 ? 'readiness-check' : 'readiness-missing'}>{Number(value) > 0 ? <Check size={14} /> : <CircleAlert size={14} />}</span><span>{String(label)}</span><b>{value} {noun}</b></div>)}</div>
      {missing.length > 0 && <div className="inline-tip tip-warning"><CircleAlert size={16} />Add {missing.join(', ')} to generate a complete timetable.</div>}
      {conflicts.length > 0 && data.schedule.length > 0 && <div className="inline-tip tip-warning"><CircleAlert size={16} />Current timetable has {conflicts.length} issue(s). Generation replaces it only after a complete schedule passes validation.</div>}
      <Button variant="primary" className="generate-button" onClick={onGenerate} disabled={missing.length > 0 || isGenerating}>{isGenerating ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}{isGenerating ? 'Searching for a valid schedule...' : 'Generate conflict-checked timetable'}</Button>
      <small className="limit-note">Search limit: {data.preferences.maxSearchNodes.toLocaleString()} candidate assignments. A failed or limited search never replaces your existing timetable.</small>
    </div>
      <div className="panel algorithm-panel"><div className="algorithm-visual"><div className="algorithm-step"><span>01</span><div><b>Expand requirements</b><small>Build the required session set</small></div><span className="step-shape shape-lavender" /></div><div className="algorithm-connector" /><div className="algorithm-step"><span>02</span><div><b>Find valid candidates</b><small>Check faculty, rooms, windows</small></div><span className="step-shape shape-blue" /></div><div className="algorithm-connector" /><div className="algorithm-step"><span>03</span><div><b>Try constrained sessions</b><small>Backtrack when a choice blocks progress</small></div><span className="step-shape shape-peach" /></div><div className="algorithm-connector" /><div className="algorithm-step"><span>04</span><div><b>Validate complete result</b><small>Publish only after all rules pass</small></div><span className="step-shape shape-mint" /></div></div><div className="algorithm-footer"><BookOpen size={16} /><span>See how the mathematics works</span><button onClick={() => onGo('math')}>Explore concepts <ArrowLeftRight size={14} /></button></div></div>
    </div></section>
}

function TimetablePage({ data, filters, setFilters, viewMode, setViewMode, entries, conflicts, onEdit, onDelete, onAdd, onUndo, canUndo, onExport, onSummary, onSave, onPrint }: {
  data: PlannerData; filters: ScheduleFilters
  setFilters: (filters: ScheduleFilters) => void; viewMode: 'weekly' | 'daily' | 'class' | 'faculty' | 'room' | 'department'; setViewMode: (mode: typeof viewMode) => void
  entries: ScheduleEntry[]; conflicts: Conflict[]; onEdit: (entry: ScheduleEntry) => void; onDelete: (entry: ScheduleEntry) => void
  onAdd: () => void; onUndo: () => void; canUndo: boolean; onExport: () => void; onSummary: () => void; onSave: () => void; onPrint: () => void
}) {
  const days = DAYS.filter(day => data.windows.some(window => window.day === day) && (!filters.day || day === filters.day))
  const calendarDays = viewMode === 'daily' && !filters.day ? days.slice(0, 1) : days
  const timeRows = [...new Map(data.windows.filter(window => !window.isBreak && (!filters.day || window.day === filters.day)).map(window => [window.start, window])).values()].sort((a, b) => a.start.localeCompare(b.start))
  const entryConflictIds = new Set(conflicts.flatMap(item => item.entryIds))
  const departments = [...new Set(data.groups.map(group => group.department).filter(Boolean))]
  const years = [...new Set(data.groups.map(group => group.year).filter(Boolean))]
  return <section className="timetable-section"><div className="page-heading"><div><span className="eyebrow">YOUR WEEK AT A GLANCE</span><h1>View & Edit Timetable</h1><p>Filter your sessions, inspect the details, and make validated changes.</p></div><div className="heading-actions"><Button variant="secondary" onClick={onUndo} disabled={!canUndo}><RotateCcw size={15} />Undo</Button><Button variant="secondary" onClick={onSave}><Check size={15} />Save changes</Button><Button variant="secondary" onClick={onExport}><Download size={15} />Export CSV</Button><Button variant="secondary" onClick={onSummary}><FileDown size={15} />Summary</Button><Button variant="secondary" onClick={onPrint}><Printer size={15} />Print / PDF</Button></div></div>
    {data.schedule.length > 0 && conflicts.length === 0 && data.schedule.length === requiredSessions(data).length && <div className="validation-banner"><CheckCircle2 size={18} /><b>Timetable Successfully Generated — No Mandatory Scheduling Conflicts Detected.</b></div>}
    {conflicts.length > 0 && <div className="inline-tip tip-warning"><CircleAlert size={16} />{conflicts.length} validation issue(s) found. Conflicting sessions are marked below. Review the Conflict Report for details.</div>}
    <div className="timetable-toolbar"><div className="view-tabs">{(['weekly', 'daily', 'class', 'faculty', 'room', 'department'] as const).map(mode => <button key={mode} className={viewMode === mode ? 'view-tab active' : 'view-tab'} onClick={() => setViewMode(mode)}>{mode === 'class' ? 'Class-wise' : mode === 'faculty' ? 'Faculty-wise' : mode === 'room' ? 'Room-wise' : mode === 'department' ? 'Department' : mode[0].toUpperCase() + mode.slice(1)}</button>)}</div><div className="filter-grid"><select aria-label="Filter by group" value={filters.groupId} onChange={event => setFilters({ ...filters, groupId: event.target.value })}><option value="">All groups</option>{data.groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by faculty" value={filters.facultyId} onChange={event => setFilters({ ...filters, facultyId: event.target.value })}><option value="">All faculty</option>{data.faculty.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by subject" value={filters.subjectId} onChange={event => setFilters({ ...filters, subjectId: event.target.value })}><option value="">All subjects</option>{data.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by classroom" value={filters.roomId} onChange={event => setFilters({ ...filters, roomId: event.target.value })}><option value="">All rooms</option>{data.rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by department" value={filters.department} onChange={event => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{departments.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Filter by year" value={filters.year} onChange={event => setFilters({ ...filters, year: event.target.value })}><option value="">All years</option>{years.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Filter by day" value={filters.day} onChange={event => setFilters({ ...filters, day: event.target.value })}><option value="">All days</option>{days.map(item => <option key={item}>{item}</option>)}</select></div></div>
    <div className="calendar-toolbar"><div><span className="calendar-dot" />Scheduled sessions <span className="calendar-dot conflict-dot" />Needs attention</div><Button variant="primary" onClick={onAdd}><Plus size={16} />Add session</Button></div>
    {calendarDays.length > 0 && entries.length > 0 ? <div className="calendar-wrap"><div className="calendar-grid" style={{ gridTemplateColumns: `74px repeat(${calendarDays.length}, minmax(145px, 1fr))` }}><div className="calendar-corner">TIME</div>{calendarDays.map(day => <div key={day} className="calendar-day-heading"><b>{day}</b><small>{entries.filter(item => item.day === day).length} sessions</small></div>)}{timeRows.map((slot, index) => <div className="calendar-row" key={`${slot.start}-${index}`} style={{ gridColumn: `1 / span ${calendarDays.length + 1}`, gridTemplateColumns: `74px repeat(${calendarDays.length}, minmax(145px, 1fr))` }}><div className="calendar-time">{timeLabel(slot.start)}</div>{calendarDays.map(day => {
      const found = entries.filter(entry => entry.day === day && entry.start === slot.start)
      return <div className="calendar-cell" key={`${slot.id}-${day}`}>{found.map(entry => <article key={entry.id} className={`session-card ${entryConflictIds.has(entry.id) ? 'session-conflict' : ''}`}><button className="session-edit-area" onClick={() => onEdit(entry)} aria-label={`Edit ${displayName(entry.subjectId, data.subjects)} for ${displayName(entry.groupId, data.groups)}`}><b>{displayName(entry.subjectId, data.subjects)}</b><span>{displayName(entry.groupId, data.groups)}</span><small>{timeLabel(entry.start)}–{timeLabel(entry.end)}</small><small><UserRound size={12} />{displayName(entry.facultyId, data.faculty)}</small><small><DoorOpen size={12} />{displayName(entry.roomId, data.rooms)}</small></button><button className="session-delete icon-button" aria-label="Delete session" onClick={() => onDelete(entry)}><Trash2 size={13} /></button></article>)}</div>
    })}</div>)}</div></div> : <EmptyState icon={<CalendarDays size={21} />} title={entries.length === 0 && data.schedule.length ? 'No sessions match these filters' : 'No timetable to display'} text={data.schedule.length ? 'Adjust the filters or add a session.' : 'Add classes, subjects, faculty, rooms, and time windows, then generate your timetable.'} action={!data.schedule.length ? <Button variant="primary" onClick={() => setViewMode('weekly')}><Sparkles size={16} />Start planning</Button> : undefined} />}
    <div className="table-bottom-actions"><span>{entries.length} visible session{entries.length === 1 ? '' : 's'} · {requiredSessions(data).length} required</span><button className="text-link" onClick={() => setFilters({ groupId: '', facultyId: '', subjectId: '', roomId: '', day: '', department: '', year: '' })}>Clear filters</button></div>
  </section>
}

function AddSessionModal({ data, onClose, onAdd }: { data: PlannerData; onClose: () => void; onAdd: (groupId: string, subjectId: string, facultyId: string, roomId: string, windowId: string) => void }) {
  const [groupId, setGroupId] = useState(data.groups[0]?.id ?? '')
  const group = data.groups.find(item => item.id === groupId)
  const availableSubjects = data.subjects.filter(subject => group?.requirements.some(req => req.subjectId === subject.id) || subject.groupIds.includes(groupId))
  const [subjectId, setSubjectId] = useState(availableSubjects[0]?.id ?? '')
  const subject = data.subjects.find(item => item.id === subjectId)
  const [facultyId, setFacultyId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [windowId, setWindowId] = useState('')
  const eligibleFaculty = data.faculty.filter(person => subject && (!subject.facultyIds.length || subject.facultyIds.includes(person.id)) && person.subjectIds.includes(subject.id))
  const eligibleRooms = data.rooms.filter(room => group && subject && room.capacity >= group.students && (!subject.practical || room.type.toLowerCase().includes('lab')))
  const eligibleWindows = data.windows.filter(item => !item.isBreak && subject && minutes(item.end) - minutes(item.start) >= subject.duration)
  useEffect(() => { if (!eligibleFaculty.some(item => item.id === facultyId)) setFacultyId(eligibleFaculty[0]?.id ?? '') }, [subjectId, eligibleFaculty, facultyId])
  useEffect(() => { if (!eligibleRooms.some(item => item.id === roomId)) setRoomId(eligibleRooms[0]?.id ?? '') }, [groupId, subjectId, eligibleRooms, roomId])
  useEffect(() => { if (!eligibleWindows.some(item => item.id === windowId)) setWindowId(eligibleWindows[0]?.id ?? '') }, [subjectId, eligibleWindows, windowId])
  return <div className="modal-backdrop"><div className="modal"><div className="modal-heading"><div><span className="eyebrow">EXTEND THE REQUIREMENT</span><h2>Add a timetable session</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
    <p className="subtle-note">A valid session increases that group's required weekly session count. It won't be added if a mandatory conflict is found.</p>
    <div className="form-grid"><FormField label="Student group"><select value={groupId} onChange={event => setGroupId(event.target.value)}>{data.groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField label="Subject"><select value={subjectId} onChange={event => setSubjectId(event.target.value)}>{availableSubjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField label="Faculty"><select value={facultyId} onChange={event => setFacultyId(event.target.value)}>{eligibleFaculty.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField label="Classroom"><select value={roomId} onChange={event => setRoomId(event.target.value)}>{eligibleRooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField label="Day and time window"><select value={windowId} onChange={event => setWindowId(event.target.value)}>{eligibleWindows.map(item => <option key={item.id} value={item.id}>{item.day} · {item.start}–{item.end}</option>)}</select></FormField></div>
    {!eligibleFaculty.length || !eligibleRooms.length || !eligibleWindows.length ? <div className="form-error">No candidate faculty, room, or time window is available. Update the related records before adding a session.</div> : null}
    <div className="modal-actions"><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!eligibleFaculty.length || !eligibleRooms.length || !eligibleWindows.length || !groupId || !subjectId || !facultyId || !roomId || !windowId} onClick={() => onAdd(groupId, subjectId, facultyId, roomId, windowId)}><Plus size={16} />Add and validate</Button></div>
  </div></div>
}

function ConflictsPage({ conflicts, data, onRecheck, onExport, onGo }: { conflicts: Conflict[]; data: PlannerData; onRecheck: () => void; onExport: () => void; onGo: (page: Page) => void }) {
  const scheduled = data.schedule.length > 0
  const complete = scheduled && conflicts.length === 0 && data.schedule.length === requiredSessions(data).length
  return <section><div className="page-heading"><div><span className="eyebrow">VALIDATION & DIAGNOSTICS</span><h1>Conflict Report</h1><p>Clear explanations help you identify and resolve timetable issues.</p></div><div className="heading-actions"><Button variant="secondary" onClick={onExport}><Download size={15} />Export report</Button><Button variant="primary" onClick={onRecheck}><RotateCcw size={15} />Recheck conflicts</Button></div></div>
    {complete ? <div className="success-empty"><div className="success-check"><CheckCircle2 size={28} /></div><span className="eyebrow">VALIDATION COMPLETE</span><h2>Timetable Successfully Generated — No Mandatory Scheduling Conflicts Detected.</h2><p>All scheduled sessions passed the current mandatory rule checks, and all required sessions are placed.</p><Button variant="secondary" onClick={() => onGo('timetable')}><CalendarDays size={16} />View timetable</Button></div> : conflicts.length ? <div className="conflict-report-list">{conflicts.map((item, index) => {
      const affected = item.entryIds.map(id => data.schedule.find(entry => entry.id === id)).filter((entry): entry is ScheduleEntry => Boolean(entry))
      return <article className="conflict-card" key={`${item.type}-${index}`}><span className="conflict-symbol"><CircleAlert size={18} /></span><div className="conflict-content"><div className="conflict-title-row"><span className="conflict-type">{item.type}</span>{item.day && <span className="conflict-when">{item.day} · {item.start && timeLabel(item.start)}{item.end ? `–${timeLabel(item.end)}` : ''}</span>}</div><p>{item.message}</p>{affected.length > 0 && <div className="affected-chips">{affected.map(entry => <span key={entry.id}>{displayName(entry.groupId, data.groups)} · {displayName(entry.subjectId, data.subjects)} · {displayName(entry.facultyId, data.faculty)} · {displayName(entry.roomId, data.rooms)}</span>)}</div>}<div className="resolution"><b>Suggested resolution</b><span>{item.resolution}</span></div></div></article>
    })}</div> : <EmptyState icon={<CircleAlert size={21} />} title="Nothing to recheck yet" text="Generate a timetable or add requirements first. Missing required sessions will appear as conflicts after a schedule exists or during the first validation." action={<Button variant="primary" onClick={() => onGo('generate')}><Sparkles size={16} />Go to generator</Button>} />}
  </section>
}

function MathPage({ data }: { data: PlannerData }) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setStep(current => (current + 1) % 4), 1500)
    return () => window.clearInterval(timer)
  }, [playing])
  const sets: Array<[string, string, string[]]> = [
    ['S', 'Subjects', data.subjects.map(item => item.name)],
    ['F', 'Faculty', data.faculty.map(item => item.name)],
    ['R', 'Classrooms', data.rooms.map(item => item.name)],
    ['T', 'Time windows', data.windows.map(item => `${item.day} ${item.start}–${item.end}`)],
    ['G', 'Student groups', data.groups.map(item => item.name)],
    ['E', 'Required sessions', requiredSessions(data).map(item => `${displayName(item.groupId, data.groups)} · ${displayName(item.subjectId, data.subjects)} #${item.index}`)],
  ]
  return <section><div className="page-heading"><div><span className="eyebrow">MATHEMATICS BEHIND THE PLANNER</span><h1>Discrete Mathematics</h1><p>Sets, relations, logic, and search turn a complex weekly plan into a well-defined problem.</p></div><span className="math-mark">∑ · ∈ · ⟷</span></div>
    <div className="math-hero"><span className="math-sparkle">✳</span><div><span className="eyebrow">THE SCHEDULING PROBLEM</span><h2>Find a valid assignment from a space of possibilities.</h2><p>Each session must be related to one eligible faculty member, a suitable room, and a time window—without assigning shared resources to overlapping sessions.</p></div><div className="math-formula">assignment<br /><span>∈</span> Faculty × Room × Time</div></div>
    <div className="math-section-heading"><div><span className="eyebrow">01 · SETS</span><h2>The elements in your system</h2></div><span className="data-live"><i />Live from your data</span></div><div className="set-grid">{sets.map(([symbol, name, elements], index) => <article className={`set-card set-${index}`} key={symbol}><div className="set-card-heading"><span className="set-symbol">{symbol} =</span><b>{name}</b><span className="set-count">{elements.length}</span></div><div className="set-elements">{elements.length ? elements.slice(0, 5).map((element, i) => <span key={`${element}-${i}`}>{element}</span>) : <small>Your data will appear here when added.</small>}{elements.length > 5 && <small>+{elements.length - 5} more</small>}</div></article>)}</div>
    <div className="math-section-heading"><div><span className="eyebrow">02 · RELATIONS</span><h2>Connections between sets</h2></div></div><div className="relation-grid"><RelationCard title="Faculty–Subject" notation="R_FS ⊆ F × S" text="Pairs a faculty member with each subject they are qualified to teach." /><RelationCard title="Classroom–Time" notation="R_RT ⊆ R × T" text="Represents which rooms are available during each configured time window." /><RelationCard title="Group–Subject" notation="R_GS ⊆ G × S" text="Connects student groups to the subjects they must attend." /><RelationCard title="Session–Time" notation="R_ST ⊆ E × T" text="Records the time window assigned to each required teaching session." /></div>
    <div className="math-two-col"><article className="panel math-explainer"><span className="eyebrow">03 · CONFLICT RELATIONS & LOGIC</span><h2>When do two sessions conflict?</h2><p>Two sessions conflict when their time intervals overlap and they share a restricted resource.</p><div className="notation-box">Conflict(e₁, e₂) = Overlap(t₁, t₂) ∧<br />(Faculty(e₁) = Faculty(e₂) ∨ Room(e₁) = Room(e₂) ∨ Group(e₁) = Group(e₂))</div><p>Boolean conditions also check capacity, qualifications, availability, break periods, and required duration. A placement is accepted only when every mandatory predicate is true.</p></article><article className="panel math-explainer"><span className="eyebrow">04 · BACKTRACKING</span><h2>Explore, check, and retry</h2><p>The search selects a highly constrained session first, tries a candidate assignment, and reverses it if it blocks a complete valid solution.</p><div className="backtrack-flow">{['Choose session', 'Check constraints', 'Assign or backtrack', 'Validate result'].map((label, index) => <div key={label} className={`flow-step ${step === index ? 'flow-active' : ''}`}><span>{index + 1}</span><b>{label}</b></div>)}</div><div className="demo-controls"><Button variant="secondary" onClick={() => setPlaying(value => !value)}>{playing ? 'Pause explanation' : 'Play explanation'}</Button><Button variant="quiet" onClick={() => setStep(value => (value + 1) % 4)}>Next step <ArrowLeftRight size={14} /></Button><span className="step-indicator">Step {step + 1} of 4</span></div></article></div>
    <div className="inline-tip"><Info size={16} />Set elements shown above are drawn from user-entered data only. This workspace contains no hard-coded college, subject, faculty, or timetable records.</div>
  </section>
}

function RelationCard({ title, notation, text }: { title: string; notation: string; text: string }) {
  return <article className="relation-card"><span className="relation-icon"><ArrowLeftRight size={17} /></span><div><b>{title}</b><p>{text}</p></div><code>{notation}</code></article>
}

function AboutPage({ data, onExport, onImport, onReset }: { data: PlannerData; onExport: () => void; onImport: () => void; onReset: () => void }) {
  const sections = [
    ['Problem Statement', 'Manual timetable preparation is time-consuming and can lead to simultaneous use of the same faculty member, room, or student group.'],
    ['Objectives', 'Manage scheduling information in one place, reduce avoidable clashes, respect room and faculty availability, and make schedule changes easier to validate.'],
    ['Proposed Solution', 'A browser-based planner that models scheduling entities and their relations, then searches for an assignment satisfying all mandatory constraints.'],
    ['Mathematical Foundation', 'Sets describe subjects, faculty, rooms, time windows, groups, and sessions. Relations model eligibility and requirements; logical predicates test assignments.'],
    ['Algorithm', 'A backtracking constraint search prioritizes sessions with fewer eligible assignments and validates a complete candidate schedule before showing success.'],
    ['Advantages', 'User-managed scheduling data, explicit conflict explanations, editable sessions, reusable browser storage, and CSV/print-ready timetable output.'],
    ['Limitations & Future Enhancements', 'Data is local to this browser. Future work could add shared accounts, a database-backed service, richer optimization preferences, and integrations with institutional systems.'],
  ]
  return <section><div className="page-heading"><div><span className="eyebrow">PROJECT OVERVIEW</span><h1>About the Project</h1><p>Scheduling as a practical application of relations and constraint satisfaction.</p></div><div className="project-stamp"><GraduationCap size={19} />Capstone project</div></div>
    <div className="about-title-card"><div className="about-mark"><CalendarDays size={26} /></div><div><span className="eyebrow">DISCRETE MATHEMATICS</span><h2>Conflict-Free College Timetable Generator Using Relations</h2><p>A Discrete Mathematics Approach to Intelligent Academic Scheduling</p></div></div>
    <div className="about-content"><div className="about-sections">{sections.map(([title, text], index) => <article className="about-topic" key={title}><span className="topic-index">{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div><aside className="about-sidebar"><div className="panel data-panel"><span className="eyebrow">YOUR WORKSPACE</span><h3>Data & portability</h3><p>Records are saved in the current browser's local storage and are not shared between devices.</p><div className="data-counts"><span>{data.groups.length} groups</span><span>{data.subjects.length} subjects</span><span>{data.schedule.length} sessions</span></div><Button variant="secondary" className="full-button" onClick={onExport}><Download size={15} />Export all data (JSON)</Button><Button variant="secondary" className="full-button" onClick={onImport}><Upload size={15} />Import backup (JSON)</Button><Button variant="danger" className="full-button" onClick={onReset}><RotateCcw size={15} />Reset all project data</Button></div><div className="academic-note"><BookOpen size={17} /><p>The requested PowerPoint presentation was not included in the workspace. Explanations here are based on the project brief and do not claim results from real-college testing.</p></div></aside></div>
  </section>
}

export default App
