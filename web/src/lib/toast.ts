// Kleiner globaler Speicher für Hinweise, damit jede Stelle `toast(...)` aufrufen kann.

type Kind = 'info' | 'error'
export interface Item {
  id: number
  text: string
  kind: Kind
}

let listeners: ((items: Item[]) => void)[] = []
let items: Item[] = []
let next = 1

function emit() {
  for (const l of listeners) l(items)
}

export function subscribe(fn: (items: Item[]) => void): () => void {
  listeners.push(fn)
  fn(items)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

export function dismiss(id: number) {
  items = items.filter((i) => i.id !== id)
  emit()
}

/** Kurzer Hinweis unten über der Navigation. Fehler bleiben stehen, bis man sie antippt. */
export function toast(text: string, kind: Kind = 'info') {
  const id = next++
  items = [...items.filter((i) => i.text !== text), { id, text, kind }].slice(-3)
  emit()
  if (kind === 'info') setTimeout(() => dismiss(id), 4500)
}
