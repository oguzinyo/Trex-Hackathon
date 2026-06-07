"""
CNC Anomaly Intelligence — FastAPI Backend
"""
import sys, os, time, logging
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import json, math, datetime

from config.settings import FRONTEND_DIR

from src.core.cache import cache_stats, cache_clear
from src.core.jobs import create_job, get_job, get_job_result, list_jobs, cleanup_old_jobs
from src.analysis.rca_engine import (
    get_overview, get_all_problems,
    get_air_pressure_pattern, get_emergency_stop_pareto,
    get_mass_shutdown_events, get_negative_oee_cases,
    get_ghost_machines, get_cycle_time_mismatch,
    get_long_stoppages, get_lube_oil_degradation,
    get_overtravel_program_link, get_motor_overload_context,
    get_counter_anomalies, get_offhour_response_time,
    get_alarm_stoppage_chain, get_micro_stoppages,
    get_micro_stoppage_signature, get_monthly_trend_flatline,
    get_path_load_blindspot,
)
from src.analysis.whatif_engine import (
    simulate_reduce_unplanned, simulate_reclassify_to_planned,
    simulate_fix_cycle_time, simulate_scrap_rate,
    calculate_financial_impact, get_oee_trend, simulate_corrected_oee,
)
from src.analysis.anomaly_detector import (
    detect_sensor_anomalies, detect_counter_spikes,
    detect_stoppage_clusters, get_machine_health_scores,
    analyze_mitsubishi_sensors, get_data_quality_report,
)
from src.analysis.executive import (
    get_executive_summary, get_alarm_timeline,
    compare_machines, get_priority_actions,
)
from src.analysis.statistical import get_all_confidences, get_confidence
from src.analysis.predictive import (
    cycle_time_failure_model, alarm_recurrence_forecast, fleet_risk_summary,
)
from src.agents.orchestrator import run_full_analysis, run_quick_scan
from src.agents.rca import run as run_rca_agent
from src.agents.context import run as run_context_agent

# ── Logging ───────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("cnc-ai")

app = FastAPI(
    title="CNC Anomaly Intelligence",
    version="2.1.0",
    description="Multi-Agent Factory Monitoring System",
)

# ── Middleware ────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    elapsed = (time.time() - start) * 1000
    if request.url.path.startswith("/api/"):
        logger.info(f"{response.status_code} {request.method} {request.url.path} ({elapsed:.0f}ms)")
    return response


# ── Serialization ────────────────────────────
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
    cleaned = _clean(data)
    return JSONResponse(content=json.loads(json.dumps(cleaned, default=str)), status_code=status)


def _safe(fn, *args, **kwargs):
    """Endpoint wrapper — exception'ları yakala, 500 dönüş"""
    try:
        return _json(fn(*args, **kwargs))
    except Exception as e:
        logger.exception(f"Error in {fn.__name__}: {e}")
        return _json({"error": str(e), "function": fn.__name__}, status=500)


# ══════════════════════════════════════════════
# CORE ENDPOINTS
# ══════════════════════════════════════════════

@app.get("/api/overview")
def api_overview():
    return _safe(get_overview)


@app.get("/api/health")
def api_health():
    return _safe(get_machine_health_scores)


# ══════════════════════════════════════════════
# PROBLEMS
# ══════════════════════════════════════════════
PROBLEM_FUNCS = {
    1: get_air_pressure_pattern, 2: get_emergency_stop_pareto,
    3: get_mass_shutdown_events, 4: get_negative_oee_cases,
    5: get_ghost_machines, 6: get_cycle_time_mismatch,
    7: get_long_stoppages, 8: get_lube_oil_degradation,
    9: get_overtravel_program_link, 10: get_motor_overload_context,
    11: get_counter_anomalies, 12: get_offhour_response_time,
    13: get_alarm_stoppage_chain, 14: get_micro_stoppages,
    15: get_micro_stoppage_signature, 16: get_monthly_trend_flatline,
    17: get_path_load_blindspot,
}


@app.get("/api/problems")
def api_all_problems():
    return _safe(lambda: run_rca_agent()["problems"])


@app.get("/api/problem/{problem_id}")
def api_problem(problem_id: int):
    fn = PROBLEM_FUNCS.get(problem_id)
    if not fn:
        return _json({"error": f"Problem {problem_id} bulunamadı"}, status=404)
    return _safe(fn)


# ══════════════════════════════════════════════
# OEE / WHAT-IF
# ══════════════════════════════════════════════
@app.get("/api/oee/{machine}")
def api_oee_trend(machine: str):
    return _safe(get_oee_trend, machine)


@app.get("/api/whatif/corrected-oee")
def api_whatif_corrected(machine: str):
    return _safe(simulate_corrected_oee, machine)


@app.get("/api/whatif/reduce-unplanned")
def api_whatif_reduce(machine: str, reduction_pct: float = 50):
    return _safe(simulate_reduce_unplanned, machine, reduction_pct)


@app.get("/api/whatif/reclassify-planned")
def api_whatif_reclassify(machine: str, reclassify_pct: float = 100):
    return _safe(simulate_reclassify_to_planned, machine, reclassify_pct)


@app.get("/api/whatif/fix-cycle-time")
def api_whatif_cycle(machine: str):
    return _safe(simulate_fix_cycle_time, machine)


@app.get("/api/whatif/scrap-rate")
def api_whatif_scrap(machine: str, scrap_pct: float = 3):
    return _safe(simulate_scrap_rate, machine, scrap_pct)


