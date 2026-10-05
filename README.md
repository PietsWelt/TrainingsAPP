# TrainingsAPP

Persönliche Erweiterung zu Garmin Connect: Dashboard mit allen Garmin-Daten (inkl. Schlaf und HRV),
später Trainingspläne, eigene Readiness, Alkohol-Tracking und Trainingsanalyse.
Läuft als Web-App (PWA) auf dem Handy, Kosten 0 €/Monat.

```
Garmin Connect ──(python-garminconnect, jede Stunde + Knopf)──► GitHub Actions (sync/)
                                                                     │
                                                                     ▼
                     Handy-App (web/, GitHub Pages) ◄────────── Supabase (Postgres + Login)
```

| Ordner | Inhalt |
|---|---|
| `web/` | PWA (Vite, React, Tailwind, Recharts). Ohne Supabase-Werte startet sie im Demo-Modus. |
| `sync/` | Python-Sync von Garmin nach Supabase, `login.py` für den einmaligen Garmin-Login |
| `supabase/` | Datenbank-Schema und Edge Function für „Jetzt synchronisieren“ |
| `.github/workflows/` | `sync.yml` (Garmin-Sync), `pages.yml` (App veröffentlichen), `ci.yml` (Tests) |

## Einrichtung (einmalig, ca. 20 Minuten)

### 1. Supabase
1. Auf [supabase.com](https://supabase.com) kostenloses Projekt anlegen (Region Frankfurt).
2. **SQL Editor** öffnen, nacheinander den Inhalt von `supabase/migrations/0001_init.sql`, `0002_plan.sql`, `0003_readiness.sql`, `0004_feedback_watch.sql`, `0005_gym.sql`, `0006_sync_cron.sql`, `0007_personal_records.sql`, `0008_drift_prognose.sql`, `0009_garmin_races.sql`, `0010_sicherheit.sql`, `0011_wetter_steigung.sql`, `0012_brustgurt.sql`, `0013_laktatschwelle.sql`, `0014_gym_saetze.sql` und `0015_sync_stuendlich.sql` einfügen, jeweils **Run**. In `0006_sync_cron.sql` vorher die zwei Platzhalter ersetzen (steht oben in der Datei); `0015_sync_stuendlich.sql` startet den Sync jede volle Stunde von 6 bis 23 Uhr. `0010_sicherheit.sql` erlaubt Lesen und Schreiben nur dem ersten angelegten Nutzer (Schritt 3 also vorher erledigen und danach erneut ausführen, falls nötig).
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
3. Supabase: **Edge Functions → Secrets**: `GITHUB_TOKEN` (Token von oben), `GITHUB_REPO` = `PietsWelt/TrainingsAPP`. Läuft die App nicht unter `https://pietswelt.github.io`, zusätzlich `ALLOWED_ORIGIN` mit der eigenen Adresse.
4. Die Funktion startet den Sync nur für dich (eingeloggt) oder für den Zeitplan aus `0010_sicherheit.sql`. Deshalb `0010` vor der Funktion ausführen.

### Workouts auf der Uhr
Der Sync legt die geplanten Lauf- und Radeinheiten der nächsten 7 Tage als Workouts in Garmin Connect an
(Name beginnt mit „Plan · “) und trägt sie in den Kalender ein. Die Uhr holt sie beim nächsten Abgleich mit dem Handy.
Ändert sich eine Einheit in der App, wird sie beim nächsten Sync ersetzt; übersprungene und alte Einheiten werden wieder entfernt.
Eigene Workouts ohne den Präfix bleiben unberührt. Abschalten: Repo-Variable `WATCH_DAYS` = `0`.

### Brustgurt (optional)
Läufe mit Brustgurt (z. B. HRM 600) wertet der Sync aus der Original-Datei (FIT) aus: Pulsquelle, Puls-Verteilung und,
wenn auf der Uhr **System › Datenaufzeichnung › HRV aufzeichnen** an ist, DFA-alpha1 aus den einzelnen Herzschlägen.
Daraus schätzt die App deine aerobe Schwelle (Trends) und bewertet lockere Läufe mit Gurt daran statt an Garmins Zonen.
Pro Sync werden bis zu 6 Läufe der letzten 120 Tage nachgeholt (`FIT_PER_RUN`).

### 5. Aufs Handy
`https://pietswelt.github.io/TrainingsAPP/` öffnen, einloggen, dann
iPhone: Teilen → „Zum Home-Bildschirm“, Android: Menü → „App installieren“.

## Entwicklung

```bash
cd web && npm install && npm run dev      # Demo-Modus ohne .env
cd sync && python -m pytest -q tests
```
