import { describe, expect, it } from 'vitest'
import { guessType, openSuggestions } from './garminRaces'

describe('garmin races', () => {
  it('guesses the race type', () => {
    expect(guessType({ name: 'Stadtlauf', distance_m: 21097.5, sport: 'running' })).toBe('half')
    expect(guessType({ name: 'Herbstlauf', distance_m: 10000, sport: 'running' })).toBe('10k')
    expect(guessType({ name: 'Berlin Marathon', distance_m: null, sport: null })).toBe('marathon')
    expect(guessType({ name: 'Ironman 70.3 Kraichgau', distance_m: null, sport: 'multi_sport' })).toBe('tri_70_3')
  })

  it('only suggests new races', () => {
    const races = [
      { id: 1, name: 'A', date: '2027-04-11', distance_m: 10000, sport: null },
      { id: 2, name: 'B', date: '2027-05-01', distance_m: 10000, sport: null },
      { id: 3, name: 'C', date: '2026-09-01', distance_m: 10000, sport: null },
      { id: 4, name: 'D', date: '2027-06-01', distance_m: 10000, sport: null },
    ]
    const events = [{ id: 'x', name: 'A', date: '2027-04-11', type: '10k' as const, goal_time_s: null, days_per_week: 4, long_day: 6, notes: null }]
    expect(openSuggestions(races, events, '2026-10-02', [4]).map((r) => r.id)).toEqual([2])
  })
})
