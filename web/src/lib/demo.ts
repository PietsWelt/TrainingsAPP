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
    const badNight = r() < 0.1
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
      })
    }
  }

  activities.reverse()
  return {
    activities,
    days,
    lastSync: { id: 0, trigger: 'demo', started_at: new Date(Date.now() - 12 * 60000).toISOString(), finished_at: null, status: 'ok', message: null },
  }
}
