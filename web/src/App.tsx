import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { SkeletonPage } from './components/Skeleton'
import { Toaster } from './components/Toast'
import { toast } from './lib/toast'
import { tap } from './lib/haptics'
import { usePullToRefresh } from './lib/usePullToRefresh'
import { useSwipeTabs } from './lib/useSwipeTabs'
import { useDailyLog } from './lib/useDailyLog'
import type { Session } from '@supabase/supabase-js'
import { loadDataset, syncAndWait } from './lib/data'
import { dateLabel, relativeTime } from './lib/format'
import { localToday } from './lib/plan/dates'
import { supabase } from './lib/supabase'
import type { Dataset } from './lib/types'
import { Activities, ActivityDetail } from './pages/Activities'
import { Login } from './pages/Login'
import { Plan } from './pages/Plan'
import { usePlan } from './lib/plan/usePlan'
import { Today } from './pages/Today'
import { Trends } from './pages/Trends'

type Tab = 'today' | 'plan' | 'trends' | 'activities'
const TABS: Tab[] = ['today', 'plan', 'trends', 'activities']
const TITLES: Record<Tab, string> = { today: 'Heute', plan: 'Plan', trends: 'Trends', activities: 'Aktivitäten' }

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (supabase && !session) return <Login />
  return <Main />
}

function Main() {
  const [tab, setTab] = useState<Tab>('today')
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const plan = usePlan(data?.activities)
  const log = useDailyLog()

  const refresh = useCallback(
    () =>
      loadDataset()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: Error) => setError(e.message)),
    [],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])
  // Runterziehen startet wie der Knopf oben einen echten Garmin-Sync, nicht nur ein Neuladen.
  const ptr = usePullToRefresh(() => {
    if (!syncing) void syncNow()
    return Promise.resolve()
  })

  function selectTab(t: Tab) {
    // Erneut auf den aktiven Tab tippen springt nach oben, ein Wechsel startet oben.
    window.scrollTo({ top: 0, behavior: t === tab ? 'smooth' : 'auto' })
    setTab(t)
  }

  const mainRef = useRef<HTMLElement>(null)
  useSwipeTabs(mainRef, TABS, tab, (t) => {
    tap()
    selectTab(t)
  })

  // Beim Zurückkehren in die App neu laden (z.B. nach einem Lauf).
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  async function syncNow() {
    setSyncing(true)
    toast('Sync läuft. Dauert etwa eine halbe Minute.')
    try {
      const run = await syncAndWait()
      await refresh()
      if (run?.status === 'error') toast('Sync fehlgeschlagen. Details stehen in GitHub unter Actions.', 'error')
      else if (run) toast('Garmin-Daten aktualisiert.')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  const opened = openId != null ? data?.activities.find((a) => a.id === openId) : undefined

  return (
    <div className="mx-auto min-h-dvh max-w-xl overflow-x-clip">
      <header className="sticky top-0 z-10 bg-bg/85 px-5 pb-3 backdrop-blur-xl" style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-3">{tab === 'today' ? dateLabel(localToday(), { weekday: 'long', day: 'numeric', month: 'long' }) : <SyncStatus data={data} />}</p>
            <h1 className="text-[30px] leading-tight font-bold tracking-tight">{TITLES[tab]}</h1>
          </div>
          <button onClick={syncNow} disabled={syncing} aria-label="Mit Garmin synchronisieren" className="card relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 disabled:opacity-70">
            <SyncIcon spinning={syncing} />
            <SyncDot data={data} />
          </button>
        </div>
        {tab === 'today' && <p className="mt-0.5 text-xs text-ink-3"><SyncStatus data={data} /></p>}
      </header>

      <main ref={mainRef} className="px-4 pt-1 will-change-transform" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}>
        <PullIndicator pull={ptr.pull} ready={ptr.ready} busy={ptr.busy} />
        {error && <div className="mb-3 rounded-xl border border-line bg-surface p-3 text-sm" style={{ color: 'var(--critical)' }}>{error}</div>}
        {!data && !error && <SkeletonPage />}
        {data && tab === 'today' && <Today data={data} plan={plan} log={log} onOpenActivity={setOpenId} onOpenPlan={() => selectTab('plan')} />}
        {data && tab === 'plan' && <Plan plan={plan} activities={data.activities} records={data.records} predictions={data.predictions} />}
        {data && tab === 'trends' && <Trends data={data} drinks={log.drinks} gym={log.gym} plan={plan} />}
        {data && tab === 'activities' && <Activities activities={data.activities} onOpen={setOpenId} />}
      </main>

      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}>
        <div className="card pointer-events-auto mx-auto grid max-w-md grid-cols-4 gap-1 rounded-full p-1.5 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--surface) 86%, transparent)' }}>
          <NavButton active={tab === 'today'} onClick={() => selectTab('today')} label="Heute" icon={<path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />} />
          <NavButton active={tab === 'plan'} onClick={() => selectTab('plan')} label="Plan" icon={<path d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 9 2 2 4-4" />} />
          <NavButton active={tab === 'trends'} onClick={() => selectTab('trends')} label="Trends" icon={<path d="M3 17l5-5 4 4 8-8m0 0h-5m5 0v5" />} />
          <NavButton active={tab === 'activities'} onClick={() => selectTab('activities')} label="Aktivitäten" icon={<path d="M4 6h16M4 12h16M4 18h10" />} />
        </div>
      </nav>

      {opened && <ActivityDetail activity={opened} onClose={() => setOpenId(null)} />}
      <Toaster />
    </div>
  )
}

function SyncStatus({ data }: { data: Dataset | null }) {
  const s = data?.lastSync
  if (!supabase) return <span>Demo-Modus mit Beispieldaten</span>
  if (!s) return <span>Noch kein Sync gelaufen</span>
  if (s.status === 'error') return <span style={{ color: 'var(--critical)' }}>■ Sync fehlgeschlagen {relativeTime(s.started_at)}</span>
  return <span>Garmin synchronisiert {relativeTime(s.finished_at ?? s.started_at)}</span>
}

/** Punkt am Sync-Knopf: rot bei Fehler, sonst nichts. */
function SyncDot({ data }: { data: Dataset | null }) {
  if (data?.lastSync?.status !== 'error') return null
  return <span className="absolute top-2 right-2 h-2 w-2 rounded-full" style={{ background: 'var(--critical)' }} aria-hidden />
}

function PullIndicator({ pull, ready, busy }: { pull: number; ready: boolean; busy: boolean }) {
  if (!pull && !busy) return null
  return (
    <div className="flex items-center justify-center overflow-hidden text-xs text-ink-3" style={{ height: busy ? 36 : pull * 0.6 }} role="status">
      {busy ? 'Aktualisiere …' : ready ? 'Loslassen zum Aktualisieren' : 'Zum Aktualisieren ziehen'}
    </div>
  )
}

function NavButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} className={`flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition-colors ${active ? 'accent-soft text-accent' : 'text-ink-3'}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
      {label}
    </button>
  )
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={spinning ? 'animate-spin' : ''}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8m0-5v5h-5" />
    </svg>
  )
}
