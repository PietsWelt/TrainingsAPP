import { useMemo, useState, type ReactNode } from 'react'
import { Sheet } from '../components/Sheet'
import { Card, Legend, Pill, StatusLabel, TaskRow, type CardVariant } from '../components/ui'
import type { GymFocus } from '../lib/dailyLog'
import { dateLabel, duration, GROUP_LABEL, weekStart, type SportGroup } from '../lib/format'
import { tap } from '../lib/haptics'
import { addDays, localToday, WEEKDAY_SHORT, weekday } from '../lib/plan/dates'
import type { PlanState } from '../lib/plan/usePlan'
import type { DailyLogState } from '../lib/useDailyLog'
import type { Dataset } from '../lib/types'
import { reviewMonday, weekReview, type WeekReview } from '../lib/weekReview'

const GYM_LABEL: Record<GymFocus, string> = { legs: 'Beine', upper: 'Oberkörper', full: 'Ganzkörper', core: 'Core' }
const de = (x: number, digits = 1) => x.toLocaleString('de-DE', { maximumFractionDigits: digits })
const SPORT_COLOR: Record<SportGroup, string> = { run: 'var(--series-1)', bike: 'var(--series-2)', swim: 'var(--series-3)', other: 'var(--series-4)' }
const runsLabel = (n: number) => `${n} ${n === 1 ? 'Lauf' : 'Läufe'}`

/** So entsteht die Zahl „Trainingslast“, Schritt für Schritt und mit Quellen. */
const LOAD_EXPLAIN = [
  {
    t: '1. Jede Einheit bekommt einen Lastwert',
    d: 'Die Uhr schätzt aus deinem Pulsverlauf, wie stark der Körper nach der Einheit nachatmen muss (EPOC, zusätzlicher Sauerstoffverbrauch nach Belastung). Dieser Wert wächst mit Dauer und noch stärker mit Intensität: 60 Minuten locker ergeben deutlich weniger als 60 Minuten mit Intervallen.',
    s: 'Firstbeat Technologies, White Paper EPOC (2012); Borresen & Lambert 2009 (Sports Med) zur Messung von Trainingslast',
  },
  {
    t: '2. Fehlt der Garmin-Wert, schätzt die App',
    d: 'Ohne Puls liefert Garmin keinen Wert. Dann zählt die Dauer: 1,2 Punkte pro Minute für Laufen, Rad und Schwimmen, 0,6 für alles andere. Das ist grob und unterschätzt harte Einheiten.',
    s: 'Vereinfachung in Anlehnung an session-RPE (Foster et al. 2001, J Strength Cond Res)',
  },
  {
    t: '3. Die Woche ist die Summe aller Einheiten',
    d: 'Montag bis Sonntag zählt jede aufgezeichnete Aktivität, egal ob sie im Plan stand: Zusatzläufe, Rad, Schwimmen und Krafttraining mit der Uhr. Gym-Einträge, die nur im Check-in stehen, zählen nicht, weil die Uhr dafür keinen Puls hat.',
    s: '',
  },
  {
    t: '4. Vergleich mit den 4 Wochen davor',
    d: 'Der Schnitt der vier Wochen davor zeigt, was dein Körper gewohnt ist. Liegt eine Woche mindestens 30 % und 50 Punkte darüber, gibt es eine Warnung. Das ist ein grober Hinweis, keine exakte Vorhersage von Verletzungen.',
    s: 'Gabbett 2016 (Br J Sports Med); Impellizzeri et al. 2020 (Int J Sports Physiol Perform) zu den Grenzen dieser Kennzahl',
  },
]

const range = (r: WeekReview) => `${dateLabel(r.monday)} – ${dateLabel(r.sunday)}`

function useReview(monday: string, data: Dataset, plan: PlanState, log: Pick<DailyLogState, 'drinks' | 'gym'>) {
  const today = localToday()
  return useMemo(
    () => weekReview(monday, today, data.activities, data.days, plan.workouts, plan.events, log.drinks, log.gym, data.records),
    [monday, today, data, plan.workouts, plan.events, log.drinks, log.gym],
  )
}

/** Karte auf „Heute“ am Sonntagnachmittag und Montag. */
export function WeekReviewCard({ data, plan, log, variant = 'card' }: { data: Dataset; plan: PlanState; log: DailyLogState; variant?: CardVariant }) {
  const [hour] = useState(() => new Date().getHours())
  const monday = reviewMonday(localToday(), hour)
  if (!monday) return null
  return <ReviewTeaser monday={monday} data={data} plan={plan} log={log} row={variant === 'row'} />
}

