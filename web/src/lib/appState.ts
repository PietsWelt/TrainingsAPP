// App-Zustände, die auf allen Geräten gleich sein sollen (Erledigt-Haken, gesehene Hinweise, Stufen).
// Supabase-Tabelle app_state (Migration 0017), der Browser-Speicher ist der schnelle Zwischenspeicher.
// Im Demo-Modus und solange die Tabelle fehlt, bleibt alles im Browser.

import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/** Nur diese Schlüssel werden geteilt; Theme, Wetter, Cache und Demo-Daten gehören zum Gerät. */
export const SHARED_KEYS = [
  'plan.released',
  'overload.applied',
  'mobility.done',
  'mobility.level',
  'stabi.level',
  'gym.upper.last',
  'feedback.seen',
  'readiness.dismissed',
  'checkin.done',
  'garmin.races.handled',
  'strength.skip',
] as const
export type SharedKey = (typeof SHARED_KEYS)[number]

export interface Row {
  key: string
  value: unknown
}

/** Zugriff auf die Tabelle. `missing` = Tabelle fehlt (Migration 0017 noch nicht ausgeführt). */
export interface Backend {
  all(): Promise<{ rows: Row[]; missing: boolean }>
  get(key: string): Promise<unknown>
  put(rows: Row[]): Promise<void>
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const MIGRATION_HINT = 'Damit Erledigtes auf allen Geräten gleich ist, bitte einmal supabase/migrations/0017_app_state.sql im SQL-Editor ausführen.'

const isMissing = (msg: string) => /app_state/.test(msg) && /exist|find|schema cache/i.test(msg)

function supabaseBackend(): Backend | null {
  if (!supabase) return null
  const db = supabase
  return {
    async all() {
      const { data, error } = await db.from('app_state').select('key,value')
      if (error) {
        if (isMissing(error.message)) return { rows: [], missing: true }
        throw new Error(error.message)
      }
      return { rows: data as Row[], missing: false }
    },
    async get(key) {
      const { data, error } = await db.from('app_state').select('value').eq('key', key).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as { value: unknown } | null)?.value
    },
    async put(rows) {
      const now = new Date().toISOString()
      const { error } = await db.from('app_state').upsert(rows.map((r) => ({ ...r, updated_at: now })))
      if (error) throw new Error(error.message)
    },
  }
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Vereinigt zwei Listen; neue Einträge hinten, höchstens `max` (die neuesten). */
function union(a: unknown, b: unknown, max: number): unknown[] {
  const left = Array.isArray(a) ? a : []
  const right = Array.isArray(b) ? b : []
  const out = [...left, ...right.filter((x) => !left.includes(x))]
  return out.slice(-max)
}

export function createAppState(backend: Backend | null, storage: KeyValueStorage | null) {
  const mem = new Map<string, unknown>()
  const listeners = new Set<() => void>()
  let missing = false
  let loading: Promise<{ missing: boolean }> | null = null
  let version = 0

  const emit = () => {
    version++
    for (const l of listeners) l()
  }

  // Ältere Versionen haben manche Werte als reinen Text gespeichert (z.B. ein Datum), nicht als JSON.
  function readLocal(key: string): unknown {
    const raw = storage?.getItem(key)
    if (raw == null) return undefined
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  function writeLocal(key: string, value: unknown) {
    try {
      storage?.setItem(key, JSON.stringify(value))
    } catch {
      // Speicher voll oder gesperrt: gilt dann bis zum Neuladen
    }
  }

  for (const k of SHARED_KEYS) {
    const v = readLocal(k)
    if (v !== undefined) mem.set(k, v)
  }

  async function load(): Promise<{ missing: boolean }> {
    if (!backend) return { missing: false }
    const res = await backend.all()
    missing = res.missing
    if (missing) return res
    const remote = new Map(res.rows.map((r) => [r.key, r.value]))
    const upload: Row[] = []
    for (const k of SHARED_KEYS) {
      const local = mem.get(k)
      if (remote.has(k)) {
        let value = remote.get(k)
        // Listen wachsen nur: Was dieses Gerät schon kennt, bleibt dabei.
        if (LISTS[k] && Array.isArray(local) && local.some((x) => !(value as unknown[]).includes(x))) {
          value = union(value, local, LISTS[k])
          upload.push({ key: k, value })
        }
        mem.set(k, value)
        writeLocal(k, value)
      } else if (local !== undefined) {
        // Einmalig hochladen, was bisher nur im Browser lag.
        upload.push({ key: k, value: local })
      }
    }
    if (upload.length) await backend.put(upload).catch(() => undefined)
    emit()
    return res
  }

  return {
    /** Lädt alle Zustände mit einer Abfrage. Fehler sind nie fatal: dann gilt der Browser-Speicher. */
    load(): Promise<{ missing: boolean }> {
      loading = load().catch(() => ({ missing: false }))
      return loading
    },
    /** Wartet auf den ersten Ladevorgang (startet ihn, falls nötig). */
    ready(): Promise<{ missing: boolean }> {
      return loading ?? this.load()
    },
    get missing() {
      return missing
    },
    get<T>(key: SharedKey, fallback: T): T {
      const v = mem.get(key)
      return v === undefined || v === null ? fallback : (v as T)
    },
    async set(key: SharedKey, value: unknown): Promise<void> {
      mem.set(key, value)
      writeLocal(key, value)
      emit()
      if (backend && !missing) await backend.put([{ key, value }]).catch(() => undefined)
    },
    /** Hängt an eine Liste an und vereinigt dabei mit dem neuesten Stand aus der Datenbank. */
    async addToList(key: SharedKey, item: unknown): Promise<void> {
      const max = LISTS[key] ?? 200
      const local = union(mem.get(key), [item], max)
      mem.set(key, local)
      writeLocal(key, local)
      emit()
      if (!backend || missing) return
      try {
        const remote = await backend.get(key)
        const value = union(remote, local, max)
        await backend.put([{ key, value }])
        mem.set(key, value)
        writeLocal(key, value)
        emit()
      } catch {
        // offline: der Browser-Speicher hat es, beim nächsten Laden wird vereinigt
      }
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    version: () => version,
  }
}

/** Listen, die beim Schreiben vereinigt werden, mit ihrer Höchstlänge. */
const LISTS: Partial<Record<SharedKey, number>> = {
  'plan.released': 50,
  'garmin.races.handled': 200,
  'strength.skip': 30,
}

export const appState = createAppState(supabaseBackend(), browserStorage())

export const getState = <T,>(key: SharedKey, fallback: T): T => appState.get(key, fallback)
export const setState = (key: SharedKey, value: unknown) => appState.set(key, value)
export const addToList = (key: SharedKey, item: unknown) => appState.addToList(key, item)

/** Für Seiten: liefert den Wert und aktualisiert die Anzeige, sobald der Stand aus Supabase da ist. */
export function useAppState<T>(key: SharedKey, fallback: T): T {
  useSyncExternalStore(appState.subscribe, appState.version)
  return appState.get(key, fallback)
}
