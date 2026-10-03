import { describe, expect, it } from 'vitest'
import { exerciseHistory, fmtSets, lastSets, parseNum, progression, repRange, type GymSet } from './gymSets'

const set = (date: string, set_no: number, kg: number | null, reps: number | null, exercise_id = 'dbBench'): GymSet => ({ date, session: 'upperA', exercise_id, set_no, kg, reps })

describe('gym sets', () => {
  it('reads the rep range from a dose', () => {
    expect(repRange('3 × 8–12 je Seite')).toEqual([8, 12])
    expect(repRange('2 × 5 je Bein')).toEqual([5, 5])
    expect(repRange('30 s halten')).toBeNull()
  })

  it('finds the last session before today', () => {
    const all = [set('2026-09-20', 1, 18, 10), set('2026-09-27', 2, 20, 7), set('2026-09-27', 1, 20, 8), set('2026-10-03', 1, 22, 6)]
    expect(lastSets(all, 'dbBench', '2026-10-03').map((s) => s.reps)).toEqual([8, 7])
    expect(lastSets(all, 'curl', '2026-10-03')).toEqual([])
  })

  it('formats sets compactly', () => {
    expect(fmtSets([set('d', 1, 20, 8), set('d', 2, 20, 8), set('d', 3, 20, 7)])).toBe('20 kg × 8, 8, 7')
    expect(fmtSets([set('d', 1, 20, 8), set('d', 2, 17.5, 8)])).toBe('20×8 · 17,5×8')
    expect(fmtSets([set('d', 1, null, 6), set('d', 2, 0, 5)])).toBe('6, 5 Wdh.')
  })

  it('suggests more weight only when all sets hit the top of the range, never in the taper', () => {
    const top = [set('d', 1, 20, 10), set('d', 2, 20, 10), set('d', 3, 20, 10)]
    expect(progression(top, '3 × 6–10', true)?.kind).toBe('up')
    expect(progression(top, '3 × 6–10', false)?.kind).toBe('hold')
    expect(progression([set('d', 1, 20, 10), set('d', 2, 20, 8)], '3 × 6–10', true)).toBeNull()
    expect(progression([set('d', 1, 20, 7), set('d', 2, 20, 5)], '3 × 6–10', true)?.kind).toBe('hold')
    expect(progression([set('d', 1, null, 10), set('d', 2, null, 10)], '2 × 8–10', true)?.text).toContain('Zusatzgewicht')
  })

  it('parses German decimals', () => {
    expect(parseNum('17,5')).toBe(17.5)
    expect(parseNum('')).toBeNull()
  })

  it('builds a history per exercise, latest first', () => {
    const h = exerciseHistory([set('2026-09-20', 1, 20, 10), set('2026-09-27', 1, 22.5, 8), set('2026-09-25', 1, null, 6, 'pullup')])
    expect(h.map((x) => x.id)).toEqual(['dbBench', 'pullup'])
    expect(h[0].days[1].best).toBeCloseTo(28.5)
    expect(h[1].weighted).toBe(false)
  })
})
