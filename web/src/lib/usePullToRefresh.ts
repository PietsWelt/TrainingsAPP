import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 70

/**
 * „Nach unten ziehen zum Aktualisieren“, wenn die Seite ganz oben ist.
 * Gibt den aktuellen Zugweg (0…THRESHOLD*1.4) und ob gerade geladen wird zurück.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>, enabled = true) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const cb = useRef(onRefresh)
  useEffect(() => {
    cb.current = onRefresh
  })

  useEffect(() => {
    if (!enabled) return
    const down = (e: TouchEvent) => {
      // Nicht in geöffneten Detailansichten, die scrollen selbst.
      const inSheet = (e.target as Element | null)?.closest?.('.sheet-in')
      startY.current = window.scrollY <= 0 && !busy && !inSheet ? e.touches[0].clientY : null
    }
    const move = (e: TouchEvent) => {
      if (startY.current == null) return
      const d = e.touches[0].clientY - startY.current
      if (d <= 0 || window.scrollY > 0) {
        pullRef.current = 0
        setPull(0)
        return
      }
      pullRef.current = Math.min(THRESHOLD * 1.4, d * 0.5)
      setPull(pullRef.current)
    }
    const up = () => {
      if (startY.current == null) return
      startY.current = null
      const fire = pullRef.current >= THRESHOLD
      pullRef.current = 0
      setPull(0)
      if (fire) {
        setBusy(true)
        cb.current().finally(() => setBusy(false))
      }
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
    }
  }, [enabled, busy])

  return { pull, ready: pull >= THRESHOLD, busy }
}
