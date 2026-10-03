-- Gym-Verlauf: jeder abgehakte Satz mit Gewicht und Wiederholungen.
-- Einfach komplett im SQL-Editor ausführen.

create table if not exists gym_sets (
  date         date not null,
  session      text not null check (session in ('legs', 'upperA', 'upperB')),
  exercise_id  text not null,      -- z.B. 'split', 'dbBench' (siehe web/src/lib/strength.ts)
  set_no       smallint not null,  -- 1, 2, 3 …
  kg           real,               -- Gewicht bzw. Zusatzgewicht, leer = ohne
  reps         smallint,
  created_at   timestamptz not null default now(),
  primary key (date, session, exercise_id, set_no)
);

alter table gym_sets enable row level security;
drop policy if exists "owner manages gym_sets" on gym_sets;
create policy "owner manages gym_sets" on gym_sets for all to authenticated using (public.is_owner()) with check (public.is_owner());
