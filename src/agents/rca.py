"""
RCA Agent — 17 problemle kök neden eşleştirme.
Confidence değerleri statistical.py ile veriden hesaplanır.
"""
from src.analysis.rca_engine import get_all_problems
from src.analysis.statistical import get_all_confidences


# Yalnızca impact_area + scenario — confidence VERİDEN gelir
_PROBLEM_META = {
    1: {"impact_area": "availability", "impact_score": 0.9, "scenarios": ["reduce_unplanned_downtime"]},
    2: {"impact_area": "availability", "impact_score": 0.75, "scenarios": ["reduce_unplanned_downtime"]},
    3: {"impact_area": "availability", "impact_score": 0.95, "scenarios": ["reduce_unplanned_downtime"]},
    4: {"impact_area": "data_quality", "impact_score": 0.85, "scenarios": ["corrected_oee"]},
    5: {"impact_area": "data_quality", "impact_score": 0.8, "scenarios": ["corrected_oee"]},
    6: {"impact_area": "performance", "impact_score": 1.0, "scenarios": ["fix_cycle_time"]},
    7: {"impact_area": "availability", "impact_score": 0.8, "scenarios": ["reclassify_planned"]},
    8: {"impact_area": "maintenance", "impact_score": 0.55, "scenarios": ["reduce_unplanned_downtime"]},
    9: {"impact_area": "program_quality", "impact_score": 0.5, "scenarios": ["reduce_unplanned_downtime"]},
    10: {"impact_area": "maintenance", "impact_score": 0.6, "scenarios": ["reduce_unplanned_downtime"]},
    11: {"impact_area": "data_quality", "impact_score": 0.65, "scenarios": ["corrected_oee"]},
    12: {"impact_area": "response_time", "impact_score": 0.55, "scenarios": ["reduce_unplanned_downtime"]},
    13: {"impact_area": "availability", "impact_score": 0.85, "scenarios": ["reduce_unplanned_downtime"]},
    14: {"impact_area": "availability", "impact_score": 0.7, "scenarios": ["reduce_unplanned_downtime"]},
    15: {"impact_area": "operator_behavior", "impact_score": 0.65, "scenarios": ["reduce_unplanned_downtime"]},
    16: {"impact_area": "data_quality", "impact_score": 0.5, "scenarios": ["corrected_oee"]},
    17: {"impact_area": "sensor_coverage", "impact_score": 0.6, "scenarios": ["reduce_unplanned_downtime"]},
}


def _enrich(problem, confidences):
    if problem.get("error"):
        return problem

    pid = problem.get("id")
    meta = _PROBLEM_META.get(pid, {})
    conf_data = confidences.get(pid, {})

    evidence = []
    if problem.get("evidence"):
        evidence.append(problem["evidence"])
    if conf_data.get("evidence"):
        evidence.append(f"[İstatistiksel kanıt] {conf_data['evidence']}")
    if problem.get("root_cause"):
        evidence.append(f"Kök neden hipotezi: {problem['root_cause']}")

    problem["impact_area"] = meta.get("impact_area", "unknown")
    # Confidence VERİDEN gelir, fallback 0.55
    problem["confidence"] = float(conf_data.get("confidence", 0.55))
    problem["confidence_method"] = conf_data.get("method", "fallback")
    problem["confidence_evidence"] = conf_data.get("evidence", "")
    problem["sample_size"] = conf_data.get("sample_size", 0)
    problem["impact_score"] = meta.get("impact_score", 0.5)
    problem["recommended_whatif_scenarios"] = meta.get("scenarios", ["reduce_unplanned_downtime"])
    problem["evidence_items"] = evidence[:4]
    # Statistical details for traceability
    problem["statistical_details"] = {k: v for k, v in conf_data.items() if k not in ["confidence", "method", "evidence"]}
    return problem


def run(machine=None):
    """Kök Neden Analisti — 17 problemi tarar, confidence VERİDEN hesaplanır"""

    confidences = get_all_confidences()
    all_problems = [_enrich(p, confidences) for p in get_all_problems()]

    if machine:
        relevant = [p for p in all_problems
                    if machine.lower() in str(p.get("machine", "")).lower()
                    or machine.lower() in str(p.get("evidence", "")).lower()
                    or "tüm" in str(p.get("machine", "")).lower()
                    or "fabrika" in str(p.get("machine", "")).lower()]
    else:
        relevant = all_problems

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    relevant.sort(key=lambda p: severity_order.get(p.get("severity", "low"), 3))

    return {
        "agent": "RCA",
        "status": "success",
        "total_problems": len(all_problems),
        "relevant_problems": len(relevant),
        "problems": relevant,
        "top_issue": relevant[0] if relevant else None
    }
