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
}
