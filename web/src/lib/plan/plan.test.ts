import { describe, expect, it } from 'vitest'
import { autoComplete, coverage, fillSteps, needsSteps, isPartial, giveFeedback, legsProposal, progressOf, readinessProposal, refreshHrTargets, restoreOriginal, scaleWorkout, skipWorkout } from './adapt'
import { addDays, weekday } from './dates'
import { stepLines } from './labels'
import { deloadWeeks, generatePlan, longCapKm, LONG_MAX_MIN, MAX_GAIN, pacesFor, paceSchedule, peakKm, phasesFor, planThreshold, volumesFor } from './generate'
import { explain } from './explain'
import { alreadyMaintained } from './usePlan'
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
  it('grows at most 8 % per week, deloads after 3 load weeks and stays below the cap', () => {
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

  const run = (id: number, local_date: string, km: number, min: number) =>
    ({ id, local_date, sport: 'running', distance_m: km * 1000, duration_s: min * 60 }) as never

  it('marks a much shorter run as partial and counts it half', () => {
    const plan = [wk({ id: 'long', date: '2026-10-01', kind: 'long', key_session: true, distance_km: 20, duration_min: 120 })]
    const acts = [run(5, '2026-10-01', 3, 18)]
    const [done] = autoComplete(plan, acts, TODAY)
    expect(done.status).toBe('done')
    expect(isPartial(done, acts[0])).toBe(true)
    const p = progressOf([done], TODAY, acts)
    expect(p.done).toBe(0)
    expect(p.partial).toBe(1)
  })

  it('uses the better of time and distance, so slow runs still count fully', () => {
    expect(coverage({ duration_min: 60, distance_km: 10 }, { duration_s: 60 * 60, distance_m: 5000 })).toBe(1)
    expect(coverage({ duration_min: null, distance_km: null }, { duration_s: 600, distance_m: 2000 })).toBeNull()
  })

  it('picks the longest run when there are two on the same day', () => {
    const plan = [wk({ id: 'a', date: '2026-10-01' })]
    const [done] = autoComplete(plan, [run(1, '2026-10-01', 2, 12), run(2, '2026-10-01', 7, 40)], TODAY)
    expect(done.activity_id).toBe(2)
  })

  it('takes over a session from the day before when the run is long enough', () => {
    const plan = [wk({ id: 'tue', date: '2026-09-29', kind: 'intervals', key_session: true, duration_min: 50, distance_km: 9 })]
    const [done] = autoComplete(plan, [run(3, '2026-09-30', 9, 50)], TODAY)
    expect(done).toMatchObject({ id: 'tue', date: '2026-09-30', moved_from: '2026-09-29', status: 'done', activity_id: 3 })
  })

  it('does not take over a neighbouring session with a short run, from another week or onto a day with its own session', () => {
    const tue = wk({ id: 'tue', date: '2026-09-29' })
    expect(autoComplete([tue], [run(3, '2026-09-30', 2, 12)], TODAY)).toEqual([])
    const sun = wk({ id: 'sun', date: '2026-09-27' })
    expect(autoComplete([sun], [run(4, '2026-09-28', 7, 40)], TODAY)).toEqual([])
    const wed = wk({ id: 'wed', date: '2026-09-30', status: 'skipped' })
    expect(autoComplete([tue, wed], [run(5, '2026-09-30', 7, 40)], TODAY)[0]?.id).toBe('tue')
    const wedDone = wk({ id: 'wed', date: '2026-09-30', status: 'done', activity_id: 9 })
    expect(autoComplete([tue, wedDone], [run(9, '2026-09-30', 7, 40), run(6, '2026-09-30', 7, 40)], TODAY)).toEqual([])
  })

  it('can pull tomorrow\'s session forward to today', () => {
    const plan = [wk({ id: 'sat', date: '2026-10-03' })]
    const [done] = autoComplete(plan, [run(7, TODAY, 7, 40)], TODAY)
    expect(done).toMatchObject({ id: 'sat', date: TODAY, moved_from: '2026-10-03' })
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

describe('Plan nach gemessener Form', () => {
  const anchored = (pace: number): Fitness => ({ ...fit, threshold: { pace, source: 'brustgurt', date: '2026-09-30' } })
  const strip = (ws: PlanWorkout[]) => ws.map(({ id: _id, ...w }) => w)

  it('bleibt ohne Messwert wie bisher', () => {
    expect(strip(generatePlan(ev(), { ...fit, threshold: null }, TODAY, id))).toEqual(strip(generatePlan(ev(), fit, TODAY, id)))
    expect(paceSchedule('half', 6300, null, 10)(3)).toEqual(pacesFor('half', 6300))
  })

  it('beginnt in Woche 1 bei der heutigen Schwelle und nennt die Quelle', () => {
    const plan = generatePlan(ev(), anchored(300), TODAY, id)
    expect(planThreshold(plan, 'half', TODAY)).toBeCloseTo(300, -0.5)
    const easy = plan.find((w) => w.kind === 'easy' && w.steps)!
    expect(easy.description).toContain('Tempo nach deiner Laktatschwelle (Brustgurt, 30. Sept.)')
    expect(explain(easy)!.pace).toContain('aus deiner Laktatschwelle (Brustgurt, 30. Sept.)')
  })

  it('wird bis zum Tapering höchstens 3 % schneller, auch bei einem unrealistischen Ziel', () => {
    // Heute 5:00/km an der Schwelle, Ziel 1:30 h im Halbmarathon (Schwelle ≈ 4:15/km).
    const at = paceSchedule('half', 5400, 300, 12)
    for (let w = 0; w <= 14; w++) expect(at(w)!.threshold).toBeGreaterThanOrEqual(300 * (1 - MAX_GAIN) - 0.01)
    expect(at(0)!.threshold).toBeCloseTo(300)
    expect(at(12)!.threshold).toBeCloseTo(291)
    // Wettkampftempo: das realistische, mit Hinweis aufs Ziel
    expect(at(12)!.goalRace).toBeCloseTo(5400 / 21.0975)
    expect(at(12)!.race).toBeGreaterThan(at(12)!.goalRace!)
    const plan = generatePlan(ev({ goal_time_s: 5400 }), anchored(300), TODAY, id)
    expect(plan.some((w) => w.description?.includes('nach deiner Form realistisch'))).toBe(true)
  })

  it('trainiert das Zieltempo, wenn das Ziel nah an der Form liegt, und bleibt schneller als das Ziel bei den heutigen Tempos', () => {
    const goal = pacesFor('half', 6300)!
    const near = paceSchedule('half', 6300, goal.threshold * 1.02, 10)
    expect(near(10)!.race).toBeCloseTo(goal.race)
    expect(near(10)!.goalRace).toBeUndefined()
    const fast = paceSchedule('half', 6300, goal.threshold * 0.95, 10)
    expect(fast(10)!.threshold).toBeCloseTo(goal.threshold * 0.95)
    expect(fast(10)!.race).toBeCloseTo(goal.race)
  })
})

describe('Zeitgrenze für den langen Lauf', () => {
  it('Marathon 4:30 h: kein langer Lauf über 180 min', () => {
    const plan = generatePlan(ev({ type: 'marathon', goal_time_s: 16200, days_per_week: 5, date: '2027-04-04' }), { ...fit, weeklyRunKm: 50, longestRunKm: 24 }, TODAY, id)
    const long = plan.filter((w) => w.kind === 'long')
    expect(Math.max(...long.map((w) => w.duration_min!))).toBeLessThanOrEqual(LONG_MAX_MIN.marathon)
  })
  it('rechnet die Grenze über das lockere Tempo in Kilometer um', () => {
    const p = pacesFor('marathon', 16200)!
    expect((longCapKm('marathon', p) * ((p.easy[0] + p.easy[1]) / 2) * 1.03) / 60).toBeCloseTo(180)
    expect(longCapKm('5k', null)).toBeCloseTo((90 * 60) / (360 * 1.03))
  })
})

describe('Entlastungswochen', () => {
  it('liegen nie direkt vor dem Tapering, nie doppelt und nach höchstens 4 Belastungswochen', () => {
    for (const weeks of [12, 16, 26])
      for (const taper of [1, 2, 3]) {
        const phases = phasesFor(weeks, taper)
        const d = deloadWeeks(phases)
        const firstTaper = phases.indexOf('taper')
        expect(d[firstTaper - 1]).toBe(false)
        phases.forEach((p, i) => p === 'taper' && expect(d[i]).toBe(false))
        for (let i = 1; i < d.length; i++) expect(d[i] && d[i - 1]).toBe(false)
        let run = 0
        for (let i = 0; i < firstTaper; i++) {
          run = d[i] ? 0 : run + 1
          expect(run).toBeLessThanOrEqual(4)
        }
      }
  })
})

describe('Spitzenumfang nach Zeit', () => {
  it('Marathon 4:30 h bleibt deutlich unter 85 km, 3:00 h bei 85 km', () => {
    expect(peakKm('marathon', pacesFor('marathon', 16200))).toBeLessThan(75)
    expect(peakKm('marathon', pacesFor('marathon', 10800))).toBe(85)
    expect(peakKm('marathon', null)).toBe(85)
  })
})

describe('Puls-Ziele für lockere Läufe', () => {
  const flat = (ws: PlanWorkout[]) => ws.flatMap((w) => (w.steps ?? []).flatMap((s) => (s.type === 'repeat' ? s.steps : [s])).map((s) => ({ w, s })))

  it('setzt mit aerober Schwelle Puls-Grenzen auf ruhige Schritte, nicht auf Tempo-Schritte', () => {
    const plan = generatePlan(ev({ days_per_week: 7 }), { ...fit, aetHr: 148 }, TODAY, id)
    const steps = flat(plan)
    const easy = steps.filter(({ w, s }) => w.kind === 'easy' && s.type === 'run')
    expect(easy.length).toBeGreaterThan(0)
    for (const { s } of easy) expect([s.hr_low, s.hr_high]).toEqual([128, 148])
    const rec = steps.filter(({ w }) => w.kind === 'recovery')
    expect(rec.length).toBeGreaterThan(0)
    for (const { s } of rec) expect([s.hr_low, s.hr_high, s.pace]).toEqual([118, 138, undefined])
    for (const { s } of steps.filter(({ s }) => s.pace != null && s.pace_slow == null)) expect(s.hr_low).toBeUndefined()
    expect(plan.find((w) => w.kind === 'easy')!.description).toContain('Puls 128–148')
  })

  it('setzt ohne aerobe Schwelle keine Puls-Grenzen', () => {
    const plan = generatePlan(ev({ days_per_week: 7 }), fit, TODAY, id)
    expect(flat(plan).some(({ s }) => s.hr_low != null)).toBe(false)
  })

  it('passt künftige Puls-Ziele erst ab 3 Schlägen Unterschied an und ergänzt ältere Pläne', () => {
    const plan = generatePlan(ev(), { ...fit, aetHr: 148 }, TODAY, id)
    expect(refreshHrTargets(plan, 150, TODAY)).toEqual([])
    const changed = refreshHrTargets(plan, 152, TODAY)
    expect(changed.length).toBeGreaterThan(0)
    const easy = changed.find((w) => w.kind === 'easy')!
    expect(easy.description).toContain('Puls 132–152')
    expect(easy.description).not.toContain('Puls 128–148')
    // Älterer Plan ohne Puls-Ziele: werden ergänzt
    const old = generatePlan(ev(), fit, TODAY, id)
    const added = refreshHrTargets(old, 148, TODAY)
    expect(flat(added).filter(({ s }) => s.pace_slow != null).every(({ s }) => s.hr_high === 148)).toBe(true)
    expect(stepLines(added.find((w) => w.kind === 'easy')!.steps!)[0]).toContain('Puls 128–148')
  })
})

describe('needsSteps', () => {
  const plan = generatePlan(ev(), fit, TODAY, id)
  it('löst das Nachtragen nur aus, wenn wirklich ein Ablauf fehlt', () => {
    expect(needsSteps(plan, TODAY)).toBe(false)
    const quality = plan.find((w) => w.date > TODAY && w.kind === 'tempo')!
    expect(needsSteps(plan.map((w) => (w.id === quality.id ? { ...w, steps: null } : w)), TODAY)).toBe(true)
  })
  it('ignoriert Regenerationsläufe, Vergangenes und Erledigtes', () => {
    const strip = (pred: (w: PlanWorkout) => boolean) => plan.map((w) => (pred(w) ? { ...w, steps: null } : w))
    expect(needsSteps(strip((w) => w.kind === 'recovery'), TODAY)).toBe(false)
    // Lockere Läufe ohne Tempo-Ziel haben nie einen Ablauf: kein Grund, neu zu erzeugen.
    expect(needsSteps(strip((w) => w.kind === 'easy' || w.kind === 'long'), TODAY)).toBe(false)
    // Läufe nur nach Zeit (Rennwoche) bekommen nie einen Ablauf.
    expect(needsSteps(strip((w) => w.distance_km == null && w.kind === 'easy'), TODAY)).toBe(false)
    const withEasy = plan.map((w) => (w.kind === 'easy' && w.distance_km != null ? { ...w, steps: [{ type: 'run' as const, m: 5000 }] } : w))
    const oneEasy = withEasy.find((w) => w.date > TODAY && w.kind === 'easy' && w.distance_km != null)!
    expect(needsSteps(withEasy.map((w) => (w.id === oneEasy.id ? { ...w, steps: null } : w)), TODAY)).toBe(true)
    const later = plan.find((w) => w.date > TODAY && w.sport === 'run')!
    expect(needsSteps(strip((w) => w.id === later.id), addDays(later.date, 1))).toBe(false)
    expect(needsSteps(strip((w) => w.id === later.id).map((w) => (w.id === later.id ? { ...w, status: 'done' as const } : w)), TODAY)).toBe(false)
  })
})

describe('alreadyMaintained', () => {
  it('überspringt nur bei gleichem Tag, Sync und Tageshälfte', () => {
    const m = { date: TODAY, syncId: 8, afternoon: false }
    expect(alreadyMaintained(null, TODAY, 8, 9)).toBe(false)
    expect(alreadyMaintained(m, TODAY, 8, 9)).toBe(true)
    expect(alreadyMaintained(m, TODAY, 9, 9)).toBe(false)
    expect(alreadyMaintained(m, TODAY, 8, 14)).toBe(false)
    expect(alreadyMaintained(m, addDays(TODAY, 1), 8, 9)).toBe(false)
  })
})
