// Tagesprotokoll: Getränke pro Abend und Krafttraining. Supabase, im Demo-Modus der Browser-Speicher.

import { supabase } from './supabase'

export type DrinksByDate = Record<string, number>

export type GymFocus = 'legs' | 'upper' | 'full' | 'core'
export interface GymEntry {
  focus: GymFocus
  hard: boolean
}
export type GymByDate = Record<string, GymEntry>

const GYM_KEY = 'demo.gym'
let gymColumns = true

function readGymLocal(): GymByDate {
  try {
    return JSON.parse(localStorage.getItem(GYM_KEY) ?? '{}') as GymByDate
  } catch {
    return {}
  }
}

export async function loadGym(sinceDays = 60): Promise<GymByDate> {
  if (!supabase) return readGymLocal()
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('daily_log').select('date,gym_focus,gym_hard').gte('date', since).not('gym_focus', 'is', null)
  if (error) {
    // Ohne Migration 0005 fehlen die Spalten: Gym-Einträge sind dann nur nicht verfügbar.
    if (/gym_/.test(error.message)) {
      gymColumns = false
      return {}
    }
    throw new Error(friendly(error.message))
  }
  const out: GymByDate = {}
  for (const r of data as { date: string; gym_focus: GymFocus; gym_hard: boolean | null }[]) out[r.date] = { focus: r.gym_focus, hard: r.gym_hard ?? true }
  return out
}

/** `entry = null` löscht den Gym-Eintrag des Tages. */
export async function saveGym(date: string, entry: GymEntry | null): Promise<void> {
  if (!supabase) {
    const all = readGymLocal()
    if (entry == null) delete all[date]
    else all[date] = entry
    try {
      localStorage.setItem(GYM_KEY, JSON.stringify(all))
    } catch {
      // Speicher nicht verfügbar: gilt dann nur bis zum Neuladen.
    }
    return
  }
  if (!gymColumns) throw new Error('Für Krafttraining bitte einmal supabase/migrations/0005_gym.sql im SQL-Editor ausführen.')
  const { error } = await supabase
    .from('daily_log')
    .upsert({ date, gym_focus: entry?.focus ?? null, gym_hard: entry?.hard ?? null, updated_at: new Date().toISOString() })
  if (error) throw new Error(friendly(error.message))
}

const KEY = 'demo.daily_log'

function readLocal(): DrinksByDate {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as DrinksByDate
  } catch {
    return {}
  }
}

function friendly(msg: string): string {
  return /daily_log/.test(msg) && /exist|find/i.test(msg)
    ? 'Für Alkohol fehlt noch die Tabelle in Supabase. Bitte einmal supabase/migrations/0003_readiness.sql im SQL-Editor ausführen.'
    : msg
}

export async function loadDrinks(sinceDays = 200): Promise<DrinksByDate> {
  if (!supabase) return readLocal()
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('daily_log').select('date,drinks').gte('date', since)
  if (error) throw new Error(friendly(error.message))
  const out: DrinksByDate = {}
  for (const r of data as { date: string; drinks: number | null }[]) if (r.drinks != null) out[r.date] = r.drinks
  return out
}

/** `drinks = null` löscht den Eintrag für den Abend. */
export async function saveDrinks(date: string, drinks: number | null): Promise<void> {
  if (!supabase) {
    const all = readLocal()
    if (drinks == null) delete all[date]
    else all[date] = drinks
    try {
      localStorage.setItem(KEY, JSON.stringify(all))
    } catch {
      // Speicher nicht verfügbar: gilt dann nur bis zum Neuladen.
    }
    return
  }
  const { error } = await supabase.from('daily_log').upsert({ date, drinks, updated_at: new Date().toISOString() })
  if (error) throw new Error(friendly(error.message))
}
