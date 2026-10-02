// Bestzeiten: Garmins persönliche Rekorde, ergänzt um ganze Läufe passender Länge.
// Garmin liefert Rekorde als Typ-ID plus Wert (Sekunden bzw. Meter). Sicher bekannt sind
// nur die Typen für 1 km, Meile, 5 km und 10 km; Halbmarathon und Marathon kommen daher aus
// den eigenen Läufen, bis die Typ-IDs aus dem Sync-Log bestätigt sind.

import type { Activity } from './types'

export interface GarminRecord {
  type_id: number
  value: number | null
  activity_id: number | null
  date: string | null
}

export interface Best {
  key: DistanceKey
  label: string
  meters: number
  time_s: number
  date: string | null
  activity_id: number | null
}

export type DistanceKey = '1k' | '5k' | '10k' | 'half' | 'marathon'

export const DISTANCES: { key: DistanceKey; label: string; meters: number; typeId?: number }[] = [
  { key: '1k', label: '1 km', meters: 1000, typeId: 1 },
  { key: '5k', label: '5 km', meters: 5000, typeId: 3 },
  { key: '10k', label: '10 km', meters: 10000, typeId: 4 },
  { key: 'half', label: 'Halbmarathon', meters: 21097.5 },
  { key: 'marathon', label: 'Marathon', meters: 42195 },
]

/** Ganze Läufe zählen, wenn sie die Strecke abdecken und höchstens 4 % länger sind. */
export const WINDOW = [0.995, 1.04] as const

/** Pace zwischen 2:30 und 12:00 min/km, sonst ist der Wert kein Laufrekord. */
const plausible = (time_s: number, meters: number) => {
  const pace = time_s / (meters / 1000)
  return pace >= 150 && pace <= 720
}

export function isRun(sport: string) {
  return sport.includes('run') && !sport.includes('treadmill')
}

/** Schnellster ganzer Lauf je Strecke, auf die genaue Distanz umgerechnet. */
export function bestsFromActivities(activities: Pick<Activity, 'id' | 'sport' | 'local_date' | 'distance_m' | 'duration_s'>[]): Best[] {
  const out: Best[] = []
  for (const d of DISTANCES) {
    if (d.key === '1k') continue
    let best: Best | null = null
    for (const a of activities) {
      if (!isRun(a.sport) || !a.distance_m || !a.duration_s) continue
      if (a.distance_m < d.meters * WINDOW[0] || a.distance_m > d.meters * WINDOW[1]) continue
      const t = (a.duration_s * d.meters) / a.distance_m
      if (!plausible(t, d.meters)) continue
      if (!best || t < best.time_s) best = { key: d.key, label: d.label, meters: d.meters, time_s: t, date: a.local_date, activity_id: a.id }
    }
    if (best) out.push(best)
  }
  return out
}

/** Führt Garmin-Rekorde und Läufe zusammen; je Strecke gewinnt die schnellere Zeit. */
export function mergeBests(garmin: GarminRecord[], fromRuns: Best[]): Best[] {
  return DISTANCES.flatMap((d) => {
    const g = d.typeId != null ? garmin.find((r) => r.type_id === d.typeId) : undefined
    const cands: Best[] = fromRuns.filter((b) => b.key === d.key)
    if (g?.value && plausible(g.value, d.meters))
      cands.push({ key: d.key, label: d.label, meters: d.meters, time_s: g.value, date: g.date, activity_id: g.activity_id })
    cands.sort((a, b) => a.time_s - b.time_s)
    return cands.slice(0, 1)
  })
}

export function fmtTime(s: number): string {
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function fmtPace(time_s: number, meters: number): string {
  const p = Math.round(time_s / (meters / 1000))
  return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, '0')} /km`
}
