-- Brustgurt: Pulsquelle, Puls-Verteilung und aerobe Schwelle aus der Original-Datei (FIT) jedes Laufs.
-- Einfach komplett im SQL-Editor ausführen. Der Sync ergänzt die letzten 120 Tage nach und nach (6 Läufe pro Durchlauf).
alter table activities add column if not exists hr_source text;               -- 'strap' = Brustgurt, 'wrist' = Handgelenk
alter table activities add column if not exists hr_hist jsonb;                -- Sekunden je 5er-Pulsbereich, z.B. {"140": 300}
alter table activities add column if not exists dfa_a1 real;                  -- Ø DFA-alpha1 (nur mit Gurt und "HRV aufzeichnen")
alter table activities add column if not exists aet_hr real;                  -- geschätzte aerobe Schwelle, bpm
alter table activities add column if not exists aet_speed_mps real;           -- Tempo an der Schwelle, m/s
alter table activities add column if not exists rr_artifact_pct real;         -- Anteil korrigierter Herzschläge in %
alter table activities add column if not exists fit_v smallint not null default 0;  -- Version der FIT-Auswertung
