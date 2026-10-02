import { demoDataset } from './demo'
import { supabase } from './supabase'
import { bestsFromActivities, DISTANCES, mergeBests, WINDOW, type Best, type GarminRecord } from './records'
import type { Activity, Dataset, DailyMetrics, SyncRun } from './types'

const ACTIVITY_COLS =
  'id,start_time,local_date,sport,name,distance_m,duration_s,avg_hr,max_hr,avg_speed_mps,elevation_gain_m,avg_power_w,training_load,aerobic_te,anaerobic_te,calories,hr_zones_s,rpe:raw->directWorkoutRpe'
const DAY_COLS =
  'date,sleep_s,deep_sleep_s,light_sleep_s,rem_sleep_s,awake_s,sleep_score,hrv_last_night,hrv_weekly_avg,hrv_status,hrv_baseline_low,hrv_baseline_high,resting_hr,steps,body_battery_high,body_battery_low,stress_avg,training_readiness,vo2max_running'

export async function loadDataset(days = 180): Promise<Dataset> {
  if (!supabase) return demoDataset()
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const [a, d, s, records] = await Promise.all([
    supabase.from('activities').select(ACTIVITY_COLS).gte('local_date', since).order('start_time', { ascending: false }),
    supabase.from('daily_metrics').select(DAY_COLS).gte('date', since).order('date'),
    supabase.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(1),
    loadBests(),
  ])
  const err = a.error ?? d.error ?? s.error
  if (err) throw new Error(err.message)
  return {
    activities: a.data as Activity[],
    days: d.data as DailyMetrics[],
    lastSync: (s.data?.[0] as SyncRun) ?? null,
    records,
  }
}

/** Bestzeiten über die ganze gesyncte Historie, nicht nur die geladenen 180 Tage. Fehler sind nie fatal. */
async function loadBests(): Promise<Best[]> {
  if (!supabase) return []
  const sb = supabase
  const runs = DISTANCES.filter((x) => x.key !== '1k').map((x) =>
    sb
      .from('activities')
      .select('id,sport,local_date,distance_m,duration_s')
      .like('sport', '%running%')
      .gte('distance_m', x.meters * WINDOW[0])
      .lte('distance_m', x.meters * WINDOW[1])
      .order('duration_s')
      .limit(5),
  )
  // Tabelle fehlt, solange Migration 0007 nicht gelaufen ist: dann nur die Läufe.
  const [pr, ...lists] = await Promise.all([sb.from('personal_records').select('type_id,value,activity_id,date'), ...runs])
  const acts = lists.flatMap((l) => (l.data ?? []) as Activity[])
  return mergeBests((pr.error ? [] : pr.data) as GarminRecord[], bestsFromActivities(acts))
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
