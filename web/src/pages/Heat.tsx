import { useMemo, useState } from 'react'
import { Card, StatusLabel, type Status } from '../components/ui'
import { tap } from '../lib/haptics'
import { HEAT_EVIDENCE, heatAdvice, heatLevel, heatPace, heatPct, LEVEL_COLOR, LEVEL_TEXT, type HeatLevel } from '../lib/heat'
import { fmtPace } from '../lib/plan/generate'
import type { PlanWorkout, Step, WorkStep } from '../lib/plan/types'
import { geoChoice, setGeoChoice, useForecast, type GeoChoice, type HourWeather } from '../lib/weather'

const STATUS: Record<HeatLevel, Status> = { none: 'good', mild: 'good', moderate: 'warning', high: 'serious', extreme: 'critical' }
const SOURCE_TEXT = { device: 'an deinem Standort', last_run: 'am Startort deines letzten Laufs', demo: 'Beispielwetter' } as const
const STEP_NAME: Record<WorkStep['type'], string> = { warmup: 'Einlaufen', run: 'Laufen', recover: 'Pause', cooldown: 'Auslaufen' }

/** Alle Zieltempos des Laufs als „Name: Tempo“, ohne Doppelte. */
function paceTargets(steps: Step[] | null | undefined): { name: string; pace: number; slow?: number }[] {
  const flat = (steps ?? []).flatMap((s) => (s.type === 'repeat' ? s.steps : [s])).filter((s) => s.pace)
  const seen = new Set<string>()
  const out: { name: string; pace: number; slow?: number }[] = []
  for (const s of flat) {
    const name = s.type === 'run' ? (s.note ?? STEP_NAME.run) : STEP_NAME[s.type]
    const key = `${name}|${s.pace}|${s.pace_slow ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, pace: s.pace!, slow: s.pace_slow })
  }
  return out
}

const fmt = (t: { pace: number; slow?: number }, pct: number) =>
  t.slow ? `${fmtPace(heatPace(t.pace, pct))}–${fmtPace(heatPace(t.slow, pct))}/km` : `${fmtPace(heatPace(t.pace, pct))}/km`

/** Auf „Heute“, wenn ein Lauf geplant ist: Hitze-Effekt je Stunde und angepasste Zieltempos. */
export function HeatCard({ workout }: { workout: PlanWorkout | undefined }) {
  const [choice, setChoice] = useState<GeoChoice>(geoChoice)
  const forecast = useForecast(!!workout && choice != null, choice)
  const [picked, setPicked] = useState<string | null>(null)
  const [why, setWhy] = useState(false)
  const [now] = useState(() => new Date())

  const hours = useMemo(() => {
    if (!forecast) return []
    const pad = (x: number) => String(x).padStart(2, '0')
    const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`
    // Die nächsten Stunden zwischen 5 und 22 Uhr; am späten Abend geht es am nächsten Morgen weiter.
    return forecast.hours.filter((h) => h.time >= from && Number(h.time.slice(11, 13)) >= 5 && Number(h.time.slice(11, 13)) <= 22).slice(0, 14)
  }, [forecast, now])

  if (!workout) return null

  if (choice == null) {
    const pick = (v: 'yes' | 'no') => {
      tap()
      setGeoChoice(v)
      setChoice(v)
    }
    return (
      <Card title="Wetter für deinen Lauf" subtitle="Hitze und Schwüle machen gleiche Anstrengung langsamer">
        <p className="text-sm text-ink-2">Soll die App das Wetter an deinem aktuellen Standort prüfen? Sonst nimmt sie den Startort deines letzten Laufs.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => pick('yes')} className="min-h-11 rounded-xl bg-accent text-[15px] font-semibold text-white">Standort nutzen</button>
          <button onClick={() => pick('no')} className="min-h-11 rounded-xl bg-surface-2 text-[15px] font-semibold">Ohne Standort</button>
        </div>
      </Card>
    )
  }

  if (forecast === undefined) return <Card title="Wetter für deinen Lauf"><div className="h-16 animate-pulse rounded-xl bg-surface-2" /></Card>
  if (!forecast || !hours.length) return null

  const withPct = hours.map((h) => ({ ...h, pct: heatPct(h.temp, h.dew) }))
  const coolest = withPct.reduce((a, b) => (b.pct < a.pct || (b.pct === a.pct && b.temp < a.temp) ? b : a))
  const sel = withPct.find((h) => h.time === picked) ?? withPct[0]
  const level = heatLevel(sel.pct)
  const maxPct = Math.max(...withPct.map((h) => h.pct))
  const targets = paceTargets(workout.steps)
  const today = hours[0]?.time.slice(0, 10)
  const firstTomorrow = hours.find((x) => x.time.slice(0, 10) !== today)?.time
  const hour = (h: HourWeather) => `${h.time.slice(0, 10) !== today ? 'Morgen ' : ''}${Number(h.time.slice(11, 13))} Uhr`
  const at = (h: HourWeather) => `${h.time.slice(0, 10) !== today ? 'morgen ' : ''}um ${Number(h.time.slice(11, 13))} Uhr`

  return (
    <Card title="Wetter für deinen Lauf" subtitle={`${SOURCE_TEXT[forecast.source]} · tippe auf eine Uhrzeit`}>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="listbox" aria-label="Stunden">
        {withPct.map((h) => {
          const active = h.time === sel.time
          return (
            <button
              key={h.time}
              role="option"
              aria-selected={active}
              onClick={() => {
                tap()
                setPicked(h.time)
              }}
              className={`flex min-h-16 min-w-11 flex-1 flex-col items-center justify-end gap-1 rounded-xl px-1 py-1.5 text-[11px] transition-colors ${active ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-3'}`}
            >
              <span className="text-ink">{Math.round(h.temp)}°</span>
              <span className="w-full rounded-full" style={{ height: 4 + Math.min(h.pct, 10) * 2.4, background: LEVEL_COLOR[heatLevel(h.pct)] }} />
              <span>{Number(h.time.slice(11, 13))}</span>
              <span className="h-3 text-[10px] leading-3 text-ink-3">{h.time === firstTomorrow ? 'morgen' : ''}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <div className="text-[15px] font-semibold">
          <StatusLabel status={STATUS[level]}>{LEVEL_TEXT[level]}</StatusLabel>
        </div>
        <div className="text-xs text-ink-3">
          {hour(sel)}: {Math.round(sel.temp)} °C, Taupunkt {Math.round(sel.dew)} °C
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        {sel.pct > 0 ? `Gleiche Anstrengung ist etwa ${sel.pct.toLocaleString('de-DE')} % langsamer. ` : ''}
        {heatAdvice(sel.pct)}
      </p>

      {sel.pct > 0 && targets.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {targets.map((t) => (
            <li key={`${t.name}${t.pace}`} className="flex items-baseline justify-between gap-3">
              <span className="text-ink-2">{t.name}</span>
              <span>
                <span className="text-ink-3 line-through">{fmt(t, 0)}</span> <span className="font-semibold">{fmt(t, sel.pct)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {maxPct > 0 && coolest.time !== sel.time && coolest.pct < sel.pct && (
        <p className="mt-2 text-xs text-ink-3">
          Am angenehmsten {at(coolest)}: {Math.round(coolest.temp)} °C{coolest.pct > 0 ? `, etwa ${coolest.pct.toLocaleString('de-DE')} % langsamer` : ', kein Hitze-Effekt'}.
        </p>
      )}
      {sel.pct > 0 && <p className="mt-2 text-xs text-ink-3">Auf der Uhr stehen die normalen Zielwerte. Lauf nach Gefühl entsprechend langsamer; die Auswertung danach berücksichtigt das Wetter.</p>}

      <button onClick={() => setWhy((x) => !x)} className="mt-2 min-h-10 text-sm font-medium text-accent" aria-expanded={why}>
        {why ? 'Weniger' : 'Warum langsamer?'}
      </button>
      {why && (
        <div className="space-y-3 pb-1">
          {HEAT_EVIDENCE.map((e) => (
            <div key={e.title}>
              <div className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{e.title}</div>
              <p className="mt-1 text-sm text-ink-2">{e.text}</p>
              <p className="mt-1 text-xs text-ink-3">Quellen: {e.source}</p>
            </div>
          ))}
          <button
            onClick={() => {
              const next = choice === 'yes' ? 'no' : 'yes'
              setGeoChoice(next)
              setChoice(next)
            }}
            className="min-h-10 text-xs text-ink-3 underline"
          >
            {choice === 'yes' ? 'Standort nicht mehr nutzen' : 'Doch den Standort nutzen'}
          </button>
        </div>
      )}
    </Card>
  )
}
