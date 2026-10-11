-- App-Zustände, die auf allen Geräten gleich sein sollen: Erledigt-Haken, gesehene Hinweise, Stufen.
-- Einmal im Supabase SQL Editor ausführen. Ohne diese Tabelle merkt sich nur der Browser diese Zustände.

create table if not exists app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;
drop policy if exists "owner manages app_state" on app_state;
create policy "owner manages app_state" on app_state for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
