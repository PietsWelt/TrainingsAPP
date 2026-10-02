// Wettervorhersage für heute an deinem Standort (Open-Meteo, kostenlos, ohne Schlüssel).
// Standort: das Handy (wenn erlaubt), sonst der Startort deines letzten Laufs.
// Koordinaten werden auf etwa 10 km gerundet, bevor sie das Handy verlassen.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface HourWeather {
  /** Lokale Zeit, z.B. 2026-10-03T07:00 */
  time: string
  temp: number
  dew: number
}
export type WeatherSource = 'device' | 'last_run' | 'demo'
export interface Forecast {
  source: WeatherSource
  hours: HourWeather[]
}

const GEO_KEY = 'weather.geo'
const CACHE_KEY = 'weather.cache'
const MAX_AGE = 30 * 60_000

export type GeoChoice = 'yes' | 'no' | null
export function geoChoice(): GeoChoice {
  try {
    return (localStorage.getItem(GEO_KEY) as GeoChoice) ?? null
  } catch {
    return null
  }
}
export function setGeoChoice(v: 'yes' | 'no') {
  try {
    localStorage.setItem(GEO_KEY, v)
  } catch {
    // ohne Speicher wird beim nächsten Mal erneut gefragt
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10

function devicePosition(): Promise<{ lat: number; lon: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { maximumAge: MAX_AGE, timeout: 8000, enableHighAccuracy: false },
    ),
  )
}

async function lastRunPosition(): Promise<{ lat: number; lon: number } | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('activities')
    .select('lat:raw->startLatitude,lon:raw->startLongitude')
    .not('raw->startLatitude', 'is', null)
    .order('start_time', { ascending: false })
    .limit(1)
  const row = data?.[0] as { lat: number; lon: number } | undefined
  return row ? { lat: Number(row.lat), lon: Number(row.lon) } : null
}

function demoForecast(): Forecast {
  const hours = Array.from({ length: 48 }, (_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setHours(i)
    const pad = (x: number) => String(x).padStart(2, '0')
    const t = 16 + 10 * Math.sin(((d.getHours() - 9) / 24) * 2 * Math.PI)
    return { time: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`, temp: round1(t), dew: round1(14 + (t - 16) * 0.3) }
  })
  return { source: 'demo', hours }
}

function readCache(): (Forecast & { at: number }) | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as (Forecast & { at: number }) | null
    return c && Date.now() - c.at < MAX_AGE ? c : null
  } catch {
    return null
  }
}

export async function loadForecast(useDevice: boolean): Promise<Forecast | null> {
  if (!supabase) return demoForecast()
  const cached = readCache()
  if (cached && (cached.source === 'device') === useDevice) return cached
  const device = useDevice ? await devicePosition() : null
  const pos = device ?? (await lastRunPosition())
  if (!pos) return null
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: String(round1(pos.lat)),
    longitude: String(round1(pos.lon)),
    hourly: 'temperature_2m,dew_point_2m',
    forecast_days: '2',
    timezone: 'auto',
  }).toString()
  const res = await fetch(url)
  if (!res.ok) return null
  const h = (await res.json()).hourly as { time: string[]; temperature_2m: number[]; dew_point_2m: number[] }
  const hours = h.time.map((time, i) => ({ time, temp: h.temperature_2m[i], dew: h.dew_point_2m[i] })).filter((x) => x.temp != null && x.dew != null)
  const out: Forecast = { source: device ? 'device' : 'last_run', hours }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...out, at: Date.now() }))
  } catch {
    // nur ohne Zwischenspeicher
  }
  return out
}

/** Vorhersage laden, sobald `enabled`; `choice` = ob der Handy-Standort genutzt werden darf. */
export function useForecast(enabled: boolean, choice: GeoChoice) {
  const [forecast, setForecast] = useState<Forecast | null | undefined>(undefined)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    loadForecast(choice === 'yes')
      .then((f) => alive && setForecast(f))
      .catch(() => alive && setForecast(null))
    return () => {
      alive = false
    }
  }, [enabled, choice])
  return forecast
}
