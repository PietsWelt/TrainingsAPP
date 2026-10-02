"""Wetter am Startort eines Laufs von Open-Meteo (kostenlos, ohne Schlüssel).

Die Koordinaten werden auf etwa 1 km gerundet, bevor sie Open-Meteo erreichen.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

import requests

FORECAST = "https://api.open-meteo.com/v1/forecast"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"


def parse_time(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc)


def mid_hour(start_iso: str, duration_s: float | None) -> datetime:
    """Volle Stunde (UTC) in der Mitte des Laufs."""
    mid = parse_time(start_iso) + timedelta(seconds=(duration_s or 0) / 2)
    return (mid + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)


def pick(hourly: dict[str, Any], at: datetime) -> tuple[float | None, float | None]:
    """Temperatur und Taupunkt zur Stunde `at` aus der Open-Meteo-Antwort (Zeiten in UTC)."""
    key = at.strftime("%Y-%m-%dT%H:00")
    times = hourly.get("time") or []
    if key not in times:
        return None, None
    i = times.index(key)
    temp = (hourly.get("temperature_2m") or [None])[i] if i < len(hourly.get("temperature_2m") or []) else None
    dew = (hourly.get("dew_point_2m") or [None])[i] if i < len(hourly.get("dew_point_2m") or []) else None
    return temp, dew


def fetch(lat: float, lon: float, day: date, today: date, session: Any = requests) -> dict[str, Any]:
    # Das Archiv hängt ein paar Tage hinterher, die Vorhersage-API kennt die letzten Wochen.
    url = FORECAST if (today - day).days <= 60 else ARCHIVE
    r = session.get(
        url,
        params={
            "latitude": round(lat, 2),
            "longitude": round(lon, 2),
            "hourly": "temperature_2m,dew_point_2m",
            "start_date": day.isoformat(),
            "end_date": day.isoformat(),
            "timezone": "GMT",
        },
        timeout=20,
    )
    r.raise_for_status()
    return r.json().get("hourly") or {}


def weather_at(lat: float | None, lon: float | None, start_iso: str, duration_s: float | None, today: date, session: Any = requests) -> tuple[float | None, float | None]:
    if lat is None or lon is None:
        return None, None
    at = mid_hour(start_iso, duration_s)
    return pick(fetch(float(lat), float(lon), at.date(), today, session), at)
