import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mapping import gap_factor  # noqa: E402
from weather import fetch, mid_hour, pick, weather_at  # noqa: E402


def test_gap_flat_is_one():
    laps = [{"distance": 1000, "elevationGain": 0, "elevationLoss": 0}] * 5
    assert gap_factor(laps) == 1.0


def test_gap_uphill_costs_more_downhill_less():
    up = gap_factor([{"distance": 1000, "elevationGain": 40, "elevationLoss": 0}] * 3)
    down = gap_factor([{"distance": 1000, "elevationGain": 0, "elevationLoss": 40}] * 3)
    assert up is not None and up > 1.15
    assert down is not None and 0.88 <= down < 1


def test_gap_rolling_course_slightly_harder_and_short_runs_skipped():
    rolling = gap_factor([{"distance": 1000, "elevationGain": 10, "elevationLoss": 10}] * 5)
    assert rolling is not None and 1.0 < rolling < 1.05
    assert gap_factor([{"distance": 500, "elevationGain": 5, "elevationLoss": 0}]) is None


def test_mid_hour_rounds_to_hour_in_utc():
    assert mid_hour("2026-07-01T06:10:00Z", 3600) == datetime(2026, 7, 1, 7, 0, tzinfo=timezone.utc)
    assert mid_hour("2026-07-01T06:50:00+00:00", 600) == datetime(2026, 7, 1, 7, 0, tzinfo=timezone.utc)


def test_pick_and_fetch_choose_endpoint():
    hourly = {"time": ["2026-07-01T06:00", "2026-07-01T07:00"], "temperature_2m": [18.0, 21.5], "dew_point_2m": [12.0, 14.0]}
    assert pick(hourly, datetime(2026, 7, 1, 7, tzinfo=timezone.utc)) == (21.5, 14.0)
    assert pick(hourly, datetime(2026, 7, 1, 9, tzinfo=timezone.utc)) == (None, None)

    calls = []

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"hourly": hourly}

    class Session:
        def get(self, url, params, timeout):
            calls.append((url, params))
            return Resp()

    fetch(53.55123, 9.99321, date(2026, 7, 1), date(2026, 7, 3), Session())
    fetch(53.55, 9.99, date(2025, 7, 1), date(2026, 7, 3), Session())
    assert "api.open-meteo.com" in calls[0][0] and "archive" in calls[1][0]
    assert calls[0][1]["latitude"] == 53.55 and calls[0][1]["longitude"] == 9.99
    assert weather_at(53.5, 10.0, "2026-07-01T06:30:00Z", 3600, date(2026, 7, 2), Session()) == (21.5, 14.0)
    assert weather_at(None, None, "2026-07-01T06:30:00Z", 3600, date(2026, 7, 2), Session()) == (None, None)
