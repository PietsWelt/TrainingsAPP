// „Noch offen“ auf „Heute“: eine Karte mit Zeilen statt vieler einzelner Karten. Erledigtes rutscht zusammen.

import { Fragment, useState, type ReactNode } from 'react'
import { Card } from '../components/ui'
import { useAppState } from '../lib/appState'
import type { PlanState } from '../lib/plan/usePlan'
import type { Readiness } from '../lib/readiness'
import { openTasks, type TaskKey } from '../lib/todayTasks'
import type { Dataset } from '../lib/types'
import type { DailyLogState } from '../lib/useDailyLog'
import { reviewMonday } from '../lib/weekReview'
import { CheckInCard, checkInState } from './CheckIn'
import { MobilityCard, mobilityToday } from './Mobility'
import { FeedbackCard, feedbackDue } from './PlanFeedback'
import { StrengthCard, strengthToday as strengthPlan } from './Strength'
import { WeekReviewCard } from './WeekReview'

export function TodayTasks({ data, plan, log, own, today, strengthToday, className = '' }: {
  data: Dataset
  plan: PlanState
  log: DailyLogState
  own: Readiness | null
  today: string
  strengthToday: boolean
  className?: string
}) {
  const doneMark = useAppState<string | null>('checkin.done', null)
  const seen = useAppState<string | null>('feedback.seen', null)
  const mobilityDone = useAppState<number[]>('mobility.done', [])
  const skip = useAppState<string[]>('strength.skip', [])
  const [hour] = useState(() => new Date().getHours())
  const [showDone, setShowDone] = useState(false)

  const mobility = mobilityToday(data.activities, today, mobilityDone)
  const strength = strengthPlan(plan.workouts, log.gym, today, skip)
  const { open, done } = openTasks({
    checkin: checkInState(log, today, doneMark, strengthToday),
    feedback: feedbackDue(plan.workouts, today, data.activities, seen) ? 'open' : null,
    mobility: mobility ? (mobility.isDone ? 'done' : 'open') : null,
    strength: strength ? (strength.done ? 'done' : 'open') : null,
    review: reviewMonday(today, hour) ? 'open' : null,
  })
  if (!open.length) return null

  const row = (k: TaskKey): ReactNode => {
    switch (k) {
      case 'checkin':
        return <CheckInCard log={log} plan={plan} today={today} strengthToday={strengthToday} variant="row" />
      case 'feedback':
        return <FeedbackCard plan={plan} today={today} activities={data.activities} variant="row" />
      case 'mobility':
        return <MobilityCard activities={data.activities} today={today} variant="row" />
      case 'strength':
        return <StrengthCard workouts={plan.workouts} log={log} today={today} readiness={own} variant="row" />
      case 'review':
        return <WeekReviewCard data={data} plan={plan} log={log} variant="row" />
    }
  }

  return (
    <Card title="Noch offen" className={`py-2 ${className}`}>
      <div className="divide-y divide-line">
        {open.map((k) => (
          <Fragment key={k}>{row(k)}</Fragment>
        ))}
        {done.length > 0 &&
          (showDone ? (
            done.map((k) => <Fragment key={k}>{row(k)}</Fragment>)
          ) : (
            <button onClick={() => setShowDone(true)} className="flex min-h-11 w-full items-center justify-between text-left text-sm text-ink-2">
              <span>✓ {done.length} erledigt</span>
              <span className="text-ink-3" aria-hidden>
                ›
              </span>
            </button>
          ))}
      </div>
    </Card>
  )
}
