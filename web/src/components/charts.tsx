import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dateLabel, hoursMin } from '../lib/format'
import { ChartTooltip } from './ChartTooltip'
import { Legend } from './ui'

const axis = { tick: { fill: 'var(--text-3)', fontSize: 11 }, axisLine: false, tickLine: false } as const
const grid = <CartesianGrid vertical={false} stroke="var(--border)" />
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
        <Bar isAnimationActive={false} dataKey="km" name="Laufen" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
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
              maxBarSize={28}
              radius={i === used.length - 1 ? [4, 4, 0, 0] : 0}
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

export function SimpleLineChart({ data, unit, name, height = 160 }: { data: { date: string; value: number | null }[]; unit: string; name: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={24} />
        <YAxis {...axis} width={44} domain={[(m: number) => Math.floor(m - 1), (m: number) => Math.ceil(m + 1)]} allowDecimals={false} />
        <Tooltip cursor={lineCursor} content={<ChartTooltip labelFormat={longDate} valueFormat={(v) => `${v.toLocaleString('de-DE')} ${unit}`} />} />
        <Line isAnimationActive={false} dataKey="value" name={name} stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}

const ZONE_COLORS = ['var(--zone-1)', 'var(--zone-2)', 'var(--zone-3)', 'var(--zone-4)', 'var(--zone-5)']

/** Zeit in HF-Zonen als eine gestapelte Leiste mit Beschriftung. */
export function ZoneBar({ zones }: { zones: (number | null)[] }) {
  const total = zones.reduce<number>((a, b) => a + (b ?? 0), 0)
  if (!total) return null
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {zones.map((z, i) =>
          z ? <div key={i} style={{ width: `${(z / total) * 100}%`, background: ZONE_COLORS[i] }} title={`Zone ${i + 1}: ${Math.round((z / total) * 100)} %`} /> : null,
        )}
      </div>
      <div className="mt-2 grid grid-cols-5 text-center text-[11px] text-ink-2">
        {zones.map((z, i) => (
          <div key={i}>
            <div className="font-medium text-ink">{Math.round(((z ?? 0) / total) * 100)}%</div>Z{i + 1}
          </div>
        ))}
      </div>
    </div>
  )
}
