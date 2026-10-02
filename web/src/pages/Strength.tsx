import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { Card, Pill, Segmented } from '../components/ui'
import type { GymByDate } from '../lib/dailyLog'
import { tap } from '../lib/haptics'
import { addDays, mondayOf } from '../lib/plan/dates'
import type { PlanWorkout } from '../lib/plan/types'
import { LEG_WARMUP, legSession, NO_DEADLIFT, STABI_LEVELS, stabiSession, STRENGTH_EVIDENCE, weekStrength, type Prescribed, type StabiLevel, type WeekStrength } from '../lib/strength'
import { toast } from '../lib/toast'
import type { DailyLogState } from '../lib/useDailyLog'

const LEVEL_KEY = 'stabi.level'
const WEEKDAY = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const wd = (monday: string, d: string) => WEEKDAY[Math.round((Date.parse(d) - Date.parse(monday)) / 86400_000)]

function readLevel(): StabiLevel {
  try {
    return (localStorage.getItem(LEVEL_KEY) as StabiLevel | null) ?? 'easy'
  } catch {
    return 'easy'
  }
}

type Which = 'legs' | 'stabi'

/** Auf „Heute“: der Kraft- oder Stabi-Vorschlag für heute, falls einer ansteht. */
export function StrengthCard({ workouts, log, today }: { workouts: PlanWorkout[]; log: DailyLogState; today: string }) {
  const [open, setOpen] = useState<Which | null>(null)
  const s = weekStrength(mondayOf(today), workouts, log.gym, today)
  const which: Which | null = s.legs === today ? 'legs' : s.stabi.includes(today) ? 'stabi' : null
  if (!which) return null
  const done = which === 'legs' ? s.legsDone === today : s.stabiDone.includes(today)
  const legs = legSession(s.phase)
  const title = which === 'legs' ? legs.title : 'Stabi für Läufer'
  const minutes = which === 'legs' ? legs.minutes : stabiSession(readLevel()).minutes

  return (
    <>
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: done ? 'var(--good)' : 'var(--series-4)' }} aria-hidden>
            {done ? '✓' : which === 'legs' ? <DumbbellIcon /> : '◎'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">{done ? `${which === 'legs' ? 'Beintraining' : 'Stabi'} erledigt` : `Vorschlag: ${title}`}</div>
            <div className="text-xs text-ink-2">
              {which === 'legs' ? 'Gym' : 'Zuhause, ohne Geräte'} · etwa {minutes} min
              {which === 'legs' && s.legsAfterKey && !done && ' · nach dem Lauf, mit Abstand'}
            </div>
          </div>
          <button onClick={() => setOpen(which)} className={`min-h-10 shrink-0 rounded-full px-3.5 text-sm font-medium ${done ? 'bg-surface-2 text-ink-2' : 'bg-accent text-white'}`}>
            {done ? 'Ansehen' : 'Starten'}
          </button>
        </div>
      </Card>
      {open && <StrengthSheet which={open} week={s} done={done} today={today} log={log} onClose={() => setOpen(null)} />}
    </>
  )
}

/** Im Plan unter jeder Woche: wann Beine und Stabi vorgeschlagen sind. */
export function WeekStrengthLine({ monday, workouts, gym, today }: { monday: string; workouts: PlanWorkout[]; gym: GymByDate; today: string }) {
  if (addDays(monday, 6) < today) return null
  const s = weekStrength(monday, workouts, gym, today < monday ? monday : today)
  const mark = (d: string, done: boolean) => `${wd(monday, d)}${done ? ' ✓' : ''}`
  const parts = [
    s.legs ? `Beine ${mark(s.legs, s.legsDone === s.legs)}` : s.raceWeek ? 'keine Beine (Rennwoche)' : null,
    s.stabi.length ? `Stabi ${s.stabi.map((d) => mark(d, s.stabiDone.includes(d))).join(', ')}` : null,
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-xs text-ink-2">
      <span style={{ color: 'var(--series-4)' }} aria-hidden>
        <DumbbellIcon />
      </span>
      <span>Kraft-Vorschlag: {parts.join(' · ')}</span>
    </div>
  )
}

