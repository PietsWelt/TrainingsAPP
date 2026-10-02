// Dehnen und Faszienrolle nach dem Training: passende Routine je Einheit, in drei Stufen.
// Die Begründungen sind bewusst ehrlich: Dehnen verbessert vor allem die Beweglichkeit,
// die Rolle lindert etwas den Muskelkater. Verletzungen verhindert beides kaum.

import { sportGroup } from './format'
import type { Activity } from './types'

export type Level = 'easy' | 'medium' | 'hard'
export type RoutineKind = 'run_easy' | 'run_hard' | 'run_long' | 'bike' | 'swim' | 'strength'

export const LEVELS: { value: Level; label: string }[] = [
  { value: 'easy', label: 'Leicht' },
  { value: 'medium', label: 'Mittel' },
  { value: 'hard', label: 'Schwer' },
]

export interface Exercise {
  id: string
  name: string
  type: 'stretch' | 'roll' | 'mobility'
  /** Welche Muskeln. */
  target: string
  /** So geht's, Schritt für Schritt. */
  how: string[]
  /** Warum gerade diese Übung nach dieser Einheit. */
  why: string
  /** Schwerere Variante für „Schwer“. */
  harder?: { name: string; how: string }
  /** Seitenweise ausführen. */
  sides?: boolean
}

