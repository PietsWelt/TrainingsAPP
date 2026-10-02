import { describe, expect, it } from 'vitest'
import { addDays } from './plan/dates'
import { alcoholScore, readinessFor } from './readiness'
import type { Activity, DailyMetrics } from './types'

const D = '2026-10-02'

function day(date: string, over: Partial<DailyMetrics> = {}): DailyMetrics {
  return {
    date, sleep_s: 7.8 * 3600, deep_sleep_s: null, light_sleep_s: null, rem_sleep_s: null, awake_s: null, sleep_score: 80,
    hrv_last_night: 60, hrv_weekly_avg: null, hrv_status: null, hrv_baseline_low: null, hrv_baseline_high: null, resting_hr: 50,
    steps: null, body_battery_high: null, body_battery_low: null, stress_avg: null, training_readiness: null, vo2max_running: null, ...over,
  }
}

// 28 Tage normale Werte mit etwas Streuung, dann der Testtag.
function history(today: Partial<DailyMetrics>): DailyMetrics[] {
  const out: DailyMetrics[] = []
  for (let i = 28; i >= 1; i--) out.push(day(addDays(D, -i), { hrv_last_night: 60 + ((i * 7) % 9) - 4, resting_hr: 50 + ((i * 3) % 3) - 1 }))
  out.push(day(D, today))
  return out
}

function runs(perWeek = 4, load = 80, lastDayLoad?: number): Activity[] {
  const out: Activity[] = []
  for (let i = 28; i >= 1; i--) {
    if (i % Math.round(7 / perWeek) !== 0 && i !== 1) continue
    out.push({
      id: i, start_time: `${addDays(D, -i)}T07:00:00Z`, local_date: addDays(D, -i), sport: 'running', name: null, distance_m: 10000,
      duration_s: 3000, avg_hr: null, max_hr: null, avg_speed_mps: null, elevation_gain_m: null, avg_power_w: null,
      training_load: i === 1 && lastDayLoad != null ? lastDayLoad : load, aerobic_te: null, anaerobic_te: null, calories: null, hr_zones_s: null,
    })
  }
  return out
}

describe('readinessFor', () => {
  it('rates a normal day as ready', () => {
    const r = readinessFor(D, history({}), runs(), {})!
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.status).toBe('good')
  })

  it('drops clearly after a short night with low HRV and raised resting HR', () => {
    const r = readinessFor(D, history({ sleep_s: 4.5 * 3600, sleep_score: 40, hrv_last_night: 44, resting_hr: 56 }), runs(), {})!
    expect(r.score).toBeLessThan(50)
    expect(['serious', 'critical']).toContain(r.status)
  })

  it('counts drinks from the evening before', () => {
    const base = readinessFor(D, history({}), runs(), {})!.score
    const drunk = readinessFor(D, history({}), runs(), { [addDays(D, -1)]: 4 })!
    expect(drunk.score).toBeLessThan(base)
    expect(drunk.components.find((c) => c.key === 'alcohol')?.detail).toBe('Gestern 4 Getränke')
    // Getränke von heute Abend zählen erst morgen.
    expect(readinessFor(D, history({}), runs(), { [D]: 4 })!.score).toBe(base)
  })

  it('penalises a hard session yesterday', () => {
    const easy = readinessFor(D, history({}), runs(), {})!
    const hard = readinessFor(D, history({}), runs(4, 80, 300), {})!
    expect(hard.components.find((c) => c.key === 'load')!.score).toBeLessThan(easy.components.find((c) => c.key === 'load')!.score)
  })

  it('returns null without sleep and HRV data', () => {
    expect(readinessFor(D, history({ sleep_s: null, hrv_last_night: null }), runs(), {})).toBeNull()
  })

  it('works with sleep only (no HRV history yet)', () => {
    const days = [day(D, { hrv_last_night: null })]
    const r = readinessFor(D, days, [], {})!
    expect(r.components.map((c) => c.key)).toEqual(['sleep'])
  })
})

describe('alcoholScore', () => {
  it('decreases with each drink', () => {
    const s = [0, 1, 2, 3, 4, 6].map(alcoholScore)
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThan(s[i - 1])
  })
})
