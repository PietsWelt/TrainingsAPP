-- Nur Geändertes nachladen: synced_at zeigt künftig die letzte Aktualisierung, nicht nur das erste Anlegen.
-- Die App lädt dann nach einem Sync nur noch die Zeilen mit neuerem synced_at.

create or replace function public.touch_synced_at() returns trigger language plpgsql as $$
begin new.synced_at := now(); return new; end $$;

drop trigger if exists activities_touch on activities;
create trigger activities_touch before update on activities for each row execute function public.touch_synced_at();
drop trigger if exists daily_metrics_touch on daily_metrics;
create trigger daily_metrics_touch before update on daily_metrics for each row execute function public.touch_synced_at();

create index if not exists activities_synced_idx on activities (synced_at);
create index if not exists daily_metrics_synced_idx on daily_metrics (synced_at);

-- Woran die App erkennt, dass diese Datei gelaufen ist. Ohne sie lädt die App wie bisher alles.
create or replace function public.synced_at_ready() returns boolean language sql stable as $$ select true $$;
grant execute on function public.synced_at_ready() to authenticated;
