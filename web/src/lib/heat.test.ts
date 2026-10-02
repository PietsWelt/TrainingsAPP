import { describe, expect, it } from 'vitest'
import { heatLevel, heatPace, heatPct } from './heat'

describe('heatPct', () => {
  it('kein Effekt bei kühlem Wetter und ohne Daten', () => {
    expect(heatPct(12, 6)).toBe(0)
    expect(heatPct(null, 10)).toBe(0)
  })
  it('steigt mit Temperatur und Taupunkt', () => {
    // 24 °C + Taupunkt 16 °C = 75 + 61 °F = 136 → 2,5 %
    expect(heatPct(24, 16)).toBe(2.5)
    // Gleiche Temperatur, trockene Luft: weniger
    expect(heatPct(24, 5)).toBeLessThan(heatPct(24, 16))
    expect(heatPct(32, 24)).toBe(7)
    expect(heatPct(38, 28)).toBe(10)
  })
  it('Stufen und umgerechnetes Tempo', () => {
    expect(heatLevel(0)).toBe('none')
    expect(heatLevel(2.5)).toBe('moderate')
    expect(heatLevel(9)).toBe('extreme')
    expect(heatPace(300, 2.5)).toBe(308)
  })
})
