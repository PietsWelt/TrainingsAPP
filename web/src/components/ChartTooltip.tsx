interface Row {
  name?: string | number
  value?: number | string | (number | string)[]
  color?: string
  dataKey?: string | number
}

interface Props {
  active?: boolean
  payload?: Row[]
  label?: string | number
  labelFormat?: (l: string) => string
  valueFormat?: (v: number, key: string) => string
}

export function ChartTooltip({ active, payload, label, labelFormat, valueFormat }: Props) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value != null && !Array.isArray(p.value))
  if (!rows.length) return null
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{labelFormat ? labelFormat(String(label)) : label}</div>
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-medium text-ink">
            {valueFormat ? valueFormat(Number(p.value), String(p.dataKey)) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}
