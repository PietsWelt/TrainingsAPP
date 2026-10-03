import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { SkeletonPage } from './components/Skeleton'
import { ThemeToggle } from './components/ThemeToggle'
import { Toaster } from './components/Toast'
import { toast } from './lib/toast'
import { tap } from './lib/haptics'
import { usePullToRefresh } from './lib/usePullToRefresh'
import { useSwipeTabs } from './lib/useSwipeTabs'
import { useDailyLog } from './lib/useDailyLog'
import type { Session } from '@supabase/supabase-js'
import { clearCache, readCache, sameData, writeCache } from './lib/cache'
import { latestRun, loadDataset, syncAndWait } from './lib/data'
import { dateLabel, relativeTime } from './lib/format'
import { localToday } from './lib/plan/dates'
import { supabase } from './lib/supabase'
import type { Dataset } from './lib/types'
import { Activities, ActivityDetail } from './pages/Activities'
import { Login } from './pages/Login'
import { Plan } from './pages/Plan'
import { usePlan } from './lib/plan/usePlan'
import { Today } from './pages/Today'
import { Logo } from './components/Logo'

// Trends bringt die Diagramm-Bibliothek mit (etwa die Hälfte des Codes). Sie wird erst geladen,
// wenn die App steht, damit der Start schnell bleibt und der Wechsel zu Trends trotzdem sofort klappt.
const loadTrends = () => import('./pages/Trends')
const Trends = lazy(() => loadTrends().then((m) => ({ default: m.Trends })))
/** Ohne neuen Sync und innerhalb dieser Zeit wird beim Zurückkehren nicht alles neu geladen. */
const FRESH_MS = 5 * 60_000

type Tab = 'today' | 'plan' | 'trends' | 'activities'
const TABS: Tab[] = ['today', 'plan', 'trends', 'activities']
const TITLES: Record<Tab, string> = { today: 'Heute', plan: 'Plan', trends: 'Trends', activities: 'Aktivitäten' }

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'SIGNED_OUT') clearCache()
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (supabase && !session) return <Login />
  return <Main />
}

