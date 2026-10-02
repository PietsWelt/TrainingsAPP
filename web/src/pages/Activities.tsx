import { useState } from 'react'
import { ZoneBar } from '../components/charts'
import { Card, Segmented } from '../components/ui'
import { dateLabel, duration, km, speed, sportGroup, sportLabel, type SportGroup } from '../lib/format'
import type { Activity } from '../lib/types'

type Filter = 'all' | SportGroup
const GROUP_COLOR: Record<SportGroup, string> = { run: 'var(--series-1)', bike: 'var(--series-2)', swim: 'var(--series-3)', other: 'var(--series-4)' }

export function Activities({ activities, onOpen }: { activities: Activity[]; onOpen: (id: number) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const list = activities.filter((a) => filter === 'all' || sportGroup(a.sport) === filter)

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
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
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {list.slice(0, 100).map((a) => (
          <button key={a.id} onClick={() => onOpen(a.id)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 active:bg-surface-2">
            <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: GROUP_COLOR[sportGroup(a.sport)] }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">{a.name ?? sportLabel(a.sport)}</div>
              <div className="text-xs text-ink-3">
                {dateLabel(a.local_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {sportLabel(a.sport)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[15px] font-semibold">{km(a.distance_m, sportGroup(a.sport) === 'swim' ? 2 : 1)}</div>
              <div className="text-xs text-ink-3">{duration(a.duration_s)}</div>
            </div>
          </button>
        ))}
        {!list.length && <div className="p-6 text-center text-sm text-ink-3">Keine Aktivitäten</div>}
      </div>
    </div>
  )
}

export function ActivityDetail({ activity: a, onClose }: { activity: Activity; onClose: () => void }) {
  const g = sportGroup(a.sport)
  const rows: [string, string][] = [
    ['Distanz', km(a.distance_m, 2)],
    ['Zeit', duration(a.duration_s)],
    [g === 'bike' ? 'Ø Tempo' : 'Ø Pace', speed(a.avg_speed_mps, a.sport)],
    ['Ø Herzfrequenz', a.avg_hr ? `${a.avg_hr} bpm` : '–'],
    ['Max. Herzfrequenz', a.max_hr ? `${a.max_hr} bpm` : '–'],
    ['Höhenmeter', a.elevation_gain_m != null ? `${Math.round(a.elevation_gain_m)} m` : '–'],
    ['Ø Leistung', a.avg_power_w ? `${Math.round(a.avg_power_w)} W` : '–'],
    ['Trainingslast', a.training_load != null ? String(Math.round(a.training_load)) : '–'],
    ['Aerober Effekt', a.aerobic_te != null ? a.aerobic_te.toFixed(1).replace('.', ',') : '–'],
    ['Anaerober Effekt', a.anaerobic_te != null ? a.anaerobic_te.toFixed(1).replace('.', ',') : '–'],
    ['Kalorien', a.calories != null ? `${Math.round(a.calories)} kcal` : '–'],
  ]
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-2 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
        <button onClick={onClose} className="rounded-lg px-3 py-2 text-accent">‹ Zurück</button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-10">
        <div>
          <div className="text-xs text-ink-3">
            {sportLabel(a.sport)} · {dateLabel(a.start_time, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{a.name}</h1>
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
      </div>
    </div>
  )
}
