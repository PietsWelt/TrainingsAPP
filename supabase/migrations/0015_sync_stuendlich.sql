-- Automatischer Sync: einmal pro Stunde statt alle 30 Minuten, mit dem Geheimnis aus 0010.
-- Einfach komplett im SQL-Editor ausführen, es gibt keine Platzhalter.
-- Danach den Wert von sync_cron_secret als Function-Secret CRON_SECRET speichern und trigger-sync
-- neu deployen (README, Schritt 4.5). Sonst weist die Function den Zeitplan ab (403 "Nicht erlaubt").

-- Geheimnis anlegen, falls 0010 das nicht geschafft hat.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'sync_cron_secret')
where not exists (select 1 from vault.secrets where name = 'sync_cron_secret');

-- Jede volle Stunde von 6 bis 23 Uhr deutscher Sommerzeit (Zeiten in UTC).
select cron.unschedule('garmin-sync') where exists (select 1 from cron.job where jobname = 'garmin-sync');
select cron.schedule(
  'garmin-sync',
  '0 4-21 * * *',
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

-- Kontrolle: Hier muss "0 4-21 * * *" stehen.
select jobname, schedule, active from cron.job where jobname = 'garmin-sync';
