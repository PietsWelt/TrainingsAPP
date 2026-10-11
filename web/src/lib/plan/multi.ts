// Mehrere Rennen gleichzeitig: Ein Rennen hat Priorität (A-Rennen), der Plan richtet sich danach.
// Die anderen werden eingebaut statt eigene, parallele Pläne zu bekommen (sonst doppelter Umfang):
// - Rennen vor dem Hauptrennen: kurze Entlastung davor, Erholung danach, im Plan des Hauptrennens.
// - Rennen nach dem Hauptrennen: eigener Plan, der erst nach der Erholung vom Hauptrennen beginnt.
// Bei mehreren Nebenrennen zählt das anspruchsvollere (längere) mehr.

import { scaleWorkout, snapshot } from './adapt'
import { addDays, daysBetween } from './dates'
import { fmtDuration, generatePlan, raceDistanceKm } from './generate'
import { eventTypeLabel, isTri, type EventType, type Fitness, type PlanWorkout, type RaceEvent } from './types'

/** Wie anspruchsvoll eine Renndistanz ist; entscheidet bei Nebenrennen, welches mehr zählt. */
const DEMAND: Record<EventType, number> = { '5k': 1, '10k': 2, tri_sprint: 2, half: 3, tri_olympic: 3, marathon: 4, tri_70_3: 4, tri_ironman: 5 }

/** Tage leichteres Training vor einem Nebenrennen (verkürztes Tapering). */
export const MINI_TAPER: Record<EventType, number> = { '5k': 3, '10k': 3, tri_sprint: 3, half: 4, tri_olympic: 4, marathon: 7, tri_70_3: 6, tri_ironman: 10 }
/** Tage ohne harte Einheiten nach einem Rennen. */
export const RECOVERY: Record<EventType, number> = { '5k': 2, '10k': 3, tri_sprint: 2, half: 5, tri_olympic: 4, marathon: 10, tri_70_3: 7, tri_ironman: 14 }
/** Ganz freie Tage direkt nach dem Rennen. */
const REST_DAYS: Record<EventType, number> = { '5k': 0, '10k': 0, tri_sprint: 0, half: 1, tri_olympic: 1, marathon: 2, tri_70_3: 2, tri_ironman: 3 }
/** Wochen Tapering des Hauptrennens (wie im Plan). */
const TAPER_WEEKS: Record<EventType, number> = { '5k': 1, '10k': 1, tri_sprint: 1, half: 2, tri_olympic: 1, marathon: 3, tri_70_3: 2, tri_ironman: 3 }

export type Role =
  | { kind: 'main'; rank: number; from: string }
  | { kind: 'own'; rank: number; from: string; after: string }
  | { kind: 'inside'; rank: number; owner: string; warnings: string[] }

export interface Arrangement {
  /** Das Hauptrennen (A-Rennen) unter den kommenden Rennen. */
  prio: RaceEvent | null
  /** true, wenn du die Priorität selbst gewählt hast. */
  chosen: boolean
  /** Mehr als ein kommendes Rennen: Dann gibt es etwas abzustimmen. */
  multiple: boolean
  roles: Map<string, Role>
}

/** Ohne Wahl gilt das anspruchsvollste Rennen als Hauptrennen, bei Gleichstand das spätere. */
function byDemand(a: RaceEvent, b: RaceEvent) {
  return DEMAND[b.type] - DEMAND[a.type] || b.date.localeCompare(a.date)
}

