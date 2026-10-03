// Laktatschwelle: Garmins Wert gegen die eigene Schätzung aus DFA-alpha1 (= 0,5).

import type { Aet } from './aet'
import { addDays } from './plan/dates'
import type { GarminLactate } from './types'

/** Ab so vielen Schlägen Unterschied gilt es als Abweichung. Einzelne alpha1-Schätzungen streuen um etwa ±5 bpm. */
export const LT_TOLERANCE = 5

export type LtVerdict = 'passt' | 'garmin-tiefer' | 'garmin-hoeher'

export interface LtCompare {
  /** Garmin minus alpha1, bpm. */
  diff: number
  verdict: LtVerdict
}

export function compareLt(garmin: GarminLactate | null, alpha: Aet | null): LtCompare | null {
  if (!garmin || !alpha) return null
  const diff = garmin.hr - alpha.hr
  return { diff, verdict: Math.abs(diff) < LT_TOLERANCE ? 'passt' : diff < 0 ? 'garmin-tiefer' : 'garmin-hoeher' }
}

/** Neuester Garmin-Wert; älter als ein halbes Jahr heißt „lange nicht neu bestimmt“. */
export function latestGarminLt(rows: GarminLactate[] | undefined, today: string): { lt: GarminLactate; stale: boolean } | null {
  const lt = (rows ?? []).reduce<GarminLactate | null>((m, r) => (!m || r.date > m.date ? r : m), null)
  return lt ? { lt, stale: lt.date < addDays(today, -182) } : null
}

/** Einordnung eines alpha1-Werts in die drei Bereiche. */
export function alphaZone(a1: number): { label: string; color: string } {
  if (a1 > 0.75) return { label: 'locker', color: 'var(--zone-2)' }
  if (a1 > 0.5) return { label: 'zwischen den Schwellen', color: 'var(--zone-3)' }
  return { label: 'über der Laktatschwelle', color: 'var(--zone-5)' }
}
