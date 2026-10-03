import { useMemo, useState } from 'react'
import { Card } from '../components/ui'
import { addDays } from '../lib/plan/dates'
import { MARK_DELOAD, MARK_LIGHT, overloadCheck } from '../lib/plan/overload'
import type { PlanWorkout } from '../lib/plan/types'
import type { Activity, DailyMetrics } from '../lib/types'

const EVIDENCE = [
  { t: 'HRV im Wochenschnitt', d: 'Ein 7-Tage-Schnitt unter dem eigenen Normalbereich zeigt Ermüdung zuverlässiger als ein einzelner Morgenwert.', s: 'Plews et al. 2013, Int J Sports Physiol Perform' },
  { t: 'Ruhepuls', d: 'Ein über Tage erhöhter Ruhepuls passt zu unvollständiger Erholung, ist allein aber ein schwaches Zeichen.', s: 'Buchheit 2014, Front Physiol' },
  { t: 'Lastsprünge', d: 'Deutlich mehr Last als gewohnt geht mit mehr Verletzungen einher. Die Kennzahl ist umstritten, deshalb nur eines von mehreren Zeichen.', s: 'Gabbett 2016, BJSM; Impellizzeri et al. 2020, IJSPP' },
  { t: 'Lange Läufe', d: 'Ein einzelner Lauf, der mehr als 10 % länger ist als der längste der letzten 30 Tage, erhöht das Verletzungsrisiko deutlich.', s: 'Frandsen et al. 2025, BJSM' },
  { t: 'Schlaf', d: 'Wenig Schlaf verschlechtert Erholung und Leistung und hängt mit mehr Verletzungen zusammen.', s: 'Fullagar et al. 2015, Sports Med; Milewski et al. 2014, J Pediatr Orthop' },
  { t: 'Früh reagieren', d: 'Übertraining entwickelt sich schleichend. Wer bei mehreren Warnzeichen früh entlastet, ist meist nach Tagen wieder fit statt nach Wochen.', s: 'Meeusen et al. 2013, Med Sci Sports Exerc' },
]

/** Auf „Heute“: nur sichtbar, wenn es Warnzeichen für Überlastung gibt. */
export function OverloadCard({ days, activities, workouts, today }: { days: DailyMetrics[]; activities: Activity[]; workouts: PlanWorkout[]; today: string }) {
  const check = useMemo(() => overloadCheck(days, activities, workouts, today), [days, activities, workouts, today])
  const [why, setWhy] = useState(false)
  if (check.level === 0) return null
  const adjusted = workouts.filter((w) => w.date >= today && w.date < addDays(today, 7) && (w.title.includes(MARK_DELOAD) || w.title.includes(MARK_LIGHT)))
  const color = check.level === 2 ? 'var(--serious)' : 'var(--warning)'
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: color }} aria-hidden>
          !
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{check.level === 2 ? 'Warnzeichen für Überlastung' : 'Ein Warnzeichen für Überlastung'}</div>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {check.signals.map((s) => (
              <li key={s.key}>
                <span className="font-semibold text-ink">{s.label}:</span> {s.detail}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-2">
            {adjusted.length
              ? check.level === 2
                ? `Der Plan ist für 7 Tage auf Entlastung umgestellt (${adjusted.length} Einheiten): harte Einheiten locker, alles kürzer.`
                : `Die harten Einheiten der nächsten Tage sind etwas kürzer (${adjusted.length}), das Tempo bleibt.`
              : 'Der Plan ist gerade nicht angepasst (Rennwoche oder von dir zurückgenommen). Hör auf deinen Körper und lass im Zweifel eine harte Einheit aus.'}
          </p>
          <p className="mt-1 text-xs text-ink-3">Jede angepasste Einheit lässt sich im Plan mit „Original zurück“ wiederherstellen.</p>
          <button onClick={() => setWhy(!why)} aria-expanded={why} className="mt-2 text-xs font-semibold text-accent">
            {why ? 'Weniger' : 'Warum zurückschrauben?'}
          </button>
          {why && (
            <dl className="mt-2 space-y-2.5 text-sm">
              {EVIDENCE.map((e) => (
                <div key={e.t}>
                  <dt className="font-semibold">{e.t}</dt>
                  <dd className="text-ink-2">{e.d}</dd>
                  <dd className="text-xs text-ink-3">{e.s}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </Card>
  )
}
