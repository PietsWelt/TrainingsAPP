import { useEffect, useRef } from 'react'

const currentSheet = () => (history.state as { sheet?: string } | null)?.sheet

/** Schließt bei der Zurück-Taste/-Geste des Handys statt die App zu verlassen. */
export function useBackClose(onClose: () => void) {
  const ref = useRef(onClose)
  useEffect(() => {
    ref.current = onClose
  })
  useEffect(() => {
    const id = Math.random().toString(36).slice(2)
    history.pushState({ sheet: id }, '')
    let popped = false
    const onPop = () => {
      // Unser Eintrag ist weg: Es wurde „Zurück“ gedrückt.
      if (currentSheet() === id) return
      popped = true
      ref.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Per Knopf geschlossen: den eigenen Verlaufseintrag wieder entfernen.
      if (!popped && currentSheet() === id) history.back()
    }
  }, [])
}
