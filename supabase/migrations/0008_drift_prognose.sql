-- Puls-Drift pro Lauf (aus den Kilometer-Runden) und Garmins Rennzeit-Prognose pro Tag.
alter table activities add column if not exists decoupling_pct real;      -- Effizienzverlust 2. Hälfte ggü. 1. Hälfte in %
alter table activities add column if not exists splits_checked boolean not null default false;

create table if not exists race_predictions (
  date           date primary key,
  time_5k        integer,   -- Sekunden
  time_10k       integer,
  time_half      integer,
  time_marathon  integer,
  updated_at     timestamptz not null default now()
);

alter table race_predictions enable row level security;
drop policy if exists "race_predictions read" on race_predictions;
create policy "race_predictions read" on race_predictions for select to authenticated using (true);
