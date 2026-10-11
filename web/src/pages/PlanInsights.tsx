import { useState } from 'react'
import { Card, StatusLabel } from '../components/ui'
import { anchorText, type Anchor } from '../lib/plan/anchor'
import { fitnessFrom } from '../lib/plan/fitness'
import type { PlanState } from '../lib/plan/usePlan'
import { toast } from '../lib/toast'
import { fitnessSeries, formZone } from '../lib/fitness'
import { dateLabel } from '../lib/format'
import { addDays, daysBetween } from '../lib/plan/dates'
import { fmtDuration, fmtPace, planThreshold, RETUNE_AT } from '../lib/plan/generate'
import { isTri, type PlanWorkout, type RaceEvent } from '../lib/plan/types'
import { prognose, verdict } from '../lib/prognosis'
import { DISTANCES, type Best } from '../lib/records'
import type { Activity, GarminLactate, RacePrediction } from '../lib/types'

/** Zielzeit gegen Prognose aus Bestzeiten und Garmin, plus Form am Renntag laut Plan. */
export function RaceCheck({ event, workouts, activities, records, predictions, lactate, plan, today }: {
  event: RaceEvent
  workouts: PlanWorkout[]
  activities: Activity[]
  records: Best[]
  predictions?: RacePrediction[]
  lactate?: GarminLactate[]
  plan?: PlanState
  today: string
}) {
  if (event.date < today) return null
  const dist = isTri(event.type) ? undefined : DISTANCES.find((d) => d.key === event.type)
  const p = dist && dist.key !== '1k' ? prognose(dist.key, dist.meters, records, activities, predictions, today) : null
  const weeksLeft = Math.floor(daysBetween(today, event.date) / 7)
  const v = p && event.goal_time_s ? verdict(event.goal_time_s, p.time_s, weeksLeft) : null
  const form = event.date <= addDays(today, 182) ? fitnessSeries(activities, workouts, event.date, event.date, today).at(-1) : undefined
  const anchor = isTri(event.type) ? null : fitnessFrom(activities, today, records, lactate).threshold
  const tempo = !isTri(event.type) && (anchor || event.goal_time_s) ? <TempoSource event={event} workouts={workouts} anchor={anchor ?? null} plan={plan} today={today} /> : null
  if (!p && !form && !tempo) return null

  return (
    <Card title="Ziel-Check" subtitle={`Noch ${weeksLeft} ${weeksLeft === 1 ? 'Woche' : 'Wochen'} Training`}>
      {p && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Box label="Dein Ziel" value={event.goal_time_s ? fmtDuration(event.goal_time_s) : '–'} />
            <Box label="Prognose heute" value={fmtDuration(Math.round(p.time_s))} strong />
          </div>
          {event.goal_time_s && <GapBar goal={event.goal_time_s} pred={p.time_s} />}
          {v && (
            <p className="mt-3 text-sm font-medium">
              <StatusLabel status={v.status}>{v.text}</StatusLabel>
            </p>
          )}
          <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
            <li>
              Aus deiner {p.from.label}-Bestzeit {fmtDuration(Math.round(p.from.time_s))}
              {p.from.date ? ` vom ${dateLabel(p.from.date, { day: 'numeric', month: 'short' })}` : ''}
              {p.penaltyPct > 0 ? `, +${p.penaltyPct.toLocaleString('de-DE')} % für Umfang` : ''}.
            </li>
            {p.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
            {p.garmin && <li>Garmin schätzt {fmtDuration(p.garmin)}. Für lange Strecken ist Garmin oft zu optimistisch.</li>}
          </ul>
        </>
      )}
      {tempo && <div className={p ? 'mt-4 border-t border-line pt-3' : ''}>{tempo}</div>}
      {form && (
        <div className={p || tempo ? 'mt-4 border-t border-line pt-3' : ''}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Form am Renntag laut Plan</span>
            <span className="text-[17px] font-semibold">
              {form.form > 0 ? '+' : ''}
              {form.form}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-2">
            <StatusLabel status={form.form >= 5 && form.form <= 25 ? 'good' : 'warning'}>{formZone(form.form).label}</StatusLabel>
            {' · '}
            {form.form >= 5 && form.form <= 25 ? 'Der Taper passt.' : form.form < 5 ? 'Noch etwas müde, ideal sind +5 bis +25.' : 'Sehr ausgeruht, ideal sind +5 bis +25.'}
          </p>
        </div>
      )}
    </Card>
  )
}

