// Rennen aus dem Garmin-Kalender: Art aus Strecke, Sportart und Name erraten und Vorschläge filtern.

import { addToList, getState } from './appState'
import type { EventType, RaceEvent } from './plan/types'

export interface GarminRace {
  id: number
  name: string
  date: string
  distance_m: number | null
  sport: string | null
}

const RUN: { type: EventType; m: number }[] = [
  { type: '5k', m: 5000 },
  { type: '10k', m: 10000 },
  { type: 'half', m: 21097.5 },
  { type: 'marathon', m: 42195 },
]

export function guessType(r: Pick<GarminRace, 'name' | 'distance_m' | 'sport'>): EventType {
  const text = `${r.name} ${r.sport ?? ''}`.toLowerCase()
  if (/70\.3|mitteldistanz|half ironman/.test(text)) return 'tri_70_3'
  if (/ironman|langdistanz|full distance/.test(text)) return 'tri_ironman'
  if (/triathlon|multisport|tri\b/.test(text)) return /sprint|jedermann|volks/.test(text) ? 'tri_sprint' : 'tri_olympic'
  if (r.distance_m) {
    const best = RUN.reduce((a, b) => (Math.abs(Math.log(b.m / r.distance_m!)) < Math.abs(Math.log(a.m / r.distance_m!)) ? b : a))
    return best.type
  }
  if (/halb|half|21/.test(text)) return 'half'
  if (/marathon|42/.test(text)) return 'marathon'
  if (/10 ?k/.test(text)) return '10k'
  if (/5 ?k/.test(text)) return '5k'
  return 'half'
}

// Übernommene oder ausgeblendete Garmin-Rennen gelten auf allen Geräten (app_state).
export const handledIds = (): number[] => getState<number[]>('garmin.races.handled', [])

export const markHandled = (id: number) => addToList('garmin.races.handled', id)

/** Kommende Garmin-Rennen, die noch nicht übernommen oder ausgeblendet wurden und kein App-Rennen am selben Tag haben. */
export function openSuggestions(races: GarminRace[], events: RaceEvent[], today: string, handled = handledIds()): GarminRace[] {
  return races.filter((r) => r.date > today && !handled.includes(r.id) && !events.some((e) => e.date === r.date)).sort((a, b) => a.date.localeCompare(b.date))
}
