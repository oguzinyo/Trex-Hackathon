"""
Coordinator — Tüm streaming agent'ları başlatır/durdurur.

Bus + Scheduler + Notifier subscription'ları tek noktadan yönetir.
"""
from streaming.core.scheduler import scheduler, PeriodicTask
from streaming.agents.watchdog import scan_tick
from streaming.agents.lookahead import lookahead_tick
from streaming.agents import notifier


_running = False


def start(watchdog_interval: int = 10, lookahead_interval: int = 30) -> dict:
    """Tüm streaming sistemini başlat"""
    global _running

    if _running:
        return {"status": "already_running"}

    # 1. Notifier'ı event bus'a bağla
    notifier.attach()

    # 2. Periodic task'ları kayıtla
    scheduler.register(PeriodicTask("watchdog", watchdog_interval, scan_tick))
    scheduler.register(PeriodicTask("lookahead", lookahead_interval, lookahead_tick))

    # 3. Tümünü başlat
    scheduler.start_all()
    _running = True

    return {
        "status": "started",
        "watchdog_interval": watchdog_interval,
        "lookahead_interval": lookahead_interval,
    }


def stop() -> dict:
    global _running
    if not _running:
        return {"status": "not_running"}

    scheduler.stop_all()
    notifier.detach()
    _running = False

    return {"status": "stopped"}


def is_running() -> bool:
    return _running


def status() -> dict:
    return {
        "running": _running,
        "scheduler": scheduler.status(),
        "notifier": notifier.center.stats(),
    }
