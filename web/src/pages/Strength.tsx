import { useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { Card, Pill, Segmented } from '../components/ui'
import type { GymByDate } from '../lib/dailyLog'
import { tap } from '../lib/haptics'
import { addDays, mondayOf } from '../lib/plan/dates'
import type { PlanWorkout } from '../lib/plan/types'
import {
  LEG_WARMUP,
  legSession,
  mergeFocus,
  NO_DEADLIFT,
  restSeconds,
  setsOf,
  STABI_LEVELS,
  stabiSession,
  STRENGTH_EVIDENCE,
  UPPER_EVIDENCE,
  UPPER_WARMUP,
  upperSession,
  weekStrength,
  type Prescribed,
  type StabiLevel,
  type UpperVariant,
  type WeekStrength,
} from '../lib/strength'
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

export type Which = 'legs' | 'stabi' | 'upper'
const UPPER_KEY = 'gym.upper.last'

function readStore<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ohne Speicher gilt es nur für diese Sitzung
  }
}
/** Vorschlag: die Variante, die zuletzt nicht dran war. */
const nextUpper = (): UpperVariant => (readStore<UpperVariant>(UPPER_KEY, 'B') === 'A' ? 'B' : 'A')

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
          <button onClick={() => setOpen(which)} className={`min-h-10 shrink-0 rounded-full px-3.5 text-sm font-medium ${done ? 'bg-surface-2 text-ink-2' : 'btn-primary'}`}>
            {done ? 'Ansehen' : 'Starten'}
          </button>
        </div>
      </Card>
      {open && <StrengthSheet which={open} week={s} done={done} today={today} log={log} onClose={() => setOpen(null)} />}
    </>
  )
}

