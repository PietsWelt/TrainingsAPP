// Anpassungen am laufenden Plan: Überspringen (mit Verschieben wichtiger Einheiten),
// automatisches Abhaken anhand der Garmin-Aktivitäten, Fortschritt.

import { sportGroup } from '../format'
import type { Activity } from '../types'
import { addDays, mondayOf, WEEKDAY_LONG, weekday } from './dates'
import type { Readiness } from '../readiness'
import type { Feedback, PlanWorkout, Step } from './types'

export interface Change {
  changed: PlanWorkout[]
  message: string
}

/**
 * Überspringt eine Einheit. Wichtige Einheiten (Intervalle, langer Lauf …) werden,
 * wenn möglich, auf einen freien Tag derselben Woche verschoben – mit mindestens einem
 * Tag Abstand zu anderen harten Einheiten. Verpasster Umfang wird nicht nachgeholt;
 * fallen in einer Woche zwei Einheiten aus, wird die Folgewoche um 10 % leichter.
 */
export function skipWorkout(all: PlanWorkout[], id: string, today: string): Change {
  const w = all.find((x) => x.id === id)
  if (!w) return { changed: [], message: '' }
  const plan = all.filter((x) => x.event_id === w.event_id)
  const raceDate = plan.find((x) => x.sport === 'race')?.date
  const changed: PlanWorkout[] = []
  let message: string

  const target = w.key_session && w.phase !== 'taper' && w.sport !== 'race' ? findSlot(plan, w, today, raceDate) : null
  if (target) {
    const replaced = plan.find((x) => x.date === target && x.id !== w.id && x.status === 'planned')
    if (replaced) changed.push({ ...replaced, status: 'skipped' })
    changed.push({ ...w, date: target, moved_from: w.moved_from ?? w.date, status: 'planned' })
    message = `${w.title} auf ${WEEKDAY_LONG[weekday(target)]} verschoben${replaced ? ` (statt „${replaced.title}“)` : ''}.`
  } else {
    changed.push({ ...w, status: 'skipped' })
    message = w.key_session
      ? 'Übersprungen. Diese Woche passt sie nicht mehr sinnvoll rein, also nicht nachholen.'
      : 'Übersprungen. Kein Problem, nicht nachholen.'
  }

  // Zwei Ausfälle in einer Woche: nächste Woche etwas leichter.
  const monday = mondayOf(w.date)
  const nextMonday = addDays(monday, 7)
  const skippedThisWeek = plan.filter(
    (x) => x.date >= monday && x.date < nextMonday && (x.status === 'skipped' || changed.some((c) => c.id === x.id && c.status === 'skipped')),
  )
  if (skippedThisWeek.length === 2 && !target) {
    const next = plan.filter((x) => x.date >= nextMonday && x.date < addDays(nextMonday, 7) && x.status === 'planned' && x.sport !== 'race')
    for (const x of next) changed.push(scaleWorkout(x, 0.9))
    if (next.length) message += ' Zwei Ausfälle diese Woche: Die nächste Woche ist 10 % leichter.'
  }
  return { changed, message }
}

/**
 * Ändert den Umfang einer Einheit. Der harte Kern (Intervalle, Tempoblöcke) bleibt gleich,
 * bei Läufen ohne Wiederholungen wird der lockere erste Abschnitt angepasst.
 */
export function scaleWorkout(w: PlanWorkout, f: number): PlanWorkout {
  const distance_km = w.distance_km != null ? Math.round(w.distance_km * f * 10) / 10 : null
  let steps = w.steps
  if (steps?.length && !steps.some((s) => s.type === 'repeat')) {
    const [first, ...rest] = steps
    if (first.type !== 'repeat' && first.m) steps = [{ ...first, m: Math.max(1000, Math.round((first.m * f) / 100) * 100) }, ...rest]
  }
  return { ...w, distance_km, duration_min: w.duration_min != null ? Math.round((w.duration_min * f) / 5) * 5 : null, steps }
}

