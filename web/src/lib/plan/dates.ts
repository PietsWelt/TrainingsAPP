// Reine Datums-Arithmetik auf YYYY-MM-DD in UTC, damit Zeitzonen nichts verschieben.

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
  const d = parseDay(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return fmtDay(d)
}

/** 0 = Montag … 6 = Sonntag */
export function weekday(iso: string): number {
  return (parseDay(iso).getUTCDay() + 6) % 7
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekday(iso))
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400_000)
}

export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const WEEKDAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
