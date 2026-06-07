"""
Scheduler — Periodic task runner (threading.Timer tabanlı).
Üretim: APScheduler / Celery beat.
"""
import threading
import time
from typing import Callable


class PeriodicTask:
    """Bir görevi her N saniyede bir tetikleyen tekrarlanan timer"""

    def __init__(self, name: str, interval_sec: float, fn: Callable, daemon: bool = True):
        self.name = name
        self.interval = interval_sec
        self.fn = fn
        self.daemon = daemon
        self._stop = threading.Event()
        self._thread = None
        self.run_count = 0
        self.last_run_ts = None
        self.last_error = None

    def _loop(self):
        while not self._stop.is_set():
            start = time.time()
            try:
                self.fn()
                self.run_count += 1
                self.last_run_ts = start
                self.last_error = None
            except Exception as e:
                self.last_error = str(e)
            elapsed = time.time() - start
            wait = max(0, self.interval - elapsed)
            self._stop.wait(wait)

    def start(self):
        if self._thread and self._thread.is_alive():
            return False
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=self.daemon, name=self.name)
        self._thread.start()
        return True

    def stop(self, timeout: float = 5):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def status(self) -> dict:
        return {
            "name": self.name,
            "interval_sec": self.interval,
            "running": self.is_running,
            "run_count": self.run_count,
            "last_run_ts": self.last_run_ts,
            "last_run_iso": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.last_run_ts)) if self.last_run_ts else None,
            "last_error": self.last_error,
        }


class Scheduler:
    """Tüm periodik task'ları yönetir"""

    def __init__(self):
        self._tasks: dict = {}
        self._lock = threading.Lock()

    def register(self, task: PeriodicTask):
        with self._lock:
            if task.name in self._tasks:
                self._tasks[task.name].stop()
            self._tasks[task.name] = task

    def start_all(self):
        with self._lock:
            for t in self._tasks.values():
                t.start()

    def stop_all(self, timeout: float = 5):
        with self._lock:
            for t in self._tasks.values():
                t.stop(timeout=timeout)

    def status(self) -> dict:
        with self._lock:
            return {name: t.status() for name, t in self._tasks.items()}

    def clear(self):
        self.stop_all()
        with self._lock:
            self._tasks.clear()


scheduler = Scheduler()
