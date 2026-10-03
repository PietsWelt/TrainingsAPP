// Schutz vor Überlastung: Mehrere Tage am Stück schlechte Werte sind ein Warnzeichen, ein einzelner
// schlechter Tag nicht. Der Plan schraubt dann von selbst zurück, statt auf eine Verletzung zu warten.
// Die Readiness schaut auf heute; diese Prüfung schaut auf die letzten 7 Tage.

import { loadOf } from '../readiness'
import type { Activity, DailyMetrics } from '../types'
import { scaleWorkout, snapshot } from './adapt'
import { addDays, daysBetween } from './dates'
import { fitnessFrom } from './fitness'
import type { PlanWorkout, Step } from './types'

export type SignalKey = 'hrv' | 'rhr' | 'load' | 'sleep' | 'feel'

export interface OverloadSignal {
  key: SignalKey
  label: string
  detail: string
}

export interface OverloadCheck {
  /** 0 = alles im Rahmen, 1 = ein Warnzeichen, 2 = mehrere. */
  level: 0 | 1 | 2
  signals: OverloadSignal[]
}

/** Markierung im Titel, damit eine Anpassung nicht jeden Tag neu greift. */
export const MARK_LIGHT = 'Schonung'
export const MARK_DELOAD = 'Entlastung'

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
const sd = (xs: number[]) => {
  const m = mean(xs)
  return m == null || xs.length < 2 ? null : Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}
const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => x != null && Number.isFinite(x))

/**
 * Prüft die letzten 7 Tage gegen deine eigene Norm:
 * - HRV: Wochenschnitt unter deinem Normalbereich (Garmins HRV-Status, sonst 1 Standardabweichung unter dem Schnitt).
 * - Ruhepuls: Wochenschnitt mindestens 5 Schläge über deinem Schnitt.
 * - Trainingslast: letzte 7 Tage mehr als das 1,5-Fache deines 4-Wochen-Schnitts.
 * - Schlaf: im Schnitt unter 6 h oder über 1 h weniger als sonst.
 * - Gefühl: mindestens 2 Einheiten in 10 Tagen als „zu hart“ bewertet.
 */
export function overloadCheck(days: DailyMetrics[], activities: Activity[], workouts: PlanWorkout[], today: string): OverloadCheck {
  const signals: OverloadSignal[] = []
  const week = days.filter((d) => d.date > addDays(today, -7) && d.date <= today)
  const base = days.filter((d) => d.date <= addDays(today, -7) && d.date > addDays(today, -42))

  // HRV
  const latest = [...week].reverse().find((d) => d.hrv_weekly_avg != null && d.hrv_baseline_low != null)
  const hrvWeek = nums(week.map((d) => d.hrv_last_night))
  const hrvBase = nums(base.map((d) => d.hrv_last_night))
  if (latest && latest.hrv_weekly_avg! < latest.hrv_baseline_low!) {
    signals.push({ key: 'hrv', label: 'HRV', detail: `Wochenschnitt ${latest.hrv_weekly_avg} ms liegt unter deinem Normalbereich (ab ${latest.hrv_baseline_low} ms).` })
  } else if (!latest && hrvWeek.length >= 4 && hrvBase.length >= 14) {
    const m = mean(hrvWeek)!
    const bm = mean(hrvBase)!
    const bs = sd(hrvBase)!
    if (m < bm - bs) signals.push({ key: 'hrv', label: 'HRV', detail: `Wochenschnitt ${Math.round(m)} ms, sonst ${Math.round(bm)} ms.` })
  }

  // Ruhepuls
  const rhrWeek = nums(week.map((d) => d.resting_hr))
  const rhrBase = nums(base.map((d) => d.resting_hr))
  if (rhrWeek.length >= 4 && rhrBase.length >= 10) {
    const delta = mean(rhrWeek)! - mean(rhrBase)!
    if (delta >= 5) signals.push({ key: 'rhr', label: 'Ruhepuls', detail: `Wochenschnitt ${Math.round(delta)} Schläge über deinem Schnitt.` })
  }

  // Trainingslast
  const recent = activities.filter((a) => a.local_date <= today && a.local_date > addDays(today, -28))
  if (recent.length >= 6) {
    const acute = recent.filter((a) => a.local_date > addDays(today, -7)).reduce((s, a) => s + loadOf(a), 0)
    const chronic = recent.reduce((s, a) => s + loadOf(a), 0) / 4
    if (chronic > 0 && acute / chronic > 1.5) signals.push({ key: 'load', label: 'Trainingslast', detail: `Letzte 7 Tage ${Math.round((acute / chronic) * 100)} % deines Wochenschnitts.` })
  }

  // Schlaf
  const sleepWeek = nums(week.map((d) => d.sleep_s)).map((s) => s / 3600)
  const sleepBase = nums(base.map((d) => d.sleep_s)).map((s) => s / 3600)
  if (sleepWeek.length >= 5) {
    const m = mean(sleepWeek)!
    const bm = sleepBase.length >= 10 ? mean(sleepBase)! : null
    if (m < 6 || (bm != null && m < bm - 1)) {
      const h = Math.floor(m)
      signals.push({ key: 'sleep', label: 'Schlaf', detail: `Im Schnitt ${h}:${String(Math.round((m - h) * 60)).padStart(2, '0')} h pro Nacht${bm != null ? `, sonst ${bm.toFixed(1).replace('.', ',')} h` : ''}.` })
    }
  }

  // Gefühl: deine Bewertung oder die automatische Auswertung nach dem Lauf.
  const hard = workouts.filter((w) => w.status === 'done' && w.feedback === 'hard' && w.date > addDays(today, -10) && w.date <= today)
  if (hard.length >= 2) signals.push({ key: 'feel', label: 'Einheiten zu hart', detail: `${hard.length} Einheiten in 10 Tagen waren zu hart.` })

  return { level: signals.length >= 2 ? 2 : signals.length === 1 ? 1 : 0, signals }
}

