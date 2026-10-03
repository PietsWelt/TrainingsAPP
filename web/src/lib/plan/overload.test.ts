import { describe, expect, it } from 'vitest'
import type { Activity, DailyMetrics } from '../types'
import { deload, MARK_DELOAD, MARK_LIGHT, overloadCheck } from './overload'
import { addDays } from './dates'
import type { PlanWorkout } from './types'

const TODAY = '2026-10-10'
const day = (i: number, over: Partial<DailyMetrics> = {}): DailyMetrics =>
  ({ date: addDays(TODAY, -i), sleep_s: 7.5 * 3600, hrv_last_night: 60 + (i % 3), resting_hr: 48, hrv_weekly_avg: null, hrv_baseline_low: null, ...over }) as DailyMetrics
const days = (f: (i: number) => Partial<DailyMetrics> = () => ({})) => Array.from({ length: 40 }, (_, i) => day(i, f(i)))
const act = (i: number, load: number): Activity => ({ id: i, local_date: addDays(TODAY, -i), sport: 'running', duration_s: 3600, training_load: load }) as Activity
let n = 0
const w = (i: number, kind: PlanWorkout['kind'], extra: Partial<PlanWorkout> = {}) =>
  ({ id: `w${++n}`, event_id: 'e', date: addDays(TODAY, i), sport: 'run', kind, title: kind === 'intervals' ? 'Intervalle' : 'Lauf', description: null, duration_min: 60, distance_km: 10, key_session: kind !== 'easy', phase: 'build', week_index: 1, status: 'planned', activity_id: null, moved_from: null, steps: kind === 'intervals' ? [{ type: 'repeat', times: 6, steps: [] }] : null, ...extra }) as PlanWorkout

describe('overloadCheck', () => {
  it('meldet nichts bei normalen Werten', () => {
    expect(overloadCheck(days(), [], [], TODAY).level).toBe(0)
  })
  it('erkennt erhöhten Ruhepuls und wenig Schlaf als zwei Warnzeichen', () => {
    const c = overloadCheck(days((i) => (i < 7 ? { resting_hr: 55, sleep_s: 5.5 * 3600 } : {})), [], [], TODAY)
    expect(c.signals.map((s) => s.key).sort()).toEqual(['rhr', 'sleep'])
    expect(c.level).toBe(2)
  })
  it('ignoriert 1–2 kurze Nächte, z. B. nach dem Feiern', () => {
    const c = overloadCheck(days((i) => (i < 2 ? { sleep_s: 3.5 * 3600 } : {})), [], [], TODAY)
    expect(c.signals).toHaveLength(0)
  })
  it('nutzt Garmins HRV-Normalbereich', () => {
    const c = overloadCheck(days((i) => (i === 0 ? { hrv_weekly_avg: 50, hrv_baseline_low: 55 } : {})), [], [], TODAY)
    expect(c.signals.map((s) => s.key)).toEqual(['hrv'])
  })
  it('erkennt einen Lastsprung', () => {
    const acts = [...[8, 12, 16, 20, 24].map((i) => act(i, 50)), ...[0, 1, 2, 3, 4].map((i) => act(i, 120))]
    expect(overloadCheck(days(), acts, [], TODAY).signals.map((s) => s.key)).toEqual(['load'])
  })
  it('zählt Einheiten, die zu hart waren', () => {
    const done = [w(-2, 'tempo', { status: 'done', feedback: 'hard' }), w(-5, 'intervals', { status: 'done', feedback: 'hard' })]
    expect(overloadCheck(days(), [], done, TODAY).signals.map((s) => s.key)).toEqual(['feel'])
  })
})

describe('deload', () => {
  const plan = () => [w(0, 'easy'), w(1, 'intervals'), w(3, 'long'), w(5, 'tempo'), w(9, 'intervals')]
  const one = { level: 1 as const, signals: [{ key: 'rhr' as const, label: 'Ruhepuls', detail: '' }] }
  const two = { level: 2 as const, signals: [...one.signals, { key: 'sleep' as const, label: 'Schlaf', detail: '' }] }

  it('kürzt bei einem Warnzeichen nur harte Einheiten der nächsten 4 Tage', () => {
    const d = deload(plan(), one, TODAY)
    expect(d.changed).toHaveLength(2)
    const iv = d.changed.find((x) => x.kind === 'intervals')!
    expect(iv.title).toContain(MARK_LIGHT)
    expect(iv.steps![0]).toMatchObject({ times: 5 })
    expect(iv.original?.title).toBe('Intervalle')
  })
  it('macht bei mehreren Warnzeichen 7 Tage Entlastung, harte Einheiten werden locker', () => {
    const d = deload(plan(), two, TODAY)
    expect(d.changed).toHaveLength(4)
    expect(d.changed.every((x) => x.title.includes(MARK_DELOAD))).toBe(true)
    expect(d.changed.filter((x) => x.key_session && x.kind !== 'long')).toHaveLength(0)
    expect(d.changed.find((x) => x.kind === 'long')!.distance_km).toBe(7)
  })
  it('greift nicht doppelt und lässt die Rennwoche in Ruhe', () => {
    const once = deload(plan(), two, TODAY).changed
    const after = plan().map((x) => once.find((c) => c.date === x.date) ?? x)
    expect(deload(after, two, TODAY).changed).toHaveLength(0)
    const race = [...plan(), w(4, 'race', { sport: 'race' })]
    expect(deload(race, two, TODAY).changed.filter((x) => x.date <= addDays(TODAY, 4))).toHaveLength(0)
  })
  it('respektiert eine zurückgenommene Anpassung', () => {
    expect(deload(plan(), two, TODAY, { date: addDays(TODAY, -2), level: 2 }).changed).toHaveLength(0)
  })
})

describe('longRunGuard', () => {
  it('kürzt lange Läufe auf höchstens 10 % über dem längsten der letzten 30 Tage', async () => {
    const { longRunGuard } = await import('./overload')
    const acts = [{ id: 1, local_date: addDays(TODAY, -5), sport: 'running', distance_m: 15000, duration_s: 5400 } as Activity]
    // 22 km wird auf 16,5 gekürzt; danach sind 18 km wieder im Rahmen (16,5 × 1,1).
    const plan = [w(2, 'long', { distance_km: 22, duration_min: 130 }), w(9, 'long', { distance_km: 18 })]
    const g = longRunGuard(plan, acts, TODAY)
    expect(g.changed.map((x) => x.distance_km)).toEqual([16.5])
    expect(g.changed[0].original?.distance_km).toBe(22)
  })
})
