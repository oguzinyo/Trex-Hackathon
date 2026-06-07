"""
Background Job Manager — Uzun süren agent çağrıları için async pattern.

Frontend pattern:
1. POST /api/agent/start → job_id
2. GET /api/agent/job/{job_id} → status (pending/running/done/error)
3. GET /api/agent/job/{job_id}/result → result (done ise)
"""
import uuid
import time
import threading
from typing import Callable, Any, Optional

_JOBS: dict = {}
_LOCK = threading.Lock()


def create_job(fn: Callable, *args, **kwargs) -> str:
    """Yeni iş başlat — thread'de çalışır, job_id döner"""
    job_id = uuid.uuid4().hex[:12]
    with _LOCK:
        _JOBS[job_id] = {
            "id": job_id,
            "status": "pending",
            "created": time.time(),
            "started": None,
            "completed": None,
            "result": None,
            "error": None,
            "progress": 0,
            "stage": "queued",
        }

    def _run():
        with _LOCK:
            _JOBS[job_id]["status"] = "running"
            _JOBS[job_id]["started"] = time.time()
            _JOBS[job_id]["stage"] = "executing"
        try:
            result = fn(*args, **kwargs)
            with _LOCK:
                _JOBS[job_id]["status"] = "done"
                _JOBS[job_id]["completed"] = time.time()
                _JOBS[job_id]["result"] = result
                _JOBS[job_id]["progress"] = 100
                _JOBS[job_id]["stage"] = "completed"
        except Exception as e:
            with _LOCK:
                _JOBS[job_id]["status"] = "error"
                _JOBS[job_id]["completed"] = time.time()
                _JOBS[job_id]["error"] = str(e)
                _JOBS[job_id]["stage"] = "failed"

    threading.Thread(target=_run, daemon=True).start()
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        out = dict(job)
        # Result'ı status sorgusuna eklemiyoruz (büyük olabilir)
        out.pop("result", None)
        if job["started"]:
            out["elapsed_sec"] = round(time.time() - job["started"], 1)
        return out


def get_job_result(job_id: str) -> Optional[dict]:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        return {
            "id": job_id,
            "status": job["status"],
            "result": job.get("result"),
            "error": job.get("error"),
        }


def cleanup_old_jobs(max_age_sec: int = 3600):
    """1 saatten eski job'ları temizle"""
    now = time.time()
    with _LOCK:
        to_delete = [jid for jid, j in _JOBS.items()
                     if j["status"] in ("done", "error") and (now - (j["completed"] or now)) > max_age_sec]
        for jid in to_delete:
            del _JOBS[jid]
    return len(to_delete)


def list_jobs() -> dict:
    with _LOCK:
        active = sum(1 for j in _JOBS.values() if j["status"] in ("pending", "running"))
        done = sum(1 for j in _JOBS.values() if j["status"] == "done")
        errored = sum(1 for j in _JOBS.values() if j["status"] == "error")
        return {
            "total": len(_JOBS),
            "active": active,
            "done": done,
            "errored": errored,
        }
