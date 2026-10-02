// Der Plan räumt selbst auf: verpasste Einheiten auslassen (wichtige wenn möglich verschieben),
// anderen Sport als Ersatz werten und nach einer Pause sanft wieder einsteigen.

import { sportGroup, GROUP_LABEL } from '../format'
import type { Activity } from '../types'
import { skipWorkout, scaleWorkout } from './adapt'
import { addDays, daysBetween } from './dates'
import type { PlanWorkout } from './types'

export const REENTRY = 'Wiedereinstieg'

/** Ausdauersport, der eine Einheit ersetzen kann. Kraft, Yoga und Ähnliches zählen nicht. */
export function isEndurance(a: Pick<Activity, 'sport'>): boolean {
  if (sportGroup(a.sport) !== 'other') return true
  return !/strength|fitness_equipment|yoga|pilates|breath|meditation|stretch|mobility/.test(a.sport)
}

/** Sportart einer ersetzten Einheit, z.B. „Rad“, wenn die Aktivität nicht zur geplanten Sportart passt. */
export function replacedBy(w: PlanWorkout, a: Activity | undefined): string | null {
  if (!a || w.status !== 'done' || w.sport === 'race') return null
  const g = sportGroup(a.sport)
  return g === w.sport ? null : GROUP_LABEL[g]
}

/**
 * Einheit vom Vortag gilt erst ab 12 Uhr als verpasst: Ein später Lauf am Abend kann sonst noch
 * nicht von Garmin synchronisiert sein.
 */
function missedBefore(today: string, hour: number): string {
  return hour >= 12 ? today : addDays(today, -1)
}

export interface CatchUp {
  changed: PlanWorkout[]
  messages: string[]
}

/**
 * Prüft vergangene, noch offene Einheiten:
 * - Am selben Tag anderer Ausdauersport (mind. 20 min oder die Hälfte der geplanten Zeit): zählt als ersetzt.
 * - Sonst: ausgelassen. Wichtige Einheiten der letzten Woche werden wie beim „Überspringen“ verschoben.
 */
export function catchUp(all: PlanWorkout[], activities: Activity[], today: string, hour: number): CatchUp {
  const cutoff = missedBefore(today, hour)
  let plan = all
  const changed = new Map<string, PlanWorkout>()
  const messages: string[] = []
  const used = new Set(all.map((w) => w.activity_id).filter((x): x is number => x != null))
  const put = (ws: PlanWorkout[]) => {
    for (const w of ws) changed.set(w.id, w)
    plan = plan.map((x) => changed.get(x.id) ?? x)
  }

  const open = all.filter((w) => w.status === 'planned' && w.sport !== 'race' && w.date < cutoff).sort((a, b) => a.date.localeCompare(b.date))
  let replaced = 0
  let missed = 0
  for (const w0 of open) {
    const w = plan.find((x) => x.id === w0.id)!
    if (w.status !== 'planned' || w.date >= cutoff) continue
    const min = Math.min(20, (w.duration_min ?? 40) / 2) * 60
    const sub = activities.find((a) => a.local_date === w.date && !used.has(a.id) && isEndurance(a) && (a.duration_s ?? 0) >= min)
    if (sub) {
      used.add(sub.id)
      put([{ ...w, status: 'done', activity_id: sub.id }])
      replaced++
      continue
    }
    // Ältere Einheiten nur noch als ausgelassen markieren, ohne den Plan umzubauen.
    if (w.date < addDays(today, -7)) put([{ ...w, status: 'skipped' }])
    else put(skipWorkout(plan, w.id, today).changed)
    missed++
  }
  if (replaced) messages.push(replaced === 1 ? 'Eine Einheit durch anderen Sport ersetzt.' : `${replaced} Einheiten durch anderen Sport ersetzt.`)
  if (missed) messages.push(missed === 1 ? 'Eine verpasste Einheit ausgelassen.' : `${missed} verpasste Einheiten ausgelassen.`)
  return { changed: [...changed.values()], messages }
}

/** Länge der aktuellen oder gerade beendeten Trainingspause in Tagen (nur Ausdauersport). */
export function pauseDays(activities: Activity[], today: string): number {
  const days = [...new Set(activities.filter((a) => isEndurance(a) && (a.duration_s ?? 0) >= 15 * 60 && a.local_date <= today).map((a) => a.local_date))].sort()
  if (!days.length) return 0
  const last = days[days.length - 1]
  const current = daysBetween(last, today) - 1
  // Gerade zurück (heute, gestern, vorgestern): Pause vor dem ersten Training danach zählt.
  if (last >= addDays(today, -2)) {
    let i = days.length - 1
    while (i > 0 && daysBetween(days[i - 1], days[i]) === 1 && days[i - 1] >= addDays(today, -2)) i--
    const before = days[i - 1]
    return before ? Math.max(current, daysBetween(before, days[i]) - 1) : current
  }
  return current
}

/**
 * Faustregel nach einer Pause: Je länger sie war, desto leichter und länger der Wiedereinstieg.
 * Nach 1–2 Wochen ohne Training sinkt die Ausdauer messbar, nach 3–4 Wochen deutlich.
 */
export function reentrySteps(pause: number): { factor: number; easy: boolean }[] {
  if (pause < 5) return []
  if (pause < 10) return [{ factor: 0.8, easy: false }]
  if (pause < 21) return [{ factor: 0.7, easy: true }, { factor: 0.85, easy: false }]
  return [{ factor: 0.6, easy: true }, { factor: 0.75, easy: false }, { factor: 0.9, easy: false }]
}

/**
 * Baut die nächsten Wochen nach einer Pause leichter auf. Einmal pro Pause: Bereits angepasste
 * Einheiten tragen „Wiedereinstieg“ im Titel. Die letzte Woche vor dem Rennen bleibt unverändert.
 */
export function reentry(all: PlanWorkout[], activities: Activity[], today: string): CatchUp {
  const pause = pauseDays(activities, today)
  const steps = reentrySteps(pause)
  if (!steps.length) return { changed: [], messages: [] }
  if (all.some((w) => w.title.includes(REENTRY) && w.date >= addDays(today, -14))) return { changed: [], messages: [] }

  const races = all.filter((w) => w.sport === 'race').map((w) => w.date)
  const changed: PlanWorkout[] = []
  for (const w of all) {
    if (w.status !== 'planned' || w.sport === 'race' || w.date < today) continue
    const week = Math.floor(daysBetween(today, w.date) / 7)
    const s = steps[week]
    if (!s) continue
    if (races.some((r) => r >= w.date && daysBetween(w.date, r) < 7)) continue
    let x = scaleWorkout(w, s.factor)
    if (s.easy && w.key_session && w.kind !== 'long') {
      x = {
        ...x,
        kind: 'easy',
        key_session: false,
        steps: null,
        description: `Nach ${pause} Tagen Pause erst wieder locker reinkommen, Gesprächstempo. Ursprünglich: ${w.title}.`,
      }
      x.title = w.sport === 'run' ? 'Lockerer Lauf' : `${w.title.split(':')[0]}: locker`
    }
    x.title = `${x.title} · ${REENTRY}`
    changed.push(x)
  }
  if (!changed.length) return { changed, messages: [] }
  const weeks = steps.length === 1 ? 'Diese Woche ist' : `Die nächsten ${steps.length} Wochen sind`
  return { changed, messages: [`${pause} Tage Pause erkannt. ${weeks} leichter, damit du sicher wieder reinkommst.`] }
}
