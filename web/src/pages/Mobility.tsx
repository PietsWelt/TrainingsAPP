import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { Card, Pill, Segmented } from '../components/ui'
import { tap } from '../lib/haptics'
import { BEGINNER_TIPS, buildRoutine, DOSE, EVIDENCE, LEVELS, routineKind, type Level, type RoutineKind } from '../lib/mobility'
import { toast } from '../lib/toast'
import type { Activity } from '../lib/types'

const LEVEL_KEY = 'mobility.level'
const DONE_KEY = 'mobility.done'

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ohne Speicher bleibt es bei der Sitzung
  }
}

const TYPE_LABEL = { roll: 'Rolle', stretch: 'Dehnen', mobility: 'Mobilität' } as const
const TYPE_COLOR = { roll: 'var(--series-2)', stretch: 'var(--accent)', mobility: 'var(--series-3)' } as const

/** Auf „Heute“: Nach jedem Training die passende Routine vorschlagen. */
export function MobilityCard({ activities, today }: { activities: Activity[]; today: string }) {
  const [done, setDone] = useState<number[]>(() => read(DONE_KEY, []))
  const [open, setOpen] = useState(false)
  const level = read<Level>(LEVEL_KEY, 'easy')
  const a = activities.find((x) => x.local_date === today && routineKind(x))
  if (!a) return null
  const kind = routineKind(a)!
  const r = buildRoutine(kind, level)
  const isDone = done.includes(a.id)

  return (
    <>
      <Card>
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: isDone ? 'var(--good)' : 'var(--series-2)' }}
            aria-hidden
          >
            {isDone ? '✓' : '↻'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">{isDone ? 'Dehnen erledigt' : 'Dehnen & Faszienrolle'}</div>
            <div className="text-xs text-ink-2">
              {r.title} · {LEVELS.find((l) => l.value === level)?.label} · {r.minutes} min
            </div>
          </div>
          <button onClick={() => setOpen(true)} className={`min-h-10 shrink-0 rounded-full px-3.5 text-sm font-medium ${isDone ? 'bg-surface-2 text-ink-2' : 'btn-primary'}`}>
            {isDone ? 'Ansehen' : 'Starten'}
          </button>
        </div>
      </Card>
      {open && (
        <MobilitySheet
          kind={kind}
          done={isDone}
          onClose={() => setOpen(false)}
          onDone={() => {
            const next = [a.id, ...done.filter((x) => x !== a.id)].slice(0, 60)
            write(DONE_KEY, next)
            setDone(next)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

/** Knopf in der Aktivitäts-Ansicht, damit die Routine auch später noch erreichbar ist. */
export function MobilityButton({ activity }: { activity: Activity }) {
  const [open, setOpen] = useState(false)
  const kind = routineKind(activity)
  if (!kind) return null
  return (
    <>
      <button onClick={() => setOpen(true)} className="min-h-12 w-full rounded-xl bg-surface-2 text-[15px] font-semibold text-accent">
        Dehnen & Faszienrolle danach
      </button>
      {open && <MobilitySheet kind={kind} onClose={() => setOpen(false)} />}
    </>
  )
}

export function MobilitySheet({ kind, done = false, onClose, onDone }: { kind: RoutineKind; done?: boolean; onClose: () => void; onDone?: () => void }) {
  const [level, setLevel] = useState<Level>(() => read(LEVEL_KEY, 'easy'))
  const r = buildRoutine(kind, level)

  return (
    <Sheet
      title="Dehnen & Rolle"
      onClose={onClose}
      footer={
        onDone && (
          <button
            onClick={() => {
              tap()
              toast(done ? 'Schon als erledigt gespeichert.' : 'Gespeichert: Dehnen erledigt.')
              onDone()
            }}
            className="min-h-12 w-full rounded-xl btn-primary text-[15px] font-semibold"
          >
            {done ? 'Erledigt ✓' : 'Erledigt'}
          </button>
        )
      }
    >
      <Segmented
        value={level}
        onChange={(v) => {
          tap()
          setLevel(v)
          write(LEVEL_KEY, v)
        }}
        options={LEVELS}
      />

      <Card title={r.title} subtitle={`${r.steps.length} Übungen · etwa ${r.minutes} min`}>
        <p className="text-sm text-ink-2">{r.note}</p>
        <p className="mt-2 text-xs text-ink-3">{DOSE[level].text} Deine Stufe bleibt gespeichert.</p>
      </Card>

      {r.steps.map((s, i) => (
        <Card key={s.ex.id}>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold">{s.name}</span>
                <Pill color={TYPE_COLOR[s.ex.type]}>{TYPE_LABEL[s.ex.type]}</Pill>
              </div>
              <div className="mt-0.5 text-xs text-ink-3">
                {s.ex.target} · <span className="font-medium text-ink">{s.dose}</span>
              </div>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-ink-2">
                {s.how.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-ink-3">{s.ex.why}</p>
            </div>
          </div>
        </Card>
      ))}

      <Card title="Tipps für den Anfang">
        <ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">
          {BEGINNER_TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Card>

      <Card title="Warum das Sinn ergibt" subtitle="Was Studien zu Dehnen und Faszienrolle zeigen">
        <div className="space-y-3">
          {EVIDENCE.map((e) => (
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
