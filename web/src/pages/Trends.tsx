import { useMemo, useState } from 'react'
import { HrvChart, IntensityChart, SimpleLineChart, SleepChart, WeeklyDistanceChart, WeeklyDrinksChart, WeeklyTimeChart } from '../components/charts'
import { Card, Section, Segmented } from '../components/ui'
import { sportGroup, weekStart } from '../lib/format'
import { lastDays, weeklyTotals } from '../lib/derive'
import { avg, hoursMin } from '../lib/format'
import type { DrinksByDate, GymByDate } from '../lib/dailyLog'
import { addDays } from '../lib/plan/dates'
import { readinessSeries } from '../lib/readiness'
import type { Dataset } from '../lib/types'

type Range = '4w' | '3m' | '6m'
const RANGE_DAYS: Record<Range, number> = { '4w': 28, '3m': 91, '6m': 182 }

export function Trends({ data, drinks, gym }: { data: Dataset; drinks: DrinksByDate; gym?: GymByDate }) {
  const [range, setRange] = useState<Range>('3m')
  const n = RANGE_DAYS[range]
  const days = lastDays(data.days, n)
  const weeks = weeklyTotals(data.activities, Math.ceil(n / 7) - 1)
  const h = (s: number | null) => (s ?? 0) / 3600
  const avgSleep = avg(days.map((d) => d.sleep_s))
  const avgHrv = avg(days.map((d) => d.hrv_last_night))
  const avgRhr = avg(days.map((d) => d.resting_hr))
  const avgKm = avg(weeks.slice(0, -1).map((w) => w.km))
  const allReadiness = useMemo(() => readinessSeries(data.days, data.activities, drinks, gym), [data, drinks, gym])
  const readiness = allReadiness.slice(-n)
  const avgReady = avg(readiness.map((d) => d.value))
  const drinkWeeks = weeks.map((w) => ({ week: w.week, drinks: [0, 1, 2, 3, 4, 5, 6].reduce((s, i) => s + (drinks[addDays(w.week, i)] ?? 0), 0) }))
  const hasDrinks = Object.keys(drinks).length > 0

  // Vergleich mit dem Zeitraum davor (soweit geladen).
  const prevDays = data.days.slice(-2 * n, -n)
  const prevReady = avg(allReadiness.slice(-2 * n, -n).map((d) => d.value))
  const prevHrv = avg(prevDays.map((d) => d.hrv_last_night))
  const prevRhr = avg(prevDays.map((d) => d.resting_hr))
  const prevSleep = avg(prevDays.map((d) => d.sleep_s))

  // Laufzeit nach Intensität: Zone 1–3 locker, 4–5 hart.
  const intensity = weeks.map((w) => ({ week: w.week, easy: 0, hard: 0 }))
  for (const a of data.activities) {
    if (sportGroup(a.sport) !== 'run' || !a.hr_zones_s) continue
    const row = intensity.find((x) => x.week === weekStart(a.local_date))
    if (!row) continue
    const z = a.hr_zones_s.map((x) => (x ?? 0) / 3600)
    row.easy += z[0] + z[1] + z[2]
    row.hard += z[3] + z[4]
  }
  const easySum = intensity.reduce((s, x) => s + x.easy, 0)
  const hardSum = intensity.reduce((s, x) => s + x.hard, 0)
  const easyShare = easySum + hardSum > 0 ? Math.round((easySum / (easySum + hardSum)) * 100) : null

  return (
    <div className="page-in space-y-3">
      <div>
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '4w', label: '4 Wochen' },
            { value: '3m', label: '3 Monate' },
            { value: '6m', label: '6 Monate' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Readiness" value={avgReady != null ? Math.round(avgReady) : null} prev={prevReady} />
        <Kpi label="Lauf-km pro Woche" value={avgKm != null ? Math.round(avgKm * 10) / 10 : null} />
        <Kpi label="HRV" value={avgHrv != null ? Math.round(avgHrv) : null} unit="ms" prev={prevHrv} />
        <Kpi label="Ruhepuls" value={avgRhr != null ? Math.round(avgRhr) : null} unit="bpm" prev={prevRhr} lowerIsBetter />
      </div>

      <Section title="Erholung">
        <Card title="Deine Readiness" subtitle={avgReady != null ? `Ø ${Math.round(avgReady)} von 100` : 'Noch nicht genug Daten'}>
          <SimpleLineChart name="Readiness" unit="" data={readiness} />
        </Card>

        <Card title="Schlaf" subtitle={avgSleep != null ? `Ø ${hoursMin(avgSleep)} pro Nacht${prevSleep != null ? ` · ${delta((avgSleep - prevSleep) / 60, ' min')} ggü. davor` : ''}` : undefined}>
          <SleepChart
            data={days.map((d) => ({ date: d.date, deep: h(d.deep_sleep_s), light: h(d.light_sleep_s), rem: h(d.rem_sleep_s), awake: h(d.awake_s) }))}
          />
        </Card>

        <Card title="HRV" subtitle={avgHrv != null ? `Ø ${Math.round(avgHrv)} ms` : undefined}>
          <HrvChart
            data={days.map((d) => ({
              date: d.date,
              hrv: d.hrv_last_night,
              band: d.hrv_baseline_low != null && d.hrv_baseline_high != null ? [d.hrv_baseline_low, d.hrv_baseline_high] : null,
            }))}
          />
        </Card>

        <Card title="Ruhepuls" subtitle={avgRhr != null ? `Ø ${Math.round(avgRhr)} bpm` : undefined}>
          <SimpleLineChart name="Ruhepuls" unit="bpm" color="var(--series-2)" data={days.map((d) => ({ date: d.date, value: d.resting_hr }))} />
        </Card>
      </Section>

      <Section title="Training">
        <Card title="Laufumfang pro Woche" subtitle={avgKm != null ? `Ø ${avgKm.toFixed(1).replace('.', ',')} km` : undefined}>
          <WeeklyDistanceChart data={weeks} />
        </Card>

        {easyShare != null && (
          <Card title="Intensität beim Laufen" subtitle={`${easyShare} % locker. Ziel: etwa 80 % locker.`}>
            <IntensityChart data={intensity.map((x) => ({ ...x, easy: Math.round(x.easy * 100) / 100, hard: Math.round(x.hard * 100) / 100 }))} />
          </Card>
        )}

        <Card title="Trainingszeit pro Woche" subtitle="nach Sportart">
          <WeeklyTimeChart data={weeks} />
        </Card>

        <Card title="VO2max (Laufen)">
          <SimpleLineChart name="VO2max" unit="" color="var(--series-3)" data={days.map((d) => ({ date: d.date, value: d.vo2max_running }))} />
        </Card>

        {hasDrinks && (
          <Card title="Alkohol pro Woche" subtitle="Getränke, nur eingetragene Abende">
            <WeeklyDrinksChart data={drinkWeeks} />
          </Card>
        )}
      </Section>
    </div>
  )
}

const delta = (x: number, unit = '') => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(Math.round(x)).toLocaleString('de-DE')}${unit}`

/** Kennzahl des Zeitraums mit Veränderung zum Zeitraum davor. */
function Kpi({ label, value, unit, prev, lowerIsBetter }: { label: string; value: number | null; unit?: string; prev?: number | null; lowerIsBetter?: boolean }) {
  const d = value != null && prev != null ? value - prev : null
  const better = d != null && Math.round(d) !== 0 ? (lowerIsBetter ? d < 0 : d > 0) : null
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-ink-2">Ø {label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[26px] leading-none font-semibold tracking-tight">{value != null ? value.toLocaleString('de-DE') : '–'}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
      </div>
      {d != null && (
        <div className="mt-2 text-xs font-medium" style={{ color: better == null ? 'var(--text-3)' : better ? 'var(--good)' : 'var(--serious)' }}>
          {better == null ? '' : d > 0 ? '↑ ' : '↓ '}
          {delta(d)} ggü. davor
        </div>
      )}
    </div>
  )
}