/** Auf „Heute“: jederzeit ins Gym, mit Läufer-Beintag oder Oberkörperplan zum Abhaken. */
export function GymCard({ workouts, log, today }: { workouts: PlanWorkout[]; log: DailyLogState; today: string }) {
  const [open, setOpen] = useState<Which | null>(null)
  const s = weekStrength(mondayOf(today), workouts, log.gym, today)
  const legs = legSession(s.phase)
  const upper = nextUpper()
  const legsHint = s.legsDone ? 'diese Woche erledigt' : s.raceWeek ? 'Rennwoche, besser auslassen' : s.legs === today ? 'Vorschlag: heute' : s.legs ? `Vorschlag: ${wd(mondayOf(today), s.legs)}` : ''
  return (
    <>
      <Card title="Gym" subtitle="Plan öffnen, Sätze abhaken, am Ende speichern">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setOpen('legs')} className="press-row rounded-2xl bg-surface-2 p-3 text-left">
            <div className="text-[15px] font-semibold">Läufer-Beintag</div>
            <div className="mt-0.5 text-xs text-ink-2">
              {legs.title.replace('Beine: ', '')} · {legs.minutes} min
            </div>
            {legsHint && <div className="mt-1 text-[11px] text-ink-3">{legsHint}</div>}
          </button>
          <button onClick={() => setOpen('upper')} className="press-row rounded-2xl bg-surface-2 p-3 text-left">
            <div className="text-[15px] font-semibold">Oberkörper</div>
            <div className="mt-0.5 text-xs text-ink-2">Muskelaufbau · {upperSession(upper, s.phase).minutes} min</div>
            <div className="mt-1 text-[11px] text-ink-3">Heute dran: Variante {upper}</div>
          </button>
        </div>
      </Card>
      {open && <StrengthSheet which={open} week={s} done={false} today={today} log={log} onClose={() => setOpen(null)} />}
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

export function StrengthSheet({ which, week, done, today, log, onClose }: { which: Which; week: WeekStrength; done: boolean; today: string; log: DailyLogState; onClose: () => void }) {
  const [level, setLevel] = useState<StabiLevel>(readLevel)
  const [variant, setVariant] = useState<UpperVariant>(nextUpper)
  const [saving, setSaving] = useState(false)
  const legs = legSession(week.phase)
  const stabi = stabiSession(level)
  const upper = upperSession(variant, week.phase)
  const current = log.gym[today]
  const tracked = which !== 'stabi'
  const steps = which === 'legs' ? legs.steps : which === 'upper' ? upper.steps : stabi.steps
  // Abgehakte Sätze bleiben für heute gespeichert, auch wenn du das Blatt zwischendurch schließt.
  const trackKey = `gym.track.${today}.${which === 'upper' ? `upper${variant}` : which}`
  const [track, setTrack] = useState(() => ({ key: trackKey, sets: readStore<Record<string, number>>(trackKey, {}) }))
  const doneSets = track.key === trackKey ? track.sets : readStore<Record<string, number>>(trackKey, {})
  const [rest, setRest] = useState<{ sec: number; n: number } | null>(null)
  const total = steps.reduce((n, x) => n + setsOf(x.dose), 0)
  const finished = steps.reduce((n, x) => n + Math.min(setsOf(x.dose), doneSets[x.ex.id] ?? 0), 0)

  function toggleSet(id: string, i: number, index: number) {
    tap()
    const have = doneSets[id] ?? 0
    const next = { ...doneSets, [id]: i < have ? i : i + 1 }
    setTrack({ key: trackKey, sets: next })
    writeStore(trackKey, next)
    if (i >= have) {
      const sec = restSeconds(which === 'upper' ? 'upper' : 'legs', week.phase, index)
      setRest((r) => ({ sec, n: (r?.n ?? 0) + 1 }))
    }
  }

  async function markDone() {
    tap()
    if (done) return toast('Schon als erledigt gespeichert.')
    // Ein Bein- oder Ganzkörper-Eintrag bleibt stehen, Stabi zählt dann nicht extra.
    if (which === 'stabi' && current && current.focus !== 'core') return toast('Heute ist schon Krafttraining eingetragen.')
    setSaving(true)
    try {
      if (which === 'stabi') await log.setGym(today, { focus: 'core', hard: false })
      else {
        const focus = mergeFocus(current?.focus, which)
        const hard = which === 'legs' ? legs.hard || !!current?.hard : focus === 'full' ? !!current?.hard : true
        await log.setGym(today, { focus, hard })
        if (which === 'upper') writeStore(UPPER_KEY, variant)
      }
      setRest(null)
      toast(which === 'legs' ? 'Gespeichert: Beintraining erledigt.' : which === 'upper' ? `Gespeichert: Oberkörper ${variant} erledigt.` : 'Gespeichert: Stabi erledigt.')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      title={which === 'legs' ? 'Beine im Gym' : which === 'upper' ? 'Oberkörper im Gym' : 'Stabi'}
      onClose={onClose}
      footer={
        <>
          {rest && <RestTimer key={rest.n} total={rest.sec} onDone={() => setRest(null)} />}
          {tracked && (
            <div className="flex items-center gap-3 text-xs text-ink-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${total ? (finished / total) * 100 : 0}%`,
                    background: 'var(--brand)',
                  }}
                />
              </div>
              <span className="tabular-nums">
                {finished} von {total} Sätzen
              </span>
            </div>
          )}
          <button disabled={saving} onClick={markDone} className="min-h-12 w-full rounded-xl btn-primary text-[15px] font-semibold disabled:opacity-60">
            {done ? 'Erledigt ✓' : saving ? 'Speichern …' : tracked && finished < total ? 'Training beenden und speichern' : 'Erledigt'}
          </button>
        </>
      }
    >
      {which === 'legs' ? (
        <>
          <Card title={legs.title} subtitle={`${legs.steps.length} Übungen · etwa ${legs.minutes} min`}>
            <p className="text-sm text-ink-2">{legs.focus}</p>
            <p className="mt-2 text-xs text-ink-3">Aufwärmen: {LEG_WARMUP}</p>
            {week.legsAfterKey && (
              <p className="mt-2 text-xs text-ink-3">Diese Woche ist kein Tag ohne harte Einheit am Folgetag frei. Mach das Beintraining deshalb nach dem Lauf, am besten einige Stunden später.</p>
            )}
            {week.raceWeek && (
              <p className="mt-2 text-xs text-ink-3">Rennwoche: In den letzten 10 Tagen vor dem Rennen schlägt die App kein schweres Beintraining vor. Wenn überhaupt, dann nur die halbe Menge.</p>
            )}
          </Card>
          {legs.steps.map((x, i) => (
            <ExerciseCard
              key={x.ex.id}
              n={i + 1}
              s={x}
              track={{
                done: doneSets[x.ex.id] ?? 0,
                onSet: (k) => toggleSet(x.ex.id, k, i),
              }}
            />
          ))}
        </>
      ) : which === 'upper' ? (
        <>
          <Segmented
            value={variant}
            onChange={(v) => {
              tap()
              setVariant(v)
            }}
            options={[
              { value: 'A', label: 'Variante A' },
              { value: 'B', label: 'Variante B' },
            ]}
          />
          <Card
            title={upper.title}
            subtitle={`${upper.steps.length} Übungen · etwa ${upper.minutes} min · ${variant === 'A' ? 'Drücken und Ziehen flach und senkrecht, Arme' : 'Schräg drücken, Klimmzug, Schulter, Rumpf'}`}
          >
            <p className="text-sm text-ink-2">{upper.focus}</p>
            <p className="mt-2 text-xs text-ink-3">Aufwärmen: {UPPER_WARMUP}</p>
            <p className="mt-2 text-xs text-ink-3">
              Am besten 1–2 Mal pro Woche, A und B im Wechsel. Oberkörper wirkt sich nicht auf deine Readiness oder die nächsten Läufe aus und passt deshalb an jeden Tag, auch vor harten Einheiten.
            </p>
          </Card>
          {upper.steps.map((x, i) => (
            <ExerciseCard
              key={x.ex.id}
              n={i + 1}
              s={x}
              track={{
                done: doneSets[x.ex.id] ?? 0,
                onSet: (k) => toggleSet(x.ex.id, k, i),
              }}
            />
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
          {stabi.steps.map((x, i) => (
            <ExerciseCard key={x.ex.id} n={i + 1} s={x} hard={level === 'hard'} />
          ))}
        </>
      )}

      <Card title="Kein Kreuzheben">
        <p className="text-sm text-ink-2">{NO_DEADLIFT}</p>
      </Card>

      <Card title="Warum das Sinn ergibt" subtitle={which === 'upper' ? 'Was Studien zu Muskelaufbau und Laufen zeigen' : 'Was Studien zu Krafttraining für Läufer zeigen'}>
        <div className="space-y-3">
          {(which === 'upper' ? UPPER_EVIDENCE : STRENGTH_EVIDENCE).map((e) => (
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

function ExerciseCard({ n, s, hard, track }: { n: number; s: Prescribed; hard?: boolean; track?: { done: number; onSet: (i: number) => void } }) {
  const sets = setsOf(s.dose)
  const complete = track && track.done >= sets
  const [open, setOpen] = useState(!track)
  // Gewicht pro Übung wird auf dem Gerät gemerkt, als Startwert fürs nächste Mal.
  const kgKey = `gym.kg.${s.ex.id}`
  const [kg, setKg] = useState<string>(() => readStore(kgKey, ''))
  return (
    <Card className={complete ? 'opacity-70' : ''}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={complete ? { background: 'var(--good)', color: 'var(--surface-solid)' } : { background: 'var(--surface-2)' }}
        >
          {complete ? '✓' : n}
        </span>
        <div className="min-w-0 flex-1">
          <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2 text-left" disabled={!track}>
            <span className="text-[15px] font-semibold">{s.ex.name}</span>
            <Pill color="var(--series-4)">{s.dose}</Pill>
          </button>
          <div className="mt-0.5 text-xs text-ink-3">{s.ex.target}</div>
          {track && (
            <div className="mt-3 flex items-center gap-2">
              {Array.from({ length: sets }, (_, i) => (
                <button
                  key={i}
                  onClick={() => track.onSet(i)}
                  aria-pressed={i < track.done}
                  aria-label={`Satz ${i + 1} ${i < track.done ? 'erledigt' : 'offen'}`}
                  className={`h-11 max-w-16 min-w-11 flex-1 rounded-full text-sm font-semibold tabular-nums transition-colors duration-200 ${i < track.done ? 'btn-primary' : 'bg-surface-2 text-ink-2'}`}
                >
                  {i < track.done ? '✓' : i + 1}
                </button>
              ))}
              <label className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
                <input
                  inputMode="decimal"
                  value={kg}
                  placeholder="–"
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.,]/g, '').slice(0, 5)
                    setKg(v)
                    writeStore(kgKey, v)
                  }}
                  className="h-11 w-16 rounded-xl border border-line bg-surface-solid text-center font-semibold text-ink tabular-nums"
                  aria-label={`Gewicht für ${s.ex.name} in kg`}
                />
                kg
              </label>
            </div>
          )}
          {open && (
            <>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm text-ink-2">
                {s.ex.how.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
              {s.ex.easier && <p className="mt-2 text-xs text-ink-2">Leichter: {s.ex.easier}</p>}
              {(hard || track) && s.ex.harder && <p className="mt-1 text-xs text-ink-2">Schwerer: {s.ex.harder}</p>}
              <p className="mt-2 text-xs text-ink-3">{s.ex.why}</p>
            </>
          )}
          {track && !open && (
            <button onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-accent">
              So geht's und warum
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Pause nach einem Satz: läuft rückwärts, vibriert am Ende kurz. */
function RestTimer({ total, onDone }: { total: number; onDone: () => void }) {
  const [left, setLeft] = useState(total)
  useEffect(() => {
    // Gemessen an der echten Uhr, damit die Pause auch bei gesperrtem Bildschirm stimmt.
    const end = performance.now() + total * 1000
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((end - performance.now()) / 1000))), 250)
    return () => clearInterval(id)
  }, [total])
  useEffect(() => {
    if (left > 0) return
    tap(200)
    const id = setTimeout(onDone, 1500)
    return () => clearTimeout(id)
  }, [left, onDone])
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-2.5" role="timer" aria-live="off">
      <span className="font-display text-xl font-semibold tabular-nums">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </span>
      <span className="flex-1 text-sm text-ink-2">{left > 0 ? 'Pause' : "Weiter geht's"}</span>
      <button onClick={onDone} className="min-h-9 rounded-full px-3 text-sm font-semibold text-accent">
        Überspringen
      </button>
    </div>
  )
}

function DumbbellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />
    </svg>
  )
}
