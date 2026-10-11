import { sportGroup } from '../format'
import { personalAet } from '../aet'
import type { Best } from '../records'
import type { Activity, GarminLactate } from '../types'
import { thresholdAnchor } from './anchor'
import { addDays } from './dates'
import type { Fitness } from './types'

/**
 * Durchschnitt der letzten 6 Wochen als Startpunkt für den Plan, längster Lauf der letzten 30 Tage,
 * dazu die gemessene Schwelle (Brustgurt, Garmin oder Bestzeiten) für die Tempos.
 */
export function fitnessFrom(activities: Activity[], today: string, records?: Best[], lactate?: GarminLactate[]): Fitness {
  const since = addDays(today, -42)
  const recent = activities.filter((a) => a.local_date > since && a.local_date <= today)
  const hours = { swim: 0, bike: 0, run: 0 }
  let runKm = 0
  let longest = 0
  for (const a of recent) {
    const g = sportGroup(a.sport)
    if (g === 'other') continue
    hours[g] += (a.duration_s ?? 0) / 3600 / 6
    if (g === 'run') {
      const km = (a.distance_m ?? 0) / 1000
      runKm += km / 6
      // Längster Lauf nur aus den letzten 30 Tagen: Maßstab für die Länge des nächsten langen Laufs.
      if (a.local_date > addDays(today, -30)) longest = Math.max(longest, km)
    }
  }
  // Aerobe Schwelle nur aus mindestens 3 Brustgurt-Läufen, die neueste Schätzung höchstens 90 Tage alt.
  const aet = personalAet(activities, today)
  const aetHr = aet && aet.n >= 3 && aet.date >= addDays(today, -90) ? aet.hr : null
  return { weeklyRunKm: runKm, longestRunKm: longest, weeklyHours: hours, threshold: thresholdAnchor(activities, records, lactate, today), aetHr }
}
