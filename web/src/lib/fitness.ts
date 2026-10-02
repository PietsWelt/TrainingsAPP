// Fitness, Ermüdung und Form aus der Trainingslast (Modell wie TrainingPeaks PMC / intervals.icu):
// Fitness = gleitender Schnitt der Tageslast über 42 Tage, Ermüdung über 7 Tage,
// Form = Fitness minus Ermüdung vom Vortag. Geplante Einheiten werden bis zum Rennen fortgeschrieben.

import { addDays } from './plan/dates'
import type { PlanWorkout } from './plan/types'
import { sportGroup } from './format'
import type { Activity } from './types'

export interface FitnessDay {
  date: string
  fitness: number
  fatigue: number
  form: number
  /** true = aus dem Plan geschätzt, nicht gemessen. */
  projected: boolean
}

const K_FIT = 1 - Math.exp(-1 / 42)
const K_FAT = 1 - Math.exp(-1 / 7)

/** Last einer Aktivität: Garmins Trainingslast, sonst grob aus der Dauer. */
export function activityLoad(a: Pick<Activity, 'training_load' | 'duration_s' | 'sport'>): number {
  if (a.training_load != null) return a.training_load
  const min = (a.duration_s ?? 0) / 60
  return min * (sportGroup(a.sport) === 'other' ? 0.6 : 1.2)
}

/** Last pro Minute aus deinen eigenen Läufen (Median), damit die Schätzung für geplante Einheiten passt. */
export function loadPerMinute(activities: Activity[]): number {
  const xs = activities
    .filter((a) => a.training_load != null && (a.duration_s ?? 0) > 600)
    .map((a) => a.training_load! / (a.duration_s! / 60))
    .sort((a, b) => a - b)
  return xs.length >= 5 ? xs[Math.floor(xs.length / 2)] : 1.4
}

/** Geschätzte Last einer geplanten Einheit. Harte Einheiten zählen mehr pro Minute, das Rennen am meisten. */
export function plannedLoad(w: Pick<PlanWorkout, 'duration_min' | 'key_session' | 'sport' | 'kind'>, perMin: number): number {
  const min = w.duration_min ?? 0
  if (w.sport === 'race') return min * perMin * 2
  const f = w.kind === 'recovery' ? 0.7 : w.key_session && w.kind !== 'long' ? 1.5 : 1
  return min * perMin * f
}

/**
 * Tageswerte von `from` bis `to`. Die Rechnung beginnt mit der ältesten Aktivität, damit die
 * 42-Tage-Fitness eingeschwungen ist. Nach `today` zählen nur geplante Einheiten.
 */
export function fitnessSeries(activities: Activity[], planned: PlanWorkout[], from: string, to: string, today: string): FitnessDay[] {
  const load = new Map<string, number>()
  for (const a of activities) load.set(a.local_date, (load.get(a.local_date) ?? 0) + activityLoad(a))
  const perMin = loadPerMinute(activities)
  // Was nicht im Plan steht (Rad, Gym, Sonstiges, wenn der Plan nur Laufen enthält), läuft weiter wie
  // im Schnitt der letzten 4 Wochen.
  const planSports = new Set<string>(planned.map((w) => (w.sport === 'race' ? 'run' : w.sport)))
  const since = addDays(today, -27)
  const extra =
    activities.filter((a) => a.local_date >= since && a.local_date <= today && !planSports.has(sportGroup(a.sport))).reduce((s, a) => s + activityLoad(a), 0) / 28
  for (let d = addDays(today, 1); planned.length && d <= to; d = addDays(d, 1)) load.set(d, extra)
  for (const w of planned) {
    if (w.date <= today || w.status !== 'planned') continue
    load.set(w.date, (load.get(w.date) ?? 0) + plannedLoad(w, perMin))
  }
  const first = activities.reduce((m, a) => (a.local_date < m ? a.local_date : m), from)
  const out: FitnessDay[] = []
  let fit = 0
  let fat = 0
  for (let d = first; d <= to; d = addDays(d, 1)) {
    const form = fit - fat
    const l = load.get(d) ?? 0
    fit += (l - fit) * K_FIT
    fat += (l - fat) * K_FAT
    if (d >= from) out.push({ date: d, fitness: Math.round(fit), fatigue: Math.round(fat), form: Math.round(form), projected: d > today })
  }
  return out
}

export type FormZone = { label: string; status: 'good' | 'warning' | 'serious'; text: string }

/** Einordnung der Form, angelehnt an die üblichen Bereiche (intervals.icu). */
export function formZone(form: number): FormZone {
  if (form > 25) return { label: 'Sehr frisch', status: 'warning', text: 'Lange wenig Belastung, die Fitness sinkt langsam.' }
  if (form > 5) return { label: 'Frisch', status: 'good', text: 'Gut erholt, ideal für ein Rennen.' }
  if (form >= -10) return { label: 'Ausgeglichen', status: 'good', text: 'Belastung und Erholung halten sich die Waage.' }
  if (form >= -30) return { label: 'Im Aufbau', status: 'good', text: 'Produktive Belastung, Fitness steigt.' }
  return { label: 'Überlastet', status: 'serious', text: 'Viel mehr Belastung als gewohnt. Erholung einplanen.' }
}
