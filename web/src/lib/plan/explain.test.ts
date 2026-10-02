import { describe, expect, it } from 'vitest'
import { explain } from './explain'
import type { Kind } from './types'

const KINDS: Kind[] = ['easy', 'recovery', 'long', 'strides', 'fartlek', 'tempo', 'intervals', 'race_pace', 'technique', 'brick', 'race']

describe('explain', () => {
  it('has an explanation with sources for every kind', () => {
    for (const kind of KINDS) {
      const e = explain({ kind, sport: 'run', phase: 'build' })
      expect(e, kind).not.toBeNull()
      expect(e!.sources.length, kind).toBeGreaterThan(0)
    }
  })

  it('uses sport-specific tips', () => {
    expect(explain({ kind: 'tempo', sport: 'bike', phase: 'build' })!.short).toContain('Sweet Spot')
  })
})
