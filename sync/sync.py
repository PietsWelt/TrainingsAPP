"""Holt neue Daten von Garmin Connect und schreibt sie nach Supabase.

Läuft per GitHub Actions (alle 30 Minuten und auf Knopfdruck aus der App).
Erster Lauf: lädt BACKFILL_DAYS Tage Historie. Danach nur die letzten Tage,
weil Garmin Schlaf/HRV teils nachträglich aktualisiert.
"""

from __future__ import annotations

import logging
import os
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from garminconnect import Garmin

from db import Supabase
from fitfile import analyze as analyze_fit, fit_bytes, frames
from mapping import activity_row, daily_row, decoupling, gap_factor, lactate_row, pr_row, prediction_row, race_row
from weather import weather_at
from watch import push_workouts

log = logging.getLogger("sync")

BACKFILL_DAYS = int(os.getenv("BACKFILL_DAYS", "120"))
RECENT_DAYS = int(os.getenv("RECENT_DAYS", "3"))
# Wie viele Tage im Voraus Einheiten auf die Uhr gehen (0 = aus).
WATCH_DAYS = int(os.getenv("WATCH_DAYS", "7"))


def garmin_client(db: Supabase) -> Garmin:
    """Meldet sich mit gespeicherten Tokens an; Passwort nur als Notlösung ohne MFA."""
    token_dir = Path(tempfile.mkdtemp())
    token_file = token_dir / "garmin_tokens.json"
    tokens = db.load_tokens()
    if tokens:
        token_file.write_text(tokens)
        client = Garmin()
    else:
        email, password = os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD")
        if not (email and password):
            raise RuntimeError(
                "Keine Garmin-Tokens gespeichert. Einmalig 'python sync/login.py' ausführen."
            )
        client = Garmin(email, password)
    client.login(str(token_file))
    # Tokens können beim Login erneuert worden sein: zurückschreiben.
    db.save_tokens(client.client.dumps())
    return client


def safe(fn: Callable[[], Any], what: str) -> Any:
    """Ein fehlender Einzelwert (z.B. kein HRV ohne Uhr am Handgelenk) soll den Sync nicht stoppen."""
    try:
        return fn()
    except Exception as e:  # noqa: BLE001
        # Nur den Fehlertyp loggen: Die Actions-Logs sind öffentlich.
        log.warning("%s fehlgeschlagen: %s", what, type(e).__name__)
        return None


def days_to_sync(db: Supabase, today: date) -> list[date]:
    latest = db.select("daily_metrics", {"select": "date", "order": "date.desc", "limit": "1"})
    if latest:
        start = min(date.fromisoformat(latest[0]["date"]), today - timedelta(days=RECENT_DAYS - 1))
    else:
        start = today - timedelta(days=BACKFILL_DAYS - 1)
    return [start + timedelta(days=i) for i in range((today - start).days + 1)]


def sync_days(client: Garmin, db: Supabase, days: list[date]) -> int:
    rows = []
    for d in days:
        ds = d.isoformat()
        rows.append(
            daily_row(
                ds,
                sleep=safe(lambda: client.get_sleep_data(ds), f"Schlaf {ds}"),
                hrv=safe(lambda: client.get_hrv_data(ds), f"HRV {ds}"),
                summary=safe(lambda: client.get_user_summary(ds), f"Tageswerte {ds}"),
                readiness=safe(lambda: client.get_training_readiness(ds), f"Readiness {ds}"),
                max_metrics=safe(lambda: client.get_max_metrics(ds), f"VO2max {ds}"),
            )
        )
        # In Paketen schreiben, damit ein Abbruch beim Backfill nicht alles verliert.
        if len(rows) >= 14:
            db.upsert("daily_metrics", rows, "date")
            rows = []
    db.upsert("daily_metrics", rows, "date")
    return len(days)


