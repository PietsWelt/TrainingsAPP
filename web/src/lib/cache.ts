// Letzter geladener Stand auf dem Gerät: Die App zeigt ihn sofort und lädt im Hintergrund nach.
// Nur im Browser des Besitzers, beim Abmelden gelöscht.

import type { Dataset } from './types'

const KEY = 'dataset.v1'

export function readCache(): Dataset | null {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as { data?: Dataset }) : null
    return parsed?.data?.activities ? parsed.data : null
  } catch {
    return null
  }
}

export function writeCache(data: Dataset) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    // Speicher voll oder gesperrt: dann eben ohne Schnellstart
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nichts zu tun
  }
}

/** Gleicher Inhalt wie vorher? Dann bleibt das alte Objekt und nichts wird neu berechnet. */
export function sameData(a: Dataset | null, b: Dataset): boolean {
  return a != null && JSON.stringify(a) === JSON.stringify(b)
}
