// Kraft- und Stabi-Vorschläge für Läufer: einmal pro Woche Beine im Gym, zweimal kurze Stabi-Einheiten.
// Keine festen Plan-Einheiten, sondern Vorschläge, die sich um die harten Laufeinheiten herum legen.
// Kreuzheben ist bewusst nicht dabei; die hintere Kette trainieren Hip Thrust und Nordic Curls.

import type { GymByDate } from './dailyLog'
import { addDays } from './plan/dates'
import type { Kind, Phase, PlanWorkout } from './plan/types'

export type StabiLevel = 'easy' | 'medium' | 'hard'
export const STABI_LEVELS: { value: StabiLevel; label: string }[] = [
  { value: 'easy', label: 'Leicht' },
  { value: 'medium', label: 'Mittel' },
  { value: 'hard', label: 'Schwer' },
]

/** Einheiten, vor denen die Beine frisch sein sollen. */
const KEY_KINDS: Kind[] = ['intervals', 'tempo', 'race_pace', 'fartlek', 'long', 'race', 'brick']
/** In den letzten 10 Tagen vor dem Rennen kein schweres Beintraining mehr. */
const NO_LEGS_BEFORE_RACE = 10
const STABI_PER_WEEK = 2

export interface WeekStrength {
  /** Tag für Beine im Gym, null wenn diese Woche keiner passt (Rennwoche). */
  legs: string | null
  legsDone: string | null
  /** Beine am selben Tag wie eine harte Einheit, danach mit Abstand. */
  legsAfterKey: boolean
  stabi: string[]
  stabiDone: string[]
  phase: Phase | null
  raceWeek: boolean
}

const isKey = (w: PlanWorkout) => KEY_KINDS.includes(w.kind) || w.key_session

/**
 * Vorschläge für die Woche ab `monday`. Erledigtes zählt aus dem Gym-Eintrag (Beine oder
 * Ganzkörper bzw. Core). Offenes wird nur auf Tage ab `today` gelegt, damit Verpasstes nachrückt.
 */
export function weekStrength(monday: string, workouts: PlanWorkout[], gym: GymByDate, today: string): WeekStrength {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const active = workouts.filter((w) => w.status !== 'skipped')
  const on = (d: string) => active.filter((w) => w.date === d)
  const keyOn = (d: string) => on(d).some(isKey)
  const races = active.filter((w) => w.kind === 'race' || w.sport === 'race').map((w) => w.date)
  const daysToRace = (d: string) => {
    const next = races.filter((r) => r >= d).sort()[0]
    return next ? Math.round((Date.parse(next) - Date.parse(d)) / 86400_000) : Infinity
  }
  const inWeek = active.filter((w) => w.date >= monday && w.date <= days[6])
  const phase = inWeek[0]?.phase ?? null
  const raceWeek = days.some((d) => races.includes(d))
  const hasPlan = inWeek.length > 0

  const legsDone = days.find((d) => gym[d] && (gym[d].focus === 'legs' || gym[d].focus === 'full')) ?? null
  const stabiDone = days.filter((d) => gym[d]?.focus === 'core')
  const open = days.filter((d) => d >= today)

  // Beine: nicht am Tag vor einer harten Einheit, nicht in den letzten 10 Tagen vor dem Rennen.
  let legs: string | null = legsDone
  let legsAfterKey = false
  if (!legs) {
    const ok = open.filter((d) => daysToRace(d) >= NO_LEGS_BEFORE_RACE && !races.includes(d))
    const score = (d: string) => {
      if (!hasPlan) return d === days[2] ? 3 : d === days[3] ? 2 : 1 // ohne Plan: Mitte der Woche
      let s = on(d).length === 0 ? 2 : 1
      if (!keyOn(addDays(d, 2))) s += 1
      if (on(addDays(d, -1)).some((w) => w.kind === 'long')) s -= 1
      return s
    }
    const free = ok.filter((d) => !keyOn(d) && !keyOn(addDays(d, 1)))
    if (free.length) legs = [...free].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0]
    else {
      // Kein freier Tag: nach einer harten Einheit am selben Tag („harte Tage hart“), nicht vor dem langen Lauf.
      const after = ok.filter((d) => keyOn(d) && !keyOn(addDays(d, 1)) && !on(d).some((w) => w.kind === 'long'))
      legs = after[0] ?? null
      legsAfterKey = legs != null
    }
  }

  // Stabi: zweimal, nicht am Beintag, nicht am Renntag oder Tag davor, möglichst 2 Tage Abstand.
  const need = Math.max(0, (raceWeek ? 1 : STABI_PER_WEEK) - stabiDone.length)
  const stabi = [...stabiDone]
  const candidates = open
    .filter((d) => d !== legs && !stabiDone.includes(d) && daysToRace(d) >= (raceWeek ? 3 : 2))
    .sort((a, b) => (keyOn(a) ? 1 : 0) - (keyOn(b) ? 1 : 0) || a.localeCompare(b))
  for (const d of candidates) {
    if (stabi.length - stabiDone.length >= need) break
    if (stabi.some((s) => Math.abs(Date.parse(s) - Date.parse(d)) < 2 * 86400_000)) continue
    stabi.push(d)
  }
  for (const d of candidates) {
    if (stabi.length - stabiDone.length >= need) break
    if (!stabi.includes(d)) stabi.push(d)
  }
  stabi.sort()

  return { legs: raceWeek && !legsDone ? null : legs, legsDone, legsAfterKey, stabi, stabiDone, phase, raceWeek }
}

