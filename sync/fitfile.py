"""Auswertung der Original-Datei (FIT) eines Laufs: Pulsquelle, Puls-Verteilung und DFA-alpha1.

Mit Brustgurt und "HRV aufzeichnen" stehen in der FIT-Datei die Abstände zwischen den einzelnen
Herzschlägen (RR-Intervalle). Daraus wird DFA-alpha1 berechnet, ein Maß dafür, wie "geordnet" der
Herzschlag schwankt. Bei lockerer Belastung liegt der Wert um 1, oberhalb der aeroben Schwelle fällt er
unter 0,75 (Rogers et al. 2021, Gronwald et al. 2020). Der Puls, bei dem der Wert 0,75 kreuzt, ist eine
Schätzung der aeroben Schwelle. Wo er 0,5 kreuzt, liegt etwa die zweite Schwelle (Laktatschwelle,
Rogers et al. 2021, J Funct Morphol Kinesiol).
"""

from __future__ import annotations

import io
import math
import zipfile
from bisect import bisect_left
from datetime import datetime
from statistics import median
from typing import Any, Iterable

# Fenster wie bei Rogers et al. (2 Minuten), alle 30 Sekunden neu berechnet.
WINDOW_S = 120
STEP_S = 30
# Fenster mit mehr als 5 % korrigierten Schlägen sind unzuverlässig.
MAX_ARTIFACTS = 0.05
AET_ALPHA = 0.75
LT_ALPHA = 0.5
HIST_BIN = 5


def fit_bytes(blob: bytes) -> bytes:
    """Garmin liefert die Original-Datei als ZIP mit genau einer .fit-Datei."""
    if blob[:2] != b"PK":
        return blob
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".fit"))
        return z.read(name)


def frames(data: bytes) -> Iterable[tuple[str, dict[str, Any]]]:
    """Nur die Nachrichten, die wir brauchen, als (Name, Felder)."""
    import fitdecode

    wanted = {"record", "hrv", "device_info"}
    with fitdecode.FitReader(io.BytesIO(data), check_crc=fitdecode.CrcCheck.DISABLED) as fit:
        for f in fit:
            if f.frame_type == fitdecode.FIT_FRAME_DATA and f.name in wanted:
                yield f.name, {fld.name: fld.value for fld in f.fields}


def is_strap(info: dict[str, Any]) -> bool:
    """Ein externer Pulssensor in device_info: ANT+ Gerätetyp "heart_rate" oder Bluetooth-Typ 1 (Herzfrequenz)."""
    source = str(info.get("source_type") or "").lower()
    if source == "local":
        return False
    if str(info.get("antplus_device_type") or "").lower() == "heart_rate":
        return True
    return source == "bluetooth_low_energy" and str(info.get("device_type")) in ("1", "heart_rate")


