import { Card, Stat, StatusLabel, type Status } from '../components/ui'
import { ZoneBar } from '../components/charts'
import { hrvState, restingHrDelta, weeklyTotals } from '../lib/derive'
import { dateLabel, duration, hoursMin, km, speed, sportGroup, sportLabel } from '../lib/format'
import type { Dataset } from '../lib/types'
import { localToday } from '../lib/plan/dates'
import type { PlanState } from '../lib/plan/usePlan'
import { workoutAmount } from '../lib/plan/labels'

function readinessStatus(score: number): { status: Status; text: string } {
  if (score >= 75) return { status: 'good', text: 'Bereit für Belastung' }
  if (score >= 50) return { status: 'warning', text: 'Moderat trainieren' }
  if (score >= 25) return { status: 'serious', text: 'Eher locker' }
  return { status: 'critical', text: 'Erholung' }
}

export function Today({ data, plan, onOpenActivity, onOpenPlan }: { data: Dataset; plan: PlanState; onOpenActivity: (id: number) => void; onOpenPlan: () => void }) {
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

  return (
    <div className="space-y-3">
      <PlannedToday plan={plan} onOpenPlan={onOpenPlan} />
      {readiness != null && (
        <Card>
          <div className="flex items-center gap-4">
            <ReadinessRing value={readiness} />
            <div>
              <div className="text-xs font-medium text-ink-2">Training Readiness (Garmin)</div>
              <div className="mt-1 text-lg font-semibold">
                <StatusLabel status={readinessStatus(readiness).status}>{readinessStatus(readiness).text}</StatusLabel>
              </div>
              <div className="mt-1 text-xs text-ink-3">Eigener Readiness-Score folgt in Etappe 3</div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Schlaf"
          value={lastNight ? hoursMin(lastNight.sleep_s) : '–'}
          hint={lastNight?.sleep_score != null ? `Score ${lastNight.sleep_score}` : undefined}
        />
        <Stat
          label="HRV letzte Nacht"
          value={day?.hrv_last_night ?? '–'}
          unit="ms"
          hint={hrv && <StatusLabel status={hrv.status}>{hrv.text}</StatusLabel>}
        />
        <Stat
          label="Ruhepuls"
          value={day?.resting_hr ?? '–'}
          unit="bpm"
          hint={rhrDelta != null && `${rhrDelta > 0 ? '+' : ''}${rhrDelta} ggü. 7-Tage-Schnitt`}
        />
        <Stat
          label="Body Battery"
          value={day?.body_battery_high ?? '–'}
          hint={day?.body_battery_low != null ? `Tiefstwert ${day.body_battery_low}` : undefined}
        />
      </div>

      {sleepTotal > 0 && (
        <Card title="Schlafphasen" subtitle={lastNight && dateLabel(lastNight.date, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {sleepParts.map((p) => (
              <div key={p.label} style={{ width: `${(p.s / sleepTotal) * 100}%`, background: p.color }} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
            {sleepParts.map((p) => (
              <div key={p.label}>
                <div className="flex items-center gap-1.5 text-ink-2">
                  <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                  {p.label}
                </div>
                <div className="mt-0.5 font-medium">{hoursMin(p.s)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {week && (
        <Card title="Diese Woche">
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Laufen" value={`${week.km.toLocaleString('de-DE')} km`} />
            <Mini label="Trainingszeit" value={hoursMin((week.run + week.bike + week.swim + week.other) * 3600)} />
            <Mini label="Einheiten" value={String(data.activities.filter((a) => a.local_date >= week.week).length)} />
          </div>
        </Card>
      )}

      {latest && (
        <button className="block w-full text-left" onClick={() => onOpenActivity(latest.id)}>
          <Card title="Letzte Einheit" subtitle={`${sportLabel(latest.sport)} · ${dateLabel(latest.start_time, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}>
            <div className="mb-3 text-lg font-semibold">{latest.name}</div>
            <div className="grid grid-cols-3 gap-2">
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

function ReadinessRing({ value }: { value: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0" role="img" aria-label={`Readiness ${value} von 100`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="44" textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--text)">
        {value}
      </text>
    </svg>
  )
}

function PlannedToday({ plan, onOpenPlan }: { plan: PlanState; onOpenPlan: () => void }) {
  const today = localToday()
  const ws = plan.workouts.filter((w) => w.date === today && w.status !== 'skipped')
  if (!plan.events.some((e) => e.date >= today)) return null
  const race = (id: string) => plan.events.find((e) => e.id === id)?.name
  return (
    <button onClick={onOpenPlan} className="block w-full text-left">
      <Card title="Heute geplant">
        {ws.length === 0 ? (
          <p className="text-sm text-ink-2">Ruhetag. Erholung gehört zum Plan.</p>
        ) : (
          <ul className="space-y-2">
            {ws.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`truncate text-[15px] font-semibold ${w.status === 'done' ? 'text-ink-3' : ''}`}>{w.title}</div>
                  <div className="text-xs text-ink-3">
                    {workoutAmount(w)}
                    {plan.events.length > 1 && ` · ${race(w.event_id)}`}
                  </div>
                </div>
                {w.status === 'done' ? (
                  <span className="text-xs font-medium" style={{ color: 'var(--good)' }}>✓ Erledigt</span>
                ) : (
                  <span className="text-accent">›</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </button>
  )
}
