// Eigener Readiness-Score (0–100) aus HRV, Ruhepuls, Schlaf, Trainingslast und Alkohol.
// Jeder Baustein wird gegen deine eigene Norm der letzten 4 Wochen bewertet, nicht gegen Tabellenwerte.

import { addDays } from './plan/dates'
import type { GymByDate } from './dailyLog'
import type { Activity, DailyMetrics } from './types'

export type ReadinessStatus = 'good' | 'warning' | 'serious' | 'critical'

export interface Component {
  key: 'hrv' | 'rhr' | 'sleep' | 'load' | 'alcohol' | 'legs'
  label: string
  score: number // 0..100
  weight: number
  detail: string
}

export interface Readiness {
  date: string
  score: number
  status: ReadinessStatus
  headline: string
  advice: string
  components: Component[]
}

const WEIGHTS: Record<Component['key'], number> = { hrv: 0.3, sleep: 0.25, load: 0.2, rhr: 0.15, alcohol: 0.1, legs: 0.1 }

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x))
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
function sd(xs: number[]): number | null {
  const m = mean(xs)
  if (m == null || xs.length < 5) return null
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => x != null && Number.isFinite(x))
const fmt1 = (x: number) => x.toFixed(1).replace('.', ',')

/** Punkte für Getränke am Vorabend. */
export function alcoholScore(drinks: number): number {
  return [100, 85, 65, 45, 30][Math.min(drinks, 4)] - Math.max(0, drinks - 4) * 10
}

const LEG_FOCUS = new Set(['legs', 'full'])

/** Müdigkeit der Beine durch Krafttraining gestern oder vorgestern (null, wenn keins). */
export function legFatigue(date: string, gym: GymByDate): { score: number; detail: string; daysAgo: number; hard: boolean } | null {
  for (const daysAgo of [1, 2]) {
    const g = gym[addDays(date, -daysAgo)]
    if (!g || !LEG_FOCUS.has(g.focus)) continue
    const what = g.focus === 'legs' ? 'Beine' : 'Ganzkörper'
    const when = daysAgo === 1 ? 'Gestern' : 'Vorgestern'
    if (daysAgo === 1) return { score: g.hard ? 45 : 70, detail: `${when} ${what}${g.hard ? ', hart' : ', locker'}`, daysAgo, hard: g.hard }
    if (g.hard) return { score: 70, detail: `${when} ${what}, hart`, daysAgo, hard: true }
  }
  return null
}

/** Trainingslast eines Tages; ohne Garmin-Wert grob aus der Dauer geschätzt. */
function loadOf(a: Activity): number {
  if (a.training_load != null) return a.training_load
  return ((a.duration_s ?? 0) / 60) * 1.2
}

