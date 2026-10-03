import { useEffect, useState } from 'react'
import { dismiss, subscribe, type Item } from '../lib/toast'

export function Toaster() {
  const [list, setList] = useState<Item[]>([])
  useEffect(() => subscribe(setList), [])
  if (!list.length) return null
  return (
    <div className="toast-stack pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4 lg:right-6 lg:left-auto lg:w-96 lg:items-end lg:px-0" aria-live="polite">
      {list.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="toast-in pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border border-line bg-surface-solid px-4 py-3 text-left text-sm font-medium shadow-[0_18px_40px_-16px_rgb(20_10_60/0.45)]"
        >
          {t.kind === 'error' ? (
            <span style={{ color: 'var(--critical)' }} aria-hidden>
              ■
            </span>
          ) : (
            <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          )}
          <span className="flex-1 text-ink">{t.text}</span>
          <span className="text-ink-3" aria-label="Schließen">✕</span>
        </button>
      ))}
    </div>
  )
}
