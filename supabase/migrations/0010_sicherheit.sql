-- Sicherheit: Nur noch der Besitzer (der erste angelegte Nutzer) darf Daten lesen und ändern,
-- und den Sync darf nur der Besitzer oder der Zeitplan starten.
-- Einfach komplett im SQL-Editor ausführen, es gibt keine Platzhalter.
-- Am Ende wird angezeigt, welches Konto als Besitzer gilt: Das muss deine E-Mail sein.

-- 1) Besitzer = ältester Nutzer im Projekt.
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and auth.uid() = (select id from auth.users order by created_at limit 1)
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated, service_role;

-- 2) Alle bisherigen Regeln ersetzen. Lesen: Garmin-Daten. Lesen und schreiben: Plan und Einträge.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['activities','daily_metrics','sync_runs','personal_records','race_predictions','garmin_races',
                           'events','plan_workouts','daily_log'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    if t in ('events','plan_workouts','daily_log') then
      execute format('create policy "owner manages %s" on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t, t);
    else
      execute format('create policy "owner reads %s" on public.%I for select to authenticated using (public.is_owner())', t, t);
    end if;
  end loop;
end $$;

-- 3) Garmin-Tokens sind nur für den Sync (Service-Key) da.
revoke all on table public.garmin_auth from anon, authenticated;

-- 4) Geheimnis für den Zeitplan, damit nicht jeder mit dem öffentlichen anon-Key den Sync starten kann.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'sync_cron_secret')
where not exists (select 1 from vault.secrets where name = 'sync_cron_secret');

create or replace function public.check_cron_secret(s text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'sync_cron_secret' and decrypted_secret = s)
$$;
revoke all on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

select cron.unschedule('garmin-sync') where exists (select 1 from cron.job where jobname = 'garmin-sync');
select cron.schedule(
  'garmin-sync',
  '*/30 4-21 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_project_url') || '/functions/v1/trigger-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret')
    ),
    body := '{"trigger": "schedule"}'::jsonb
  );
  $$
);

-- Kontrolle: Hier muss genau deine E-Mail stehen.
select email as besitzer from auth.users order by created_at limit 1;
