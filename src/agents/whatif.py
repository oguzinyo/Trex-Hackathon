"""
What-If Agent — OEE simülasyon + finansal etki
"""
from src.analysis.whatif_engine import (
    simulate_reduce_unplanned, simulate_reclassify_to_planned,
    simulate_fix_cycle_time, simulate_corrected_oee,
)


def _best_result(result):
    if not isinstance(result, list) or not result:
        return None
    return max(result, key=lambda r: r.get("delta_oee", 0) or 0)


def _select_scenarios(rca_result):
    if not rca_result or not rca_result.get("top_issue"):
        return ["reduce_unplanned_downtime", "reclassify_planned", "fix_cycle_time"]
    scenarios = rca_result["top_issue"].get("recommended_whatif_scenarios", [])
    return scenarios or ["reduce_unplanned_downtime"]


def run(machine=None, rca_result=None):
    """Simülatör — OEE iyileştirme senaryoları çalıştırır"""

    if not machine:
        machine = "Makine 1"

    scenarios = []
    errors = []
    selected = _select_scenarios(rca_result)

    # Senaryo 1: Plansız duruşu %50 azalt
    if "reduce_unplanned_downtime" in selected:
        try:
            result = simulate_reduce_unplanned(machine, 50)
            best = _best_result(result)
            if best:
                scenarios.append({
                    "scenario": "Plansız duruşu %50 azalt",
                    "scenario_id": "reduce_unplanned_downtime",
                    "reason": "RCA bulgusu Availability kaybı veya plansız duruş etkisi gösteriyor",
                    "delta_oee": best.get("delta_oee", 0),
                    "delta_A": best.get("delta_A", 0),
                    "recovered_hours": best.get("recovered_hours", 0),
                })
        except Exception as e:
            errors.append({"scenario": "reduce_unplanned_downtime", "error": str(e)})

    # Senaryo 2: System Offline → Planned
    if "reclassify_planned" in selected:
        try:
            result = simulate_reclassify_to_planned(machine, 100)
            best = _best_result(result)
            if best:
                scenarios.append({
                    "scenario": "System Offline / uzun duruşları PLANNED yap",
                    "scenario_id": "reclassify_planned",
                    "reason": "RCA bulgusu sınıflandırma veya vardiya takvimi problemi gösteriyor",
                    "delta_oee": best.get("delta_oee", 0),
                    "delta_A": best.get("delta_A", 0),
                })
        except Exception as e:
            errors.append({"scenario": "reclassify_planned", "error": str(e)})

    # Senaryo 3: Cycle time düzeltmesi
    if "fix_cycle_time" in selected:
        try:
            result = simulate_fix_cycle_time(machine)
            best = _best_result(result)
            if best:
                scenarios.append({
                    "scenario": "Cycle time düzeltmesi",
                    "scenario_id": "fix_cycle_time",
                    "reason": "RCA bulgusu Performance / stock_cycle uyumsuzluğu gösteriyor",
                    "delta_oee": best.get("delta_oee", 0),
                    "delta_P": best.get("delta_P", 0),
                })
        except Exception as e:
            errors.append({"scenario": "fix_cycle_time", "error": str(e)})

    if "corrected_oee" in selected:
        try:
            result = simulate_corrected_oee(machine)
            if result and "error" not in result:
                scenarios.append({
                    "scenario": "Veri/konfigürasyon düzeltmeleriyle corrected OEE",
                    "scenario_id": "corrected_oee",
                    "reason": "RCA bulgusu veri kalitesi veya OEE konfigürasyonu problemi gösteriyor",
                    "delta_oee": result.get("avg_improvement", 0),
                    "before_oee": result.get("avg_current_oee"),
                    "after_oee": result.get("avg_corrected_oee"),
                })
        except Exception as e:
            errors.append({"scenario": "corrected_oee", "error": str(e)})

    total_delta = sum(s.get("delta_oee", 0) for s in scenarios)

    return {
        "agent": "WhatIf",
        "status": "success" if scenarios else "no_scenario_result",
        "machine": machine,
        "selected_scenarios": selected,
        "scenarios": scenarios,
        "total_oee_improvement": round(total_delta, 4),
        "errors": errors,
    }
