// Tagesprotokoll: Getränke pro Abend. Supabase, im Demo-Modus der Browser-Speicher.

import { supabase } from './supabase'

export type DrinksByDate = Record<string, number>

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