export function arrange(events: RaceEvent[], today: string): Arrangement {
  const upcoming = events.filter((e) => e.date > today)
  const roles = new Map<string, Role>()
  if (!upcoming.length) return { prio: null, chosen: false, multiple: false, roles }
  const picked = upcoming.find((e) => e.priority)
  const prio = picked ?? [...upcoming].sort(byDemand)[0]
  const ranked = [prio, ...upcoming.filter((e) => e.id !== prio.id).sort(byDemand)]
  const tomorrow = addDays(today, 1)

  // Rennen mit eigenem Planabschnitt: [from, date]
  const owners: { e: RaceEvent; from: string }[] = []
  ranked.forEach((e, rank) => {
    // Liegt ein wichtigeres Rennen danach und läuft dessen Plan schon? Dann wird dieses eingebaut.
    const host = owners.filter((o) => o.e.date > e.date && o.from <= e.date).sort((a, b) => a.e.date.localeCompare(b.e.date))[0]
    if (host) {
      roles.set(e.id, { kind: 'inside', rank, owner: host.e.id, warnings: warningsFor(e, host.e, false) })
      return
    }
    const before = owners.filter((o) => o.e.date < e.date).sort((a, b) => b.e.date.localeCompare(a.e.date))[0]
    const from = before ? addDays(before.e.date, RECOVERY[before.e.type] + 1) : tomorrow
    // Zu knapp nach dem vorigen Rennen für einen eigenen Aufbau: nur das Rennen selbst, mit Hinweis.
    if (before && daysBetween(from, e.date) < 7) {
      roles.set(e.id, { kind: 'inside', rank, owner: before.e.id, warnings: warningsFor(e, before.e, true) })
      return
    }
    const f = from < tomorrow ? tomorrow : from
    owners.push({ e, from: f })
    roles.set(e.id, rank === 0 ? { kind: 'main', rank, from: f } : { kind: 'own', rank, from: f, after: before?.e.id ?? '' })
  })
  return { prio, chosen: !!picked, multiple: upcoming.length > 1, roles }
}

function warningsFor(e: RaceEvent, host: RaceEvent, afterHost: boolean): string[] {
  const out: string[] = []
  if (!afterHost) {
    // Vor einem wichtigeren Rennen, in dessen Plan es liegt
    const gap = daysBetween(e.date, host.date)
    const taperStart = addDays(host.date, -7 * TAPER_WEEKS[host.type])
    if (e.date >= taperStart)
      out.push(`Liegt im Tapering vor ${host.name}. Lauf es nur locker als Trainingsreiz mit, nicht auf Zeit. Ein volles Rennen jetzt kostet mehr Frische, als es bringt.`)
    else if (gap < RECOVERY[e.type] + 7 * TAPER_WEEKS[host.type])
      out.push(`Nur ${gap} Tage vor ${host.name}. Nach ${eventTypeLabel(e.type)} brauchst du etwa ${RECOVERY[e.type]} Tage Erholung, danach beginnt schon das Tapering. Am besten kontrolliert laufen, nicht voll.`)
    if (DEMAND[e.type] >= 4 && DEMAND[host.type] >= 4 && gap < 42)
      out.push(`Zwei lange Rennen in ${Math.round(gap / 7)} Wochen sind eine hohe Belastung. Überleg, ob du eines streichst oder nur locker mitläufst.`)
  } else {
    // Kurz nach einem wichtigeren Rennen, zu kurz für einen eigenen Aufbau
    const since = daysBetween(host.date, e.date)
    if (since <= RECOVERY[host.type])
      out.push(`Nur ${since} Tage nach ${host.name}. Deine Beine sind dann noch in der Erholung (etwa ${RECOVERY[host.type]} Tage). Nur locker mitlaufen oder auslassen.`)
    else out.push(`Kurz nach ${host.name}: Für einen eigenen Aufbau ist keine Zeit. Bis dahin locker trainieren und das Rennen nach Gefühl laufen.`)
  }
  if (DEMAND[e.type] > DEMAND[host.type] && isTri(e.type) === isTri(host.type))
    out.push(`Der Plan bereitet auf ${eventTypeLabel(host.type)} vor, nicht auf ${eventTypeLabel(e.type)}. Lange Einheiten dafür fehlen, lauf es nur, wenn du die Distanz schon sicher schaffst.`)
  if (isTri(e.type) !== isTri(host.type))
    out.push(`Der Plan ist auf ${isTri(host.type) ? 'Triathlon' : 'Laufen'} ausgerichtet. Für ${eventTypeLabel(e.type)} gibt es keine eigenen Einheiten.`)
  return out
}

