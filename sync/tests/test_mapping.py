import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mapping import activity_row, daily_row, lactate_row  # noqa: E402


def test_activity_row_maps_core_fields():
    raw = {
        "activityId": 123,
        "activityName": "Morgenlauf",
        "startTimeLocal": "2026-09-30 08:12:03",
        "startTimeGMT": "2026-09-30 06:12:03",
        "activityType": {"typeKey": "running"},
        "distance": 10012.5,
        "duration": 3011.2,
        "averageHR": 148.6,
        "hrTimeInZone_1": 60.0,
        "hrTimeInZone_2": 2400.0,
        "hrTimeInZone_3": 500.0,
    }
    row = activity_row(raw)
    assert row["id"] == 123
    assert row["local_date"] == "2026-09-30"
    assert row["start_time"] == "2026-09-30T06:12:03Z"
    assert row["sport"] == "running"
    assert row["avg_hr"] == 149
    assert row["hr_zones_s"] == [60.0, 2400.0, 500.0, None, None]
    assert row["raw"] is raw


def test_activity_row_without_zones():
    row = activity_row({"activityId": 1, "startTimeLocal": "2026-01-01 10:00:00"})
    assert row["hr_zones_s"] is None
    assert row["sport"] == "other"


def test_daily_row_tolerates_missing_data():
    row = daily_row("2026-09-30", None, None, None, None, None)
    assert row["date"] == "2026-09-30"
    assert row["sleep_s"] is None and row["hrv_last_night"] is None


def test_daily_row_maps_nested_values():
    row = daily_row(
        "2026-09-30",
        sleep={"dailySleepDTO": {"sleepTimeSeconds": 27000, "sleepScores": {"overall": {"value": 82}}}},
        hrv={"hrvSummary": {"lastNightAvg": 61, "status": "BALANCED", "baseline": {"balancedLow": 52, "balancedUpper": 70}}},
        summary={"restingHeartRate": 47, "bodyBatteryHighestValue": 88},
        readiness=[{"score": 74}],
        max_metrics=[{"generic": {"vo2MaxPreciseValue": 54.3}}],
    )
    assert row["sleep_s"] == 27000
    assert row["sleep_score"] == 82
    assert row["hrv_last_night"] == 61
    assert row["hrv_baseline_low"] == 52
    assert row["resting_hr"] == 47
    assert row["training_readiness"] == 74
    assert row["vo2max_running"] == 54.3


def test_base_url_accepts_rest_url():
    from db import base_url

    assert base_url("https://x.supabase.co/rest/v1/") == "https://x.supabase.co"
    assert base_url("https://x.supabase.co/") == "https://x.supabase.co"
    assert base_url(" https://x.supabase.co ") == "https://x.supabase.co"


def test_auth_header_only_for_jwt_keys():
    from db import Supabase

    assert "Authorization" not in Supabase("https://x.supabase.co", "sb_secret_abc").session.headers
    assert Supabase("https://x.supabase.co", "eyJabc").session.headers["Authorization"] == "Bearer eyJabc"


def test_pr_row():
    from mapping import pr_row

    row = pr_row({"typeId": 3, "value": 1385.2, "activityId": 9, "prStartTimeGmtFormatted": "2026-05-03T07:12:00.0"})
    assert row["type_id"] == 3 and row["value"] == 1385.2 and row["date"] == "2026-05-03"
    assert pr_row({"value": 1}) is None


def test_decoupling_steady_is_zero():
    from mapping import decoupling

    laps = [{"duration": 300, "distance": 1000, "averageHR": 140} for _ in range(10)]
    assert decoupling(laps) == 0.0


def test_decoupling_rising_hr():
    from mapping import decoupling

    laps = [{"duration": 300, "distance": 1000, "averageHR": 140 + i * 2} for i in range(10)]
    v = decoupling(laps)
    assert v is not None and 4 < v < 10


def test_decoupling_too_short():
    from mapping import decoupling

    assert decoupling([{"duration": 300, "distance": 1000, "averageHR": 140}] * 3) is None


def test_prediction_row():
    from mapping import prediction_row

    row = prediction_row("2026-10-02", {"time5K": 1250.4, "time10K": 2600, "timeHalfMarathon": 5800, "timeMarathon": 12300})
    assert row == {"date": "2026-10-02", "time_5k": 1250, "time_10k": 2600, "time_half": 5800, "time_marathon": 12300}
    assert prediction_row("2026-10-02", {}) is None
    assert prediction_row("2026-10-02", [{"time5K": 1300}])["time_5k"] == 1300


def test_race_row_takes_only_race_events():
    from mapping import race_row

    race = {"itemType": "event", "id": 77, "title": "Stadtlauf", "date": "2027-04-11", "isRace": True,
            "completionTarget": {"value": 21.0975, "unit": "kilometer", "unitType": "distance"}, "eventType": "running"}
    row = race_row(race)
    assert row["id"] == 77 and row["date"] == "2027-04-11" and row["distance_m"] == 21097.5 and row["sport"] == "running"
    assert race_row({"itemType": "workout", "id": 1, "title": "Plan · Intervalle", "date": "2027-04-01"}) is None
    assert race_row({**race, "isRace": False}) is None
    assert race_row({**race, "completionTarget": None})["distance_m"] is None


def test_lactate_row_scales_speed():
    lt = {"speed_and_heart_rate": {"calendarDate": "2026-09-14T08:00:00.0", "speed": 0.34166, "heartRate": 171}, "power": {}}
    assert lactate_row(lt) == {"date": "2026-09-14", "hr": 171, "speed_mps": 3.417}


def test_lactate_row_accepts_mps_and_rejects_junk():
    assert lactate_row({"speed_and_heart_rate": {"calendarDate": "2026-09-14", "speed": 3.6, "heartRate": 168}})["speed_mps"] == 3.6
    assert lactate_row({"speed_and_heart_rate": {"calendarDate": "2026-09-14", "speed": None, "heartRate": 168}})["speed_mps"] is None
    assert lactate_row({"speed_and_heart_rate": {"calendarDate": None, "speed": 0.3, "heartRate": 168}}) is None
    assert lactate_row({"speed_and_heart_rate": {"calendarDate": "2026-09-14", "speed": 0.3, "heartRate": None}}) is None
    assert lactate_row(None) is None
