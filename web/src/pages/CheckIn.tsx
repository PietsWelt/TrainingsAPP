import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { Card, Segmented } from '../components/ui'
import type { GymEntry, GymFocus } from '../lib/dailyLog'
import { tap } from '../lib/haptics'
import { addDays, mondayOf, WEEKDAY_LONG, weekday } from '../lib/plan/dates'
import type { PlanWorkout } from '../lib/plan/types'
import { weekStrength } from '../lib/strength'
import type { PlanState } from '../lib/plan/usePlan'
import { toast } from '../lib/toast'
import type { DailyLogState } from '../lib/useDailyLog'
import { StrengthSheet } from './Strength'

const FOCUS: { id: GymFocus; label: string }[] = [
  { id: 'legs', label: 'Beine' },
  { id: 'upper', label: 'Oberkörper' },
  { id: 'full', label: 'Ganzkörper' },
  { id: 'core', label: 'Core' },
]
const DRINKS = [0, 1, 2, 3, 4, 5]
const DONE_KEY = 'checkin.done'

const readDone = () => {
  try {
    return localStorage.getItem(DONE_KEY)
  } catch {
    return null
  }
}

function gymText(g: GymEntry | undefined) {
  if (!g) return 'kein Krafttraining'
  return `${FOCUS.find((f) => f.id === g.focus)?.label}, ${g.hard ? 'hart' : 'locker'}`
}
const drinkText = (n: number | undefined) => (n == null ? 'Alkohol offen' : n === 0 ? 'kein Alkohol' : `${n >= 5 ? '5+' : n} ${n === 1 ? 'Getränk' : 'Getränke'}`)

/**
 * Täglicher Check-in: Alkohol und Krafttraining für gestern oder heute in einem Formular.
 * Einträge hängen am Datum; um Mitternacht wird aus „Heute“ einfach „Gestern“.
 */
export function CheckInCard({ log, plan, today, strengthToday }: { log: DailyLogState; plan: PlanState; today: string; strengthToday: boolean }) {
  const [open, setOpen] = useState<'yesterday' | 'today' | null>(null)
  const [done, setDone] = useState(readDone)
  const yesterday = addDays(today, -1)
  const yesterdayDone = done === today || log.drinks[yesterday] != null
  const nextKey = plan.workouts.find((w) => w.date > today && w.key_session && w.status === 'planned' && w.sport !== 'race')
  const legsToday = log.gym[today] && (log.gym[today].focus === 'legs' || log.gym[today].focus === 'full')

  return (
    <>
      {!yesterdayDone ? (
        <Card title="Check-in für gestern" subtitle="Alkohol und Krafttraining fließen in deine Readiness ein.">
          <button onClick={() => setOpen('yesterday')} className="min-h-12 w-full rounded-xl btn-primary text-[15px] font-semibold">
            Jetzt eintragen
          </button>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: 'var(--good)' }} aria-hidden>
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">Check-in erledigt</div>
              <div className="text-xs text-ink-2">
                Gestern: {drinkText(log.drinks[yesterday])}, {gymText(log.gym[yesterday])}
              </div>
            </div>
            <button onClick={() => setOpen('yesterday')} className="min-h-10 shrink-0 rounded-full bg-surface-2 px-3.5 text-sm font-medium text-ink-2">
              Ändern
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Heute</div>
            <div className="text-xs text-ink-2">
              {log.drinks[today] != null || log.gym[today] ? `${drinkText(log.drinks[today])}, ${gymText(log.gym[today])}` : 'Gym oder Alkohol heute? Hier nachtragen.'}
            </div>
            {strengthToday && !log.gym[today] && <div className="mt-1 text-xs text-accent">Garmin hat heute Krafttraining erkannt. Was hast du trainiert?</div>}
          </div>
          <button onClick={() => setOpen('today')} className="min-h-10 shrink-0 rounded-full bg-surface-2 px-3.5 text-sm font-medium text-accent">
            Eintragen
          </button>
        </div>
        {legsToday && nextKey && (
          <p className="mt-3 text-xs text-ink-2">
            {nextKey.date === addDays(today, 1)
              ? `Morgen steht ${nextKey.title} an. Mit müden Beinen schlägt dir die App morgen locker oder verschieben vor.`
              : `Nächste harte Einheit: ${nextKey.title} am ${WEEKDAY_LONG[weekday(nextKey.date)]}. Genug Abstand für die Beine.`}
          </p>
        )}
      </Card>

      {open && (
        <CheckInSheet
          log={log}
          workouts={plan.workouts}
          initial={open}
          today={today}
          onClose={() => setOpen(null)}
          onSaved={(day) => {
            if (day === 'yesterday') {
              try {
                localStorage.setItem(DONE_KEY, today)
              } catch {
                // ohne Speicher zählt der Eintrag selbst
              }
              setDone(today)
            }
            setOpen(null)
          }}
        />
      )}
    </>
  )
}

