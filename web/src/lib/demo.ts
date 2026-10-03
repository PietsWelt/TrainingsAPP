import { bestsFromActivities, mergeBests } from './records'
import type { Activity, Dataset, DailyMetrics } from './types'

// Realistisch wirkende Beispieldaten, solange Supabase noch nicht eingerichtet ist.

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

export function demoDataset(): Dataset {
  const r = rng(42)
  const days: DailyMetrics[] = []
  const activities: Activity[] = []
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  let id = 1

  for (let i = 179; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400_000)
    const date = d.toISOString().slice(0, 10)
    const fitness = 1 - i / 400 // langsam besser werdend
    // Die letzte Nacht ist im Demo schlecht, damit man die Anpassung des Plans sieht.
    const badNight = r() < 0.1 || i === 0
    const sleep = Math.round((badNight ? 5.2 : 7 + r() * 1.4) * 3600)
    const hrv = Math.round(52 + fitness * 8 + (r() - 0.5) * 12 - (badNight ? 10 : 0))
    days.push({
      date,
      sleep_s: sleep,
      deep_sleep_s: Math.round(sleep * (0.15 + r() * 0.06)),
      rem_sleep_s: Math.round(sleep * (0.2 + r() * 0.05)),
      light_sleep_s: Math.round(sleep * 0.55),
      awake_s: Math.round(600 + r() * 1800),
      sleep_score: Math.round(badNight ? 45 + r() * 15 : 70 + r() * 22),
      hrv_last_night: hrv,
      hrv_weekly_avg: Math.round(52 + fitness * 8),
      hrv_status: badNight ? 'UNBALANCED' : 'BALANCED',
      hrv_baseline_low: Math.round(49 + fitness * 6),
      hrv_baseline_high: Math.round(64 + fitness * 7),
      resting_hr: Math.round(52 - fitness * 4 + (r() - 0.5) * 3 + (badNight ? 4 : 0)),
      steps: Math.round(6000 + r() * 9000),
      body_battery_high: Math.round(badNight ? 45 + r() * 20 : 70 + r() * 28),
      body_battery_low: Math.round(5 + r() * 25),
      stress_avg: Math.round(20 + r() * 20),
      training_readiness: Math.round(badNight ? 25 + r() * 20 : 55 + r() * 40),
      vo2max_running: Math.round((49 + fitness * 3) * 10) / 10,
    })

    const dow = d.getDay()
    const plan: [string, number, number, number][] = [] // sport, km, pace s/km bzw. km/h, hr
    if (dow === 2) plan.push(['running', 9 + r() * 2, 285, 162])
    if (dow === 4) plan.push(['running', 8 + r() * 3, 330, 142])
    if (dow === 6) plan.push(['running', 14 + fitness * 8 + r() * 3, 345, 145])
    if (dow === 1 && r() < 0.8) plan.push(['running', 6 + r() * 2, 340, 138])
    if (dow === 3 || (dow === 0 && r() < 0.7)) plan.push(['road_biking', 35 + r() * 30, 28, 135])
    if (dow === 5 && r() < 0.8) plan.push(['lap_swimming', 2 + r(), 0, 128])

    for (const [sport, dist, p, hr] of plan) {
      const isRun = sport === 'running'
      const isSwim = sport === 'lap_swimming'
      const speed = isRun ? 1000 / (p - fitness * 10 + (r() - 0.5) * 10) : isSwim ? 100 / 115 : p / 3.6
      const distM = Math.round(dist * 1000)
      const dur = distM / speed
      const hard = isRun && hr > 155
      const zones = hard ? [0.05, 0.25, 0.25, 0.35, 0.1] : [0.1, 0.65, 0.2, 0.05, 0]
      activities.push({
        id: id++,
        start_time: `${date}T06:${String(10 + Math.floor(r() * 40)).padStart(2, '0')}:00Z`,
        local_date: date,
        sport,
        name: isRun ? (hard ? 'Intervalle' : dow === 6 ? 'Longrun' : 'Lockerer Lauf') : isSwim ? 'Schwimmen' : 'Radausfahrt',
        distance_m: distM,
        duration_s: Math.round(dur),
        avg_hr: Math.round(hr + (r() - 0.5) * 6),
        max_hr: Math.round(hr + 15 + r() * 10),
        avg_speed_mps: speed,
        elevation_gain_m: Math.round(r() * (isRun ? 120 : 500)),
        avg_power_w: sport === 'road_biking' ? Math.round(180 + r() * 40) : null,
        training_load: Math.round((dur / 60) * (hard ? 2.4 : 1.3)),
        aerobic_te: Math.round((2.5 + r() * 1.5) * 10) / 10,
        anaerobic_te: Math.round((hard ? 2 + r() * 1.5 : r() * 0.8) * 10) / 10,
        calories: Math.round(dur / 60 * 11),
        hr_zones_s: zones.map((z) => Math.round(z * dur)),
        rpe: isRun ? (hard ? 80 : 40) : null,
        decoupling_pct: isRun && !hard && dur > 2400 ? Math.round((7 - fitness * 4 + (r() - 0.5) * 4) * 10) / 10 : null,
      })
      // Wetter und Steigung ohne weitere Zufallszahlen, damit die übrigen Beispielwerte gleich bleiben.
      const last = activities[activities.length - 1]
      const season = Math.sin(((parseInt(date.slice(5, 7)) - 4) / 12) * 2 * Math.PI)
      last.temp_c = Math.round((13 + 10 * season + (last.id % 7) - 3) * 10) / 10
      last.dew_point_c = Math.round((last.temp_c - 7 + (last.id % 4)) * 10) / 10
      if (isRun) last.gap_factor = Math.round((1 + ((last.elevation_gain_m ?? 0) / distM) * 3) * 1000) / 1000
      // Brustgurt bei den meisten Läufen der letzten 8 Wochen.
      if (isRun && i < 56 && last.id % 3 !== 0) {
        const c = last.avg_hr! - (last.avg_hr! % 5)
        last.hr_source = 'strap'
        last.hr_hist = { [c - 10]: Math.round(dur * 0.15), [c - 5]: Math.round(dur * 0.2), [c]: Math.round(dur * 0.35), [c + 5]: Math.round(dur * 0.2), [c + 10]: Math.round(dur * 0.1) }
        last.dfa_a1 = Math.round((hard ? 0.5 + (last.id % 3) * 0.05 : 0.95 + (last.id % 4) * 0.05) * 100) / 100
        if (hard || dow === 6) {
          last.aet_hr = 147 + (last.id % 5) - Math.round(i / 28)
          last.aet_speed_mps = Math.round((1000 / (352 - fitness * 12 + (last.id % 3) * 3)) * 1000) / 1000
        }
        if (hard) {
          last.lt_hr = 172 + (last.id % 4) - Math.round(i / 28)
          last.lt_speed_mps = Math.round((1000 / (288 - fitness * 10 + (last.id % 3) * 3)) * 1000) / 1000
        }
      }
    }
  }

  activities.reverse()
  return {
    activities,
    days,
    garminRaces: [{ id: 1, name: 'Stadtlauf Halbmarathon', date: new Date(Date.now() + 140 * 86400_000).toISOString().slice(0, 10), distance_m: 21097.5, sport: 'running' }],
    lactate: [
      { date: new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10), hr: 163, speed_mps: 3.39 },
      { date: new Date(Date.now() - 18 * 86400_000).toISOString().slice(0, 10), hr: 165, speed_mps: 3.45 },
    ],
    predictions: [{ date: days.at(-1)!.date, time_5k: 1225, time_10k: 2560, time_half: 5690, time_marathon: 12050 }],
    records: mergeBests(
      [
        { type_id: 1, value: 221, activity_id: null, date: '2026-05-14' },
        { type_id: 3, value: 1238, activity_id: null, date: '2026-04-26' },
        { type_id: 4, value: 2604, activity_id: null, date: new Date(Date.now() - 9 * 86400_000).toISOString().slice(0, 10) },
      ],
      bestsFromActivities(activities),
    ),
    lastSync: { id: 0, trigger: 'demo', started_at: new Date(Date.now() - 12 * 60000).toISOString(), finished_at: null, status: 'ok', message: null },
  }
}
