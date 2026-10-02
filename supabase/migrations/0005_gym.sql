-- Krafttraining im Tagesprotokoll: Schwerpunkt und ob es hart war.
alter table daily_log add column if not exists gym_focus text check (gym_focus in ('legs', 'upper', 'full', 'core'));
alter table daily_log add column if not exists gym_hard boolean;
