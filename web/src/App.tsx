import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { SkeletonPage } from './components/Skeleton'
import { Toaster } from './components/Toast'
import { toast } from './lib/toast'
import { usePullToRefresh } from './lib/usePullToRefresh'
import { useDailyLog } from './lib/useDailyLog'
import type { Session } from '@supabase/supabase-js'
import { loadDataset, triggerSync } from './lib/data'
import { relativeTime } from './lib/format'
import { supabase } from './lib/supabase'
import type { Dataset } from './lib/types'
import { Activities, ActivityDetail } from './pages/Activities'
import { Login } from './pages/Login'
import { Plan } from './pages/Plan'
import { usePlan } from './lib/plan/usePlan'
import { Today } from './pages/Today'
import { Trends } from './pages/Trends'

type Tab = 'today' | 'plan' | 'trends' | 'activities'
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
  const ptr = usePullToRefresh(refresh)

  function selectTab(t: Tab) {
    // Erneut auf den aktiven Tab tippen springt nach oben, ein Wechsel startet oben.
    window.scrollTo({ top: 0, behavior: t === tab ? 'smooth' : 'auto' })
    setTab(t)
  }

  // Beim Zurückkehren in die App neu laden (z.B. nach einem Lauf).
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  async function syncNow() {
    setSyncing(true)
    try {
      await triggerSync()
      // Der Sync läuft in GitHub Actions; ein paar Mal nachladen, bis neue Daten da sind.
      for (const wait of [45, 45, 60]) {
        await new Promise((r) => setTimeout(r, wait * 1000))
        void refresh()
      }
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  const opened = openId != null ? data?.activities.find((a) => a.id === openId) : undefined

  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header className="sticky top-0 z-10 bg-bg/90 px-4 pb-2 backdrop-blur" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        <div className="flex items-end justify-between">
          <h1 className="text-[28px] font-bold tracking-tight">{TITLES[tab]}</h1>
          <button onClick={syncNow} disabled={syncing} className="mb-0.5 flex min-h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-[13px] font-medium text-ink-2 disabled:opacity-70">
            <SyncIcon spinning={syncing} />
            {syncing ? 'Synchronisiere …' : 'Sync'}
          </button>
        </div>
        <SyncStatus data={data} />
      </header>

      <main className="px-4 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}>
        <PullIndicator pull={ptr.pull} ready={ptr.ready} busy={ptr.busy} />
        {error && <div className="mb-3 rounded-xl border border-line bg-surface p-3 text-sm" style={{ color: 'var(--critical)' }}>{error}</div>}
        {!data && !error && <SkeletonPage />}
        {data && tab === 'today' && <Today data={data} plan={plan} log={log} onOpenActivity={setOpenId} onOpenPlan={() => selectTab('plan')} />}
        {data && tab === 'plan' && <Plan plan={plan} activities={data.activities} />}
        {data && tab === 'trends' && <Trends data={data} drinks={log.drinks} gym={log.gym} />}
        {data && tab === 'activities' && <Activities activities={data.activities} onOpen={setOpenId} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-xl grid-cols-4">
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
  if (!supabase) return <p className="text-xs text-ink-3">Demo-Modus mit Beispieldaten</p>
  if (!s) return <p className="text-xs text-ink-3">Noch kein Sync gelaufen</p>
  if (s.status === 'error')
    return (
      <p className="text-xs" style={{ color: 'var(--critical)' }}>
        ■ Sync fehlgeschlagen {relativeTime(s.started_at)}
      </p>
    )
  return <p className="text-xs text-ink-3">Garmin synchronisiert {relativeTime(s.finished_at ?? s.started_at)}</p>
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
    <button onClick={onClick} aria-current={active ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-accent' : 'text-ink-3'}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
      {label}
    </button>
  )
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={spinning ? 'animate-spin' : ''}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8m0-5v5h-5" />
    </svg>
  )
}
