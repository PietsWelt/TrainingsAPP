// Wochenrückblick: Was lief diese Woche, wie war die Erholung, worauf kommt es nächste Woche an.
// Regelbasiert und ohne KI; jede Empfehlung hat einen Grund und, wo es passt, eine Quelle.

import type { DrinksByDate, GymByDate, GymEntry } from './dailyLog'
import { activityLoad } from './fitness'
import { avg, sportGroup, weekStart } from './format'
import { heatPct, HOT_PCT } from './heat'
import { HILLY, zonesPlausible } from './plan/analyze'
import { addDays, weekday } from './plan/dates'
import type { Phase, PlanWorkout, RaceEvent } from './plan/types'
import type { Best } from './records'
import type { Status } from '../components/ui'
import type { Activity, DailyMetrics } from './types'

export interface Tip {
  status: Status
  title: string
  text: string
  source?: string
}

export interface WeekReview {
  monday: string
  sunday: string
  /** Woche ist vorbei (sonst Zwischenstand). */
  complete: boolean
  runs: number
  runKm: number
  hours: number
  sessions: number
  load: number
  /** Ø Wochenlast der 4 Wochen davor (null, wenn keine Daten). */
  loadBefore: number | null
  plan: { planned: number; done: number; replaced: number; skipped: number; open: number; key: number; keyDone: number; plannedKm: number } | null
  /** Anteil lockerer Laufzeit (Zone 1–3), nur mit verlässlichen Zonen. */
  easyShare: number | null
  sleepH: number | null
  sleepBefore: number | null
  hrv: number | null
  hrvBefore: number | null
  rhr: number | null
  rhrBefore: number | null
  drinks: number
  drinkDays: number
  gym: GymEntry[]
  hotRuns: number
  hillyRuns: number
  highlights: string[]
  next: { phase: Phase | null; sessions: number; km: number; key: { date: string; title: string }[]; race: RaceEvent | null; focus: string } | null
  tips: Tip[]
}

const inRange = (d: string, from: string, to: string) => d >= from && d <= to
const r1 = (x: number) => Math.round(x * 10) / 10
const de = (x: number, digits = 1) => x.toLocaleString('de-DE', { maximumFractionDigits: digits })

const FOCUS: Record<Phase, string> = {
  base: 'Grundlage: lockere Kilometer sammeln, Tempo zweitrangig.',
  build: 'Aufbau: Die harten Einheiten und der lange Lauf zählen am meisten, der Rest bleibt locker.',
  peak: 'Spitze: renntypische Einheiten, dazwischen bewusst erholen.',
  taper: 'Taper: weniger Umfang, Tempo halten, viel schlafen. Frische schlägt Extra-Training.',
}