def sync_activities(client: Garmin, db: Supabase, today: date) -> int:
    latest = db.select("activities", {"select": "local_date", "order": "local_date.desc", "limit": "1"})
    if latest:
        start = date.fromisoformat(latest[0]["local_date"]) - timedelta(days=2)
    else:
        start = today - timedelta(days=BACKFILL_DAYS - 1)
    activities = client.get_activities_by_date(start.isoformat(), today.isoformat())
    rows = [activity_row(a) for a in activities]
    db.upsert("activities", rows, "id")
    return len(rows)


def sync_records(client: Garmin, db: Supabase) -> int:
    rows = [r for r in (pr_row(x) for x in client.get_personal_record() or []) if r]
    # Nur Typ-IDs ins Log, keine Werte: die Logs des öffentlichen Repos sind für alle sichtbar.
    log.info("Rekord-Typen: %s", sorted(r["type_id"] for r in rows))
    db.upsert("personal_records", rows, "type_id")
    return len(rows)


DRIFT_PER_RUN = int(os.getenv("DRIFT_PER_RUN", "15"))


SPLITS_V = 2  # 1 = nur Puls-Drift, 2 = zusätzlich Steigung


def sync_drift(client: Garmin, db: Supabase) -> int:
    """Puls-Drift (ab 30 min) und Steigungsbereinigung aus den Runden, neueste Läufe zuerst, gedrosselt."""
    runs = db.select(
        "activities",
        {
            "select": "id",
            "splits_v": f"lt.{SPLITS_V}",
            "sport": "like.*running*",
            "duration_s": "gte.600",
            "order": "start_time.desc",
            "limit": str(DRIFT_PER_RUN),
        },
    )
    for r in runs:
        splits = safe(lambda: client.get_activity_splits(r["id"]), "Runden")
        if splits is None:
            continue  # beim nächsten Sync erneut versuchen
        laps = splits.get("lapDTOs") or []
        db.update(
            "activities",
            {"id": r["id"]},
            {"decoupling_pct": decoupling(laps), "gap_factor": gap_factor(laps), "splits_checked": True, "splits_v": SPLITS_V},
        )
    return len(runs)


FIT_PER_RUN = int(os.getenv("FIT_PER_RUN", "6"))
FIT_V = 2  # 1 = aerobe Schwelle, 2 = zusätzlich Laktatschwelle (alpha1 = 0,5)
FIT_DAYS = 120


def sync_fit(client: Garmin, db: Supabase, today: date) -> int:
    """Original-Datei neuer Läufe: Brustgurt oder Handgelenk, Puls-Verteilung, DFA-alpha1, aerobe und Laktatschwelle."""
    runs = db.select(
        "activities",
        {
            "select": "id",
            "fit_v": f"lt.{FIT_V}",
            "sport": "like.*running*",
            "duration_s": "gte.600",
            "local_date": f"gte.{(today - timedelta(days=FIT_DAYS)).isoformat()}",
            "order": "start_time.desc",
            "limit": str(FIT_PER_RUN),
        },
    )
    done = 0
    for r in runs:
        blob = safe(lambda: client.download_activity(r["id"], dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL), "Original-Datei")
        if not blob:
            continue  # beim nächsten Sync erneut versuchen
        row = safe(lambda: analyze_fit(frames(fit_bytes(blob))), "FIT-Auswertung")
        # Kaputte Datei: als erledigt markieren, damit sie nicht jedes Mal neu geladen wird.
        db.update("activities", {"id": r["id"]}, {**(row or {}), "fit_v": FIT_V})
        done += 1
    return done


WEATHER_PER_RUN = int(os.getenv("WEATHER_PER_RUN", "25"))


def sync_weather(db: Supabase, today: date) -> int:
    """Temperatur und Taupunkt am Startort für Läufe und Radfahrten, die noch keins haben."""
    acts = db.select(
        "activities",
        {
            "select": "id,start_time,duration_s,lat:raw->startLatitude,lon:raw->startLongitude",
            "weather_checked": "is.false",
            "or": "(sport.like.*running*,sport.like.*cycling*,sport.like.*biking*)",
            "order": "start_time.desc",
            "limit": str(WEATHER_PER_RUN),
        },
    )
    done = 0
    for a in acts:
        try:
            temp, dew = weather_at(a.get("lat"), a.get("lon"), a["start_time"], a.get("duration_s"), today)
        except Exception as e:  # noqa: BLE001
            # Nur den Fehlertyp loggen; beim nächsten Sync erneut versuchen.
            log.warning("Wetter fehlgeschlagen: %s", type(e).__name__)
            break
        db.update("activities", {"id": a["id"]}, {"temp_c": temp, "dew_point_c": dew, "weather_checked": True})
        done += 1
    return done


