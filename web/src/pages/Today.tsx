import { Card, Section, SportIcon, Stat, StatusLabel } from '../components/ui'
import { RecordsCard, WeekCard } from './TodayTraining'
import { ZoneBar } from '../components/ZoneBar'
import { hrvState, restingHrDelta, weeklyTotals } from '../lib/derive'
import { dateLabel, duration, hoursMin, km, speed, sportGroup, sportLabel } from '../lib/format'
import type { Dataset } from '../lib/types'
import { localToday } from '../lib/plan/dates'
import type { PlanState } from '../lib/plan/usePlan'
import { useMemo } from 'react'
import { readinessFor } from '../lib/readiness'
import type { DailyLogState } from '../lib/useDailyLog'
import { CheckInCard } from './CheckIn'
import { GymCard } from './Strength'
import { TodayHero } from './TodayHero'
import { TodayTasks } from './TodayTasks'

export function Today({ data, plan, log, onOpenActivity, onOpenPlan }: { data: Dataset; plan: PlanState; log: DailyLogState; onOpenActivity: (id: number) => void; onOpenPlan: () => void }) {
  const today = localToday()
  const own = useMemo(() => readinessFor(today, data.days, data.activities, log.drinks, log.gym), [today, data, log.drinks, log.gym])
  const day = data.days.at(-1)
  const lastNight = [...data.days].reverse().find((d) => d.sleep_s)
  const hrv = hrvState(day)
  const rhrDelta = restingHrDelta(data.days)
  const week = weeklyTotals(data.activities, 0).at(-1)
  const latest = data.activities[0]
  const strengthToday = data.activities.some((a) => a.local_date === today && /strength|fitness_equipment/.test(a.sport))

  const sleepParts = lastNight
    ? [
        { label: 'Tief', s: lastNight.deep_sleep_s ?? 0, color: 'var(--c-schlaf)' },
        { label: 'Leicht', s: lastNight.light_sleep_s ?? 0, color: 'color-mix(in oklab, var(--c-schlaf) 45%, var(--surface-solid))' },
        { label: 'REM', s: lastNight.rem_sleep_s ?? 0, color: 'color-mix(in oklab, var(--c-schlaf) 72%, var(--surface-solid))' },
        { label: 'Wach', s: lastNight.awake_s ?? 0, color: 'var(--band)' },
      ]
    : []
  const sleepTotal = sleepParts.reduce((a, b) => a + b.s, 0)

  const recent = data.days.slice(-14)
  const spark = (k: keyof (typeof recent)[number]) => recent.map((d) => d[k] as number | null)

  return (
    <div className="page-in desk-cols space-y-3">
      <TodayHero data={data} plan={plan} log={log} own={own} today={today} strengthToday={strengthToday} onOpenPlan={onOpenPlan} className="span-all" />
      <TodayTasks data={data} plan={plan} log={log} own={own} today={today} strengthToday={strengthToday} />

      <Section title="Körper" action={<CheckInCard log={log} plan={plan} today={today} strengthToday={strengthToday} variant="link" />}>
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Schlaf"
            value={lastNight ? hoursMin(lastNight.sleep_s) : '–'}
            spark={recent.map((d) => (d.sleep_s != null ? d.sleep_s / 3600 : null))}
            color="var(--c-schlaf)"
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
            color="var(--c-erh)"
            hint={rhrDelta != null && `${rhrDelta > 0 ? '+' : ''}${rhrDelta} ggü. 7-Tage-Schnitt`}
          />
          <Stat
            label="Body Battery"
            value={day?.body_battery_high ?? '–'}
            spark={spark('body_battery_high')}
            color="var(--c-erh)"
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

      <Section title="Training">
        <GymCard workouts={plan.workouts} log={log} today={today} />
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
