import { useMemo, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { toast } from '../lib/toast'
import { Card, Pill, Ring, SportIcon } from '../components/ui'
import { dateLabel } from '../lib/format'
import { guessType, handledIds, markHandled, openSuggestions, type GarminRace } from '../lib/garminRaces'
import { tap } from '../lib/haptics'
import { FEEDBACK_LABEL, progressOf, restoreOriginal } from '../lib/plan/adapt'
import { addDays, daysBetween, localToday, mondayOf, WEEKDAY_LONG, WEEKDAY_SHORT, weekday } from '../lib/plan/dates'
import { fmtDuration, fmtPace, raceDistanceKm } from '../lib/plan/generate'
import type { PlanState } from '../lib/plan/usePlan'
import { stepLines, workoutAmount } from '../lib/plan/labels'
import { AnalysisBlock, FeedbackChips } from './PlanFeedback'
import { analysisFor } from '../lib/plan/analyze'
import { explain } from '../lib/plan/explain'
import type { Activity, RacePrediction } from '../lib/types'
import type { Best } from '../lib/records'
import { RaceCheck } from './PlanInsights'
import { EVENT_TYPES, eventTypeLabel, PHASE_LABEL, type EventType, type Feedback, type PlanWorkout, type RaceEvent } from '../lib/plan/types'


export function Plan({ plan, activities, records, predictions, garminRaces }: { plan: PlanState; activities?: Activity[]; records?: Best[]; predictions?: RacePrediction[]; garminRaces?: GarminRace[] }) {
  const today = localToday()
  const upcoming = plan.events.filter((e) => e.date >= today)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<RaceEvent | 'new' | { draft: Partial<RaceEvent>; garminId: number } | null>(null)
  const [handled, setHandled] = useState(handledIds)
  const suggestions = openSuggestions(garminRaces ?? [], plan.events, today, handled)
  const [openId, setOpenId] = useState<string | null>(null)

  const selected = plan.events.find((e) => e.id === selectedId) ?? upcoming[0] ?? plan.events.at(-1)
  const workouts = useMemo(() => plan.workouts.filter((w) => w.event_id === selected?.id), [plan.workouts, selected?.id])
  const opened = workouts.find((w) => w.id === openId)

  async function toggleDone(w: PlanWorkout) {
    const done = w.status !== 'done'
    tap()
    try {
      await plan.setStatus(w, done ? 'done' : 'planned')
      if (done) toast(`${w.title} erledigt. Stark!`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  if (plan.loading) return <div className="p-10 text-center text-sm text-ink-3">Lade Plan …</div>

  return (
    <div className="page-in space-y-3">
      {plan.error && <div className="rounded-xl border border-line bg-surface p-3 text-sm" style={{ color: 'var(--critical)' }}>{plan.error}</div>}

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
        {plan.events.map((e) => (
          <button
            key={e.id}
            onClick={() => {
              setSelectedId(e.id)
            }}
            className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${e.id === selected?.id ? 'bg-ink text-bg' : 'card text-ink-2'} ${e.date < today ? 'opacity-60' : ''}`}
          >
            {e.name}
          </button>
        ))}
        <button onClick={() => setEditing('new')} className="min-h-10 shrink-0 rounded-full border border-dashed border-line px-4 text-sm font-medium text-accent">
          + Rennen
        </button>
      </div>

      {suggestions.map((r) => (
        <Card key={r.id} title="Rennen aus Garmin" subtitle={`${r.name} · ${dateLabel(r.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}`}>
          <p className="text-sm text-ink-2">In deinem Garmin-Kalender eingetragen. Übernehmen, damit ich dir einen Plan dafür erstelle?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                markHandled(r.id)
                setHandled(handledIds())
                toast('Ausgeblendet.')
              }}
              className="min-h-11 rounded-xl bg-surface-2 text-sm font-medium text-ink-2"
            >
              Ignorieren
            </button>
            <button
              onClick={() => setEditing({ draft: { name: r.name, date: r.date, type: guessType(r) }, garminId: r.id })}
              className="min-h-11 rounded-xl bg-accent text-sm font-semibold text-white"
            >
              Übernehmen
            </button>
          </div>
        </Card>
      ))}

      {!selected && !plan.error && (
        <Card>
          <p className="text-sm text-ink-2">Noch kein Rennen geplant. Lege dein Ziel an, dann erstelle ich dir einen Trainingsplan bis zum Renntag.</p>
          <button onClick={() => setEditing('new')} className="mt-3 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white">Rennen anlegen</button>
        </Card>
      )}

      {selected && (
        <>
          <EventHeader event={selected} workouts={workouts} today={today} onEdit={() => setEditing(selected)} />
          <RaceCheck event={selected} workouts={workouts} activities={activities ?? []} records={records ?? []} predictions={predictions} today={today} />
          <WeekList workouts={workouts} today={today} onOpen={setOpenId} onToggle={(w) => toggleDone(w)} />
        </>
      )}

      {editing && (
        <EventForm
          event={editing === 'new' || 'draft' in editing ? null : editing}
          draft={editing !== 'new' && 'draft' in editing ? editing.draft : undefined}
          onClose={() => setEditing(null)}
          onSave={async (e, isNew) => {
            await plan.saveEvent(e, isNew)
            if (editing !== 'new' && 'draft' in editing) {
              markHandled(editing.garminId)
              setHandled(handledIds())
            }
            setSelectedId(e.id)
            setEditing(null)
          }}
          onDelete={async (id) => {
            await plan.deleteEvent(id)
            setSelectedId(null)
            setEditing(null)
          }}
        />
      )}

      {opened && (
        <WorkoutSheet
          workout={opened}
          activities={activities}
          today={today}
          onClose={() => setOpenId(null)}
          onStatus={async (s) => {
            if (s === 'done') return toggleDone(opened).then(() => setOpenId(null))
            await plan.setStatus(opened, s)
            setOpenId(null)
          }}
          onSkip={async () => {
            toast(await plan.skip(opened))
            setOpenId(null)
          }}
          onRestore={async () => {
            await plan.applyChanges([restoreOriginal(opened)])
            toast('Ursprüngliche Einheit wiederhergestellt.')
            setOpenId(null)
          }}
          onRate={async (f) => {
            try {
              toast(await plan.rate(opened, f))
            } catch (e) {
              toast((e as Error).message, 'error')
            }
          }}
        />
      )}
    </div>
  )
}

function EventHeader({ event, workouts, today, onEdit }: { event: RaceEvent; workouts: PlanWorkout[]; today: string; onEdit: () => void }) {
  const p = progressOf(workouts, today)
  const weeks = Math.max(0, ...workouts.map((w) => w.week_index))
  const current = workouts.find((w) => w.date >= today) ?? workouts.at(-1)
  const pct = p.total ? (p.done / p.total) * 100 : 0
  const duePct = p.total ? (p.dueSoFar / p.total) * 100 : 0
  const days = p.daysToRace != null && p.daysToRace >= 0 ? p.daysToRace : null
  const span = workouts.length ? Math.max(1, daysBetween(workouts[0].date, event.date)) : 1
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink-3">
            {eventTypeLabel(event.type)}
            {event.goal_time_s ? ` · Ziel ${fmtDuration(event.goal_time_s)}` : ''}
          </div>
          <h2 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">{event.name}</h2>
          <div className="mt-0.5 text-xs text-ink-2">{dateLabel(event.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <button onClick={onEdit} className="min-h-9 shrink-0 rounded-full bg-surface-2 px-3.5 text-xs font-semibold text-ink-2">Bearbeiten</button>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <Ring value={days != null ? span - days : 0} max={span} size={96} stroke={9} label={`${days ?? 0} Tage bis zum Rennen`}>
          <span className="text-[28px] leading-none font-bold tracking-tight">{days ?? '–'}</span>
          <span className="mt-0.5 text-[11px] text-ink-3">{days === 1 ? 'Tag' : 'Tage'}</span>
        </Ring>
        <div className="min-w-0 flex-1 space-y-3">
          {current && (
            <div>
              <div className="text-xs text-ink-3">Woche {current.week_index} von {weeks}</div>
              <div className="text-[15px] font-semibold">{PHASE_LABEL[current.phase]}</div>
            </div>
          )}
          <div>
            {/* Fortschritt: erledigt (Akzent) vor dem Soll bis heute (Markierung). */}
            <div className="relative h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              {duePct > 0 && duePct < 100 && <div className="absolute top-0 h-full w-0.5 bg-ink-3" style={{ left: `${duePct}%` }} />}
            </div>
            <div className="mt-1.5 text-xs text-ink-2">
              {p.done} von {p.total} Einheiten
              {p.dueSoFar > 0 && ` · ${p.doneSoFar}/${p.dueSoFar} bis heute`}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function WeekList({ workouts, today, onOpen, onToggle }: { workouts: PlanWorkout[]; today: string; onOpen: (id: string) => void; onToggle: (w: PlanWorkout) => void }) {
  const [showPast, setShowPast] = useState(false)
  const weeks = useMemo(() => {
    const m = new Map<string, PlanWorkout[]>()
    for (const w of workouts) {
      const k = mondayOf(w.date)
      m.set(k, [...(m.get(k) ?? []), w])
    }
    return [...m.entries()]
  }, [workouts])
  const thisMonday = mondayOf(today)
  const past = weeks.filter(([m]) => m < thisMonday)
  const rest = weeks.filter(([m]) => m >= thisMonday)

  return (
    <div className="space-y-3">
      {past.length > 0 && (
        <button onClick={() => setShowPast(!showPast)} className="w-full rounded-xl py-2 text-sm font-medium text-accent">
          {showPast ? 'Vergangene Wochen ausblenden' : `${past.length} vergangene ${past.length === 1 ? 'Woche' : 'Wochen'} anzeigen`}
        </button>
      )}
      {(showPast ? weeks : rest).map(([monday, ws]) => (
        <Week key={monday} monday={monday} workouts={ws} today={today} onOpen={onOpen} onToggle={onToggle} />
      ))}
    </div>
  )
}

function Week({ monday, workouts, today, onOpen, onToggle }: { monday: string; workouts: PlanWorkout[]; today: string; onOpen: (id: string) => void; onToggle: (w: PlanWorkout) => void }) {
  const first = workouts[0]
  const runKm = workouts.filter((w) => w.sport === 'run').reduce((a, w) => a + (w.distance_km ?? 0), 0)
  const mins = workouts.filter((w) => w.sport !== 'race').reduce((a, w) => a + (w.duration_min ?? 0), 0)
  const isNow = monday === mondayOf(today)
  return (
    <Card className={isNow ? 'p-4 ring-2 ring-accent/30' : ''}>
      <header className="mb-1">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          Woche {first.week_index} <span className="font-normal text-ink-3">· {PHASE_LABEL[first.phase]}</span>
          {isNow && <Pill>Diese Woche</Pill>}
        </h3>
        <span className="text-xs text-ink-3">
          {dateLabel(monday)} – {dateLabel(addDays(monday, 6))}
          {runKm > 0 ? ` · ${Math.round(runKm)} km` : mins > 0 ? ` · ${(mins / 60).toFixed(1).replace('.', ',')} h` : ''}
        </span>
      </header>
      <ul className="divide-y divide-line">
        {workouts.map((w) => (
          <li key={w.id} className="flex items-center">
            <button onClick={() => onOpen(w.id)} className={`press-row -ml-2 flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pl-2 text-left ${w.date === today ? 'font-semibold' : ''}`}>
              <span className="w-8 shrink-0 text-xs text-ink-3">
                {WEEKDAY_SHORT[weekday(w.date)]}
                <br />
                {Number(w.date.slice(8))}.
              </span>
              <SportIcon group={w.sport} size={34} />
              <span className={`min-w-0 flex-1 ${w.status === 'skipped' ? 'text-ink-3 line-through' : ''}`}>
                <span className="block truncate text-sm">
                  {w.title}
                  {w.key_session && w.sport !== 'race' && <span className="ml-1.5 text-xs" style={{ color: 'var(--series-2)' }}>●</span>}
                </span>
                <span className="block text-xs font-normal text-ink-3">
                  {workoutAmount(w)}
                  {w.feedback && w.feedback !== 'ok' && ` · ${FEEDBACK_LABEL[w.feedback].toLowerCase()}`}
                </span>
              </span>
              <StatusMark w={w} today={today} />
            </button>
            {w.sport !== 'race' && w.status !== 'skipped' && <CheckButton w={w} onToggle={onToggle} />}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function StatusMark({ w, today }: { w: PlanWorkout; today: string }) {
  if (w.status === 'done') return null
  if (w.status === 'skipped') return <span className="text-xs text-ink-3">Ausgelassen</span>
  if (w.date < today) return <span className="text-xs" style={{ color: 'var(--warning)' }}>▲ Offen</span>
  if (w.moved_from) return <span className="text-xs text-ink-3">Verschoben</span>
  return null
}

/** Großer runder Haken zum direkten Abhaken in der Liste. */
function CheckButton({ w, onToggle }: { w: PlanWorkout; onToggle: (w: PlanWorkout) => void }) {
  const done = w.status === 'done'
  return (
    <button
      onClick={() => onToggle(w)}
      aria-label={done ? `${w.title}: Haken entfernen` : `${w.title} als erledigt markieren`}
      aria-pressed={done}
      className="-mr-2 flex h-12 w-12 shrink-0 items-center justify-center"
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full border-2"
        style={done ? { background: 'var(--good)', borderColor: 'var(--good)' } : { borderColor: 'var(--border)' }}
      >
        {done && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5 10 17l9-10" />
          </svg>
        )}
      </span>
    </button>
  )
}

function WorkoutSheet({ workout: w, activities, today, onClose, onStatus, onSkip, onRestore, onRate }: {
  workout: PlanWorkout
  activities?: Activity[]
  today: string
  onClose: () => void
  onStatus: (s: PlanWorkout['status']) => Promise<void>
  onSkip: () => Promise<void>
  onRestore: () => Promise<void>
  onRate: (f: Feedback | null) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const run = (f: () => Promise<void>) => async () => {
    setBusy(true)
    try {
      await f()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      title="Einheit"
      onClose={onClose}
      footer={
        w.sport === 'race' ? undefined : w.original ? (
          <div className={w.status === 'planned' ? 'grid grid-cols-2 gap-2' : ''}>
            <button disabled={busy} onClick={run(onRestore)} className="min-h-12 w-full rounded-xl bg-surface-2 text-[15px] font-semibold text-ink disabled:opacity-60">
              Original zurück
            </button>
            {w.status === 'planned' && (
              <button disabled={busy} onClick={run(() => onStatus('done'))} className="min-h-12 rounded-xl bg-accent text-[15px] font-semibold text-white disabled:opacity-60">
                Erledigt
              </button>
            )}
          </div>
        ) : w.status === 'planned' ? (
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={run(onSkip)} className="min-h-12 rounded-xl bg-surface-2 text-[15px] font-semibold text-ink disabled:opacity-60">
              {w.date >= today ? 'Überspringen' : 'Ausgelassen'}
            </button>
            <button disabled={busy} onClick={run(() => onStatus('done'))} className="min-h-12 rounded-xl bg-accent text-[15px] font-semibold text-white disabled:opacity-60">
              Erledigt
            </button>
          </div>
        ) : (
          <button disabled={busy} onClick={run(() => onStatus('planned'))} className="min-h-12 w-full rounded-xl bg-surface-2 text-[15px] font-semibold text-ink disabled:opacity-60">
            Zurücksetzen auf geplant
          </button>
        )
      }
    >
      <div>
        <div className="text-xs text-ink-3">
          {dateLabel(w.date, { weekday: 'long', day: 'numeric', month: 'long' })} · Woche {w.week_index} · {PHASE_LABEL[w.phase]}
        </div>
        <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <SportIcon group={w.sport} size={44} />
          {w.title}
        </h1>
        <div className="mt-1 text-sm text-ink-2">{workoutAmount(w)}</div>
        {w.moved_from && <div className="mt-1 text-xs text-ink-3">Verschoben von {WEEKDAY_LONG[weekday(w.moved_from)]}</div>}
        {w.original && <div className="mt-1 text-xs text-ink-3">An deine Readiness angepasst, ursprünglich: {w.original.title}</div>}
        {w.garmin_workout_id && w.status === 'planned' && <div className="mt-1 text-xs text-ink-3">⌚ Liegt auf deiner Uhr unter „Training“</div>}
      </div>
      {w.status === 'done' && w.sport !== 'race' && (
        <Card title={analysisFor(w, activities) ? 'Auswertung' : "Wie war's?"}>
          {analysisFor(w, activities) && <AnalysisBlock a={analysisFor(w, activities)!} />}
          <FeedbackChips value={w.feedback} onPick={(f) => run(() => onRate(f))()} disabled={busy} />
        </Card>
      )}
      {w.description && (
        <Card>
          <p className="text-sm leading-relaxed whitespace-pre-line text-ink-2">{w.description}</p>
        </Card>
      )}
      <WhyCard w={w} />
      {w.steps && w.steps.length > 1 && (
        <Card title="Ablauf auf der Uhr">
          <ol className="space-y-1.5 text-sm">
            {stepLines(w.steps).map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-4 shrink-0 text-ink-3">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
      {w.sport !== 'race' && w.status === 'planned' && !w.original && (
        <p className="text-xs text-ink-3">Wichtige Einheiten verschiebe ich beim Überspringen nach Möglichkeit auf einen freien Tag derselben Woche. Läufe mit der Uhr werden nach dem Sync automatisch abgehakt.</p>
      )}
    </Sheet>
  )
}

// ---------- Rennen anlegen / bearbeiten ----------

// Zielzeit als drei Zahlenfelder: Die Zahlentastatur am Handy hat keinen Doppelpunkt.
function splitGoal(total: number | null | undefined): [string, string, string] {
  if (!total) return ['', '', '']
  return [String(Math.floor(total / 3600)), String(Math.floor((total % 3600) / 60)), String(total % 60)]
}

function joinGoal([h, m, s]: [string, string, string]): number | null | 'invalid' {
  if (!h.trim() && !m.trim() && !s.trim()) return null
  const n = [h, m, s].map((x) => (x.trim() ? Number(x) : 0))
  if (n.some((x) => !Number.isInteger(x) || x < 0) || n[1] > 59 || n[2] > 59) return 'invalid'
  const total = n[0] * 3600 + n[1] * 60 + n[2]
  return total > 0 ? total : null
}

const DEFAULT_DAYS: Record<EventType, number> = { '5k': 4, '10k': 4, half: 4, marathon: 5, tri_sprint: 5, tri_olympic: 6, tri_70_3: 6, tri_ironman: 6 }

function EventForm({ event, draft, onClose, onSave, onDelete }: {
  event: RaceEvent | null
  draft?: Partial<RaceEvent>
  onClose: () => void
  onSave: (e: RaceEvent, isNew: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const today = localToday()
  const [name, setName] = useState(event?.name ?? draft?.name ?? '')
  const [type, setType] = useState<EventType>(event?.type ?? draft?.type ?? 'half')
  const [date, setDate] = useState(event?.date ?? draft?.date ?? addDays(today, 16 * 7))
  const [goal, setGoal] = useState(splitGoal(event?.goal_time_s))
  const [days, setDays] = useState(event?.days_per_week ?? DEFAULT_DAYS[draft?.type ?? 'half'])
  const [longDay, setLongDay] = useState(event?.long_day ?? 6)
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const weeks = Math.floor(daysBetween(today, date) / 7)
  const goalS = joinGoal(goal)
  const dist = raceDistanceKm(type)
  const pace = dist && typeof goalS === 'number' && goalS > 0 ? fmtPace(goalS / dist) : null

  async function submit() {
    if (!name.trim()) return setErr('Bitte einen Namen eingeben.')
    if (!date || date <= today) return setErr('Das Renndatum muss in der Zukunft liegen.')
    if (goalS === 'invalid') return setErr('Zielzeit bitte als ganze Zahlen eingeben, Minuten und Sekunden höchstens 59.')
    setBusy(true)
    setErr(null)
    try {
      await onSave(
        { id: event?.id ?? crypto.randomUUID(), name: name.trim(), type, date, goal_time_s: goalS, days_per_week: days, long_day: longDay, notes: notes.trim() || null },
        !event,
      )
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const field = 'mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-accent'
  const label = 'block text-xs font-medium text-ink-2'

  return (
    <Sheet
      title={event ? 'Rennen bearbeiten' : 'Neues Rennen'}
      onClose={onClose}
      footer={
        <>
          {err && (
            <p className="text-sm" role="alert" style={{ color: 'var(--critical)' }}>
              {err}
            </p>
          )}
          <button disabled={busy} onClick={submit} className="min-h-12 w-full rounded-xl bg-accent text-[15px] font-semibold text-white disabled:opacity-60">
            {busy ? 'Plane …' : event ? 'Speichern' : 'Rennen anlegen und Plan erstellen'}
          </button>
        </>
      }
    >
      <Card>
        <div className="space-y-4">
          <label className={label}>
            Name
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Berlin Halbmarathon" autoCapitalize="words" enterKeyHint="next" />
          </label>
          <label className={label}>
            Rennform
            <select
              className={field}
              value={type}
              onChange={(e) => {
                const t = e.target.value as EventType
                setType(t)
                if (!event) setDays(DEFAULT_DAYS[t])
              }}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Renndatum
            <input type="date" className={field} value={date} min={addDays(today, 1)} onChange={(e) => setDate(e.target.value)} />
            {weeks >= 0 && <span className="mt-1 block font-normal text-ink-3">{weeks} Wochen Vorbereitung{weeks < 6 ? ' – knapp, der Plan wird kurz.' : ''}</span>}
          </label>
          <div className={label}>
            Zielzeit (optional)
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(['Std', 'Min', 'Sek'] as const).map((unit, i) => (
                <label key={unit} className="relative block">
                  <input
                    className={`${field.replace('mt-1 ', '')} pr-12`}
                    value={goal[i]}
                    onChange={(e) => {
                      const next = [...goal] as [string, string, string]
                      next[i] = e.target.value.replace(/\D/g, '').slice(0, 2)
                      setGoal(next)
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    aria-label={`Zielzeit ${unit}`}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm font-normal text-ink-3">{unit}</span>
                </label>
              ))}
            </div>
            {pace && <span className="mt-1 block font-normal text-ink-3">Entspricht {pace} min/km</span>}
          </div>
          <div className={label}>
            Trainingstage pro Woche
            <div className="mt-1 grid grid-cols-5 gap-1.5">
              {[3, 4, 5, 6, 7].map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)} className={`min-h-11 rounded-xl text-[15px] font-semibold ${d === days ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className={label}>
            Tag für die lange Einheit
            <div className="mt-1 grid grid-cols-7 gap-1">
              {WEEKDAY_SHORT.map((d, i) => (
                <button key={d} type="button" onClick={() => setLongDay(i)} className={`min-h-11 rounded-xl text-sm font-semibold ${i === longDay ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className={label}>
            Notizen
            <textarea className={field} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
      </Card>

      {event && <p className="text-xs text-ink-3">Änderungen an Datum, Rennform, Zielzeit oder Trainingstagen planen ab morgen neu. Bereits Erledigtes bleibt.</p>}

      {event &&
        (confirmDelete ? (
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="text-sm">„{event.name}“ und den ganzen Plan dazu löschen?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmDelete(false)} className="rounded-xl bg-surface-2 py-2.5 text-sm font-semibold">Abbrechen</button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await onDelete(event.id)
                  } catch (e) {
                    setErr((e as Error).message)
                    setBusy(false)
                  }
                }}
                className="rounded-xl py-2.5 text-sm font-semibold text-white"
                style={{ background: 'var(--critical)' }}
              >
                Löschen
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="w-full rounded-xl py-3 text-sm font-semibold" style={{ color: 'var(--critical)' }}>
            Rennen löschen
          </button>
        ))}
    </Sheet>
  )
}

/** Wofür die Einheit da ist und was die Forschung dazu sagt. */
function WhyCard({ w }: { w: PlanWorkout }) {
  const e = explain(w)
  if (!e) return null
  return (
    <Card title="Warum diese Einheit?" subtitle={e.short}>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold text-ink-3 uppercase">Wofür</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-2">{e.purpose}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-3 uppercase">Was im Körper passiert</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-2">{e.effect}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-3 uppercase">Was Studien zeigen</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-2">{e.evidence}</dd>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <dt className="text-xs font-semibold text-accent uppercase">Tipp</dt>
          <dd className="mt-0.5 leading-relaxed">{e.tip}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-3">{e.phase}</p>
      <p className="mt-1 text-[11px] text-ink-3">Quellen: {e.sources.join(' · ')}</p>
    </Card>
  )
}
