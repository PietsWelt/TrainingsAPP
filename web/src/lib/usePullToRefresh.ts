import { useEffect, useRef, useState, type RefObject } from 'react'

const THRESHOLD = 70

/**
 * „Nach unten ziehen zum Aktualisieren“, wenn die Seite ganz oben ist.
 * Die Höhe der Anzeige wird direkt am Element gesetzt, nicht als State: Sonst würde bei jeder
 * Fingerbewegung die ganze App samt Diagrammen neu gerendert. State gibt es nur beim Überschreiten
 * der Schwelle und während des Ladens.
 */
export function usePullToRefresh(indicator: RefObject<HTMLElement | null>, onRefresh: () => Promise<unknown>, enabled = true) {
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const startY = useRef<number | null>(null)
  const startX = useRef(0)
  const pullRef = useRef(0)
  const cb = useRef(onRefresh)
  useEffect(() => {
    cb.current = onRefresh
  })

  useEffect(() => {
    if (!enabled) return
    const show = (pull: number) => {
      pullRef.current = pull
      if (indicator.current && !busy) indicator.current.style.height = `${pull * 0.6}px`
      setReady(pull >= THRESHOLD)
    }
    const down = (e: TouchEvent) => {
      // Nicht in geöffneten Detailansichten, die scrollen selbst.
      const inSheet = (e.target as Element | null)?.closest?.('.sheet-in')
      startX.current = e.touches[0].clientX
      startY.current = window.scrollY <= 0 && !busy && !inSheet ? e.touches[0].clientY : null
    }
    const move = (e: TouchEvent) => {
      if (startY.current == null) return
      const d = e.touches[0].clientY - startY.current
      // Waagerechtes Wischen wechselt die Seite, das ist kein Runterziehen.
      const dx = Math.abs(e.touches[0].clientX - startX.current)
      if (dx > 12 && dx > Math.abs(d)) startY.current = null
      if (startY.current == null || d <= 0 || window.scrollY > 0) {
        if (pullRef.current) show(0)
        return
      }
      show(Math.min(THRESHOLD * 1.4, d * 0.5))
    }
    const up = () => {
      if (startY.current == null) return
      startY.current = null
      const fire = pullRef.current >= THRESHOLD
      show(0)
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
  }, [enabled, busy, indicator])

  return { ready, busy }
}
