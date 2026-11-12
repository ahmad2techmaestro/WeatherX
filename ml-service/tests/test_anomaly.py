import numpy as np
from fastapi.testclient import TestClient

from app.main import app, VERSION

client = TestClient(app)
RNG = np.random.default_rng(7)


def history(years=10, mean_max=34.0, mean_min=22.0, around="11-11"):
    out = []
    for y in range(2015, 2015 + years):
        for k in range(-10, 11):
            from datetime import date, timedelta
            d = date(y, int(around[:2]), int(around[3:])) + timedelta(days=k)
            shared = RNG.normal(0, 1.8)  # hot days tend to have warm nights
            out.append({"date": d.isoformat(), "tmax": mean_max + shared + RNG.normal(0, 0.8), "tmin": mean_min + 0.7 * shared + RNG.normal(0, 0.8)})
    return out


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["version"] == VERSION


def test_flags_extreme_heat_and_leaves_normal_days_alone():
    r = client.post("/v1/anomaly", json={"history": history(), "days": [
        {"date": "2026-11-11", "tmax": 34.2, "tmin": 22.1},   # typical
        {"date": "2026-11-12", "tmax": 43.0, "tmin": 29.0},   # far hotter, warm night
        {"date": "2026-11-13", "tmax": 27.0, "tmin": 15.0},   # far cooler
    ]})
    assert r.status_code == 200
    d = {x["date"]: x for x in r.json()["days"]}
    assert d["2026-11-11"]["level"] == "normal"
    assert d["2026-11-12"]["level"] == "extreme" and d["2026-11-12"]["direction"] == "warm"
    assert d["2026-11-13"]["level"] in ("unusual", "extreme") and d["2026-11-13"]["direction"] == "cool"
    assert d["2026-11-12"]["tmaxDeparture"] > 5
    assert r.json()["summary"]["flagged"] == 2


def test_correlation_matters_hot_day_with_cold_night_is_stranger():
    base = history()
    same = client.post("/v1/anomaly", json={"history": base, "days": [{"date": "2026-11-11", "tmax": 37.5, "tmin": 24.6}]}).json()["days"][0]
    odd = client.post("/v1/anomaly", json={"history": base, "days": [{"date": "2026-11-11", "tmax": 37.5, "tmin": 19.0}]}).json()["days"][0]
    assert odd["mahalanobis"] > same["mahalanobis"]


def test_too_little_history_is_rejected_or_skipped():
    assert client.post("/v1/anomaly", json={"history": history()[:20], "days": [{"date": "2026-11-11", "tmax": 30, "tmin": 20}]}).status_code == 422
    far = client.post("/v1/anomaly", json={"history": history(), "days": [{"date": "2026-05-01", "tmax": 40, "tmin": 28}]}).json()
    assert far["days"][0]["available"] is False
    assert far["summary"]["skipped"] == 1


def test_input_validation():
    h = history()
    for bad in ({"date": "11/11/2026", "tmax": 30, "tmin": 20}, {"date": "2026-11-11", "tmax": 300, "tmin": 20}, {"date": "2026-11-11", "tmax": 20, "tmin": 30}):
        assert client.post("/v1/anomaly", json={"history": h, "days": [bad]}).status_code == 422
    assert client.post("/v1/anomaly", json={"history": h, "days": []}).status_code == 422


def test_deterministic():
    body = {"history": history(), "days": [{"date": "2026-11-12", "tmax": 41.0, "tmin": 27.0}]}
    assert client.post("/v1/anomaly", json=body).json() == client.post("/v1/anomaly", json=body).json()


def test_degenerate_history_is_unavailable_not_nan():
    hist = [{"date": f"2024-06-{1 + i % 28:02d}", "tmax": 30.0, "tmin": 20.0} for i in range(80)]
    from app.anomaly import analyse
    out = analyse(hist, [{"date": "2025-06-10", "tmax": 40.0, "tmin": 25.0}])
    import json
    json.dumps(out, allow_nan=False)
    assert out["days"][0]["available"] is False