export function findSlot(plan: PlanWorkout[], w: PlanWorkout, today: string, raceDate?: string): string | null {
  const monday = mondayOf(w.date)
  const isHard = (date: string) => plan.some((x) => x.id !== w.id && x.date === date && x.key_session && x.status !== 'skipped')
  const candidates: { date: string; free: boolean; dist: number }[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i)
    if (date <= today || date === w.date) continue
    if (raceDate && date >= addDays(raceDate, -1)) continue
    if (isHard(date) || isHard(addDays(date, -1)) || isHard(addDays(date, 1))) continue
    const others = plan.filter((x) => x.id !== w.id && x.date === date && x.status !== 'skipped')
    if (others.some((x) => x.status === 'done')) continue
    const free = others.length === 0
    if (!free && others.some((x) => x.key_session)) continue
    // Später bevorzugen, freie Tage vor Tagen mit lockerer Einheit.
    candidates.push({ date, free, dist: date > w.date ? i : i + 7 })
  }
  candidates.sort((a, b) => Number(b.free) - Number(a.free) || a.dist - b.dist)
  return candidates[0]?.date ?? null
}

/** Hakt geplante Einheiten ab, zu denen es am selben Tag eine passende Garmin-Aktivität gibt. */
export function autoComplete(plan: PlanWorkout[], activities: Activity[], today: string): PlanWorkout[] {
  const used = new Set(plan.map((w) => w.activity_id).filter((x): x is number => x != null))
  const changed: PlanWorkout[] = []
  for (const w of plan) {
    if (w.status !== 'planned' || w.date > today) continue
    const want = w.sport === 'race' ? null : w.sport
    const match = activities.find((a) => {
      if (a.local_date !== w.date || used.has(a.id)) return false
      const g = sportGroup(a.sport)
      return want ? g === want : g === 'run' || a.sport.includes('multi') || a.sport.includes('triathlon')
    })
    if (match) {
      used.add(match.id)
      changed.push({ ...w, status: 'done', activity_id: match.id })
    }
  }
  return changed
}

export interface Progress {
  total: number
  done: number
  skipped: number
  dueSoFar: number
  doneSoFar: number
  daysToRace: number | null
}

export function progressOf(plan: PlanWorkout[], today: string): Progress {
  const sessions = plan.filter((w) => w.sport !== 'race')
  const race = plan.find((w) => w.sport === 'race')
  const due = sessions.filter((w) => w.date <= today)
  return {
    total: sessions.length,
    done: sessions.filter((w) => w.status === 'done').length,
    skipped: sessions.filter((w) => w.status === 'skipped').length,
    dueSoFar: due.length,
    doneSoFar: due.filter((w) => w.status === 'done').length,
    daysToRace: race ? Math.round((Date.parse(race.date) - Date.parse(today)) / 86400_000) : null,
  }
}

// ---------- Anpassung an die Tagesform ----------

export interface ReadinessOption {
  id: 'easy' | 'move' | 'rest'
  label: string
  changed: PlanWorkout[]
  message: string
}

export interface ReadinessProposal {
  workout: PlanWorkout
  reason: string
  options: ReadinessOption[]
}

export const snapshot = (w: PlanWorkout): NonNullable<PlanWorkout['original']> => ({
  kind: w.kind,
  title: w.title,
  description: w.description,
  duration_min: w.duration_min,
  distance_km: w.distance_km,
  key_session: w.key_session,
  status: w.status,
  steps: w.steps ?? null,
})

/**
 * Schlägt bei niedriger Readiness vor, die harte Einheit des Tages zu entschärfen:
 * locker statt hart, auf einen späteren Tag der Woche verschieben oder (bei sehr niedrigem Wert) Ruhetag.
 */
export function readinessProposal(all: PlanWorkout[], today: string, r: Readiness | null): ReadinessProposal | null {
  if (!r || (r.status !== 'serious' && r.status !== 'critical')) return null
  return proposalFor(all, today, `niedriger Readiness (${r.score})`, `Deine Readiness ist heute niedrig (${r.score}). Wie willst du die Einheit angehen?`, r.status === 'critical')
}