@app.get("/api/whatif/financial")
def api_whatif_financial(
    delta_oee: float = 0.05,
    machine: str = None,
    contribution_margin_per_piece: float = 12.0,
    machine_hour_cost: float = 45.0,
    downtime_cost_per_hour: float = 80.0,
    intervention_cost: float = 300.0,
):
    assumptions = {
        "contribution_margin_per_piece": contribution_margin_per_piece,
        "machine_hour_cost": machine_hour_cost,
        "downtime_cost_per_hour": downtime_cost_per_hour,
        "intervention_cost": intervention_cost,
    }
    return _safe(calculate_financial_impact, delta_oee, machine, assumptions)


# ══════════════════════════════════════════════
# ANOMALY DETECTION
# ══════════════════════════════════════════════
@app.get("/api/anomalies/{machine}")
def api_anomalies(machine: str, signal: str = None):
    return _safe(detect_sensor_anomalies, machine, signal)


@app.get("/api/anomalies/mitsubishi/{machine}")
def api_mitsubishi(machine: str):
    return _safe(analyze_mitsubishi_sensors, machine)


@app.get("/api/anomalies/counters/spikes")
def api_counter_spikes():
    return _safe(detect_counter_spikes)


@app.get("/api/anomalies/stoppages/clusters")
def api_stoppage_clusters():
    return _safe(detect_stoppage_clusters)


# ══════════════════════════════════════════════
# DATA QUALITY
# ══════════════════════════════════════════════
@app.get("/api/data-quality")
def api_data_quality():
    return _safe(get_data_quality_report)


# ══════════════════════════════════════════════
# STATISTICAL CONFIDENCE
# ══════════════════════════════════════════════
@app.get("/api/statistics/confidences")
def api_confidences():
    return _safe(get_all_confidences)


@app.get("/api/statistics/confidence/{problem_id}")
def api_confidence_one(problem_id: int):
    return _safe(get_confidence, problem_id)


# ══════════════════════════════════════════════
# PREDICTIVE MAINTENANCE
# ══════════════════════════════════════════════
@app.get("/api/predictive/cycle-failure/{machine}")
def api_predictive_cycle(machine: str, lookback: int = 60, horizon: int = 15):
    return _safe(cycle_time_failure_model, machine, lookback, horizon)


@app.get("/api/predictive/alarm-forecast/{machine}")
def api_predictive_forecast(machine: str, keyword: str = "AIR PRESSURE"):
    return _safe(alarm_recurrence_forecast, machine, keyword)


@app.get("/api/predictive/fleet-risk")
def api_predictive_fleet():
    return _safe(fleet_risk_summary)


# ══════════════════════════════════════════════
# EXECUTIVE / TIMELINE / COMPARE
# ══════════════════════════════════════════════
@app.get("/api/executive")
def api_executive():
    """Üst düzey özet — jüri/yönetim için tek bakış"""
    return _safe(get_executive_summary)


@app.get("/api/timeline")
def api_timeline(days: int = 60):
    """Alarm timeline — son N gün"""
    return _safe(get_alarm_timeline, days)


@app.get("/api/compare")
def api_compare(machines: str = None):
    """Makine karşılaştırma — ?machines=Makine 1,Makine 2,..."""
    ms = [m.strip() for m in machines.split(",")] if machines else None
    return _safe(compare_machines, ms)


@app.get("/api/priority-actions")
def api_priority():
    return _safe(get_priority_actions)


# ══════════════════════════════════════════════
# MULTI-AGENT
# ══════════════════════════════════════════════
@app.get("/api/agent/analyze")
def api_agent_analyze(machine: str = None):
    return _safe(run_full_analysis, machine)


@app.get("/api/agent/quick-scan")
def api_agent_quick():
    return _safe(run_quick_scan)


@app.get("/api/agent/context")
def api_agent_context(machine: str = "Makine 1"):
    def _run():
        rca_result = run_rca_agent(machine)
        return run_context_agent(machine, rca_result)
    return _safe(_run)


# ══════════════════════════════════════════════
# ASYNC AGENT JOBS
# ══════════════════════════════════════════════
@app.post("/api/agent/start")
def api_agent_start(machine: str = None):
    """Agent analizini background'da başlat — job_id döner"""
    job_id = create_job(run_full_analysis, machine)
    return _json({"job_id": job_id, "status": "pending"})


@app.get("/api/agent/job/{job_id}")
def api_agent_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        return _json({"error": "Job bulunamadı"}, status=404)
    return _json(job)


@app.get("/api/agent/job/{job_id}/result")
def api_agent_job_result(job_id: str):
    res = get_job_result(job_id)
    if not res:
        return _json({"error": "Job bulunamadı"}, status=404)
    return _json(res)


@app.get("/api/agent/jobs/list")
def api_jobs_list():
    return _json(list_jobs())


@app.post("/api/agent/jobs/cleanup")
def api_jobs_cleanup():
    cleared = cleanup_old_jobs()
    return _json({"cleared": cleared})


# ══════════════════════════════════════════════
# CACHE / SYSTEM
# ══════════════════════════════════════════════
@app.get("/api/cache/stats")
def api_cache_stats():
    return _json(cache_stats())


@app.post("/api/cache/clear")
def api_cache_clear():
    return _json(cache_clear())


@app.get("/api/health-check")
def api_healthcheck():
    return _json({"status": "ok", "version": app.version, "time": datetime.datetime.now().isoformat()})


# ══════════════════════════════════════════════
# STATIC FRONTEND
# ══════════════════════════════════════════════
if os.path.exists(FRONTEND_DIR):
    static_dir = os.path.join(FRONTEND_DIR, "static")
    if os.path.exists(static_dir):
        app.mount("/static", StaticFiles(directory=static_dir), name="static")
    else:
        app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def root():
    index = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return {"message": "CNC Anomaly Intelligence API", "docs": "/docs"}
