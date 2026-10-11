import { describe, expect, it } from 'vitest'
import { mondayOf } from './dates'
import { generatePlan } from './generate'
import { kindChip, plannedIntensity, stepSeconds, weekKinds } from './labels'
import type { Fitness, PlanWorkout, RaceEvent } from './types'

let n = 0
const id = () => `w${++n}`
const fit: Fitness = { weeklyRunKm: 30, longestRunKm: 14, weeklyHours: { swim: 0, bike: 0, run: 3 }, threshold: { pace: 290, source: 'garmin', date: '2026-10-01' } }
const ev: RaceEvent = { id: 'e1', name: 'Test', date: '2027-03-28', type: 'half', goal_time_s: 6300, days_per_week: 5, long_day: 6, notes: null }

function w(over: Partial<PlanWorkout>): PlanWorkout {
  return {
    id: id(), event_id: 'e1', date: '2026-10-12', sport: 'run', kind: 'easy', title: 'x', description: null, duration_min: null, distance_km: null,
    key_session: false, phase: 'base', week_index: 1, status: 'planned', activity_id: null, moved_from: null, ...over,
  }
}

describe('plannedIntensity', () => {
  it('hält eine generierte Grundlagenwoche zu mindestens 80 % locker', () => {
    const plan = generatePlan(ev, fit, '2026-10-11', id)
    const base = plan.filter((x) => x.phase === 'base')
    expect(base.length).toBeGreaterThan(0)
    const byWeek = new Map<string, PlanWorkout[]>()
    for (const x of base) byWeek.set(mondayOf(x.date), [...(byWeek.get(mondayOf(x.date)) ?? []), x])
    for (const ws of byWeek.values()) expect(plannedIntensity(ws).easyPct).toBeGreaterThanOrEqual(80)
  })

  it('rechnet Schritte nach Strecke über das Zieltempo in Minuten um', () => {
    expect(stepSeconds({ type: 'run', m: 800, pace: 250 }, 330)).toBe(200)
    const q = w({
      kind: 'intervals',
      duration_min: 50,
      steps: [
        { type: 'warmup', time_s: 900 },
        { type: 'repeat', times: 6, steps: [{ type: 'run', m: 800, pace: 250 }, { type: 'recover', m: 400 }] },
        { type: 'cooldown', time_s: 600 },
      ],
    })
    // 6 × 800 m @ 4:10/km = 6 × 200 s = 20 min hart, der Rest der 50 min locker
    expect(plannedIntensity([q])).toEqual({ easyMin: 30, hardMin: 20, easyPct: 60 })
  })

  it('zählt lockere Läufe und lange Läufe mit Tempobereich als locker', () => {
    const easy = w({ duration_min: 40, steps: [{ type: 'run', m: 7000, pace: 330, pace_slow: 360 }] })
    const long = w({ kind: 'long', duration_min: 100, steps: [{ type: 'run', m: 15000, pace: 330, pace_slow: 360 }, { type: 'run', m: 3000, pace: 300 }] })
    expect(plannedIntensity([easy, long]).easyPct).toBe(100)
    expect(plannedIntensity([]).easyPct).toBeNull()
  })
})

describe('Art der Einheit', () => {
  it('färbt harte Arten hart und lange Läufe locker', () => {
    expect(kindChip(w({ kind: 'tempo' }))).toEqual({ text: 'Schwelle', color: 'var(--c-hart)' })
    expect(kindChip(w({ kind: 'long' }))?.color).toBe('var(--c-lock)')
    expect(kindChip(w({ kind: 'easy' }))).toBeNull()
    expect(kindChip(w({ kind: 'fartlek', title: 'Fahrtspiel' }))).toBeNull()
    expect(weekKinds([w({ kind: 'tempo' }), w({ kind: 'easy' }), w({ kind: 'long', distance_km: 18 })])).toBe('Schwelle, Lang 18 km')
  })
})
