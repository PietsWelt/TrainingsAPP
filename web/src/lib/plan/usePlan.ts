// Lädt Rennen und Plan, hakt Einheiten anhand der Garmin-Aktivitäten ab und bietet alle Aktionen.

import { useCallback, useEffect, useState } from 'react'
import type { Best } from '../records'
import type { Activity, DailyMetrics, GarminLactate } from '../types'
import { autoComplete, fillSteps, giveFeedback, isPartial, refreshHrTargets, skipWorkout } from './adapt'
import { analyzeRun, merge, shiftPaces } from './analyze'
import { catchUp, reentry } from './catchup'
import { sportGroup } from '../format'
import { toast } from '../toast'
import { addDays, localToday } from './dates'
import { fitnessFrom } from './fitness'
import { generateAll } from './multi'
import { deload, longRunGuard, overloadCheck } from './overload'
import { addToList, appState, getState, setState } from '../appState'
import { hasColumn, planStore } from './store'
import type { Feedback, PlanWorkout, RaceEvent } from './types'

export interface PlanState {
  events: RaceEvent[]
  workouts: PlanWorkout[]
  loading: boolean
  error: string | null
  saveEvent(e: RaceEvent, isNew: boolean): Promise<void>
  deleteEvent(id: string): Promise<void>
  /** Legt das Hauptrennen fest und stimmt alle Pläne ab morgen neu ab. */
  setPriority(id: string): Promise<void>
  setStatus(w: PlanWorkout, status: PlanWorkout['status']): Promise<void>
  skip(w: PlanWorkout): Promise<string>
  /** Speichert beliebige geänderte Einheiten (z.B. Anpassung an die Readiness). */
  applyChanges(changed: PlanWorkout[]): Promise<void>
  /** Plant alle kommenden Rennen ab morgen neu, z.B. damit die Tempos zur gemessenen Schwelle passen. */
  replan(): Promise<void>
  /** Einschätzung nach der Einheit; liefert den Hinweistext. */
  rate(w: PlanWorkout, feedback: Feedback | null): Promise<string>
}

// Nur diese Felder ändern den Plan; Name und Notizen nicht.
const PLAN_FIELDS = ['date', 'type', 'goal_time_s', 'days_per_week', 'long_day', 'priority'] as const

function friendly(e: unknown): string {
  const msg = (e as Error).message ?? String(e)
  if (/relation .*(events|plan_workouts).* does not exist|Could not find the table/i.test(msg))
    return 'Die Plan-Tabellen fehlen noch in Supabase. Bitte einmal supabase/migrations/0002_plan.sql im SQL-Editor ausführen.'
  return msg
}

/** `day` ändert sich beim ersten Öffnen an einem neuen Tag, damit Verpasstes auch ohne neue Daten nachgezogen wird. */
// Feste leere Liste: ein neues [] bei jedem Aufruf würde den Plan endlos neu laden.
const NO_METRICS: DailyMetrics[] = []
const NO_RECORDS: Best[] = []
const NO_LACTATE: GarminLactate[] = []
// Aktivitäten, deren automatischen Haken du entfernt hast: werden keiner Einheit mehr zugeordnet.
// Liegen in app_state, damit ein am Handy entfernter Haken nicht am PC zurückkommt.
const readReleased = (): number[] => getState<number[]>('plan.released', [])
const release = (id: number) => void addToList('plan.released', id)
const readApplied = () => getState<{ date: string; level: number } | null>('overload.applied', null)

