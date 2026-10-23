import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { Card, Pill, SportIcon } from '../components/ui'
import { dateLabel } from '../lib/format'
import { tap } from '../lib/haptics'
import { toast } from '../lib/toast'
import { WEEKDAY_LONG, WEEKDAY_SHORT, weekday } from '../lib/plan/dates'
import { workoutAmount } from '../lib/plan/labels'
import { swapDays } from '../lib/plan/swap'
import type { PlanState } from '../lib/plan/usePlan'
import type { PlanWorkout } from '../lib/plan/types'

/** Knopf für das Einheit-Blatt und „Heute geplant“: nur, wenn es in der Woche einen Tag dafür gibt. */
export function canSwap(plan: PlanState, w: PlanWorkout, today: string): boolean {
  return swapDays(plan.workouts, w, today).some((d) => !d.blocked)
}

export function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
    </svg>
  )
}

/**
 * Tag wählen, dann bestätigen. Liegt dort schon eine Einheit, wird getauscht: Sie rutscht auf
 * den bisherigen Tag. Die Vorschau zeigt vor dem Tippen auf „Tauschen“, wie die Woche danach aussieht.
 */
export function SwapSheet({ plan, workout: w, today, onClose }: { plan: PlanState; workout: PlanWorkout; today: string; onClose: () => void }) {
  const days = swapDays(plan.workouts, w, today)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const day = days.find((d) => d.date === picked)
  const from = WEEKDAY_LONG[weekday(w.date)]

  async function confirm() {
    if (!day) return
    setBusy(true)
    tap()
    try {
      toast(await plan.swap(w, day.date))
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Tag tauschen"
      onClose={onClose}
      footer={
        <button disabled={!day || busy} onClick={confirm} className="min-h-12 w-full rounded-xl btn-primary text-[15px] font-semibold disabled:opacity-50">
          {!day ? 'Tag wählen' : day.others.length ? `Mit ${WEEKDAY_LONG[weekday(day.date)]} tauschen` : `Auf ${WEEKDAY_LONG[weekday(day.date)]} legen`}
        </button>
      }
    >
      <div className="flex items-center gap-3">
        <SportIcon group={w.sport} size={40} />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{w.title}</div>
          <div className="text-xs text-ink-3">
            {from} · {workoutAmount(w)}
          </div>
        </div>
      </div>
      <p className="text-sm text-ink-2">An welchem Tag willst du die Einheit machen? Was dort geplant ist, rutscht auf {from}.</p>

      <Card className="p-2">
        <ul role="radiogroup" aria-label="Tag wählen" className="divide-y divide-line">
          {days.map((d) => {
            const on = d.date === picked
            return (
              <li key={d.date}>
                <button
                  role="radio"
                  aria-checked={on}
                  disabled={!!d.blocked}
                  onClick={() => setPicked(d.date)}
                  className={`press-row flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left disabled:opacity-50 ${on ? 'bg-surface-2' : ''}`}
                >
                  <span className="w-9 shrink-0 text-xs text-ink-3">
                    {WEEKDAY_SHORT[weekday(d.date)]}
                    <br />
                    {Number(d.date.slice(8))}.
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{d.others.length ? d.others.map((x) => x.title).join(' + ') : 'Frei'}</span>
                      {d.date === today && <Pill>Heute</Pill>}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {d.blocked ?? (d.others.length ? `${d.others.map(workoutAmount).join(' + ')} · rutscht auf ${from}` : 'Ruhetag, nichts rutscht nach')}
                    </span>
                    {d.warning && (
                      <span className="mt-0.5 block text-xs" style={{ color: 'var(--warning)' }}>
                        ▲ {d.warning}
                      </span>
                    )}
                  </span>
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
                    style={on ? { borderColor: 'var(--accent)' } : { borderColor: 'var(--border)' }}
                    aria-hidden
                  >
                    {on && <span className="h-3 w-3 rounded-full" style={{ background: 'var(--accent)' }} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      {day && (
        <Card title="So sieht es danach aus">
          <ul className="space-y-1.5 text-sm">
            <Preview date={day.date} titles={[w.title]} />
            <Preview date={w.date} titles={day.others.map((x) => x.title)} />
          </ul>
        </Card>
      )}

      <p className="text-xs text-ink-3">
        Nur innerhalb dieser Woche, damit Umfang und Steigerung stimmen. Die Uhr bekommt die Einheiten nach dem nächsten Sync am neuen Tag, und dein Lauf wird
        automatisch der richtigen Einheit zugeordnet.
      </p>
    </Sheet>
  )
}

function Preview({ date, titles }: { date: string; titles: string[] }) {
  return (
    <li className="flex gap-2">
      <span className="w-24 shrink-0 text-ink-3">{dateLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      <span className={titles.length ? 'font-medium' : 'text-ink-3'}>{titles.length ? titles.join(' + ') : 'Ruhetag'}</span>
    </li>
  )
}
