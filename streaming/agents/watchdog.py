"""
Watchdog Agent — Sürekli scan, threshold takip.

Her N saniyede bir tüm makineleri tarar, eşik geçişlerinde event yayar.
"""
import time

from streaming.core.event_bus import bus, EVENT_HEALTH_DEGRADED, EVENT_HEALTH_RECOVERED, EVENT_THRESHOLD_BREACH, EVENT_SCAN_COMPLETED
from streaming.core.state import store
from streaming.ingestion.batch_simulator import all_machines_snapshot


# Eşikler — production'da config'ten gelir
THRESHOLDS = {
    "alarms_in_window": {"warning": 1, "critical": 3},
    "stops_in_window": {"warning": 2, "critical": 5},
    "cycle_std_ms": {"warning": 800_000_000, "critical": 1_500_000_000},  # cycle time std sapması
}


def _evaluate(snap: dict) -> dict:
    """Bir snapshot için status hesapla"""
    if not snap.get("available"):
        return {"status": "offline", "violations": []}

    violations = []
    status = "good"

    alarms = snap.get("alarms_in_window", 0)
    if alarms >= THRESHOLDS["alarms_in_window"]["critical"]:
        violations.append({"metric": "alarms", "value": alarms, "level": "critical"})
        status = "critical"
    elif alarms >= THRESHOLDS["alarms_in_window"]["warning"]:
        violations.append({"metric": "alarms", "value": alarms, "level": "warning"})
        if status == "good":
            status = "warning"

    stops = snap.get("stops_in_window", 0)
    if stops >= THRESHOLDS["stops_in_window"]["critical"]:
        violations.append({"metric": "stops", "value": stops, "level": "critical"})
        status = "critical"
    elif stops >= THRESHOLDS["stops_in_window"]["warning"]:
        violations.append({"metric": "stops", "value": stops, "level": "warning"})
        if status == "good":
            status = "warning"

    cycle_std = snap.get("cycle_std_ms", 0)
    if cycle_std >= THRESHOLDS["cycle_std_ms"]["critical"]:
        violations.append({"metric": "cycle_volatility", "value": cycle_std, "level": "critical"})
        status = "critical"
    elif cycle_std >= THRESHOLDS["cycle_std_ms"]["warning"]:
        violations.append({"metric": "cycle_volatility", "value": cycle_std, "level": "warning"})
        if status == "good":
            status = "warning"

    return {"status": status, "violations": violations}


def scan_tick():
    """Bir tarama döngüsü — tüm makineleri tara, state'i güncelle, event yay"""
    started = time.time()
    snapshots = all_machines_snapshot(window_min=15)
    publish_count = 0

    for snap in snapshots:
        machine = snap.get("machine")
        if not machine:
            continue

        evaluation = _evaluate(snap)
        new_state = {**snap, **evaluation}

        previous = store.get(machine)
        store.update(machine, new_state)

        old_status = previous.get("status")
        new_status = evaluation["status"]

        # Status değişikliği → event yay
        if old_status and old_status != new_status:
            if new_status in ("warning", "critical") and old_status == "good":
                bus.publish(EVENT_HEALTH_DEGRADED, {
                    "machine": machine,
                    "from": old_status,
                    "to": new_status,
                    "violations": evaluation["violations"],
                })
                publish_count += 1
            elif new_status == "good" and old_status in ("warning", "critical"):
                bus.publish(EVENT_HEALTH_RECOVERED, {
                    "machine": machine,
                    "from": old_status,
                    "to": new_status,
                })
                publish_count += 1

        # Her yeni violation için ayrı threshold event
        prev_violations = {(v["metric"], v["level"]) for v in previous.get("violations", [])}
        for v in evaluation["violations"]:
            key = (v["metric"], v["level"])
            if key not in prev_violations:
                bus.publish(EVENT_THRESHOLD_BREACH, {
                    "machine": machine,
                    **v,
                })
                publish_count += 1

    elapsed = round(time.time() - started, 2)
    bus.publish(EVENT_SCAN_COMPLETED, {
        "scanned_machines": len(snapshots),
        "events_published": publish_count,
        "elapsed_sec": elapsed,
    })
    return {
        "scanned": len(snapshots),
        "events": publish_count,
        "elapsed_sec": elapsed,
    }
