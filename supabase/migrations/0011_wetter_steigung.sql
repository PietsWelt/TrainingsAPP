-- Wetter beim Lauf (für die Hitze-Anpassung) und steigungsbereinigte Pace.
-- Einfach komplett im SQL-Editor ausführen. Ältere Läufe werden beim Sync nach und nach ergänzt.
alter table activities add column if not exists temp_c real;                 -- Lufttemperatur in der Mitte des Laufs, °C
alter table activities add column if not exists dew_point_c real;            -- Taupunkt, °C
alter table activities add column if not exists weather_checked boolean not null default false;
alter table activities add column if not exists gap_factor real;             -- Flach-Äquivalent: Strecke × Faktor, >1 = hügelig bergauf
alter table activities add column if not exists splits_v smallint not null default 0;  -- Version der Runden-Auswertung
-- Bisher ausgewertete Läufe zählen als Version 1, damit der Sync die Steigung nachträgt.
update activities set splits_v = 1 where splits_checked and splits_v = 0;
