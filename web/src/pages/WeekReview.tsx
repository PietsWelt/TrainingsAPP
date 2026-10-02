import { useMemo, useState, type ReactNode } from 'react'
import { Sheet } from '../components/Sheet'
import { Card, Pill, StatusLabel } from '../components/ui'
import type { GymFocus } from '../lib/dailyLog'
import { dateLabel, weekStart } from '../lib/format'
import { tap } from '../lib/haptics'
import { addDays, localToday, WEEKDAY_SHORT, weekday } from '../lib/plan/dates'
import type { PlanState } from '../lib/plan/usePlan'
import type { DailyLogState } from '../lib/useDailyLog'
import type { Dataset } from '../lib/types'
import { reviewMonday, weekReview, type WeekReview } from '../lib/weekReview'

const GYM_LABEL: Record<GymFocus, string> = { legs: 'Beine', upper: 'Oberkörper', full: 'Ganzkörper', core: 'Core' }
const de = (x: number, digits = 1) => x.toLocaleString('de-DE', { maximumFractionDigits: digits })
const range = (r: WeekReview) => `${dateLabel(r.monday)} – ${dateLabel(r.sunday)}`

function useReview(monday: string, data: Dataset, plan: PlanState, log: Pick<DailyLogState, 'drinks' | 'gym'>) {
  const today = localToday()
  return useMemo(
    () => weekReview(monday, today, data.activities, data.days, plan.workouts, plan.events, log.drinks, log.gym, data.records),
    [monday, today, data, plan.workouts, plan.events, log.drinks, log.gym],
  )
}

/** Karte auf „Heute“ am Sonntagnachmittag und Montag. */
export function WeekReviewCard({ data, plan, log }: { data: Dataset; plan: PlanState; log: DailyLogState }) {
  const [hour] = useState(() => new Date().getHours())
  const monday = reviewMonday(localToday(), hour)
  if (!monday) return null
  return <ReviewTeaser monday={monday} data={data} plan={plan} log={log} />
}