function Main() {
  const [tab, setTab] = useState<Tab>('today')
  // Sofort der letzte Stand vom Gerät, frische Daten kommen im Hintergrund.
  const [data, setData] = useState<Dataset | null>(readCache)
  const [day, setDay] = useState(localToday)
  const loadedAt = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const plan = usePlan(data?.activities, day, data?.days)
  const log = useDailyLog()

  const refresh = useCallback(
    () =>
      loadDataset()
      .then((d) => {
        loadedAt.current = Date.now()
        // Unveränderte Daten behalten das alte Objekt: Plan und Diagramme rechnen dann nicht neu.
        setData((prev) => (sameData(prev, d) ? prev : d))
        writeCache(d)
        setError(null)
      })
      .catch((e: Error) => setError(e.message)),
    [],
  )

  useEffect(() => {
    void refresh()
    // Trends im Leerlauf vorladen.
    const id = setTimeout(() => void loadTrends(), 1500)
    return () => clearTimeout(id)
  }, [refresh])
  // Runterziehen startet wie der Knopf oben einen echten Garmin-Sync, nicht nur ein Neuladen.
  const pullRef = useRef<HTMLDivElement>(null)
  const ptr = usePullToRefresh(pullRef, () => {
    if (!syncing) void syncNow()
    return Promise.resolve()
  })

  // Richtung des letzten Wechsels: die neue Seite gleitet von dort herein, wohin gewischt wurde.
  const [dir, setDir] = useState<'right' | 'left' | null>(null)
  function selectTab(t: Tab) {
    // Erneut auf den aktiven Tab tippen springt nach oben, ein Wechsel startet oben.
    window.scrollTo({ top: 0, behavior: t === tab ? 'smooth' : 'auto' })
    if (t !== tab) setDir(TABS.indexOf(t) > TABS.indexOf(tab) ? 'right' : 'left')
    setTab(t)
  }

  const mainRef = useRef<HTMLElement>(null)
  useSwipeTabs(mainRef, TABS, tab, (t) => {
    tap()
    selectTab(t)
  })

  // Beim Zurückkehren in die App (z.B. nach einem Lauf) erst kurz nachsehen, ob ein neuer Sync gelaufen ist.
  // Nur dann wird alles neu geladen; das spart meist ein Dutzend Abfragen.
  const lastSyncRef = useRef(data?.lastSync)
  useEffect(() => {
    lastSyncRef.current = data?.lastSync
  }, [data])
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      setDay(localToday())
      if (Date.now() - loadedAt.current < FRESH_MS) return
      const run = await latestRun().catch(() => undefined)
      const known = lastSyncRef.current
      if (run && known && run.id === known.id && run.status === known.status) loadedAt.current = Date.now()
      else void refresh()
    }
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

  const NAV: { tab: Tab; icon: ReactNode }[] = [
    { tab: 'today', icon: <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /> },
    { tab: 'plan', icon: <path d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 9 2 2 4-4" /> },
    { tab: 'trends', icon: <path d="M3 17l5-5 4 4 8-8m0 0h-5m5 0v5" /> },
    { tab: 'activities', icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  ]

  return (
    <div className="min-h-dvh overflow-x-clip lg:pl-64">
      {/* Verlauf für aktive Symbole, einmal definiert (nicht in einem ausgeblendeten Element, sonst fehlt er). */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="nav-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--g1)" />
            <stop offset=".5" stopColor="var(--g2)" />
            <stop offset="1" stopColor="var(--g3)" />
          </linearGradient>
        </defs>
      </svg>
      {/* PC: Seitenleiste mit Logo, Bereichen und Sync. */}
      <aside className="glass fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line px-4 pt-6 pb-5 lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-7">
          <Logo size={34} />
          <span className="font-display text-[19px] font-semibold">Kadenz</span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Bereiche">
          {NAV.map((n) => (
            <SideButton key={n.tab} active={tab === n.tab} onClick={() => selectTab(n.tab)} label={TITLES[n.tab]} icon={n.icon} />
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          <ThemeToggle wide />
          <button onClick={syncNow} disabled={syncing} className="card relative flex min-h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-ink-2 disabled:opacity-70">
            <SyncIcon spinning={syncing} />
            {syncing ? 'Sync läuft …' : 'Jetzt synchronisieren'}
            <SyncDot data={data} />
          </button>
          <p className="text-xs leading-snug text-ink-3"><SyncStatus data={data} /></p>
        </div>
      </aside>

      <div className="mx-auto max-w-xl lg:max-w-5xl lg:px-6">
        <header className="glass-mobile sticky top-0 z-10 px-5 pb-3 lg:static lg:px-0 lg:pt-8" style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-3">
                <span className="lg:hidden"><Logo size={18} /></span>
                {tab === 'today' ? dateLabel(localToday(), { weekday: 'long', day: 'numeric', month: 'long' }) : <SyncStatus data={data} />}
              </p>
              <h1 className="text-[28px] leading-tight font-semibold lg:text-[34px]">{TITLES[tab]}</h1>
            </div>
            <div className="flex shrink-0 gap-2 lg:hidden">
              <ThemeToggle />
              <button onClick={syncNow} disabled={syncing} aria-label="Mit Garmin synchronisieren" className="card relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 disabled:opacity-70">
                <SyncIcon spinning={syncing} />
                <SyncDot data={data} />
              </button>
            </div>
          </div>
          {tab === 'today' && <p className="mt-0.5 text-xs text-ink-3 lg:hidden"><SyncStatus data={data} /></p>}
        </header>

        <main ref={mainRef} className="px-4 pt-1 will-change-transform lg:px-0 lg:pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}>
          <PullIndicator ref={pullRef} ready={ptr.ready} busy={ptr.busy} />
          {error && <div className="mb-3 rounded-xl border border-line bg-surface p-3 text-sm" style={{ color: 'var(--critical)' }}>{error}</div>}
          {!data && !error && <SkeletonPage />}
          <div key={tab} className={dir === 'right' ? 'tab-from-right' : dir === 'left' ? 'tab-from-left' : ''}>
            {data && tab === 'today' && <Today data={data} plan={plan} log={log} onOpenActivity={setOpenId} onOpenPlan={() => selectTab('plan')} />}
            {data && tab === 'plan' && <Plan plan={plan} gym={log.gym} activities={data.activities} records={data.records} predictions={data.predictions} garminRaces={data.garminRaces} />}
            {data && tab === 'trends' && (
              <Suspense fallback={<SkeletonPage />}>
                <Trends data={data} drinks={log.drinks} gym={log.gym} plan={plan} />
              </Suspense>
            )}
            {data && tab === 'activities' && <Activities activities={data.activities} onOpen={setOpenId} />}
          </div>
        </main>
      </div>

      {/* Handy: schwebende Tab-Leiste aus Glas mit gleitender Markierung. */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 lg:hidden" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }} aria-label="Bereiche">
        <div className="glass pointer-events-auto relative mx-auto grid max-w-md grid-cols-4 gap-1 rounded-full border border-[var(--card-border)] p-1.5" style={{ boxShadow: 'var(--shadow)' }}>
          <span
            aria-hidden
            className="absolute top-1.5 bottom-1.5 left-1.5 rounded-full bg-surface-2"
            style={{ width: 'calc((100% - 12px - 12px) / 4)', transform: `translateX(calc(${TABS.indexOf(tab)} * (100% + 4px)))`, transition: 'transform 380ms var(--spring)' }}
          />
          {NAV.map((n) => (
            <NavButton key={n.tab} active={tab === n.tab} onClick={() => selectTab(n.tab)} label={TITLES[n.tab]} icon={n.icon} />
          ))}
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

/** Die Höhe setzt usePullToRefresh direkt am Element. */
function PullIndicator({ ref, ready, busy }: { ref: Ref<HTMLDivElement>; ready: boolean; busy: boolean }) {
  return (
    <div ref={ref} className="flex items-center justify-center overflow-hidden text-xs text-ink-3" style={busy ? { height: 36 } : { height: 0 }} role="status" aria-hidden={!busy}>
      {busy ? 'Aktualisiere …' : ready ? 'Loslassen zum Aktualisieren' : 'Zum Aktualisieren ziehen'}
    </div>
  )
}

function NavIcon({ icon, active }: { icon: ReactNode; active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'url(#nav-grad)' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {icon}
    </svg>
  )
}

function NavButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} className={`relative flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[11px] font-semibold transition-colors duration-200 ${active ? 'text-ink' : 'text-ink-3'}`}>
      <NavIcon icon={icon} active={active} />
      {label}
    </button>
  )
}

function SideButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold transition-colors duration-200 ${active ? 'card text-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'}`}>
      <NavIcon icon={icon} active={active} />
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
