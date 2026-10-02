// Zielzeit-Check: Prognose aus deinen Bestzeiten (Riegel-Formel wie im Plan) mit Korrektur für
// Umfang und lange Läufe bei Halbmarathon und Marathon. Garmins eigene Prognose kommt dazu.

import { addDays } from './plan/dates'
import type { Best } from './records'
import { isRun } from './records'
import type { Activity, RacePrediction } from './types'

export interface Prognosis {
  time_s: number
  /** Woraus die Prognose stammt, z.B. „10 km vom 26. Sept.“. */
  from: Best
  /** Aufschlag in Prozent wegen zu wenig Umfang oder fehlender langer Läufe. */
  penaltyPct: number
  reasons: string[]
  garmin: number | null
}

/** Halbmarathon und Marathon brauchen Umfang; darunter sind Prognosen aus kurzen Strecken zu schnell. */
const NEEDS: Record<string, { weeklyKm: number; longKm: number; maxPct: number }> = {
  half: { weeklyKm: 30, longKm: 16, maxPct: 5 },
  marathon: { weeklyKm: 55, longKm: 30, maxPct: 10 },
}

export function riegel(time_s: number, from_m: number, to_m: number): number {
  return time_s * Math.pow(to_m / from_m, to_m > from_m ? 1.08 : 1.06)
}

export function prognose(
  key: '5k' | '10k' | 'half' | 'marathon',
  meters: number,
  bests: Best[],
  activities: Activity[],
  predictions: RacePrediction[] | undefined,
  today: string,
): Prognosis | null {
  // Nur Bestzeiten des letzten Jahres zählen; ohne Datum (selten) mit Vorbehalt auch.
  const recent = bests.filter((b) => b.key !== '1k' && (!b.date || b.date >= addDays(today, -365)))
  const cands = recent.map((b) => ({ b, t: riegel(b.time_s, b.meters, meters) }))
  if (!cands.length) return null
  // Die schnellste Hochrechnung zählt: nicht jeder Lauf über eine Strecke war ein Wettkampf
  // (ein lockerer langer Lauf über 21 km ist keine Halbmarathon-Leistung).
  cands.sort((x, y) => x.t - y.t)
  const best = cands[0]

  const reasons: string[] = []
  let penalty = 0
  const need = NEEDS[key]
  if (need) {
    const since = addDays(today, -42)
    const runs = activities.filter((a) => isRun(a.sport) && a.local_date >= since)
    const weekly = runs.reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000 / 6
    const longest = Math.max(0, ...runs.map((a) => (a.distance_m ?? 0) / 1000))
    if (weekly < need.weeklyKm) {
      const p = ((need.weeklyKm - weekly) / need.weeklyKm) * (need.maxPct * 0.6)
      penalty += p
      reasons.push(`Ø ${Math.round(weekly)} km pro Woche in den letzten 6 Wochen (für diese Strecke eher ${need.weeklyKm}).`)
    }
    if (longest < need.longKm) {
      penalty += need.maxPct * 0.4
      reasons.push(`Längster Lauf zuletzt ${Math.round(longest)} km (Richtwert ${need.longKm} km).`)
    }
  }
  const g = predictions?.at(-1)
  const garmin = g ? ({ '5k': g.time_5k, '10k': g.time_10k, half: g.time_half, marathon: g.time_marathon } as const)[key] : null
  return { time_s: best.t * (1 + penalty / 100), from: best.b, penaltyPct: Math.round(penalty * 10) / 10, reasons, garmin: garmin ?? null }
}

export type Verdict = { status: 'good' | 'warning' | 'serious'; text: string }

/** Ziel gegen Prognose: Abstand in Prozent der Zielzeit. */
export function verdict(goal_s: number, pred_s: number, weeksLeft: number): Verdict {
  const gap = (pred_s - goal_s) / goal_s
  if (gap <= 0) return { status: 'good', text: 'Ziel ist realistisch, du bist schon schnell genug.' }
  // Bis zum Rennen wird die Form noch besser; grob 0,3 % pro Trainingswoche, höchstens 6 %.
  const room = Math.min(6, weeksLeft * 0.3) / 100
  if (gap <= room) return { status: 'good', text: 'Mit dem Training bis zum Rennen gut erreichbar.' }
  if (gap <= room + 0.03) return { status: 'warning', text: 'Ambitioniert, aber machbar, wenn das Training gut läuft.' }
  return { status: 'serious', text: 'Aus heutiger Sicht zu schnell. Ein etwas langsameres Ziel wäre realistischer.' }
}