function StrengthSheet({ which, week, done, today, log, onClose }: { which: Which; week: WeekStrength; done: boolean; today: string; log: DailyLogState; onClose: () => void }) {
  const [level, setLevel] = useState<StabiLevel>(readLevel)
  const [saving, setSaving] = useState(false)
  const legs = legSession(week.phase)
  const stabi = stabiSession(level)
  const current = log.gym[today]

  async function markDone() {
    tap()
    if (done) return toast('Schon als erledigt gespeichert.')
    // Ein Bein- oder Ganzkörper-Eintrag bleibt stehen, Stabi zählt dann nicht extra.
    if (which === 'stabi' && current && current.focus !== 'core') return toast('Heute ist schon Krafttraining eingetragen.')
    setSaving(true)
    try {
      await log.setGym(today, which === 'legs' ? { focus: 'legs', hard: legs.hard } : { focus: 'core', hard: false })
      toast(which === 'legs' ? 'Gespeichert: Beintraining erledigt.' : 'Gespeichert: Stabi erledigt.')
      onClose()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      title={which === 'legs' ? 'Beine im Gym' : 'Stabi'}
      onClose={onClose}
      footer={
        <button disabled={saving} onClick={markDone} className="min-h-12 w-full rounded-xl bg-accent text-[15px] font-semibold text-white disabled:opacity-60">
          {done ? 'Erledigt ✓' : saving ? 'Speichern …' : 'Erledigt'}
        </button>
      }
    >
      {which === 'legs' ? (
        <>
          <Card title={legs.title} subtitle={`${legs.steps.length} Übungen · etwa ${legs.minutes} min`}>
            <p className="text-sm text-ink-2">{legs.focus}</p>
            <p className="mt-2 text-xs text-ink-3">Aufwärmen: {LEG_WARMUP}</p>
            {week.legsAfterKey && <p className="mt-2 text-xs text-ink-3">Diese Woche ist kein Tag ohne harte Einheit am Folgetag frei. Mach das Beintraining deshalb nach dem Lauf, am besten einige Stunden später.</p>}
          </Card>
          {legs.steps.map((s, i) => (
            <ExerciseCard key={s.ex.id} n={i + 1} s={s} />
          ))}
        </>
      ) : (
        <>
          <Segmented
            value={level}
            onChange={(v) => {
              tap()
              setLevel(v)
              try {
                localStorage.setItem(LEVEL_KEY, v)
              } catch {
                // ohne Speicher bleibt es bei der Sitzung
              }
            }}
            options={STABI_LEVELS}
          />
          <Card title={stabi.title} subtitle={`${stabi.steps.length} Übungen · ${stabi.rounds} Runden · etwa ${stabi.minutes} min`}>
            <p className="text-sm text-ink-2">Alle Übungen nacheinander, dann die nächste Runde. Langsam und sauber, ruhig weiteratmen. Gut nach einem lockeren Lauf oder an einem Ruhetag.</p>
          </Card>
          {stabi.steps.map((s, i) => (
            <ExerciseCard key={s.ex.id} n={i + 1} s={s} hard={level === 'hard'} />
          ))}
        </>
      )}

      <Card title="Kein Kreuzheben">
        <p className="text-sm text-ink-2">{NO_DEADLIFT}</p>
      </Card>

      <Card title="Warum das Sinn ergibt" subtitle="Was Studien zu Krafttraining für Läufer zeigen">
        <div className="space-y-3">
          {STRENGTH_EVIDENCE.map((e) => (
            <div key={e.title}>
              <div className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{e.title}</div>
              <p className="mt-1 text-sm text-ink-2">{e.text}</p>
              <p className="mt-1 text-xs text-ink-3">Quellen: {e.source}</p>
            </div>
          ))}
        </div>
      </Card>
    </Sheet>
  )
}

function ExerciseCard({ n, s, hard }: { n: number; s: Prescribed; hard?: boolean }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">{n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{s.ex.name}</span>
            <Pill color="var(--series-4)">{s.dose}</Pill>
          </div>
          <div className="mt-0.5 text-xs text-ink-3">{s.ex.target}</div>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-ink-2">
            {s.ex.how.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
          {s.ex.easier && <p className="mt-2 text-xs text-ink-2">Leichter: {s.ex.easier}</p>}
          {hard && s.ex.harder && <p className="mt-1 text-xs text-ink-2">Schwerer: {s.ex.harder}</p>}
          <p className="mt-2 text-xs text-ink-3">{s.ex.why}</p>
        </div>
      </div>
    </Card>
  )
}

function DumbbellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />
    </svg>
  )
}
