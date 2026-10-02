import { useEffect, useRef, type RefObject } from 'react'

const OUT_MS = 170
const IN_MS = 260
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

/**
 * Nach links oder rechts wischen wechselt den Tab. Die Seite folgt dabei dem Finger und gleitet
 * danach hinaus, die neue kommt von der anderen Seite herein. Erst wenn die Bewegung klar
 * waagerecht ist, wird sie übernommen, damit normales Scrollen nicht stört.
 */
export function useSwipeTabs<T>(ref: RefObject<HTMLElement | null>, tabs: readonly T[], current: T, onChange: (t: T) => void) {
  const state = useRef({ tabs, current, onChange })
  useEffect(() => {
    state.current = { tabs, current, onChange }
  })

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let start: { x: number; y: number; t: number } | null = null
    let mode: 'none' | 'x' | 'y' = 'none'
    let dx = 0
    let busy = false

    const set = (x: number, opacity: number, ms = 0, ease = EASE_OUT) => {
      const el = ref.current
      if (!el) return
      el.style.transition = ms ? `transform ${ms}ms ${ease}, opacity ${ms}ms ${ease}` : 'none'
      el.style.transform = x ? `translate3d(${x}px,0,0)` : ''
      el.style.opacity = opacity === 1 ? '' : String(opacity)
    }
    const neighbor = (dir: number) => {
      const { tabs, current } = state.current
      const i = tabs.indexOf(current) + dir
      return i >= 0 && i < tabs.length ? tabs[i] : undefined
    }

    const down = (e: TouchEvent) => {
      const el = e.target as Element | null
      const t = e.touches[0]
      // Nicht in Detailansichten, waagerecht scrollbaren Leisten oder am Rand (Zurück-Geste von iOS).
      const blocked = el?.closest?.('.sheet-in, .overflow-x-auto, input, textarea, select, [data-noswipe]')
      const ok = !busy && e.touches.length === 1 && !blocked && t.clientX > 24 && t.clientX < window.innerWidth - 24
      start = ok ? { x: t.clientX, y: t.clientY, t: Date.now() } : null
      mode = 'none'
      dx = 0
    }
    const move = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      const x = t.clientX - start.x
      const y = t.clientY - start.y
      if (mode === 'none') {
        if (Math.abs(x) > 12 && Math.abs(x) > Math.abs(y) * 1.5) mode = 'x'
        else if (Math.abs(y) > 10) mode = 'y'
      }
      if (mode !== 'x') return
      e.preventDefault()
      // Am ersten und letzten Tab gibt die Seite nur gedämpft nach.
      dx = neighbor(x < 0 ? 1 : -1) === undefined ? x * 0.25 : x
      set(dx, 1 - Math.min(0.35, Math.abs(dx) / window.innerWidth / 2))
    }
    const up = () => {
      if (!start || mode !== 'x') {
        start = null
        return
      }
      const v = Math.abs(dx) / Math.max(1, Date.now() - start.t)
      start = null
      const dir = dx < 0 ? 1 : -1
      const next = neighbor(dir)
      const w = window.innerWidth
      if (next === undefined || !(Math.abs(dx) > w * 0.28 || (Math.abs(dx) > 50 && v > 0.45))) {
        set(0, 1, 220)
        return
      }
      if (reduce) {
        set(0, 1)
        state.current.onChange(next)
        return
      }
      busy = true
      set(-dir * w, 0, OUT_MS, EASE_IN)
      window.setTimeout(() => {
        state.current.onChange(next)
        // Neue Seite startet leicht versetzt auf der anderen Seite und gleitet herein.
        set(dir * w * 0.35, 0)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            set(0, 1, IN_MS)
            window.setTimeout(() => {
              busy = false
              set(0, 1)
            }, IN_MS)
          }),
        )
      }, OUT_MS)
    }

    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', up)
    window.addEventListener('touchcancel', up)
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
      window.removeEventListener('touchcancel', up)
    }
  }, [ref])
}
