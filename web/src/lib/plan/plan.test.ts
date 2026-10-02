import { describe, expect, it } from 'vitest'
import { autoComplete, fillSteps, giveFeedback, legsProposal, progressOf, readinessProposal, restoreOriginal, scaleWorkout, skipWorkout } from './adapt'
import { addDays, weekday } from './dates'
import { stepLines } from './labels'
import { generatePlan, pacesFor, phasesFor, volumesFor } from './generate'
import type { Readiness } from '../readiness'
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

describe('readinessProposal', () => {
  const low = (score: number, status: Readiness['status']): Readiness => ({ date: TODAY, score, status, headline: '', advice: 'Heute lieber locker.', components: [] })
  const plan = (): PlanWorkout[] => generatePlan(ev(), fit, addDays(TODAY, -7), id)

  it('does nothing when readiness is fine or no hard session is planned', () => {
    const p = plan()
    expect(readinessProposal(p, TODAY, low(80, 'good'))).toBeNull()
    const easyDay = p.find((w) => !w.key_session && w.date > TODAY)!.date
    expect(readinessProposal(p, easyDay, low(40, 'serious'))).toBeNull()
  })

  it('offers an easy version that can be undone', () => {
    const p = plan()
    const hardDay = p.find((w) => w.key_session && w.kind !== 'long' && w.sport !== 'race' && w.phase !== 'taper')!.date
    const prop = readinessProposal(p, hardDay, low(42, 'serious'))!
    const easy = prop.options.find((o) => o.id === 'easy')!.changed[0]
    expect(easy.key_session).toBe(false)
    expect(easy.duration_min!).toBeLessThan(prop.workout.duration_min!)
    expect(easy.original?.title).toBe(prop.workout.title)
    const back = restoreOriginal(easy)
    expect(back.title).toBe(prop.workout.title)
    expect(back.original).toBeNull()
    expect(prop.options.some((o) => o.id === 'rest')).toBe(false)
  })

  it('suggests a rest day first when readiness is critical', () => {
    const p = plan()
    const hardDay = p.find((w) => w.key_session && w.sport !== 'race' && w.phase !== 'taper')!.date
    const prop = readinessProposal(p, hardDay, low(25, 'critical'))!
    expect(prop.options[0].id).toBe('rest')
  })

  it('does not propose again once the session was adjusted', () => {
    const p = plan()
    const hardDay = p.find((w) => w.key_session && w.sport !== 'race' && w.phase !== 'taper')!.date
    const prop = readinessProposal(p, hardDay, low(42, 'serious'))!
    const changed = prop.options[0].changed[0]
    const after = p.map((w) => (w.id === changed.id ? changed : w))
    expect(readinessProposal(after, hardDay, low(42, 'serious'))).toBeNull()
  })
})

describe('steps for the watch', () => {
  const plan = generatePlan(ev(), fit, TODAY, id)
  it('gives every hard run a warm-up, a repeat block with target pace and a cool-down', () => {
    const iv = plan.find((w) => w.kind === 'intervals')!
    expect(iv.steps?.[0].type).toBe('warmup')
    expect(iv.steps?.at(-1)?.type).toBe('cooldown')
    const block = iv.steps?.find((s) => s.type === 'repeat')
    expect(block && block.type === 'repeat' && block.steps[0].pace).toBeGreaterThan(200)
    expect(stepLines(iv.steps!)[1]).toMatch(/^\d+ × 1 km @ \d:\d\d\/km, 2 min Pause$/)
  })
  it('gives easy runs one step with the easy pace range', () => {
    const e = plan.find((w) => w.kind === 'easy')!
    expect(e.steps).toHaveLength(1)
    const s = e.steps![0]
    expect(s.type === 'run' && s.m).toBe(Math.round(e.distance_km! * 10) * 100)
    expect(s.type === 'run' && s.pace! < s.pace_slow!).toBe(true)
  })
  it('fills in steps for plans made before steps existed', () => {
    const old = plan.map((w) => ({ ...w, steps: null, distance_km: w.distance_km && w.distance_km * 0.9 }))
    const filled = fillSteps(old, plan, TODAY)
    expect(filled.length).toBe(plan.filter((w) => w.steps?.length && w.sport === 'run').length)
    const easy = filled.find((w) => w.kind === 'easy')!
    expect(easy.steps![0].type === 'run' && easy.steps![0].m).toBe(Math.round(easy.distance_km! * 10) * 100)
    expect(fillSteps(filled.concat(old.filter((w) => !filled.some((f) => f.id === w.id))), plan, TODAY)).toHaveLength(0)
  })
  it('scales only the easy part when a run gets shorter', () => {
    const long: PlanWorkout = { ...plan.find((w) => w.kind === 'long')!, steps: [{ type: 'run', m: 16000 }, { type: 'run', m: 4000, pace: 300 }] }
    const s = scaleWorkout(long, 0.9)
    expect(s.steps).toEqual([{ type: 'run', m: 14400 }, { type: 'run', m: 4000, pace: 300 }])
    const iv = plan.find((w) => w.kind === 'intervals')!
    expect(scaleWorkout(iv, 0.9).steps).toEqual(iv.steps)
  })
})

