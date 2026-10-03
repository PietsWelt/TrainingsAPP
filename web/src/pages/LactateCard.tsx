import { useState } from 'react'
import { SimpleLineChart } from '../components/charts'
import { Card } from '../components/ui'
import { personalAet, personalLt, type Aet } from '../lib/aet'
import { alphaZone, compareLt, latestGarminLt, LT_TOLERANCE } from '../lib/lactate'
import { dateLabel, speed, sportGroup } from '../lib/format'
import type { Activity, GarminLactate } from '../lib/types'

const EVIDENCE = [
  {
    title: 'Was die Laktatschwelle ist',
    text: 'Die Belastung, ab der dein Körper mehr Laktat bildet, als er abbauen kann. Darunter kannst du lange laufen, darüber wirst du schnell müde. Das Tempo dort hältst du etwa eine Stunde durch, bei Hobbyläufern liegt es meist zwischen 10-km- und Halbmarathon-Tempo.',
    source: 'Faude et al. 2009, Sports Medicine',
  },
  {
    title: 'Garmins Wert',
    text: 'Garmin schätzt Puls und Tempo an der Schwelle aus Puls, Herzfrequenzvariabilität und Tempo. Das klappt nur mit Brustgurt, entweder im geführten Test (Uhr: Leistungswerte > Laktatschwelle) oder automatisch, wenn du lange genug nahe der Schwelle läufst. Deine Pulszonen auf der Uhr hängen an diesem Wert.',
    source: 'Garmin / Firstbeat',
  },
  {
    title: 'Der Alpha-Wert',
    text: 'DFA-alpha1 beschreibt, wie geordnet dein Herzschlag schwankt. Locker liegt er um 1. Bei 0,75 liegt etwa die aerobe Schwelle, bei 0,5 etwa die Laktatschwelle (zweite Schwelle). Die App sucht in jedem Lauf mit Gurt den Puls, bei dem alpha1 die 0,5 kreuzt, und nimmt den Median der letzten bis zu 5 Schätzungen aus 90 Tagen.',
    source: 'Rogers et al. 2021 (J Funct Morphol Kinesiol), Gronwald et al. 2020',
  },
  {
    title: 'Wann es eine Schätzung gibt',
    text: 'Der Lauf muss mit Brustgurt und „HRV aufzeichnen“ sein, der Puls muss um mindestens 15 Schläge ansteigen und alpha1 muss mindestens 1,5 Minuten wirklich bis etwa 0,5 fallen. Das schaffen Tempodauerläufe, Intervalle oder Rennen, keine lockeren Läufe.',
    source: 'Rogers et al. 2021',
  },
  {
    title: 'Grenzen',
    text: `Bei 0,5 ist alpha1 ungenauer als bei 0,75: Im Mittel trifft es den Laborwert gut, einzeln kann es um rund 10 Schläge daneben liegen. Hitze, Müdigkeit und ein schlecht sitzender Gurt verschieben den Wert. Weichen Garmin und alpha1 um ${LT_TOLERANCE} oder mehr Schläge ab, ist keiner von beiden sicher richtig. Am genauesten ist ein Stufentest mit Laktatmessung.`,
    source: 'Rogers et al. 2021',
  },
]

/** Schwellen auf einer Pulsachse: grün bis zur aeroben Schwelle, gelb bis zur Laktatschwelle, rot darüber. */
function Ladder({ aet, lt, garmin }: { aet: Aet | null; lt: Aet | null; garmin: GarminLactate | null }) {
  const top = lt?.hr ?? garmin?.hr
  if (top == null) return null
  const marks = [aet?.hr, lt?.hr, garmin?.hr].filter((x): x is number => x != null)
  const lo = Math.min(...marks) - 15
  const hi = Math.max(...marks) + 10
  const pos = (hr: number) => `${((hr - lo) / (hi - lo)) * 100}%`
  const green = aet && aet.hr < top ? aet.hr : null
  return (
    <div className="mt-4" aria-hidden>
      <div className="relative h-9">
        {aet && <Mark at={pos(aet.hr)} label={`α1 0,75 · ${aet.hr}`} up />}
        {lt && <Mark at={pos(lt.hr)} label={`α1 0,5 · ${lt.hr}`} up />}
      </div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {green != null && <div style={{ width: pos(green), background: 'var(--zone-2)' }} />}
        <div style={{ width: green != null ? `calc(${pos(top)} - ${pos(green)})` : pos(top), background: green != null ? 'var(--zone-3)' : 'var(--zone-2)' }} />
        <div className="flex-1" style={{ background: 'var(--zone-5)' }} />
      </div>
      <div className="relative h-9">{garmin && <Mark at={pos(garmin.hr)} label={`Garmin · ${garmin.hr}`} />}</div>
      <div className="flex justify-between text-[11px] text-ink-3">
        <span>locker</span>
        {green != null && <span>mittel</span>}
        <span>hart</span>
      </div>
    </div>
  )
}

function Mark({ at, label, up = false }: { at: string; label: string; up?: boolean }) {
  return (
    <div className={`absolute flex -translate-x-1/2 flex-col items-center ${up ? 'bottom-0' : 'top-0'}`} style={{ left: at }}>
      {!up && <div className="h-2 w-0.5 rounded-full bg-ink" />}
      <span className="text-[11px] font-medium whitespace-nowrap text-ink-2 tabular-nums">{label}</span>
      {up && <div className="h-2 w-0.5 rounded-full bg-ink" />}
    </div>
  )
}

