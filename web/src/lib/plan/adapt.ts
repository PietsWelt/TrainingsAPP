// Anpassungen am laufenden Plan: Überspringen (mit Verschieben wichtiger Einheiten),
// automatisches Abhaken anhand der Garmin-Aktivitäten, Fortschritt.

import { sportGroup } from '../format'
import type { Activity } from '../types'
import { addDays, mondayOf, WEEKDAY_LONG, weekday } from './dates'
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

function findSlot(plan: PlanWorkout[], w: PlanWorkout, today: string, raceDate?: string): string | null {
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