/**
 * Nach Beintraining sind die Beine 24–48 h müde und laufen unökonomischer. Steht dann eine
 * harte Laufeinheit an, gibt es dieselben Optionen wie bei niedriger Readiness.
 */
export function legsProposal(all: PlanWorkout[], today: string, legs: { daysAgo: number; hard: boolean } | null): ReadinessProposal | null {
  if (!legs || (legs.daysAgo === 2 && !legs.hard)) return null
  const w = all.find((x) => x.date === today && x.status === 'planned' && x.key_session && x.sport !== 'race' && !x.original)
  if (!w) return null
  const when = legs.daysAgo === 1 ? 'Gestern' : 'Vorgestern'
  return proposalFor(all, today, 'Beintraining', `${when} Beine trainiert: Das kann harte Einheiten noch 1–2 Tage schwerer machen, ${w.title} bringt dann weniger. Wie willst du die Einheit angehen?`, false)
}

function proposalFor(all: PlanWorkout[], today: string, cause: string, reason: string, critical: boolean): ReadinessProposal | null {
  const w = all.find((x) => x.date === today && x.status === 'planned' && x.key_session && x.sport !== 'race' && !x.original)
  if (!w) return null

  const plan = all.filter((x) => x.event_id === w.event_id)
  const raceDate = plan.find((x) => x.sport === 'race')?.date
  const options: ReadinessOption[] = []

  const mins = Math.max(20, Math.round(((w.duration_min ?? 45) * 0.6) / 5) * 5)
  const easy: PlanWorkout = {
    ...w,
    kind: 'easy',
    title: w.sport === 'run' ? 'Lockerer Lauf (angepasst)' : `${w.title.split(':')[0]}: locker (angepasst)`,
    description: `Angepasst wegen ${cause}. Ganz locker im Gesprächstempo, Zone 1–2. Ursprünglich: ${w.title}.`,
    duration_min: mins,
    distance_km: w.distance_km != null ? Math.round(w.distance_km * 0.6 * 10) / 10 : null,
    key_session: false,
    steps: null,
    original: snapshot(w),
  }
  options.push({ id: 'easy', label: 'Locker statt hart', changed: [easy], message: `${w.title} heute durch ${mins} min locker ersetzt.` })

  if (w.phase !== 'taper') {
    const slot = findSlot(plan, w, today, raceDate)
    if (slot) {
      const replaced = plan.find((x) => x.date === slot && x.id !== w.id && x.status === 'planned')
      const changed: PlanWorkout[] = [{ ...w, date: slot, moved_from: w.moved_from ?? w.date }]
      if (replaced) changed.push({ ...replaced, status: 'skipped' })
      options.push({
        id: 'move',
        label: `Auf ${WEEKDAY_LONG[weekday(slot)]} verschieben`,
        changed,
        message: `${w.title} auf ${WEEKDAY_LONG[weekday(slot)]} verschoben. Heute frei oder ganz locker.`,
      })
    }
  }

  if (critical) {
    options.push({
      id: 'rest',
      label: 'Ruhetag',
      changed: [{ ...w, status: 'skipped', original: snapshot(w) }],
      message: 'Heute Ruhetag. Erholung bringt dich gerade weiter als Training.',
    })
  }

  return { workout: w, reason, options: critical ? [...options].sort((a) => (a.id === 'rest' ? -1 : 0)) : options }
}

/** Stellt eine wegen Readiness angepasste Einheit wieder her. */
export function restoreOriginal(w: PlanWorkout): PlanWorkout {
  if (!w.original) return w
  return { ...w, ...w.original, original: null }
}

// ---------- Rückmeldung nach der Einheit ----------

export const FEEDBACK_LABEL = { easy: 'Zu leicht', ok: 'Passend', hard: 'Zu hart' } as const