export function weekReview(
  monday: string,
  today: string,
  activities: Activity[],
  days: DailyMetrics[],
  workouts: PlanWorkout[],
  events: RaceEvent[],
  drinks: DrinksByDate,
  gym: GymByDate,
  records: Best[] = [],
): WeekReview {
  const sunday = addDays(monday, 6)
  const before = addDays(monday, -28)
  const week = activities.filter((a) => inRange(a.local_date, monday, sunday))
  const prior = activities.filter((a) => inRange(a.local_date, before, addDays(monday, -1)))
  const runs = week.filter((a) => sportGroup(a.sport) === 'run')

  const load = week.reduce((s, a) => s + activityLoad(a), 0)
  const loadBefore = prior.length ? prior.reduce((s, a) => s + activityLoad(a), 0) / 4 : null

  // Plan der Woche (ohne Rennen).
  const ws = workouts.filter((w) => inRange(w.date, monday, sunday) && w.sport !== 'race')
  const byId = new Map(activities.map((a) => [a.id, a]))
  const plan = ws.length
    ? {
        planned: ws.length,
        done: ws.filter((w) => w.status === 'done').length,
        replaced: ws.filter((w) => w.status === 'done' && w.activity_id != null && sportGroup(byId.get(w.activity_id)?.sport ?? '') !== w.sport).length,
        skipped: ws.filter((w) => w.status === 'skipped').length,
        open: ws.filter((w) => w.status === 'planned').length,
        key: ws.filter((w) => w.key_session).length,
        keyDone: ws.filter((w) => w.key_session && w.status === 'done').length,
        plannedKm: r1(ws.filter((w) => w.sport === 'run').reduce((s, w) => s + (w.distance_km ?? 0), 0)),
      }
    : null

  let easy = 0
  let total = 0
  for (const a of runs) {
    if (!a.hr_zones_s || !zonesPlausible(a)) continue
    const z = a.hr_zones_s.map((x) => x ?? 0)
    easy += z[0] + z[1] + z[2]
    total += z.reduce((s, x) => s + x, 0)
  }

  const wDays = days.filter((d) => inRange(d.date, monday, sunday))
  const pDays = days.filter((d) => inRange(d.date, before, addDays(monday, -1)))
  const sleep = (xs: DailyMetrics[]) => {
    const v = avg(xs.map((d) => d.sleep_s))
    return v != null ? r1(v / 3600) : null
  }
  const mean = (xs: DailyMetrics[], k: 'hrv_last_night' | 'resting_hr') => {
    const v = avg(xs.map((d) => d[k]))
    return v != null ? Math.round(v) : null
  }

  const drinkDates = Object.entries(drinks).filter(([d, n]) => inRange(d, monday, sunday) && n > 0)
  const gymEntries = Object.entries(gym)
    .filter(([d]) => inRange(d, monday, sunday))
    .map(([, g]) => g)

  const highlights: string[] = []
  const longest = [...runs].sort((a, b) => (b.distance_m ?? 0) - (a.distance_m ?? 0))[0]
  if (longest?.distance_m) highlights.push(`Längster Lauf: ${de(longest.distance_m / 1000)} km`)
  const ride = week.filter((a) => sportGroup(a.sport) === 'bike').sort((a, b) => (b.distance_m ?? 0) - (a.distance_m ?? 0))[0]
  if (ride?.distance_m) highlights.push(`Längste Radfahrt: ${de(ride.distance_m / 1000, 0)} km`)
  for (const r of records) if (r.date && inRange(r.date, monday, sunday)) highlights.push(`Neue Bestzeit über ${r.label}`)

  // Nächste Woche.
  const nMon = addDays(monday, 7)
  const nSun = addDays(nMon, 6)
  const nws = workouts.filter((w) => inRange(w.date, nMon, nSun) && w.status === 'planned')
  const race = events.filter((e) => inRange(e.date, nMon, nSun)).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  const phase = nws[0]?.phase ?? null
  const next = nws.length || race
    ? {
        phase,
        sessions: nws.filter((w) => w.sport !== 'race').length,
        km: r1(nws.filter((w) => w.sport === 'run').reduce((s, w) => s + (w.distance_km ?? 0), 0)),
        key: nws.filter((w) => w.key_session && w.sport !== 'race').map((w) => ({ date: w.date, title: w.title })),
        race,
        focus: race ? `Rennwoche: ${race.name}. Nichts Neues ausprobieren, früh schlafen, locker bleiben.` : phase ? FOCUS[phase] : '',
      }
    : null

  const review: Omit<WeekReview, 'tips'> = {
    monday,
    sunday,
    complete: sunday < today,
    runs: runs.length,
    runKm: r1(runs.reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000),
    hours: r1(week.reduce((s, a) => s + (a.duration_s ?? 0), 0) / 3600),
    sessions: week.length,
    load: Math.round(load),
    loadBefore: loadBefore != null ? Math.round(loadBefore) : null,
    plan,
    easyShare: total > 0 && runs.length >= 2 ? easy / total : null,
    sleepH: sleep(wDays),
    sleepBefore: sleep(pDays),
    hrv: mean(wDays, 'hrv_last_night'),
    hrvBefore: mean(pDays, 'hrv_last_night'),
    rhr: mean(wDays, 'resting_hr'),
    rhrBefore: mean(pDays, 'resting_hr'),
    drinks: drinkDates.reduce((s, [, n]) => s + n, 0),
    drinkDays: drinkDates.length,
    gym: gymEntries,
    hotRuns: runs.filter((a) => heatPct(a.temp_c, a.dew_point_c) >= HOT_PCT).length,
    hillyRuns: runs.filter((a) => (a.gap_factor ?? 1) >= HILLY).length,
    highlights,
    next,
  }
  return { ...review, tips: tipsFor(review) }
}

