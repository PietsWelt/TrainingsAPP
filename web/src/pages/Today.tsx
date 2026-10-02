import { Card, Ring, Section, SportIcon, Stat, StatusLabel, type Status } from '../components/ui'
import { RecordsCard, WeekCard } from './TodayTraining'
import { ZoneBar } from '../components/ZoneBar'
import { hrvState, restingHrDelta, weeklyTotals } from '../lib/derive'
import { dateLabel, duration, hoursMin, km, speed, sportGroup, sportLabel } from '../lib/format'
import type { Dataset } from '../lib/types'
import { localToday } from '../lib/plan/dates'
import type { PlanState } from '../lib/plan/usePlan'
import type { PlanWorkout } from '../lib/plan/types'
import { tap } from '../lib/haptics'
import { toast } from '../lib/toast'
import { workoutAmount } from '../lib/plan/labels'
import { explain } from '../lib/plan/explain'
import { useMemo } from 'react'
import { readinessFor } from '../lib/readiness'
import type { DailyLogState } from '../lib/useDailyLog'
import { ProposalCard, ReadinessCard } from './TodayReadiness'
import { CheckInCard } from './CheckIn'
import { FeedbackCard } from './PlanFeedback'
import { MobilityCard } from './Mobility'

function garminStatus(score: number): { status: Status; text: string } {
  if (score >= 75) return { status: 'good', text: 'Bereit für Belastung' }
  if (score >= 50) return { status: 'warning', text: 'Moderat trainieren' }
  if (score >= 25) return { status: 'serious', text: 'Eher locker' }
  return { status: 'critical', text: 'Erholung' }
}

