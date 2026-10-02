export type RunEventType = '5k' | '10k' | 'half' | 'marathon'
export type TriEventType = 'tri_sprint' | 'tri_olympic' | 'tri_70_3' | 'tri_ironman'
export type EventType = RunEventType | TriEventType

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: '5k', label: '5 km' },
  { value: '10k', label: '10 km' },
  { value: 'half', label: 'Halbmarathon' },
  { value: 'marathon', label: 'Marathon' },
  { value: 'tri_sprint', label: 'Triathlon Sprint' },
  { value: 'tri_olympic', label: 'Triathlon Olympisch' },
  { value: 'tri_70_3', label: 'Triathlon 70.3' },
  { value: 'tri_ironman', label: 'Triathlon Langdistanz' },
]

export const eventTypeLabel = (t: EventType) => EVENT_TYPES.find((e) => e.value === t)?.label ?? t
export const isTri = (t: EventType): t is TriEventType => t.startsWith('tri_')

export interface RaceEvent {
  id: string
  name: string
  date: string // YYYY-MM-DD
  type: EventType
  goal_time_s: number | null
  days_per_week: number // 3..7
  long_day: number // 0 = Montag … 6 = Sonntag
  notes: string | null
}

export type Sport = 'run' | 'bike' | 'swim' | 'race'
export type Kind =
  | 'easy'
  | 'recovery'
  | 'long'
  | 'strides'
  | 'fartlek'
  | 'tempo'
  | 'intervals'
  | 'race_pace'
  | 'technique'
  | 'brick'
  | 'race'
export type Phase = 'base' | 'build' | 'peak' | 'taper'
export type WorkoutStatus = 'planned' | 'done' | 'skipped'

export interface PlanWorkout {
  id: string
  event_id: string
  date: string
  sport: Sport
  kind: Kind
  title: string
  description: string | null
  duration_min: number | null
  distance_km: number | null
  key_session: boolean
  phase: Phase
  week_index: number
  status: WorkoutStatus
  activity_id: number | null
  moved_from: string | null
  /** Ursprüngliche Werte, falls die Einheit wegen niedriger Readiness angepasst wurde. */
  original?: Pick<PlanWorkout, 'kind' | 'title' | 'description' | 'duration_min' | 'distance_km' | 'key_session' | 'status'> | null
}

/** Aktueller Trainingsstand, abgeleitet aus den letzten 6 Wochen Garmin-Daten. */
export interface Fitness {
  weeklyRunKm: number
  longestRunKm: number
  weeklyHours: { swim: number; bike: number; run: number }
}

export const PHASE_LABEL: Record<Phase, string> = {
  base: 'Grundlage',
  build: 'Aufbau',
  peak: 'Spitze',
  taper: 'Tapering',
}