def collect(items: Iterable[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
    """RR-Intervalle (ms, mit Zeitpunkt), Puls und Tempo pro Sekunde und ob ein Gurt dabei war."""
    rr: list[tuple[float, float]] = []  # (Sekunden seit Start, RR in ms)
    records: list[tuple[float, int | None, float | None]] = []
    strap = False
    start: datetime | None = None
    clock = 0.0  # Zeit des letzten record; RR-Werte zählen von dort weiter
    beat_t = 0.0
    for name, v in items:
        if name == "device_info":
            strap = strap or is_strap(v)
        elif name == "record" and isinstance(v.get("timestamp"), datetime):
            start = start or v["timestamp"]
            clock = (v["timestamp"] - start).total_seconds()
            beat_t = max(beat_t, clock)
            spd = v.get("enhanced_speed", v.get("speed"))
            records.append((clock, v.get("heart_rate"), spd))
        elif name == "hrv":
            for s in v.get("time") or ():
                # 65,535 s bzw. None markiert leere Plätze.
                if s is None or s >= 65:
                    continue
                beat_t += s
                rr.append((beat_t, s * 1000))
    return {"rr": rr, "records": records, "strap": strap or len(rr) > 100}


def clean(rr: list[tuple[float, float]]) -> tuple[list[tuple[float, float]], list[bool]]:
    """Unplausible Schläge markieren: außerhalb 300–2000 ms oder über 20 % vom lokalen Median weg."""
    out: list[tuple[float, float]] = []
    bad: list[bool] = []
    recent: list[float] = []
    for t, x in rr:
        ref = median(recent) if len(recent) >= 3 else x
        wrong = not 300 <= x <= 2000 or abs(x - ref) > 0.2 * ref
        bad.append(wrong)
        if not wrong:
            out.append((t, x))
            recent = (recent + [x])[-5:]
    return out, bad


def _detrended_rms(y: list[float], n: int) -> float | None:
    """Mittlere Abweichung vom linearen Trend in Kästen der Länge n."""
    boxes = len(y) // n
    if boxes < 2:
        return None
    xs = list(range(n))
    mx = (n - 1) / 2
    sxx = sum((x - mx) ** 2 for x in xs)
    total = 0.0
    for b in range(boxes):
        seg = y[b * n : (b + 1) * n]
        my = sum(seg) / n
        slope = sum((x - mx) * (v - my) for x, v in zip(xs, seg)) / sxx
        total += sum((v - (my + slope * (x - mx))) ** 2 for x, v in zip(xs, seg))
    return math.sqrt(total / (boxes * n))


def dfa_alpha1(rr: list[float]) -> float | None:
    """Kurzzeit-Skalierungsexponent alpha1 der trendbereinigten Fluktuationsanalyse (Kastengrößen 4–16)."""
    if len(rr) < 50:
        return None
    mean = sum(rr) / len(rr)
    y: list[float] = []
    acc = 0.0
    for x in rr:
        acc += x - mean
        y.append(acc)
    pts = [(math.log(n), math.log(f)) for n in range(4, 17) if (f := _detrended_rms(y, n))]
    if len(pts) < 5:
        return None
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    return sum((x - mx) * (y_ - my) for x, y_ in pts) / sum((x - mx) ** 2 for x, _ in pts)


def windows(rr: list[tuple[float, float]], bad: list[bool], records: list[tuple[float, int | None, float | None]]) -> list[dict[str, float]]:
    """alpha1, Puls und Tempo je 2-Minuten-Fenster."""
    if not rr:
        return []
    times = [t for t, _ in rr]
    out = []
    t0 = times[0]
    while t0 + WINDOW_S <= times[-1]:
        idx = range(bisect_left(times, t0), bisect_left(times, t0 + WINDOW_S))
        t0 += STEP_S
        if not idx:
            continue
        art = sum(bad[i] for i in idx) / len(idx)
        vals = [rr[i][1] for i in idx if not bad[i]]
        if art > MAX_ARTIFACTS or len(vals) < 100:
            continue
        a1 = dfa_alpha1(vals)
        if a1 is None:
            continue
        lo, hi = rr[idx[0]][0], rr[idx[-1]][0]
        speeds = [s for t, _, s in records if lo <= t <= hi and s is not None]
        out.append({"alpha1": a1, "hr": 60000 / (sum(vals) / len(vals)), "speed": sum(speeds) / len(speeds) if speeds else 0.0})
    return out


def _fit_line(xs: list[float], ys: list[float]) -> tuple[float, float, float] | None:
    """Gerade y = a + b·x und Korrelation r."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if not sxx or not syy:
        return None
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b = sxy / sxx
    return my - b * mx, b, sxy / math.sqrt(sxx * syy)


def crossing(ws: list[dict[str, float]], alpha: float, reached: int = 0) -> tuple[float | None, float | None]:
    """Puls und Tempo (m/s), bei denen alpha1 den Wert `alpha` kreuzt. Nur wenn der Lauf das hergibt:
    mindestens 10 Fenster, 15 Schläge Pulsspanne, klarer Zusammenhang und der Kreuzungspunkt innerhalb der Spanne.
    `reached`: so viele Fenster müssen den Wert tatsächlich fast erreicht haben (höchstens 0,05 darüber)."""
    ws = [w for w in ws if 0.2 <= w["alpha1"] <= 1.6]
    if len(ws) < 10:
        return None, None
    if sum(w["alpha1"] <= alpha + 0.05 for w in ws) < reached:
        return None, None
    hrs = [w["hr"] for w in ws]
    if max(hrs) - min(hrs) < 15:
        return None, None
    line = _fit_line(hrs, [w["alpha1"] for w in ws])
    if not line or line[1] >= 0 or line[2] > -0.5:
        return None, None
    hr = (alpha - line[0]) / line[1]
    if not min(hrs) <= hr <= max(hrs):
        return None, None
    moving = [w for w in ws if w["speed"] > 1]
    speed = None
    if len(moving) >= 10:
        sl = _fit_line([w["hr"] for w in moving], [w["speed"] for w in moving])
        if sl and sl[2] >= 0.5:
            speed = sl[0] + sl[1] * hr
    return round(hr, 1), round(speed, 3) if speed else None


def threshold(ws: list[dict[str, float]]) -> tuple[float | None, float | None]:
    """Aerobe Schwelle: alpha1 = 0,75."""
    return crossing(ws, AET_ALPHA)


def lactate_threshold(ws: list[dict[str, float]]) -> tuple[float | None, float | None]:
    """Laktatschwelle: alpha1 = 0,5. Nur wenn mindestens 3 Fenster (1,5 min) wirklich so tief waren,
    sonst wäre es eine Verlängerung der Geraden ins Ungewisse."""
    return crossing(ws, LT_ALPHA, reached=3)


def hr_hist(records: list[tuple[float, int | None, float | None]]) -> dict[str, int] | None:
    """Sekunden je 5er-Pulsbereich ("140" = 140–144 bpm). Lücken über 10 s zählen nicht."""
    hist: dict[str, int] = {}
    for (t, hr, _), (t2, _, _) in zip(records, records[1:]):
        if not hr or hr < 40 or hr > 230:
            continue
        dt = t2 - t
        if 0 < dt <= 10:
            k = str(int(hr) // HIST_BIN * HIST_BIN)
            hist[k] = hist.get(k, 0) + int(round(dt))
    return hist or None


def analyze(items: Iterable[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
    """Spalten für activities aus den Nachrichten einer FIT-Datei."""
    c = collect(items)
    row: dict[str, Any] = {"hr_source": "strap" if c["strap"] else "wrist", "hr_hist": hr_hist(c["records"])}
    if len(c["rr"]) > 300:
        _, bad = clean(c["rr"])
        ws = windows(c["rr"], bad, c["records"])
        row["rr_artifact_pct"] = round(100 * sum(bad) / len(bad), 1)
        if ws:
            row["dfa_a1"] = round(sum(w["alpha1"] for w in ws) / len(ws), 2)
            row["aet_hr"], row["aet_speed_mps"] = threshold(ws)
            row["lt_hr"], row["lt_speed_mps"] = lactate_threshold(ws)
    return row
