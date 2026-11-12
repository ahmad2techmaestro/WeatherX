"""
Multivariate temperature anomaly detection.

For each forecast day we compare (max, min) temperature with the same time of year in previous years
(+-WINDOW_DAYS around the day of year). Two independent detectors are used:

  * Robust Mahalanobis distance (MinCovDet) with a chi-square (2 dof) tail probability. It accounts for the
    correlation between day and night temperature, so a hot day with a hot night is rarer than either alone.
  * IsolationForest, which makes no Gaussian assumption.

A day is flagged only from the Mahalanobis p-value; the forest score is reported as a cross-check and the
result says whether both detectors agree. This is a statistical model fit per request on that place's own
history. It is not a weather forecast.
"""
from __future__ import annotations

import math
from datetime import date as Date

import numpy as np
from sklearn.covariance import MinCovDet
from sklearn.ensemble import IsolationForest

WINDOW_DAYS = 7
MIN_SAMPLES = 60
P_UNUSUAL = 0.05
P_EXTREME = 0.01


def _doy(iso: str) -> int:
    return Date.fromisoformat(iso).timetuple().tm_yday


def _circ(a: int, b: int) -> int:
    d = abs(a - b)
    return min(d, 365 - d)


def analyse(history: list[dict], days: list[dict]) -> dict:
    """history/days items: {date: 'YYYY-MM-DD', tmax: float, tmin: float}. Returns per-day anomaly results."""
    rows = [(h["date"], float(h["tmax"]), float(h["tmin"])) for h in history]
    hdoy = np.array([_doy(r[0]) for r in rows])
    hx = np.array([[r[1], r[2]] for r in rows])

    results = []
    skipped = 0
    for d in days:
        doy = _doy(d["date"])
        mask = np.array([_circ(int(x), doy) <= WINDOW_DAYS for x in hdoy])
        sample = hx[mask]
        if len(sample) < MIN_SAMPLES:
            skipped += 1
            results.append({"date": d["date"], "available": False, "reason": f"only {len(sample)} comparable days in history"})
            continue

        x = np.array([[float(d["tmax"]), float(d["tmin"])]])
        mcd = MinCovDet(random_state=0, support_fraction=0.8).fit(sample)
        m2 = float(mcd.mahalanobis(x)[0])  # squared distance
        if not math.isfinite(m2):
            # Degenerate history (e.g. almost no spread) - say so instead of returning NaN.
            skipped += 1
            results.append({"date": d["date"], "available": False, "reason": "history has too little variation to score"})
            continue
        p = math.exp(-m2 / 2.0)  # chi-square survival function with 2 degrees of freedom

        forest = IsolationForest(n_estimators=150, random_state=0).fit(sample)
        iso = float(-forest.score_samples(x)[0])  # higher = more anomalous (about 0.5 typical, > 0.6 unusual)
        iso_flag = bool(forest.predict(x)[0] == -1)

        med = np.median(sample, axis=0)
        level = "extreme" if p < P_EXTREME else "unusual" if p < P_UNUSUAL else "normal"
        results.append({
            "date": d["date"],
            "available": True,
            "level": level,
            "direction": "warm" if x[0, 0] + x[0, 1] >= med[0] + med[1] else "cool",
            "pValue": round(p, 4),
            "mahalanobis": round(math.sqrt(max(m2, 0.0)), 2),
            "isolationScore": round(iso, 3),
            "isolationAgrees": (level != "normal") == iso_flag,
            "tmaxDeparture": round(float(x[0, 0] - med[0]), 1),
            "tminDeparture": round(float(x[0, 1] - med[1]), 1),
            "samples": int(len(sample)),
        })

    flagged = [r for r in results if r.get("level") in ("unusual", "extreme")]
    return {
        "method": "MinCovDet Mahalanobis (chi-square, 2 dof) + IsolationForest cross-check",
        "windowDays": WINDOW_DAYS,
        "days": results,
        "summary": {"flagged": len(flagged), "analysed": len(results) - skipped, "skipped": skipped, "bothAgree": sum(1 for r in flagged if r["isolationAgrees"])},
        "caveat": "Statistical anomaly score against this place's own history; not a forecast.",
    }
