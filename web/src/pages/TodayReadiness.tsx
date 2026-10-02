import { useState } from 'react'
import { Card, Pill, Ring, StatusLabel } from '../components/ui'
import { tap } from '../lib/haptics'
import { legsProposal, readinessProposal } from '../lib/plan/adapt'
import { addDays } from '../lib/plan/dates'
import type { PlanState } from '../lib/plan/usePlan'
import { legFatigue, type Readiness } from '../lib/readiness'
import type { GymFocus } from '../lib/dailyLog'
import { WEEKDAY_LONG, weekday } from '../lib/plan/dates'
import { toast } from '../lib/toast'
import type { DailyLogState } from '../lib/useDailyLog'

export function ReadinessCard({ r, garmin }: { r: Readiness; garmin: number | null | undefined }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-5">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="press-row -m-2 flex w-[calc(100%+1rem)] items-center gap-5 rounded-2xl p-2 text-left">
        <Ring value={r.score} size={108} stroke={10} color={barColor(r.score)} label={`Readiness ${r.score} von 100`}>
          <span className="text-[34px] leading-none font-bold tracking-tight">{r.score}</span>
          <span className="mt-0.5 text-[11px] text-ink-3">von 100</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-ink-3">Deine Readiness</div>
          <div className="mt-1 text-[19px] leading-snug font-semibold tracking-tight">
            <StatusLabel status={r.status}>{r.headline}</StatusLabel>
          </div>
          <div className="mt-1 text-[13px] leading-snug text-ink-2">{r.advice}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {garmin != null && <Pill color="var(--text-2)">Garmin {garmin}</Pill>}
            <Pill>{open ? 'Weniger' : 'Details'}</Pill>
          </div>
        </div>
      </button>
      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          {r.components.map((c) => (
            <div key={c.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-ink-3">{Math.round(c.weight * 100)} % Gewicht</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: barColor(c.score) }} />
                </div>
                <span className="w-7 text-right text-xs font-semibold">{Math.round(c.score)}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-3">{c.detail}</div>
            </div>
          ))}
          {garmin != null && <p className="text-xs text-ink-3">Zum Vergleich: Garmin Training Readiness {garmin}</p>}
          {!r.components.some((c) => c.key === 'alcohol') && <p className="text-xs text-ink-3">Trag unten Alkohol ein, dann fließt er mit ein.</p>}
        </div>
      )}
    </Card>
  )
}

const barColor = (s: number) => (s >= 70 ? 'var(--good)' : s >= 50 ? 'var(--warning)' : s >= 35 ? 'var(--serious)' : 'var(--critical)')

const DISMISS_KEY = 'readiness.dismissed'

export function ProposalCard({ plan, r, today, log }: { plan: PlanState; r: Readiness | null; today: string; log: DailyLogState }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === today
    } catch {
      return false
    }
  })
  const [busy, setBusy] = useState(false)
  const p = readinessProposal(plan.workouts, today, r) ?? legsProposal(plan.workouts, today, legFatigue(today, log.gym))
  if (!p || dismissed) return null

  async function choose(changed: Parameters<PlanState['applyChanges']>[0], message: string) {
    setBusy(true)
    tap()
    try {
      await plan.applyChanges(changed)
      toast(message)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Plan anpassen?" subtitle={`Heute geplant: ${p.workout.title}`}>
      <p className="text-sm text-ink-2">{p.reason}</p>
      <div className="mt-3 grid gap-2">
        {p.options.map((o, i) => (
          <button
            key={o.id}
            disabled={busy}
            onClick={() => choose(o.changed, o.message)}
            className={`min-h-11 rounded-xl text-[15px] font-semibold disabled:opacity-60 ${i === 0 ? 'bg-accent text-white' : 'bg-surface-2 text-ink'}`}
          >
            {o.label}
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, today)
            } catch {
              // egal, dann nur bis zum Neuladen
            }
            setDismissed(true)
          }}
          className="min-h-11 rounded-xl text-[15px] font-medium text-ink-2"
        >
          Wie geplant trainieren
        </button>
      </div>
    </Card>
  )
}

const CHOICES = [0, 1, 2, 3, 4, 5]

