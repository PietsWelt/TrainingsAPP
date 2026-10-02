-- Garmin Coach: Grundschema (Etappe 1: Sync + Dashboard)
--
-- Zugriff: Die App hat genau einen Nutzer. Registrierungen werden in Supabase
-- deaktiviert (Authentication -> Sign In / Providers -> "Allow new users to sign up" aus),
-- daher darf jeder eingeloggte Nutzer alles lesen. Schreiben tut nur der Sync-Job
-- mit dem Service-Role-Key, der RLS umgeht.

create table if not exists activities (
  id               bigint primary key,           -- Garmin activityId
  start_time       timestamptz not null,
  local_date       date not null,
  sport            text not null,                -- z.B. running, cycling, lap_swimming
  name             text,
  distance_m       double precision,
  duration_s       double precision,
  moving_s         double precision,
  avg_hr           integer,
  max_hr           integer,
  avg_speed_mps    double precision,
  elevation_gain_m double precision,
  avg_power_w      double precision,
  training_load    double precision,
  aerobic_te       double precision,
  anaerobic_te     double precision,
  calories         double precision,
  vo2max           double precision,
  hr_zones_s       double precision[],           -- Sekunden in HF-Zone 1..5
  raw              jsonb not null,
  synced_at        timestamptz not null default now()
);
create index if not exists activities_local_date_idx on activities (local_date desc);

create table if not exists daily_metrics (
  date                 date primary key,
  sleep_s              integer,
  deep_sleep_s         integer,
  light_sleep_s        integer,
  rem_sleep_s          integer,
  awake_s              integer,
  sleep_score          integer,
  hrv_last_night       integer,
  hrv_weekly_avg       integer,
  hrv_status           text,
  hrv_baseline_low     integer,
  hrv_baseline_high    integer,
  resting_hr           integer,
  steps                integer,
  body_battery_high    integer,
  body_battery_low     integer,
  stress_avg           integer,
  training_readiness   integer,                  -- Garmins eigener Wert (Vergleich)
  vo2max_running       double precision,
  raw                  jsonb not null default '{}'::jsonb,
  synced_at            timestamptz not null default now()
);

create table if not exists sync_runs (
  id                 bigserial primary key,
  trigger            text not null default 'schedule',   -- schedule | manual
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  status             text not null default 'running',    -- running | ok | error
  message            text,
  activities_upserted integer default 0,
  days_upserted       integer default 0
);
create index if not exists sync_runs_started_idx on sync_runs (started_at desc);

-- Garmin-Tokens. Keine Policy => nur der Service-Role-Key kommt ran.
create table if not exists garmin_auth (
  id          integer primary key default 1 check (id = 1),
  tokens      text not null,
  updated_at  timestamptz not null default now()
);

alter table activities    enable row level security;
alter table daily_metrics enable row level security;
alter table sync_runs     enable row level security;
alter table garmin_auth   enable row level security;

create policy "owner reads activities"    on activities    for select to authenticated using (true);
create policy "owner reads daily_metrics" on daily_metrics for select to authenticated using (true);
create policy "owner reads sync_runs"     on sync_runs     for select to authenticated using (true);
