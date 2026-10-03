import type { GarminRace } from './garminRaces'
import type { Best } from './records'

export interface Activity {
  id: number
  start_time: string
  local_date: string
  sport: string
  name: string | null
  distance_m: number | null
  duration_s: number | null
  avg_hr: number | null
  max_hr: number | null
  avg_speed_mps: number | null
  elevation_gain_m: number | null
  avg_power_w: number | null
  training_load: number | null
  aerobic_te: number | null
  anaerobic_te: number | null
  calories: number | null
  hr_zones_s: (number | null)[] | null
  /** Anstrengung, die du nach dem Lauf auf der Uhr eingibst (Garmin speichert 10–100). */
  rpe?: number | null
  /** Puls-Drift: Effizienzverlust der 2. gegenüber der 1. Hälfte in % (aus den Runden). */
  decoupling_pct?: number | null
  /** Temperatur und Taupunkt in der Mitte der Einheit (Open-Meteo, Migration 0011). */
  temp_c?: number | null
  dew_point_c?: number | null
  /** Steigungsbereinigung: Pace × Faktor = Pace auf flacher Strecke bei gleicher Anstrengung. */
  gap_factor?: number | null
  /** Pulsquelle laut Original-Datei: Brustgurt oder Handgelenk (Migration 0012). */
  hr_source?: 'strap' | 'wrist' | null
  /** Sekunden je 5er-Pulsbereich, z.B. {"140": 300} = 5 min bei 140–144 bpm. */
  hr_hist?: Record<string, number> | null
  /** Ø DFA-alpha1 des Laufs (nur Gurt mit „HRV aufzeichnen“). Über 0,75 = unter der aeroben Schwelle. */
  dfa_a1?: number | null
  /** Aus diesem Lauf geschätzte aerobe Schwelle (bpm) und das Tempo dort (m/s). */
  aet_hr?: number | null
  aet_speed_mps?: number | null
  /** Aus diesem Lauf geschätzte Laktatschwelle (alpha1 = 0,5, Migration 0013) und das Tempo dort. */
  lt_hr?: number | null
  lt_speed_mps?: number | null
}

/** Garmins Laktatschwelle (Migration 0013), je Tag, an dem Garmin sie neu bestimmt hat. */
export interface GarminLactate {
  date: string
  hr: number
  speed_mps: number | null
}

export interface DailyMetrics {
  date: string
  sleep_s: number | null
  deep_sleep_s: number | null
  light_sleep_s: number | null
  rem_sleep_s: number | null
  awake_s: number | null
  sleep_score: number | null
  hrv_last_night: number | null
  hrv_weekly_avg: number | null
  hrv_status: string | null
  hrv_baseline_low: number | null
  hrv_baseline_high: number | null
  resting_hr: number | null
  steps: number | null
  body_battery_high: number | null
  body_battery_low: number | null
  stress_avg: number | null
  training_readiness: number | null
  vo2max_running: number | null
}

export interface SyncRun {
  id: number
  trigger: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'ok' | 'error'
  message: string | null
}

export interface Dataset {
  activities: Activity[]
  days: DailyMetrics[]
  lastSync: SyncRun | null
  /** Bestzeiten je Strecke (siehe records.ts). */
  records?: Best[]
  /** Garmins Laktatschwelle, älteste zuerst. */
  lactate?: GarminLactate[]
  /** Garmins Rennzeit-Prognose pro Tag (Sekunden). */
  predictions?: RacePrediction[]
  /** Rennen aus dem Garmin-Kalender (Migration 0009). */
  garminRaces?: GarminRace[]
}

export interface RacePrediction {
  date: string
  time_5k: number | null
  time_10k: number | null
  time_half: number | null
  time_marathon: number | null
}
