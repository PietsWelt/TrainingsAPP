import { demoDataset } from './demo'
import type { GarminRace } from './garminRaces'
import { supabase } from './supabase'
import { bestsFromActivities, DISTANCES, mergeBests, WINDOW, type Best, type GarminRecord } from './records'
import type { Activity, Dataset, DailyMetrics, RacePrediction, SyncRun } from './types'

const ACTIVITY_COLS =
  'id,start_time,local_date,sport,name,distance_m,duration_s,avg_hr,max_hr,avg_speed_mps,elevation_gain_m,avg_power_w,training_load,aerobic_te,anaerobic_te,calories,hr_zones_s,rpe:raw->directWorkoutRpe'
const DAY_COLS =
  'date,sleep_s,deep_sleep_s,light_sleep_s,rem_sleep_s,awake_s,sleep_score,hrv_last_night,hrv_weekly_avg,hrv_status,hrv_baseline_low,hrv_baseline_high,resting_hr,steps,body_battery_high,body_battery_low,stress_avg,training_readiness,vo2max_running'

const RUN_COLS = 'id,trigger,started_at,finished_at,status,message'

export async function loadDataset(days = 180): Promise<Dataset> {
  if (!supabase) return demoDataset()
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const [a, d, s, records, drift, predictions, races, strap] = await Promise.all([
    supabase.from('activities').select(ACTIVITY_COLS).gte('local_date', since).order('start_time', { ascending: false }),
    supabase.from('daily_metrics').select(DAY_COLS).gte('date', since).order('date'),
    supabase.from('sync_runs').select(RUN_COLS).order('started_at', { ascending: false }).limit(1),
    loadBests(),
    loadExtras(since),
    supabase.from('race_predictions').select('date,time_5k,time_10k,time_half,time_marathon').gte('date', since).order('date'),
    supabase.from('garmin_races').select('id,name,date,distance_m,sport').order('date'),
    loadStrap(since),
  ])
  const err = a.error ?? d.error ?? s.error
  if (err) throw new Error(err.message)
  const extras = new Map<number, Partial<Activity>>(drift.map((x) => [x.id, x]))
  for (const x of strap) extras.set(x.id!, { ...extras.get(x.id!), ...x })
  return {
    activities: (a.data as Activity[]).map((x) => (extras.has(x.id) ? { ...x, ...extras.get(x.id) } : x)),
    days: d.data as DailyMetrics[],
    lastSync: (s.data?.[0] as SyncRun) ?? null,
    records,
    predictions: predictions.error ? [] : (predictions.data as RacePrediction[]),
    garminRaces: races.error ? [] : (races.data as GarminRace[]),
  }
}

type Extra = Pick<Activity, 'id' | 'decoupling_pct' | 'temp_c' | 'dew_point_c' | 'gap_factor'>

/**
 * Werte aus späteren Migrationen (0008 Drift, 0011 Wetter und Steigung). Fehlen die Spalten noch,
 * geht es mit weniger weiter, statt die ganze App zu blockieren.
 */
async function loadExtras(since: string): Promise<Extra[]> {
  const sb = supabase!
  const full = await sb.from('activities').select('id,decoupling_pct,temp_c,dew_point_c,gap_factor').gte('local_date', since).or('decoupling_pct.not.is.null,temp_c.not.is.null,gap_factor.not.is.null')
  if (!full.error) return full.data as Extra[]
  const drift = await sb.from('activities').select('id,decoupling_pct').gte('local_date', since).not('decoupling_pct', 'is', null)
  return drift.error ? [] : (drift.data as Extra[])
}

const STRAP_COLS = 'id,hr_source,hr_hist,dfa_a1,aet_hr,aet_speed_mps'

/** Brustgurt-Auswertung aus der Original-Datei (Migration 0012). Ohne die Spalten einfach nichts. */
async function loadStrap(since: string): Promise<Partial<Activity>[]> {
  const { data, error } = await supabase!.from('activities').select(STRAP_COLS).gte('local_date', since).not('hr_source', 'is', null)
  return error ? [] : (data as Partial<Activity>[])
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
        ? 'Der Sync-Knopf ist noch nicht eingerichtet (README, Schritt 4). Der automatische Sync alle 30 Minuten läuft trotzdem.'
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
