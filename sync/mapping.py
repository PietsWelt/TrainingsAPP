"""Übersetzt Garmin-Connect-JSON in Zeilen für unsere Tabellen.

Garmin liefert je nach Gerät und Tag unterschiedlich vollständige Daten,
daher wird hier jeder Wert defensiv gelesen.
"""

from __future__ import annotations

from typing import Any


def dig(data: Any, *path: str | int) -> Any:
    """Liest einen verschachtelten Wert; None, sobald ein Teil fehlt."""
    for key in path:
        if data is None:
            return None
        if isinstance(key, int):
            if not isinstance(data, list) or len(data) <= key:
                return None
            data = data[key]
        else:
            if not isinstance(data, dict):
                return None
            data = data.get(key)
    return data


def as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def activity_row(a: dict[str, Any]) -> dict[str, Any]:
    start_local = a.get("startTimeLocal") or ""
    start_gmt = a.get("startTimeGMT") or start_local
    zones = [a.get(f"hrTimeInZone_{i}") for i in range(1, 6)]
    return {
        "id": a["activityId"],
        "start_time": start_gmt.replace(" ", "T") + ("Z" if start_gmt and "Z" not in start_gmt else ""),
        "local_date": start_local[:10],
        "sport": dig(a, "activityType", "typeKey") or "other",
        "name": a.get("activityName"),
        "distance_m": a.get("distance"),
        "duration_s": a.get("duration"),
        "moving_s": a.get("movingDuration"),
        "avg_hr": as_int(a.get("averageHR")),
        "max_hr": as_int(a.get("maxHR")),
        "avg_speed_mps": a.get("averageSpeed"),
        "elevation_gain_m": a.get("elevationGain"),
        "avg_power_w": a.get("avgPower"),
        "training_load": a.get("activityTrainingLoad"),
        "aerobic_te": a.get("aerobicTrainingEffect"),
        "anaerobic_te": a.get("anaerobicTrainingEffect"),
        "calories": a.get("calories"),
        "vo2max": a.get("vO2MaxValue"),
        "hr_zones_s": zones if any(z is not None for z in zones) else None,
        "raw": a,
    }


def daily_row(
    date: str,
    sleep: dict[str, Any] | None,
    hrv: dict[str, Any] | None,
    summary: dict[str, Any] | None,
    readiness: Any,
    max_metrics: Any,
) -> dict[str, Any]:
    s = dig(sleep, "dailySleepDTO") or {}
    h = dig(hrv, "hrvSummary") or {}
    # Training Readiness kommt als Liste (mehrere Werte pro Tag möglich), neuester zuerst.
    tr = readiness[0] if isinstance(readiness, list) and readiness else readiness
    mm = max_metrics[0] if isinstance(max_metrics, list) and max_metrics else max_metrics

    return {
        "date": date,
        "sleep_s": as_int(s.get("sleepTimeSeconds")),
        "deep_sleep_s": as_int(s.get("deepSleepSeconds")),
        "light_sleep_s": as_int(s.get("lightSleepSeconds")),
        "rem_sleep_s": as_int(s.get("remSleepSeconds")),
        "awake_s": as_int(s.get("awakeSleepSeconds")),
        "sleep_score": as_int(dig(s, "sleepScores", "overall", "value")),
        "hrv_last_night": as_int(h.get("lastNightAvg")),
        "hrv_weekly_avg": as_int(h.get("weeklyAvg")),
        "hrv_status": h.get("status"),
        "hrv_baseline_low": as_int(dig(h, "baseline", "balancedLow")),
        "hrv_baseline_high": as_int(dig(h, "baseline", "balancedUpper")),
        "resting_hr": as_int(dig(summary, "restingHeartRate")),
        "steps": as_int(dig(summary, "totalSteps")),
        "body_battery_high": as_int(dig(summary, "bodyBatteryHighestValue")),
        "body_battery_low": as_int(dig(summary, "bodyBatteryLowestValue")),
        "stress_avg": as_int(dig(summary, "averageStressLevel")),
        "training_readiness": as_int(dig(tr, "score")),
        "vo2max_running": dig(mm, "generic", "vo2MaxPreciseValue") or dig(mm, "generic", "vo2MaxValue"),
        "raw": {
            "sleep": sleep,
            "hrv": hrv,
            "summary": summary,
            "readiness": readiness,
            "max_metrics": max_metrics,
        },
    }


def pr_row(r: dict[str, Any]) -> dict[str, Any] | None:
    """Ein Garmin-Rekord. typeId bestimmt die Art (z.B. 3 = 5 km), value ist Zeit oder Strecke."""
    if r.get("typeId") is None:
        return None
    when = r.get("prStartTimeGmtFormatted") or r.get("actStartDateTimeInGMTFormatted") or ""
    return {
        "type_id": int(r["typeId"]),
        "value": r.get("value"),
        "activity_id": r.get("activityId"),
        "date": when[:10] or None,
        "raw": r,
    }


def decoupling(laps: list[dict[str, Any]], warmup_share: float = 0.1) -> float | None:
    """Puls-Drift (Pa:HR) aus Runden: Effizienz (Tempo pro Herzschlag) der 2. Hälfte ggü. der 1. Hälfte.

    Positiv = der Puls stieg bei gleichem Tempo bzw. das Tempo fiel bei gleichem Puls.
    Die ersten 10 % der Zeit zählen als Einlaufen und bleiben außen vor.
    """
    segs = []
    for lap in laps:
        t, d, hr = lap.get("duration") or lap.get("movingDuration"), lap.get("distance"), lap.get("averageHR")
        if t and d and hr and t > 0 and hr > 0:
            segs.append((float(t), float(d), float(hr)))
    total = sum(s[0] for s in segs)
    if len(segs) < 4 or total < 30 * 60:
        return None
    start, mid = total * warmup_share, total * warmup_share + (total * (1 - warmup_share)) / 2
    halves = [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0]]  # Zeit, Strecke, Herzschläge
    clock = 0.0
    for t, d, hr in segs:
        a, b = clock, clock + t
        clock = b
        for i, (lo, hi) in enumerate(((start, mid), (mid, total))):
            share = max(0.0, min(b, hi) - max(a, lo)) / t
            if share:
                halves[i][0] += t * share
                halves[i][1] += d * share
                halves[i][2] += hr * t * share
    (t1, d1, beats1), (t2, d2, beats2) = halves
    if not (beats1 and beats2):
        return None
    ef1, ef2 = d1 / beats1, d2 / beats2
    return round((ef1 - ef2) / ef1 * 100, 1)


def prediction_row(day: str, p: dict[str, Any] | list[Any] | None) -> dict[str, Any] | None:
    """Garmins Rennzeit-Prognose (Sekunden) für 5 km, 10 km, Halbmarathon und Marathon."""
    if isinstance(p, list):
        p = p[-1] if p else None
    if not isinstance(p, dict):
        return None
    row = {
        "date": day,
        "time_5k": as_int(p.get("time5K")),
        "time_10k": as_int(p.get("time10K")),
        "time_half": as_int(p.get("timeHalfMarathon")),
        "time_marathon": as_int(p.get("timeMarathon")),
    }
    return row if any(v for k, v in row.items() if k != "date") else None