/** Weniger Wiederholungen im harten Kern, mindestens 2. */
function fewerReps(steps: Step[] | null | undefined, f: number): Step[] | null | undefined {
  return steps?.map((s) => (s.type === 'repeat' ? { ...s, times: Math.max(2, Math.round(s.times * f)) } : s))
}

export interface Deload {
  changed: PlanWorkout[]
  messages: string[]
}

/**
 * Schraubt den Plan zurück:
 * - Ein Warnzeichen: harte Einheiten der nächsten 4 Tage etwa 20 % kürzer, Tempo bleibt.
 * - Mehrere: 7 Tage Entlastung, harte Einheiten werden locker, alles etwa 30 % kürzer.
 * Die Rennwoche bleibt, selbst angepasste Einheiten auch. „Ursprüngliche Einheit“ stellt alles wieder her.
 */
export function deload(all: PlanWorkout[], check: OverloadCheck, today: string, last?: { date: string; level: number } | null): Deload {
  if (check.level === 0) return { changed: [], messages: [] }
  const level = check.level
  const span = level === 2 ? 7 : 4
  // Hast du eine Anpassung zurückgenommen, bleibt es dabei: erst nach Ablauf wieder prüfen.
  if (last && last.level >= level && last.date > addDays(today, -span)) return { changed: [], messages: [] }
  // Schon passiert? Nur bei Verschärfung von „Schonung“ auf „Entlastung“ noch einmal.
  const recent = all.filter((w) => w.date > addDays(today, -span) && w.date < addDays(today, span))
  if (recent.some((w) => w.title.includes(MARK_DELOAD))) return { changed: [], messages: [] }
  if (level === 1 && recent.some((w) => w.title.includes(MARK_LIGHT))) return { changed: [], messages: [] }

  const races = all.filter((w) => w.sport === 'race').map((w) => w.date)
  const inRaceWeek = (d: string) => races.some((r) => r >= d && daysBetween(d, r) < 7)
  const names = check.signals.map((s) => s.label).join(', ')
  const changed: PlanWorkout[] = []
  for (const w of all) {
    if (w.status !== 'planned' || w.sport === 'race' || w.date < today || w.date >= addDays(today, span)) continue
    if (inRaceWeek(w.date) || w.title.includes(MARK_DELOAD)) continue
    if (w.original && !w.title.includes(MARK_LIGHT)) continue
    const orig = w.original ?? snapshot(w)
    if (level === 1) {
      if (!w.key_session) continue
      const x = { ...scaleWorkout(w, 0.8), steps: fewerReps(scaleWorkout(w, 0.8).steps, 0.75) }
      changed.push({ ...x, title: `${w.title} · ${MARK_LIGHT}`, description: `Etwas kürzer wegen eines Warnzeichens (${names}). Tempo bleibt. ${w.description ?? ''}`.trim(), original: orig })
      continue
    }
    const base = w.original ? { ...w, ...w.original } : w
    if (base.key_session && base.kind !== 'long') {
      const mins = Math.max(20, Math.round(((base.duration_min ?? 45) * 0.6) / 5) * 5)
      changed.push({
        ...base,
        kind: 'easy',
        key_session: false,
        steps: null,
        duration_min: mins,
        distance_km: base.distance_km != null ? Math.round(base.distance_km * 0.6 * 10) / 10 : null,
        title: `${base.sport === 'run' ? 'Lockerer Lauf' : `${base.title.split(':')[0]}: locker`} · ${MARK_DELOAD}`,
        description: `Entlastung wegen mehrerer Warnzeichen (${names}). Ganz locker im Gesprächstempo. Ursprünglich: ${base.title}.`,
        status: 'planned',
        original: orig,
      })
    } else {
      const x = scaleWorkout(base, 0.7)
      const steps = base.kind === 'long' ? null : x.steps
      changed.push({
        ...x,
        steps,
        status: 'planned',
        title: `${base.title.replace(` · ${MARK_LIGHT}`, '')} · ${MARK_DELOAD}`,
        description: `Entlastung wegen mehrerer Warnzeichen (${names}). ${base.kind === 'long' ? 'Kürzer und durchgehend ruhig, ohne schnelle Abschnitte.' : 'Etwas kürzer, locker bleiben.'}`,
        original: orig,
      })
    }
  }
  if (!changed.length) return { changed, messages: [] }
  const msg =
    level === 2
      ? `Mehrere Warnzeichen für Überlastung (${names}). Die nächsten 7 Tage sind eine Entlastung: harte Einheiten locker, alles etwas kürzer.`
      : `Ein Warnzeichen (${names}). Die harten Einheiten der nächsten Tage sind etwas kürzer, das Tempo bleibt.`
  return { changed, messages: [msg] }
}

