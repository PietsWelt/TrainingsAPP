// Regelbasierter Trainingsplan: Periodisierung (Grundlage → Aufbau → Spitze → Tapering),
// ~8 % Steigerung pro Woche, jede 4. Woche Entlastung, ca. 80 % locker / 20 % intensiv.

import { addDays, daysBetween, mondayOf } from './dates'
import { isTri, type EventType, type RepeatStep, type Step, type WorkStep, type Fitness, type Kind, type Phase, type PlanWorkout, type RaceEvent, type RunEventType, type Sport, type TriEventType } from './types'

interface RunSpec {
  km: number
  taper: number
  minKm: number
  peakKm: number
  longMin: number
  longMax: number
}
const RUN: Record<RunEventType, RunSpec> = {
  '5k': { km: 5, taper: 1, minKm: 20, peakKm: 45, longMin: 6, longMax: 14 },
  '10k': { km: 10, taper: 1, minKm: 25, peakKm: 55, longMin: 8, longMax: 18 },
  half: { km: 21.0975, taper: 2, minKm: 30, peakKm: 65, longMin: 10, longMax: 22 },
  marathon: { km: 42.195, taper: 3, minKm: 35, peakKm: 85, longMin: 14, longMax: 32 },
}

interface TriSpec {
  taper: number
  minH: number
  peakH: number
  runLike: RunEventType
}
const TRI: Record<TriEventType, TriSpec> = {
  tri_sprint: { taper: 1, minH: 4, peakH: 7, runLike: '5k' },
  tri_olympic: { taper: 1, minH: 5, peakH: 9, runLike: '10k' },
  tri_70_3: { taper: 2, minH: 6, peakH: 12, runLike: 'half' },
  tri_ironman: { taper: 3, minH: 8, peakH: 16, runLike: 'marathon' },
}

export const raceDistanceKm = (t: EventType): number | null => (isTri(t) ? null : RUN[t].km)

// ---------- Phasen und Umfang ----------

export function phasesFor(weeks: number, taper: number): Phase[] {
  const t = Math.min(taper, weeks)
  const n = weeks - t
  const peak = n >= 5 ? Math.max(1, Math.round(n * 0.2)) : n >= 2 ? 1 : 0
  const base = n >= 6 ? Math.round((n - peak) * 0.45) : Math.floor((n - peak) / 3)
  const build = n - peak - base
  return [...Array(base).fill('base'), ...Array(build).fill('build'), ...Array(peak).fill('peak'), ...Array(t).fill('taper')]
}

const TAPER_FACTORS: Record<number, number[]> = { 1: [0.55], 2: [0.75, 0.5], 3: [0.8, 0.65, 0.5] }

/** Wochenumfang je Woche (km oder Stunden). */
export function volumesFor(phases: Phase[], start: number, peak: number): number[] {
  const out: number[] = []
  let v = start
  let lastFull = start
  const nTaper = phases.filter((p) => p === 'taper').length
  const taperF = TAPER_FACTORS[nTaper] ?? TAPER_FACTORS[3].slice(-nTaper)
  let ti = 0
  phases.forEach((p, i) => {
    if (p === 'taper') {
      out.push(lastFull * taperF[ti++])
    } else if (i % 4 === 3) {
      out.push(lastFull * 0.75) // Entlastungswoche
    } else {
      out.push(v)
      lastFull = v
      v = Math.min(peak, v * 1.08)
    }
  })
  return out
}

// ---------- Tempobereiche ----------

export interface Paces {
  race: number // s/km
  interval: number
  threshold: number
  marathon: number
  easy: [number, number]
}

/** Abgeleitet aus der Zielzeit über die Riegel-Formel (T2 = T1 · (D2/D1)^1.06). */
export function pacesFor(type: EventType, goalS: number | null): Paces | null {
  if (!goalS || isTri(type)) return null
  const d = RUN[type].km
  const pace = (km: number) => (goalS * Math.pow(km / d, 1.06)) / km
  const m = pace(42.195)
  return {
    race: goalS / d,
    interval: pace(5),
    threshold: (pace(10) + pace(21.0975)) / 2,
    marathon: m,
    easy: [m * 1.12, m * 1.25],
  }
}