export function readinessFor(
  date: string,
  days: DailyMetrics[],
  activities: Activity[],
  drinksByDate: Record<string, number>,
  gymByDate: GymByDate = {},
): Readiness | null {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const today = byDate.get(date)
  const history = days.filter((d) => d.date < date && d.date >= addDays(date, -28))
  const comps: Component[] = []

  // HRV: Abweichung von deiner 4-Wochen-Norm in Standardabweichungen.
  const hrvHist = nums(history.map((d) => d.hrv_last_night))
  const hrv = today?.hrv_last_night
  const hrvMean = mean(hrvHist)
  const hrvSd = sd(hrvHist)
  if (hrv != null && hrvMean != null && hrvSd) {
    const z = (hrv - hrvMean) / Math.max(hrvSd, 2)
    const pct = Math.round(((hrv - hrvMean) / hrvMean) * 100)
    comps.push({
      key: 'hrv',
      label: 'HRV',
      score: clamp(72 + z * 18),
      weight: WEIGHTS.hrv,
      detail: `${hrv} ms, ${pct >= 0 ? '+' : ''}${pct} % ggü. deinem Schnitt (${Math.round(hrvMean)} ms)`,
    })
  }

  // Ruhepuls: jeder Schlag über dem Schnitt kostet Punkte.
  const rhrHist = nums(history.map((d) => d.resting_hr))
  const rhr = today?.resting_hr
  const rhrMean = mean(rhrHist)
  if (rhr != null && rhrMean != null && rhrHist.length >= 5) {
    const delta = rhr - rhrMean
    comps.push({
      key: 'rhr',
      label: 'Ruhepuls',
      score: clamp(75 - delta * 8),
      weight: WEIGHTS.rhr,
      detail: `${rhr} bpm, ${delta >= 0 ? '+' : ''}${fmt1(delta)} ggü. Schnitt`,
    })
  }

  // Schlaf: Dauer gegen 8 h und gegen deinen Schnitt, plus Garmins Schlafqualität.
  if (today?.sleep_s) {
    const h = today.sleep_s / 3600
    const avgH = mean(nums(history.map((d) => d.sleep_s)).map((s) => s / 3600)) ?? 7.5
    const target = Math.max(7, Math.min(8.5, avgH))
    const dur = clamp(100 - Math.max(0, target - h) * 30)
    const quality = today.sleep_score ?? dur
    comps.push({
      key: 'sleep',
      label: 'Schlaf',
      score: Math.round(dur * 0.6 + quality * 0.4),
      weight: WEIGHTS.sleep,
      detail: `${fmt1(h)} h${today.sleep_score != null ? `, Qualität ${today.sleep_score}` : ''}`,
    })
  }

  // Trainingslast: akut (7 Tage) im Verhältnis zur chronischen Last (28 Tage), plus harter Vortag.
  const recent = activities.filter((a) => a.local_date < date && a.local_date >= addDays(date, -28))
  if (recent.length >= 3) {
    const acute = recent.filter((a) => a.local_date >= addDays(date, -7)).reduce((s, a) => s + loadOf(a), 0)
    const chronic = recent.reduce((s, a) => s + loadOf(a), 0) / 4
    const ratio = chronic > 0 ? acute / chronic : 1
    const yesterday = recent.filter((a) => a.local_date === addDays(date, -1)).reduce((s, a) => s + loadOf(a), 0)
    const hardYesterday = chronic > 0 && yesterday > chronic / 3
    let score = ratio <= 1.1 ? 85 : ratio <= 1.3 ? 70 : ratio <= 1.5 ? 50 : 30
    if (ratio < 0.6) score = 90
    if (hardYesterday) score -= 15
    comps.push({
      key: 'load',
      label: 'Trainingslast',
      score: clamp(score),
      weight: WEIGHTS.load,
      detail: `Letzte 7 Tage ${Math.round(ratio * 100)} % deines Schnitts${hardYesterday ? ', gestern hart' : ''}`,
    })
  }

  // Alkohol am Vorabend (nur wenn eingetragen).
  const drinks = drinksByDate[addDays(date, -1)]
  if (drinks != null) {
    comps.push({
      key: 'alcohol',
      label: 'Alkohol',
      score: alcoholScore(drinks),
      weight: WEIGHTS.alcohol,
      detail: drinks === 0 ? 'Gestern keiner' : `Gestern ${drinks} ${drinks === 1 ? 'Getränk' : 'Getränke'}`,
    })
  }

  // Beintraining macht die Beine für 24–48 h müde; Oberkörper und Core zählen nicht.
  const legs = legFatigue(date, gymByDate)
  if (legs) comps.push({ key: 'legs', label: 'Beine vom Krafttraining', score: legs.score, weight: WEIGHTS.legs, detail: legs.detail })

  // Ohne HRV und Schlaf ist der Wert nicht aussagekräftig.
  if (!comps.some((c) => c.key === 'hrv' || c.key === 'sleep')) return null

  const totalW = comps.reduce((s, c) => s + c.weight, 0)
  let score = comps.reduce((s, c) => s + c.score * c.weight, 0) / totalW
  // Ein sehr schlechter Einzelwert zieht den Gesamtwert spürbar runter.
  const worst = Math.min(...comps.map((c) => c.score))
  if (worst < 35) score = Math.min(score, worst + 25)
  score = Math.round(clamp(score))

  const status: ReadinessStatus = score >= 70 ? 'good' : score >= 50 ? 'warning' : score >= 35 ? 'serious' : 'critical'
  const weakest = [...comps].sort((a, b) => a.score - b.score)[0]
  const headline = { good: 'Bereit für Belastung', warning: 'Moderat trainieren', serious: 'Eher locker', critical: 'Erholung' }[status]
  const advice =
    status === 'good'
      ? 'Harte Einheiten wie geplant.'
      : status === 'warning'
        ? `Training wie geplant, aber nicht über das Soll hinaus. Am schwächsten: ${weakest.label}.`
        : status === 'serious'
          ? `Heute lieber locker statt hart. Grund vor allem: ${weakest.label}.`
          : `Dein Körper braucht Erholung. Grund vor allem: ${weakest.label}.`

  return { date, score, status, headline, advice, components: comps.sort((a, b) => b.weight - a.weight) }
}

/** Readiness für jeden Tag der Liste (für den Verlauf in Trends). */
export function readinessSeries(days: DailyMetrics[], activities: Activity[], drinksByDate: Record<string, number>, gymByDate: GymByDate = {}) {
  return days.map((d) => ({ date: d.date, value: readinessFor(d.date, days, activities, drinksByDate, gymByDate)?.score ?? null }))
}
