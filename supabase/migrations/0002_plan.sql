-- Etappe 2: Rennen (Ziele) und Trainingsplan
-- Im Supabase SQL Editor einmal ausführen.

create table if not exists events (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  date           date not null,
  type           text not null,          -- 5k | 10k | half | marathon | tri_sprint | tri_olympic | tri_70_3 | tri_ironman
  goal_time_s    integer,                -- Zielzeit in Sekunden (optional)
  days_per_week  integer not null default 4 check (days_per_week between 3 and 7),
  long_day       integer not null default 6 check (long_day between 0 and 6),  -- 0 = Montag … 6 = Sonntag
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists plan_workouts (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  date           date not null,
  sport          text not null,          -- run | bike | swim | race | rest
  kind           text not null,          -- easy | long | tempo | intervals | race_pace | strides | recovery | brick | race
  title          text not null,
  description    text,
  duration_min   integer,
  distance_km    double precision,
  key_session    boolean not null default false,
  phase          text,                   -- base | build | peak | taper | race
  week_index     integer not null,
  status         text not null default 'planned',  -- planned | done | skipped
  activity_id    bigint references activities(id) on delete set null,
  moved_from     date,                   -- ursprüngliches Datum, falls verschoben
  updated_at     timestamptz not null default now()
);
create index if not exists plan_workouts_event_date_idx on plan_workouts (event_id, date);

alter table events        enable row level security;
alter table plan_workouts enable row level security;

-- Einziger Nutzer (Registrierung ist deaktiviert) darf hier lesen und schreiben.
create policy "owner manages events"        on events        for all to authenticated using (true) with check (true);
create policy "owner manages plan_workouts" on plan_workouts for all to authenticated using (true) with check (true);
