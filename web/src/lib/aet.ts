// Aerobe Schwelle (alpha1 = 0,75) und Laktatschwelle (alpha1 = 0,5) aus DFA-alpha1 (Brustgurt mit „HRV aufzeichnen“, Auswertung im Sync, sync/fitfile.py).
// Ein einzelner Lauf ist eine wackelige Schätzung. Deshalb zählt der Median der letzten bis zu 5
// Schätzungen aus 90 Tagen: Ausreißer fallen so kaum ins Gewicht.

import { addDays } from './plan/dates'
import type { Activity } from './types'

export interface Aet {
  /** Puls an der aeroben Schwelle (alpha1 = 0,75), bpm. */
  hr: number
  /** Tempo an der Schwelle in m/s, wenn die Läufe das hergaben. */
  speed: number | null
  /** Zahl der Läufe, aus denen der Wert stammt. */
  n: number
  /** Datum der neuesten Schätzung. */
  date: string
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

type Field = 'aet' | 'lt'

function estimate(activities: Activity[] | undefined, field: Field, until?: string): Aet | null {
  const hrOf = (a: Activity) => (field === 'aet' ? a.aet_hr : a.lt_hr)
  const speedOf = (a: Activity) => (field === 'aet' ? a.aet_speed_mps : a.lt_speed_mps)
  const acts = activities ?? []
  const ref = until ?? acts.reduce((m, a) => (a.local_date > m ? a.local_date : m), '')
  const from = addDays(ref, -90)
  const est = acts
    .filter((a) => hrOf(a) != null && a.local_date <= ref && a.local_date >= from)
    .sort((a, b) => b.local_date.localeCompare(a.local_date))
    .slice(0, 5)
  if (!est.length) return null
  const speeds = est.map(speedOf).filter((x): x is number => x != null)
  return { hr: Math.round(median(est.map((a) => hrOf(a)!))), speed: speeds.length ? median(speeds) : null, n: est.length, date: est[0].local_date }
}

/** Aerobe Schwelle zum Tag `until` (Standard: neuester Lauf), aus den 90 Tagen davor. */
export const personalAet = (activities: Activity[] | undefined, until?: string) => estimate(activities, 'aet', until)

/** Laktatschwelle aus alpha1 = 0,5, gleich gerechnet wie die aerobe Schwelle. */
export const personalLt = (activities: Activity[] | undefined, until?: string) => estimate(activities, 'lt', until)

/**
 * Anteil der Zeit über `hr` aus der Puls-Verteilung (5er-Bereiche). Ein angeschnittener Bereich
 * zählt anteilig, als wären die Werte darin gleich verteilt.
 */
export function shareAbove(hist: Record<string, number> | null | undefined, hr: number): number | null {
  if (!hist) return null
  let total = 0
  let above = 0
  for (const [k, s] of Object.entries(hist)) {
    const lo = Number(k)
    total += s
    if (lo >= hr) above += s
    else if (lo + 5 > hr) above += (s * (lo + 5 - hr)) / 5
  }
  return total ? above / total : null
}

/** Anteil der Zeit unter `hr`. */
export const shareBelow = (hist: Record<string, number> | null | undefined, hr: number) => {
  const a = shareAbove(hist, hr)
  return a == null ? null : 1 - a
}
