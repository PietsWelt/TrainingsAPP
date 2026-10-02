import { useState } from 'react'
import { SimpleLineChart } from '../components/charts'
import { Card } from '../components/ui'
import { AET_MARGIN } from '../lib/plan/analyze'
import { personalAet, shareAbove } from '../lib/aet'
import { dateLabel, speed, sportGroup } from '../lib/format'
import type { Activity } from '../lib/types'

const EVIDENCE = [
  {
    title: 'Was gemessen wird',
    text: 'Mit Brustgurt und „HRV aufzeichnen“ speichert die Uhr den Abstand zwischen jedem einzelnen Herzschlag. Daraus rechnet der Sync für jedes 2-Minuten-Stück des Laufs DFA-alpha1: wie geordnet der Puls schwankt. Locker liegt der Wert um 1, bei steigender Belastung fällt er. Die Uhr am Handgelenk kann das nicht messen.',
    source: 'Gronwald et al. 2020',
  },
  {
    title: 'Die Schwelle',
    text: 'Wo alpha1 unter 0,75 fällt, liegt etwa die aerobe Schwelle (erste ventilatorische Schwelle). In Studien lag der Puls dort im Mittel nur wenige Schläge neben dem Laborwert. Unterhalb dieser Grenze ist lockeres Training, das 80 % deines Trainings ausmachen sollte.',
    source: 'Rogers et al. 2021, Seiler 2010',
  },
  {
    title: 'Wie die App sie nutzt',
    text: `Ein Lauf liefert nur eine Schätzung, wenn dein Puls darin um mindestens 15 Schläge ansteigt und die 0,75 kreuzt, z. B. Einlaufen plus Tempoteil. Es zählt der Median der letzten bis zu 5 Schätzungen aus 90 Tagen. Lockere Läufe mit Gurt werden dann daran bewertet: Zu hart ist zu viel Zeit mehr als ${AET_MARGIN} Schläge darüber, statt Garmins Zone 4.`,
    source: 'Rogers et al. 2021',
  },
  {
    title: 'Grenzen',
    text: 'Viele Störschläge (schlecht sitzender oder trockener Gurt) verfälschen den Wert; solche Abschnitte werden verworfen. Hitze, Müdigkeit und Koffein können die Schwelle verschieben. Die Schätzung aus normalen Läufen ist ungenauer als ein Stufentest.',
    source: 'Rogers et al. 2021',
  },
]

export function AetCard({ activities, from }: { activities: Activity[]; from: string }) {
  const [why, setWhy] = useState(false)
  const strapRuns = activities.filter((a) => a.hr_source === 'strap' && sportGroup(a.sport) === 'run')
  if (!strapRuns.length) return null
  const aet = personalAet(activities)
  const points = activities
    .filter((a) => a.aet_hr != null && a.local_date >= from)
    .map((a) => ({ date: a.local_date, value: Math.round(a.aet_hr!) }))
    .reverse()
  // Wie viel Zeit lockerer Läufe mit Gurt unter Schwelle + Spielraum lag.
  const easy = aet ? strapRuns.filter((a) => a.local_date >= from && a.hr_hist && (a.anaerobic_te ?? 0) < 1.5) : []
  let total = 0
  let under = 0
  for (const a of easy) {
    const t = Object.values(a.hr_hist!).reduce((s, x) => s + x, 0)
    total += t
    under += t * (1 - (shareAbove(a.hr_hist, aet!.hr + AET_MARGIN) ?? 0))
  }

  return (
    <Card
      title="Aerobe Schwelle"
      subtitle={aet ? `aus ${aet.n} ${aet.n === 1 ? 'Lauf' : 'Läufen'} mit Brustgurt, zuletzt ${dateLabel(aet.date)}` : `${strapRuns.length} ${strapRuns.length === 1 ? 'Lauf' : 'Läufe'} mit Brustgurt`}
    >
      {aet ? (
        <>
          <div className="flex items-baseline gap-4">
            <div>
              <span className="text-3xl font-semibold tracking-tight">{aet.hr}</span>
              <span className="ml-1 text-sm text-ink-3">bpm</span>
            </div>
            {aet.speed && <div className="text-sm text-ink-2">etwa {speed(aet.speed, 'running')}</div>}
          </div>
          <p className="mt-1 text-xs text-ink-3">Bis hierhin ist locker. Lockere Läufe sollten meist darunter bleiben, bis {aet.hr + AET_MARGIN} bpm ist in Ordnung.</p>
          {total > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-ink-2">
                <span>Lockere Läufe mit Gurt unter {aet.hr + AET_MARGIN} bpm</span>
                <span className="font-semibold">{Math.round((under / total) * 100)} %</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${(under / total) * 100}%`, background: 'var(--zone-2)' }} />
              </div>
            </div>
          )}
          {points.length >= 2 && (
            <div className="mt-3">
              <div className="text-xs font-medium text-ink-2">Schätzung pro Lauf (steigend = du bist bei höherem Puls noch aerob)</div>
              <SimpleLineChart name="Schwelle" unit="bpm" color="var(--series-2)" data={points} />
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-2">
          Noch keine Schätzung. Dafür braucht es einen Lauf mit Brustgurt und „HRV aufzeichnen“, in dem der Puls um mindestens 15 Schläge ansteigt, z. B. 10 Minuten
          einlaufen und dann ein Tempoteil oder ein Lauf, der langsam schneller wird.
        </p>
      )}
      <button onClick={() => setWhy((x) => !x)} className="mt-2 min-h-10 text-sm font-medium text-accent" aria-expanded={why}>
        {why ? 'Weniger' : 'Wie wird das berechnet?'}
      </button>
      {why && (
        <div className="space-y-3 pb-1">
          {EVIDENCE.map((e) => (
            <div key={e.title}>
              <div className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{e.title}</div>
              <p className="mt-1 text-sm text-ink-2">{e.text}</p>
              <p className="mt-1 text-xs text-ink-3">Quellen: {e.source}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
