// Speicherung von Rennen und Plan: Supabase, oder im Demo-Modus der Browser-Speicher.

import { supabase } from '../supabase'
import type { PlanWorkout, RaceEvent } from './types'

export interface PlanStore {
  listEvents(): Promise<RaceEvent[]>
  saveEvent(e: RaceEvent): Promise<void>
  deleteEvent(id: string): Promise<void>
  listWorkouts(): Promise<PlanWorkout[]>
  /** Ersetzt alle Einheiten eines Rennens ab `from` (inklusive) durch `workouts`. */
  replaceFrom(eventId: string, from: string, workouts: PlanWorkout[]): Promise<void>
  updateWorkouts(ws: PlanWorkout[]): Promise<void>
}

const EVENT_COLS = 'id,name,date,type,goal_time_s,days_per_week,long_day,notes'
const WORKOUT_COLS =
  'id,event_id,date,sport,kind,title,description,duration_min,distance_km,key_session,phase,week_index,status,activity_id,moved_from'

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

let originalColumn = true
// Felder, die es in der Datenbank (noch) nicht gibt, nicht mitschicken.
function strip<T extends { original?: unknown }>(w: T): T {
  if (originalColumn) return w
  const { original: _ignored, ...rest } = w
  return rest as T
}

const supabaseStore = (): PlanStore => {
  const db = supabase!
  return {
    async listEvents() {
      return check(await db.from('events').select(EVENT_COLS).order('date')) as RaceEvent[]
    },
    async saveEvent(e) {
      check(await db.from('events').upsert({ ...e, updated_at: new Date().toISOString() }))
    },
    async deleteEvent(id) {
      check(await db.from('events').delete().eq('id', id))
    },
    async listWorkouts() {
      const r = await db.from('plan_workouts').select(`${WORKOUT_COLS},original`).order('date')
      // Ohne Migration 0003 fehlt die Spalte; der Plan funktioniert dann ohne Rückgängig-Funktion.
      if (r.error && /original/.test(r.error.message)) {
        originalColumn = false
        return check(await db.from('plan_workouts').select(WORKOUT_COLS).order('date')) as PlanWorkout[]
      }
      return check(r) as PlanWorkout[]
    },
    async replaceFrom(eventId, from, workouts) {
      check(await db.from('plan_workouts').delete().eq('event_id', eventId).gte('date', from))
      for (let i = 0; i < workouts.length; i += 200) check(await db.from('plan_workouts').insert(workouts.slice(i, i + 200).map(strip)))
    },
    async updateWorkouts(ws) {
      if (!ws.length) return
      const now = new Date().toISOString()
      check(await db.from('plan_workouts').upsert(ws.map((w) => strip({ ...w, updated_at: now }))))
    },
  }
}

const localStore = (): PlanStore => {
  const read = <T,>(k: string): T[] => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? '[]') as T[]
    } catch {
      return []
    }
  }
  const write = (k: string, v: unknown) => {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      // Speicher nicht verfügbar (z.B. privater Modus): Demo läuft dann nur bis zum Neuladen.
    }
  }
  let events = read<RaceEvent>('demo.events')
  let workouts = read<PlanWorkout>('demo.workouts')
  const persist = () => {
    write('demo.events', events)
    write('demo.workouts', workouts)
  }
  return {
    async listEvents() {
      return [...events].sort((a, b) => a.date.localeCompare(b.date))
    },
    async saveEvent(e) {
      events = [...events.filter((x) => x.id !== e.id), e]
      persist()
    },
    async deleteEvent(id) {
      events = events.filter((x) => x.id !== id)
      workouts = workouts.filter((w) => w.event_id !== id)
      persist()
    },
    async listWorkouts() {
      return [...workouts].sort((a, b) => a.date.localeCompare(b.date))
    },
    async replaceFrom(eventId, from, ws) {
      workouts = [...workouts.filter((w) => w.event_id !== eventId || w.date < from), ...ws]
      persist()
    },
    async updateWorkouts(ws) {
      const byId = new Map(ws.map((w) => [w.id, w]))
      workouts = workouts.map((w) => byId.get(w.id) ?? w)
      persist()
    },
  }
}

export const planStore: PlanStore = supabase ? supabaseStore() : localStore()
