-- Etappe 4: Rückmeldung nach der Einheit und Workouts auf die Uhr.

-- Eigene Einschätzung: zu leicht, passend, zu hart.
alter table plan_workouts add column if not exists feedback text check (feedback in ('easy', 'ok', 'hard'));

-- Aufbau der Einheit für die Uhr (Einlaufen, Intervalle mit Zieltempo, Auslaufen).
alter table plan_workouts add column if not exists steps jsonb;

-- Vom Sync gesetzt: ID des Workouts in Garmin Connect und ein Fingerabdruck,
-- damit nur geänderte Einheiten neu übertragen werden.
alter table plan_workouts add column if not exists garmin_workout_id bigint;
alter table plan_workouts add column if not exists garmin_hash text;
