-- Rennen aus dem Garmin-Kalender. Die App schlägt sie zum Übernehmen vor (Rennen + Plan).
create table if not exists garmin_races (
  id          bigint primary key,   -- Garmin-Kalender-ID
  name        text not null,
  date        date not null,
  distance_m  real,
  sport       text,
  raw         jsonb,
  updated_at  timestamptz not null default now()
);

alter table garmin_races enable row level security;
drop policy if exists "garmin_races read" on garmin_races;
create policy "garmin_races read" on garmin_races for select to authenticated using (true);
