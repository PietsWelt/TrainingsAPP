import { describe, expect, it } from 'vitest'
import { mergeChanges, needsFull } from './data'
import type { Activity, Dataset, DailyMetrics } from './types'

const TODAY = '2026-10-11'

function act(id: number, date: string, over: Partial<Activity> = {}): Activity {
  return { id, start_time: `${date}T08:00:00Z`, local_date: date, sport: 'running', name: `Lauf ${id}`, distance_m: 10000, duration_s: 3000, synced_at: `${date}T09:00:00Z`, ...over } as Activity
}
const day = (date: string, over: Partial<DailyMetrics> = {}) => ({ date, resting_hr: 50, synced_at: `${date}T07:00:00Z`, ...over }) as DailyMetrics

function base(): Dataset {
  return {
    activities: [act(3, '2026-10-10'), act(2, '2026-10-05'), act(1, '2026-04-10')],
    days: [day('2026-04-10'), day('2026-10-09'), day('2026-10-10')],
    lastSync: { id: 7, trigger: 'cron', started_at: '2026-10-10T10:00:00Z', finished_at: '2026-10-10T10:01:00Z', status: 'ok', message: null },
    meta: { syncedMax: '2026-10-10T09:00:00Z', fullAt: TODAY, incremental: true },
  }
}

describe('mergeChanges', () => {
  it('gibt ohne Änderung dasselbe Objekt zurück', () => {
    const prev = base()
    expect(mergeChanges(prev, { activities: [], days: [], lastSync: prev.lastSync }, TODAY)).toBe(prev)
  })

  it('ersetzt geänderte Zeilen, fügt neue hinzu und entfernt zu alte', () => {
    const prev = base()
    const next = mergeChanges(
      prev,
      {
        activities: [act(2, '2026-10-05', { name: 'Umbenannt', synced_at: '2026-10-11T08:00:00Z' }), act(4, '2026-10-11', { synced_at: '2026-10-11T08:30:00Z' })],
        days: [day('2026-10-10', { resting_hr: 48 }), day('2026-10-11', { synced_at: '2026-10-11T07:10:00Z' })],
        lastSync: { ...prev.lastSync!, id: 8 },
      },
      TODAY,
    )
    expect(next).not.toBe(prev)
    expect(next.activities.map((a) => a.id)).toEqual([4, 3, 2])
    expect(next.activities.find((a) => a.id === 2)?.name).toBe('Umbenannt')
    expect(next.days.map((d) => d.date)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11'])
    expect(next.days.find((d) => d.date === '2026-10-10')?.resting_hr).toBe(48)
    expect(next.lastSync?.id).toBe(8)
    expect(next.meta?.syncedMax).toBe('2026-10-11T08:30:00Z')
    // Unverändertes bleibt dasselbe Objekt.
    expect(next.activities.find((a) => a.id === 3)).toBe(prev.activities[0])
  })

  it('übernimmt neu geladene Bestzeiten nur, wenn sie mitkommen', () => {
    const prev = { ...base(), records: [] }
    const next = mergeChanges(prev, { activities: [act(5, '2026-10-11')], days: [], lastSync: prev.lastSync }, TODAY)
    expect(next.records).toBe(prev.records)
    const withSlow = mergeChanges(prev, { activities: [], days: [], lastSync: prev.lastSync, slow: { records: [], lactate: [] } }, TODAY)
    expect(withSlow).not.toBe(prev)
  })
})

describe('needsFull', () => {
  it('lädt komplett beim ersten Start, einmal am Tag und ohne Migration 0018', () => {
    expect(needsFull(null, TODAY)).toBe(true)
    expect(needsFull(base(), TODAY)).toBe(false)
    expect(needsFull(base(), '2026-10-12')).toBe(true)
    expect(needsFull({ ...base(), meta: { ...base().meta!, incremental: false } }, TODAY)).toBe(true)
    expect(needsFull({ ...base(), meta: undefined }, TODAY)).toBe(true)
  })
})
