import { useId } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dateLabel, hoursMin } from '../lib/format'
import { ChartTooltip } from './ChartTooltip'
import { Legend } from './ui'

const axis = { tick: { fill: 'var(--text-3)', fontSize: 11 }, axisLine: false, tickLine: false } as const
const grid = <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
const cursor = { fill: 'var(--surface-2)' }
const lineCursor = { stroke: 'var(--text-3)', strokeDasharray: '3 3' }
const shortDate = (l: string) => dateLabel(l)
const longDate = (l: string) => dateLabel(l, { weekday: 'short', day: 'numeric', month: 'short' })
const weekLabel = (l: string) => `Woche ab ${dateLabel(l)}`

export function WeeklyDistanceChart({ data }: { data: { week: string; km: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
        {grid}
        <XAxis dataKey="week" tickFormatter={shortDate} {...axis} minTickGap={16} />
        <YAxis {...axis} width={44} />
        <Tooltip cursor={cursor} content={<ChartTooltip labelFormat={weekLabel} valueFormat={(v) => `${v.toFixed(1).replace('.', ',')} km`} />} />
        <Bar isAnimationActive={false} dataKey="km" name="Laufen" fill="var(--series-1)" radius={[6, 6, 6, 6]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function WeeklyDrinksChart({ data }: { data: { week: string; drinks: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
        {grid}
        <XAxis dataKey="week" tickFormatter={shortDate} {...axis} minTickGap={16} />
        <YAxis {...axis} width={44} allowDecimals={false} />
        <Tooltip cursor={cursor} content={<ChartTooltip labelFormat={weekLabel} valueFormat={(v) => `${v} ${v === 1 ? 'Getränk' : 'Getränke'}`} />} />
        <Bar isAnimationActive={false} dataKey="drinks" name="Alkohol" fill="var(--series-4)" radius={[6, 6, 6, 6]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}

const SPORT_SERIES = [
  { key: 'run', label: 'Laufen', color: 'var(--series-1)' },
  { key: 'bike', label: 'Rad', color: 'var(--series-2)' },
  { key: 'swim', label: 'Schwimmen', color: 'var(--series-3)' },
  { key: 'other', label: 'Sonstiges', color: 'var(--series-4)' },
] as const

export function WeeklyTimeChart({ data }: { data: { week: string; run: number; bike: number; swim: number; other: number }[] }) {
  const used = SPORT_SERIES.filter((s) => data.some((d) => d[s.key] > 0))
  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
          {grid}
          <XAxis dataKey="week" tickFormatter={shortDate} {...axis} minTickGap={16} />
          <YAxis {...axis} width={44} tickFormatter={(v) => `${v}h`} />
          <Tooltip cursor={cursor} content={<ChartTooltip labelFormat={weekLabel} valueFormat={(v) => hoursMin(v * 3600)} />} />
          {used.map((s, i) => (
            <Bar
              isAnimationActive={false}
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="t"
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={1}
              maxBarSize={22}
              radius={i === used.length - 1 ? [6, 6, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Legend items={used.map((s) => ({ label: s.label, color: s.color }))} />
    </>
  )
}

const SLEEP_SERIES = [
  { key: 'deep', label: 'Tief', color: 'var(--series-1)' },
  { key: 'light', label: 'Leicht', color: 'var(--series-2)' },
  { key: 'rem', label: 'REM', color: 'var(--series-3)' },
  { key: 'awake', label: 'Wach', color: 'var(--series-4)' },
] as const

export function SleepChart({ data }: { data: { date: string; deep: number; light: number; rem: number; awake: number }[] }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }} barCategoryGap="20%">
          {grid}
          <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={24} />
          <YAxis {...axis} width={44} tickFormatter={(v) => `${v}h`} domain={[0, 'auto']} />
          <Tooltip cursor={cursor} content={<ChartTooltip labelFormat={longDate} valueFormat={(v) => hoursMin(v * 3600)} />} />
          {SLEEP_SERIES.map((s, i) => (
            <Bar
              isAnimationActive={false}
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="s"
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={data.length > 40 ? 0 : 1}
              radius={i === SLEEP_SERIES.length - 1 ? [3, 3, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Legend items={SLEEP_SERIES.map((s) => ({ label: s.label, color: s.color }))} />
    </>
  )
}

/** HRV pro Nacht mit Garmins persönlichem Normalbereich als Band. */
export function HrvChart({ data }: { data: { date: string; hrv: number | null; band: [number, number] | null }[] }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          {grid}
          <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={24} />
          <YAxis {...axis} width={44} domain={[(m: number) => Math.floor((m - 3) / 5) * 5, (m: number) => Math.ceil((m + 3) / 5) * 5]} allowDecimals={false} />
          <Tooltip cursor={lineCursor} content={<ChartTooltip labelFormat={longDate} valueFormat={(v) => `${v} ms`} />} />
          <Area isAnimationActive={false} dataKey="band" name="Normalbereich" fill="var(--band)" stroke="none" fillOpacity={0.8} />
          <Line isAnimationActive={false} dataKey="hrv" name="HRV" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend items={[{ label: 'HRV (Nacht)', color: 'var(--series-1)' }, { label: 'Normalbereich', color: 'var(--band)' }]} />
    </>
  )
}

export function SimpleLineChart({ data, unit, name, height = 160, color = 'var(--series-1)', decimals = 0 }: { data: { date: string; value: number | null }[]; unit: string; name: string; height?: number; color?: string; decimals?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.28} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={24} />
        <YAxis
          {...axis}
          width={44}
          domain={decimals ? ['auto', 'auto'] : [(m: number) => Math.floor(m - 1), (m: number) => Math.ceil(m + 1)]}
          allowDecimals={decimals > 0}
          tickFormatter={(v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: decimals })}
        />
        <Tooltip cursor={lineCursor} content={<ChartTooltip labelFormat={longDate} valueFormat={(v) => `${v.toLocaleString('de-DE', { maximumFractionDigits: decimals })} ${unit}`} />} />
        <Area
          isAnimationActive={false}
          type="monotone"
          dataKey="value"
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          dot={false}
          activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Laufzeit pro Woche: locker (Zone 1–3) gegen hart (Zone 4–5). */
export function IntensityChart({ data }: { data: { week: string; easy: number; hard: number }[] }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
          {grid}
          <XAxis dataKey="week" tickFormatter={shortDate} {...axis} minTickGap={16} />
          <YAxis {...axis} width={44} tickFormatter={(v) => `${v}h`} />
          <Tooltip cursor={cursor} content={<ChartTooltip labelFormat={weekLabel} valueFormat={(v) => hoursMin(v * 3600)} />} />
          <Bar isAnimationActive={false} dataKey="easy" name="Locker (Z1–3)" stackId="i" fill="var(--zone-2)" stroke="var(--surface)" strokeWidth={1} maxBarSize={22} />
          <Bar isAnimationActive={false} dataKey="hard" name="Hart (Z4–5)" stackId="i" fill="var(--zone-5)" stroke="var(--surface)" strokeWidth={1} maxBarSize={22} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Legend items={[{ label: 'Locker (Zone 1–3)', color: 'var(--zone-2)' }, { label: 'Hart (Zone 4–5)', color: 'var(--zone-5)' }]} />
    </>
  )
}

const ZONE_COLORS = ['var(--zone-1)', 'var(--zone-2)', 'var(--zone-3)', 'var(--zone-4)', 'var(--zone-5)']

/** Zeit in HF-Zonen als eine gestapelte Leiste mit Beschriftung. */
export function ZoneBar({ zones }: { zones: (number | null)[] }) {
  const total = zones.reduce<number>((a, b) => a + (b ?? 0), 0)
  if (!total) return null
  return (
    <div>
      <div className="flex h-2.5 gap-1">
        {zones.map((z, i) =>
          z ? <div key={i} className="rounded-full" style={{ width: `${(z / total) * 100}%`, background: ZONE_COLORS[i] }} title={`Zone ${i + 1}: ${Math.round((z / total) * 100)} %`} /> : null,
        )}
      </div>
      <div className="mt-2 grid grid-cols-5 text-center text-[11px] text-ink-2">
        {zones.map((z, i) => (
          <div key={i}>
            <div className="font-medium text-ink">{Math.round(((z ?? 0) / total) * 100)}%</div>
            <div className="flex items-center justify-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: ZONE_COLORS[i] }} />Z{i + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Fitness, Ermüdung und Form; geplante Tage gestrichelt, Linien bei heute und am Renntag. */
export function FitnessChart({ data, today, race }: { data: { date: string; fitness: number; fatigue: number; form: number; projected: boolean }[]; today: string; race?: string }) {
  const rows = data.map((d) => ({
    date: d.date,
    fitness: d.projected ? null : d.fitness,
    fatigue: d.projected ? null : d.fatigue,
    form: d.projected ? null : d.form,
    // Plan-Werte beginnen am heutigen Tag, damit die Linien lückenlos anschließen.
    fitnessP: d.projected || d.date === today ? d.fitness : null,
    fatigueP: d.projected || d.date === today ? d.fatigue : null,
    formP: d.projected || d.date === today ? d.form : null,
  }))
  const hasPlan = data.some((d) => d.projected)
  return (
    <>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          {grid}
          <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={28} />
          <YAxis {...axis} width={44} allowDecimals={false} />
          <ReferenceLine y={0} stroke="var(--text-3)" strokeOpacity={0.5} />
          {hasPlan && <ReferenceLine x={today} stroke="var(--text-3)" strokeDasharray="3 3" label={{ value: 'heute', position: 'insideTopLeft', fill: 'var(--text-3)', fontSize: 10 }} />}
          {race && <ReferenceLine x={race} stroke="var(--critical)" strokeDasharray="3 3" label={{ value: 'Rennen', position: 'insideTopRight', fill: 'var(--critical)', fontSize: 10 }} />}
          <Tooltip cursor={lineCursor} content={<ChartTooltip labelFormat={longDate} valueFormat={(v) => String(Math.round(v))} />} />
          <Area isAnimationActive={false} dataKey="form" name="Form" fill="var(--series-3)" fillOpacity={0.18} stroke="var(--series-3)" strokeWidth={1.5} connectNulls={false} />
          <Area isAnimationActive={false} dataKey="formP" name="Form (Plan)" fill="var(--series-3)" fillOpacity={0.08} stroke="var(--series-3)" strokeWidth={1.5} strokeDasharray="4 3" />
          <Line isAnimationActive={false} dataKey="fitness" name="Fitness" stroke="var(--series-1)" strokeWidth={2.2} dot={false} />
          <Line isAnimationActive={false} dataKey="fitnessP" name="Fitness (Plan)" stroke="var(--series-1)" strokeWidth={2.2} strokeDasharray="4 3" dot={false} />
          <Line isAnimationActive={false} dataKey="fatigue" name="Ermüdung" stroke="var(--series-2)" strokeWidth={1.4} dot={false} />
          <Line isAnimationActive={false} dataKey="fatigueP" name="Ermüdung (Plan)" stroke="var(--series-2)" strokeWidth={1.4} strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { label: 'Fitness (42 Tage)', color: 'var(--series-1)' },
          { label: 'Ermüdung (7 Tage)', color: 'var(--series-2)' },
          { label: 'Form', color: 'var(--series-3)' },
        ]}
      />
    </>
  )
}

/** Aerobe Effizienz (Meter pro Herzschlag) lockerer Läufe; steigend = fitter. */
export function EfficiencyChart({ data }: { data: { date: string; value: number | null }[] }) {
  return <SimpleLineChart data={data} unit="m/Schlag" name="Effizienz" height={150} color="var(--series-3)" decimals={2} />
}

/** Puls-Drift je Lauf; unter 5 % gilt die Grundlage als gut. */
export function DriftChart({ data }: { data: { date: string; drift: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={24} />
        <YAxis {...axis} width={44} tickFormatter={(v) => `${v}%`} allowDecimals={false} />
        <ReferenceLine y={5} stroke="var(--warning)" strokeDasharray="4 3" />
        <Tooltip cursor={cursor} content={<ChartTooltip labelFormat={longDate} valueFormat={(v) => `${v.toLocaleString('de-DE')} %`} />} />
        <Bar isAnimationActive={false} dataKey="drift" name="Puls-Drift" radius={[4, 4, 4, 4]} maxBarSize={14}>
          {data.map((d) => (
            <Cell key={d.date} fill={d.drift > 5 ? 'var(--warning)' : 'var(--good)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
