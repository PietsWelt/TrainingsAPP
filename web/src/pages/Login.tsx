import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Anmeldung fehlgeschlagen. E-Mail und Passwort prüfen.')
    setBusy(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl border border-line bg-surface p-6">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-12 w-12 rounded-xl" />
        <h1 className="text-xl font-semibold">Training</h1>
        <input className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 outline-none focus:border-accent" type="email" autoComplete="username" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 outline-none focus:border-accent" type="password" autoComplete="current-password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm" style={{ color: 'var(--critical)' }}>{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-accent py-2.5 font-medium text-white disabled:opacity-60">
          {busy ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