export function usePlan(
  activities: Activity[] | undefined,
  day = localToday(),
  metrics: DailyMetrics[] = NO_METRICS,
  records: Best[] = NO_RECORDS,
  lactate: GarminLactate[] = NO_LACTATE,
): PlanState {
  const [events, setEvents] = useState<RaceEvent[]>([])
  const [workouts, setWorkouts] = useState<PlanWorkout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    // Ohne Aktivitäten nichts rechnen: sonst läuft alles doppelt, einmal davon mit leerer Fitness.
    if (!activities) return
    try {
      // Erst den geteilten Stand abwarten: sonst setzt ein Gerät Haken wieder, die ein anderes entfernt hat.
      const [ev, ws] = await Promise.all([planStore.listEvents(), planStore.listWorkouts(), appState.ready()])
      const today = day
      const released = new Set(readReleased())
      const usable = activities.filter((a) => !released.has(a.id))
      const done = autoComplete(ws, usable, today)
      const fitness = fitnessFrom(activities, today, records, lactate)
      // Ablauf für die Uhr bei älteren Plänen nachtragen (Plan ab heute neu berechnen, nur Abläufe übernehmen).
      const fresh = hasColumn('steps') ? generateAll(ev, fitness, addDays(today, -1), () => crypto.randomUUID()) : []
      const filled = hasColumn('steps')
        ? ev
            .filter((e) => e.date >= today)
            .flatMap((e) => fillSteps(ws.filter((w) => w.event_id === e.id && !done.some((d) => d.id === w.id)), fresh.filter((w) => w.event_id === e.id), today))
        : []
      // Frisch erledigte Läufe mit Uhr-Daten automatisch auswerten (nur die letzten 3 Tage, nie rückwirkend).
      let current = ws.map((w) => [...done, ...filled].find((c) => c.id === w.id) ?? w)
      // Verpasstes auslassen oder als ersetzt werten, nach einer Pause sanft wieder einsteigen.
      let tidy: PlanWorkout[] = []
      if (activities) {
        const cu = catchUp(current, usable, today, new Date().getHours())
        current = current.map((w) => cu.changed.find((c) => c.id === w.id) ?? w)
        const re = reentry(current, activities, today)
        current = current.map((w) => re.changed.find((c) => c.id === w.id) ?? w)
        tidy = merge(cu.changed, re.changed)
        const notes = [...cu.messages, ...re.messages]
        if (notes.length) toast(`Plan angepasst: ${notes.join(' ')}`)
      }
      // Puls-Ziele für lockere Läufe an die aktuelle aerobe Schwelle anpassen.
      const hr = hasColumn('steps') ? refreshHrTargets(current, fitness.aetHr, today) : []
      current = current.map((w) => hr.find((c) => c.id === w.id) ?? w)
      let analyzed: PlanWorkout[] = []
      if (hasColumn('feedback') && activities) {
        for (const w of current) {
          if (w.status !== 'done' || w.feedback || w.activity_id == null || w.date < addDays(today, -3)) continue
          const act = activities.find((a) => a.id === w.activity_id)
          // Deutlich kürzer als geplant: sagt nichts über das Tempo der vollen Einheit, also nicht anpassen.
          if (isPartial(w, act)) continue
          // Ersatzsport (z.B. Rad statt Lauf) wird nicht als Lauf ausgewertet.
          const res = act && sportGroup(act.sport) === w.sport && analyzeRun(w, act, activities)
          if (!res) continue
          const fb = giveFeedback(current, w.id, res.verdict, today).changed
          const step = merge(fb, shiftPaces(merge(current, fb), w, res.group, res.paceShift, today))
          analyzed = merge(analyzed, step)
          current = current.map((x) => step.find((c) => c.id === x.id) ?? x)
        }
      }
      // Schutz vor Überlastung: zu große Sprünge beim langen Lauf kappen, bei Warnzeichen zurückschrauben.
      let safety: PlanWorkout[] = []
      if (activities) {
        const guard = longRunGuard(current, activities, today)
        current = current.map((w) => guard.changed.find((c) => c.id === w.id) ?? w)
        const check = overloadCheck(metrics, activities, current, today)
        const dl = deload(current, check, today, readApplied())
        current = current.map((w) => dl.changed.find((c) => c.id === w.id) ?? w)
        if (dl.changed.length) void setState('overload.applied', { date: today, level: check.level })
        safety = merge(guard.changed, dl.changed)
        const notes = [...guard.messages, ...dl.messages]
        if (notes.length) toast(`Plan angepasst: ${notes.join(' ')}`)
      }
      const all = merge(done, filled, tidy, hr, analyzed, safety)
      if (all.length) await planStore.updateWorkouts(all)
      const byId = new Map(current.map((w) => [w.id, w]))
      setEvents(ev)
      setWorkouts(ws.map((w) => byId.get(w.id) ?? w))
      setError(null)
    } catch (e) {
      setError(friendly(e))
    } finally {
      setLoading(false)
    }
  }, [activities, day, metrics, records, lactate])

  useEffect(() => {
    void reload()
  }, [reload])

  const apply = (changed: PlanWorkout[]) => {
    const byId = new Map(changed.map((w) => [w.id, w]))
    setWorkouts((ws) => ws.map((w) => byId.get(w.id) ?? w).sort((a, b) => a.date.localeCompare(b.date)))
  }

  /**
   * Plant alle kommenden Rennen ab morgen gemeinsam neu: Hauptrennen voll, Nebenrennen eingebaut.
   * Vergangenes bleibt. Mit nur einem Rennen ist das genau der Plan dieses Rennens.
   */
  async function replanAll(list: RaceEvent[]) {
    const today = localToday()
    const tomorrow = addDays(today, 1)
    const plan = generateAll(list, fitnessFrom(activities ?? [], today, records, lactate), today, () => crypto.randomUUID())
    for (const e of list.filter((x) => x.date >= tomorrow)) await planStore.replaceFrom(e.id, tomorrow, plan.filter((w) => w.event_id === e.id))
  }

  return {
    events,
    workouts,
    loading,
    error,
    async saveEvent(e, isNew) {
      const before = events.find((x) => x.id === e.id)
      // Höchstens ein Hauptrennen: das bisherige zuerst zurücksetzen.
      if (e.priority) for (const x of events) if (x.priority && x.id !== e.id) await planStore.saveEvent({ ...x, priority: false })
      await planStore.saveEvent(e)
      const replan = isNew || !before || PLAN_FIELDS.some((k) => (before[k] ?? false) !== (e[k] ?? false))
      if (replan) {
        const list = [...events.filter((x) => x.id !== e.id).map((x) => (e.priority ? { ...x, priority: false } : x)), e]
        await replanAll(list)
      }
      await reload()
    },
    async deleteEvent(id) {
      await planStore.deleteEvent(id)
      // Ein Nebenrennen fällt weg oder ein anderes wird Hauptrennen: die übrigen neu abstimmen.
      const rest = events.filter((x) => x.id !== id)
      if (events.find((x) => x.id === id && x.date > localToday()) && rest.some((x) => x.date > localToday())) await replanAll(rest)
      await reload()
    },
    async setPriority(id) {
      const list = events.map((x) => ({ ...x, priority: x.id === id }))
      for (const x of events) if (x.priority && x.id !== id) await planStore.saveEvent({ ...x, priority: false })
      await planStore.saveEvent(list.find((x) => x.id === id)!)
      await replanAll(list)
      await reload()
    },
    async replan() {
      await replanAll(events)
      await reload()
    },
    async setStatus(w, status) {
      if (status !== 'done' && w.activity_id != null) release(w.activity_id)
      const changed = { ...w, status, activity_id: status === 'done' ? w.activity_id : null }
      await planStore.updateWorkouts([changed])
      apply([changed])
    },
    async applyChanges(changed) {
      await planStore.updateWorkouts(changed)
      apply(changed)
    },
    async rate(w, feedback) {
      if (!hasColumn('feedback')) throw new Error('Zum Speichern bitte einmal supabase/migrations/0004_feedback_watch.sql im SQL-Editor ausführen.')
      const today = localToday()
      const { changed, message } = giveFeedback(workouts, w.id, feedback, today)
      // Weichst du von der automatischen Auswertung ab, wird deren Tempo-Anpassung zurückgenommen.
      const act = w.activity_id != null ? activities?.find((a) => a.id === w.activity_id) : undefined
      const auto = act && !isPartial(w, act) ? analyzeRun(w, act, activities) : null
      const undo = auto && auto.paceShift && w.feedback === auto.verdict && feedback !== auto.verdict ? shiftPaces(workouts, w, auto.group, -auto.paceShift, today) : []
      const all = merge(changed, undo)
      await planStore.updateWorkouts(all)
      apply(all)
      return undo.length ? `${message} Die Tempo-Anpassung von vorhin ist zurückgenommen.` : message
    },
    async skip(w) {
      const { changed, message } = skipWorkout(workouts, w.id, localToday())
      await planStore.updateWorkouts(changed)
      apply(changed)
      return message
    },
  }
}
