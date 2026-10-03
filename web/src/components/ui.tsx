import { useId, type ReactNode } from 'react'

export function Card({ title, subtitle, action, children, className = '', hero = false }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string; hero?: boolean }) {
  return (
    <section className={`card ${hero ? 'card-hero' : ''} ${/(^|\s)p-\d/.test(className) ? '' : 'p-4'} ${className}`}>
      {title && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/** Überschrift über einer Gruppe von Karten. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between px-1 pt-2">
        <h2 className="font-sans text-[12px] font-semibold tracking-[0.12em] text-ink-3 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Stat({ label, value, unit, hint, spark, color = 'var(--accent)', children }: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  spark?: (number | null)[]
  color?: string
  children?: ReactNode
}) {
  return (
    <div className="card flex flex-col p-4">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="font-display text-[26px] leading-none font-semibold tabular-nums">{value}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
      </div>
      {spark && spark.filter((x) => x != null).length > 2 && <Sparkline values={spark} color={color} className="mt-3" />}
      {hint && <div className="mt-2 text-xs text-ink-2">{hint}</div>}
      {children}
    </div>
  )
}

/** Kleiner Verlauf ohne Achsen, z.B. die letzten 14 Tage. Lücken werden überbrückt. */
export function Sparkline({ values, color = 'var(--accent)', height = 32, className = '' }: { values: (number | null)[]; color?: string; height?: number; className?: string }) {
  const id = useId()
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null)
  if (pts.length < 2) return null
  const w = 100
  const min = Math.min(...pts.map((p) => p[1]))
  const max = Math.max(...pts.map((p) => p[1]))
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * w
  const y = (v: number) => (max === min ? height / 2 : 3 + (1 - (v - min) / (max - min)) * (height - 6))
  const line = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const last = pts.at(-1)!
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`block w-full overflow-visible ${className}`} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${x(last[0])},${height} L${x(pts[0][0])},${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last[0])} cy={y(last[1])} r="2.6" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Fortschrittsring mit Wert in der Mitte. color="brand" zeichnet den Markenverlauf. */
export function Ring({ value, max = 100, size = 76, stroke = 8, color = 'var(--accent)', children, label }: {
  value: number
  max?: number
  size?: number
  stroke?: number
  color?: string
  children?: ReactNode
  label: string
}) {
  const gid = useId()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, value / max))
  const stroked = color === 'brand' ? `url(#${gid})` : color
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {color === 'brand' && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--g1)" />
              <stop offset=".55" stopColor="var(--g2)" />
              <stop offset="1" stopColor="var(--g3)" />
            </linearGradient>
          </defs>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {f > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="ring-arc"
            stroke={stroked}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${f * c} ${c}`}
            style={{ ['--len' as string]: `${f * c}` }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export type Status = 'good' | 'warning' | 'serious' | 'critical'
const STATUS_ICON: Record<Status, string> = { good: '●', warning: '▲', serious: '▲', critical: '■' }

/** Status nie nur über Farbe: immer Symbol + Text. */
export function StatusLabel({ status, children }: { status: Status; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span style={{ color: `var(--${status})` }} aria-hidden>
        {STATUS_ICON[status]}
      </span>
      <span>{children}</span>
    </span>
  )
}

/** Kleine Plakette, z.B. „Neu“ oder „Diese Woche“. */
export function Pill({ children, color = 'var(--accent)' }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {children}
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex w-full rounded-full bg-surface-2 p-1 text-sm" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          role="tab"
          aria-selected={o.value === value}
          className={`min-h-9 flex-auto truncate rounded-full px-2 font-medium transition-colors ${o.value === value ? 'bg-surface-solid text-ink shadow-sm ring-1 ring-[var(--card-border)]' : 'text-ink-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** Sportart als Symbol im farbigen Kreis. */
export function SportIcon({ group, size = 40 }: { group: 'run' | 'bike' | 'swim' | 'other' | 'race'; size?: number }) {
  const color = { run: 'var(--series-1)', bike: 'var(--series-2)', swim: 'var(--series-3)', other: 'var(--series-4)', race: 'var(--critical)' }[group]
  const path = {
    run: 'M13.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 21l3-6 2.5 2V22m-5-11 2-3 4 1 2 3 3 1M10 15l1.5-5',
    bike: 'M5.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm13 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5.5 15l4-7h5l4 7M9 8l3 7h1.5M14 5h2',
    swim: 'M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 13l4-4-3-2 4-1 3 4M17 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
    other: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
    race: 'M5 21V4m0 0h11l-2 4 2 4H5',
  }[group]
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={path} />
      </svg>
    </span>
  )
}
