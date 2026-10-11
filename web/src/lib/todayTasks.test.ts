import { describe, expect, it } from 'vitest'
import { openTasks, type TaskStates } from './todayTasks'

const none: TaskStates = { checkin: 'done', feedback: null, mobility: null, strength: null, review: null }

describe('openTasks', () => {
  it('sortiert offene Aufgaben fest: Check-in, Einheit bewerten, Dehnen, Kraft, Wochenrückblick', () => {
    const r = openTasks({ checkin: 'today', feedback: 'open', mobility: 'open', strength: 'open', review: 'open' })
    expect(r.open).toEqual(['checkin', 'feedback', 'mobility', 'strength', 'review'])
    expect(r.done).toEqual([])
  })
  it('sammelt Erledigtes getrennt', () => {
    const r = openTasks({ ...none, mobility: 'done', strength: 'open' })
    expect(r.open).toEqual(['strength'])
    expect(r.done).toEqual(['checkin', 'mobility'])
  })
  it('zeigt den fehlenden Check-in von gestern nicht doppelt (steht in der Hauptkarte)', () => {
    expect(openTasks({ ...none, checkin: 'yesterday' })).toEqual({ open: [], done: [] })
  })
  it('lässt Aufgaben weg, die heute kein Thema sind', () => {
    expect(openTasks({ ...none, checkin: 'done' }).open).toEqual([])
  })
})
