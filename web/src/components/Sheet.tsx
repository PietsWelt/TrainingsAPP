import { useRef, useState, type ReactNode } from 'react'
import { useBackClose } from '../lib/useBackClose'

// Nur in der installierten App: Im Browser hat das Handy selbst schon eine Zurück-Wischgeste.
const EDGE_SWIPE =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

/**
 * Vollbild-Ansicht, die von rechts hereinkommt. Schließen über „Zurück“, die Zurück-Taste
 * oder eine Wischgeste vom linken Rand. `footer` bleibt unten in Daumenreichweite stehen.
 */
export function Sheet({ title, onClose, children, footer }: { title?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useBackClose(onClose)
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      className="sheet-in fixed inset-0 z-30 flex flex-col bg-bg"
      style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
      onTouchStart={(e) => {
        const t = e.touches[0]
        start.current = EDGE_SWIPE && t.clientX < 28 ? { x: t.clientX, y: t.clientY } : null
      }}
      onTouchMove={(e) => {
        if (!start.current) return
        const t = e.touches[0]
        const x = t.clientX - start.current.x
        if (Math.abs(t.clientY - start.current.y) > Math.abs(x) && x < 20) {
          start.current = null
          setDx(0)
          return
        }
        setDx(Math.max(0, x))
      }}
      onTouchEnd={() => {
        if (start.current && dx > 90) onClose()
        start.current = null
        setDx(0)
      }}
    >
      <header className="flex items-center border-b border-line bg-surface px-1 pb-1" style={{ paddingTop: 'max(env(safe-area-inset-top), 6px)' }}>
        <button onClick={onClose} className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-[17px] text-accent">
          <svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 2 2 10l8 8" />
          </svg>
          Zurück
        </button>
        {title && <span className="truncate pr-4 text-[17px] font-semibold">{title}</span>}
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-xl space-y-3 p-4 pb-8">{children}</div>
      </div>
      {footer && (
        <div className="border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          <div className="mx-auto max-w-xl space-y-2">{footer}</div>
        </div>
      )}
    </div>
  )
}