const EX: Record<string, Exercise> = {
  rollCalf: {
    id: 'rollCalf',
    name: 'Waden rollen',
    type: 'roll',
    target: 'Waden',
    how: ['Im Sitz, Rolle unter eine Wade, Hände hinter dem Po aufstützen.', 'Po anheben und langsam von der Achillessehne bis unter die Kniekehle rollen.', 'Fuß dabei nach innen und außen drehen, um die ganze Wade zu erwischen.'],
    why: 'Die Waden arbeiten bei jedem Schritt. Rollen danach senkt das Gefühl von Steifheit und Muskelkater etwas.',
    harder: { name: 'Waden rollen, Beine gekreuzt', how: 'Das andere Bein auf das gerollte legen, das erhöht den Druck.' },
    sides: true,
  },
  rollQuad: {
    id: 'rollQuad',
    name: 'Oberschenkel vorne rollen',
    type: 'roll',
    target: 'Quadrizeps',
    how: ['Bauchlage im Unterarmstütz, Rolle unter beide Oberschenkel.', 'Langsam von knapp über dem Knie bis zur Hüfte rollen.', 'Rumpf fest, nicht ins Hohlkreuz fallen.'],
    why: 'Der Quadrizeps bremst bergab und bei schnellen Schritten. Das macht den meisten Muskelkater nach harten und langen Läufen.',
    harder: { name: 'Oberschenkel einbeinig rollen', how: 'Nur ein Bein auf der Rolle, das andere seitlich abstellen.' },
  },
  rollGlute: {
    id: 'rollGlute',
    name: 'Gesäß rollen',
    type: 'roll',
    target: 'Gesäßmuskeln',
    how: ['Auf die Rolle setzen, ein Fußgelenk auf das andere Knie legen.', 'Zur Seite des gekreuzten Beins kippen und langsam vor und zurück rollen.'],
    why: 'Die Gesäßmuskeln stabilisieren das Becken bei jedem Schritt und auf dem Rad.',
    sides: true,
  },
  rollItb: {
    id: 'rollItb',
    name: 'Oberschenkel außen rollen',
    type: 'roll',
    target: 'Seitlicher Oberschenkel',
    how: ['Seitlage, Rolle unter die Außenseite des Oberschenkels.', 'Oberes Bein vorne abstellen, damit du den Druck dosieren kannst.', 'Nur zwischen Hüfte und knapp über dem Knie rollen.'],
    why: 'Fühlt sich nach langen Läufen oft fest an. Die Sehnenplatte selbst dehnt sich dabei nicht, aber der Muskel darüber entspannt sich.',
    sides: true,
  },
  rollBack: {
    id: 'rollBack',
    name: 'Oberer Rücken rollen',
    type: 'roll',
    target: 'Brustwirbelsäule',
    how: ['Rückenlage, Rolle quer unter die Schulterblätter, Hände hinter dem Kopf.', 'Po anheben und langsam bis Höhe Brustbein-Ende rollen.', 'Nicht auf den unteren Rücken rollen.'],
    why: 'Auf dem Rad und beim Schwimmen ist der obere Rücken lange in einer Haltung. Rollen macht ihn wieder beweglicher.',
  },
  calf: {
    id: 'calf',
    name: 'Wadendehnung an der Wand',
    type: 'stretch',
    target: 'Wade',
    how: ['Hände an die Wand, ein Bein lang nach hinten, Ferse am Boden.', 'Hüfte nach vorne schieben, bis es in der Wade zieht.', 'Danach das hintere Knie leicht beugen, das dehnt den tieferen Wadenmuskel.'],
    why: 'Bewegliche Waden und Sprunggelenke helfen beim Abdruck. Gerade nach vielen Kilometern fühlen sie sich oft kurz an.',
    sides: true,
  },
  hipFlexor: {
    id: 'hipFlexor',
    name: 'Hüftbeuger-Dehnung im Kniestand',
    type: 'stretch',
    target: 'Hüftbeuger',
    how: ['Ausfallschritt, hinteres Knie auf einer weichen Unterlage.', 'Po anspannen und Becken leicht nach vorne schieben, Oberkörper aufrecht.', 'Arm der Knie-Seite nach oben strecken, das verstärkt die Dehnung.'],
    why: 'Hüftbeuger werden durch Sitzen und auf dem Rad kurz. Mehr Hüftstreckung gibt dir einen längeren, freieren Schritt.',
    harder: { name: 'Couch-Stretch', how: 'Hinteren Fuß an Wand oder Sofa hochlegen, Knie in der Ecke. Deutlich intensiver, langsam rantasten.' },
    sides: true,
  },
  hamstring: {
    id: 'hamstring',
    name: 'Oberschenkel hinten dehnen',
    type: 'stretch',
    target: 'Hintere Oberschenkel',
    how: ['Ein Bein gestreckt auf eine niedrige Stufe legen, Fußspitze hoch.', 'Mit geradem Rücken aus der Hüfte nach vorne neigen, bis es hinten zieht.'],
    why: 'Die hinteren Oberschenkel arbeiten beim Laufen ständig. Gerade Rücken statt Rundrücken dehnt den Muskel statt die Wirbelsäule.',
    sides: true,
  },
  quad: {
    id: 'quad',
    name: 'Oberschenkel vorne dehnen',
    type: 'stretch',
    target: 'Quadrizeps',
    how: ['Im Stand, an der Wand festhalten.', 'Fuß zum Po ziehen, Knie zeigen nach unten und bleiben nebeneinander.', 'Po leicht anspannen.'],
    why: 'Sanft dehnen löst das Spannungsgefühl nach Tempo und langen Läufen.',
    sides: true,
  },
  figure4: {
    id: 'figure4',
    name: 'Gesäß dehnen (Figur 4)',
    type: 'stretch',
    target: 'Gesäß und Hüfte',
    how: ['Rückenlage, Fußgelenk auf das andere Knie legen.', 'Das untere Bein zur Brust ziehen, bis es im Gesäß zieht.'],
    why: 'Eine bewegliche Hüfte entlastet Knie und unteren Rücken.',
    harder: { name: 'Taubenhaltung', how: 'Aus dem Vierfüßlerstand ein Knie nach vorne zwischen die Hände, das andere Bein lang nach hinten.' },
    sides: true,
  },
  adductor: {
    id: 'adductor',
    name: 'Innenseite dehnen',
    type: 'stretch',
    target: 'Adduktoren',
    how: ['Breiter Stand, Fußspitzen leicht nach außen.', 'Gewicht zur einen Seite verlagern und das Knie beugen, das andere Bein bleibt gestreckt.'],
    why: 'Die Oberschenkel-Innenseite stabilisiert das Bein und wird oft vergessen.',
    sides: true,
  },
  worldsGreatest: {
    id: 'worldsGreatest',
    name: 'Ausfallschritt mit Drehung',
    type: 'mobility',
    target: 'Hüfte und Brustwirbelsäule',
    how: ['Tiefer Ausfallschritt, beide Hände innen neben dem vorderen Fuß.', 'Den Arm auf der Seite des vorderen Beins zur Decke drehen, Blick folgt der Hand.', 'Langsam 5 Mal je Seite, nicht halten.'],
    why: 'Bewegt Hüfte, Oberschenkel und oberen Rücken in einer Übung. Gut, wenn wenig Zeit ist.',
    sides: true,
  },
  childPose: {
    id: 'childPose',
    name: 'Kindhaltung mit Seitzug',
    type: 'stretch',
    target: 'Rücken und Lat',
    how: ['Auf die Fersen setzen, Arme lang nach vorne auf den Boden.', 'Beide Hände etwas zur Seite wandern lassen, bis es in der Flanke zieht.', 'Ruhig in den Bauch atmen.'],
    why: 'Löst Rücken und Flanken. Ruhiges Atmen hilft beim Runterkommen nach dem Training.',
  },
  chest: {
    id: 'chest',
    name: 'Brust dehnen im Türrahmen',
    type: 'stretch',
    target: 'Brust und Schulter vorne',
    how: ['Unterarm auf Schulterhöhe an den Türrahmen legen.', 'Einen Schritt nach vorne gehen, bis es in der Brust zieht. Schultern unten lassen.'],
    why: 'Gegenpol zur runden Haltung auf dem Rad und zum Kraulzug.',
    sides: true,
  },
  shoulder: {
    id: 'shoulder',
    name: 'Schulter hinten dehnen',
    type: 'stretch',
    target: 'Hintere Schulter',
    how: ['Einen Arm gestreckt vor der Brust zur anderen Seite führen.', 'Mit dem anderen Arm über dem Ellbogen sanft heranziehen.'],
    why: 'Beim Schwimmen arbeiten die Schultern am meisten. Beweglichkeit hier macht den Zug länger.',
    sides: true,
  },
}