// ---------- Übungen ----------

export interface StrengthExercise {
  id: string
  name: string
  target: string
  how: string[]
  why: string
  /** Leichtere Variante für den Einstieg oder ohne Gerät. */
  easier?: string
  harder?: string
  sides?: boolean
  hold?: boolean
}

const LEG_EX: StrengthExercise[] = [
  {
    id: 'split',
    name: 'Bulgarische Kniebeuge',
    target: 'Oberschenkel, Gesäß, einbeinige Stabilität',
    how: ['Hinterer Fuß mit dem Spann auf einer Bank, vorderer Fuß gut einen Schritt davor.', 'Kurzhanteln seitlich halten, Oberkörper leicht nach vorn.', 'Kontrolliert absenken, bis der vordere Oberschenkel etwa waagerecht ist, Knie zeigt über die Fußmitte.', 'Über die ganze Fußsohle hochdrücken.'],
    why: 'Laufen ist eine Folge einbeiniger Sprünge. Einbeinige Kraft trainiert genau das und deckt Seitenunterschiede auf.',
    easier: 'Ohne Gewicht oder mit beiden Füßen am Boden (Ausfallschritt am Platz).',
    sides: true,
  },
  {
    id: 'press',
    name: 'Beinpresse',
    target: 'Oberschenkel, Gesäß',
    how: ['Füße schulterbreit mittig auf die Platte, Rücken und Becken fest am Polster.', 'Langsam beugen, bis die Knie etwa 90 Grad haben. Das Becken darf sich nicht vom Polster lösen.', 'Kräftig wegdrücken, Knie am Ende nicht ganz durchstrecken.'],
    why: 'Schwere Kraft für die Beine, ohne die Wirbelsäule zu belasten. Deshalb hier statt Kniebeuge mit Langhantel oder Kreuzheben.',
    easier: 'Goblet-Kniebeuge mit einer Kurzhantel vor der Brust.',
  },
  {
    id: 'thrust',
    name: 'Hip Thrust',
    target: 'Gesäß, Beinrückseite',
    how: ['Oberer Rücken an einer Bank, Langhantel mit Polster über der Hüfte (oder Maschine).', 'Füße hüftbreit, Schienbeine am oberen Punkt senkrecht.', 'Hüfte hochdrücken, bis Oberkörper und Oberschenkel eine Linie bilden. Kinn zur Brust, kein Hohlkreuz.', 'Oben 1 s halten, kontrolliert absenken.'],
    why: 'Der Gesäßmuskel treibt dich nach vorn und hält das Becken stabil. Hip Thrust trainiert ihn kräftig, ohne den Rücken zu belasten wie Kreuzheben.',
    easier: 'Hüftbrücke am Boden, mit oder ohne Gewicht.',
  },
  {
    id: 'nordic',
    name: 'Nordic Hamstring Curl',
    target: 'Beinrückseite (exzentrisch)',
    how: ['Kniend auf einer Matte, Fersen unter einer Stange oder von einem Partner fixiert.', 'Körper gerade von Knie bis Kopf, Hände vor der Brust.', 'So langsam wie möglich nach vorn absenken, so lange du es halten kannst.', 'Mit den Händen abfangen und mit Armschwung zurück nach oben.'],
    why: 'Die bestbelegte Übung gegen Verletzungen der Beinrückseite: Die Muskeln werden beim Abbremsen kräftiger, genau wie in der Schwungphase beim Laufen.',
    easier: 'Liegender Beinbeuger an der Maschine, 3 s langsam ablassen.',
  },
  {
    id: 'calfStand',
    name: 'Wadenheben stehend',
    target: 'Wade (Gastrocnemius), Achillessehne',
    how: ['An der Maschine oder mit Kurzhanteln auf einer Stufe, Fersen frei.', 'Gerade Knie, hoch auf die Zehenballen.', '3 s langsam ablassen, bis die Ferse unter der Stufe ist.'],
    why: 'Die Wade fängt bei jedem Schritt ein Vielfaches des Körpergewichts ab. Kräftige Waden und Sehnen schützen vor Achillessehnen- und Wadenproblemen.',
    easier: 'Beidbeinig ohne Gewicht.',
  },
  {
    id: 'calfSeat',
    name: 'Wadenheben sitzend',
    target: 'Schollenmuskel (Soleus)',
    how: ['An der Wadenmaschine sitzend, Polster auf den Oberschenkeln, Knie gebeugt.', 'Auf die Zehenballen hochdrücken, 1 s halten.', '3 s langsam ablassen.'],
    why: 'Der Schollenmuskel leistet beim Laufen die meiste Kraft aller Beinmuskeln und wird nur mit gebeugtem Knie gezielt trainiert.',
    easier: 'Sitzend mit Kurzhanteln auf den Knien.',
  },
  {
    id: 'pogo',
    name: 'Pogo-Sprünge',
    target: 'Waden, Sehnen, Reaktivkraft',
    how: ['Aufrecht, Füße hüftbreit.', 'Kleine, schnelle Sprünge nur aus den Fußgelenken, Knie fast gestreckt.', 'Bodenkontakt so kurz wie möglich, leise landen.'],
    why: 'Sprungkraft macht die Sehnen steifer und federnder. Das verbessert die Laufökonomie.',
  },
]

