// Gym-Verlauf: Gewicht und Wiederholungen pro Satz. Supabase, im Demo-Modus der Browser-Speicher.
// Bewusst getrennt von den Lauf-Daten: nichts hiervon fließt in Plan, Readiness oder Laufauswertung.

import { setsOf } from './strength'
import { supabase } from './supabase'

export type GymSession = 'legs' | 'upperA' | 'upperB'
export interface GymSet {
  date: string
  session: GymSession
  exercise_id: string
  set_no: number
  kg: number | null
  reps: number | null
}

export const SESSION_LABEL: Record<GymSession, string> = { legs: 'Beine', upperA: 'Oberkörper A', upperB: 'Oberkörper B' }

const KEY = 'demo.gym_sets'
const MISSING = 'Für den Gym-Verlauf bitte einmal supabase/migrations/0014_gym_saetze.sql im SQL-Editor ausführen. Dein Training ist trotzdem als erledigt gespeichert.'

function readLocal(): GymSet[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as GymSet[]
  } catch {
    return []
  }
}

const friendly = (msg: string) => (/gym_sets/.test(msg) && /exist|find/i.test(msg) ? MISSING : msg)

let cache: GymSet[] | null = null

/** Alle Sätze des letzten Jahres, nach Datum sortiert. Ohne Tabelle: leer. */
export async function loadGymSets(sinceDays = 365): Promise<GymSet[]> {
  if (!supabase) return (cache = readLocal())
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('gym_sets').select('date,session,exercise_id,set_no,kg,reps').gte('date', since).order('date')
  if (error) {
    if (/gym_sets/.test(error.message)) return (cache = [])
    throw new Error(error.message)
  }
  return (cache = data as GymSet[])
}

export const cachedGymSets = () => cache

/** Ersetzt alle Sätze dieser Einheit an diesem Tag. */
export async function saveGymSession(date: string, session: GymSession, sets: GymSet[]): Promise<void> {
  const keep = (s: GymSet) => !(s.date === date && s.session === session)
  if (!supabase) {
    const all = [...readLocal().filter(keep), ...sets].sort((a, b) => a.date.localeCompare(b.date))
    try {
      localStorage.setItem(KEY, JSON.stringify(all))
    } catch {
      // Speicher nicht verfügbar: gilt dann nur bis zum Neuladen.
    }
    cache = all
    return
  }
  const del = await supabase.from('gym_sets').delete().eq('date', date).eq('session', session)
  if (del.error) throw new Error(friendly(del.error.message))
  if (sets.length) {
    const ins = await supabase.from('gym_sets').insert(sets)
    if (ins.error) throw new Error(friendly(ins.error.message))
  }
  cache = [...(cache ?? []).filter(keep), ...sets].sort((a, b) => a.date.localeCompare(b.date))
}

/** Sätze einer Übung beim letzten Mal vor `before`, nach Satznummer. */
export function lastSets(all: GymSet[], exerciseId: string, before: string): GymSet[] {
  const mine = all.filter((s) => s.exercise_id === exerciseId && s.date < before)
  const date = mine.reduce((d, s) => (s.date > d ? s.date : d), '')
  return mine.filter((s) => s.date === date).sort((a, b) => a.set_no - b.set_no)
}

/** Wiederholungsbereich aus einer Dosis wie „3 × 8–12 je Seite“ → [8, 12]. */
export function repRange(dose: string): [number, number] | null {
  const m = /×\s*(\d+)(?:\s*[–-]\s*(\d+))?/.exec(dose)
  if (!m) return null
  const lo = Number(m[1])
  return [lo, m[2] ? Number(m[2]) : lo]
}

/** Geschätztes Maximalgewicht für 1 Wiederholung (Epley). Nur als Verlaufslinie gedacht. */
export function e1rm(kg: number, reps: number): number {
  return reps <= 1 ? kg : kg * (1 + reps / 30)
}

const num = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 })

/** „20 kg × 8, 8, 7“ oder „20×8 · 17,5×8“ oder „8, 8, 7 Wdh.“ */
export function fmtSets(sets: GymSet[]): string {
  if (!sets.length) return ''
  const reps = sets.map((s) => (s.reps != null ? String(s.reps) : '–'))
  const kgs = sets.map((s) => s.kg)
  if (kgs.every((k) => k == null || k === 0)) return `${reps.join(', ')} Wdh.`
  if (kgs.every((k) => k === kgs[0])) return `${num(kgs[0]!)} kg × ${reps.join(', ')}`
  return sets.map((s) => `${s.kg != null ? num(s.kg) : '0'}×${s.reps ?? '–'}`).join(' · ')
}

export interface Progression {
  kind: 'up' | 'hold'
  text: string
}

/**
 * Doppelte Progression: erst Wiederholungen bis zum oberen Ende, dann mehr Gewicht.
 * Im Taper wird nie gesteigert, damit vor dem Rennen nichts zusätzlich müde macht.
 */
export function progression(last: GymSet[], dose: string, allowUp: boolean): Progression | null {
  const range = repRange(dose)
  if (!range || !last.length || last.some((s) => s.reps == null)) return null
  const [lo, hi] = range
  const weighted = last.some((s) => (s.kg ?? 0) > 0)
  if (last.every((s) => s.reps! >= hi) && last.length >= Math.min(2, setsOf(dose))) {
    if (!allowUp) return { kind: 'hold', text: 'Rennphase: Gewicht halten, nicht steigern.' }
    return weighted
      ? { kind: 'up', text: `Letztes Mal alle Sätze mit ${hi} geschafft: heute etwas mehr Gewicht probieren, etwa 2,5 kg (bei kleinen Hanteln 1–2 kg).` }
      : { kind: 'up', text: `Letztes Mal alle Sätze mit ${hi} geschafft: heute mit etwas Zusatzgewicht oder der schwereren Variante probieren.` }
  }
  if (last.some((s) => s.reps! < lo)) return { kind: 'hold', text: `Letztes Mal unter ${lo} Wiederholungen: Gewicht halten, bis alle Sätze sauber klappen.` }
  return null
}

/** Eingabe „17,5“ → 17.5; leer → null. */
export function parseNum(v: string): number | null {
  const n = Number(v.replace(',', '.'))
  return v.trim() === '' || !Number.isFinite(n) ? null : n
}

export interface ExerciseHistory {
  id: string
  /** Pro Trainingstag: Sätze und bester Wert (geschätztes Maximum, ohne Gewicht die meisten Wiederholungen). */
  days: { date: string; sets: GymSet[]; best: number }[]
  weighted: boolean
}

export function exerciseHistory(all: GymSet[]): ExerciseHistory[] {
  const byEx = new Map<string, GymSet[]>()
  for (const s of all) byEx.set(s.exercise_id, [...(byEx.get(s.exercise_id) ?? []), s])
  const out: ExerciseHistory[] = []
  for (const [id, sets] of byEx) {
    const weighted = sets.some((s) => (s.kg ?? 0) > 0)
    const dates = [...new Set(sets.map((s) => s.date))].sort()
    const days = dates.map((date) => {
      const day = sets.filter((s) => s.date === date).sort((a, b) => a.set_no - b.set_no)
      const best = Math.max(...day.map((s) => (weighted ? e1rm(s.kg ?? 0, s.reps ?? 0) : (s.reps ?? 0))))
      return { date, sets: day, best }
    })
    out.push({ id, days, weighted })
  }
  // Zuletzt trainierte Übungen zuerst.
  return out.sort((a, b) => b.days.at(-1)!.date.localeCompare(a.days.at(-1)!.date))
}