export function AlcoholCard({ log, today }: { log: DailyLogState; today: string }) {
  const rows = [
    { date: addDays(today, -1), label: 'Gestern Abend', hint: 'zählt für heute' },
    { date: today, label: 'Heute Abend', hint: 'zählt für morgen' },
  ]
  async function set(date: string, n: number) {
    tap()
    try {
      await log.setDrinks(date, log.drinks[date] === n ? null : n)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  return (
    <Card title="Alkohol" subtitle="Getränke pro Abend, z. B. ein Bier, ein Glas Wein">
      {log.error && (
        <p className="mb-2 text-xs" style={{ color: 'var(--critical)' }}>
          {log.error}
        </p>
      )}
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.date}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-medium">{row.label}</span>
              <span className="text-xs text-ink-3">{row.hint}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label={row.label}>
              {CHOICES.map((n) => {
                const on = log.drinks[row.date] === n || (n === 5 && (log.drinks[row.date] ?? 0) > 5)
                return (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={on}
                    onClick={() => set(row.date, n)}
                    className={`min-h-11 rounded-xl text-[15px] font-semibold ${on ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2'}`}
                  >
                    {n === 5 ? '5+' : n}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

const FOCUS: { id: GymFocus; label: string }[] = [
  { id: 'legs', label: 'Beine' },
  { id: 'upper', label: 'Oberkörper' },
  { id: 'full', label: 'Ganzkörper' },
  { id: 'core', label: 'Core' },
]

/** Krafttraining heute oder gestern: Schwerpunkt und ob es hart war. */
export function GymCard({ log, plan, today, strengthToday }: { log: DailyLogState; plan: PlanState; today: string; strengthToday: boolean }) {
  const rows = [
    { date: today, label: 'Heute' },
    { date: addDays(today, -1), label: 'Gestern' },
  ]
  async function set(date: string, focus: GymFocus | null, hard?: boolean) {
    tap()
    const cur = log.gym[date]
    try {
      if (focus == null || (cur?.focus === focus && hard === undefined)) await log.setGym(date, null)
      else await log.setGym(date, { focus, hard: hard ?? cur?.hard ?? true })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  // Nächste harte Einheit ab morgen, für den Tipp zur Platzierung von Beintraining.
  const nextKey = plan.workouts.find((w) => w.date > today && w.key_session && w.status === 'planned' && w.sport !== 'race')
  const legsToday = log.gym[today] && (log.gym[today].focus === 'legs' || log.gym[today].focus === 'full')
  return (
    <Card title="Krafttraining" subtitle="Beine wirken sich auf die nächsten Läufe aus, Oberkörper kaum">
      {strengthToday && !log.gym[today] && <p className="mb-2 text-xs text-accent">Garmin hat heute Krafttraining erkannt. Was hast du trainiert?</p>}
      <div className="space-y-3">
        {rows.map((row) => {
          const cur = log.gym[row.date]
          return (
            <div key={row.date}>
              <div className="mb-1.5 text-sm font-medium">{row.label}</div>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={`Krafttraining ${row.label}`}>
                {FOCUS.map((f) => {
                  const on = cur?.focus === f.id
                  return (
                    <button
                      key={f.id}
                      role="radio"
                      aria-checked={on}
                      onClick={() => set(row.date, f.id)}
                      className={`min-h-11 rounded-xl px-1 text-sm font-semibold ${on ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2'}`}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
              {cur && (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={`Intensität ${row.label}`}>
                  {[false, true].map((hard) => (
                    <button
                      key={String(hard)}
                      role="radio"
                      aria-checked={cur.hard === hard}
                      onClick={() => set(row.date, cur.focus, hard)}
                      className={`min-h-10 rounded-xl text-sm font-medium ${cur.hard === hard ? 'bg-ink text-surface' : 'bg-surface-2 text-ink-2'}`}
                    >
                      {hard ? 'Hart' : 'Locker'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {legsToday && nextKey && (
        <p className="mt-3 text-xs text-ink-2">
          {nextKey.date === addDays(today, 1)
            ? `Morgen steht ${nextKey.title} an. Mit müden Beinen schlägt dir die App morgen locker oder verschieben vor.`
            : `Nächste harte Einheit: ${nextKey.title} am ${WEEKDAY_LONG[weekday(nextKey.date)]}. Genug Abstand für die Beine.`}
        </p>
      )}
      {!legsToday && nextKey && (
        <p className="mt-3 text-xs text-ink-3">Tipp: Beine am besten am Tag einer harten Laufeinheit, ein paar Stunden danach. Oder mit 2 Tagen Abstand zur nächsten.</p>
      )}
    </Card>
  )
}
