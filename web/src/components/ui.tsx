import type { ReactNode } from 'react'

export function Card({ title, subtitle, children, className = '' }: { title?: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      {title && (
        <header className="mb-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, unit, hint, children }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[28px] leading-none font-semibold tracking-tight">{value}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="mt-2 text-xs text-ink-2">{hint}</div>}
      {children}
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

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex w-full rounded-xl bg-surface-2 p-1 text-sm" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          role="tab"
          aria-selected={o.value === value}
          className={`min-h-9 flex-auto truncate rounded-lg px-2 font-medium ${o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}
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
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
