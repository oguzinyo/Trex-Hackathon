"""
Notifier Agent — Event'leri dinler, bildirim üretir.

Production: push/SMS/Slack/Teams entegrasyonu.
Şimdi: in-memory queue + API ile çekilebilir.
"""
import time
import threading
from collections import deque

from streaming.core.event_bus import (
    bus,
    EVENT_HEALTH_DEGRADED, EVENT_THRESHOLD_BREACH,
    EVENT_RISK_HIGH, EVENT_RISK_MEDIUM,
    EVENT_ALARM_TRIGGERED, EVENT_NOTIFICATION,
)


class NotificationCenter:
    """Bildirim havuzu (thread-safe)"""

    def __init__(self, capacity: int = 200):
        self._queue: deque = deque(maxlen=capacity)
        self._lock = threading.Lock()
        self._unread = 0

    def push(self, severity: str, title: str, body: str, machine: str = None, source: str = None):
        item = {
            "id": f"n{int(time.time()*1000)}",
            "ts": time.time(),
            "ts_iso": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
            "severity": severity,                          # info | warning | critical
            "title": title,
            "body": body,
            "machine": machine,
            "source": source,
            "read": False,
        }
        with self._lock:
            self._queue.append(item)
            self._unread += 1

        # Re-publish as a notification event (UI can subscribe)
        bus.publish(EVENT_NOTIFICATION, item)
        return item["id"]

    def list(self, limit: int = 50, only_unread: bool = False) -> list:
        with self._lock:
            items = list(self._queue)
        if only_unread:
            items = [i for i in items if not i["read"]]
        return list(reversed(items))[:limit]

    def mark_read(self, ids: list = None):
        with self._lock:
            if not ids:
                for i in self._queue:
                    if not i["read"]:
                        i["read"] = True
                self._unread = 0
            else:
                for i in self._queue:
                    if i["id"] in ids and not i["read"]:
                        i["read"] = True
                        self._unread = max(0, self._unread - 1)

    def stats(self) -> dict:
        with self._lock:
            by_sev = {}
            for i in self._queue:
                by_sev[i["severity"]] = by_sev.get(i["severity"], 0) + 1
            return {
                "total": len(self._queue),
                "unread": self._unread,
                "by_severity": by_sev,
            }

    def clear(self):
        with self._lock:
            self._queue.clear()
            self._unread = 0


center = NotificationCenter()


# ── Event handlers ──
def _on_health_degraded(event):
    p = event["payload"]
    violations = ", ".join(f"{v['metric']}={v['value']}" for v in p.get("violations", []))
    center.push(
        severity="critical" if p.get("to") == "critical" else "warning",
        title=f"{p['machine']} sağlığı düştü: {p['from']} → {p['to']}",
        body=f"Eşik ihlali: {violations}" if violations else "Detay için sistemi inceleyin",
        machine=p["machine"],
        source="watchdog",
    )


def _on_threshold_breach(event):
    p = event["payload"]
    center.push(
        severity=p.get("level", "warning"),
        title=f"{p['machine']}: {p['metric']} eşik aştı",
        body=f"Değer: {p['value']}",
        machine=p["machine"],
        source="watchdog",
    )


def _on_risk_high(event):
    p = event["payload"]
    center.push(
        severity="critical",
        title=f"{p['machine']}: YÜKSEK RİSK — {p.get('horizon', 'kısa süre')} içinde",
        body=f"ML risk skoru: {round(p.get('risk_score', 0)*100)}% ({p.get('source', '?')})",
        machine=p["machine"],
        source="lookahead",
    )


def _on_risk_medium(event):
    p = event["payload"]
    center.push(
        severity="warning",
        title=f"{p['machine']}: orta risk",
        body=f"ML risk skoru: {round(p.get('risk_score', 0)*100)}%",
        machine=p["machine"],
        source="lookahead",
    )


def _on_alarm_triggered(event):
    p = event["payload"]
    center.push(
        severity="critical",
        title=f"ALARM — {p.get('machine')}: {p.get('alarm', '?')}",
        body=f"Zaman: {event['ts_iso']}",
        machine=p.get("machine"),
        source="alarm",
    )


# Subscriptions kayıtları
_subscriptions = []


def attach():
    """Notifier'ı event bus'a bağla (idempotent)"""
    global _subscriptions
    if _subscriptions:
        return False
    _subscriptions = [
        ("health.degraded", bus.subscribe(EVENT_HEALTH_DEGRADED, _on_health_degraded)),
        ("threshold.breach", bus.subscribe(EVENT_THRESHOLD_BREACH, _on_threshold_breach)),
        ("risk.high", bus.subscribe(EVENT_RISK_HIGH, _on_risk_high)),
        ("risk.medium", bus.subscribe(EVENT_RISK_MEDIUM, _on_risk_medium)),
        ("alarm.triggered", bus.subscribe(EVENT_ALARM_TRIGGERED, _on_alarm_triggered)),
    ]
    return True


def detach():
    global _subscriptions
    for event_type, sub_id in _subscriptions:
        bus.unsubscribe(event_type, sub_id)
    _subscriptions = []
