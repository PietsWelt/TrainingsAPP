"""Einmaliger Garmin-Login (inkl. MFA). Speichert nur die Tokens in Supabase, nie das Passwort.

Ausführen z.B. in einem GitHub Codespace:
    pip install -r sync/requirements.txt
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python sync/login.py
"""

from __future__ import annotations

import getpass
from pathlib import Path

from garminconnect import Garmin

from db import Supabase


# Lokale Kopie, damit ein fehlgeschlagener Upload ohne erneuten Garmin-Login wiederholt werden kann.
TOKEN_FILE = Path.home() / ".garminconnect" / "garmin_tokens.json"


def main() -> None:
    db = Supabase()
    if TOKEN_FILE.exists():
        db.save_tokens(TOKEN_FILE.read_text())
        print(f"Vorhandene Tokens aus {TOKEN_FILE} gespeichert, der Sync kann laufen.")
        return
    email = input("Garmin E-Mail: ").strip()
    password = getpass.getpass("Garmin Passwort (wird nicht gespeichert): ")
    client = Garmin(email, password, prompt_mfa=lambda: input("MFA-Code aus E-Mail/App: ").strip())
    client.login(str(TOKEN_FILE))
    db.save_tokens(client.client.dumps())
    print(f"Eingeloggt als {client.get_full_name()}. Tokens gespeichert, der Sync kann laufen.")


if __name__ == "__main__":
    main()
