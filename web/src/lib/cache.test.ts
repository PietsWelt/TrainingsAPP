import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCache, readCache, sameData, writeCache } from './cache'
import { demoDataset } from './demo'

const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
})

describe('cache', () => {
  beforeEach(() => clearCache())

  it('speichert und liest den letzten Stand', () => {
    const d = demoDataset()
    expect(readCache()).toBeNull()
    writeCache(d)
    expect(readCache()?.activities.length).toBe(d.activities.length)
    clearCache()
    expect(readCache()).toBeNull()
  })

  it('erkennt unveränderte Daten', () => {
    const d = demoDataset()
    expect(sameData(null, d)).toBe(false)
    expect(sameData(d, JSON.parse(JSON.stringify(d)))).toBe(true)
    expect(sameData(d, { ...d, activities: d.activities.slice(1) })).toBe(false)
  })
})
