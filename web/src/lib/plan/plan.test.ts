import { describe, expect, it } from 'vitest'
import { autoComplete, progressOf, skipWorkout } from './adapt'
import { addDays, weekday } from './dates'
import { generatePlan, pacesFor, phasesFor, volumesFor } from './generate'
import type { Fitness, PlanWorkout, RaceEvent } from './types'

let n = 0
const id = () => `w${++n}`
const fit: Fitness = { weeklyRunKm: 30, longestRunKm: 14, weeklyHours: { swim: 1, bike: 3, run: 3 } }
const TODAY = '2026-10-02' // Freitag

function ev(over: Partial<RaceEvent> = {}): RaceEvent {
  return { id: 'e1', name: 'Testlauf', date: '2027-02-28', type: 'half', goal_time_s: 6300, days_per_week: 4, long_day: 6, notes: null, ...over }
}

describe('phasesFor', () => {
  it('ends with the taper and keeps the order', () => {
    const p = phasesFor(16, 2)
    expect(p).toHaveLength(16)
    expect(p.slice(-2)).toEqual(['taper', 'taper'])
    expect(p.indexOf('build')).toBeGreaterThan(p.lastIndexOf('base'))
    expect(p.indexOf('peak')).toBeGreaterThan(p.lastIndexOf('build'))
  })
  it('handles very short plans', () => {
    expect(phasesFor(1, 3)).toEqual(['taper'])
    expect(phasesFor(3, 1)).toEqual(['build', 'peak', 'taper'])
  })
})

describe('volumesFor', () => {
  it('grows at most 8 % per week, deloads every 4th week and stays below the cap', () => {
    const v = volumesFor(phasesFor(12, 2), 30, 50)
    expect(v[1]).toBeCloseTo(32.4)
    expect(v[3]).toBeCloseTo(v[2] * 0.75)
    expect(Math.max(...v)).toBeLessThanOrEqual(50)
    expect(v[11]).toBeLessThan(v[9])
  })
})

describe('pacesFor', () => {
  it('derives sensible paces from a 1:45 half marathon goal', () => {
    const p = pacesFor('half', 6300)!
    expect(p.race).toBeCloseTo(298.6, 0) // 4:59/km
    expect(p.interval).toBeLessThan(p.threshold)
    expect(p.threshold).toBeLessThan(p.race + 5)
    expect(p.easy[0]).toBeGreaterThan(p.marathon)
  })
  it('returns null without goal time or for triathlon', () => {
    expect(pacesFor('10k', null)).toBeNull()
    expect(pacesFor('tri_olympic', 9000)).toBeNull()
  })
})

describe('generatePlan', () => {
  it('builds a half marathon plan from tomorrow until race day', () => {
    const plan = generatePlan(ev(), fit, TODAY, id)
    expect(plan[0].date > TODAY).toBe(true)
    expect(plan.at(-1)!.sport).toBe('race')
    expect(plan.at(-1)!.date).toBe('2027-02-28')
    expect(plan.filter((w) => w.sport === 'race')).toHaveLength(1)
    // nie zwei Einheiten am selben Tag
    expect(new Set(plan.map((w) => w.date)).size).toBe(plan.length)
    // langer Lauf immer am Sonntag
    for (const w of plan.filter((x) => x.kind === 'long')) expect(weekday(w.date)).toBe(6)
    // vier Einheiten in einer normalen Woche
    const wk = plan.filter((w) => w.week_index === 5)
    expect(wk).toHaveLength(4)
    // Paces aus der Zielzeit stehen in der Beschreibung
    expect(plan.some((w) => w.description?.includes('/km'))).toBe(true)
  })

  it('moves the long run to Saturday when asked', () => {
    const plan = generatePlan(ev({ long_day: 5 }), fit, TODAY, id)
    for (const w of plan.filter((x) => x.kind === 'long')) expect(weekday(w.date)).toBe(5)
  })

  it('keeps race week sessions before a mid-week race and avoids clashes', () => {
    const plan = generatePlan(ev({ date: '2026-12-02', type: '10k' }), fit, TODAY, id) // Mittwoch
    expect(plan.at(-1)!.date).toBe('2026-12-02')
    expect(new Set(plan.map((w) => w.date)).size).toBe(plan.length)
  })

  it('builds triathlon weeks with all three sports and bricks in the build phase', () => {
    const plan = generatePlan(ev({ type: 'tri_olympic', days_per_week: 6, long_day: 5, goal_time_s: null }), fit, TODAY, id)
    const sports = new Set(plan.map((w) => w.sport))
    expect(sports).toEqual(new Set(['swim', 'bike', 'run', 'race']))
    expect(plan.some((w) => w.kind === 'brick')).toBe(true)
    for (const w of plan.filter((x) => x.sport !== 'race')) expect(w.duration_min).toBeGreaterThanOrEqual(20)
  })

  it('returns nothing for a race in the past', () => {
    expect(generatePlan(ev({ date: '2026-09-01' }), fit, TODAY, id)).toEqual([])
  })

  it('works for every distance and number of days', () => {
    for (const type of ['5k', '10k', 'half', 'marathon', 'tri_sprint', 'tri_olympic', 'tri_70_3', 'tri_ironman'] as const)
      for (let d = 3; d <= 7; d++) {
        const plan = generatePlan(ev({ type, days_per_week: d }), fit, TODAY, id)
        expect(plan.length).toBeGreaterThan(10)
        expect(new Set(plan.map((w) => w.date)).size).toBe(plan.length)
        for (const w of plan) expect(Number.isFinite(w.duration_min ?? 0)).toBe(true)
      }
  })
})

