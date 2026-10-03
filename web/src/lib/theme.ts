/** Hell, Dunkel oder wie das Handy: Wahl wird pro Gerät gemerkt. */
export type ThemeMode = 'auto' | 'light' | 'dark'

const KEY = 'theme'
const BAR = { light: '#f4f2fb', dark: '#0c0a1f' }

export function readTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'auto') delete root.dataset.theme
  else root.dataset.theme = mode
  // Statusleiste des Handys passend einfärben.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const own = m.media.includes('dark') ? BAR.dark : BAR.light
    m.content = mode === 'auto' ? own : BAR[mode]
  })
}

export function saveTheme(mode: ThemeMode) {
  try {
    if (mode === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, mode)
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Schließen
  }
  applyTheme(mode)
}
