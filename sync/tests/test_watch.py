import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from watch import PREFIX, fingerprint, garmin_workout, push_workouts  # noqa: E402

INTERVALS = {
    "id": "a",
    "date": "2026-10-06",
    "sport": "run",
    "title": "Intervalle",
    "description": "5 × 1 km @ 4:30/km",
    "duration_min": 55,
    "distance_km": 10.0,
    "status": "planned",
    "steps": [
        {"type": "warmup", "time_s": 720, "note": "Locker einlaufen"},
        {"type": "repeat", "times": 5, "steps": [{"type": "run", "m": 1000, "pace": 270}, {"type": "recover", "time_s": 120}]},
        {"type": "cooldown", "time_s": 600},
    ],
}


def test_structured_run_becomes_repeat_group_with_pace_window():
    w = garmin_workout(INTERVALS)
    assert w["workoutName"] == PREFIX + "Intervalle"
    steps = w["workoutSegments"][0]["workoutSteps"]
    assert [s["stepOrder"] for s in steps] == [1, 2, 5]
    group = steps[1]
    assert group["type"] == "RepeatGroupDTO" and group["numberOfIterations"] == 5
    work, rec = group["workoutSteps"]
    assert (work["stepOrder"], rec["stepOrder"]) == (3, 4)
    assert work["endCondition"]["conditionTypeKey"] == "distance" and work["endConditionValue"] == 1000
    # 4:30/km ± 5 s → langsame Grenze zuerst, in m/s.
    assert work["targetValueOne"] < 1000 / 270 < work["targetValueTwo"]
    assert rec["endCondition"]["conditionTypeKey"] == "time"


def test_easy_run_gets_pace_range():
    w = garmin_workout({**INTERVALS, "steps": [{"type": "run", "m": 8000, "pace": 330, "pace_slow": 370}]})
    (step,) = w["workoutSegments"][0]["workoutSteps"]
    assert step["targetValueOne"] == round(1000 / 370, 4)
    assert step["targetValueTwo"] == round(1000 / 330, 4)


def test_without_targets_and_simple_runs():
    w = garmin_workout(INTERVALS, with_targets=False)
    assert "targetValueOne" not in w["workoutSegments"][0]["workoutSteps"][1]["workoutSteps"][0]
    easy = garmin_workout({**INTERVALS, "title": "Lockerer Lauf", "steps": None, "distance_km": 8.4})
    (only,) = easy["workoutSegments"][0]["workoutSteps"]
    assert only["endConditionValue"] == 8400
    bike = garmin_workout({**INTERVALS, "sport": "bike", "steps": None, "distance_km": None, "duration_min": 90})
    assert bike["sportType"]["sportTypeKey"] == "cycling"
    assert bike["workoutSegments"][0]["workoutSteps"][0]["endConditionValue"] == 5400
    assert garmin_workout({**INTERVALS, "sport": "swim"}) is None


class FakeDb:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []

    def select(self, table, params):
        return self.rows

    def update(self, table, match, values):
        self.updates.append((match["id"], values))


class FakeGarmin:
    def __init__(self, library):
        self.library = library
        self.deleted, self.scheduled, self.next_id = [], [], 100

    def upload_workout(self, w):
        self.next_id += 1
        self.library.append({"workoutId": self.next_id, "workoutName": w["workoutName"]})
        return {"workoutId": self.next_id}

    def schedule_workout(self, wid, d):
        self.scheduled.append((wid, d))

    def delete_workout(self, wid):
        self.deleted.append(wid)

    def get_workouts(self, start, limit):
        return [w for w in self.library if w["workoutId"] not in self.deleted]


def test_push_uploads_new_skips_unchanged_and_cleans_up():
    unchanged = {**INTERVALS, "id": "b", "date": "2026-10-04", "garmin_workout_id": 7}
    unchanged["garmin_hash"] = fingerprint(unchanged)
    skipped = {**INTERVALS, "id": "c", "status": "skipped", "garmin_workout_id": 8}
    far = {**INTERVALS, "id": "d", "date": "2026-11-01"}
    rows = [unchanged, INTERVALS, skipped, far]
    library = [
        {"workoutId": 7, "workoutName": PREFIX + "Intervalle"},
        {"workoutId": 8, "workoutName": PREFIX + "Intervalle"},
        {"workoutId": 9, "workoutName": PREFIX + "Alt"},  # Waise nach Neuplanung
        {"workoutId": 10, "workoutName": "Mein eigenes Workout"},
    ]
    g, db = FakeGarmin(library), FakeDb(rows)
    stats = push_workouts(g, db, date(2026, 10, 3), 7)
    assert stats == {"uploaded": 1, "unchanged": 1, "removed": 2, "failed": 0}
    assert g.scheduled == [(101, "2026-10-06")]
    assert sorted(g.deleted) == [8, 9]
    assert ("a", {"garmin_workout_id": 101, "garmin_hash": fingerprint(INTERVALS)}) in db.updates
    assert ("c", {"garmin_workout_id": None, "garmin_hash": None}) in db.updates