export function Today({ data, plan, log, onOpenActivity, onOpenPlan }: { data: Dataset; plan: PlanState; log: DailyLogState; onOpenActivity: (id: number) => void; onOpenPlan: () => void }) {
  const today = localToday()
  const own = useMemo(() => readinessFor(today, data.days, data.activities, log.drinks, log.gym), [today, data, log.drinks, log.gym])
  const day = data.days.at(-1)
  const lastNight = [...data.days].reverse().find((d) => d.sleep_s)
  const hrv = hrvState(day)
  const rhrDelta = restingHrDelta(data.days)
  const week = weeklyTotals(data.activities, 0).at(-1)
  const latest = data.activities[0]
  const readiness = day?.training_readiness

  const sleepParts = lastNight
    ? [
        { label: 'Tief', s: lastNight.deep_sleep_s ?? 0, color: 'var(--series-1)' },
        { label: 'Leicht', s: lastNight.light_sleep_s ?? 0, color: 'var(--series-2)' },
        { label: 'REM', s: lastNight.rem_sleep_s ?? 0, color: 'var(--series-3)' },
        { label: 'Wach', s: lastNight.awake_s ?? 0, color: 'var(--series-4)' },
      ]
    : []
  const sleepTotal = sleepParts.reduce((a, b) => a + b.s, 0)

  const recent = data.days.slice(-14)
  const spark = (k: keyof (typeof recent)[number]) => recent.map((d) => d[k] as number | null)

  return (
    <div className="page-in space-y-3">
      {own && <ReadinessCard r={own} garmin={readiness} />}
      <ProposalCard plan={plan} r={own} today={today} log={log} />
      <PlannedToday plan={plan} onOpenPlan={onOpenPlan} />
      <FeedbackCard plan={plan} today={today} activities={data.activities} />
      <MobilityCard activities={data.activities} today={today} />
      {!own && readiness != null && (
        <Card className="p-5">
          <div className="flex items-center gap-5">
            <Ring value={readiness} size={96} stroke={9} label={`Garmin Readiness ${readiness} von 100`}>
              <span className="text-[28px] leading-none font-bold">{readiness}</span>
            </Ring>
            <div>
              <div className="text-xs font-medium text-ink-3">Training Readiness (Garmin)</div>
              <div className="mt-1 text-lg font-semibold">
                <StatusLabel status={garminStatus(readiness).status}>{garminStatus(readiness).text}</StatusLabel>
              </div>
              <div className="mt-1 text-xs text-ink-3">Deine eigene Readiness erscheint, sobald Schlaf oder HRV von heute da sind.</div>
            </div>
          </div>
        </Card>
      )}

      <Section title="Körper">
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Schlaf"
            value={lastNight ? hoursMin(lastNight.sleep_s) : '–'}
            spark={recent.map((d) => (d.sleep_s != null ? d.sleep_s / 3600 : null))}
            color="var(--series-3)"
            hint={lastNight?.sleep_score != null ? `Score ${lastNight.sleep_score}` : undefined}
          />
          <Stat
            label="HRV"
            value={day?.hrv_last_night ?? '–'}
            unit="ms"
            spark={spark('hrv_last_night')}
            hint={hrv && <StatusLabel status={hrv.status}>{hrv.text}</StatusLabel>}
          />
          <Stat
            label="Ruhepuls"
            value={day?.resting_hr ?? '–'}
            unit="bpm"
            spark={spark('resting_hr')}
            color="var(--series-2)"
            hint={rhrDelta != null && `${rhrDelta > 0 ? '+' : ''}${rhrDelta} ggü. 7-Tage-Schnitt`}
          />
          <Stat
            label="Body Battery"
            value={day?.body_battery_high ?? '–'}
            spark={spark('body_battery_high')}
            color="var(--series-4)"
            hint={day?.body_battery_low != null ? `Tiefstwert ${day.body_battery_low}` : undefined}
          />
        </div>

        {sleepTotal > 0 && (
          <Card title="Schlafphasen" subtitle={lastNight && dateLabel(lastNight.date, { weekday: 'long', day: 'numeric', month: 'long' })} action={<span className="text-[15px] font-semibold">{hoursMin(sleepTotal)}</span>}>
            <div className="flex h-2.5 gap-1">
              {sleepParts.map((p) => (
                <div key={p.label} className="rounded-full" style={{ width: `${(p.s / sleepTotal) * 100}%`, background: p.color }} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
              {sleepParts.map((p) => (
                <div key={p.label}>
                  <div className="flex items-center gap-1.5 text-ink-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                    {p.label}
                  </div>
                  <div className="mt-0.5 font-semibold">{hoursMin(p.s)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </Section>

      <Section title="Eintragen">
        <CheckInCard log={log} plan={plan} today={today} strengthToday={data.activities.some((a) => a.local_date === today && /strength|fitness_equipment/.test(a.sport))} />
      </Section>

      <Section title="Training">
        {week && <WeekCard activities={data.activities} monday={week.week} km={week.km} hours={week.run + week.bike + week.swim + week.other} />}
        <RecordsCard records={data.records ?? []} activities={data.activities} onOpen={onOpenActivity} />
        {latest && (
          <button className="block w-full rounded-[22px] text-left" onClick={() => onOpenActivity(latest.id)}>
            <Card>
              <div className="flex items-center gap-3">
                <SportIcon group={sportGroup(latest.sport)} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-ink-3">Letzte Einheit · {dateLabel(latest.start_time, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="truncate text-[17px] font-semibold">{latest.name ?? sportLabel(latest.sport)}</div>
                </div>
                <span className="text-ink-3" aria-hidden>›</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Mini label="Distanz" value={km(latest.distance_m, sportGroup(latest.sport) === 'swim' ? 2 : 1)} />
                <Mini label="Zeit" value={duration(latest.duration_s)} />
                <Mini label={sportGroup(latest.sport) === 'bike' ? 'Tempo' : 'Pace'} value={speed(latest.avg_speed_mps, latest.sport)} />
              </div>
              {latest.hr_zones_s && (
                <div className="mt-4">
                  <ZoneBar zones={latest.hr_zones_s} />
                </div>
              )}
            </Card>
          </button>
        )}
      </Section>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold">{value}</div>
    </div>
  )
}

function PlannedToday({ plan, onOpenPlan }: { plan: PlanState; onOpenPlan: () => void }) {
  const today = localToday()
  const ws = plan.workouts.filter((w) => w.date === today && w.status !== 'skipped')
  if (!plan.events.some((e) => e.date >= today)) return null
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
    <Card title="Heute geplant">
      {ws.length === 0 ? (
        <button onClick={onOpenPlan} className="press-row -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between rounded-lg px-2 text-left text-sm text-ink-2">
          Ruhetag. Erholung gehört zum Plan.
          <span className="text-accent">Plan ›</span>
        </button>
      ) : (
        <ul className="-my-1">
          {ws.map((w) => (
            <li key={w.id} className="flex items-center">
              <button onClick={onOpenPlan} className="press-row -ml-2 flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-lg pl-2 text-left">
                <span className={`truncate text-[17px] font-semibold ${w.status === 'done' ? 'text-ink-3 line-through' : ''}`}>{w.title}</span>
                <span className="text-xs text-ink-3">
                  {workoutAmount(w)}
                  {plan.events.length > 1 && ` · ${race(w.event_id)}`}
                </span>
                {explain(w) && <span className="mt-0.5 text-xs text-ink-2">{explain(w)!.short}</span>}
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
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
