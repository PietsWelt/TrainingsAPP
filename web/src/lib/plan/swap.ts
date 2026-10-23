// Einheiten selbst umlegen: auf einen anderen Tag derselben Woche schieben oder mit der Einheit
// dort tauschen. Z.B. den langen Lauf vom Sonntag heute machen und die heutige Einheit am Sonntag.

import { addDays, daysBetween, mondayOf, WEEKDAY_LONG, weekday } from './dates'
import type { Change } from './adapt'
import type { PlanWorkout } from './types'

export interface SwapDay {
  date: string
  /** Geplante Einheiten an diesem Tag, die beim Tausch auf den Tag der gewählten Einheit rutschen. */
  others: PlanWorkout[]
  /** Warum der Tag nicht geht (Renntag, schon trainiert). */
  blocked: string | null
  /** Geht, aber Vorsicht: z.B. zwei wichtige Einheiten direkt hintereinander. */
  warning: string | null
}

const isKey = (x: PlanWorkout) => x.key_session && x.sport !== 'race' && x.status !== 'skipped'

/** Herkunft merken; wer auf seinen ursprünglichen Tag zurückkommt, gilt nicht mehr als verschoben. */
function moveTo(x: PlanWorkout, date: string): PlanWorkout {
  const origin = x.moved_from ?? x.date
  return { ...x, date, moved_from: origin === date ? null : origin }
}

/** Die Einheiten, die beim Umlegen von `w` auf `date` ihren Tag wechseln. */
export function swapWorkouts(all: PlanWorkout[], w: PlanWorkout, date: string): Change {
  const others = all.filter((x) => x.date === date && x.id !== w.id && x.status === 'planned' && x.sport !== 'race')
  const changed = [moveTo(w, date), ...others.map((x) => moveTo(x, w.date))]
  const day = WEEKDAY_LONG[weekday(date)]
  const message = others.length
    ? `Getauscht: ${w.title} am ${day}, ${others.map((x) => x.title).join(' und ')} am ${WEEKDAY_LONG[weekday(w.date)]}.`
    : `${w.title} auf ${day} gelegt.`
  return { changed, message }
}

/**
 * Tage, auf die sich `w` legen lässt: ab heute bis Sonntag derselben Woche. Wochen bleiben, wie sie
 * sind, damit Umfang und Steigerung stimmen. Renntage und Tage mit erledigtem Training gehen nicht.
 */
export function swapDays(all: PlanWorkout[], w: PlanWorkout, today: string): SwapDay[] {
  if (w.status !== 'planned' || w.sport === 'race') return []
  const monday = mondayOf(w.date)
  const days: SwapDay[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i)
    if (date < today || date === w.date) continue
    const there = all.filter((x) => x.date === date && x.id !== w.id)
    const others = there.filter((x) => x.status === 'planned' && x.sport !== 'race')
    let blocked: string | null = null
    if (there.some((x) => x.sport === 'race')) blocked = 'Renntag'
    else if (there.some((x) => x.status === 'done')) blocked = 'Schon trainiert'
    days.push({ date, others, blocked, warning: blocked ? null : warningFor(all, w, date, others) })
  }
  return days
}

function warningFor(all: PlanWorkout[], w: PlanWorkout, date: string, others: PlanWorkout[]): string | null {
  const after = swapWorkouts(all, w, date).changed
  const plan = all.map((x) => after.find((c) => c.id === x.id) ?? x)
  if (plan.some((x) => x.sport === 'race' && daysBetween(date, x.date) === 1) && isKey(w)) return 'Am Tag vor dem Rennen lieber nichts Wichtiges.'
  // Nur Einheiten prüfen, die wandern: Was schon nebeneinander lag, ist nicht die Folge des Tauschs.
  for (const x of [w, ...others]) {
    if (!isKey(x)) continue
    const moved = after.find((c) => c.id === x.id)!
    const next = plan.find((y) => y.id !== x.id && isKey(y) && Math.abs(daysBetween(moved.date, y.date)) === 1)
    if (next) return `${moved.title} direkt neben ${next.title}: Zwischen zwei wichtigen Einheiten fehlt dann der Ruhetag.`
  }
  return null
}