function Value({ title, hr, mps, note }: { title: string; hr: number; mps: number | null | undefined; note: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-surface-2 p-3">
      <div className="text-xs font-medium text-ink-2">{title}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{hr}</span>
        <span className="text-sm text-ink-3">bpm</span>
      </div>
      <div className="text-sm font-medium text-ink-2 tabular-nums">{mps ? speed(mps, 'running') : 'Tempo fehlt'}</div>
      <div className="mt-1 text-[11px] text-ink-3">{note}</div>
    </div>
  )
}

export function LactateCard({ activities, lactate, today, from }: { activities: Activity[]; lactate: GarminLactate[] | undefined; today: string; from: string }) {
  const [why, setWhy] = useState(false)
  const g = latestGarminLt(lactate, today)
  const strapRuns = activities.filter((a) => a.hr_source === 'strap' && sportGroup(a.sport) === 'run')
  if (!g && !strapRuns.length) return null
  const lt = personalLt(activities)
  const aet = personalAet(activities)
  const cmp = compareLt(g?.lt ?? null, lt)
  const lastAlpha = strapRuns.find((a) => a.dfa_a1 != null)
  const points = activities
    .filter((a) => a.lt_hr != null && a.local_date >= from)
    .map((a) => ({ date: a.local_date, value: Math.round(a.lt_hr!) }))
    .reverse()

  return (
    <Card title="Laktatschwelle" subtitle="Puls und Tempo, die du etwa eine Stunde halten kannst">
      <div className="flex gap-2.5">
        {g ? (
          <Value title="Garmin" hr={g.lt.hr} mps={g.lt.speed_mps} note={`bestimmt ${dateLabel(g.lt.date)}${g.stale ? ', lange her' : ''}`} />
        ) : (
          <div className="flex-1 rounded-2xl bg-surface-2 p-3 text-xs text-ink-2">Garmin hat noch keinen Wert geliefert. Er erscheint nach dem nächsten Sync, sobald die Uhr eine Schwelle kennt.</div>
        )}
        {lt ? (
          <Value title="Alpha1 (0,5)" hr={lt.hr} mps={lt.speed} note={`aus ${lt.n} ${lt.n === 1 ? 'Lauf' : 'Läufen'}, zuletzt ${dateLabel(lt.date)}`} />
        ) : (
          <div className="flex-1 rounded-2xl bg-surface-2 p-3 text-xs text-ink-2">
            Alpha1: noch keine Schätzung. Dafür braucht es einen Tempolauf, Intervalle oder ein Rennen mit Brustgurt und „HRV aufzeichnen“.
          </div>
        )}
      </div>

      {cmp && (
        <p className="mt-3 text-sm text-ink-2">
          {cmp.verdict === 'passt' && <>Beide Werte liegen nah beieinander ({Math.abs(cmp.diff)} bpm). Das spricht dafür, dass die Schwelle stimmt.</>}
          {cmp.verdict === 'garmin-tiefer' && (
            <>
              Garmin liegt {-cmp.diff} bpm unter der Alpha1-Schätzung. Dann sind deine Pulszonen auf der Uhr zu tief angesetzt und du landest schnell in Zone 4 und 5, obwohl es
              noch nicht so hart ist. Ein geführter Laktatschwellentest mit Gurt kann Garmins Wert korrigieren.
            </>
          )}
          {cmp.verdict === 'garmin-hoeher' && (
            <>
              Garmin liegt {cmp.diff} bpm über der Alpha1-Schätzung. Im Zweifel den tieferen Wert als Grenze nehmen: Wer zu lange knapp über der echten Schwelle läuft,
              ermüdet stärker als geplant.
            </>
          )}
        </p>
      )}

      <Ladder aet={aet} lt={lt} garmin={g?.lt ?? null} />

      {lastAlpha && (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-2">
          <span>Letzter Lauf mit Gurt ({dateLabel(lastAlpha.local_date)}): Ø alpha1</span>
          <span className="flex items-center gap-1.5 font-semibold tabular-nums">
            <span className="size-2 rounded-full" style={{ background: alphaZone(lastAlpha.dfa_a1!).color }} />
            {lastAlpha.dfa_a1!.toLocaleString('de-DE', { minimumFractionDigits: 2 })} · {alphaZone(lastAlpha.dfa_a1!).label}
          </span>
        </div>
      )}

      {points.length >= 2 && (
        <div className="mt-3">
          <div className="text-xs font-medium text-ink-2">Alpha1-Schätzung pro Lauf (steigend = du hältst höheren Puls noch unter der Schwelle)</div>
          <SimpleLineChart name="Laktatschwelle" unit="bpm" color="var(--series-2)" data={points} />
        </div>
      )}

      <p className="mt-2 text-xs text-ink-3">Nur zur Info: Dein Plan und die Tempos auf der Uhr ändern sich dadurch nicht.</p>

      <button onClick={() => setWhy((x) => !x)} className="mt-1 min-h-10 text-sm font-medium text-accent" aria-expanded={why}>
        {why ? 'Weniger' : 'Was bedeuten die Werte?'}
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
