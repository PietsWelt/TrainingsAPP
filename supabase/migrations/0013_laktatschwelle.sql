-- Laktatschwelle: Garmins Wert (Puls und Tempo) und eine eigene Schätzung aus DFA-alpha1 (= 0,5) je Lauf mit Brustgurt.
-- Einfach komplett im SQL-Editor ausführen. Der Sync wertet danach die Läufe der letzten 120 Tage
-- nach und nach neu aus (6 pro Durchlauf).

create table if not exists garmin_lactate (
  date        date primary key,     -- Tag, an dem Garmin die Schwelle zuletzt bestimmt hat
  hr          integer not null,     -- Puls an der Laktatschwelle, bpm
  speed_mps   real,                 -- Tempo an der Laktatschwelle, m/s
  updated_at  timestamptz not null default now()
);

alter table garmin_lactate enable row level security;
drop policy if exists "owner reads garmin_lactate" on garmin_lactate;
create policy "owner reads garmin_lactate" on garmin_lactate for select to authenticated using (public.is_owner());

alter table activities add column if not exists lt_hr real;          -- geschätzte Laktatschwelle aus alpha1 = 0,5, bpm
alter table activities add column if not exists lt_speed_mps real;   -- Tempo dort, m/s