function ReviewTeaser({ monday, data, plan, log }: { monday: string; data: Dataset; plan: PlanState; log: DailyLogState }) {
  const [open, setOpen] = useState(false)
  const r = useReview(monday, data, plan, log)
  const top = r.tips[0]
  return (
    <>
      <button className="block w-full rounded-[22px] text-left" onClick={() => (tap(), setOpen(true))}>
        <Card title="Wochenrückblick" subtitle={range(r)} action={<span className="text-sm font-medium text-accent">Ansehen ›</span>}>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Laufen" value={`${de(r.runKm)} km`} />
            <Mini label="Zeit" value={`${de(r.hours)} h`} />
            <Mini label="Plan" value={r.plan ? `${r.plan.done}/${r.plan.planned}` : '–'} />
          </div>
          {top && (
            <p className="mt-3 text-sm">
              <StatusLabel status={top.status}>{top.title}</StatusLabel>
            </p>
          )}
        </Card>
      </button>
      {open && <WeekReviewSheet initial={monday} data={data} plan={plan} log={log} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Knopf in Trends: jede Woche ansehen. */
export function WeekReviewButton({ data, plan, log }: { data: Dataset; plan: PlanState; log: Pick<DailyLogState, 'drinks' | 'gym'> }) {
  const [open, setOpen] = useState(false)
  const today = localToday()
  const monday = weekday(today) === 6 ? weekStart(today) : addDays(weekStart(today), -7)
  return (
    <>
      <button onClick={() => (tap(), setOpen(true))} className="card flex min-h-14 w-full items-center justify-between rounded-[22px] px-4 text-left">
        <span>
          <span className="block text-[15px] font-semibold">Wochenrückblick</span>
          <span className="block text-xs text-ink-3">Training, Erholung und Fokus für die nächste Woche</span>
        </span>
        <span className="text-ink-3" aria-hidden>›</span>
      </button>
      {open && <WeekReviewSheet initial={monday} data={data} plan={plan} log={log} onClose={() => setOpen(false)} />}
    </>
  )
}

export function WeekReviewSheet({ initial, data, plan, log, onClose }: { initial: string; data: Dataset; plan: PlanState; log: Pick<DailyLogState, 'drinks' | 'gym'>; onClose: () => void }) {
  const [monday, setMonday] = useState(initial)
  const r = useReview(monday, data, plan, log)
  const thisWeek = weekStart(localToday())
  const oldest = weekStart(data.days[0]?.date ?? data.activities.at(-1)?.local_date ?? thisWeek)
  const go = (d: number) => {
    tap()
    setMonday((m) => addDays(m, d * 7))
  }
  const loadDelta = r.loadBefore ? Math.round((r.load / r.loadBefore - 1) * 100) : null

  return (
    <Sheet title="Wochenrückblick" onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => go(-1)} disabled={monday <= oldest} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-lg disabled:opacity-30" aria-label="Woche davor">‹</button>
        <div className="text-center">
          <div className="text-[17px] font-semibold">{range(r)}</div>
          {!r.complete && <Pill>Zwischenstand</Pill>}
        </div>
        <button onClick={() => go(1)} disabled={monday >= thisWeek} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-lg disabled:opacity-30" aria-label="Woche danach">›</button>
      </div>

      <div key={monday} className="page-in space-y-3">
        <Card title="Das Wichtigste">
          <ul className="space-y-3">
            {r.tips.map((t) => (
              <li key={t.title}>
                <div className="text-[15px] font-semibold">
                  <StatusLabel status={t.status}>{t.title}</StatusLabel>
                </div>
                <p className="mt-0.5 text-sm text-ink-2">{t.text}</p>
                {t.source && <p className="mt-0.5 text-xs text-ink-3">Quelle: {t.source}</p>}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Training">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Mini label="Laufen" value={`${de(r.runKm)} km`} hint={`${r.runs} ${r.runs === 1 ? 'Lauf' : 'Läufe'}`} />
            <Mini label="Gesamtzeit" value={`${de(r.hours)} h`} hint={`${r.sessions} Einheiten`} />
            <Mini
              label="Trainingslast"
              value={String(r.load)}
              hint={loadDelta != null ? `${loadDelta > 0 ? '+' : ''}${loadDelta} % ggü. Ø 4 Wochen` : undefined}
            />
            {r.easyShare != null && <Mini label="Locker gelaufen" value={`${Math.round(r.easyShare * 100)} %`} hint="Ziel etwa 80 %" />}
          </div>
          {r.easyShare != null && <Bar parts={[{ v: r.easyShare, color: 'var(--zone-2)' }, { v: 1 - r.easyShare, color: 'var(--zone-5)' }]} />}
        </Card>

        {r.plan && (
          <Card title="Plan" subtitle={`${r.plan.done} von ${r.plan.planned} Einheiten erledigt`}>
            <Bar
              parts={[
                { v: r.plan.done / r.plan.planned, color: 'var(--good)' },
                { v: r.plan.open / r.plan.planned, color: 'var(--surface-2)' },
                { v: r.plan.skipped / r.plan.planned, color: 'var(--zone-4)' },
              ]}
            />
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <Mini label="Schlüsseleinheiten" value={`${r.plan.keyDone}/${r.plan.key}`} />
              <Mini label="Kilometer" value={`${de(r.runKm)} km`} hint={r.plan.plannedKm ? `geplant ${de(r.plan.plannedKm)} km` : undefined} />
              {r.plan.skipped > 0 && <Mini label="Ausgelassen" value={String(r.plan.skipped)} />}
              {r.plan.replaced > 0 && <Mini label="Durch anderen Sport ersetzt" value={String(r.plan.replaced)} />}
              {r.plan.open > 0 && <Mini label="Noch offen" value={String(r.plan.open)} />}
            </div>
          </Card>
        )}

        <Card title="Erholung" subtitle="Schnitt der Woche, daneben die 4 Wochen davor">
          <div className="grid grid-cols-3 gap-2">
            <Compare label="Schlaf" value={r.sleepH} before={r.sleepBefore} unit="h" higherIsBetter digits={1} min={0.3} />
            <Compare label="HRV" value={r.hrv} before={r.hrvBefore} unit="ms" higherIsBetter min={3} />
            <Compare label="Ruhepuls" value={r.rhr} before={r.rhrBefore} unit="bpm" min={2} />
          </div>
        </Card>

        {(r.drinks > 0 || r.gym.length > 0 || r.hotRuns > 0 || r.hillyRuns > 0) && (
          <Card title="Drumherum">
            <ul className="space-y-1.5 text-sm text-ink-2">
              {r.drinks > 0 && <li>Alkohol: {r.drinks} Getränke an {r.drinkDays} {r.drinkDays === 1 ? 'Tag' : 'Tagen'}</li>}
              {r.gym.length > 0 && <li>Gym: {r.gym.map((g) => `${GYM_LABEL[g.focus]}${g.hard ? ' (hart)' : ''}`).join(', ')}</li>}
              {r.hotRuns > 0 && <li>{r.hotRuns} {r.hotRuns === 1 ? 'Lauf' : 'Läufe'} in der Wärme: höherer Puls ist dort normal.</li>}
              {r.hillyRuns > 0 && <li>{r.hillyRuns} hügelige {r.hillyRuns === 1 ? 'Strecke' : 'Strecken'}: Die Pace ist flach gerechnet schneller.</li>}
            </ul>
          </Card>
        )}

        {r.highlights.length > 0 && (
          <Card title="Highlights">
            <ul className="space-y-1.5 text-sm">
              {r.highlights.map((h) => (
                <li key={h}>★ {h}</li>
              ))}
            </ul>
          </Card>
        )}

        {r.next && (
          <Card title="Nächste Woche" subtitle={r.next.sessions ? `${r.next.sessions} Einheiten${r.next.km ? ` · ${de(r.next.km)} km Laufen` : ''}` : undefined}>
            {r.next.focus && <p className="text-sm text-ink-2">{r.next.focus}</p>}
            {r.next.key.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {r.next.key.map((k) => (
                  <li key={k.date + k.title} className="flex gap-2">
                    <span className="w-6 shrink-0 font-semibold text-ink-3">{WEEKDAY_SHORT[weekday(k.date)]}</span>
                    <span>{k.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <p className="px-1 pb-2 text-xs text-ink-3">Regelbasiert aus deinen Garmin-Daten, deinem Plan und deinen Einträgen.</p>
      </div>
    </Sheet>
  )
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 text-[17px] font-semibold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  )
}

function Bar({ parts }: { parts: { v: number; color: string }[] }) {
  return (
    <div className="mt-3 flex h-2.5 gap-1 overflow-hidden rounded-full">
      {parts.filter((p) => p.v > 0).map((p, i) => (
        <div key={i} className="rounded-full transition-[width] duration-500" style={{ width: `${p.v * 100}%`, background: p.color }} />
      ))}
    </div>
  )
}

function Compare({ label, value, before, unit, higherIsBetter = false, digits = 0, min = 1 }: { label: string; value: number | null; before: number | null; unit: string; higherIsBetter?: boolean; digits?: number; min?: number }) {
  const diff = value != null && before != null ? value - before : null
  const better = diff != null && Math.abs(diff) >= min ? (diff > 0) === higherIsBetter : null
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 text-[17px] font-semibold tracking-tight">
        {value != null ? de(value, digits) : '–'} <span className="text-xs font-normal text-ink-3">{unit}</span>
      </div>
      {before != null && (
        <div className="text-xs" style={{ color: better == null ? 'var(--text-3)' : better ? 'var(--good)' : 'var(--serious)' }}>
          {better == null ? '≈' : diff! > 0 ? '▲' : '▼'} vorher {de(before, digits)}
        </div>
      )}
    </div>
  )
}
