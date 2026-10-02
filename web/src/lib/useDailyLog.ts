import { useCallback, useEffect, useState } from 'react'
import { loadDrinks, saveDrinks, type DrinksByDate } from './dailyLog'

export interface DailyLogState {
  drinks: DrinksByDate
  error: string | null
  setDrinks(date: string, n: number | null): Promise<void>
}

export function useDailyLog(): DailyLogState {
  const [drinks, setAll] = useState<DrinksByDate>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDrinks()
      .then(setAll)
      .catch((e: Error) => setError(e.message))
  }, [])

  const setDrinks = useCallback(async (date: string, n: number | null) => {
    // Sofort anzeigen, dann speichern; bei Fehler zurückdrehen.
    let before: DrinksByDate = {}
    setAll((all) => {
      before = all
      const next = { ...all }
      if (n == null) delete next[date]
      else next[date] = n
      return next
    })
    try {
      await saveDrinks(date, n)
      setError(null)
    } catch (e) {
      setAll(before)
      throw e
    }
  }, [])

  return { drinks, error, setDrinks }
}
