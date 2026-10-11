import { fmtPace } from './generate'
import type { PlanWorkout, Step, WorkStep } from './types'

export function workoutAmount(w: PlanWorkout): string {
  const parts = []
  if (w.distance_km) parts.push(`${String(w.distance_km).replace('.', ',')} km`)
  if (w.duration_min) parts.push(w.duration_min >= 60 ? `${Math.floor(w.duration_min / 60)} h ${w.duration_min % 60 ? `${w.duration_min % 60} min` : ''}`.trim() : `${w.duration_min} min`)
  return parts.join(' · ')
}

const STEP_NAME: Record<WorkStep['type'], string> = { warmup: 'Einlaufen', run: 'Laufen', recover: 'Pause', cooldown: 'Auslaufen' }

function stepAmount(s: WorkStep): string {
  if (s.m) return s.m >= 1000 ? `${String(Math.round(s.m / 100) / 10).replace('.', ',')} km` : `${s.m} m`
  if (s.time_s) return s.time_s >= 60 ? `${Math.round(s.time_s / 60)} min` : `${s.time_s} s`
  return 'bis Rundentaste'
}

/** Eine Zeile pro Schritt, z.B. „6 × 800 m @ 4:05/km, 400 m Pause“. */
export function stepLines(steps: Step[]): string[] {
  const one = (s: WorkStep) => {
    // Puls-Ziel hat Vorrang (so steht es auch auf der Uhr), sonst das Tempo.
    const pace = s.hr_low != null && s.hr_high != null ? ` · Puls ${s.hr_low}–${s.hr_high}` : s.pace ? ` @ ${fmtPace(s.pace)}/km` : ''
    const name = s.type === 'run' ? (s.note ?? STEP_NAME.run) : STEP_NAME[s.type]
    return `${name} ${stepAmount(s)}${pace}`
  }
  return steps.map((s) => {
    if (s.type !== 'repeat') return one(s)
    const [w, ...rest] = s.steps
    const work = `${stepAmount(w)}${w.pace ? ` @ ${fmtPace(w.pace)}/km` : ''}`
    return `${s.times} × ${work}${rest.map((r) => `, ${stepAmount(r)} ${r.type === 'recover' ? 'Pause' : (r.note ?? '')}`.trimEnd()).join('')}`
  })
}

/** Kurzname der Art für den Chip im Wochenplan (null = kein Chip). */
export const KIND_CHIP: Partial<Record<PlanWorkout['kind'], string>> = {
  tempo: 'Schwelle',
  intervals: 'Intervalle',
  fartlek: 'Fahrtspiel',
  race_pace: 'WK-Tempo',
  long: 'Lang',
}

/** Qualitätseinheiten: nur deren Arbeitsschritte zählen als hart. */
export const HARD_KINDS: PlanWorkout['kind'][] = ['tempo', 'intervals', 'fartlek', 'race_pace']

export function kindChip(w: PlanWorkout): { text: string; color: string } | null {
  const text = w.sport === 'run' ? KIND_CHIP[w.kind] : undefined
  if (!text) return null
  // „Fahrtspiel · Fahrtspiel“ hilft niemandem: Steht die Art schon im Titel, reicht der Titel.
  if (w.title.toLowerCase().startsWith(text.toLowerCase())) return null
  return { text, color: HARD_KINDS.includes(w.kind) ? 'var(--c-hart)' : 'var(--c-lock)' }
}

/** Dauer eines Schritts in Sekunden; Strecke wird über das Zieltempo (sonst `fallbackPace`) umgerechnet. */
export function stepSeconds(s: WorkStep, fallbackPace: number): number {
  if (s.time_s) return s.time_s
  if (s.m) return (s.m / 1000) * (s.pace ?? fallbackPace)
  return 0
}

/** Arbeitsschritt mit Tempo-Ziel (ruhige Abschnitte haben einen Bereich oder ein Puls-Ziel). */
const isHardStep = (s: WorkStep) => s.type === 'run' && s.pace != null && s.pace_slow == null && s.hr_low == null

/** Geplante Minuten locker/hart. Hart = Arbeitsschritte mit Tempo-Ziel in Qualitätseinheiten, der Rest ist locker. */
export function plannedIntensity(workouts: PlanWorkout[]): { easyMin: number; hardMin: number; easyPct: number | null } {
  let easy = 0
  let hard = 0
  for (const w of workouts) {
    if (w.sport === 'race' || w.status === 'skipped') continue
    const avgPace = w.duration_min && w.distance_km ? (w.duration_min * 60) / w.distance_km : 330
    let stepTotal = 0
    let h = 0
    for (const s of w.steps ?? []) {
      const list = s.type === 'repeat' ? s.steps : [s]
      const times = s.type === 'repeat' ? s.times : 1
      for (const x of list) {
        const sec = stepSeconds(x, avgPace) * times
        stepTotal += sec
        if (HARD_KINDS.includes(w.kind) && isHardStep(x)) h += sec
      }
    }
    const total = w.duration_min != null ? w.duration_min * 60 : stepTotal
    hard += Math.min(h, total)
    easy += Math.max(0, total - h)
  }
  const sum = easy + hard
  return { easyMin: Math.round(easy / 60), hardMin: Math.round(hard / 60), easyPct: sum ? Math.round((easy / sum) * 100) : null }
}

/** Eine Zeile für eingeklappte Wochen: „Schwelle, Intervalle, Lang 18 km“. */
export function weekKinds(workouts: PlanWorkout[]): string {
  return workouts
    .filter((w) => w.status !== 'skipped')
    .map((w) => {
      const text = w.sport === 'run' ? KIND_CHIP[w.kind] : undefined
      if (!text) return null
      return w.kind === 'long' && w.distance_km ? `${text} ${String(w.distance_km).replace('.', ',')} km` : text
    })
    .filter(Boolean)
    .join(', ')
}
