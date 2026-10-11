import { describe, expect, it } from 'vitest'
import { addDays, daysBetween } from './dates'
import { generatePlan } from './generate'
import { arrange, generateAll, MINI_TAPER, RECOVERY } from './multi'
import type { Fitness, PlanWorkout, RaceEvent } from './types'

let n = 0
const id = () => `m${++n}`
const fit: Fitness = { weeklyRunKm: 30, longestRunKm: 14, weeklyHours: { swim: 1, bike: 3, run: 3 } }
const TODAY = '2026-10-02'

function ev(over: Partial<RaceEvent>): RaceEvent {
  return { id: 'e', name: 'Rennen', date: '2027-04-25', type: 'marathon', goal_time_s: null, days_per_week: 5, long_day: 6, notes: null, ...over }
}

const marathon = ev({ id: 'M', name: 'Marathon', date: '2027-04-25', type: 'marathon' })
const half = ev({ id: 'H', name: 'Halbmarathon', date: '2027-03-14', type: 'half' })
const tenK = ev({ id: 'T', name: 'Stadtlauf', date: '2026-12-06', type: '10k' })
const weekKm = (ws: PlanWorkout[], monday: string) =>
  ws.filter((w) => w.sport === 'run' && w.date >= monday && w.date < addDays(monday, 7)).reduce((s, w) => s + (w.distance_km ?? 0), 0)

describe('arrange', () => {
  it('has nothing to decide with one race', () => {
    const a = arrange([marathon], TODAY)
    expect(a.multiple).toBe(false)
    expect(a.roles.get('M')?.kind).toBe('main')
  })
  it('without a choice the most demanding race leads', () => {
    const a = arrange([tenK, half, marathon], TODAY)
    expect(a.chosen).toBe(false)
    expect(a.prio?.id).toBe('M')
    expect(a.roles.get('H')).toMatchObject({ kind: 'inside', owner: 'M' })
    expect(a.roles.get('T')).toMatchObject({ kind: 'inside', owner: 'M' })
  })
  it('a chosen early priority gets its own plan, the later race starts after recovery', () => {
    const a = arrange([{ ...tenK, priority: true }, marathon], TODAY)
    expect(a.prio?.id).toBe('T')
    expect(a.roles.get('T')?.kind).toBe('main')
    const m = a.roles.get('M')
    expect(m?.kind).toBe('own')
    if (m?.kind === 'own') expect(m.from).toBe(addDays(tenK.date, RECOVERY['10k'] + 1))
  })
  it('warns when a side race sits in the taper of the main race', () => {
    const late = ev({ id: 'L', name: 'Testlauf', date: addDays(marathon.date, -10), type: '10k' })
    const r = arrange([marathon, late], TODAY).roles.get('L')
    expect(r?.kind === 'inside' && r.warnings.join(' ')).toMatch(/Tapering/)
  })
  it('warns about two marathons close together', () => {
    const m2 = ev({ id: 'M2', name: 'Frühjahr', date: addDays(marathon.date, -28), type: 'marathon' })
    const r = arrange([{ ...marathon, priority: true }, m2], TODAY).roles.get('M2')
    expect(r?.kind === 'inside' && r.warnings.join(' ')).toMatch(/Zwei lange Rennen/)
  })
  it('ignores past races', () => {
    const past = ev({ id: 'P', date: '2026-09-01', priority: true })
    const a = arrange([past, marathon], TODAY)
    expect(a.prio?.id).toBe('M')
    expect(a.roles.has('P')).toBe(false)
  })
})

describe('generateAll', () => {
  it('equals the single plan for one race', () => {
    const strip = (ws: PlanWorkout[]) => ws.map((w) => ({ ...w, id: '' }))
    const a = strip(generateAll([marathon], fit, TODAY, id))
    const b = strip(generatePlan(marathon, fit, TODAY, id))
    expect(a).toEqual(b)
  })

  it('never plans two sessions of different races on the same day', () => {
    const ws = generateAll([tenK, half, marathon], fit, TODAY, id)
    const days = ws.filter((w) => w.sport !== 'race').map((w) => w.date)
    expect(new Set(days).size).toBe(days.length)
    // Kein doppelter Umfang: keine Woche über dem Höchstumfang des Hauptplans allein.
    const single = generatePlan(marathon, fit, TODAY, id)
    const mondays = [...new Set(ws.map((w) => addDays(w.date, -((new Date(w.date).getUTCDay() + 6) % 7))))]
    for (const m of mondays) expect(weekKm(ws, m)).toBeLessThanOrEqual(weekKm(single, m) + 0.01)
  })

  it('adds the side race with a short taper before and recovery after', () => {
    const ws = generateAll([half, marathon], fit, TODAY, id)
    const race = ws.find((w) => w.event_id === 'H')!
    expect(race).toMatchObject({ sport: 'race', date: half.date })
    expect(ws.filter((w) => w.date === half.date)).toHaveLength(1)
    const near = ws.filter((w) => w.event_id === 'M' && Math.abs(daysBetween(w.date, half.date)) <= 2 && w.date < half.date)
    expect(near.every((w) => !w.key_session)).toBe(true)
    const after = ws.filter((w) => w.event_id === 'M' && w.date > half.date && w.date <= addDays(half.date, RECOVERY.half))
    expect(after.length).toBeGreaterThan(0)
    expect(after.every((w) => !w.key_session)).toBe(true)
    // Ruhetag direkt nach dem Halbmarathon
    expect(ws.some((w) => w.date === addDays(half.date, 1))).toBe(false)
    const before = ws.filter((w) => w.event_id === 'M' && w.date >= addDays(half.date, -MINI_TAPER.half) && w.date < half.date)
    expect(before.every((w) => w.original)).toBe(true)
    // Das Hauptrennen und sein Tapering bleiben unberührt.
    const single = generatePlan(marathon, fit, TODAY, id)
    const tail = (xs: PlanWorkout[]) => xs.filter((w) => w.date >= addDays(marathon.date, -21)).map((w) => [w.date, w.title, w.distance_km])
    expect(tail(ws)).toEqual(tail(single))
  })

  it('a later race builds on the main race and starts after recovery', () => {
    const ws = generateAll([{ ...tenK, priority: true }, marathon], fit, TODAY, id)
    const m = ws.filter((w) => w.event_id === 'M')
    expect(m[0].date >= addDays(tenK.date, RECOVERY['10k'] + 1)).toBe(true)
    expect(ws.filter((w) => w.event_id === 'T').at(-1)?.sport).toBe('race')
    // Kein Lauf länger als 10 % über dem bisher längsten im Plan (Schutz bleibt).
    const t = ws.filter((w) => w.event_id === 'T' && w.sport === 'run')
    const longestT = Math.max(...t.map((w) => w.distance_km ?? 0))
    const firstLong = m.find((w) => w.kind === 'long')!
    expect(firstLong.distance_km!).toBeLessThanOrEqual(Math.max(longestT * 0.9, fit.longestRunKm) * 1.1 + 0.1)
  })
})
