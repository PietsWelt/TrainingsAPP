import { sportGroup } from '../format'
// Automatische Auswertung eines Laufs: Puls-Zonen, Trainingseffekt und Anstrengung von der Uhr
// gegen das Ziel der Einheit. Daraus folgt „zu leicht / passend / zu hart“ und eine kleine
// Anpassung der Zieltempos künftiger Einheiten derselben Art.

import { personalAet, shareAbove, shareBelow, type Aet } from '../aet'
import { heatPct, HOT_PCT } from '../heat'
import type { Activity } from '../types'
import { isPartial } from './adapt'
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

/**
 * Garmin-Zonen sind nicht immer verlässlich (z.B. stundenlang „Zone 5“ im Marathon).
 * Mehr als 40 % in Zone 5 bei über 40 min Laufzeit gilt als Messfehler: dann zählen die Zonen nicht.
 */
export function zonesPlausible(a: Activity): boolean {
  const z = (a.hr_zones_s ?? []).map((x) => x ?? 0)
  const total = z.reduce((s, x) => s + x, 0)
  if (!total) return false
  return !(total > 40 * 60 && (z[4] ?? 0) / total > 0.4)
}

/** Ab diesem Steigungsfaktor (3 % mehr Aufwand als flach) gilt ein Lauf als hügelig. */
export const HILLY = 1.03

/**
 * Hitze und Hügel treiben den Puls bei gleichem Tempo nach oben. Dann ist „zu hart“ kein
 * Zeichen für zu schnelle Zieltempos: Die Tempos bleiben, die Begründung sagt warum.
 */
function forConditions(r: Analysis | null, a: Activity): Analysis | null {
  if (!r || r.verdict !== 'hard') return r
  const heat = heatPct(a.temp_c, a.dew_point_c)
  const hilly = (a.gap_factor ?? 1) >= HILLY
  if (heat < HOT_PCT && !hilly) return r
  const why = [
    heat >= HOT_PCT && `${Math.round(a.temp_c!)} °C bei Taupunkt ${Math.round(a.dew_point_c!)} °C (etwa ${heat.toLocaleString('de-DE')} % langsamer bei gleicher Anstrengung)`,
    hilly && `hügelige Strecke (etwa ${Math.round(((a.gap_factor ?? 1) - 1) * 100)} % mehr Aufwand als flach)`,
  ].filter(Boolean)
  const note = `Wegen ${why.join(' und ')} war ein höherer Puls zu erwarten. Die Zieltempos bleiben deshalb gleich.`
  return r.group === 'easy' ? { ...r, verdict: 'ok', reasons: [...r.reasons, note], paceShift: 0 } : { ...r, reasons: [...r.reasons, note], paceShift: 0 }
}

/** `all` sind alle Aktivitäten: Daraus kommt bei Läufen mit Brustgurt deine aerobe Schwelle. */
export function analyzeRun(w: PlanWorkout, a: Activity, all?: Activity[]): Analysis | null {
  return forConditions(rawAnalysis(w, a, all), a)
}

/** Spielraum über der aeroben Schwelle: Messunsicherheit und dein Wohlfühlbereich Zone 2–3. */
export const AET_MARGIN = 5

const easyLimit = (k: Kind) => (k === 'recovery' ? 0.1 : k === 'long' ? 0.2 : 0.15)

/**
 * Lockerer Lauf mit Brustgurt und bekannter aerober Schwelle: Statt Garmins Zonen zählt die Zeit
 * deutlich über deiner eigenen Schwelle. Das ist die Grenze, die lockeres Laufen ausmacht (Seiler 2010).
 */
function byThreshold(w: PlanWorkout, a: Activity, aet: Aet): Analysis | null {
  const limitHr = aet.hr + AET_MARGIN
  const above = shareAbove(a.hr_hist, limitHr)
  const below = shareBelow(a.hr_hist, aet.hr - 20)
  if (above == null || below == null) return null
  const limit = easyLimit(w.kind)
  const ref = `deiner aeroben Schwelle (${aet.hr} bpm, aus dem Brustgurt)`
  if (above > limit || (w.kind !== 'long' && (a.aerobic_te ?? 0) >= 4.2)) {
    const reasons = [`${pct(above)} der Zeit mehr als ${AET_MARGIN} Schläge über ${ref}. Ziel: höchstens ${pct(limit)}.`]
    if ((a.aerobic_te ?? 0) >= 4.2) reasons.push(`Aerober Trainingseffekt ${a.aerobic_te?.toFixed(1)}, für einen lockeren Lauf zu hoch.`)
    return { verdict: 'hard', reasons, paceShift: w.kind === 'recovery' ? 0 : above > 0.35 ? 15 : 10, group: 'easy' }
  }
  if (w.kind !== 'recovery' && below > 0.6) {
    return { verdict: 'easy', reasons: [`${pct(below)} der Zeit mehr als 20 Schläge unter ${ref}.`], paceShift: -5, group: 'easy' }
  }
  return { verdict: 'ok', reasons: [`Nur ${pct(above)} der Zeit deutlich über ${ref}. Passt.`], paceShift: 0, group: 'easy' }
}

