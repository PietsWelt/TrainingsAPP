-- Zuverlässiger 30-Minuten-Sync: Supabase startet den GitHub-Sync selbst (pg_cron + pg_net),
-- weil GitHubs eigener Zeitplan bei neuen Repos oft gar nicht oder stark verspätet läuft.
--
-- Vor dem Ausführen die zwei Platzhalter ersetzen:
--   DEINE_PROJEKT_URL  Settings → Data API → Project URL, z.B. https://abcd.supabase.co
--   DEIN_ANON_KEY      Settings → API Keys → Legacy API Keys → anon (beginnt mit eyJ)
-- Der anon-Key ist öffentlich (er steckt auch in der App), er kommt trotzdem in den Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('DEINE_PROJEKT_URL', 'sync_project_url')
where not exists (select 1 from vault.secrets where name = 'sync_project_url');
select vault.create_secret('DEIN_ANON_KEY', 'sync_anon_key')
where not exists (select 1 from vault.secrets where name = 'sync_anon_key');

-- Alle 30 Minuten von 6 bis 23:30 Uhr deutscher Sommerzeit (Zeiten in UTC).
select cron.unschedule('garmin-sync') where exists (select 1 from cron.job where jobname = 'garmin-sync');
select cron.schedule(
  'garmin-sync',
  '*/30 4-21 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_project_url') || '/functions/v1/trigger-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_anon_key')
    ),
    body := '{"trigger": "schedule"}'::jsonb
  );
  $$
);
