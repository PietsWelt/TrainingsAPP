import { describe, expect, it } from 'vitest'
import type { Best } from '../records'
import type { Activity, GarminLactate } from '../types'
import { anchorText, thresholdAnchor, thresholdFromBest } from './anchor'

const TODAY = '2026-10-11'
const run = (date: string, lt_speed_mps: number): Activity => ({ id: Number(date.replaceAll('-', '')), local_date: date, sport: 'running', lt_hr: 165, lt_speed_mps }) as unknown as Activity
// 3 Brustgurt-Läufe mit 3,7 m/s an der Schwelle (≈ 4:30/km)
const strap = [run('2026-10-03', 3.7), run('2026-09-28', 3.7), run('2026-09-20', 3.7)]
const garmin = (date: string, speed: number): GarminLactate => ({ date, hr: 168, speed_mps: speed })
const best = (date: string, time_s: number): Best => ({ key: '10k', label: '10 km', meters: 10000, time_s, date, activity_id: null })

describe('thresholdAnchor', () => {
  it('nimmt zuerst den Brustgurt, dann Garmin, dann Bestzeiten', () => {
    expect(thresholdAnchor(strap, [best('2026-09-01', 2700)], [garmin('2026-09-15', 3.65)], TODAY)?.source).toBe('brustgurt')
    expect(thresholdAnchor([], [best('2026-09-01', 2700)], [garmin('2026-09-15', 3.65)], TODAY)?.source).toBe('garmin')
    const b = thresholdAnchor([], [best('2026-09-01', 2700)], [], TODAY)!
    expect(b.source).toBe('bestzeit')
    expect(b.pace).toBeCloseTo(thresholdFromBest({ time_s: 2700, meters: 10000 }))
  })

  it('lässt veraltete und zu dünne Werte weg', () => {
    // Nur 2 Brustgurt-Läufe
    expect(thresholdAnchor(strap.slice(0, 2), [], [], TODAY)).toBeNull()
    // Neueste Brustgurt-Schätzung älter als 60 Tage
    const old = [run('2026-08-01', 3.7), run('2026-07-28', 3.7), run('2026-07-20', 3.7)]
    expect(thresholdAnchor(old, [], [], TODAY)).toBeNull()
    // Garmin älter als ein halbes Jahr, Bestzeit älter als 120 Tage
    expect(thresholdAnchor([], [best('2026-05-01', 2700)], [garmin('2026-03-01', 3.65)], TODAY)).toBeNull()
  })

  it('nimmt die langsamere von zwei deutlich abweichenden Quellen', () => {
    // Brustgurt 4:30/km, Garmin 4:50/km (über 4 % langsamer)
    const a = thresholdAnchor(strap, [], [garmin('2026-09-15', 1000 / 290)], TODAY)!
    expect(a.source).toBe('garmin')
    expect(a.pace).toBeCloseTo(290)
    // Nur knapp daneben: der Brustgurt bleibt
    expect(thresholdAnchor(strap, [], [garmin('2026-09-15', 1000 / 275)], TODAY)!.source).toBe('brustgurt')
  })

  it('beschreibt die Quelle', () => {
    expect(anchorText({ source: 'brustgurt', date: '2026-10-03' })).toBe('deiner Laktatschwelle (Brustgurt, 3. Okt.)')
    expect(anchorText({ source: 'bestzeit', date: '2026-10-03' })).toBe('deiner Bestzeit vom 3. Okt.')
  })
})
