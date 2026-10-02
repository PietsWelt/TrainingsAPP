import { describe, expect, it } from 'vitest'
import { buildRoutine, routineKind, type RoutineKind } from './mobility'

const run = (o: object) => ({ sport: 'running', duration_s: 2400, anaerobic_te: 0.5, name: 'Lauf', ...o })

describe('mobility', () => {
  it('erkennt die Art der Einheit', () => {
    expect(routineKind(run({}))).toBe('run_easy')
    expect(routineKind(run({ anaerobic_te: 2.8 }))).toBe('run_hard')
    expect(routineKind(run({ duration_s: 100 * 60 }))).toBe('run_long')
    expect(routineKind(run({ sport: 'road_biking' }))).toBe('bike')
    expect(routineKind(run({ sport: 'strength_training' }))).toBe('strength')
  })

  it('wird mit der Stufe länger', () => {
    for (const k of ['run_easy', 'run_hard', 'run_long', 'bike', 'swim', 'strength'] as RoutineKind[]) {
      const [e, m, h] = (['easy', 'medium', 'hard'] as const).map((l) => buildRoutine(k, l))
      expect(e.steps).toHaveLength(4)
      expect(m.steps).toHaveLength(6)
      expect(h.steps).toHaveLength(8)
      expect(e.minutes).toBeLessThan(m.minutes)
      expect(m.minutes).toBeLessThan(h.minutes)
      expect(new Set(h.steps.map((s) => s.ex.id)).size).toBe(8)
    }
  })
})