const STABI_EX: StrengthExercise[] = [
  {
    id: 'curlup',
    name: 'Curl-up',
    target: 'Gerade Bauchmuskeln',
    how: ['Rückenlage, ein Bein gebeugt, ein Bein gestreckt. Hände unter den unteren Rücken.', 'Kopf und Schultern nur wenige Zentimeter anheben, der Nacken bleibt lang.', 'Kurz halten, ablegen. Nach der Hälfte die Beine wechseln.'],
    why: 'Teil der „Big 3“ nach McGill: kräftigt den Rumpf, ohne die Wirbelsäule zu beugen. Ideal, wenn der Rücken empfindlich ist.',
  },
  {
    id: 'side',
    name: 'Seitstütz',
    target: 'Seitliche Rumpfmuskeln, Hüfte',
    how: ['Seitlich auf den Unterarm, Ellbogen unter der Schulter.', 'Hüfte anheben, bis der Körper eine gerade Linie bildet.', 'Ruhig weiteratmen, Becken nicht absinken lassen.'],
    why: 'Hält beim Laufen das Becken waagerecht. Big-3-Übung, schont den Rücken.',
    easier: 'Knie am Boden, Unterschenkel nach hinten gebeugt.',
    harder: 'Oberes Bein angehoben.',
    sides: true,
    hold: true,
  },
  {
    id: 'birddog',
    name: 'Bird Dog',
    target: 'Rücken, Gesäß, Koordination',
    how: ['Vierfüßlerstand, Rücken gerade.', 'Gegenüberliegenden Arm und Bein langsam strecken, bis sie mit dem Rücken eine Linie bilden.', '5 s halten, dabei nicht kippen. Zurück und Seite wechseln.'],
    why: 'Die dritte Big-3-Übung: trainiert die Rückenstrecker und das Zusammenspiel von Rumpf und Hüfte bei ruhiger Wirbelsäule.',
    sides: true,
  },
  {
    id: 'bridge',
    name: 'Einbeinige Hüftbrücke',
    target: 'Gesäß, Beinrückseite',
    how: ['Rückenlage, ein Fuß aufgestellt, das andere Bein gestreckt in der Luft.', 'Hüfte hochdrücken, bis Schulter, Hüfte und Knie eine Linie bilden.', 'Becken bleibt waagerecht. Langsam ablassen.'],
    why: 'Einbeinige Gesäßkraft, wie sie beim Abdruck gebraucht wird.',
    easier: 'Beidbeinig.',
    sides: true,
  },
  {
    id: 'abduct',
    name: 'Seitliches Beinheben',
    target: 'Hüftabduktoren (mittlerer Gesäßmuskel)',
    how: ['Seitenlage, unteres Bein leicht gebeugt.', 'Oberes Bein gestreckt und leicht nach hinten, Zehen zeigen nach vorn.', 'Bis etwa 30 Grad anheben, 1 s halten, langsam senken.'],
    why: 'Schwache Hüftabduktoren lassen das Knie beim Landen nach innen fallen. Kräftigung hilft nachweislich bei Läuferknie-Beschwerden.',
    harder: 'Mit Miniband um die Knöchel.',
    sides: true,
  },
  {
    id: 'copenhagen',
    name: 'Copenhagen-Stütz (kurz)',
    target: 'Adduktoren (Innenseite Oberschenkel)',
    how: ['Seitstütz, das obere Knie liegt auf einer Bank oder einem Stuhl.', 'Hüfte anheben, unteres Bein hängt frei oder tippt leicht am Boden.', 'Halten, Körper bleibt in einer Linie.'],
    why: 'Kräftigt die oft vergessene Innenseite und senkt in Studien Leistenbeschwerden deutlich.',
    harder: 'Langer Hebel: Fuß statt Knie auf der Bank.',
    sides: true,
    hold: true,
  },
  {
    id: 'balance',
    name: 'Einbeinstand',
    target: 'Fußgelenk, Gleichgewicht',
    how: ['Auf einem Bein stehen, Knie minimal gebeugt.', 'Nach 10 s die Augen schließen oder auf ein Kissen stellen.', 'Fuß bleibt ruhig, kleine Ausgleichsbewegungen sind gewollt.'],
    why: 'Gleichgewichtstraining senkt das Risiko für Umknicken (Bänderverletzung am Sprunggelenk).',
    sides: true,
    hold: true,
  },
  {
    id: 'eccCalf',
    name: 'Einbeiniges Wadenheben an der Stufe',
    target: 'Wade, Achillessehne',
    how: ['Mit dem Vorfuß auf einer Stufe, leicht festhalten.', 'Beidbeinig hoch auf die Zehenballen.', 'Auf einem Bein 3 s langsam ablassen, bis die Ferse unter der Stufe ist.'],
    why: 'Langsames Absenken kräftigt die Achillessehne, eine der häufigsten Problemzonen bei Läufern.',
    sides: true,
  },
]

