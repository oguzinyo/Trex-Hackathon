"""
Event Bus — Pub/Sub pattern.
Agent'lar event yayar/dinler. Production'da Kafka/Redis Streams.
"""
import threading
import time
import uuid
from collections import deque
from typing import Callable, Optional


# ── Event Types ──
EVENT_HEALTH_DEGRADED = "health.degraded"
EVENT_HEALTH_RECOVERED = "health.recovered"
EVENT_THRESHOLD_BREACH = "threshold.breach"
EVENT_RISK_HIGH = "risk.high"
EVENT_RISK_MEDIUM = "risk.medium"
EVENT_ALARM_TRIGGERED = "alarm.triggered"
EVENT_NOTIFICATION = "notification"
EVENT_PRESCRIPTION = "prescription"
EVENT_SCAN_COMPLETED = "scan.completed"


class EventBus:
    """Thread-safe in-memory pub/sub bus"""

    def __init__(self, history_size: int = 1000):
        self._subs: dict = {}                          # event_type → [(sub_id, callback)]
        self._history: deque = deque(maxlen=history_size)
        self._lock = threading.Lock()

    def subscribe(self, event_type: str, callback: Callable) -> str:
        sub_id = uuid.uuid4().hex[:8]
        with self._lock:
            self._subs.setdefault(event_type, []).append((sub_id, callback))
        return sub_id

    def unsubscribe(self, event_type: str, sub_id: str):
        with self._lock:
            self._subs[event_type] = [(s, cb) for s, cb in self._subs.get(event_type, []) if s != sub_id]

    def publish(self, event_type: str, payload: dict) -> str:
        event = {
            "id": uuid.uuid4().hex[:12],
            "type": event_type,
            "ts": time.time(),
            "ts_iso": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
            "payload": payload,
        }
        with self._lock:
            self._history.append(event)
            subs = list(self._subs.get(event_type, []))

        for sub_id, callback in subs:
            try:
                callback(event)
            except Exception as e:
                self._history.append({
                    "id": uuid.uuid4().hex[:12],
                    "type": "error.subscriber",
                    "ts": time.time(),
                    "ts_iso": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
                    "payload": {"event_type": event_type, "error": str(e)},
                })
        return event["id"]

    def history(self, limit: int = 50, event_type: Optional[str] = None) -> list:
        with self._lock:
            items = list(self._history)
        if event_type:
            items = [e for e in items if e["type"] == event_type]
        return list(reversed(items))[:limit]

    def stats(self) -> dict:
        with self._lock:
            counts = {}
            for e in self._history:
                counts[e["type"]] = counts.get(e["type"], 0) + 1
            return {
                "subscriber_count": sum(len(v) for v in self._subs.values()),
                "event_types": list(self._subs.keys()),
                "history_size": len(self._history),
                "events_by_type": counts,
            }

    def clear(self):
        with self._lock:
            self._history.clear()


# Singleton
bus = EventBus()
