"""
Prescriber Agent — Tavsiye verir, sadece tahmin yapmaz.

Anlık state + ML risk + RCA bağlamından "şimdi şunu yap" der.
"""
import time

from streaming.core.event_bus import bus, EVENT_PRESCRIPTION
from streaming.core.state import store


def _classify_urgency(state: dict) -> str:
    ml_level = state.get("ml_risk_level", "LOW")
    status = state.get("status", "good")
    if status == "critical" or ml_level == "HIGH":
        return "act_now"
    if status == "warning" or ml_level == "MEDIUM":
        return "monitor_close"
    return "normal"


def _build_recommendation(machine: str, state: dict) -> dict:
    urgency = _classify_urgency(state)
    violations = state.get("violations", [])
    actions = []
    rationale = []

    # Alarm-based
    alarm_violation = next((v for v in violations if v["metric"] == "alarms"), None)
    if alarm_violation:
        actions.append({
            "step": "Operatör uyarısı",
            "action": "Son 15 dakikada %d alarm. Vardiya amirine bildir." % alarm_violation["value"],
            "eta_minutes": 2,
        })
        rationale.append(f"Pencerede {alarm_violation['value']} alarm gözlendi")

    # Stop-based
    stop_violation = next((v for v in violations if v["metric"] == "stops"), None)
    if stop_violation:
        actions.append({
            "step": "Duruş analizi",
            "action": "%d plansız duruş - operatör girişi sağla, sonuçları kayda al" % stop_violation["value"],
            "eta_minutes": 5,
        })
        rationale.append(f"Pencerede {stop_violation['value']} plansız duruş")

    # ML risk
    ml_level = state.get("ml_risk_level", "LOW")
    ml_risk = state.get("ml_risk_score", 0)
    if ml_level == "HIGH":
        actions.append({
            "step": "Önleyici müdahale",
            "action": "ML modeli yüksek risk gösteriyor. Vardiya bitmeden tool ölçümü + feed rate kontrolü yap.",
            "eta_minutes": 10,
        })
        rationale.append(f"ML risk %{int(ml_risk*100)} (cycle time pattern alarm öncesi pattern'ine benziyor)")

    # Cycle volatility
    cycle_volatility = next((v for v in violations if v["metric"] == "cycle_volatility"), None)
    if cycle_volatility:
        actions.append({
            "step": "Parametre kontrolü",
            "action": "Cycle time sapması yüksek — workpiece sertlik / takım aşınması inceleyin.",
            "eta_minutes": 15,
        })
        rationale.append("Cycle time standart sapma eşik üstünde")

    # Forecast
    fr_air = state.get("forecast_AIR PRESSURE")
    if fr_air and fr_air.get("confidence", 0) > 0.8:
        actions.append({
            "step": "Önleyici bakım",
            "action": f"AIR PRESSURE alarmı bekleniyor ({fr_air.get('next_expected', 'yakın zamanda')}). Kompresör drenaj valfi kontrol et.",
            "eta_minutes": 30,
        })
        rationale.append(f"Forecast confidence %{int(fr_air['confidence']*100)}")

    if not actions:
        actions.append({
            "step": "İzleme",
            "action": "Şu an kritik bir sinyal yok. Normal vardiya akışına devam.",
            "eta_minutes": 0,
        })
        rationale.append("Tüm metrikler eşik altında")

    return {
        "machine": machine,
        "ts": time.time(),
        "ts_iso": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
        "urgency": urgency,
        "actions": actions,
        "rationale": rationale,
        "snapshot_summary": {
            "status": state.get("status"),
            "alarms_in_window": state.get("alarms_in_window", 0),
            "stops_in_window": state.get("stops_in_window", 0),
            "ml_risk_level": ml_level,
            "ml_risk_score": ml_risk,
        }
    }


def prescribe(machine: str) -> dict:
    """Bir makine için anlık tavsiye üret"""
    state = store.get(machine)
    if not state:
        return {"machine": machine, "error": "Henüz veri yok — watchdog'un en az 1 kez taraması gerekir"}

    recommendation = _build_recommendation(machine, state)

    # Event yay (UI / log için)
    bus.publish(EVENT_PRESCRIPTION, {
        "machine": machine,
        "urgency": recommendation["urgency"],
        "action_count": len(recommendation["actions"]),
    })

    return recommendation


def prescribe_all() -> list:
    """Tüm aktif makineler için tavsiye"""
    states = store.all()
    out = []
    for m in states:
        try:
            out.append(prescribe(m))
        except Exception as e:
            out.append({"machine": m, "error": str(e)})
    return out
