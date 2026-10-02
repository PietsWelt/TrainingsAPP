import { Card, Pill } from '../components/ui'
import { dateLabel, hoursMin, sportGroup, type SportGroup } from '../lib/format'
import { addDays, localToday } from '../lib/plan/dates'
import { DISTANCES, fmtPace, fmtTime, type Best } from '../lib/records'
import type { Activity } from '../lib/types'

const GROUP_COLOR: Record<SportGroup, string> = { run: 'var(--series-1)', bike: 'var(--series-2)', swim: 'var(--series-3)', other: 'var(--series-4)' }
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** Diese Woche: Minuten pro Tag als gestapelte Säulen nach Sportart. */
export function WeekCard({ activities, monday, km, hours }: { activities: Activity[]; monday: string; km: number; hours: number }) {
  const today = localToday()
  const days = DAY_SHORT.map((label, i) => {
    const date = addDays(monday, i)
    const parts: Record<SportGroup, number> = { run: 0, bike: 0, swim: 0, other: 0 }
    for (const a of activities) if (a.local_date === date) parts[sportGroup(a.sport)] += (a.duration_s ?? 0) / 60
    return { label, date, parts, total: Object.values(parts).reduce((s, x) => s + x, 0) }
  })
  const max = Math.max(60, ...days.map((d) => d.total))
  const count = activities.filter((a) => a.local_date >= monday).length
  return (
    <Card>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-ink-3">Diese Woche</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-[28px] leading-none font-semibold tracking-tight">{km.toLocaleString('de-DE')}</span>
            <span className="text-sm text-ink-3">km gelaufen</span>
          </div>
        </div>
        <div className="text-right text-xs text-ink-2">
          <div className="font-semibold text-ink">{hoursMin(hours * 3600)}</div>
          {count} {count === 1 ? 'Einheit' : 'Einheiten'}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2" role="img" aria-label={`Trainingszeit pro Tag, insgesamt ${hoursMin(hours * 3600)}`}>
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1.5">
            <div className="flex h-20 w-full flex-col-reverse overflow-hidden rounded-lg bg-surface-2">
              {(Object.keys(d.parts) as SportGroup[]).map((g) =>
                d.parts[g] ? <div key={g} style={{ height: `${(d.parts[g] / max) * 100}%`, background: GROUP_COLOR[g] }} /> : null,
              )}
            </div>
            <span className={`text-[11px] ${d.date === today ? 'font-bold text-ink' : 'text-ink-3'}`}>{d.label}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Bestzeiten je Strecke; antippen öffnet den Lauf, wenn er geladen ist. */
export function RecordsCard({ records, activities, onOpen }: { records: Best[]; activities: Activity[]; onOpen: (id: number) => void }) {
  const today = localToday()
  const main = DISTANCES.filter((d) => d.key !== '1k')
  const oneK = records.find((r) => r.key === '1k')
  return (
    <Card title="Bestzeiten" subtitle="Von Garmin und aus deinen Läufen" action={<TrophyIcon />}>
      <div className="grid grid-cols-2 gap-2">
        {main.map((d) => {
          const r = records.find((x) => x.key === d.key)
          const linked = r?.activity_id != null && activities.some((a) => a.id === r.activity_id)
          const fresh = r?.date != null && r.date >= addDays(today, -30)
          const body = (
            <>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-ink-2">{d.label}</span>
                {fresh && <Pill color="var(--good)">Neu</Pill>}
              </div>
              <div className="mt-1.5 text-[22px] leading-none font-semibold tracking-tight">{r ? fmtTime(r.time_s) : '–'}</div>
              <div className="mt-1.5 text-[11px] text-ink-3">{r ? `${fmtPace(r.time_s, r.meters)}${r.date ? ` · ${dateLabel(r.date, { month: 'short', year: '2-digit' })}` : ''}` : 'Noch kein Lauf'}</div>
            </>
          )
          return linked ? (
            <button key={d.key} onClick={() => onOpen(r!.activity_id!)} className="press-row rounded-2xl bg-surface-2 p-3 text-left">
              {body}
            </button>
          ) : (
            <div key={d.key} className="rounded-2xl bg-surface-2 p-3">
              {body}
            </div>
          )
        })}
      </div>
      {oneK && (
        <p className="mt-3 text-xs text-ink-2">
          Schnellster Kilometer: <span className="font-semibold text-ink">{fmtTime(oneK.time_s)}</span>
        </p>
      )}
    </Card>
  )
}

function TrophyIcon() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: 'var(--series-4)', background: 'color-mix(in srgb, var(--series-4) 15%, transparent)' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 21h8m-4-4v4m-5-17h10v5a5 5 0 0 1-10 0V4Zm10 1h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
      </svg>
    </span>
  )
}
