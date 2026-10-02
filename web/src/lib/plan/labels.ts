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
    const pace = s.pace ? ` @ ${fmtPace(s.pace)}/km` : ''
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
