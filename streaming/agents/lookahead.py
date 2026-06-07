"""
Lookahead Agent — Predictive risk akışı.

Her N saniyede bir makineler için cycle time pattern'inden risk skoru üretir.
Random Forest tabanlı (gerçek model: src.analysis.predictive).
"""
import time

from streaming.core.event_bus import bus, EVENT_RISK_HIGH, EVENT_RISK_MEDIUM
from streaming.core.state import store
from src.analysis.predictive import cycle_time_failure_model, alarm_recurrence_forecast


# Cache — model her tetikleyişte yeniden eğitilmesin
_cache: dict = {}
_CACHE_TTL = 300  # 5 dk


def _cached(key, builder):
    now = time.time()
    if key in _cache and now - _cache[key]["t"] < _CACHE_TTL:
        return _cache[key]["v"]
    v = builder()
    _cache[key] = {"v": v, "t": now}
    return v


# Watchdog'un izlediği makinelerin alt kümesi (sadece ML modeli verilebilen)
ML_MACHINES = {"Makine 7", "Makine 8"}            # Mitsubishi cycle time için
FORECAST_MACHINES = {"Makine 1": "AIR PRESSURE", "Makine 2": "DOOR INTERLOCK"}


def _evaluate_ml_risk(machine: str):
    """Random Forest modelini kullanarak risk skoru"""
    try:
        result = _cached(f"ml_{machine}", lambda: cycle_time_failure_model(machine))
        if result.get("status") != "trained":
            return None
        current_risk = result.get("current_risk_score") or 0
        level = result.get("risk_level", "LOW")

        # Risk skorunu state'e yansıt
        state = store.get(machine)
        state["ml_risk_score"] = current_risk
        state["ml_risk_level"] = level
        state["ml_metrics"] = result.get("metrics", {})
        store.update(machine, state)

        return {"risk_score": current_risk, "risk_level": level}
    except Exception:
        return None


def _evaluate_forecast(machine: str, keyword: str):
    """Alarm recurrence forecast"""
    try:
        result = _cached(f"forecast_{machine}_{keyword}", lambda: alarm_recurrence_forecast(machine, keyword))
        if result.get("status") != "success":
            return None
        state = store.get(machine)
        state[f"forecast_{keyword}"] = {
            "next_expected": result.get("expected_next_alarm_median"),
            "confidence": result.get("forecast_confidence"),
            "median_interval_h": result.get("median_interval_hours"),
        }
        store.update(machine, state)
        return result
    except Exception:
        return None


def lookahead_tick():
    """Bir lookahead döngüsü — risk akışı yay"""
    evaluations = []

    # ML failure modeli
    for machine in ML_MACHINES:
        r = _evaluate_ml_risk(machine)
        if not r:
            continue
        evaluations.append({"machine": machine, **r})

        if r["risk_level"] == "HIGH":
            bus.publish(EVENT_RISK_HIGH, {
                "machine": machine,
                "source": "cycle_time_ml",
                "risk_score": r["risk_score"],
                "horizon": "next 15-30 minutes",
            })
        elif r["risk_level"] == "MEDIUM":
            bus.publish(EVENT_RISK_MEDIUM, {
                "machine": machine,
                "source": "cycle_time_ml",
                "risk_score": r["risk_score"],
            })

    # Alarm recurrence forecast
    for machine, keyword in FORECAST_MACHINES.items():
        f = _evaluate_forecast(machine, keyword)
        if f and f.get("forecast_confidence", 0) > 0.85:
            evaluations.append({
                "machine": machine,
                "forecast_keyword": keyword,
                "next_expected": f.get("expected_next_alarm_median"),
                "confidence": f.get("forecast_confidence"),
            })

    return {"evaluated": len(evaluations), "details": evaluations}
