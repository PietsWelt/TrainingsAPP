// Hauptkarte auf „Heute“: Was mache ich heute? Readiness, geplante Einheit, Vorschlag, Warnzeichen, Wetter.

import { useState } from 'react'
import { Card, Ring, StatusLabel, type Status } from '../components/ui'
import { tap } from '../lib/haptics'
import { explain } from '../lib/plan/explain'
import { workoutAmount } from '../lib/plan/labels'
import type { PlanWorkout } from '../lib/plan/types'
import type { PlanState } from '../lib/plan/usePlan'
import type { Readiness } from '../lib/readiness'
import { toast } from '../lib/toast'
import type { Dataset } from '../lib/types'
import type { DailyLogState } from '../lib/useDailyLog'
import { CheckInCard } from './CheckIn'
import { HeatCard } from './Heat'
import { OverloadCard } from './Overload'
import { canSwap, SwapSheet } from './PlanSwap'
import { ProposalCard, ReadinessCard } from './TodayReadiness'

function garminStatus(score: number): { status: Status; text: string } {
  if (score >= 75) return { status: 'good', text: 'Bereit für Belastung' }
  if (score >= 50) return { status: 'warning', text: 'Moderat trainieren' }
  if (score >= 25) return { status: 'serious', text: 'Eher locker' }
  return { status: 'critical', text: 'Erholung' }
}

export function TodayHero({ data, plan, log, own, today, strengthToday, onOpenPlan, className = '' }: {
  data: Dataset
  plan: PlanState
  log: DailyLogState
  own: Readiness | null
  today: string
  strengthToday: boolean
  onOpenPlan: () => void
  className?: string
}) {
  const garmin = data.days.at(-1)?.training_readiness
  const planned = plan.events.some((e) => e.date >= today)
  return (
    <Card hero className={`overflow-hidden p-0 ${className}`}>
      <OverloadCard days={data.days} activities={data.activities} workouts={plan.workouts} today={today} variant="embedded" />
      <div className="p-5">
        <div className={`grid gap-4 ${planned ? 'lg:grid-cols-2 lg:gap-6' : ''}`}>
          {own ? (
            <ReadinessCard r={own} garmin={garmin} variant="embedded" />
          ) : garmin != null ? (
            <div className="flex items-center gap-4">
              <Ring value={garmin} size={92} stroke={9} label={`Garmin Readiness ${garmin} von 100`}>
                <span className="text-[28px] leading-none font-bold">{garmin}</span>
              </Ring>
              <div>
                <div className="text-xs font-medium text-ink-3">Training Readiness (Garmin)</div>
                <div className="mt-1 text-lg font-semibold">
                  <StatusLabel status={garminStatus(garmin).status}>{garminStatus(garmin).text}</StatusLabel>
                </div>
                <div className="mt-1 text-xs text-ink-3">Deine eigene Readiness erscheint, sobald Schlaf oder HRV von heute da sind.</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-2">Deine Readiness erscheint, sobald Schlaf oder HRV von heute da sind.</p>
          )}
          {planned && <PlannedToday plan={plan} today={today} onOpenPlan={onOpenPlan} />}
        </div>
        <ProposalCard plan={plan} r={own} today={today} log={log} variant="embedded" />
        <div className="mt-3 border-t border-line pt-1 empty:hidden">
          <HeatCard workout={plan.workouts.find((w) => w.date === today && w.sport === 'run' && w.status === 'planned')} variant="row" />
          <CheckInCard log={log} plan={plan} today={today} strengthToday={strengthToday} variant="hint" />
        </div>
      </div>
    </Card>
  )
}

/** Die geplanten Einheiten von heute, mit Umfang, kurzer Erklärung und „Warum?“. */
function PlannedToday({ plan, today, onOpenPlan }: { plan: PlanState; today: string; onOpenPlan: () => void }) {
  const [why, setWhy] = useState<string | null>(null)
  const [swapId, setSwapId] = useState<string | null>(null)
  const ws = plan.workouts.filter((w) => w.date === today && w.status !== 'skipped')
  const swapping = ws.find((w) => w.id === swapId)
  const race = (id: string) => plan.events.find((e) => e.id === id)?.name
  async function toggle(w: PlanWorkout) {
    const done = w.status !== 'done'
    tap()
    try {
      await plan.setStatus(w, done ? 'done' : 'planned')
      if (done) toast(`${w.title} erledigt. Stark!`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  return (
    <div className="border-t border-line pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
      <div className="text-xs font-medium text-ink-3">Heute geplant</div>
      {ws.length === 0 ? (
        <button onClick={onOpenPlan} className="press-row -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between rounded-lg px-2 text-left text-sm text-ink-2">
          Ruhetag. Erholung gehört zum Plan.
          <span className="text-accent">Plan ›</span>
        </button>
      ) : (
        <ul>
          {ws.map((w) => {
            const e = explain(w)
            const swappable = w.status === 'planned' && w.sport !== 'race' && canSwap(plan, w, today)
            return (
              <li key={w.id} className="py-1">
                <div className="flex items-center">
                  <button onClick={onOpenPlan} className="press-row -ml-2 flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-lg pl-2 text-left">
                    <span className={`truncate text-[19px] leading-snug font-semibold ${w.status === 'done' ? 'text-ink-3 line-through' : ''}`}>{w.title}</span>
                    <span className="text-xs text-ink-3">
                      {workoutAmount(w)}
                      {plan.events.length > 1 && ` · ${race(w.event_id)}`}
                    </span>
                  </button>
                  {w.sport !== 'race' && (
                    <button
                      onClick={() => toggle(w)}
                      aria-pressed={w.status === 'done'}
                      className={`ml-2 min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${w.status === 'done' ? 'text-white' : 'bg-surface-2 text-ink'}`}
                      style={w.status === 'done' ? { background: 'var(--good)' } : undefined}
                    >
                      {w.status === 'done' ? '✓ Erledigt' : 'Erledigt?'}
                    </button>
                  )}
                </div>
                {(e || swappable) && (
                  <p className="mt-0.5 text-xs text-ink-2">
                    {e && (
                      <>
                        {e.short}{' '}
                        <button onClick={() => setWhy(why === w.id ? null : w.id)} aria-expanded={why === w.id} className="font-semibold text-accent">
                          {why === w.id ? 'Weniger' : 'Warum?'}
                        </button>
                      </>
                    )}
                    {e && swappable && <span className="text-ink-3"> · </span>}
                    {swappable && (
                      <button onClick={() => setSwapId(w.id)} className="font-semibold text-accent">
                        Anderer Tag?
                      </button>
                    )}
                  </p>
                )}
                {e && why === w.id && (
                  <div className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-2">
                    <p>{e.purpose}</p>
                    {e.pace && <p>{e.pace}</p>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {swapping && <SwapSheet plan={plan} workout={swapping} today={today} onClose={() => setSwapId(null)} />}
    </div>
  )
}