/** Übungen je Routine, nach Wichtigkeit sortiert. Leicht nimmt die ersten 4, Mittel 6, Schwer alle. */
const ROUTINES: Record<RoutineKind, { title: string; note: string; ids: string[] }> = {
  run_easy: {
    title: 'Nach dem lockeren Lauf',
    note: 'Ruhiger Lauf, also Fokus auf Beweglichkeit: Waden, Hüfte, hintere Oberschenkel.',
    ids: ['calf', 'hipFlexor', 'hamstring', 'rollCalf', 'figure4', 'quad', 'adductor', 'worldsGreatest'],
  },
  run_hard: {
    title: 'Nach der harten Einheit',
    note: 'Nach Tempo oder Intervallen zuerst rollen, danach nur sanft dehnen. Der Muskel ist frisch belastet, also nicht bis an die Grenze gehen.',
    ids: ['rollQuad', 'rollCalf', 'hipFlexor', 'calf', 'rollGlute', 'quad', 'figure4', 'hamstring'],
  },
  run_long: {
    title: 'Nach dem langen Lauf',
    note: 'Nach langen Läufen sind Oberschenkel, Waden und Gesäß am stärksten belastet. Rolle mit wenig Druck, Dehnen sanft.',
    ids: ['rollQuad', 'rollCalf', 'hipFlexor', 'rollGlute', 'rollItb', 'calf', 'figure4', 'childPose'],
  },
  bike: {
    title: 'Nach dem Radfahren',
    note: 'Auf dem Rad ist die Hüfte lange gebeugt und der Rücken rund. Die Routine öffnet beides.',
    ids: ['hipFlexor', 'rollQuad', 'rollBack', 'figure4', 'chest', 'hamstring', 'rollGlute', 'worldsGreatest'],
  },
  swim: {
    title: 'Nach dem Schwimmen',
    note: 'Schultern, Brust und oberer Rücken stehen im Mittelpunkt.',
    ids: ['chest', 'shoulder', 'rollBack', 'childPose', 'worldsGreatest', 'hipFlexor', 'rollGlute', 'calf'],
  },
  strength: {
    title: 'Nach dem Krafttraining',
    note: 'Ruhig dehnen, was du trainiert hast. Rollen hilft gegen das Spannungsgefühl am nächsten Tag.',
    ids: ['rollQuad', 'hipFlexor', 'figure4', 'rollGlute', 'chest', 'hamstring', 'childPose', 'calf'],
  },
}

/** Dosierung je Stufe. 30–45 s je Satz deckt sich mit dem, was Studien für Beweglichkeit nutzen. */
export const DOSE: Record<Level, { count: number; stretchSets: number; stretchSec: number; rollSec: number; reps: number; text: string }> = {
  easy: { count: 4, stretchSets: 1, stretchSec: 30, rollSec: 45, reps: 5, text: 'Sanft bis zu einem leichten Ziehen.' },
  medium: { count: 6, stretchSets: 1, stretchSec: 45, rollSec: 60, reps: 6, text: 'Dehnen deutlich spürbar, aber nie schmerzhaft.' },
  hard: { count: 8, stretchSets: 2, stretchSec: 30, rollSec: 60, reps: 8, text: 'Mehr Übungen, zwei Sätze und intensivere Varianten.' },
}

export interface RoutineStep {
  ex: Exercise
  name: string
  how: string[]
  dose: string
  seconds: number
}

export interface Routine {
  kind: RoutineKind
  title: string
  note: string
  minutes: number
  steps: RoutineStep[]
}

