"""
State Store — Anlık makine durumlarını tutar.
Watchdog yazar, Lookahead/Prescriber okur, API consumer'lara servis eder.
"""
import threading
import time
from collections import defaultdict


class MachineStateStore:
    """Anlık makine state'i (thread-safe)"""

    def __init__(self):
        self._states: dict = {}                            # machine → state dict
        self._history: dict = defaultdict(list)            # machine → [snapshots]
        self._lock = threading.Lock()

    def update(self, machine: str, state: dict):
        """Bir makinenin state'ini güncelle, history'e ekle"""
        state["updated_at"] = time.time()
        state["updated_iso"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        with self._lock:
            self._states[machine] = state
            self._history[machine].append(dict(state))
            if len(self._history[machine]) > 30:           # son 30 snapshot
                self._history[machine] = self._history[machine][-30:]

    def get(self, machine: str) -> dict:
        with self._lock:
            return dict(self._states.get(machine, {}))

    def all(self) -> dict:
        with self._lock:
            return {m: dict(s) for m, s in self._states.items()}

    def history(self, machine: str, limit: int = 10) -> list:
        with self._lock:
            return list(self._history.get(machine, []))[-limit:]

    def get_previous(self, machine: str) -> dict:
        """Bir önceki snapshot (delta hesabı için)"""
        with self._lock:
            h = self._history.get(machine, [])
            if len(h) >= 2:
                return dict(h[-2])
            return {}

    def clear(self):
        with self._lock:
            self._states.clear()
            self._history.clear()


store = MachineStateStore()