export function fmtPace(s: number): string {
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, '0')}`
}

type Zone = 'easy' | 'threshold' | 'interval' | 'race' | 'marathon'
const ZONE_TEXT: Record<Zone, string> = {
  easy: 'locker, Zone 2',
  threshold: 'Schwelle, Zone 4, „angenehm hart“',
  interval: '5-km-Tempo, Zone 5',
  race: 'Wettkampftempo',
  marathon: 'Marathontempo',
}
function at(z: Zone, p: Paces | null): string {
  if (!p) return ZONE_TEXT[z]
  if (z === 'easy') return `${fmtPace(p.easy[1])}–${fmtPace(p.easy[0])}/km`
  return `${fmtPace(p[z])}/km`
}

// ---------- Wochenvorlagen ----------

type RunRole = 'Q1' | 'Q2' | 'E' | 'R' | 'L'
// Basis: langer Lauf am Sonntag (Index 6); wird auf den gewünschten Tag rotiert.
const RUN_TEMPLATES: Record<number, Partial<Record<number, RunRole>>> = {
  3: { 1: 'Q1', 3: 'E', 6: 'L' },
  4: { 1: 'Q1', 2: 'E', 4: 'Q2', 6: 'L' },
  5: { 0: 'E', 1: 'Q1', 3: 'Q2', 4: 'E', 6: 'L' },
  6: { 0: 'E', 1: 'Q1', 2: 'E', 3: 'Q2', 5: 'E', 6: 'L' },
  7: { 0: 'R', 1: 'Q1', 2: 'E', 3: 'Q2', 4: 'E', 5: 'E', 6: 'L' },
}

type TriRole = 'S' | 'RQ' | 'BQ' | 'BL' | 'RL' | 'RE'
// Basis: lange Radausfahrt am Samstag (Index 5), langer Lauf am Sonntag.
const TRI_TEMPLATES: Record<number, Partial<Record<number, TriRole>>> = {
  3: { 1: 'S', 3: 'RQ', 5: 'BL' },
  4: { 1: 'S', 3: 'RQ', 5: 'BL', 6: 'RL' },
  5: { 0: 'S', 1: 'RQ', 3: 'BQ', 5: 'BL', 6: 'RL' },
  6: { 0: 'S', 1: 'RQ', 2: 'S', 3: 'BQ', 5: 'BL', 6: 'RL' },
  7: { 0: 'S', 1: 'RQ', 2: 'S', 3: 'BQ', 4: 'RE', 5: 'BL', 6: 'RL' },
}

function rotate<T>(tpl: Partial<Record<number, T>>, baseLong: number, longDay: number): [number, T][] {
  const shift = (longDay - baseLong + 7) % 7
  return Object.entries(tpl).map(([d, r]) => [(Number(d) + shift) % 7, r as T])
}

// ---------- Einheiten ----------

interface Draft {
  sport: Sport
  kind: Kind
  title: string
  description: string
  duration_min: number | null
  distance_km: number | null
  key_session: boolean
  steps?: Step[]
}

const r1 = (x: number) => Math.round(x * 10) / 10
const r5 = (x: number) => Math.max(20, Math.round(x / 5) * 5)

function runMinutes(km: number, p: Paces | null, factor = 1): number {
  const pace = p ? (p.easy[0] + p.easy[1]) / 2 : 360
  return Math.round((km * pace * factor) / 60 / 5) * 5
}

// Bausteine für die Uhr
const WU: WorkStep = { type: 'warmup', time_s: 12 * 60, note: 'Locker einlaufen' }
const CD: WorkStep = { type: 'cooldown', time_s: 10 * 60, note: 'Locker auslaufen' }
const work = (x: Omit<WorkStep, 'type'>): WorkStep => ({ type: 'run', ...x })
const jog = (x: Omit<WorkStep, 'type'>): WorkStep => ({ type: 'recover', note: 'Traben', ...x })
const repeat = (times: number, ...steps: WorkStep[]): RepeatStep => ({ type: 'repeat', times, steps })
const pz = (z: Exclude<Zone, 'easy'>, p: Paces | null) => (p ? Math.round(p[z]) : undefined)

function runQuality(slot: 'Q1' | 'Q2', type: RunEventType, phase: Phase, pw: number, km: number, p: Paces | null): Draft {
  const short = type === '5k' || type === '10k'
  const base = { sport: 'run' as Sport, distance_km: r1(km), duration_min: runMinutes(km, p, 0.92), key_session: true }
  const wu = 'Ein- und Auslaufen je 10–15 min locker.'
  const strides = (n: number): Draft => ({
    ...base,
    kind: 'strides',
    key_session: false,
    title: 'Lockerer Lauf mit Steigerungen',
    description: `Locker (${at('easy', p)}), am Ende ${n} × 20 s Steigerungen.`,
    steps: [work({ m: Math.max(1000, Math.round((km - 0.5) * 10) * 100), note: 'Locker' }), repeat(n, work({ time_s: 20, note: 'Steigerung' }), jog({ time_s: 60 })), CD],
  })
  if (phase === 'base') {
    if (slot === 'Q1') {
      const n = 6 + Math.min(pw, 4)
      return {
        ...base,
        kind: 'fartlek',
        title: 'Fahrtspiel',
        description: `${n} × 1 min zügig (${at('threshold', p)}) / 1 min locker. ${wu}`,
        steps: [WU, repeat(n, work({ time_s: 60, pace: pz('threshold', p), note: 'Zügig' }), jog({ time_s: 60 })), CD],
      }
    }
    return strides(6)
  }
  if (phase === 'build') {
    if (slot === 'Q1') {
      const reps = Math.min(4, 2 + Math.floor(pw / 2))
      const len = short ? 8 : 10 + (pw % 2) * 2
      return {
        ...base,
        kind: 'tempo',
        title: 'Schwellenlauf',
        description: `${reps} × ${len} min @ ${at('threshold', p)}, 2 min Trabpause. ${wu}`,
        steps: [WU, repeat(reps, work({ time_s: len * 60, pace: pz('threshold', p), note: 'Schwelle' }), jog({ time_s: 120 })), CD],
      }
    }
    if (short) {
      const n = 5 + Math.min(pw, 3)
      return {
        ...base,
        kind: 'intervals',
        title: 'Intervalle',
        description: `${n} × 800 m @ ${at('interval', p)}, 400 m Trabpause. ${wu}`,
        steps: [WU, repeat(n, work({ m: 800, pace: pz('interval', p) }), jog({ m: 400 })), CD],
      }
    }
    if (type === 'half') {
      const n = 4 + Math.min(pw, 2)
      return {
        ...base,
        kind: 'intervals',
        title: 'Intervalle',
        description: `${n} × 1 km @ ${at('interval', p)}, 2 min Trabpause. ${wu}`,
        steps: [WU, repeat(n, work({ m: 1000, pace: pz('interval', p) }), jog({ time_s: 120 })), CD],
      }
    }
    const mk = 8 + 2 * Math.min(pw, 4)
    return {
      ...base,
      kind: 'race_pace',
      title: 'Marathontempo',
      description: `${mk} km @ ${at('marathon', p)}. ${wu}`,
      steps: [WU, work({ m: mk * 1000, pace: pz('marathon', p), note: 'Marathontempo' }), CD],
    }
  }
  if (phase === 'peak') {
    if (slot === 'Q1') {
      const blocks: Record<RunEventType, [number, number, number]> = {
        '5k': [6, 1000, 120],
        '10k': [4, 2000, 120],
        half: pw === 0 ? [2, 5000, 180] : [3, 4000, 120],
        marathon: [1, (12 + 2 * Math.min(pw, 2)) * 1000, 0],
      }
      const [n, m, pause] = blocks[type]
      const text = n === 1 ? `${m / 1000} km @ RACE am Stück.` : `${n} × ${m / 1000} km @ RACE, ${pause / 60} min Trabpause.`
      const steps: Step[] =
        n === 1
          ? [WU, work({ m, pace: pz('race', p), note: 'Wettkampftempo' }), CD]
          : [WU, repeat(n, work({ m, pace: pz('race', p), note: 'Wettkampftempo' }), jog({ time_s: pause })), CD]
      return { ...base, kind: 'race_pace', title: 'Wettkampftempo', description: `${text.replace('RACE', at('race', p))} ${wu}`, steps }
    }
    if (short)
      return {
        ...base,
        kind: 'intervals',
        title: 'Kurze Intervalle',
        description: `8 × 400 m schnell (schneller als ${at('interval', p)}), 200 m Trabpause. ${wu}`,
        steps: [WU, repeat(8, work({ m: 400, pace: p ? Math.round(p.interval - 8) : undefined, note: 'Schnell' }), jog({ m: 200 })), CD],
      }
    return {
      ...base,
      kind: 'tempo',
      title: 'Schwellenlauf',
      description: `3 × 10 min @ ${at('threshold', p)}, 2 min Trabpause. ${wu}`,
      steps: [WU, repeat(3, work({ time_s: 600, pace: pz('threshold', p), note: 'Schwelle' }), jog({ time_s: 120 })), CD],
    }
  }
  // taper
  if (slot === 'Q1')
    return {
      ...base,
      kind: 'race_pace',
      title: 'Kurz und knackig',
      description: `4 × 1 km @ ${at('race', p)}, 2 min Trabpause. ${wu}`,
      steps: [WU, repeat(4, work({ m: 1000, pace: pz('race', p), note: 'Wettkampftempo' }), jog({ time_s: 120 })), CD],
    }
  return strides(4)
}

function runLong(type: RunEventType, phase: Phase, pw: number, km: number, p: Paces | null): Draft {
  let description = `Ruhig und gleichmäßig (${at('easy', p)}).`
  let steps: Step[] | undefined
  const total = Math.round(km * 10) * 100
  if (phase === 'build' && type !== '5k') description += ' Die letzten 2 km etwas zügiger.'
  if (phase === 'peak' && type === 'marathon') {
    const fast = 6 + 2 * Math.min(pw, 2)
    description = `Ruhig beginnen, die letzten ${fast} km im ${at('marathon', p)}.`
    steps = [work({ m: Math.max(1000, total - fast * 1000), note: 'Ruhig' }), work({ m: fast * 1000, pace: pz('marathon', p), note: 'Marathontempo' })]
  }
  if (phase === 'peak' && type === 'half') {
    description = `Ruhig beginnen, die letzten 4 km im ${at('race', p)}.`
    steps = [work({ m: Math.max(1000, total - 4000), note: 'Ruhig' }), work({ m: 4000, pace: pz('race', p), note: 'Wettkampftempo' })]
  }
  return { sport: 'run', kind: 'long', title: 'Langer Lauf', description, distance_km: r1(km), duration_min: runMinutes(km, p, 1.03), key_session: true, steps }
}

function runEasy(km: number, p: Paces | null, recovery = false): Draft {
  return {
    sport: 'run',
    kind: recovery ? 'recovery' : 'easy',
    title: recovery ? 'Regenerationslauf' : 'Lockerer Lauf',
    description: recovery ? 'Sehr locker, Zone 1. Lieber zu langsam als zu schnell.' : `Locker (${at('easy', p)}). Du solltest dich unterhalten können.`,
    distance_km: r1(km),
    duration_min: runMinutes(km, p, recovery ? 1.08 : 1),
    key_session: false,
  }
}

function runWeek(type: RunEventType, phase: Phase, pw: number, km: number, roles: RunRole[], p: Paces | null): Map<RunRole, Draft> {
  const spec = RUN[type]
  const qCount = roles.filter((r) => r === 'Q1' || r === 'Q2').length
  const long = Math.min(spec.longMax, Math.max(spec.longMin * (phase === 'taper' ? 0.7 : 1), km * 0.3))
  const q = Math.min(16, Math.max(6, km * 0.17))
  const easyRoles = roles.filter((r) => r === 'E' || r === 'R').length
  // Ein lockerer Lauf soll nie länger als ~70 % des langen Laufs werden; bei wenigen Tagen sinkt dann der Wochenumfang.
  const easy = easyRoles ? Math.min(long * 0.7, Math.max(4, (km - long - q * qCount) / easyRoles)) : 0
  const m = new Map<RunRole, Draft>()
  m.set('Q1', runQuality('Q1', type, phase, pw, q, p))
  m.set('Q2', runQuality('Q2', type, phase, pw, q, p))
  m.set('L', runLong(type, phase, pw, long, p))
  m.set('E', runEasy(easy, p))
  m.set('R', runEasy(Math.min(easy, 6), p, true))
  return m
}

function triWeek(type: TriEventType, phase: Phase, pw: number, hours: number, roles: TriRole[]): Map<TriRole, Draft> {
  const has = (r: TriRole) => roles.includes(r)
  const nSwim = roles.filter((r) => r === 'S').length
  const swim = (hours * 0.2 * 60) / Math.max(1, nSwim)
  const bike = hours * 0.5 * 60
  const run = hours * 0.3 * 60
  const bl = has('BQ') ? bike * 0.6 : bike
  const bq = bike * 0.4
  const [rl, rq, re] = has('RE') ? [0.45, 0.3, 0.25] : has('RL') ? [0.55, 0.45, 0] : [0, 1, 0]
  const m = new Map<TriRole, Draft>()
  const d = (sport: Sport, kind: Kind, title: string, description: string, min: number, key: boolean): Draft => ({
    sport,
    kind,
    title,
    description,
    duration_min: r5(min),
    distance_km: null,
    key_session: key,
  })

  const swimText: Record<Phase, [Kind, string, string]> = {
    base: ['technique', 'Schwimmen: Technik', '200 m einschwimmen, 8 × 50 m Technikübungen, 6 × 100 m locker.'],
    build: ['intervals', 'Schwimmen: Intervalle', '300 m einschwimmen, 8–10 × 100 m zügig mit 20 s Pause, 200 m aus.'],
    peak: ['race_pace', 'Schwimmen: Wettkampftempo', '300 m einschwimmen, 4 × 400 m im Wettkampftempo mit 30 s Pause.'],
    taper: ['easy', 'Schwimmen: locker', 'Locker schwimmen, zwischendurch 4 × 50 m zügig.'],
  }
  const bikeQ: Record<Phase, [Kind, string, string]> = {
    base: ['easy', 'Rad: Trittfrequenz', 'Locker (Zone 2) mit 5 × 3 min hoher Trittfrequenz (100+ U/min).'],
    build: ['tempo', 'Rad: Sweet Spot', '3 × 12 min knapp unter der Schwelle (Zone 3–4), 4 min locker dazwischen.'],
    peak: ['race_pace', 'Rad: Wettkampfintensität', '2 × 20 min im geplanten Wettkampftempo, 5 min locker dazwischen.'],
    taper: ['race_pace', 'Rad: kurz und knackig', 'Locker mit 3 × 5 min im Wettkampftempo.'],
  }

  const [sk, st, sd] = swimText[phase]
  m.set('S', d('swim', sk, st, sd, swim, phase !== 'taper' && phase !== 'base'))
  const [bk, bt, bd] = bikeQ[phase]
  m.set('BQ', d('bike', bk, bt, bd, bq, phase !== 'base'))
  const brick = phase === 'build' || phase === 'peak'
  m.set(
    'BL',
    d(
      'bike',
      brick ? 'brick' : 'long',
      brick ? 'Lange Ausfahrt + Koppellauf' : 'Lange Ausfahrt',
      brick ? 'Ruhig (Zone 2), direkt danach 15–20 min Laufen im Wettkampftempo.' : 'Ruhig und gleichmäßig (Zone 2). Verpflegung üben.',
      bl,
      true,
    ),
  )
  const rqd = runQuality('Q1', TRI[type].runLike, phase, pw, 8, null)
  m.set('RQ', { ...d('run', rqd.kind, `Laufen: ${rqd.title}`, rqd.description, run * rq, rqd.key_session), steps: rqd.kind === 'strides' ? undefined : rqd.steps })
  m.set('RL', d('run', 'long', 'Langer Lauf', 'Ruhig und gleichmäßig (Zone 2).', run * rl, true))
  m.set('RE', d('run', 'easy', 'Lockerer Lauf', 'Locker (Zone 2).', run * re, false))
  return m
}

// ---------- Rennwoche ----------

function raceWeek(event: RaceEvent, p: Paces | null): [number, Draft][] {
  const tri = isTri(event.type)
  const dpw = event.days_per_week
  const out: [number, Draft][] = []
  const easy = (min: number, sport: Sport = 'run'): Draft => ({
    sport,
    kind: 'easy',
    title: sport === 'swim' ? 'Schwimmen: locker' : sport === 'bike' ? 'Rad: locker' : 'Lockerer Lauf',
    description: 'Locker, nichts mehr erzwingen. Beine frisch halten.',
    duration_min: min,
    distance_km: null,
    key_session: false,
  })
  const sharpener: Draft = {
    sport: 'run',
    kind: 'race_pace',
    title: 'Vorbelastung',
    description: `15 min einlaufen, 3 × 1 km @ ${at('race', p)} mit 2 min Pause, auslaufen.`,
    duration_min: 40,
    distance_km: null,
    key_session: true,
    steps: [{ ...WU, time_s: 15 * 60 }, repeat(3, work({ m: 1000, pace: pz('race', p), note: 'Wettkampftempo' }), jog({ time_s: 120 })), CD],
  }
  if (tri) {
    out.push([-5, easy(30, 'swim')])
    out.push([-4, { ...easy(60, 'bike'), title: 'Rad: Vorbelastung', description: 'Locker mit 3 × 3 min im Wettkampftempo.', kind: 'race_pace', key_session: true }])
    out.push([-3, easy(30)])
    if (dpw >= 5) out.push([-1, { ...easy(20, 'bike'), title: 'Material-Check', description: '20 min Rad und 10 min Laufen ganz locker, alles fürs Rennen testen.' }])
  } else {
    if (dpw >= 4) out.push([-5, easy(35)])
    out.push([dpw >= 4 ? -3 : -4, sharpener])
    if (dpw <= 3) out.push([-2, easy(30)])
    if (dpw >= 5) out.push([-1, { ...easy(20), title: 'Lockerer Lauf mit Steigerungen', description: '20 min ganz locker, 4 kurze Steigerungen.' }])
  }
  const km = raceDistanceKm(event.type)
  out.push([
    0,
    {
      sport: 'race',
      kind: 'race',
      title: event.name,
      description: event.goal_time_s ? `Wettkampf. Ziel: ${fmtDuration(event.goal_time_s)}. Viel Erfolg!` : 'Wettkampf. Viel Erfolg!',
      duration_min: event.goal_time_s ? Math.round(event.goal_time_s / 60) : null,
      distance_km: km ? r1(km) : null,
      key_session: true,
    },
  ])
  return out
}

export function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')} h` : `${m}:${String(sec).padStart(2, '0')} min`
}

