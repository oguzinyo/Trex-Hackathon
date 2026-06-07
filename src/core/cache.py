"""
Lightweight in-memory cache with TTL — DuckDB analiz sonuçlarını cache'ler.
Agent endpoint gibi yavaş işlemler için kritik.
"""
import time
import hashlib
import json
import functools
from typing import Any, Callable

_CACHE: dict = {}
_DEFAULT_TTL = 300  # 5 dakika


def _key(name: str, args: tuple, kwargs: dict) -> str:
    payload = json.dumps([name, args, sorted(kwargs.items())], default=str, sort_keys=True)
    return hashlib.md5(payload.encode()).hexdigest()


def cached(ttl: int = _DEFAULT_TTL):
    """Decorator — fonksiyon sonucunu cache'le"""
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = _key(fn.__name__, args, kwargs)
            entry = _CACHE.get(key)
            now = time.time()
            if entry and (now - entry["t"]) < ttl:
                entry["hits"] += 1
                return entry["v"]
            result = fn(*args, **kwargs)
            _CACHE[key] = {"v": result, "t": now, "hits": 0, "fn": fn.__name__}
            return result
        wrapper._cache_clear = lambda: _CACHE.clear()  # type: ignore
        return wrapper
    return decorator


def cache_stats() -> dict:
    """Cache istatistikleri — dashboard'da göstermek için"""
    now = time.time()
    entries = []
    for k, e in _CACHE.items():
        entries.append({
            "fn": e["fn"],
            "age_sec": round(now - e["t"], 1),
            "hits": e["hits"],
        })
    total_hits = sum(e["hits"] for e in _CACHE.values())
    return {
        "entries": len(_CACHE),
        "total_hits": total_hits,
        "items": sorted(entries, key=lambda x: -x["hits"])[:20],
    }


def cache_clear() -> dict:
    n = len(_CACHE)
    _CACHE.clear()
    return {"cleared": n}
