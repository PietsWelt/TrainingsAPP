import { useState } from 'react'
import { Card, StatusLabel } from '../components/ui'
import { tap } from '../lib/haptics'
import { readinessProposal } from '../lib/plan/adapt'
import { addDays } from '../lib/plan/dates'
import type { PlanState } from '../lib/plan/usePlan'
import type { Readiness } from '../lib/readiness'
import { toast } from '../lib/toast'
import type { DailyLogState } from '../lib/useDailyLog'

export function ReadinessCard({ r, garmin }: { r: Readiness; garmin: number | null | undefined }) {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="press-row -m-2 flex w-[calc(100%+1rem)] items-center gap-4 rounded-xl p-2 text-left">
        <Ring value={r.score} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-ink-2">Deine Readiness</div>
          <div className="mt-1 text-lg font-semibold">
            <StatusLabel status={r.status}>{r.headline}</StatusLabel>
          </div>
          <div className="mt-1 text-xs text-ink-2">{r.advice}</div>
        </div>
        <span className={`text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
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

function Ring({ value }: { value: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0" role="img" aria-label={`Readiness ${value} von 100`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
      <circle cx="38" cy="38" r={r} fill="none" stroke={barColor(value)} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 38 38)" />
      <text x="38" y="44" textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--text)">
        {value}
      </text>
    </svg>
  )
}

const DISMISS_KEY = 'readiness.dismissed'

export function ProposalCard({ plan, r, today }: { plan: PlanState; r: Readiness | null; today: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === today
    } catch {
      return false
    }
  })
  const [busy, setBusy] = useState(false)
  const p = readinessProposal(plan.workouts, today, r)
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