// ---------- Hauptfunktion ----------

/**
 * Erstellt alle Einheiten ab morgen bis zum Renntag.
 * `today` als YYYY-MM-DD, `newId` liefert eindeutige IDs.
 */
export function generatePlan(event: RaceEvent, fitness: Fitness, today: string, newId: () => string): PlanWorkout[] {
  const start = addDays(today, 1)
  if (event.date < start) return []
  const firstMonday = mondayOf(start)
  const raceMonday = mondayOf(event.date)
  const weeks = daysBetween(firstMonday, raceMonday) / 7 + 1
  const tri = isTri(event.type)
  const spec = tri ? TRI[event.type as TriEventType] : RUN[event.type as RunEventType]
  const phases = phasesFor(weeks, spec.taper)
  const paces = pacesFor(event.type, event.goal_time_s)
  const dpw = Math.min(7, Math.max(3, event.days_per_week))

  let volumes: number[]
  if (tri) {
    const s = spec as TriSpec
    const current = fitness.weeklyHours.swim + fitness.weeklyHours.bike + fitness.weeklyHours.run
    volumes = volumesFor(phases, Math.min(s.peakH * 0.75, Math.max(s.minH, current)), s.peakH)
  } else {
    const s = spec as RunSpec
    volumes = volumesFor(phases, Math.min(s.peakKm * 0.75, Math.max(s.minKm, fitness.weeklyRunKm)), s.peakKm)
  }

  const out: PlanWorkout[] = []
  // Die Rennwoche beginnt 6 Tage vor dem Rennen; normale Wochen enden davor.
  const raceWeekStart = addDays(event.date, -6)
  const push = (date: string, week: number, phase: Phase, d: Draft, isRaceWeek = false) => {
    if (date < start || date > event.date) return
    if (!isRaceWeek && date >= raceWeekStart) return
    out.push({ ...d, id: newId(), event_id: event.id, date, phase, week_index: week, status: 'planned', activity_id: null, moved_from: null })
  }

  let pw = 0
  for (let w = 0; w < weeks; w++) {
    const phase = phases[w]
    pw = w > 0 && phases[w - 1] === phase ? pw + 1 : 0
    const monday = addDays(firstMonday, w * 7)

    if (w === weeks - 1) {
      for (const [offset, d] of raceWeek(event, paces)) push(addDays(event.date, offset), w + 1, phase, d, true)
      continue
    }

    if (tri) {
      const layout = rotate(TRI_TEMPLATES[dpw], 5, event.long_day)
      const drafts = triWeek(event.type as TriEventType, phase, pw, volumes[w], layout.map(([, r]) => r))
      for (const [day, role] of layout) push(addDays(monday, day), w + 1, phase, drafts.get(role)!)
    } else {
      const layout = rotate(RUN_TEMPLATES[dpw], 6, event.long_day)
      const drafts = runWeek(event.type as RunEventType, phase, pw, volumes[w], layout.map(([, r]) => r), paces)
      for (const [day, role] of layout) push(addDays(monday, day), w + 1, phase, drafts.get(role)!)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
