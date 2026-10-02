import { avg, sportGroup, weekStart } from './format'
import type { Activity, DailyMetrics } from './types'

export function weeklyTotals(activities: Activity[], weeks: number) {
  const start = new Date()
  start.setDate(start.getDate() - weeks * 7)
  const first = weekStart(start.toISOString().slice(0, 10))
  const map = new Map<string, { week: string; km: number; run: number; bike: number; swim: number; other: number }>()
  for (let d = new Date(first + 'T12:00:00'); d <= new Date(); d.setDate(d.getDate() + 7)) {
    const w = d.toISOString().slice(0, 10)
    map.set(w, { week: w, km: 0, run: 0, bike: 0, swim: 0, other: 0 })
  }
  for (const a of activities) {
    const row = map.get(weekStart(a.local_date))
    if (!row) continue
    const g = sportGroup(a.sport)
    row[g] += (a.duration_s ?? 0) / 3600
    if (g === 'run') row.km += (a.distance_m ?? 0) / 1000
  }
  return [...map.values()].map((r) => ({
    ...r,
    km: Math.round(r.km * 10) / 10,
    run: round2(r.run),
    bike: round2(r.bike),
    swim: round2(r.swim),
    other: round2(r.other),
  }))
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function lastDays(days: DailyMetrics[], n: number) {
  return days.slice(-n)
}

export type HrvState = { status: 'good' | 'warning' | 'serious'; text: string }

export function hrvState(d: DailyMetrics | undefined): HrvState | null {
  if (!d?.hrv_last_night) return null
  const { hrv_last_night: v, hrv_baseline_low: lo, hrv_baseline_high: hi } = d
  if (lo == null || hi == null) return null
  if (v < lo * 0.9) return { status: 'serious', text: 'deutlich unter Normalbereich' }
  if (v < lo) return { status: 'warning', text: 'unter Normalbereich' }
  if (v > hi) return { status: 'warning', text: 'über Normalbereich' }
  return { status: 'good', text: 'im Normalbereich' }
}

/** Abweichung des heutigen Ruhepulses vom Schnitt der 7 Tage davor. */
export function restingHrDelta(days: DailyMetrics[]): number | null {
  const today = days.at(-1)?.resting_hr
  const base = avg(days.slice(-8, -1).map((d) => d.resting_hr))
  return today != null && base != null ? Math.round(today - base) : null
}