export interface Prescribed {
  ex: StrengthExercise
  dose: string
}

export interface LegSession {
  title: string
  focus: string
  minutes: number
  /** Belastung für die Readiness: schwer außer im Taper. */
  hard: boolean
  steps: Prescribed[]
}

/** Dosierung nach Plan-Phase: Grundkraft, dann Maximalkraft mit Sprüngen, im Taper nur erhalten. */
export function legSession(phase: Phase | null): LegSession {
  const main = (sets: number, reps: string) => `${sets} × ${reps}`
  const nordic = { ex: LEG_EX[3], dose: phase === 'taper' ? '2 × 3' : '3 × 4–6' }
  const calves = (sets: number, reps: string) => [
    { ex: LEG_EX[4], dose: main(sets, reps) },
    { ex: LEG_EX[5], dose: main(sets, reps) },
  ]
  if (phase === 'build' || phase === 'peak') {
    const sets = phase === 'peak' ? 3 : 4
    return {
      title: 'Beine: Maximalkraft',
      focus: 'Schwer und wenige Wiederholungen: Gewicht so wählen, dass noch 2 saubere gehen würden. 2–3 min Pause.',
      minutes: 50,
      hard: true,
      steps: [
        { ex: LEG_EX[6], dose: phase === 'peak' ? '2 × 15' : '3 × 15' },
        { ex: LEG_EX[0], dose: `${main(sets, '5–6')} je Bein` },
        { ex: LEG_EX[1], dose: main(sets, '5–6') },
        { ex: LEG_EX[2], dose: main(sets, '6') },
        nordic,
        ...calves(3, '6–8, 3 s ablassen'),
      ],
    }
  }
  if (phase === 'taper') {
    return {
      title: 'Beine: Kraft erhalten',
      focus: 'Halbe Menge, mittleres Gewicht, nichts bis zur Erschöpfung. Kraft bleibt so erhalten, die Beine erholen sich trotzdem.',
      minutes: 30,
      hard: false,
      steps: [
        { ex: LEG_EX[0], dose: '2 × 5 je Bein' },
        { ex: LEG_EX[2], dose: '2 × 6' },
        nordic,
        ...calves(2, '8'),
      ],
    }
  }
  return {
    title: 'Beine: Grundkraft',
    focus: 'Technik und Grundkraft: Gewicht so wählen, dass noch 3 saubere Wiederholungen gehen würden. 90 s Pause.',
    minutes: 45,
    hard: true,
    steps: [
      { ex: LEG_EX[0], dose: '3 × 8–10 je Bein' },
      { ex: LEG_EX[1], dose: main(3, '10') },
      { ex: LEG_EX[2], dose: main(3, '10') },
      nordic,
      ...calves(3, '12, 3 s ablassen'),
    ],
  }
}