function rawAnalysis(w: PlanWorkout, a: Activity, all?: Activity[]): Analysis | null {
  if (w.sport !== 'run') return null
  const z = (a.hr_zones_s ?? []).map((x) => x ?? 0)
  const total = z.reduce((s, x) => s + x, 0)
  const share = (from: number, to = 5) => (total ? z.slice(from - 1, to).reduce((s, x) => s + x, 0) / total : 0)
  // Mit Brustgurt ist der Puls verlässlich: Dann gilt auch viel Zone 5 nicht als Messfehler.
  const strap = a.hr_source === 'strap'
  const zonesOk = strap ? total > 0 : zonesPlausible(a)
  const rpe = a.rpe != null ? a.rpe / 10 : null

  if (EASY_KINDS.includes(w.kind)) {
    const aet = strap && a.hr_hist ? personalAet(all, a.local_date) : null
    const own = aet && byThreshold(w, a, aet)
    if (own) return own
    // Zone 2–3 ist für lockere Läufe in Ordnung; zu hart ist erst Zeit ab Zone 4.
    if (!zonesOk) return null
    const above = share(4)
    const z1 = share(1, 1)
    const limit = easyLimit(w.kind)
    if (above > limit || (w.kind !== 'long' && (a.aerobic_te ?? 0) >= 4.2)) {
      const reasons = [`${pct(above)} der Zeit in Zone 4 oder höher (Ziel: höchstens ${pct(limit)}).`]
      if ((a.aerobic_te ?? 0) >= 4.2) reasons.push(`Aerober Trainingseffekt ${a.aerobic_te?.toFixed(1)}, für einen lockeren Lauf zu hoch.`)
      return { verdict: 'hard', reasons, paceShift: w.kind === 'recovery' ? 0 : above > 0.35 ? 15 : 10, group: 'easy' }
    }
    if (w.kind !== 'recovery' && z1 > 0.6 && share(3) < 0.05) {
      return { verdict: 'easy', reasons: [`${pct(z1)} der Zeit in Zone 1, der Puls war kaum in Zone 2.`], paceShift: -5, group: 'easy' }
    }
    return { verdict: 'ok', reasons: [`${pct(share(2, 3))} in Zone 2–3, nur ${pct(above)} darüber. Passt.`], paceShift: 0, group: 'easy' }
  }

  if (QUALITY_KINDS.includes(w.kind)) {
    // Bei harten Einheiten sind die Zonen oft falsch: entscheidend ist deine Anstrengung,
    // ohne sie nur ein sehr deutlicher Trainingseffekt.
    const te = a.aerobic_te
    if (rpe == null && te == null && !(strap && total > 0)) return null
    const reasons: string[] = []
    if (rpe != null) reasons.push(`Deine Anstrengung auf der Uhr: ${rpe.toFixed(0)}/10.`)
    if (te != null) reasons.push(`Trainingseffekt aerob ${te.toFixed(1)}, anaerob ${(a.anaerobic_te ?? 0).toFixed(1)}.`)
    if (rpe == null) reasons.push('Gib nach dem Lauf auf der Uhr deine Anstrengung ein, dann wird die Bewertung genauer.')
    // Mit Brustgurt strenger: Schwellen- und Renntempo-Läufe gehören kaum in Zone 5. Fühlte es sich
    // aber nur mittel an (bis 6/10), sind eher Garmins Zonengrenzen falsch als das Tempo.
    const z5 = share(5, 5)
    const strapHot = strap && total > 0 && (w.kind === 'tempo' || w.kind === 'race_pace') && z5 > 0.25 && (rpe == null || rpe >= 7)
    if (strapHot) reasons.push(`Brustgurt: ${pct(z5)} der Zeit in Zone 5. Bei dieser Einheit sollte der Puls meist darunter bleiben.`)
    const hard = (rpe != null ? rpe >= 9 : (te ?? 0) >= 5) || strapHot
    const easy = rpe != null ? rpe <= 4 : te != null && te < 2 && (a.anaerobic_te ?? 0) < 1
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
  // Deutlich zu kurz: keine Bewertung, das Tempo wird dann auch nicht angepasst.
  return a && sportGroup(a.sport) === w.sport && !isPartial(w, a) ? analyzeRun(w, a, activities) : null
}
