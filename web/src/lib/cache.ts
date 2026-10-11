// Letzter geladener Stand auf dem Gerät: Die App zeigt ihn sofort und lädt im Hintergrund nach.
// Nur im Browser des Besitzers, beim Abmelden gelöscht.

import type { Dataset } from './types'

// v2: mit meta fürs Nachladen. Alte Stände (v1) laden einmal komplett neu.
const KEY = 'dataset.v2'
const OLD = ['dataset.v1']

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
    for (const k of OLD) localStorage.removeItem(k)
  } catch {
    // nichts zu tun
  }
}
