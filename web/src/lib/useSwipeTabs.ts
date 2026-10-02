import { useEffect, useRef } from 'react'

/**
 * Kräftig nach links oder rechts wischen wechselt den Tab. Damit normales Scrollen und
 * Diagramme nicht stören, zählt nur ein schneller, deutlich waagerechter Wisch.
 */
export function useSwipeTabs<T>(tabs: readonly T[], current: T, onChange: (t: T) => void) {
  const state = useRef({ tabs, current, onChange })
  useEffect(() => {
    state.current = { tabs, current, onChange }
  })

  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null
    const down = (e: TouchEvent) => {
      const el = e.target as Element | null
      const t = e.touches[0]
      // Nicht in Detailansichten, waagerecht scrollbaren Leisten oder am Rand (Zurück-Geste von iOS).
      const blocked = el?.closest?.('.sheet-in, .overflow-x-auto, input, textarea, select, [data-noswipe]')
      start = e.touches.length === 1 && !blocked && t.clientX > 24 && t.clientX < window.innerWidth - 24 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null
    }
    const up = (e: TouchEvent) => {
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const ms = Date.now() - start.t
      start = null
      if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2 || Math.abs(dx) / ms < 0.35) return
      const { tabs, current, onChange } = state.current
      const next = tabs.indexOf(current) + (dx < 0 ? 1 : -1)
      if (next >= 0 && next < tabs.length) onChange(tabs[next])
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchend', up)
    }
  }, [])
}
