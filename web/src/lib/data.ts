import { appState } from './appState'
import { demoDataset } from './demo'
import type { GarminRace } from './garminRaces'
import { supabase } from './supabase'
import { bestsFromActivities, DISTANCES, mergeBests, WINDOW, type Best, type GarminRecord } from './records'
import type { Activity, Dataset, DatasetMeta, DailyMetrics, GarminLactate, RacePrediction, SyncRun } from './types'
import { localToday } from './plan/dates'

const ACTIVITY_COLS =
  'id,start_time,local_date,sport,name,distance_m,duration_s,avg_hr,max_hr,avg_speed_mps,elevation_gain_m,avg_power_w,training_load,aerobic_te,anaerobic_te,calories,hr_zones_s,rpe:raw->directWorkoutRpe,synced_at'
const DAY_COLS =
  'date,sleep_s,deep_sleep_s,light_sleep_s,rem_sleep_s,awake_s,sleep_score,hrv_last_night,hrv_weekly_avg,hrv_status,hrv_baseline_low,hrv_baseline_high,resting_hr,steps,body_battery_high,body_battery_low,stress_avg,training_readiness,vo2max_running,synced_at'

const RUN_COLS = 'id,trigger,started_at,finished_at,status,message'

const DAYS = 180

/** Hinweis, solange Migration 0018 fehlt: Die App lädt dann bei jedem Aktualisieren alles. */
export const SYNCED_AT_HINT = 'Damit die App nach einem Sync nur Neues lädt, bitte einmal supabase/migrations/0018_synced_at.sql im SQL-Editor ausführen.'

const sinceDate = (days: number, today = localToday()) => new Date(Date.parse(today + 'T12:00:00Z') - days * 86400_000).toISOString().slice(0, 10)

/** Lädt alles der letzten 180 Tage. Beim ersten Start, einmal am Tag und wenn das Nachladen scheitert. */
export async function loadDataset(days = DAYS): Promise<Dataset> {
  if (!supabase) return demoDataset()
  const since = sinceDate(days)
  // App-Zustände (Erledigt-Haken usw.) laufen parallel mit, ohne zusätzliche Wartezeit.
  const [a, d, s, slow, drift, strap, ready] = await Promise.all([
    supabase.from('activities').select(ACTIVITY_COLS).gte('local_date', since).order('start_time', { ascending: false }),
    supabase.from('daily_metrics').select(DAY_COLS).gte('date', since).order('date'),
    supabase.from('sync_runs').select(RUN_COLS).order('started_at', { ascending: false }).limit(1),
    loadSlow(since),
    loadExtras({ since }),
    loadStrap({ since }),
    supabase.rpc('synced_at_ready'),
    appState.load(),
  ])
  const err = a.error ?? d.error ?? s.error
  if (err) throw new Error(err.message)
  const activities = withExtras(a.data as Activity[], drift, strap)
  const dayRows = d.data as DailyMetrics[]
  return {
    activities,
    days: dayRows,
    lastSync: (s.data?.[0] as SyncRun) ?? null,
    ...slow,
    meta: { syncedMax: maxSynced(activities, dayRows, ''), fullAt: localToday(), incremental: !ready.error },
  }
}

/** Bestzeiten, Prognosen, Garmin-Rennen und Laktatschwelle: ändern sich nur mit neuen Läufen. */
async function loadSlow(since: string): Promise<Pick<Dataset, 'records' | 'predictions' | 'garminRaces' | 'lactate'>> {
  const sb = supabase!
  const [records, predictions, races, lactate] = await Promise.all([
    loadBests(),
    sb.from('race_predictions').select('date,time_5k,time_10k,time_half,time_marathon').gte('date', since).order('date'),
    sb.from('garmin_races').select('id,name,date,distance_m,sport').order('date'),
    sb.from('garmin_lactate').select('date,hr,speed_mps').order('date'),
  ])
  return {
    records,
    predictions: predictions.error ? [] : (predictions.data as RacePrediction[]),
    garminRaces: races.error ? [] : (races.data as GarminRace[]),
    // Tabelle fehlt, solange Migration 0013 nicht gelaufen ist.
    lactate: lactate.error ? [] : (lactate.data as GarminLactate[]),
  }
}

function withExtras(rows: Activity[], drift: Extra[], strap: Partial<Activity>[]): Activity[] {
  const extras = new Map<number, Partial<Activity>>(drift.map((x) => [x.id, x]))
  for (const x of strap) extras.set(x.id!, { ...extras.get(x.id!), ...x })
  return extras.size ? rows.map((x) => (extras.has(x.id) ? { ...x, ...extras.get(x.id) } : x)) : rows
}

function maxSynced(activities: Activity[], days: DailyMetrics[], start: string): string {
  let max = start
  for (const x of activities) if (x.synced_at && x.synced_at > max) max = x.synced_at
  for (const x of days) if (x.synced_at && x.synced_at > max) max = x.synced_at
  return max
}