export function tipsFor(r: Omit<WeekReview, 'tips'>): Tip[] {
  const tips: Tip[] = []
  if (r.loadBefore && r.load >= r.loadBefore * 1.3 && r.load - r.loadBefore >= 50) {
    tips.push({
      status: 'warning',
      title: 'Belastung deutlich gestiegen',
      text: `${Math.round((r.load / r.loadBefore - 1) * 100)} % mehr Trainingslast als im Schnitt der 4 Wochen davor. Große Sprünge gelten als Verletzungsrisiko, also nächste Woche nicht noch einmal steigern.`,
      source: 'Gabbett 2016 (Br J Sports Med); Impellizzeri et al. 2020 zu den Grenzen dieser Kennzahl',
    })
  }
  if (r.sleepH != null && r.sleepH < 7) {
    tips.push({
      status: 'warning',
      title: 'Mehr Schlaf',
      text: `Im Schnitt ${de(r.sleepH)} h pro Nacht. Unter 7 h leidet die Erholung; mehr Schlaf ist die einfachste Leistungsreserve.`,
      source: 'Watson et al. 2015 (Empfehlung AASM/SRS), Walsh et al. 2021 (Br J Sports Med, Konsens Schlaf und Sport)',
    })
  }
  if (r.easyShare != null && r.easyShare < 0.75) {
    tips.push({
      status: 'warning',
      title: 'Mehr locker laufen',
      text: `Nur ${Math.round(r.easyShare * 100)} % deiner Laufzeit war locker (Zone 1–3). Etwa 80 % locker hat sich bei Ausdauersportlern bewährt.${r.hotRuns ? ' Ein Teil kann an der Wärme liegen.' : ''}`,
      source: 'Seiler 2010 (Int J Sports Physiol Perform), Stöggl & Sperlich 2014 (Front Physiol)',
    })
  }
  if (r.drinks >= 7 || (r.drinkDays >= 2 && r.hrv != null && r.hrvBefore != null && r.hrv < r.hrvBefore * 0.95)) {
    tips.push({
      status: 'warning',
      title: 'Alkohol im Blick',
      text: `${r.drinks} Getränke an ${r.drinkDays} ${r.drinkDays === 1 ? 'Tag' : 'Tagen'}. Alkohol senkt die nächtliche HRV abhängig von der Menge und verschlechtert den Schlaf.`,
      source: 'Pietilä et al. 2018 (JMIR Mental Health)',
    })
  }
  if (r.hrv != null && r.hrvBefore != null && r.rhr != null && r.rhrBefore != null && r.hrv < r.hrvBefore * 0.93 && r.rhr >= r.rhrBefore + 2) {
    tips.push({
      status: 'serious',
      title: 'Erholung braucht Zeit',
      text: `HRV ${r.hrv} statt ${r.hrvBefore} ms und Ruhepuls ${r.rhr} statt ${r.rhrBefore}: Zusammen deutet das darauf hin, dass dein Körper mehr Erholung braucht. Lockere Tage ernst nehmen.`,
      source: 'Plews et al. 2013 (Sports Med)',
    })
  }
  if (r.plan && r.plan.skipped >= 2) {
    tips.push({
      status: 'warning',
      title: 'Plan zu voll?',
      text: `${r.plan.skipped} Einheiten ausgelassen. Passiert das öfter, stell im Rennen weniger Trainingstage pro Woche ein. Ein Plan, den du schaffst, bringt mehr als ein voller.`,
    })
  }
  if (!tips.length) {
    tips.push({ status: 'good', title: 'Gute Woche', text: 'Belastung im Rahmen, Erholung stabil. Weiter so.' })
  }
  return tips.slice(0, 3)
}

/** Welche Woche auf „Heute“ zurückgeblickt wird: Sonntag ab Mittag die laufende, Montag die vergangene. */
export function reviewMonday(today: string, hour: number): string | null {
  const wd = weekday(today)
  if (wd === 6 && hour >= 12) return weekStart(today)
  if (wd === 0) return addDays(weekStart(today), -7)
  return null
}

