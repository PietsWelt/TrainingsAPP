-- Bestzeiten aus Garmin Connect (eine Zeile pro Rekord-Typ, z.B. 5 km, 10 km, längster Lauf).
create table if not exists personal_records (
  type_id      integer primary key,
  value        double precision,          -- Sekunden bei Zeiten, Meter bei Strecken
  activity_id  bigint,
  date         date,
  raw          jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table personal_records enable row level security;
drop policy if exists "personal_records read" on personal_records;
create policy "personal_records read" on personal_records for select to authenticated using (true);