function ReviewTeaser({ monday, data, plan, log, row }: { monday: string; data: Dataset; plan: PlanState; log: DailyLogState; row: boolean }) {
  const [open, setOpen] = useState(false)
  const r = useReview(monday, data, plan, log)
  const top = r.tips[0]
  if (row)
    return (
      <>
        <TaskRow
          icon="▤"
          color="var(--accent)"
          title="Wochenrückblick"
          subtitle={`${range(r)} · ${de(r.runKm)} km${r.plan ? ` · Plan ${r.plan.done}/${r.plan.planned}` : ''}${top ? ` · ${top.title}` : ''}`}
          onClick={() => (tap(), setOpen(true))}
        />
        {open && <WeekReviewSheet initial={monday} data={data} plan={plan} log={log} onClose={() => setOpen(false)} />}
      </>
    )
  return (
    <>
      <button className="block w-full rounded-[22px] text-left" onClick={() => (tap(), setOpen(true))}>
        <Card title="Wochenrückblick" subtitle={range(r)} action={<span className="text-sm font-medium text-accent">Ansehen ›</span>}>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Laufen" value={`${de(r.runKm)} km`} hint={r.plan && r.extraRuns ? `${r.extraRuns} außer Plan` : runsLabel(r.runs)} />
            <Mini label="Zeit" value={`${de(r.hours)} h`} hint={`Last ${r.load}`} />
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
            <Mini label="Laufen" value={`${de(r.runKm)} km`} hint={r.plan && r.extraRuns ? `${runsLabel(r.runs)}, ${r.extraRuns} außerhalb des Plans` : runsLabel(r.runs)} />
            <Mini label="Gesamtzeit" value={`${de(r.hours)} h`} hint={`${r.sessions} Einheiten`} />
            {r.easyShare != null && <Mini label="Locker gelaufen" value={`${Math.round(r.easyShare * 100)} %`} hint="Ziel etwa 80 %" />}
          </div>
          {r.easyShare != null && <Bar parts={[{ v: r.easyShare, color: 'var(--zone-2)' }, { v: 1 - r.easyShare, color: 'var(--zone-5)' }]} />}
        </Card>

        {r.runList.length > 0 && <RunsCard r={r} />}

        {r.load > 0 && <LoadCard r={r} loadDelta={loadDelta} />}

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
              {r.extraRuns > 0 && <Mini label="Außerhalb des Plans" value={`${de(r.extraRunKm)} km`} hint={runsLabel(r.extraRuns)} />}
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

function RunsCard({ r }: { r: WeekReview }) {
  const withPlan = r.plan != null
  return (
    <Card title="Alle Läufe" subtitle={withPlan ? 'Geplante und zusätzliche, alle zählen mit' : 'Jeder Lauf der Woche'}>
      <ul className="divide-y divide-[var(--card-border)]">
        {r.runList.map((x) => (
          <li key={x.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="w-6 shrink-0 text-sm font-semibold text-ink-3">{WEEKDAY_SHORT[weekday(x.date)]}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">{x.name}</div>
              <div className="text-xs text-ink-3">
                {de(x.km)} km · {duration(x.durationS)} · Last {x.load}
                {x.estimated ? ' (geschätzt)' : ''}
              </div>
            </div>
            {withPlan && (x.planned ? <Pill color="var(--good)">Plan</Pill> : <Pill color="var(--series-4)">Zusätzlich</Pill>)}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function LoadCard({ r, loadDelta }: { r: WeekReview; loadDelta: number | null }) {
  const [why, setWhy] = useState(false)
  const p = r.loadParts
  const total = Math.max(1, r.load)
  return (
    <Card title="Belastung" subtitle="Woraus sich die Trainingslast zusammensetzt">
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-semibold tracking-tight">{r.load}</span>
        <span className="text-sm text-ink-3">Punkte</span>
        {loadDelta != null && (
          <span className="ml-auto text-sm text-ink-2">
            {loadDelta > 0 ? '+' : ''}
            {loadDelta} % ggü. Ø {r.loadBefore}
          </span>
        )}
      </div>
      <Bar parts={p.bySport.map((x) => ({ v: x.load / total, color: SPORT_COLOR[x.group] }))} />
      <Legend items={p.bySport.map((x) => ({ label: `${GROUP_LABEL[x.group]} ${x.load}`, color: SPORT_COLOR[x.group] }))} />
      {r.plan && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <Mini label="Aus dem Plan" value={String(p.planned)} />
          <Mini label="Außerhalb des Plans" value={String(p.extra)} />
        </div>
      )}
      {p.estimated > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          {p.estimated} {p.estimated === 1 ? 'Einheit' : 'Einheiten'} ohne Garmin-Wert, aus der Dauer geschätzt.
        </p>
      )}
      <button onClick={() => (tap(), setWhy(!why))} aria-expanded={why} className="mt-3 min-h-9 text-sm font-semibold text-accent">
        {why ? 'Weniger' : 'Wie wird die Belastung berechnet?'}
      </button>
      {why && (
        <dl className="mt-1 space-y-2.5 text-sm">
          {LOAD_EXPLAIN.map((e) => (
            <div key={e.t}>
              <dt className="font-semibold">{e.t}</dt>
              <dd className="text-ink-2">{e.d}</dd>
              {e.s && <dd className="text-xs text-ink-3">Quelle: {e.s}</dd>}
            </div>
          ))}
        </dl>
      )}
    </Card>
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
