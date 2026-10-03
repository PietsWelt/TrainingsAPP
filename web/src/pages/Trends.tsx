import { useMemo, useState } from 'react'
import { DriftChart, EfficiencyChart, FitnessChart, HrvChart, IntensityChart, SimpleLineChart, SleepChart, WeeklyDistanceChart, WeeklyDrinksChart, WeeklyTimeChart } from '../components/charts'
import { Card, Section, Segmented, StatusLabel } from '../components/ui'
import { fitnessSeries, formZone } from '../lib/fitness'
import { localToday } from '../lib/plan/dates'
import type { PlanState } from '../lib/plan/usePlan'
import { sportGroup, weekStart } from '../lib/format'
import { lastDays, weeklyTotals } from '../lib/derive'
import { avg, hoursMin } from '../lib/format'
import type { DrinksByDate, GymByDate } from '../lib/dailyLog'
import { addDays } from '../lib/plan/dates'
import { readinessSeries } from '../lib/readiness'
import type { Dataset } from '../lib/types'
import { AetCard } from './AetCard'
import { LactateCard } from './LactateCard'
import { WeekReviewButton } from './WeekReview'

type Range = '4w' | '3m' | '6m'
const RANGE_DAYS: Record<Range, number> = { '4w': 28, '3m': 91, '6m': 182 }

export function Trends({ data, drinks, gym, plan }: { data: Dataset; drinks: DrinksByDate; gym?: GymByDate; plan?: PlanState }) {
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
  // Fitness und Form, mit Plan fortgeschrieben bis zum nächsten Rennen (höchstens 26 Wochen).
  const today = localToday()
  const race = plan?.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
  const raceDay = race && race.date <= addDays(today, 182) ? race.date : undefined
  const fitness = useMemo(
    () => fitnessSeries(data.activities, plan?.workouts.filter((w) => !raceDay || w.date <= raceDay) ?? [], addDays(today, -n + 1), raceDay ?? today, today),
    [data.activities, plan?.workouts, n, raceDay, today],
  )
  const formToday = fitness.find((d) => d.date === today)
  const formRace = raceDay ? fitness.at(-1) : undefined

  // Aerobe Effizienz lockerer Läufe (ab 30 min, kaum anaerob): Meter pro Herzschlag, Wochenschnitt.
  // Mit steigungsbereinigter Pace, damit hügelige Strecken den Trend nicht verzerren.
  const effWeeks = weeks.map((w) => ({ date: w.week, sum: 0, n: 0 }))
  for (const a of data.activities) {
    if (sportGroup(a.sport) !== 'run' || !a.avg_hr || !a.avg_speed_mps || (a.duration_s ?? 0) < 1800 || (a.anaerobic_te ?? 0) >= 1.5) continue
    const row = effWeeks.find((x) => x.date === weekStart(a.local_date))
    if (row) {
      row.sum += (a.avg_speed_mps * (a.gap_factor ?? 1) * 60) / a.avg_hr
      row.n++
    }
  }
  const efficiency = effWeeks.map((x) => ({ date: x.date, value: x.n ? Math.round((x.sum / x.n) * 100) / 100 : null }))
  const effVals = efficiency.filter((x) => x.value != null).map((x) => x.value!)
  const effChange = effVals.length >= 4 ? Math.round(((effVals.at(-1)! - effVals[0]) / effVals[0]) * 1000) / 10 : null
  const drift = data.activities
    .filter((a) => a.decoupling_pct != null && a.local_date >= addDays(today, -n + 1))
    .map((a) => ({ date: a.local_date, drift: a.decoupling_pct! }))
    .reverse()
  const driftAvg = avg(drift.map((d) => d.drift))

  const easySum = intensity.reduce((s, x) => s + x.easy, 0)
  const hardSum = intensity.reduce((s, x) => s + x.hard, 0)
  const easyShare = easySum + hardSum > 0 ? Math.round((easySum / (easySum + hardSum)) * 100) : null

  return (
    <div className="page-in desk-cols space-y-3">
      {plan && <div className="span-all"><WeekReviewButton data={data} plan={plan} log={{ drinks, gym: gym ?? {} }} /></div>}
      <div className="span-all">
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
          <SimpleLineChart name="Ruhepuls" unit="bpm" color="var(--c-erh)" data={days.map((d) => ({ date: d.date, value: d.resting_hr }))} />
        </Card>
      </Section>

      <Section title="Training">
        <Card
          title="Fitness und Form"
          subtitle={formToday ? `Form heute ${formToday.form > 0 ? '+' : ''}${formToday.form}${formRace ? ` · am Renntag laut Plan ${formRace.form > 0 ? '+' : ''}${formRace.form}` : ''}` : undefined}
        >
          {formToday && (
            <p className="mb-2 text-sm">
              <StatusLabel status={formZone(formToday.form).status}>{formZone(formToday.form).label}</StatusLabel>
              <span className="text-ink-2"> · {formZone(formToday.form).text}</span>
            </p>
          )}
          <FitnessChart data={fitness} today={today} race={raceDay} />
          <p className="mt-2 text-xs text-ink-3">
            Aus Garmins Trainingslast aller Sportarten.{raceDay && ` Gestrichelt: geschätzt aus deinem Plan bis ${race?.name}. Für das Rennen ist eine Form zwischen +5 und +25 ideal.`}
          </p>
        </Card>

        {(effVals.length >= 2 || drift.length > 0) && (
          <Card
            title="Aerobe Form"
            subtitle={[
              effChange != null ? `Effizienz ${effChange > 0 ? '+' : ''}${effChange.toLocaleString('de-DE')} % im Zeitraum` : null,
              driftAvg != null ? `Ø Puls-Drift ${driftAvg.toFixed(1).replace('.', ',')} %` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            {effVals.length >= 2 && (
              <>
                <div className="text-xs font-medium text-ink-2">Meter pro Herzschlag bei lockeren Läufen, Steigung herausgerechnet (steigend = fitter)</div>
                <EfficiencyChart data={efficiency} />
              </>
            )}
            {drift.length > 0 ? (
              <>
                <div className="mt-3 text-xs font-medium text-ink-2">Puls-Drift pro Lauf ab 30 min (unter 5 % = stabile Grundlage)</div>
                <DriftChart data={drift} />
              </>
            ) : (
              <p className="mt-2 text-xs text-ink-3">Die Puls-Drift erscheint nach dem nächsten Sync.</p>
            )}
          </Card>
        )}

        <AetCard activities={data.activities} from={addDays(today, -n + 1)} />

        <LactateCard activities={data.activities} lactate={data.lactate} today={today} from={addDays(today, -n + 1)} />

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
