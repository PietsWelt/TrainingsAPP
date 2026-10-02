-- Etappe 3: Tagesprotokoll (Alkohol) und Anpassungen des Plans nach Readiness.

create table if not exists daily_log (
  date        date primary key,             -- der Abend, an dem getrunken wurde
  drinks      smallint check (drinks between 0 and 20),
  note        text,
  updated_at  timestamptz not null default now()
);

alter table daily_log enable row level security;
drop policy if exists "daily_log owner" on daily_log;
create policy "daily_log owner" on daily_log for all to authenticated using (true) with check (true);

-- Ursprüngliche Einheit, falls sie wegen niedriger Readiness angepasst wurde (zum Rückgängigmachen).
alter table plan_workouts add column if not exists original jsonb;
