// Mehrere Rennen gleichzeitig: nach dem Hauptrennen fragen und zeigen, wie die anderen eingebaut sind.

import { useState } from 'react'
import { Card, Pill } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { dateLabel } from '../lib/format'
import { tap } from '../lib/haptics'
import { MINI_TAPER, PRIORITY_WHY, RECOVERY, type Arrangement } from '../lib/plan/multi'
import { eventTypeLabel, type RaceEvent } from '../lib/plan/types'

const STAR = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8L12 2.8Z" />
  </svg>
)
export const PrioStar = () => <span className="inline-flex align-[-1px]" style={{ color: 'var(--series-2)' }}>{STAR}</span>

/** Auswahl des Hauptrennens. */
function Choices({ upcoming, current, busy, onPick }: { upcoming: RaceEvent[]; current: string | null; busy: boolean; onPick: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {upcoming.map((e) => (
        <button
          key={e.id}
          disabled={busy}
          onClick={() => onPick(e.id)}
          className={`press-row flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${e.id === current ? 'border-accent bg-surface-2' : 'border-line bg-surface'}`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{e.name}</span>
            <span className="block text-xs text-ink-3">
              {eventTypeLabel(e.type)} · {dateLabel(e.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </span>
          {e.id === current && <PrioStar />}
        </button>
      ))}
    </div>
  )
}

function Why({ divider = true }: { divider?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={divider ? 'mt-3 border-t border-line pt-2' : ''}>
      <button onClick={() => setOpen(!open)} className="flex min-h-10 w-full items-center justify-between text-sm font-medium text-accent" aria-expanded={open}>
        Warum so? Die Wissenschaft dahinter
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-3">
          {PRIORITY_WHY.map((x) => (
            <div key={x.title}>
              <h4 className="text-[13px] font-semibold">{x.title}</h4>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{x.text}</p>
              <p className="mt-1 text-[11px] text-ink-3">{x.sources.join(' · ')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Frage, solange kein Hauptrennen gewählt ist. */
export function PriorityQuestion({ arr, upcoming, onPick }: { arr: Arrangement; upcoming: RaceEvent[]; onPick: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  if (!arr.multiple || arr.chosen) return null
  return (
    <Card title="Welches Rennen ist dir am wichtigsten?" subtitle={`${upcoming.length} Rennen laufen gleichzeitig`} className="span-all">
      <p className="mb-3 text-sm text-ink-2">
        Nach diesem Rennen richte ich den ganzen Plan aus, mit vollem Aufbau und Tapering. Die anderen baue ich ein: ein paar Tage leichter davor, Erholung danach.
        Bis du wählst, gilt <b>{arr.prio?.name}</b> als Hauptrennen (die längste Strecke).
      </p>
      <Choices
        upcoming={upcoming}
        current={null}
        busy={busy}
        onPick={async (id) => {
          tap()
          setBusy(true)
          try {
            await onPick(id)
          } finally {
            setBusy(false)
          }
        }}
      />
      <Why />
    </Card>
  )
}

/** Wie das gewählte Rennen mit den anderen zusammenspielt. */
export function PriorityCard({ arr, event, events, onChange }: { arr: Arrangement; event: RaceEvent; events: RaceEvent[]; onChange: () => void }) {
  const role = arr.roles.get(event.id)
  if (!arr.multiple || !role) return null
  const name = (id: string) => events.find((e) => e.id === id)?.name ?? ''
  const side = [...arr.roles].filter(([, r]) => r.kind === 'inside' && r.owner === event.id).map(([id]) => events.find((e) => e.id === id)!)

  let headline: string
  let text: string
  if (role.kind === 'main') {
    headline = 'Hauptrennen'
    text = side.length
      ? `Der Plan richtet sich ganz nach diesem Rennen. Eingebaut: ${side.map((e) => `${e.name} (${MINI_TAPER[e.type]} Tage leichter davor, ${RECOVERY[e.type]} Tage Erholung danach)`).join(', ')}.`
      : 'Der Plan richtet sich ganz nach diesem Rennen, mit vollem Aufbau und Tapering.'
  } else if (role.kind === 'own') {
    headline = 'Eigener Plan nach dem Hauptrennen'
    const prev = events.find((e) => e.id === role.after)
    text = `Der Aufbau beginnt am ${dateLabel(role.from, { day: 'numeric', month: 'long' })}, nach ${prev ? `${RECOVERY[prev.type]} Tagen Erholung von ${prev.name}` : 'der Erholung'}. Er startet auf dem Stand, den du bis dahin erreicht haben solltest.${side.length ? ` Eingebaut: ${side.map((e) => e.name).join(', ')}.` : ''}`
  } else {
    headline = `Nebenrennen im Plan für ${name(role.owner)}`
    text = `Kein eigener Plan, sonst würdest du doppelt trainieren. Davor ${MINI_TAPER[event.type]} Tage leichter, danach ${RECOVERY[event.type]} Tage Erholung ohne harte Einheiten.`
  }

  return (
    <Card
      title="Mehrere Rennen"
      action={
        <button onClick={onChange} className="min-h-9 shrink-0 rounded-full bg-surface-2 px-3 text-xs font-semibold text-ink-2">
          Priorität ändern
        </button>
      }
    >
      <div className="flex items-center gap-2">
        {role.kind === 'main' ? <PrioStar /> : null}
        <span className="text-[15px] font-semibold">{headline}</span>
        {role.kind === 'inside' && <Pill color="var(--text-3)">Nebenrennen</Pill>}
      </div>
      <p className="mt-1 text-sm text-ink-2">{text}</p>
      {role.kind === 'inside' &&
        role.warnings.map((w) => (
          <p key={w} className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]" style={{ color: 'var(--warning)' }}>
            ▲ {w}
          </p>
        ))}
      <Why />
    </Card>
  )
}

/** Hauptrennen ändern. */
export function PrioritySheet({ arr, upcoming, onPick, onClose }: { arr: Arrangement; upcoming: RaceEvent[]; onPick: (id: string) => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title="Hauptrennen wählen" onClose={onClose}>
      <p className="text-sm text-ink-2">
        Welches Rennen ist dir am wichtigsten? Danach wird der Plan ab morgen für alle Rennen neu abgestimmt. Erledigtes bleibt, Anpassungen an kommenden Einheiten werden neu berechnet.
      </p>
      <Choices
        upcoming={upcoming}
        current={arr.chosen ? (arr.prio?.id ?? null) : null}
        busy={busy}
        onPick={async (id) => {
          tap()
          setBusy(true)
          try {
            await onPick(id)
            onClose()
          } finally {
            setBusy(false)
          }
        }}
      />
      <Card className="py-2">
        <Why divider={false} />
      </Card>
    </Sheet>
  )
}
