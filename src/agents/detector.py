"""
Detector Agent — ML ile anomali ve sağlık skoru tespiti
"""
from src.analysis.anomaly_detector import get_machine_health_scores


def run(machine=None):
    """ML Gözlemci — anomali ve sağlık skoru tespit eder"""

    health_scores = get_machine_health_scores()

    if machine:
        health_scores = [h for h in health_scores if h["machine"] == machine]

    critical = [h for h in health_scores if h["status"] == "critical"]
    warning = [h for h in health_scores if h["status"] == "warning"]

    return {
        "agent": "Detector",
        "summary": {
            "total_machines": len(health_scores),
            "critical_count": len(critical),
            "warning_count": len(warning),
            "critical_machines": [h["machine"] for h in critical],
            "warning_machines": [h["machine"] for h in warning],
        },
        "health_scores": health_scores,
        "recommendation": "critical" if critical else "warning" if warning else "stable"
    }
