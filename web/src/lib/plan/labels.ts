import type { PlanWorkout } from './types'

export function workoutAmount(w: PlanWorkout): string {
  const parts = []
  if (w.distance_km) parts.push(`${String(w.distance_km).replace('.', ',')} km`)
  if (w.duration_min) parts.push(w.duration_min >= 60 ? `${Math.floor(w.duration_min / 60)} h ${w.duration_min % 60 ? `${w.duration_min % 60} min` : ''}`.trim() : `${w.duration_min} min`)
  return parts.join(' · ')
}