function Box({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-1 text-[22px] leading-none font-semibold tracking-tight ${strong ? 'text-accent' : ''}`}>{value}</div>
    </div>
  )
}

/** Ziel und Prognose auf einer Achse: links schneller, rechts langsamer. */
function GapBar({ goal, pred }: { goal: number; pred: number }) {
  const lo = Math.min(goal, pred) * 0.97
  const hi = Math.max(goal, pred) * 1.03
  const x = (t: number) => `${((t - lo) / (hi - lo)) * 100}%`
  const diff = Math.round(pred - goal)
  return (
    <div className="mt-4">
      <div className="relative h-2 rounded-full bg-surface-2">
        <div
          className="absolute top-0 h-2 rounded-full"
          style={{ left: x(Math.min(goal, pred)), width: `calc(${x(Math.max(goal, pred))} - ${x(Math.min(goal, pred))})`, background: diff > 0 ? 'var(--warning)' : 'var(--good)' }}
        />
        <span className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-ink" style={{ left: x(goal) }} title="Ziel" />
        <span className="absolute -top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border-4 border-surface bg-accent" style={{ left: x(pred) }} title="Prognose" />
      </div>
      <div className="mt-2 flex justify-between text-xs text-ink-3">
        <span>schneller</span>
        <span>
          {diff === 0 ? 'genau im Ziel' : `${fmtDuration(Math.abs(diff))} ${diff > 0 ? 'langsamer' : 'schneller'} als dein Ziel`}
        </span>
        <span>langsamer</span>
      </div>
    </div>
  )
}

/** Woher die Tempos kommen; weicht die gemessene Schwelle deutlich vom Plan ab, gibt es „Tempos anpassen“. */
function TempoSource({ event, workouts, anchor, plan, today }: { event: RaceEvent; workouts: PlanWorkout[]; anchor: Anchor | null; plan?: PlanState; today: string }) {
  const [busy, setBusy] = useState(false)
  const inPlan = planThreshold(workouts.filter((w) => w.event_id === event.id), event.type, today)
  if (!anchor) return <p className="text-xs text-ink-2">Tempos aus deiner Zielzeit. Mit Brustgurt-Läufen, Garmins Laktatschwelle oder einer aktuellen Bestzeit richten sie sich nach deiner Form.</p>
  const off = inPlan ? (inPlan - anchor.pace) / anchor.pace : 0
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Deine Schwelle</span>
        <span className="text-[17px] font-semibold">{fmtPace(anchor.pace)}/km</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-2">Tempos aus {anchorText(anchor)}.</p>
      {Math.abs(off) > RETUNE_AT && inPlan && (
        <>
          <p className="mt-2 text-sm">
            <StatusLabel status="warning">
              Der Plan rechnet mit {fmtPace(inPlan)}/km, {off > 0 ? 'langsamer' : 'schneller'} als deine Schwelle.
            </StatusLabel>
          </p>
          {plan && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await plan.replan()
                  toast('Tempos angepasst. Der Plan ist ab morgen neu berechnet.')
                } catch (e) {
                  toast((e as Error).message, 'error')
                } finally {
                  setBusy(false)
                }
              }}
              className="mt-2 min-h-11 w-full rounded-xl btn-primary text-[15px] font-semibold disabled:opacity-60"
            >
              {busy ? 'Wird angepasst …' : 'Tempos anpassen'}
            </button>
          )}
        </>
      )}
    </>
  )
}
