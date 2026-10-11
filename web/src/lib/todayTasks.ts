// „Noch offen“ auf „Heute“: welche Zeilen erscheinen und in welcher Reihenfolge.
// Ob eine Aufgabe ansteht, rechnen die Karten selbst (dieselben Funktionen); hier wird nur sortiert.

export type TaskKey = 'checkin' | 'feedback' | 'mobility' | 'strength' | 'review'

/** Reihenfolge der Zeilen. */
export const TASK_ORDER: TaskKey[] = ['checkin', 'feedback', 'mobility', 'strength', 'review']

/**
 * Check-in: `yesterday` = gestern fehlt noch; das steht schon als Zeile in der Hauptkarte und
 * erscheint hier nicht doppelt. `today` = heute etwas nachzutragen (z.B. Krafttraining erkannt).
 */
export type CheckInState = 'yesterday' | 'today' | 'done'
/** Alle anderen: `null` = heute kein Thema. */
export type TaskState = 'open' | 'done' | null

export interface TaskStates {
  checkin: CheckInState
  feedback: TaskState
  mobility: TaskState
  strength: TaskState
  review: TaskState
}

export function openTasks(s: TaskStates): { open: TaskKey[]; done: TaskKey[] } {
  const state = (k: TaskKey): TaskState => (k === 'checkin' ? (s.checkin === 'today' ? 'open' : s.checkin === 'done' ? 'done' : null) : s[k])
  return { open: TASK_ORDER.filter((k) => state(k) === 'open'), done: TASK_ORDER.filter((k) => state(k) === 'done') }
}