export const LEG_WARMUP = '5–8 min locker Rad oder Rudergerät, 10 Beinschwünge je Seite, dann 1–2 leichte Sätze der ersten Übung.'

export interface StabiSession {
  title: string
  minutes: number
  rounds: number
  steps: Prescribed[]
}

const STABI_DOSE: Record<StabiLevel, { count: number; rounds: number; hold: number; reps: number }> = {
  easy: { count: 5, rounds: 2, hold: 20, reps: 8 },
  medium: { count: 7, rounds: 2, hold: 30, reps: 10 },
  hard: { count: 8, rounds: 3, hold: 40, reps: 12 },
}

export function stabiSession(level: StabiLevel): StabiSession {
  const d = STABI_DOSE[level]
  const steps = STABI_EX.slice(0, d.count).map((ex) => {
    const per = ex.sides ? ' je Seite' : ''
    const dose = ex.hold ? `${d.hold} s${per}` : ex.id === 'curlup' ? `${Math.round(d.reps / 2)} × 8 s halten` : `${d.reps} Wdh.${per}`
    return { ex, dose }
  })
  const perRound = steps.reduce((s, x) => s + (x.ex.hold ? d.hold : d.reps * 4) * (x.ex.sides ? 2 : 1) + 15, 0)
  return { title: 'Stabi für Läufer', minutes: Math.round((perRound * d.rounds) / 60), rounds: d.rounds, steps }
}

/** Was Studien zu Krafttraining für Läufer zeigen. */
export const STRENGTH_EVIDENCE: { title: string; text: string; source: string }[] = [
  {
    title: 'Weniger Verletzungen',
    text: 'In einer großen Auswertung von Studien senkte Krafttraining Sportverletzungen auf weniger als ein Drittel, Dehnen dagegen kaum. Nordic Curls allein halbierten Verletzungen der Beinrückseite, Copenhagen-Übungen Leistenbeschwerden deutlich.',
    source: 'Lauersen et al. 2014; van Dyk et al. 2019; Harøy et al. 2019 (alle Br J Sports Med)',
  },
  {
    title: 'Schneller bei gleicher Anstrengung',
    text: 'Schweres Krafttraining und Sprünge verbessern die Laufökonomie, also wie viel Energie ein Tempo kostet, meist um 2 bis 8 %. Schwere Gewichte wirken dabei stärker als viele leichte Wiederholungen.',
    source: 'Blagrove et al. 2018, Sports Med; Llanos-Lagos et al. 2024, Sports Med; Beattie et al. 2017, J Strength Cond Res',
  },
  {
    title: 'Einmal pro Woche reicht zum Erhalten',
    text: 'Zum Aufbau sind zwei Einheiten pro Woche besser, eine Einheit hält aufgebaute Kraft aber über Monate. Mit der Laufbelastung zusammen ist eine Bein-Einheit pro Woche ein guter Kompromiss.',
    source: 'Rønnestad et al. 2011, Scand J Med Sci Sports',
  },
  {
    title: 'Wann in der Woche',
    text: 'Schweres Beintraining kann den Lauf an den 1 bis 2 Tagen danach etwas schwächen. Deshalb liegt der Vorschlag nicht vor Intervallen, Tempo oder dem langen Lauf. Passt kein Tag, kommt er nach einer harten Einheit am selben Tag, mit einigen Stunden Abstand.',
    source: 'Doma & Deakin 2013, Appl Physiol Nutr Metab',
  },
  {
    title: 'Hüfte und Rumpf',
    text: 'Kräftige Hüftmuskeln helfen nachweislich bei Läuferknie-Beschwerden, Gleichgewichtstraining senkt das Risiko für Umknicken. Ob reines Bauchtraining schneller macht, ist dagegen kaum belegt. Darum liegt der Schwerpunkt der Stabi-Einheit auf Hüfte, Gesäß und Füßen, mit rückenschonenden Rumpfübungen.',
    source: 'Lack et al. 2015, Br J Sports Med; Hübscher et al. 2010, Med Sci Sports Exerc; McGill 2010, Strength Cond J',
  },
]

export const NO_DEADLIFT =
  'Kreuzheben ist bewusst nicht dabei. Gesäß und Beinrückseite trainieren Hip Thrust und Nordic Curls ohne Last auf der Wirbelsäule, die Rumpfübungen sind rückenschonend nach McGill. Hast du dabei Schmerzen im Rücken, lass das ärztlich oder physiotherapeutisch abklären.'
