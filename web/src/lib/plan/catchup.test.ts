import { describe, expect, it } from 'vitest'
import { catchUp, pauseDays, reentry, reentrySteps, REENTRY } from './catchup'
import { addDays } from './dates'
import type { PlanWorkout } from './types'
import type { Activity } from '../types'

const TODAY = '2026-10-08' // Donnerstag
let n = 0
const wk = (over: Partial<PlanWorkout>): PlanWorkout => ({
  id: `w${++n}`, event_id: 'e1', date: TODAY, sport: 'run', kind: 'easy', title: 'Lockerer Lauf', description: null,
  duration_min: 40, distance_km: 7, key_session: false, phase: 'build', week_index: 1, status: 'planned',
  activity_id: null, moved_from: null, ...over,
})
const act = (over: Partial<Activity>): Activity => ({ id: ++n, local_date: TODAY, sport: 'running', duration_s: 2400, ...over }) as Activity

describe('catchUp', () => {
  it('counts other endurance sport on the same day as replaced', () => {
    const w = wk({ date: '2026-10-07' })
    const { changed, messages } = catchUp([w], [act({ local_date: '2026-10-07', sport: 'cycling', duration_s: 3600 })], TODAY, 14)
    expect(changed[0].status).toBe('done')
    expect(messages[0]).toContain('ersetzt')
  })

  it('does not count strength training as a replacement', () => {
    const w = wk({ date: '2026-10-06' })
    const { changed } = catchUp([w], [act({ local_date: '2026-10-06', sport: 'strength_training' })], TODAY, 14)
    expect(changed[0].status).toBe('skipped')
  })

  it('waits until noon before treating yesterday as missed', () => {
    const w = wk({ date: '2026-10-07' })
    expect(catchUp([w], [], TODAY, 8).changed).toHaveLength(0)
    expect(catchUp([w], [], TODAY, 13).changed[0].status).toBe('skipped')
  })

  it('moves a missed key session to a free day later this week', () => {
    const key = wk({ date: '2026-10-06', kind: 'intervals', title: 'Intervalle', key_session: true })
    const { changed } = catchUp([key, wk({ date: '2026-10-11', kind: 'long', key_session: true })], [], TODAY, 13)
    const moved = changed.find((c) => c.id === key.id)!
    expect(moved.status).toBe('planned')
    expect(moved.date > TODAY).toBe(true)
  })

  it('leaves future and finished sessions alone', () => {
    const { changed } = catchUp([wk({ date: addDays(TODAY, 1) }), wk({ date: '2026-10-05', status: 'done' })], [], TODAY, 13)
    expect(changed).toHaveLength(0)
  })
})

describe('reentry', () => {
  const runs = (dates: string[]) => dates.map((d) => act({ local_date: d }))

  it('measures the pause', () => {
    expect(pauseDays(runs(['2026-09-30']), TODAY)).toBe(7)
    expect(pauseDays(runs(['2026-09-20', TODAY]), TODAY)).toBe(17)
    expect(pauseDays(runs(['2026-10-06', '2026-10-07']), TODAY)).toBe(0)
  })

  it('grows with the pause', () => {
    expect(reentrySteps(3)).toHaveLength(0)
    expect(reentrySteps(7)).toHaveLength(1)
    expect(reentrySteps(14)).toHaveLength(2)
    expect(reentrySteps(30)).toHaveLength(3)
  })

  it('makes the next weeks lighter once, turning hard sessions easy after long breaks', () => {
    const plan = [
      wk({ date: addDays(TODAY, 1), kind: 'intervals', title: 'Intervalle', key_session: true, distance_km: 10, duration_min: 60 }),
      wk({ date: addDays(TODAY, 9), distance_km: 10, duration_min: 60 }),
      wk({ date: addDays(TODAY, 20), distance_km: 10, duration_min: 60 }),
    ]
    const { changed, messages } = reentry(plan, runs(['2026-09-20']), TODAY)
    expect(changed).toHaveLength(2)
    expect(changed[0].kind).toBe('easy')
    expect(changed[0].distance_km).toBe(7)
    expect(changed[1].distance_km).toBe(8.5)
    expect(changed.every((c) => c.title.includes(REENTRY))).toBe(true)
    expect(messages[0]).toContain('17 Tage')
    const again = plan.map((w) => changed.find((c) => c.id === w.id) ?? w)
    expect(reentry(again, runs(['2026-09-20']), TODAY).changed).toHaveLength(0)
  })

  it('keeps race week untouched', () => {
    const plan = [wk({ date: addDays(TODAY, 2) }), wk({ date: addDays(TODAY, 5), sport: 'race', kind: 'race' })]
    expect(reentry(plan, runs(['2026-09-25']), TODAY).changed).toHaveLength(0)
  })
})
