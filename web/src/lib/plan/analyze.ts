// Automatische Auswertung eines Laufs: Puls-Zonen, Trainingseffekt und Anstrengung von der Uhr
// gegen das Ziel der Einheit. Daraus folgt „zu leicht / passend / zu hart“ und eine kleine
// Anpassung der Zieltempos künftiger Einheiten derselben Art.

import type { Activity } from '../types'
import { fmtPace } from './generate'
import type { Feedback, Kind, PlanWorkout, Step, WorkStep } from './types'

export interface Analysis {
  verdict: Feedback
  /** Kurze Begründungen für die Anzeige. */
  reasons: string[]
  /** Tempo-Verschiebung für künftige Einheiten in s/km, positiv = langsamer. */
  paceShift: number
  /** Welche Einheiten die Verschiebung betrifft. */
  group: 'easy' | 'quality'
}

const EASY_KINDS: Kind[] = ['easy', 'long', 'recovery', 'strides']
const QUALITY_KINDS: Kind[] = ['fartlek', 'tempo', 'intervals', 'race_pace']
const pct = (x: number) => `${Math.round(x * 100)} %`

export function analyzeRun(w: PlanWorkout, a: Activity): Analysis | null {
  if (w.sport !== 'run') return null
  const z = (a.hr_zones_s ?? []).map((x) => x ?? 0)
  const total = z.reduce((s, x) => s + x, 0)
  const share = (from: number, to = 5) => (total ? z.slice(from - 1, to).reduce((s, x) => s + x, 0) / total : 0)
  const rpe = a.rpe != null ? a.rpe / 10 : null

  if (EASY_KINDS.includes(w.kind)) {
    if (!total) return null
    const above = share(3)
    const z1 = share(1, 1)
    const limit = w.kind === 'recovery' ? 0.15 : w.kind === 'easy' ? 0.25 : 0.3
    if (above > limit || (w.kind !== 'long' && (a.aerobic_te ?? 0) >= 4)) {
      const reasons = [`${pct(above)} der Zeit über Zone 2 (Ziel: höchstens ${pct(limit)}).`]
      if ((a.aerobic_te ?? 0) >= 4) reasons.push(`Aerober Trainingseffekt ${a.aerobic_te?.toFixed(1)}, für einen lockeren Lauf zu hoch.`)
      return { verdict: 'hard', reasons, paceShift: w.kind === 'recovery' ? 0 : above > 0.5 ? 15 : 10, group: 'easy' }
    }
    if (w.kind !== 'recovery' && z1 > 0.6 && above < 0.05) {
      return { verdict: 'easy', reasons: [`${pct(z1)} der Zeit in Zone 1, der Puls war kaum in Zone 2.`], paceShift: -5, group: 'easy' }
    }
    return { verdict: 'ok', reasons: [`${pct(1 - above - z1)} in Zone 2, nur ${pct(above)} darüber. Genau richtig.`], paceShift: 0, group: 'easy' }
  }

  if (QUALITY_KINDS.includes(w.kind)) {
    const reasons: string[] = []
    const z5 = share(5, 5)
    const hard = (rpe != null && rpe >= 9) || (w.kind === 'tempo' && z5 > 0.35) || (a.aerobic_te ?? 0) >= 4.8
    const easy = (rpe != null && rpe <= 4) || (a.aerobic_te != null && a.aerobic_te < 2.5 && (a.anaerobic_te ?? 0) < 1.5)
    if (rpe == null && a.aerobic_te == null && !total) return null
    if (rpe != null) reasons.push(`Deine Anstrengung auf der Uhr: ${rpe.toFixed(0)}/10.`)
    if (a.aerobic_te != null) reasons.push(`Trainingseffekt aerob ${a.aerobic_te.toFixed(1)}, anaerob ${(a.anaerobic_te ?? 0).toFixed(1)}.`)
    if (w.kind === 'tempo' && total) reasons.push(`${pct(z5)} der Zeit in Zone 5${z5 > 0.35 ? ', für einen Schwellenlauf zu viel' : ''}.`)
    if (hard) return { verdict: 'hard', reasons, paceShift: 4, group: 'quality' }
    if (easy) return { verdict: 'easy', reasons: [...reasons, 'Der Reiz war eher gering.'], paceShift: -3, group: 'quality' }
    return { verdict: 'ok', reasons, paceShift: 0, group: 'quality' }
  }
  return null
}

