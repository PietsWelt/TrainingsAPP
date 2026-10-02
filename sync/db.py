"""Minimaler Supabase-Client (PostgREST) mit dem Service-Role-Key."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import requests


class Supabase:
    def __init__(self, url: str | None = None, key: str | None = None) -> None:
        url = url or os.environ["SUPABASE_URL"]
        key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.base = url.rstrip("/") + "/rest/v1"
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            }
        )

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        r = self.session.get(f"{self.base}/{table}", params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def upsert(self, table: str, rows: list[dict[str, Any]] | dict[str, Any], on_conflict: str) -> None:
        if not rows:
            return
        r = self.session.post(
            f"{self.base}/{table}",
            params={"on_conflict": on_conflict},
            json=rows,
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            timeout=60,
        )
        r.raise_for_status()

    def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        r = self.session.post(
            f"{self.base}/{table}",
            json=row,
            headers={"Prefer": "return=representation"},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()[0]

    def update(self, table: str, match: dict[str, str], values: dict[str, Any]) -> None:
        params = {k: f"eq.{v}" for k, v in match.items()}
        r = self.session.patch(f"{self.base}/{table}", params=params, json=values, timeout=30)
        r.raise_for_status()

    # Garmin-Tokens liegen in genau einer Zeile von garmin_auth.
    def load_tokens(self) -> str | None:
        rows = self.select("garmin_auth", {"select": "tokens", "id": "eq.1"})
        return rows[0]["tokens"] if rows else None

    def save_tokens(self, tokens: str) -> None:
        self.upsert("garmin_auth", {"id": 1, "tokens": tokens, "updated_at": datetime.now(timezone.utc).isoformat()}, "id")
