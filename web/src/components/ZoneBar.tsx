// Eigene Datei ohne Recharts, damit Heute und Aktivitäten die Diagramm-Bibliothek nicht beim Start laden.

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