export interface Changes {
  activities: Activity[]
  days: DailyMetrics[]
  lastSync: SyncRun | null
  slow?: Pick<Dataset, 'records' | 'predictions' | 'garminRaces' | 'lactate'>
}

/**
 * Führt nachgeladene Zeilen mit dem bisherigen Stand zusammen: Geänderte ersetzen (nach id bzw. Datum), neue kommen dazu,
 * alles älter als 180 Tage fällt raus. Ohne neue Zeilen kommt dasselbe Objekt zurück, damit nichts neu gerechnet wird.
 */
export function mergeChanges(prev: Dataset, ch: Changes, today = localToday()): Dataset {
  const sameRun = ch.lastSync?.id === prev.lastSync?.id && ch.lastSync?.status === prev.lastSync?.status
  if (!ch.activities.length && !ch.days.length && !ch.slow && sameRun) return prev
  const since = sinceDate(DAYS, today)
  let activities = prev.activities
  if (ch.activities.length) {
    const byId = new Map(prev.activities.map((a) => [a.id, a]))
    for (const a of ch.activities) byId.set(a.id, a)
    activities = [...byId.values()].filter((a) => a.local_date >= since).sort((a, b) => b.start_time.localeCompare(a.start_time))
  }
  let days = prev.days
  if (ch.days.length) {
    const byDate = new Map(prev.days.map((d) => [d.date, d]))
    for (const d of ch.days) byDate.set(d.date, d)
    days = [...byDate.values()].filter((d) => d.date >= since).sort((a, b) => a.date.localeCompare(b.date))
  }
  return {
    ...prev,
    ...ch.slow,
    activities,
    days,
    lastSync: ch.lastSync ?? prev.lastSync,
    meta: { ...prev.meta!, syncedMax: maxSynced(ch.activities, ch.days, prev.meta?.syncedMax ?? '') },
  }
}

/** Ob nur nachgeladen werden darf oder alles neu geladen werden muss. */
export function needsFull(prev: Dataset | null, today = localToday()): boolean {
  const m: DatasetMeta | undefined = prev?.meta
  return !m || !m.incremental || !m.syncedMax || m.fullAt !== today
}

/**
 * Lädt nur, was seit dem letzten Stand geändert wurde: je Tabelle eine Abfrage mit synced_at > syncedMax − 2 min.
 * Bestzeiten & Co. nur, wenn ein neuer Lauf dabei ist. Scheitert etwas, wird alles geladen.
 */
export async function loadChanges(prev: Dataset | null): Promise<Dataset> {
  // Demo: Beispieldaten ändern sich nicht, also das alte Objekt behalten.
  if (!supabase) return prev ?? demoDataset()
  if (!prev || needsFull(prev)) return loadDataset()
  const sb = supabase
  try {
    const after = new Date(Date.parse(prev.meta!.syncedMax) - 2 * 60_000).toISOString()
    const since = sinceDate(DAYS)
    const [a, d, s] = await Promise.all([
      sb.from('activities').select(ACTIVITY_COLS).gt('synced_at', after).gte('local_date', since),
      sb.from('daily_metrics').select(DAY_COLS).gt('synced_at', after).gte('date', since),
      sb.from('sync_runs').select(RUN_COLS).order('started_at', { ascending: false }).limit(1),
      appState.load(),
    ])
    const err = a.error ?? d.error ?? s.error
    if (err) throw new Error(err.message)
    let acts = a.data as Activity[]
    // Nur echte Änderungen: Der Sync schreibt die letzten Tage bei jedem Lauf erneut.
    const old = new Map(prev.activities.map((x) => [x.id, x]))
    if (acts.length) {
      const ids = acts.map((x) => x.id)
      const [drift, strap] = await Promise.all([loadExtras({ ids }), loadStrap({ ids })])
      acts = withExtras(acts, drift, strap)
    }
    const newRun = acts.some((x) => !old.has(x.id) && /running/.test(x.sport))
    return mergeChanges(prev, {
      activities: acts,
      days: d.data as DailyMetrics[],
      lastSync: (s.data?.[0] as SyncRun) ?? null,
      slow: newRun ? await loadSlow(since) : undefined,
    })
  } catch {
    return loadDataset()
  }
}

type Extra = Pick<Activity, 'id' | 'decoupling_pct' | 'temp_c' | 'dew_point_c' | 'gap_factor'>
/** Welche Aktivitäten: alle seit einem Datum (komplettes Laden) oder nur bestimmte (Nachladen). */
type Scope = { since: string } | { ids: number[] }

function scoped<Q>(q: Q, scope: Scope): Q {
  const f = q as unknown as { gte(c: string, v: string): Q; in(c: string, v: number[]): Q }
  return 'ids' in scope ? f.in('id', scope.ids) : f.gte('local_date', scope.since)
}