/**
 * Speichert die Einschätzung zu einer Einheit. Zweimal hintereinander „zu hart“ macht die nächsten
 * 7 Tage 10 % leichter, zweimal „zu leicht“ die lockeren und langen Einheiten 5 % länger.
 * Einzelne Ausreißer ändern nichts. Tapering und Rennen bleiben unangetastet.
 */
export function giveFeedback(all: PlanWorkout[], id: string, feedback: Feedback | null, today: string): Change {
  const w = all.find((x) => x.id === id)
  if (!w) return { changed: [], message: '' }
  const rated: PlanWorkout = { ...w, feedback }
  const changed: PlanWorkout[] = [rated]
  if (!feedback || feedback === 'ok' || feedback === w.feedback) return { changed, message: 'Danke, notiert.' }

  // Bewertete Einheiten dieses Plans bis einschließlich dieser, neueste zuerst.
  const history = all
    .filter((x) => x.event_id === w.event_id && x.id !== w.id && x.feedback && x.date <= w.date)
    .concat(rated)
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.id === w.id) - Number(a.id === w.id))
  let streak = 0
  for (const x of history) {
    if (x.feedback !== feedback) break
    streak++
  }
  if (streak < 2 || streak % 2 !== 0) return { changed, message: 'Danke, notiert. Kommt das öfter vor, passe ich den Plan an.' }

  const until = addDays(today, 7)
  const next = all.filter(
    (x) => x.event_id === w.event_id && x.date > today && x.date <= until && x.status === 'planned' && x.sport !== 'race' && x.phase !== 'taper',
  )
  if (feedback === 'hard') {
    for (const x of next) changed.push(scaleWorkout(x, 0.9))
    return {
      changed,
      message: next.length ? 'Zweimal hintereinander zu hart: Die nächsten 7 Tage sind 10 % leichter.' : 'Notiert. Die nächsten Tage sind schon locker genug.',
    }
  }
  const longer = next.filter((x) => x.kind === 'easy' || x.kind === 'long' || x.kind === 'recovery')
  for (const x of longer) changed.push(scaleWorkout(x, 1.05))
  return {
    changed,
    message: longer.length ? 'Zweimal hintereinander zu leicht: Lockere und lange Einheiten der nächsten 7 Tage sind 5 % länger.' : 'Notiert.',
  }
}

// ---------- Ablauf für ältere Pläne nachtragen ----------

/** Passt den lockeren ersten Abschnitt so an, dass die Summe der Strecke der Einheit entspricht. */
function fitSteps(steps: Step[], distanceKm: number | null): Step[] {
  if (!distanceKm || steps.some((s) => s.type === 'repeat')) return steps
  const [first, ...rest] = steps
  if (first.type === 'repeat' || !first.m || rest.some((s) => s.type === 'repeat' || (!s.m && s.time_s))) return steps
  const others = rest.reduce((a, s) => a + (s.type !== 'repeat' && s.m ? s.m : 0), 0)
  return [{ ...first, m: Math.max(1000, Math.round(distanceKm * 10) * 100 - others) }, ...rest]
}

/**
 * Pläne von vor Etappe 4 haben keinen Ablauf für die Uhr. Der Ablauf wird aus einem frisch
 * erzeugten Plan übernommen (gleicher Tag und Titel); Umfang und Anpassungen bleiben, wie sie sind.
 */
export function fillSteps(plan: PlanWorkout[], fresh: PlanWorkout[], today: string): PlanWorkout[] {
  const byKey = new Map(fresh.filter((w) => w.steps?.length).map((w) => [`${w.date}|${w.title}`, w.steps!]))
  const changed: PlanWorkout[] = []
  for (const w of plan) {
    if (w.status !== 'planned' || w.date < today || w.sport !== 'run' || w.steps != null || w.original) continue
    const steps = byKey.get(`${w.moved_from ?? w.date}|${w.title}`)
    if (steps) changed.push({ ...w, steps: fitSteps(steps, w.distance_km) })
  }
  return changed
}
