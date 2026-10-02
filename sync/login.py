"""Einmaliger Garmin-Login (inkl. MFA). Speichert nur die Tokens in Supabase, nie das Passwort.

Ausführen z.B. in einem GitHub Codespace:
    pip install -r sync/requirements.txt
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python sync/login.py
"""

from __future__ import annotations

import getpass
import tempfile
from pathlib import Path

from garminconnect import Garmin

from db import Supabase


def main() -> None:
    db = Supabase()
    email = input("Garmin E-Mail: ").strip()
    password = getpass.getpass("Garmin Passwort (wird nicht gespeichert): ")
    client = Garmin(email, password, prompt_mfa=lambda: input("MFA-Code aus E-Mail/App: ").strip())
    token_file = Path(tempfile.mkdtemp()) / "garmin_tokens.json"
    client.login(str(token_file))
    db.save_tokens(client.client.dumps())
    print(f"Eingeloggt als {client.get_full_name()}. Tokens gespeichert, der Sync kann laufen.")


if __name__ == "__main__":
    main()
