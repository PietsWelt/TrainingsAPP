import { useCallback, useEffect, useState } from 'react'
import { loadDrinks, loadGym, saveDrinks, saveGym, type DrinksByDate, type GymByDate, type GymEntry } from './dailyLog'

export interface DailyLogState {
  drinks: DrinksByDate
  error: string | null
  setDrinks(date: string, n: number | null): Promise<void>
  gym: GymByDate
  setGym(date: string, entry: GymEntry | null): Promise<void>
}

export function useDailyLog(): DailyLogState {
  const [drinks, setAll] = useState<DrinksByDate>({})
  const [error, setError] = useState<string | null>(null)

  const [gym, setGymAll] = useState<GymByDate>({})

  useEffect(() => {
    loadDrinks()
      .then(setAll)
      .catch((e: Error) => setError(e.message))
    loadGym()
      .then(setGymAll)
      .catch((e: Error) => setError(e.message))
  }, [])

  const setGym = useCallback(async (date: string, entry: GymEntry | null) => {
    let before: GymByDate = {}
    setGymAll((all) => {
      before = all
      const next = { ...all }
      if (entry == null) delete next[date]
      else next[date] = entry
      return next
    })
    try {
      await saveGym(date, entry)
    } catch (e) {
      setGymAll(before)
      throw e
    }
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

  return { drinks, error, setDrinks, gym, setGym }
}