/** Trainingsstand am Ende eines Planabschnitts, geschätzt aus den geplanten Einheiten (vorsichtig: 90 %). */
export function fitnessFromPlan(ws: PlanWorkout[], raceDate: string, fallback: Fitness): Fitness {
  // Wochen vor dem Tapering: 8 bis 2 Wochen vor dem Rennen.
  const from = addDays(raceDate, -56)
  const to = addDays(raceDate, -14)
  const win = ws.filter((w) => w.date > from && w.date <= to && w.status !== 'skipped' && w.sport !== 'race')
  if (!win.length) return fallback
  const hours = { swim: 0, bike: 0, run: 0 }
  let km = 0
  let longest = 0
  for (const w of win) {
    if (w.sport === 'race') continue
    hours[w.sport] += (w.duration_min ?? 0) / 60 / 6
    if (w.sport === 'run') {
      km += (w.distance_km ?? 0) / 6
      longest = Math.max(longest, w.distance_km ?? 0)
    }
  }
  const f = 0.9
  return {
    weeklyRunKm: Math.max(fallback.weeklyRunKm, km * f),
    longestRunKm: Math.max(fallback.longestRunKm, longest * f),
    weeklyHours: { swim: Math.max(fallback.weeklyHours.swim, hours.swim * f), bike: Math.max(fallback.weeklyHours.bike, hours.bike * f), run: Math.max(fallback.weeklyHours.run, hours.run * f) },
  }
}

/** Markierung im Titel: Einheiten rund um ein eingebautes Nebenrennen. */
export const MARK_BEFORE = 'Rennwoche'
export const MARK_AFTER = 'Erholung'

/**
 * Baut ein Nebenrennen in den Plan eines anderen Rennens ein:
 * - davor ein paar Tage leichter, harte Einheiten in den letzten 2 Tagen werden locker,
 * - am Renntag das Rennen statt der geplanten Einheit,
 * - danach Ruhetage und Erholung ohne harte Einheiten.
 */
