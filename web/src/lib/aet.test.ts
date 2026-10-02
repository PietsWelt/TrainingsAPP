import { describe, expect, it } from 'vitest'
import { personalAet, shareAbove } from './aet'
import type { Activity } from './types'

const run = (local_date: string, aet_hr: number | null, aet_speed_mps: number | null = null) => ({ local_date, aet_hr, aet_speed_mps }) as Activity

describe('personalAet', () => {
  it('nimmt den Median der letzten 5 Schätzungen aus 90 Tagen', () => {
    const acts = [run('2026-05-01', 120), run('2026-09-01', 150, 3), run('2026-09-05', 146, 3.1), run('2026-09-10', 160), run('2026-09-12', 148), run('2026-09-20', null)]
    const a = personalAet(acts)!
    expect(a.hr).toBe(149)
    expect(a.n).toBe(4)
    expect(a.speed).toBeCloseTo(3.05)
    expect(a.date).toBe('2026-09-12')
  })
  it('nutzt nur Läufe bis zum Stichtag', () => {
    expect(personalAet([run('2026-09-10', 150)], '2026-09-09')).toBeNull()
  })
})

describe('shareAbove', () => {
  it('zählt angeschnittene Bereiche anteilig', () => {
    expect(shareAbove({ '140': 100, '150': 100 }, 150)).toBe(0.5)
    expect(shareAbove({ '140': 100, '150': 100 }, 142)).toBeCloseTo((60 + 100) / 200)
    expect(shareAbove(null, 150)).toBeNull()
  })
})