export function routineKind(a: Pick<Activity, 'sport' | 'duration_s' | 'anaerobic_te' | 'name'>): RoutineKind | null {
  const g = sportGroup(a.sport)
  if (g === 'bike') return 'bike'
  if (g === 'swim') return 'swim'
  if (g === 'run') {
    if ((a.duration_s ?? 0) >= 75 * 60) return 'run_long'
    if ((a.anaerobic_te ?? 0) >= 2 || /intervall|tempo|schwelle|interval|threshold|fahrtspiel|fartlek/i.test(a.name ?? '')) return 'run_hard'
    return 'run_easy'
  }
  if (/strength|fitness_equipment/.test(a.sport)) return 'strength'
  return null
}

export function buildRoutine(kind: RoutineKind, level: Level): Routine {
  const r = ROUTINES[kind]
  const d = DOSE[level]
  const steps = r.ids.slice(0, d.count).map((id) => {
    const ex = EX[id]
    const harder = level === 'hard' && ex.harder
    const per = ex.sides ? ' je Seite' : ''
    let dose: string
    let seconds: number
    if (ex.type === 'roll') {
      dose = `${d.rollSec} s${per}, langsam`
      seconds = d.rollSec * (ex.sides ? 2 : 1)
    } else if (ex.type === 'mobility') {
      dose = `${d.reps} Wiederholungen${per}`
      seconds = d.reps * 6 * (ex.sides ? 2 : 1)
    } else {
      dose = d.stretchSets > 1 ? `${d.stretchSets} × ${d.stretchSec} s${per}` : `${d.stretchSec} s${per}`
      seconds = d.stretchSets * d.stretchSec * (ex.sides ? 2 : 1) + (d.stretchSets - 1) * 10
    }
    return { ex, name: harder ? harder.name : ex.name, how: harder ? [...ex.how, harder.how] : ex.how, dose, seconds }
  })
  const minutes = Math.max(1, Math.round(steps.reduce((s, x) => s + x.seconds + 15, 0) / 60))
  return { kind, title: r.title, note: r.note, minutes, steps }
}

/** Was Studien zu Dehnen und Faszienrolle zeigen. Ehrlich, auch wo der Nutzen klein ist. */
export const EVIDENCE: { title: string; text: string; source: string }[] = [
  {
    title: 'Beweglichkeit',
    text: 'Regelmäßiges Dehnen macht nachweislich beweglicher. Am meisten bringt es, wenn jede Muskelgruppe auf mindestens 5 Minuten pro Woche kommt, verteilt auf mehrere Tage. Deshalb die kurzen Routinen nach jedem Training statt einer langen Einheit pro Woche.',
    source: 'Thomas et al. 2018, Int J Sports Med; Behm et al. 2016, Appl Physiol Nutr Metab',
  },
  {
    title: 'Faszienrolle',
    text: 'Rollen nach dem Training senkt das Muskelkater-Gefühl in den Tagen danach etwas und macht kurzfristig beweglicher, ohne die Leistung zu schwächen. Die Effekte sind klein bis mittel, aber gut belegt.',
    source: 'Wiewelhove et al. 2019, Front Physiol; Pearcey et al. 2015, J Athl Train; Wilke et al. 2020, Sports Med',
  },
  {
    title: 'Warum nach dem Training',
    text: 'Lange statische Dehnungen direkt vor schnellen Einheiten können Kraft und Schnelligkeit kurz senken. Nach dem Training stört das nicht, und die Muskeln sind warm.',
    source: 'Kay & Blazevich 2012, Med Sci Sports Exerc; Behm et al. 2016',
  },
  {
    title: 'Was es nicht kann',
    text: 'Dehnen allein senkt das Verletzungsrisiko kaum und Muskelkater nur minimal. Gegen Verletzungen wirkt Krafttraining deutlich stärker. Dehnen ist also für Beweglichkeit und Wohlgefühl da, nicht als Schutzschild.',
    source: 'Lauersen et al. 2014, Br J Sports Med; Herbert et al. 2011, Cochrane Review',
  },
]

export const BEGINNER_TIPS = [
  'Dehnen bis zu einem deutlichen Ziehen, nie bis zum Schmerz. Ruhig weiteratmen.',
  'Nicht federn, die Position einfach halten.',
  'Rolle: Druck so, dass es „angenehm unangenehm“ ist. Langsam rollen, etwa 2–3 cm pro Sekunde.',
  'Nie direkt über Knochen, Gelenke, die Kniekehle oder den unteren Rücken rollen.',
  'Für den Anfang eine mittelharte, glatte Rolle. Harte Rollen mit Noppen erst später.',
]
