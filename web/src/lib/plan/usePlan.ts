// Lädt Rennen und Plan, hakt Einheiten anhand der Garmin-Aktivitäten ab und bietet alle Aktionen.

import { useCallback, useEffect, useState } from 'react'
import type { Activity } from '../types'
import { autoComplete, fillSteps, giveFeedback, skipWorkout } from './adapt'
import { analyzeRun, merge, shiftPaces } from './analyze'
import { catchUp, reentry } from './catchup'
import { sportGroup } from '../format'
import { toast } from '../toast'
import { addDays, localToday } from './dates'
import { fitnessFrom } from './fitness'
import { generatePlan } from './generate'
import { hasColumn, planStore } from './store'
import type { Feedback, PlanWorkout, RaceEvent } from './types'

export interface PlanState {
  events: RaceEvent[]
  workouts: PlanWorkout[]
  loading: boolean
  error: string | null
  saveEvent(e: RaceEvent, isNew: boolean): Promise<void>
  deleteEvent(id: string): Promise<void>
  setStatus(w: PlanWorkout, status: PlanWorkout['status']): Promise<void>
  skip(w: PlanWorkout): Promise<string>
  /** Speichert beliebige geänderte Einheiten (z.B. Anpassung an die Readiness). */
  applyChanges(changed: PlanWorkout[]): Promise<void>
  /** Einschätzung nach der Einheit; liefert den Hinweistext. */
  rate(w: PlanWorkout, feedback: Feedback | null): Promise<string>
}

// Nur diese Felder ändern den Plan; Name und Notizen nicht.
const PLAN_FIELDS = ['date', 'type', 'goal_time_s', 'days_per_week', 'long_day'] as const

function friendly(e: unknown): string {
  const msg = (e as Error).message ?? String(e)
  if (/relation .*(events|plan_workouts).* does not exist|Could not find the table/i.test(msg))
    return 'Die Plan-Tabellen fehlen noch in Supabase. Bitte einmal supabase/migrations/0002_plan.sql im SQL-Editor ausführen.'
  return msg
}

export function usePlan(activities: Activity[] | undefined): PlanState {
  const [events, setEvents] = useState<RaceEvent[]>([])
  const [workouts, setWorkouts] = useState<PlanWorkout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [ev, ws] = await Promise.all([planStore.listEvents(), planStore.listWorkouts()])
      const today = localToday()
      const done = activities ? autoComplete(ws, activities, today) : []
      // Ablauf für die Uhr bei älteren Plänen nachtragen (Plan ab heute neu berechnen, nur Abläufe übernehmen).
      const filled = hasColumn('steps')
        ? ev
            .filter((e) => e.date >= today)
            .flatMap((e) => {
              const fresh = generatePlan(e, fitnessFrom(activities ?? [], today), addDays(today, -1), () => crypto.randomUUID())
              return fillSteps(ws.filter((w) => w.event_id === e.id && !done.some((d) => d.id === w.id)), fresh, today)
            })
        : []
      // Frisch erledigte Läufe mit Uhr-Daten automatisch auswerten (nur die letzten 3 Tage, nie rückwirkend).
      let current = ws.map((w) => [...done, ...filled].find((c) => c.id === w.id) ?? w)
      // Verpasstes auslassen oder als ersetzt werten, nach einer Pause sanft wieder einsteigen.
      let tidy: PlanWorkout[] = []
      if (activities) {
        const cu = catchUp(current, activities, today, new Date().getHours())
        current = current.map((w) => cu.changed.find((c) => c.id === w.id) ?? w)
        const re = reentry(current, activities, today)
        current = current.map((w) => re.changed.find((c) => c.id === w.id) ?? w)
        tidy = merge(cu.changed, re.changed)
        const notes = [...cu.messages, ...re.messages]
        if (notes.length) toast(`Plan angepasst: ${notes.join(' ')}`)
      }
      let analyzed: PlanWorkout[] = []
      if (hasColumn('feedback') && activities) {
        for (const w of current) {
          if (w.status !== 'done' || w.feedback || w.activity_id == null || w.date < addDays(today, -3)) continue
          const act = activities.find((a) => a.id === w.activity_id)
          // Ersatzsport (z.B. Rad statt Lauf) wird nicht als Lauf ausgewertet.
          const res = act && sportGroup(act.sport) === w.sport && analyzeRun(w, act)
          if (!res) continue
          const fb = giveFeedback(current, w.id, res.verdict, today).changed
          const step = merge(fb, shiftPaces(merge(current, fb), w, res.group, res.paceShift, today))
          analyzed = merge(analyzed, step)
          current = current.map((x) => step.find((c) => c.id === x.id) ?? x)
        }
      }
      const all = merge(done, filled, tidy, analyzed)
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
  }, [activities])

  useEffect(() => {
    void reload()
  }, [reload])

  const apply = (changed: PlanWorkout[]) => {
    const byId = new Map(changed.map((w) => [w.id, w]))
    setWorkouts((ws) => ws.map((w) => byId.get(w.id) ?? w).sort((a, b) => a.date.localeCompare(b.date)))
  }

  return {
    events,
    workouts,
    loading,
    error,
    async saveEvent(e, isNew) {
      const before = events.find((x) => x.id === e.id)
      await planStore.saveEvent(e)
      const replan = isNew || !before || PLAN_FIELDS.some((k) => before[k] !== e[k])
      if (replan) {
        // Vergangenes bleibt, ab morgen wird neu geplant.
        const today = localToday()
        const plan = generatePlan(e, fitnessFrom(activities ?? [], today), today, () => crypto.randomUUID())
        await planStore.replaceFrom(e.id, addDays(today, 1), plan)
      }
      await reload()
    },
    async deleteEvent(id) {
      await planStore.deleteEvent(id)
      await reload()
    },
    async setStatus(w, status) {
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
      const auto = act ? analyzeRun(w, act) : null
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
