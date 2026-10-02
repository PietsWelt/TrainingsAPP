import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Auch die REST-URL aus dem Dashboard (…/rest/v1/) zulassen.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

/** null = Demo-Modus (keine Supabase-Zugangsdaten konfiguriert). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
