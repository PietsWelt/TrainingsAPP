-- Mehrere Rennen gleichzeitig: Welches ist das Hauptrennen (A-Rennen)?
-- Einmal im Supabase SQL Editor ausführen. Ohne diese Spalte merkt sich nur der Browser die Wahl.

alter table events add column if not exists priority boolean not null default false;

-- Höchstens ein Hauptrennen.
create unique index if not exists events_one_priority on events (priority) where priority;
