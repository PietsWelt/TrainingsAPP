import { sportGroup } from '../format'
import type { Activity } from '../types'
import { addDays } from './dates'
import type { Fitness } from './types'

/** Durchschnitt der letzten 6 Wochen als Startpunkt für den Plan. */
export function fitnessFrom(activities: Activity[], today: string): Fitness {
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
      longest = Math.max(longest, km)
    }
  }
  return { weeklyRunKm: runKm, longestRunKm: longest, weeklyHours: hours }
}
