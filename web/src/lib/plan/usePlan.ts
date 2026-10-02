// Lädt Rennen und Plan, hakt Einheiten anhand der Garmin-Aktivitäten ab und bietet alle Aktionen.

import { useCallback, useEffect, useState } from 'react'
import type { Activity } from '../types'
import { autoComplete, skipWorkout } from './adapt'
import { addDays, localToday } from './dates'
import { fitnessFrom } from './fitness'
import { generatePlan } from './generate'
import { planStore } from './store'
import type { PlanWorkout, RaceEvent } from './types'

export interface PlanState {
  events: RaceEvent[]
  workouts: PlanWorkout[]
  loading: boolean
  error: string | null
  saveEvent(e: RaceEvent, isNew: boolean): Promise<void>
  deleteEvent(id: string): Promise<void>
  setStatus(w: PlanWorkout, status: PlanWorkout['status']): Promise<void>
  skip(w: PlanWorkout): Promise<string>
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
      const done = activities ? autoComplete(ws, activities, localToday()) : []
      if (done.length) await planStore.updateWorkouts(done)
      const byId = new Map(done.map((w) => [w.id, w]))
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
    async skip(w) {
      const { changed, message } = skipWorkout(workouts, w.id, localToday())
      await planStore.updateWorkouts(changed)
      apply(changed)
      return message
    },
  }
}
