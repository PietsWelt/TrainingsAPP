import { describe, expect, it } from 'vitest'
import { createAppState, type Backend, type KeyValueStorage, type Row } from './appState'

function memStorage(init: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...init }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }
}

function fakeBackend(init: Record<string, unknown> = {}, missing = false): Backend & { rows: Map<string, unknown> } {
  const rows = new Map(Object.entries(init))
  return {
    rows,
    async all() {
      return { rows: missing ? [] : [...rows].map(([key, value]) => ({ key, value })), missing }
    },
    async get(key) {
      return rows.get(key)
    },
    async put(list: Row[]) {
      if (missing) throw new Error('relation "app_state" does not exist')
      for (const r of list) rows.set(r.key, r.value)
    },
  }
}

describe('appState', () => {
  it('vereinigt Listen beim Schreiben, statt sie zu ersetzen', async () => {
    const be = fakeBackend({ 'plan.released': [1, 2] })
    const s = createAppState(be, memStorage())
    await s.load()
    // Ein anderes Gerät hat inzwischen etwas ergänzt.
    be.rows.set('plan.released', [1, 2, 3])
    await s.addToList('plan.released', 4)
    expect(be.rows.get('plan.released')).toEqual([1, 2, 3, 4])
    expect(s.get('plan.released', [])).toEqual([1, 2, 3, 4])
  })

  it('übernimmt beim Laden den Stand aus der Datenbank und ergänzt lokale Listeneinträge', async () => {
    const be = fakeBackend({ 'checkin.done': '2026-10-10', 'garmin.races.handled': [7] })
    const store = memStorage({ 'checkin.done': '2026-10-01', 'garmin.races.handled': '[8]' })
    const s = createAppState(be, store)
    expect(s.get('checkin.done', null)).toBe('2026-10-01')
    await s.load()
    expect(s.get('checkin.done', null)).toBe('2026-10-10')
    expect(be.rows.get('garmin.races.handled')).toEqual([7, 8])
    expect(JSON.parse(store.data['checkin.done'])).toBe('2026-10-10')
  })

  it('bleibt ohne Tabelle lokal, ohne Fehler', async () => {
    const be = fakeBackend({}, true)
    const store = memStorage()
    const s = createAppState(be, store)
    const res = await s.load()
    expect(res.missing).toBe(true)
    expect(s.missing).toBe(true)
    await s.set('mobility.level', 'medium')
    await s.addToList('plan.released', 5)
    expect(s.get('mobility.level', 'easy')).toBe('medium')
    expect(s.get('plan.released', [])).toEqual([5])
    expect(store.data['plan.released']).toBe('[5]')
  })

  it('lädt alte lokale Werte einmalig hoch, ohne vorhandene zu überschreiben', async () => {
    const be = fakeBackend({ 'stabi.level': 'hard' })
    // Alte Versionen haben manche Werte als reinen Text gespeichert.
    const store = memStorage({ 'stabi.level': 'easy', 'feedback.seen': 'abc-123', 'mobility.done': '[3,4]', theme: 'dark' })
    const s = createAppState(be, store)
    await s.load()
    expect(be.rows.get('stabi.level')).toBe('hard')
    expect(be.rows.get('feedback.seen')).toBe('abc-123')
    expect(be.rows.get('mobility.done')).toEqual([3, 4])
    // Gerätebezogenes bleibt lokal.
    expect(be.rows.has('theme')).toBe(false)
  })

  it('arbeitet im Demo-Modus nur mit dem Browser-Speicher', async () => {
    const store = memStorage()
    const s = createAppState(null, store)
    await s.load()
    await s.set('readiness.dismissed', '2026-10-11')
    expect(createAppState(null, store).get('readiness.dismissed', null)).toBe('2026-10-11')
  })

  it('meldet Änderungen an Abonnenten', async () => {
    const s = createAppState(null, memStorage())
    let calls = 0
    s.subscribe(() => calls++)
    const v = s.version()
    await s.set('feedback.seen', 'x')
    expect(calls).toBe(1)
    expect(s.version()).toBeGreaterThan(v)
  })
})