export function insertRace(host: PlanWorkout[], e: RaceEvent, warnings: string[], newId: () => string): PlanWorkout[] {
  const taperFrom = addDays(e.date, -MINI_TAPER[e.type])
  const restTo = addDays(e.date, REST_DAYS[e.type])
  const recTo = addDays(e.date, RECOVERY[e.type])
  const label = `${e.name} (${eventTypeLabel(e.type)})`
  const out: PlanWorkout[] = []
  let phase: PlanWorkout['phase'] = 'build'
  let week = 1
  for (const w of host) {
    if (w.sport === 'race' || w.date < taperFrom || w.date > recTo) {
      out.push(w)
      continue
    }
    if (w.date === e.date || (w.date > e.date && w.date <= restTo)) {
      if (w.date === e.date) {
        phase = w.phase
        week = w.week_index
      }
      continue // Renntag und Ruhetage
    }
    // Schon für ein anderes Nebenrennen angepasst: nicht doppelt kürzen.
    if (w.original) {
      out.push(w)
      continue
    }
    const before = w.date < e.date
    const days = Math.abs(daysBetween(w.date, e.date))
    const orig = snapshot(w)
    if (before) {
      if (w.key_session && (days <= 2 || w.kind === 'long')) {
        const mins = Math.max(20, Math.round(((w.duration_min ?? 40) * (days <= 2 ? 0.5 : 0.6)) / 5) * 5)
        out.push({
          ...w,
          kind: 'easy',
          key_session: false,
          steps: null,
          duration_min: mins,
          distance_km: w.distance_km != null ? Math.round(w.distance_km * (days <= 2 ? 0.5 : 0.6) * 10) / 10 : null,
          title: `${w.sport === 'run' ? (days <= 2 ? 'Lockerer Lauf mit Steigerungen' : 'Lockerer Lauf') : `${w.title.split(':')[0]}: locker`} · ${MARK_BEFORE}`,
          description: `${days === 1 ? 'Morgen' : `In ${days} Tagen`} ist ${label}. Deshalb locker und kürzer${days <= 2 && w.sport === 'run' ? ', am Ende 4 kurze Steigerungen' : ''}. Ursprünglich: ${w.title}.`,
          original: orig,
        })
      } else {
        const f = w.key_session ? 0.7 : 0.8
        out.push({ ...scaleWorkout(w, f), title: `${w.title} · ${MARK_BEFORE}`, description: `Etwas kürzer, weil in ${days} Tagen ${label} ist. ${w.key_session ? 'Die Intensität bleibt, der Umfang sinkt (wie beim Tapering).' : ''} ${w.description ?? ''}`.trim(), original: orig })
      }
    } else {
      // Erholung: keine harten Einheiten, alles kürzer.
      const f = w.kind === 'long' ? 0.6 : w.key_session ? 0.7 : 0.8
      const x = scaleWorkout(w, f)
      out.push({
        ...x,
        kind: w.key_session ? 'easy' : w.kind,
        key_session: false,
        steps: w.key_session ? null : x.steps,
        title: `${w.key_session ? (w.sport === 'run' ? 'Lockerer Lauf' : `${w.title.split(':')[0]}: locker`) : w.title} · ${MARK_AFTER}`,
        description: `Erholung nach ${label} (${days}. Tag). Ganz locker, keine harten Einheiten, bis die Beine wieder frisch sind.${w.key_session ? ` Ursprünglich: ${w.title}.` : ''}`,
        original: orig,
      })
    }
  }
  const km = raceDistanceKm(e.type)
  const why = warnings.length ? ` ${warnings.join(' ')}` : ''
  out.push({
    id: newId(),
    event_id: e.id,
    date: e.date,
    sport: 'race',
    kind: 'race',
    title: e.name,
    description: `Nebenrennen. Davor ${MINI_TAPER[e.type]} Tage leichter, danach ${RECOVERY[e.type]} Tage Erholung.${e.goal_time_s ? ` Ziel: ${fmtDuration(e.goal_time_s)}.` : ''}${why}`,
    duration_min: e.goal_time_s ? Math.round(e.goal_time_s / 60) : null,
    distance_km: km ? Math.round(km * 10) / 10 : null,
    key_session: true,
    phase,
    week_index: week,
    status: 'planned',
    activity_id: null,
    moved_from: null,
  })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Plan für alle kommenden Rennen zusammen, ab morgen. Ohne zweites Rennen identisch mit `generatePlan`.
 * Einheiten gehören zum Rennen, dessen Planabschnitt sie bilden; ein eingebautes Rennen selbst gehört zu sich.
 */
export function generateAll(events: RaceEvent[], fitness: Fitness, today: string, newId: () => string): PlanWorkout[] {
  const arr = arrange(events, today)
  const upcoming = events.filter((e) => arr.roles.has(e.id)).sort((a, b) => a.date.localeCompare(b.date))
  const plans = new Map<string, PlanWorkout[]>()
  // Eigene Abschnitte der Reihe nach, damit spätere Pläne beim Stand nach dem vorigen Rennen anfangen.
  for (const e of upcoming) {
    const role = arr.roles.get(e.id)!
    if (role.kind === 'inside') continue
    const prev = role.kind === 'own' && role.after ? events.find((x) => x.id === role.after) : undefined
    const fit = prev && plans.has(prev.id) ? fitnessFromPlan(plans.get(prev.id)!, prev.date, fitness) : fitness
    plans.set(e.id, generatePlan(e, fit, addDays(role.from, -1), newId))
  }
  // Nebenrennen einbauen, wichtigere zuerst (sie bekommen ihre Entlastung vollständig).
  const inside = upcoming.filter((e) => arr.roles.get(e.id)!.kind === 'inside').sort((a, b) => arr.roles.get(a.id)!.rank - arr.roles.get(b.id)!.rank)
  const extra: PlanWorkout[] = []
  for (const e of inside) {
    const role = arr.roles.get(e.id) as Extract<Role, { kind: 'inside' }>
    const host = plans.get(role.owner) ?? []
    const merged = insertRace(host, e, role.warnings, newId)
    extra.push(...merged.filter((w) => w.event_id === e.id))
    plans.set(
      role.owner,
      merged.filter((w) => w.event_id !== e.id),
    )
  }
  return [...[...plans.values()].flat(), ...extra].filter((w) => w.date > today).sort((a, b) => a.date.localeCompare(b.date))
}

/** Für die Anzeige: Welche Einheiten gehören zum Plan, in dem dieses Rennen liegt. */
export function planScope(arr: Arrangement, id: string): string[] {
  const role = arr.roles.get(id)
  const owner = role?.kind === 'inside' ? role.owner : id
  const ids = [owner]
  for (const [k, r] of arr.roles) if (r.kind === 'inside' && r.owner === owner) ids.push(k)
  return ids
}

/** Warum der Plan so mit mehreren Rennen umgeht. Vorsichtig formuliert, mit Grenzen der Studienlage. */
export const PRIORITY_WHY: { title: string; text: string; sources: string[] }[] = [
  {
    title: 'Ein Hauptrennen, nicht mehrere',
    text: 'Eine Saison läuft auf einen Höhepunkt zu. Grundlage, Aufbau, Spitze und Tapering lassen sich nur auf ein Datum ausrichten. Zwei volle Pläne gleichzeitig würden den Umfang verdoppeln, das ist der häufigste Weg in eine Überlastung. Deshalb gibt es ein A-Rennen, nach dem sich alles richtet, und Nebenrennen, die eingebaut werden.',
    sources: ['Issurin 2010, Sports Med (Periodisierung)', 'Friel, The Triathlete’s Training Bible (A-/B-/C-Rennen, Trainingspraxis, keine Studie)'],
  },
  {
    title: 'Kurz entlasten vor einem Nebenrennen',
    text: 'Vor dem Hauptrennen gilt das volle Tapering: Umfang um 40–60 % runter, Intensität bleibt. Vor einem Nebenrennen nur eine verkürzte Form davon (3–7 Tage, bei Langdistanz 10), damit du frisch genug bist, aber der Aufbau fürs Hauptrennen kaum leidet. Für so kurze Entlastungen ist die Studienlage dünn, es ist dieselbe Regel in klein.',
    sources: ['Bosquet et al. 2007, Med Sci Sports Exerc (Meta-Analyse Tapering)', 'Mujika & Padilla 2003, Med Sci Sports Exerc'],
  },
  {
    title: 'Erholung danach',
    text: 'Ein Rennen schädigt die Muskulatur stärker als Training. Nach einem Marathon sind Muskelschäden und Kraftverlust bis zu einer Woche und länger messbar. Darum nach dem Rennen erst Ruhetage, dann nur locker: nach 5 km etwa 2 Tage, nach 10 km 3, nach dem Halbmarathon 5, nach dem Marathon 10, nach einer Langdistanz 14. Die Tage sind Faustregeln aus diesen Befunden, keine exakten Werte.',
    sources: ['Warhol et al. 1985, Am J Pathol (Muskelschäden nach dem Marathon)', 'Clarkson & Hubal 2002, Am J Phys Med Rehabil'],
  },
  {
    title: 'Rücksicht nach Wichtigkeit',
    text: 'Das Hauptrennen bekommt immer seinen kompletten Plan mit Tapering. Liegt ein Nebenrennen zu nah davor, wird es als lockerer Trainingslauf empfohlen statt auf Zeit. Rennen nach dem Hauptrennen bekommen einen eigenen Plan, der erst nach der Erholung startet. Unter mehreren Nebenrennen zählt das längere mehr. Überlastungsschutz und die 10-%-Regel für lange Läufe gelten weiter für alles zusammen.',
    sources: ['Frandsen et al. 2025, Br J Sports Med (Länge einzelner Läufe und Verletzungen)', 'Gabbett 2016, Br J Sports Med (Belastungssteuerung)'],
  },
]
