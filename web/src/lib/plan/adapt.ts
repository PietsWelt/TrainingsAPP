// Anpassungen am laufenden Plan: Überspringen (mit Verschieben wichtiger Einheiten),
// automatisches Abhaken anhand der Garmin-Aktivitäten, Fortschritt.

import { sportGroup } from '../format'
import type { Activity } from '../types'
import { addDays, mondayOf, WEEKDAY_LONG, weekday } from './dates'
import type { Readiness } from '../readiness'
import type { PlanWorkout } from './types'

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
    for (const x of next)
      changed.push({
        ...x,
        distance_km: x.distance_km != null ? Math.round(x.distance_km * 0.9 * 10) / 10 : null,
        duration_min: x.duration_min != null ? Math.round((x.duration_min * 0.9) / 5) * 5 : null,
      })
    if (next.length) message += ' Zwei Ausfälle diese Woche: Die nächste Woche ist 10 % leichter.'
  }
  return { changed, message }
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

const snapshot = (w: PlanWorkout): NonNullable<PlanWorkout['original']> => ({
  kind: w.kind,
  title: w.title,
  description: w.description,
  duration_min: w.duration_min,
  distance_km: w.distance_km,
  key_session: w.key_session,
  status: w.status,
})

/**
 * Schlägt bei niedriger Readiness vor, die harte Einheit des Tages zu entschärfen:
 * locker statt hart, auf einen späteren Tag der Woche verschieben oder (bei sehr niedrigem Wert) Ruhetag.
 */
export function readinessProposal(all: PlanWorkout[], today: string, r: Readiness | null): ReadinessProposal | null {
  if (!r || (r.status !== 'serious' && r.status !== 'critical')) return null
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
    description: `Angepasst wegen niedriger Readiness (${r.score}). Ganz locker im Gesprächstempo, Zone 1–2. Ursprünglich: ${w.title}.`,
    duration_min: mins,
    distance_km: w.distance_km != null ? Math.round(w.distance_km * 0.6 * 10) / 10 : null,
    key_session: false,
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

  if (r.status === 'critical') {
    options.push({
      id: 'rest',
      label: 'Ruhetag',
      changed: [{ ...w, status: 'skipped', original: snapshot(w) }],
      message: 'Heute Ruhetag. Erholung bringt dich gerade weiter als Training.',
    })
  }

  return {
    workout: w,
    reason: `Deine Readiness ist heute niedrig (${r.score}). Wie willst du die Einheit angehen?`,
    options: r.status === 'critical' ? [...options].sort((a) => (a.id === 'rest' ? -1 : 0)) : options,
  }
}

/** Stellt eine wegen Readiness angepasste Einheit wieder her. */
export function restoreOriginal(w: PlanWorkout): PlanWorkout {
  if (!w.original) return w
  return { ...w, ...w.original, original: null }
}