function CheckInSheet({
  log,
  workouts,
  initial,
  today,
  onClose,
  onSaved,
}: {
  log: DailyLogState
  workouts: PlanWorkout[]
  initial: 'yesterday' | 'today'
  today: string
  onClose: () => void
  onSaved: (day: 'yesterday' | 'today') => void
}) {
  const [day, setDay] = useState(initial)
  const [planFor, setPlanFor] = useState<'legs' | 'upper' | null>(null)
  const date = day === 'yesterday' ? addDays(today, -1) : today
  type Draft = { drinks: number | null; gym: GymEntry | null }
  const [drafts, setDrafts] = useState<Record<'yesterday' | 'today', Draft>>(() => ({
    yesterday: {
      drinks: log.drinks[addDays(today, -1)] ?? null,
      gym: log.gym[addDays(today, -1)] ?? null,
    },
    today: { drinks: log.drinks[today] ?? null, gym: log.gym[today] ?? null },
  }))
  const d = drafts[day]
  const set = (patch: Partial<Draft>) => {
    tap()
    setDrafts((all) => ({ ...all, [day]: { ...all[day], ...patch } }))
  }
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      if (d.drinks !== (log.drinks[date] ?? null)) await log.setDrinks(date, d.drinks)
      const cur = log.gym[date] ?? null
      if (JSON.stringify(d.gym) !== JSON.stringify(cur)) await log.setGym(date, d.gym)
      toast(`Gespeichert für ${day === 'yesterday' ? 'gestern' : 'heute'}: ${drinkText(d.drinks ?? undefined)}, ${gymText(d.gym ?? undefined)}.`)
      onSaved(day)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        title="Check-in"
        onClose={onClose}
        footer={
          <button disabled={busy} onClick={save} className="min-h-12 w-full rounded-xl btn-primary text-[15px] font-semibold disabled:opacity-60">
            {busy ? 'Speichere …' : 'Speichern'}
          </button>
        }
      >
        <Segmented
          value={day}
          onChange={setDay}
          options={[
            { value: 'yesterday', label: 'Gestern' },
            { value: 'today', label: 'Heute' },
          ]}
        />

        <Card title={day === 'yesterday' ? 'Alkohol gestern Abend' : 'Alkohol heute Abend'} subtitle="Getränke, z. B. ein Bier oder ein Glas Wein">
          <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Alkohol">
            {DRINKS.map((n) => {
              const on = d.drinks === n || (n === 5 && (d.drinks ?? 0) > 5)
              return (
                <button
                  key={n}
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ drinks: on ? null : n })}
                  className={`min-h-12 rounded-xl text-[15px] font-semibold ${on ? 'btn-primary' : 'bg-surface-2 text-ink-2'}`}
                >
                  {n === 5 ? '5+' : n}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-ink-3">{day === 'yesterday' ? 'Zählt für deine Readiness heute.' : 'Zählt für deine Readiness morgen.'}</p>
        </Card>

        <Card title="Krafttraining" subtitle="Beine wirken sich auf die nächsten Läufe aus, Oberkörper kaum">
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Krafttraining">
            <button
              role="radio"
              aria-checked={!d.gym}
              onClick={() => set({ gym: null })}
              className={`col-span-2 min-h-11 rounded-xl text-sm font-semibold ${!d.gym ? 'btn-primary' : 'bg-surface-2 text-ink-2'}`}
            >
              Kein Krafttraining
            </button>
            {FOCUS.map((f) => {
              const on = d.gym?.focus === f.id
              return (
                <button
                  key={f.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ gym: { focus: f.id, hard: d.gym?.hard ?? true } })}
                  className={`min-h-11 rounded-xl px-1 text-sm font-semibold ${on ? 'btn-primary' : 'bg-surface-2 text-ink-2'}`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
          {d.gym && (
            <div className="mt-3 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Intensität">
              {[false, true].map((hard) => (
                <button
                  key={String(hard)}
                  role="radio"
                  aria-checked={d.gym?.hard === hard}
                  onClick={() => set({ gym: { ...d.gym!, hard } })}
                  className={`min-h-10 rounded-xl text-sm font-medium ${d.gym?.hard === hard ? 'bg-ink text-surface' : 'bg-surface-2 text-ink-2'}`}
                >
                  {hard ? 'Hart' : 'Locker'}
                </button>
              ))}
            </div>
          )}
          {(d.gym?.focus === 'legs' || d.gym?.focus === 'upper') && (
            <button
              onClick={() => setPlanFor(d.gym!.focus as 'legs' | 'upper')}
              className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl bg-surface-2 px-3.5 text-sm font-semibold text-accent"
            >
              {d.gym.focus === 'legs' ? 'Läufer-Beintag zum Abhaken öffnen' : 'Oberkörperplan zum Abhaken öffnen'}
              <span aria-hidden>›</span>
            </button>
          )}
          <p className="mt-2 text-xs text-ink-3">Tipp: Beine am besten am Tag einer harten Laufeinheit, ein paar Stunden danach, oder mit 2 Tagen Abstand zur nächsten.</p>
        </Card>
      </Sheet>
      {planFor && <StrengthSheet which={planFor} week={weekStrength(mondayOf(today), workouts, log.gym, today)} done={false} today={today} log={log} onClose={() => setPlanFor(null)} />}
    </>
  )
}
