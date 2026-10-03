// Gym-Verlauf: eigene Ansicht, getrennt von den Lauf-Trends. Pro Übung Kurve und letzte Trainings.

import { useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { Card } from '../components/ui'
import { cachedGymSets, exerciseHistory, fmtSets, loadGymSets, SESSION_LABEL, type GymSet } from '../lib/gymSets'
import { exerciseName } from '../lib/strength'

const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const num = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 })

export function GymHistorySheet({ onClose }: { onClose: () => void }) {
  const [sets, setSets] = useState<GymSet[] | null>(() => cachedGymSets())
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadGymSets().then(setSets, (e) => setError((e as Error).message))
  }, [])
  const sessions = sets ? [...new Map(sets.map((s) => [`${s.date}|${s.session}`, s])).values()].reverse().slice(0, 8) : []
  const exercises = sets ? exerciseHistory(sets) : []

  return (
    <Sheet title="Gym-Verlauf" onClose={onClose}>
      {error && <Card><p className="text-sm text-ink-2">{error}</p></Card>}
      {!sets && !error && <div className="p-10 text-center text-sm text-ink-3">Lade Verlauf …</div>}
      {sets && !sets.length && (
        <Card>
          <p className="text-sm text-ink-2">Noch keine Sätze gespeichert. Öffne auf „Heute“ unter Gym den Beintag oder Oberkörper, trag Gewicht und Wiederholungen ein und hake die Sätze ab. Mit „Training beenden und speichern“ landen sie hier.</p>
        </Card>
      )}
      {sessions.length > 0 && (
        <Card title="Letzte Trainings">
          <ul className="divide-y divide-[var(--border)]">
            {sessions.map((s) => {
              const day = sets!.filter((x) => x.date === s.date && x.session === s.session)
              const tonnage = day.reduce((t, x) => t + (x.kg ?? 0) * (x.reps ?? 0), 0)
              return (
                <li key={`${s.date}${s.session}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{SESSION_LABEL[s.session]}</span>
                    <span className="whitespace-nowrap text-ink-3"> · {dateLabel(s.date)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                    {plural(new Set(day.map((x) => x.exercise_id)).size, 'Übung', 'Übungen')} · {plural(day.length, 'Satz', 'Sätze')}{tonnage ? ` · ${num(tonnage)} kg` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {exercises.map((x) => (
        <Card key={x.id} title={exerciseName(x.id)} subtitle={x.weighted ? 'Linie: geschätztes Maximum für 1 Wiederholung' : 'Linie: meiste Wiederholungen in einem Satz'}>
          <Spark values={x.days.slice(-12).map((d) => d.best)} unit={x.weighted ? ' kg' : ' Wdh.'} />
          <ul className="mt-2 space-y-1 text-xs">
            {x.days
              .slice(-4)
              .reverse()
              .map((d) => (
                <li key={d.date} className="flex justify-between gap-3">
                  <span className="text-ink-3">{dateLabel(d.date)}</span>
                  <span className="text-ink-2 tabular-nums">{fmtSets(d.sets)}</span>
                </li>
              ))}
          </ul>
        </Card>
      ))}
      {exercises.length > 0 && (
        <p className="px-1 pb-4 text-xs text-ink-3">
          Das geschätzte Maximum rechnet Gewicht und Wiederholungen in einen Wert um (Epley-Formel), damit z.B. 20 kg × 10 und 22,5 kg × 8 vergleichbar sind. Es ist eine Schätzung für den Verlauf, kein Ziel zum Testen. Der Gym-Verlauf ändert nichts an deinem Laufplan.
        </p>
      )}
    </Sheet>
  )
}

/** Kleine Verlaufslinie, ohne Diagramm-Bibliothek. */
function Spark({ values, unit }: { values: number[]; unit: string }) {
  if (values.length < 2) return values.length ? <div className="text-xs text-ink-3">Ab dem zweiten Training siehst du hier eine Linie.</div> : null
  const w = 300
  const h = 56
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 8) + 4, h - 6 - ((v - lo) / span) * (h - 12)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = pts.at(-1)!
  const change = values.at(-1)! - values[0]
  return (
    <div className="flex items-center gap-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-14 min-w-0 flex-1" aria-hidden>
        <path d={d} fill="none" stroke="var(--series-4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="4" fill="var(--series-4)" />
      </svg>
      <div className="shrink-0 text-right">
        <div className="text-[15px] font-semibold tabular-nums">
          {num(values.at(-1)!)}
          {unit}
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: change > 0 ? 'var(--good)' : 'var(--ink-3)' }}>
          {change > 0 ? '+' : ''}
          {num(change)}
          {unit} seit Start
        </div>
      </div>
    </div>
  )
}
