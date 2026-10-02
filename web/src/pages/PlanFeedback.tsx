// Rückmeldung nach der Einheit: zu leicht, passend, zu hart.

import { useState } from 'react'
import { Card } from '../components/ui'
import { tap } from '../lib/haptics'
import { FEEDBACK_LABEL } from '../lib/plan/adapt'
import { addDays, WEEKDAY_LONG, weekday } from '../lib/plan/dates'
import type { Feedback, PlanWorkout } from '../lib/plan/types'
import type { PlanState } from '../lib/plan/usePlan'
import { toast } from '../lib/toast'

const ORDER: Feedback[] = ['easy', 'ok', 'hard']
const COLOR: Record<Feedback, string> = { easy: 'var(--series-1)', ok: 'var(--good)', hard: 'var(--serious)' }

export function FeedbackChips({ value, onPick, disabled }: { value: Feedback | null | undefined; onPick: (f: Feedback | null) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Wie war die Einheit?">
      {ORDER.map((f) => {
        const on = value === f
        return (
          <button
            key={f}
            disabled={disabled}
            aria-pressed={on}
            onClick={() => {
              tap()
              onPick(on ? null : f)
            }}
            className={`min-h-11 rounded-xl text-[15px] font-semibold disabled:opacity-60 ${on ? 'text-white' : 'bg-surface-2 text-ink'}`}
            style={on ? { background: COLOR[f] } : undefined}
          >
            {FEEDBACK_LABEL[f]}
          </button>
        )
      })}
    </div>
  )
}

function useRate(plan: PlanState) {
  const [busy, setBusy] = useState(false)
  async function rate(w: PlanWorkout, f: Feedback | null) {
    setBusy(true)
    try {
      toast(await plan.rate(w, f))
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return { busy, rate }
}

/** Fragt auf „Heute“ nach der letzten erledigten Einheit der letzten zwei Tage, solange sie unbewertet ist. */
export function FeedbackCard({ plan, today }: { plan: PlanState; today: string }) {
  const { busy, rate } = useRate(plan)
  const w = [...plan.workouts]
    .reverse()
    .find((x) => x.status === 'done' && x.sport !== 'race' && !x.feedback && x.date <= today && x.date >= addDays(today, -2))
  if (!w) return null
  const when = w.date === today ? 'heute' : w.date === addDays(today, -1) ? 'gestern' : `am ${WEEKDAY_LONG[weekday(w.date)]}`
  return (
    <Card title={`Wie war „${w.title}“?`} subtitle={`Erledigt ${when}. Damit passe ich die nächsten Einheiten an.`}>
      <FeedbackChips value={w.feedback} onPick={(f) => rate(w, f)} disabled={busy} />
    </Card>
  )
}
