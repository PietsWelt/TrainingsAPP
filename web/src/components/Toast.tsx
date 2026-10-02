import { useEffect, useState } from 'react'
import { dismiss, subscribe, type Item } from '../lib/toast'

export function Toaster() {
  const [list, setList] = useState<Item[]>([])
  useEffect(() => subscribe(setList), [])
  if (!list.length) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }} aria-live="polite">
      {list.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="toast-in pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm shadow-lg"
        >
          {t.kind === 'error' && (
            <span style={{ color: 'var(--critical)' }} aria-hidden>
              ■
            </span>
          )}
          <span className="flex-1 text-ink">{t.text}</span>
          <span className="text-ink-3" aria-label="Schließen">✕</span>
        </button>
      ))}
    </div>
  )
}
