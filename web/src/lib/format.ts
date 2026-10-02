export const SPORT_LABEL: Record<string, string> = {
  running: 'Laufen',
  trail_running: 'Trail',
  treadmill_running: 'Laufband',
  cycling: 'Rad',
  road_biking: 'Rennrad',
  indoor_cycling: 'Indoor-Rad',
  virtual_ride: 'Indoor-Rad',
  lap_swimming: 'Schwimmen',
  open_water_swimming: 'Freiwasser',
  strength_training: 'Kraft',
  walking: 'Gehen',
  hiking: 'Wandern',
}

export type SportGroup = 'run' | 'bike' | 'swim' | 'other'

export function sportGroup(sport: string): SportGroup {
  if (sport.includes('run')) return 'run'
  if (sport.includes('cycl') || sport.includes('bik') || sport.includes('ride')) return 'bike'
  if (sport.includes('swim')) return 'swim'
  return 'other'
}

export const GROUP_LABEL: Record<SportGroup, string> = { run: 'Laufen', bike: 'Rad', swim: 'Schwimmen', other: 'Sonstiges' }

export const sportLabel = (sport: string) => SPORT_LABEL[sport] ?? sport.replace(/_/g, ' ')

export function duration(s: number | null | undefined): string {
  if (s == null) return '–'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`
}

export function hoursMin(s: number | null | undefined): string {
  if (s == null) return '–'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function km(m: number | null | undefined, digits = 1): string {
  return m == null ? '–' : `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits })} km`
}

/** Pace in min/km (Laufen) bzw. Tempo in km/h (Rad) bzw. min/100 m (Schwimmen). */
export function speed(mps: number | null | undefined, sport: string): string {
  if (!mps) return '–'
  const g = sportGroup(sport)
  if (g === 'bike') return `${(mps * 3.6).toFixed(1).replace('.', ',')} km/h`
  if (g === 'swim') return `${paceStr(100 / mps)} /100 m`
  return `${paceStr(1000 / mps)} /km`
}

function paceStr(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`
}

export function dateLabel(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('de-DE', opts)
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000
  if (diff < 1) return 'gerade eben'
  if (diff < 60) return `vor ${Math.round(diff)} min`
  if (diff < 60 * 24) return `vor ${Math.round(diff / 60)} h`
  return dateLabel(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Montag der Woche als ISO-Datum. */
export function weekStart(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export const avg = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
