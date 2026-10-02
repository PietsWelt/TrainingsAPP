import { useState } from 'react'
import { MobilityButton } from './Mobility'
import { ZoneBar } from '../components/ZoneBar'
import { Sheet } from '../components/Sheet'
import { Card, Segmented, SportIcon } from '../components/ui'
import { dateLabel, duration, hoursMin, km, speed, sportGroup, sportLabel, weekStart, type SportGroup } from '../lib/format'
import type { Activity } from '../lib/types'

type Filter = 'all' | SportGroup

export function Activities({ activities, onOpen }: { activities: Activity[]; onOpen: (id: number) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const list = activities.filter((a) => filter === 'all' || sportGroup(a.sport) === filter).slice(0, 120)
  const weeks: [string, Activity[]][] = []
  for (const a of list) {
    const w = weekStart(a.local_date)
    if (weeks.at(-1)?.[0] === w) weeks.at(-1)![1].push(a)
    else weeks.push([w, [a]])
  }

  return (
    <div className="page-in space-y-3">
      <div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Alle' },
            { value: 'run', label: 'Laufen' },
            { value: 'bike', label: 'Rad' },
            { value: 'swim', label: 'Schwimmen' },
          ]}
        />
      </div>
      {weeks.map(([monday, acts]) => {
        const runKm = acts.filter((a) => sportGroup(a.sport) === 'run').reduce((x, a) => x + (a.distance_m ?? 0), 0)
        const time = acts.reduce((x, a) => x + (a.duration_s ?? 0), 0)
        return (
          <section key={monday} className="space-y-2">
            <div className="flex items-baseline justify-between px-1 pt-2">
              <h2 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Woche ab {dateLabel(monday)}</h2>
              <span className="text-xs text-ink-3">
                {runKm > 0 && `${km(runKm)} · `}
                {hoursMin(time)}
              </span>
            </div>
            <div className="card overflow-hidden">
              {acts.map((a) => (
                <button key={a.id} onClick={() => onOpen(a.id)} className="press-row flex min-h-16 w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0">
                  <SportIcon group={sportGroup(a.sport)} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{a.name ?? sportLabel(a.sport)}</div>
                    <div className="text-xs text-ink-3">
                      {dateLabel(a.local_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {duration(a.duration_s)}
                      {a.avg_hr ? ` · ${a.avg_hr} bpm` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-semibold">{km(a.distance_m, sportGroup(a.sport) === 'swim' ? 2 : 1)}</div>
                    <div className="text-xs text-ink-3">{speed(a.avg_speed_mps, a.sport)}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )
      })}
      {!list.length && <div className="card p-6 text-center text-sm text-ink-3">Keine Aktivitäten</div>}
    </div>
  )
}

export function ActivityDetail({ activity: a, onClose }: { activity: Activity; onClose: () => void }) {
  const g = sportGroup(a.sport)
  const rows: [string, string][] = [
    ['Ø Herzfrequenz', a.avg_hr ? `${a.avg_hr} bpm` : '–'],
    ['Max. Herzfrequenz', a.max_hr ? `${a.max_hr} bpm` : '–'],
    ['Höhenmeter', a.elevation_gain_m != null ? `${Math.round(a.elevation_gain_m)} m` : '–'],
    ['Ø Leistung', a.avg_power_w ? `${Math.round(a.avg_power_w)} W` : '–'],
    ['Trainingslast', a.training_load != null ? String(Math.round(a.training_load)) : '–'],
    ['Aerober Effekt', a.aerobic_te != null ? a.aerobic_te.toFixed(1).replace('.', ',') : '–'],
    ['Anaerober Effekt', a.anaerobic_te != null ? a.anaerobic_te.toFixed(1).replace('.', ',') : '–'],
    ...(a.decoupling_pct != null ? ([['Puls-Drift', `${a.decoupling_pct.toLocaleString('de-DE')} % ${a.decoupling_pct <= 5 ? '(stabil)' : '(hoch)'}`]] as [string, string][]) : []),
    ['Kalorien', a.calories != null ? `${Math.round(a.calories)} kcal` : '–'],
  ]
  return (
    <Sheet onClose={onClose}>
        <div className="flex items-center gap-3 pt-1">
          <SportIcon group={g} size={48} />
          <div className="min-w-0">
            <div className="text-xs text-ink-3">
              {sportLabel(a.sport)} · {dateLabel(a.start_time, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Distanz', km(a.distance_m, 2)],
            ['Zeit', duration(a.duration_s)],
            [g === 'bike' ? 'Tempo' : 'Pace', speed(a.avg_speed_mps, a.sport)],
          ].map(([k, v]) => (
            <div key={k} className="card px-3 py-3">
              <div className="text-[11px] text-ink-3">{k}</div>
              <div className="mt-0.5 text-[17px] font-semibold tracking-tight">{v}</div>
            </div>
          ))}
        </div>
        <Card>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-ink-3">{k}</dt>
                <dd className="text-[15px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {a.hr_zones_s && (
          <Card title="Zeit in Herzfrequenz-Zonen">
            <ZoneBar zones={a.hr_zones_s} />
          </Card>
        )}
        <MobilityButton activity={a} />
    </Sheet>
  )
}
