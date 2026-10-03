import { describe, expect, it } from 'vitest'
import type { PlanWorkout } from './plan/types'
import { legSession, mergeFocus, setsOf, stabiSession, upperSession, weekStrength } from './strength'

// Woche ab Montag, 5. Oktober 2026.
const MON = '2026-10-05'
const day = (i: number) => `2026-10-${String(5 + i).padStart(2, '0')}`
let n = 0
const w = (i: number, kind: PlanWorkout['kind'], extra: Partial<PlanWorkout> = {}) =>
  ({ id: `w${++n}`, event_id: 'e', date: day(i), sport: 'run', kind, title: '', description: null, duration_min: 45, distance_km: 8, key_session: ['intervals', 'tempo', 'long'].includes(kind), phase: 'base', week_index: 1, status: 'planned', activity_id: null, moved_from: null, ...extra }) as PlanWorkout

// Di Intervalle, Mi locker, Fr Tempo, So langer Lauf.
const week = [w(1, 'intervals'), w(2, 'easy'), w(4, 'tempo'), w(6, 'long')]

describe('weekStrength', () => {
  it('legt Beine nicht vor harte Einheiten', () => {
    const s = weekStrength(MON, week, {}, MON)
    // Mo (vor Di), Do (vor Fr), Sa (vor So) scheiden aus; Mi ist locker und Do frei.
    expect(s.legs).toBe(day(2))
    expect(s.legsAfterKey).toBe(false)
  })
  it('legt zwei Stabi-Tage mit Abstand, nicht auf den Beintag', () => {
    const s = weekStrength(MON, week, {}, MON)
    expect(s.stabi).toHaveLength(2)
    expect(s.stabi).not.toContain(s.legs)
    expect(Date.parse(s.stabi[1]) - Date.parse(s.stabi[0])).toBeGreaterThanOrEqual(2 * 86400_000)
  })
  it('zählt Erledigtes aus dem Gym-Eintrag und schiebt Verpasstes nach vorn', () => {
    const s = weekStrength(MON, week, { [day(0)]: { focus: 'core', hard: false } }, day(3))
    expect(s.stabiDone).toEqual([day(0)])
    expect(s.stabi).toHaveLength(2)
    expect(s.legs! >= day(3)).toBe(true)
    expect(weekStrength(MON, week, { [day(2)]: { focus: 'legs', hard: true } }, MON).legsDone).toBe(day(2))
  })
  it('weicht nach eine harte Einheit aus, wenn kein Tag frei ist', () => {
    const packed = [w(0, 'intervals'), w(1, 'tempo'), w(2, 'easy'), w(3, 'fartlek'), w(4, 'easy'), w(5, 'intervals'), w(6, 'long')]
    const s = weekStrength(MON, packed, {}, MON)
    expect(s.legsAfterKey).toBe(true)
    expect([day(1), day(3)]).toContain(s.legs)
  })
  it('kein Beintraining in den 10 Tagen vor dem Rennen', () => {
    const race = [w(1, 'easy'), w(3, 'easy'), w(6, 'race', { sport: 'race' })]
    const s = weekStrength(MON, race, {}, MON)
    expect(s.legs).toBeNull()
    expect(s.raceWeek).toBe(true)
    expect(s.stabi).toHaveLength(1)
    expect(s.stabi[0] <= day(3)).toBe(true)
  })
  it('ohne Plan: Beine Mitte der Woche', () => {
    expect(weekStrength(MON, [], {}, MON).legs).toBe(day(2))
  })
})

describe('Einheiten', () => {
  it('passt die Dosis an die Phase an', () => {
    expect(legSession('base').title).toMatch(/Grundkraft/)
    expect(legSession('build').steps[0].ex.id).toBe('pogo')
    expect(legSession('taper').hard).toBe(false)
    expect(legSession(null).steps.some((s) => /kreuz/i.test(s.ex.name))).toBe(false)
  })
  it('Stabi wächst mit der Stufe', () => {
    expect(stabiSession('easy').steps).toHaveLength(5)
    expect(stabiSession('hard').rounds).toBe(3)
    expect(stabiSession('medium').minutes).toBeGreaterThan(stabiSession('easy').minutes)
  })
})

describe('Oberkörper', () => {
  it('A und B haben je 7 Übungen ohne Dopplung', () => {
    const a = upperSession('A', 'base').steps.map((s) => s.ex.id)
    const b = upperSession('B', 'base').steps.map((s) => s.ex.id)
    expect(a).toHaveLength(7)
    expect(b).toHaveLength(7)
    expect(a.filter((id) => b.includes(id))).toEqual([])
  })
  it('macht im Taper weniger Sätze', () => {
    const base = upperSession('A', 'base').steps.reduce((n, s) => n + setsOf(s.dose), 0)
    const taper = upperSession('A', 'taper').steps.reduce((n, s) => n + setsOf(s.dose), 0)
    expect(taper).toBeLessThan(base)
  })
  it('liest Sätze aus der Dosis', () => {
    expect(setsOf('3 × 8–10 je Bein')).toBe(3)
    expect(setsOf('30 s je Seite')).toBe(1)
  })
  it('macht aus Beinen und Oberkörper Ganzkörper', () => {
    expect(mergeFocus('legs', 'upper')).toBe('full')
    expect(mergeFocus('core', 'legs')).toBe('legs')
    expect(mergeFocus(undefined, 'upper')).toBe('upper')
    expect(mergeFocus('upper', 'upper')).toBe('upper')
  })
})