describe('giveFeedback', () => {
  const base = generatePlan(ev(), fit, '2026-09-20', id).map((w) => (w.date <= TODAY ? { ...w, status: 'done' as const } : w))
  const done = base.filter((w) => w.status === 'done' && w.sport !== 'race')
  it('only notes a single hard session', () => {
    const r = giveFeedback(base, done.at(-1)!.id, 'hard', TODAY)
    expect(r.changed).toHaveLength(1)
    expect(r.changed[0].feedback).toBe('hard')
  })
  it('makes the next 7 days lighter after two hard sessions in a row', () => {
    const all = base.map((w) => (w.id === done.at(-2)!.id ? { ...w, feedback: 'hard' as const } : w))
    const r = giveFeedback(all, done.at(-1)!.id, 'hard', TODAY)
    const next = all.filter((w) => w.date > TODAY && w.date <= addDays(TODAY, 7) && w.status === 'planned')
    expect(r.changed).toHaveLength(1 + next.length)
    const before = next.find((w) => w.distance_km)!
    expect(r.changed.find((c) => c.id === before.id)!.distance_km).toBeCloseTo(before.distance_km! * 0.9, 0)
    expect(r.message).toMatch(/10 % leichter/)
  })
  it('makes easy and long runs longer after two easy ratings', () => {
    const all = base.map((w) => (w.id === done.at(-2)!.id ? { ...w, feedback: 'easy' as const } : w))
    const r = giveFeedback(all, done.at(-1)!.id, 'easy', TODAY)
    expect(r.changed.slice(1).every((c) => ['easy', 'long', 'recovery'].includes(c.kind))).toBe(true)
    expect(r.changed.length).toBeGreaterThan(1)
  })
  it('does not adjust again on the third rating in a row', () => {
    const ids = [done.at(-3)!.id, done.at(-2)!.id]
    const all = base.map((w) => (ids.includes(w.id) ? { ...w, feedback: 'hard' as const } : w))
    expect(giveFeedback(all, done.at(-1)!.id, 'hard', TODAY).changed).toHaveLength(1)
  })
})

describe('legsProposal', () => {
  const plan = generatePlan(ev(), fit, TODAY, id)
  const key = plan.find((w) => w.key_session && w.sport === 'run' && w.kind !== 'long')!
  it('offers easy or move after hard leg training yesterday', () => {
    const p = legsProposal(plan, key.date, { daysAgo: 1, hard: true })!
    expect(p.workout.id).toBe(key.id)
    expect(p.reason).toMatch(/Gestern Beine trainiert/)
    expect(p.options[0].id).toBe('easy')
    expect(p.options.some((o) => o.id === 'rest')).toBe(false)
  })
  it('ignores light leg training two days ago and days without a hard session', () => {
    expect(legsProposal(plan, key.date, { daysAgo: 2, hard: false })).toBeNull()
    expect(legsProposal(plan, key.date, null)).toBeNull()
    const easyDay = plan.find((w) => !w.key_session)!
    expect(legsProposal(plan, easyDay.date, { daysAgo: 1, hard: true })).toBeNull()
  })
})