// ---------- Tempos verschieben ----------

function shiftStep(s: WorkStep, d: number, easyOnly: boolean): WorkStep {
  if (!s.pace) return s
  if (easyOnly !== (s.pace_slow != null)) return s
  return { ...s, pace: s.pace + d, ...(s.pace_slow != null ? { pace_slow: s.pace_slow + d } : {}) }
}

function shiftSteps(steps: Step[], d: number, easyOnly: boolean): Step[] {
  return steps.map((s) => (s.type === 'repeat' ? { ...s, steps: s.steps.map((c) => shiftStep(c, d, easyOnly)) } : shiftStep(s, d, easyOnly)))
}

/** Alle Tempoangaben eines Ablaufs als Text-Ersetzungen (alt → neu), damit die Beschreibung passt. */
function textChanges(before: Step[], after: Step[]): [string, string][] {
  const flat = (xs: Step[]): WorkStep[] => xs.flatMap((s) => (s.type === 'repeat' ? s.steps : [s]))
  const out: [string, string][] = []
  flat(before).forEach((s, i) => {
    const n = flat(after)[i]
    if (!s.pace || !n.pace || s.pace === n.pace) return
    if (s.pace_slow && n.pace_slow) out.push([`${fmtPace(s.pace_slow)}–${fmtPace(s.pace)}/km`, `${fmtPace(n.pace_slow)}–${fmtPace(n.pace)}/km`])
    else out.push([`${fmtPace(s.pace)}/km`, `${fmtPace(n.pace)}/km`])
  })
  return out
}

/**
 * Verschiebt die Zieltempos aller künftigen geplanten Einheiten derselben Gruppe
 * (lockere Läufe bzw. Tempoeinheiten der gleichen Art) um `d` s/km.
 */
export function shiftPaces(all: PlanWorkout[], w: PlanWorkout, group: Analysis['group'], d: number, today: string): PlanWorkout[] {
  if (!d) return []
  const easy = group === 'easy'
  const changed: PlanWorkout[] = []
  for (const x of all) {
    if (x.event_id !== w.event_id || x.date <= today || x.status !== 'planned' || !x.steps?.length || x.original) continue
    if (easy ? !EASY_KINDS.includes(x.kind) : x.kind !== w.kind) continue
    const steps = shiftSteps(x.steps, d, easy)
    let description = x.description
    for (const [from, to] of textChanges(x.steps, steps)) description = description?.split(from).join(to) ?? null
    if (JSON.stringify(steps) !== JSON.stringify(x.steps)) changed.push({ ...x, steps, description })
  }
  return changed
}

export function shiftMessage(a: Analysis): string {
  if (!a.paceShift) return ''
  const what = a.group === 'easy' ? 'lockeren Läufe' : 'Tempoeinheiten dieser Art'
  return a.paceShift > 0 ? `Die nächsten ${what} sind ${a.paceShift} s/km langsamer.` : `Die nächsten ${what} sind ${-a.paceShift} s/km schneller.`
}

/** Merged geänderte Einheiten: spätere Änderungen derselben Einheit gewinnen. */
export function merge(...lists: PlanWorkout[][]): PlanWorkout[] {
  const m = new Map<string, PlanWorkout>()
  for (const l of lists) for (const w of l) m.set(w.id, { ...(m.get(w.id) ?? {}), ...w })
  return [...m.values()]
}

export function analysisFor(w: PlanWorkout, activities: Activity[] | undefined): Analysis | null {
  const a = w.activity_id != null ? activities?.find((x) => x.id === w.activity_id) : undefined
  return a ? analyzeRun(w, a) : null
}