def sync_prediction(client: Garmin, db: Supabase, today: date) -> bool:
    row = prediction_row(today.isoformat(), client.get_race_predictions())
    if row:
        db.upsert("race_predictions", row, "date")
    return row is not None


def sync_lactate(client: Garmin, db: Supabase) -> bool:
    """Garmins Laktatschwelle (Puls und Tempo) mit dem Tag, an dem Garmin sie zuletzt bestimmt hat."""
    row = lactate_row(client.get_lactate_threshold(latest=True))
    if row:
        db.upsert("garmin_lactate", row, "date")
    return row is not None


RACE_MONTHS = 12


def sync_races(client: Garmin, db: Supabase, today: date) -> int:
    """Rennen aus dem Garmin-Kalender der nächsten 12 Monate."""
    rows: list[dict[str, Any]] = []
    types: set[str] = set()
    for i in range(RACE_MONTHS + 1):
        y, m = divmod(today.month - 1 + i, 12)
        cal = client.get_scheduled_workouts(today.year + y, m + 1) or {}
        for item in cal.get("calendarItems") or []:
            types.add(str(item.get("itemType")))
            row = race_row(item)
            if row and row["date"] >= today.isoformat():
                rows.append(row)
    # Nur Eintragstypen ins Log, keine Namen oder Daten: die Logs sind öffentlich.
    log.info("Kalender-Typen: %s, Rennen: %d", sorted(types), len(rows))
    db.upsert("garmin_races", rows, "id")
    return len(rows)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    db = Supabase()
    run = db.insert("sync_runs", {"trigger": os.getenv("SYNC_TRIGGER", "schedule")})
    try:
        client = garmin_client(db)
        today = date.today()
        n_act = sync_activities(client, db, today)
        n_days = sync_days(client, db, days_to_sync(db, today))
        safe(lambda: sync_records(client, db), "Bestzeiten")
        safe(lambda: sync_prediction(client, db, today), "Rennzeit-Prognose")
        safe(lambda: sync_lactate(client, db), "Laktatschwelle")
        # Kalender alle 2 Stunden prüfen, das spart Anfragen bei Garmin.
        now = datetime.now(timezone.utc)
        if now.hour % 2 == 0 and now.minute < 30 or os.getenv("RACES_ALWAYS"):
            safe(lambda: sync_races(client, db, today), "Rennen aus dem Kalender")
        drift = safe(lambda: sync_drift(client, db), "Runden-Auswertung")
        if drift:
            log.info("Runden: %d Läufe ausgewertet", drift)
        fit = safe(lambda: sync_fit(client, db, today), "Original-Dateien")
        if fit:
            log.info("Original-Dateien: %d Läufe ausgewertet", fit)
        weather = safe(lambda: sync_weather(db, today), "Wetter")
        if weather:
            log.info("Wetter: %d Aktivitäten ergänzt", weather)
        watch = safe(lambda: push_workouts(client, db, today, WATCH_DAYS), "Workouts auf die Uhr")
        if watch:
            log.info("Uhr: %s", watch)
        db.update(
            "sync_runs",
            {"id": run["id"]},
            {
                "status": "ok",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "activities_upserted": n_act,
                "days_upserted": n_days,
            },
        )
        log.info("Fertig: %d Aktivitäten, %d Tage", n_act, n_days)
        return 0
    except Exception as e:  # noqa: BLE001
        log.error("Sync fehlgeschlagen: %s (Details in sync_runs)", type(e).__name__)
        db.update(
            "sync_runs",
            {"id": run["id"]},
            {
                "status": "error",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "message": f"{type(e).__name__}: {e}"[:500],
            },
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