/**
 * Kein Lauf soll mehr als 10 % länger sein als dein längster der letzten 30 Tage (Frandsen et al.
 * 2025, BJSM, 5200 Läufer: darüber steigt das Verletzungsrisiko deutlich). Hast du lange Läufe
 * ausgelassen, werden die nächsten deshalb gekürzt statt plötzlich weit länger zu sein.
 */
export function longRunGuard(all: PlanWorkout[], activities: Activity[], today: string): Deload {
  let longest = fitnessFrom(activities, today).longestRunKm
  if (longest < 5) return { changed: [], messages: [] }
  const changed: PlanWorkout[] = []
  const next = all.filter((w) => w.sport === 'run' && w.status === 'planned' && w.date >= today && w.date < addDays(today, 14)).sort((a, b) => a.date.localeCompare(b.date))
  for (const w of next) {
    const km = w.distance_km ?? 0
    const cap = Math.round(longest * 1.1 * 2) / 2
    if (km > cap + 0.5) {
      const x = scaleWorkout(w, cap / km)
      changed.push({ ...x, description: `Auf ${String(cap).replace('.', ',')} km gekürzt: höchstens 10 % länger als dein längster Lauf der letzten 30 Tage (${String(Math.round(longest * 10) / 10).replace('.', ',')} km), um das Verletzungsrisiko klein zu halten. ${w.description ?? ''}`.trim(), original: w.original ?? snapshot(w) })
      longest = cap
    } else longest = Math.max(longest, km)
  }
  if (!changed.length) return { changed, messages: [] }
  return { changed, messages: [changed.length === 1 ? 'Ein langer Lauf ist kürzer, weil er sonst deutlich länger wäre als deine letzten Läufe.' : `${changed.length} Läufe sind kürzer, weil sie sonst deutlich länger wären als deine letzten Läufe.`] }
}