const wk = (over: Partial<PlanWorkout>): PlanWorkout => ({
  id: id(),
  event_id: 'e1',
  date: '2026-10-06',
  sport: 'run',
  kind: 'easy',
  title: 'Lockerer Lauf',
  description: null,
  duration_min: 40,
  distance_km: 7,
  key_session: false,
  phase: 'build',
  week_index: 1,
  status: 'planned',
  activity_id: null,
  moved_from: null,
  ...over,
})

describe('skipWorkout', () => {
  // Woche ab Mo 5.10.: Di Intervalle, Mi locker, Fr Tempo, So lang
  const week = () => [
    wk({ id: 'tue', date: '2026-10-06', kind: 'intervals', title: 'Intervalle', key_session: true }),
    wk({ id: 'wed', date: '2026-10-07' }),
    wk({ id: 'fri', date: '2026-10-09', kind: 'tempo', title: 'Schwellenlauf', key_session: true }),
    wk({ id: 'sun', date: '2026-10-11', kind: 'long', title: 'Langer Lauf', key_session: true }),
    wk({ id: 'race', date: '2027-01-10', sport: 'race', kind: 'race', title: 'Rennen', key_session: true }),
  ]

  it('marks an easy run as skipped without moving anything', () => {
    const { changed } = skipWorkout(week(), 'wed', '2026-10-06')
    expect(changed).toHaveLength(1)
    expect(changed[0].status).toBe('skipped')
  })

  it('moves a skipped key session to a free day with a rest day around it', () => {
    // heute Di: Intervalle ausgefallen → Mittwoch ist locker belegt, Do liegt neben Fr (hart) → nur Mi möglich? Mi liegt neben Di (die Einheit selbst) – erlaubt.
    const { changed, message } = skipWorkout(week(), 'tue', '2026-10-06')
    const moved = changed.find((c) => c.id === 'tue')!
    expect(moved.status).toBe('planned')
    expect(moved.moved_from).toBe('2026-10-06')
    expect(['2026-10-07']).toContain(moved.date)
    expect(changed.find((c) => c.id === 'wed')?.status).toBe('skipped')
    expect(message).toContain('verschoben')
  })

  it('drops a key session when no day fits', () => {
    const { changed } = skipWorkout(week(), 'sun', '2026-10-11')
    expect(changed[0].status).toBe('skipped')
    expect(changed[0].date).toBe('2026-10-11')
  })

  it('makes next week lighter after two missed sessions', () => {
    const plan = [...week(), wk({ id: 'next', date: '2026-10-13', distance_km: 10, duration_min: 60 })]
    plan[1].status = 'skipped'
    const { changed, message } = skipWorkout(plan, 'sun', '2026-10-11')
    expect(changed.find((c) => c.id === 'next')?.distance_km).toBe(9)
    expect(message).toContain('10 %')
  })
})

describe('autoComplete and progress', () => {
  it('ticks off planned sessions with a matching activity on the same day', () => {
    const plan = [wk({ id: 'a', date: '2026-10-01' }), wk({ id: 'b', date: '2026-10-01', sport: 'swim' }), wk({ id: 'c', date: addDays(TODAY, 1) })]
    const acts = [{ id: 9, local_date: '2026-10-01', sport: 'running' }] as never
    const changed = autoComplete(plan, acts, TODAY)
    expect(changed.map((c) => c.id)).toEqual(['a'])
    expect(changed[0].activity_id).toBe(9)
  })

  it('counts done sessions without the race', () => {
    const plan = [wk({ status: 'done', date: '2026-10-01' }), wk({ date: '2026-10-03' }), wk({ sport: 'race', date: '2026-10-10' })]
    const p = progressOf(plan, TODAY)
    expect(p.total).toBe(2)
    expect(p.done).toBe(1)
    expect(p.dueSoFar).toBe(1)
    expect(p.daysToRace).toBe(8)
  })
})
