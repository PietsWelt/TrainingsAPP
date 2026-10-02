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
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from garminconnect import Garmin

from db import Supabase
from mapping import activity_row, daily_row

log = logging.getLogger("sync")

BACKFILL_DAYS = int(os.getenv("BACKFILL_DAYS", "120"))
RECENT_DAYS = int(os.getenv("RECENT_DAYS", "3"))


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
        log.warning("%s fehlgeschlagen: %s", what, e)
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


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    db = Supabase()
    run = db.insert("sync_runs", {"trigger": os.getenv("SYNC_TRIGGER", "schedule")})
    try:
        client = garmin_client(db)
        today = date.today()
        n_act = sync_activities(client, db, today)
        n_days = sync_days(client, db, days_to_sync(db, today))
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
        traceback.print_exc()
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
