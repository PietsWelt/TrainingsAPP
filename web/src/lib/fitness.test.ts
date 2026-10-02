import { describe, expect, it } from 'vitest'
import { fitnessSeries, formZone, plannedLoad } from './fitness'
import { prognose, riegel, verdict } from './prognosis'
import type { Activity } from './types'
import type { PlanWorkout } from './plan/types'

const run = (date: string, load: number, km = 10): Activity =>
  ({ id: Number(date.replace(/-/g, '')), local_date: date, start_time: date, sport: 'running', name: null, distance_m: km * 1000, duration_s: 3000, training_load: load } as Activity)

function days(from: string, n: number) {
  const out: string[] = []
  const d = new Date(from + 'T12:00:00')
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

describe('fitnessSeries', () => {
  it('steady daily load converges: fitness ≈ fatigue ≈ load, form ≈ 0', () => {
    const acts = days('2026-01-01', 200).map((d) => run(d, 60))
    const s = fitnessSeries(acts, [], '2026-07-19', '2026-07-19', '2026-07-19')
    expect(s[0].fitness).toBeGreaterThan(55)
    expect(Math.abs(s[0].form)).toBeLessThan(3)
  })

  it('a taper after steady load makes form positive on race day', () => {
    const acts = days('2026-01-01', 120).map((d) => run(d, 80))
    const today = '2026-04-30'
    const planned = days('2026-05-01', 14).map((d, i) => ({ date: d, status: 'planned', duration_min: i % 2 ? 30 : 0, key_session: false, sport: 'run', kind: 'easy' }) as PlanWorkout)
    const s = fitnessSeries(acts, planned, '2026-05-14', '2026-05-14', today)
    expect(s[0].projected).toBe(true)
    expect(s[0].form).toBeGreaterThan(5)
  })

  it('weights key sessions and races higher', () => {
    const base = { duration_min: 60, sport: 'run', kind: 'easy', key_session: false } as const
    expect(plannedLoad({ ...base, key_session: true, kind: 'tempo' }, 1)).toBeGreaterThan(plannedLoad(base, 1))
    expect(plannedLoad({ ...base, sport: 'race' }, 1)).toBe(120)
  })

  it('classifies form', () => {
    expect(formZone(12).label).toBe('Frisch')
    expect(formZone(-40).status).toBe('serious')
  })
})

describe('prognose', () => {
  const today = '2026-10-02'
  const best10k = { key: '10k' as const, label: '10 km', meters: 10000, time_s: 2700, date: '2026-09-01', activity_id: null }

  it('riegel extrapolates with a higher exponent upward', () => {
    expect(riegel(2700, 10000, 21097.5)).toBeGreaterThan(2700 * Math.pow(2.10975, 1.06))
  })

  it('adds a penalty for the marathon when volume is low', () => {
    const acts = days('2026-08-25', 36).filter((_, i) => i % 3 === 0).map((d) => run(d, 50, 10))
    const p = prognose('marathon', 42195, [best10k], acts, undefined, today)!
    expect(p.penaltyPct).toBeGreaterThan(5)
    expect(p.time_s).toBeGreaterThan(riegel(2700, 10000, 42195))
    expect(p.reasons.length).toBe(2)
  })

  it('ignores bests older than a year', () => {
    expect(prognose('10k', 10000, [{ ...best10k, date: '2025-01-01' }], [], undefined, today)).toBeNull()
  })

  it('judges the goal with room for remaining training', () => {
    expect(verdict(6000, 5900, 10).status).toBe('good')
    expect(verdict(6000, 6150, 10).status).toBe('good')
    expect(verdict(6000, 6400, 4).status).toBe('serious')
  })
})
