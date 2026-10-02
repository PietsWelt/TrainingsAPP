import { useMemo, useState } from 'react'
import { HrvChart, SimpleLineChart, SleepChart, WeeklyDistanceChart, WeeklyDrinksChart, WeeklyTimeChart } from '../components/charts'
import { Card, Segmented } from '../components/ui'
import { lastDays, weeklyTotals } from '../lib/derive'
import { avg, hoursMin } from '../lib/format'
import type { DrinksByDate } from '../lib/dailyLog'
import { addDays } from '../lib/plan/dates'
import { readinessSeries } from '../lib/readiness'
import type { Dataset } from '../lib/types'

type Range = '4w' | '3m' | '6m'
const RANGE_DAYS: Record<Range, number> = { '4w': 28, '3m': 91, '6m': 182 }

export function Trends({ data, drinks }: { data: Dataset; drinks: DrinksByDate }) {
  const [range, setRange] = useState<Range>('3m')
  const n = RANGE_DAYS[range]
  const days = lastDays(data.days, n)
  const weeks = weeklyTotals(data.activities, Math.ceil(n / 7) - 1)
  const h = (s: number | null) => (s ?? 0) / 3600
  const avgSleep = avg(days.map((d) => d.sleep_s))
  const avgHrv = avg(days.map((d) => d.hrv_last_night))
  const avgRhr = avg(days.map((d) => d.resting_hr))
  const avgKm = avg(weeks.slice(0, -1).map((w) => w.km))
  const allReadiness = useMemo(() => readinessSeries(data.days, data.activities, drinks), [data, drinks])
  const readiness = allReadiness.slice(-n)
  const avgReady = avg(readiness.map((d) => d.value))
  const drinkWeeks = weeks.map((w) => ({ week: w.week, drinks: [0, 1, 2, 3, 4, 5, 6].reduce((s, i) => s + (drinks[addDays(w.week, i)] ?? 0), 0) }))
  const hasDrinks = Object.keys(drinks).length > 0

  return (
    <div className="space-y-3">
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

      <Card title="Deine Readiness" subtitle={avgReady != null ? `Ø ${Math.round(avgReady)} von 100` : 'Noch nicht genug Daten'}>
        <SimpleLineChart name="Readiness" unit="" data={readiness} />
      </Card>

      <Card title="Laufumfang pro Woche" subtitle={avgKm != null ? `Ø ${avgKm.toFixed(1).replace('.', ',')} km` : undefined}>
        <WeeklyDistanceChart data={weeks} />
      </Card>

      <Card title="Trainingszeit pro Woche" subtitle="nach Sportart">
        <WeeklyTimeChart data={weeks} />
      </Card>

      <Card title="Schlaf" subtitle={avgSleep != null ? `Ø ${hoursMin(avgSleep)} pro Nacht` : undefined}>
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
        <SimpleLineChart name="Ruhepuls" unit="bpm" data={days.map((d) => ({ date: d.date, value: d.resting_hr }))} />
      </Card>

      {hasDrinks && (
        <Card title="Alkohol pro Woche" subtitle="Getränke, nur eingetragene Abende">
          <WeeklyDrinksChart data={drinkWeeks} />
        </Card>
      )}

      <Card title="VO2max (Laufen)">
        <SimpleLineChart name="VO2max" unit="" data={days.map((d) => ({ date: d.date, value: d.vo2max_running }))} />
      </Card>
    </div>
  )
}
