import { describe, expect, it } from 'vitest'
import { autoComplete } from './adapt'
import { swapDays, swapWorkouts } from './swap'
import type { PlanWorkout } from './types'
import type { Activity } from '../types'

const TODAY = '2026-10-23' // Freitag
let n = 0
const wk = (over: Partial<PlanWorkout>): PlanWorkout => ({
  id: `w${++n}`, event_id: 'e1', date: TODAY, sport: 'run', kind: 'easy', title: 'Lockerer Lauf', description: null,
  duration_min: 40, distance_km: 7, key_session: false, phase: 'build', week_index: 1, status: 'planned',
  activity_id: null, moved_from: null, ...over,
})

describe('swapWorkouts', () => {
  it('swaps the long run on Sunday with today', () => {
    const today = wk({ kind: 'intervals', title: 'Intervalle', key_session: true })
    const long = wk({ date: '2026-10-25', kind: 'long', title: 'Langer Lauf', distance_km: 14, key_session: true })
    const { changed, message } = swapWorkouts([today, long], long, TODAY)
    expect(changed.find((c) => c.id === long.id)).toMatchObject({ date: TODAY, moved_from: '2026-10-25' })
    expect(changed.find((c) => c.id === today.id)).toMatchObject({ date: '2026-10-25', moved_from: TODAY })
    expect(message).toBe('Getauscht: Langer Lauf am Freitag, Intervalle am Sonntag.')
  })

  it('moves to a free day without touching anything else', () => {
    const w = wk({})
    const { changed, message } = swapWorkouts([w], w, '2026-10-24')
    expect(changed).toHaveLength(1)
    expect(message).toBe('Lockerer Lauf auf Samstag gelegt.')
  })

  it('clears the moved mark when a workout goes back to its own day', () => {
    const w = wk({ date: '2026-10-24', moved_from: TODAY })
    expect(swapWorkouts([w], w, TODAY).changed[0].moved_from).toBeNull()
  })

  it('lets the 14 km run tick off the long run instead of today\'s workout', () => {
    const today = wk({ kind: 'intervals', title: 'Intervalle', key_session: true })
    const long = wk({ date: '2026-10-25', kind: 'long', title: 'Langer Lauf', distance_km: 14, key_session: true })
    const swapped = swapWorkouts([today, long], long, TODAY).changed
    const run = { id: 1, local_date: TODAY, sport: 'running', duration_s: 4800, distance_m: 14000 } as Activity
    const done = autoComplete(swapped, [run], TODAY)
    expect(done).toHaveLength(1)
    expect(done[0]).toMatchObject({ id: long.id, status: 'done', activity_id: 1 })
  })
})

describe('swapDays', () => {
  it('offers the rest of the week from today on', () => {
    const w = wk({ date: '2026-10-25' })
    expect(swapDays([w], w, TODAY).map((d) => d.date)).toEqual([TODAY, '2026-10-24'])
  })

  it('blocks race days and days already trained', () => {
    const w = wk({ date: '2026-10-25' })
    const race = wk({ date: '2026-10-24', sport: 'race', kind: 'race', title: '10 km' })
    const done = wk({ status: 'done' })
    const days = swapDays([w, race, done], w, TODAY)
    expect(days.map((d) => d.blocked)).toEqual(['Schon trainiert', 'Renntag'])
  })

  it('warns when two key sessions end up back to back', () => {
    const long = wk({ date: '2026-10-25', kind: 'long', title: 'Langer Lauf', key_session: true })
    const tempo = wk({ date: '2026-10-22', kind: 'tempo', title: 'Tempolauf', key_session: true })
    const days = swapDays([long, tempo], long, TODAY)
    expect(days[0].warning).toContain('direkt neben Tempolauf')
    expect(days[1].warning).toBeNull()
  })

  it('offers nothing for done workouts or races', () => {
    expect(swapDays([], wk({ status: 'done' }), TODAY)).toEqual([])
    expect(swapDays([], wk({ sport: 'race' }), TODAY)).toEqual([])
  })
})