/**
 * Werte aus späteren Migrationen (0008 Drift, 0011 Wetter und Steigung). Fehlen die Spalten noch,
 * geht es mit weniger weiter, statt die ganze App zu blockieren.
 */
async function loadExtras(scope: Scope): Promise<Extra[]> {
  const sb = supabase!
  const full = await scoped(sb.from('activities').select('id,decoupling_pct,temp_c,dew_point_c,gap_factor'), scope).or('decoupling_pct.not.is.null,temp_c.not.is.null,gap_factor.not.is.null')
  if (!full.error) return full.data as Extra[]
  const drift = await scoped(sb.from('activities').select('id,decoupling_pct'), scope).not('decoupling_pct', 'is', null)
  return drift.error ? [] : (drift.data as Extra[])
}

const STRAP_COLS = 'id,hr_source,hr_hist,dfa_a1,aet_hr,aet_speed_mps'

/** Brustgurt-Auswertung aus der Original-Datei (Migration 0012, Laktatschwelle 0013). Ohne die Spalten einfach weniger. */
async function loadStrap(scope: Scope): Promise<Partial<Activity>[]> {
  const q = (cols: string) => scoped(supabase!.from('activities').select(cols), scope).not('hr_source', 'is', null)
  const full = await q(`${STRAP_COLS},lt_hr,lt_speed_mps`)
  if (!full.error) return full.data as unknown as Partial<Activity>[]
  const { data, error } = await q(STRAP_COLS)
  return error ? [] : (data as unknown as Partial<Activity>[])
}

/** Bestzeiten über die ganze gesyncte Historie, nicht nur die geladenen 180 Tage. Fehler sind nie fatal. */
async function loadBests(): Promise<Best[]> {
  if (!supabase) return []
  const sb = supabase
  // Eine Abfrage für alle Strecken statt einer je Strecke; das Fenster prüft bestsFromActivities.
  const lengths = DISTANCES.filter((x) => x.key !== '1k').map((x) => x.meters)
  const [pr, runs] = await Promise.all([
    sb.from('personal_records').select('type_id,value,activity_id,date'),
    sb
      .from('activities')
      .select('id,sport,local_date,distance_m,duration_s')
      .like('sport', '%running%')
      .gte('distance_m', Math.min(...lengths) * WINDOW[0])
      .lte('distance_m', Math.max(...lengths) * WINDOW[1])
      .order('local_date', { ascending: false })
      .limit(1000),
  ])
  // Tabelle fehlt, solange Migration 0007 nicht gelaufen ist: dann nur die Läufe.
  const acts = (runs.data ?? []) as Activity[]
  return mergeBests((pr.error ? [] : pr.data) as GarminRecord[], bestsFromActivities(acts), acts)
}

/** Nur der letzte Sync-Lauf: eine kleine Abfrage, um zu sehen, ob es Neues gibt. */
export async function latestRun(): Promise<SyncRun | null> {
  if (!supabase) return null
  const { data } = await supabase!.from('sync_runs').select(RUN_COLS).order('id', { ascending: false }).limit(1)
  return (data?.[0] as SyncRun) ?? null
}

/**
 * Startet den Sync und wartet, bis der neue Lauf fertig ist. Ein Lauf dauert meist unter einer Minute;
 * statt fester Wartezeiten wird alle paar Sekunden nachgesehen.
 */
export async function syncAndWait(): Promise<SyncRun | null> {
  if (!supabase) return null
  const before = (await latestRun())?.id ?? 0
  await triggerSync()
  const until = Date.now() + 5 * 60_000
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 4000))
    const run = await latestRun()
    if (run && run.id > before && run.status !== 'running') return run
  }
  return null
}

export async function triggerSync(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.functions.invoke('trigger-sync', { method: 'POST' })
  if (error) {
    // FunctionsFetchError/FunctionsRelayError: Funktion fehlt oder ist nicht erreichbar.
    const status = (error as { context?: { status?: number } }).context?.status
    const missing = error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError' || status === 404
    throw new Error(
      missing
        ? 'Der Sync-Knopf ist noch nicht eingerichtet (README, Schritt 4). Der automatische Sync jede Stunde läuft trotzdem.'
        : `Sync konnte nicht gestartet werden: ${await errorDetail(error)}`,
    )
  }
}

/** Die Edge Function liefert {"error": "..."}; das ist aussagekräftiger als die Standardmeldung. */
async function errorDetail(error: Error): Promise<string> {
  const res = (error as { context?: Response }).context
  try {
    const body = res ? await res.clone().json() : null
    if (body?.error) return `${body.error} (HTTP ${res?.status})`
  } catch {
    // Antwort war kein JSON
  }
  return res?.status ? `${error.message} (HTTP ${res.status})` : error.message
}
