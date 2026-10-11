// Gemessene Schwelle als Ausgangspunkt für die Trainingstempos: Brustgurt (alpha1), Garmin oder Bestzeiten.

import { personalLt } from '../aet'
import { dateLabel } from '../format'
import { latestGarminLt } from '../lactate'
import { riegel } from '../prognosis'
import type { Best } from '../records'
import type { Activity, GarminLactate } from '../types'
import { addDays } from './dates'

export type AnchorSource = 'brustgurt' | 'garmin' | 'bestzeit'

export interface Anchor {
  /** Tempo an der Schwelle, s/km. */
  pace: number
  source: AnchorSource
  date: string
}

/** Ab dieser Abweichung zweier Quellen gilt die langsamere (vorsichtiger). */
export const SOURCE_TOLERANCE = 0.04

/** „deiner Laktatschwelle (Brustgurt, 3. Okt.)“ */
export function anchorText(a: Pick<Anchor, 'source' | 'date'>): string {
  const d = dateLabel(a.date, { day: 'numeric', month: 'short' })
  if (a.source === 'bestzeit') return `deiner Bestzeit vom ${d}`
  return `deiner Laktatschwelle (${a.source === 'brustgurt' ? 'Brustgurt' : 'Garmin'}, ${d})`
}

/** Schwelle wie in `pacesFor()`: Mittel aus 10-km- und Halbmarathon-Tempo. */
export function thresholdFromBest(b: Pick<Best, 'time_s' | 'meters'>): number {
  return (riegel(b.time_s, b.meters, 10000) / 10 + riegel(b.time_s, b.meters, 21097.5) / 21.0975) / 2
}

export function thresholdAnchor(activities: Activity[] | undefined, records: Best[] | undefined, lactate: GarminLactate[] | undefined, today: string): Anchor | null {
  const found: Anchor[] = []
  const lt = personalLt(activities, today)
  if (lt && lt.n >= 3 && lt.speed && lt.date >= addDays(today, -60)) found.push({ pace: 1000 / lt.speed, source: 'brustgurt', date: lt.date })
  const g = latestGarminLt(lactate, today)
  if (g && !g.stale && g.lt.speed_mps) found.push({ pace: 1000 / g.lt.speed_mps, source: 'garmin', date: g.lt.date })
  const recent = (records ?? []).filter((b) => b.key !== '1k' && b.date && b.date >= addDays(today, -120) && b.date <= today)
  const best = recent.map((b) => ({ pace: thresholdFromBest(b), source: 'bestzeit' as const, date: b.date! })).sort((a, b) => a.pace - b.pace)[0]
  if (best) found.push(best)
  if (!found.length) return null
  // Weichen Quellen deutlich voneinander ab, ist die langsamere die sichere Wahl.
  const [first, ...rest] = found
  return rest.reduce((m, s) => (s.pace > first.pace * (1 + SOURCE_TOLERANCE) && s.pace > m.pace ? s : m), first)
}
