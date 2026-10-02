import { describe, expect, it } from 'vitest'
import type { Activity } from '../types'
import { analyzeRun, shiftPaces } from './analyze'
import { generatePlan } from './generate'
import type { PlanWorkout, RaceEvent } from './types'

let n = 0
const event: RaceEvent = { id: 'e1', name: 'HM', date: '2027-02-28', type: 'half', goal_time_s: 6300, days_per_week: 4, long_day: 6, notes: null }
const plan = generatePlan(event, { weeklyRunKm: 30, longestRunKm: 14, weeklyHours: { swim: 0, bike: 0, run: 3 } }, '2026-10-02', () => `w${++n}`)
const easy = plan.find((w) => w.kind === 'easy')!
const tempo = plan.find((w) => w.kind === 'tempo')!

function act(zones: number[], over: Partial<Activity> = {}): Activity {
  return {
    id: 1, start_time: '', local_date: easy.date, sport: 'running', name: null, distance_m: 8000, duration_s: 3000,
    avg_hr: 150, max_hr: 170, avg_speed_mps: 3, elevation_gain_m: 0, avg_power_w: null, training_load: 80,
    aerobic_te: 3, anaerobic_te: 0.5, calories: 500, hr_zones_s: zones.map((z) => z * 3000), ...over,
  }
}

describe('analyzeRun', () => {
  it('calls an easy run with a lot of zone 4 too hard and slows the next easy runs', () => {
    const a = analyzeRun(easy, act([0.05, 0.35, 0.35, 0.25, 0]))!
    expect(a.verdict).toBe('hard')
    expect(a.paceShift).toBe(10)
    expect(a.reasons[0]).toMatch(/25 % der Zeit in Zone 4 oder höher/)
  })
  it('accepts an easy run between zone 2 and 3', () => {
    expect(analyzeRun(easy, act([0.05, 0.45, 0.45, 0.05, 0]))!.verdict).toBe('ok')
  })
  it('ignores implausible zones, like hours in zone 5', () => {
    expect(analyzeRun(easy, act([0, 0.1, 0.1, 0.2, 0.6]))).toBeNull()
  })
  it('calls a run almost entirely in zone 1 too easy and speeds the easy pace up a little', () => {
    const a = analyzeRun(easy, act([0.8, 0.18, 0.02, 0, 0]))!
    expect([a.verdict, a.paceShift]).toEqual(['easy', -5])
  })
  it('uses the effort rating from the watch for hard sessions', () => {
    expect(analyzeRun(tempo, act([0, 0.2, 0.3, 0.4, 0.1], { rpe: 90 }))!.verdict).toBe('hard')
    expect(analyzeRun(tempo, act([0, 0.2, 0.3, 0.4, 0.1], { rpe: 60 }))!.verdict).toBe('ok')
    // Ohne Anstrengung zählt auch viel „Zone 5“ nicht als zu hart.
    expect(analyzeRun(tempo, act([0, 0, 0.1, 0.2, 0.7], { aerobic_te: 4.5 }))!.verdict).toBe('ok')
  })
  it('gives up without heart rate data', () => {
    expect(analyzeRun(easy, act([], { hr_zones_s: null }))).toBeNull()
  })
})

describe('shiftPaces', () => {
  it('moves the easy pace range of future easy runs and keeps the description in sync', () => {
    const changed = shiftPaces(plan, easy, 'easy', 10, '2026-10-02')
    const before = plan.find((w) => w.id === changed[0].id)!
    const [s0, s1] = [before.steps![0], changed[0].steps![0]]
    expect(s0.type === 'run' && s1.type === 'run' && s1.pace! - s0.pace!).toBe(10)
    expect(changed[0].description).not.toBe(before.description)
    expect(changed.every((w) => ['easy', 'long', 'recovery', 'strides'].includes(w.kind))).toBe(true)
  })
  it('moves only sessions of the same kind for hard workouts and leaves the easy parts alone', () => {
    const changed: PlanWorkout[] = shiftPaces(plan, tempo, 'quality', 4, '2026-10-02')
    expect(changed.length).toBeGreaterThan(0)
    expect(changed.every((w) => w.kind === 'tempo')).toBe(true)
    expect(changed[0].description).toMatch(/\d:\d\d\/km/)
  })
})
