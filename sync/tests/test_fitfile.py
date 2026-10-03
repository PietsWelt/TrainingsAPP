import random
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fitfile import analyze, clean, dfa_alpha1, hr_hist, is_strap, lactate_threshold, threshold  # noqa: E402


def white(n, seed=1):
    r = random.Random(seed)
    return [600 + r.gauss(0, 20) for _ in range(n)]


def correlated(n, phi, seed=1):
    """AR(1)-Rauschen: hohes phi = stark korrelierte Schläge = hohes alpha1."""
    r = random.Random(seed)
    x, out = 0.0, []
    for _ in range(n):
        x = phi * x + r.gauss(0, 10)
        out.append(600 + x)
    return out


def test_alpha1_white_noise_is_about_half():
    assert 0.35 < dfa_alpha1(white(400)) < 0.65


def test_alpha1_correlated_is_high():
    assert dfa_alpha1(correlated(400, 0.9)) > 1.0


def test_alpha1_needs_enough_beats():
    assert dfa_alpha1(white(30)) is None


def test_clean_flags_outliers():
    rr = [(i * 0.6, 600.0) for i in range(10)] + [(6.2, 1200.0), (6.8, 600.0)]
    _, bad = clean(rr)
    assert bad[10] and not bad[11] and sum(bad) == 1


def test_threshold_from_ramp():
    # alpha1 fällt linear von 1,2 bei 120 bpm auf 0,4 bei 170 bpm -> 0,75 bei 148 bpm.
    ws = [{"alpha1": 1.2 - (hr - 120) * 0.016, "hr": hr, "speed": 2.5 + (hr - 120) * 0.02} for hr in range(120, 171, 3)]
    hr, speed = threshold(ws)
    assert abs(hr - 148.1) < 0.5
    assert abs(speed - (2.5 + 28.1 * 0.02)) < 0.02


def test_lactate_threshold_from_ramp():
    # Gleiche Rampe: 0,5 bei 164 bpm (1,2 - 44 * 0,016 = 0,496).
    ws = [{"alpha1": 1.2 - (hr - 120) * 0.016, "hr": hr, "speed": 2.5 + (hr - 120) * 0.02} for hr in range(120, 171, 3)]
    hr, speed = lactate_threshold(ws)
    assert abs(hr - 163.75) < 0.5
    assert abs(speed - (2.5 + 43.75 * 0.02)) < 0.02


def test_lactate_threshold_needs_low_alpha():
    # Rampe endet bei alpha1 0,58: Die Gerade würde 0,5 kurz darüber kreuzen, erreicht hat der Lauf es nicht.
    ws = [{"alpha1": 1.2 - (hr - 120) * 0.016, "hr": hr, "speed": 3} for hr in range(120, 160, 2)]
    assert lactate_threshold(ws) == (None, None)
    assert threshold(ws)[0] is not None


def test_threshold_needs_hr_range():
    ws = [{"alpha1": 1.0 - i * 0.01, "hr": 140 + i * 0.5, "speed": 3} for i in range(20)]
    assert threshold(ws) == (None, None)


def test_threshold_not_extrapolated():
    # Ganzer Lauf über 0,75: Schwelle liegt außerhalb, also keine Schätzung.
    ws = [{"alpha1": 1.3 - (hr - 120) * 0.005, "hr": hr, "speed": 3} for hr in range(120, 151, 2)]
    assert threshold(ws) == (None, None)


def test_strap_detection():
    assert is_strap({"antplus_device_type": "heart_rate", "source_type": "antplus"})
    assert is_strap({"device_type": 1, "source_type": "bluetooth_low_energy"})
    assert not is_strap({"local_device_type": "wrist_hr", "source_type": "local"})
    assert not is_strap({"device_type": "barometer"})


def test_hist_counts_seconds_per_bin():
    recs = [(float(t), 141 if t < 60 else 152, 3.0) for t in range(120)]
    assert hr_hist(recs) == {"140": 60, "150": 59}


def test_analyze_ramp_run():
    """Simulierter Stufenlauf: locker korreliert, dann zunehmend zufällig. Ergibt eine Schwelle."""
    start = datetime(2026, 9, 1, 7, tzinfo=timezone.utc)
    items = [("device_info", {"antplus_device_type": "heart_rate", "source_type": "antplus"})]
    t = 0.0
    for stage in range(10):
        hr = 120 + stage * 5
        phi = 0.95 - stage * 0.1
        beats = correlated(int(240 * hr / 60), max(phi, 0.0), seed=stage)
        scale = 60000 / hr / 600
        rr = [b * scale for b in beats]
        i = 0
        while i < len(rr):
            items.append(("record", {"timestamp": start + timedelta(seconds=t), "heart_rate": hr, "enhanced_speed": 2.5 + stage * 0.1}))
            chunk = rr[i : i + 5]
            items.append(("hrv", {"time": tuple(x / 1000 for x in chunk)}))
            t += sum(chunk) / 1000
            i += 5
    row = analyze(items)
    assert row["hr_source"] == "strap"
    assert row["rr_artifact_pct"] < 1
    assert row["aet_hr"] is not None and 125 < row["aet_hr"] < 160
    assert row["aet_speed_mps"] is not None
    assert "lt_hr" in row
    if row["lt_hr"] is not None:
        assert row["lt_hr"] > row["aet_hr"]


def test_analyze_wrist_run_without_rr():
    start = datetime(2026, 9, 1, 7, tzinfo=timezone.utc)
    items = [("record", {"timestamp": start + timedelta(seconds=s), "heart_rate": 140, "speed": 3.0}) for s in range(600)]
    row = analyze(items)
    assert row == {"hr_source": "wrist", "hr_hist": {"140": 599}}
