// Rückmeldung nach der Einheit: zu leicht, passend, zu hart.

import { useState } from 'react'
import { Card, StatusLabel, type Status } from '../components/ui'
import { analysisFor, shiftMessage, type Analysis } from '../lib/plan/analyze'
import type { Activity } from '../lib/types'
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

const VERDICT: Record<Feedback, { status: Status; text: string }> = {
  easy: { status: 'warning', text: 'Zu leicht' },
  ok: { status: 'good', text: 'Passend' },
  hard: { status: 'serious', text: 'Zu hart' },
}

/** Auswertung der Uhr-Daten mit Begründung und Anpassung. */
export function AnalysisBlock({ a }: { a: Analysis }) {
  const v = VERDICT[a.verdict]
  return (
    <div className="mb-3">
      <div className="text-lg font-semibold">
        <StatusLabel status={v.status}>{v.text}</StatusLabel>
      </div>
      <ul className="mt-1 space-y-0.5 text-sm text-ink-2">
        {a.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {shiftMessage(a) && <p className="mt-2 text-sm font-medium">{shiftMessage(a)}</p>}
      <p className="mt-2 text-xs text-ink-3">Fühlte es sich anders an? Tipp deine Einschätzung, sie zählt dann.</p>
    </div>
  )
}

const SEEN_KEY = 'feedback.seen'
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

/**
 * Auf „Heute“: Auswertung der letzten erledigten Einheit der letzten zwei Tage.
 * Mit Uhr-Daten bewertet die App selbst, sonst fragt sie nach deiner Einschätzung.
 */
export function FeedbackCard({ plan, today, activities }: { plan: PlanState; today: string; activities: Activity[] }) {
  const { busy, rate } = useRate(plan)
  const [seen, setSeen] = useState(readSeen)
  const w = [...plan.workouts]
    .reverse()
    .find((x) => x.status === 'done' && x.sport !== 'race' && x.date <= today && x.date >= addDays(today, -2))
  if (!w) return null
  const a = analysisFor(w, activities)
  if (w.feedback && (!a || seen === w.id)) return null
  const when = w.date === today ? 'heute' : w.date === addDays(today, -1) ? 'gestern' : `am ${WEEKDAY_LONG[weekday(w.date)]}`
  return (
    <Card title={a ? `Auswertung: ${w.title}` : `Wie war „${w.title}“?`} subtitle={a ? `Gelaufen ${when}, aus deinen Uhr-Daten.` : `Erledigt ${when}. Damit passe ich die nächsten Einheiten an.`}>
      {a && <AnalysisBlock a={a} />}
      <FeedbackChips value={w.feedback} onPick={(f) => rate(w, f)} disabled={busy} />
      {a && w.feedback && (
        <button
          onClick={() => {
            try {
              localStorage.setItem(SEEN_KEY, w.id)
            } catch {
              // ohne Speicher bleibt die Karte bis morgen sichtbar
            }
            setSeen(w.id)
          }}
          className="mt-3 min-h-11 w-full rounded-xl text-sm font-semibold text-accent"
        >
          Verstanden
        </button>
      )}
    </Card>
  )
}
