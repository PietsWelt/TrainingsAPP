import { describe, expect, it } from 'vitest'
import type { PlanWorkout } from './plan/types'
import type { Activity, DailyMetrics } from './types'
import { reviewMonday, tipsFor, weekReview } from './weekReview'

const run = (id: number, date: string, km: number, extra: Partial<Activity> = {}): Activity =>
  ({ id, local_date: date, start_time: `${date}T07:00:00Z`, sport: 'running', distance_m: km * 1000, duration_s: km * 330, training_load: km * 10, hr_zones_s: [300, 1500, 300, 0, 0], ...extra }) as Activity
const day = (date: string, sleepH: number, hrv: number, rhr: number) => ({ date, sleep_s: sleepH * 3600, hrv_last_night: hrv, resting_hr: rhr }) as DailyMetrics
const w = (id: string, date: string, status: PlanWorkout['status'], extra: Partial<PlanWorkout> = {}) =>
  ({ id, event_id: 'e', date, sport: 'run', kind: 'easy', title: 'Lockerer Lauf', status, key_session: false, distance_km: 8, phase: 'build', activity_id: null, ...extra }) as PlanWorkout

describe('weekReview', () => {
  const monday = '2026-09-28'
  const acts = [run(1, '2026-09-29', 10), run(2, '2026-10-04', 20, { temp_c: 26, dew_point_c: 18, gap_factor: 1.05 }), run(3, '2026-09-15', 8), run(4, '2026-09-08', 8)]
  const days = [day('2026-09-29', 6, 50, 52), day('2026-09-30', 6.5, 48, 53), day('2026-09-10', 7.5, 60, 48), day('2026-09-12', 7.5, 62, 48)]
  const plan = [w('a', '2026-09-29', 'done', { activity_id: 1 }), w('b', '2026-10-01', 'skipped'), w('c', '2026-10-02', 'skipped'), w('d', '2026-10-04', 'done', { key_session: true, activity_id: 2, distance_km: 20 }), w('n', '2026-10-07', 'planned', { key_session: true, title: 'Intervalle' })]
  const r = weekReview(monday, '2026-10-05', acts, days, plan, [], { '2026-09-30': 4, '2026-10-03': 3 }, { '2026-10-01': { focus: 'legs', hard: true } })

  it('zählt Training, Plan und Bedingungen', () => {
    expect(r.complete).toBe(true)
    expect(r.runKm).toBe(30)
    expect(r.plan).toMatchObject({ planned: 4, done: 2, skipped: 2, key: 1, keyDone: 1, plannedKm: 44 })
    expect(r.hotRuns).toBe(1)
    expect(r.hillyRuns).toBe(1)
    expect(r.highlights[0]).toMatch(/20 km/)
    expect(r.next?.key[0].title).toBe('Intervalle')
    expect(r.next?.focus).toMatch(/Aufbau/)
  })

  it('leitet Tipps ab: Last, Schlaf, Alkohol, Erholung, Plan; höchstens drei', () => {
    expect(r.loadBefore).toBe(40)
    expect(r.tips).toHaveLength(3)
    expect(r.tips.map((t) => t.title)).toEqual(['Belastung deutlich gestiegen', 'Mehr Schlaf', 'Alkohol im Blick'])
    const calm = tipsFor({ ...r, load: 40, sleepH: 7.5, drinks: 0, drinkDays: 0, hrv: 60, rhr: 48, plan: null })
    expect(calm[0].title).toBe('Gute Woche')
  })

  it('zeigt den Rückblick Sonntag ab Mittag und Montag', () => {
    expect(reviewMonday('2026-10-04', 13)).toBe('2026-09-28')
    expect(reviewMonday('2026-10-04', 9)).toBeNull()
    expect(reviewMonday('2026-10-05', 8)).toBe('2026-09-28')
    expect(reviewMonday('2026-10-06', 8)).toBeNull()
  })
})
