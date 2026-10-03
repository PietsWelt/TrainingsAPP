import { describe, expect, it } from 'vitest'
import { alphaZone, compareLt, latestGarminLt } from './lactate'

const alpha = (hr: number) => ({ hr, speed: null, n: 3, date: '2026-09-20' })
const garmin = (hr: number, date = '2026-09-01') => ({ date, hr, speed_mps: 3.4 })

describe('compareLt', () => {
  it('erkennt, ob Garmin tiefer, höher oder gleich liegt', () => {
    expect(compareLt(garmin(165), alpha(173))).toEqual({ diff: -8, verdict: 'garmin-tiefer' })
    expect(compareLt(garmin(178), alpha(170))).toEqual({ diff: 8, verdict: 'garmin-hoeher' })
    expect(compareLt(garmin(170), alpha(173))!.verdict).toBe('passt')
    expect(compareLt(null, alpha(170))).toBeNull()
  })
})

describe('latestGarminLt', () => {
  it('nimmt den neuesten Wert und markiert alte', () => {
    expect(latestGarminLt([garmin(160, '2026-01-01'), garmin(165, '2026-09-01')], '2026-10-03')).toEqual({ lt: garmin(165, '2026-09-01'), stale: false })
    expect(latestGarminLt([garmin(160, '2026-01-01')], '2026-10-03')!.stale).toBe(true)
    expect(latestGarminLt([], '2026-10-03')).toBeNull()
  })
})

describe('alphaZone', () => {
  it('teilt in drei Bereiche', () => {
    expect(alphaZone(0.9).label).toBe('locker')
    expect(alphaZone(0.6).label).toBe('zwischen den Schwellen')
    expect(alphaZone(0.45).label).toBe('über der Laktatschwelle')
  })
})
