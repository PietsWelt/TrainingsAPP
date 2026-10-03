import { useState } from 'react'
import { tap } from '../lib/haptics'
import { readTheme, saveTheme, type ThemeMode } from '../lib/theme'
import { toast } from '../lib/toast'

const NEXT: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }
const LABEL: Record<ThemeMode, string> = { auto: 'Wie das Handy', light: 'Hell', dark: 'Dunkel' }

/** Ein Tipp wechselt: wie das Handy → Hell → Dunkel → wie das Handy. */
export function ThemeToggle({ wide }: { wide?: boolean }) {
  const [mode, setMode] = useState(readTheme)
  function next() {
    tap()
    const m = NEXT[mode]
    saveTheme(m)
    setMode(m)
    toast(`Darstellung: ${LABEL[m]}`)
  }
  const icon = <ThemeIcon mode={mode} />
  if (wide)
    return (
      <button onClick={next} className="card flex min-h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-ink-2">
        {icon}
        {LABEL[mode]}
      </button>
    )
  return (
    <button onClick={next} aria-label={`Darstellung: ${LABEL[mode]}. Tippen zum Wechseln`} className="card flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2">
      {icon}
    </button>
  )
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {mode === 'light' ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : mode === 'dark' ? (
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
        </>
      )}
    </svg>
  )
}
