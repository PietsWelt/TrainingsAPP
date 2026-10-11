"""Einmaliger Test: Legt ein Workout mit Puls-Bereich in Garmin Connect an und plant es für morgen.

So lässt sich prüfen, ob die Uhr das Puls-Ziel richtig anzeigt, bevor alle lockeren Läufe damit kommen.
Ausführen wie login.py (z.B. im GitHub Codespace), danach auf der Uhr unter „Training“ nachsehen:
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python sync/hr_test.py 128 148
Aufräumen (löscht das Test-Workout wieder):
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python sync/hr_test.py --delete <workoutId>
"""

from __future__ import annotations

import json
import sys
from datetime import date, timedelta

from db import Supabase
from sync import garmin_client
from watch import garmin_workout

# Eigener Präfix: Der Sync räumt nur Workouts mit „Plan · “ auf, dieses bleibt bis zum Löschen.
NAME = "Test Puls-Ziel"


def main() -> None:
    client = garmin_client(Supabase())
    if len(sys.argv) == 3 and sys.argv[1] == "--delete":
        client.delete_workout(int(sys.argv[2]))
        print("Test-Workout gelöscht.")
        return
    low, high = (int(x) for x in sys.argv[1:3]) if len(sys.argv) == 3 else (128, 148)
    row = {
        "sport": "run",
        "title": NAME,
        "description": f"Test: lockerer Lauf mit Puls {low}–{high}.",
        "duration_min": 30,
        "steps": [{"type": "run", "time_s": 1800, "note": "Locker", "pace": 330, "pace_slow": 370, "hr_low": low, "hr_high": high}],
    }
    w = garmin_workout(row, use_hr=True)
    w["workoutName"] = NAME
    res = client.upload_workout(w)
    wid = int(res["workoutId"])
    client.schedule_workout(wid, (date.today() + timedelta(days=1)).isoformat())
    stored = client.get_workout_by_id(wid)
    step = stored["workoutSegments"][0]["workoutSteps"][0]
    print(f"Angelegt: {wid}, geplant für morgen.")
    print("Von Garmin gespeichertes Ziel:")
    print(json.dumps({k: step.get(k) for k in ("targetType", "targetValueOne", "targetValueTwo", "zoneNumber")}, indent=2))
    print(f"Auf der Uhr nach dem nächsten Sync ansehen. Löschen: python sync/hr_test.py --delete {wid}")


if __name__ == "__main__":
    main()
