# TrainingsAPP

Persönliche Erweiterung zu Garmin Connect: Dashboard mit allen Garmin-Daten (inkl. Schlaf und HRV),
später Trainingspläne, eigene Readiness, Alkohol-Tracking und Trainingsanalyse.
Läuft als Web-App (PWA) auf dem Handy, Kosten 0 €/Monat.

```
Garmin Connect ──(python-garminconnect, alle 30 min + Knopf)──► GitHub Actions (sync/)
                                                                     │
                                                                     ▼
                     Handy-App (web/, GitHub Pages) ◄────────── Supabase (Postgres + Login)
```

| Ordner | Inhalt |
|---|---|
| `web/` | PWA (Vite, React, Tailwind, Recharts). Ohne Supabase-Werte startet sie im Demo-Modus. |
| `sync/` | Python-Sync von Garmin nach Supabase, `login.py` für den einmaligen Garmin-Login |
| `supabase/` | Datenbank-Schema und Edge Function für „Jetzt synchronisieren“ |
| `.github/workflows/` | `sync.yml` (Zeitplan), `pages.yml` (App veröffentlichen), `ci.yml` (Tests) |

## Einrichtung (einmalig, ca. 20 Minuten)

### 1. Supabase
1. Auf [supabase.com](https://supabase.com) kostenloses Projekt anlegen (Region Frankfurt).
2. **SQL Editor** öffnen, nacheinander den Inhalt von `supabase/migrations/0001_init.sql`, `0002_plan.sql` und `0003_readiness.sql` einfügen, jeweils **Run**.
3. **Authentication → Users → Add user**: deine E-Mail und ein Passwort (das ist der App-Login, nicht Garmin).
4. **Authentication → Sign In / Providers**: „Allow new users to sign up“ **ausschalten**. Damit bist du der einzige Nutzer.
5. **Project Settings → API**: `Project URL` (z.B. `https://xxxx.supabase.co`, ohne `/rest/v1`), `anon`-Key und `service_role`-Key notieren.

### 2. GitHub-Einstellungen im Repo
**Settings → Secrets and variables → Actions**

- Tab **Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` = der „secret“-Key (`sb_secret_…`) oder der Legacy-`service_role`-Key (geheim, nie in die App!)
- Tab **Variables**: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (für die App)

**Settings → Pages → Source: GitHub Actions**

### 3. Garmin einmalig verbinden
Im Repo **Code → Codespaces → Create codespace on main**, dann im Terminal:

```bash
pip install -r sync/requirements.txt
cd sync
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python login.py
```

E-Mail, Passwort und ggf. MFA-Code eingeben. Gespeichert werden nur Tokens in Supabase, nie das Passwort.
Danach den Codespace löschen. Anschließend unter **Actions → Garmin Sync → Run workflow** den ersten Sync starten
(lädt 120 Tage Historie).

### 4. „Jetzt synchronisieren“-Knopf (optional)
1. GitHub: **Settings → Developer settings → Fine-grained tokens**, Zugriff nur auf dieses Repo, Berechtigung **Actions: Read and write**.
2. Supabase: **Edge Functions → Deploy a new function → via Editor**, Name `trigger-sync`, Inhalt aus `supabase/functions/trigger-sync/index.ts`.
3. Supabase: **Edge Functions → Secrets**: `GITHUB_TOKEN` (Token von oben), `GITHUB_REPO` = `PietsWelt/TrainingsAPP`.

### 5. Aufs Handy
`https://pietswelt.github.io/TrainingsAPP/` öffnen, einloggen, dann
iPhone: Teilen → „Zum Home-Bildschirm“, Android: Menü → „App installieren“.

## Entwicklung

```bash
cd web && npm install && npm run dev      # Demo-Modus ohne .env
cd sync && python -m pytest -q tests
```
