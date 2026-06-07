"""
Streaming API Router — Mevcut FastAPI app'e mount edilir.

Tüm endpoint'ler /api/streaming/* prefix'i altında.
"""
import json, math, datetime
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from streaming.core.event_bus import bus
from streaming.core.state import store
from streaming.agents import coordinator, notifier, prescriber


router = APIRouter(prefix="/api/streaming", tags=["streaming"])


def _clean(obj):
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, (datetime.date, datetime.datetime)):
        return obj.isoformat()
    if hasattr(obj, 'item'):
        v = obj.item()
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v
    return obj


def _json(data, status=200):
    return JSONResponse(content=json.loads(json.dumps(_clean(data), default=str)), status_code=status)


# ── Lifecycle ──
@router.post("/start")
def start_streaming(watchdog: int = 10, lookahead: int = 30):
    """Tüm streaming agent'ları başlat"""
    return _json(coordinator.start(watchdog_interval=watchdog, lookahead_interval=lookahead))


@router.post("/stop")
def stop_streaming():
    return _json(coordinator.stop())


@router.get("/status")
def streaming_status():
    return _json(coordinator.status())


# ── Live Feed ──
@router.get("/feed")
def live_feed():
    """Tüm makinelerin anlık state'i (Watchdog son tarama)"""
    states = store.all()
    return _json({
        "machines": [{"machine": m, **s} for m, s in states.items()],
        "count": len(states),
    })


@router.get("/feed/{machine}")
def live_feed_machine(machine: str):
    state = store.get(machine)
    if not state:
        return _json({"error": "Bu makine için henüz veri yok"}, status=404)
    history = store.history(machine, limit=20)
    return _json({"machine": machine, "current": state, "history": history})


# ── Notifications ──
@router.get("/notifications")
def list_notifications(limit: int = 50, only_unread: bool = False):
    return _json({
        "stats": notifier.center.stats(),
        "items": notifier.center.list(limit=limit, only_unread=only_unread),
    })


@router.post("/notifications/mark-read")
def mark_notifications_read(ids: list = None):
    notifier.center.mark_read(ids=ids)
    return _json({"ok": True, "unread": notifier.center.stats()["unread"]})


# ── Events ──
@router.get("/events")
def list_events(limit: int = 100, type: str = None):
    return _json({
        "stats": bus.stats(),
        "items": bus.history(limit=limit, event_type=type),
    })


# ── Prescription ──
@router.get("/prescribe/{machine}")
def prescribe_machine(machine: str):
    return _json(prescriber.prescribe(machine))


@router.get("/prescribe")
def prescribe_all():
    return _json({"prescriptions": prescriber.prescribe_all()})
