"""Überträgt die geplanten Einheiten der nächsten Tage als Workouts nach Garmin Connect.

Die Uhr holt sie sich beim nächsten Sync mit dem Handy und zeigt sie unter „Training“ bzw.
im Kalender an. Jede angelegte Einheit trägt den Präfix PREFIX im Namen; nur solche Workouts
werden je wieder gelöscht, eigene Workouts in Garmin Connect bleiben unberührt.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import date, timedelta
from typing import Any

from db import Supabase

log = logging.getLogger("sync.watch")

PREFIX = "Plan · "
SPORTS = {
    "run": {"sportTypeId": 1, "sportTypeKey": "running"},
    "bike": {"sportTypeId": 2, "sportTypeKey": "cycling"},
}
STEP_TYPES = {
    "warmup": {"stepTypeId": 1, "stepTypeKey": "warmup"},
    "cooldown": {"stepTypeId": 2, "stepTypeKey": "cooldown"},
    "run": {"stepTypeId": 3, "stepTypeKey": "interval"},
    "recover": {"stepTypeId": 4, "stepTypeKey": "recovery"},
    "repeat": {"stepTypeId": 6, "stepTypeKey": "repeat"},
}
LAP = {"conditionTypeId": 1, "conditionTypeKey": "lap.button"}
TIME = {"conditionTypeId": 2, "conditionTypeKey": "time"}
DISTANCE = {"conditionTypeId": 3, "conditionTypeKey": "distance"}
ITERATIONS = {"conditionTypeId": 7, "conditionTypeKey": "iterations"}
NO_TARGET = {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"}
PACE = {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone"}
PACE_WINDOW_S = 5  # ± Sekunden pro km um das Zieltempo

COLS = "id,date,sport,title,description,duration_min,distance_km,steps,status,garmin_workout_id,garmin_hash"


def fingerprint(row: dict[str, Any]) -> str:
    keys = ("date", "sport", "title", "description", "duration_min", "distance_km", "steps")
    raw = json.dumps({k: row.get(k) for k in keys}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(raw.encode()).hexdigest()


def _short(text: str | None, n: int) -> str | None:
    if not text:
        return None
    return text if len(text) <= n else text[: n - 1] + "…"


class _Builder:
    def __init__(self, with_targets: bool) -> None:
        self.order = 0
        self.with_targets = with_targets

    def step(self, s: dict[str, Any]) -> dict[str, Any]:
        self.order += 1
        if s.get("m"):
            end, value = DISTANCE, float(s["m"])
        elif s.get("time_s"):
            end, value = TIME, float(s["time_s"])
        else:
            end, value = LAP, None
        out: dict[str, Any] = {
            "type": "ExecutableStepDTO",
            "stepOrder": self.order,
            "stepType": STEP_TYPES[s["type"]],
            "endCondition": end,
            "endConditionValue": value,
            "targetType": NO_TARGET,
            "description": _short(s.get("note"), 100),
        }
        if end is DISTANCE:
            out["preferredEndConditionUnit"] = {"unitKey": "kilometer" if value >= 1000 else "meter"}
        pace = s.get("pace")
        if pace and self.with_targets:
            # Garmin erwartet Geschwindigkeiten in m/s: langsame Grenze zuerst.
            out["targetType"] = PACE
            out["targetValueOne"] = round(1000 / (pace + PACE_WINDOW_S), 4)
            out["targetValueTwo"] = round(1000 / max(60, pace - PACE_WINDOW_S), 4)
        return out

    def any(self, s: dict[str, Any]) -> dict[str, Any]:
        if s["type"] != "repeat":
            return self.step(s)
        self.order += 1
        group: dict[str, Any] = {
            "type": "RepeatGroupDTO",
            "stepOrder": self.order,
            "stepType": STEP_TYPES["repeat"],
            "numberOfIterations": int(s["times"]),
            "endCondition": ITERATIONS,
            "endConditionValue": float(s["times"]),
            "smartRepeat": False,
        }
        group["workoutSteps"] = [self.step(c) for c in s["steps"]]
        return group


def _drop_none(x: Any) -> Any:
    if isinstance(x, dict):
        return {k: _drop_none(v) for k, v in x.items() if v is not None}
    if isinstance(x, list):
        return [_drop_none(v) for v in x]
    return x


def garmin_workout(row: dict[str, Any], with_targets: bool = True) -> dict[str, Any] | None:
    """Baut das Garmin-Workout-JSON für eine Einheit. None für Sportarten ohne Uhr-Export."""
    sport = SPORTS.get(row["sport"])
    if not sport:
        return None
    steps = row.get("steps") or []
    if not steps:
        # Einfache Einheit: ein Schritt über Strecke oder Zeit, Beschreibung als Notiz.
        single: dict[str, Any] = {"type": "run", "note": row.get("description")}
        if row.get("distance_km") and row["sport"] == "run":
            single["m"] = round(float(row["distance_km"]) * 1000)
        elif row.get("duration_min"):
            single["time_s"] = int(row["duration_min"]) * 60
        steps = [single]
    b = _Builder(with_targets)
    workout: dict[str, Any] = {
        "workoutName": _short(PREFIX + row["title"], 80),
        "description": _short(row.get("description"), 500),
        "sportType": sport,
        "workoutSegments": [{"segmentOrder": 1, "sportType": sport, "workoutSteps": [b.any(s) for s in steps]}],
    }
    if row.get("duration_min"):
        workout["estimatedDurationInSecs"] = int(row["duration_min"]) * 60
    # Wie die Typ-Modelle von garminconnect: leere Felder gar nicht erst mitschicken.
    return _drop_none(workout)


def _delete(client: Any, workout_id: int) -> None:
    try:
        client.delete_workout(workout_id)
    except Exception as e:  # noqa: BLE001
        # Schon gelöscht (z.B. von Hand in Garmin Connect) ist kein Fehler.
        log.info("Workout %s nicht gelöscht: %s", workout_id, e)


def _upload(client: Any, row: dict[str, Any]) -> int:
    try:
        res = client.upload_workout(garmin_workout(row))
    except Exception as e:  # noqa: BLE001
        log.warning("Upload mit Zieltempo abgelehnt (%s), versuche ohne.", e)
        res = client.upload_workout(garmin_workout(row, with_targets=False))
    workout_id = int(res["workoutId"])
    client.schedule_workout(workout_id, row["date"])
    return workout_id


def push_workouts(client: Any, db: Supabase, today: date, days: int) -> dict[str, int]:
    """Gleicht die nächsten `days` Tage ab. Liefert Zähler für das Log."""
    stats = {"uploaded": 0, "unchanged": 0, "removed": 0, "failed": 0}
    if days <= 0:
        return stats
    until = today + timedelta(days=days)
    keep_from = today - timedelta(days=2)
    rows = db.select(
        "plan_workouts",
        {"select": COLS, "or": f"(date.gte.{today.isoformat()},garmin_workout_id.not.is.null)", "order": "date"},
    )
    known: set[int] = set()
    for row in rows:
        d = date.fromisoformat(row["date"])
        old = row.get("garmin_workout_id")
        want = row["status"] == "planned" and row["sport"] in SPORTS and today <= d < until
        if want:
            h = fingerprint(row)
            if old and row.get("garmin_hash") == h:
                known.add(old)
                stats["unchanged"] += 1
                continue
            try:
                if old:
                    _delete(client, old)
                new = _upload(client, row)
            except Exception as e:  # noqa: BLE001
                stats["failed"] += 1
                log.warning("Einheit %s (%s) nicht übertragen: %s", row["title"], row["date"], e)
                if stats["failed"] >= 3 and not stats["uploaded"]:
                    # Ohne vollständigen Abgleich nichts als Waise löschen.
                    log.warning("Übertragung auf die Uhr abgebrochen.")
                    return stats
                continue
            known.add(new)
            db.update("plan_workouts", {"id": row["id"]}, {"garmin_workout_id": new, "garmin_hash": h})
            stats["uploaded"] += 1
        elif old and (d >= today or d < keep_from):
            # Übersprungen, verschoben über das Fenster hinaus oder schon länger vorbei: aufräumen.
            # Erledigte Einheiten der letzten Tage bleiben, falls die Uhr sie noch braucht.
            if row["status"] == "done" and d >= keep_from:
                known.add(old)
                continue
            _delete(client, old)
            db.update("plan_workouts", {"id": row["id"]}, {"garmin_workout_id": None, "garmin_hash": None})
            stats["removed"] += 1
        elif old:
            known.add(old)

    # Waisen: von uns angelegte Workouts, deren Einheit es nicht mehr gibt (z.B. nach Neuplanung).
    for w in client.get_workouts(0, 200) or []:
        wid = w.get("workoutId")
        if str(w.get("workoutName", "")).startswith(PREFIX) and wid and int(wid) not in known:
            _delete(client, int(wid))
            stats["removed"] += 1
    return stats
